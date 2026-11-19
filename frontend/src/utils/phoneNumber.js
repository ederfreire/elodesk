// Utilities to normalize phone numbers for contact matching.
// Focused on Brazil (+55) but tolerant to international formats.

export const onlyDigits = (v) => String(v || "").replace(/\D/g, "");

// Strip common WhatsApp/tel suffixes and prefixes
export const stripPhoneArtifacts = (v) => {
  if (!v) return "";
  return String(v)
    .replace(/@.*$/, "")        // remove @domain or @s.whatsapp.net
    .replace(/^tel:/i, "");
};

// Normalize a phone number to digits-only E.164-ish (no +).
// - Removes mask/spaces/symbols
// - Removes Brazilian trunk "0" prefix when present after country code
// - Adds country code 55 if it looks like a BR local number (10-11 digits)
export const normalizePhone = (raw, defaultCountry = "55") => {
  const stripped = stripPhoneArtifacts(raw);
  let d = onlyDigits(stripped);
  if (!d) return "";

  // 00 international prefix -> drop
  if (d.startsWith("00")) d = d.slice(2);

  // BR: 10 or 11 digits = local (DDD + número) -> prepend country
  if (d.length === 10 || d.length === 11) {
    d = defaultCountry + d;
  }

  // BR mobile w/o 9th digit (12 dígitos: 55 + DDD + 8) -> inserir 9
  if (defaultCountry === "55" && d.length === 12 && d.startsWith("55")) {
    const ddd = d.slice(2, 4);
    const rest = d.slice(4);
    // se primeiro dígito do "rest" for 6-9 (celular antigo), inserir 9
    if (/^[6-9]/.test(rest)) {
      d = "55" + ddd + "9" + rest;
    }
  }

  return d;
};

// Generate matching keys (suffixes) to compare two numbers loosely.
// Returns the last 8 digits, which is robust against country/DDD variations.
export const matchKey = (raw) => {
  const n = normalizePhone(raw);
  return n.slice(-8);
};

// Compare two raw numbers
export const samePhone = (a, b) => {
  const ka = matchKey(a);
  const kb = matchKey(b);
  return !!ka && ka === kb;
};
