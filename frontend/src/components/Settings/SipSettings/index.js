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
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  FormControlLabel,
  Switch,
  Divider,
  Box,
  Chip,
} from "@material-ui/core";
import Visibility from "@material-ui/icons/Visibility";
import VisibilityOff from "@material-ui/icons/VisibilityOff";
import PhoneIcon from "@material-ui/icons/Phone";
import { toast } from "react-toastify";
import { sipApi } from "../../../services/wacallsApi";
import { i18n } from "../../../translate/i18n";

// Painel de configuração da troncal SIP (baresip) — extensão do discador do
// WhatsApp Plus (ver DialerModal, aba "Via SIP") pra ligar/receber por uma
// linha SIP comum (Asterisk, FreePBX, operadora VoIP), independente do
// WhatsApp. É uma configuração ÚNICA/GLOBAL pro servidor (não por conexão),
// por isso fica aqui em Configurações e não na tela de Conexões — o backend
// já reflete isso (settings global no wacalls-chat, ver sipapi.go).
const useStyles = makeStyles((theme) => ({
  root: {
    padding: theme.spacing(3),
    maxWidth: 700,
  },
  title: {
    marginBottom: theme.spacing(1),
    fontWeight: 600,
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(1),
  },
  subtitle: {
    marginBottom: theme.spacing(3),
    color: theme.palette.text.secondary,
  },
  buttonContainer: {
    marginTop: theme.spacing(3),
    display: "flex",
    gap: theme.spacing(2),
    alignItems: "center",
  },
  divider: {
    margin: theme.spacing(3, 0),
  },
  helpText: {
    fontSize: 12,
    color: theme.palette.text.secondary,
    marginTop: theme.spacing(0.5),
  },
  warningBox: {
    padding: 12,
    backgroundColor: "rgba(226,121,61,0.08)",
    border: "1px solid rgba(226,121,61,0.3)",
    borderRadius: 8,
    marginBottom: theme.spacing(3),
  },
}));

const emptySettings = {
  enabled: false,
  host: "",
  port: 5060,
  username: "",
  password: "",
  domain: "",
  transport: "udp",
  callerId: "",
};

