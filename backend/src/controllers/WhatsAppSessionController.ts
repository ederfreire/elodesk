import { Request, Response } from "express";
import { getWbot, removeWbot, requestPairingCode as wbotRequestPairingCode } from "../libs/wbot";
import ShowWhatsAppService from "../services/WhatsappService/ShowWhatsAppService";
import { StartWhatsAppSession, releaseStartLock } from "../services/WbotServices/StartWhatsAppSession";
import UpdateWhatsAppService from "../services/WhatsappService/UpdateWhatsAppService";
import DeleteBaileysService from "../services/BaileysServices/DeleteBaileysService";
import cacheLayer from "../libs/cache";
import Whatsapp from "../models/Whatsapp";
import AppError from "../errors/AppError";
import { getIO } from "../libs/socket";
import { getZApiQrCode, getZApiStatus, setZApiWebhook } from "../services/ZApiServices/ZApiService";
import { setWebhook as setTelegramWebhook, getMe as getTelegramMe, deleteWebhook as deleteTelegramWebhook } from "../services/TelegramServices/telegramBotAPI";
import {
  createChatSession,
  deleteChatSession,
  pairChatSession,
  isEnabled as wacallsChatEnabled
} from "../services/WacallsServices/WacallsChatCallService";
import logger from "../utils/logger";


const startZApiQrCodePolling = async (whatsapp: Whatsapp) => {
  const companyId = whatsapp.companyId;
  const io = getIO();
  const config = {
    zapiInstanceId: whatsapp.zapiInstanceId!,
    zapiToken: whatsapp.zapiToken!,
    zapiClientToken: whatsapp.zapiClientToken!,
  };

  // Check if already connected
  const status = await getZApiStatus(config);
  if (status?.connected === true) {
    await whatsapp.update({ status: "CONNECTED", qrcode: "" });
    io.of(String(companyId)).emit(`company-${companyId}-whatsappSession`, {
      action: "update",
      session: whatsapp,
    });
    // ✅ Registrar webhooks na Z-API automaticamente
    await setZApiWebhook(config);
    logger.info(`[Z-API] Conexão ${whatsapp.id} já estava conectada, webhooks configurados.`);
    return;
  }

  // Set status to qrcode and start polling
  await whatsapp.update({ status: "qrcode", qrcode: "" });
  io.of(String(companyId)).emit(`company-${companyId}-whatsappSession`, {
    action: "update",
    session: whatsapp,
  });

  let attempts = 0;
  const maxAttempts = 40; // ~3.5 minutes with 5s interval

  const poll = async () => {
    attempts++;
    if (attempts > maxAttempts) {
      logger.info(`[Z-API] QR polling timeout for whatsapp ${whatsapp.id}`);
      await whatsapp.update({ status: "DISCONNECTED", qrcode: "" });
      io.of(String(companyId)).emit(`company-${companyId}-whatsappSession`, {
        action: "update",
        session: whatsapp,
      });
      return;
    }

    try {
      // Check if connected
      const currentStatus = await getZApiStatus(config);
      if (currentStatus?.connected === true) {
        await whatsapp.update({ status: "CONNECTED", qrcode: "" });
        io.of(String(companyId)).emit(`company-${companyId}-whatsappSession`, {
          action: "update",
          session: whatsapp,
        });
        // ✅ Registrar webhooks na Z-API automaticamente ao conectar
        await setZApiWebhook(config);
        logger.info(`[Z-API] Conexão ${whatsapp.id} conectada com sucesso! Webhooks configurados.`);
        return;
      }

      // Get QR code
      const qrData = await getZApiQrCode(config);
      if (qrData?.value) {
        const qrcode = qrData.value;
        await whatsapp.update({ status: "qrcode", qrcode });
        io.of(String(companyId)).emit(`company-${companyId}-whatsappSession`, {
          action: "update",
          session: whatsapp,
        });
      }
    } catch (err) {
      logger.error(`[Z-API] Erro no polling QR: ${(err as any).message}`);
    }

    setTimeout(poll, 5000);
  };

  // Start polling after a small delay
  setTimeout(poll, 1000);
};

