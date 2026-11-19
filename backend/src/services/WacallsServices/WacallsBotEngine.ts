/**
 * Motor de bot/chatbot para conexões do canal wacalls (WhatsApp Plus - Voz +
 * Msg). O Baileys tem seu próprio pipeline gigante (verifyQueue,
 * flowbuilderIntegration, handleMessageIntegration, handleRating, tudo em
 * wbotMessageListener.ts) profundamente acoplado ao objeto `wbot` (socket
 * Baileys). Em vez de duplicar/reescrever tudo isso, este arquivo reaproveita
 * as partes de wbotMessageListener.ts que já são agnósticas de wbot
 * (confirmadas: toleram wbot=null) — executeFlowBuilderKeywordTrigger,
 * flowbuilderIntegration, handleMessageIntegration (só n8n/webhook),
 * verifyRating/handleRating — e implementa nativamente só a parte que é
 * fundamentalmente amarrada ao wbot: o roteamento de fila (verifyQueue vira
 * verifyQueueWacalls aqui, ~80 linhas em vez das ~830 do original).
 *
 * Limitações conhecidas (degradação esperada, não bug):
 *  - Integração do tipo "dialogflow" depende de chamadas diretas ao wbot
 *    (presença, sendMessage cru) espalhadas pelo código-fonte dela. Pra
 *    conexões wacalls essa integração é pulada com um aviso no log em vez
 *    de tentar (e falhar) uma adaptação incompleta.
 *  - "typebot" e "Agente de IA" (Prompt) JÁ são suportados: typebot roda via
 *    typebotListenerWacalls.ts (fork de typebotListenerOficial.ts, envia por
 *    SendWacallsText/SendWacallsMediaMessage) e o Agente de IA roda via
 *    WacallsAiAgentService.ts (fork simplificado do trecho equivalente de
 *    WhatsAppOficial/ReceivedWhatsApp.ts) — ambos seguem o mesmo padrão já
 *    usado e testado no canal whatsapp_oficial.
 *  - Botões/listas/CTA/carrossel/catálogo nativos não existem em contas
 *    pessoais (whatsmeow) — isso já é tratado no ActionsWebhookService.ts
 *    (degrada pra texto simples).
 */
import moment from "moment";
import { isNil } from "lodash";
import Ticket from "../../models/Ticket";
import Whatsapp from "../../models/Whatsapp";
import Contact from "../../models/Contact";
import Queue from "../../models/Queue";
import TicketTraking from "../../models/TicketTraking";
import ShowWhatsAppService from "../WhatsappService/ShowWhatsAppService";
import ShowQueueIntegrationService from "../QueueIntegrationServices/ShowQueueIntegrationService";
import FindCompanySettingsService from "../CompaniesSettings/FindCompanySettingsService";
import ApplyQueueAiAgent from "../../helpers/ApplyQueueAiAgent";
import formatBody from "../../helpers/Mustache";
import logger from "../../utils/logger";
import { SendMessage } from "../../helpers/SendMessage";
import {
  sendConnectionGreeting,
  sendQueueGreeting,
  sendGreetingWithQueueMenu
} from "../../helpers/SendGreetingMessage";
import {
  flowbuilderIntegration,
  handleMessageIntegration,
  verifyRating,
  handleRating
} from "../WbotServices/wbotMessageListener";
import typebotListenerWacalls from "../TypebotServices/typebotListenerWacalls";
import { handleWacallsAiAgent } from "./WacallsAiAgentService";
// import type: só o formato do evento, sem puxar valor em runtime — evita
// ciclo com HandleWacallsIncoming.ts (que importa este arquivo dinamicamente).
import type { WacallsIncoming } from "./HandleWacallsIncoming";

// Tipos de integração que dependem de código profundamente acoplado ao wbot
// Baileys (presença, sendMessage cru) e não têm como rodar de forma
// confiável numa conexão wacalls sem uma reescrita própria fora do escopo
// atual.
const UNSUPPORTED_INTEGRATION_TYPES = new Set(["dialogflow"]);

/**
 * Mensagem de fora do expediente. Esta parte simplesmente NÃO EXISTIA no
 * canal wacalls — todo o tratamento de horário estava só no pipeline do
 * Baileys (wbotMessageListener.ts) e no oficial (ReceivedWhatsApp.ts), então
 * numa conexão WhatsApp Plus o cliente nunca recebia o aviso de fora de
 * horário e o bot seguia atendendo normalmente 24h.
 *
 * Segue a MESMA regra dos outros canais:
 *  - respeita o tipo de escala configurado (empresa, conexão ou fila);
 *  - só vale pra mensagem recebida do cliente, fora de ticket já aberto;
 *  - envia a mensagem da FILA quando a fila tem uma própria, senão a da
 *    conexão;
 *  - marca ticket.isOutOfHour pra não repetir o aviso a cada mensagem.
 *
 * Retorna true quando consumiu a mensagem (bot deve parar por aqui).
 */
