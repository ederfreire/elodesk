import React, { useState, useEffect } from "react";
import {
  makeStyles,
  TextField,
  Button,
  Grid,
  Typography,
  IconButton,
  InputAdornment,
  CircularProgress,
  Divider,
  Box,
} from "@material-ui/core";
import Visibility from "@material-ui/icons/Visibility";
import VisibilityOff from "@material-ui/icons/VisibilityOff";
import InstagramIcon from "@material-ui/icons/Instagram";
import { toast } from "react-toastify";
import api from "../../../services/api";

const useStyles = makeStyles((theme) => ({
  root: {
    padding: theme.spacing(3),
    maxWidth: 760,
  },
  title: {
    marginBottom: theme.spacing(1),
    fontWeight: 600,
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(1),
  },
  subtitle: {
    marginBottom: theme.spacing(2),
    color: theme.palette.text.secondary,
  },
  sectionTitle: {
    marginTop: theme.spacing(3),
    marginBottom: theme.spacing(1),
    fontWeight: 500,
  },
  buttonContainer: {
    marginTop: theme.spacing(3),
    display: "flex",
    gap: theme.spacing(2),
  },
  divider: {
    margin: theme.spacing(3, 0),
  },
  helpText: {
    fontSize: 12,
    color: theme.palette.text.secondary,
    marginTop: theme.spacing(0.5),
  },
  infoBox: {
    padding: 12,
    backgroundColor: "rgba(78, 147, 255, 0.08)",
    borderRadius: 8,
    marginBottom: theme.spacing(2),
  },
  codeBox: {
    fontFamily: "'IBM Plex Mono', monospace",
    fontSize: 12,
    backgroundColor: "rgba(0,0,0,0.04)",
    padding: "6px 10px",
    borderRadius: 6,
    display: "inline-block",
    marginTop: 4,
    wordBreak: "break-all",
  },
}));

