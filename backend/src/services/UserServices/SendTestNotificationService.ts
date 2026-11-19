import User from "../../models/User";
import Whatsapp from "../../models/Whatsapp";
import GetDefaultWhatsApp from "../../helpers/GetDefaultWhatsApp";
import { getWbot } from "../../libs/wbot";
import { normalizeJid } from "../../utils";
import getCachedOnWhatsApp from "../../utils/onWhatsAppCache";
import logger from "../../utils/logger";

// Resolve a usable WhatsApp connection for sending a notification.
// Preference order:
//  1) The user-selected notificationWhatsappId (if connected and wbot initialized)
//  2) Any CONNECTED whatsapp of the company whose wbot is already initialized
//  3) GetDefaultWhatsApp fallback (may still throw if nothing is available)
const resolveNotificationWhatsapp = async (
  companyId: number,
  preferredId?: number | null
): Promise<{ whatsapp: Whatsapp | null; wbot: any | null; reason?: string }> => {
  const tryWbot = (wpp: Whatsapp | null) => {
    if (!wpp) return null;
    try {
      const wb = getWbot(wpp.id);
      return wb || null;
    } catch {
      return null;
    }
  };

  if (preferredId) {
    const preferred = await Whatsapp.findOne({
      where: { id: preferredId, companyId }
    });
    if (preferred?.status === "CONNECTED") {
      const wb = tryWbot(preferred);
      if (wb) return { whatsapp: preferred, wbot: wb };
    }
  }

  const connectedList = await Whatsapp.findAll({
    where: { companyId, status: "CONNECTED" }
  });
  for (const wpp of connectedList) {
    const wb = tryWbot(wpp);
    if (wb) return { whatsapp: wpp, wbot: wb };
  }

  try {
    const fallback = await GetDefaultWhatsApp(companyId);
    const wb = tryWbot(fallback);
    if (wb) return { whatsapp: fallback, wbot: wb };
    return { whatsapp: fallback, wbot: null, reason: "notInitialized" };
  } catch {
    return { whatsapp: null, wbot: null, reason: "noConnection" };
  }
};

interface TestResult {
  ok: boolean;
  reason?: string;
  reasonCode?: string;
  reasonParams?: Record<string, string>;
  jid?: string;
}

const sanitizeNumber = (raw?: string | null): string | null => {
  if (!raw) return null;
  const digits = String(raw).replace(/\D/g, "");
  // E.164: min 8, max 15 digits (international)
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
};

const parseNumbers = (raw?: string | null): string[] => {
  if (!raw) return [];
  return String(raw)
    .split(/[,;\s\n]+/)
    .map(n => sanitizeNumber(n))
    .filter((n): n is string => !!n);
};

const SendTestNotificationService = async (
  userId: number,
  companyId: number,
  overrideNumber?: string
): Promise<TestResult> => {
  const user = await User.findOne({ where: { id: userId, companyId } });
  if (!user) return { ok: false, reasonCode: "userNotFound", reason: "Usuário não encontrado" };

  const lang = (user.language || "pt").split("-")[0];
  const T: Record<string, Record<string, string>> = {
    pt: {
      header: "✅ *Teste de notificação*",
      body: "Olá {name}, este é um teste de notificação do sistema. Se você recebeu esta mensagem, o envio para o seu número está funcionando."
    },
    en: {
      header: "✅ *Notification test*",
      body: "Hi {name}, this is a system notification test. If you received this message, sending to your number is working."
    },
    es: {
      header: "✅ *Prueba de notificación*",
      body: "Hola {name}, esta es una prueba de notificación del sistema. Si recibiste este mensaje, el envío a tu número está funcionando."
    },
    tr: {
      header: "✅ *Bildirim testi*",
      body: "Merhaba {name}, bu bir sistem bildirim testidir. Bu mesajı aldıysanız numaranıza gönderim çalışıyor."
    },
    ar: {
      header: "✅ *اختبار الإشعار*",
      body: "مرحباً {name}، هذا اختبار إشعار من النظام. إذا تلقيت هذه الرسالة فإن الإرسال إلى رقمك يعمل."
    }
  };
  const tr = T[lang] || T.pt;

  const numbers = parseNumbers(overrideNumber || user.whatsappNumber);
  if (!numbers.length) {
    return {
      ok: false,
      reasonCode: "invalidNumber",
      reason:
        "Número de WhatsApp inválido ou vazio (use DDI + DDD + número, apenas dígitos, ex.: 5511999999999 ou 34662531131)"
    };
  }

  const resolved = await resolveNotificationWhatsapp(
    companyId,
    user.notificationWhatsappId
  );
  if (!resolved.whatsapp) {
    return {
      ok: false,
      reasonCode: "noDefaultWhatsapp",
      reason:
        "Nenhuma conexão WhatsApp ativa encontrada para esta empresa. Conecte uma sessão antes de enviar o teste."
    };
  }
  if (!resolved.wbot) {
    return {
      ok: false,
      reasonCode: "wppNotInitialized",
      reasonParams: { name: resolved.whatsapp.name },
      reason: `Conexão "${resolved.whatsapp.name}" não está inicializada. Acesse a página de Conexões e conecte-a antes de enviar o teste.`
    };
  }
  const whatsapp = resolved.whatsapp;
  const wbot = resolved.wbot;

  const body =
    `${tr.header}\n\n` +
    tr.body.replace("{name}", user.name || "");

  const sentJids: string[] = [];
  let lastError: string | null = null;
  for (const number of numbers) {
    let jid = normalizeJid(`${number}@s.whatsapp.net`);
    try {
      const validation = await getCachedOnWhatsApp(wbot, jid);
      if (validation?.exists && validation.jid) jid = validation.jid;
    } catch (err) {
      logger.warn(`[NotifyTest] onWhatsApp falhou para ${jid}: ${err.message}`);
    }
    try {
      await wbot.sendMessage(jid, { text: body });
      sentJids.push(jid);
      logger.info(
        `[NotifyTest] Teste enviado para user ${user.id} (${jid}) via wpp ${whatsapp.id}`
      );
    } catch (err) {
      lastError = err.message;
      logger.error(
        `[NotifyTest] Falha ao enviar para user ${user.id} (${jid}): ${err.message}`
      );
    }
  }

  if (sentJids.length > 0) {
    return { ok: true, jid: sentJids.join(",") };
  }
  return {
    ok: false,
    reasonCode: "sendFailed",
    reasonParams: { error: lastError || "unknown" },
    reason: `Falha no envio: ${lastError || "unknown"}`
  };
};

export default SendTestNotificationService;