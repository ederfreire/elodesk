import { google } from "googleapis";

import getAuthenticatedClient from "../GoogleCalendarService/getAuthenticatedClient";
import SalesAgent from "../../models/SalesAgent";
import logger from "../../utils/logger";

/**
 * Horários livres na agenda, para o agente oferecer ao cliente.
 *
 * POR QUE freebusy E NÃO events.list
 * A API `freebusy` devolve só os blocos ocupados, respeitando evento privado,
 * recorrência e convite recusado. Listar eventos e tentar deduzir a partir
 * deles significa reimplementar essas regras — e errar em recorrência é
 * questão de tempo.
 *
 * NADA AQUI É INVENTADO
 * Se a consulta falhar, a função devolve lista vazia. O agente é instruído a
 * dizer que vai verificar, em vez de oferecer horário que não existe — marcar
 * reunião que não está na agenda é o pior erro possível neste fluxo.
 */

export interface Horario {
  inicio: string; // ISO
  fim: string;    // ISO
  rotulo: string; // "Terça, 14h"
}

const DIAS = ["domingo", "segunda", "terça", "quarta", "quinta", "sexta", "sábado"];

interface Params {
  companyId: number;
  agente: SalesAgent;
  /** Quantos dias à frente procurar. */
  diasAFrente?: number;
  /** Hora de início e fim do expediente, em hora local. */
  horaInicio?: number;
  horaFim?: number;
  /** Quantos horários devolver. */
  limite?: number;
}

const ListAvailableSlotsService = async ({
  companyId,
  agente,
  diasAFrente = 7,
  horaInicio = 9,
  horaFim = 18,
  limite = 6
}: Params): Promise<Horario[]> => {
  try {
    const { oauth2, integration } = await getAuthenticatedClient(companyId);
    const calendar = google.calendar({ version: "v3", auth: oauth2 });

    const calendarId =
      agente.googleCalendarId || integration?.calendarId || "primary";

    const duracao = Number(agente.eventDurationMinutes) || 30;

    const agora = new Date();
    // Começa daqui a 2 horas: oferecer horário para "daqui a 10 minutos" não
    // dá tempo de ninguém se organizar.
    const inicioBusca = new Date(agora.getTime() + 2 * 60 * 60 * 1000);
    const fimBusca = new Date(agora.getTime() + diasAFrente * 24 * 60 * 60 * 1000);

    const { data } = await calendar.freebusy.query({
      requestBody: {
        timeMin: inicioBusca.toISOString(),
        timeMax: fimBusca.toISOString(),
        items: [{ id: calendarId }],
        timeZone: integration?.timezone || "America/Sao_Paulo"
      }
    });

    const ocupados = (data.calendars?.[calendarId]?.busy || []).map(b => ({
      inicio: new Date(b.start as string).getTime(),
      fim: new Date(b.end as string).getTime()
    }));

    const livres: Horario[] = [];
    const cursor = new Date(inicioBusca);
    // Arredonda para a próxima meia hora cheia: oferecer "14h17" é estranho.
    cursor.setMinutes(cursor.getMinutes() > 30 ? 60 : 30, 0, 0);

    while (cursor < fimBusca && livres.length < limite) {
      const hora = cursor.getHours();
      const diaSemana = cursor.getDay();

      // Fim de semana e fora do expediente ficam de fora.
      const foraDoHorario =
        diaSemana === 0 || diaSemana === 6 || hora < horaInicio || hora >= horaFim;

      if (!foraDoHorario) {
        const ini = cursor.getTime();
        const fim = ini + duracao * 60 * 1000;

        // Conflita se houver qualquer sobreposição com um bloco ocupado.
        const conflita = ocupados.some(o => ini < o.fim && fim > o.inicio);

        if (!conflita) {
          const d = new Date(ini);
          const minutos = d.getMinutes();
          livres.push({
            inicio: d.toISOString(),
            fim: new Date(fim).toISOString(),
            rotulo: `${DIAS[d.getDay()]}, ${String(d.getDate()).padStart(2, "0")}/${String(
              d.getMonth() + 1
            ).padStart(2, "0")} às ${d.getHours()}${minutos ? `h${minutos}` : "h"}`
          });
        }
      }

      cursor.setMinutes(cursor.getMinutes() + 30);
    }

    return livres;
  } catch (err: any) {
    logger.warn(`[SalesAgent] Falha ao consultar agenda: ${err?.message}`);
    return [];
  }
};

export default ListAvailableSlotsService;
