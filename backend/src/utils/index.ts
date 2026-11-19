import logger from "../utils/logger";
import { ENABLE_LID_DEBUG } from "../config/debug";

export function normalizeJid(jid: string): string {
  if (!jid) return jid;

  if (ENABLE_LID_DEBUG) {
    logger.info(`[RDS-LID] normalizeJid - Entrada: ${jid}`);
  }

  // Remove a parte de dispositivo (":N") de JIDs no formato AD. Um remoteJid
  // de CONVERSA nunca deveria carregar isso — ":N" só existe pra roteamento
  // interno de sessão/pareamento (o próprio aparelho conectado, ex:
  // "5511999999999:33@s.whatsapp.net"). Se um evento chegar sem o JID do
  // chat preenchido e cair no fallback pro JID do remetente numa mensagem
  // fromMe (eco da própria mensagem enviada), esse fallback PODE ser o JID
  // AD do próprio aparelho pareado — e se isso vazar pro remoteJid salvo, o
  // whatsmeow recusa qualquer envio futuro pra esse "contato" com
  // "message recipient must be a user JID with no device part".
  const deviceSuffixMatch = jid.match(/^(\d+):\d+(@.+)$/);
  if (deviceSuffixMatch) {
    const stripped = `${deviceSuffixMatch[1]}${deviceSuffixMatch[2]}`;
    if (ENABLE_LID_DEBUG) logger.info(`[RDS-LID] normalizeJid - Removida parte de dispositivo: ${jid} -> ${stripped}`);
    jid = stripped;
  }

  // Correção para contatos salvos incorretamente com @lid@s.whatsapp.net
  // (sufixo duplicado). Mantém como @lid — ver explicação abaixo sobre por
  // que @lid não deve virar @s.whatsapp.net.
  if (jid.includes('@lid@s.whatsapp.net')) {
    const parts = jid.split('@');
    if (parts.length >= 3 && /^\d+$/.test(parts[0])) {
      const normalized = parts[0] + '@lid';
      if (ENABLE_LID_DEBUG) logger.info(`[RDS-LID] normalizeJid - Corrigido formato @lid@s.whatsapp.net: ${normalized}`);
      return normalized;
    }
  }

  if (jid.includes('@s.whatsapp.net@s.whatsapp.net')) {
    const normalized = jid.replace('@s.whatsapp.net@s.whatsapp.net', '@s.whatsapp.net');
    if (ENABLE_LID_DEBUG) logger.info(`[RDS-LID] normalizeJid - Corrigido duplicado: ${normalized}`);
    return normalized;
  }
  if (jid.includes('@g.us@g.us')) {
    const normalized = jid.replace('@g.us@g.us', '@g.us');
    if (ENABLE_LID_DEBUG) logger.info(`[RDS-LID] normalizeJid - Corrigido duplicado: ${normalized}`);
    return normalized;
  }

  if (jid.includes('@s.whatsapp.net') || jid.includes('@g.us')) {
    if (ENABLE_LID_DEBUG) logger.info(`[RDS-LID] normalizeJid - JID já normalizado: ${jid}`);
    return jid;
  }

  if (jid.includes('@lid')) {
    const base = jid.split('@')[0];

    if (!/^\d+$/.test(base)) {
      if (ENABLE_LID_DEBUG) logger.warn(`[RDS-LID] normalizeJid - Formato inválido para @lid: ${jid}`);
      return jid;
    }

    // Só reclassifica pra grupo se o próprio jid já sinalizar isso
    // explicitamente (dado corrompido antigo) — chutar "grupo" só pelo
    // tamanho do número derrubava LIDs de usuário legítimos (LIDs comuns
    // têm 15 dígitos) na categoria errada.
    if (jid.includes('g.us')) {
      const normalized = base + '@g.us';
      if (ENABLE_LID_DEBUG) logger.info(`[RDS-LID] normalizeJid - @lid convertido para grupo: ${normalized}`);
      return normalized;
    }

    // IMPORTANTE: LID (Linked/Hidden ID) é um tipo de JID legítimo e
    // diferente do WhatsApp — não é um número de telefone disfarçado.
    // Versões anteriores desta função reescreviam @lid pra @s.whatsapp.net,
    // fabricando uma "PN" falsa a partir dos dígitos do LID. O whatsmeow
    // então tenta resolver essa PN de volta pra um LID via servidor toda
    // vez que manda mensagem — e falha com "no LID found for X from
    // server" em qualquer contato que só existe como LID (sem número de
    // telefone exposto, comum com a migração de privacidade do WhatsApp).
    // Preservar o @lid original evita esse round-trip: o whatsmeow manda
    // direto pro @lid, sem precisar resolver nada.
    if (ENABLE_LID_DEBUG) logger.info(`[RDS-LID] normalizeJid - Mantendo @lid original: ${base}@lid`);
    return `${base}@lid`;
  }

  if (!jid.includes('@')) {
    const normalized = jid + '@s.whatsapp.net';
    if (ENABLE_LID_DEBUG) logger.info(`[RDS-LID] normalizeJid - Adicionado @s.whatsapp.net: ${normalized}`);
    return normalized;
  }

  if (ENABLE_LID_DEBUG) logger.info(`[RDS-LID] normalizeJid - Sem alteração: ${jid}`);
  return jid;
}
