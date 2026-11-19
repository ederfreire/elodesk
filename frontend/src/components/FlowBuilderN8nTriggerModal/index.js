import React, { useState, useEffect } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  TextField,
  FormControlLabel,
  Checkbox,
  Typography,
  Divider,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Alert,
  Grid,
  InputAdornment,
  IconButton,
  Box,
  Chip,
  Tooltip,
} from "@mui/material";
import { makeStyles } from "@material-ui/core/styles";
import { toast } from "react-toastify";
import { i18n } from "../../translate/i18n";
import BoltIcon from "@mui/icons-material/Bolt";
import Visibility from "@mui/icons-material/Visibility";
import VisibilityOff from "@mui/icons-material/VisibilityOff";
import AddIcon from "@mui/icons-material/Add";
import DeleteIcon from "@mui/icons-material/DeleteOutline";

const useStyles = makeStyles((theme) => ({
  dialog: {
    "& .MuiPaper-root": {
      borderRadius: 12,
      minWidth: 620,
    },
  },
  title: {
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(1),
    backgroundColor: "#EA4B71",
    color: "#fff",
    padding: theme.spacing(1.5, 2),
  },
  section: {
    marginTop: theme.spacing(2),
    marginBottom: theme.spacing(0.5),
    fontWeight: 600,
  },
  mapBox: {
    border: "1px solid #eee",
    borderRadius: 8,
    padding: theme.spacing(1, 1.5),
    marginBottom: theme.spacing(1),
    background: "#fafafa",
  },
  fieldChips: {
    display: "flex",
    flexWrap: "wrap",
    gap: 4,
    marginTop: 4,
  },
}));

const EVENTS = [
  { key: "ticket", label: "Ticket (criar / atualizar / fechar / abrir / transferir)" },
  { key: "connection", label: "Conexão WhatsApp (conectar / desconectar / QR)" },
  { key: "message", label: "Mensagem (recebida / enviada no ticket)" },
  { key: "contact", label: "Contato (criado / atualizado)" },
  { key: "queue", label: "Fila (criada / atualizada / excluída)" },
  { key: "rating", label: "Avaliação (cliente avaliou atendimento)" },
  { key: "schedule", label: "Agendamento (criado / lembrete / enviado)" },
  { key: "ticketNote", label: "Nota do Ticket (nota adicionada)" },
];

// Campos disponíveis por evento (origem: ActionsWebhookService.ts -> n8nTrigger)
const AVAILABLE_FIELDS = {
  ticket: [
    "id","uuid","status","queueId","userId","whatsappId","companyId",
    "lastMessage","isGroup","unreadMessages","channel","createdAt","updatedAt",
  ],
  connection: ["id","name","status","number","channel"],
  message: ["body","from","ticketId","timestamp"],
  contact: ["id","name","number","email","profilePicUrl","isGroup"],
  queue: ["id","name","color","greetingMessage","order","companyId"],
  rating: ["id","rate","userId","ticketId","contactId","createdAt"],
  schedule: ["id","body","sendAt","status","contactId","ticketId","userId"],
  ticketNote: ["id","note","userId","ticketId","contactId","createdAt"],
};

const defaultEvents = {
  ticket: true,
  connection: false,
  message: false,
  contact: false,
  queue: false,
  rating: false,
  schedule: false,
  ticketNote: false,
};

const buildDefaultMapping = () => {
  const m = {};
  Object.keys(AVAILABLE_FIELDS).forEach((ev) => {
    m[ev] = { fields: [...AVAILABLE_FIELDS[ev]], custom: [] };
  });
  return m;
};

