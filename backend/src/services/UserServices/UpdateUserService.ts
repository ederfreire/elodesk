// src/services/UserServices/UpdateUserService.ts - ATUALIZADO COM NOVA COLUNA
import * as Yup from "yup";

import AppError from "../../errors/AppError";
import ShowUserService from "./ShowUserService";
import Company from "../../models/Company";
import User from "../../models/User";
import { Op } from "sequelize";


interface UserData {
  email?: string;
  password?: string;
  name?: string;
  profile?: string;
  companyId?: number;
  queueIds?: number[];
  startWork?: string;
  endWork?: string;
  farewellMessage?: string;
  acceptanceMessage?: string;
  whatsappId?: number;
  whatsappIds?: number[];
  allTicket?: string;
  defaultTheme?: string;
  defaultMenu?: string;
  internalExtension?: string;
  allowGroup?: boolean;
  allHistoric?: string;
  allUserChat?: string;
  userClosePendingTicket?: string;
  showDashboard?: string;
  defaultTicketsManagerWidth?: number;
  allowRealTime?: string;
  allowConnections?: string;
  showContacts?: string;
  showCampaign?: string;
  showFlow?: string;
  showSchedules?: string;
  showKanban?: string;
  showInternalChat?: string;
  showOpenAi?: string;
  showIntegrations?: string;
  profileImage?: string;
  finalizacaoComValorVendaAtiva?: boolean;
  birthDate?: Date | string;
  allowSeeMessagesInPendingTickets?: string;
  showReturnQueueButton?: string;
  showTransferTicketButton?: string;
  language?: string;
  timezone?: string;
  notifyPendingTicketWhatsapp?: string;
  whatsappNumber?: string;
  pendingTicketNotificationMessage?: string;
  notifyOpenTicketWhatsapp?: string;
  notifyKanbanTicketWhatsapp?: string;
  notificationMaxCount?: number;
  notificationIntervalMinutes?: number;
  notificationWhatsappId?: number | null;
}

interface Request {
  userData: UserData;
  userId: string | number;
  companyId: number;
  requestUserId: number;
}

interface Response {
  id: number;
  name: string;
  email: string;
  profile: string;
}

