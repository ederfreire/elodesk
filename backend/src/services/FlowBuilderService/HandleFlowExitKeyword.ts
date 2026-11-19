import Ticket from "../../models/Ticket";
import Contact from "../../models/Contact";
import { FlowBuilderModel } from "../../models/FlowBuilder";
import { getIO } from "../../libs/socket";
import logger from "../../utils/logger";
import CreateMessageService from "../MessageServices/CreateMessageService";
import UpdateTicketService from "../TicketServices/UpdateTicketService";
import ShowWhatsAppService from "../WhatsappService/ShowWhatsAppService";
import SendWhatsAppMessage from "../WbotServices/SendWhatsAppMessage";
import SendWhatsAppOficialMessage from "../WhatsAppOficial/SendWhatsAppOficialMessage";
import { SendMessage } from "../../helpers/SendMessage";
import MoveTicketToKanbanService from "./MoveTicketToKanbanService";

/**
 * Encerramento de fluxo por palavra-chave — versão única, compartilhada.
 *
 * Antes essa lógica vivia solta dentro de flowbuilderIntegration
 * (wbotMessageListener.ts). Na prática só o WhatsApp Plus (wacalls) passava
 * por ali em toda mensagem, porque o WacallsBotEngine chama
 * flowbuilderIntegration inclusive com fluxo em andamento.
 *
 * Nos outros canais o caminho é outro assim que o ticket entra em fluxo:
 *
 *  - API Oficial (ReceivedWhatsApp.ts): quando ticket.flowWebhook está ligado,
 *    o código vai direto pro ActionsWebhookService e nunca chega no
 *    flowbuilderIntegration — justamente quando a palavra de saída importa.
 *  - Baileys (wbotMessageListener.ts): o tratamento do nó de input responde
 *    e dá `return` antes de chegar no flowbuilderIntegration.
 *
 * Resultado: "sair" só funcionava no WhatsApp Plus, e nos demais canais
 * apenas se o cliente estivesse exatamente parado num nó de MENU — e ainda
 * assim só com as 4 palavras fixas do ActionsWebhookService, ignorando as
 * palavras configuradas no nó de saída.
 *
 * Agora os três canais chamam esta função no início do processamento da
 * mensagem, antes de qualquer desvio de fluxo.
 *
 * Retorna true quando encerrou o atendimento (o chamador deve dar `return`
 * e não processar mais nada da mensagem).
 */

const PALAVRAS_PADRAO = [
  "sair",
  "encerrar",
  "finalizar",
  "cancelar",
  "encerra",
  "encerrar atendimento",
  "finalizar atendimento",
  "cancelar atendimento",
  "parar",
  "stop",
  "exit",
  "quit",
  "tchau",
  "fim",
  "adeus"
];

const MENSAGEM_PADRAO =
  "Atendimento pelo chatbot finalizado. Em breve um atendente entrará em contato.";

const normalizar = (texto: any): string =>
  String(texto ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, "")
    .trim();

interface Params {
  ticket: Ticket;
  contact: Contact;
  companyId: number;
  /** Texto já extraído da mensagem (texto puro ou título do botão/lista). */
  body: string;
  /** Origem, só para log — ex.: "BAILEYS", "OFICIAL", "WACALLS". */
  canal?: string;
}

/**
 * Lê o nó de saída do fluxo em andamento e devolve as palavras configuradas
 * e a mensagem de despedida. Se o fluxo não tiver nó de saída (ou não tiver
 * palavras configuradas), cai nos padrões — assim quem já usava continua
 * funcionando igual.
 */
