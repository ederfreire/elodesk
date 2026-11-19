import Queue from "../models/Queue";
import Company from "../models/Company";
import User from "../models/User";
import authConfig from "../config/auth";
import { createAccessToken } from "./CreateTokens";

interface SerializedUser {
  id: number;
  name: string;
  email: string;
  profile: string;
  companyId: number;
  company: Company | null;
  super: boolean;
  queues: Queue[];
  startWork: string;
  endWork: string;
  allTicket: string;
  whatsappId: number;
  whatsapps: any[];
  profileImage: string;
  defaultTheme: string;
  defaultMenu: string;
  allHistoric: string;
  allUserChat?: string;
  defaultTicketsManagerWidth?: number;
  userClosePendingTicket?: string;
  showDashboard?: string;
  token?: string;
  allowGroup: boolean;
  allowRealTime: string;
  allowConnections: string;
  allowSeeMessagesInPendingTickets: string;
  finalizacaoComValorVendaAtiva: boolean;
  showContacts: string;
  showCampaign: string;
  showFlow: string;
  showReturnQueueButton: string;
  showTransferTicketButton: string;
  showSchedules: string;
  showKanban: string;
  showInternalChat: string;
  showOpenAi: string;
  showIntegrations: string;
  notifyPendingTicketWhatsapp?: string;
  whatsappNumber?: string;
  pendingTicketNotificationMessage?: string;
  acceptanceMessage?: string;
  notifyOpenTicketWhatsapp?: string;
  notifyKanbanTicketWhatsapp?: string;
  notificationMaxCount?: number;
  notificationIntervalMinutes?: number;
  notificationWhatsappId?: number | null;
}

export const SerializeUser = async (user: User): Promise<SerializedUser> => {
  return {
    id: user.id,
    name: user.name,
    email: user.email,
    profile: user.profile,
    companyId: user.companyId,
    company: user.company,
    super: user.super,
    queues: user.queues,
    startWork: user.startWork,
    endWork: user.endWork,
    allTicket: user.allTicket,
    whatsappId: user.whatsappId,
    whatsapps: user.whatsapps || [],
    profileImage: user.profileImage,
    defaultTheme: user.defaultTheme,
    defaultMenu: user.defaultMenu,
    allHistoric: user.allHistoric,
    allUserChat: user.allUserChat,
    userClosePendingTicket: user.userClosePendingTicket,
    showDashboard: user.showDashboard,
    token: createAccessToken(user),
    allowGroup: user.allowGroup,
    allowRealTime: user.allowRealTime,
    allowSeeMessagesInPendingTickets: user.allowSeeMessagesInPendingTickets || "enabled",
    allowConnections: user.allowConnections,
    finalizacaoComValorVendaAtiva: user.finalizacaoComValorVendaAtiva,
    showContacts: user.showContacts,
    showCampaign: user.showCampaign,
    showFlow: user.showFlow,
    showReturnQueueButton: user.showReturnQueueButton,
    showTransferTicketButton: user.showTransferTicketButton,
    showSchedules: user.showSchedules,
    showKanban: user.showKanban,
    showInternalChat: user.showInternalChat,
    showOpenAi: user.showOpenAi,
    showIntegrations: user.showIntegrations,
    notifyPendingTicketWhatsapp: user.notifyPendingTicketWhatsapp || "disabled",
    whatsappNumber: user.whatsappNumber || "",
    pendingTicketNotificationMessage: user.pendingTicketNotificationMessage || "",
    acceptanceMessage: user.acceptanceMessage || "",
    notifyOpenTicketWhatsapp: user.notifyOpenTicketWhatsapp || "disabled",
    notifyKanbanTicketWhatsapp: user.notifyKanbanTicketWhatsapp || "disabled",
    notificationMaxCount: user.notificationMaxCount ?? 1,
    notificationIntervalMinutes: user.notificationIntervalMinutes ?? 0,
    notificationWhatsappId: user.notificationWhatsappId ?? null
  };
};