const UpdateUserService = async ({
  userData,
  userId,
  companyId,
  requestUserId
}: Request): Promise<Response | undefined> => {
  const user = await ShowUserService(userId, companyId);

  const requestUser = await User.findByPk(requestUserId);

  if (requestUser.super === false && userData.companyId !== companyId) {
    throw new AppError("O usuário não pertence à esta empresa");
  }

  const schema = Yup.object().shape({
    name: Yup.string().min(2),
    allHistoric: Yup.string(),
    email: Yup.string().email(),
    profile: Yup.string(),
    password: Yup.string(),
    birthDate: Yup.date().nullable().max(new Date(), "Data de nascimento não pode ser no futuro"),
  });

  const oldUserEmail = user.email;

  const {
    email,
    password,
    profile,
    name,
    queueIds = [],
    startWork,
    endWork,
    farewellMessage,
    acceptanceMessage,
    whatsappId,
    whatsappIds = [],
    allTicket,
    defaultTheme,
    defaultMenu,
    internalExtension,
    allowGroup,
    allHistoric,
    allUserChat,
    userClosePendingTicket,
    showDashboard,
    allowConnections,
    defaultTicketsManagerWidth = 550,
    allowRealTime,
    showContacts,
    showCampaign,
    showFlow,
    showSchedules,
    showKanban,
    showInternalChat,
    showOpenAi,
    showIntegrations,
    profileImage,
    finalizacaoComValorVendaAtiva,
    birthDate,
    allowSeeMessagesInPendingTickets,
    showReturnQueueButton,
    showTransferTicketButton,
    language,
    timezone,
    notifyPendingTicketWhatsapp,
    whatsappNumber,
    pendingTicketNotificationMessage,
    notifyOpenTicketWhatsapp,
    notifyKanbanTicketWhatsapp,
    notificationMaxCount,
    notificationIntervalMinutes,
    notificationWhatsappId
  } = userData;

  

  

  try {
    await schema.validate({
      email,
      password,
      profile,
      name,
      birthDate
    });
  } catch (err: any) {
    throw new AppError(err.message);
  }

  // Processar data de nascimento
  let processedBirthDate: Date | null = user.birthDate;
  if (birthDate !== undefined) {
    if (birthDate === null || birthDate === '') {
      processedBirthDate = null;
    } else if (typeof birthDate === 'string') {
      const dateOnly = birthDate.split('T')[0];
      processedBirthDate = new Date(dateOnly + 'T12:00:00');
    } else if (birthDate instanceof Date) {
      const year = birthDate.getFullYear();
      const month = birthDate.getMonth();
      const day = birthDate.getDate();
      processedBirthDate = new Date(year, month, day, 12, 0, 0);
    }
  }

  // O ramal tem índice único por empresa. Sem esta checagem, repetir um
  // número já usado estourava a restrição do banco e a tela só mostrava uma
  // falha genérica — o usuário via "o ramal não salva" sem saber o motivo.
  if (internalExtension !== undefined) {
    const ramal = String(internalExtension || "").trim();
    if (ramal) {
      const jaUsado = await User.findOne({
        where: {
          companyId: user.companyId,
          internalExtension: ramal,
          id: { [Op.ne]: user.id }
        },
        attributes: ["id", "name"]
      });
      if (jaUsado) {
        throw new AppError(
          `O ramal ${ramal} já está em uso por ${jaUsado.name}.`,
          409
        );
      }
    }
  }

  await user.update({
    email,
    password,
    profile,
    name,
    startWork,
    endWork,
    farewellMessage,
    acceptanceMessage,
    whatsappId: whatsappId || null,
    allTicket,
    defaultTheme,
    defaultMenu,
    internalExtension: internalExtension === undefined ? user.internalExtension : (internalExtension || null),
    allowGroup,
    allHistoric,
    allUserChat,
    userClosePendingTicket,
    showDashboard,
    defaultTicketsManagerWidth,
    allowRealTime,
    profileImage,
    allowConnections,
    showContacts,
    showCampaign,
    showFlow,
    showSchedules,
    showKanban,
    showInternalChat,
    showOpenAi,
    showIntegrations,
    finalizacaoComValorVendaAtiva,
    birthDate: processedBirthDate,
    allowSeeMessagesInPendingTickets,
    showReturnQueueButton,
    showTransferTicketButton,
    language,
    timezone,
    notifyPendingTicketWhatsapp,
    whatsappNumber,
    pendingTicketNotificationMessage,
    notifyOpenTicketWhatsapp,
    notifyKanbanTicketWhatsapp,
    notificationMaxCount,
    notificationIntervalMinutes,
    notificationWhatsappId
  } as any);




  // Só mexe nas filas e conexões quando o pedido as traz. Antes, qualquer
  // atualização parcial (ex.: trocar o idioma pelo menu do usuário, que manda
  // só { language }) apagava as filas e as conexões do usuário.
  if ((userData as any).queueIds !== undefined) {
    await user.$set("queues", queueIds);
  }

  // Vincular múltiplas conexões WhatsApp
  if ((userData as any).whatsappIds !== undefined || (userData as any).whatsappId !== undefined) {
    const finalWhatsappIds = whatsappIds.length > 0 ? whatsappIds : (whatsappId ? [whatsappId] : []);
    await user.$set("whatsapps", finalWhatsappIds);
  }

  await user.reload();

  

  const normalizedCompanyId = Number(user.companyId);
  const company = Number.isInteger(normalizedCompanyId) && normalizedCompanyId > 0
    ? await Company.findByPk(normalizedCompanyId)
    : null;

  if (company && company.email === oldUserEmail) {
    await company.update({
      email,
      password
    });
  }

  const serializedUser = {
    id: user.id,
    name: user.name,
    email: user.email,
    profile: user.profile,
    companyId: user.companyId,
    company,
    queues: user.queues,
    whatsapps: user.whatsapps,
    whatsappId: user.whatsappId,
    startWork: user.startWork,
    endWork: user.endWork,
    greetingMessage: user.farewellMessage,
    acceptanceMessage: user.acceptanceMessage,
    allTicket: user.allTicket,
    defaultMenu: user.defaultMenu,
    internalExtension: user.internalExtension,
    defaultTheme: user.defaultTheme,
    allowGroup: user.allowGroup,
    allHistoric: user.allHistoric,
    userClosePendingTicket: user.userClosePendingTicket,
    showDashboard: user.showDashboard,
    defaultTicketsManagerWidth: user.defaultTicketsManagerWidth,
    allowRealTime: user.allowRealTime,
    allowConnections: user.allowConnections,
    showContacts: user.showContacts,
    showCampaign: user.showCampaign,
    profileImage: user.profileImage,
    showFlow: user.showFlow,
    showSchedules: user.showSchedules,
    showKanban: user.showKanban,
    showInternalChat: user.showInternalChat,
    showOpenAi: user.showOpenAi,
    showIntegrations: user.showIntegrations,
    finalizacaoComValorVendaAtiva: user.finalizacaoComValorVendaAtiva,
    birthDate: user.birthDate,
    allowSeeMessagesInPendingTickets: user.allowSeeMessagesInPendingTickets,
    showReturnQueueButton: user.showReturnQueueButton,
    showTransferTicketButton: user.showTransferTicketButton,
    language: user.language,
    timezone: user.timezone,
    notifyPendingTicketWhatsapp: user.notifyPendingTicketWhatsapp,
    whatsappNumber: user.whatsappNumber,
    pendingTicketNotificationMessage: user.pendingTicketNotificationMessage,
    notifyOpenTicketWhatsapp: user.notifyOpenTicketWhatsapp,
    notifyKanbanTicketWhatsapp: user.notifyKanbanTicketWhatsapp,
    notificationMaxCount: user.notificationMaxCount,
    notificationIntervalMinutes: user.notificationIntervalMinutes,
    notificationWhatsappId: user.notificationWhatsappId
  };

  return serializedUser;
};

export default UpdateUserService;