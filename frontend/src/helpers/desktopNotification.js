// Notificação nativa do sistema (estilo WhatsApp Desktop).
// Centraliza pedido de permissão e criação da notificação para que
// atendimento (tickets/grupos), WhatsApp Plus (wacalls), API Oficial e
// chat interno usem o mesmo comportamento.
import { areNotificationsDisabled } from "./notificationPrefs";

export const isDesktopNotificationSupported = () =>
  typeof window !== "undefined" && typeof Notification !== "undefined";

let askingPermission = false;
let gestureHooked = false;

const hookGestureRetry = () => {
  // Alguns navegadores (e o Chrome no Windows quando a aba abre em segundo
  // plano) só mostram o pedido de permissão dentro de uma interação do
  // usuário. Sem isso a permissão ficava "default" pra sempre e nenhuma
  // notificação aparecia — sintoma: "notificação no Windows não funciona".
  if (gestureHooked || typeof document === "undefined") return;
  gestureHooked = true;

  const handler = () => {
    document.removeEventListener("click", handler);
    document.removeEventListener("keydown", handler);
    gestureHooked = false;
    requestDesktopNotificationPermission();
  };

  document.addEventListener("click", handler, { once: true });
  document.addEventListener("keydown", handler, { once: true });
};

// Pede permissão ao navegador. Diferente da versão anterior, NÃO grava um
// "já perguntei" definitivo: se a permissão continuar pendente (o usuário
// fechou o balão, ou o navegador exigiu gesto), tenta de novo no próximo
// clique/tecla. Só desiste quando o próprio navegador nega.
export const requestDesktopNotificationPermission = async () => {
  try {
    if (!isDesktopNotificationSupported()) return false;
    if (Notification.permission === "granted") return true;
    if (Notification.permission === "denied") return false;
    if (askingPermission) return false;

    askingPermission = true;
    let permission = "default";
    try {
      permission = await Notification.requestPermission();
    } finally {
      askingPermission = false;
    }

    if (permission === "granted") return true;
    if (permission === "default") hookGestureRetry();
    return false;
  } catch (_) {
    hookGestureRetry();
    return false;
  }
};

const getServiceWorkerRegistration = async () => {
  if (!("serviceWorker" in navigator)) return null;

  let registration = await navigator.serviceWorker.getRegistration("/");
  if (!registration) {
    registration = await navigator.serviceWorker.register("/service-worker.js", { scope: "/" });
  }

  return navigator.serviceWorker.ready;
};

// Corrida contra um timeout: nunca deixa a notificação inteira travar
// esperando o service worker. Antes, showDesktopNotification tentava o
// service worker primeiro e só chamava `new Notification()` DEPOIS que essa
// tentativa terminasse — e `navigator.serviceWorker.ready` é uma Promise que
// nunca resolve se o service worker, por qualquer motivo, não chegar a
// "activated" (rede lenta, versão presa em "waiting", etc.). Resultado:
// nenhum erro no console, só nada acontecia. O WhatsApp Web nunca teve esse
// problema porque não passa pelo service worker pra isso — chama
// `new Notification()` direto na página. É o que fazemos agora também,
// como caminho garantido; o service worker vira só um complemento opcional.
const withTimeout = (promise, ms) =>
  Promise.race([
    promise,
    new Promise(resolve => setTimeout(() => resolve(null), ms)),
  ]);

const showViaServiceWorker = async (options) => {
  try {
    const registration = await withTimeout(getServiceWorkerRegistration(), 1500);
    if (!registration?.showNotification) return false;
    await registration.showNotification(options.title, {
      body: options.body,
      icon: options.icon,
      tag: options.tag,
      renotify: true,
      data: { url: options.url }
    });
    return true;
  } catch (_) {
    return false;
  }
};

export const showDesktopNotification = ({
  title,
  body,
  icon,
  tag,
  url,
  onClick,
} = {}) => {
  try {
    if (areNotificationsDisabled()) {
      return null;
    }
    if (!isDesktopNotificationSupported()) return null;

    if (Notification.permission !== "granted") {
      // Não perde a mensagem em silêncio: aproveita para (re)pedir permissão,
      // de forma que a próxima mensagem já apareça.
      requestDesktopNotificationPermission();
      return null;
    }

    const options = {
      title: title || "Nova mensagem",
      body: body || "",
      icon: icon || undefined,
      tag: tag ? String(tag) : undefined,
      url: url || "/tickets",
    };

    // ── Caminho garantido: igual ao WhatsApp Web ────────────────────────────
    // new Notification() direto na página, sem depender do service worker.
    // Funciona com a aba em foco, minimizada, ou em outra janela — o que faz
    // a notificação sumir é o navegador (não o Windows) suspender a aba em
    // segundo plano por tempo demais, o que está fora do nosso controle.
    let notification = null;
    try {
      notification = new Notification(options.title, {
        body: options.body,
        icon: options.icon,
        tag: options.tag,
        renotify: true,
      });
      notification.onclick = event => {
        try {
          event?.preventDefault?.();
          window.focus();
          onClick?.();
        } finally {
          notification.close();
        }
      };
    } catch (err) {
    }

    // Complemento (não bloqueante): tenta também via service worker, útil
    // quando o app está instalado como PWA no Windows — mas nunca troca
    // lugar com a notificação acima nem atrasa nada.
    showViaServiceWorker(options).catch(() => {});

    return {
      tag: options.tag,
      close: () => {
        notification?.close?.();
        getServiceWorkerRegistration()
          .then(registration => registration?.getNotifications?.({ tag: options.tag }))
          .then(notifications => notifications?.forEach(n => n.close()))
          .catch(() => undefined);
      }
    };
  } catch (_) {
    return null;
  }
};
