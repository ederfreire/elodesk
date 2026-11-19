/**
 * Gera o payload PIX "copia e cola" (BR Code EMV) a partir de chave/nome/cidade/valor.
 * Compatível com qualquer app bancário e renderiza o QR Code no WhatsApp.
 *
 * Spec: Banco Central do Brasil - Padrão BR Code (EMV QR Code).
 */

const stripAccents = (txt: string): string =>
  (txt || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-zA-Z0-9 ]/g, "")
    .toUpperCase();

const tlv = (id: string, value: string): string => {
  const len = value.length.toString().padStart(2, "0");
  return `${id}${len}${value}`;
};

// CRC16-CCITT (poly 0x1021, init 0xFFFF) — exigido pelo padrão BR Code.
const crc16 = (payload: string): string => {
  let crc = 0xffff;
  for (let i = 0; i < payload.length; i++) {
    crc ^= payload.charCodeAt(i) << 8;
    for (let j = 0; j < 8; j++) {
      crc = (crc & 0x8000) !== 0 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
};

export interface PixBRCodeInput {
  pixKey: string;
  merchantName?: string;
  merchantCity?: string;
  amount?: number | string;
  txid?: string;
  description?: string;
}

export const buildPixBRCode = (input: PixBRCodeInput): string => {
  const key = (input.pixKey || "").trim();
  if (!key) return "";

  const name = stripAccents(input.merchantName || "PAGAMENTO").slice(0, 25) || "PAGAMENTO";
  const city = stripAccents(input.merchantCity || "BRASIL").slice(0, 15) || "BRASIL";
  const txid = (input.txid || "***").replace(/[^a-zA-Z0-9]/g, "").slice(0, 25) || "***";

  // Merchant Account Information (ID 26)
  const gui = tlv("00", "br.gov.bcb.pix");
  const keyTlv = tlv("01", key);
  const descTlv = input.description ? tlv("02", stripAccents(input.description).slice(0, 72)) : "";
  const merchantAccount = tlv("26", `${gui}${keyTlv}${descTlv}`);

  const amount =
    input.amount !== undefined && input.amount !== null && Number(input.amount) > 0
      ? Number(input.amount).toFixed(2)
      : "";

  const additionalData = tlv("62", tlv("05", txid));

  const payloadWithoutCrc =
    tlv("00", "01") +
    tlv("01", "11") + // 11 = QR estático
    merchantAccount +
    tlv("52", "0000") +
    tlv("53", "986") + // BRL
    (amount ? tlv("54", amount) : "") +
    tlv("58", "BR") +
    tlv("59", name) +
    tlv("60", city) +
    additionalData +
    "6304"; // CRC placeholder

  return payloadWithoutCrc + crc16(payloadWithoutCrc);
};
