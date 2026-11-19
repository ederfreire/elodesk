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
  Box,
} from "@material-ui/core";
import Visibility from "@material-ui/icons/Visibility";
import VisibilityOff from "@material-ui/icons/VisibilityOff";
import KeyIcon from "@material-ui/icons/VpnKeyOutlined";
import { toast } from "react-toastify";
import api from "../../../services/api";
import { i18n } from "../../../translate/i18n";

/**
 * Credenciais OAuth do Google para LOGIN SOCIAL.
 *
 * Antes isto ficava dentro da aba "Instagram / Facebook", junto das credenciais
 * do App Meta — dois provedores sem nenhuma relação na mesma tela. Quem
 * procurava a configuração do login com Google não tinha motivo nenhum para
 * abrir uma aba com nome de Instagram.
 *
 * Continua usando o MESMO endpoint /meta-settings, que já grava chave a chave e
 * ignora o que não vier no corpo (ver MetaSettingsController: "if
 * (data[key] === undefined) continue"). Por isso esta tela envia só as chaves
 * do Google e não apaga nada da Meta — e vice-versa.
 */

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
  sectionLabel: {
    fontWeight: 600,
    color: theme.palette.text.secondary,
  },
  helpText: {
    fontSize: 12,
    color: theme.palette.text.secondary,
    marginTop: theme.spacing(0.5),
  },
  card: {
    border: `1px solid ${theme.mode === "light" ? "#e5e7eb" : "rgba(255,255,255,0.12)"}`,
    borderLeft: "3px solid #EA4335",
    borderRadius: 8,
    padding: 16,
    marginBottom: 24,
    backgroundColor:
      theme.mode === "light" ? "rgba(249, 250, 251, 0.6)" : "rgba(255,255,255,0.03)",
  },
  buttonContainer: {
    marginTop: theme.spacing(1),
    display: "flex",
    gap: theme.spacing(2),
  },
}));

// Só as credenciais de LOGIN. As do Google Agenda são salvas pela tela da
// própria integração.
//
// IMPORTANTE: esta lista também define o que é ENVIADO ao salvar. Deixar
// "googleCalendarClientId" aqui faria esta tela sobrescrever com vazio o que
// a tela da Agenda gravou.
const CAMPOS_GOOGLE = ["googleClientId", "googleClientSecret"];

const GoogleSettings = () => {
  const classes = useStyles();
  const [loading, setLoading] = useState(false);
  const [mostrarSegredoLogin, setMostrarSegredoLogin] = useState(false);
  const [settings, setSettings] = useState({
    googleClientId: "",
    googleClientSecret: "",
  });

  useEffect(() => {
    carregar();
  }, []);

  const carregar = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/meta-settings");
      setSettings({
        googleClientId: data.googleClientId || "",
        googleClientSecret: data.googleClientSecret || "",
      });
    } catch (err) {
      // Sem credencial salva ainda: campos vazios é o estado correto.
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
      // Envia SÓ as chaves do Google. As da Meta ficam intocadas.
      const corpo = {};
      CAMPOS_GOOGLE.forEach((campo) => {
        corpo[campo] = settings[campo];
      });
      await api.put("/meta-settings", corpo);
      toast.success(
        i18n.t("googleSettings.saved", "Credenciais do Google salvas com sucesso.")
      );
    } catch (err) {
      const msg =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        err?.message ||
        i18n.t("googleSettings.saveError", "Erro ao salvar as credenciais do Google.");
      toast.error(msg);
    }
    setLoading(false);
  };

  return (
    <div className={classes.root}>
      <Typography variant="h6" className={classes.title}>
        <KeyIcon style={{ color: "#EA4335" }} />
        {i18n.t("googleSettings.title", "Login com Google")}
      </Typography>
      <Typography variant="body2" className={classes.subtitle}>
        {i18n.t(
          "googleSettings.subtitle",
          "Credenciais OAuth usadas para o login social com Google. As credenciais do Google Agenda ficam na tela da própria integração."
        )}{" "}
        <a
          href="https://console.cloud.google.com/apis/credentials"
          target="_blank"
          rel="noopener noreferrer"
        >
          {i18n.t(
            "googleSettings.whereToGet",
            "Google Cloud Console → APIs & Services → Credentials"
          )}
        </a>
      </Typography>

      <Box className={classes.card}>
        <Typography variant="caption" className={classes.sectionLabel}>
          {i18n.t("googleSettings.loginSection", "Login com Google (OAuth)")}
        </Typography>
        <Grid container spacing={2} style={{ marginTop: 4, marginBottom: 12 }}>
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label={i18n.t("googleSettings.clientId", "Google Client ID")}
              name="googleClientId"
              variant="outlined"
              size="small"
              value={settings.googleClientId}
              onChange={handleChange}
              placeholder="xxxx.apps.googleusercontent.com"
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth
              label={i18n.t("googleSettings.clientSecret", "Google Client Secret")}
              name="googleClientSecret"
              variant="outlined"
              size="small"
              type={mostrarSegredoLogin ? "text" : "password"}
              value={settings.googleClientSecret}
              onChange={handleChange}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton
                      size="small"
                      onClick={() => setMostrarSegredoLogin(!mostrarSegredoLogin)}
                    >
                      {mostrarSegredoLogin ? <VisibilityOff /> : <Visibility />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
          </Grid>
        </Grid>

        {/* Os campos de credencial do Google Agenda saíram daqui.
            Eles agora ficam na própria tela da integração
            (menu → Google Agenda), junto do botão de conectar a conta, da URI
            de redirecionamento pronta para copiar e do passo a passo. Manter
            os mesmos campos em dois lugares só criava dúvida sobre qual valia
            — e, pior, permitia salvar valores diferentes nos dois. */}

      </Box>

      <div className={classes.buttonContainer}>
        <Button
          variant="contained"
          color="primary"
          onClick={handleSave}
          disabled={loading}
        >
          {loading ? (
            <CircularProgress size={24} />
          ) : (
            i18n.t("googleSettings.save", "Salvar")
          )}
        </Button>
      </div>
    </div>
  );
};

export default GoogleSettings;
