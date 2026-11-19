import Schedule from "../../models/Schedule";
import Contact from "../../models/Contact";
import User from "../../models/User";
import GoogleCalendarIntegration from "../../models/GoogleCalendarIntegration";
import CreateCalendarEventService from "./CreateCalendarEventService";
import getAuthenticatedClient from "./getAuthenticatedClient";
import { ensureGoogleLib } from "./oauthClient";
import logger from "../../utils/logger";

/**
 * Mantém o evento do Google Agenda em sincronia com um AGENDAMENTO.
 *
 * Este arquivo existe porque a integração com o Google só era possível pelo
 * FlowBuilder — quem quisesse marcar uma reunião precisava montar um fluxo.
 * Agora o próprio modal de Agendamento cria, atualiza e apaga o evento.
 *
 * REGRA DE OURO AQUI: falha no Google NUNCA derruba o agendamento.
 *
 * O agendamento é a fonte da verdade e o disparo da mensagem é o que o
 * cliente contratou. Se o token do Google expirou, a conta foi desconectada
 * ou a API está fora do ar, isso é registrado no log e o agendamento segue
 * normalmente — sem evento e sem Meet. O contrário (deixar de agendar a
 * mensagem porque o Google falhou) seria trocar um problema pequeno por um
 * grande.
 */

export interface ResultadoSync {
  googleEventId?: string | null;
  googleMeetLink?: string | null;
  googleEventLink?: string | null;
  erro?: string;
}

/** Preferências da empresa. Devolve null quando não há conta conectada. */
export const obterPreferenciasGoogle = async (
  companyId: number
): Promise<GoogleCalendarIntegration | null> => {
  try {
    return await GoogleCalendarIntegration.findOne({
      where: { companyId, isActive: true }
    });
  } catch (err: any) {
    logger.warn(`[GOOGLE AGENDA] Falha ao ler preferências da empresa ${companyId}: ${err?.message}`);
    return null;
  }
};

const montarDescricao = (schedule: Schedule): string => {
  const partes: string[] = [];

  const corpo = String(schedule.body || "").trim();
  if (corpo) partes.push(corpo);

  const contato: any = (schedule as any).contact;
  const usuario: any = (schedule as any).user;

  const detalhes: string[] = [];
  if (contato?.name) detalhes.push(`👤 Contato: ${contato.name}`);
  if (contato?.number) detalhes.push(`📞 Telefone: ${contato.number}`);
  if (usuario?.name) detalhes.push(`🧑‍💼 Atendente: ${usuario.name}`);

  if (detalhes.length > 0) {
    partes.push(detalhes.join("\n"));
  }

  return partes.join("\n\n");
};

/**
 * Cria ou atualiza o evento do agendamento.
 *
 * `schedule` precisa vir com `contact` e `user` carregados para a descrição
 * sair completa — se não vierem, o evento é criado do mesmo jeito, só com
 * menos detalhe.
 */