const carregarConfigDoNoDeSaida = async (
  ticket: Ticket,
  companyId: number
): Promise<{ palavras: string[]; despedida: string; kanbanTagId: number | null }> => {
  const padrao = {
    palavras: PALAVRAS_PADRAO,
    despedida: MENSAGEM_PADRAO,
    kanbanTagId: null as number | null
  };

  try {
    const flowId = ticket.flowStopped || ticket.lastFlowId;
    if (!flowId) return padrao;

    const fluxo = await FlowBuilderModel.findOne({
      where: { id: flowId, company_id: companyId }
    });

    const nos: any[] = fluxo?.flow?.["nodes"] || [];
    const nosDeSaida = nos.filter(n => n?.type === "exit");
    if (nosDeSaida.length === 0) return padrao;

    const configuradas = nosDeSaida
      .filter(
        n => Array.isArray(n?.data?.exitKeywords) && n.data.exitKeywords.length > 0
      )
      .flatMap(n => n.data.exitKeywords as string[])
      .map(normalizar)
      .filter(Boolean);

    // A despedida vem do nó que definiu palavras; se nenhum definiu, aceita a
    // do primeiro nó de saída do fluxo, que é o que o usuário configurou na
    // tela mesmo sem usar palavras-chave.
    const noComPalavras = nosDeSaida.find(
      n => Array.isArray(n?.data?.exitKeywords) && n.data.exitKeywords.length > 0
    );
    const despedidaBruta =
      noComPalavras?.data?.farewellMessage ?? nosDeSaida[0]?.data?.farewellMessage;

    // Etapa de destino no Kanban — mesma origem da despedida: o nó que
    // definiu as palavras, ou o primeiro nó de saída do fluxo.
    const kanbanBruto =
      noComPalavras?.data?.kanbanTagId ?? nosDeSaida[0]?.data?.kanbanTagId;

    return {
      palavras: configuradas.length > 0 ? configuradas : padrao.palavras,
      despedida:
        despedidaBruta && String(despedidaBruta).trim()
          ? String(despedidaBruta)
          : padrao.despedida,
      kanbanTagId: kanbanBruto ? Number(kanbanBruto) : null
    };
  } catch (err: any) {
    logger.warn(
      `[FLOW EXIT KEYWORD] Falha ao ler o nó de saída do fluxo: ${err?.message}`
    );
    return padrao;
  }
};

