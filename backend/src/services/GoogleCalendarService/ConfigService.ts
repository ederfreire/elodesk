import GoogleCalendarIntegration from "../../models/GoogleCalendarIntegration";

export const GetConfig = async (companyId: number) => {
  const integration = await GoogleCalendarIntegration.findOne({ where: { companyId } });
  if (!integration) return null;
  return {
    id: integration.id,
    googleEmail: integration.googleEmail,
    calendarId: integration.calendarId,
    defaultDuration: integration.defaultDuration,
    timezone: integration.timezone,
    isActive: integration.isActive,
    connected: !!integration.accessToken,
    // Preferências que a tela de Agendamento herda ao abrir um agendamento
    // novo. Sem devolvê-las aqui, o modal não teria como saber se deve vir
    // com "Sincronizar" e "Gerar Meet" já ligados.
    autoMeet: integration.autoMeet,
    syncEvents: integration.syncEvents,
    sendInvite: integration.sendInvite
  };
};

export const UpdateConfig = async (
  companyId: number,
  data: Partial<{
    calendarId: string;
    defaultDuration: number;
    timezone: string;
    isActive: boolean;
    autoMeet: boolean;
    syncEvents: boolean;
    sendInvite: boolean;
  }>
) => {
  const integration = await GoogleCalendarIntegration.findOne({ where: { companyId } });
  if (!integration) throw new Error("Integração não conectada.");
  await integration.update(data);
  return GetConfig(companyId);
};

export const Disconnect = async (companyId: number) => {
  await GoogleCalendarIntegration.destroy({ where: { companyId } });
};
