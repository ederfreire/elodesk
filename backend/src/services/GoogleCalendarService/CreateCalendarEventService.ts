import getAuthenticatedClient from "./getAuthenticatedClient";
import { ensureGoogleLib } from "./oauthClient";

export interface CreateEventParams {
  companyId: number;
  summary: string;
  description?: string;
  startISO: string;       // ISO 8601 (com timezone)
  endISO?: string;        // se ausente, calcula a partir de durationMinutes
  durationMinutes?: number;
  attendees?: string[];   // e-mails
  calendarId?: string;    // override; default = configuração da empresa
  timezone?: string;      // override; default = configuração da empresa
  /**
   * Cria uma sala do Google Meet junto com o evento.
   *
   * Antes esta função só LIA o `hangoutLink` da resposta — mas o Google nunca
   * devolvia um, porque ninguém pedia. Para o Meet ser criado é preciso
   * mandar `conferenceData.createRequest` E `conferenceDataVersion: 1` na
   * chamada; sem os dois, a API ignora o pedido em silêncio.
   */
  withMeet?: boolean;
  /**
   * Manda (ou não) convite por e-mail aos participantes. Antes era decidido
   * sozinho pela existência de `attendees`, o que tirava a escolha da
   * empresa.
   */
  sendInvites?: boolean;
}

const CreateCalendarEventService = async (params: CreateEventParams) => {
  const { oauth2, integration } = await getAuthenticatedClient(params.companyId);
  const { google } = ensureGoogleLib();
  const calendar = google.calendar({ version: "v3", auth: oauth2 });

  const timezone = params.timezone || integration.timezone || "America/Sao_Paulo";
  const calendarId = params.calendarId || integration.calendarId || "primary";

  const startDate = new Date(params.startISO);
  if (Number.isNaN(startDate.getTime())) {
    throw new Error(`Data/hora inicial inválida: ${params.startISO}`);
  }
  const durationMin = params.durationMinutes || integration.defaultDuration || 30;
  const endDate = params.endISO ? new Date(params.endISO) : new Date(startDate.getTime() + durationMin * 60_000);

  const event: any = {
    summary: params.summary,
    description: params.description || "",
    start: { dateTime: startDate.toISOString(), timeZone: timezone },
    end: { dateTime: endDate.toISOString(), timeZone: timezone }
  };
  if (params.attendees && params.attendees.length > 0) {
    event.attendees = params.attendees
      .filter(Boolean)
      .map(email => ({ email }));
  }

  // Sala do Meet. O `requestId` só precisa ser único por pedido — o Google
  // usa ele para tornar a criação idempotente se a chamada for repetida.
  if (params.withMeet) {
    event.conferenceData = {
      createRequest: {
        requestId: `equipechat-${params.companyId}-${Date.now()}-${Math.random()
          .toString(36)
          .slice(2, 8)}`,
        conferenceSolutionKey: { type: "hangoutsMeet" }
      }
    };
  }

  const { data } = await calendar.events.insert({
    calendarId,
    requestBody: event,
    // Sem `conferenceDataVersion: 1` o Google IGNORA o createRequest acima
    // sem devolver erro nenhum — e o evento nasce sem Meet.
    conferenceDataVersion: params.withMeet ? 1 : 0,
    sendUpdates: params.sendInvites && event.attendees ? "all" : "none"
  });

  return {
    eventId: data.id,
    htmlLink: data.htmlLink,
    // `hangoutLink` é o campo antigo e nem sempre vem preenchido em contas
    // novas; o caminho atual é conferenceData.entryPoints. Tenta os dois.
    hangoutLink:
      data.hangoutLink ||
      (data.conferenceData?.entryPoints || []).find(
        (e: any) => e?.entryPointType === "video"
      )?.uri ||
      null,
    status: data.status,
    start: data.start,
    end: data.end
  };
};

export default CreateCalendarEventService;
