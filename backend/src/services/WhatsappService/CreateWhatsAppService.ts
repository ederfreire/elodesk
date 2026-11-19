import * as Yup from "yup";
import { v4 as uuidv4 } from "uuid";

import AppError from "../../errors/AppError";
import Whatsapp from "../../models/Whatsapp";
import { statusPorCredencial } from "./StatusCanalSemSessao";
import Company from "../../models/Company";
import Plan from "../../models/Plan";
import AssociateWhatsappQueue from "./AssociateWhatsappQueue";

interface Request {
  name: string;
  companyId: number;
  timezone?: string;
  queueIds?: number[];
  greetingMessage?: string;
  complationMessage?: string;
  outOfHoursMessage?: string;
  ratingMessage?: string;
  status?: string;
  isDefault?: boolean;
  token?: string;
  provider?: string;
  facebookUserId?: string;
  facebookUserToken?: string;
  tokenMeta?: string;
  channel?: string;
  facebookPageUserId?: string;
  maxUseBotQueues?: string;
  timeUseBotQueues?: string;
  expiresTicket?: number;
  allowGroup?: boolean;
  allowSignature?: boolean;
  sendIdQueue?: number;
  timeSendQueue?: number;
  timeInactiveMessage?: string;
  inactiveMessage?: string;
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
  collectiveVacationMessage?: string;
  collectiveVacationStart?: string;
  collectiveVacationEnd?: string;
  queueIdImportMessages?: number;
  phone_number_id?: string;
  waba_id?: string;
  send_token?: string;
  business_id?: string;
  phone_number?: string;
  waba_webhook?: string;
  flowIdNotPhrase?: number;
  flowIdWelcome?: number;
  color?: string;
  flowIdInactiveTime?: number;
  flowInactiveTime?: number;
  maxUseInactiveTime?: number;
  timeToReturnQueue?: number;
  timeAwaitActiveFlowId?: number;
  timeAwaitActiveFlow?: number;
  triggerIntegrationOnClose?: boolean;
  wavoip?: string;
  zapiInstanceId?: string;
  zapiToken?: string;
  zapiClientToken?: string;
  webchatConfig?: any;
  // URA de voz vinculada à conexão (WhatsApp Plus). Aceito já na
  // criação porque a tela de Conexões manda o formulário inteiro tanto
  // ao criar quanto ao editar.
  wacallsVoiceFlowId?: string;
}

interface Response {
  whatsapp: Whatsapp;
  oldDefaultWhatsapp: Whatsapp | null;
}