export const sincronizarEventoDoAgendamento = async (
  schedule: Schedule
): Promise<ResultadoSync> => {
  // Operador desligou a sincronização neste agendamento: se havia um evento
  // criado antes, ele é removido — senão ficaria um evento fantasma na
  // agenda do profissional depois de desmarcar a sincronização.
  if (!schedule.googleSync) {
    if (schedule.googleEventId) {
      await removerEventoDoAgendamento(schedule);
      return { googleEventId: null, googleMeetLink: null, googleEventLink: null };
    }
    return {};
  }

  const prefs = await obterPreferenciasGoogle(schedule.companyId);
  if (!prefs) {
    return { erro: "Nenhuma conta do Google conectada nesta empresa." };
  }

  const inicio = schedule.sendAt ? new Date(schedule.sendAt) : null;
  if (!inicio || Number.isNaN(inicio.getTime())) {
    return { erro: "Agendamento sem data/hora válida." };
  }

  const titulo =
    String(schedule.googleEventTitle || "").trim() ||
    String((schedule as any).contact?.name || "").trim() ||
    "Reunião";

  const duracao = schedule.googleEventDuration || prefs.defaultDuration || 30;

  // Convite por e-mail só quando a empresa habilitou E o contato tem e-mail.
  const emailContato = String((schedule as any).contact?.email || "").trim();
  const convidados =
    prefs.sendInvite && emailContato ? [emailContato] : [];

  try {
    // ── ATUALIZAÇÃO ────────────────────────────────────────────────────────
    if (schedule.googleEventId) {
      const { oauth2, integration } = await getAuthenticatedClient(schedule.companyId);
      const { google } = ensureGoogleLib();
      const calendar = google.calendar({ version: "v3", auth: oauth2 });

      const timezone = integration.timezone || "America/Sao_Paulo";
      const calendarId = integration.calendarId || "primary";
      const fim = new Date(inicio.getTime() + duracao * 60_000);

      const { data } = await calendar.events.patch({
        calendarId,
        eventId: schedule.googleEventId,
        requestBody: {
          summary: titulo,
          description: montarDescricao(schedule),
          start: { dateTime: inicio.toISOString(), timeZone: timezone },
          end: { dateTime: fim.toISOString(), timeZone: timezone },
          ...(convidados.length > 0
            ? { attendees: convidados.map(email => ({ email })) }
            : {})
        },
        sendUpdates: convidados.length > 0 ? "all" : "none"
      });

      logger.info(
        `[GOOGLE AGENDA] Evento ${schedule.googleEventId} atualizado (agendamento ${schedule.id}).`
      );

      return {
        googleEventId: data.id || schedule.googleEventId,
        googleMeetLink:
          data.hangoutLink ||
          (data.conferenceData?.entryPoints || []).find(
            (e: any) => e?.entryPointType === "video"
          )?.uri ||
          schedule.googleMeetLink ||
          null,
        googleEventLink: data.htmlLink || schedule.googleEventLink || null
      };
    }

    // ── CRIAÇÃO ────────────────────────────────────────────────────────────
    const evento = await CreateCalendarEventService({
      companyId: schedule.companyId,
      summary: titulo,
      description: montarDescricao(schedule),
      startISO: inicio.toISOString(),
      durationMinutes: duracao,
      attendees: convidados,
      withMeet: !!schedule.googleMeet,
      sendInvites: !!prefs.sendInvite
    });

    logger.info(
      `[GOOGLE AGENDA] Evento ${evento.eventId} criado para o agendamento ${schedule.id}` +
        (evento.hangoutLink ? " (com Meet)" : "")
    );

    return {
      googleEventId: evento.eventId || null,
      googleMeetLink: evento.hangoutLink || null,
      googleEventLink: evento.htmlLink || null
    };
  } catch (err: any) {
    // Não relança de propósito — ver "REGRA DE OURO" no topo.
    const msg = err?.response?.data?.error?.message || err?.message || "erro desconhecido";
    logger.error(
      `[GOOGLE AGENDA] Falha ao sincronizar o agendamento ${schedule.id}: ${msg}`
    );
    return { erro: msg };
  }
};

/** Apaga o evento do Google quando o agendamento é excluído ou dessincronizado. */
export const removerEventoDoAgendamento = async (
  schedule: Schedule
): Promise<void> => {
  if (!schedule?.googleEventId) return;

  try {
    const { oauth2, integration } = await getAuthenticatedClient(schedule.companyId);
    const { google } = ensureGoogleLib();
    const calendar = google.calendar({ version: "v3", auth: oauth2 });

    await calendar.events.delete({
      calendarId: integration.calendarId || "primary",
      eventId: schedule.googleEventId,
      sendUpdates: "all"
    });

    logger.info(
      `[GOOGLE AGENDA] Evento ${schedule.googleEventId} removido (agendamento ${schedule.id}).`
    );
  } catch (err: any) {
    // 404/410 = o evento já não existe (apagado à mão na agenda). Não é erro.
    const status = err?.response?.status || err?.code;
    if (status === 404 || status === 410) return;
    logger.warn(
      `[GOOGLE AGENDA] Falha ao remover o evento do agendamento ${schedule.id}: ${err?.message}`
    );
  }
};

export default sincronizarEventoDoAgendamento;