const HandleFlowExitKeyword = async ({
  ticket,
  contact,
  companyId,
  body,
  canal = "?"
}: Params): Promise<boolean> => {
  try {
    if (!body || !ticket) return false;

    // Só faz sentido encerrar fluxo se existe fluxo em andamento.
    const emFluxo = !!(
      ticket.flowWebhook ||
      ticket.flowStopped ||
      ticket.lastFlowId
    );
    if (!emFluxo) return false;

    const normalizado = normalizar(body);
    if (!normalizado) return false;

    const { palavras, despedida, kanbanTagId } = await carregarConfigDoNoDeSaida(
      ticket,
      companyId
    );

    if (!palavras.includes(normalizado)) return false;

    logger.info(
      `[FLOW EXIT KEYWORD][${canal}] Ticket ${ticket.id} - cliente enviou "${body}" ` +
        `(norm: "${normalizado}") - encerrando fluxo`
    );

    // ---- Despedida -------------------------------------------------------
    //
    // ATENÇÃO À ORDEM E AO wid. Este bloco é a causa do bug "a frase de
    // atendimento encerrado abre um novo ticket em vez de encerrar".
    //
    // No canal Baileys ("whatsapp"), o SendWhatsAppMessage NÃO grava a
    // mensagem no banco: ele só manda pro WhatsApp e devolve o objeto. Quem
    // grava é o próprio wbotMessageListener quando o Baileys devolve a
    // mensagem de volta como evento (messages.upsert com fromMe=true).
    //
    // Só que esse eco chega alguns instantes DEPOIS. Se a essa altura o
    // ticket já estiver fechado, o FindOrCreateTicketService não reaproveita
    // ticket com status "closed" — ele CRIA UM NOVO e pendura a despedida
    // nele. Daí a impressão de que o fluxo não encerrou: o atendimento
    // fechava e, em seguida, nascia outro com a mensagem de encerramento
    // dentro.
    //
    // No WhatsApp Plus (wacalls) isso nunca aconteceu porque lá o
    // SendWhatsAppMessage grava a mensagem na hora e o canal não devolve eco
    // pelo listener — era exatamente por isso que "só funcionava no Plus".
    //
    // A correção tem duas partes:
    //   1. gravar a despedida com o wid REAL devolvido pelo envio, para que a
    //      deduplicação por wid no início do handleMessage descarte o eco;
    //   2. gravar ANTES de fechar o ticket, para que mesmo um eco que escape
    //      da dedup ainda encontre o ticket aberto.
    try {
      const whatsapp = await ShowWhatsAppService(ticket.whatsappId, companyId);

      if (whatsapp?.channel === "whatsapp") {
        const enviada: any = await SendWhatsAppMessage({
          body: despedida,
          ticket,
          quotedMsg: null
        });

        await CreateMessageService({
          messageData: {
            // O wid tem que ser o id da mensagem no WhatsApp, não um
            // timestamp: é ele que faz o eco ser reconhecido como duplicata.
            wid: enviada?.key?.id || `${new Date().getTime()}`,
            ticketId: ticket.id,
            body: despedida,
            fromMe: true,
            read: true,
            ack: 2
          } as any,
          companyId
        });
      } else if (whatsapp?.channel === "whatsapp_oficial") {
        // SendWhatsAppOficialMessage já grava a mensagem internamente
        // (CreateMessageService no final do serviço). Gravar de novo aqui
        // duplicaria a despedida no atendimento.
        await SendWhatsAppOficialMessage({
          body: despedida,
          ticket,
          quotedMsg: null,
          type: "text",
          media: null,
          vCard: null
        } as any);
      } else if (whatsapp?.channel === "wacalls") {
        // Idem: SendMessage → SendWacallsText → CreateMessageService.
        await SendMessage(whatsapp, { number: contact.number, body: despedida });
      } else {
        // Demais canais: sem serviço de envio próprio aqui, apenas registra.
        await CreateMessageService({
          messageData: {
            wid: `${new Date().getTime()}`,
            ticketId: ticket.id,
            body: despedida,
            fromMe: true,
            read: true,
            ack: 2
          } as any,
          companyId
        });
      }
    } catch (sendErr: any) {
      logger.warn(
        `[FLOW EXIT KEYWORD][${canal}] Falha ao enviar despedida: ${sendErr?.message}`
      );
    }

    // ---- Encerramento ----------------------------------------------------
    await ticket.update({
      flowWebhook: false,
      flowStopped: null,
      lastFlowId: null,
      hashFlowId: null,
      dataWebhook: null
    });

    try {
      await UpdateTicketService({
        ticketData: {
          status: "closed",
          sendFarewellMessage: false, // a despedida já foi enviada acima
          amountUsedBotQueues: 0
        },
        ticketId: ticket.id,
        companyId
      });
    } catch (closeErr: any) {
      logger.error(
        `[FLOW EXIT KEYWORD][${canal}] Falha ao encerrar o ticket ${ticket.id}: ${closeErr?.message}`
      );
      // Rede de segurança: se o serviço de atualização falhar, garante ao
      // menos que o ticket não fique aberto/pendente.
      await ticket.update({ status: "closed" });
    }

    await ticket.reload();

    // Rede de segurança, igual à do nó de encerrar: o UpdateTicketService tem
    // caminhos em que ele retorna sem fechar de fato (ticket duplicado do
    // mesmo contato, integração ativa etc.). Sem essa checagem o atendimento
    // ficava aberto e parecia que o "sair" não tinha feito nada.
    if (ticket.status !== "closed" && ticket.status !== "nps") {
      logger.warn(
        `[FLOW EXIT KEYWORD][${canal}] Ticket ${ticket.id} continuou em "${ticket.status}" após UpdateTicketService — forçando fechamento`
      );
      await ticket.update({ status: "closed" });
    }

    // Mesma regra do nó de encerrar: se o nó de saída tem etapa de destino
    // configurada, o card vai para lá (ex.: "Perdido"). Sem etapa, não mexe
    // no Kanban.
    if (kanbanTagId) {
      try {
        await MoveTicketToKanbanService({
          ticketId: ticket.id,
          companyId,
          tagId: kanbanTagId,
          enviarSaudacao: false // a despedida já foi enviada acima
        });
      } catch (kbErr: any) {
        logger.warn(
          `[FLOW EXIT KEYWORD][${canal}] Falha ao mover o ticket ${ticket.id} para a etapa ${kanbanTagId}: ${kbErr?.message}`
        );
      }
    }

    const io = getIO();
    io.to("open")
      .to("pending")
      .to(String(ticket.id))
      .emit(`company-${companyId}-ticket`, {
        action: "delete",
        ticketId: ticket.id
      });

    return true;
  } catch (err: any) {
    logger.warn(
      `[FLOW EXIT KEYWORD][${canal}] Erro no check: ${err?.message}`
    );
    return false;
  }
};

export default HandleFlowExitKeyword;
