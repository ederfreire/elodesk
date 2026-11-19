import { Server as SocketIO } from "socket.io";
import { Server } from "http";
import AppError from "../errors/AppError";
import logger from "../utils/logger";
import { marcarPresente, marcarAusente } from "./presencaRamais";
import { instrument } from "@socket.io/admin-ui";
import User from "../models/User";
import {
  isBusy,
  setBusy,
  clearBusy,
  listExtensions,
  findUserByExtension
} from "./internalCalls";
import { ReceibedWhatsAppService } from "../services/WhatsAppOficial/ReceivedWhatsApp";
import { JwtPayload, verify } from "jsonwebtoken";
import authConfig, { authReady } from "../config/auth";
import BirthdayService from "../services/BirthdayService/BirthdayService";
import Ticket from "../models/Ticket";
import Contact from "../models/Contact";
import Whatsapp from "../models/Whatsapp";
import WhatsappLidMap from "../models/WhatsapplidMap";

let io: SocketIO;

// authConfig.secret só é preenchido depois do Redis responder (ver
// config/auth.ts). Vários pontos deste arquivo fazem `verify(token,
// authConfig.secret)` — sem esperar isso, um socket que conecta nos
// primeiros ~1s após um restart do backend cai num `catch` genérico
// ("Error in socket connect"/"Error in handleHeartbeat" no log) e NUNCA
// entra nas salas `company-X`/`user-Y`. O socket fica "conectado" mas
// zumbi: nada de tempo real (chamadas, status SIP, mensagens) chega mais
// pra ele até o usuário dar F5 — foi isso que causou o relato de "SIP
// tocou a primeira ligação e parou de funcionar" depois de um deploy.
// `ensureAuthSecretReady()` espera a inicialização terminar (até 8s) em
// vez de deixar esses pontos falharem silenciosamente nessa janela.
const ensureAuthSecretReady = async (): Promise<boolean> => {
  if (authConfig.secret) return true;
  try {
    await Promise.race([
      authReady,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("AUTH_NOT_READY_TIMEOUT")), 8000)
      )
    ]);
  } catch (e) {
    return false;
  }
  return !!authConfig.secret;
};

// Baileys: a assinatura de presença expira em ~55s. Renovamos bem antes disso.
const PRESENCE_REFRESH_INTERVAL_MS = 30 * 1000;
// Mantemos o bot global como "available" para continuar recebendo presence.update.
// Documentação Baileys: sendPresenceUpdate('available') é GLOBAL (sem jid).
const PRESENCE_AVAILABLE_INTERVAL_MS = 60 * 1000;

type PresenceSubscriptionEntry = {
  companyId: number;
  ticketId?: number | string;
  whatsappId: number;
  // "whatsapp" (Baileys, default) ou "wacalls" (WhatsApp Plus) — decide qual
  // caminho refreshPresenceSubscription usa pra (re)assinar. wacallsSessionId
  // só é preenchido/necessário no segundo caso.
  channel: string;
  wacallsSessionId?: string | null;
  candidates: Set<string>;
  socketIds: Set<string>;
  lastSubscribeAt: number;
};

const presenceSubscriptions = new Map<string, PresenceSubscriptionEntry>();
const lastAvailableByWhatsapp = new Map<number, number>();
let presenceRefreshTimer: NodeJS.Timeout | null = null;

// Cache da última presença conhecida por ticket. Usado para reenviar o estado
// imediatamente quando o frontend assina/abre o ticket após um refresh, sem
// ter que esperar um novo evento do WhatsApp.
type CachedPresence = {
  presence: string;
  lastSeen: number | null;
  contactId: number | null;
  ts: number;
};
const PRESENCE_CACHE_TTL_MS = 60 * 60 * 1000;
const lastPresenceByTicket = new Map<string, CachedPresence>();

const presenceCacheKey = (companyId: number | string, ticketId: number | string) =>
  `${companyId}:${ticketId}`;

export const setLastPresence = (
  companyId: number,
  ticketId: number,
  presence: string,
  lastSeen: number | null,
  contactId: number | null
) => {
  lastPresenceByTicket.set(presenceCacheKey(companyId, ticketId), {
    presence,
    lastSeen,
    contactId,
    ts: Date.now()
  });
};

export const getLastPresence = (
  companyId: number | string,
  ticketId: number | string
): CachedPresence | null => {
  const entry = lastPresenceByTicket.get(presenceCacheKey(companyId, ticketId));
  if (!entry) return null;
  if (Date.now() - entry.ts > PRESENCE_CACHE_TTL_MS) {
    lastPresenceByTicket.delete(presenceCacheKey(companyId, ticketId));
    return null;
  }
  return entry;
};

// Permite que o ciclo de vida do wbot (init/reconnect) invalide o cache de
// "available" para forçar reenvio imediato após a sessão voltar.
export const resetPresenceAvailableCache = (whatsappId?: number) => {
  if (typeof whatsappId === "number") {
    lastAvailableByWhatsapp.delete(whatsappId);
  } else {
    lastAvailableByWhatsapp.clear();
  }
};

const getPresenceSubscriptionKey = (
  companyId: number,
  whatsappId: number,
  ticketId: number | string | undefined,
  candidates: Set<string>
) => `${companyId}:${whatsappId}:${ticketId || Array.from(candidates).sort().join("|")}`;