const handleOutOfHoursWacalls = async (
  whatsapp: Whatsapp,
  ticket: Ticket,
  contact: Contact,
  settings: any,
  queueIdOverride?: number
): Promise<boolean> => {
  try {
    const scheduleType = settings?.scheduleType;
    if (!scheduleType || scheduleType === "disabled") return false;

    // Ticket já em atendimento humano/grupo não recebe aviso de horário.
    if (["open", "group"].includes(ticket.status)) return false;
    if ((ticket as any).imported) return false;

    const { default: VerifyCurrentSchedule } = await import(
      "../CompanyService/VerifyCurrentSchedule"
    );

    let currentSchedule: any = null;
    if (scheduleType === "company") {
      currentSchedule = await VerifyCurrentSchedule(whatsapp.companyId, 0, 0);
    } else if (scheduleType === "connection") {
      currentSchedule = await VerifyCurrentSchedule(whatsapp.companyId, 0, whatsapp.id);
    } else if (scheduleType === "queue") {
      // A escala de FILA só pode ser avaliada depois que o ticket tem fila.
      // `queueIdOverride` cobre o momento exato em que o bot acabou de
      // atribuir a fila (assignQueue) — antes disso não há o que checar.
      const qId = queueIdOverride || ticket.queueId;
      if (!qId) return false;
      currentSchedule = await VerifyCurrentSchedule(whatsapp.companyId, qId, 0);
    }

    // null = sem escala cadastrada pra esse alvo → não bloqueia nada.
    if (isNil(currentSchedule)) return false;
    if (currentSchedule?.inActivity !== false) {
      // Voltou pro expediente: limpa o flag pra que o próximo período fora
      // do horário volte a avisar o cliente (sem isso o aviso só saía uma
      // única vez na vida do ticket).
      if ((ticket as any).isOutOfHour === true) {
        await ticket.update({ isOutOfHour: false } as any);
      }
      return false;
    }

    // Dentro do expediente antes e agora fora: zera o contador do chatbot
    // pra ele recomeçar do início quando o expediente voltar.
    if ((ticket as any).isOutOfHour === false) {
      await ticket.update({ amountUsedBotQueues: 0 } as any);
    }

    // Mensagem da fila tem prioridade sobre a da conexão (mesma ordem dos
    // outros canais).
    let outOfHoursMessage = "";
    const queueIdForMsg = queueIdOverride || ticket.queueId;
    if (queueIdForMsg) {
      const queue = await Queue.findByPk(queueIdForMsg);
      outOfHoursMessage = String((queue as any)?.outOfHoursMessage || "");
    }
    if (!outOfHoursMessage) {
      outOfHoursMessage = String((whatsapp as any)?.outOfHoursMessage || "");
    }

    // Já avisou nesta janela — não repete a cada mensagem do cliente.
    if ((ticket as any).isOutOfHour === true) return true;

    if (outOfHoursMessage.trim()) {
      // Envia pelo caminho nativo do canal (SendWacallsText) em vez do
      // helper genérico SendMessage: aquele reencontra o ticket pelo número
      // do contato e falhava silenciosamente quando o número normalizado
      // não batia (9º dígito, grupos, contatos criados via webhook).
      const { SendWacallsText } = await import("./SendWacallsMessageService");
      await SendWacallsText({
        body: `‎${formatBody(outOfHoursMessage, ticket)}`,
        ticket
      });
      logger.info(
        `[WACALLS OUT-OF-HOURS] Aviso enviado — ticket ${ticket.id} (conexão ${whatsapp.id})`
      );
    } else {
      logger.warn(
        `[WACALLS OUT-OF-HOURS] Fora do expediente mas sem mensagem configurada (ticket ${ticket.id}, conexão ${whatsapp.id})`
      );
    }

    await ticket.update({ isOutOfHour: true } as any);
    return true;

  } catch (err: any) {
    // Falha aqui não pode derrubar a mensagem: na dúvida deixa o fluxo
    // normal seguir, que é o comportamento menos danoso.
    logger.warn(`[WACALLS OUT-OF-HOURS] Falhou: ${err?.message}`);
    return false;
  }
};

/**
 * Monta um objeto no formato mínimo que executeFlowBuilderKeywordTrigger,
 * flowbuilderIntegration e handleMessageIntegration esperam (formato
 * proto.IWebMessageInfo do Baileys) a partir do evento wacalls-chat. Os três
 * só leem msg.key.{fromMe,id,remoteJid}, msg.message.conversation e
 * msg.messageTimestamp/pushName — não chamam nenhum método de socket.
 */
