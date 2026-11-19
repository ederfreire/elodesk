// @ts-ignore
import * as webpush from "web-push";
import PushSubscription from "../models/PushSubscription";
import logger from "../utils/logger";
import CountUnreadTicketsService from "./TicketServices/CountUnreadTicketsService";

// As VAPID keys devem ser configuradas via variáveis de ambiente
// Gere com: npx web-push generate-vapid-keys
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY || "";
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY || "";
const VAPID_SUBJECT = process.env.VAPID_SUBJECT || "mailto:admin@equipechat.com.br";

// Placeholder que o instalador grava no .env antes de gerar as chaves de
// verdade. Se a geração automática falhar por algum motivo (sem internet no
// momento do install/update, npm indisponível etc.), esse texto pode
// permanecer no .env como se fosse uma chave real.
const isPlaceholder = (value: string): boolean =>
  !value || value.includes("PLACEHOLDER") || value.includes("SUA_CHAVE");

let vapidReady = false;

if (!isPlaceholder(VAPID_PUBLIC_KEY) && !isPlaceholder(VAPID_PRIVATE_KEY)) {
  // web-push valida o formato/tamanho da chave e LANÇA exceção síncrona se
  // for inválida. Sem o try/catch, uma chave quebrada (placeholder não
  // substituído, VAPID colado errado etc.) derrubava o processo inteiro do
  // backend na inicialização — não só o push ficava fora do ar, o
  // EquipeChat inteiro não subia. Agora isso só desativa o push e loga o
  // erro, sem tirar o resto do sistema do ar.
  try {
    webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
    vapidReady = true;
    logger.info("[PUSH] VAPID keys configuradas com sucesso");
  } catch (err: any) {
    logger.error(`[PUSH] Chaves VAPID inválidas no .env — push notifications desabilitadas. Gere novas chaves com: npx web-push generate-vapid-keys. Erro: ${err?.message}`);
  }
} else {
  logger.warn("[PUSH] VAPID keys não configuradas. Push notifications desabilitadas. Gere com: npx web-push generate-vapid-keys");
}

export const getVapidPublicKey = (): string => {
  return VAPID_PUBLIC_KEY;
};

interface SubscribeData {
  userId: number;
  companyId: number;
  endpoint: string;
  p256dh: string;
  auth: string;
  userAgent?: string;
}

export const subscribeUser = async (data: SubscribeData): Promise<PushSubscription> => {
  // Remover subscription duplicada pelo endpoint
  await PushSubscription.destroy({
    where: { endpoint: data.endpoint }
  });

  const subscription = await PushSubscription.create({
    userId: data.userId,
    companyId: data.companyId,
    endpoint: data.endpoint,
    p256dh: data.p256dh,
    auth: data.auth,
    userAgent: data.userAgent || null
  });

  logger.info(`[PUSH] Subscription criada para userId=${data.userId}`);
  return subscription;
};

export const unsubscribeUser = async (endpoint: string): Promise<void> => {
  await PushSubscription.destroy({
    where: { endpoint }
  });
  logger.info(`[PUSH] Subscription removida: ${endpoint.substring(0, 50)}...`);
};

interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  tag?: string;
  url?: string;
  ticketId?: number;
  /**
   * Número que o service worker estampa no ícone do app
   * (navigator.setAppBadge). Não precisa ser preenchido por quem chama:
   * sendPushToUser calcula por usuário antes de enviar, porque o valor é
   * diferente pra cada atendente.
   */
  unreadCount?: number;
}

export const sendPushToUser = async (userId: number, companyId: number, payload: PushPayload): Promise<void> => {
  if (!vapidReady) {
    return; // Push não configurado (ou chaves inválidas — ver log de inicialização)
  }

  const subscriptions = await PushSubscription.findAll({
    where: { userId, companyId }
  });

  if (subscriptions.length === 0) return;

  // Badge do ícone do app: o total tem que ser DESTE usuário, por isso é
  // calculado aqui e não em quem monta o payload. Quando o push vai para
  // vários atendentes de uma fila (sendPushToCompanyUsers), cada um recebe
  // o seu próprio número.
  //
  // Essa contagem entrou DEPOIS que o push já funcionava, então ela não pode,
  // em hipótese alguma, atrasar ou derrubar o envio: uma consulta lenta ou
  // travada aqui seguraria a notificação de mensagem nova, que é o que
  // realmente importa. Por isso vai com prazo curto e, se estourar ou falhar,
  // o push sai sem o número (badge é enfeite, notificação não é).
  //
  // Se quem chamou já informou um unreadCount, respeita — evita a consulta.
  let unreadCount = 0;
  if (typeof payload.unreadCount === "number") {
    unreadCount = payload.unreadCount;
  } else {
    try {
      unreadCount = await Promise.race([
        CountUnreadTicketsService(userId, companyId),
        new Promise<number>(resolve => setTimeout(() => resolve(0), 1500))
      ]);
    } catch {
      unreadCount = 0;
    }
  }

  const pushPayload = JSON.stringify({ ...payload, unreadCount });

  const sendPromises = subscriptions.map(async (sub) => {
    try {
      await webpush.sendNotification(
        {
          endpoint: sub.endpoint,
          keys: {
            p256dh: sub.p256dh,
            auth: sub.auth
          }
        },
        pushPayload
      );
    } catch (err: any) {
      if (err.statusCode === 410 || err.statusCode === 404) {
        // Subscription expirada ou inválida, remover
        logger.info(`[PUSH] Removendo subscription expirada para userId=${userId}`);
        await sub.destroy();
      } else if (
        err.statusCode === 401 ||
        err.statusCode === 403 ||
        (typeof err.body === "string" && err.body.includes("VAPID"))
      ) {
        // VAPID antiga (subscription criada com outro par de chaves) — remover
        logger.warn(`[PUSH] Removendo subscription com VAPID antiga para userId=${userId}: statusCode=${err.statusCode}`);
        await sub.destroy();
      } else {
        logger.error(`[PUSH] Erro ao enviar push para userId=${userId}: statusCode=${err.statusCode}, message=${err.message}, body=${JSON.stringify(err.body || {})}`);
      }
    }
  });

  await Promise.allSettled(sendPromises);
};

export const sendPushToCompanyUsers = async (
  companyId: number,
  userIds: number[],
  payload: PushPayload
): Promise<void> => {
  if (!vapidReady) return;

  const promises = userIds.map(userId => sendPushToUser(userId, companyId, payload));
  await Promise.allSettled(promises);
};
