import Ticket from "../../models/Ticket";
import Message from "../../models/Message";
import { Op } from "sequelize";
import Prompt from "../../models/Prompt";
import SalesAgent from "../../models/SalesAgent";
import logger from "../../utils/logger";
import { obterClienteIA } from "../../helpers/ControleDeIA";

/**
 * Lê a conversa e extrai o que interessa comercialmente.
 *
 * POR QUE IA E NÃO REGEX
 * Produto, valor e intenção aparecem de formas que expressão regular não
 * pega: "uns 20 mil", "tenho até 3k de entrada", "quero o prata mesmo",
 * "vou ver com minha esposa". Tentar cobrir isso com padrão de texto vira
 * uma lista infinita de exceções que erra o caso seguinte.
 *
 * O QUE É DEVOLVIDO
 * Sempre um objeto com os campos podendo vir null. Campo que a conversa não
 * revelou volta null — nunca inventado. O motor de qualificação decide o que
 * fazer com o que faltou.
 */

export interface DadosExtraidos {
  product: string | null;
  value: number | null;
  paymentMethod: string | null;
  purchaseTerm: string | null;
  city: string | null;
  intent: string | null;
  temperature: string | null;
  objections: string[];
  extraData: Record<string, any>;
}

const VAZIO: DadosExtraidos = {
  product: null,
  value: null,
  paymentMethod: null,
  purchaseTerm: null,
  city: null,
  intent: null,
  temperature: null,
  objections: [],
  extraData: {}
};

const INTENCOES = [
  "novo",
  "curioso",
  "pesquisando",
  "interessado",
  "qualificado",
  "quente",
  "pronto",
  "sem_interesse"
];

const montarInstrucoes = (agente: SalesAgent): string => {
  const extras = Array.isArray(agente.requiredFields)
    ? agente.requiredFields
        .filter((c: any) => !["product", "value", "paymentMethod", "purchaseTerm", "city"].includes(c.key))
        .map((c: any) => `      "${c.key}": <${c.label}, ou null>`)
        .join(",\n")
    : "";

  // O CONTRATO DO JSON É INEGOCIÁVEL
  // O motor de qualificação lê campos fixos (product, value, intent...). Se o
  // agente traz instruções próprias, elas ORIENTAM a leitura, mas o formato de
  // saída continua o mesmo — senão o parser quebra. Por isso a instrução do
  // agente entra como preâmbulo, e o esqueleto do JSON vem sempre depois.
  const preambulo = agente.extractionInstructions && agente.extractionInstructions.trim()
    ? `${agente.extractionInstructions.trim()}\n\n---\n\nIndependentemente do acima, sua SAÍDA obedece exatamente ao formato abaixo:\n`
    : "Você lê uma conversa de atendimento comercial e extrai informações.\n";

  return `${preambulo}
Responda EXCLUSIVAMENTE com um objeto JSON válido, sem markdown, sem crases,
sem texto antes ou depois:

{
  "product": <o que o cliente procura, ou null>,
  "value": <número puro do orçamento/valor citado, sem símbolo, ou null>,
  "paymentMethod": <à vista, financiado, pix, cartão..., ou null>,
  "purchaseTerm": <prazo que o cliente pretende comprar, ou null>,
  "city": <cidade/região do cliente, ou null>,
  "intent": <um de: ${INTENCOES.join(", ")}>,
  "temperature": <frio, morno ou quente>,
  "objections": [<objeções que o cliente levantou>],
  "extraData": {
${extras || "      "}
  }
}

REGRAS:
1. Nunca invente. O que a conversa não revelar volta null.
2. "value" é número: "uns 20 mil" vira 20000; "3k" vira 3000.
3. "intent" e "temperature" você infere pelo tom e pelo conteúdo.
4. "objections" só o que o cliente REALMENTE disse, nas palavras dele
   resumidas — não deduza objeção que ele não expressou.
5. Conversa só de saudação, sem assunto comercial: intent "novo",
   temperature "frio", o resto null.
`;
};

