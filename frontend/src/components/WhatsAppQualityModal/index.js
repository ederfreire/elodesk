import React, { useEffect, useState, useCallback } from "react";
import {
  Dialog, DialogTitle, DialogContent, DialogActions, Button, IconButton,
  Typography, Box, CircularProgress, Divider, makeStyles
} from "@material-ui/core";
import CloseIcon from "@material-ui/icons/Close";
import RefreshIcon from "@material-ui/icons/Refresh";
import CheckCircleIcon from "@material-ui/icons/CheckCircle";
import WarningIcon from "@material-ui/icons/Warning";
import ErrorIcon from "@material-ui/icons/Error";
import HelpIcon from "@material-ui/icons/HelpOutline";

import api from "../../services/api";
import toastError from "../../errors/toastError";
import { i18n } from "../../translate/i18n";

const useStyles = makeStyles(theme => ({
  banner: {
    borderRadius: 12,
    padding: theme.spacing(1.75, 2),
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: theme.spacing(2)
  },
  bloco: {
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: 12,
    padding: theme.spacing(1.75, 2),
    marginBottom: theme.spacing(1.5)
  },
  blocoTitulo: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    fontSize: 11.5,
    fontWeight: 700,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: theme.palette.text.secondary,
    marginBottom: theme.spacing(1.25)
  },
  grid2: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    rowGap: theme.spacing(1.25),
    columnGap: theme.spacing(2)
  },
  label: { fontSize: 11.5, color: theme.palette.text.secondary },
  valor: { fontSize: 13.5, fontWeight: 600, wordBreak: "break-all" },
  mono: { fontFamily: "monospace" },
  nota: {
    fontSize: 12,
    color: theme.palette.text.secondary,
    display: "flex",
    gap: 6,
    marginBottom: 6,
    lineHeight: 1.4
  },
  footerInfo: { fontSize: 11.5, color: theme.palette.text.secondary }
}));

const VERDICT = {
  healthy: { color: "#059669", bg: "#ecfdf5", border: "#a7f3d0", Icon: CheckCircleIcon, title: "Conta saudável" },
  warning: { color: "#b45309", bg: "#fffbeb", border: "#fde68a", Icon: WarningIcon, title: "Atenção" },
  critical: { color: "#dc2626", bg: "#fef2f2", border: "#fecaca", Icon: ErrorIcon, title: "Risco detectado" },
  unknown: { color: "#475569", bg: "#f8fafc", border: "#e2e8f0", Icon: HelpIcon, title: "Estado desconhecido" }
};

const Campo = ({ label, value, mono, classes, color }) => (
  <div>
    <div className={classes.label}>{label}</div>
    <div className={classes.valor} style={{ ...(mono ? { fontFamily: "monospace" } : {}), ...(color ? { color } : {}) }}>
      {value === null || value === undefined || value === "" ? "—" : String(value)}
    </div>
  </div>
);

const fmtDate = iso => {
  if (!iso) return "—";
  try { return new Date(iso).toLocaleString(); } catch { return String(iso); }
};