const refreshPresenceSubscription = async (entry: PresenceSubscriptionEntry, reason: "client" | "keepalive") => {
  // WhatsApp Plus (wacalls): caminho totalmente separado do Baileys — usa o
  // proxy HTTP pro wacalls-chat em vez de getWbot/wbot.presenceSubscribe.
  // O Go já cuida de marcar a sessão "available" e assinar o JID num único
  // request (ver handlePresenceSubscribe em contactsync.go), então não
  // precisa do passo 1 (sendPresenceUpdate global) que o bloco Baileys faz
  // abaixo.
  if (entry.channel === "wacalls") {
    if (!entry.wacallsSessionId) return;
    try {
      const { presenceSubscribe: wacallsPresenceSubscribe } = await import(
        "../services/WacallsServices/WacallsChatCallService"
      );
      for (const jid of entry.candidates) {
        try {
          await wacallsPresenceSubscribe(entry.wacallsSessionId, jid);
          entry.lastSubscribeAt = Date.now();
          if (reason === "client") {
            logger.debug(`[PRESENCE-SOCKET] (wacalls) inscrito jid=${jid} ticket=${entry.ticketId || "null"}`);
          }
        } catch (err) {
          logger.debug(`[PRESENCE-SOCKET] (wacalls) falha ao renovar jid=${jid} whatsapp=${entry.whatsappId}: ${err?.message || err}`);
        }
      }
    } catch (err) {
      logger.debug(`[PRESENCE-SOCKET] (wacalls) refresh falhou whatsapp=${entry.whatsappId}: ${err?.message || err}`);
    }
    return;
  }

  try {
    const { getWbot } = await import("./wbot");
    const wbot = getWbot(entry.whatsappId);

    if (!wbot || typeof wbot.presenceSubscribe !== "function") {
      logger.debug(`[PRESENCE-SOCKET] wbot indisponível no refresh whatsapp=${entry.whatsappId}`);
      return;
    }

    const now = Date.now();
    const lastAvailable = lastAvailableByWhatsapp.get(entry.whatsappId) || 0;

    // 1) Manter o bot GLOBALMENTE "available" (sem jid). Sem isso, o WhatsApp
    //    não entrega presence.update de outros contatos para esta sessão.
    // Quando o motivo é "client" (assinatura disparada pelo frontend), forçamos
    // o envio ignorando o cache para garantir recuperação após qualquer falha
    // ou reconexão da sessão WhatsApp.
    const shouldSendAvailable =
      typeof wbot.sendPresenceUpdate === "function" &&
      (reason === "client" || now - lastAvailable > PRESENCE_AVAILABLE_INTERVAL_MS);
    if (shouldSendAvailable) {
      try {
        await wbot.sendPresenceUpdate("available");
        lastAvailableByWhatsapp.set(entry.whatsappId, now);
      } catch (err) {
        logger.debug(`[PRESENCE-SOCKET] falha ao marcar bot available whatsapp=${entry.whatsappId}: ${err?.message || err}`);
      }
    }

    // 2) Assinar a presença do(s) JID(s) do contato. NÃO usar
    //    sendPresenceUpdate('available', jid) aqui: isso é "chatstate" do bot
    //    naquele chat e atrapalha o recebimento da presença do contato.
    for (const jid of entry.candidates) {
      try {
        await wbot.presenceSubscribe(jid);
        entry.lastSubscribeAt = now;
        if (reason === "client") {
          logger.debug(`[PRESENCE-SOCKET] inscrito jid=${jid} ticket=${entry.ticketId || "null"}`);
        }
      } catch (err) {
        logger.debug(`[PRESENCE-SOCKET] falha ao renovar jid=${jid} whatsapp=${entry.whatsappId}: ${err?.message || err}`);
      }
    }
  } catch (err) {
    logger.debug(`[PRESENCE-SOCKET] refresh falhou whatsapp=${entry.whatsappId}: ${err?.message || err}`);
  }
};

const startPresenceKeepAlive = () => {
  if (presenceRefreshTimer) return;

  presenceRefreshTimer = setInterval(() => {
    presenceSubscriptions.forEach(entry => {
      refreshPresenceSubscription(entry, "keepalive");
    });
  }, PRESENCE_REFRESH_INTERVAL_MS);

  if (presenceRefreshTimer.unref) presenceRefreshTimer.unref();
};

// Em desconexões curtas (refresh, troca de aba, oscilação de rede) o socket
// reconecta em poucos segundos e reassina a presença. Apagar a entrada na hora
// criava um gap em que o keepalive parava de renovar a assinatura no Baileys,
// fazendo a presença "morrer" depois de um tempo. Aplicamos uma carência:
// removemos só se ninguém reassinar nesta chave em até 30s.
const PRESENCE_SUBSCRIPTION_GRACE_MS = 30 * 1000;
const removeSocketPresenceSubscriptions = (socketId: string) => {
  presenceSubscriptions.forEach((entry, key) => {
    if (entry.socketIds.delete(socketId) && entry.socketIds.size === 0) {
      const snapshot = entry;
      setTimeout(() => {
        const current = presenceSubscriptions.get(key);
        if (current && current === snapshot && current.socketIds.size === 0) {
          presenceSubscriptions.delete(key);
          logger.info(`[PRESENCE-SOCKET] assinatura removida (após grace) key=${key}`);
        }
      }, PRESENCE_SUBSCRIPTION_GRACE_MS);
    }
  });
};