// Presets prontos: aplicam events + fieldMapping de uma vez. Usuário pode ajustar depois.
const PRESETS = [
  {
    key: "ticket_aberto",
    label: "Ticket aberto",
    description: "Ticket recém-criado + contato",
    events: { ticket: true, connection: false, message: false, contact: true },
    fieldMapping: {
      ticket: {
        fields: ["id","uuid","status","queueId","whatsappId","companyId","createdAt"],
        custom: [{ key: "evento", value: "ticket_aberto" }],
      },
      contact: { fields: ["id","name","number","email"], custom: [] },
      connection: { fields: [], custom: [] },
      message: { fields: [], custom: [] },
    },
  },
  {
    key: "ticket_fechado",
    label: "Ticket fechado",
    description: "Fechamento + última mensagem",
    events: { ticket: true, connection: false, message: true, contact: true },
    fieldMapping: {
      ticket: {
        fields: ["id","uuid","status","queueId","userId","companyId","lastMessage","updatedAt"],
        custom: [{ key: "evento", value: "ticket_fechado" }],
      },
      contact: { fields: ["id","name","number"], custom: [] },
      message: { fields: ["body","from","timestamp"], custom: [] },
      connection: { fields: [], custom: [] },
    },
  },
  {
    key: "ticket_transferido",
    label: "Ticket transferido",
    description: "Mudança de fila / atendente",
    events: { ticket: true, connection: false, message: false, contact: true },
    fieldMapping: {
      ticket: {
        fields: ["id","uuid","status","queueId","userId","whatsappId"],
        custom: [{ key: "evento", value: "ticket_transferido" }],
      },
      contact: { fields: ["id","name","number"], custom: [] },
      connection: { fields: [], custom: [] },
      message: { fields: [], custom: [] },
    },
  },
  {
    key: "conexao_criada",
    label: "Conexão criada",
    description: "Nova conexão WhatsApp",
    events: { ticket: false, connection: true, message: false, contact: false },
    fieldMapping: {
      connection: {
        fields: ["id","name","status","number","channel"],
        custom: [{ key: "evento", value: "conexao_criada" }],
      },
      ticket: { fields: [], custom: [] },
      message: { fields: [], custom: [] },
      contact: { fields: [], custom: [] },
    },
  },
  {
    key: "conexao_status",
    label: "Conexão (status / QR)",
    description: "Conectar / desconectar / QR",
    events: { ticket: false, connection: true, message: false, contact: false },
    fieldMapping: {
      connection: {
        fields: ["id","name","status","number"],
        custom: [{ key: "evento", value: "conexao_status" }],
      },
      ticket: { fields: [], custom: [] },
      message: { fields: [], custom: [] },
      contact: { fields: [], custom: [] },
    },
  },
  {
    key: "mensagem_recebida",
    label: "Mensagem recebida",
    description: "Mensagem + contato + ticket mínimo",
    events: { ticket: true, connection: false, message: true, contact: true },
    fieldMapping: {
      message: {
        fields: ["body","from","ticketId","timestamp"],
        custom: [{ key: "evento", value: "mensagem_recebida" }],
      },
      ticket: { fields: ["id","uuid","status","queueId"], custom: [] },
      contact: { fields: ["id","name","number"], custom: [] },
      connection: { fields: [], custom: [] },
    },
  },
  {
    key: "contato_criado",
    label: "Contato criado/atualizado",
    description: "Apenas dados do contato",
    events: { ticket: false, connection: false, message: false, contact: true },
    fieldMapping: {
      contact: {
        fields: ["id","name","number","email","profilePicUrl","isGroup"],
        custom: [{ key: "evento", value: "contato_criado" }],
      },
      ticket: { fields: [], custom: [] },
      connection: { fields: [], custom: [] },
      message: { fields: [], custom: [] },
    },
  },
  {
    key: "fila_criada",
    label: "Fila criada/atualizada",
    description: "Mudanças em filas",
    events: { ticket: false, connection: false, message: false, contact: false, queue: true },
    fieldMapping: {
      queue: {
        fields: ["id","name","color","greetingMessage","order","companyId"],
        custom: [{ key: "evento", value: "fila_criada" }],
      },
    },
  },
  {
    key: "avaliacao_recebida",
    label: "Avaliação recebida",
    description: "Cliente avaliou o atendimento",
    events: { ticket: true, connection: false, message: false, contact: true, rating: true },
    fieldMapping: {
      rating: {
        fields: ["id","rate","userId","ticketId","contactId","createdAt"],
        custom: [{ key: "evento", value: "avaliacao_recebida" }],
      },
      ticket: { fields: ["id","uuid","status","queueId","userId"], custom: [] },
      contact: { fields: ["id","name","number"], custom: [] },
    },
  },
  {
    key: "agendamento_criado",
    label: "Agendamento criado",
    description: "Agendamento + contato",
    events: { ticket: false, connection: false, message: false, contact: true, schedule: true },
    fieldMapping: {
      schedule: {
        fields: ["id","body","sendAt","status","contactId","ticketId","userId"],
        custom: [{ key: "evento", value: "agendamento_criado" }],
      },
      contact: { fields: ["id","name","number"], custom: [] },
    },
  },
  {
    key: "nota_adicionada",
    label: "Nota adicionada ao ticket",
    description: "Nota interna + ticket",
    events: { ticket: true, connection: false, message: false, contact: false, ticketNote: true },
    fieldMapping: {
      ticketNote: {
        fields: ["id","note","userId","ticketId","contactId","createdAt"],
        custom: [{ key: "evento", value: "nota_adicionada" }],
      },
      ticket: { fields: ["id","uuid","status","queueId","userId"], custom: [] },
    },
  },
];

