import React, { useState, useEffect, useContext, useCallback } from "react";
import { Dialog, DialogContent, DialogActions, Button, Typography, CircularProgress, Box, Stepper, Step, StepLabel, TextField, Paper } from "@material-ui/core";
import { makeStyles } from "@material-ui/core/styles";
import WhatsApp from "@material-ui/icons/WhatsApp";
import CheckCircle from "@material-ui/icons/CheckCircle";
import ErrorIcon from "@material-ui/icons/Error";
import { toast } from "react-toastify";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import { AuthContext } from "../../context/Auth/AuthContext";
import { i18n } from "../../translate/i18n";

const useStyles = makeStyles((theme) => ({
  dialog: {
    "& .MuiDialog-paper": {
      borderRadius: 16,
      minWidth: 500,
    },
  },
  header: {
    background: "linear-gradient(135deg, #25d366, #128c7e)",
    color: "#fff",
    padding: "24px 32px",
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  content: {
    padding: "24px 32px",
  },
  stepContent: {
    padding: "20px 0",
    textAlign: "center",
  },
  fbButton: {
    background: "linear-gradient(135deg, #1877F2, #0d5cc7)",
    color: "#fff",
    padding: "12px 32px",
    fontSize: 16,
    fontWeight: 700,
    borderRadius: 10,
    textTransform: "none",
    "&:hover": {
      background: "linear-gradient(135deg, #0d5cc7, #0a4a9e)",
    },
  },
  successIcon: {
    fontSize: 64,
    color: "#25d366",
  },
  errorIcon: {
    fontSize: 64,
    color: "#f44336",
  },
  infoBox: {
    background: theme.palette.type === "dark" ? "rgba(255,255,255,0.05)" : "#f5f7fa",
    borderRadius: 10,
    padding: 16,
    marginTop: 16,
  },
  nameField: {
    marginTop: 16,
    marginBottom: 8,
  },
}));

const EmbeddedSignupModal = ({ open, onClose }) => {
  const classes = useStyles();
  const { user } = useContext(AuthContext);
  const [activeStep, setActiveStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [sdkLoaded, setSdkLoaded] = useState(false);
  const [sdkError, setSdkError] = useState(null);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [connectionName, setConnectionName] = useState("");

  const [appId, setAppId] = useState(process.env.REACT_APP_FACEBOOK_APP_ID || "");
  const [configId, setConfigId] = useState(process.env.REACT_APP_META_CONFIG_ID || "");

  // Credenciais da Meta (App ID + Configuration ID).
  //
  // ISTO ESTAVA QUEBRADO DE DUAS FORMAS AO MESMO TEMPO:
  //
  // 1) Nome da chave errado. A tela de configuração e o backend gravam
  //    "metaConfigurationId"; aqui procurava-se "metaConfigId" — que nunca
  //    existiu. O valor ficava sempre vazio, independentemente do que fosse
  //    salvo, e o cadastro parava em "ID de configuração não configurado".
  //
  // 2) Empresa errada. A leitura era via GET /settings, que lista as
  //    configurações DA EMPRESA LOGADA. As credenciais da Meta são da
  //    plataforma e ficam gravadas em companyId 1. Qualquer empresa que não
  //    fosse a 1 não via nada — nem com a chave certa.
  //
  // A rota /meta-settings/public resolve os dois: lê sempre de companyId 1 e
  // devolve só esses dois valores (que já vão para o SDK do Facebook no
  // navegador de qualquer jeito). Os segredos continuam restritos ao super.
  useEffect(() => {
    if (!open) return;
    const loadSettings = async () => {
      try {
        const { data } = await api.get("/meta-settings/public");
        if (data?.appId) setAppId(data.appId);
        if (data?.configId) setConfigId(data.configId);
      } catch (e) {
        console.warn("[EmbeddedSignup] Could not load settings:", e);
      }
    };
    loadSettings();
  }, [open]);

  // Load Facebook SDK
  useEffect(() => {
    if (!open) return;

    setSdkLoaded(false);
    setSdkError(null);

    if (!appId) {
      setSdkError(i18n.t("embeddedSignup.errors.noAppId"));
      return;
    }

    const initFB = () => {
      if (!window.FB) {
        setSdkError(i18n.t("embeddedSignup.errors.sdkNotAvailable"));
        return;
      }

      try {
        window.FB.init({
          appId,
          autoLogAppEvents: true,
          cookie: true,
          xfbml: true,
          version: "v21.0",
        });
        setSdkLoaded(true);
        setSdkError(null);
      } catch (initErr) {
        console.error("[EmbeddedSignup] FB.init error:", initErr);
        setSdkError(initErr?.message || i18n.t("embeddedSignup.errors.sdkInitFailed"));
      }
    };

    if (window.FB) {
      initFB();
      return;
    }

    const existingScript = document.getElementById("facebook-jssdk");

    window.fbAsyncInit = initFB;

    if (existingScript) {
      return;
    }

    const script = document.createElement("script");
    script.id = "facebook-jssdk";
    script.src = "https://connect.facebook.net/en_US/sdk.js";
    script.async = true;
    script.defer = true;
    script.crossOrigin = "anonymous";
    script.onload = () => {
      if (window.FB) {
        initFB();
      }
    };
    script.onerror = () => {
      console.error("[EmbeddedSignup] Failed to load Facebook SDK");
      setSdkError(i18n.t("embeddedSignup.errors.sdkLoadFailed"));
      toast.error(i18n.t("embeddedSignup.errors.sdkLoadFailed"));
    };
    document.body.appendChild(script);
  }, [open, appId]);

  const handleClose = () => {
    setActiveStep(0);
    setLoading(false);
    setResult(null);
    setError(null);
    setSdkError(null);
    setConnectionName("");
    onClose();
  };

  const sessionInfoListener = useCallback((event) => {
    if (!event.origin.includes("facebook.com")) return;
    
    try {
      const data = JSON.parse(event.data);
      if (data.type === "WA_EMBEDDED_SIGNUP") {
        if (data.event === "FINISH") {
          const { phone_number_id, waba_id } = data.data;
        } else if (data.event === "CANCEL") {
          setError(i18n.t("embeddedSignup.errors.cancelled"));
          setActiveStep(2);
        } else if (data.event === "ERROR") {
          setError(i18n.t("embeddedSignup.errors.signupError"));
          setActiveStep(2);
        }
      }
    } catch (e) {
      // Not a JSON message, ignore
    }
  }, []);

  useEffect(() => {
    window.addEventListener("message", sessionInfoListener);
    return () => window.removeEventListener("message", sessionInfoListener);
  }, [sessionInfoListener]);

  const handleStartSignup = () => {
    if (!appId) {
      toast.error(i18n.t("embeddedSignup.errors.appIdNotConfigured"));
      return;
    }
    if (!configId) {
      toast.error(i18n.t("embeddedSignup.errors.configIdNotConfigured"));
      return;
    }
    if (!connectionName.trim()) {
      toast.error(i18n.t("embeddedSignup.errors.noName"));
      return;
    }

    if (!sdkLoaded || !window.FB) {
      toast.error(sdkError || i18n.t("embeddedSignup.errors.sdkNotLoaded"));
      return;
    }


    setLoading(true);
    setError(null);

    const timeoutId = setTimeout(() => {
      setLoading(false);
      setError(i18n.t("embeddedSignup.errors.timeout"));
      setActiveStep(2);
    }, 120000);

    try {
      window.FB.login(
        (response) => {
          clearTimeout(timeoutId);


          if (response.authResponse) {
            const { code } = response.authResponse;

            if (!code) {
              setError(i18n.t("embeddedSignup.errors.noAuthCode"));
              setActiveStep(2);
              setLoading(false);
              return;
            }

            setActiveStep(1);

            api.post("/whatsapp/embedded-signup", {
                code,
                name: connectionName.trim(),
            }).then(({ data }) => {
                setResult(data);
                setActiveStep(2);
                setLoading(false);
            }).catch((err) => {
                console.error("[EmbeddedSignup] Error:", err);
                setError(
                  err?.response?.data?.error ||
                  err?.response?.data?.message ||
                  i18n.t("embeddedSignup.errors.processingError")
                );
                setActiveStep(2);
                setLoading(false);
            });
          } else {
            const statusMessage = response?.status
              ? `${i18n.t("embeddedSignup.errors.metaStatus")} ${response.status}`
              : i18n.t("embeddedSignup.errors.loginCancelled");
            setError(statusMessage);
            setActiveStep(2);
            setLoading(false);
          }
        },
        {
          config_id: configId,
          response_type: "code",
          override_default_response_type: true,
          extras: {
            setup: {},
            featureType: "whatsapp_business_app_onboarding",
            sessionInfoVersion: "3",
            version: "v4",
          },
        }
      );
    } catch (fbErr) {
      clearTimeout(timeoutId);
      console.error("[EmbeddedSignup] FB.login error:", fbErr);
      setError(fbErr?.message || i18n.t("embeddedSignup.errors.popupError"));
      setActiveStep(2);
      setLoading(false);
    }
  };

  const steps = [
    i18n.t("embeddedSignup.steps.configure"),
    i18n.t("embeddedSignup.steps.processing"),
    i18n.t("embeddedSignup.steps.result"),
  ];

  return (
    <Dialog open={open} onClose={handleClose} className={classes.dialog} maxWidth="sm" fullWidth>
      <div className={classes.header}>
        <WhatsApp style={{ fontSize: 32 }} />
        <div>
          <Typography variant="h6" style={{ fontWeight: 700 }}>
            {i18n.t("embeddedSignup.title")}
          </Typography>
          <Typography variant="body2" style={{ opacity: 0.9 }}>
            {i18n.t("embeddedSignup.subtitle")}
          </Typography>
        </div>
      </div>

      <DialogContent className={classes.content}>
        <Stepper activeStep={activeStep} alternativeLabel style={{ padding: "16px 0" }}>
          {steps.map((label) => (
            <Step key={label}>
              <StepLabel>{label}</StepLabel>
            </Step>
          ))}
        </Stepper>

        {activeStep === 0 && (
          <div className={classes.stepContent}>
            <Typography variant="body1" gutterBottom>
              {i18n.t("embeddedSignup.description")}
            </Typography>

            <TextField
              label={i18n.t("embeddedSignup.connectionName")}
              variant="outlined"
              fullWidth
              className={classes.nameField}
              value={connectionName}
              onChange={(e) => setConnectionName(e.target.value)}
              placeholder={i18n.t("embeddedSignup.connectionNamePlaceholder")}
            />

            <Paper className={classes.infoBox} elevation={0}>
              <Typography variant="body2" color="textSecondary">
                <strong>{i18n.t("embeddedSignup.infoTitle")}</strong>
                <br />• {i18n.t("embeddedSignup.infoItems.popup")}
                <br />• {i18n.t("embeddedSignup.infoItems.login")}
                <br />• {i18n.t("embeddedSignup.infoItems.select")}
                <br />• {i18n.t("embeddedSignup.infoItems.register")}
              </Typography>
            </Paper>

             {sdkError && (
               <Paper className={classes.infoBox} elevation={0}>
                 <Typography variant="body2" color="error">
                   {sdkError}
                 </Typography>
               </Paper>
             )}

            <Box mt={3}>
              <Button
                className={classes.fbButton}
                onClick={handleStartSignup}
                disabled={loading || !sdkLoaded}
                startIcon={loading ? <CircularProgress size={20} color="inherit" /> : <WhatsApp />}
              >
                {!sdkLoaded
                  ? i18n.t("embeddedSignup.buttons.loadingSdk")
                  : loading
                  ? i18n.t("embeddedSignup.buttons.processing")
                  : i18n.t("embeddedSignup.buttons.start")}
              </Button>
            </Box>
          </div>
        )}

        {activeStep === 1 && (
          <div className={classes.stepContent}>
            <CircularProgress size={48} style={{ color: "#25d366" }} />
            <Typography variant="h6" style={{ marginTop: 16 }}>
              {i18n.t("embeddedSignup.processing.title")}
            </Typography>
            <Typography variant="body2" color="textSecondary" style={{ marginTop: 8 }}>
              {i18n.t("embeddedSignup.processing.description")}
            </Typography>
          </div>
        )}

        {activeStep === 2 && !error && result && (
          <div className={classes.stepContent}>
            <CheckCircle className={classes.successIcon} />
            <Typography variant="h6" style={{ marginTop: 16, color: "#25d366" }}>
              {i18n.t("embeddedSignup.success.title")}
            </Typography>
            <Paper className={classes.infoBox} elevation={0}>
              <Typography variant="body2">
                <strong>{i18n.t("embeddedSignup.success.name")}:</strong> {result.name}
                <br />
                <strong>{i18n.t("embeddedSignup.success.number")}:</strong> {result.phone_number || i18n.t("embeddedSignup.success.numberPending")}
                <br />
                <strong>{i18n.t("embeddedSignup.success.wabaId")}:</strong> {result.waba_id}
                <br />
                <strong>{i18n.t("embeddedSignup.success.status")}:</strong> CONNECTED
              </Typography>
            </Paper>
          </div>
        )}

        {activeStep === 2 && error && (
          <div className={classes.stepContent}>
            <ErrorIcon className={classes.errorIcon} />
            <Typography variant="h6" style={{ marginTop: 16, color: "#f44336" }}>
              {i18n.t("embeddedSignup.errors.title")}
            </Typography>
            <Typography variant="body2" color="textSecondary" style={{ marginTop: 8 }}>
              {error}
            </Typography>
          </div>
        )}
      </DialogContent>

      <DialogActions style={{ padding: "16px 32px" }}>
        <Button onClick={handleClose} color="default">
          {activeStep === 2 ? i18n.t("embeddedSignup.buttons.close") : i18n.t("embeddedSignup.buttons.cancel")}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default EmbeddedSignupModal;
