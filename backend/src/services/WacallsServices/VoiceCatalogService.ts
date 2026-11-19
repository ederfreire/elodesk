import axios from "axios";
import logger from "../../utils/logger";

/**
 * Catálogo de vozes dos provedores de TTS.
 *
 * A consulta passa pelo backend, e não pelo navegador, por dois motivos:
 *
 *   1. A chave da API não deveria trafegar do navegador direto pro provedor —
 *      ficaria visível em qualquer aba de rede aberta e sujeita a extensões.
 *   2. Nem ElevenLabs nem OpenAI liberam CORS pra chamadas de navegador; do
 *      front a requisição seria bloqueada antes de sair.
 */

export interface VozDisponivel {
  id: string;
  nome: string;
  descricao?: string;
  previa?: string;
}

export interface ModeloDisponivel {
  id: string;
  nome: string;
}

/** Erro com mensagem já pronta pra mostrar na tela. */
class ErroDeVoz extends Error {
  constructor(public codigo: number, mensagem: string) {
    super(mensagem);
  }
}

/**
 * Traduz o corpo de erro do ElevenLabs numa frase útil.
 *
 * As chaves novas do ElevenLabs são escopadas: na hora de criar, escolhe-se
 * quais permissões ela terá. Uma chave válida mas SEM a permissão de leitura
 * de vozes recebe 400 com o motivo no corpo — e é justamente esse o caso que
 * aparecia na tela como um seco "ElevenLabs respondeu 400", sem dizer o que
 * fazer. O motivo real vem em `detail`, que ora é objeto, ora é texto.
 */
const motivoElevenLabs = (data: any, status: number): string => {
  const detalhe = data?.detail;

  // `status` e `message` são analisados juntos: o código legível vem em
  // `status` ("missing_permissions") e a frase em `message`. Olhar só um dos
  // dois deixaria casos passando batido.
  const mensagem =
    typeof detalhe === "string" ? detalhe : String(detalhe?.message || "");
  const codigo = typeof detalhe === "string" ? "" : String(detalhe?.status || "");
  const cru = `${codigo} ${mensagem}`.trim();

  if (/permission/i.test(cru)) {
    return "A chave não tem permissão para ler vozes. No painel do ElevenLabs, edite a chave e marque a permissão de Voices (leitura).";
  }
  if (/api[_ ]?key|unauthorized|invalid.*key/i.test(cru)) {
    return "Chave da API recusada pelo ElevenLabs.";
  }
  if (/quota|credit/i.test(cru)) {
    return "A conta do ElevenLabs está sem créditos disponíveis.";
  }
  if (mensagem) {
    return `ElevenLabs recusou a consulta: ${mensagem}`;
  }
  return `ElevenLabs respondeu ${status}.`;
};

const TEMPO_LIMITE = 15000;

/**
 * GET com prazo. Usa axios (já dependência do projeto) em vez de fetch: o
 * `@types/node` desta versão não declara fetch nem AbortController, e o
 * type-check recusaria.
 *
 * validateStatus sempre true para tratarmos 401/429 como resposta normal e
 * dar mensagem específica, em vez de exceção genérica.
 */
const buscar = (url: string, headers: Record<string, string>) =>
  axios.get(url, {
    headers,
    timeout: TEMPO_LIMITE,
    validateStatus: () => true
  });

/**
 * Vozes da conta ElevenLabs.
 *
 * Traz as vozes da própria conta (incluindo clonadas), que é justamente o que
 * uma lista fixa não conseguiria mostrar.
 */
const vozesElevenLabs = async (apiKey: string): Promise<VozDisponivel[]> => {
  const resp = await buscar("https://api.elevenlabs.io/v1/voices", {
    "xi-api-key": apiKey,
    Accept: "application/json"
  });

  if (resp.status >= 300) {
    throw new ErroDeVoz(resp.status, motivoElevenLabs(resp.data, resp.status));
  }

  const data: any = resp.data;
  const lista = Array.isArray(data?.voices) ? data.voices : [];

  return lista.map((v: any) => {
    // labels traz coisas como sotaque, idade e gênero — útil pra escolher a
    // voz sem precisar ouvir uma por uma.
    const rotulos = v?.labels && typeof v.labels === "object"
      ? Object.values(v.labels).filter(Boolean).join(" · ")
      : "";
    return {
      id: String(v?.voice_id || ""),
      nome: String(v?.name || v?.voice_id || ""),
      descricao: rotulos || String(v?.category || ""),
      previa: String(v?.preview_url || "")
    };
  }).filter((v: VozDisponivel) => v.id);
};

/** Modelos de TTS da conta ElevenLabs, com nome legível. */
const modelosElevenLabs = async (apiKey: string): Promise<ModeloDisponivel[]> => {
  try {
    const resp = await buscar("https://api.elevenlabs.io/v1/models", {
      "xi-api-key": apiKey,
      Accept: "application/json"
    });
    if (resp.status >= 300) return [];
    const data: any = resp.data;
    const lista = Array.isArray(data) ? data : [];
    return lista
      // can_do_text_to_speech separa os modelos de fala dos de outras tarefas.
      .filter((m: any) => m?.can_do_text_to_speech !== false)
      .map((m: any) => ({
        id: String(m?.model_id || ""),
        nome: String(m?.name || m?.model_id || "")
      }))
      .filter((m: ModeloDisponivel) => m.id);
  } catch (err: any) {
    // Lista de modelos é conveniência: se falhar, a tela usa os padrões.
    logger.warn(`[URA] modelos ElevenLabs indisponíveis: ${err?.message}`);
    return [];
  }
};