const store = async (req: Request, res: Response): Promise<Response> => {
  const { whatsappId } = req.params;
  const { companyId } = req.user;

  const whatsapp = await ShowWhatsAppService(whatsappId, companyId);

  // Telegram: configurar webhook e validar token
  if (whatsapp.channel === "telegram" && whatsapp.token) {
    try {
      const backendUrl = process.env.BACKEND_URL || "http://localhost:8080";
      const webhookUrl = `${backendUrl}/telegram/webhook/${whatsapp.token}`;
      await setTelegramWebhook(whatsapp.token, webhookUrl);

      const botInfo = await getTelegramMe(whatsapp.token);
      await whatsapp.update({
        status: "CONNECTED",
        number: String(botInfo.id),
      });

      const io = getIO();
      io.of(String(companyId)).emit(`company-${companyId}-whatsappSession`, {
        action: "update",
        session: whatsapp,
      });

      logger.info(`[TELEGRAM] Conexão ${whatsapp.id} conectada com sucesso!`);
      return res.status(200).json({ message: "Telegram bot connected." });
    } catch (error: any) {
      await whatsapp.update({ status: "DISCONNECTED" });
      logger.error(`[TELEGRAM] Erro ao conectar bot: ${error.message}`);
      throw new AppError("ERR_TELEGRAM_BOT_CONNECT");
    }
  }

  // wacalls: pede uma sessão nova ao wacalls-chat (mensagem+chamada juntos
  // agora). O QR chega sozinho via o stream de eventos global
  // (startWacallsChatEventLoop, iniciado no bootstrap do servidor) e cai
  // direto em whatsapp.qrcode — não precisa de subscribe por conexão.
  if (whatsapp.channel === "wacalls") {
    if (!wacallsChatEnabled()) {
      throw new AppError("O WhatsApp Plus - Voz + Msg ainda não está configurado neste servidor.");
    }
    try {
      if (!whatsapp.wacallsChatSessionId) {
        await createChatSession(whatsapp);
      } else {
        // Sessão já existe no wacalls-chat mas não está pareada — sem isso o
        // wacalls-chat nunca volta a girar QR sozinho (só pareia automático
        // na criação), e o QR "demora pra sempre" porque na prática nunca
        // chega evento nenhum pra essa sessão.
        const ok = await pairChatSession(whatsapp.wacallsChatSessionId);
        if (!ok) {
          // Sessão órfã (não existe mais no wacalls-chat, ex: banco dele foi
          // resetado) — recria do zero em vez de ficar esperando pra sempre.
          await whatsapp.update({ wacallsChatSessionId: null });
          await createChatSession(whatsapp);
        }
      }
      await whatsapp.update({ status: "qrcode", qrcode: "" });
      const io = getIO();
      io.of(String(companyId)).emit(`company-${companyId}-whatsappSession`, {
        action: "update",
        session: whatsapp,
      });
      return res.status(200).json({ message: "Iniciando sessão do WhatsApp Plus - Voz + Msg." });
    } catch (err: any) {
      await whatsapp.update({ status: "DISCONNECTED", qrcode: "" });
      const io = getIO();
      io.of(String(companyId)).emit(`company-${companyId}-whatsappSession`, {
        action: "update",
        session: whatsapp,
      });
      logger.error(`[WACALLS-CHAT] Erro ao criar sessão: ${err.message}`);
      throw new AppError("ERR_WACALLS_SESSION_CREATE");
    }
  }

  // Z-API: fetch QR code from Z-API instead of Baileys
  if (whatsapp.zapiInstanceId && whatsapp.zapiToken && whatsapp.zapiClientToken) {
    startZApiQrCodePolling(whatsapp);
    return res.status(200).json({ message: "Starting Z-API session." });
  }


  // Limpar sessão antiga para evitar bloqueios
  try {
    // O terceiro argumento zera os contadores de desistência (reconexão e
    // QR). Aqui é ação DELIBERADA do usuário na tela, então a conexão tem
    // direito a um ciclo novo de tentativas mesmo que tenha desistido antes.
    removeWbot(whatsapp.id, false, true);
  } catch (e) {
    // Sessão não existia, ok
  }

  // ✅ Garantir que o lock de StartWhatsAppSession é liberado
  // mesmo que removeWbot não tenha encontrado a sessão
  releaseStartLock(whatsapp.id);
  releaseStartLock(whatsapp.id);

  await DeleteBaileysService(whatsappId);
  await cacheLayer.delFromPattern(`sessions:${whatsapp.id}:*`);
  await whatsapp.update({ status: "PENDING", session: "", qrcode: "" });

  // Emitir atualização imediata para o frontend
  const io = getIO();
  io.of(String(companyId)).emit(`company-${companyId}-whatsappSession`, {
    action: "update",
    session: whatsapp,
  });

  await StartWhatsAppSession(whatsapp, companyId);

  return res.status(200).json({ message: "Starting session." });
};

