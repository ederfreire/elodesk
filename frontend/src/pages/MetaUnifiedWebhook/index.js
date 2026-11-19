import React, { useCallback, useEffect, useState } from "react";
import { useHistory } from "react-router-dom";
import ArrowBackIcon from "@material-ui/icons/ArrowBack";
import {
  Avatar,
  Box,
  Button,
  Chip,
  CircularProgress,
  Grid,
  IconButton,
  Paper,
  TextField,
  Tooltip,
  Typography,
  makeStyles
} from "@material-ui/core";
import FileCopyIcon from "@material-ui/icons/FileCopy";
import LinkIcon from "@material-ui/icons/Link";
import RefreshIcon from "@material-ui/icons/Refresh";
import VpnKeyIcon from "@material-ui/icons/VpnKey";
import CheckCircleIcon from "@material-ui/icons/CheckCircle";
import InfoIcon from "@material-ui/icons/InfoOutlined";
import HelpIcon from "@material-ui/icons/HelpOutline";
import WhatsAppIcon from "@material-ui/icons/WhatsApp";
import OpenInNewIcon from "@material-ui/icons/OpenInNew";
import { toast } from "react-toastify";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import Title from "../../components/Title";
import { i18n } from "../../translate/i18n";

const useStyles = makeStyles(theme => ({
  mainPaper: {
    flex: 1,
    padding: theme.spacing(3),
    overflowY: "auto",
    background: "transparent",
    border: "none",
    boxShadow: "none",
    ...theme.scrollbarStyles
  },
  hero: {
    borderRadius: 16,
    padding: theme.spacing(3),
    color: "#fff",
    background:
      "linear-gradient(135deg, #1d4ed8 0%, #2563eb 45%, #4f46e5 100%)",
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(2),
    marginBottom: theme.spacing(3),
    boxShadow: "0 10px 30px -10px rgba(37,99,235,0.5)"
  },
  heroIcon: {
    width: 56,
    height: 56,
    borderRadius: 14,
    background: "rgba(255,255,255,0.18)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center"
  },
  card: {
    padding: theme.spacing(3),
    borderRadius: 16,
    border: `1px solid ${theme.palette.divider}`,
    background: theme.palette.background.paper,
    height: "100%"
  },
  stepHeader: {
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(1.5),
    marginBottom: theme.spacing(1.5)
  },
  stepNumber: {
    width: 32,
    height: 32,
    borderRadius: 10,
    background: "linear-gradient(135deg, #2563eb, #4f46e5)",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 700
  },
  hint: {
    color: theme.palette.text.secondary,
    fontSize: 13,
    marginBottom: theme.spacing(1.5)
  },
  copyRow: {
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(1),
    marginBottom: theme.spacing(1.5)
  },
  copyField: {
    "& .MuiOutlinedInput-root": {
      borderRadius: 10,
      fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
      fontSize: 13,
      background: theme.palette.type === "dark" ? "rgba(255,255,255,0.03)" : "#f8fafc"
    }
  },
  copyBtn: {
    borderRadius: 10,
    border: `1px solid ${theme.palette.divider}`,
    padding: 10
  },
  fieldsChip: {
    marginTop: theme.spacing(1),
    marginRight: theme.spacing(0.5),
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace",
    fontSize: 12
  },
  connRow: {
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(2),
    padding: theme.spacing(1.5),
    borderRadius: 12,
    border: `1px solid ${theme.palette.divider}`,
    marginBottom: theme.spacing(1),
    transition: "background .15s ease",
    "&:hover": { background: theme.palette.action.hover }
  },
  connAvatar: {
    background: "linear-gradient(135deg, #16a34a, #22c55e)",
    color: "#fff"
  },
  connName: { fontWeight: 700, fontSize: 14 },
  connMeta: {
    fontSize: 12,
    color: theme.palette.text.secondary,
    fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace"
  },
  infoCard: {
    background:
      "linear-gradient(135deg, rgba(37,99,235,0.06), rgba(79,70,229,0.06))",
    border: "1px solid rgba(37,99,235,0.25)",
    borderRadius: 14,
    padding: theme.spacing(2.5)
  },
  warnCard: {
    background: "rgba(245,158,11,0.08)",
    border: "1px solid rgba(245,158,11,0.3)",
    borderRadius: 14,
    padding: theme.spacing(2.5)
  },
  list: { paddingLeft: 20, margin: 0, lineHeight: 1.75, fontSize: 13.5 },
  sectionTitle: {
    fontWeight: 700,
    fontSize: 15,
    marginBottom: 4
  }
}));

