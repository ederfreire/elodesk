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
} from "@material-ui/core";
import Visibility from "@material-ui/icons/Visibility";
import VisibilityOff from "@material-ui/icons/VisibilityOff";
import EmailIcon from "@material-ui/icons/Email";
import { toast } from "react-toastify";
import api from "../../../services/api";
import { i18n } from "../../../translate/i18n";

const useStyles = makeStyles((theme) => ({
  root: {
    padding: theme.spacing(3),
    maxWidth: 700,
  },
  title: {
    marginBottom: theme.spacing(3),
    fontWeight: 600,
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
}));

const SmtpSettings = () => {
  const classes = useStyles();
  const [loading, setLoading] = useState(false);
  const [testing, setTesting] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [showClientSecret, setShowClientSecret] = useState(false);
  const [testEmail, setTestEmail] = useState("");
  const [settings, setSettings] = useState({
    smtpHost: "",
    smtpPort: "587",
    smtpUser: "",
    smtpPass: "",
    smtpFrom: "",
    smtpSecure: "false",
    smtpAuthType: "password",
    smtpOauth2ClientId: "",
    smtpOauth2ClientSecret: "",
    smtpOauth2RefreshToken: "",
  });

  useEffect(() => {
    loadSettings();
  }, []);

  const loadSettings = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/smtp-settings");
      setSettings((prev) => ({
        ...prev,
        smtpHost: data.smtpHost || "",
        smtpPort: data.smtpPort || "587",
        smtpUser: data.smtpUser || "",
        smtpPass: data.smtpPass || "",
        smtpFrom: data.smtpFrom || "",
        smtpSecure: data.smtpSecure || "false",
        smtpAuthType: data.smtpAuthType || "password",
        smtpOauth2ClientId: data.smtpOauth2ClientId || "",
        smtpOauth2ClientSecret: data.smtpOauth2ClientSecret || "",
        smtpOauth2RefreshToken: data.smtpOauth2RefreshToken || "",
      }));
    } catch (err) {
      // Settings may not exist yet
    }
    setLoading(false);
  };

  const handleChange = (e) => {
    const { name, value } = e.target;
    setSettings((prev) => ({ ...prev, [name]: value }));
  };

  const handleSecureChange = (e) => {
    const secure = e.target.checked;
    setSettings((prev) => ({
      ...prev,
      smtpSecure: secure ? "true" : "false",
      smtpPort: secure ? "465" : "587",
    }));
  };

  const handleSave = async () => {
    setLoading(true);
    try {
      await api.put("/smtp-settings", settings);
      toast.success(i18n.t("smtpSettings.toasts.saveSuccess"));
    } catch (err) {
      toast.error(i18n.t("smtpSettings.toasts.saveError"));
    }
    setLoading(false);
  };

  const handleTest = async () => {
    if (!testEmail) {
      toast.warning(i18n.t("smtpSettings.toasts.emailRequired"));
      return;
    }
    setTesting(true);
    try {
      await api.post("/smtp-settings/test", { email: testEmail, language: localStorage.getItem("language") || "pt-BR" });
      toast.success(i18n.t("smtpSettings.toasts.testSuccess"));
    } catch (err) {
      toast.error(i18n.t("smtpSettings.toasts.testError"));
    }
    setTesting(false);
  };

  const isOAuth2 = settings.smtpAuthType === "oauth2";

  return (
    <div className={classes.root}>
      <Typography variant="h6" className={classes.title}>
        {i18n.t("smtpSettings.title")}
      </Typography>
      <Typography variant="body2" className={classes.subtitle}>
        {i18n.t("smtpSettings.description")}
      </Typography>

      {/* Servidor e Porta */}
      <Grid container spacing={2}>
        <Grid item xs={12} sm={8}>
          <TextField
            fullWidth
            label={i18n.t("smtpSettings.server")}
            name="smtpHost"
            variant="outlined"
            size="small"
            value={settings.smtpHost}
            onChange={handleChange}
            placeholder="smtp.gmail.com"
          />
        </Grid>
        <Grid item xs={12} sm={4}>
          <TextField
            fullWidth
            label={i18n.t("smtpSettings.port")}
            name="smtpPort"
            variant="outlined"
            size="small"
            value={settings.smtpPort}
            onChange={handleChange}
            placeholder="587"
            type="number"
          />
        </Grid>

        {/* TLS/SSL */}
        <Grid item xs={12}>
          <FormControlLabel
            control={
              <Switch
                checked={settings.smtpSecure === "true"}
                onChange={handleSecureChange}
                color="primary"
              />
            }
            label={i18n.t("smtpSettings.secure")}
          />
          <Typography className={classes.helpText}>
            {i18n.t("smtpSettings.secureHelp")}
          </Typography>
        </Grid>

        {/* E-mail e Nome */}
        <Grid item xs={12}>
          <TextField
            fullWidth
            label={i18n.t("smtpSettings.senderEmail")}
            name="smtpUser"
            variant="outlined"
            size="small"
            value={settings.smtpUser}
            onChange={handleChange}
            placeholder="seu-email@gmail.com"
          />
        </Grid>
        <Grid item xs={12}>
          <TextField
            fullWidth
            label={i18n.t("smtpSettings.senderName")}
            name="smtpFrom"
            variant="outlined"
            size="small"
            value={settings.smtpFrom}
            onChange={handleChange}
            placeholder="Equipechat"
            helperText={i18n.t("smtpSettings.senderNameHelp")}
          />
        </Grid>
      </Grid>

      <Divider className={classes.divider} />

      {/* Tipo de Autenticação */}
      <Typography variant="subtitle1" className={classes.sectionTitle}>
        Autenticação
      </Typography>

      <Grid container spacing={2}>
        <Grid item xs={12}>
          <FormControl variant="outlined" size="small" fullWidth>
            <InputLabel>{i18n.t("smtpSettings.authMethod")}</InputLabel>
            <Select
              name="smtpAuthType"
              value={settings.smtpAuthType}
              onChange={handleChange}
              label={i18n.t("smtpSettings.authMethod")}
            >
              <MenuItem value="password">{i18n.t("smtpSettings.password")}</MenuItem>
              <MenuItem value="oauth2">OAuth2 (Gmail)</MenuItem>
            </Select>
          </FormControl>
        </Grid>

        {!isOAuth2 && (
          <Grid item xs={12}>
            <TextField
              fullWidth
              label={i18n.t("smtpSettings.passwordLabel")}
              name="smtpPass"
              variant="outlined"
              size="small"
              type={showPassword ? "text" : "password"}
              value={settings.smtpPass}
              onChange={handleChange}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      size="small"
                      onClick={() => setShowPassword(!showPassword)}
                    >
                      {showPassword ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
            <Typography className={classes.helpText}>
              {i18n.t("smtpSettings.gmailHelp")}
            </Typography>
          </Grid>
        )}

        {isOAuth2 && (
          <>
            <Grid item xs={12}>
              <Box
                style={{
                  padding: 12,
                  backgroundColor: "rgba(66, 133, 244, 0.08)",
                  borderRadius: 8,
                  marginBottom: 8,
                }}
              >
                <Typography variant="body2">
                  <strong>OAuth2 para Gmail:</strong> Configure um projeto no Google Cloud Console,
                  ative a Gmail API, crie credenciais OAuth 2.0 e obtenha o Refresh Token.{" "}
                  <a
                    href="https://developers.google.com/identity/protocols/oauth2"
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    Ver documentação
                  </a>
                </Typography>
              </Box>
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Client ID"
                name="smtpOauth2ClientId"
                variant="outlined"
                size="small"
                value={settings.smtpOauth2ClientId}
                onChange={handleChange}
                placeholder="xxxxx.apps.googleusercontent.com"
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Client Secret"
                name="smtpOauth2ClientSecret"
                variant="outlined"
                size="small"
                type={showClientSecret ? "text" : "password"}
                value={settings.smtpOauth2ClientSecret}
                onChange={handleChange}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        size="small"
                        onClick={() => setShowClientSecret(!showClientSecret)}
                      >
                        {showClientSecret ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
            </Grid>
            <Grid item xs={12}>
              <TextField
                fullWidth
                label="Refresh Token"
                name="smtpOauth2RefreshToken"
                variant="outlined"
                size="small"
                type={showPassword ? "text" : "password"}
                value={settings.smtpOauth2RefreshToken}
                onChange={handleChange}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <IconButton
                        size="small"
                        onClick={() => setShowPassword(!showPassword)}
                      >
                        {showPassword ? <VisibilityOff /> : <Visibility />}
                      </IconButton>
                    </InputAdornment>
                  ),
                }}
              />
            </Grid>
          </>
        )}
      </Grid>

      <div className={classes.buttonContainer}>
        <Button
          variant="contained"
          color="primary"
          onClick={handleSave}
          disabled={loading}
        >
          {loading ? <CircularProgress size={24} /> : i18n.t("smtpSettings.save")}
        </Button>
      </div>

      <Divider className={classes.divider} />

      <Typography variant="subtitle2" style={{ marginBottom: 8 }}>
        Testar Configuração
      </Typography>
      <Grid container spacing={2} alignItems="center">
        <Grid item xs={12} sm={8}>
          <TextField
            fullWidth
            label={i18n.t("smtpSettings.testEmail")}
            variant="outlined"
            size="small"
            value={testEmail}
            onChange={(e) => setTestEmail(e.target.value)}
            placeholder="teste@email.com"
          />
        </Grid>
        <Grid item xs={12} sm={4}>
          <Button
            variant="outlined"
            color="primary"
            onClick={handleTest}
            disabled={testing}
            startIcon={testing ? <CircularProgress size={18} /> : <EmailIcon />}
            fullWidth
          >
            Enviar Teste
          </Button>
        </Grid>
      </Grid>
    </div>
  );
};

export default SmtpSettings;