const update = async (req: Request, res: Response): Promise<Response> => {
  const { whatsappId } = req.params;
  const { companyId } = req.user;

  const whatsapp = await Whatsapp.findOne({ where: { id: whatsappId, companyId } });
  if (!whatsapp) {
    return res.status(404).json({ error: "Conexão WhatsApp não encontrada." });
  }

  // wacalls: NÃO apaga/recria a sessão se ela já existe — isso jogava fora
  // um pareamento em andamento (ou até já concluído) toda vez que o front
  // pedia QR sem ter um em cache (ex: reabrir o modal), porque recriar do
  // zero um cliente whatsmeow no wacalls-chat demora alguns segundos e
  // gera um QR totalmente novo, invalidando o que o usuário tinha acabado
  // de escanear. O wacalls-chat já gira o QR sozinho enquanto não pareado;
  // aqui só garantimos que a sessão existe e limpamos o cache local pra
  // forçar uma busca do QR atual (via qrLatest/stream), sem destruir nada.
  if (whatsapp.channel === "wacalls") {
    try {
      if (!whatsapp.wacallsChatSessionId) {
        await createChatSession(whatsapp);
      } else {
        // Idem ao store(): reabrir o modal de uma sessão que já existe (mas
        // não está pareada) não gera QR novo sozinho — precisa pedir
        // explicitamente pro wacalls-chat re-parear.
        const ok = await pairChatSession(whatsapp.wacallsChatSessionId);
        if (!ok) {
          await whatsapp.update({ wacallsChatSessionId: null });
          await createChatSession(whatsapp);
        }
      }
      await whatsapp.update({ status: "qrcode", qrcode: "" });
      const io = getIO();
      io.of(String(companyId)).emit(`company-${companyId}-whatsappSession`, {
        action: "update",
        session: whatsapp,
      });
    } catch (err: any) {
      await whatsapp.update({ status: "DISCONNECTED", qrcode: "" });
      const io = getIO();
      io.of(String(companyId)).emit(`company-${companyId}-whatsappSession`, {
        action: "update",
        session: whatsapp,
      });
      logger.error(`[WACALLS-CHAT] update erro: ${err.message}`);
      throw new AppError("ERR_WACALLS_SESSION_CREATE");
    }
    return res.status(200).json({ message: "Atualizando QR code do WhatsApp Plus - Voz + Msg." });
  }

  // Z-API: apenas refazer polling de QR
  if (whatsapp.zapiInstanceId && whatsapp.zapiToken && whatsapp.zapiClientToken) {
    await whatsapp.update({ session: "" });
    startZApiQrCodePolling(whatsapp);
    return res.status(200).json({ message: "Refreshing Z-API QR code." });
  }


  if (whatsapp.channel === "whatsapp") {
    // ✅ Fix: limpar completamente a sessão antes de reiniciar para forçar novo QR.
    // Antes apenas chamava StartWhatsAppSession, mas se o wbot estava travado em
    // OPENING/CONECTANDO o lock impedia geração de novo QR (ficava preso indefinidamente).
    try {
      // O terceiro argumento zera os contadores de desistência (reconexão e
    // QR). Aqui é ação DELIBERADA do usuário na tela, então a conexão tem
    // direito a um ciclo novo de tentativas mesmo que tenha desistido antes.
    removeWbot(whatsapp.id, false, true);
    } catch (e) {
      // Sessão não existia em memória, ok
    }

    // Garantir liberação do lock mesmo que removeWbot não tenha encontrado a sessão
    releaseStartLock(whatsapp.id);

    await DeleteBaileysService(whatsappId);
    await cacheLayer.delFromPattern(`sessions:${whatsapp.id}:*`);
    await whatsapp.update({ status: "PENDING", session: "", qrcode: "" });

    // Notificar frontend imediatamente (limpa QR antigo do modal)
    const io = getIO();
    io.of(String(companyId)).emit(`company-${companyId}-whatsappSession`, {
      action: "update",
      session: whatsapp,
    });

    await StartWhatsAppSession(whatsapp, companyId);
    return res.status(200).json({ message: "Restarting session." });
  }

  await whatsapp.update({ session: "" });
  return res.status(200).json({ message: "Starting session." });
};

