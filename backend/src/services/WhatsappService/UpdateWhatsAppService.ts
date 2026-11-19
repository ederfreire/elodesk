import * as Yup from "yup";
import { Op } from "sequelize";

import AppError from "../../errors/AppError";
import Whatsapp from "../../models/Whatsapp";
import { statusPorCredencial } from "./StatusCanalSemSessao";
import ShowWhatsAppService, { invalidateWhatsAppCache } from "./ShowWhatsAppService";
import AssociateWhatsappQueue from "./AssociateWhatsappQueue";
import logger from "../../utils/logger";

interface WhatsappData {
  timezone?: string;
  name?: string;
  status?: string;
  session?: string;
  isDefault?: boolean;
  greetingMessage?: string;
  complationMessage?: string;
  outOfHoursMessage?: string;
  queueIds?: number[];
  token?: string;
  maxUseBotQueues?: number;
  timeUseBotQueues?: string;
  expiresTicket?: string;
  allowGroup?: boolean;
  allowSignature?: boolean;
  sendIdQueue?: number;
  timeSendQueue?: number;
  timeInactiveMessage?: string;
  inactiveMessage?: string;
  ratingMessage?: string;
  maxUseBotQueuesNPS?: number;
  expiresTicketNPS?: number;
  whenExpiresTicket?: string;
  expiresInactiveMessage?: string;
  groupAsTicket?: string;
  importOldMessages?: string;
  importRecentMessages?: string;
  importOldMessagesGroups?: boolean;
  closedTicketsPostImported?: boolean;
  timeCreateNewTicket?: number;
  integrationId?: number;
  integrationTypeId?: number;
  schedules?: any[];
  promptId?: number;
  requestQR?: boolean;
  collectiveVacationMessage?: string;
  collectiveVacationStart?: string;
  collectiveVacationEnd?: string;
  queueIdImportMessages?: number;
  phone_number_id?: string;
  waba_id?: string;
  send_token?: string;
  business_id?: string;
  phone_number?: string;
  flowIdNotPhrase?: number;
  flowIdWelcome?: number;
  flowIdInactiveTime?: number;
  flowInactiveTime?: number;
  maxUseInactiveTime?: number;
  color?: string;
  timeToReturnQueue?: number;
  timeAwaitActiveFlowId?: number;
  timeAwaitActiveFlow?: number;
  triggerIntegrationOnClose?: boolean;
  wavoip?: string;
  receiveComments?: boolean;
  isActive?: boolean;
  zapiInstanceId?: string;
  zapiToken?: string;
  zapiClientToken?: string;
  wacallsVoiceFlowId?: string;
  webchatConfig?: any;
}

interface Request {
  whatsappData: WhatsappData;
  whatsappId: string;
  companyId: number;
}

interface Response {
  whatsapp: Whatsapp;
  oldDefaultWhatsapp: Whatsapp | null;
}