export const initIO = (httpServer: Server): SocketIO => {
  io = new SocketIO(httpServer, {
    cors: {
      origin: process.env.FRONTEND_URL
    },
    // `pingInterval` e `pingTimeout` são opções DE SERVIDOR no socket.io v3/v4.
    // Estavam definidas no cliente (frontend SocketContext.js), onde a
    // biblioteca simplesmente as ignora — ou seja, alguém quis ajustar o
    // keep-alive e o ajuste nunca teve efeito nenhum. Aqui é o lugar certo.
    //
    // 20s de intervalo + 25s de tolerância: uma aba fechada, um notebook que
    // dormiu ou uma rede que caiu são detectados em ~45s no pior caso, e o
    // servidor libera o socket e as salas. Sem isso vale o padrão (25s/20s),
    // que é parecido — o ganho aqui é ter o valor explícito e num lugar onde
    // mexer nele realmente muda alguma coisa.
    pingInterval: parseInt(process.env.SOCKET_PING_INTERVAL_MS || "20000", 10),
    pingTimeout: parseInt(process.env.SOCKET_PING_TIMEOUT_MS || "25000", 10)
  });

  startPresenceKeepAlive();

  if (process.env.SOCKET_ADMIN && JSON.parse(process.env.SOCKET_ADMIN)) {
    User.findByPk(1).then(
      (adminUser) => {
        instrument(io, {
          auth: {
            type: "basic",
            username: adminUser.email,
            password: adminUser.passwordHash
          },
          mode: "development",
        });
      }
    );
  }

  const workspaces = io.of(/^\/\w+$/);
  workspaces.on("connection", socket => {

    const token_api_oficial = process.env.TOKEN_API_OFICIAL || "";
    const token = Array.isArray(socket?.handshake?.query?.token) ? socket.handshake.query.token[1] : socket?.handshake?.query?.token?.split(" ")[1];

    if (!token) {
      return socket.disconnect();
    }

    // Cache do resultado da verificação do JWT deste socket. O Ticketz
    // upstream (projeto base, github.com/ticketz-oss/ticketz) verifica o
    // token UMA ÚNICA VEZ, na conexão, e guarda o resultado (userId) no
    // closure — o handler de disconnect nem chama verify() de novo, só usa
    // o que já foi resolvido. Nosso fork tinha 4 chamadas independentes de
    // verify(token, authConfig.secret) (aqui embaixo, handleHeartbeat,
    // initializeClientConnection e no disconnect) — cada uma um ponto de
    // falha separado contra a janela de boot em que authConfig.secret ainda
    // não carregou do Redis. Bastava esquecer de blindar UMA delas pra
    // reabrir o bug do socket "zumbi" / "Error in socket disconnect" (foi
    // o que aconteceu no v103, corrigido só parcialmente no v107). Unificamos
    // numa função só, seguindo o padrão do upstream.
    let resolvedUserId: number | null = null;

    const resolveAuthedUserId = async (): Promise<number | null> => {
      if (resolvedUserId !== null) return resolvedUserId;
      if (token === token_api_oficial) return null;
      if (!(await ensureAuthSecretReady())) return null;
      try {
        const decoded = verify(token, authConfig.secret);
        const decodedPayload = decoded as JwtPayload;
        resolvedUserId = decodedPayload.id;
        return resolvedUserId;
      } catch (error) {
        return null;
      }
    };

    if (token !== token_api_oficial) {
      // Janela de boot: authConfig.secret só é preenchido depois do Redis
      // responder (ver config/auth.ts). Sem essa checagem, todo restart
      // do backend derrubava os primeiros sockets a conectar com "token
      // inválido" mesmo sendo um token perfeitamente válido — o secret é
      // que ainda não tinha carregado. Tratamos igual token expirado:
      // deixa reconectar em vez de desconectar de vez.
      if (!authConfig.secret) {
        logger.warn("Socket connection before JWT secret ready - allowing reconnect");
      } else {
        try {
          const decoded = verify(token, authConfig.secret);
          const companyId = socket.nsp.name.split("/")[1]

          const decodedPayload = decoded as JwtPayload;
          const companyIdToken = decodedPayload.companyId;

          if (+companyIdToken !== +companyId) {
            logger.error(`CompanyId do token ${companyIdToken} diferente da companyId do socket ${companyId}`)
            socket.emit("AUTH_ERROR", { message: "CompanyId mismatch" });
            return socket.disconnect();
          }

          // Já verificamos com sucesso aqui — guarda pra handleHeartbeat/
          // initializeClientConnection/disconnect não precisarem chamar
          // verify() de novo (mesmo padrão do Ticketz upstream).
          resolvedUserId = decodedPayload.id;
        } catch (error) {
          if (error.message === "jwt expired") {
            logger.warn("Socket connection with expired token - allowing reconnect");
          } else {
            logger.warn(`Socket auth failed: ${error.message} - disconnecting client`);
            socket.emit("AUTH_ERROR", { message: "invalid_token" });
            return socket.disconnect();
          }
        }
      }
    } else {
      logger.info(`Client connected namespace ${socket.nsp.name}`);
      logger.info(`Conectado com sucesso na API OFICIAL`);
    }

    //  ADICIONAR: Eventos de heartbeat e gerenciamento de usuários
    const handleHeartbeat = async (socket: any) => {
      try {
        const userId = await resolveAuthedUserId();
        if (!userId) {
          logger.debug("[handleHeartbeat] usuário ainda não autenticado — pulando este heartbeat");
          return;
        }
        const companyId = socket.nsp.name.split("/")[1];

        await User.update(
          {
            online: true,
            lastSeen: new Date()
          },
          { where: { id: userId } }
        );

        socket.broadcast.to(`company-${companyId}`).emit("user:online", {
          userId,
          lastSeen: new Date()
        });

        clearTimeout(socket.heartbeatTimeout);
        socket.heartbeatTimeout = setTimeout(async () => {
          await User.update(
            {
              online: false,
              lastSeen: new Date()
            },
            { where: { id: userId } }
          );
          socket.broadcast.to(`company-${companyId}`).emit("user:offline", {
            userId,
            lastSeen: new Date()
          });
        }, 30000);
      } catch (error) {
        logger.error("Error in handleHeartbeat:", error);
      }
    };

    //  NOVO: Handler para verificar aniversários quando usuário se conecta
    const checkAndEmitBirthdays = async (companyId: number) => {
      try {
        const birthdayData = await BirthdayService.getTodayBirthdaysForCompany(companyId);

        // Emitir eventos de aniversário se houver aniversariantes
        if (birthdayData.users.length > 0) {
          birthdayData.users.forEach(user => {
            io.of(`/${companyId}`).emit("user-birthday", {
              userId: user.id,
              userName: user.name,
              userAge: user.age
            });
            logger.info(` [GLOBAL] Emitido evento de aniversário para usuário: ${user.name}`);
          });
        }

        if (birthdayData.contacts.length > 0) {
          birthdayData.contacts.forEach(contact => {
            io.of(`/${companyId}`).emit("contact-birthday", {
              contactId: contact.id,
              contactName: contact.name,
              contactAge: contact.age
            });
            logger.info(` [GLOBAL] Emitido evento de aniversário para contato: ${contact.name}`);
          });
        }
      } catch (error) {
        logger.error(" Error checking birthdays:", error);
      }
    };

    //  EVENTO: Quando cliente se conecta. No servidor, o callback de
    //  workspaces.on("connection") já é a conexão; socket.on("connect") aqui
    //  não dispara após refresh e deixava o cliente sem salas/heartbeat.
    // Controle das retentativas de entrada nas salas (ver comentário dentro
    // de initializeClientConnection). ~10 tentativas x 3s cobre com folga a
    // janela de boot do backend sem ficar tentando pra sempre num socket
    // que de fato não tem token válido.
    let joinRetries = 0;
    const MAX_JOIN_RETRIES = 10;

    const initializeClientConnection = async () => {
      try {
        if (token !== token_api_oficial) {
          // Sem isso, um socket que conecta na janela de boot (secret
          // ainda carregando do Redis) cai direto no catch abaixo e NUNCA
          // dá socket.join(company-X/user-Y) — o socket fica "conectado"
          // só de fachada, sem receber mais nenhum evento em tempo real
          // (chamadas, status SIP, mensagens) até o usuário dar F5.
          const userId = await resolveAuthedUserId();
          if (!userId) {
            // NÃO desiste: sem entrar nas salas o socket fica "conectado"
            // só de fachada e NENHUM evento em tempo real chega (mensagem
            // nova, chamada, status) até o usuário dar F5 — era exatamente
            // o "mensagens não atualizam, tem que dar F5" relatado. Isso
            // acontece direto logo após um deploy/restart: as abas abertas
            // reconectam na janela de boot, quando o secret do JWT ainda
            // está carregando do Redis, e ficavam mortas pra sempre porque
            // essa função só rodava UMA vez por conexão. Reagenda até o
            // secret ficar pronto em vez de abandonar o socket.
            joinRetries += 1;
            if (joinRetries <= MAX_JOIN_RETRIES) {
              logger.warn(`[initializeClientConnection] auth ainda não pronta — tentativa ${joinRetries}/${MAX_JOIN_RETRIES}, reagendando entrada nas salas`);
              setTimeout(() => {
                initializeClientConnection();
              }, 3000);
            } else {
              // Esgotou as tentativas. O caso mais comum aqui NÃO é "secret
              // ainda carregando" (30s é muito mais do que o boot precisa) e
              // sim token expirado — aba deixada aberta que reconectou com
              // credencial velha. Nesse caso reagendar de novo não resolve
              // nunca.
              //
              // Antes o socket era simplesmente ABANDONADO: ficava aberto,
              // sem sala nenhuma, e o usuário não recebia mais nada — nem
              // mensagem, nem chamada — até dar F5 por conta própria. Do
              // ponto de vista dele o sistema tinha caído.
              //
              // Agora derruba o socket de propósito. O cliente socket.io
              // reconecta sozinho e refaz o handshake, aí sim com token
              // renovado. Se o token ainda estiver inválido, o front cai no
              // fluxo normal de sessão expirada em vez de ficar num limbo
              // silencioso.
              logger.error(
                "[initializeClientConnection] auth não ficou pronta a tempo — derrubando o socket para forçar novo handshake"
              );
              try {
                socket.emit("reauth-required");
                socket.disconnect(true);
              } catch (discErr: any) {
                logger.warn(
                  `[initializeClientConnection] falha ao derrubar socket: ${discErr?.message}`
                );
              }
            }
            return;
          }
          const companyId = parseInt(socket.nsp.name.split("/")[1]);

          socket.join(`company-${companyId}`);
          socket.join(`user-${userId}`);

          // Presença compartilhada entre processos (ver presencaRamais.ts).
          // Sem isso, com o backend em PM2 cluster, cada processo só enxerga
          // os próprios sockets e o ramal ficava piscando online/offline.
          await marcarPresente(companyId, Number(userId));

          // Marcar usuário como online no banco
          await User.update(
            {
              online: true,
              lastSeen: new Date()
            },
            { where: { id: userId } }
          );

          // Buscar dados do usuário
          const user = await User.findByPk(userId, {
            attributes: ["id", "name", "profileImage", "lastSeen"]
          });

          socket.broadcast.to(`company-${companyId}`).emit("user:online", {
            userId,
            lastSeen: new Date()
          });

          socket.broadcast.to(`company-${companyId}`).emit("user:new", {
            userId,
            user
          });

          // Buscar usuários online
          const onlineUsers = await User.findAll({
            where: {
              companyId,
              online: true
            },
            attributes: ["id", "name", "profileImage", "lastSeen"]
          });

          socket.emit("users:online", onlineUsers);

          // Iniciar heartbeat automaticamente
          handleHeartbeat(socket);

          //  NOVO: Verificar e emitir aniversários quando usuário se conecta
          await checkAndEmitBirthdays(companyId);
        }
      } catch (error) {
        logger.error("Error in socket connect:", error);
      }
    };

    initializeClientConnection();

    //  NOVO: Evento para solicitar verificação manual de aniversários
    socket.on("checkBirthdays", async () => {
      try {
        const companyId = parseInt(socket.nsp.name.split("/")[1]);
        await checkAndEmitBirthdays(companyId);
      } catch (error) {
        logger.error(" Error in manual birthday check:", error);
      }
    });

    // Eventos existentes
    socket.on("joinChatBox", (ticketId: string) => {
      socket.join(ticketId);
    });

    socket.on("joinNotification", () => {
      socket.join("notification");
    });

    socket.on("joinVersion", () => {
      logger.info(`A client joined version channel namespace ${socket.nsp.name}`);
      socket.join("version");
    });

    socket.on("joinTickets", (status: string) => {
      socket.join(status);
    });

    socket.on("joinTicketsLeave", (status: string) => {
      socket.leave(status);
    });

    socket.on("joinChatBoxLeave", (ticketId: string) => {
      socket.leave(ticketId);
      presenceSubscriptions.forEach((entry, key) => {
        if (String(entry.ticketId || "") === String(ticketId) && entry.socketIds.delete(socket.id) && entry.socketIds.size === 0) {
          presenceSubscriptions.delete(key);
          logger.info(`[PRESENCE-SOCKET] assinatura removida ao sair do ticket=${ticketId}`);
        }
      });
    });

    // ✅ presenceSubscribe: quando atendente abre um ticket, assinar presença do contato.
    // Em contas com Baileys v7, a presença pode vir pelo PN (número) ou pelo LID.
    socket.on("presenceSubscribe", async (data: { ticketId?: number | string; contactNumber: string; whatsappId: number; isGroup: boolean }) => {
      try {
        const companyId = parseInt(socket.nsp.name.split("/")[1]);
        if (!data?.contactNumber || !data?.whatsappId) {
          logger.warn(`[PRESENCE-SOCKET] payload inválido: ${JSON.stringify(data)}`);
          return;
        }

        // Freio de repetição.
        //
        // O frontend reemite presenceSubscribe várias vezes para o mesmo
        // ticket (visto no log: dez pedidos idênticos no mesmo segundo). Sem
        // freio, cada um refazia TRÊS consultas ao banco, reassinava a
        // presença no WhatsApp e escrevia cinco linhas de log. Multiplicado
        // por atendente e por conversa aberta, vira trabalho constante à toa.
        //
        // O registro fica preso ao próprio socket: quando o atendente sai, ele
        // some junto, sem risco de vazamento de memória.
        const JANELA_PRESENCA_MS = 10000;
        const registroSocket: Map<string, number> =
          (socket as any).__ultimoPresence ||
          ((socket as any).__ultimoPresence = new Map<string, number>());

        const chaveFreio = `${data.whatsappId}:${data.ticketId || data.contactNumber}`;
        const agora = Date.now();
        const anterior = registroSocket.get(chaveFreio) || 0;

        if (agora - anterior < JANELA_PRESENCA_MS) {
          // Mesmo assim devolve o último estado conhecido: é isso que o
          // frontend quer quando reemite, e custa quase nada.
          if (data.ticketId) {
            const emCache = getLastPresence(companyId, data.ticketId);
            if (emCache) {
              socket.emit(`company-${companyId}-presence`, {
                ticketId: data.ticketId,
                contactId: emCache.contactId,
                presence: emCache.presence,
                lastSeen: emCache.lastSeen
              });
            }
          }
          return;
        }

        registroSocket.set(chaveFreio, agora);
        logger.debug(
          `[PRESENCE-SOCKET] presenceSubscribe company=${companyId} ticket=${data.ticketId || "null"} whatsapp=${data.whatsappId}`
        );

        const whatsapp = await Whatsapp.findByPk(data.whatsappId, {
          attributes: ["id", "channel", "wacallsChatSessionId"]
        });
        if (!whatsapp) {
          logger.debug(`[PRESENCE-SOCKET] whatsapp não encontrado id=${data.whatsappId}`);
          return;
        }
        const isWacalls = whatsapp.channel === "wacalls";

        if (isWacalls) {
          if (!whatsapp.wacallsChatSessionId) {
            logger.debug(`[PRESENCE-SOCKET] (wacalls) sessão ainda não pareada whatsappId=${data.whatsappId}`);
            return;
          }
        } else {
          const { getWbot } = await import("./wbot");
          let wbot;
          try { wbot = getWbot(data.whatsappId); } catch (err) {
            // Presença é não-crítica: se a sessão ainda não está pronta, apenas
            // ignorar silenciosamente (debug) para não poluir os logs com
            // ERR_WAPP_NOT_INITIALIZED durante abertura de ticket/gravação.
            logger.debug(`[PRESENCE-SOCKET] sessão ainda não pronta whatsappId=${data.whatsappId}: ${err?.message || err}`);
            wbot = null;
          }
          if (!wbot || typeof wbot.presenceSubscribe !== "function") {
            logger.debug(`[PRESENCE-SOCKET] wbot indisponível ou sem presenceSubscribe whatsappId=${data.whatsappId}`);
            return;
          }
        }

        const ticket = data.ticketId
          ? await Ticket.findOne({
              where: { id: data.ticketId, companyId },
              include: [{ model: Contact, as: "contact" }]
            })
          : null;
        const contact = ticket?.contact;
        const lidMap = contact?.id
          ? await WhatsappLidMap.findOne({ where: { contactId: contact.id, companyId } })
          : null;

        const candidates = new Set<string>();
        if (data.isGroup) {
          candidates.add(`${data.contactNumber}@g.us`);
        } else {
          if (contact?.remoteJid) candidates.add(contact.remoteJid);
          if (contact?.lid) candidates.add(contact.lid.includes("@") ? contact.lid : `${contact.lid}@lid`);
          if (lidMap?.lid) candidates.add(lidMap.lid.includes("@") ? lidMap.lid : `${lidMap.lid}@lid`);
          candidates.add(`${data.contactNumber}@s.whatsapp.net`);
        }

        logger.debug(`[PRESENCE-SOCKET] candidatos ticket=${data.ticketId || "null"} contact=${contact?.id || "null"} whatsapp=${data.whatsappId}: ${JSON.stringify(Array.from(candidates))}`);

        const key = getPresenceSubscriptionKey(companyId, data.whatsappId, data.ticketId, candidates);
        const entry = presenceSubscriptions.get(key) || {
          companyId,
          ticketId: data.ticketId,
          whatsappId: data.whatsappId,
          channel: isWacalls ? "wacalls" : "whatsapp",
          wacallsSessionId: isWacalls ? whatsapp.wacallsChatSessionId : null,
          candidates: new Set<string>(),
          socketIds: new Set<string>(),
          lastSubscribeAt: 0
        };

        candidates.forEach(jid => entry.candidates.add(jid));
        entry.socketIds.add(socket.id);
        presenceSubscriptions.set(key, entry);

        await refreshPresenceSubscription(entry, "client");

        // Reemitir imediatamente o último estado de presença conhecido para
        // este ticket, garantindo que após um refresh o frontend volte a
        // exibir "online/digitando/gravando" sem esperar um novo evento.
        if (data.ticketId) {
          const cached = getLastPresence(companyId, data.ticketId);
          if (cached) {
            socket.emit(`company-${companyId}-presence`, {
              ticketId: data.ticketId,
              contactId: cached.contactId,
              presence: cached.presence,
              lastSeen: cached.lastSeen
            });
            logger.debug(`[PRESENCE-SOCKET] reenviado cache ticket=${data.ticketId} state=${cached.presence}`);
          }
        }
      } catch (err) {
        logger.error(`[PRESENCE-SOCKET] erro geral no presenceSubscribe: ${err?.message || err}`);
      }
    });

    // ===================================================================
    // RAMAIS INTERNOS — ligação entre atendentes (ver libs/internalCalls.ts)
    //
    // O servidor só faz a sinalização: leva oferta/resposta/ICE de um lado
    // pro outro. O áudio e o vídeo vão diretos entre os navegadores.
    // Todo evento valida que os dois estão na MESMA empresa, senão um
    // atendente conseguiria alcançar o ramal de outro cliente.
    // ===================================================================
    const ramalCompanyId = () => parseInt(socket.nsp.name.split("/")[1]);

    const ramalUserId = async (): Promise<number | null> => {
      const uid = await resolveAuthedUserId();
      return uid ? Number(uid) : null;
    };

    // Confere se o destino existe e é da mesma empresa antes de repassar
    // qualquer coisa pra ele.
    const ramalDestinoValido = async (toUserId: any): Promise<boolean> => {
      const alvo = Number(toUserId);
      if (!Number.isInteger(alvo) || alvo <= 0) return false;
      try {
        const u = await User.findOne({
          where: { id: alvo, companyId: ramalCompanyId() },
          attributes: ["id"]
        });
        return !!u;
      } catch {
        return false;
      }
    };

    // Lista de ramais com situação (online / em ligação)
    /**
     * Quem está REALMENTE online agora.
     *
     * Cada socket entra na sala `user-{id}` ao conectar. Percorrer as salas
     * do namespace da empresa dá a foto exata deste instante — diferente do
     * campo User.online no banco, que depende de a desconexão ter sido
     * registrada direito e fica mentindo depois de queda de rede, aba
     * fechada à força ou restart do backend. Era isso que fazia o ramal
     * "às vezes aparecer online e às vezes não" com o atendente logado.
     */
    const usuariosComSocketAberto = (companyId: number): Set<number> => {
      const ids = new Set<number>();
      try {
        const salas = io.of(String(companyId)).adapter?.rooms;
        if (!salas) return ids;
        for (const [nome, membros] of salas) {
          if (!nome.startsWith("user-")) continue;
          if (!membros || membros.size === 0) continue;
          const id = Number(nome.slice(5));
          if (id > 0) ids.add(id);
        }
      } catch (err: any) {
        logger.warn(`[RAMAL] não consegui ler presença de socket: ${err?.message}`);
      }
      return ids;
    };

    socket.on("ramais:list", async () => {
      try {
        const me = await ramalUserId();
        const empresa = ramalCompanyId();
        // A tela consulta de tempos em tempos, então esta é a batida de ponto
        // que renova a validade da presença antes de ela expirar.
        if (me) await marcarPresente(empresa, Number(me));
        const lista = await listExtensions(
          empresa,
          me || undefined,
          usuariosComSocketAberto(empresa)
        );
        socket.emit("ramais:list", lista);
      } catch (err: any) {
        logger.warn(`[RAMAL] falha ao listar: ${err?.message}`);
        socket.emit("ramais:list", []);
      }
    });

    // Início da chamada: quem liga manda a oferta (SDP) pro destino
    socket.on("ramais:call", async (data: {
      toUserId?: number;
      extension?: string;
      callId?: string;
      sdp?: any;
      video?: boolean;
    }) => {
      try {
        const companyId = ramalCompanyId();
        const fromUserId = await ramalUserId();
        if (!fromUserId || !data?.callId || !data?.sdp) return;

        // Aceita chamar por id direto ou pelo número do ramal digitado.
        let destinoId = Number(data.toUserId || 0);
        if (!destinoId && data.extension) {
          const alvo = await findUserByExtension(companyId, data.extension);
          if (!alvo) {
            socket.emit("ramais:failed", { callId: data.callId, reason: "not-found" });
            return;
          }
          destinoId = Number(alvo.id);
        }

        if (!(await ramalDestinoValido(destinoId))) {
          socket.emit("ramais:failed", { callId: data.callId, reason: "not-found" });
          return;
        }
        if (destinoId === fromUserId) {
          socket.emit("ramais:failed", { callId: data.callId, reason: "self" });
          return;
        }
        if (isBusy(destinoId)) {
          socket.emit("ramais:failed", { callId: data.callId, reason: "busy" });
          return;
        }

        const quemLiga = await User.findByPk(fromUserId, {
          attributes: ["id", "name", "internalExtension", "profileImage"]
        });

        setBusy(fromUserId, data.callId, destinoId);
        setBusy(destinoId, data.callId, fromUserId);

        io.of(String(companyId)).to(`user-${destinoId}`).emit("ramais:incoming", {
          callId: data.callId,
          fromUserId,
          fromName: quemLiga?.name || "Atendente",
          fromExtension: quemLiga?.internalExtension || "",
          fromImage: quemLiga?.profileImage || null,
          video: !!data.video,
          sdp: data.sdp
        });
        logger.info(`[RAMAL] ${fromUserId} chamando ${destinoId} (call ${data.callId})`);
      } catch (err: any) {
        logger.warn(`[RAMAL] falha em ramais:call: ${err?.message}`);
      }
    });

    // Destino aceitou: devolve a resposta (SDP) pra quem ligou
    socket.on("ramais:answer", async (data: { toUserId?: number; callId?: string; sdp?: any }) => {
      try {
        const fromUserId = await ramalUserId();
        if (!fromUserId || !data?.callId || !data?.sdp) return;
        if (!(await ramalDestinoValido(data.toUserId))) return;
        io.of(String(ramalCompanyId())).to(`user-${Number(data.toUserId)}`).emit("ramais:answered", {
          callId: data.callId,
          fromUserId,
          sdp: data.sdp
        });
      } catch (err: any) {
        logger.warn(`[RAMAL] falha em ramais:answer: ${err?.message}`);
      }
    });

    // Candidatos de rede (ICE) — trocados nos dois sentidos durante a
    // negociação. Sem isso a ligação conecta só quando os dois estão na
    // mesma rede local.
    socket.on("ramais:ice", async (data: { toUserId?: number; callId?: string; candidate?: any }) => {
      try {
        const fromUserId = await ramalUserId();
        if (!fromUserId || !data?.callId || !data?.candidate) return;
        if (!(await ramalDestinoValido(data.toUserId))) return;
        io.of(String(ramalCompanyId())).to(`user-${Number(data.toUserId)}`).emit("ramais:ice", {
          callId: data.callId,
          fromUserId,
          candidate: data.candidate
        });
      } catch { /* candidato perdido não derruba a ligação */ }
    });

    // Encerrar / recusar — vale pros dois lados
    socket.on("ramais:hangup", async (data: { toUserId?: number; callId?: string; reason?: string }) => {
      try {
        const fromUserId = await ramalUserId();
        if (!fromUserId) return;
        clearBusy(fromUserId);
        const alvo = Number(data?.toUserId || 0);
        if (alvo) {
          clearBusy(alvo);
          if (await ramalDestinoValido(alvo)) {
            io.of(String(ramalCompanyId())).to(`user-${alvo}`).emit("ramais:hangup", {
              callId: data?.callId,
              fromUserId,
              reason: data?.reason || "ended"
            });
          }
        }
      } catch (err: any) {
        logger.warn(`[RAMAL] falha em ramais:hangup: ${err?.message}`);
      }
    });

    // Transferência: avisa o terceiro atendente que uma ligação está sendo
    // passada pra ele. Quem recebe decide aceitar; a mídia é renegociada do
    // zero entre os dois novos participantes.
    socket.on("ramais:transfer", async (data: {
      toUserId?: number;
      targetUserId?: number;
      callId?: string;
    }) => {
      try {
        const fromUserId = await ramalUserId();
        if (!fromUserId || !data?.targetUserId) return;
        if (!(await ramalDestinoValido(data.targetUserId))) return;
        if (isBusy(Number(data.targetUserId))) {
          socket.emit("ramais:failed", { callId: data.callId, reason: "busy" });
          return;
        }
        const quem = await User.findByPk(fromUserId, { attributes: ["id", "name"] });
        io.of(String(ramalCompanyId())).to(`user-${Number(data.targetUserId)}`).emit("ramais:transferRequest", {
          callId: data.callId,
          fromUserId,
          fromName: quem?.name || "Atendente",
          originalPeerId: Number(data.toUserId) || null
        });
      } catch (err: any) {
        logger.warn(`[RAMAL] falha em ramais:transfer: ${err?.message}`);
      }
    });

    // Mesmo fluxo do Ticketz: o frontend informa quando o atendente está
    // digitando/gravando e o backend repassa o chatstate para o WhatsApp.
    socket.on("presenceUpdate", async (data: { ticketId?: number | string; presence?: "available" | "unavailable" | "composing" | "recording" | "paused" }) => {
      try {
        const companyId = parseInt(socket.nsp.name.split("/")[1]);
        const allowedPresence = ["available", "unavailable", "composing", "recording", "paused"];

        if (!data?.ticketId || !data?.presence || !allowedPresence.includes(data.presence)) {
          logger.warn(`[PRESENCE-SOCKET] presenceUpdate inválido: ${JSON.stringify(data)}`);
          return;
        }

        const ticket = await Ticket.findOne({
          where: { id: data.ticketId, companyId },
          include: [{ model: Contact, as: "contact" }]
        });

        if (!ticket?.contact) return;

        const { getWbot } = await import("./wbot");
        const { getJidOf } = await import("../services/WbotServices/getJidOf");
        let wbot;
        try {
          wbot = getWbot(ticket.whatsappId);
        } catch (err) {
          logger.debug(`[PRESENCE-SOCKET] presenceUpdate ignorado; sessão ainda não pronta whatsappId=${ticket.whatsappId}: ${err?.message || err}`);
          return;
        }
        const jid = getJidOf(ticket);

        // Baileys não aceita chatstate enviado para LID em alguns cenários;
        // o Ticketz também ignora LID aqui.
        if (!jid || jid.endsWith("@lid")) return;

        if (typeof wbot.sendPresenceUpdate === "function") {
          await wbot.sendPresenceUpdate(data.presence, jid);
        }
      } catch (err) {
        logger.debug(`[PRESENCE-SOCKET] presenceUpdate ignorado: ${err?.message || err}`);
      }
    });

    socket.on("receivedMessageWhatsAppOficial", (data: any) => {
      const receivedService = new ReceibedWhatsAppService();
      receivedService.getMessage(data);
    });

    socket.on("readMessageWhatsAppOficial", (data: any) => {
      const receivedService = new ReceibedWhatsAppService();
      receivedService.readMessage(data);
    });

    // ------------------------------------------------------------------
    // CHAMADAS DA API OFICIAL (WhatsApp Business Calling API)
    // ------------------------------------------------------------------

    // A empresa vem do namespace do socket — cada empresa tem o seu.
    // Precisa ser lido aqui: o `companyId` declarado mais acima está dentro
    // de outro handler e não alcança este trecho.
    const empresaDoSocket = () => parseInt(socket.nsp.name.split("/")[1]);

    // Evento vindo do api_oficial (webhook da Meta): cliente ligou ou a
    // chamada terminou. Import tardio pelo mesmo motivo dos outros deste
    // arquivo: socket.ts é carregado cedo e não pode depender, na
    // inicialização, de módulos que voltem a importá-lo.
    socket.on("callWhatsAppOficial", async (data: any) => {
      try {
        const empresa = empresaDoSocket();
        if (!empresa) return;
        const { HandleOfficialCall } = await import(
          "../services/WhatsAppOficial/HandleOfficialCall"
        );
        await HandleOfficialCall(empresa, data);
      } catch (err: any) {
        logger.warn(`[OFFICIAL-CALL] falha ao tratar evento: ${err?.message}`);
      }
    });

    /**
     * Carrega a conexão oficial e confere que ela é da empresa deste socket.
     * Nunca aceitar o whatsappId do cliente sem validar — senão um atendente
     * de uma empresa conseguiria discar pela conexão de outra.
     */
    const conexaoOficialDoSocket = async (whatsappId: any) => {
      const { default: Whatsapp } = await import("../models/Whatsapp");
      const wa = await Whatsapp.findOne({
        where: { id: Number(whatsappId), companyId: empresaDoSocket() }
      });
      return wa || null;
    };

    // Atendente aceitou: manda pre_accept e depois accept com a resposta SDP.
    //
    // Os dois passos são intencionais. O pre_accept estabelece a mídia antes
    // do aceite; sem ele o áudio só flui após o accept e o cliente perde as
    // primeiras palavras. É a recomendação explícita da Meta.
    // ------------------------------------------------------------------
    // ÁUDIO DO WHATSAPP PLUS POR WEBSOCKET (plano B do WebRTC)
    //
    // Quando o WebRTC (UDP) não conecta — firewall, rede corporativa — o
    // navegador manda/recebe o áudio (PCM Int16 LE 16 kHz mono) por este
    // socket, e o backend repassa para o wacalls-chat por WebSocket
    // (GET /api/sessions/{sid}/calls/{id}/audio), com o cookie da conta de
    // serviço. Ideia do transporte WebSocket do ArendCalls (MIT).
    // ------------------------------------------------------------------
    const audiosWacalls = new Map<string, any>();
    const fecharAudioWacalls = (callId: string) => {
      const ws = audiosWacalls.get(callId);
      audiosWacalls.delete(callId);
      try {
        ws?.close(1000, "client_closed");
      } catch (_) {
        /* já fechado */
      }
    };

    socket.on("wacalls-audio:open", async (data: { sessionId?: string; callId?: string }) => {
      const callId = String(data?.callId || "");
      const sessionId = String(data?.sessionId || "");
      const falhar = (error: string) => socket.emit("wacalls-audio:error", { callId, error });
      try {
        if (!callId || !sessionId) return falhar("dados incompletos");
        const uid = await resolveAuthedUserId();
        if (!uid) return falhar("unauthorized");
        // A sessão do WhatsApp Plus tem que ser de uma conexão DESTA empresa.
        const wa = await Whatsapp.findOne({
          where: { wacallsSessionId: sessionId, companyId: empresaDoSocket() } as any,
          attributes: ["id"]
        });
        if (!wa) return falhar("sessão não pertence a esta empresa");

        const base = String(process.env.WACALLS_CHAT_URL || "").replace(/\/$/, "").replace(/^http/i, "ws");
        if (!base) return falhar("serviço de chamadas não configurado");
        const { ensureCookie } = await import("../services/WacallsServices/WacallsChatCallService");
        const cookie = await ensureCookie();
        const u = await User.findByPk(Number(uid), { attributes: ["name", "profileImage"] });
        const qs = new URLSearchParams({
          memberId: `user:${uid}`,
          userId: String(uid),
          name: String((u as any)?.name || ""),
          avatar: String((u as any)?.profileImage || "")
        });
        // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
        const WebSocketCliente = require("ws");
        fecharAudioWacalls(callId);
        const ws = new WebSocketCliente(
          `${base}/api/sessions/${encodeURIComponent(sessionId)}/calls/${encodeURIComponent(callId)}/audio?${qs.toString()}`,
          { headers: { Cookie: cookie }, perMessageDeflate: false }
        );
        audiosWacalls.set(callId, ws);
        ws.on("open", () => socket.emit("wacalls-audio:opened", { callId }));
        ws.on("message", (msg: any, isBinary: boolean) => {
          if (!isBinary) {
            try {
              socket.emit("wacalls-audio:config", { callId, ...JSON.parse(String(msg)) });
            } catch (_) {
              /* ignora */
            }
            return;
          }
          socket.volatile.emit("wacalls-audio:pcm", { callId, pcm: msg });
        });
        ws.on("close", (code: number, reason: any) => {
          if (audiosWacalls.get(callId) === ws) audiosWacalls.delete(callId);
          socket.emit("wacalls-audio:closed", { callId, code, reason: String(reason || "") });
        });
        ws.on("error", (err: any) => {
          logger.warn(`[WACALLS-AUDIO] ligação ${callId}: ${err?.message}`);
          falhar(err?.message || "erro no áudio");
        });
      } catch (err: any) {
        logger.warn(`[WACALLS-AUDIO] não abriu o áudio da ligação ${callId}: ${err?.message}`);
        falhar(err?.message || "erro ao abrir o áudio");
      }
      return undefined;
    });

    socket.on("wacalls-audio:pcm", (data: { callId?: string; pcm?: any }) => {
      const ws = audiosWacalls.get(String(data?.callId || ""));
      if (!ws || ws.readyState !== 1 || !data?.pcm) return;
      try {
        ws.send(data.pcm, { binary: true });
      } catch (_) {
        /* quadro perdido */
      }
    });

    socket.on("wacalls-audio:close", (data: { callId?: string }) => {
      fecharAudioWacalls(String(data?.callId || ""));
    });

    socket.on("disconnect", () => {
      Array.from(audiosWacalls.keys()).forEach(fecharAudioWacalls);
    });

    socket.on("official-call:accept", async (data: {
      whatsappId?: number;
      callId?: string;
      sdp?: string;
    }) => {
      try {
        if (!data?.callId || !data?.sdp) return;
        const wa = await conexaoOficialDoSocket(data.whatsappId);
        if (!wa) {
          socket.emit("official-call:failed", {
            callId: data.callId,
            error: "Conexão não encontrada"
          });
          return;
        }

        const svc = await import("../services/WhatsAppOficial/OfficialCallService");

        const pre = await svc.preAceitar(wa, data.callId, data.sdp);
        if (!pre.success) {
          // pre_accept é otimização, não obrigação: se falhar, ainda dá pra
          // atender. Só registra e segue.
          logger.warn(`[OFFICIAL-CALL] pre_accept falhou: ${pre.error}`);

          // Exceção: 401/token vencido não é falha de otimização — o accept
          // logo abaixo vai falhar pelo mesmo motivo. Avisa a tela agora, com
          // o motivo, em vez de deixar a ligação morrer em silêncio.
          if (pre.status === 401) {
            socket.emit("official-call:failed", {
              callId: data.callId,
              error: pre.error
            });
            return;
          }
        }

        const aceite = await svc.aceitar(wa, data.callId, data.sdp);
        if (!aceite.success) {
          socket.emit("official-call:failed", {
            callId: data.callId,
            error: aceite.error
          });
          return;
        }

        const uid = await resolveAuthedUserId();
        await svc.registrarChamada({
          callId: data.callId,
          companyId: empresaDoSocket(),
          whatsappId: wa.id,
          userId: uid ? Number(uid) : undefined,
          status: "connected"
        });

        socket.emit("official-call:accepted", { callId: data.callId });

        // Avisa os OUTROS atendentes que a ligação já foi atendida: sem isto
        // ela seguia tocando na tela de todo mundo.
        try {
          const cid = empresaDoSocket();
          socket.nsp.emit(`company-${cid}-official-call`, {
            action: "taken",
            callId: data.callId,
            userId: uid ? Number(uid) : null
          });
        } catch (e: any) {
          logger.warn(`[OFFICIAL-CALL] falha ao avisar que a ligação foi atendida: ${e?.message}`);
        }
      } catch (err: any) {
        logger.warn(`[OFFICIAL-CALL] erro no accept: ${err?.message}`);
        socket.emit("official-call:failed", {
          callId: data?.callId,
          error: err?.message
        });
      }
    });

    // Pedido de permissão para ligar. Sem isso a Meta recusa toda ligação
    // iniciada pela empresa, mesmo com o contato conversando com a gente.
    socket.on("official-call:request-permission", async (data: {
      whatsappId?: number;
      number?: string;
    }) => {
      try {
        const wa = await conexaoOficialDoSocket(data?.whatsappId);
        if (!wa) {
          socket.emit("official-call:permission-result", {
            success: false,
            error: "Conexão não encontrada"
          });
          return;
        }

        const svc = await import("../services/WhatsAppOficial/OfficialCallService");
        const r = await svc.pedirPermissaoDeChamada(wa, String(data?.number || ""));

        socket.emit("official-call:permission-result", {
          success: r.success,
          error: r.error
        });
      } catch (err: any) {
        logger.warn(`[OFFICIAL-CALL] erro ao pedir permissão: ${err?.message}`);
        socket.emit("official-call:permission-result", {
          success: false,
          error: err?.message
        });
      }
    });

    socket.on("official-call:reject", async (data: {
      whatsappId?: number;
      callId?: string;
    }) => {
      try {
        if (!data?.callId) return;
        const wa = await conexaoOficialDoSocket(data.whatsappId);
        if (!wa) return;
        const svc = await import("../services/WhatsAppOficial/OfficialCallService");
        await svc.recusar(wa, data.callId);
        await svc.registrarChamada({
          callId: data.callId,
          companyId: empresaDoSocket(),
          status: "rejected",
          endedAt: new Date()
        });
      } catch (err: any) {
        logger.warn(`[OFFICIAL-CALL] erro no reject: ${err?.message}`);
      }
    });

    socket.on("official-call:hangup", async (data: {
      whatsappId?: number;
      callId?: string;
    }) => {
      try {
        if (!data?.callId) return;
        const wa = await conexaoOficialDoSocket(data.whatsappId);
        if (!wa) return;
        const svc = await import("../services/WhatsAppOficial/OfficialCallService");
        await svc.desligar(wa, data.callId);
      } catch (err: any) {
        logger.warn(`[OFFICIAL-CALL] erro no hangup: ${err?.message}`);
      }
    });

    // Atendente disca para o cliente. Manda a oferta SDP do navegador e
    // recebe de volta o callId gerado pela Meta.
    socket.on("official-call:dial", async (data: {
      whatsappId?: number;
      number?: string;
      sdp?: string;
    }) => {
      try {
        if (!data?.number || !data?.sdp) return;
        const wa = await conexaoOficialDoSocket(data.whatsappId);
        if (!wa) {
          socket.emit("official-call:failed", { error: "Conexão não encontrada" });
          return;
        }

        const svc = await import("../services/WhatsAppOficial/OfficialCallService");
        const numero = String(data.number).replace(/\D/g, "");
        const r = await svc.conectar(wa, numero, data.sdp);

        if (!r.success || !r.callId) {
          socket.emit("official-call:failed", {
            error:
              r.error ||
              "A Meta não aceitou a chamada. Verifique se o cliente autorizou receber ligações."
          });
          return;
        }

        const uid = await resolveAuthedUserId();
        await svc.registrarChamada({
          callId: r.callId,
          companyId: empresaDoSocket(),
          whatsappId: wa.id,
          userId: uid ? Number(uid) : undefined,
          direction: "outbound",
          status: "ringing",
          number: numero,
          startedAt: new Date()
        });

        socket.emit("official-call:dialing", { callId: r.callId, number: numero });
      } catch (err: any) {
        logger.warn(`[OFFICIAL-CALL] erro no dial: ${err?.message}`);
        socket.emit("official-call:failed", { error: err?.message });
      }
    });

    //  NOVO: Heartbeat para manter usuário online e verificar aniversários periodicamente
    socket.on("heartbeat", () => handleHeartbeat(socket));

    //  EVENTO: Quando cliente se desconecta
    socket.on("disconnect", async () => {
      try {
        removeSocketPresenceSubscriptions(socket.id);

        // Libera o ramal se a aba fechou no meio da ligação. Sem isso o
        // atendente ficaria marcado como "em ligação" e não receberia mais
        // chamada nenhuma até o servidor reiniciar.
        try {
          const uidRamal = await resolveAuthedUserId();
          if (uidRamal) {
            clearBusy(Number(uidRamal));
            await marcarAusente(
              parseInt(socket.nsp.name.split("/")[1]),
              Number(uidRamal)
            );
          }
        } catch { /* não impede o resto do disconnect */ }

        if (token !== token_api_oficial) {
          // Ticketz upstream nem chama verify() aqui: usa o userId já
          // resolvido na conexão. Fazemos o mesmo via resolveAuthedUserId()
          // (que só re-tenta o verify() se ainda não tiver sido resolvido
          // antes, ex.: socket que nunca chegou a autenticar). Sem isso,
          // um disconnect que chega antes do secret carregar do Redis caía
          // aqui como "Error in socket disconnect: jwt must be provided" /
          // secret ainda null, e o usuário nunca era marcado offline.
          const userId = await resolveAuthedUserId();
          if (userId) {
            const companyId = parseInt(socket.nsp.name.split("/")[1]);

            await User.update(
              {
                online: false,
                lastSeen: new Date()
              },
              { where: { id: userId } }
            );

            socket.broadcast.to(`company-${companyId}`).emit("user:offline", {
              userId,
              lastSeen: new Date()
            });
          }
        }
      } catch (error) {
        logger.error("Error in socket disconnect:", error);
      }
    });

  });
  return io;
};

