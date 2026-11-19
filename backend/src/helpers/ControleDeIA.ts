import OpenAI from "openai";
import logger from "../utils/logger";

/**
 * Controle central da camada de IA.
 *
 * Antes deste arquivo, cada canal (Baileys, API Oficial, WhatsApp Plus,
 * Webchat, assistente do atendente, TTS) criava o próprio cliente OpenAI, com
 * a própria configuração — ou sem nenhuma. O resultado eram seis
 * implementações levemente diferentes do mesmo problema, e nenhuma proteção
 * comum contra lentidão, rajada ou falha do provedor.
 *
 * Este módulo concentra quatro coisas:
 *
 *   1. UM cliente por chave de API (em vez de um por atendimento)
 *   2. Timeout e retries explícitos em todas as chamadas
 *   3. Disjuntor por chave: provedor fora do ar para de ser martelado
 *   4. Teto de concorrência global + trava por conversa
 *
 * Tudo é ajustável por variável de ambiente, para você conseguir apertar ou
 * afrouxar em produção sem precisar de build.
 */

// ─── PARÂMETROS ─────────────────────────────────────────────────────────────

const num = (nome: string, padrao: number): number => {
  const bruto = parseInt(process.env[nome] || "", 10);
  return Number.isFinite(bruto) && bruto > 0 ? bruto : padrao;
};

/** Tempo máximo de uma chamada ao modelo. */
export const IA_TIMEOUT_MS = num("IA_TIMEOUT_MS", 60_000);

/** Tentativas do SDK. 1 = uma repetição além da original. */
export const IA_MAX_RETRIES = num("IA_MAX_RETRIES", 1);

/** Quantas chamadas ao modelo podem estar em voo ao mesmo tempo. */
const IA_CONCORRENCIA = num("IA_CONCORRENCIA", 5);

/** Quanto tempo uma chamada espera na fila antes de desistir. */
const IA_ESPERA_MAX_MS = num("IA_ESPERA_MAX_MS", 30_000);

/** Falhas seguidas na mesma chave antes de abrir o disjuntor. */
const IA_FALHAS_PARA_ABRIR = num("IA_FALHAS_PARA_ABRIR", 5);

/** Quanto tempo o disjuntor fica aberto. */
const IA_DISJUNTOR_MS = num("IA_DISJUNTOR_MS", 2 * 60_000);

// ─── 1. UM CLIENTE POR CHAVE ────────────────────────────────────────────────
//
// O cliente OpenAI NÃO guarda estado de conversa — o histórico vai inteiro em
// cada chamada. Não havia motivo para existir um por atendimento.
//
// O que existia era pior do que redundante: `sessionsOpenAi` era um array que
// só crescia (um cliente por ticket, para sempre), varrido com findIndex a
// cada mensagem, e cada `new OpenAI()` criava o PRÓPRIO agente HTTP — ou
// seja, um pool de conexões por atendimento em vez de um compartilhado.
//
// Com um cliente por chave, o pool de conexões com a api.openai.com é
// reaproveitado, o mapa tem no máximo uma entrada por empresa, e a memória
// para de crescer.

const clientesPorChave = new Map<string, OpenAI>();

export const obterClienteIA = (apiKey: string): OpenAI => {
  const chave = String(apiKey || "").trim();
  if (!chave) throw new Error("IA: apiKey vazia");

  const existente = clientesPorChave.get(chave);
  if (existente) return existente;

  const cliente = new OpenAI({
    apiKey: chave,
    timeout: IA_TIMEOUT_MS,
    maxRetries: IA_MAX_RETRIES
  });

  clientesPorChave.set(chave, cliente);
  return cliente;
};

/** Descarta o cliente de uma chave (usar quando a chave for trocada). */
export const esquecerClienteIA = (apiKey: string): void => {
  clientesPorChave.delete(String(apiKey || "").trim());
};

// ─── 2. DISJUNTOR POR CHAVE ─────────────────────────────────────────────────
//
// Sem isto, uma chave sem crédito fazia TODA mensagem virar requisições
// fracassadas antes de desistir, e um provedor lento fazia cada conversa
// esperar o timeout inteiro. O disjuntor aprende com a falha: depois de N
// seguidas, para de tentar por alguns minutos e responde na hora.

type EstadoDisjuntor = { falhas: number; abertoAte: number };

