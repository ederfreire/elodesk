import React, { useEffect, useState, useContext } from "react";
import { Container, Paper, Typography, Button, TextField, MenuItem, Box, CircularProgress, Chip, Stack, Alert, Switch, FormControlLabel, Grid, IconButton, InputAdornment, Accordion, AccordionSummary, AccordionDetails } from "@mui/material";
import EventIcon from "@mui/icons-material/Event";
import VpnKeyIcon from "@mui/icons-material/VpnKey";
import FileCopyIcon from "@mui/icons-material/FileCopy";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import { toast } from "react-toastify";

import api from "../../services/api";
import { AuthContext } from "../../context/Auth/AuthContext";
import { i18n } from "../../translate/i18n";

const t = (key, fallback) => {
  const v = i18n.t(key);
  return v === key ? fallback : v;
};

const GoogleCalendarSettings = () => {
  const { user } = useContext(AuthContext);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [config, setConfig] = useState(null);
  const [calendars, setCalendars] = useState([]);

  // Credenciais do OAuth. Ficam em Settings (googleClientId/Secret), lidas e
  // gravadas pelo mesmo endpoint que a aba de Configurações usa — por isso
  // não há endpoint novo aqui.
  const [credenciais, setCredenciais] = useState({
    googleClientId: "",
    googleClientSecret: "",
  });
  const [salvandoCred, setSalvandoCred] = useState(false);
  const [podeEditarCredenciais, setPodeEditarCredenciais] = useState(false);

  const copiar = (texto) => {
    if (!texto) return;
    navigator.clipboard
      ?.writeText(texto)
      .then(() => toast.success(t("googleCalendar.copied", "Copiado!")))
      .catch(() => {});
  };

  const salvarCredenciais = async () => {
    setSalvandoCred(true);
    try {
      // Envia SÓ as chaves do Google. O MetaSettingsController ignora o que
      // não vier no corpo, então mandar o objeto inteiro sobrescreveria
      // configurações de outras integrações com valor vazio.
      //
      // Grava OS DOIS pares de chaves com o mesmo valor, de propósito.
      //
      // O backend (GoogleCalendarService/oauthClient.ts) procura nesta ordem:
      //   googleCalendarClientId → googleClientId → variável de ambiente
      //
      // Ou seja, `googleCalendarClientId` tem PRECEDÊNCIA. Se essa chave
      // tivesse um valor antigo — e ela tinha, porque antes existiam campos
      // de Agenda na aba de Configurações — ele continuaria vencendo, e o
      // que você digita aqui simplesmente não teria efeito. O sintoma seria
      // péssimo de diagnosticar: a tela salva "com sucesso" e a conexão
      // continua usando a credencial velha.
      //
      // Escrevendo nos dois, qualquer que seja a chave que o backend leia, o
      // valor é o mesmo — o desta tela.
      await api.put("/meta-settings", {
        googleClientId: credenciais.googleClientId,
        googleClientSecret: credenciais.googleClientSecret,
        googleCalendarClientId: credenciais.googleClientId,
        googleCalendarClientSecret: credenciais.googleClientSecret,
      });
      toast.success(t("googleCalendar.credentialsSaved", "Credenciais salvas."));
    } catch (err) {
      toast.error(
        err?.response?.data?.error ||
          t("googleCalendar.credentialsFail", "Não foi possível salvar as credenciais.")
      );
    }
    setSalvandoCred(false);
  };

  const params = new URLSearchParams(window.location.search);
  const statusFromCallback = params.get("status");
  const messageFromCallback = params.get("message");

  const load = async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/google-calendar/config");
      setConfig(data);
      if (data?.connected) {
        try {
          const { data: cals } = await api.get("/google-calendar/calendars");
          setCalendars(cals);
        } catch (e) {
          // silencioso
        }
      }
    } catch (err) {
      // sem config
    }

    // Credenciais do OAuth. A rota exige perfil SUPER — para os demais o
    // pedido volta 403 e o cartão 1 simplesmente não aparece, em vez de
    // mostrar campos que o usuário não consegue salvar.
    try {
      const { data } = await api.get("/meta-settings");
      // Lê a chave específica da Agenda PRIMEIRO, na mesma ordem que o
      // backend usa (oauthClient.ts). Assim a tela mostra o valor que está
      // realmente valendo, e não um que o sistema ignora.
      setCredenciais({
        googleClientId: data?.googleCalendarClientId || data?.googleClientId || "",
        googleClientSecret:
          data?.googleCalendarClientSecret || data?.googleClientSecret || "",
      });
      setPodeEditarCredenciais(true);
    } catch (err) {
      setPodeEditarCredenciais(false);
    }

    setLoading(false);
  };

  useEffect(() => {
    load();
    if (statusFromCallback === "success") {
      toast.success(t("googleCalendar.toast.connected", "Google Agenda conectado!"));
      window.history.replaceState({}, document.title, window.location.pathname);
    } else if (statusFromCallback === "error") {
      toast.error(
        t("googleCalendar.toast.connectFail", "Falha ao conectar: ") +
          (messageFromCallback || t("googleCalendar.toast.unknownError", "erro desconhecido"))
      );
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const translateBackendError = (err) => {
    const raw = err?.response?.data?.error || err?.message || "";
    if (raw === "ERR_GOOGLE_CALENDAR_CREDENTIALS_MISSING") {
      return t(
        "googleCalendar.errors.credentialsMissing",
        "O Google Agenda ainda não foi liberado nesta plataforma. Peça ao administrador para cadastrar o Client ID e o Client Secret do Google em Configurações."
      );
    }
    if (raw === "ERR_GOOGLE_CALENDAR_REDIRECT_URI_MISSING") {
      return t(
        "googleCalendar.errors.redirectMissing",
        "Não foi possível identificar o endereço do servidor para o retorno do Google. Avise o administrador."
      );
    }
    return raw || t("googleCalendar.toast.authUrlError", "Erro ao gerar URL de autorização.");
  };

  const handleConnect = async () => {
    try {
      const { data } = await api.get("/google-calendar/auth-url");
      window.location.href = data.url;
    } catch (err) {
      toast.error(translateBackendError(err));
    }
  };

  const handleDisconnect = async () => {
    if (!window.confirm(t("googleCalendar.confirmDisconnect", "Desconectar Google Agenda?"))) return;
    try {
      await api.delete("/google-calendar/disconnect");
      toast.success(t("googleCalendar.toast.disconnected", "Desconectado."));
      setConfig(null);
      setCalendars([]);
    } catch (err) {
      toast.error(t("googleCalendar.toast.disconnectError", "Erro ao desconectar."));
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { data } = await api.put("/google-calendar/config", {
        calendarId: config.calendarId,
        defaultDuration: Number(config.defaultDuration) || 30,
        timezone: config.timezone || "America/Sao_Paulo",
        isActive: !!config.isActive,
        autoMeet: config.autoMeet !== false,
        syncEvents: config.syncEvents !== false,
        sendInvite: !!config.sendInvite,
      });
      setConfig(data);
      toast.success(t("googleCalendar.toast.saved", "Configuração salva."));
    } catch (err) {
      toast.error(translateBackendError(err) || t("googleCalendar.toast.saveError", "Erro ao salvar."));
    }
    setSaving(false);
  };

  if (loading) {
    return (
      <Container sx={{ py: 4 }}>
        <CircularProgress />
      </Container>
    );
  }

  return (
    <Container maxWidth="lg" sx={{ py: 4 }}>
      <Stack direction="row" alignItems="center" spacing={1} mb={3}>
        <EventIcon color="primary" />
        <Typography variant="h5" fontWeight={700}>
          {t("googleCalendar.title", "Integração Google Agenda & Google Meet")}
        </Typography>
      </Stack>

      {/* ── 1. Credenciais da API ───────────────────────────────────────
          Ficam nesta tela, e não escondidas em Configurações, porque são o
          PRIMEIRO passo de quem está ligando a integração. Antes era preciso
          descobrir sozinho que o Client ID morava em outro lugar. */}
      {podeEditarCredenciais && (
      <Paper sx={{ p: 3, mb: 3 }} variant="outlined">
        <Stack direction="row" spacing={1.5} alignItems="flex-start" mb={2}>
          <Box
            sx={{
              bgcolor: "rgba(239,68,68,0.12)",
              borderRadius: 2,
              width: 40, height: 40,
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <VpnKeyIcon sx={{ color: "#ef4444" }} fontSize="small" />
          </Box>
          <Box>
            <Typography variant="subtitle1" fontWeight={700}>
              {t("googleCalendar.step1", "1. Credenciais da API do Google (OAuth 2.0)")}
            </Typography>
            <Typography variant="body2" color="text.secondary">
              {t("googleCalendar.step1Sub", "Configure seu Client ID e Client Secret gerados no Google Cloud Console")}
            </Typography>
          </Box>
        </Stack>

        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth size="small"
              label={t("googleCalendar.clientId", "Google Client ID")}
              value={credenciais.googleClientId}
              onChange={(e) =>
                setCredenciais({ ...credenciais, googleClientId: e.target.value })
              }
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth size="small"
              type="password"
              label={t("googleCalendar.clientSecret", "Google Client Secret")}
              value={credenciais.googleClientSecret}
              onChange={(e) =>
                setCredenciais({ ...credenciais, googleClientSecret: e.target.value })
              }
            />
          </Grid>

          {/* Somente leitura: são DERIVADOS da URL do servidor. Deixar
              editável só criaria oportunidade de digitar errado — e
              "redirect_uri_mismatch" é o erro nº 1 de quem configura OAuth. */}
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth size="small"
              label={t("googleCalendar.redirectUri", "URI de Redirecionamento Autorizada (Cole no Google Cloud)")}
              value={config?.redirectUri || ""}
              InputProps={{
                readOnly: true,
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => copiar(config?.redirectUri)}>
                      <FileCopyIcon fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
          </Grid>
          <Grid item xs={12} md={6}>
            <TextField
              fullWidth size="small"
              label={t("googleCalendar.jsOrigin", "Origem JavaScript Autorizada (Cole no Google Cloud)")}
              value={config?.jsOrigin || ""}
              InputProps={{
                readOnly: true,
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => copiar(config?.jsOrigin)}>
                      <FileCopyIcon fontSize="small" />
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
          </Grid>
        </Grid>

        <Box sx={{ display: "flex", justifyContent: "flex-end", mt: 2 }}>
          <Button
            variant="contained"
            onClick={salvarCredenciais}
            disabled={salvandoCred}
            startIcon={<CheckCircleIcon />}
          >
            {salvandoCred
              ? t("googleCalendar.saving", "Salvando...")
              : t("googleCalendar.saveCredentials", "Salvar Credenciais da API")}
          </Button>
        </Box>

        <Accordion sx={{ mt: 2 }} variant="outlined">
          <AccordionSummary expandIcon={<ExpandMoreIcon />}>
            <Typography variant="body2" color="primary">
              {t("googleCalendar.howToTitle", "Ver Passo a Passo: Como gerar o Client ID e Client Secret no Google Cloud (2 Minutos)")}
            </Typography>
          </AccordionSummary>
          <AccordionDetails>
            <Typography variant="body2" component="div">
              <ol style={{ margin: 0, paddingLeft: 18, lineHeight: 1.8 }}>
                <li>{t("googleCalendar.how1", "Acesse console.cloud.google.com e crie (ou escolha) um projeto.")}</li>
                <li>{t("googleCalendar.how2", "Em ”APIs e serviços” → ”Biblioteca”, ative a Google Calendar API.")}</li>
                <li>{t("googleCalendar.how3", "Em ”Tela de permissão OAuth”, configure como Externo e publique.")}</li>
                <li>{t("googleCalendar.how4", "Em ”Credenciais” → ”Criar credenciais” → ”ID do cliente OAuth”, escolha Aplicativo da Web.")}</li>
                <li>{t("googleCalendar.how5", "Cole os dois valores acima nos campos ”Origens JavaScript autorizadas” e ”URIs de redirecionamento autorizados”.")}</li>
                <li>{t("googleCalendar.how6", "Copie o Client ID e o Client Secret gerados e cole aqui em cima.")}</li>
              </ol>
            </Typography>
          </AccordionDetails>
        </Accordion>
      </Paper>
      )}

      <Grid container spacing={3}>
        {/* ── 2. Conexão da conta ─────────────────────────────────────── */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, height: "100%" }} variant="outlined">
            <Stack direction="row" spacing={1.5} alignItems="flex-start" mb={2}>
              <Box
                sx={{
                  bgcolor: "rgba(37,99,235,0.12)",
                  borderRadius: 2, width: 40, height: 40,
                  display: "flex", alignItems: "center", justifyContent: "center",
                }}
              >
                <EventIcon sx={{ color: "#2563eb" }} fontSize="small" />
              </Box>
              <Box>
                <Typography variant="subtitle1" fontWeight={700}>
                  {t("googleCalendar.step2", "2. Conexão da Conta Google")}
                </Typography>
                <Typography variant="body2" color="text.secondary">
                  {t("googleCalendar.step2Sub", "Conecte a conta que gerenciará as reuniões e o Meet")}
                </Typography>
              </Box>
            </Stack>

            {!config?.connected ? (
              <Box>
                <Alert severity="info" sx={{ mb: 2 }}>
                  {t("googleCalendar.notConnected", "Nenhuma conta Google conectada para esta empresa.")}
                </Alert>
                <Button variant="contained" onClick={handleConnect}>
                  {t("googleCalendar.connect", "Conectar Google Agenda")}
                </Button>
              </Box>
            ) : (
              <Box>
                <Stack direction="row" justifyContent="space-between" flexWrap="wrap" gap={1} mb={2}>
                  <Box>
                    <Typography variant="caption" color="text.secondary" display="block">
                      {t("googleCalendar.connectionStatus", "STATUS DA CONEXÃO")}
                    </Typography>
                    <Chip size="small" color="success" label={t("googleCalendar.connected", "Conectado")} />
                  </Box>
                  <Box sx={{ textAlign: "right" }}>
                    <Typography variant="caption" color="text.secondary" display="block">
                      {t("googleCalendar.connectedAccount", "CONTA CONECTADA")}
                    </Typography>
                    <Typography variant="body2">{config.googleEmail || "—"}</Typography>
                  </Box>
                </Stack>

                <Stack direction="row" spacing={1} flexWrap="wrap">
                  <Button color="error" variant="outlined" size="small" onClick={handleDisconnect}>
                    {t("googleCalendar.disconnectAccount", "Desconectar Conta")}
                  </Button>
                  <Button
                    variant="outlined" size="small"
                    startIcon={<OpenInNewIcon fontSize="small" />}
                    onClick={() => window.open("https://calendar.google.com", "_blank", "noopener")}
                  >
                    {t("googleCalendar.openCalendar", "Abrir Google Agenda")}
                  </Button>
                </Stack>
              </Box>
            )}
          </Paper>
        </Grid>

        {/* ── 3. Preferências ─────────────────────────────────────────── */}
        <Grid item xs={12} md={6}>
          <Paper sx={{ p: 3, height: "100%" }} variant="outlined">

            {/* ── Preferências do Google Meet & Agendamentos ──────────────
                São os PADRÕES que o modal de Agendamento herda ao abrir um
                agendamento novo. O operador ainda pode desligar caso a caso —
                aqui só se define com o que ele começa. */}
            <Box mt={3} mb={2}>
              <Typography variant="subtitle1" style={{ fontWeight: 600 }}>
                {t("googleCalendar.prefsTitle", "Preferências do Google Meet & Agendamentos")}
              </Typography>
              <Typography variant="body2" color="textSecondary">
                {t(
                  "googleCalendar.prefsSubtitle",
                  "Defina como os eventos e reuniões serão criados"
                )}
              </Typography>
            </Box>

            <Stack spacing={1} maxWidth={640}>
              <FormControlLabel
                control={
                  <Switch
                    checked={config.autoMeet !== false}
                    onChange={(e) => setConfig({ ...config, autoMeet: e.target.checked })}
                    color="primary"
                  />
                }
                label={
                  <Box>
                    <Typography variant="body2" style={{ fontWeight: 500 }}>
                      {t("googleCalendar.autoMeet", "Gerar Google Meet Automaticamente")}
                    </Typography>
                    <Typography variant="caption" color="textSecondary">
                      {t(
                        "googleCalendar.autoMeetHelp",
                        "Cria um link de videoconferência exclusivo em cada agendamento"
                      )}
                    </Typography>
                  </Box>
                }
              />

              <FormControlLabel
                control={
                  <Switch
                    checked={config.syncEvents !== false}
                    onChange={(e) => setConfig({ ...config, syncEvents: e.target.checked })}
                    color="primary"
                  />
                }
                label={
                  <Box>
                    <Typography variant="body2" style={{ fontWeight: 500 }}>
                      {t("googleCalendar.syncEvents", "Sincronizar Eventos no Google Agenda")}
                    </Typography>
                    <Typography variant="caption" color="textSecondary">
                      {t(
                        "googleCalendar.syncEventsHelp",
                        "Insere os agendamentos marcados no seu calendário do Google"
                      )}
                    </Typography>
                  </Box>
                }
              />

              <FormControlLabel
                control={
                  <Switch
                    checked={!!config.sendInvite}
                    onChange={(e) => setConfig({ ...config, sendInvite: e.target.checked })}
                    color="primary"
                  />
                }
                label={
                  <Box>
                    <Typography variant="body2" style={{ fontWeight: 500 }}>
                      {t("googleCalendar.sendInvite", "Enviar Convite por E-mail ao Cliente")}
                    </Typography>
                    <Typography variant="caption" color="textSecondary">
                      {t(
                        "googleCalendar.sendInviteHelp",
                        "O Google enviará convite automático se o contato possuir e-mail cadastrado"
                      )}
                    </Typography>
                  </Box>
                }
              />
            </Stack>

            <Stack spacing={2} maxWidth={500} mt={3}>
              <TextField
                select
                label={t("googleCalendar.defaultCalendar", "Agenda padrão")}
                value={config.calendarId || "primary"}
                onChange={(e) => setConfig({ ...config, calendarId: e.target.value })}
              >
                <MenuItem value="primary">
                  {t("googleCalendar.primary", "primary (padrão)")}
                </MenuItem>
                {calendars.map((c) => (
                  <MenuItem key={c.id} value={c.id}>
                    {c.summary} {c.primary ? `(${t("googleCalendar.main", "principal")})` : ""}
                  </MenuItem>
                ))}
              </TextField>

              <TextField
                label={t("googleCalendar.defaultDuration", "Duração padrão (minutos)")}
                type="number"
                value={config.defaultDuration || 30}
                onChange={(e) =>
                  setConfig({ ...config, defaultDuration: e.target.value })
                }
              />

              <TextField
                label={t("googleCalendar.timezone", "Fuso horário")}
                value={config.timezone || "America/Sao_Paulo"}
                onChange={(e) => setConfig({ ...config, timezone: e.target.value })}
                helperText={t("googleCalendar.timezoneHelp", "Ex.: America/Sao_Paulo")}
              />

              <Box>
                <Button
                  variant="contained"
                  onClick={handleSave}
                  disabled={saving}
                >
                  {saving
                    ? t("googleCalendar.saving", "Salvando...")
                    : t("googleCalendar.save", "Salvar configurações")}
                </Button>
              </Box>
            </Stack>
          </Paper>
        </Grid>
      </Grid>
    </Container>
  );
};

export default GoogleCalendarSettings;
