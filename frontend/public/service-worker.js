// Assume o controle da página assim que uma versão nova deste arquivo é
// publicada, sem esperar o usuário fechar todas as abas.
//
// Sem isso, toda vez que o service-worker.js muda (como aconteceu ao
// adicionar o listener de "push" acima), o navegador registra a versão
// nova mas a deixa "esperando" (waiting) enquanto a aba antiga continuar
// aberta — e subscribeToPush()/getServiceWorkerRegistration() no app
// (services/pushNotification.js) ficam até 10s esperando ela "ativar"
// antes de desistir com SERVICE_WORKER_TIMEOUT. Era exatamente esse timeout
// que aparecia como "Erro ao alterar notificações push" na tela de
// Configurações mesmo com VAPID_PUBLIC_KEY/VAPID_PRIVATE_KEY já
// configuradas no backend: o push "instalado" no servidor, mas o
// navegador nunca soltava o service worker antigo pra ativar o novo.
self.addEventListener("install", () => {
  self.skipWaiting();
});

self.addEventListener("activate", event => {
  event.waitUntil(self.clients.claim());
});

// Badge do ícone do app (aquele balãozinho vermelho com o número em cima do
// ícone na tela inicial do celular). É a Badging API: só funciona com o app
// INSTALADO (PWA) e o navegador precisa suportar — Chrome/Edge no Android e
// desktop, Safari a partir do iOS 16.4. Onde não existe, as chamadas abaixo
// simplesmente não fazem nada, sem quebrar a notificação.
const aplicarBadge = count => {
  try {
    const n = Number(count);
    if (!self.navigator || typeof self.navigator.setAppBadge !== "function") {
      return Promise.resolve();
    }
    // Zero (ou valor inválido) limpa o badge em vez de estampar "0".
    if (!Number.isFinite(n) || n <= 0) {
      return typeof self.navigator.clearAppBadge === "function"
        ? self.navigator.clearAppBadge().catch(() => {})
        : Promise.resolve();
    }
    return self.navigator.setAppBadge(n).catch(() => {});
  } catch (_) {
    return Promise.resolve();
  }
};

const limparBadge = () => {
  try {
    if (self.navigator && typeof self.navigator.clearAppBadge === "function") {
      return self.navigator.clearAppBadge().catch(() => {});
    }
  } catch (_) {
    /* ignora */
  }
  return Promise.resolve();
};

// A página avisa o service worker quando o contador muda com o app ABERTO
// (ver layout/index.js). Sem isso o badge só atualizaria quando chegasse um
// push, e ficaria "preso" no número antigo depois que o atendente lesse as
// conversas com o app na frente.
self.addEventListener("message", event => {
  const data = event.data || {};
  if (data.type === "SET_BADGE") {
    event.waitUntil(aplicarBadge(data.count));
  } else if (data.type === "CLEAR_BADGE") {
    event.waitUntil(limparBadge());
  }
});

// Notificação "de verdade" (Web Push): é isso que faz a mensagem aparecer
// mesmo com o navegador minimizado (ou até fechado) no Windows. O backend
// (CreateMessageService -> sendPushToUser/sendPushToCompanyUsers) já manda
// esse push para TODAS as conexões (API oficial, WhatsApp Plus e Baileys),
// mas sem este listener o service worker recebe o push e não faz nada com
// ele — por isso funcionava com a aba em primeiro plano (aviso disparado
// direto pelo JS da página ao receber o evento do socket) e falhava
// assim que a janela era minimizada por tempo suficiente para o Chrome
// suspender a aba em segundo plano.
self.addEventListener("push", event => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (_) {
    payload = { title: "Nova mensagem", body: event.data ? event.data.text() : "" };
  }

  const title = payload.title || "Nova mensagem";
  const options = {
    body: payload.body || "",
    icon: payload.icon || "/icon-192x192.png",
    // Ícone monocromático da bandeja no Android. Sem ele o sistema mostra um
    // quadrado cinza ao lado do texto.
    badge: "/icon-96x96.png",
    data: { url: payload.url || "/tickets", ticketId: payload.ticketId }
  };

  // renotify só é aceito junto com um tag não vazio: o Chrome lança
  // TypeError em showNotification se vier renotify sem tag, e aí NENHUMA
  // notificação aparece. Hoje o backend sempre manda o tag, mas basta um push
  // de outra origem sem ele para o atendente parar de receber tudo — então a
  // dupla só é aplicada quando o tag realmente existe.
  if (payload.tag) {
    options.tag = payload.tag;
    options.renotify = true;
  }

  // A notificação é a prioridade e vai SOZINHA no waitUntil.
  //
  // Antes o badge estava junto num Promise.all: se a Badging API rejeitasse
  // de um jeito que escapasse dos guards (navegador que expõe setAppBadge mas
  // recusa quando o app não está instalado, por exemplo), a promessa do
  // waitUntil rejeitava junto e o navegador podia encerrar o handler antes da
  // hora. O badge é enfeite; a notificação não pode depender dele.
  event.waitUntil(self.registration.showNotification(title, options));

  // Badge à parte, sem entrar no caminho crítico e sem poder falhar pra fora.
  try {
    aplicarBadge(payload.unreadCount);
  } catch (_) {
    /* nunca deve impedir a notificação */
  }
});

self.addEventListener("notificationclick", event => {
  event.notification.close();

  const targetUrl = event.notification?.data?.url || "/tickets";

  // Abrir/focar a janela é o que importa aqui — vai sozinho no waitUntil,
  // pelo mesmo motivo do handler de push.
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(clients => {
      const existingClient = clients.find(client => "focus" in client);

      if (existingClient) {
        return existingClient.focus().then(client => {
          if ("navigate" in client) return client.navigate(targetUrl);
          return client;
        });
      }

      return self.clients.openWindow ? self.clients.openWindow(targetUrl) : undefined;
    })
  );

  try {
    limparBadge();
  } catch (_) {
    /* nunca deve impedir a abertura da conversa */
  }
});