const MetaSettings = () => {
  const classes = useStyles();
  const [loading, setLoading] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [showSystemUserToken, setShowSystemUserToken] = useState(false);
  const [settings, setSettings] = useState({
    metaAppId: "",
    metaAppSecret: "",
    metaVerifyToken: "",
    metaConfigurationId: "",
    metaSystemUserToken: "",
  });
  const [envInfo, setEnvInfo] = useState({ envAppId: "", envVerifyToken: "" });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/meta-settings");
      setSettings({
        metaAppId: data.metaAppId || "",
        metaAppSecret: data.metaAppSecret || "",
        metaVerifyToken: data.metaVerifyToken || "",
        metaConfigurationId: data.metaConfigurationId || "",
        metaSystemUserToken: data.metaSystemUserToken || "",
      });
      setEnvInfo({
        envAppId: data.envAppId || "",
        envVerifyToken: data.envVerifyToken || "",
      });
    } catch (err) {
      // ignore
    }
    setLoading(false);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setSettings((prev) => ({ ...prev, [name]: value }));
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      await api.put("/meta-settings", settings);
      toast.success("Configurações da Meta salvas com sucesso.");
    } catch (err) {
      const msg =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        err?.message ||
        "Erro ao salvar configurações da Meta.";
      toast.error(msg);
    }
    setLoading(false);
  };

  const apiBase =
    process.env.REACT_APP_BACKEND_URL ||
    (typeof window !== "undefined" ? window.location.origin : "");

  return (
    <div className={classes.root}>
      <Typography variant="h6" className={classes.title}>
        <InstagramIcon style={{ color: "#E1306C" }} />
        Instagram / Facebook (Meta)
      </Typography>
      <Typography variant="body2" className={classes.subtitle}>
        Credenciais do App Meta usadas pelo Embedded Signup do WhatsApp, login
        do Facebook e integração com Instagram Direct. Os valores aqui têm
        prioridade sobre as variáveis de ambiente.
      </Typography>

      <Box className={classes.infoBox}>
        <Typography variant="body2">
          <strong>Onde obter:</strong>{" "}
          <a
            href="https://developers.facebook.com/apps/"
            target="_blank"
            rel="noopener noreferrer"
          >
            developers.facebook.com/apps
          </a>{" "}
          → seu App → <em>Configurações → Básico</em>.
        </Typography>
        <Typography variant="body2" style={{ marginTop: 6 }}>
          <strong>Webhook Callback URL:</strong>
          <div className={classes.codeBox}>{apiBase}/webhook</div>
        </Typography>
      </Box>

      <Grid container spacing={2}>
        <Grid item xs={12}>
          <TextField
            fullWidth
            label="Meta App ID"
            name="metaAppId"
            variant="outlined"
            size="small"
            value={settings.metaAppId}
            onChange={handleChange}
            placeholder={envInfo.envAppId || "ex: 2021770751787040"}
          />
          {envInfo.envAppId && !settings.metaAppId && (
            <Typography className={classes.helpText}>
              Usando valor do .env: <strong>{envInfo.envAppId}</strong>
            </Typography>
          )}
        </Grid>

        <Grid item xs={12}>
          <TextField
            fullWidth
            label="Meta App Secret"
            name="metaAppSecret"
            variant="outlined"
            size="small"
            type={showSecret ? "text" : "password"}
            value={settings.metaAppSecret}
            onChange={handleChange}
            placeholder="••••••••••••••••"
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton
                    size="small"
                    onClick={() => setShowSecret(!showSecret)}
                  >
                    {showSecret ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
          <Typography className={classes.helpText}>
            Mantido em segredo no banco. Nunca é exposto ao frontend público.
          </Typography>
        </Grid>

        <Grid item xs={12}>
          <TextField
            fullWidth
            label="Verify Token (Webhook)"
            name="metaVerifyToken"
            variant="outlined"
            size="small"
            value={settings.metaVerifyToken}
            onChange={handleChange}
            placeholder={envInfo.envVerifyToken || "whaticket"}
          />
          <Typography className={classes.helpText}>
            Use o mesmo valor configurado no painel Meta em{" "}
            <em>Webhooks → Verify Token</em>.
          </Typography>
        </Grid>
      </Grid>

      <Divider className={classes.divider} />


      {/* ============ Meta / WhatsApp Embedded Signup ============ */}
      <Box
        style={{
          border: "1px solid #e5e7eb",
          borderLeft: "3px solid #4E93FF",
          borderRadius: 8,
          padding: 16,
          marginBottom: 24,
          backgroundColor: "rgba(249, 250, 251, 0.6)",
        }}
      >
        <Typography variant="subtitle1" style={{ fontWeight: 600, marginBottom: 4 }}>
          Meta / WhatsApp Embedded Signup
        </Typography>
        <Typography variant="body2" style={{ color: "#64748b", marginBottom: 16 }}>
          Configure as credenciais da Meta para permitir o cadastro de números WhatsApp Business diretamente pelo CRM via Embedded Signup.
        </Typography>

        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label="Meta Configuration ID (Embedded Signup)"
              name="metaConfigurationId"
              variant="outlined"
              size="small"
              value={settings.metaConfigurationId}
              onChange={handleChange}
            />
            <Typography className={classes.helpText}>
              ID da configuração de Embedded Signup (WhatsApp → API Setup)
            </Typography>
          </Grid>

          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label="Meta System User Token"
              name="metaSystemUserToken"
              variant="outlined"
              size="small"
              type={showSystemUserToken ? "text" : "password"}
              value={settings.metaSystemUserToken}
              onChange={handleChange}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      size="small"
                      onClick={() => setShowSystemUserToken(!showSystemUserToken)}
                    >
                      {showSystemUserToken ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
            <Typography className={classes.helpText}>
              Token do System User com permissões de whatsapp_business_management
            </Typography>
          </Grid>
        </Grid>
      </Box>

      {/* As credenciais do Google saíram daqui para a aba própria
          "Google (Login & Agenda)". Eram dois provedores sem relação nenhuma
          na mesma tela: quem procurava o login com Google não tinha por que
          abrir uma aba chamada Instagram / Facebook. Os campos continuam
          gravando nas MESMAS chaves, pelo mesmo endpoint — nada foi perdido. */}

      <Typography variant="subtitle2" style={{ marginBottom: 8 }}>
        Permissões mínimas no App Meta
      </Typography>
      <Typography variant="body2" style={{ color: "#64748b" }}>
        <code>instagram_basic</code>, <code>instagram_manage_messages</code>,{" "}
        <code>pages_messaging</code>, <code>pages_show_list</code>,{" "}
        <code>pages_manage_metadata</code>, <code>business_management</code>
      </Typography>

      <div className={classes.buttonContainer}>
        <Button
          variant="contained"
          color="primary"
          onClick={handleSave}
          disabled={loading}
        >
          {loading ? <CircularProgress size={24} /> : "Salvar"}
        </Button>
      </div>
    </div>
  );
};

export default MetaSettings;