const UpdateWhatsAppService = async ({
  whatsappData,
  whatsappId,
  companyId
}: Request): Promise<Response> => {
  const schema = Yup.object().shape({
    name: Yup.string().min(2),
    status: Yup.string(),
    isDefault: Yup.boolean()
  });

  const {
    name,
    status,
    isDefault,
    session,
    greetingMessage,
    complationMessage,
    outOfHoursMessage,
    queueIds = [],
    token,
    maxUseBotQueues = 0,
    timeUseBotQueues = 0,
    expiresTicket = 0,
    allowGroup,
    allowSignature,
    timeSendQueue = 0,
    sendIdQueue = null,
    timeInactiveMessage = 0,
    inactiveMessage,
    ratingMessage,
    maxUseBotQueuesNPS,
    expiresTicketNPS = 0,
    whenExpiresTicket,
    expiresInactiveMessage,
    groupAsTicket,
    importOldMessages,
    importRecentMessages,
    closedTicketsPostImported,
    importOldMessagesGroups,
    timeCreateNewTicket = null,
    integrationId,
    integrationTypeId,
    schedules,
    promptId,
    requestQR = false,
    collectiveVacationEnd,
    collectiveVacationMessage,
    collectiveVacationStart,
    queueIdImportMessages,
    flowIdNotPhrase,
    flowIdWelcome,
    flowIdInactiveTime,
    flowInactiveTime,
    maxUseInactiveTime,
    color,
    phone_number_id,
    waba_id,
    send_token,
    business_id,
    phone_number,
    timeToReturnQueue = 0,
    timeAwaitActiveFlowId,
    timeAwaitActiveFlow = 0,
    triggerIntegrationOnClose,
    wavoip,
    receiveComments,
    zapiInstanceId,
    zapiToken,
    zapiClientToken,
    wacallsVoiceFlowId,
    webchatConfig,
    isActive,
    timezone
  } = whatsappData;

  // URA de voz: só uma URA desta empresa pode ser vinculada à conexão.
  if (wacallsVoiceFlowId) {
    const { garantirDaEmpresa } = await import("../WacallsServices/UrasDaEmpresa");
    try {
      await garantirDaEmpresa(companyId, String(wacallsVoiceFlowId));
    } catch {
      throw new AppError("A URA escolhida não existe nesta empresa.", 400);
    }
  }

  try {
    await schema.validate({ name, status, isDefault });
  } catch (err: any) {
    throw new AppError(err.message);
  }

  if (queueIds.length > 1 && !greetingMessage) {
    throw new AppError("ERR_WAPP_GREETING_REQUIRED");
  }

  let oldDefaultWhatsapp: Whatsapp | null = null;

  if (isDefault) {
    oldDefaultWhatsapp = await Whatsapp.findOne({
      where: {
        isDefault: true,
        id: { [Op.not]: whatsappId },
        companyId
      }
    });
    if (oldDefaultWhatsapp) {
      await oldDefaultWhatsapp.update({ isDefault: false });
    }
  }
  const whatsapp = await ShowWhatsAppService(whatsappId, companyId);

  // DEBUG - Log dos dados antes da atualização

  // Canal sem sessão (API Oficial): o status vem das credenciais, não de um
  // socket que nunca existe. Sem isto a conexão fica eternamente
  // "CONECTANDO" no card, mesmo enviando e recebendo normalmente.
  const statusSemSessao = statusPorCredencial({
    channel: whatsapp.channel,
    phone_number_id,
    send_token
  });

  await whatsapp.update({
    name,
    ...(timezone !== undefined ? { timezone } : {}),
    status: statusSemSessao || status,
    ...(statusSemSessao === "CONNECTED" ? { retries: 0 } : {}),
    session,
    greetingMessage,
    complationMessage,
    outOfHoursMessage,
    isDefault,
    companyId,
    token,
    maxUseBotQueues: maxUseBotQueues || 0,
    timeUseBotQueues: timeUseBotQueues || 0,
    expiresTicket: expiresTicket || 0,
    allowGroup,
    allowSignature: allowSignature !== undefined ? allowSignature : whatsapp.allowSignature,
    timeSendQueue,
    sendIdQueue,
    timeInactiveMessage,
    inactiveMessage,
    ratingMessage,
    maxUseBotQueuesNPS,
    expiresTicketNPS,
    whenExpiresTicket,
    expiresInactiveMessage,
    groupAsTicket,
    importOldMessages,
    importRecentMessages,
    closedTicketsPostImported,
    importOldMessagesGroups,
    timeCreateNewTicket,
    integrationId,
    integrationTypeId,
    schedules,
    promptId,
    collectiveVacationEnd,
    collectiveVacationMessage,
    collectiveVacationStart,
    queueIdImportMessages,
    flowIdNotPhrase,
    flowIdWelcome,
    flowIdInactiveTime,
    flowInactiveTime,
    maxUseInactiveTime,
    color,
    phone_number_id,
    waba_id,
    send_token,
    business_id,
    phone_number,
    timeToReturnQueue,
    timeAwaitActiveFlowId,
    timeAwaitActiveFlow,
    triggerIntegrationOnClose,
    wavoip,
    receiveComments,
    zapiInstanceId,
    zapiToken,
    zapiClientToken,
    ...(wacallsVoiceFlowId !== undefined ? { wacallsVoiceFlowId } : {}),
    ...(webchatConfig !== undefined ? { webchatConfig } : {}),
    ...(isActive !== undefined ? { isActive } : {})
  });

  if (!requestQR) {
    await AssociateWhatsappQueue(whatsapp, queueIds);
  }

  // URA de voz: empurra o fluxo escolhido pra sessão do wacalls-chat.
  //
  // Sem isso o motor de URA (que já existe no microserviço) nunca é
  // acionado — a sessão fica sem flowId e a ligação toca direto pro
  // atendente. Best-effort: microserviço fora do ar não pode impedir a
  // conexão de ser salva.
  if (whatsapp.channel === "wacalls") {
    try {
      const { aplicarUraNaSessao } = await import(
        "../WacallsServices/WacallsVoiceFlowService"
      );
      await aplicarUraNaSessao(whatsapp);
    } catch (err: any) {
      logger.warn(`[URA] não consegui aplicar o fluxo na conexão ${whatsapp.id}: ${err?.message}`);
    }
  }

  // ✅ Invalidar cache após atualização
  invalidateWhatsAppCache(whatsappId, companyId);

  return { whatsapp, oldDefaultWhatsapp };
};

export default UpdateWhatsAppService;
