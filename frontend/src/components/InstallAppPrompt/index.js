import React, { useEffect, useState, useCallback } from "react";
import Paper from "@material-ui/core/Paper";
import Typography from "@material-ui/core/Typography";
import Button from "@material-ui/core/Button";
import IconButton from "@material-ui/core/IconButton";
import Slide from "@material-ui/core/Slide";
import { makeStyles } from "@material-ui/core/styles";
import CloseIcon from "@material-ui/icons/Close";
import GetAppIcon from "@material-ui/icons/GetApp";
import NotificationsActiveIcon from "@material-ui/icons/NotificationsActive";
import CheckCircleIcon from "@material-ui/icons/CheckCircle";
import { i18n } from "../../translate/i18n";
import {
  isDesktopNotificationSupported,
  requestDesktopNotificationPermission,
} from "../../helpers/desktopNotification";
import { subscribeToPush } from "../../services/pushNotification";

const useStyles = makeStyles((theme) => ({
  root: {
    position: "fixed",
    right: 16,
    bottom: 16,
    zIndex: 1400,
    width: 340,
    maxWidth: "calc(100vw - 32px)",
    padding: theme.spacing(2),
    borderRadius: 12,
    boxShadow: "0 8px 28px rgba(0,0,0,0.22)",
  },
  header: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  title: {
    fontWeight: 600,
    fontSize: 15,
    marginBottom: 4,
  },
  body: {
    fontSize: 13,
    color: theme.palette.text.secondary,
    marginBottom: 12,
  },
  actions: {
    display: "flex",
    gap: 8,
    flexWrap: "wrap",
  },
  closeBtn: {
    marginTop: -8,
    marginRight: -8,
  },
  doneRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    color: theme.palette.success?.main || "#2e7d32",
    fontSize: 13,
  },
}));

// Quantos dias esperar antes de oferecer de novo depois que o usuário
// dispensou o aviso ("Agora não") — não é pra implorar toda hora, mas
// também não pode sumir pra sempre, já que a pessoa pode mudar de ideia.
const SNOOZE_DAYS = 7;
const SNOOZE_KEY = "installPromptSnoozedAt";

