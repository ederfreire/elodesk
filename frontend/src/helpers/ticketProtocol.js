/**
 * Gera o número de protocolo do atendimento (ticket) de forma estável.
 * Formato: YYYYMMDD + ID do ticket com 6 dígitos.
 * Ex.: createdAt = 2026-05-26, id = 123 => "20260526000123"
 */
export const getTicketProtocol = (ticket) => {
  if (!ticket || !ticket.id) return "";
  const raw = ticket.createdAt;
  let y, m, d;
  // Suporta "DD/MM/YYYY HH:MI" (como vem do relatório) e datas ISO/Date.
  const brMatch =
    typeof raw === "string" && raw.match(/^(\d{2})\/(\d{2})\/(\d{4})/);
  if (brMatch) {
    d = brMatch[1];
    m = brMatch[2];
    y = brMatch[3];
  } else {
    const created = raw ? new Date(raw) : new Date();
    y = created.getFullYear().toString();
    m = ("0" + (created.getMonth() + 1)).slice(-2);
    d = ("0" + created.getDate()).slice(-2);
  }
  const id = String(ticket.id).padStart(6, "0");
  return `${y}${m}${d}${id}`;
};

export default getTicketProtocol;