const SipSettings = () => {
  const classes = useStyles();
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [hasPassword, setHasPassword] = useState(false);
  const [status, setStatus] = useState(null);
  const [settings, setSettings] = useState(emptySettings);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const { data } = await sipApi.get("/settings");
      setSettings((prev) => ({
        ...prev,
        enabled: !!data.enabled,
        host: data.host || "",
        port: data.port || 5060,
        username: data.username || "",
        password: "",
        domain: data.domain || "",
        transport: data.transport || "udp",
        callerId: data.callerId || "",
      }));
      setHasPassword(!!data.hasPassword);
    } catch (err) {
      // Troncal ainda não configurada / wacalls-chat indisponível — mantém
      // os valores em branco, sem exibir erro (é o estado esperado antes do
      // primeiro uso).
    }
    setLoading(false);
  };

  const loadStatus = async () => {
    try {
      const { data } = await sipApi.get("/status");
      setStatus(data);
    } catch {
      setStatus(null);
    }
  };

  useEffect(() => {
    loadSettings();
    loadStatus();
    // O chip "conectado/desconectado" refletia só o instante do mount (ou
    // logo após salvar) — se o processo baresip demorasse alguns segundos
    // pra terminar de subir/conectar no ctrl_tcp DEPOIS desse ponto (comum:
    // spawn do processo + handshake ctrl_tcp não são instantâneos), a tela
    // ficava mostrando "desconectado" pra sempre, mesmo com a troncal já
    // funcionando de verdade (ligações passando). Poll simples a cada 5s
    // enquanto a tela estiver aberta resolve sem precisar de push/websocket.
    const interval = setInterval(loadStatus, 5000);
    return () => clearInterval(interval);
  }, []);

  const handleChange = (e) => {
    const { name, value } = e.target;
    setSettings((prev) => ({ ...prev, [name]: value }));
  };

  const handleToggleEnabled = (e) => {
    setSettings((prev) => ({ ...prev, enabled: e.target.checked }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const payload = { ...settings, port: Number(settings.port) || 5060 };
      // Não sobrescreve a senha salva se o campo ficou em branco (backend já
      // preserva a antiga nesse caso — ver handleSetSipSettings em
      // sipapi.go), então não precisa reenviar aqui.
      const { data } = await sipApi.put("/settings", payload);
      setHasPassword(!!data.hasPassword);
      setSettings((prev) => ({ ...prev, password: "" }));
      toast.success(i18n.t("sipSettings.saved"));
      loadStatus();
      // O baresip dessa empresa pode ter acabado de ser spawnado agora (ver
      // SaveConfig -> EnsureStarted em sipregistry.go) — processo novo +
      // handshake ctrl_tcp não fecham no mesmo instante do PUT responder.
      // Rechecagens curtas cobrem essa janela sem esperar o poll de 5s.
      setTimeout(loadStatus, 2000);
      setTimeout(loadStatus, 5000);
    } catch (err) {
      toast.error(
        err?.response?.data?.error || i18n.t("sipSettings.saveError")
      );
    }
    setSaving(false);
  };

  return (
    <div className={classes.root}>
      <Typography variant="h6" className={classes.title}>
        <PhoneIcon fontSize="small" /> {i18n.t("sipSettings.title")}
      </Typography>
      <Typography variant="body2" className={classes.subtitle}>
        {i18n.t("sipSettings.subtitle")}
      </Typography>

      <Box className={classes.warningBox}>
        <Typography variant="body2">
          {i18n.t("sipSettings.warning")}
        </Typography>
        {status && (
          <Box mt={1} display="flex" style={{ gap: 8 }}>
            <Chip
              size="small"
              label={status.baresipConnected ? i18n.t("sipSettings.connected") : i18n.t("sipSettings.disconnected")}
              style={{
                backgroundColor: status.baresipConnected ? "#2e7d3220" : "#c0392b20",
                color: status.baresipConnected ? "#2e7d32" : "#c0392b",
              }}
            />
            <Chip
              size="small"
              label={status.trunkEnabled ? i18n.t("sipSettings.trunkEnabled") : i18n.t("sipSettings.trunkDisabled")}
            />
          </Box>
        )}
      </Box>

      <Grid container spacing={2}>
        <Grid item xs={12}>
          <FormControlLabel
            control={
              <Switch checked={!!settings.enabled} onChange={handleToggleEnabled} color="primary" />
            }
            label={i18n.t("sipSettings.enableTrunk")}
          />
        </Grid>

        <Grid item xs={12} sm={8}>
          <TextField
            fullWidth
            label={i18n.t("sipSettings.host")}
            name="host"
            variant="outlined"
            size="small"
            value={settings.host}
            onChange={handleChange}
            placeholder="sip.meuprovedor.com.br"
          />
        </Grid>
        <Grid item xs={12} sm={4}>
          <TextField
            fullWidth
            label={i18n.t("sipSettings.port")}
            name="port"
            variant="outlined"
            size="small"
            type="number"
            value={settings.port}
            onChange={handleChange}
            placeholder="5060"
          />
        </Grid>

        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            label={i18n.t("sipSettings.username")}
            name="username"
            variant="outlined"
            size="small"
            value={settings.username}
            onChange={handleChange}
            placeholder={i18n.t("sipSettings.usernamePlaceholder")}
          />
        </Grid>
        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            label={hasPassword ? i18n.t("sipSettings.passwordFilled") : i18n.t("sipSettings.password")}
            name="password"
            variant="outlined"
            size="small"
            type={showPassword ? "text" : "password"}
            value={settings.password}
            onChange={handleChange}
            placeholder={hasPassword ? "••••••••" : ""}
            InputProps={{
              endAdornment: (
                <InputAdornment position="end">
                  <IconButton size="small" onClick={() => setShowPassword(!showPassword)}>
                    {showPassword ? <VisibilityOff /> : <Visibility />}
                  </IconButton>
                </InputAdornment>
              ),
            }}
          />
        </Grid>

        <Grid item xs={12} sm={6}>
          <TextField
            fullWidth
            label={i18n.t("sipSettings.domain")}
            name="domain"
            variant="outlined"
            size="small"
            value={settings.domain}
            onChange={handleChange}
            placeholder={i18n.t("sipSettings.domainPlaceholder")}
            helperText={i18n.t("sipSettings.domainHelp")}
          />
        </Grid>
        <Grid item xs={12} sm={3}>
          <FormControl variant="outlined" size="small" fullWidth>
            <InputLabel>{i18n.t("sipSettings.transport")}</InputLabel>
            <Select name="transport" value={settings.transport} onChange={handleChange} label={i18n.t("sipSettings.transport")}>
              <MenuItem value="udp">UDP</MenuItem>
              <MenuItem value="tcp">TCP</MenuItem>
              <MenuItem value="tls">TLS</MenuItem>
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={12} sm={3}>
          <TextField
            fullWidth
            label={i18n.t("sipSettings.callerId")}
            name="callerId"
            variant="outlined"
            size="small"
            value={settings.callerId}
            onChange={handleChange}
            placeholder={i18n.t("sipSettings.optional")}
          />
        </Grid>
      </Grid>

      <div className={classes.buttonContainer}>
        <Button variant="contained" color="primary" onClick={handleSave} disabled={saving || loading}>
          {saving ? <CircularProgress size={24} /> : i18n.t("sipSettings.save")}
        </Button>
        {loading && <CircularProgress size={20} />}
      </div>

      <Divider className={classes.divider} />
      <Typography className={classes.helpText}>
        {i18n.t("sipSettings.testCallHelp")}
      </Typography>
    </div>
  );
};

export default SipSettings;