const disjuntores = new Map<string, EstadoDisjuntor>();

const idDaChave = (apiKey: string): string => {
  // Nunca use a chave inteira em log. Só um sufixo, para dar para
  // correlacionar sem expor credencial.
  const s = String(apiKey || "");
  return s.length > 6 ? `...${s.slice(-4)}` : "(vazia)";
};

export const disjuntorAberto = (apiKey: string): boolean => {
  const e = disjuntores.get(apiKey);
  if (!e) return false;
  if (e.abertoAte === 0) return false;
  if (Date.now() >= e.abertoAte) {
    // Meia-abertura: zera e deixa a próxima tentar.
    disjuntores.set(apiKey, { falhas: 0, abertoAte: 0 });
    logger.info(`[IA] Disjuntor da chave ${idDaChave(apiKey)} fechou — voltando a tentar.`);
    return false;
  }
  return true;
};

export const registrarSucessoIA = (apiKey: string): void => {
  if (disjuntores.has(apiKey)) disjuntores.delete(apiKey);
};

export const registrarFalhaIA = (apiKey: string, motivo?: string): void => {
  const e = disjuntores.get(apiKey) || { falhas: 0, abertoAte: 0 };
  e.falhas += 1;

  if (e.falhas >= IA_FALHAS_PARA_ABRIR && e.abertoAte === 0) {
    e.abertoAte = Date.now() + IA_DISJUNTOR_MS;
    logger.warn(
      `[IA] Disjuntor ABERTO para a chave ${idDaChave(apiKey)} após ${e.falhas} falhas seguidas ` +
        `(${Math.round(IA_DISJUNTOR_MS / 1000)}s). Último motivo: ${motivo || "desconhecido"}`
    );
  }

  disjuntores.set(apiKey, e);
};

// ─── 3. TETO DE CONCORRÊNCIA ────────────────────────────────────────────────
//
// Não havia teto nenhum: 100 conversas ativas viravam 100 requisições HTTP
// simultâneas, 100 históricos na memória e 100 execuções pendentes no event
// loop. É o que transformava uma lentidão do provedor em fila crescendo até
// estourar a memória do processo.
//
// Com o teto, a lentidão vira espera controlada: quem não consegue vaga em
// IA_ESPERA_MAX_MS desiste e cai no caminho de erro, em vez de acumular.

let emVoo = 0;
const esperando: Array<{ liberar: () => void; expiraEm: number }> = [];

const tentarLiberarProximo = (): void => {
  while (emVoo < IA_CONCORRENCIA && esperando.length > 0) {
    const prox = esperando.shift();
    if (!prox) return;
    if (Date.now() > prox.expiraEm) continue; // já desistiu
    emVoo += 1;
    prox.liberar();
  }
};

const adquirirVaga = async (): Promise<void> => {
  if (emVoo < IA_CONCORRENCIA) {
    emVoo += 1;
    return;
  }

  await new Promise<void>((resolve, reject) => {
    const expiraEm = Date.now() + IA_ESPERA_MAX_MS;
    const item = { liberar: () => resolve(), expiraEm };
    esperando.push(item);

    setTimeout(() => {
      const i = esperando.indexOf(item);
      if (i >= 0) {
        esperando.splice(i, 1);
        reject(
          new Error(
            `IA ocupada: ${IA_CONCORRENCIA} chamadas em voo e a espera passou de ${IA_ESPERA_MAX_MS}ms`
          )
        );
      }
    }, IA_ESPERA_MAX_MS).unref?.();
  });
};

const devolverVaga = (): void => {
  emVoo = Math.max(0, emVoo - 1);
  tentarLiberarProximo();
};

// ─── 4. TRAVA POR CONVERSA ──────────────────────────────────────────────────
//
// O debounce que já existia agregava rajadas, mas se liberava ANTES da
// chamada ao modelo. Com uma chamada de 20s em andamento, a mensagem seguinte
// passava pela janela e disparava uma SEGUNDA chamada em paralelo para o
// mesmo contato — duas respostas, dois custos de token.
//
// Esta trava vale durante a execução inteira. Enquanto a IA responde àquele
// ticket, uma nova mensagem não abre outra chamada.

const emExecucao = new Set<string>();

export const iaOcupadaPara = (chaveTicket: string): boolean =>
  emExecucao.has(chaveTicket);