export const getIO = (): SocketIO => {
  if (!io) {
    throw new AppError("Socket IO not initialized");
  }
  return io;
};

//  NOVA FUNÇÃO: Emitir eventos de aniversário para uma empresa específica
export const emitBirthdayEvents = async (companyId: number) => {
  try {
    if (!io) {
      logger.warn(`[RDS-SOCKET] Socket IO não inicializado ao tentar emitir eventos de aniversário para empresa ${companyId}`);
      return;
    }

    const birthdayData = await BirthdayService.getTodayBirthdaysForCompany(companyId);

    // Emitir para todos os usuários da empresa
    if (birthdayData.users.length > 0) {
      birthdayData.users.forEach(user => {
        io.of(`/${companyId}`).emit("user-birthday", {
          userId: user.id,  // ✅ Corrigido: usar userId em vez de user.id
          userName: user.name,
          userAge: user.age
        });
        logger.info(` [GLOBAL] Emitido evento de aniversário para usuário: ${user.name}`);
      });
    }

    if (birthdayData.contacts.length > 0) {
      birthdayData.contacts.forEach(contact => {
        io.of(`/${companyId}`).emit("contact-birthday", {
          contactId: contact.id,  // ✅ Corrigido: usar contactId em vez de contact.id
          contactName: contact.name,
          contactAge: contact.age
        });
        logger.info(` [GLOBAL] Emitido evento de aniversário para contato: ${contact.name}`);
      });
    }
  } catch (error) {
    logger.error(` [RDS-SOCKET] Erro ao emitir eventos de aniversário para empresa ${companyId}:`, 
      error instanceof Error ? error.message : "Unknown error");
    if (error instanceof Error && error.stack) {
      logger.debug(" [RDS-SOCKET] Error stack:", error.stack);
    }
  }
};
