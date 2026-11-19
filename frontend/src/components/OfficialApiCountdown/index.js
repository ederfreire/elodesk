import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import { Tooltip } from "@material-ui/core";
import { makeStyles } from "@material-ui/core/styles";
import AccessTimeIcon from "@material-ui/icons/AccessTime";
import api from "../../services/api";
import { AuthContext } from "../../context/Auth/AuthContext";
import { i18n } from "../../translate/i18n";

const tr = (key, fallback, opts) => {
  const v = i18n.t(key, opts);
  return v === key ? fallback : v;
};


const useStyles = makeStyles((theme) => ({
  chip: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    padding: "4px 8px",
    borderRadius: 12,
    fontSize: 12,
    fontWeight: 600,
    lineHeight: 1,
    marginRight: 6,
    cursor: "default",
    userSelect: "none",
    whiteSpace: "nowrap",
    transition: "all 0.2s ease",
  },
  ok: {
    backgroundColor: theme.mode === "dark" ? "rgba(46,125,50,0.18)" : "rgba(46,125,50,0.10)",
    color: theme.mode === "dark" ? "#81c784" : "#2e7d32",
    border: `1px solid ${theme.mode === "dark" ? "rgba(129,199,132,0.35)" : "rgba(46,125,50,0.25)"}`,
  },
  warn: {
    backgroundColor: theme.mode === "dark" ? "rgba(237,108,2,0.18)" : "rgba(237,108,2,0.10)",
    color: theme.mode === "dark" ? "#ffb74d" : "#ed6c02",
    border: `1px solid ${theme.mode === "dark" ? "rgba(255,183,77,0.35)" : "rgba(237,108,2,0.25)"}`,
  },
  expired: {
    backgroundColor: theme.mode === "dark" ? "rgba(211,47,47,0.18)" : "rgba(211,47,47,0.10)",
    color: theme.mode === "dark" ? "#ef9a9a" : "#c62828",
    border: `1px solid ${theme.mode === "dark" ? "rgba(239,154,154,0.35)" : "rgba(211,47,47,0.25)"}`,
  },
  icon: {
    fontSize: 14,
  },
}));

const WINDOW_MS = 24 * 60 * 60 * 1000;

const formatRemaining = (ms) => {
  if (ms <= 0) return tr("officialApiCountdown.expired", "Janela expirada");
  const totalMinutes = Math.floor(ms / 60000);
  const h = Math.floor(totalMinutes / 60);
  const m = totalMinutes % 60;
  if (h <= 0)
    return tr("officialApiCountdown.minutesLeft", `${m}m restantes`, { m });
  return tr("officialApiCountdown.hoursLeft", `${h}h ${m}m restantes`, { h, m });
};


const OfficialApiCountdown = ({ ticket }) => {
  const classes = useStyles();
  const { user, socket } = useContext(AuthContext);
  const companyId = user?.companyId;
  const [lastInbound, setLastInbound] = useState(null);
  const [now, setNow] = useState(Date.now());
  const ticketIdRef = useRef(ticket?.id);

  useEffect(() => {
    ticketIdRef.current = ticket?.id;
  }, [ticket?.id]);

  const isOfficial = ticket?.channel === "whatsapp_oficial";
  const ticketNumericId = isOfficial ? ticket?.id : null;

  // Busca a janela real usando lastInteractionClient (mesma fonte que o backend
  // usa para liberar o envio de texto/áudio livre). Assim o badge fica
  // sincronizado com o template recém-enviado.
  const refreshWindow = React.useCallback(async () => {
    if (!ticketNumericId) return;
    try {
      const { data } = await api.get(
        `/tickets/${ticketNumericId}/check-whatsapp-window`
      );
      if (data?.lastInteractionClient) {
        setLastInbound(new Date(data.lastInteractionClient).getTime());
      } else {
        setLastInbound(null);
      }
    } catch (e) {
      // silent
    }
  }, [ticketNumericId]);

  useEffect(() => {
    refreshWindow();
  }, [refreshWindow]);

  useEffect(() => {
    if (!isOfficial || !companyId || !socket) return;
    const handler = (data) => {
      if (data?.action !== "create") return;
      const msg = data.message;
      if (!msg) return;
      const tId = ticketIdRef.current;
      if (!tId) return;
      if (msg.ticketId !== tId && data?.ticket?.id !== tId) return;

      // Mensagens recebidas do cliente reabrem a janela.
      if (!msg.fromMe) {
        if (msg.createdAt) {
          setLastInbound(new Date(msg.createdAt).getTime());
        } else {
          setLastInbound(Date.now());
        }
        return;
      }

      // Template enviado pelo atendente também abre a janela no backend
      // (lastInteractionClient é atualizado). Re-sincronizamos via API.
      const isTemplate =
        msg.mediaType === "template" ||
        msg.type === "template" ||
        msg.messageType === "template";
      if (isTemplate) {
        refreshWindow();
      }
    };
    socket.on(`company-${companyId}-appMessage`, handler);
    return () => {
      socket.off(`company-${companyId}-appMessage`, handler);
    };
  }, [isOfficial, companyId, socket, refreshWindow]);

  useEffect(() => {
    if (!isOfficial) return;
    const id = setInterval(() => setNow(Date.now()), 60 * 1000);
    return () => clearInterval(id);
  }, [isOfficial]);

  const remaining = useMemo(() => {
    if (!lastInbound) return null;
    return WINDOW_MS - (now - lastInbound);
  }, [lastInbound, now]);

  if (!isOfficial) return null;

  let statusClass = classes.ok;
  let label;
  let tooltip;

  if (remaining === null) {
    statusClass = classes.expired;
    label = tr("officialApiCountdown.noWindow", "Sem janela");
    tooltip = tr(
      "officialApiCountdown.noWindowTooltip",
      "Nenhuma mensagem do cliente recebida. A janela de 24h da API Oficial só abre após o cliente responder. Envie um template para iniciar."
    );
  } else if (remaining <= 0) {
    statusClass = classes.expired;
    label = tr("officialApiCountdown.expired", "Janela expirada");
    tooltip = tr(
      "officialApiCountdown.expiredTooltip",
      "A janela de 24h da API Oficial expirou. Para enviar novas mensagens livres, o cliente precisa responder ou você deve enviar um template aprovado."
    );
  } else {
    if (remaining <= 60 * 60 * 1000) statusClass = classes.warn;
    label = formatRemaining(remaining);
    const expiresAt = new Date((lastInbound || 0) + WINDOW_MS);
    tooltip = tr(
      "officialApiCountdown.activeTooltip",
      `Janela de 24h da API Oficial. Expira em ${expiresAt.toLocaleString()}.`,
      { date: expiresAt.toLocaleString() }
    );
  }


  return (
    <Tooltip title={tooltip} arrow placement="bottom">
      <span className={`${classes.chip} ${statusClass}`}>
        <AccessTimeIcon className={classes.icon} />
        {label}
      </span>
    </Tooltip>
  );
};

export default OfficialApiCountdown;