const buildSyntheticMsg = (
  ev: WacallsIncoming,
  contact: Contact,
  body: string
): any => ({
  key: {
    remoteJid: contact.remoteJid || `${contact.number}@s.whatsapp.net`,
    fromMe: !!ev.fromMe,
    id: ev.id
  },
  message: { conversation: body },
  messageTimestamp: ev.timestamp || Math.floor(Date.now() / 1000),
  pushName: ev.pushName || contact.name
});

/**
 * Captura de resposta do NPS pro canal wacalls — espelha o trecho
 * equivalente do Baileys em wbotMessageListener.ts (bloco "Tratamento para
 * avaliação do atendente"), mas envia o "opção inválida" via SendMessage
 * (que já roteia certo pro wacalls) em vez de wbot.sendMessage direto.
 */
const handleNpsWacalls = async (
  whatsapp: Whatsapp,
  ticket: Ticket,
  ticketTraking: TicketTraking,
  contact: Contact,
  body: string
): Promise<void> => {
  const rate = parseFloat(body);

  if (!Number.isNaN(rate)) {
    await handleRating(rate, ticket, ticketTraking);
    await ticketTraking.update({
      ratingAt: moment().toDate(),
      finishedAt: moment().toDate(),
      rated: true
    });
    return;
  }

  const maxUses = (whatsapp as any).maxUseBotQueuesNPS ?? 3;
  if ((ticket.amountUsedBotQueuesNPS || 0) < maxUses) {
    try {
      await SendMessage(whatsapp, {
        number: contact.number,
        body: "\u200eOpção inválida, tente novamente.\n"
      });
    } catch (e: any) {
      logger.error(`[WACALLS BOT][NPS] Falha ao enviar aviso de opção inválida: ${e?.message}`);
    }

    // Reenvia a saudação da avaliação (mesmo comportamento do Baileys em
    // wbotMessageListener.ts — bloco "Tratamento para avaliação do atendente").
    const ratingMessage = (whatsapp as any).ratingMessage;
    if (!isNil(ratingMessage) && ratingMessage !== "") {
      try {
        await new Promise(res => setTimeout(res, 800));
        await SendMessage(whatsapp, {
          number: contact.number,
          body: `\u200e${ratingMessage}\n`
        });
      } catch (e: any) {
        logger.error(`[WACALLS BOT][NPS] Falha ao reenviar saudação da avaliação: ${e?.message}`);
      }
    }

    await ticket.update({
      amountUsedBotQueuesNPS: (ticket.amountUsedBotQueuesNPS || 0) + 1
    });
  }
};

/**
 * Fluxo de consentimento LGPD (config "enableLGPD") pro canal wacalls —
 * espelha o bloco "TRATAMENTO LGPD" do Baileys em wbotMessageListener.ts
 * (~linhas 6749-6925). A mensagem recebida já foi persistida antes de chegar
 * aqui (HandleWacallsIncoming.ts), então só cuida da máquina de estados:
 *   - ainda não perguntou (lgpdSendMessageAt vazio): manda lgpdMessage +
 *     lgpdLink (se configurados) + o prompt "[1] Sim / [2] Não", marca
 *     lgpdSendMessageAt e retorna true (consome a mensagem, aguarda resposta).
 *   - já perguntou, aguardando resposta: [1] aceita (marca
 *     contact.lgpdAcceptedAt/ticket.lgpdAcceptedAt, tira o ticket do status
 *     "lgpd" e deixa a mensagem seguir pro resto do pipeline no mesmo ciclo,
 *     igual ao Baileys); [2] recusa (manda whatsapp.complationMessage, fecha
 *     o ticket); outra coisa: reenvia o prompt até o limite de
 *     whatsapp.maxUseBotQueues tentativas.
 * Retorna true quando a mensagem foi consumida por este fluxo (o chamador
 * NÃO deve continuar pro resto do bot); false quando deve seguir adiante
 * (aceite recém-confirmado, ou LGPD não se aplica aqui).
 */
