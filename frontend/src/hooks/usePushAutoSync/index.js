import { useEffect, useRef } from "react";
import { subscribeToPush } from "../../services/pushNotification";

/**
 * Mantém a inscrição de push viva sozinha.
 *
 * PROBLEMA QUE ISSO RESOLVE
 *
 * A inscrição de push (a "subscription" do navegador) não é eterna. Ela é
 * descartada/rotacionada em várias situações normais: o navegador troca o
 * endpoint depois de muito tempo ocioso, o service worker é substituído por
 * uma versão nova, o usuário limpa dados do site, o Chrome sincroniza o
 * perfil em outra máquina, o celular fica dias sem abrir o app.
 *
 * Quando isso acontece, o endpoint guardado no banco vira inválido. Na
 * primeira tentativa de envio o servidor de push responde 410/404 e o
 * PushNotificationService APAGA a inscrição (é o comportamento correto — ela
 * não serve mais para nada).
 *
 * O buraco estava aqui: nada recriava a inscrição depois disso. A única
 * forma de voltar a ter notificação era o atendente ir em Configurações e
 * desligar/ligar o push na mão, ou reinstalar o app. Como o convite do
 * InstallAppPrompt só aparece enquanto a permissão está em "default", quem
 * já tinha concedido permissão nunca mais via nada — e ficava sem
 * notificação para sempre, sem nenhum aviso.
 *
 * COMO RESOLVE
 *
 * A cada carregamento do app (e quando o usuário volta para a aba, no
 * máximo uma vez por hora), se a permissão JÁ estiver concedida, refaz a
 * inscrição e reenvia o endpoint atual para o backend. É barato, é
 * idempotente (o subscribeToPush reaproveita a inscrição existente quando a
 * chave VAPID bate) e conserta sozinho qualquer endpoint perdido.
 *
 * IMPORTANTE: só roda com a permissão em "granted". Nunca pede permissão por
 * conta própria — pedir sem o usuário clicar em nada é bloqueado pelos
 * navegadores e queima a chance de pedir depois, com o usuário respondendo
 * "bloquear" por reflexo. O pedido continua sendo feito pelo InstallAppPrompt
 * ou pela tela de Configurações, com clique do usuário.
 */

const INTERVALO_MINIMO_MS = 60 * 60 * 1000; // 1 hora

const usePushAutoSync = (habilitado = true) => {
  const ultimaSincronizacao = useRef(0);

  useEffect(() => {
    if (!habilitado) return undefined;

    const suportado =
      typeof window !== "undefined" &&
      "Notification" in window &&
      "serviceWorker" in navigator &&
      "PushManager" in window &&
      window.isSecureContext;

    if (!suportado) return undefined;

    const sincronizar = async () => {
      // Sem permissão concedida não há o que sincronizar — e não pedimos.
      if (Notification.permission !== "granted") return;

      const agora = Date.now();
      if (agora - ultimaSincronizacao.current < INTERVALO_MINIMO_MS) return;
      ultimaSincronizacao.current = agora;

      try {
        await subscribeToPush();
      } catch (err) {
        // Falha aqui não pode incomodar o atendente: ele não pediu nada.
        // Fica só no console para diagnóstico.
        console.warn("[PUSH] Falha ao re-sincronizar a inscrição:", err?.message || err);
      }
    };

    // Pequeno atraso para não competir com o carregamento inicial da tela.
    const timer = setTimeout(sincronizar, 3000);

    const aoVoltarParaAba = () => {
      if (document.visibilityState === "visible") sincronizar();
    };
    document.addEventListener("visibilitychange", aoVoltarParaAba);

    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", aoVoltarParaAba);
    };
  }, [habilitado]);
};

export default usePushAutoSync;
