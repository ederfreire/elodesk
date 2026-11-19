// Converte data e hora coletadas no chat em ISO string com timezone.
// Aceita formatos brasileiros: 15/06/2026, 15-06, 15/06, "hoje", "amanhã", "15:30", "15h30", "15h".

const padZ = (n: number) => String(n).padStart(2, "0");

function tzOffsetIso(timezone: string, ref: Date): string {
  // Calcula offset (HH:MM) do timezone para a data fornecida
  try {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone: timezone,
      hour12: false,
      timeZoneName: "shortOffset"
    });
    const parts = dtf.formatToParts(ref);
    const tzPart = parts.find(p => p.type === "timeZoneName")?.value || "GMT-03:00";
    const m = tzPart.match(/GMT([+-])(\d{1,2})(?::?(\d{2}))?/);
    if (!m) return "-03:00";
    const sign = m[1];
    const hh = padZ(parseInt(m[2], 10));
    const mm = m[3] ? padZ(parseInt(m[3], 10)) : "00";
    return `${sign}${hh}:${mm}`;
  } catch (_) {
    return "-03:00";
  }
}

export function parseHumanDateTime(
  dateStr: string,
  timeStr: string,
  timezone = "America/Sao_Paulo"
): string {
  const now = new Date();
  let year = now.getFullYear();
  let month = now.getMonth() + 1;
  let day = now.getDate();

  const raw = (dateStr || "").toString().trim().toLowerCase();
  if (raw === "hoje") {
    // mantém today
  } else if (raw === "amanhã" || raw === "amanha") {
    const t = new Date(now.getTime() + 24 * 3600 * 1000);
    year = t.getFullYear(); month = t.getMonth() + 1; day = t.getDate();
  } else {
    const m = raw.match(/^(\d{1,2})[\/\-\.](\d{1,2})(?:[\/\-\.](\d{2,4}))?$/);
    if (!m) throw new Error(`Data inválida: "${dateStr}"`);
    day = parseInt(m[1], 10);
    month = parseInt(m[2], 10);
    if (m[3]) {
      year = parseInt(m[3], 10);
      if (year < 100) year += 2000;
    }
  }

  const tRaw = (timeStr || "").toString().trim().toLowerCase().replace("h", ":");
  const tMatch = tRaw.match(/^(\d{1,2})(?::(\d{1,2}))?$/);
  if (!tMatch) throw new Error(`Hora inválida: "${timeStr}"`);
  const hour = parseInt(tMatch[1], 10);
  const minute = tMatch[2] ? parseInt(tMatch[2], 10) : 0;

  if (month < 1 || month > 12 || day < 1 || day > 31 || hour > 23 || minute > 59) {
    throw new Error("Data/hora fora do intervalo válido.");
  }

  // Monta string local sem timezone, depois acopla offset calculado
  const local = `${year}-${padZ(month)}-${padZ(day)}T${padZ(hour)}:${padZ(minute)}:00`;
  const offset = tzOffsetIso(timezone, new Date(`${local}Z`));
  return `${local}${offset}`;
}

export default parseHumanDateTime;