const handleLgpdWacalls = async (
  whatsapp: Whatsapp,
  ticket: Ticket,
  contact: Contact,
  settings: any,
  body: string
): Promise<boolean> => {
  if (ticket.isGroup) return false;

  if (!isNil((ticket as any).lgpdSendMessageAt)) {
    const choosenOption = parseFloat(body);

    if (Number.isInteger(choosenOption) && choosenOption === 1) {
      try {
        await contact.update({ lgpdAcceptedAt: moment().toDate() } as any);
      } catch (err: any) {
        logger.error(`[WACALLS BOT][LGPD] Falha ao marcar contato como aceito: ${err?.message}`);
      }
      await ticket.update({
        status: ticket.isGroup ? "group" : "pending",
        lgpdAcceptedAt: moment().toDate(),
        amountUsedBotQueues: 0,
        isBot: true
      } as any);
      return false; // aceito agora — segue pro resto do bot no mesmo ciclo
    }

    if (choosenOption === 2) {
      const complationMessage = (whatsapp as any).complationMessage;
      if (!isNil(complationMessage) && complationMessage !== "") {
        try {
          await SendMessage(whatsapp, {
            number: contact.number,
            body: `‎${formatBody(complationMessage, ticket)}\n`
          });
        } catch (err: any) {
          logger.error(`[WACALLS BOT][LGPD] Falha ao enviar mensagem de despedida: ${err?.message}`);
        }
      }
      await ticket.update({ status: "closed", amountUsedBotQueues: 0 } as any);
      return true;
    }

    // resposta não reconhecida — reenvia o prompt até o limite de tentativas
    const maxUseBotQueues = (whatsapp as any).maxUseBotQueues || 0;
    if (maxUseBotQueues > 0 && (ticket.amountUsedBotQueues || 0) < maxUseBotQueues) {
      await ticket.update({
        amountUsedBotQueues: (ticket.amountUsedBotQueues || 0) + 1,
        lgpdSendMessageAt: null
      } as any);
    }
    return true;
  }

  // primeiro contato nesse status — dispara o prompt de consentimento
  const lgpdConsentPending =
    (contact as any).lgpdAcceptedAt === null || settings?.lgpdConsent === "enabled";
  const maxUseBotQueues = (whatsapp as any).maxUseBotQueues || 0;
  const withinBotQueueLimit =
    maxUseBotQueues === 0 || (ticket.amountUsedBotQueues || 0) <= maxUseBotQueues;

  if (
    lgpdConsentPending &&
    withinBotQueueLimit &&
    !isNil(settings?.lgpdMessage) &&
    settings.lgpdMessage !== ""
  ) {
    try {
      await SendMessage(whatsapp, {
        number: contact.number,
        body: `‎${formatBody(settings.lgpdMessage, ticket)}\n`
      });
      if (!isNil(settings?.lgpdLink) && settings.lgpdLink !== "") {
        await new Promise(res => setTimeout(res, 1000));
        await SendMessage(whatsapp, {
          number: contact.number,
          body: `‎${formatBody(settings.lgpdLink, ticket)}\n`
        });
      }
      await new Promise(res => setTimeout(res, 1000));
      await SendMessage(whatsapp, {
        number: contact.number,
        body: "‎ Estou ciente sobre o tratamento dos meus dados pessoais. \n\n*[1]* Sim\n*[2]* Não"
      });
    } catch (err: any) {
      logger.error(`[WACALLS BOT][LGPD] Falha ao enviar prompt de consentimento: ${err?.message}`);
    }

    await ticket.update({
      lgpdSendMessageAt: moment().toDate(),
      amountUsedBotQueues: (ticket.amountUsedBotQueues || 0) + 1
    } as any);
    return true;
  }

  return false;
};

/**
 * Dispara (se configurada) uma integração externa (n8n/webhook) — dialogflow
 * e typebot são pulados com aviso, ver UNSUPPORTED_INTEGRATION_TYPES no topo
 * do arquivo. Retorna true se alguma integração foi de fato disparada.
 */
const tryHandleIntegration = async (
  integrationId: number,
  companyId: number,
  msg: any,
  ticket: Ticket,
  markAssigned: boolean
): Promise<boolean> => {
  try {
    const integration = await ShowQueueIntegrationService(integrationId, companyId);
    if (!integration) return false;

    if (UNSUPPORTED_INTEGRATION_TYPES.has(integration.type)) {
      logger.warn(
        `[WACALLS BOT] Integração "${integration.type}" (id ${integration.id}) não é suportada em conexões WhatsApp Plus (wacalls) — pulando, ticket ${ticket.id}.`
      );
      return false;
    }

    // typebot precisa mandar as respostas de verdade (texto/áudio/imagem/
    // vídeo) — handleMessageIntegration's branch de typebot é acoplado ao
    // wbot Baileys, então usamos o listener próprio do wacalls aqui em vez
    // dele (mesmo padrão do canal whatsapp_oficial: VerifyQueue.ts especial
    // -iza "typebot" pra chamar typebotListenerOficial em vez de deixar cair
    // no handleMessageIntegration genérico).
    if (integration.type === "typebot") {
      if (markAssigned) {
        await ticket.update({ useIntegration: true, integrationId: integration.id });
        await ticket.reload();
      }
      await typebotListenerWacalls({ msg, ticket, typebot: integration });
      return true;
    }

    await handleMessageIntegration(msg, null as any, companyId, integration, ticket);

    if (markAssigned) {
      await ticket.update({ useIntegration: true, integrationId: integration.id });
    }
    return true;
  } catch (e: any) {
    logger.error(`[WACALLS BOT] Falha ao processar integração ${integrationId}: ${e?.message}`);
    return false;
  }
};

