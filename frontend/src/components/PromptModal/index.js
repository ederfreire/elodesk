import React, { useState, useEffect, useRef } from "react";
import * as Yup from "yup";
import { Formik, Form, Field } from "formik";
import { toast } from "react-toastify";
import { makeStyles } from "@material-ui/core/styles";
import green from "@material-ui/core/colors/green";
import Button from "@material-ui/core/Button";
import TextField from "@material-ui/core/TextField";
import Dialog from "@material-ui/core/Dialog";
import DialogActions from "@material-ui/core/DialogActions";
import DialogContent from "@material-ui/core/DialogContent";
import CircularProgress from "@material-ui/core/CircularProgress";
import { MenuItem, FormControl, InputLabel, Select, Typography, Tabs, Tab, Box, Switch, Slider, Chip, IconButton, InputAdornment, Paper, Tooltip } from "@material-ui/core";
import Visibility from "@material-ui/icons/Visibility";
import VisibilityOff from "@material-ui/icons/VisibilityOff";
import SendIcon from "@material-ui/icons/Send";
import PlayArrow from "@material-ui/icons/PlayArrow";
import Add from "@material-ui/icons/Add";
import Delete from "@material-ui/icons/Delete";
import CloudUpload from "@material-ui/icons/CloudUpload";
import HelpOutline from "@material-ui/icons/HelpOutline";
import EditIcon from "@material-ui/icons/Edit";
import SmartToy from "@mui/icons-material/SmartToy";
import QueueSelectSingle from "../../components/QueueSelectSingle";
import { i18n } from "../../translate/i18n";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import { AGENT_TEMPLATES } from "./agentTemplates";

// Variáveis disponíveis para inserir nas mensagens (substituídas no envio
// pelo Mustache do backend). Veja backend/src/helpers/Mustache.ts.
const VAR_TOKENS = [
  { token: "{{name}}", key: "name" },
  { token: "{{firstName}}", key: "firstName" },
  { token: "{{userName}}", key: "attendant" },
  { token: "{{queue}}", key: "queue" },
  { token: "{{connection}}", key: "connection" },
  { token: "{{protocol}}", key: "protocol" },
  { token: "{{hour}}", key: "hour" },
  { token: "{{data_hora}}", key: "datetime" },
  { token: "{{name_company}}", key: "company" },
];

const VariableChips = ({ onInsert }) => (
  <div style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 6, marginBottom: 4 }}>
    <Typography style={{ fontSize: 11, color: "#64748b", width: "100%", marginBottom: 2 }}>
      {i18n.t("promptModal.behavior.insertVariable")}
    </Typography>
    {VAR_TOKENS.map((v) => (
      <Chip
        key={v.token}
        label={i18n.t(`promptModal.behavior.vars.${v.key}`)}
        size="small"
        clickable
        onClick={() => onInsert(v.token)}
        style={{ fontSize: 11, height: 22, background: "#FFF7ED", color: "#9A3412", border: "1px solid #FED7AA" }}
      />
    ))}
  </div>
);

// Máscara visual para WhatsApp internacional (ex: 5511999998888 -> +55 (11) 99999-8888)
// Sempre exibe formatação progressiva conforme o usuário digita; o valor salvo continua só com dígitos.
const formatWhatsAppMask = (digits) => {
  const d = String(digits || "").replace(/\D/g, "").slice(0, 15);
  if (!d) return "";
  // Brasil (55 + DDD + 8/9 dígitos) — máscara amigável
  if (d.startsWith("55") && d.length > 2) {
    const cc = d.slice(0, 2);
    const ddd = d.slice(2, 4);
    const rest = d.slice(4);
    let out = `+${cc}`;
    if (ddd) out += ` (${ddd}`;
    if (ddd.length === 2) out += ")";
    if (rest) {
      if (rest.length <= 4) out += ` ${rest}`;
      else if (rest.length <= 8) out += ` ${rest.slice(0, 4)}-${rest.slice(4)}`;
      else out += ` ${rest.slice(0, 5)}-${rest.slice(5, 9)}`;
    }
    return out;
  }
  // Internacional genérico: +CC resto agrupado de 3 em 3
  const cc = d.slice(0, Math.min(3, Math.max(1, d.length - 8)));
  const rest = d.slice(cc.length);
  const grouped = rest.replace(/(\d{3})(?=\d)/g, "$1 ").trim();
  return `+${cc}${grouped ? " " + grouped : ""}`;
};

const useStyles = makeStyles((theme) => ({
  root: { display: "flex", flexWrap: "wrap" },
  dialogHeader: {
    display: "flex",
    alignItems: "center",
    padding: theme.spacing(2, 3),
    gap: theme.spacing(1.5),
    borderBottom: "none",
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: "50%",
    background: "linear-gradient(135deg, #F97316, #FB923C)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#fff",
    fontSize: 20,
  },
  tabs: {
    minHeight: 36,
    "& .MuiTab-root": {
      minHeight: 36,
      textTransform: "none",
      fontWeight: 500,
      fontSize: 14,
      color: theme.palette.text.secondary,
    },
    "& .Mui-selected": {
      color: "#F97316",
    },
    "& .MuiTabs-indicator": {
      backgroundColor: "#F97316",
    },
  },
  sectionContent: {
    padding: theme.spacing(2, 3),
    overflowY: "auto",
    maxHeight: "60vh",
  },
  fieldRow: {
    display: "flex",
    gap: theme.spacing(2),
    marginBottom: theme.spacing(1),
  },
  label: {
    fontWeight: 600,
    fontSize: 14,
    marginBottom: 4,
    marginTop: theme.spacing(1.5),
    color: theme.palette.text.primary,
  },
  helperText: {
    fontSize: 12,
    color: theme.palette.text.secondary,
    marginTop: 2,
  },
  languageChips: {
    display: "flex",
    flexWrap: "wrap",
    gap: 8,
    marginTop: 8,
  },
  chipActive: {
    backgroundColor: "#F97316 !important",
    color: "#fff !important",
    fontWeight: 500,
  },
  chipInactive: {
    backgroundColor: theme.palette.action.hover,
    color: theme.palette.text.primary,
    cursor: "pointer",
  },
  switchRow: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: theme.spacing(1.5),
  },
  sliderBox: {
    marginTop: theme.spacing(1),
    "& .MuiSlider-root": {
      color: "#F97316",
    },
  },
  audioSection: {
    marginTop: theme.spacing(2),
    padding: theme.spacing(1.5),
    borderRadius: 8,
    border: `1px solid ${theme.palette.divider}`,
  },
  actions: {
    padding: theme.spacing(2, 3),
    gap: theme.spacing(1),
  },
  saveBtn: {
    backgroundColor: "#F97316",
    color: "#fff",
    "&:hover": { backgroundColor: "#EA580C" },
    textTransform: "none",
    fontWeight: 600,
    borderRadius: 8,
    padding: "8px 32px",
  },
  cancelBtn: {
    textTransform: "none",
    borderRadius: 8,
    padding: "8px 24px",
  },
  btnWrapper: { position: "relative" },
  buttonProgress: {
    color: green[500],
    position: "absolute",
    top: "50%",
    left: "50%",
    marginTop: -12,
    marginLeft: -12,
  },
  // Test chat styles
  testChatContainer: {
    display: "flex",
    flexDirection: "column",
    height: 400,
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: 8,
    overflow: "hidden",
    marginTop: theme.spacing(1),
  },
  messagesArea: {
    flex: 1,
    overflowY: "auto",
    padding: theme.spacing(2),
    backgroundColor: theme.palette.type === "dark" ? "#1a1a2e" : "#f5f5f5",
  },
  messageBubble: {
    maxWidth: "80%",
    padding: theme.spacing(1, 1.5),
    borderRadius: 12,
    marginBottom: theme.spacing(1),
    wordWrap: "break-word",
    whiteSpace: "pre-wrap",
    fontSize: "0.875rem",
  },
  userMessage: {
    backgroundColor: "#F97316",
    color: "#fff",
    marginLeft: "auto",
    borderBottomRightRadius: 4,
  },
  aiMessage: {
    backgroundColor: theme.palette.type === "dark" ? "#2d2d44" : "#fff",
    color: theme.palette.text.primary,
    marginRight: "auto",
    borderBottomLeftRadius: 4,
    boxShadow: "0 1px 2px rgba(0,0,0,0.1)",
  },
  inputArea: {
    display: "flex",
    padding: theme.spacing(1),
    borderTop: `1px solid ${theme.palette.divider}`,
    backgroundColor: theme.palette.background.paper,
  },
  modelSelect: {
    display: "flex",
    alignItems: "center",
    padding: theme.spacing(1),
    gap: theme.spacing(1),
    borderBottom: `1px solid ${theme.palette.divider}`,
  },
  typingIndicator: {
    display: "flex",
    gap: 4,
    padding: theme.spacing(1, 1.5),
    "& span": {
      width: 8,
      height: 8,
      borderRadius: "50%",
      backgroundColor: theme.palette.text.secondary,
      animation: "$bounce 1.4s infinite ease-in-out both",
    },
    "& span:nth-child(1)": { animationDelay: "-0.32s" },
    "& span:nth-child(2)": { animationDelay: "-0.16s" },
  },
  "@keyframes bounce": {
    "0%, 80%, 100%": { transform: "scale(0)" },
    "40%": { transform: "scale(1)" },
  },
}));

const AI_MODELS = [
  { value: "gpt-4o-mini", label: "GPT-4o Mini", descKey: "promptModal.aiModels.gpt4oMiniDesc" },
  { value: "gpt-4o", label: "GPT-4o", descKey: "promptModal.aiModels.gpt4oDesc" },
  { value: "gpt-4.1-mini", label: "GPT-4.1 Mini", descKey: "promptModal.aiModels.gpt41MiniDesc" },
  { value: "gpt-4.1", label: "GPT-4.1", descKey: "promptModal.aiModels.gpt41Desc" },
  { value: "gpt-4.1-nano", label: "GPT-4.1 Nano", descKey: "promptModal.aiModels.gpt41NanoDesc" },
  { value: "o4-mini", label: "O4 Mini", descKey: "promptModal.aiModels.o4MiniDesc" },
];

const VOICE_TONES = [
  { value: "amigavel", labelKey: "promptModal.voiceTones.amigavel" },
  { value: "profissional", labelKey: "promptModal.voiceTones.profissional" },
  { value: "formal", labelKey: "promptModal.voiceTones.formal" },
  { value: "casual", labelKey: "promptModal.voiceTones.casual" },
  { value: "empatico", labelKey: "promptModal.voiceTones.empatico" },
  { value: "tecnico", labelKey: "promptModal.voiceTones.tecnico" },
];

const FUNCTIONS = [
  { value: "geral", labelKey: "promptModal.functions.geral", descKey: "promptModal.functions.geralDesc" },
  { value: "vendas", labelKey: "promptModal.functions.vendas", descKey: "promptModal.functions.vendasDesc" },
  { value: "suporte", labelKey: "promptModal.functions.suporte", descKey: "promptModal.functions.suporteDesc" },
  { value: "agendamento", labelKey: "promptModal.functions.agendamento", descKey: "promptModal.functions.agendamentoDesc" },
  { value: "financeiro", labelKey: "promptModal.functions.financeiro", descKey: "promptModal.functions.financeiroDesc" },
];

const LANGUAGES = [
  { code: "pt-BR", cc: "br", label: "Português (BR)" },
  { code: "en-US", cc: "us", label: "English" },
  { code: "es-ES", cc: "es", label: "Español" },
  { code: "fr-FR", cc: "fr", label: "Français" },
  { code: "de-DE", cc: "de", label: "Deutsch" },
  { code: "it-IT", cc: "it", label: "Italiano" },
  { code: "auto", cc: null, label: "Auto" },
];

const RESPONSE_MODES = [
  { value: "text", labelKey: "promptModal.responseModes.text", descKey: "promptModal.responseModes.textDesc" },
  { value: "audio", labelKey: "promptModal.responseModes.audio", descKey: "promptModal.responseModes.audioDesc" },
  { value: "both", labelKey: "promptModal.responseModes.both", descKey: "promptModal.responseModes.bothDesc" },
];

const AGENT_VOICES = [
  { value: "alloy", label: "Alloy", descKey: "promptModal.agentVoices.alloyDesc" },
  { value: "ash", label: "Ash", descKey: "promptModal.agentVoices.ashDesc" },
  { value: "ballad", label: "Ballad", descKey: "promptModal.agentVoices.balladDesc" },
  { value: "coral", label: "Coral", descKey: "promptModal.agentVoices.coralDesc" },
  { value: "echo", label: "Echo", descKey: "promptModal.agentVoices.echoDesc" },
  { value: "fable", label: "Fable", descKey: "promptModal.agentVoices.fableDesc" },
  { value: "onyx", label: "Onyx", descKey: "promptModal.agentVoices.onyxDesc" },
  { value: "nova", label: "Nova", descKey: "promptModal.agentVoices.novaDesc" },
  { value: "sage", label: "Sage", descKey: "promptModal.agentVoices.sageDesc" },
  { value: "shimmer", label: "Shimmer", descKey: "promptModal.agentVoices.shimmerDesc" },
];