const extrairJson = (bruto: string): any => {
  const limpo = String(bruto || "").replace(/```json/gi, "").replace(/```/g, "").trim();
  const i = limpo.indexOf("{");
  const f = limpo.lastIndexOf("}");
  if (i === -1 || f === -1 || f <= i) throw new Error("JSON não encontrado");
  return JSON.parse(limpo.slice(i, f + 1));
};

const paraNumero = (v: any): number | null => {
  if (v === null || v === undefined || v === "") return null;
  const n = Number(String(v).replace(/[^\d.,-]/g, "").replace(/\./g, "").replace(",", "."));
  return Number.isFinite(n) ? n : null;
};

const ExtractLeadDataService = async (
  ticket: Ticket,
  agente: SalesAgent,
  companyId: number
): Promise<DadosExtraidos> => {
  try {
    // A extração precisa de uma chave de IA. O "Prompt de conversa" é OPCIONAL
    // no cadastro do agente — sem ele, e sem uma chave em qualquer prompt da
    // empresa, a extração devolvia vazio EM SILÊNCIO: o lead nunca qualificava
    // e a etiqueta nunca era aplicada, sem nada no log explicando.
    let prompt = agente.promptId
      ? await Prompt.findOne({ where: { id: agente.promptId, companyId } })
      : null;

    // Sem prompt vinculado (ou vinculado a um sem chave), procura QUALQUER
    // prompt da empresa que tenha chave. Antes pegava só o primeiro: se ele
    // estivesse sem chave, desistia mesmo havendo outro configurado.
    if (!prompt?.apiKey) {
      prompt = await Prompt.findOne({
        where: {
          companyId,
          apiKey: { [Op.ne]: null as any }
        },
        order: [["id", "ASC"]]
      });
    }

    if (!prompt?.apiKey) {
      logger.warn(
        `[SalesAgent] Ticket ${ticket?.id}: nenhuma chave de IA disponível — ` +
        `vincule um "Prompt de conversa" com chave ao agente comercial. ` +
        `Sem isso o lead não é qualificado e a etiqueta não é aplicada.`
      );
      return VAZIO;
    }

    // Últimas 30 mensagens: o suficiente para entender a negociação sem
    // estourar o contexto nem o custo. Conversa antiga raramente muda o
    // diagnóstico atual.
    const mensagens = await Message.findAll({
      where: { ticketId: ticket.id, companyId },
      order: [["createdAt", "DESC"]],
      limit: 30,
      attributes: ["body", "fromMe", "createdAt"]
    });

    const conversa = mensagens
      .reverse()
      .filter(m => m.body && String(m.body).trim())
      .map(m => `${m.fromMe ? "ATENDENTE" : "CLIENTE"}: ${m.body}`)
      .join("\n");

    if (!conversa.trim()) return VAZIO;

    const cliente = obterClienteIA(prompt.apiKey);

    const resposta = await cliente.chat.completions.create({
      model: prompt.aiModel || "gpt-4o-mini",
      temperature: 0,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: montarInstrucoes(agente) },
        { role: "user", content: conversa }
      ]
    });

    const dados = extrairJson(resposta?.choices?.[0]?.message?.content || "");

    return {
      product: dados.product || null,
      value: paraNumero(dados.value),
      paymentMethod: dados.paymentMethod || null,
      purchaseTerm: dados.purchaseTerm || null,
      city: dados.city || null,
      // Intenção fora da lista conhecida é descartada: melhor null do que um
      // valor que nenhum relatório sabe agrupar.
      intent: INTENCOES.includes(dados.intent) ? dados.intent : null,
      temperature: ["frio", "morno", "quente"].includes(dados.temperature)
        ? dados.temperature
        : null,
      objections: Array.isArray(dados.objections) ? dados.objections.slice(0, 10) : [],
      extraData: dados.extraData && typeof dados.extraData === "object" ? dados.extraData : {}
    };
  } catch (err: any) {
    logger.warn(`[SalesAgent] Falha ao extrair dados do ticket ${ticket?.id}: ${err?.message}`);
    return VAZIO;
  }
};

export default ExtractLeadDataService;