const isStandaloneDisplay = () =>
  (typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(display-mode: standalone)").matches) ||
  // iOS Safari não tem display-mode: standalone, usa isso.
  window.navigator?.standalone === true;

const isSnoozed = () => {
  try {
    const raw = localStorage.getItem(SNOOZE_KEY);
    if (!raw) return false;
    const snoozedAt = Number(raw);
    if (!snoozedAt) return false;
    const days = (Date.now() - snoozedAt) / (1000 * 60 * 60 * 24);
    return days < SNOOZE_DAYS;
  } catch (_) {
    return false;
  }
};

const setSnoozed = () => {
  try {
    localStorage.setItem(SNOOZE_KEY, String(Date.now()));
  } catch (_) {
    // sem localStorage (modo privado etc.) — só não vai lembrar do dismiss.
  }
};

/**
 * Banner que oferece, ao abrir o sistema:
 *  1) instalar o EquipeChat como app do Windows (PWA — mesmo mecanismo do
 *     Chrome/Edge, aparece na barra de tarefas e no Menu Iniciar como um
 *     programa instalado), e
 *  2) ativar as notificações nativas do Windows (permissão do navegador +
 *     inscrição push).
 *
 * O "instalar como app" só é OFERECIDO pelo navegador (evento
 * beforeinstallprompt) quando existe um manifest.json válido com ícones e
 * um service worker registrado — por isso este componente também garante o
 * registro do service worker assim que monta, mesmo antes do usuário pedir
 * notificação.
 */
export default function InstallAppPrompt() {
  const classes = useStyles();
  // Nome do whitelabel — mesma fonte usada pelo resto do app (App.js grava
  // "appName" no localStorage a partir das settings públicas). Sem isso o
  // card ficava com "EquipeChat" fixo mesmo em instalação com marca própria.
  const appName =
    localStorage.getItem("appName") ||
    localStorage.getItem("wl_appName") ||
    "EquipeChat";
  const [deferredPrompt, setDeferredPrompt] = useState(null);
  const [notifPermission, setNotifPermission] = useState(
    isDesktopNotificationSupported() ? Notification.permission : "unsupported"
  );
  const [visible, setVisible] = useState(false);
  const [installing, setInstalling] = useState(false);
  const [enablingNotif, setEnablingNotif] = useState(false);
  const [installed, setInstalled] = useState(isStandaloneDisplay());

  // Registra o service worker cedo (sem pedir permissão nenhuma ainda) —
  // é um dos requisitos do navegador para considerar o app "instalável" e
  // disparar beforeinstallprompt.
  useEffect(() => {
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker.register("/service-worker.js", { scope: "/" }).catch(() => {});
    }
  }, []);

  useEffect(() => {
    const onBeforeInstall = (e) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    const onInstalled = () => {
      setInstalled(true);
      setDeferredPrompt(null);
      setVisible(false);
    };
    window.addEventListener("beforeinstallprompt", onBeforeInstall);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onBeforeInstall);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  useEffect(() => {
    if (installed || isSnoozed()) return;
    // Só aparece quando existe algo pra oferecer: instalar o app OU ativar
    // notificação (se as duas já estiverem resolvidas, não tem o que mostrar).
    const needsNotif = notifPermission === "default";
    const timer = setTimeout(() => {
      if (deferredPrompt || needsNotif) setVisible(true);
    }, 1500); // pequeno atraso pra não competir com o carregamento inicial
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deferredPrompt, notifPermission, installed]);

  const handleDismiss = useCallback(() => {
    setSnoozed();
    setVisible(false);
  }, []);

  const handleInstall = useCallback(async () => {
    if (!deferredPrompt) return;
    setInstalling(true);
    try {
      deferredPrompt.prompt();
      const choice = await deferredPrompt.userChoice;
      if (choice?.outcome === "accepted") {
        setInstalled(true);
      }
    } catch (_) {
      // usuário fechou o prompt nativo ou o navegador recusou — sem drama.
    } finally {
      setDeferredPrompt(null);
      setInstalling(false);
    }
  }, [deferredPrompt]);

  const handleEnableNotifications = useCallback(async () => {
    setEnablingNotif(true);
    try {
      const granted = await requestDesktopNotificationPermission();
      setNotifPermission(isDesktopNotificationSupported() ? Notification.permission : "unsupported");
      if (granted) {
        // subscribeToPush já lida sozinho com VAPID ausente/HTTPS
        // faltando etc. — se falhar aqui, a permissão do navegador já foi
        // concedida mesmo assim, então não é um erro bloqueante pro usuário.
        await subscribeToPush().catch(() => {});
      }
    } finally {
      setEnablingNotif(false);
    }
  }, []);

  if (!visible || installed) return null;

  const showInstallButton = !!deferredPrompt;
  const showNotifButton = notifPermission === "default";
  const notifBlocked = notifPermission === "denied";

  return (
    <Slide direction="up" in={visible} mountOnEnter unmountOnExit>
      <Paper className={classes.root} elevation={6}>
        <div className={classes.header}>
          <Typography className={classes.title}>
            {i18n.t("installPrompt.title", { appName })}
          </Typography>
          <IconButton size="small" className={classes.closeBtn} onClick={handleDismiss} aria-label="fechar">
            <CloseIcon fontSize="small" />
          </IconButton>
        </div>

        <Typography className={classes.body}>
          {i18n.t("installPrompt.body") ||
            "Instale como aplicativo do Windows e ative as notificações para não perder nenhum atendimento, mesmo com o navegador minimizado."}
        </Typography>

        {notifBlocked && (
          <Typography className={classes.body} style={{ marginTop: -6 }}>
            {i18n.t("installPrompt.blocked") ||
              "As notificações estão bloqueadas nas permissões do navegador para este site. Libere manualmente para ativar."}
          </Typography>
        )}

        <div className={classes.actions}>
          {showInstallButton && (
            <Button
              variant="contained"
              color="primary"
              size="small"
              startIcon={<GetAppIcon />}
              disabled={installing}
              onClick={handleInstall}
            >
              {i18n.t("installPrompt.install") || "Instalar no Windows"}
            </Button>
          )}
          {showNotifButton && (
            <Button
              variant={showInstallButton ? "outlined" : "contained"}
              color="primary"
              size="small"
              startIcon={<NotificationsActiveIcon />}
              disabled={enablingNotif}
              onClick={handleEnableNotifications}
            >
              {i18n.t("installPrompt.enableNotifications") || "Ativar notificações"}
            </Button>
          )}
          {!showInstallButton && !showNotifButton && (
            <div className={classes.doneRow}>
              <CheckCircleIcon fontSize="small" />
              <span>{i18n.t("installPrompt.done") || "Tudo certo por aqui"}</span>
            </div>
          )}
          <Button size="small" onClick={handleDismiss}>
            {i18n.t("installPrompt.later") || "Agora não"}
          </Button>
        </div>
      </Paper>
    </Slide>
  );
}
