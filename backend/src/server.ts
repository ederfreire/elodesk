import './moduleAlias';
import './preCarregarModulos';
import 'dotenv/config';
import gracefulShutdown from "http-graceful-shutdown";
import app from "./app";
import { initIO, getIO } from "./libs/socket";
import logger from "./utils/logger";
import { StartAllWhatsAppsSessions } from "./services/WbotServices/StartAllWhatsAppsSessions";
import { initializeWhatsAppVersion } from "./libs/wbot";
import Company from "./models/Company";
import BullQueue from './libs/queue';
import { startQueueProcess } from "./queues";
import { startLidSyncJob } from "./jobs/LidSyncJob";
import { startPublicFolderCleanupJob } from "./jobs/PublicFolderCleanupJob";
import { restoreFlowWaitTimers } from "./services/WebhookService/FlowWaitTimerService";
import { startWacallsChatEventLoop, isEnabled as wacallsChatEnabled } from "./services/WacallsServices/WacallsChatCallService";

const server = app.listen(process.env.PORT, async () => {
  // ✅ Inicializar versão do WhatsApp Web ANTES de iniciar as sessões
  logger.info("🔄 Inicializando versão do WhatsApp Web...");
  await initializeWhatsAppVersion();
  
  try {
    const companies = await Company.findAll({
      where: { status: true },
      attributes: ["id"]
    });

    // ── ARRANQUE DAS SESSÕES: UMA EMPRESA DE CADA VEZ ────────────────────
    //
    // Antes era `companies.map(...)` + `Promise.all`, ou seja, TODAS as
    // empresas subiam as sessões ao mesmo tempo.
    //
    // O StartAllWhatsAppsSessions já tem o cuidado certo — lotes de 3, com 5s
    // entre sessões e 10s entre lotes — mas esse lote é POR EMPRESA. Com o
    // Promise.all, cada empresa rodava o próprio lote em paralelo: 20
    // empresas ativas significavam até 60 sessões Baileys em handshake
    // simultâneo, cada uma com Noise/Curve25519, leitura das chaves Signal no
    // Redis e abertura de websocket TLS. Era o pico de CPU logo depois de
    // todo `pm2 restart`, com o sistema ainda parado — e piorava a cada
    // cliente novo, porque o paralelismo crescia junto com o número de
    // empresas.
    //
    // Sequencial entre empresas, o teto passa a ser o lote interno (3
    // simultâneas), independente de quantas empresas existam. O arranque
    // demora mais, e é exatamente esse o compromisso: subir devagar e não
    // derrubar o serviço em vez de subir tudo junto e travar a VPS.
    //
    // BOOT_COMPANY_CONCURRENCY permite afrouxar em máquinas maiores sem
    // precisar mexer no código.
    const bootConcurrency = Math.max(
      1,
      parseInt(process.env.BOOT_COMPANY_CONCURRENCY || "1", 10) || 1
    );

    logger.info(
      `[BOOT] ${companies.length} empresa(s) ativa(s) — iniciando sessões com concorrência ${bootConcurrency}`
    );

    const fila = [...companies];
    const trabalhador = async (): Promise<void> => {
      while (fila.length > 0) {
        const c = fila.shift();
        if (!c) return;
        try {
          await StartAllWhatsAppsSessions(c.id);
        } catch (err: any) {
          logger.error(
            `Erro ao iniciar sessões WhatsApp da empresa ${c.id}: ${err?.message}`
          );
        }
      }
    };

    await Promise.all(
      Array.from({ length: Math.min(bootConcurrency, companies.length) }, () =>
        trabalhador()
      )
    );

    logger.info("[BOOT] Arranque das sessões concluído.");
    await startQueueProcess();
  } catch (err: any) {
    logger.error(`Erro na inicialização do servidor: ${err?.message}`);
  }

  if (process.env.REDIS_URI_ACK && process.env.REDIS_URI_ACK !== '') {
    BullQueue.process();
  }

  // Iniciar job de sincronização de LIDs
  startLidSyncJob();

  // Conexão persistente de eventos com o wacalls-chat (chamadas de voz reais)
  if (wacallsChatEnabled()) {
    startWacallsChatEventLoop();
    logger.info("[wacalls-chat] event loop iniciado");
  }

  // Iniciar job de limpeza das pastas public
  startPublicFolderCleanupJob();

  // Restaurar timers persistidos do waitInput (sobrevivem a reinícios)
  restoreFlowWaitTimers().catch(err =>
    logger.error(`Falha ao restaurar timers do waitInput: ${err?.message}`)
  );



  logger.info(`Server started on port: ${process.env.PORT}`);
});

process.on("uncaughtException", err => {
  console.error(`${new Date().toUTCString()} uncaughtException:`, err.message);
  console.error(err.stack);
  process.exit(1);
});

process.on("unhandledRejection", (reason, p) => {
  // NÃO derruba mais o processo.
  //
  // Uma promessa rejeitada sem tratamento (muito comum no Baileys quando uma
  // conexão cai) matava o backend inteiro: todas as empresas, todas as
  // conexões, por causa de um socket. O erro é registrado e a vida segue —
  // uma falha isolada não pode ser motivo de indisponibilidade geral.
  console.error(
    `${new Date().toUTCString()} unhandledRejection:`,
    reason,
    p
  );
  logger.error(`[unhandledRejection] ${(reason as any)?.message || reason}`);
});

initIO(server);

// DESLIGAMENTO COM PRAZO.
//
// Antes era gracefulShutdown(server) sem opções. O padrão espera TODAS as
// conexões fecharem — e as do socket.io não fecham sozinhas, ficam abertas
// para sempre. O desligamento travava no meio (o log parava em "Stopping
// birthday jobs..." e não saía mais nada), o PM2 matava o processo à força
// após 1,6s e tentava subir outro com a porta ainda ocupada. Depois de
// algumas tentativas o PM2 marcava "errored" e parava de tentar — o backend
// só voltava com "pm2 reload all" na mão.
//
// Agora: fecha o socket.io primeiro, tem prazo máximo e sai à força se
// passar do prazo. O processo sempre termina, então o PM2 consegue subir o
// próximo sem disputar a porta.
gracefulShutdown(server, {
  timeout: 15000,
  forceExit: true,
  onShutdown: async () => {
    try {
      const io = getIO();
      if (io) {
        io.close();
        logger.info("[shutdown] socket.io fechado");
      }
    } catch (err: any) {
      logger.warn(`[shutdown] falha ao fechar socket.io: ${err?.message || err}`);
    }
  },
  finally: () => {
    logger.info("[shutdown] processo encerrado de forma ordenada");
  }
});
