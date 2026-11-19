import Mustache from "mustache";
import Ticket from "../models/Ticket";

function makeid(length) {
  var result = '';
  var characters = '0123456789';
  var charactersLength = characters.length;
  for (var i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * charactersLength));
  }
  return result;
}

export const msgsd = (): string => {

  let ms = "";

  const hh = new Date().getHours();

  if (hh >= 6) { ms = "Bom dia"; }
  if (hh > 11) { ms = "Boa tarde"; }
  if (hh > 17) { ms = "Boa noite"; }
  if (hh > 23 || hh < 6) { ms = "Boa madrugada"; }

  return ms;
};

export const control = (): string => {
  const Hr = new Date();

  const dd: string = ("0" + Hr.getDate()).slice(-2);
  const mm: string = ("0" + (Hr.getMonth() + 1)).slice(-2);
  const yyyy: string = Hr.getFullYear().toString();
  const minute: string = Hr.getMinutes().toString();
  const second: string = Hr.getSeconds().toString();
  const millisecond: string = Hr.getMilliseconds().toString();

  const ctrl = yyyy + mm + dd + minute + second + millisecond;
  return ctrl;
};

/**
 * Protocolo estável do atendimento: YYYYMMDD (createdAt do ticket) + id com 6 dígitos.
 */
export const getTicketProtocol = (ticket?: Ticket): string => {
  if (!ticket || !ticket.id) return "";
  const created = ticket.createdAt ? new Date(ticket.createdAt as any) : new Date();
  const dd: string = ("0" + created.getDate()).slice(-2);
  const mm: string = ("0" + (created.getMonth() + 1)).slice(-2);
  const yyyy: string = created.getFullYear().toString();
  const id = String(ticket.id).padStart(6, "0");
  return `${yyyy}${mm}${dd}${id}`;
};

export const date = (): string => {
  const Hr = new Date();

  const dd: string = ("0" + Hr.getDate()).slice(-2);
  const mm: string = ("0" + (Hr.getMonth() + 1)).slice(-2);
  const yy: string = Hr.getFullYear().toString();

  const dates = dd + "-" + mm + "-" + yy;
  return dates;
};

export const hour = (): string => {
  const Hr = new Date();

  const hh: number = Hr.getHours();
  const min: string = ("0" + Hr.getMinutes()).slice(-2);
  const ss: string = ("0" + Hr.getSeconds()).slice(-2);

  const hours = hh + ":" + min + ":" + ss;
  return hours;
};

export const firstName = (ticket?: Ticket): string => {
  if (ticket && ticket?.contact?.name) {
    const nameArr = ticket?.contact?.name.split(' ');
    return nameArr[0];
  }
  return '';
};

export const queuePosition = (ticket?: Ticket): string => {
  const value = ticket ? (ticket as any).queuePosition || (ticket as any).dataValues?.queuePosition : null;
  return value !== null && value !== undefined && String(value).trim() !== "" ? String(value) : "1";
};

export default (body: string, ticket?: Ticket, extra?: Record<string, any>): string => {
  const position = queuePosition(ticket);
  const tagsArr: string[] = ((ticket as any)?.tags || [])
    .map((t: any) => (t?.name || "").toString().trim())
    .filter(Boolean);
  const tagsCsv = tagsArr.join(", ");

  // Resolve nome da fila com fallbacks: relação carregada, dataValues,
  // ou lookup na lista de filas do WhatsApp (quando queueId já está
  // definido mas a associação "queue" ainda não foi recarregada — ex.:
  // saudação da conexão com 1 fila, e nós do flowbuilder logo após setar
  // a fila no ticket).
  let queueName = "";
  const t: any = ticket as any;
  if (t) {
    queueName =
      t?.queue?.name ||
      t?.queue?.dataValues?.name ||
      t?.dataValues?.queue?.name ||
      "";
    if (!queueName && t?.queueId) {
      const wq = t?.whatsapp?.queues || t?.whatsapp?.dataValues?.queues || [];
      const found = Array.isArray(wq)
        ? wq.find((q: any) => Number(q?.id) === Number(t.queueId))
        : null;
      queueName = found?.name || found?.dataValues?.name || "";
    }
  }

  const view = {
    firstName: firstName(ticket),
    name: ticket ? ticket?.contact?.name : "",
    ticket_id: ticket ? ticket.id : "",
    userName: ticket ? ticket?.user?.name : "",
    ms: msgsd(),
    hour: hour(),
    date: date(),
    queue: queueName,
    queueu: queueName,
    setor: queueName,
    sector: queueName,
    queuePosition: position,
    positionQueue: position,
    posicaoFila: position,
    posicao_na_fila: position,
    connection: ticket ? ticket?.whatsapp?.name : "",
    data_hora: new Array(date(), hour()).join(" às "),
    protocol: getTicketProtocol(ticket),
    name_company: ticket ? ticket?.company?.name : "",
    tags: tagsCsv,
    ticketTags: tagsCsv,
    ...(extra || {})
  };

  const normalizedBody = body.replace(
    /(posição\s+na\s+fila\s*(?:é|e)?\s*:\s*)\{\{\s*queue\s*\}\}/gi,
    `$1{{queuePosition}}`
  );

  return Mustache.render(normalizedBody, view);
};