/**
 * Vozes do OpenAI.
 *
 * O OpenAI não expõe endpoint que liste as vozes de TTS — elas são fixas e
 * documentadas. Então a lista é local, e a chave serve só pra confirmar que
 * é válida antes de o usuário salvar e descobrir na hora da ligação.
 */
const VOZES_OPENAI: VozDisponivel[] = [
  { id: "alloy", nome: "Alloy", descricao: "Neutra, equilibrada" },
  { id: "ash", nome: "Ash", descricao: "Grave, firme" },
  { id: "ballad", nome: "Ballad", descricao: "Suave, expressiva" },
  { id: "coral", nome: "Coral", descricao: "Clara, acolhedora" },
  { id: "echo", nome: "Echo", descricao: "Masculina, direta" },
  { id: "fable", nome: "Fable", descricao: "Narrativa, calorosa" },
  { id: "nova", nome: "Nova", descricao: "Feminina, jovem" },
  { id: "onyx", nome: "Onyx", descricao: "Masculina, profunda" },
  { id: "sage", nome: "Sage", descricao: "Calma, madura" },
  { id: "shimmer", nome: "Shimmer", descricao: "Feminina, leve" },
  { id: "verse", nome: "Verse", descricao: "Versátil, conversacional" }
];

const MODELOS_OPENAI: ModeloDisponivel[] = [
  { id: "gpt-4o-mini-tts", nome: "GPT-4o mini TTS (recomendado)" },
  { id: "tts-1", nome: "TTS-1 (mais rápido)" },
  { id: "tts-1-hd", nome: "TTS-1 HD (melhor qualidade)" }
];

const validarChaveOpenAI = async (apiKey: string): Promise<void> => {
  const resp = await buscar("https://api.openai.com/v1/models", {
    Authorization: `Bearer ${apiKey}`,
    Accept: "application/json"
  });
  if (resp.status === 401 || resp.status === 403) {
    throw new ErroDeVoz(resp.status, "Chave da API recusada pelo OpenAI.");
  }
  if (resp.status >= 300) {
    const detalhe = (resp.data as any)?.error?.message;
    throw new ErroDeVoz(
      resp.status,
      detalhe ? `OpenAI recusou a consulta: ${detalhe}` : `OpenAI respondeu ${resp.status}.`
    );
  }
};

/**
 * Ponto de entrada: devolve vozes e modelos do provedor informado.
 */
export const listarVozes = async (
  provider: string,
  apiKey: string
): Promise<{ vozes: VozDisponivel[]; modelos: ModeloDisponivel[] }> => {
  const p = String(provider || "").trim().toLowerCase();
  const chave = String(apiKey || "").trim();

  if (!chave) throw new ErroDeVoz(400, "Informe a chave da API primeiro.");

  if (p === "elevenlabs") {
    const [vozes, modelos] = await Promise.all([
      vozesElevenLabs(chave),
      modelosElevenLabs(chave)
    ]);
    return {
      vozes,
      modelos: modelos.length
        ? modelos
        : [
            { id: "eleven_flash_v2_5", nome: "Flash v2.5 (rápido)" },
            { id: "eleven_multilingual_v2", nome: "Multilingual v2" },
            { id: "eleven_turbo_v2_5", nome: "Turbo v2.5" }
          ]
    };
  }

  if (p === "openai") {
    await validarChaveOpenAI(chave);
    return { vozes: VOZES_OPENAI, modelos: MODELOS_OPENAI };
  }

  throw new ErroDeVoz(400, "Provedor de voz não suportado.");
};

/**
 * Converte o erro num status HTTP seguro para a NOSSA API.
 *
 * Ponto crítico: nunca devolver 401 nem 403 daqui. O interceptor do frontend
 * trata qualquer 401/403 como sessão expirada, tenta renovar e, ao falhar,
 * desloga o usuário. Como a chave recusada pelo provedor chegava como 401, o
 * usuário era EXPULSO do sistema ao tentar carregar as vozes com uma chave
 * inválida ou sem permissão — comportamento que não tem nada a ver com a
 * sessão dele.
 *
 * 422 diz exatamente o que aconteceu: a requisição foi entendida, mas o dado
 * enviado (a chave) não serve.
 */
const CHAVE_INVALIDA = 422;

export const erroDeVoz = (err: any): { status: number; mensagem: string } => {
  if (err instanceof ErroDeVoz) {
    const codigo = err.codigo;
    // Erro de credencial do provedor vira 422 para não derrubar a sessão.
    if (codigo === 401 || codigo === 403 || codigo === 400) {
      return { status: CHAVE_INVALIDA, mensagem: err.message };
    }
    return {
      status: codigo >= 400 && codigo < 600 ? codigo : 502,
      mensagem: err.message
    };
  }
  if (err?.code === "ECONNABORTED" || err?.code === "ETIMEDOUT") {
    return { status: 504, mensagem: "O provedor de voz demorou demais para responder." };
  }
  return { status: 502, mensagem: "Não foi possível consultar o provedor de voz." };
};

export default { listarVozes, erroDeVoz };
