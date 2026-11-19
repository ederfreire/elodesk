import Whatsapp from "../../models/Whatsapp";
import AppError from "../../errors/AppError";
import logger from "../../utils/logger";

/**
 * URA de voz do WhatsApp Plus.
 *
 * O motor já existe no wacalls-chat: o `flowexec.go` executa os nós
 * voice_menu, dtmf_capture, record_audio, transfer, ai_agent e webhook
 * quando entra uma ligação. E a sessão do microserviço aceita o campo
 * `flowId` justamente pra isso.
 *
 * O que faltava era o elo: o backend criava a sessão só com `name` e
 * `allowGroups`, e NUNCA mandava o `flowId`. Sem esse campo preenchido, o
 * `StartForCall` não tinha fluxo pra rodar e a ligação ia direto tocar pro
 * atendente. Este serviço fecha essa lacuna.
 *
 * Detalhe importante do lado do Go: se o fluxo escolhido for do tipo
 * "chat", ele é movido pra `chatFlowId` e a URA de voz fica vazia — uma
 * proteção pra ligação não tentar executar um fluxo de conversa. Por isso
 * a lista abaixo separa os dois tipos.
 */

interface FluxoWacalls {
  id: string;
  name: string;
  trigger: string;
  enabled: boolean;
  graph?: string;
  keywords?: string;
}

export interface FluxoDeVoz {
  id: string;
  nome: string;
  ativo: boolean;
  tipo: "voice" | "chat";
}

/** Descobre se o fluxo é de voz ou de chat lendo o grafo. */
const tipoDoFluxo = (f: FluxoWacalls): "voice" | "chat" => {
  try {
    const g = JSON.parse(f.graph || "{}");
    // O padrão do wacalls-chat é "voice" quando o campo não vem preenchido.
    return String(g?.kind || "voice").toLowerCase() === "chat" ? "chat" : "voice";
  } catch {
    return "voice";
  }
};

/**
 * Lista os fluxos cadastrados no wacalls-chat, marcando o tipo de cada um.
 * A tela de Conexões usa isso pra oferecer só os de voz na escolha da URA.
 */
export const listarFluxos = async (): Promise<FluxoDeVoz[]> => {
  const { get, isEnabled } = await import("./WacallsChatCallService");
  if (!isEnabled()) return [];

  try {
    const data = await get<{ flows: FluxoWacalls[] }>("/api/flows");
    const lista = Array.isArray(data?.flows) ? data.flows : [];
    return lista.map(f => ({
      id: f.id,
      nome: f.name,
      ativo: !!f.enabled,
      tipo: tipoDoFluxo(f)
    }));
  } catch (err: any) {
    logger.warn(`[URA] falha ao listar fluxos: ${err?.message}`);
    return [];
  }
};

/**
 * Empurra a URA escolhida para a sessão do microserviço.
 *
 * Chamado toda vez que a conexão é gravada. Best-effort de propósito: se o
 * wacalls-chat estiver fora do ar, a conexão precisa continuar salvando —
 * o vínculo é reaplicado na próxima gravação ou na reconexão.
 */
/**
 * Empurra a URA escolhida para a sessão do microserviço.
 *
 * Dois cuidados que a primeira versão não tinha:
 *
 * 1. O PUT da sessão no wacalls-chat NÃO faz merge — ele reconstrói a sessão
 *    inteira a partir do corpo recebido. Mandar só `{name, allowGroups,
 *    flowId}` zerava fila, mensagens de saudação/despedida/fora do
 *    expediente, pesquisa de satisfação, chatbot vinculado e cor. Por isso
 *    lemos a sessão atual e reenviamos tudo, trocando só o fluxo de voz.
 *
 * 2. Erros de configuração (4xx) sobem em vez de virar log. O microserviço
 *    recusa o vínculo com mensagem específica — "habilite o fluxo X",
 *    "selecione um fluxo de voz" — e engolir isso fazia a tela mostrar
 *    "salvo" enquanto a URA nunca era vinculada de fato. Indisponibilidade
 *    (rede/5xx) continua best-effort, porque aí não é erro do usuário.
 */
export const aplicarUraNaSessao = async (whatsapp: Whatsapp): Promise<void> => {
  const sessionId = (whatsapp as any).wacallsChatSessionId;
  if (!sessionId) return;
  if (whatsapp.channel !== "wacalls") return;

  const { get, put, isEnabled } = await import("./WacallsChatCallService");
  if (!isEnabled()) return;

  const flowId = String((whatsapp as any).wacallsVoiceFlowId || "").trim();

  // Estado atual da sessão. Não existe GET por id no microserviço — a lista
  // é o caminho.
  let atual: any = null;
  try {
    const data = await get<{ sessions: any[] }>("/api/sessions");
    const lista = Array.isArray(data?.sessions) ? data.sessions : [];
    atual = lista.find((x: any) => String(x?.id) === String(sessionId)) || null;
  } catch (err: any) {
    logger.warn(`[URA] não consegui ler a sessão ${sessionId}: ${err?.message}`);
  }

  // Sem conseguir ler, é mais seguro não gravar: um PUT parcial apagaria as
  // configurações da conexão.
  if (!atual) {
    logger.warn(
      `[URA] sessão ${sessionId} não encontrada no serviço de voz — vínculo não aplicado`
    );
    return;
  }

  const corpo = {
    name: atual.name || whatsapp.name,
    color: atual.color || "",
    isDefault: !!atual.isDefault,
    allowGroups: !!atual.allowGroups,
    queueId: atual.queueId || "",
    redirectMinutes: Number(atual.redirectMinutes) || 0,
    chatFlowId: atual.chatFlowId || "",
    greetingMessage: atual.greetingMessage || "",
    completionMessage: atual.completionMessage || "",
    outOfHoursMessage: atual.outOfHoursMessage || "",
    surveyEnabled: !!atual.surveyEnabled,
    surveyPrompt: atual.surveyPrompt || "",
    // O único campo que esta função existe pra mudar.
    flowId
  };

  try {
    await put(`/api/sessions/${sessionId}`, corpo);
    logger.info(
      flowId
        ? `[URA] fluxo ${flowId} vinculado à conexão ${whatsapp.id} (${whatsapp.name})`
        : `[URA] fluxo desvinculado da conexão ${whatsapp.id} — ligação vai tocar direto pro atendente`
    );
  } catch (err: any) {
    const status = Number(err?.upstreamStatus) || 0;
    if (status >= 400 && status < 500) {
      // Problema de configuração: o usuário precisa ver.
      logger.warn(`[URA] vínculo recusado (${status}): ${err?.message}`);
      throw new AppError(err?.message || "Não foi possível vincular a URA à conexão.", 400);
    }
    logger.warn(`[URA] falha ao aplicar fluxo na sessão ${sessionId}: ${err?.message}`);
  }
};

export default { listarFluxos, aplicarUraNaSessao };