const PromptModal = ({ open, onClose, promptId }) => {
  const classes = useStyles();
  const t = (key, opts) => i18n.t(key, opts);
  const [activeTab, setActiveTab] = useState(0);

  // Modelos prontos: vêm do módulo "Modelos de Agente" (banco), que inclui as
  // versões em português, espanhol e inglês e os modelos criados pelo admin.
  // Se a API falhar ou vier vazia, cai na lista fixa antiga — o seletor nunca
  // fica vazio.
  const [modelosDisponiveis, setModelosDisponiveis] = useState(AGENT_TEMPLATES);
  useEffect(() => {
    let ativo = true;
    api
      .get("/agent-templates", { params: { scope: "conversa" } })
      .then(({ data }) => {
        if (!ativo || !Array.isArray(data)) return;
        const lista = data
          .filter((m) => m && m.active !== false && (m.prompt || "").trim())
          .map((m) => ({
            value: `db-${m.id}`,
            label: m.label,
            description: m.description || "",
            prompt: m.prompt,
          }));
        if (lista.length) setModelosDisponiveis(lista);
      })
      .catch(() => {});
    return () => {
      ativo = false;
    };
  }, []);
  const [showApiKey, setShowApiKey] = useState(false);

  // Test chat state
  const [testMessages, setTestMessages] = useState([]);
  const [testInput, setTestInput] = useState("");
  const [testLoading, setTestLoading] = useState(false);
  const [testModel, setTestModel] = useState("gpt-4o-mini");
  const [playingVoice, setPlayingVoice] = useState(false);
  const audioRef = useRef(null);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  // Knowledge base state
  const [knowledgeItems, setKnowledgeItems] = useState([]);
  const [knowledgeLoading, setKnowledgeLoading] = useState(false);
  const [addKnowledgeOpen, setAddKnowledgeOpen] = useState(false);
  const [newKnowledge, setNewKnowledge] = useState({ name: "", type: "text", content: "" });
  const [uploadingFile, setUploadingFile] = useState(false);
  const [editKnowledgeItem, setEditKnowledgeItem] = useState(null);
  const [editKnowledgeData, setEditKnowledgeData] = useState({ name: "", content: "" });
  const [openTicketQueues, setOpenTicketQueues] = useState([]);
  const [openTicketUsers, setOpenTicketUsers] = useState([]);
  const [availableTags, setAvailableTags] = useState([]);
  const [availableKanbanTags, setAvailableKanbanTags] = useState([]);

  const fetchKnowledgeItems = async () => {
    if (!promptId) return;
    setKnowledgeLoading(true);
    try {
      const { data } = await api.get(`/prompt/${promptId}/knowledge`);
      setKnowledgeItems(data);
    } catch (err) {
      console.error("Erro ao carregar base de conhecimento:", err);
    } finally {
      setKnowledgeLoading(false);
    }
  };

  useEffect(() => {
    if (promptId && open) {
      fetchKnowledgeItems();
    } else {
      setKnowledgeItems([]);
    }
  }, [promptId, open]);

  const handleAddKnowledge = async () => {
    if (!newKnowledge.name || !newKnowledge.content) {
      toast.error(t("promptModal.knowledge.fillNameContent"));
      return;
    }
    try {
      await api.post(`/prompt/${promptId}/knowledge`, newKnowledge);
      toast.success(t("promptModal.knowledge.addedSuccess"));
      setNewKnowledge({ name: "", type: "text", content: "" });
      setAddKnowledgeOpen(false);
      fetchKnowledgeItems();
    } catch (err) {
      toastError(err);
    }
  };

  const handleUploadFile = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setUploadingFile(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("name", file.name);
      await api.post(`/prompt/${promptId}/knowledge/upload`, formData, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      toast.success(t("promptModal.knowledge.uploadSuccess"));
      fetchKnowledgeItems();
    } catch (err) {
      toastError(err);
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleToggleKnowledge = async (item) => {
    try {
      await api.put(`/prompt/knowledge/${item.id}`, { active: !item.active });
      fetchKnowledgeItems();
    } catch (err) {
      toastError(err);
    }
  };

  const handleDeleteKnowledge = async (id) => {
    if (!window.confirm(t("promptModal.knowledge.removeConfirm"))) return;
    try {
      await api.delete(`/prompt/knowledge/${id}`);
      toast.success(t("promptModal.knowledge.removeSuccess"));
      fetchKnowledgeItems();
    } catch (err) {
      toastError(err);
    }
  };

  const handleOpenEditKnowledge = (item) => {
    setEditKnowledgeItem(item);
    setEditKnowledgeData({ name: item.name || "", content: item.content || "" });
  };

  const handleSaveEditKnowledge = async () => {
    if (!editKnowledgeItem) return;
    if (!editKnowledgeData.name) {
      toast.error(t("promptModal.knowledge.fillNameContent"));
      return;
    }
    try {
      await api.put(`/prompt/knowledge/${editKnowledgeItem.id}`, {
        name: editKnowledgeData.name,
        content: editKnowledgeData.content,
        active: editKnowledgeItem.active,
      });
      toast.success(t("promptModal.knowledge.addedSuccess"));
      setEditKnowledgeItem(null);
      fetchKnowledgeItems();
    } catch (err) {
      toastError(err);
    }
  };

  const getTypeIcon = (type) => {
    switch (type) {
      case "url": return "🔗";
      case "pdf": return "📄";
      case "doc": return "📝";
      case "audio": return "🎵";
      case "video": return "🎬";
      default: return "📋";
    }
  };

  const handlePlayVoice = async (voice, apiKey) => {
    if (playingVoice) {
      if (audioRef.current) {
        audioRef.current.pause();
        audioRef.current = null;
      }
      setPlayingVoice(false);
      return;
    }
    if (!apiKey) {
      toast.error(t("promptModal.test.fillApiKeyVoice"));
      return;
    }
    setPlayingVoice(true);
    try {
      const { data } = await api.post("/prompt/preview-voice", {
        apiKey,
        voice: voice || "nova",
      });
      const audio = new Audio(`data:audio/mp3;base64,${data.audio}`);
      audioRef.current = audio;
      audio.onended = () => { setPlayingVoice(false); audioRef.current = null; };
      audio.play();
    } catch (err) {
      // A API já explica o motivo (chave recusada, sem saldo, voz inválida).
      // Trocar isso por um texto genérico deixava o usuário sem saber o que
      // corrigir — e o motivo real só aparecia no log do servidor.
      const motivo =
        err?.response?.data?.error ||
        err?.response?.data?.message ||
        t("promptModal.test.voiceError");
      toast.error(motivo);
      setPlayingVoice(false);
    }
  };

  const initialState = {
    name: "",
    prompt: "",
    voice: "texto",
    voiceKey: "",
    voiceRegion: "",
    maxTokens: 2000,
    temperature: 1,
    apiKey: "",
    queueId: null,
    maxMessages: 10,
    // New fields
    agentFunction: "geral",
    voiceTone: "amigavel",
    aiModel: "gpt-4o-mini",
    languages: ["pt-BR"],
    personality: "",
    active: true,
    greetingMessage: "",
    responseRules: "",
    allowTransfer: true,
    transferKeywords: "",
    transferMessage: "",
    transferQueueId: "",
    transferUserId: "",
    transferStatus: "pending",
    responseDelay: 1,
    charLimit: 2000,
    humanizeConversation: true,
    audioEnabled: false,
    transcribeAudio: false,
    responseMode: "text",
    agentVoice: "lily",
    sendAsPTT: true,
    // Ferramentas (AI Agent Tools)
    toolOpenTicket: false,
    toolOpenTicketMessage: "",
    toolOpenTicketPauseAi: true,
    toolOpenTicketQueueId: "",
    toolOpenTicketUserId: "",
    toolNotifyHuman: false,
    toolNotifyHumanNumbers: [""], // Lista de números (formato internacional, só dígitos)
    toolHttpRequest: false,
    toolHttpAllowedDomains: "",
    toolHttpDefaultHeaders: "",
    toolScheduling: false,
    toolSchedulingMaxDays: 30,
    toolSchedulingConfirmMessage: "",
    // Tags & Kanban
    toolTags: false,
    toolTagsAllowed: [], // array de IDs de tags permitidas (vazio = todas)
    toolKanban: false,
    toolKanbanAllowed: [], // array de IDs de tags-kanban permitidas (vazio = todas)
    // Turno / Horário de atendimento
    workingHoursEnabled: false,
    workingHoursTimezone: "America/Sao_Paulo",
    workingHoursOutOfMessage: "Olá! Estamos fora do nosso horário de atendimento no momento. Retornaremos seu contato no próximo expediente.",
    workingHoursSchedule: {
      mon: [{ start: "08:00", end: "12:00" }, { start: "14:00", end: "18:00" }],
      tue: [{ start: "08:00", end: "12:00" }, { start: "14:00", end: "18:00" }],
      wed: [{ start: "08:00", end: "12:00" }, { start: "14:00", end: "18:00" }],
      thu: [{ start: "08:00", end: "12:00" }, { start: "14:00", end: "18:00" }],
      fri: [{ start: "08:00", end: "12:00" }, { start: "14:00", end: "18:00" }],
      sat: [],
      sun: [],
    },
    // Inatividade — acordar cliente
    inactivityEnabled: false,
    inactivityTimeout: 10,
    inactivityMessage: i18n.t(
      "prompts.inactivity.defaultMessage",
      "Olá! Ainda está por aí? Posso te ajudar em mais alguma coisa? 😊"
    ),
    inactivityMaxReminders: 1,
    inactivitySteps: [],
  };

  const [prompt, setPrompt] = useState(initialState);

  useEffect(() => {
    const fetchPrompt = async () => {
      if (!promptId) {
        setPrompt(initialState);
        return;
      }
      try {
        const { data } = await api.get(`/prompt/${promptId}`);
        // Extrai números do JSON de configuração para o campo de UI
        let notifyNumbers = [];
        try {
          const cfg = typeof data.toolNotifyHumanConfig === "string"
            ? JSON.parse(data.toolNotifyHumanConfig || "{}")
            : (data.toolNotifyHumanConfig || {});
          if (Array.isArray(cfg.whatsappNumbers)) {
            notifyNumbers = cfg.whatsappNumbers.filter(Boolean);
          } else if (cfg.whatsappNumber || cfg.number || cfg.phone) {
            notifyNumbers = [cfg.whatsappNumber || cfg.number || cfg.phone];
          }
        } catch (e) { /* noop */ }
        if (notifyNumbers.length === 0) notifyNumbers = [""];
        // Parse http config
        let httpAllowed = "";
        let httpHeaders = "";
        try {
          const h = typeof data.toolHttpRequestConfig === "string"
            ? JSON.parse(data.toolHttpRequestConfig || "{}")
            : (data.toolHttpRequestConfig || {});
          httpAllowed = Array.isArray(h.allowedDomains) ? h.allowedDomains.join("\n") : (h.allowedDomains || "");
          httpHeaders = h.defaultHeaders ? JSON.stringify(h.defaultHeaders, null, 2) : "";
        } catch (e) { /* noop */ }
        // Parse open ticket config
        let openMsg = "";
        let openPause = true;
        let openQueueId = "";
        let openUserId = "";
        try {
          const o = typeof data.toolOpenTicketConfig === "string"
            ? JSON.parse(data.toolOpenTicketConfig || "{}")
            : (data.toolOpenTicketConfig || {});
          openMsg = o.message || "";
          if (typeof o.pauseAi === "boolean") openPause = o.pauseAi;
          openQueueId = o.queueId ? String(o.queueId) : "";
          openUserId = o.userId ? String(o.userId) : "";
        } catch (e) { /* noop */ }
        // Parse scheduling config
        let schedMax = 30;
        let schedConfirm = "";
        try {
          const s = typeof data.toolSchedulingConfig === "string"
            ? JSON.parse(data.toolSchedulingConfig || "{}")
            : (data.toolSchedulingConfig || {});
          if (Number(s.maxDaysAhead) > 0) schedMax = Number(s.maxDaysAhead);
          schedConfirm = s.confirmMessage || "";
        } catch (e) { /* noop */ }
        // Parse tags / kanban configs
        let tagsAllowed = [];
        try {
          const tg = typeof data.toolTagsConfig === "string"
            ? JSON.parse(data.toolTagsConfig || "{}")
            : (data.toolTagsConfig || {});
          if (Array.isArray(tg.allowedTagIds)) tagsAllowed = tg.allowedTagIds.map((n) => Number(n)).filter(Boolean);
        } catch (e) { /* noop */ }
        let kanbanAllowed = [];
        try {
          const kb = typeof data.toolKanbanConfig === "string"
            ? JSON.parse(data.toolKanbanConfig || "{}")
            : (data.toolKanbanConfig || {});
          if (Array.isArray(kb.allowedTagIds)) kanbanAllowed = kb.allowedTagIds.map((n) => Number(n)).filter(Boolean);
        } catch (e) { /* noop */ }
        // Parse workingHoursSchedule
        let whSchedule = initialState.workingHoursSchedule;
        try {
          const w = typeof data.workingHoursSchedule === "string"
            ? JSON.parse(data.workingHoursSchedule || "null")
            : data.workingHoursSchedule;
          if (w && typeof w === "object") {
            whSchedule = { mon: [], tue: [], wed: [], thu: [], fri: [], sat: [], sun: [], ...w };
            for (const k of ["mon","tue","wed","thu","fri","sat","sun"]) {
              if (!Array.isArray(whSchedule[k])) whSchedule[k] = [];
            }
          }
        } catch (e) { /* noop */ }
        // Merge with defaults for new fields
        setPrompt((prev) => ({
          ...initialState,
          ...data,
          toolNotifyHumanNumbers: notifyNumbers,
          toolHttpAllowedDomains: httpAllowed,
          toolHttpDefaultHeaders: httpHeaders,
          toolOpenTicketMessage: openMsg,
          toolOpenTicketPauseAi: openPause,
          toolOpenTicketQueueId: openQueueId,
          toolOpenTicketUserId: openUserId,
          toolSchedulingMaxDays: schedMax,
          toolSchedulingConfirmMessage: schedConfirm,
          toolTagsAllowed: tagsAllowed,
          toolKanbanAllowed: kanbanAllowed,
          workingHoursEnabled: !!data.workingHoursEnabled,
          workingHoursTimezone: data.workingHoursTimezone || initialState.workingHoursTimezone,
          workingHoursOutOfMessage: data.workingHoursOutOfMessage || initialState.workingHoursOutOfMessage,
          workingHoursSchedule: whSchedule,
          languages: data.languages || ["pt-BR"],
          inactivityEnabled: !!data.inactivityEnabled,
          inactivityTimeout: data.inactivityTimeout ?? initialState.inactivityTimeout,
          inactivityMessage: data.inactivityMessage || initialState.inactivityMessage,
          inactivityMaxReminders: data.inactivityMaxReminders ?? initialState.inactivityMaxReminders,
          // Cadência (tempos diferentes). Pode vir como texto dependendo do driver.
          inactivitySteps: (() => {
            const bruto = data.inactivitySteps;
            if (Array.isArray(bruto)) return bruto;
            if (typeof bruto === "string") {
              try {
                const lista = JSON.parse(bruto);
                return Array.isArray(lista) ? lista : [];
              } catch (e) {
                return [];
              }
            }
            return [];
          })(),
        }));
      } catch (err) {
        toastError(err);
      }
    };
    fetchPrompt();
  }, [promptId, open]);

  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const [{ data: qData }, { data: uData }] = await Promise.all([
          api.get("/queue"),
          api.get("/users"),
        ]);
        setOpenTicketQueues(Array.isArray(qData) ? qData : []);
        const usersList = Array.isArray(uData?.users) ? uData.users : (Array.isArray(uData) ? uData : []);
        setOpenTicketUsers(usersList);
      } catch (e) {
        setOpenTicketQueues([]);
        setOpenTicketUsers([]);
      }
    })();
  }, [open]);

  // Carrega tags e tags-kanban disponíveis para as ferramentas Tags / Kanban
  useEffect(() => {
    if (!open) return;
    (async () => {
      try {
        const [tagsRes, kanbanRes] = await Promise.all([
          api.get("/tags/list").catch(() => ({ data: [] })),
          api.get("/tag/kanban").catch(() => ({ data: { lista: [] } })),
        ]);
        const tagsList = Array.isArray(tagsRes.data)
          ? tagsRes.data
          : (Array.isArray(tagsRes.data?.lista) ? tagsRes.data.lista : []);
        const kanbanList = Array.isArray(kanbanRes.data?.lista)
          ? kanbanRes.data.lista
          : (Array.isArray(kanbanRes.data) ? kanbanRes.data : []);
        const cleanTags = tagsList.filter(
          (t) =>
            t &&
            typeof t.name === "string" &&
            t.name.trim() !== "" &&
            !/^label\s+undefined$/i.test(t.name.trim())
        );
        const cleanKanban = kanbanList.filter(
          (t) =>
            t &&
            typeof t.name === "string" &&
            t.name.trim() !== "" &&
            !/^label\s+undefined$/i.test(t.name.trim())
        );
        setAvailableTags(cleanTags);
        setAvailableKanbanTags(cleanKanban);
      } catch (e) {
        setAvailableTags([]);
        setAvailableKanbanTags([]);
      }
    })();
  }, [open]);

  useEffect(() => {
    if (messagesEndRef.current) {
      messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
    }
  }, [testMessages, testLoading]);

  const handleClose = () => {
    setPrompt(initialState);
    setActiveTab(0);
    setTestMessages([]);
    setTestInput("");
    onClose();
  };

  const handleSavePrompt = async (values) => {
    const promptData = { ...values };
    if (!String(values.name || "").trim()) {
      toastError("Informe o nome do agente.");
      setActiveTab(0);
      return;
    }
    // Validação: se "Notificar Humano" está ativo, número é obrigatório
    if (values.toolNotifyHuman) {
      const list = (values.toolNotifyHumanNumbers || [])
        .map((n) => String(n || "").replace(/\D/g, ""))
        .filter((n) => n.length >= 10);
      const unique = Array.from(new Set(list));
      if (unique.length === 0) {
        toastError("Informe pelo menos um número de WhatsApp válido (com DDI + DDD, ex: 5511999998888).");
        return;
      }
      promptData.toolNotifyHumanConfig = {
        whatsappNumbers: unique,
        whatsappNumber: unique[0], // mantém compatibilidade com versão anterior
      };
    }
    // Serializa config da Abrir Atendimento
    if (values.toolOpenTicket) {
      promptData.toolOpenTicketConfig = {
        message: String(values.toolOpenTicketMessage || "").trim(),
        pauseAi: values.toolOpenTicketPauseAi !== false,
        queueId: values.toolOpenTicketQueueId ? Number(values.toolOpenTicketQueueId) : null,
        userId: values.toolOpenTicketUserId ? Number(values.toolOpenTicketUserId) : null,
      };
    }
    // Serializa config da Requisição HTTP
    if (values.toolHttpRequest) {
      const domains = String(values.toolHttpAllowedDomains || "")
        .split(/[\s,;\n]+/).map(s => s.trim()).filter(Boolean);
      let headers = {};
      const raw = String(values.toolHttpDefaultHeaders || "").trim();
      if (raw) {
        try { headers = JSON.parse(raw); }
        catch (e) {
          toastError(i18n.t("promptModal.tools.httpRequest.config.invalidHeaders"));
          return;
        }
      }
      promptData.toolHttpRequestConfig = { allowedDomains: domains, defaultHeaders: headers };
    }
    // Serializa config do Agendamento
    if (values.toolScheduling) {
      promptData.toolSchedulingConfig = {
        maxDaysAhead: Number(values.toolSchedulingMaxDays) || 0,
        confirmMessage: String(values.toolSchedulingConfirmMessage || "").trim(),
      };
    }
    // Serializa config das Tags / Kanban
    if (values.toolTags) {
      promptData.toolTagsConfig = {
        allowedTagIds: (values.toolTagsAllowed || []).map((n) => Number(n)).filter(Boolean),
      };
    }
    if (values.toolKanban) {
      promptData.toolKanbanConfig = {
        allowedTagIds: (values.toolKanbanAllowed || []).map((n) => Number(n)).filter(Boolean),
      };
    }
    // Não enviar o campo auxiliar de UI ao backend
    delete promptData.toolNotifyHumanNumbers;
    delete promptData.toolOpenTicketMessage;
    delete promptData.toolOpenTicketPauseAi;
    delete promptData.toolOpenTicketQueueId;
    delete promptData.toolOpenTicketUserId;
    delete promptData.toolHttpAllowedDomains;
    delete promptData.toolHttpDefaultHeaders;
    delete promptData.toolSchedulingMaxDays;
    delete promptData.toolSchedulingConfirmMessage;
    delete promptData.toolTagsAllowed;
    delete promptData.toolKanbanAllowed;
    try {
      if (promptId) {
        await api.put(`/prompt/${promptId}`, promptData);
      } else {
        await api.post("/prompt", promptData);
      }
      toast.success(t("promptModal.success"));
    } catch (err) {
      toastError(err);
    }
    handleClose();
  };

  const handleToggleLanguage = (code, values, setFieldValue) => {
    const langs = values.languages || [];
    if (langs.includes(code)) {
      setFieldValue("languages", langs.filter((l) => l !== code));
    } else {
      setFieldValue("languages", [...langs, code]);
    }
  };

  const handleSendTestMessage = async (formValues) => {
    if (!testInput.trim()) return;
    if (!formValues.apiKey) {
      toast.error(t("promptModal.test.fillApiKey"));
      return;
    }
    if (!formValues.prompt && !formValues.personality) {
      toast.error(t("promptModal.test.fillPrompt"));
      return;
    }

    const userMsg = { role: "user", content: testInput };
    setTestMessages((prev) => [...prev, userMsg]);
    setTestInput("");
    setTestLoading(true);

    try {
      const { data } = await api.post("/prompt/test", {
        apiKey: formValues.apiKey,
        prompt: formValues.prompt || formValues.personality,
        model: testModel,
        maxTokens: formValues.maxTokens || 2000,
        temperature: formValues.temperature || 1,
        message: testInput,
      });
      setTestMessages((prev) => [...prev, { role: "assistant", content: data.response }]);
    } catch (err) {
      setTestMessages((prev) => [
        ...prev,
        { role: "assistant", content: `❌ Erro: ${err?.response?.data?.error || err.message}` },
      ]);
    } finally {
      setTestLoading(false);
    }
  };

  const handleTestKeyPress = (e, formValues) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSendTestMessage(formValues);
    }
  };

  return (
    <div className={classes.root}>
      <Dialog open={open} onClose={handleClose} maxWidth="sm" scroll="paper" fullWidth>
        {/* Header */}
        <div className={classes.dialogHeader}>
          <div className={classes.headerIcon}>
            <SmartToy style={{ fontSize: 22 }} />
          </div>
          <div style={{ flex: 1 }}>
            <Typography variant="h6" style={{ fontWeight: 700, fontSize: 16 }}>
              {promptId ? t("promptModal.title.edit") : t("promptModal.title.add")}
            </Typography>
            <Typography variant="caption" color="textSecondary">
              {t("promptModal.subtitle")}
            </Typography>
          </div>
          <IconButton onClick={handleClose} size="small">
            ✕
          </IconButton>
        </div>

        <Formik
          initialValues={prompt}
          enableReinitialize={true}
          onSubmit={(values, actions) => {
            setTimeout(() => {
              handleSavePrompt(values);
              actions.setSubmitting(false);
            }, 400);
          }}
        >
          {({ touched, errors, isSubmitting, values, setFieldValue }) => (
            <Form style={{ width: "100%" }}>
              <Tabs
                value={activeTab}
                onChange={(e, v) => setActiveTab(v)}
                className={classes.tabs}
                variant="scrollable"
                scrollButtons="auto"
                style={{ paddingLeft: 24, borderBottom: "1px solid #e0e0e0" }}
              >
                <Tab label={t("promptModal.tabs.basic")} />
                <Tab label={t("promptModal.tabs.behavior")} />
                <Tab label={t("promptModal.tabs.advanced")} />
                <Tab label={t("promptModal.tabs.knowledge")} />
                <Tab label={t("promptModal.tabs.tools")} />
                <Tab label={t("promptModal.tabs.test")} />
              </Tabs>

              {/* ===== TAB BÁSICO ===== */}
              {activeTab === 0 && (
                <div className={classes.sectionContent}>
                  <div className={classes.fieldRow}>
                    <div style={{ flex: 1 }}>
                      <Typography className={classes.label}>{t("promptModal.basic.agentName")}</Typography>
                      <Field
                        as={TextField}
                        name="name"
                        placeholder={t("promptModal.basic.agentNamePlaceholder")}
                        variant="outlined"
                        size="small"
                        fullWidth
                        error={touched.name && Boolean(errors.name)}
                        helperText={touched.name && errors.name}
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <Typography className={classes.label}>{t("promptModal.basic.function")}</Typography>
                      <Select
                        value={values.agentFunction || "geral"}
                        onChange={(e) => setFieldValue("agentFunction", e.target.value)}
                        variant="outlined"
                        fullWidth
                        style={{ height: 40 }}
                      >
                        {FUNCTIONS.map((f) => (
                          <MenuItem key={f.value} value={f.value}>
                            <div>
                              <div>{t(f.labelKey)}</div>
                              <Typography variant="caption" color="textSecondary">{t(f.descKey)}</Typography>
                            </div>
                          </MenuItem>
                        ))}
                      </Select>
                    </div>
                  </div>

                  <div className={classes.fieldRow}>
                    <div style={{ flex: 1 }}>
                      <Typography className={classes.label}>{t("promptModal.basic.voiceTone")}</Typography>
                      <Select
                        value={values.voiceTone || "amigavel"}
                        onChange={(e) => setFieldValue("voiceTone", e.target.value)}
                        variant="outlined"
                        fullWidth
                        style={{ height: 40 }}
                      >
                        {VOICE_TONES.map((tone) => (
                          <MenuItem key={tone.value} value={tone.value}>{t(tone.labelKey)}</MenuItem>
                        ))}
                      </Select>
                    </div>
                    <div style={{ flex: 1 }}>
                      <Typography className={classes.label}>{t("promptModal.basic.aiModel")}</Typography>
                      <Select
                        value={values.aiModel || "gpt-4o-mini"}
                        onChange={(e) => setFieldValue("aiModel", e.target.value)}
                        variant="outlined"
                        fullWidth
                        style={{ height: 40 }}
                      >
                        {AI_MODELS.map((m) => (
                          <MenuItem key={m.value} value={m.value}>
                            <div>
                              <div>{m.label}</div>
                              <Typography variant="caption" color="textSecondary">{t(m.descKey)}</Typography>
                            </div>
                          </MenuItem>
                        ))}
                      </Select>
                    </div>
                  </div>

                  <Typography className={classes.label}>{t("promptModal.basic.apiKey")}</Typography>
                  <Field
                    as={TextField}
                    name="apiKey"
                    placeholder="sk-..."
                    type={showApiKey ? "text" : "password"}
                    variant="outlined"
                    size="small"
                    fullWidth
                    InputProps={{
                      endAdornment: (
                        <InputAdornment position="end">
                          <IconButton onClick={() => setShowApiKey(!showApiKey)} size="small">
                            {showApiKey ? <VisibilityOff /> : <Visibility />}
                          </IconButton>
                        </InputAdornment>
                      ),
                    }}
                  />

                  <Typography className={classes.label}>{t("promptModal.basic.responseLanguages")}</Typography>
                  <div className={classes.languageChips}>
                    {LANGUAGES.map((lang) => {
                      const flagNode = lang.cc ? (
                        <img
                          src={`https://flagcdn.com/24x18/${lang.cc}.png`}
                          srcSet={`https://flagcdn.com/48x36/${lang.cc}.png 2x`}
                          width="20"
                          height="15"
                          alt={lang.label}
                          style={{ borderRadius: 2, display: "block" }}
                        />
                      ) : (
                        <span style={{ fontSize: 16, lineHeight: 1 }}>🌐</span>
                      );
                      return (
                        <Chip
                          key={lang.code}
                          icon={flagNode}
                          label={lang.label}
                          onClick={() => handleToggleLanguage(lang.code, values, setFieldValue)}
                          className={
                            (values.languages || []).includes(lang.code)
                              ? classes.chipActive
                              : classes.chipInactive
                          }
                          size="small"
                        />
                      );
                    })}
                  </div>
                  <Typography className={classes.helperText}>
                    {t("promptModal.basic.responseLanguagesHelp")}
                  </Typography>

                  {/* MODELOS PRONTOS
                      Preenche o campo de instrucoes com um prompt completo
                      para o papel escolhido. Depois disso e texto comum: o
                      usuario edita a vontade, nada fica travado.

                      Pede confirmacao quando ja ha texto escrito — trocar o
                      modelo apaga tudo, e perder um prompt ajustado a mao e
                      um estrago que nao da para desfazer. */}
                  <Typography className={classes.label}>
                    {t("promptModal.basic.templates", "Modelos prontos")}
                  </Typography>
                  <Select
                    value=""
                    displayEmpty
                    variant="outlined"
                    fullWidth
                    style={{ height: 40, marginBottom: 12 }}
                    onChange={(e) => {
                      const modelo = modelosDisponiveis.find(
                        (x) => x.value === e.target.value
                      );
                      if (!modelo) return;

                      const textoAtual = (values.prompt || "").trim();
                      if (
                        textoAtual &&
                        !window.confirm(
                          t(
                            "promptModal.basic.templateConfirm",
                            "Isso vai substituir as instruções que você já escreveu. Continuar?"
                          )
                        )
                      ) {
                        return;
                      }

                      setFieldValue("prompt", modelo.prompt);
                      // Preenche o nome só se ainda estiver vazio, para não
                      // sobrescrever um nome que o usuário já deu.
                      if (!(values.name || "").trim()) {
                        setFieldValue("name", modelo.label);
                      }
                    }}
                  >
                    <MenuItem value="" disabled>
                      {t("promptModal.basic.templatesPlaceholder", "Escolher um modelo...")}
                    </MenuItem>
                    {modelosDisponiveis.map((modelo) => (
                      <MenuItem key={modelo.value} value={modelo.value}>
                        <div>
                          <div>{modelo.label}</div>
                          <Typography variant="caption" color="textSecondary">
                            {modelo.description}
                          </Typography>
                        </div>
                      </MenuItem>
                    ))}
                  </Select>

                  <Typography className={classes.label}>{t("promptModal.basic.personality")}</Typography>
                  <Field
                    as={TextField}
                    name="prompt"
                    placeholder={t("promptModal.basic.personalityPlaceholder")}
                    variant="outlined"
                    size="small"
                    fullWidth
                    multiline
                    // rows fixo em 4 deixava um prompt de 6 mil caracteres
                    // numa janelinha impossivel de revisar. Cresce ate 20.
                    minRows={4}
                    maxRows={20}
                  />
                  <Typography className={classes.helperText}>
                    {t("promptModal.basic.personalityHelp")}
                  </Typography>

                  <div className={classes.switchRow}>
                    <Typography style={{ fontWeight: 600 }}>{t("promptModal.basic.activeAgent")}</Typography>
                    <Switch
                      checked={values.active !== false}
                      onChange={(e) => setFieldValue("active", e.target.checked)}
                      style={{ color: "#F97316" }}
                    />
                  </div>
                </div>
              )}

              {/* ===== TAB COMPORTAMENTO ===== */}
              {activeTab === 1 && (
                <div className={classes.sectionContent}>
                  <Typography className={classes.label}>{t("promptModal.behavior.greetingMessage")}</Typography>
                  <Field
                    as={TextField}
                    name="greetingMessage"
                    placeholder={t("promptModal.behavior.greetingPlaceholder")}
                    variant="outlined"
                    size="small"
                    fullWidth
                    multiline
                    rows={3}
                  />
                  <VariableChips
                    onInsert={(v) =>
                      setFieldValue("greetingMessage", `${values.greetingMessage || ""}${v}`)
                    }
                  />
                  <Typography className={classes.helperText}>
                    {t("promptModal.behavior.greetingHelp")}
                  </Typography>

                  <Typography className={classes.label}>{t("promptModal.behavior.responseRules")}</Typography>
                  <Field
                    as={TextField}
                    name="responseRules"
                    placeholder={t("promptModal.behavior.responseRulesPlaceholder")}
                    variant="outlined"
                    size="small"
                    fullWidth
                    multiline
                    rows={3}
                  />
                  <Typography className={classes.helperText}>
                    {t("promptModal.behavior.responseRulesHelp")}
                  </Typography>

                  <div className={classes.switchRow}>
                    <Typography style={{ fontWeight: 600 }}>{t("promptModal.behavior.allowTransfer")}</Typography>
                    <Switch
                      checked={values.allowTransfer !== false}
                      onChange={(e) => setFieldValue("allowTransfer", e.target.checked)}
                      style={{ color: "#F97316" }}
                    />
                  </div>

                  {values.allowTransfer !== false && (
                    <>
                      <Typography className={classes.label}>{t("promptModal.behavior.transferKeywords")}</Typography>
                      <Field
                        as={TextField}
                        name="transferKeywords"
                        placeholder={t("promptModal.behavior.transferKeywordsPlaceholder")}
                        variant="outlined"
                        size="small"
                        fullWidth
                      />
                      <Typography className={classes.helperText}>
                        {t("promptModal.behavior.transferKeywordsHelp")}
                      </Typography>

                      <Typography className={classes.label}>{t("promptModal.behavior.transferMessage")}</Typography>
                      <Field
                        as={TextField}
                        name="transferMessage"
                        placeholder={t("promptModal.behavior.transferMessagePlaceholder")}
                        variant="outlined"
                        size="small"
                        fullWidth
                        multiline
                        rows={2}
                      />
                      <VariableChips
                        onInsert={(v) =>
                          setFieldValue("transferMessage", `${values.transferMessage || ""}${v}`)
                        }
                      />

                      <div style={{ marginTop: 14, padding: 12, background: "#FFF7ED", border: "1px solid #FED7AA", borderRadius: 8 }}>
                        <Typography style={{ fontSize: 12, fontWeight: 700, color: "#9A3412", marginBottom: 8 }}>
                          🎯 {t("promptModal.behavior.transferTargetTitle")}
                        </Typography>
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
                          <div>
                            <Typography style={{ fontSize: 11, color: "#9A3412", marginBottom: 4 }}>{t("promptModal.behavior.transferQueueLabel")}</Typography>
                            <select
                              value={values.transferQueueId || ""}
                              onChange={(e) => { setFieldValue("transferQueueId", e.target.value); setFieldValue("transferUserId", ""); }}
                              style={{ width: "100%", padding: "8px 10px", border: "1px solid #FED7AA", borderRadius: 6, fontSize: 13, background: "#fff", outline: "none" }}
                            >
                              <option value="">{t("promptModal.behavior.useAgentDefaultQueue")}</option>
                              {openTicketQueues.map((q) => (
                                <option key={q.id} value={q.id}>{q.name}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <Typography style={{ fontSize: 11, color: "#9A3412", marginBottom: 4 }}>{t("promptModal.behavior.transferUserLabel")}</Typography>
                            <select
                              value={values.transferUserId || ""}
                              onChange={(e) => setFieldValue("transferUserId", e.target.value)}
                              style={{ width: "100%", padding: "8px 10px", border: "1px solid #FED7AA", borderRadius: 6, fontSize: 13, background: "#fff", outline: "none" }}
                            >
                              <option value="">{t("promptModal.behavior.anyUserOfQueue")}</option>
                              {openTicketUsers
                                .filter((u) => {
                                  if (!values.transferQueueId) return true;
                                  const qid = Number(values.transferQueueId);
                                  const userQueues = u.queues || u.Queues || [];
                                  return userQueues.some((uq) => Number(uq.id) === qid);
                                })
                                .map((u) => (
                                  <option key={u.id} value={u.id}>{u.name}</option>
                                ))}
                            </select>
                          </div>
                        </div>
                        <div style={{ marginTop: 10 }}>
                          <Typography style={{ fontSize: 11, color: "#9A3412", marginBottom: 4 }}>{t("promptModal.behavior.whereTicket")}</Typography>
                          <div style={{ display: "flex", gap: 14 }}>
                            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: "pointer" }}>
                              <input
                                type="radio"
                                name="transferStatus"
                                value="pending"
                                checked={(values.transferStatus || "pending") === "pending"}
                                onChange={() => setFieldValue("transferStatus", "pending")}
                              />
                              {t("promptModal.behavior.statusPending")}
                            </label>
                            <label style={{ display: "flex", alignItems: "center", gap: 6, fontSize: 13, cursor: values.transferUserId ? "pointer" : "not-allowed", opacity: values.transferUserId ? 1 : 0.5 }}>
                              <input
                                type="radio"
                                name="transferStatus"
                                value="open"
                                disabled={!values.transferUserId}
                                checked={values.transferStatus === "open"}
                                onChange={() => setFieldValue("transferStatus", "open")}
                              />
                              {t("promptModal.behavior.statusOpen")}
                            </label>
                          </div>
                          <Typography style={{ fontSize: 11, color: "#9A3412", marginTop: 6 }}>
                            {t("promptModal.behavior.statusOpenHelp")}
                          </Typography>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}

              {/* ===== TAB AVANÇADO ===== */}
              {activeTab === 2 && (
                <div className={classes.sectionContent}>
                  <div className={classes.sliderBox}>
                    <Box display="flex" justifyContent="space-between" alignItems="center">
                      <Typography className={classes.label}>
                        {t("promptModal.advanced.responseDelay")}: {values.responseDelay || 1}s
                      </Typography>
                      <IconButton size="small">⟳</IconButton>
                    </Box>
                    <Slider
                      value={values.responseDelay || 1}
                      onChange={(e, v) => setFieldValue("responseDelay", v)}
                      min={0}
                      max={10}
                      step={0.5}
                      valueLabelDisplay="auto"
                    />
                    <Typography className={classes.helperText}>
                      {t("promptModal.advanced.responseDelayHelp")}
                    </Typography>
                  </div>

                  <div className={classes.sliderBox}>
                    <Box display="flex" justifyContent="space-between" alignItems="center">
                      <Typography className={classes.label}>
                        {t("promptModal.advanced.charLimit")}: {values.charLimit || 2000}
                      </Typography>
                      <Switch
                        checked={true}
                        size="small"
                        style={{ color: "#F97316" }}
                      />
                    </Box>
                    <Slider
                      value={values.charLimit || 2000}
                      onChange={(e, v) => {
                        setFieldValue("charLimit", v);
                        // Sync maxTokens: ~1 token = 4 chars + 30% margem de segurança
                        const calculated = Math.ceil((v / 4) * 1.3);
                        const synced = Math.min(4000, Math.max(100, calculated));
                        setFieldValue("maxTokens", synced);
                      }}
                      min={100}
                      max={5000}
                      step={100}
                      valueLabelDisplay="auto"
                    />
                    <Typography className={classes.helperText}>
                      {t("promptModal.advanced.charLimitHelp")}
                    </Typography>
                  </div>

                  <div className={classes.switchRow}>
                    <div>
                      <Typography style={{ fontWeight: 600 }}>{t("promptModal.advanced.humanize")}</Typography>
                      <Typography variant="caption" color="textSecondary">
                        {t("promptModal.advanced.humanizeHelp")}
                      </Typography>
                    </div>
                    <Switch
                      checked={values.humanizeConversation !== false}
                      onChange={(e) => setFieldValue("humanizeConversation", e.target.checked)}
                      style={{ color: "#F97316" }}
                    />
                  </div>

                  <div className={classes.audioSection}>
                    <div className={classes.switchRow} style={{ marginTop: 0 }}>
                      <Typography style={{ fontWeight: 600 }}>{t("promptModal.advanced.audioFeatures")}</Typography>
                      <Switch
                        checked={values.audioEnabled || false}
                        onChange={(e) => setFieldValue("audioEnabled", e.target.checked)}
                        style={{ color: "#F97316" }}
                      />
                    </div>

                    {values.audioEnabled && (
                      <>
                        <div className={classes.switchRow}>
                          <div>
                            <Typography style={{ fontWeight: 600, fontSize: 14 }}>{t("promptModal.advanced.transcribeAudio")}</Typography>
                            <Typography variant="caption" color="textSecondary">
                              {t("promptModal.advanced.transcribeAudioHelp")}
                            </Typography>
                          </div>
                          <Switch
                            checked={values.transcribeAudio || false}
                            onChange={(e) => setFieldValue("transcribeAudio", e.target.checked)}
                            size="small"
                          />
                        </div>

                        <Typography className={classes.label}>{t("promptModal.advanced.responseMode")}</Typography>
                        <Select
                          value={values.responseMode || "text"}
                          onChange={(e) => setFieldValue("responseMode", e.target.value)}
                          variant="outlined"
                          fullWidth
                          style={{ height: 40 }}
                        >
                          {RESPONSE_MODES.map((m) => (
                            <MenuItem key={m.value} value={m.value}>
                              <div>
                                <div>{t(m.labelKey)}</div>
                                <Typography variant="caption" color="textSecondary">{t(m.descKey)}</Typography>
                              </div>
                            </MenuItem>
                          ))}
                        </Select>

                        <Typography className={classes.label}>{t("promptModal.advanced.agentVoice")}</Typography>
                        <Box display="flex" alignItems="center" style={{ gap: 8 }}>
                          <Select
                            value={values.agentVoice || "nova"}
                            onChange={(e) => setFieldValue("agentVoice", e.target.value)}
                            variant="outlined"
                            fullWidth
                            style={{ height: 40 }}
                          >
                            {AGENT_VOICES.map((v) => (
                              <MenuItem key={v.value} value={v.value}>
                                <div>
                                  <div>{v.label}</div>
                                  <Typography variant="caption" color="textSecondary">{t(v.descKey)}</Typography>
                                </div>
                              </MenuItem>
                            ))}
                          </Select>
                          <IconButton
                            size="small"
                            onClick={() => handlePlayVoice(values.agentVoice, values.apiKey)}
                            disabled={playingVoice}
                            style={playingVoice ? { color: "#F97316" } : {}}
                          >
                            {playingVoice ? <CircularProgress size={20} style={{ color: "#F97316" }} /> : <PlayArrow />}
                          </IconButton>
                        </Box>

                        <div className={classes.switchRow}>
                          <div>
                            <Typography style={{ fontWeight: 600, fontSize: 14 }}>{t("promptModal.advanced.sendAsPTT")}</Typography>
                            <Typography variant="caption" color="textSecondary">
                              {t("promptModal.advanced.sendAsPTTHelp")}
                            </Typography>
                          </div>
                          <Switch
                            checked={values.sendAsPTT !== false}
                            onChange={(e) => setFieldValue("sendAsPTT", e.target.checked)}
                            style={{ color: "#F97316" }}
                          />
                        </div>
                      </>
                    )}
                  </div>

                  <div style={{ marginTop: 16 }}>
                    <Typography className={classes.label}>{t("promptModal.form.temperature")}</Typography>
                    <Field
                      as={TextField}
                      name="temperature"
                      variant="outlined"
                      size="small"
                      fullWidth
                      type="number"
                      inputProps={{ step: "0.1", min: "0", max: "2" }}
                      helperText={t("promptModal.advanced.temperatureHelp")}
                    />
                  </div>

                  <div className={classes.fieldRow} style={{ marginTop: 8 }}>
                    <div style={{ flex: 1 }}>
                      <Typography className={classes.label}>{t("promptModal.advanced.maxTokens")}</Typography>
                      <Field
                        as={TextField}
                        name="maxTokens"
                        variant="outlined"
                        size="small"
                        fullWidth
                        type="number"
                      />
                    </div>
                    <div style={{ flex: 1 }}>
                      <Typography className={classes.label}>{t("promptModal.advanced.maxMessages")}</Typography>
                      <Field
                        as={TextField}
                        name="maxMessages"
                        variant="outlined"
                        size="small"
                        fullWidth
                        type="number"
                      />
                      <Typography variant="caption" color="textSecondary" style={{ display: "block", marginTop: 4 }}>
                        {t("promptModal.advanced.maxMessagesHelp")}
                      </Typography>
                    </div>
                  </div>

                  {/* Campos Azure removidos - agora usa OpenAI TTS exclusivamente */}

                </div>
              )}

              {/* ===== TAB BASE DE CONHECIMENTO ===== */}
              {activeTab === 3 && (
                <div className={classes.sectionContent}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
                    <div>
                      <Typography style={{ fontWeight: 700, fontSize: 15 }}>{t("promptModal.knowledge.title")}</Typography>
                      <Typography variant="caption" color="textSecondary">
                        {t("promptModal.knowledge.subtitle")}
                      </Typography>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <input
                        type="file"
                        ref={fileInputRef}
                        style={{ display: "none" }}
                        accept=".pdf,.doc,.docx,.txt,.mp3,.wav,.mp4,.avi,.mov"
                        onChange={handleUploadFile}
                      />
                      <Button
                        size="small"
                        variant="outlined"
                        startIcon={uploadingFile ? <CircularProgress size={16} /> : <CloudUpload />}
                        onClick={() => fileInputRef.current?.click()}
                        disabled={!promptId || uploadingFile}
                        style={{ textTransform: "none", fontSize: 12 }}
                      >
                        {t("promptModal.knowledge.upload")}
                      </Button>
                      <Button
                        size="small"
                        variant="contained"
                        startIcon={<Add />}
                        onClick={() => setAddKnowledgeOpen(true)}
                        disabled={!promptId}
                        style={{ textTransform: "none", fontSize: 12, backgroundColor: "#F97316", color: "#fff" }}
                      >
                        {t("promptModal.knowledge.add")}
                      </Button>
                    </div>
                  </div>

                  {!promptId && (
                    <Paper variant="outlined" style={{ padding: 32, textAlign: "center" }}>
                      <Typography color="textSecondary">
                        {t("promptModal.knowledge.saveFirst")}
                      </Typography>
                    </Paper>
                  )}

                  {/* Formulário de adição inline */}
                  {addKnowledgeOpen && (
                    <Paper variant="outlined" style={{ padding: 16, marginBottom: 16 }}>
                      <Typography style={{ fontWeight: 600, fontSize: 14, marginBottom: 12 }}>{t("promptModal.knowledge.newItem")}</Typography>
                      <div style={{ display: "flex", gap: 8, marginBottom: 12 }}>
                        <TextField
                          label={t("promptModal.knowledge.nameLabel")}
                          variant="outlined"
                          size="small"
                          value={newKnowledge.name}
                          onChange={(e) => setNewKnowledge({ ...newKnowledge, name: e.target.value })}
                          style={{ flex: 1 }}
                        />
                        <Select
                          value={newKnowledge.type}
                          onChange={(e) => setNewKnowledge({ ...newKnowledge, type: e.target.value })}
                          variant="outlined"
                          style={{ minWidth: 120, height: 40 }}
                        >
                          <MenuItem value="text">{t("promptModal.knowledge.textType")}</MenuItem>
                          <MenuItem value="url">{t("promptModal.knowledge.urlType")}</MenuItem>
                        </Select>
                      </div>
                      <TextField
                        label={newKnowledge.type === "url" ? t("promptModal.knowledge.urlLabel") : t("promptModal.knowledge.textLabel")}
                        variant="outlined"
                        size="small"
                        fullWidth
                        multiline
                        rows={newKnowledge.type === "url" ? 1 : 6}
                        value={newKnowledge.content}
                        onChange={(e) => setNewKnowledge({ ...newKnowledge, content: e.target.value })}
                        placeholder={newKnowledge.type === "url" ? t("promptModal.knowledge.urlPlaceholder") : t("promptModal.knowledge.textPlaceholder")}
                        style={{ marginBottom: 12 }}
                      />
                      <div style={{ display: "flex", justifyContent: "flex-end", gap: 8 }}>
                        <Button size="small" onClick={() => { setAddKnowledgeOpen(false); setNewKnowledge({ name: "", type: "text", content: "" }); }}>
                          {t("promptModal.knowledge.cancelBtn")}
                        </Button>
                        <Button size="small" variant="contained" onClick={handleAddKnowledge}
                          style={{ backgroundColor: "#F97316", color: "#fff" }}
                        >
                          {t("promptModal.knowledge.saveBtn")}
                        </Button>
                      </div>
                    </Paper>
                  )}

                  {/* Lista de itens */}
                  {knowledgeLoading ? (
                    <div style={{ textAlign: "center", padding: 32 }}><CircularProgress size={32} /></div>
                  ) : knowledgeItems.length === 0 && promptId ? (
                    <Paper variant="outlined" style={{ padding: 32, textAlign: "center" }}>
                      <Typography variant="h6" style={{ fontSize: 40, marginBottom: 8 }}>📚</Typography>
                      <Typography color="textSecondary">
                        {t("promptModal.knowledge.empty")}
                      </Typography>
                      <Typography variant="caption" color="textSecondary">
                        {t("promptModal.knowledge.emptyHelp")}
                      </Typography>
                    </Paper>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                      {knowledgeItems.map((item) => (
                        <Paper key={item.id} variant="outlined" style={{
                          padding: "10px 14px",
                          display: "flex",
                          alignItems: "center",
                          gap: 12,
                          opacity: item.active ? 1 : 0.5
                        }}>
                          <span style={{ fontSize: 22 }}>{getTypeIcon(item.type)}</span>
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <Typography style={{ fontWeight: 600, fontSize: 13 }} noWrap>{item.name}</Typography>
                            <Typography variant="caption" color="textSecondary" noWrap>
                              {item.type.toUpperCase()} • {item.content ? `${item.content.substring(0, 60)}...` : item.originalName || t("promptModal.knowledge.noContent")}
                            </Typography>
                          </div>
                          <Switch
                            checked={item.active}
                            onChange={() => handleToggleKnowledge(item)}
                            size="small"
                            color="primary"
                          />
                          <IconButton size="small" onClick={() => handleOpenEditKnowledge(item)} style={{ color: "#3b82f6" }}>
                            <EditIcon fontSize="small" />
                          </IconButton>
                          <IconButton size="small" onClick={() => handleDeleteKnowledge(item.id)} style={{ color: "#ef4444" }}>
                            <Delete fontSize="small" />
                          </IconButton>
                        </Paper>
                      ))}
                    </div>
                  )}
                  {/* Dialog de edição */}
                  <Dialog open={!!editKnowledgeItem} onClose={() => setEditKnowledgeItem(null)} maxWidth="sm" fullWidth>
                    <DialogContent>
                      <Typography style={{ fontWeight: 700, fontSize: 16, marginBottom: 12 }}>
                        {t("promptModal.knowledge.newItem")}
                      </Typography>
                      <TextField
                        label={t("promptModal.knowledge.nameLabel")}
                        variant="outlined"
                        size="small"
                        fullWidth
                        value={editKnowledgeData.name}
                        onChange={(e) => setEditKnowledgeData({ ...editKnowledgeData, name: e.target.value })}
                        style={{ marginBottom: 12 }}
                      />
                      <TextField
                        label={editKnowledgeItem?.type === "url" ? t("promptModal.knowledge.urlLabel") : t("promptModal.knowledge.textLabel")}
                        variant="outlined"
                        size="small"
                        fullWidth
                        multiline
                        rows={8}
                        value={editKnowledgeData.content}
                        onChange={(e) => setEditKnowledgeData({ ...editKnowledgeData, content: e.target.value })}
                      />
                    </DialogContent>
                    <DialogActions>
                      <Button onClick={() => setEditKnowledgeItem(null)}>
                        {t("promptModal.knowledge.cancelBtn")}
                      </Button>
                      <Button variant="contained" onClick={handleSaveEditKnowledge}
                        style={{ backgroundColor: "#F97316", color: "#fff" }}
                      >
                        {t("promptModal.knowledge.saveBtn")}
                      </Button>
                    </DialogActions>
                  </Dialog>
                </div>
              )}

              {/* ===== TAB FERRAMENTAS ===== */}
              {activeTab === 4 && (
                <div className={classes.sectionContent}>
                  <div
                    style={{
                      background: "linear-gradient(180deg, #EFF6FF 0%, #DBEAFE 100%)",
                      border: "1px solid #BFDBFE",
                      borderRadius: 10,
                      padding: 16,
                      marginBottom: 16,
                    }}
                  >
                    <Typography style={{ fontWeight: 700, color: "#1D4ED8", fontSize: 15 }}>
                      ⚡ {t("promptModal.tools.title")}
                    </Typography>
                    <Typography style={{ color: "#1E40AF", fontSize: 13, marginTop: 4 }}>
                      {t("promptModal.tools.subtitle")}
                    </Typography>
                  </div>
                  {/* ===== TURNO / HORÁRIO DE ATENDIMENTO ===== */}
                  <div style={{ marginTop: 24, padding: 16, border: "1px solid #e5e7eb", borderRadius: 10, background: "#fafafa" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                      <div>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          <Typography style={{ fontWeight: 700, fontSize: 15 }}>{i18n.t("promptModal.tools.workingHours.title")}</Typography>
                          <Tooltip
                            arrow
                            placement="right"
                            title={
                              <div style={{ fontSize: 12, lineHeight: 1.5, padding: 4, maxWidth: 320 }}>
                                <div style={{ fontWeight: 700, marginBottom: 6 }}>{i18n.t("promptModal.tools.workingHours.tooltipTitle")}</div>
                                <div style={{ marginBottom: 6 }} dangerouslySetInnerHTML={{ __html: i18n.t("promptModal.tools.workingHours.tooltipInside") }} />
                                <div style={{ marginBottom: 6 }} dangerouslySetInnerHTML={{ __html: i18n.t("promptModal.tools.workingHours.tooltipOutside") }} />
                                <div style={{ marginBottom: 6 }}>{i18n.t("promptModal.tools.workingHours.tooltipLanguage")}</div>
                                <div dangerouslySetInnerHTML={{ __html: i18n.t("promptModal.tools.workingHours.tooltipMultiple") }} />
                              </div>
                            }
                          >
                            <HelpOutline style={{ fontSize: 16, color: "#6B7280", cursor: "help" }} />
                          </Tooltip>
                        </div>
                        <Typography variant="caption" color="textSecondary">
                          {i18n.t("promptModal.tools.workingHours.subtitle")}
                        </Typography>
                      </div>
                      <Switch
                        checked={!!values.workingHoursEnabled}
                        onChange={(e) => setFieldValue("workingHoursEnabled", e.target.checked)}
                        color="primary"
                      />
                    </div>

                    {values.workingHoursEnabled && (
                      <>
                        <div className={classes.fieldRow} style={{ marginTop: 8 }}>
                          <div style={{ flex: 1 }}>
                            <Typography className={classes.label}>{i18n.t("promptModal.tools.workingHours.timezone")}</Typography>
                            <FormControl variant="outlined" size="small" fullWidth>
                              <Select
                                value={values.workingHoursTimezone || "America/Sao_Paulo"}
                                onChange={(e) => setFieldValue("workingHoursTimezone", e.target.value)}
                              >
                                <MenuItem value="America/Sao_Paulo">Brasília / São Paulo (GMT-3)</MenuItem>
                                <MenuItem value="America/Manaus">Manaus / Cuiabá (GMT-4)</MenuItem>
                                <MenuItem value="America/Rio_Branco">Acre / Rio Branco (GMT-5)</MenuItem>
                                <MenuItem value="America/Noronha">Fernando de Noronha (GMT-2)</MenuItem>
                                <MenuItem value="America/Belem">Belém (GMT-3)</MenuItem>
                                <MenuItem value="America/Fortaleza">Fortaleza (GMT-3)</MenuItem>
                                <MenuItem value="America/Recife">Recife (GMT-3)</MenuItem>
                                <MenuItem value="America/Bahia">Salvador (GMT-3)</MenuItem>
                                <MenuItem value="America/Campo_Grande">Campo Grande (GMT-4)</MenuItem>
                                <MenuItem value="America/Porto_Velho">Porto Velho (GMT-4)</MenuItem>
                                <MenuItem value="America/Boa_Vista">Boa Vista (GMT-4)</MenuItem>
                                <MenuItem value="America/Buenos_Aires">Buenos Aires (GMT-3)</MenuItem>
                                <MenuItem value="America/Santiago">Santiago (GMT-4)</MenuItem>
                                <MenuItem value="America/Asuncion">Assunção (GMT-4)</MenuItem>
                                <MenuItem value="America/Montevideo">Montevidéu (GMT-3)</MenuItem>
                                <MenuItem value="America/La_Paz">La Paz (GMT-4)</MenuItem>
                                <MenuItem value="America/Lima">Lima (GMT-5)</MenuItem>
                                <MenuItem value="America/Bogota">Bogotá (GMT-5)</MenuItem>
                                <MenuItem value="America/Caracas">Caracas (GMT-4)</MenuItem>
                                <MenuItem value="America/Mexico_City">Cidade do México (GMT-6)</MenuItem>
                                <MenuItem value="America/New_York">Nova York (GMT-5)</MenuItem>
                                <MenuItem value="America/Chicago">Chicago (GMT-6)</MenuItem>
                                <MenuItem value="America/Denver">Denver (GMT-7)</MenuItem>
                                <MenuItem value="America/Los_Angeles">Los Angeles (GMT-8)</MenuItem>
                                <MenuItem value="UTC">UTC (GMT+0)</MenuItem>
                                <MenuItem value="Europe/Lisbon">Lisboa (GMT+0)</MenuItem>
                                <MenuItem value="Europe/Madrid">Madri (GMT+1)</MenuItem>
                                <MenuItem value="Europe/London">Londres (GMT+0)</MenuItem>
                                <MenuItem value="Europe/Paris">Paris (GMT+1)</MenuItem>
                                <MenuItem value="Europe/Berlin">Berlim (GMT+1)</MenuItem>
                                <MenuItem value="Europe/Rome">Roma (GMT+1)</MenuItem>
                                <MenuItem value="Africa/Luanda">Luanda (GMT+1)</MenuItem>
                                <MenuItem value="Africa/Maputo">Maputo (GMT+2)</MenuItem>
                                <MenuItem value="Asia/Tokyo">Tóquio (GMT+9)</MenuItem>
                                <MenuItem value="Asia/Shanghai">Xangai (GMT+8)</MenuItem>
                                <MenuItem value="Asia/Dubai">Dubai (GMT+4)</MenuItem>
                                <MenuItem value="Australia/Sydney">Sydney (GMT+10)</MenuItem>
                              </Select>
                            </FormControl>
                          </div>
                        </div>

                        <div style={{ marginTop: 8 }}>
                          <Typography className={classes.label}>{i18n.t("promptModal.tools.workingHours.outOfMessage")}</Typography>
                          <TextField
                            variant="outlined"
                            size="small"
                            fullWidth
                            multiline
                            minRows={2}
                            value={values.workingHoursOutOfMessage || ""}
                            onChange={(e) => setFieldValue("workingHoursOutOfMessage", e.target.value)}
                          />
                        </div>

                        <div style={{ marginTop: 12 }}>
                          {[
                            { k: "mon", label: i18n.t("promptModal.tools.workingHours.days.mon") },
                            { k: "tue", label: i18n.t("promptModal.tools.workingHours.days.tue") },
                            { k: "wed", label: i18n.t("promptModal.tools.workingHours.days.wed") },
                            { k: "thu", label: i18n.t("promptModal.tools.workingHours.days.thu") },
                            { k: "fri", label: i18n.t("promptModal.tools.workingHours.days.fri") },
                            { k: "sat", label: i18n.t("promptModal.tools.workingHours.days.sat") },
                            { k: "sun", label: i18n.t("promptModal.tools.workingHours.days.sun") },
                          ].map((d) => {
                            const intervals = (values.workingHoursSchedule && values.workingHoursSchedule[d.k]) || [];
                            const updateIntervals = (next) => {
                              setFieldValue("workingHoursSchedule", {
                                ...(values.workingHoursSchedule || {}),
                                [d.k]: next,
                              });
                            };
                            return (
                              <div key={d.k} style={{ display: "flex", alignItems: "flex-start", gap: 12, padding: "8px 0", borderTop: "1px solid #eee" }}>
                                <div style={{ width: 90, fontWeight: 600, paddingTop: 8 }}>{d.label}</div>
                                <div style={{ flex: 1 }}>
                                  {intervals.length === 0 && (
                                    <Typography variant="caption" color="textSecondary" style={{ display: "block", padding: "8px 0" }}>
                                      {i18n.t("promptModal.tools.workingHours.closed")}
                                    </Typography>
                                  )}
                                  {intervals.map((itv, idx) => (
                                    <div key={idx} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                                      <TextField
                                        type="time"
                                        size="small"
                                        variant="outlined"
                                        value={itv.start || ""}
                                        onChange={(e) => {
                                          const next = intervals.map((x, i) => i === idx ? { ...x, start: e.target.value } : x);
                                          updateIntervals(next);
                                        }}
                                        inputProps={{ step: 300 }}
                                      />
                                      <span>{i18n.t("promptModal.tools.workingHours.to")}</span>
                                      <TextField
                                        type="time"
                                        size="small"
                                        variant="outlined"
                                        value={itv.end || ""}
                                        onChange={(e) => {
                                          const next = intervals.map((x, i) => i === idx ? { ...x, end: e.target.value } : x);
                                          updateIntervals(next);
                                        }}
                                        inputProps={{ step: 300 }}
                                      />
                                      <IconButton size="small" onClick={() => updateIntervals(intervals.filter((_, i) => i !== idx))} style={{ color: "#ef4444" }}>
                                        <Delete fontSize="small" />
                                      </IconButton>
                                    </div>
                                  ))}
                                  <Button
                                    size="small"
                                    onClick={() => updateIntervals([...intervals, { start: "08:00", end: "12:00" }])}
                                    style={{ textTransform: "none", fontSize: 12, color: "#2563EB" }}
                                  >
                                    {i18n.t("promptModal.tools.workingHours.addInterval")}
                                  </Button>
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}
                  </div>

                  {/* Inatividade — Acordar cliente */}
                  <div
                    style={{
                      border: "1px solid #E5E7EB",
                      borderRadius: 10,
                      padding: 16,
                      background: "#fff",
                      marginBottom: 14,
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                      <div style={{ width: 40, height: 40, borderRadius: 8, background: "#F3F4F6", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 20 }}>⏰</div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Typography style={{ fontWeight: 700, fontSize: 14, color: "#111827" }}>
                          {i18n.t("prompts.inactivity.title", "Mensagem de Inatividade")}
                        </Typography>
                        <Typography style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>
                          {i18n.t("prompts.inactivity.description", "Acorda o cliente automaticamente se ele demorar para responder.")}
                        </Typography>
                      </div>
                      <Switch
                        checked={!!values.inactivityEnabled}
                        onChange={(e) => setFieldValue("inactivityEnabled", e.target.checked)}
                        color="primary"
                      />
                    </div>

                    {values.inactivityEnabled && (
                      <div style={{ marginTop: 14, paddingTop: 14, borderTop: "1px dashed #E5E7EB" }}>
                        {(() => {
                          const t = Math.max(1, Number(values.inactivityTimeout) || 1);
                          const n = Math.max(1, Number(values.inactivityMaxReminders) || 1);
                          const total = t * n;
                          const fmt = (m) => {
                            if (m < 60) return `${m} min`;
                            const h = Math.floor(m / 60);
                            const r = m % 60;
                            return r ? `${h}h${r}min` : `${h}h`;
                          };
                          return (
                            <div
                              style={{
                                background: "#EFF6FF",
                                border: "1px solid #BFDBFE",
                                color: "#1E3A8A",
                                borderRadius: 8,
                                padding: "10px 12px",
                                marginBottom: 12,
                                fontSize: 13,
                                lineHeight: 1.5,
                              }}
                            >
                              <strong>{i18n.t("prompts.inactivity.banner.howItWorks", "Como vai funcionar:")}</strong>{" "}
                              {i18n.t("prompts.inactivity.banner.intro", "se o cliente ficar")}{" "}
                              <strong>{fmt(t)}</strong> {i18n.t("prompts.inactivity.banner.withoutReply", "sem responder, será enviado")}{" "}
                              <strong>{n === 1
                                ? i18n.t("prompts.inactivity.banner.oneReminder", "1 lembrete")
                                : i18n.t("prompts.inactivity.banner.nReminders", "{{n}} lembretes", { n })}</strong>
                              {n > 1 ? (
                                <>
                                  {" "}{i18n.t("prompts.inactivity.banner.withInterval", "com intervalo de")} <strong>{fmt(t)}</strong> {i18n.t("prompts.inactivity.banner.betweenEach", "entre cada um")}
                                  {" "}({i18n.t("prompts.inactivity.banner.maxWait", "no máximo")} <strong>{fmt(total)}</strong> {i18n.t("prompts.inactivity.banner.totalWait", "de espera total")}).
                                </>
                              ) : (
                                <> {i18n.t("prompts.inactivity.banner.singleTail", "com a mensagem abaixo. Depois disso o sistema para de insistir.")}</>
                              )}
                              <div style={{ marginTop: 6, fontSize: 12, opacity: 0.85 }}>
                                {i18n.t("prompts.inactivity.banner.example", "Exemplo: cliente parou de responder às 10:00")} →
                                {" "}{i18n.t("prompts.inactivity.banner.firstReminderAt", "1º lembrete às")} {`${String(10 + Math.floor(t/60)).padStart(2,"0")}:${String(t%60).padStart(2,"0")}`}
                                {n > 1 && `, ${i18n.t("prompts.inactivity.banner.lastAt", "último às")} ${String(10 + Math.floor(total/60)).padStart(2,"0")}:${String(total%60).padStart(2,"0")}`}.
                              </div>
                            </div>
                          );
                        })()}
                        <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                          <div style={{ flex: 1, minWidth: 160 }}>
                            <Typography className={classes.label}>{i18n.t("prompts.inactivity.timeoutLabel", "Tempo de inatividade (minutos)")}</Typography>
                            <TextField
                              type="number"
                              variant="outlined"
                              size="small"
                              fullWidth
                              value={values.inactivityTimeout ?? 10}
                              onChange={(e) => setFieldValue("inactivityTimeout", Math.max(1, Number(e.target.value) || 1))}
                              inputProps={{ min: 1, max: 1440 }}
                            />
                          </div>
                          <div style={{ flex: 1, minWidth: 160 }}>
                            <Typography className={classes.label}>{i18n.t("prompts.inactivity.maxRemindersLabel", "Máx. de lembretes")}</Typography>
                            <TextField
                              type="number"
                              variant="outlined"
                              size="small"
                              fullWidth
                              value={values.inactivityMaxReminders ?? 1}
                              onChange={(e) => setFieldValue("inactivityMaxReminders", Math.max(1, Number(e.target.value) || 1))}
                              inputProps={{ min: 1, max: 10 }}
                            />
                          </div>
                        </div>
                        <div style={{ marginTop: 12 }}>
                          <Typography className={classes.label}>{i18n.t("prompts.inactivity.messageLabel", "Mensagem para acordar o cliente")}</Typography>
                          <TextField
                            variant="outlined"
                            size="small"
                            fullWidth
                            multiline
                            minRows={2}
                            value={values.inactivityMessage || ""}
                            onChange={(e) => setFieldValue("inactivityMessage", e.target.value)}
                            placeholder={i18n.t("prompts.inactivity.messagePlaceholder", "Ex.: Olá! Ainda está por aí? 😊")}
                          />
                          <Typography variant="caption" color="textSecondary" style={{ display: "block", marginTop: 4 }}>
                            {i18n.t("prompts.inactivity.helper", "Enviada se o cliente não responder após a última mensagem do agente.")}
                          </Typography>
                        </div>

                        {/* CADÊNCIA: mensagens diferentes em tempos diferentes.
                            Quando há etapas, elas substituem os campos acima —
                            por isso o aviso. Cada tempo conta a partir do envio
                            anterior, não desde o início da conversa. */}
                        <div style={{ marginTop: 16, paddingTop: 14, borderTop: "1px dashed #E5E7EB" }}>
                          <Typography className={classes.label}>
                            {i18n.t("prompts.inactivity.stepsTitle", "Mensagens diferentes por tempo (opcional)")}
                          </Typography>
                          <Typography variant="caption" color="textSecondary" style={{ display: "block", marginBottom: 10 }}>
                            {(values.inactivitySteps || []).length > 0
                              ? i18n.t("prompts.inactivity.stepsActive", "As etapas abaixo estão valendo e substituem o tempo e a mensagem acima. Cada tempo conta a partir do envio anterior.")
                              : i18n.t("prompts.inactivity.stepsHelp", "Deixe vazio para usar o tempo e a mensagem acima. Adicione etapas para enviar textos diferentes em tempos diferentes.")}
                          </Typography>

                          {(values.inactivitySteps || []).map((etapa, indice) => (
                            <div
                              key={indice}
                              style={{ display: "flex", gap: 8, alignItems: "flex-start", marginBottom: 8 }}
                            >
                              <TextField
                                type="number"
                                variant="outlined"
                                size="small"
                                label={i18n.t("prompts.inactivity.stepMinutes", "Minutos")}
                                value={etapa?.minutes ?? ""}
                                onChange={(e) => {
                                  const v = Math.max(1, Number(e.target.value) || 1);
                                  const lista = [...(values.inactivitySteps || [])];
                                  lista[indice] = { ...lista[indice], minutes: v };
                                  setFieldValue("inactivitySteps", lista);
                                }}
                                inputProps={{ min: 1, max: 10080 }}
                                style={{ width: 120, flexShrink: 0 }}
                              />
                              <TextField
                                variant="outlined"
                                size="small"
                                fullWidth
                                multiline
                                label={`${indice + 1}º ${i18n.t("prompts.inactivity.stepMessage", "lembrete")}`}
                                value={etapa?.message || ""}
                                onChange={(e) => {
                                  const v = e.target.value;
                                  const lista = [...(values.inactivitySteps || [])];
                                  lista[indice] = { ...lista[indice], message: v };
                                  setFieldValue("inactivitySteps", lista);
                                }}
                                placeholder={i18n.t("prompts.inactivity.messagePlaceholder", "Ex.: Olá! Ainda está por aí? 😊")}
                              />
                              <Button
                                size="small"
                                onClick={() =>
                                  setFieldValue(
                                    "inactivitySteps",
                                    (values.inactivitySteps || []).filter((_, i) => i !== indice)
                                  )
                                }
                                style={{ color: "#ef4444", minWidth: 0, marginTop: 4 }}
                              >
                                {i18n.t("prompts.inactivity.stepRemove", "Remover")}
                              </Button>
                            </div>
                          ))}

                          <Button
                            size="small"
                            variant="outlined"
                            onClick={() =>
                              setFieldValue("inactivitySteps", [
                                ...(values.inactivitySteps || []),
                                { minutes: 60, message: "" }
                              ])
                            }
                            style={{ textTransform: "none" }}
                          >
                            {i18n.t("prompts.inactivity.stepAdd", "+ Adicionar etapa")}
                          </Button>
                        </div>
                      </div>
                    )}
                  </div>

                  {[
                    {
                      field: "toolNotifyHuman",
                      icon: "🔔",
                      titleKey: "promptModal.tools.notifyHuman.title",
                      descKey: "promptModal.tools.notifyHuman.desc",
                    },
                    {
                      field: "toolHttpRequest",
                      icon: "🛰️",
                      titleKey: "promptModal.tools.httpRequest.title",
                      descKey: "promptModal.tools.httpRequest.desc",
                    },
                  ].map((tool) => (
                    <React.Fragment key={tool.field}>
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 14,
                        padding: "14px 16px",
                        border: "1px solid #E5E7EB",
                        borderRadius: 10,
                        marginBottom: 10,
                        background: "#fff",
                      }}
                    >
                      <div
                        style={{
                          width: 40,
                          height: 40,
                          borderRadius: 8,
                          background: "#F3F4F6",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          fontSize: 20,
                          flexShrink: 0,
                        }}
                      >
                        {tool.icon}
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <Typography style={{ fontWeight: 700, fontSize: 14, color: "#111827" }}>
                          {t(tool.titleKey)}
                        </Typography>
                        <Typography style={{ fontSize: 12, color: "#6B7280", marginTop: 2 }}>
                          {t(tool.descKey)}
                        </Typography>
                      </div>
                      <Switch
                        checked={!!values[tool.field]}
                        onChange={(e) => setFieldValue(tool.field, e.target.checked)}
                        color="primary"
                      />
                    </div>
                    {tool.field === "toolNotifyHuman" && values.toolNotifyHuman && (
                      <div
                        style={{
                          margin: "-6px 0 14px 54px",
                          padding: "12px 14px",
                          background: "#FEF3C7",
                          border: "1px solid #FDE68A",
                          borderRadius: 8,
                        }}
                      >
                        <Typography style={{ fontSize: 12, fontWeight: 600, color: "#92400E", marginBottom: 6 }}>
                          {i18n.t("promptModal.tools.notifyHuman.config.numbersTitle")}
                        </Typography>
                        {(values.toolNotifyHumanNumbers || [""]).map((num, idx) => (
                          <div key={idx} style={{ display: "flex", gap: 6, marginBottom: 6 }}>
                            <input
                              type="tel"
                              placeholder={i18n.t("promptModal.tools.notifyHuman.config.phonePlaceholder")}
                              value={formatWhatsAppMask(num || "")}
                              onChange={(e) => {
                                const digits = e.target.value.replace(/\D/g, "").slice(0, 15);
                                const list = [...(values.toolNotifyHumanNumbers || [""])];
                                list[idx] = digits;
                                setFieldValue("toolNotifyHumanNumbers", list);
                              }}
                              maxLength={20}
                              style={{
                                flex: 1,
                                padding: "8px 10px",
                                border: "1px solid #D1D5DB",
                                borderRadius: 6,
                                fontSize: 14,
                                outline: "none",
                                background: "#fff",
                              }}
                            />
                            {(values.toolNotifyHumanNumbers || []).length > 1 && (
                              <button
                                type="button"
                                title={i18n.t("promptModal.tools.notifyHuman.config.removePhone")}
                                onClick={() => {
                                  const list = [...(values.toolNotifyHumanNumbers || [])];
                                  list.splice(idx, 1);
                                  setFieldValue("toolNotifyHumanNumbers", list.length ? list : [""]);
                                }}
                                style={{
                                  width: 36,
                                  border: "1px solid #FCA5A5",
                                  background: "#FEE2E2",
                                  color: "#B91C1C",
                                  borderRadius: 6,
                                  fontSize: 16,
                                  cursor: "pointer",
                                }}
                              >
                                ×
                              </button>
                            )}
                          </div>
                        ))}
                        <button
                          type="button"
                          onClick={() => {
                            const list = [...(values.toolNotifyHumanNumbers || [""])];
                            if (list.length >= 10) return;
                            list.push("");
                            setFieldValue("toolNotifyHumanNumbers", list);
                          }}
                          style={{
                            marginTop: 4,
                            padding: "6px 12px",
                            border: "1px dashed #92400E",
                            background: "transparent",
                            color: "#92400E",
                            borderRadius: 6,
                            fontSize: 13,
                            fontWeight: 600,
                            cursor: "pointer",
                          }}
                        >
                          {i18n.t("promptModal.tools.notifyHuman.config.addNumber")}
                        </button>
                        <Typography style={{ fontSize: 11, color: "#92400E", marginTop: 8 }}>
                          <span dangerouslySetInnerHTML={{ __html: i18n.t("promptModal.tools.notifyHuman.config.hint") }} />
                        </Typography>
                      </div>
                    )}
                    {tool.field === "toolOpenTicket" && values.toolOpenTicket && (
                      <div style={{ margin: "-6px 0 14px 54px", padding: "12px 14px", background: "#EFF6FF", border: "1px solid #BFDBFE", borderRadius: 8 }}>
                        <Typography style={{ fontSize: 12, fontWeight: 600, color: "#1E40AF", marginBottom: 6 }}>
                          {i18n.t("promptModal.tools.openTicket.config.title")}
                        </Typography>
                        <Typography style={{ fontSize: 11, color: "#1E3A8A", marginBottom: 4 }}>{i18n.t("promptModal.tools.openTicket.config.beforeLabel")}</Typography>
                        <textarea
                          rows={2}
                          placeholder={i18n.t("promptModal.tools.openTicket.config.beforePlaceholder")}
                          value={values.toolOpenTicketMessage || ""}
                          onChange={(e) => setFieldValue("toolOpenTicketMessage", e.target.value)}
                          style={{ width: "100%", padding: "8px 10px", border: "1px solid #BFDBFE", borderRadius: 6, fontSize: 13, outline: "none", background: "#fff", resize: "vertical" }}
                        />
                        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginTop: 10 }}>
                          <div>
                            <Typography style={{ fontSize: 11, color: "#1E3A8A", marginBottom: 4 }}>{i18n.t("promptModal.tools.openTicket.config.queueLabel")}</Typography>
                            <select
                              value={values.toolOpenTicketQueueId || ""}
                              onChange={(e) => { setFieldValue("toolOpenTicketQueueId", e.target.value); setFieldValue("toolOpenTicketUserId", ""); }}
                              style={{ width: "100%", padding: "8px 10px", border: "1px solid #BFDBFE", borderRadius: 6, fontSize: 13, background: "#fff", outline: "none" }}
                            >
                              <option value="">{i18n.t("promptModal.tools.openTicket.config.queueNone")}</option>
                              {openTicketQueues.map((q) => (
                                <option key={q.id} value={q.id}>{q.name}</option>
                              ))}
                            </select>
                          </div>
                          <div>
                            <Typography style={{ fontSize: 11, color: "#1E3A8A", marginBottom: 4 }}>{i18n.t("promptModal.tools.openTicket.config.userLabel")}</Typography>
                            <select
                              value={values.toolOpenTicketUserId || ""}
                              onChange={(e) => setFieldValue("toolOpenTicketUserId", e.target.value)}
                              style={{ width: "100%", padding: "8px 10px", border: "1px solid #BFDBFE", borderRadius: 6, fontSize: 13, background: "#fff", outline: "none" }}
                            >
                              <option value="">{i18n.t("promptModal.tools.openTicket.config.userAny")}</option>
                              {openTicketUsers
                                .filter((u) => {
                                  if (!values.toolOpenTicketQueueId) return true;
                                  const qid = Number(values.toolOpenTicketQueueId);
                                  const userQueues = u.queues || u.Queues || [];
                                  return userQueues.some((uq) => Number(uq.id) === qid);
                                })
                                .map((u) => (
                                  <option key={u.id} value={u.id}>{u.name}</option>
                                ))}
                            </select>
                          </div>
                        </div>
                        <Typography style={{ fontSize: 11, color: "#1E40AF", marginTop: 6 }}>
                          {i18n.t("promptModal.tools.openTicket.config.hint")}
                        </Typography>
                        <label style={{ display: "flex", alignItems: "center", gap: 8, marginTop: 8, fontSize: 12, color: "#1E3A8A", cursor: "pointer" }}>
                          <input
                            type="checkbox"
                            checked={values.toolOpenTicketPauseAi !== false}
                            onChange={(e) => setFieldValue("toolOpenTicketPauseAi", e.target.checked)}
                          />
                          {i18n.t("promptModal.tools.openTicket.config.pauseAi")}
                        </label>
                      </div>
                    )}
                    {tool.field === "toolHttpRequest" && values.toolHttpRequest && (
                      <div style={{ margin: "-6px 0 14px 54px", padding: "12px 14px", background: "#F5F3FF", border: "1px solid #DDD6FE", borderRadius: 8 }}>
                        <Typography style={{ fontSize: 12, fontWeight: 600, color: "#5B21B6", marginBottom: 6 }}>
                          {i18n.t("promptModal.tools.httpRequest.config.title")}
                        </Typography>
                        <Typography style={{ fontSize: 11, color: "#5B21B6", marginBottom: 4 }}>{i18n.t("promptModal.tools.httpRequest.config.domainsLabel")}</Typography>
                        <textarea
                          rows={3}
                          placeholder={"api.exemplo.com\nviacep.com.br"}
                          value={values.toolHttpAllowedDomains || ""}
                          onChange={(e) => setFieldValue("toolHttpAllowedDomains", e.target.value)}
                          style={{ width: "100%", padding: "8px 10px", border: "1px solid #DDD6FE", borderRadius: 6, fontSize: 13, outline: "none", background: "#fff", resize: "vertical", fontFamily: "monospace" }}
                        />
                        <Typography style={{ fontSize: 11, color: "#5B21B6", margin: "10px 0 4px" }}>{i18n.t("promptModal.tools.httpRequest.config.headersLabel")}</Typography>
                        <textarea
                          rows={3}
                          placeholder={'{\n  "Authorization": "Bearer SEU_TOKEN"\n}'}
                          value={values.toolHttpDefaultHeaders || ""}
                          onChange={(e) => setFieldValue("toolHttpDefaultHeaders", e.target.value)}
                          style={{ width: "100%", padding: "8px 10px", border: "1px solid #DDD6FE", borderRadius: 6, fontSize: 13, outline: "none", background: "#fff", resize: "vertical", fontFamily: "monospace" }}
                        />
                      </div>
                    )}
                    {tool.field === "toolTags" && values.toolTags && (
                      <div style={{ margin: "-6px 0 14px 54px", padding: "12px 14px", background: "#ECFDF5", border: "1px solid #A7F3D0", borderRadius: 8 }}>
                        <Typography style={{ fontSize: 12, fontWeight: 600, color: "#065F46", marginBottom: 6 }}>
                          {i18n.t("promptModal.tools.tags.config.title")}
                        </Typography>
                        <Typography style={{ fontSize: 11, color: "#065F46", marginBottom: 8 }}>
                          {i18n.t("promptModal.tools.tags.config.hint")}
                        </Typography>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {availableTags.length === 0 && (
                            <Typography style={{ fontSize: 12, color: "#6B7280" }}>{i18n.t("promptModal.tools.tags.config.empty")}</Typography>
                          )}
                          {availableTags.map((tag) => {
                            const selected = (values.toolTagsAllowed || []).map(Number).includes(Number(tag.id));
                            return (
                              <Chip
                                key={tag.id}
                                label={tag.name}
                                clickable
                                size="small"
                                onClick={() => {
                                  const list = (values.toolTagsAllowed || []).map(Number);
                                  const next = selected ? list.filter((x) => x !== Number(tag.id)) : [...list, Number(tag.id)];
                                  setFieldValue("toolTagsAllowed", next);
                                }}
                                style={{
                                  background: selected ? (tag.color || "#10B981") : "#fff",
                                  color: selected ? "#fff" : "#065F46",
                                  border: `1px solid ${tag.color || "#A7F3D0"}`,
                                  fontWeight: selected ? 700 : 500,
                                }}
                              />
                            );
                          })}
                        </div>
                      </div>
                    )}
                    {tool.field === "toolKanban" && values.toolKanban && (
                      <div style={{ margin: "-6px 0 14px 54px", padding: "12px 14px", background: "#FFF7ED", border: "1px solid #FED7AA", borderRadius: 8 }}>
                        <Typography style={{ fontSize: 12, fontWeight: 600, color: "#9A3412", marginBottom: 6 }}>
                          {i18n.t("promptModal.tools.kanban.config.title")}
                        </Typography>
                        <Typography style={{ fontSize: 11, color: "#9A3412", marginBottom: 8 }}>
                          {i18n.t("promptModal.tools.kanban.config.hint")}
                        </Typography>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {availableKanbanTags.length === 0 && (
                            <Typography style={{ fontSize: 12, color: "#6B7280" }}>
                              <span dangerouslySetInnerHTML={{ __html: i18n.t("promptModal.tools.kanban.config.empty") }} />
                            </Typography>
                          )}
                          {availableKanbanTags.map((tag) => {
                            const selected = (values.toolKanbanAllowed || []).map(Number).includes(Number(tag.id));
                            return (
                              <Chip
                                key={tag.id}
                                label={tag.name}
                                clickable
                                size="small"
                                onClick={() => {
                                  const list = (values.toolKanbanAllowed || []).map(Number);
                                  const next = selected ? list.filter((x) => x !== Number(tag.id)) : [...list, Number(tag.id)];
                                  setFieldValue("toolKanbanAllowed", next);
                                }}
                                style={{
                                  background: selected ? (tag.color || "#F97316") : "#fff",
                                  color: selected ? "#fff" : "#9A3412",
                                  border: `1px solid ${tag.color || "#FED7AA"}`,
                                  fontWeight: selected ? 700 : 500,
                                }}
                              />
                            );
                          })}
                        </div>
                      </div>
                    )}
                    </React.Fragment>
                  ))}
                </div>
              )}

              {/* ===== TAB TESTAR ===== */}
              {activeTab === 5 && (
                <div style={{ padding: 0 }}>
                  <div className={classes.testChatContainer} style={{ margin: 16, height: 420 }}>
                    <div className={classes.modelSelect}>
                      <FormControl variant="outlined" size="small" style={{ minWidth: 180 }}>
                        <InputLabel>{t("promptModal.test.model")}</InputLabel>
                        <Select
                          value={testModel}
                          onChange={(e) => setTestModel(e.target.value)}
                          label={t("promptModal.test.model")}
                        >
                          {AI_MODELS.map((m) => (
                            <MenuItem key={m.value} value={m.value}>{m.label}</MenuItem>
                          ))}
                        </Select>
                      </FormControl>
                      <Typography variant="caption" color="textSecondary">
                        {t("promptModal.test.usingApiKey")}
                      </Typography>
                      <Button size="small" onClick={() => setTestMessages([])} style={{ marginLeft: "auto" }}>
                        {t("promptModal.test.clear")}
                      </Button>
                    </div>

                    <div className={classes.messagesArea}>
                      {testMessages.length === 0 && (
                        <Typography variant="body2" color="textSecondary" align="center" style={{ marginTop: 100 }}>
                          {t("promptModal.test.emptyChat")}
                        </Typography>
                      )}
                      {testMessages.map((msg, idx) => (
                        <div key={idx} style={{ display: "flex" }}>
                          <Paper
                            className={`${classes.messageBubble} ${
                              msg.role === "user" ? classes.userMessage : classes.aiMessage
                            }`}
                            elevation={0}
                          >
                            {msg.content}
                          </Paper>
                        </div>
                      ))}
                      {testLoading && (
                        <div style={{ display: "flex" }}>
                          <Paper className={`${classes.messageBubble} ${classes.aiMessage}`} elevation={0}>
                            <div className={classes.typingIndicator}>
                              <span /><span /><span />
                            </div>
                          </Paper>
                        </div>
                      )}
                      <div ref={messagesEndRef} />
                    </div>

                    <div className={classes.inputArea}>
                      <TextField
                        variant="outlined"
                        size="small"
                        fullWidth
                        placeholder={t("promptModal.test.placeholder")}
                        value={testInput}
                        onChange={(e) => setTestInput(e.target.value)}
                        onKeyPress={(e) => handleTestKeyPress(e, values)}
                        disabled={testLoading}
                      />
                      <IconButton
                        onClick={() => handleSendTestMessage(values)}
                        disabled={testLoading || !testInput.trim()}
                        style={{ color: "#F97316" }}
                      >
                        {testLoading ? <CircularProgress size={24} /> : <SendIcon />}
                      </IconButton>
                    </div>
                  </div>
                </div>
              )}

              <DialogActions className={classes.actions}>
                <Button onClick={handleClose} className={classes.cancelBtn} variant="outlined">
                  {t("promptModal.buttons.cancel")}
                </Button>
                {activeTab !== 5 && (
                  <Button
                    type="submit"
                    className={classes.saveBtn}
                    disabled={isSubmitting}
                  >
                    {t("promptModal.buttons.okEdit")}
                    {isSubmitting && <CircularProgress size={24} className={classes.buttonProgress} />}
                  </Button>
                )}
              </DialogActions>
            </Form>
          )}
        </Formik>
      </Dialog>
    </div>
  );
};

export default PromptModal;