const MetaUnifiedWebhook = () => {
  const classes = useStyles();
  const history = useHistory();
  const [loading, setLoading] = useState(true);
  const [info, setInfo] = useState(null);
  const [connections, setConnections] = useState([]);
  const [subscribingId, setSubscribingId] = useState(null);
  // Mensagem exata devolvida pelo servidor. A tela mostrava um texto fixo e
  // genérico, escondendo o motivo real — que o backend já explica em detalhe
  // (API não configurada, empresa não registrada, token ausente...).
  const [erroDoServidor, setErroDoServidor] = useState("");
  const [subscribed, setSubscribed] = useState({});

  const fetchInfo = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/whatsapp-oficial/meta-webhook-info");
      setInfo(data);
      setErroDoServidor("");
    } catch (err) {
      toastError(err);
      setInfo(null);
      setErroDoServidor(
        err?.response?.data?.error || err?.response?.data?.message || ""
      );
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchConnections = useCallback(async () => {
    try {
      const { data } = await api.get("/whatsapp");
      const oficiais = (data || []).filter(
        w => w.channel === "whatsapp_oficial" || w.phone_number_id
      );
      setConnections(oficiais);
    } catch (err) {
      toastError(err);
    }
  }, []);

  useEffect(() => {
    fetchInfo();
    fetchConnections();
  }, [fetchInfo, fetchConnections]);

  const copy = (text, label) => {
    navigator.clipboard?.writeText(text);
    toast.success(i18n.t("metaUnifiedWebhook.copied", { defaultValue: `${label} copiado!`, label }));
  };

  const subscribe = async whatsappId => {
    setSubscribingId(whatsappId);
    try {
      await api.post(`/whatsapp-oficial/${whatsappId}/subscribe-waba`);
      toast.success(i18n.t("metaUnifiedWebhook.subscribedToast", "WABA inscrita no App da Meta!"));
      setSubscribed(s => ({ ...s, [whatsappId]: true }));
    } catch (err) {
      toastError(err);
    } finally {
      setSubscribingId(null);
    }
  };

  return (
    <MainContainer>
      <MainHeader>
        <Button
          size="small"
          variant="outlined"
          startIcon={<ArrowBackIcon />}
          onClick={() => history.push("/template-manager")}
          style={{ marginRight: 12, borderRadius: 10, textTransform: "none", fontWeight: 600 }}
        >
          {i18n.t("metaUnifiedWebhook.back", "Voltar para Templates")}
        </Button>
        <Title>{i18n.t("webhookUnified.title")}</Title>
        <Tooltip title={i18n.t("whatsappHealth.reloadTooltip")}>
          <IconButton onClick={fetchInfo} size="small">
            <RefreshIcon />
          </IconButton>
        </Tooltip>
      </MainHeader>

      <Paper className={classes.mainPaper} elevation={0}>
        <div className={classes.hero}>
          <div className={classes.heroIcon}>
            <LinkIcon style={{ fontSize: 30 }} />
          </div>
          <div style={{ flex: 1 }}>
            <Typography variant="h6" style={{ fontWeight: 700, color: "#fff" }}>
              {i18n.t("webhookUnified.subtitle")}
            </Typography>
            <Typography variant="body2" style={{ opacity: 0.92, color: "#fff" }}>
              {i18n.t("webhookUnified.description")}
            </Typography>
          </div>
          <Button
            variant="contained"
            size="small"
            href="https://developers.facebook.com/apps"
            target="_blank"
            startIcon={<OpenInNewIcon />}
            style={{ background: "#fff", color: "#1d4ed8", fontWeight: 700 }}
          >
            {i18n.t("webhookUnified.openMeta")}
          </Button>
        </div>

        {loading && (
          <Box display="flex" justifyContent="center" p={6}>
            <CircularProgress />
          </Box>
        )}

        {!loading && info && (
          <Grid container spacing={3}>
            {/* Step 1 — Credentials */}
            <Grid item xs={12} md={6}>
              <Paper className={classes.card} elevation={0}>
                <div className={classes.stepHeader}>
                  <div className={classes.stepNumber}>1</div>
                  <div>
                    <Typography className={classes.sectionTitle}>
                      {i18n.t("metaUnifiedWebhook.step1Title", "Cole estes valores no painel da Meta")}
                    </Typography>
                    <Typography variant="caption" color="textSecondary">
                      {i18n.t("metaUnifiedWebhook.step1Sub", "App da Meta → WhatsApp → Configuração → Webhook")}
                    </Typography>
                  </div>
                </div>

                <Box className={classes.copyRow}>
                  <TextField
                    label="Callback URL"
                    value={info.webhookUrl}
                    fullWidth
                    variant="outlined"
                    size="small"
                    className={classes.copyField}
                    InputProps={{
                      readOnly: true,
                      startAdornment: (
                        <LinkIcon fontSize="small" style={{ marginRight: 8, opacity: 0.6 }} />
                      )
                    }}
                  />
                  <Tooltip title={i18n.t("metaUnifiedWebhook.copyUrl", "Copiar URL")}>
                    <IconButton
                      className={classes.copyBtn}
                      onClick={() => copy(info.webhookUrl, "URL")}
                    >
                      <FileCopyIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>

                <Box className={classes.copyRow}>
                  <TextField
                    label="Verify Token"
                    value={info.verifyToken}
                    fullWidth
                    variant="outlined"
                    size="small"
                    className={classes.copyField}
                    InputProps={{
                      readOnly: true,
                      startAdornment: (
                        <VpnKeyIcon fontSize="small" style={{ marginRight: 8, opacity: 0.6 }} />
                      )
                    }}
                  />
                  <Tooltip title={i18n.t("metaUnifiedWebhook.copyToken", "Copiar token")}>
                    <IconButton
                      className={classes.copyBtn}
                      onClick={() => copy(info.verifyToken, "Verify token")}
                    >
                      <FileCopyIcon fontSize="small" />
                    </IconButton>
                  </Tooltip>
                </Box>

                <Typography variant="caption" color="textSecondary" dangerouslySetInnerHTML={{ __html: i18n.t("metaUnifiedWebhook.webhookFieldsLabel", "Em <strong>Webhook fields</strong>, marque:") }} />
                <div>
                  <Chip size="small" label="messages" className={classes.fieldsChip} color="primary" />
                  <Chip size="small" label="message_template_status_update" className={classes.fieldsChip} />
                </div>
              </Paper>
            </Grid>

            {/* Step 2 — Subscribe WABAs */}
            <Grid item xs={12} md={6}>
              <Paper className={classes.card} elevation={0}>
                <div className={classes.stepHeader}>
                  <div className={classes.stepNumber}>2</div>
                  <div>
                    <Typography className={classes.sectionTitle}>
                      {i18n.t("metaUnifiedWebhook.step2Title", "Inscreva cada WABA no seu App")}
                    </Typography>
                    <Typography variant="caption" color="textSecondary">
                      {i18n.t("metaUnifiedWebhook.step2Sub", "Chama /subscribed_apps com o token salvo na conexão")}
                    </Typography>
                  </div>
                </div>

                {connections.length === 0 ? (
                  <Box p={3} textAlign="center" color="text.secondary">
                    <WhatsAppIcon style={{ fontSize: 40, opacity: 0.3 }} />
                    <Typography variant="body2" style={{ marginTop: 8 }}>
                      {i18n.t("metaUnifiedWebhook.noConnections", "Nenhuma conexão oficial encontrada.")}
                    </Typography>
                    <Typography variant="caption">
                      {i18n.t("metaUnifiedWebhook.noConnectionsHint", "Cadastre uma conexão WhatsApp Oficial primeiro.")}
                    </Typography>
                  </Box>
                ) : (
                  connections.map(w => {
                    const ready = w.waba_id && (w.send_token || w.tokenMeta);
                    const isSub = subscribed[w.id];
                    return (
                      <div key={w.id} className={classes.connRow}>
                        <Avatar className={classes.connAvatar}>
                          <WhatsAppIcon />
                        </Avatar>
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className={classes.connName}>
                            {w.name}{" "}
                            {w.phone_number && (
                              <Chip size="small" label={w.phone_number} style={{ marginLeft: 6 }} />
                            )}
                          </div>
                          <div className={classes.connMeta}>
                            WABA: {w.waba_id || "—"} · phone_id: {w.phone_number_id || "—"}
                          </div>
                        </div>
                        {isSub ? (
                          <Chip
                            icon={<CheckCircleIcon style={{ color: "#16a34a" }} />}
                            label={i18n.t("metaUnifiedWebhook.subscribed", "Inscrito")}
                            size="small"
                            style={{ background: "rgba(34,197,94,0.15)", color: "#0f7b3a", fontWeight: 700 }}
                          />
                        ) : (
                          <Button
                            variant="contained"
                            color="primary"
                            size="small"
                            disableElevation
                            disabled={subscribingId === w.id || !ready}
                            onClick={() => subscribe(w.id)}
                            style={{ borderRadius: 10, fontWeight: 700, textTransform: "none" }}
                          >
                            {subscribingId === w.id ? i18n.t("metaUnifiedWebhook.subscribing", "Inscrevendo...") : i18n.t("metaUnifiedWebhook.subscribe", "Inscrever WABA")}
                          </Button>
                        )}
                      </div>
                    );
                  })
                )}
              </Paper>
            </Grid>

            {/* Info card */}
            <Grid item xs={12} md={6}>
              <div className={classes.infoCard}>
                <Box display="flex" alignItems="center" gridGap={8} mb={1}>
                  <InfoIcon style={{ color: "#2563eb" }} />
                  <Typography className={classes.sectionTitle}>{i18n.t("metaUnifiedWebhook.howItWorks", "Como funciona")}</Typography>
                </Box>
                <Typography variant="body2" style={{ marginBottom: 12 }} dangerouslySetInnerHTML={{
                  __html: i18n.t("metaUnifiedWebhook.howItWorksText", "Esta página gera uma <strong>única URL e Verify Token</strong> que recebem eventos de todos os seus números oficiais. Cada mensagem é roteada para a conexão correta pelo <code>phone_number_id</code>.")
                }} />
                <Typography variant="subtitle2" style={{ fontWeight: 700, marginBottom: 4 }}>
                  {i18n.t("metaUnifiedWebhook.stepByStep", "Passo a passo")}
                </Typography>
                <ol className={classes.list}>
                  <li dangerouslySetInnerHTML={{ __html: i18n.t("metaUnifiedWebhook.step1", "Acesse <strong>developers.facebook.com</strong> → seu App → <strong>WhatsApp → Configuração</strong>.") }} />
                  <li dangerouslySetInnerHTML={{ __html: i18n.t("metaUnifiedWebhook.step2", "Em <strong>Webhook</strong>, clique em <em>Editar</em> e cole a Callback URL e o Verify Token acima.") }} />
                  <li dangerouslySetInnerHTML={{ __html: i18n.t("metaUnifiedWebhook.step3", "Clique em <strong>Verificar e salvar</strong>.") }} />
                  <li dangerouslySetInnerHTML={{ __html: i18n.t("metaUnifiedWebhook.step4", "Em <strong>Webhook fields</strong>, marque <code>messages</code>.") }} />
                  <li dangerouslySetInnerHTML={{ __html: i18n.t("metaUnifiedWebhook.step5", "Volte aqui e clique em <strong>Inscrever WABA</strong> em cada número.") }} />
                </ol>
              </div>
            </Grid>

            {/* Troubleshooting */}
            <Grid item xs={12} md={6}>
              <div className={classes.warnCard}>
                <Box display="flex" alignItems="center" gridGap={8} mb={1}>
                  <HelpIcon style={{ color: "#d97706" }} />
                  <Typography className={classes.sectionTitle}>
                    {i18n.t("metaUnifiedWebhook.errorTitle", "Erro ao validar URL ou token?")}
                  </Typography>
                </Box>
                <ul className={classes.list}>
                  <li dangerouslySetInnerHTML={{ __html: i18n.t("metaUnifiedWebhook.tip1", "Confirme que copiou a <strong>URL inteira</strong> sem espaços e o Verify Token idêntico.") }} />
                  <li dangerouslySetInnerHTML={{ __html: i18n.t("metaUnifiedWebhook.tip2", "A URL precisa ser <strong>HTTPS pública</strong> e responder em poucos segundos.") }} />
                  <li dangerouslySetInnerHTML={{ __html: i18n.t("metaUnifiedWebhook.tip3", "Se usa Cloudflare/WAF, libere a rota <code>/v1/webhook/unified/*</code>.") }} />
                  <li dangerouslySetInnerHTML={{ __html: i18n.t("metaUnifiedWebhook.tip4", "Desative <em>\"Anexe um certificado de cliente\"</em>, exceto se usar mTLS.") }} />
                  <li dangerouslySetInnerHTML={{ __html: i18n.t("metaUnifiedWebhook.tip5", "Clique no botão de recarregar acima caso tenha trocado a conexão.") }} />
                </ul>
              </div>
            </Grid>
          </Grid>
        )}

        {!loading && !info && (
          <Paper className={classes.card} elevation={0}>
            <Typography color="error">
              {erroDoServidor || i18n.t("webhookUnified.loadError")}
            </Typography>
          </Paper>
        )}
      </Paper>
    </MainContainer>
  );
};

export default MetaUnifiedWebhook;