/**
 * Roteamento de fila nativo pro wacalls — versão enxuta do verifyQueue do
 * Baileys (~830 linhas, cheio de chamadas diretas a wbot.sendMessage).
 * Estrutura (saudação da conexão + `ticketTraking.chatbotAt` como flag de
 * "já mandei o menu") espelha o pipeline já usado e testado em produção
 * pelo canal Z-API (ver ZApiWebhookController.ts), que passa pelo mesmo
 * helpers/SendGreetingMessage.ts:
 *   - 0 filas: só saudação da conexão.
 *   - 1 fila: saudação da conexão (se a config sendGreetingMessageOneQueues
 *     estiver habilitada) + auto-atribui a fila + saudação da fila (ou
 *     integração da fila, se tiver).
 *   - 2+ filas: saudação da conexão + menu numerado; próxima mensagem casa
 *     a resposta ("sair"/"exit"/"0" encerra, "#" reenvia o menu).
 */
const verifyQueueWacalls = async (
  whatsapp: Whatsapp,
  ticket: Ticket,
  contact: Contact,
  ticketTraking: TicketTraking,
  msg: any,
  body: string
): Promise<void> => {
  const companyId = ticket.companyId;
  const full = await ShowWhatsAppService(whatsapp.id, companyId, 0);
  const queues: Queue[] = Array.isArray((full as any).queues) ? (full as any).queues : [];

  const assignQueue = async (queue: Queue) => {
    await ticket.update({ queueId: queue.id, amountUsedBotQueues: 0 });
    await ticketTraking.update({ queueId: queue.id, chatbotAt: null });
    await ticket.reload();

    const settings = await FindCompanySettingsService({ companyId });

    // Escala por FILA: agora que o ticket tem fila, checa o expediente dela
    // ANTES de saudação/integração/Agente de IA. Sem isso o WhatsApp Plus
    // atendia normalmente fora do horário quando o tipo de escala era
    // "queue" (na entrada da mensagem o ticket ainda não tinha fila).
    if ((settings as any)?.scheduleType === "queue") {
      const blocked = await handleOutOfHoursWacalls(
        whatsapp,
        ticket,
        contact,
        settings,
        queue.id
      );
      if (blocked) return;
    }



    // Escolher atendente aleatório (config "userRandom") — mesmo padrão já
    // usado no canal whatsapp_oficial (VerifyQueue.ts): distribui o ticket
    // pra um atendente da fila (ListUserQueueServices decide o critério —
    // menos pendentes no modo ORDENADO da fila, ou sorteio entre online no
    // modo padrão) em vez de deixar sem atendente até alguém puxar manual.
    // Roda ANTES dos passos de integração/Agente de IA abaixo de propósito:
    // a atribuição de atendente é independente de qual bot vai conversar
    // com o cliente em seguida.
    try {
      if ((settings as any)?.userRandom === "enabled") {
        const { default: ListUserQueueServices } = await import("../UserQueueServices/ListUserQueueServices");
        const userQueue = await ListUserQueueServices(queue.id);
        if (userQueue?.userId > -1) {
          const { default: UpdateTicketService } = await import("../TicketServices/UpdateTicketService");
          await UpdateTicketService({
            ticketData: { userId: userQueue.userId },
            ticketId: ticket.id,
            companyId
          });
          await ticket.reload();
        }
      }
    } catch (err: any) {
      logger.error(`[wacalls bot] Falha ao atribuir atendente aleatório (fila ${queue.id}): ${err?.message}`);
    }

    if ((queue as any).integrationId) {
      const handled = await tryHandleIntegration(
        (queue as any).integrationId,
        companyId,
        msg,
        ticket,
        true
      );
      if (handled) return;
    }

    // Agente de IA vinculado à fila (Queue.promptId ou Prompt.queueId) —
    // mesmo helper channel-agnostic (ApplyQueueAiAgent) usado por
    // baileys/whatsapp_oficial. Se aplicado, manda a "Mensagem Inicial" do
    // agente (se configurada) em vez da saudação estática da fila — as duas
    // juntas duplicariam a primeira mensagem.
    const startedAi = await ApplyQueueAiAgent(queue, ticket);
    if (startedAi) {
      const { sendAiAgentInitialIfNoQueueGreeting } = await import("../WbotServices/wbotMessageListener");
      await sendAiAgentInitialIfNoQueueGreeting(queue as any, ticket, contact);
      return;
    }

    await sendQueueGreeting(ticket, whatsapp, queue.id);

    // Mensagem com a posição na fila (config "sendQueuePosition") — mesmo
    // critério/texto do Baileys (wbotMessageListener.ts:1952/2377): conta
    // quantos tickets pendentes e sem atendente essa fila já tem (excluindo
    // grupos) e manda "<sendQueuePositionMessage> N". Só faz sentido pra
    // fila SEM submenu de chatbots (igual a condição `!choosenQueue.chatbots.length`
    // do original) — com submenu, o próximo passo é escolher uma opção, não
    // esperar na fila.
    const hasChatbotSubmenu = Array.isArray((queue as any).chatbots) && (queue as any).chatbots.length > 0;
    if ((settings as any)?.sendQueuePosition === "enabled" && !hasChatbotSubmenu) {
      try {
        const count = await Ticket.findAndCountAll({
          where: {
            userId: null,
            status: "pending",
            companyId,
            queueId: queue.id,
            isGroup: false
          }
        });
        const qtd = count.count === 0 ? 1 : count.count;
        const msgFila = `${(settings as any)?.sendQueuePositionMessage || ""} *${qtd}*`;
        const bodyFila = formatBody(msgFila, ticket);
        const { SendWacallsText } = await import("./SendWacallsMessageService");
        await SendWacallsText({ body: bodyFila, ticket });
      } catch (err: any) {
        logger.error(`[wacalls bot] Falha ao enviar posição da fila (fila ${queue.id}): ${err?.message}`);
      }
    }
  };

  if (queues.length === 0) {
    if (!ticketTraking.chatbotAt) {
      await sendConnectionGreeting(ticket, whatsapp);
      await ticketTraking.update({ chatbotAt: moment().toDate() });
    }
    return;
  }

  if (queues.length === 1) {
    if (!ticketTraking.chatbotAt) {
      const settings = await FindCompanySettingsService({ companyId });
      const sendGreetingMessageOneQueues =
        (settings as any)?.sendGreetingMessageOneQueues === "enabled";
      if (sendGreetingMessageOneQueues) {
        await sendConnectionGreeting(ticket, whatsapp, { queue: queues[0].name });
      }
      await assignQueue(queues[0]);
      await ticketTraking.update({ chatbotAt: moment().toDate() });
    }
    return;
  }

  // 2+ filas
  if (ticket.queueId) return;

  if (ticketTraking.chatbotAt) {
    const trimmed = String(body || "").trim().toLowerCase();
    if (["sair", "exit", "0"].includes(trimmed)) {
      await ticket.update({ status: "closed", amountUsedBotQueues: 0 });
      await ticketTraking.update({ chatbotAt: null });
      return;
    }
    if (trimmed === "#") {
      await sendGreetingWithQueueMenu(ticket, whatsapp, queues);
      return;
    }
    const idx = parseInt(trimmed, 10) - 1;
    const chosen = Number.isFinite(idx) ? queues[idx] : undefined;
    if (chosen) {
      await assignQueue(chosen);
      return;
    }
    // opção inválida — reenvia o menu
    await sendGreetingWithQueueMenu(ticket, whatsapp, queues);
    return;
  }

  // primeiro contato — saudação + menu
  await sendGreetingWithQueueMenu(ticket, whatsapp, queues);
  await ticketTraking.update({ chatbotAt: moment().toDate() });
};