const remove = async (req: Request, res: Response): Promise<Response> => {
  const { whatsappId } = req.params;
  const { companyId } = req.user;
  const whatsapp = await ShowWhatsAppService(whatsappId, companyId);

  if (whatsapp.channel === "telegram" && whatsapp.token) {
    try {
      await deleteTelegramWebhook(whatsapp.token);
    } catch (e) {}
    await whatsapp.update({ status: "DISCONNECTED" });
    const io = getIO();
    io.of(String(companyId)).emit(`company-${companyId}-whatsappSession`, {
      action: "update",
      session: whatsapp,
    });
  } else if (whatsapp.channel === "wacalls") {
    await deleteChatSession(whatsapp);
    await whatsapp.update({ status: "DISCONNECTED", qrcode: "", wacallsChatSessionId: null });
    const io = getIO();
    io.of(String(companyId)).emit(`company-${companyId}-whatsappSession`, {
      action: "update",
      session: whatsapp,
    });
  } else if (whatsapp.zapiInstanceId && whatsapp.zapiToken && whatsapp.zapiClientToken) {

    const { disconnectZApi } = await import("../services/ZApiServices/ZApiService");
    await disconnectZApi({
      zapiInstanceId: whatsapp.zapiInstanceId,
      zapiToken: whatsapp.zapiToken,
      zapiClientToken: whatsapp.zapiClientToken,
    });
    await whatsapp.update({ status: "DISCONNECTED", qrcode: "" });
    const io = getIO();
    io.of(String(companyId)).emit(`company-${companyId}-whatsappSession`, {
      action: "update",
      session: whatsapp,
    });
  } else if (whatsapp.channel === "whatsapp") {
    await DeleteBaileysService(whatsappId);
    
    // ✅ FIX: Usar removeWbot que limpa TODOS os locks e mapas internos
    // Antes chamava wbot.logout() + wbot.ws.close() diretamente, deixando locks órfãos
    try {
      removeWbot(whatsapp.id, true);
    } catch (e) {
      logger.warn(`[SESSION] Erro ao remover wbot ${whatsapp.id}: ${(e as any)?.message}`);
    }
    
    await whatsapp.update({ status: "DISCONNECTED", session: "", qrcode: "" });
    const io = getIO();
    io.of(String(whatsapp.companyId)).emit(`company-${whatsapp.companyId}-whatsappSession`, {
      action: "update",
      session: whatsapp,
    });
  }

  return res.status(200).json({ message: "Session disconnected." });
};