// ─── PONTO DE ENTRADA ───────────────────────────────────────────────────────

export type MotivoIA = "disjuntor" | "ocupado" | "concorrencia" | "erro";

/**
 * Resultado de uma chamada controlada.
 *
 * Interface com campos opcionais em vez de união discriminada de propósito:
 * o tsconfig do projeto usa `strict: false`, e sem `strictNullChecks` o
 * TypeScript não estreita união por propriedade booleana literal — o
 * `else if (r.motivo === ...)` depois de um `if (r.ok)` virava erro TS2339.
 */
export interface ResultadoIA<T> {
  ok: boolean;
  valor?: T;
  motivo?: MotivoIA;
  erro?: any;
}

/**
 * Executa uma chamada ao modelo com todas as proteções aplicadas.
 *
 * Devolve um resultado explícito em vez de lançar, para o chamador decidir o
 * que fazer (responder com fallback, ficar calado, transferir para humano)
 * sem precisar interpretar exceção.
 */
export const executarComControle = async <T>(
  opcoes: { apiKey: string; chaveTicket: string; rotulo?: string },
  tarefa: () => Promise<T>
): Promise<ResultadoIA<T>> => {
  const { apiKey, chaveTicket, rotulo } = opcoes;

  if (disjuntorAberto(apiKey)) {
    logger.warn(
      `[IA] ${rotulo || "chamada"} ignorada: disjuntor aberto para a chave ${idDaChave(apiKey)}`
    );
    return { ok: false, motivo: "disjuntor" };
  }

  if (emExecucao.has(chaveTicket)) {
    logger.info(
      `[IA] ${rotulo || "chamada"} ignorada: já existe uma resposta em andamento para ${chaveTicket}`
    );
    return { ok: false, motivo: "ocupado" };
  }

  try {
    await adquirirVaga();
  } catch (err: any) {
    logger.warn(`[IA] ${rotulo || "chamada"} recusada: ${err?.message}`);
    return { ok: false, motivo: "concorrencia", erro: err };
  }

  emExecucao.add(chaveTicket);

  try {
    const valor = await tarefa();
    registrarSucessoIA(apiKey);
    return { ok: true, valor };
  } catch (err: any) {
    registrarFalhaIA(apiKey, err?.message);
    return { ok: false, motivo: "erro", erro: err };
  } finally {
    emExecucao.delete(chaveTicket);
    devolverVaga();
  }
};

// ─── JANELA DE HISTÓRICO ────────────────────────────────────────────────────

/** Teto rígido de mensagens enviadas ao modelo, acima do que o usuário configurar. */
const IA_JANELA_MAX = num("IA_JANELA_MAX", 30);

/** Piso: abaixo disso a IA responde às cegas. */
const IA_JANELA_MIN = num("IA_JANELA_MIN", 4);

/**
 * Normaliza o `maxMessages` configurado no Agente.
 *
 * Havia dois defeitos opostos no mesmo campo:
 *
 *   - Em OpenAiService, `maxMessages <= 0` virava `limit: undefined`, e a
 *     consulta trazia o ATENDIMENTO INTEIRO — que ia todo para o modelo, em
 *     toda resposta. Um ticket com 500 mensagens custava 500 mensagens de
 *     token por réplica.
 *   - Nos outros quatro pontos, `maxMessages = 0` virava `LIMIT 0` e o
 *     Postgres devolvia ZERO mensagens: a IA respondia sem contexto nenhum,
 *     em silêncio.
 *
 * Aqui os dois casos caem no mesmo lugar razoável.
 */
export const janelaDeHistorico = (maxMessages?: number | null): number => {
  const bruto = Number(maxMessages);
  if (!Number.isFinite(bruto) || bruto <= 0) return Math.min(10, IA_JANELA_MAX);
  return Math.min(Math.max(Math.trunc(bruto), IA_JANELA_MIN), IA_JANELA_MAX);
};

/** Diagnóstico: estado atual do controle (para endpoint de saúde/log). */
export const estadoDaIA = () => ({
  emVoo,
  esperando: esperando.length,
  concorrenciaMax: IA_CONCORRENCIA,
  ticketsEmExecucao: emExecucao.size,
  clientes: clientesPorChave.size,
  disjuntoresAbertos: Array.from(disjuntores.values()).filter(
    d => d.abertoAte > Date.now()
  ).length
});