/**
 * Ponto de entrada único, chamado por HandleWacallsIncoming.ts logo depois
 * de persistir a mensagem recebida. Sequência (espelhando a ordem de
 * prioridade usada no pipeline Baileys, ver wbotMessageListener.ts):
 *   1) NPS em andamento
 *   2) Agente de IA (Prompt) já vinculado ao ticket via FILA
 *      (ApplyQueueAiAgent) — continuação de uma escolha explícita e
 *      persistida, prioridade máxima
 *   3) Integração externa já vinculada ao ticket (continuação)
 *   4) Integração externa nova, vinculada à conexão
 *   5) FlowBuilder (palavra-chave / continuação de fluxo parado / fluxo de
 *      boas-vindas ou "não é frase" da conexão / campanhas) — tudo isso já
 *      dentro de flowbuilderIntegration/executeFlowBuilderKeywordTrigger.
 *      Checado ANTES do Agente de IA vinculado à conexão (passo 6) de
 *      propósito — ver comentário no passo 6 abaixo.
 *   6) Agente de IA (Prompt) vinculado diretamente à CONEXÃO
 *      (whatsapp.promptId) — reavaliado a cada mensagem, sem persistir nada
 *      no ticket (mesmo padrão do bloco "openai na conexão" do Baileys)
 *   7) Fallback: roteamento de fila (verifyQueueWacalls)
 */