const WhatsAppQualityModal = ({ open, onClose, whatsAppId, whatsAppName }) => {
  const classes = useStyles();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState(null);

  const fetchData = useCallback(async () => {
    if (!whatsAppId) return;
    setLoading(true);
    try {
      const { data } = await api.get(`/whatsapp/${whatsAppId}/quality`);
      setData(data);
    } catch (err) {
      toastError(err);
    } finally {
      setLoading(false);
    }
  }, [whatsAppId]);

  useEffect(() => {
    if (open) fetchData();
  }, [open, fetchData]);

  const v = VERDICT[data?.verdict] || VERDICT.unknown;
  const isOfficial = data?.channelKind === "official";
  const off = data?.official || {};

  const traduzQuality = q => {
    const s = (q || "").toString().toUpperCase();
    if (s === "GREEN") return { t: "Alta (verde)", c: "#059669" };
    if (s === "YELLOW") return { t: "Média (amarelo)", c: "#b45309" };
    if (s === "RED") return { t: "Baixa (vermelho)", c: "#dc2626" };
    return { t: q || "—", c: undefined };
  };
  const ql = traduzQuality(off.quality_rating || off.qualityRating);

  return (
    <Dialog open={open} onClose={onClose} maxWidth="sm" fullWidth>
      <DialogTitle style={{ display: "flex", alignItems: "center", justifyContent: "space-between", paddingBottom: 8 }}>
        <span>
          {i18n.t("whatsappQuality.title", "Qualidade do número")}
          {whatsAppName ? ` — ${whatsAppName}` : ""}
        </span>
        <IconButton size="small" onClick={onClose}><CloseIcon fontSize="small" /></IconButton>
      </DialogTitle>

      <DialogContent dividers>
        {loading && !data ? (
          <Box display="flex" justifyContent="center" alignItems="center" py={5}>
            <CircularProgress size={28} />
          </Box>
        ) : !data ? (
          <Typography color="textSecondary">{i18n.t("whatsappQuality.empty", "Sem dados.")}</Typography>
        ) : (
          <>
            {/* VEREDITO */}
            <div className={classes.banner} style={{ background: v.bg, border: `1px solid ${v.border}` }}>
              <v.Icon style={{ color: v.color, fontSize: 22, marginTop: 1 }} />
              <div>
                <div style={{ color: v.color, fontWeight: 700, fontSize: 14 }}>{v.title}</div>
                <div style={{ fontSize: 12.5, color: "#475569", marginTop: 2 }}>{data.verdictReason}</div>
              </div>
            </div>

            {/* CONEXÃO */}
            <div className={classes.bloco}>
              <div className={classes.blocoTitulo}>{i18n.t("whatsappQuality.connection", "Conexão")}</div>
              <div className={classes.grid2}>
                <Campo classes={classes} label="Status" value={data.connection.status}
                  color={data.connection.online ? "#059669" : "#dc2626"} />
                <Campo classes={classes} label="Online" value={data.connection.online ? "SIM" : "NÃO"} />
                <Campo classes={classes} label="Número" value={data.connection.number} mono />
                <Campo classes={classes} label="Push name" value={data.connection.pushName} />
                {!isOfficial && <Campo classes={classes} label="JID" value={data.connection.jid} mono />}
                {!isOfficial && <Campo classes={classes} label="LID" value={data.connection.lid} mono />}
                {!isOfficial && <Campo classes={classes} label="Plataforma" value={data.connection.platform} mono />}
                {!isOfficial && <Campo classes={classes} label="Logado"
                  value={data.connection.loggedIn === null ? "—" : (data.connection.loggedIn ? "SIM" : "NÃO")} />}
              </div>
            </div>

            {/* BLOCO OFICIAL (só API Oficial) */}
            {isOfficial && (
              <div className={classes.bloco}>
                <div className={classes.blocoTitulo}>{i18n.t("whatsappQuality.official", "Qualidade Meta (API Oficial)")}</div>
                <div className={classes.grid2}>
                  <Campo classes={classes} label="Qualidade" value={ql.t} color={ql.c} />
                  <Campo classes={classes} label="Tier de mensagens" value={off.messaging_limit_tier || off.messagingLimit} mono />
                  <Campo classes={classes} label="Revisão da conta" value={off.account_review_status} />
                  <Campo classes={classes} label="Verificação do negócio" value={off.business_verification_status} />
                  <Campo classes={classes} label="Verificação do código" value={off.code_verification_status} />
                  <Campo classes={classes} label="Status do nome" value={off.name_status} />
                  <Campo classes={classes} label="Nome verificado" value={off.verified_name} />
                </div>
              </div>
            )}

            {/* NOTAS HONESTAS */}
            {Array.isArray(data.notes) && data.notes.length > 0 && (
              <div className={classes.bloco} style={{ background: "#f8fafc" }}>
                <div className={classes.blocoTitulo}>{i18n.t("whatsappQuality.notes", "Observações")}</div>
                {data.notes.map((n, i) => (
                  <div key={i} className={classes.nota}>
                    <span style={{ color: "#94a3b8" }}>•</span>
                    <span>{n}</span>
                  </div>
                ))}
              </div>
            )}

            <Divider style={{ margin: "8px 0" }} />
            <div className={classes.footerInfo}>
              {i18n.t("whatsappQuality.checkedAt", "Última consulta")}: {fmtDate(data.checkedAt)}
            </div>
          </>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose}>{i18n.t("whatsappQuality.close", "Fechar")}</Button>
        <Button
          onClick={fetchData}
          variant="contained"
          color="primary"
          disabled={loading}
          startIcon={loading ? <CircularProgress size={14} color="inherit" /> : <RefreshIcon />}
        >
          {i18n.t("whatsappQuality.refresh", "Atualizar agora")}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default WhatsAppQualityModal;