const CreateWhatsAppService = async ({
  name,
  timezone,
  status = "OPENING",
  queueIds = [],
  greetingMessage,
  complationMessage,
  outOfHoursMessage,
  isDefault = false,
  companyId,
  token = "",
  provider = "beta",
  facebookUserId,
  facebookUserToken,
  facebookPageUserId,
  tokenMeta,
  channel = "whatsapp",
  maxUseBotQueues,
  timeUseBotQueues,
  expiresTicket,
  allowGroup = false,
  allowSignature = true,
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
  wacallsVoiceFlowId,
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
  phone_number_id,
  waba_id,
  send_token,
  business_id,
  phone_number,
  waba_webhook,
  flowIdNotPhrase,
  flowIdWelcome,
  flowIdInactiveTime,
  flowInactiveTime,
  maxUseInactiveTime,
  color,
  timeToReturnQueue,
  timeAwaitActiveFlowId,
  timeAwaitActiveFlow,
  triggerIntegrationOnClose,
  wavoip,
  zapiInstanceId,
  zapiToken,
  zapiClientToken,
  webchatConfig
}: Request): Promise<Response> => {
  const company = await Company.findOne({
    where: {
      id: companyId
    },
    include: [{ model: Plan, as: "plan" }]
  });

  if (company !== null) {
    const whatsappCount = await Whatsapp.count({
      where: {
        companyId,
        channel: channel
      }
    });

    if (whatsappCount >= company.plan.connections) {
      throw new AppError(
        `Número máximo de conexões já alcançado: ${whatsappCount}`
      );
    }
  }

  const schema = Yup.object().shape({
    name: Yup.string()
      .required("ERR_WAPP_NAME_REQUIRED")
      .min(2, "ERR_WAPP_INVALID_NAME")
      .test(
        "Check-name",
        "Esse nome já está sendo utilizado por outra conexão",
        async value => {
          if (!value) return false;
          const nameExists = await Whatsapp.findOne({
            where: { name: value, channel: channel, companyId }
          });
          return !nameExists;
        }
      ),
    isDefault: Yup.boolean().required()
  });

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

  const whatsappFound = await Whatsapp.findOne({ where: { companyId } });

  isDefault = channel === "whatsapp" ? !whatsappFound : false;

  let oldDefaultWhatsapp: Whatsapp | null = null;

  if (channel === "whatsapp" && isDefault) {
    oldDefaultWhatsapp = await Whatsapp.findOne({
      where: { isDefault: true, companyId, channel: channel }
    });
    if (oldDefaultWhatsapp) {
      await oldDefaultWhatsapp.update({ isDefault: false, companyId });
    }
  }

  if (queueIds.length > 1 && !greetingMessage) {
    throw new AppError("ERR_WAPP_GREETING_REQUIRED");
  }

  if (token !== null && token !== "") {
    const tokenSchema = Yup.object().shape({
      token: Yup.string()
        .required()
        .min(2)
        .test(
          "Check-token",
          "This whatsapp token is already used.",
          async value => {
            if (!value) return false;
            const tokenExists = await Whatsapp.findOne({
              where: { token: value, channel: channel }
            });
            return !tokenExists;
          }
        )
    });

    try {
      await tokenSchema.validate({ token });
    } catch (err: any) {
      throw new AppError(err.message);
    }
  }

  // Fuso do expediente da conexão: usa o informado; senão herda o da empresa
  // (que por sua vez foi definido no cadastro). Assim um cliente fora do Brasil
  // não precisa reconfigurar o fuso em cada conexão.
  let resolvedTimezone = timezone || null;
  if (!resolvedTimezone) {
    try {
      const comp = await Company.findByPk(companyId);
      resolvedTimezone = (comp as any)?.timezone || null;
    } catch (e) {
      resolvedTimezone = null;
    }
  }

  const whatsapp = await Whatsapp.create(
    {
      name,
      timezone: resolvedTimezone || "America/Sao_Paulo",
      status:
        channel === "webchat"
          ? "CONNECTED"
          : statusPorCredencial({ channel, phone_number_id, send_token }) ||
            status,
      greetingMessage,
      complationMessage,
      outOfHoursMessage,
      ratingMessage,
      isDefault,
      companyId,
      token,
      provider,
      channel,
      facebookUserId,
      facebookUserToken,
      facebookPageUserId,
      tokenMeta,
      maxUseBotQueues,
      timeUseBotQueues,
      expiresTicket,
      allowGroup,
      allowSignature,
      timeSendQueue,
      sendIdQueue,
      timeInactiveMessage,
      inactiveMessage,
      maxUseBotQueuesNPS,
      expiresTicketNPS,
      whenExpiresTicket,
      expiresInactiveMessage,
      groupAsTicket,
      wacallsVoiceFlowId,
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
      phone_number_id,
      waba_id,
      send_token,
      business_id,
      phone_number,
      waba_webhook,
      flowIdNotPhrase,
      flowIdWelcome,
      flowIdInactiveTime,
      flowInactiveTime,
      maxUseInactiveTime,
      color,
      timeToReturnQueue,
      timeAwaitActiveFlowId,
      timeAwaitActiveFlow,
      triggerIntegrationOnClose,
      wavoip,
      zapiInstanceId,
      zapiToken,
      zapiClientToken,
      webchatToken: channel === "webchat" ? uuidv4() : undefined,
      webchatConfig: channel === "webchat" ? (webchatConfig || {}) : undefined
    },
    { include: ["queues", "company"] }
  );

  await AssociateWhatsappQueue(whatsapp, queueIds);

  return { whatsapp, oldDefaultWhatsapp };
};

export default CreateWhatsAppService;