export const handleWacallsBotFlow = async (
  whatsapp: Whatsapp,
  ticket: Ticket,
  contact: Contact,
  ticketTraking: TicketTraking | null,
  ev: WacallsIncoming
): Promise<void> => {
  try {
    if (ev.fromMe || ticket.isGroup || (ticket as any).imported) return;

    await ticket.reload();
    const hasActiveFlowBuilder = Boolean(
      ticket.flowWebhook ||
      ticket.flowStopped ||
      ticket.lastFlowId ||
      (ticket.dataWebhook as any)?.waitingInput ||
      (ticket.dataWebhook as any)?.inputVariableName
    );
    if (ticket.status === "open" && !hasActiveFlowBuilder) return; // já com atendente humano

    const companyId = whatsapp.companyId;

    const body =
      ev.type === "text" ? (ev.text || "") : (ev.caption || "");

    // Mensagem de voz recebida — repassado pro Agente de IA decidir se
    // transcreve (depende da config transcribeAudio do Prompt). O resto do
    // pipeline (FlowBuilder/integração externa) não usa isso, só o texto/
    // legenda igual antes.
    const isIncomingAudio = ["audio", "ptt", "voice", "audioMessage"].includes(String(ev.type || ""));
    const incomingAudio =
      isIncomingAudio && ev.mediaUrl
        ? { mediaUrl: ev.mediaUrl, mimetype: ev.mimetype, wid: ev.id }
        : undefined;

    // 0) Consentimento LGPD (config "enableLGPD") — intercepta ANTES de
    // qualquer outro passo do bot, igual ao Baileys (wbotMessageListener.ts,
    // bloco "TRATAMENTO LGPD"). Só entra quando o ticket já está no status
    // "lgpd" (definido em FindOrCreateTicketService — código compartilhado
    // entre canais, já cobre wacalls) e ainda não foi aceito.
    const settings = await FindCompanySettingsService({ companyId });
    if (
      settings?.enableLGPD === "enabled" &&
      ticket.status === "lgpd" &&
      isNil((ticket as any).lgpdAcceptedAt)
    ) {
      const consumed = await handleLgpdWacalls(whatsapp, ticket, contact, settings, body);
      if (consumed) return;
    }

    // 1) NPS em andamento
    if (
      ticket.status === "nps" &&
      ticketTraking &&
      verifyRating(ticketTraking)
    ) {
      await handleNpsWacalls(whatsapp, ticket, ticketTraking, contact, body);
      return;
    }

    // 1.5) Fora do expediente — depois de LGPD/NPS (que são fluxos já em
    // andamento e precisam ser concluídos) e ANTES de qualquer coisa que
    // "atenda" o cliente (fila, saudação, integração, agente de IA). Sem
    // isso o WhatsApp Plus respondia normalmente 24h, ignorando a escala.
    if (await handleOutOfHoursWacalls(whatsapp, ticket, contact, settings)) {
      return;
    }

    // Resume de nó Input do FlowBuilder — precisa vir ANTES de qualquer
    // outro passo, senão fluxos com dois Inputs em sequência travam no
    // primeiro (o segundo Input nunca chega a ser processado).
    try {
      const { tryResumeFlowInput } = await import("../WebhookService/ResumeFlowInput");
      const resumed = await tryResumeFlowInput(whatsapp.id, ticket, contact, body);
      if (resumed) return;
    } catch (e: any) {
      logger.error(`[WACALLS BOT] Falha ao resumir input do FlowBuilder: ${e?.message}`);
    }

    const msg = buildSyntheticMsg(ev, contact, body);

    // 2) Agente de IA (Prompt) já vinculado ao ticket via FILA
    // (ApplyQueueAiAgent) — continuação de uma conversa em andamento. Essa
    // persistência é uma escolha explícita e deliberada (fila → agente),
    // diferente do agente vinculado direto à conexão (passo 6), então tem
    // prioridade máxima aqui, igual ao pipeline do Baileys.
    if (
      !ticket.userId &&
      !ticket.isGroup &&
      !isNil(ticket.promptId)
    ) {
      await handleWacallsAiAgent(ticket, contact, body, { incomingAudio });
      return;
    }

    // 3) Integração externa já vinculada ao ticket — continuação
    if (
      !ticket.userId &&
      !ticket.isGroup &&
      ticket.integrationId &&
      ticket.useIntegration
    ) {
      await tryHandleIntegration(ticket.integrationId, companyId, msg, ticket, false);
      return;
    }

    // 4) Integração externa nova, vinculada diretamente à conexão
    if (
      !ticket.isGroup &&
      !ticket.queueId &&
      !ticket.userId &&
      !ticket.useIntegration &&
      (whatsapp as any).integrationId
    ) {
      const handled = await tryHandleIntegration(
        (whatsapp as any).integrationId,
        companyId,
        msg,
        ticket,
        true
      );
      if (handled) return;
      // dialogflow pulado → cai pro Agente de IA/FlowBuilder/fila abaixo
    }

    // 5) FlowBuilder — palavra-chave / continuação de fluxo em andamento /
    // boas-vindas / campanhas. flowbuilderIntegration cobre tudo isso
    // internamente (ver arquivo wbotMessageListener.ts) e é seguro chamar
    // com wbot=null. Checado ANTES do Agente de IA vinculado à conexão
    // (passo 6) de propósito, espelhando a ordem de prioridade do Baileys
    // (lá a continuação/andamento de fluxo é resolvida antes do bloco
    // "openai na conexão"). Antes o Agente de IA era checado primeiro E
    // fixado permanentemente no ticket (ticket.update promptId/
    // useIntegration) — isso tornava qualquer fluxo configurado na mesma
    // conexão inalcançável pro resto da vida do ticket assim que o agente
    // respondesse a primeira mensagem, exatamente o bug relatado ("com o
    // fluxo avança uma pergunta a mais e volta pro fluxo inicial").
    // A condição "!ticket.queueId" existe para NÃO INICIAR um fluxo num ticket
    // que já foi roteado para uma fila. Faz sentido para começar — mas estava
    // impedindo também a CONTINUAÇÃO de um fluxo já em andamento, e era esse o
    // motivo de o chatbot não passar do primeiro menu no WhatsApp Plus.
    //
    // A sequência do defeito, vista no log da VPS:
    //
    //   1. O nó de menu envia as opções e salva no ticket
    //      { queueId: 1, flowStopped: "20", flowWebhook: true, lastFlowId: ... }
    //      — repare que ele mesmo grava a FILA junto.
    //   2. O cliente responde "1".
    //   3. Aqui, "!ticket.queueId" agora é FALSO (a fila 1 está gravada), então
    //      este bloco inteiro era pulado e o flowbuilderIntegration — que é
    //      quem sabe retomar um fluxo parado — nunca era chamado.
    //   4. Sem ninguém para consumir a resposta, o fluxo era reiniciado do
    //      começo por outro gatilho, com um hashFlowId NOVO, e o mesmo menu
    //      voltava a ser enviado. No log: duas execuções em 6 segundos, ambas
    //      parando no nó 20, com hashFlowId diferente.
    //
    // Agora: fila preenchida continua impedindo o INÍCIO de um fluxo novo, mas
    // não impede a continuação quando há fluxo em andamento (hasActiveFlowBuilder
    // já é calculado no topo desta função, a partir de flowWebhook / flowStopped
    // / lastFlowId / dataWebhook.waitingInput).
    if (
      !ticket.isGroup &&
      !ticket.userId &&
      (!ticket.queueId || hasActiveFlowBuilder) &&
      !ticket.useIntegration
    ) {
      if (ticket.queueId && hasActiveFlowBuilder) {
        logger.info(
          `[WACALLS BOT] Ticket ${ticket.id} tem fila ${ticket.queueId} E fluxo em andamento ` +
            `(flowStopped=${ticket.flowStopped}) — continuando o fluxo em vez de ignorar a resposta.`
        );
      }
      try {
        const handled = await flowbuilderIntegration(
          msg,
          null as any,
          companyId,
          null as any,
          ticket,
          contact,
          undefined,
          undefined
        );
        if (handled) return;
      } catch (e: any) {
        logger.error(`[WACALLS BOT] Falha ao processar FlowBuilder da conexão: ${e?.message}`);
      }
    }

    // 6) Agente de IA (Prompt) vinculado diretamente à conexão (sem fila,
    // integração ou fluxo envolvidos) — mesmo padrão do canal
    // whatsapp_oficial, porém SEM persistir promptId/useIntegration no
    // ticket (era isso que travava o ticket no agente pra sempre e tornava
    // o FlowBuilder inalcançável — ver comentário do passo 5). Reavaliado a
    // cada mensagem, igual o bloco equivalente do Baileys ("openai na
    // conexão").
    if (
      !ticket.isGroup &&
      !ticket.queueId &&
      !ticket.userId &&
      !ticket.useIntegration &&
      isNil(ticket.promptId) &&
      !isNil((whatsapp as any).promptId)
    ) {
      await handleWacallsAiAgent(ticket, contact, body, {
        promptIdOverride: (whatsapp as any).promptId,
        incomingAudio
      });
      return;
    }

    await ticket.reload();

    // 7) Fallback: saudação da conexão/fila + roteamento de fila (ou só a
    // saudação da conexão, se a conexão não tiver nenhuma fila configurada).
    if (
      !ticket.queueId &&
      !ticket.userId &&
      !ticket.useIntegration &&
      isNil(ticket.promptId) &&
      ticketTraking
    ) {
      await verifyQueueWacalls(whatsapp, ticket, contact, ticketTraking, msg, body);
    }
  } catch (err: any) {
    logger.error(`[WACALLS BOT] Erro inesperado no motor de bot (ticket ${ticket?.id}): ${err?.message}`);
  }
};

export default handleWacallsBotFlow;