const FlowBuilderN8nTriggerModal = ({ open, onSave, data, onUpdate, close }) => {
  const classes = useStyles();

  const [webhookUrl, setWebhookUrl] = useState("");
  const [authUser, setAuthUser] = useState("");
  const [authPass, setAuthPass] = useState("");
  const [showPass, setShowPass] = useState(false);
  const [mode, setMode] = useState("async");
  const [timeout, setTimeoutMs] = useState(10000);
  const [saveResponseVar, setSaveResponseVar] = useState("n8nResponse");
  const [events, setEvents] = useState(defaultEvents);
  const [fieldMapping, setFieldMapping] = useState(buildDefaultMapping());

  useEffect(() => {
    if (open === "edit" && data) {
      setWebhookUrl(data.data?.webhookUrl || "");
      setAuthUser(data.data?.authUser || "");
      setAuthPass(data.data?.authPass || "");
      setMode(data.data?.mode || "async");
      setTimeoutMs(data.data?.timeout || 10000);
      setSaveResponseVar(data.data?.saveResponseVar || "n8nResponse");
      setEvents({ ...defaultEvents, ...(data.data?.events || {}) });
      // Merge mapping salvo com defaults para garantir todas as chaves
      const saved = data.data?.fieldMapping || {};
      const merged = buildDefaultMapping();
      Object.keys(merged).forEach((ev) => {
        if (saved[ev]) {
          merged[ev] = {
            fields: Array.isArray(saved[ev].fields) ? saved[ev].fields : merged[ev].fields,
            custom: Array.isArray(saved[ev].custom) ? saved[ev].custom : [],
          };
        }
      });
      setFieldMapping(merged);
    } else if (open === "create") {
      setWebhookUrl("");
      setAuthUser("");
      setAuthPass("");
      setMode("async");
      setTimeoutMs(10000);
      setSaveResponseVar("n8nResponse");
      setEvents(defaultEvents);
      setFieldMapping(buildDefaultMapping());
    }
  }, [open, data]);

  const toggleField = (ev, field) => {
    setFieldMapping((old) => {
      const current = old[ev]?.fields || [];
      const next = current.includes(field)
        ? current.filter((f) => f !== field)
        : [...current, field];
      return { ...old, [ev]: { ...old[ev], fields: next } };
    });
  };

  const toggleAllFields = (ev, checked) => {
    setFieldMapping((old) => ({
      ...old,
      [ev]: { ...old[ev], fields: checked ? [...AVAILABLE_FIELDS[ev]] : [] },
    }));
  };

  const addCustomField = (ev) => {
    setFieldMapping((old) => ({
      ...old,
      [ev]: {
        ...old[ev],
        custom: [...(old[ev]?.custom || []), { key: "", value: "" }],
      },
    }));
  };

  const updateCustomField = (ev, idx, patch) => {
    setFieldMapping((old) => {
      const list = [...(old[ev]?.custom || [])];
      list[idx] = { ...list[idx], ...patch };
      return { ...old, [ev]: { ...old[ev], custom: list } };
    });
  };

  const removeCustomField = (ev, idx) => {
    setFieldMapping((old) => {
      const list = [...(old[ev]?.custom || [])];
      list.splice(idx, 1);
      return { ...old, [ev]: { ...old[ev], custom: list } };
    });
  };

  const applyPreset = (preset) => {
    // Aplica events + fieldMapping completos. Usuário pode ajustar depois.
    setEvents({ ...defaultEvents, ...preset.events });
    const merged = buildDefaultMapping();
    Object.keys(merged).forEach((ev) => {
      const p = preset.fieldMapping?.[ev];
      if (p) {
        merged[ev] = {
          fields: Array.isArray(p.fields) ? [...p.fields] : merged[ev].fields,
          custom: Array.isArray(p.custom) ? p.custom.map((c) => ({ ...c })) : [],
        };
      } else {
        merged[ev] = { fields: [], custom: [] };
      }
    });
    setFieldMapping(merged);
    toast.success(`Preset aplicado: ${preset.label}`);
  };

  const handleSave = () => {
    if (!webhookUrl.trim()) {
      toast.error("Informe a URL do webhook n8n");
      return;
    }
    const activeEvents = Object.values(events).some(Boolean);
    if (!activeEvents) {
      toast.error("Selecione ao menos um evento para enviar ao n8n");
      return;
    }

    // Limpa custom fields sem chave
    const cleanedMapping = {};
    Object.keys(fieldMapping).forEach((ev) => {
      cleanedMapping[ev] = {
        fields: fieldMapping[ev]?.fields || [],
        custom: (fieldMapping[ev]?.custom || []).filter((c) => c.key && c.key.trim()),
      };
    });

    const nodeData = {
      label: "n8n Trigger",
      webhookUrl: webhookUrl.trim(),
      authUser: authUser.trim(),
      authPass: authPass,
      mode,
      timeout: parseInt(timeout) || 10000,
      saveResponseVar: saveResponseVar.trim() || "n8nResponse",
      events,
      fieldMapping: cleanedMapping,
    };

    if (open === "edit") {
      onUpdate({ ...data, data: { ...data.data, ...nodeData } });
    } else {
      onSave(nodeData);
    }
    close(null);
  };

  if (!open) return null;

  const renderMappingFor = (ev) => {
    const fields = AVAILABLE_FIELDS[ev];
    const selected = fieldMapping[ev]?.fields || [];
    const custom = fieldMapping[ev]?.custom || [];
    const allChecked = selected.length === fields.length;

    return (
      <Box key={ev} className={classes.mapBox}>
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Typography variant="body2" style={{ fontWeight: 600, textTransform: "capitalize" }}>
            {ev}
          </Typography>
          <FormControlLabel
            control={
              <Checkbox
                size="small"
                checked={allChecked}
                indeterminate={!allChecked && selected.length > 0}
                onChange={(e) => toggleAllFields(ev, e.target.checked)}
                sx={{ color: "#EA4B71", "&.Mui-checked": { color: "#EA4B71" } }}
              />
            }
            label={<span style={{ fontSize: 12 }}>Todos</span>}
          />
        </Box>

        <Box className={classes.fieldChips}>
          {fields.map((f) => {
            const active = selected.includes(f);
            return (
              <Chip
                key={f}
                label={f}
                size="small"
                clickable
                onClick={() => toggleField(ev, f)}
                variant={active ? "filled" : "outlined"}
                sx={{
                  backgroundColor: active ? "#EA4B71" : "transparent",
                  color: active ? "#fff" : "#555",
                  borderColor: "#EA4B71",
                  fontSize: 11,
                  height: 22,
                }}
              />
            );
          })}
        </Box>

        <Box mt={1}>
          <Box display="flex" alignItems="center" justifyContent="space-between">
            <Typography variant="caption" color="textSecondary">
              Campos customizados (suporta variáveis do fluxo: <code>{"{{nomeVar}}"}</code>)
            </Typography>
            <Tooltip title="Adicionar campo customizado">
              <IconButton size="small" onClick={() => addCustomField(ev)}>
                <AddIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>

          {custom.map((c, idx) => (
            <Grid container spacing={1} key={idx} alignItems="center" sx={{ mt: 0.2 }}>
              <Grid item xs={4}>
                <TextField
                  fullWidth
                  size="small"
                  variant="outlined"
                  placeholder="chave"
                  value={c.key}
                  onChange={(e) => updateCustomField(ev, idx, { key: e.target.value })}
                />
              </Grid>
              <Grid item xs={7}>
                <TextField
                  fullWidth
                  size="small"
                  variant="outlined"
                  placeholder="valor ou {{variavel}}"
                  value={c.value}
                  onChange={(e) => updateCustomField(ev, idx, { value: e.target.value })}
                />
              </Grid>
              <Grid item xs={1}>
                <IconButton size="small" onClick={() => removeCustomField(ev, idx)}>
                  <DeleteIcon fontSize="small" />
                </IconButton>
              </Grid>
            </Grid>
          ))}
        </Box>
      </Box>
    );
  };

  const activeEventKeys = EVENTS.filter((e) => events[e.key]).map((e) => e.key);

  return (
    <Dialog
      open={!!open}
      onClose={() => close(null)}
      className={classes.dialog}
      maxWidth="md"
      fullWidth
    >
      <DialogTitle className={classes.title} disableTypography>
        <BoltIcon />
        <span style={{ fontSize: 18, fontWeight: 600 }}>
          {open === "edit" ? i18n.t("flowBuilderN8nTriggerModal.titleEdit", "Editar n8n Trigger") : i18n.t("flowBuilderN8nTriggerModal.titleAdd", "Adicionar n8n Trigger")}
        </span>
      </DialogTitle>

      <DialogContent dividers>
        <Alert severity="info" sx={{ mb: 2 }}>
          {i18n.t("flowBuilderN8nTriggerModal.info", "Quando o fluxo passar por este nó, um webhook será enviado ao n8n com os dados selecionados. Você pode escolher quais campos enviar e adicionar campos customizados usando variáveis do fluxo.")}
        </Alert>

        <TextField
          fullWidth
          margin="dense"
          variant="outlined"
          size="small"
          label={i18n.t("flowBuilderN8nTriggerModal.webhookUrl", "URL do Webhook n8n")}
          placeholder="https://n8n.seudominio.com/webhook/xxxx"
          value={webhookUrl}
          onChange={(e) => setWebhookUrl(e.target.value)}
          required
        />

        <Typography variant="subtitle2" className={classes.section}>
          {i18n.t("flowBuilderN8nTriggerModal.authTitle", "Autenticação (Basic Auth)")}
        </Typography>
        <Grid container spacing={1}>
          <Grid item xs={6}>
            <TextField
              fullWidth
              margin="dense"
              variant="outlined"
              size="small"
              label={i18n.t("flowBuilderN8nTriggerModal.authUser", "Usuário")}
              value={authUser}
              onChange={(e) => setAuthUser(e.target.value)}
              autoComplete="off"
            />
          </Grid>
          <Grid item xs={6}>
            <TextField
              fullWidth
              margin="dense"
              variant="outlined"
              size="small"
              label={i18n.t("flowBuilderN8nTriggerModal.authPass", "Senha")}
              type={showPass ? "text" : "password"}
              value={authPass}
              onChange={(e) => setAuthPass(e.target.value)}
              autoComplete="new-password"
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton size="small" onClick={() => setShowPass((s) => !s)} edge="end">
                      {showPass ? <VisibilityOff fontSize="small" /> : <Visibility fontSize="small" />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
          </Grid>
        </Grid>

        <Divider sx={{ my: 1.5 }} />

        <Divider sx={{ my: 1.5 }} />

        <Typography variant="subtitle2" className={classes.section}>
          {i18n.t("flowBuilderN8nTriggerModal.presetsTitle", "Presets prontos")}
        </Typography>
        <Typography variant="caption" color="textSecondary" sx={{ display: "block", mb: 0.5 }}>
          {i18n.t("flowBuilderN8nTriggerModal.presetsHelp", "Aplique uma configuração padrão com um clique e ajuste depois.")}
        </Typography>
        <Box className={classes.fieldChips} sx={{ mb: 1 }}>
          {PRESETS.map((p) => (
            <Tooltip key={p.key} title={p.description} arrow>
              <Chip
                label={p.label}
                size="small"
                clickable
                onClick={() => applyPreset(p)}
                variant="outlined"
                sx={{
                  borderColor: "#EA4B71",
                  color: "#EA4B71",
                  fontSize: 11,
                  height: 24,
                  "&:hover": { backgroundColor: "rgba(234,75,113,0.08)" },
                }}
              />
            </Tooltip>
          ))}
        </Box>

        <Typography variant="subtitle2" className={classes.section}>
          {i18n.t("flowBuilderN8nTriggerModal.eventsTitle", "Eventos / Dados a enviar")}
        </Typography>
        {EVENTS.map((ev) => (
          <FormControlLabel
            key={ev.key}
            control={
              <Checkbox
                checked={!!events[ev.key]}
                onChange={(e) =>
                  setEvents((old) => ({ ...old, [ev.key]: e.target.checked }))
                }
                size="small"
                sx={{
                  color: "#EA4B71",
                  "&.Mui-checked": { color: "#EA4B71" },
                }}
              />
            }
            label={<span style={{ fontSize: 13 }}>{ev.label}</span>}
          />
        ))}

        {activeEventKeys.length > 0 && (
          <>
            <Divider sx={{ my: 1.5 }} />
            <Typography variant="subtitle2" className={classes.section}>
              {i18n.t("flowBuilderN8nTriggerModal.mappingTitle", "Mapeamento de campos por evento")}
            </Typography>
            <Typography variant="caption" color="textSecondary" sx={{ display: "block", mb: 1 }}>
              {i18n.t("flowBuilderN8nTriggerModal.mappingHelp", "Marque apenas os campos que devem ser enviados ao n8n. Use os campos customizados para adicionar valores fixos ou variáveis do fluxo (ex.: {{var}}).")}
            </Typography>
            {activeEventKeys.map((ev) => renderMappingFor(ev))}
          </>
        )}

        <Divider sx={{ my: 1.5 }} />

        <Typography variant="subtitle2" className={classes.section}>
          {i18n.t("flowBuilderN8nTriggerModal.triggerTitle", "Disparo")}
        </Typography>
        <Grid container spacing={1}>
          <Grid item xs={6}>
            <FormControl fullWidth margin="dense" size="small" variant="outlined">
              <InputLabel>{i18n.t("flowBuilderN8nTriggerModal.mode", "Modo")}</InputLabel>
              <Select
                value={mode}
                label={i18n.t("flowBuilderN8nTriggerModal.mode", "Modo")}
                onChange={(e) => setMode(e.target.value)}
              >
                <MenuItem value="async">{i18n.t("flowBuilderN8nTriggerModal.modeAsync", "Fire-and-forget")}</MenuItem>
                <MenuItem value="sync">{i18n.t("flowBuilderN8nTriggerModal.modeSync", "Aguardar resposta")}</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={6}>
            <TextField
              fullWidth
              margin="dense"
              variant="outlined"
              size="small"
              type="number"
              label="Timeout (ms)"
              value={timeout}
              onChange={(e) => setTimeoutMs(e.target.value)}
              inputProps={{ min: 1000, max: 120000 }}
            />
          </Grid>
        </Grid>

        {mode === "sync" && (
          <TextField
            fullWidth
            margin="dense"
            variant="outlined"
            size="small"
            label="Salvar resposta em variável"
            value={saveResponseVar}
            onChange={(e) => setSaveResponseVar(e.target.value)}
            helperText="Use depois nos próximos nós como {{n8nResponse}}"
          />
        )}
      </DialogContent>

      <DialogActions sx={{ p: 2 }}>
        <Button onClick={() => close(null)} variant="outlined" color="inherit">
          Cancelar
        </Button>
        <Button
          onClick={handleSave}
          variant="contained"
          sx={{
            backgroundColor: "#EA4B71",
            "&:hover": { backgroundColor: "#D63D63" },
          }}
        >
          {open === "edit" ? "Salvar" : "Adicionar"}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default FlowBuilderN8nTriggerModal;