const requestPairingCode = async (req: Request, res: Response): Promise<Response> => {
  const { whatsappId } = req.params;
  const { phoneNumber } = req.body;
  const { companyId } = req.user;

  if (!phoneNumber) {
    return res.status(400).json({ error: "Número de telefone é obrigatório." });
  }

  const cleanNumber = phoneNumber.replace(/\D/g, "");

  if (cleanNumber.length < 10) {
    return res.status(400).json({ error: "Número inválido. Use o formato: 5511999998888" });
  }

  const whatsapp = await Whatsapp.findOne({ where: { id: whatsappId, companyId } });
  if (!whatsapp) {
    return res.status(404).json({ error: "Conexão não encontrada." });
  }


  // Statuses válidos para gerar pairing code
  const allowedStatuses = ["qrcode", "PENDING", "DISCONNECTED", "TIMEOUT", "CONNECTED"];
  if (!allowedStatuses.includes(whatsapp.status)) {
    return res.status(400).json({
      error: `Não é possível gerar código neste momento. Status atual: ${whatsapp.status}.`
    });
  }

  try {
    // Sempre limpar e reiniciar sessão para garantir estado limpo
    // Isso resolve o problema de sessões órfãs que existem no DB mas não na memória
    const needsRestart = whatsapp.status !== "qrcode";

    if (needsRestart) {

      try {
        // O terceiro argumento zera os contadores de desistência (reconexão e
    // QR). Aqui é ação DELIBERADA do usuário na tela, então a conexão tem
    // direito a um ciclo novo de tentativas mesmo que tenha desistido antes.
    removeWbot(whatsapp.id, false, true);
      } catch (e) {
      }

      await DeleteBaileysService(whatsappId);
      await cacheLayer.delFromPattern(`sessions:${whatsapp.id}:*`);
      await whatsapp.update({ status: "PENDING", session: "", qrcode: "" });

      await StartWhatsAppSession(whatsapp, companyId);
    } else {
      // Mesmo em status qrcode, verificar se a sessão existe em memória
      try {
        getWbot(whatsapp.id);
      } catch {
        await StartWhatsAppSession(whatsapp, companyId);
      }
    }

    // Aguarda a sessão chegar no estado qrcode (máx 25s)
    const maxWait = 25000;
    const interval = 500;
    let elapsed = 0;
    let ready = false;

    while (elapsed < maxWait) {
      await new Promise(r => setTimeout(r, interval));
      elapsed += interval;

      // Verificar se sessão está em memória E no status qrcode
      const updated = await Whatsapp.findByPk(whatsapp.id);
      if (updated?.status === "qrcode") {
        // Confirmar que a sessão realmente existe em memória
        try {
          getWbot(whatsapp.id);
          ready = true;
          break;
        } catch {
          // Status qrcode no DB mas não em memória ainda, continuar aguardando
        }
      }
      if (updated?.status === "CONNECTED") {
        return res.status(200).json({ error: "Sessão já está conectada.", connected: true });
      }
    }

    if (!ready) {
      return res.status(408).json({
        error: "Timeout aguardando sessão ficar pronta. Tente novamente em alguns segundos."
      });
    }

    // Aguardar socket estabilizar após QR ser gerado
    await new Promise(r => setTimeout(r, 2000));

    if (res.headersSent) return res;
    const code = await wbotRequestPairingCode(Number(whatsappId), cleanNumber);
    if (res.headersSent) return res;
    return res.status(200).json({ code });
  } catch (err: any) {
    if (res.headersSent) return res;
    const message = err?.message || "Erro ao solicitar código de pareamento.";
    console.error(`[PairingCode] ❌ Erro final: ${message}`);
    return res.status(500).json({ error: message });
  }
};

export default { store, remove, update, requestPairingCode };
