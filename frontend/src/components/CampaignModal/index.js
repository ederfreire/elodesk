import React, { useState, useEffect, useLayoutEffect, useRef, useContext, useMemo, useCallback } from "react";
import * as Yup from "yup";
import { Formik, Form, Field, useFormikContext } from "formik";

// Auto-save dos campos de mensagem em localStorage para não perder rascunhos
// ao trocar de etapa, fechar acidentalmente o modal ou recarregar a página.
const MESSAGE_DRAFT_KEYS = [
  "message1","message2","message3","message4","message5",
  "confirmationMessage1","confirmationMessage2","confirmationMessage3","confirmationMessage4","confirmationMessage5"
];
const draftKey = (campaignId) => `campaignDraft:${campaignId || "new"}`;
const progressKey = (campaignId) => `campaignProgress:${campaignId || "new"}`;

const CampaignDraftAutoSave = ({ campaignId }) => {
  const { values, setFieldValue } = useFormikContext();
  const storageKey = draftKey(campaignId);
  const loadedRef = useRef(false);

  // Restaura rascunho na 1ª renderização
  useEffect(() => {
    if (loadedRef.current) return;
    loadedRef.current = true;
    try {
      const raw = localStorage.getItem(storageKey);
      if (!raw) return;
      const draft = JSON.parse(raw);
      MESSAGE_DRAFT_KEYS.forEach((k) => {
        if (draft[k] && !values[k]) setFieldValue(k, draft[k], false);
      });
    } catch (_) {}
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey]);

  // Salva (debounce 400ms) sempre que qualquer mensagem mudar
  useEffect(() => {
    if (!loadedRef.current) return;
    const t = setTimeout(() => {
      try {
        const draft = {};
        MESSAGE_DRAFT_KEYS.forEach((k) => { if (values[k]) draft[k] = values[k]; });
        if (Object.keys(draft).length === 0) localStorage.removeItem(storageKey);
        else localStorage.setItem(storageKey, JSON.stringify(draft));
      } catch (_) {}
    }, 400);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, MESSAGE_DRAFT_KEYS.map((k) => values[k]));

  return null;
};
export const clearCampaignDraft = (campaignId) => {
  try {
    localStorage.removeItem(draftKey(campaignId));
    localStorage.removeItem(progressKey(campaignId));
  } catch (_) {}
};

// Definição visual e de validação das 6 etapas
export const CAMPAIGN_STEPS = [
  { n: 1, label: i18n.t("campaignWizard.step1") || "Identificação", anchor: "cm-step-1" },
  { n: 2, label: i18n.t("campaignWizard.step2") || "Distribuição",  anchor: "cm-step-2" },
  { n: 3, label: i18n.t("campaignWizard.step3") || "Agendamento",   anchor: "cm-step-3" },
  { n: 4, label: i18n.t("campaignWizard.step4") || "Ticket",        anchor: "cm-step-4" },
  { n: 5, label: i18n.t("campaignWizard.step5") || "Mensagem",      anchor: "cm-step-5" },
  { n: 6, label: i18n.t("campaignWizard.step6") || "Contatos",      anchor: "cm-step-6" },
];

// Retorna { ok, fieldErrors, extraErrors, anchorId, firstField }
// - fieldErrors: { [formikFieldName]: msg } → usados em setFieldError/setFieldTouched
// - extraErrors: { [key]: msg } → estado não-Formik (rotação, template oficial)
// - anchorId: id da seção (#cm-step-N) para scroll
// - firstField: name/id do primeiro campo inválido para focar
export const validateCampaignStep = (n, ctx) => {
  const { values, isOficialSelected, selectedTemplateId, rotationEnabled, rotationWhatsappIds, rotationBlockSize, whatsappId } = ctx;
  const fieldErrors = {};
  const extraErrors = {};
  let firstField = null;
  const setF = (k, msg, isExtra) => {
    if (isExtra) extraErrors[k] = msg; else fieldErrors[k] = msg;
    if (!firstField) firstField = { name: k, isExtra: !!isExtra };
  };
  switch (n) {
    case 1: {
      if (!values.name || !String(values.name).trim()) setF("name", "Informe o nome da campanha.");
      const wppId = whatsappId != null ? whatsappId : values.whatsappId;
      if (!wppId) setF("whatsappId", "Selecione uma conexão WhatsApp.", true);
      if (isOficialSelected && !selectedTemplateId) setF("selectedTemplateId", "Selecione um template aprovado.", true);
      break;
    }
    case 2: {
      if (rotationEnabled) {
        if (!Array.isArray(rotationWhatsappIds) || rotationWhatsappIds.length === 0)
          setF("rotationWhatsappIds", i18n.t("campaignExtras.rotationRequired", "Selecione ao menos uma conexão para a rotação."), true);
        if (!rotationBlockSize || Number(rotationBlockSize) <= 0)
          setF("rotationBlockSize", "Defina um tamanho de bloco válido (> 0).", true);
      }
      break;
    }
    case 3: break;
    case 4: break;
    case 5: {
      // Em campanhas API Oficial o envio usa o template selecionado; o campo message1 não é exigido.
      if (!isOficialSelected) {
        if (!values.message1 || !String(values.message1).trim())
          setF("message1", "Escreva a Mensagem 1 antes de continuar.");
      }
      break;
    }
    case 6: {
      // Existem TRÊS formas válidas de dizer quem vai receber a campanha:
      //
      //   1. uma lista de contatos (contactListId);
      //   2. um filtro por etiqueta (tagListId) — o backend trata esse caso
      //      explicitamente em ShippingService, CancelService e
      //      CampaignStatsService, todos com `if (tagListId && !contactListId)`;
      //   3. contatos escolhidos um a um — na hora de salvar o modal cria uma
      //      lista com eles automaticamente.
      //
      // A validação exigia contactListId em qualquer caso e barrava as duas
      // outras. Campanha por etiqueta ficava impossível de salvar: o campo
      // aparecia na tela, aceitava a escolha e mesmo assim reclamava
      // "Selecione uma lista de contatos".
      const temLista = !!values.contactListId;
      const temEtiqueta = !!values.tagListId && values.tagListId !== "none";
      const temContatosAvulsos =
        Array.isArray(ctx.individualContacts) && ctx.individualContacts.length > 0;

      if (!temLista && !temEtiqueta && !temContatosAvulsos) {
        setF(
          "contactListId",
          "Escolha quem vai receber: uma lista, um filtro por etiqueta ou contatos avulsos."
        );
      }
      break;
    }
    default: break;
  }
  const ok = Object.keys(fieldErrors).length === 0 && Object.keys(extraErrors).length === 0;
  return {
    ok,
    fieldErrors,
    extraErrors,
    anchorId: `cm-step-${n}`,
    firstField,
    // compat: mensagem agregada
    message: ok ? "" : (Object.values(fieldErrors)[0] || Object.values(extraErrors)[0] || ""),
  };
};

// Componente utilitário: força currentStep/maxUnlocked a respeitar a 1ª etapa inválida.
// Roda sempre que algum valor relevante muda (inclusive logo após restaurar o auto-save).
const StepProgressGuard = ({ effectiveMax, currentStep, maxUnlocked, setCurrentStep, setMaxUnlocked }) => {
  useEffect(() => {
    if (maxUnlocked > effectiveMax) setMaxUnlocked(effectiveMax);
    if (currentStep > effectiveMax) setCurrentStep(effectiveMax);
  }, [effectiveMax, currentStep, maxUnlocked, setCurrentStep, setMaxUnlocked]);
  return null;
};

// (Removido) StepSectionVisibility — substituído por renderização condicional por etapa.
import { toast } from "react-toastify";
import { head, isNil } from "lodash";
import { makeStyles, useTheme } from "@material-ui/core/styles";
import green from "@material-ui/core/colors/green";
import Button from "@material-ui/core/Button";
import IconButton from "@material-ui/core/IconButton";
import TextField from "@material-ui/core/TextField";
import Dialog from "@material-ui/core/Dialog";
import DialogActions from "@material-ui/core/DialogActions";
import DialogContent from "@material-ui/core/DialogContent";
import DialogTitle from "@material-ui/core/DialogTitle";
import CircularProgress from "@material-ui/core/CircularProgress";
import AttachFileIcon from "@material-ui/icons/AttachFile";
import Chip from '@material-ui/core/Chip';
import RepeatIcon from '@material-ui/icons/Repeat';
import VisibilityIcon from '@material-ui/icons/Visibility';
import { i18n } from "../../translate/i18n";
import moment from "moment-timezone";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import {
  Box,
  FormControl,
  Grid,
  InputLabel,
  MenuItem,
  Select,
  Tab,
  Tabs,
  FormControlLabel,
  Switch,
  Typography,
  Collapse,
  List,
  ListItem,
  ListItemText,
  FormHelperText,
  Card,
  CardContent,
  Checkbox,
  FormGroup,
  Tooltip,
} from "@material-ui/core";
import { AuthContext } from "../../context/Auth/AuthContext";
import ConfirmationModal from "../ConfirmationModal";
import UserStatusIcon from "../UserModal/statusIcon";
import Autocomplete, { createFilterOptions } from "@material-ui/lab/Autocomplete";
import useQueues from "../../hooks/useQueues";
import ContactGroupModal from "../ContactGroupModal";
import TemplatePreview from "../TemplatePreview";
import MessagePreview from "../MessagePreview";
import CampaignContactSelector from "../CampaignContactSelector";
import CloseIcon from "@material-ui/icons/Close";
import CallSplitIcon from "@material-ui/icons/CallSplit";
import ScheduleIcon from "@material-ui/icons/Schedule";
import ConfirmationNumberIcon from "@material-ui/icons/ConfirmationNumber";
import ChatBubbleOutlineIcon from "@material-ui/icons/ChatBubbleOutline";
import GroupIcon from "@material-ui/icons/Group";
import EmojiObjectsIcon from "@material-ui/icons/EmojiObjects";
import "./campaignModal.css";
import { getBackendUrl } from "../../config";
import VoiceCampaignAudio from "../VoiceCampaignAudio";
import usePlans from "../../hooks/usePlans";




const useStyles = makeStyles((theme) => ({
  root: {
    display: "flex",
    flexWrap: "wrap",
  },
  textField: {
    marginRight: theme.spacing(1),
    flex: 1,
  },
  extraAttr: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
  },
  btnWrapper: {
    position: "relative",
  },
  buttonProgress: {
    color: green[500],
    position: "absolute",
    top: "50%",
    left: "50%",
    marginTop: -12,
    marginLeft: -12,
  },
  dialogActions: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: theme.spacing(1),
    flexWrap: "nowrap",
    padding: theme.spacing(1.5, 3, 2),
    overflowX: "auto",
    "& > *": {
      margin: 0,
    },
  },
  dialogActionButton: {
    minWidth: 108,
    flexShrink: 0,
    whiteSpace: "nowrap",
    textTransform: "none",
  },
  recurrenceCard: {
    marginTop: theme.spacing(2),
    padding: theme.spacing(2),
    backgroundColor: theme.palette.grey[50],
  },
  previewCard: {
    marginTop: theme.spacing(1),
    maxHeight: 200,
    overflow: 'auto',
  },
  recurrenceIcon: {
    marginRight: theme.spacing(1),
    color: theme.palette.primary.main,
  },
}));


// Componente isolado para o slider de jitter — evita crash por Fragment dentro de IIFE
const JitterSlider = ({ campaignSettings, setCampaignSettings }) => {
  const jitter = typeof campaignSettings.jitterPercent === 'number' ? campaignSettings.jitterPercent : 40;
  const base = typeof campaignSettings.messageInterval === 'number' ? campaignSettings.messageInterval : 0;
  const min = base > 0 ? Math.round(base * (1 - jitter / 100)) : 0;
  const max = base > 0 ? Math.round(base * (1 + jitter / 100)) : 0;

  return (
    <div style={{ padding: "0 4px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 4 }}>
        <span style={{ fontSize: 12, color: "#555" }}>{i18n.t("campaignModal.jitterLabel")}</span>
        <span style={{ fontSize: 12, fontWeight: 700, color: "#1976d2" }}>±{jitter}%</span>
      </div>
      <input
        type="range"
        min={0}
        max={80}
        step={5}
        value={jitter}
        onChange={(e) => {
          const val = Number(e.target.value);
          setCampaignSettings((p) => ({ ...p, jitterPercent: val }));
        }}
        style={{ width: "100%", accentColor: "#1976d2" }}
      />
      <div style={{ display: "flex", justifyContent: "space-between" }}>
        <span style={{ fontSize: 10, color: "#aaa" }}>0% {i18n.t("campaignModal.jitterFixed")}</span>
        <span style={{ fontSize: 10, color: "#aaa" }}>80% {i18n.t("campaignModal.jitterMax")}</span>
      </div>
      {base > 0 ? (
        <p style={{ fontSize: 11, color: "#888", margin: "4px 0 0" }}>
          {i18n.t("campaignModal.jitterBase", { base, min, max })}
        </p>
      ) : (
        <p style={{ fontSize: 11, color: "#e65100", margin: "4px 0 0" }}>
          {i18n.t("campaignModal.jitterSelectBase")}
        </p>
      )}
    </div>
  );
};

// No CampaignModal.js - Atualizar o schema de validação

const CampaignSchema = Yup.object().shape({
  name: Yup.string()
    .min(2, i18n.t("campaignModal.validation.tooShort"))
    .max(50, i18n.t("campaignModal.validation.tooLong"))
    .required(i18n.t("campaignModal.validation.required")),
  isRecurring: Yup.boolean().default(false),
  recurrenceType: Yup.string().when('isRecurring', {
    is: true,
    then: Yup.string().oneOf(['minutely', 'hourly', 'daily', 'weekly', 'biweekly', 'monthly', 'yearly']).required(i18n.t("campaignModal.validation.recurrenceTypeRequired")),
    otherwise: Yup.string().nullable()
  }),
  recurrenceInterval: Yup.number().when('isRecurring', {
    is: true,
    then: Yup.number().min(1, i18n.t("campaignModal.validation.intervalMin")).required(i18n.t("campaignModal.validation.intervalRequired")),
    otherwise: Yup.number().nullable()
  }),
  recurrenceDaysOfWeek: Yup.array().when(['isRecurring', 'recurrenceType'], {
    is: (isRecurring, recurrenceType) => isRecurring && recurrenceType === 'weekly',
    then: Yup.array().min(1, i18n.t("campaignModal.validation.selectDay")).required(),
    otherwise: Yup.array().nullable()
  }),
  recurrenceDayOfMonth: Yup.number().when(['isRecurring', 'recurrenceType'], {
    is: (isRecurring, recurrenceType) => isRecurring && recurrenceType === 'monthly',
    then: Yup.number().min(1, i18n.t("campaignModal.validation.dayRange")).max(31, i18n.t("campaignModal.validation.dayRange")).required(i18n.t("campaignModal.validation.dayRequired")),
    otherwise: Yup.number().nullable()
  }),
  recurrenceEndDate: Yup.date().when('isRecurring', {
    is: true,
    then: Yup.date().min(new Date(), i18n.t("campaignModal.validation.endDateFuture")).nullable(),
    otherwise: Yup.date().nullable()
  }),
  maxExecutions: Yup.number().when('isRecurring', {
    is: true,
    then: Yup.number().min(1, i18n.t("campaignModal.validation.maxExecMin")).nullable(),
    otherwise: Yup.number().nullable()
  })
});

const CampaignModal = ({
  open,
  onClose,
  campaignId,
  initialValues,
  onSave,
  resetPagination,
}) => {
  const classes = useStyles();
  const theme = useTheme();
  const isDark = theme.mode === "dark" || theme.palette?.type === "dark";
  const isMounted = useRef(true);
  const { user, socket } = useContext(AuthContext);
  const { companyId } = user;
  const userTimezone = user?.timezone || moment.tz.guess() || "America/Sao_Paulo";

  const initialState = {
    name: "",
    message1: "",
    message2: "",
    message3: "",
    message4: "",
    message5: "",
    confirmationMessage1: "",
    confirmationMessage2: "",
    confirmationMessage3: "",
    confirmationMessage4: "",
    confirmationMessage5: "",
    status: "INATIVA",
    confirmation: false,
    scheduledAt: "",
    contactListId: "",
    tagListId: "none",
    companyId,
    statusTicket: "closed",
    openTicket: "disabled",
    // Novos campos de recorrência
    isRecurring: false,
    recurrenceType: "",
    recurrenceInterval: 1,
    recurrenceDaysOfWeek: [],
    recurrenceDayOfMonth: 1,
    recurrenceEndDate: "",
    maxExecutions: null,
    sendFollowUpMessage: false,
    skipAlreadySent: false,
    followUpDelay: 3,
    messageDelays: { message1: 3, message2: 3, message3: 3, message4: 3, message5: 3 },
  };

  const [campaign, setCampaign] = useState(initialState);
  const [whatsapps, setWhatsapps] = useState([]);

  // ---- Campanha de voz ----
  // Só existe no WhatsApp Plus, que é o único canal com chamada de voz
  // própria. O arquivo fica em memória até a campanha ter id, porque o upload
  // é por campanha.
  const [campaignType, setCampaignType] = useState("message");
  // Campanha de voz é recurso de plano. Sem ele a opção nem aparece — mostrar
  // um botão que o servidor vai recusar só gera suporte.
  const { getPlanCompany } = usePlans();
  const [planoPermiteVoz, setPlanoPermiteVoz] = useState(false);
  const [voiceAudioFile, setVoiceAudioFile] = useState(null);
  const [voiceAudioName, setVoiceAudioName] = useState("");
  const [voiceMaxAttempts, setVoiceMaxAttempts] = useState(2);
  const [voiceRetryMinutes, setVoiceRetryMinutes] = useState(60);
  const [voiceRingSeconds, setVoiceRingSeconds] = useState(30);
  // Enviar também a mensagem de texto depois da ligação.
  const [voiceSendText, setVoiceSendText] = useState(true);
  const [selectedWhatsapps, setSelectedWhatsapps] = useState([]);
 const [whatsappId, setWhatsappId] = useState(null);
  // Rotação de conexões por blocos (ex.: nº1 dispara 250, nº2 dispara 250...)
  const [rotationEnabled, setRotationEnabled] = useState(false);
  const [rotationWhatsappIds, setRotationWhatsappIds] = useState([]);
  const [rotationBlockSize, setRotationBlockSize] = useState(250);
  const [rotationSequential, setRotationSequential] = useState(true);
  const [campaignStats, setCampaignStats] = useState(null);
  const [contactLists, setContactLists] = useState([]);
  const [tagLists, setTagLists] = useState([]);
  const [messageTab, setMessageTab] = useState(0);
  // Aba de variação de mensagem selecionada (message1..message5). O envio da
  // campanha já sorteia aleatoriamente entre as 5 (getCampaignValidMessages
  // em queues.ts) — só faltava a interface pra editar a 2ª–5ª variação.
  const [selectedVariationSlot, setSelectedVariationSlot] = useState("message1");
  const [generatingVariants, setGeneratingVariants] = useState(false);
  // Wizard 1→6 (somente dentro da aba 0 "Campanha")
  const [currentStep, setCurrentStep] = useState(1);
  const [maxUnlocked, setMaxUnlocked] = useState(1);
  const [showReview, setShowReview] = useState(false);
  // Banner de erros da etapa atual (preenchido ao clicar Continuar/Revisar com etapa inválida)
  const [stepErrors, setStepErrors] = useState({ step: null, fieldErrors: {}, extraErrors: {} });
  const progressLoadedRef = useRef(false);


  // Restaura a etapa atual + etapas liberadas do localStorage por campanha
  useEffect(() => {
    progressLoadedRef.current = false;
    try {
      const raw = localStorage.getItem(progressKey(campaignId));
      if (raw) {
        const p = JSON.parse(raw);
        if (Number.isFinite(p.currentStep)) setCurrentStep(Math.min(6, Math.max(1, p.currentStep)));
        if (Number.isFinite(p.maxUnlocked)) setMaxUnlocked(Math.min(6, Math.max(1, p.maxUnlocked)));
      } else {
        setCurrentStep(1);
        setMaxUnlocked(1);
      }
    } catch (_) {}
    // marca carregado no próximo tick para evitar sobrescrever com defaults
    const id = setTimeout(() => { progressLoadedRef.current = true; }, 0);
    return () => clearTimeout(id);
  }, [campaignId]);

  // Persiste etapa + etapas liberadas (debounce curto)
  useEffect(() => {
    if (!progressLoadedRef.current) return;
    const t = setTimeout(() => {
      try {
        localStorage.setItem(progressKey(campaignId), JSON.stringify({ currentStep, maxUnlocked }));
      } catch (_) {}
    }, 200);
    return () => clearTimeout(t);
  }, [campaignId, currentStep, maxUnlocked]);

  // Helpers de navegação entre etapas
  const scrollToStep = useCallback((n) => {
    setTimeout(() => {
      const el = document.getElementById(`cm-step-${n}`);
      if (el && typeof el.scrollIntoView === "function") {
        el.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    }, 30);
  }, []);
  const goToStep = useCallback((n) => {
    if (n < 1 || n > 6) return;
    if (n > maxUnlocked) return; // bloqueado
    setMessageTab(0);
    setCurrentStep(n);
    scrollToStep(n);
  }, [maxUnlocked, scrollToStep]);
  const [attachment, setAttachment] = useState(null);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [campaignEditable, setCampaignEditable] = useState(true);
  const [previewExecutions, setPreviewExecutions] = useState([]);
  const [showPreview, setShowPreview] = useState(false);
  const [messageMedias, setMessageMedias] = useState({}); // { message1: File, message2: File, ... }
  const [savedMessageMedias, setSavedMessageMedias] = useState({}); // { message1: { path, name }, ... }
  // Templates aprovados vinculados a slots de follow-up (API Oficial). Quando definido,
  // o slot envia o template em vez de texto livre. Formato: { message2: { templateId, name } }
  const [messageTemplates, setMessageTemplates] = useState({});
  const attachmentFile = useRef(null);
  const messageMediaRefs = useRef({});

  const [options, setOptions] = useState([]);
  const [queues, setQueues] = useState([]);
  const [allQueues, setAllQueues] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchParam, setSearchParam] = useState("");
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedQueue, setSelectedQueue] = useState(null);
  const { findAll: findAllQueues } = useQueues();

  // Configurações de campanha (antes em CampaignsConfig)
  const initialCampaignSettings = {
    messageInterval: 20,
    longerIntervalAfter: 20,
    greaterInterval: 60,
    jitterPercent: 40,
    longPauseEvery: 50,
    longPauseDuration: 30,
  };
  const [campaignSettings, setCampaignSettings] = useState(initialCampaignSettings);
  const [savingSettings, setSavingSettings] = useState(false);

  // API Oficial - Templates
  const [isOficialSelected, setIsOficialSelected] = useState(false);
  const [oficialTemplates, setOficialTemplates] = useState([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState(null);
  const [contactGroupModalOpen, setContactGroupModalOpen] = useState(false);
  // Persistência por template: ao trocar de template e voltar, os valores
  // já preenchidos não são perdidos enquanto o modal estiver aberto.
  const [templateVarValuesByTemplate, setTemplateVarValuesByTemplate] = useState({});
  const templateVarValues = useMemo(
    () => (selectedTemplateId ? (templateVarValuesByTemplate[selectedTemplateId] || {}) : {}),
    [templateVarValuesByTemplate, selectedTemplateId]
  );
  const setTemplateVarValues = useCallback((updater) => {
    setTemplateVarValuesByTemplate(prev => {
      if (!selectedTemplateId) return prev;
      const current = prev[selectedTemplateId] || {};
      const next = typeof updater === "function" ? updater(current) : updater;
      return { ...prev, [selectedTemplateId]: next };
    });
  }, [selectedTemplateId]);
  const [individualContacts, setIndividualContacts] = useState([]);
  const [sendNowLimit, setSendNowLimit] = useState("");

  // Opções para dias da semana
  const daysOfWeekOptions = [
    { value: 0, label: i18n.t("campaignModal.daysOfWeekOptions.sunday") },
    { value: 1, label: i18n.t("campaignModal.daysOfWeekOptions.monday") },
    { value: 2, label: i18n.t("campaignModal.daysOfWeekOptions.tuesday") },
    { value: 3, label: i18n.t("campaignModal.daysOfWeekOptions.wednesday") },
    { value: 4, label: i18n.t("campaignModal.daysOfWeekOptions.thursday") },
    { value: 5, label: i18n.t("campaignModal.daysOfWeekOptions.friday") },
    { value: 6, label: i18n.t("campaignModal.daysOfWeekOptions.saturday") },
  ];

  // Função para preview das execuções
  const handlePreviewRecurrence = async (values) => {
    if (!values.isRecurring || !values.recurrenceType || !values.scheduledAt) {
      setPreviewExecutions([]);
      return;
    }

    try {
      const params = {
        recurrenceType: values.recurrenceType,
        recurrenceInterval: values.recurrenceInterval,
        recurrenceDaysOfWeek: JSON.stringify(values.recurrenceDaysOfWeek),
        recurrenceDayOfMonth: values.recurrenceDayOfMonth,
      };

      if (campaignId) {
        const { data } = await api.get(`/campaigns/${campaignId}/recurrence-preview`, { params });
        setPreviewExecutions(data.executions);
      } else {
        // Para campanhas novas, calcular localmente ou usar endpoint genérico
        const mockExecutions = calculateMockExecutions(values);
        setPreviewExecutions(mockExecutions);
      }
    } catch (err) {
      console.error('Erro ao buscar preview:', err);
    }
  };

  // Função auxiliar para calcular execuções mock
  const calculateMockExecutions = (values) => {
    const executions = [];
    let currentDate = moment(values.scheduledAt);
    
    for (let i = 0; i < 5; i++) {
      executions.push(currentDate.format('DD/MM/YYYY HH:mm'));
      
      switch (values.recurrenceType) {
        case 'minutely':
          currentDate = currentDate.clone().add(values.recurrenceInterval, 'minutes');
          break;
        case 'hourly':
          currentDate = currentDate.clone().add(values.recurrenceInterval, 'hours');
          break;
        case 'daily':
          currentDate = currentDate.clone().add(values.recurrenceInterval, 'days');
          break;
        case 'weekly':
          currentDate = currentDate.clone().add(values.recurrenceInterval, 'weeks');
          break;
        case 'biweekly':
          currentDate = currentDate.clone().add(values.recurrenceInterval * 2, 'weeks');
          break;
        case 'monthly':
          currentDate = currentDate.clone().add(values.recurrenceInterval, 'months');
          if (values.recurrenceDayOfMonth) {
            currentDate = currentDate.date(values.recurrenceDayOfMonth);
          }
          break;
        case 'yearly':
          currentDate = currentDate.clone().add(values.recurrenceInterval, 'years');
          break;
      }
    }
    
    return executions;
  };

  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (isMounted.current) {
      const loadQueues = async () => {
        const list = await findAllQueues();
        setAllQueues(list);
        setQueues(list);
      };
      loadQueues();
    }
  }, []);

  useEffect(() => {
    if (searchParam.length < 3) {
      setLoading(false);
      setSelectedQueue("");
      return;
    }
    const delayDebounceFn = setTimeout(() => {
      setLoading(true);
      const fetchUsers = async () => {
        try {
          const { data } = await api.get("/users/");
          setOptions(data.users);
          setLoading(false);
        } catch (err) {
          setLoading(false);
          toastError(err);
        }
      };
      fetchUsers();
    }, 500);
    return () => clearTimeout(delayDebounceFn);
  }, [searchParam]);

  useEffect(() => {
    if (isMounted.current) {
      if (initialValues) {
        setCampaign((prevState) => {
          return { ...prevState, ...initialValues };
        });
      }

      api
        .get(`/contact-lists/list`, { params: { companyId } })
        .then(({ data }) => setContactLists(data));

      api
        .get(`/whatsapp`, { params: { companyId, session: 0 } })
        .then(({ data }) => {
          const mappedWhatsapps = data.map((whatsapp) => ({
            ...whatsapp,
            selected: false,
          }));
          setWhatsapps(mappedWhatsapps);
        });

      api.get(`/tags/list`, { params: { companyId } })
        .then(({ data }) => {
          const fetchedTags = Array.isArray(data) ? data : [];
          const formattedTagLists = fetchedTags
            .map((tag) => {
              const count = Array.isArray(tag.contacts) ? tag.contacts.length : 0;
              return {
                id: tag.id,
                name: count > 0 ? `${tag.name} (${count})` : tag.name,
                contactsCount: count,
              };
            })
            // Mostra todas as tags da empresa (kanban e não-kanban) para que apareçam
            // sempre que estiverem cadastradas, mesmo se a contagem vier como 0.
            .sort((a, b) => (b.contactsCount || 0) - (a.contactsCount || 0));
          setTagLists(formattedTagLists);
        })
        .catch((error) => {
          console.error("Error retrieving tags:", error);
        });

      // Carregar configurações de campanha
      const numericKeys = ["messageInterval", "longerIntervalAfter", "greaterInterval", "jitterPercent", "longPauseEvery", "longPauseDuration"];
      api.get("/campaign-settings").then(({ data }) => {
        if (Array.isArray(data) && data.length > 0) {
          const settingsList = [];
          data.forEach((item) => {
            const val = numericKeys.includes(item.key) ? Number(item.value) : item.value;
            settingsList.push([item.key, val]);
          });
          setCampaignSettings((prev) => ({ ...prev, ...Object.fromEntries(settingsList) }));
        }
      });

      if (!campaignId) return;

      api.get(`/campaigns/${campaignId}`).then(({ data }) => {
        if (data?.user) setSelectedUser(data.user);
        if (data?.queue) setSelectedQueue(data.queue.id);
        // Campanha de voz: repor o que foi salvo, senão reabrir para editar
        // mostraria o formulário como se fosse campanha de mensagem.
        if (data?.campaignType === "voice") {
          setCampaignType("voice");
        }
        if (data?.voiceAudioName) setVoiceAudioName(data.voiceAudioName);
        if (data?.voiceMaxAttempts) setVoiceMaxAttempts(data.voiceMaxAttempts);
        if (data?.voiceRetryMinutes) setVoiceRetryMinutes(data.voiceRetryMinutes);
        if (data?.voiceRingSeconds) setVoiceRingSeconds(data.voiceRingSeconds);
        if (data?.voiceSendText !== undefined) setVoiceSendText(data.voiceSendText !== false);

        if (data?.whatsappId) {
          setWhatsappId(parseInt(data.whatsappId));
        } else {
          setWhatsappId(null);
        }
        // Carregar configuração de rotação por blocos, se existir
        try {
          if (data?.whatsappRotation) {
            const rot = typeof data.whatsappRotation === "string"
              ? JSON.parse(data.whatsappRotation)
              : data.whatsappRotation;
            if (rot && Array.isArray(rot.whatsappIds) && rot.whatsappIds.length >= 2) {
              setRotationEnabled(true);
              setRotationWhatsappIds(rot.whatsappIds.map(Number));
              setRotationBlockSize(Number(rot.blockSize) || 250);
              setRotationSequential(rot.sequential !== false);
            }
          }
        } catch (_) { /* ignore */ }
        if (data?.templateId) {
          setSelectedTemplateId(data.templateId);
          if (data.templateVariables) {
            try {
              const parsed = JSON.parse(data.templateVariables);
              if (parsed && typeof parsed === "object") {
                // Edições do usuário em andamento têm prioridade sobre o valor
                // salvo no banco — evita que o refetch sobrescreva o token
                // (ex.: {nome}) com o texto antigo digitado manualmente.
                setTemplateVarValuesByTemplate(prev => ({
                  ...prev,
                  [data.templateId]: { ...parsed, ...(prev[data.templateId] || {}) },
                }));
              }
            } catch (_) { /* ignore */ }
          }
        }
        
        setCampaign((prev) => {
          let prevCampaignData = Object.assign({}, prev);

          Object.entries(data).forEach(([key, value]) => {
            if (key === "scheduledAt" && value !== "" && value !== null) {
              // Backend devolve UTC (ISO). Converte para o fuso do usuário antes de exibir no input.
              prevCampaignData[key] = moment.utc(value).tz(userTimezone).format("YYYY-MM-DDTHH:mm");
            } else if (key === "recurrenceEndDate" && value !== "" && value !== null) {
              prevCampaignData[key] = moment.utc(value).tz(userTimezone).format("YYYY-MM-DD");
            } else if (key === "recurrenceDaysOfWeek" && value) {
              prevCampaignData[key] = JSON.parse(value);
            } else if (key === "messageDelays") {
              try {
                prevCampaignData[key] = value ? JSON.parse(value) : { message1: 3, message2: 3, message3: 3, message4: 3, message5: 3 };
              } catch (e) {
                prevCampaignData[key] = { message1: 3, message2: 3, message3: 3, message4: 3, message5: 3 };
              }
            } else if (key === "messageMedias") {
              try {
                setSavedMessageMedias(value ? JSON.parse(value) : {});
              } catch (e) {
                setSavedMessageMedias({});
              }
            } else if (key === "messageTemplates") {
              try {
                setMessageTemplates(value ? JSON.parse(value) : {});
              } catch (e) {
                setMessageTemplates({});
              }
            } else {
              prevCampaignData[key] = value === null ? "" : value;
            }
          });

          // Garantir que messageDelays nunca seja null/undefined
          if (!prevCampaignData.messageDelays || typeof prevCampaignData.messageDelays !== "object") {
            prevCampaignData.messageDelays = { message1: 3, message2: 3, message3: 3, message4: 3, message5: 3 };
          }

          return prevCampaignData;
        });
      });

      // Buscar estatísticas (entregues, pendentes, falhas) para mostrar progresso real
      api
        .get(`/campaigns/${campaignId}/stats`)
        .then(({ data }) => setCampaignStats(data))
        .catch(() => setCampaignStats(null));
    }
  }, [campaignId, open, initialValues, companyId]);

  // Atualizar estatísticas periodicamente enquanto a campanha estiver em andamento
  useEffect(() => {
    if (!open || !campaignId) return;
    if (campaign?.status !== "EM_ANDAMENTO" && campaign?.status !== "PROGRAMADA") return;
    const interval = setInterval(() => {
      api
        .get(`/campaigns/${campaignId}/stats`)
        .then(({ data }) => setCampaignStats(data))
        .catch(() => {});
    }, 5000);
    return () => clearInterval(interval);
  }, [open, campaignId, campaign?.status]);

  // A conexão escolhida é WhatsApp Plus? É o único canal com chamada de voz
  // própria, então é ele que libera a campanha de voz. Valor derivado de
  // propósito: um estado a mais aqui só criaria uma cópia para dessincronizar.
  useEffect(() => {
    let cancelado = false;
    (async () => {
      try {
        const plano = await getPlanCompany(undefined, companyId);
        if (!cancelado) setPlanoPermiteVoz(!!plano?.plan?.useVoiceCampaign);
      } catch (err) {
        // Sem o plano em mãos, o seguro é NÃO oferecer: a trava real está no
        // servidor, e mostrar a opção só levaria a um erro na hora de salvar.
        if (!cancelado) setPlanoPermiteVoz(false);
      }
    })();
    return () => {
      cancelado = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [companyId]);

  const selectedIsWacalls = React.useMemo(() => {
    const escolhida = whatsapps.find((w) => w.id === whatsappId);
    return !!escolhida && escolhida.channel === "wacalls";
  }, [whatsapps, whatsappId]);

  // Trocar para um canal sem voz precisa desligar a campanha de voz, senão
  // ela seria salva como "voice" numa conexão que não sabe ligar.
  useEffect(() => {
    if ((!selectedIsWacalls || !planoPermiteVoz) && campaignType === "voice") {
      setCampaignType("message");
    }
  }, [selectedIsWacalls, planoPermiteVoz, campaignType]);

  // Detectar se o WhatsApp selecionado é API Oficial e buscar templates
  useEffect(() => {
    if (!whatsappId || whatsapps.length === 0) {
      setIsOficialSelected(false);
      setOficialTemplates([]);
      return;
    }
    const selectedWpp = whatsapps.find(w => w.id === whatsappId);
    if (selectedWpp && selectedWpp.channel === "whatsapp_oficial") {
      setIsOficialSelected(true);
      // Buscar templates aprovados desta conexão
      api.get(`/quick-messages/list`, { 
        params: { companyId, isOficial: true, whatsappId: whatsappId } 
      }).then(({ data }) => {
        const approved = data.filter(t => t.status === "APPROVED");
        setOficialTemplates(approved);
      }).catch(err => {
        console.error("Erro ao buscar templates:", err);
        setOficialTemplates([]);
      });
    } else {
      setIsOficialSelected(false);
      setOficialTemplates([]);
      setSelectedTemplateId(null);
    }
  }, [whatsappId, whatsapps, companyId]);

  useEffect(() => {
    const now = moment();
    const scheduledAt = moment(campaign.scheduledAt);
    const moreThenAnHour =
      !Number.isNaN(scheduledAt.diff(now)) && scheduledAt.diff(now, "hour") > 1;
    const isEditable =
      campaign.status === "INATIVA" ||
      (campaign.status === "PROGRAMADA" && moreThenAnHour);

    setCampaignEditable(isEditable);
  }, [campaign.status, campaign.scheduledAt]);

  const handleClose = () => {
    onClose();
    setCampaign(initialState);
    setPreviewExecutions([]);
    setShowPreview(false);
    setSelectedTemplateId(null);
    setIsOficialSelected(false);
    setOficialTemplates([]);
    setTemplateVarValuesByTemplate({});
    setMessageMedias({});
    setSavedMessageMedias({});
    setMessageTemplates({});
  };

  const handleAttachmentFile = (e) => {
    const file = head(e.target.files);
    if (file) {
      setAttachment(file);
    }
  };

  /**
   * Sobe o áudio da campanha de voz.
   *
   * Só roda depois de salvar porque a rota de upload é por campanha, e numa
   * campanha nova o id só existe após o POST.
   */
  const enviarAudioDeVoz = async (idDaCampanha) => {
    if (campaignType !== "voice" || !voiceAudioFile || !idDaCampanha) return;
    const formData = new FormData();
    formData.append("file", voiceAudioFile);
    await api.post(`/campaigns/${idDaCampanha}/voice-audio`, formData);
  };

  const handleSaveCampaign = async (values) => {
    if (isOficialSelected && !selectedTemplateId) {
      toast.error(i18n.t("campaignModal.selectTemplateRequired"));
      return;
    }

    // Validação: bloquear envio quando algum {{placeholder}} do template estiver vazio
    if (isOficialSelected && selectedTemplateId) {
      const tpl = oficialTemplates.find(t => t.id === selectedTemplateId);
      if (tpl) {
        const SECTION_LABELS = {
          header: i18n.t("campaignModalExtraV2.sectionHeader"),
          body: i18n.t("campaignModalExtraV2.sectionBody"),
          footer: i18n.t("campaignModalExtraV2.sectionFooter"),
          buttons: i18n.t("campaignModalExtraV2.sectionButtons"),
        };
        const varsMap = new Map();
        const collect = (sectionKey, text) => {
          if (!text) return;
          const localRe = /\{\{([^}]+)\}\}/g;
          let m;
          while ((m = localRe.exec(text)) !== null) {
            const key = m[1].trim();
            if (!key) continue;
            const entry = varsMap.get(key) || { key, sections: [] };
            if (!entry.sections.includes(sectionKey)) entry.sections.push(sectionKey);
            varsMap.set(key, entry);
          }
        };
        (tpl.components || []).forEach(c => {
          const t = (c.type || "").toLowerCase();
          if (["header", "body", "footer"].includes(t)) {
            collect(t, c.text || "");
          } else if (t === "buttons" && c.buttons) {
            try {
              const parsed = typeof c.buttons === "string" ? JSON.parse(c.buttons) : c.buttons;
              const arr = Array.isArray(parsed) ? parsed : [parsed];
              arr.forEach(b => {
                collect("buttons", b?.text || "");
                collect("buttons", b?.url || "");
              });
            } catch (_) { /* ignore */ }
          }
        });
        const missing = Array.from(varsMap.values()).filter(v => {
          const val = templateVarValues[v.key];
          return !val || !String(val).trim();
        });
        if (missing.length > 0) {
          const list = missing
            .map(v => `{{${v.key}}} (${v.sections.map(s => SECTION_LABELS[s] || s).join(" + ")})`)
            .join(", ");
          toast.error(`Preencha as variáveis obrigatórias do template: ${list}`);
          return;
        }
      }
    }

    try {
      const dataValues = {
        ...values,
        whatsappId: whatsappId,
        // Campanha de voz. Sempre enviados: quando o tipo é "message" o
        // backend ignora os números, e assim desligar a voz numa edição volta
        // o registro para mensagem em vez de deixá-lo meio-a-meio.
        campaignType,
        voiceMaxAttempts: Number(voiceMaxAttempts) || 2,
        voiceRetryMinutes: Number(voiceRetryMinutes) || 60,
        voiceRingSeconds: Number(voiceRingSeconds) || 30,
        voiceSendText,
        templateId: isOficialSelected ? selectedTemplateId : null,
        templateVariables: isOficialSelected && Object.keys(templateVarValues).length > 0
          ? JSON.stringify(templateVarValues)
          : null,
        userId: selectedUser?.id || null,
        queueId: selectedQueue || null,
        recurrenceDaysOfWeek: (values.isRecurring && values.recurrenceDaysOfWeek && values.recurrenceDaysOfWeek.length > 0)
          ? values.recurrenceDaysOfWeek
          : null,
        messageDelays: values.messageDelays ? JSON.stringify(values.messageDelays) : null,
        messageTemplates: messageTemplates && Object.keys(messageTemplates).length > 0
          ? JSON.stringify(messageTemplates)
          : null,
        whatsappRotation: (rotationEnabled && rotationWhatsappIds.length >= 2 && Number(rotationBlockSize) > 0)
          ? JSON.stringify({
              blockSize: Number(rotationBlockSize),
              whatsappIds: rotationWhatsappIds.map(Number),
              sequential: !!rotationSequential,
            })
          : null,
      };

      // API Oficial não suporta follow-up condicional — apenas o template é disparado
      if (isOficialSelected) {
        dataValues.sendFollowUpMessage = false;
      }

      Object.entries(values).forEach(([key, value]) => {
        if (key === "sendFollowUpMessage" && isOficialSelected) {
          dataValues[key] = false;
          return;
        }
        if (key === "scheduledAt" && value !== "" && value !== null) {
          // Interpreta o horário digitado como sendo no fuso do usuário e envia em UTC ao backend.
          dataValues[key] = moment.tz(value, userTimezone).toISOString();
        } else if (key === "recurrenceEndDate" && value !== "" && value !== null) {
          dataValues[key] = moment.tz(value, userTimezone).toISOString();
        } else if (key !== "recurrenceDaysOfWeek") {
          dataValues[key] = value === "" ? null : value;
        }
      });

      if (!values.isRecurring) {
        dataValues.recurrenceType = null;
        dataValues.recurrenceInterval = null;
        dataValues.recurrenceDaysOfWeek = null;
        dataValues.recurrenceDayOfMonth = null;
        dataValues.recurrenceEndDate = null;
        dataValues.maxExecutions = null;
      }

      // Se não tem contactListId nem tagListId válida, mas tem contatos individuais selecionados,
      // criar automaticamente um grupo de contatos
      if (!dataValues.contactListId && (!dataValues.tagListId || dataValues.tagListId === "none") && individualContacts.length > 0) {
        const listName = i18n.t("campaignModal.autoListName", { name: dataValues.name || i18n.t("campaignModal.noName"), date: moment().format("DD/MM HH:mm") });
        const { data: newList } = await api.post("/contact-lists/from-contacts", {
          name: listName,
          contactIds: individualContacts,
        });
        dataValues.contactListId = newList.id;
      }

      const uploadPerMessageMedias = async (campId) => {
        for (const [msgKey, file] of Object.entries(messageMedias)) {
          if (file) {
            const formData = new FormData();
            formData.append("file", file);
            await api.post(`/campaigns/${campId}/message-media-upload?messageKey=${msgKey}`, formData);
          }
        }
      };

      if (campaignId) {
        await api.put(`/campaigns/${campaignId}`, dataValues);
        if (attachment != null) {
          const formData = new FormData();
          formData.append("file", attachment);
          await api.post(`/campaigns/${campaignId}/media-upload`, formData);
        }
        await uploadPerMessageMedias(campaignId);
        await enviarAudioDeVoz(campaignId);
        handleClose();
      } else {
        const { data } = await api.post("/campaigns", dataValues);
        if (attachment != null) {
          const formData = new FormData();
          formData.append("file", attachment);
          await api.post(`/campaigns/${data.id}/media-upload`, formData);
        }
        await uploadPerMessageMedias(data.id);
        await enviarAudioDeVoz(data.id);
        if (onSave) {
          onSave(data);
        }
        handleClose();
      }
      clearCampaignDraft(campaignId);
      toast.success(i18n.t("campaigns.toasts.success"));
    } catch (err) {
      toastError(err);
    }
  };

  const deleteMedia = async () => {
    if (attachment) {
      setAttachment(null);
      attachmentFile.current.value = null;
    }

    if (campaign.mediaPath) {
      await api.delete(`/campaigns/${campaign.id}/media-upload`);
      setCampaign((prev) => ({ ...prev, mediaPath: null, mediaName: null }));
      toast.success(i18n.t("campaigns.toasts.deleted"));
    }
  };

  // Detecta se um template aprovado é "simples" (sem variáveis {{N}}). Restringimos
  // os slots de follow-up a templates simples para evitar pedir variáveis por slot.
  const isSimpleTemplate = (tpl) => {
    if (!tpl) return false;
    const re = /\{\{\d+\}\}/;
    for (const c of (tpl.components || [])) {
      const t = (c.type || "").toLowerCase();
      if (["header", "body", "footer"].includes(t) && re.test(c.text || "")) return false;
    }
    return true;
  };
  const simpleTemplates = oficialTemplates.filter(isSimpleTemplate);

  const generateVariantsWithAi = async (setFieldValue, values) => {
    const base = (values.message1 || "").trim();
    if (!base) {
      toast.warn(i18n.t("campaignModal.variantsNeedBase"));
      return;
    }
    setGeneratingVariants(true);
    try {
      const { data } = await api.post("/campaigns/ai-generate-variants", {
        message: base,
        count: 5
      });
      const variants = Array.isArray(data?.variants) ? data.variants : [];
      // message1 fica intocado (é o original digitado pelo usuário); as
      // variantes preenchem message2..message5 na ordem que vierem.
      const slots = ["message2", "message3", "message4", "message5"];
      variants.slice(0, slots.length).forEach((text, i) => {
        setFieldValue(slots[i], text);
      });
      if (variants.length > 0) {
        toast.success(i18n.t("campaignModal.variantsGenerated"));
        setSelectedVariationSlot("message2");
      }
    } catch (err) {
      toastError(err);
    } finally {
      setGeneratingVariants(false);
    }
  };

  const renderMessageField = (identifier, showDelay = false, delayValue, onDelayChange) => {
    const slotTemplate = messageTemplates[identifier];
    const isTemplateMode = !!slotTemplate;
    const canUseTemplate = isOficialSelected;
    const setSlotMode = (toTemplate) => {
      setMessageTemplates((prev) => {
        const copy = { ...prev };
        if (toTemplate) copy[identifier] = { templateId: null, name: "" };
        else delete copy[identifier];
        return copy;
      });
    };
    const setSlotTemplateId = (templateId) => {
      const tpl = simpleTemplates.find((t) => t.id === templateId);
      setMessageTemplates((prev) => ({
        ...prev,
        [identifier]: { templateId: templateId || null, name: tpl?.shortcode || "" }
      }));
    };

    const hasSavedMedia = savedMessageMedias[identifier];
    const hasLocalMedia = messageMedias[identifier];
    const mediaInfo = hasLocalMedia ? { name: hasLocalMedia.name } : hasSavedMedia ? { name: hasSavedMedia.name } : null;

    return (
      <Box style={{ border: isDark ? "1px solid rgba(255,255,255,0.12)" : "1px solid #e0e0e0", borderRadius: 8, padding: 12, marginBottom: 8, backgroundColor: isDark ? "#161b22" : "#fafafa" }}>
        <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
          <Typography variant="caption" style={{ fontWeight: 600, textTransform: "uppercase", color: isDark ? "#9aa0a6" : "#666" }}>
            {i18n.t(`campaigns.dialog.form.${identifier}`)}
          </Typography>
          <Box display="flex" alignItems="center" style={{ gap: 8 }}>
            {canUseTemplate && (
              <FormControlLabel
                control={
                  <Switch
                    size="small"
                    checked={isTemplateMode}
                    onChange={(e) => setSlotMode(e.target.checked)}
                    disabled={!campaignEditable}
                    color="primary"
                  />
                }
                label={<span style={{ fontSize: 11 }}>{i18n.t("campaignModal.followUp.useApprovedTemplate")}</span>}
                style={{ marginRight: 0 }}
              />
            )}
            {showDelay && (
              <FormControl variant="outlined" size="small" style={{ minWidth: 130 }}>
                <Select
                  value={delayValue || 3}
                  onChange={(e) => onDelayChange && onDelayChange(e.target.value)}
                  disabled={!campaignEditable}
                  style={{ fontSize: 12, height: 28 }}
                >
                  <MenuItem value={3}>{i18n.t("campaignModal.followUp.delay3s")}</MenuItem>
                  <MenuItem value={5}>{i18n.t("campaignModal.followUp.delay5s")}</MenuItem>
                  <MenuItem value={10}>{i18n.t("campaignModal.followUp.delay10s")}</MenuItem>
                  <MenuItem value={30}>{i18n.t("campaignModal.followUp.delay30s")}</MenuItem>
                  <MenuItem value={60}>{i18n.t("campaignModal.followUp.delay60s")}</MenuItem>
                </Select>
              </FormControl>
            )}
          </Box>
        </Box>
        {isTemplateMode ? (
          <>
            <FormControl fullWidth variant="outlined" size="small">
              <Select
                value={slotTemplate?.templateId || ""}
                onChange={(e) => setSlotTemplateId(e.target.value)}
                disabled={!campaignEditable}
                displayEmpty
              >
                <MenuItem value="" disabled>
                  {simpleTemplates.length === 0
                    ? i18n.t("campaignModal.followUp.noSimpleTemplate")
                    : i18n.t("campaignModal.followUp.selectApprovedTemplate")}
                </MenuItem>
                {simpleTemplates.map((tpl) => (
                  <MenuItem key={tpl.id} value={tpl.id}>{tpl.shortcode}</MenuItem>
                ))}
              </Select>
            </FormControl>
            <Typography variant="caption" color="textSecondary" style={{ display: "block", marginTop: 6, fontSize: 11 }}>
              {i18n.t("campaignModal.followUp.simpleTemplateHelper")}
            </Typography>
          </>
        ) : (
          <>
        <Field name={identifier}>
          {({ field, form }) => (
            <TextField
              {...field}
              id={identifier}
              fullWidth
              rows={3}
              placeholder={i18n.t("campaigns.dialog.form.messagePlaceholder")}
              multiline
              variant="outlined"
              size="small"
              helperText={i18n.t("campaignModal.messageVariableHelper")}
              disabled={!campaignEditable && campaign.status !== "CANCELADA"}
              onChange={(e) => form.setFieldValue(identifier, e.target.value)}
            />
          )}
        </Field>
        {/* Per-message media - sempre visível em cada mensagem */}
        {(
          <Box display="flex" alignItems="center" mt={1} style={{ gap: 6 }}>
            <input
              type="file"
              style={{ display: "none" }}
              ref={(el) => { messageMediaRefs.current[identifier] = el; }}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) {
                  setMessageMedias((prev) => ({ ...prev, [identifier]: file }));
                }
              }}
            />
            {!mediaInfo && campaignEditable && (
              <Button
                size="small"
                variant="text"
                startIcon={<AttachFileIcon style={{ fontSize: 16 }} />}
                onClick={() => messageMediaRefs.current[identifier]?.click()}
                style={{ fontSize: 11, textTransform: "none", padding: "2px 8px" }}
              >
                {i18n.t("campaignModal.attachMedia")}
              </Button>
            )}
            {mediaInfo && (
              <>
                <Chip
                  size="small"
                  icon={<AttachFileIcon style={{ fontSize: 14 }} />}
                  label={mediaInfo.name}
                  onDelete={campaignEditable ? () => {
                    setMessageMedias((prev) => {
                      const copy = { ...prev };
                      delete copy[identifier];
                      return copy;
                    });
                    if (savedMessageMedias[identifier] && campaignId) {
                      api.delete(`/campaigns/${campaignId}/message-media?messageKey=${identifier}`)
                        .then(() => {
                          setSavedMessageMedias((prev) => {
                            const copy = { ...prev };
                            delete copy[identifier];
                            return copy;
                          });
                        })
                        .catch((err) => toastError(err));
                    } else {
                      setSavedMessageMedias((prev) => {
                        const copy = { ...prev };
                        delete copy[identifier];
                        return copy;
                      });
                    }
                  } : undefined}
                  style={{ fontSize: 11 }}
                />
              </>
            )}
          </Box>
        )}
          </>
        )}
      </Box>
    );
  };

  const renderConfirmationMessageField = (identifier) => {
    return (
      <Field
        as={TextField}
        id={identifier}
        name={identifier}
        fullWidth
        rows={5}
        label={i18n.t(`campaigns.dialog.form.${identifier}`)}
        placeholder={i18n.t("campaigns.dialog.form.messagePlaceholder")}
        multiline={true}
        variant="outlined"
        disabled={!campaignEditable && campaign.status !== "CANCELADA"}
      />
    );
  };

  const cancelCampaign = async () => {
    try {
      await api.post(`/campaigns/${campaign.id}/cancel`);
      toast.success(i18n.t("campaigns.toasts.cancel"));
      setCampaign((prev) => ({ ...prev, status: "CANCELADA" }));
      resetPagination();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const restartCampaign = async () => {
    try {
      await api.post(`/campaigns/${campaign.id}/restart`);
      toast.success(i18n.t("campaigns.toasts.restart"));
      setCampaign((prev) => ({ ...prev, status: "EM_ANDAMENTO" }));
      resetPagination();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const filterOptions = createFilterOptions({
    trim: true,
  });

  return (
    <div className={classes.root}>
      {/* ContactGroupModal movido para dentro do Formik para ter acesso a setFieldValue */}
      <ConfirmationModal
        title={i18n.t("campaigns.confirmationModal.deleteTitle")}
        open={confirmationOpen}
        onClose={() => setConfirmationOpen(false)}
        onConfirm={deleteMedia}
      >
        {i18n.t("campaigns.confirmationModal.deleteMessage")}
      </ConfirmationModal>
      <Dialog
        open={open}
        onClose={handleClose}
        fullWidth
        maxWidth="lg"
        scroll="paper"
        PaperProps={{
          className: "cm-v2-paper",
        }}
      >
        <div className="cm-v2-header">
          <div>
            <h2 className="cm-v2-header-title" id="form-dialog-title">
              {campaignEditable
                ? (campaignId
                    ? i18n.t("campaigns.dialog.update")
                    : i18n.t("campaigns.dialog.new"))
                : i18n.t("campaigns.dialog.readonly")}
            </h2>
            <div className="cm-v2-header-sub">
              {i18n.t("campaignWizard.subtitle")}
            </div>
          </div>
          <button
            type="button"
            className="cm-v2-close-btn"
            onClick={handleClose}
            aria-label="close"
          >
            <CloseIcon />
          </button>
        </div>
        <div style={{ display: "none" }}>
          <input
            type="file"
            ref={attachmentFile}
            onChange={(e) => handleAttachmentFile(e)}
          />
        </div>
        <Formik
          initialValues={campaign}
          enableReinitialize={true}
          validationSchema={CampaignSchema}
          onSubmit={(values, actions) => {
            setTimeout(() => {
              handleSaveCampaign(values);
              actions.setSubmitting(false);
            }, 400);
          }}
        >
          {({ values, errors, touched, isSubmitting, setFieldValue, setFieldError, setFieldTouched }) => {
            // Calcula a 1ª etapa inválida; navegação/restauração nunca podem ultrapassar
            const stepCtx = { values, isOficialSelected, selectedTemplateId, rotationEnabled, rotationWhatsappIds, rotationBlockSize, whatsappId, individualContacts };
            let effectiveMax = 1;
            for (let n = 1; n <= 6; n++) {
              effectiveMax = n;
              if (!validateCampaignStep(n, stepCtx).ok) break;
            }
            const allowedMax = Math.min(maxUnlocked, effectiveMax);

            // Marca os campos da etapa como inválidos (highlight visual) e
            // foca/scrolla até o primeiro problema. Retorna true se válido.
            const flagStepAndAdvance = (n) => {
              const v = validateCampaignStep(n, stepCtx);
              if (v.ok) {
                if (stepErrors.step === n) setStepErrors({ step: null, fieldErrors: {}, extraErrors: {} });
                return true;
              }
              // 1) Formik: marca touched + error em cada campo
              Object.entries(v.fieldErrors).forEach(([k, msg]) => {
                setFieldTouched(k, true, false);
                setFieldError(k, msg);
              });
              // 2) Estado próprio para campos não-Formik + banner
              setStepErrors({ step: n, fieldErrors: v.fieldErrors, extraErrors: v.extraErrors });
              // 3) Scroll até a seção + foco no 1º campo inválido
              setTimeout(() => {
                const sec = document.getElementById(v.anchorId);
                if (sec && typeof sec.scrollIntoView === "function") sec.scrollIntoView({ behavior: "smooth", block: "start" });
                if (v.firstField && !v.firstField.isExtra) {
                  const sel = `[name="${v.firstField.name}"], #${v.firstField.name}`;
                  const el = document.querySelector(sel);
                  if (el && typeof el.focus === "function") setTimeout(() => el.focus(), 250);
                }
              }, 30);
              // 4) Toast resumo
              const total = Object.keys(v.fieldErrors).length + Object.keys(v.extraErrors).length;
              toast.warn(`${total} ${total === 1 ? "campo precisa" : "campos precisam"} de atenção na etapa ${n}.`);
              return false;
            };

            return (
            <Form>
              <CampaignDraftAutoSave campaignId={campaignId} />
              <StepProgressGuard
                effectiveMax={effectiveMax}
                currentStep={currentStep}
                maxUnlocked={maxUnlocked}
                setCurrentStep={setCurrentStep}
                setMaxUnlocked={setMaxUnlocked}
              />
              <ContactGroupModal
                open={contactGroupModalOpen}
                onClose={() => setContactGroupModalOpen(false)}
                onGroupCreated={(newGroup) => {
                  // Adicionar o novo grupo à lista e auto-selecionar
                  setContactLists((prev) => [...prev, newGroup]);
                  setFieldValue("contactListId", newGroup.id);
                  // Recarregar lista completa para garantir consistência
                  api.get(`/contact-lists/list`, { params: { companyId } })
                    .then(({ data }) => {
                      setContactLists(data);
                      // Manter seleção do novo grupo
                      setFieldValue("contactListId", newGroup.id);
                    });
                }}
              />
              <div className="cm-v2-wizard-shell">
              <Box className="cm-v2-tabbar cm-v2-tabs cm-v2-sidesteps">
                <div className="cm-v2-sidesteps-head">
                  <span className="cm-v2-sidesteps-eyebrow">{i18n.t("campaignWizard.stepsLabel")}</span>
                  <span className="cm-v2-sidesteps-title">{i18n.t("campaignWizard.configuration")}</span>
                </div>
                <Tabs
                  orientation="vertical"
                  value={messageTab}
                  onChange={(e, val) => setMessageTab(val)}
                  indicatorColor="primary"
                  textColor="primary"
                >
                  <Tab disableRipple className={messageTab > 0 ? "cm-step-done" : ""} label={
                    <span className="cm-step">
                      <span className="cm-step-num">{messageTab > 0 ? "✓" : "1"}</span>
                      <span className="cm-step-info">
                        <span className="cm-step-title">{i18n.t("campaignWizard.campaignTab")}</span>
                        <span className="cm-step-desc">{i18n.t("campaignWizard.campaignTabSub")}</span>
                      </span>
                    </span>
                  } />
                  <Tab disableRipple className={messageTab > 1 ? "cm-step-done" : ""} label={
                    <span className="cm-step">
                      <span className="cm-step-num">{messageTab > 1 ? "✓" : "2"}</span>
                      <span className="cm-step-info">
                        <span className="cm-step-title">{i18n.t("campaignWizard.contactsTab")}</span>
                        <span className="cm-step-desc">{i18n.t("campaignWizard.contactsTabSub")}</span>
                      </span>
                    </span>
                  } />
                  <Tab disableRipple label={
                    <span className="cm-step">
                      <span className="cm-step-num">3</span>
                      <span className="cm-step-info">
                        <span className="cm-step-title">{i18n.t("campaignWizard.settingsTab")}</span>
                        <span className="cm-step-desc">{i18n.t("campaignWizard.settingsTabSub")}</span>
                      </span>
                    </span>
                  } />

                </Tabs>
              </Box>
              <div className="cm-v2-wizard-content">




              {/* ABA 0: Configurações da Campanha */}
              <div hidden={messageTab !== 0}>
              <DialogContent dividers>
                {/* Barra de progresso 1→6 */}
                <div className="cm-stepbar" role="progressbar" aria-valuemin={1} aria-valuemax={6} aria-valuenow={currentStep}>
                  {CAMPAIGN_STEPS.map((s, idx) => {
                    const done = s.n < currentStep && s.n <= allowedMax;
                    const active = s.n === currentStep;
                    const unlocked = s.n <= allowedMax;
                    const lockReason = !unlocked
                      ? (s.n > maxUnlocked
                          ? `Conclua a etapa anterior para liberar "${s.label}"`
                          : `Corrija a etapa ${effectiveMax} antes de acessar "${s.label}"`)
                      : `Ir para ${s.label}`;
                    return (
                      <React.Fragment key={s.n}>
                        <button
                          type="button"
                          className={`cm-stepbar-item${active ? " is-active" : ""}${done ? " is-done" : ""}${!unlocked ? " is-locked" : ""}`}
                          onClick={() => unlocked && goToStep(s.n)}
                          disabled={!unlocked}
                          title={lockReason}
                        >
                          <span className="cm-stepbar-num">{done ? "✓" : s.n}</span>
                          <span className="cm-stepbar-label">{s.label}</span>
                        </button>
                        {idx < CAMPAIGN_STEPS.length - 1 && (
                          <span className={`cm-stepbar-sep${s.n < currentStep ? " is-done" : ""}`} />
                        )}
                      </React.Fragment>
                    );
                  })}
                </div>
                {/* Banner de erros da etapa atual */}
                {stepErrors.step === currentStep && (Object.keys(stepErrors.fieldErrors).length + Object.keys(stepErrors.extraErrors).length > 0) && (
                  <div className="cm-step-errors" role="alert" aria-live="polite">
                    <div className="cm-step-errors-title">
                      {(Object.keys(stepErrors.fieldErrors).length + Object.keys(stepErrors.extraErrors).length === 1)
                        ? i18n.t("campaignExtras.errorPanelOne", "⚠ Corrija o campo abaixo para continuar")
                        : i18n.t("campaignExtras.errorPanelMany", "⚠ Corrija os campos abaixo para continuar")}
                    </div>
                    <ul>
                      {Object.entries({ ...stepErrors.fieldErrors, ...stepErrors.extraErrors }).map(([k, msg]) => (
                        <li key={k}><strong>{k}:</strong> {msg}</li>
                      ))}
                    </ul>
                  </div>
                )}
                <Grid spacing={2} container>
                  {/* ===== CARD 1 - Identificação ===== */}
                  {currentStep === 1 && (
                  <Grid xs={12} item>
                    <div className="cm-v2-section-card">
                      <div id="cm-step-1" className="cm-v2-section-title"><GroupIcon fontSize="small" />{i18n.t("campaignWizard.identificationTitle")}</div>
                      <Grid spacing={2} container>
                        <Grid xs={12} md={isOficialSelected ? 4 : 6} item>
                          <Field
                            as={TextField}
                            label={i18n.t("campaigns.dialog.form.name")}
                            name="name"
                            error={touched.name && Boolean(errors.name)}
                            helperText={touched.name && errors.name}
                            variant="outlined"
                            margin="dense"
                            fullWidth
                            className={classes.textField}
                            disabled={!campaignEditable}
                          />
                        </Grid>

                        {/* Campanha de voz — só faz sentido no WhatsApp Plus,
                            único canal com chamada própria. Em qualquer outro
                            canal a opção nem aparece, para não oferecer algo
                            que resultaria em erro no disparo. */}
                        {selectedIsWacalls && planoPermiteVoz && (
                          <Grid xs={12} item>
                            <FormControlLabel
                              control={
                                <Switch
                                  checked={campaignType === "voice"}
                                  onChange={(e) =>
                                    setCampaignType(e.target.checked ? "voice" : "message")
                                  }
                                  color="primary"
                                  disabled={!campaignEditable}
                                />
                              }
                              label={i18n.t("voiceCampaign.enable", "Campanha de voz (liga para o contato e toca um áudio)")}
                            />
                          </Grid>
                        )}

                        {selectedIsWacalls && planoPermiteVoz && campaignType === "voice" && (
                          <>
                            <Grid xs={12} item>
                              <VoiceCampaignAudio
                                audioAtual={voiceAudioName}
                                desabilitado={!campaignEditable}
                                onChange={(arquivo) => {
                                  setVoiceAudioFile(arquivo);
                                  if (!arquivo) setVoiceAudioName("");
                                }}
                              />
                            </Grid>
                            <Grid xs={12} sm={4} item>
                              <TextField
                                label={i18n.t("voiceCampaign.ringSeconds", "Tocar chamando (s)")}
                                type="number"
                                value={voiceRingSeconds}
                                onChange={(e) => setVoiceRingSeconds(e.target.value)}
                                variant="outlined"
                                margin="dense"
                                fullWidth
                                inputProps={{ min: 10, max: 120 }}
                                disabled={!campaignEditable}
                                helperText={i18n.t("voiceCampaign.ringSecondsHelp", "Tempo até considerar não atendida")}
                              />
                            </Grid>
                            <Grid xs={12} sm={4} item>
                              <TextField
                                label={i18n.t("voiceCampaign.attempts", "Tentativas")}
                                type="number"
                                value={voiceMaxAttempts}
                                onChange={(e) => setVoiceMaxAttempts(e.target.value)}
                                variant="outlined"
                                margin="dense"
                                fullWidth
                                inputProps={{ min: 1, max: 5 }}
                                disabled={!campaignEditable}
                                helperText={i18n.t("voiceCampaign.attemptsHelp", "Ligações por contato")}
                              />
                            </Grid>
                            <Grid xs={12} item>
                              <FormControlLabel
                                control={
                                  <Switch
                                    checked={voiceSendText}
                                    onChange={(e) => setVoiceSendText(e.target.checked)}
                                    color="primary"
                                    disabled={!campaignEditable}
                                  />
                                }
                                label={i18n.t("voiceCampaign.sendText", "Enviar uma mensagem de texto logo após a ligação")}
                              />
                            </Grid>

                            {voiceSendText && (
                              <Grid xs={12} item>
                                <FormHelperText>
                                  {i18n.t("voiceCampaign.sendTextHelp", "A mensagem é a configurada na etapa \"Mensagem\", com variáveis e anexo. Desmarque acima para fazer só a ligação, sem texto.")}
                                </FormHelperText>
                              </Grid>
                            )}
                            <Grid xs={12} sm={4} item>
                              <TextField
                                label={i18n.t("voiceCampaign.retryMinutes", "Intervalo entre tentativas (min)")}
                                type="number"
                                value={voiceRetryMinutes}
                                onChange={(e) => setVoiceRetryMinutes(e.target.value)}
                                variant="outlined"
                                margin="dense"
                                fullWidth
                                inputProps={{ min: 1 }}
                                disabled={!campaignEditable}
                                helperText={i18n.t("voiceCampaign.retryMinutesHelp", "Espera antes de ligar de novo")}
                              />
                            </Grid>
                          </>
                        )}

                        <Grid xs={12} md={isOficialSelected ? 4 : 6} item>
                          <FormControl
                            variant="outlined"
                            margin="dense"
                            fullWidth
                            className={classes.formControl}
                          >
                            <InputLabel id="whatsapp-selection-label">
                              {i18n.t("campaigns.dialog.form.whatsapp")}
                            </InputLabel>
                            <Field
                              as={Select}
                              label={i18n.t("campaigns.dialog.form.whatsapp")}
                              placeholder={i18n.t("campaigns.dialog.form.whatsapp")}
                              labelId="whatsapp-selection-label"
                              id="whatsappIds"
                              name="whatsappIds"
                              required
                              error={touched.whatsappId && Boolean(errors.whatsappId)}
                              disabled={!campaignEditable}
                              value={whatsappId}
                              onChange={(event) => {
                                setWhatsappId(event.target.value)
                              }}
                            >
                              {whatsapps &&
                                whatsapps.map((whatsapp) => (
                                  <MenuItem key={whatsapp.id} value={whatsapp.id}>
                                    {whatsapp.name}
                                    {whatsapp.channel === "whatsapp_oficial" && (
                                      <Chip
                                        size="small"
                                        label={i18n.t("campaignModal.apiOfficialLabel")}
                                        style={{
                                          marginLeft: 8,
                                          backgroundColor: "#25d366",
                                          color: "#fff",
                                          height: 20,
                                          fontSize: '0.7rem'
                                        }}
                                      />
                                    )}
                                    {whatsapp.channel === "wacalls" && (
                                      <Chip
                                        size="small"
                                        label="WhatsApp Plus - Voz + Msg"
                                        style={{
                                          marginLeft: 8,
                                          backgroundColor: "#f97316",
                                          color: "#fff",
                                          height: 20,
                                          fontSize: '0.7rem'
                                        }}
                                      />
                                    )}
                                  </MenuItem>
                                ))}
                            </Field>
                          </FormControl>
                        </Grid>

                        {/* Template select aparece aqui quando canal for API Oficial */}
                        {isOficialSelected && (
                          <Grid xs={12} sm={6} md={6} item>
                            <FormControl
                              variant="outlined"
                              margin="dense"
                              fullWidth
                              className={classes.formControl}
                            >
                              <InputLabel id="template-selection-label-top">
                                {i18n.t("campaignModal.template.label")}
                              </InputLabel>
                              <Select
                                label={i18n.t("campaignModal.template.label")}
                                labelId="template-selection-label-top"
                                id="templateIdTop"
                                value={selectedTemplateId || ""}
                                onChange={(e) => setSelectedTemplateId(e.target.value)}
                                disabled={!campaignEditable}
                                required
                              >
                                {oficialTemplates.map((template) => (
                                  <MenuItem key={template.id} value={template.id}>
                                    {template.shortcode} ({template.category})
                                  </MenuItem>
                                ))}
                              </Select>
                              <FormHelperText>
                                {oficialTemplates.length === 0
                                  ? i18n.t("campaignModal.noTemplateFound")
                                  : i18n.t("campaignModal.templateRequired")}
                              </FormHelperText>
                            </FormControl>
                          </Grid>
                        )}
                      </Grid>
                    </div>
                  </Grid>
                  )}

                  {currentStep === 2 && (<>
                  {/* ===== Rotação de conexões por blocos ===== */}
                  <Grid xs={12} item>
                    <div id="cm-step-2" className="cm-v2-section-title"><CallSplitIcon fontSize="small" />{i18n.t("campaignWizard.distributionTitle")}</div>
                  </Grid>
                  <Grid xs={12} item>
                    <Card variant="outlined" style={{ marginTop: 4 }}>
                      <CardContent style={{ paddingTop: 8, paddingBottom: 8 }}>
                        <FormControlLabel
                          control={
                            <Switch
                              checked={rotationEnabled}
                              onChange={(e) => setRotationEnabled(e.target.checked)}
                              disabled={!campaignEditable}
                              color="primary"
                            />
                          }
                          label={
                            <Typography variant="subtitle2">
                              {i18n.t("campaignWizard.splitByConnection")}
                            </Typography>
                          }
                        />
                        {rotationEnabled && (
                          <Grid container spacing={2} style={{ marginTop: 4 }}>
                            <Grid item xs={12} md={6}>
                              <FormControl variant="outlined" margin="dense" fullWidth>
                                <InputLabel id="rotation-wpps-label">
                                  {i18n.t("campaignExtras.rotationConnections", "Conexões (em ordem de bloco)")}
                                </InputLabel>
                                <Select
                                  multiple
                                  labelId="rotation-wpps-label"
                                  label={i18n.t("campaignExtras.rotationConnections", "Conexões (em ordem de bloco)")}
                                  value={rotationWhatsappIds}
                                  onChange={(e) => setRotationWhatsappIds(e.target.value)}
                                  disabled={!campaignEditable}
                                  renderValue={(selected) =>
                                    selected
                                      .map((id, idx) => {
                                        const w = whatsapps.find((x) => x.id === id);
                                        return `${idx + 1}. ${w ? w.name : id}`;
                                      })
                                      .join(" • ")
                                  }
                                >
                                  {whatsapps
                                    .filter(
                                      (w) =>
                                        !w.channel ||
                                        w.channel === "whatsapp" ||
                                        w.channel === "whatsapp_oficial" ||
                                        w.channel === "wacalls"
                                    )
                                    .map((w) => (
                                      <MenuItem key={w.id} value={w.id}>
                                        <Checkbox checked={rotationWhatsappIds.indexOf(w.id) > -1} />
                                        <ListItemText
                                          primary={w.name}
                                          secondary={
                                            w.channel === "whatsapp_oficial"
                                              ? "API Oficial"
                                              : w.channel === "wacalls"
                                              ? "WhatsApp Plus - Voz + Msg"
                                              : "Baileys"
                                          }
                                        />
                                      </MenuItem>
                                    ))}
                                </Select>
                                <FormHelperText>
                                  {i18n.t("campaignExtras.rotationOrderHelp", "A ordem da seleção define qual conexão atende cada bloco.")}
                                </FormHelperText>
                              </FormControl>
                            </Grid>
                            <Grid item xs={6} md={3}>
                              <TextField
                                label={i18n.t("campaignExtras.contactsPerBlock", "Contatos por bloco")}
                                type="number"
                                inputProps={{ min: 1, max: 5000, step: 50 }}
                                value={rotationBlockSize}
                                onChange={(e) => setRotationBlockSize(e.target.value)}
                                disabled={!campaignEditable}
                                variant="outlined"
                                margin="dense"
                                fullWidth
                              />
                            </Grid>
                            <Grid item xs={6} md={3} style={{ display: "flex", alignItems: "center" }}>
                              <FormControlLabel
                                control={
                                  <Switch
                                    checked={rotationSequential}
                                    onChange={(e) => setRotationSequential(e.target.checked)}
                                    disabled={!campaignEditable}
                                    color="primary"
                                  />
                                }
                                label={i18n.t("campaignExtras.sequentialBlocks", "Sequencial entre blocos")}
                              />
                            </Grid>
                          </Grid>
                        )}

                        {/* Resumo profissional de distribuição de disparos */}
                        {(() => {
                          const selectedList = contactLists.find((cl) => cl.id === values.contactListId);
                          const totalContacts =
                            (selectedList?.contactsCount || 0) +
                            (!values.contactListId ? individualContacts.length : 0);

                          if (totalContacts === 0) return null;

                          const blockSize = Math.max(1, Number(rotationBlockSize) || 0);
                          const conns = rotationEnabled ? (rotationWhatsappIds.length || 1) : 1;
                          const useRotation = rotationEnabled && rotationWhatsappIds.length > 0;

                          // Total real usado pela campanha — prioriza stats do backend
                          const statsTotal = Number(campaignStats?.totalMessages) || 0;
                          const effectiveTotal = statsTotal > 0 ? statsTotal : totalContacts;

                          const delivered = Number(campaignStats?.deliveredMessages) || 0;
                          const failed = Number(campaignStats?.failedMessages) || 0;
                          const processed = Math.min(effectiveTotal, delivered + failed);
                          const pending = Math.max(0, effectiveTotal - processed);
                          const progressPct = effectiveTotal > 0 ? Math.round((processed / effectiveTotal) * 100) : 0;

                          const totalBlocks = useRotation ? Math.ceil(effectiveTotal / blockSize) : 1;
                          const remainder = useRotation ? effectiveTotal % blockSize : 0;

                          const statColor = isDark ? "#fff" : "#111";
                          const subColor = isDark ? "rgba(255,255,255,0.6)" : "#666";

                          const hasProgress = campaignStats && (delivered > 0 || failed > 0);
                          const isRunning = campaign?.status === "EM_ANDAMENTO";
                          const isFinished = campaign?.status === "FINALIZADA";

                          return (
                            <Box
                              mt={2}
                              p={2}
                              style={{
                                borderRadius: 10,
                                background: isDark
                                  ? "linear-gradient(135deg, rgba(78,147,255,0.10), rgba(78,147,255,0.02))"
                                  : "linear-gradient(135deg, #f0f6ff, #ffffff)",
                                border: isDark
                                  ? "1px solid rgba(78,147,255,0.25)"
                                  : "1px solid #d6e4ff",
                              }}
                            >
                              <Box display="flex" alignItems="center" justifyContent="space-between" mb={1.25}>
                                <Typography
                                  variant="subtitle2"
                                  style={{ fontWeight: 600, color: statColor, display: "flex", alignItems: "center", gap: 6 }}
                                >
                                  📊 Resumo do disparo
                                </Typography>
                                {hasProgress && (
                                  <Chip
                                    size="small"
                                    label={
                                      isFinished
                                        ? "Finalizada"
                                        : isRunning
                                        ? `Em andamento • ${progressPct}%`
                                        : `Progresso ${progressPct}%`
                                    }
                                    style={{
                                      background: isFinished ? "#dcfce7" : isRunning ? "#dbeafe" : "#fef3c7",
                                      color: isFinished ? "#15803d" : isRunning ? "#1d4ed8" : "#a16207",
                                      fontWeight: 600,
                                    }}
                                  />
                                )}
                              </Box>

                              <Grid container spacing={2}>
                                <Grid item xs={6} md={3}>
                                  <Typography style={{ fontSize: 11, color: subColor, textTransform: "uppercase", letterSpacing: 0.5 }}>
                                    Total de contatos
                                  </Typography>
                                  <Typography style={{ fontSize: 22, fontWeight: 700, color: statColor }}>
                                    {effectiveTotal.toLocaleString("pt-BR")}
                                  </Typography>
                                </Grid>
                                {hasProgress && (
                                  <>
                                    <Grid item xs={6} md={3}>
                                      <Typography style={{ fontSize: 11, color: subColor, textTransform: "uppercase", letterSpacing: 0.5 }}>
                                        Já enviados
                                      </Typography>
                                      <Typography style={{ fontSize: 22, fontWeight: 700, color: "#16a34a" }}>
                                        {delivered.toLocaleString("pt-BR")}
                                      </Typography>
                                    </Grid>
                                    <Grid item xs={6} md={3}>
                                      <Typography style={{ fontSize: 11, color: subColor, textTransform: "uppercase", letterSpacing: 0.5 }}>
                                        Em aberto
                                      </Typography>
                                      <Typography style={{ fontSize: 22, fontWeight: 700, color: pending === 0 ? "#22c55e" : "#f59e0b" }}>
                                        {pending.toLocaleString("pt-BR")}
                                      </Typography>
                                    </Grid>
                                    <Grid item xs={6} md={3}>
                                      <Typography style={{ fontSize: 11, color: subColor, textTransform: "uppercase", letterSpacing: 0.5 }}>
                                        Falhas
                                      </Typography>
                                      <Typography style={{ fontSize: 22, fontWeight: 700, color: failed > 0 ? "#dc2626" : statColor }}>
                                        {failed.toLocaleString("pt-BR")}
                                      </Typography>
                                    </Grid>
                                  </>
                                )}
                                {!hasProgress && useRotation && (
                                  <>
                                    <Grid item xs={6} md={3}>
                                      <Typography style={{ fontSize: 11, color: subColor, textTransform: "uppercase", letterSpacing: 0.5 }}>
                                        Blocos de {blockSize}
                                      </Typography>
                                      <Typography style={{ fontSize: 22, fontWeight: 700, color: statColor }}>
                                        {totalBlocks}
                                      </Typography>
                                    </Grid>
                                    <Grid item xs={6} md={3}>
                                      <Typography style={{ fontSize: 11, color: subColor, textTransform: "uppercase", letterSpacing: 0.5 }}>
                                        Restante último bloco
                                      </Typography>
                                      <Typography
                                        style={{
                                          fontSize: 22,
                                          fontWeight: 700,
                                          color: remainder === 0 ? "#22c55e" : "#f59e0b",
                                        }}
                                      >
                                        {remainder === 0 ? blockSize : remainder}
                                      </Typography>
                                    </Grid>
                                    <Grid item xs={6} md={3}>
                                      <Typography style={{ fontSize: 11, color: subColor, textTransform: "uppercase", letterSpacing: 0.5 }}>
                                        Conexões usadas
                                      </Typography>
                                      <Typography style={{ fontSize: 22, fontWeight: 700, color: statColor }}>
                                        {conns}
                                      </Typography>
                                    </Grid>
                                  </>
                                )}
                              </Grid>

                              {/* Barra de progresso geral quando há estatísticas */}
                              {hasProgress && (
                                <Box mt={1.5}>
                                  <Box style={{ height: 10, borderRadius: 999, overflow: "hidden", display: "flex", background: isDark ? "rgba(255,255,255,0.08)" : "#eef2ff" }}>
                                    <Box style={{ width: `${effectiveTotal ? (delivered / effectiveTotal) * 100 : 0}%`, background: "linear-gradient(90deg,#16a34a,#22c55e)" }} />
                                    <Box style={{ width: `${effectiveTotal ? (failed / effectiveTotal) * 100 : 0}%`, background: "#dc2626" }} />
                                    <Box style={{ width: `${effectiveTotal ? (pending / effectiveTotal) * 100 : 0}%`, background: isDark ? "rgba(245,158,11,0.35)" : "#fde68a" }} />
                                  </Box>
                                  <Box mt={0.75} display="flex" gap={2} flexWrap="wrap" style={{ fontSize: 11, color: subColor }}>
                                    <span><b style={{ color: "#16a34a" }}>●</b> Enviados {delivered.toLocaleString("pt-BR")}</span>
                                    {failed > 0 && <span><b style={{ color: "#dc2626" }}>●</b> Falhas {failed.toLocaleString("pt-BR")}</span>}
                                    <span><b style={{ color: "#f59e0b" }}>●</b> Em aberto {pending.toLocaleString("pt-BR")}</span>
                                  </Box>
                                </Box>
                              )}

                              {useRotation && (
                                <Box mt={2}>
                                  <Typography style={{ fontSize: 11, color: subColor, marginBottom: 6 }}>
                                    Distribuição por conexão
                                  </Typography>
                                  <Box style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                                    {rotationWhatsappIds.map((wid, idx) => {
                                      const w = whatsapps.find((x) => x.id === wid);
                                      let realCount = 0;
                                      let sentForConn = 0;
                                      for (let b = 0; b < totalBlocks; b++) {
                                        if (b % conns !== idx) continue;
                                        const start = b * blockSize;
                                        const end = Math.min(start + blockSize, effectiveTotal);
                                        const blockLen = Math.max(0, end - start);
                                        realCount += blockLen;
                                        if (hasProgress) {
                                          const sentInBlock = Math.max(0, Math.min(blockLen, delivered - start));
                                          sentForConn += sentInBlock;
                                        }
                                      }
                                      const connPct = realCount > 0 ? Math.round((sentForConn / realCount) * 100) : 0;
                                      return (
                                        <Chip
                                          key={wid}
                                          size="small"
                                          label={
                                            hasProgress
                                              ? `${idx + 1}. ${w ? w.name : wid} — ${sentForConn.toLocaleString("pt-BR")}/${realCount.toLocaleString("pt-BR")} (${connPct}%)`
                                              : `${idx + 1}. ${w ? w.name : wid} — ${realCount.toLocaleString("pt-BR")}`
                                          }
                                          style={{
                                            background: hasProgress && connPct === 100
                                              ? (isDark ? "rgba(34,197,94,0.18)" : "#dcfce7")
                                              : (isDark ? "rgba(78,147,255,0.18)" : "#e0ecff"),
                                            color: hasProgress && connPct === 100
                                              ? (isDark ? "#bbf7d0" : "#15803d")
                                              : (isDark ? "#cfe0ff" : "#1d4ed8"),
                                            fontWeight: 500,
                                          }}
                                        />
                                      );
                                    })}
                                  </Box>
                                </Box>
                              )}

                              {/* Mapa visual de blocos — mostra quais já saíram e quais estão em aberto */}
                              {useRotation && totalBlocks > 1 && (
                                <Box mt={2}>
                                  <Box display="flex" alignItems="center" justifyContent="space-between" mb={0.75}>
                                    <Typography style={{ fontSize: 11, color: subColor }}>
                                      Status dos blocos ({totalBlocks})
                                    </Typography>
                                    {hasProgress && (
                                      <Typography style={{ fontSize: 11, color: subColor }}>
                                        {(() => {
                                          const fullDone = Math.floor(delivered / blockSize);
                                          const partial = delivered % blockSize > 0 ? 1 : 0;
                                          const doneCount = Math.min(totalBlocks, fullDone);
                                          const openCount = Math.max(0, totalBlocks - doneCount - partial);
                                          return `✓ ${doneCount} concluídos • ${partial ? "1 em andamento • " : ""}${openCount} em aberto`;
                                        })()}
                                      </Typography>
                                    )}
                                  </Box>
                                  <Box style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                                    {Array.from({ length: totalBlocks }).map((_, b) => {
                                      const start = b * blockSize;
                                      const end = Math.min(start + blockSize, effectiveTotal);
                                      const blockLen = Math.max(0, end - start);
                                      const sentInBlock = hasProgress
                                        ? Math.max(0, Math.min(blockLen, delivered - start))
                                        : 0;
                                      const blockPct = blockLen > 0 ? Math.round((sentInBlock / blockLen) * 100) : 0;
                                      const done = blockPct >= 100;
                                      const partial = blockPct > 0 && blockPct < 100;
                                      const connIdx = b % conns;
                                      const w = useRotation ? whatsapps.find((x) => x.id === rotationWhatsappIds[connIdx]) : null;
                                      const tooltip = `Bloco ${b + 1} • ${blockLen} contatos${w ? ` • ${w.name}` : ""}${hasProgress ? ` • ${sentInBlock}/${blockLen} enviados` : ""}`;
                                      return (
                                        <Tooltip key={b} title={tooltip} arrow>
                                          <Box
                                            style={{
                                              minWidth: 26,
                                              height: 24,
                                              padding: "0 6px",
                                              borderRadius: 6,
                                              display: "flex",
                                              alignItems: "center",
                                              justifyContent: "center",
                                              fontSize: 11,
                                              fontWeight: 600,
                                              cursor: "default",
                                              background: done
                                                ? (isDark ? "rgba(34,197,94,0.22)" : "#dcfce7")
                                                : partial
                                                ? (isDark ? "rgba(245,158,11,0.22)" : "#fef3c7")
                                                : (isDark ? "rgba(255,255,255,0.06)" : "#eef2ff"),
                                              color: done
                                                ? (isDark ? "#bbf7d0" : "#15803d")
                                                : partial
                                                ? (isDark ? "#fde68a" : "#a16207")
                                                : (isDark ? "rgba(255,255,255,0.65)" : "#475569"),
                                              border: done
                                                ? "1px solid rgba(34,197,94,0.45)"
                                                : partial
                                                ? "1px solid rgba(245,158,11,0.45)"
                                                : (isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid #dbeafe"),
                                            }}
                                          >
                                            {done ? "✓" : partial ? `${blockPct}%` : b + 1}
                                          </Box>
                                        </Tooltip>
                                      );
                                    })}
                                  </Box>
                                </Box>
                              )}

                              {/* Prévia: quanto disparar agora vs. próximo envio */}
                              {(() => {
                                const limitRaw = Number(sendNowLimit);
                                const hasLimit = Number.isFinite(limitRaw) && limitRaw > 0;
                                const sendNow = hasLimit ? Math.min(limitRaw, totalContacts) : totalContacts;
                                const leftOver = Math.max(0, totalContacts - sendNow);
                                const pct = totalContacts > 0 ? Math.round((sendNow / totalContacts) * 100) : 0;

                                return (
                                  <Box mt={2} pt={2} style={{ borderTop: isDark ? "1px dashed rgba(255,255,255,0.12)" : "1px dashed #d6e4ff" }}>
                                    <Grid container spacing={2} alignItems="center">
                                      <Grid item xs={12} md={4}>
                                        <TextField
                                          label="Disparar agora (qtd.)"
                                          type="number"
                                          size="small"
                                          variant="outlined"
                                          fullWidth
                                          placeholder={`Todos (${totalContacts})`}
                                          inputProps={{ min: 1, max: totalContacts }}
                                          value={sendNowLimit}
                                          onChange={(e) => setSendNowLimit(e.target.value)}
                                          disabled={!campaignEditable}
                                          helperText="Deixe vazio para enviar todos"
                                        />
                                      </Grid>
                                      <Grid item xs={6} md={4}>
                                        <Typography style={{ fontSize: 11, color: subColor, textTransform: "uppercase", letterSpacing: 0.5 }}>
                                          Vai sair agora
                                        </Typography>
                                        <Typography style={{ fontSize: 22, fontWeight: 700, color: "#2563eb" }}>
                                          {sendNow.toLocaleString("pt-BR")}
                                          <Typography component="span" style={{ fontSize: 12, color: subColor, marginLeft: 6 }}>
                                            ({pct}%)
                                          </Typography>
                                        </Typography>
                                      </Grid>
                                      <Grid item xs={6} md={4}>
                                        <Typography style={{ fontSize: 11, color: subColor, textTransform: "uppercase", letterSpacing: 0.5 }}>
                                          Fica para o próximo
                                        </Typography>
                                        <Typography
                                          style={{
                                            fontSize: 22,
                                            fontWeight: 700,
                                            color: leftOver === 0 ? "#22c55e" : "#f59e0b",
                                          }}
                                        >
                                          {leftOver.toLocaleString("pt-BR")}
                                        </Typography>
                                      </Grid>
                                    </Grid>

                                    {/* Barra de progresso visual */}
                                    <Box mt={1.5} style={{ height: 8, borderRadius: 999, overflow: "hidden", display: "flex", background: isDark ? "rgba(255,255,255,0.08)" : "#eef2ff" }}>
                                      <Box style={{ width: `${pct}%`, background: "linear-gradient(90deg,#2563eb,#4E93FF)" }} />
                                      <Box style={{ width: `${100 - pct}%`, background: leftOver === 0 ? "transparent" : (isDark ? "rgba(245,158,11,0.35)" : "#fde68a") }} />
                                    </Box>
                                    {leftOver > 0 && (
                                      <Typography style={{ fontSize: 11, color: subColor, marginTop: 6 }}>
                                        Restarão <b>{leftOver.toLocaleString("pt-BR")}</b> contatos para o próximo envio desta campanha.
                                      </Typography>
                                    )}

                                    {/* Estimativa de tempo do envio atual e do próximo */}
                                    {(() => {
                                      const msgInt = Math.max(0, Number(campaignSettings.messageInterval) || 0);
                                      const longerAfter = Math.max(0, Number(campaignSettings.longerIntervalAfter) || 0);
                                      const greaterInt = Math.max(0, Number(campaignSettings.greaterInterval) || 0);
                                      const lpEvery = Math.max(0, Number(campaignSettings.longPauseEvery) || 0);
                                      const lpDur = Math.max(0, Number(campaignSettings.longPauseDuration) || 0);

                                      if (msgInt <= 0 || sendNow <= 0) return null;

                                      // Tempo (em segundos) para enviar N mensagens em UMA conexão
                                      const secondsForStream = (n) => {
                                        if (n <= 0) return 0;
                                        let s = n * msgInt;
                                        if (longerAfter > 0 && greaterInt > 0) {
                                          s += Math.floor(n / longerAfter) * greaterInt;
                                        }
                                        if (lpEvery > 0 && lpDur > 0) {
                                          s += Math.floor(n / lpEvery) * lpDur;
                                        }
                                        return s;
                                      };

                                      // Com várias conexões, divide a carga em paralelo
                                      const perConn = Math.ceil(sendNow / conns);
                                      const perConnLeft = leftOver > 0 ? Math.ceil(leftOver / conns) : 0;
                                      const sendNowSecs = secondsForStream(perConn);
                                      const leftOverSecs = secondsForStream(perConnLeft);

                                      const fmtDur = (sec) => {
                                        if (sec <= 0) return "—";
                                        const h = Math.floor(sec / 3600);
                                        const m = Math.floor((sec % 3600) / 60);
                                        const s = Math.floor(sec % 60);
                                        if (h > 0) return `${h}h ${m}min`;
                                        if (m > 0) return `${m}min ${s}s`;
                                        return `${s}s`;
                                      };
                                      const fmtTime = (mom) => mom.format("DD/MM HH:mm");

                                      const startMom = values.scheduledAt
                                        ? moment(values.scheduledAt)
                                        : moment();
                                      const endMom = startMom.clone().add(sendNowSecs, "seconds");
                                      const nextStartMom = endMom.clone();
                                      const nextEndMom = nextStartMom.clone().add(leftOverSecs, "seconds");

                                      return (
                                        <Box mt={2} pt={2} style={{ borderTop: isDark ? "1px dashed rgba(255,255,255,0.12)" : "1px dashed #d6e4ff" }}>
                                          <Typography style={{ fontSize: 12, fontWeight: 700, color: statColor, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                                            ⏱️ Estimativa de tempo
                                          </Typography>
                                          <Grid container spacing={2}>
                                            <Grid item xs={12} md={leftOver > 0 ? 6 : 12}>
                                              <Box p={1.5} style={{ borderRadius: 10, background: isDark ? "rgba(37,99,235,0.12)" : "#eff6ff", border: isDark ? "1px solid rgba(37,99,235,0.35)" : "1px solid #bfdbfe" }}>
                                                <Typography style={{ fontSize: 11, color: subColor, textTransform: "uppercase", letterSpacing: 0.5 }}>
                                                  Envio atual
                                                </Typography>
                                                <Typography style={{ fontSize: 15, fontWeight: 700, color: "#2563eb", marginTop: 2 }}>
                                                  Duração: {fmtDur(sendNowSecs)}
                                                </Typography>
                                                <Typography style={{ fontSize: 12, color: subColor, marginTop: 2 }}>
                                                  Início: <b style={{ color: statColor }}>{fmtTime(startMom)}</b>
                                                </Typography>
                                                <Typography style={{ fontSize: 12, color: subColor }}>
                                                  Término previsto: <b style={{ color: statColor }}>{fmtTime(endMom)}</b>
                                                </Typography>
                                              </Box>
                                            </Grid>
                                            {leftOver > 0 && (
                                              <Grid item xs={12} md={6}>
                                                <Box p={1.5} style={{ borderRadius: 10, background: isDark ? "rgba(245,158,11,0.10)" : "#fffbeb", border: isDark ? "1px solid rgba(245,158,11,0.35)" : "1px solid #fde68a" }}>
                                                  <Typography style={{ fontSize: 11, color: subColor, textTransform: "uppercase", letterSpacing: 0.5 }}>
                                                    Próximo envio ({leftOver.toLocaleString("pt-BR")} restantes)
                                                  </Typography>
                                                  <Typography style={{ fontSize: 15, fontWeight: 700, color: "#d97706", marginTop: 2 }}>
                                                    Duração: {fmtDur(leftOverSecs)}
                                                  </Typography>
                                                  <Typography style={{ fontSize: 12, color: subColor, marginTop: 2 }}>
                                                    Início estimado: <b style={{ color: statColor }}>{fmtTime(nextStartMom)}</b>
                                                  </Typography>
                                                  <Typography style={{ fontSize: 12, color: subColor }}>
                                                    Término estimado: <b style={{ color: statColor }}>{fmtTime(nextEndMom)}</b>
                                                  </Typography>
                                                </Box>
                                              </Grid>
                                            )}
                                          </Grid>
                                          <Typography style={{ fontSize: 10, color: subColor, marginTop: 8, fontStyle: "italic" }}>
                                            Cálculo baseado no intervalo entre mensagens ({msgInt}s){longerAfter > 0 && greaterInt > 0 ? `, pausa de ${greaterInt}s a cada ${longerAfter} envios` : ""}{lpEvery > 0 && lpDur > 0 ? ` e pausa longa de ${lpDur}s a cada ${lpEvery} envios` : ""}{conns > 1 ? `, distribuído em ${conns} conexões em paralelo` : ""}.
                                          </Typography>
                                        </Box>
                                      );
                                    })()}
                                  </Box>
                                );
                              })()}
                            </Box>
                          );
                        })()}

                      </CardContent>
                    </Card>
                  </Grid>






                  {/* Aviso de mídia do template (quando aplicável) */}
                  {isOficialSelected && selectedTemplateId && (() => {
                    const tpl = oficialTemplates.find(t => t.id === selectedTemplateId);
                    if (!tpl) return null;
                    const headerComp = (tpl.components || []).find(
                      c => (c.type || "").toLowerCase() === "header" &&
                           ["IMAGE", "VIDEO", "DOCUMENT"].includes((c.format || "").toUpperCase())
                    );
                    if (!headerComp) return null;
                    const hasOwnMedia = !!tpl.mediaPath;
                    const hasSample = !!headerComp.example;
                    const fmt = (headerComp.format || "").toUpperCase();
                    return (
                      <Grid xs={12} item>
                        <FormHelperText style={{ color: hasOwnMedia || hasSample ? "#2e7d32" : "#d32f2f", marginTop: 0 }}>
                          {hasOwnMedia
                            ? i18n.t("campaignModalExtraV2.templateMediaAuto", { format: fmt, name: tpl.mediaName || i18n.t("campaignModalExtraV2.templateMediaAttached") })
                            : hasSample
                              ? i18n.t("campaignModalExtraV2.templateMediaSample", { format: fmt })
                              : i18n.t("campaignModalExtraV2.templateMediaMissing", { format: fmt })}
                        </FormHelperText>
                      </Grid>
                    );
                  })()}


                  {isOficialSelected && selectedTemplateId && (() => {
                    const tpl = oficialTemplates.find(t => t.id === selectedTemplateId);
                    if (!tpl) return null;
                    const re = /\{\{([^}]+)\}\}/g;
                    const SECTION_LABELS = {
                      header: i18n.t("campaignModalExtraV2.sectionHeader"),
                      body: i18n.t("campaignModalExtraV2.sectionBody"),
                      footer: i18n.t("campaignModalExtraV2.sectionFooter"),
                      buttons: i18n.t("campaignModalExtraV2.sectionButtons"),
                    };
                    // Detecta placeholders dedupando por chave, mas registrando
                    // todas as seções em que cada variável aparece. Assim a mesma
                    // {{1}} usada em header e body gera UM campo controlando ambas.
                    const varsMap = new Map();
                    const collect = (sectionKey, text) => {
                      if (!text) return;
                      const localRe = /\{\{([^}]+)\}\}/g;
                      let m;
                      while ((m = localRe.exec(text)) !== null) {
                        const key = m[1].trim();
                        if (!key) continue;
                        const entry = varsMap.get(key) || { key, sections: [] };
                        if (!entry.sections.includes(sectionKey)) {
                          entry.sections.push(sectionKey);
                        }
                        varsMap.set(key, entry);
                      }
                    };
                    (tpl.components || []).forEach(c => {
                      const t = (c.type || "").toLowerCase();
                      if (["header", "body", "footer"].includes(t)) {
                        collect(t, c.text || "");
                      } else if (t === "buttons" && c.buttons) {
                        try {
                          const parsed = typeof c.buttons === "string"
                            ? JSON.parse(c.buttons)
                            : c.buttons;
                          const arr = Array.isArray(parsed) ? parsed : [parsed];
                          arr.forEach(b => {
                            collect("buttons", b?.text || "");
                            collect("buttons", b?.url || "");
                          });
                        } catch (_) { /* ignore */ }
                      }
                    });
                    const vars = Array.from(varsMap.values());
                    const renderWithVars = (text) => {
                      if (!text) return "";
                      return text.replace(/\{\{([^}]+)\}\}/g, (full, k) => {
                        const v = templateVarValues[k.trim()];
                        return v && String(v).trim() ? v : full;
                      });
                    };
                    const headerComp = (tpl.components || []).find(
                      c => (c.type || "").toLowerCase() === "header" && (c.format || "TEXT").toUpperCase() === "TEXT"
                    );
                    const bodyComp = (tpl.components || []).find(c => (c.type || "").toLowerCase() === "body");
                    const footerComp = (tpl.components || []).find(c => (c.type || "").toLowerCase() === "footer");
                    const buttonsComp = (tpl.components || []).find(c => (c.type || "").toLowerCase() === "buttons");
                    let buttonsArr = [];
                    if (buttonsComp?.buttons) {
                      try {
                        const parsed = typeof buttonsComp.buttons === "string"
                          ? JSON.parse(buttonsComp.buttons)
                          : buttonsComp.buttons;
                        buttonsArr = Array.isArray(parsed) ? parsed : [parsed];
                      } catch (_) { buttonsArr = []; }
                    }
                    const hasContent =
                      vars.length > 0 ||
                      headerComp?.text ||
                      bodyComp?.text ||
                      footerComp?.text ||
                      buttonsArr.length > 0;
                    if (!hasContent) return null;
                    return (
                      <Grid xs={12} item>
                        {vars.length > 0 && (
                        <Box style={{
                          border: "1px solid #e0e0e0",
                          borderRadius: 8,
                          padding: 12,
                          backgroundColor: "#fafafa",
                          marginTop: 4,
                        }}>
                          <Typography variant="subtitle2" style={{ fontWeight: 600, marginBottom: 8 }}>
                            {i18n.t("campaignModalExtraV2.templateVarsTitle")}
                          </Typography>
                          <Typography variant="caption" color="textSecondary" style={{ display: "block", marginBottom: 12 }}>
                            {i18n.t("campaignModalExtraV2.templateVarsDesc")}
                          </Typography>
                          <Grid container spacing={2}>
                            {vars.map(v => (
                              <Grid item xs={12} sm={6} md={4} key={v.key}>
                                <TextField
                                  fullWidth
                                  size="small"
                                  variant="outlined"
                                  label={`{{${v.key}}}`}
                                  placeholder={"Use os tokens abaixo (ex.: {nome}) para puxar do contato"}
                                  helperText={
                                    v.sections.length > 1
                                      ? i18n.t("campaignModalExtraV2.varAppearsIn", { sections: v.sections.map(s => SECTION_LABELS[s] || s).join(" + ") })
                                      : i18n.t("campaignModalExtraV2.varSection", { section: SECTION_LABELS[v.sections[0]] || v.sections[0] })
                                  }
                                  value={templateVarValues[v.key] || ""}
                                  onChange={(e) => {
                                    const value = e.target.value;
                                    setTemplateVarValues(prev => ({
                                      ...prev,
                                      [v.key]: value,
                                    }));
                                  }}
                                  disabled={!campaignEditable}
                                />
                                {/* Tokens dinâmicos – substituídos automaticamente no disparo pelos dados do contato */}
                                <Typography variant="caption" color="textSecondary" style={{ display: "block", marginTop: 4, fontSize: 10 }}>
                                  Clique para preencher com o dado do contato:
                                </Typography>
                                <Box style={{ display: "flex", flexWrap: "wrap", gap: 4, marginTop: 4 }}>
                                  {[
                                    { label: "Nome", token: "{nome}" },
                                    { label: "1º nome", token: "{primeiroNome}" },
                                    { label: "Email", token: "{email}" },
                                    { label: "Número", token: "{numero}" },
                                    { label: "Saudação", token: "{greeting}" },
                                  ].map(t => (
                                    <Chip
                                      key={t.token}
                                      label={`+ ${t.label}`}
                                      size="small"
                                      variant="outlined"
                                      onClick={() => {
                                        if (!campaignEditable) return;
                                        // Substitui pelo token para o backend resolver com o dado do contato no disparo
                                        setTemplateVarValues(prev => ({
                                          ...prev,
                                          [v.key]: t.token,
                                        }));
                                      }}
                                      style={{ fontSize: 10, height: 22, cursor: campaignEditable ? "pointer" : "not-allowed" }}
                                      disabled={!campaignEditable}
                                    />
                                  ))}
                                </Box>
                              </Grid>
                            ))}
                          </Grid>
                        </Box>
                        )}

                        <Box style={{
                          marginTop: 12,
                          border: "1px solid #d6e3f5",
                          borderRadius: 8,
                          padding: 12,
                          backgroundColor: "#eef4ff",
                        }}>
                          <Typography variant="subtitle2" style={{ fontWeight: 600, marginBottom: 8 }}>
                            {i18n.t("campaignModalExtraV2.messagePreviewTitle")}
                          </Typography>
                          <Typography variant="caption" color="textSecondary" style={{ display: "block", marginBottom: 8 }}>
                            {i18n.t("campaignModalExtraV2.messagePreviewDesc")}
                          </Typography>
                          <Box style={{
                            backgroundColor: "#fff",
                            borderRadius: 8,
                            padding: 12,
                            boxShadow: "0 1px 2px rgba(0,0,0,0.05)",
                            border: "1px solid #e6ecf5",
                            maxWidth: 420,
                          }}>
                            {headerComp?.text && (
                              <Typography style={{ fontWeight: 700, fontSize: 14, marginBottom: 6, whiteSpace: "pre-wrap" }}>
                                {renderWithVars(headerComp.text)}
                              </Typography>
                            )}
                            {bodyComp?.text && (
                              <Typography style={{ fontSize: 14, color: "#222", whiteSpace: "pre-wrap", lineHeight: 1.4 }}>
                                {renderWithVars(bodyComp.text)}
                              </Typography>
                            )}
                            {footerComp?.text && (
                              <Typography style={{ fontSize: 12, color: "#888", marginTop: 8, whiteSpace: "pre-wrap" }}>
                                {renderWithVars(footerComp.text)}
                              </Typography>
                            )}
                            {buttonsArr.length > 0 && (
                              <Box style={{ marginTop: 10, borderTop: "1px solid #eee", paddingTop: 8, display: "flex", flexDirection: "column", gap: 4 }}>
                                {buttonsArr.map((b, i) => (
                                  <Box key={i} style={{
                                    textAlign: "center",
                                    color: "#1976d2",
                                    fontSize: 13,
                                    fontWeight: 500,
                                    padding: "6px 8px",
                                    border: "1px solid #e0e0e0",
                                    borderRadius: 4,
                                    backgroundColor: "#fafafa",
                                  }}>
                                    {renderWithVars(b?.text || b?.url || i18n.t("campaignModalExtraV2.buttonFallback"))}
                                  </Box>
                                ))}
                              </Box>
                            )}
                          </Box>
                        </Box>
                      </Grid>
                    );
                  })()}
                  </>)}

                  {currentStep === 3 && (<>
                  <Grid xs={12} item>
                    <div id="cm-step-3" className="cm-v2-section-title"><ScheduleIcon fontSize="small" />{i18n.t("campaignWizard.scheduleTitle")}</div>
                  </Grid>
                  <Grid xs={12} sm={6} md={6} item>
                    <Field
                      as={TextField}
                      label={i18n.t("campaigns.dialog.form.scheduledAt")}
                      name="scheduledAt"
                      error={touched.scheduledAt && Boolean(errors.scheduledAt)}
                      helperText={
                        (touched.scheduledAt && errors.scheduledAt) ||
                        i18n.t("campaignModalExtraV2.scheduleTimezoneHelper", { tz: userTimezone, offset: moment.tz(userTimezone).format("Z") })
                      }
                      variant="outlined"
                      margin="dense"
                      type="datetime-local"
                      InputLabelProps={{
                        shrink: true,
                      }}
                      fullWidth
                      className={classes.textField}
                      disabled={!campaignEditable}
                    />
                  </Grid>

                  {/* OPÇÃO: pular contatos já disparados em campanhas anteriores */}
                  <Grid xs={12} item>
                    <FormControlLabel
                      control={
                        <Field
                          as={Switch}
                          name="skipAlreadySent"
                          checked={!!values.skipAlreadySent}
                          onChange={(e) => setFieldValue('skipAlreadySent', e.target.checked)}
                          disabled={!campaignEditable}
                        />
                      }
                      label={i18n.t("campaignExtras.skipAlreadySent", "Não reenviar para contatos que já receberam em campanhas anteriores (mesma lista)")}
                    />
                  </Grid>

                  {/* SEÇÃO DE RECORRÊNCIA */}
                  <Grid xs={12} item>
                    <Card className={classes.recurrenceCard}>
                      <CardContent>
                        <Box display="flex" alignItems="center" mb={2}>
                          <RepeatIcon className={classes.recurrenceIcon} />
                          <Typography variant="h6">
                            {i18n.t("campaignModal.recurrenceTitle")}
                          </Typography>
                        </Box>
                        
                        <Grid spacing={2} container>
                          <Grid xs={12} item>
                            <FormControlLabel
                              control={
                                <Field
                                  as={Switch}
                                  name="isRecurring"
                                  checked={values.isRecurring}
                                  onChange={(e) => {
                                    setFieldValue('isRecurring', e.target.checked);
                                    if (!e.target.checked) {
                                      setPreviewExecutions([]);
                                      setShowPreview(false);
                                    }
                                  }}
                                  disabled={!campaignEditable}
                                />
                              }
                              label={i18n.t("campaignModal.enableRecurrence")}
                            />
                          </Grid>

                          <Grid xs={12} item style={{ padding: 0 }}>
                          <Collapse in={values.isRecurring} style={{ width: "100%" }}>
                            <Grid spacing={2} container>
                              <Grid xs={12} md={3} item>
                                <FormControl
                                  variant="outlined"
                                  margin="dense"
                                  fullWidth
                                  error={touched.recurrenceType && Boolean(errors.recurrenceType)}
                                >
                                  <InputLabel>{i18n.t("campaignModal.recurrenceType")}</InputLabel>
                                  <Field
                                    as={Select}
                                    name="recurrenceType"
                                    label={i18n.t("campaignModal.recurrenceType")}
                                    disabled={!campaignEditable}
                                    onChange={(e) => {
                                      setFieldValue('recurrenceType', e.target.value);
                                      setFieldValue('recurrenceDaysOfWeek', []);
                                      setFieldValue('recurrenceDayOfMonth', 1);
                                    }}
                                  >
                                    <MenuItem value="minutely">{i18n.t("campaignModal.minutely")}</MenuItem>
                                    <MenuItem value="hourly">{i18n.t("campaignModal.hourly")}</MenuItem>
                                    <MenuItem value="daily">{i18n.t("campaignModal.daily")}</MenuItem>
                                    <MenuItem value="weekly">{i18n.t("campaignModal.weekly")}</MenuItem>
                                    <MenuItem value="biweekly">{i18n.t("campaignModal.biweekly")}</MenuItem>
                                    <MenuItem value="monthly">{i18n.t("campaignModal.monthly")}</MenuItem>
                                    <MenuItem value="yearly">{i18n.t("campaignModal.yearly")}</MenuItem>
                                  </Field>
                                  {touched.recurrenceType && errors.recurrenceType && (
                                    <FormHelperText error>{errors.recurrenceType}</FormHelperText>
                                  )}
                                </FormControl>
                              </Grid>

                              <Grid xs={12} md={3} item>
                                <Field
                                  as={TextField}
                                  name="recurrenceInterval"
                                  label={i18n.t("campaignModal.interval")}
                                  type="number"
                                  variant="outlined"
                                  margin="dense"
                                  fullWidth
                                  inputProps={{ min: 1 }}
                                  error={touched.recurrenceInterval && Boolean(errors.recurrenceInterval)}
                                  helperText={
                                    touched.recurrenceInterval && errors.recurrenceInterval ||
                                    i18n.t("campaignModal.everyInterval", {
                                      count: values.recurrenceInterval || 1,
                                      unit: values.recurrenceType === 'minutely' ? i18n.t("campaignModal.minuteUnit") :
                                        values.recurrenceType === 'hourly' ? i18n.t("campaignModal.hourUnit") :
                                        values.recurrenceType === 'daily' ? i18n.t("campaignModal.dayUnit") :
                                        values.recurrenceType === 'weekly' ? i18n.t("campaignModal.weekUnit") :
                                        values.recurrenceType === 'biweekly' ? i18n.t("campaignModal.biweekUnit") :
                                        values.recurrenceType === 'monthly' ? i18n.t("campaignModal.monthUnit") :
                                        values.recurrenceType === 'yearly' ? i18n.t("campaignModal.yearUnit") : ''
                                    })
                                  }
                                  disabled={!campaignEditable}
                                />
                              </Grid>

                              {/* Dias da semana para recorrência semanal */}
                              {values.recurrenceType === 'weekly' && (
                                <Grid xs={12} md={6} item>
                                  <Typography variant="subtitle2" gutterBottom>
                                    {i18n.t("campaignModal.daysOfWeek")}
                                  </Typography>
                                  <FormGroup row>
                                    {daysOfWeekOptions.map((day) => (
                                      <FormControlLabel
                                        key={day.value}
                                        control={
                                          <Checkbox
                                            checked={values.recurrenceDaysOfWeek.includes(day.value)}
                                            onChange={(e) => {
                                              const currentDays = values.recurrenceDaysOfWeek || [];
                                              if (e.target.checked) {
                                                setFieldValue('recurrenceDaysOfWeek', [...currentDays, day.value]);
                                              } else {
                                                setFieldValue('recurrenceDaysOfWeek', 
                                                  currentDays.filter(d => d !== day.value)
                                                );
                                              }
                                            }}
                                            disabled={!campaignEditable}
                                          />
                                        }
                                        label={day.label.substring(0, 3)}
                                      />
                                    ))}
                                  </FormGroup>
                                  {touched.recurrenceDaysOfWeek && errors.recurrenceDaysOfWeek && (
                                    <FormHelperText error>{errors.recurrenceDaysOfWeek}</FormHelperText>
                                  )}
                                </Grid>
                              )}

                              {/* Dia do mês para recorrência mensal */}
                              {values.recurrenceType === 'monthly' && (
                                <Grid xs={12} md={3} item>
                                  <Field
                                    as={TextField}
                                    name="recurrenceDayOfMonth"
                                    label={i18n.t("campaignModal.dayOfMonth")}
                                    type="number"
                                    variant="outlined"
                                    margin="dense"
                                    fullWidth
                                    inputProps={{ min: 1, max: 31 }}
                                    error={touched.recurrenceDayOfMonth && Boolean(errors.recurrenceDayOfMonth)}
                                    helperText={
                                      touched.recurrenceDayOfMonth && errors.recurrenceDayOfMonth ||
                                      i18n.t("campaignModal.dayOfMonthHelper")
                                    }
                                    disabled={!campaignEditable}
                                  />
                                </Grid>
                              )}

                              <Grid xs={12} sm={6} md={6} item>
                                <Field
                                  as={TextField}
                                  name="recurrenceEndDate"
                                  label={i18n.t("campaignModal.endDate")}
                                  type="date"
                                  variant="outlined"
                                  margin="dense"
                                  fullWidth
                                  InputLabelProps={{ shrink: true }}
                                  error={touched.recurrenceEndDate && Boolean(errors.recurrenceEndDate)}
                                  helperText={
                                    touched.recurrenceEndDate && errors.recurrenceEndDate ||
                                    i18n.t("campaignModal.emptyRecurrence")
                                  }
                                  disabled={!campaignEditable}
                                />
                              </Grid>

                              <Grid xs={12} sm={6} md={6} item>
                                <Field
                                  as={TextField}
                                  name="maxExecutions"
                                  label={i18n.t("campaignModal.maxExecutions")}
                                  type="number"
                                  variant="outlined"
                                  margin="dense"
                                  fullWidth
                                  inputProps={{ min: 1 }}
                                  error={touched.maxExecutions && Boolean(errors.maxExecutions)}
                                  helperText={
                                    touched.maxExecutions && errors.maxExecutions ||
                                    i18n.t("campaignModal.emptyRecurrence")
                                  }
                                  disabled={!campaignEditable}
                                />
                              </Grid>

                              <Grid xs={12} sm={6} md={6} item>
                                <Button
                                  variant="outlined"
                                  startIcon={<VisibilityIcon />}
                                  onClick={() => {
                                    handlePreviewRecurrence(values);
                                    setShowPreview(!showPreview);
                                  }}
                                  disabled={!values.recurrenceType || !values.scheduledAt}
                                  fullWidth
                                  style={{ marginTop: 8 }}
                                >
                                  {showPreview ? i18n.t("campaignModal.hideExecutions") : i18n.t("campaignModal.showExecutions")} {i18n.t("campaignModal.nextExecutions")}
                                </Button>
                              </Grid>

                              {/* Preview das execuções */}
                              <Collapse in={showPreview && previewExecutions.length > 0}>
                                <Grid xs={12} item>
                                  <Card className={classes.previewCard}>
                                    <CardContent>
                                      <Typography variant="subtitle2" gutterBottom>
                                        {i18n.t("campaignModal.next5Executions")}
                                      </Typography>
                                      <List dense>
                                        {previewExecutions.slice(0, 5).map((execution, index) => (
                                          <ListItem key={index} divider>
                                            <ListItemText
                                              primary={i18n.t("campaignModal.nthExecution", { n: index + 1 })}
                                              secondary={typeof execution === 'string' ? execution : moment(execution).format('DD/MM/YYYY HH:mm')}
                                            />
                                          </ListItem>
                                        ))}
                                      </List>
                                    </CardContent>
                                  </Card>
                                </Grid>
                              </Collapse>
                            </Grid>
                          </Collapse>
                          </Grid>
                        </Grid>
                      </CardContent>
                    </Card>
                  </Grid>
                  </>)}

                  {currentStep === 4 && (<>
                  <Grid xs={12} item>
                    <div id="cm-step-4" className="cm-v2-section-title"><ConfirmationNumberIcon fontSize="small" />{i18n.t("campaignWizard.ticketTitle")}</div>
                  </Grid>
                  <Grid xs={12} sm={6} md={6} item>
                    <FormControl
                      variant="outlined"
                      margin="dense"
                      fullWidth
                      className={classes.formControl}
                    >
                      <InputLabel id="openTicket-selection-label">
                        {i18n.t("campaigns.dialog.form.openTicket")}
                      </InputLabel>
                      <Field
                        as={Select}
                        label={i18n.t("campaigns.dialog.form.openTicket")}
                        placeholder={i18n.t("campaigns.dialog.form.openTicket")}
                        labelId="openTicket-selection-label"
                        id="openTicket"
                        name="openTicket"
                        error={touched.openTicket && Boolean(errors.openTicket)}
                        disabled={!campaignEditable}
                      >
                        <MenuItem value={"enabled"}>{i18n.t("campaigns.dialog.form.enabledOpenTicket")}</MenuItem>
                        <MenuItem value={"disabled"}>{i18n.t("campaigns.dialog.form.disabledOpenTicket")}</MenuItem>
                      </Field>
                    </FormControl>
                  </Grid>

                  {/* SELECIONAR USUARIO */}
                  <Grid xs={12} sm={6} md={6} item>
                    <Autocomplete
                      style={{ marginTop: '8px' }}
                      variant="outlined"
                      margin="dense"
                      className={classes.formControl}
                      getOptionLabel={(option) => `${option.name}`}
                      value={selectedUser}
                      size="small"
                      onChange={(e, newValue) => {
                        setSelectedUser(newValue);
                        if (newValue != null && Array.isArray(newValue.queues)) {
                          if (newValue.queues.length === 1) {
                            setSelectedQueue(newValue.queues[0].id);
                          }
                          setQueues(newValue.queues);
                        } else {
                          setQueues(allQueues);
                          setSelectedQueue("");
                        }
                      }}
                      options={options}
                      filterOptions={filterOptions}
                      freeSolo
                      fullWidth
                      autoHighlight
                      disabled={!campaignEditable || values.openTicket === 'disabled'}
                      noOptionsText={i18n.t("transferTicketModal.noOptions")}
                      loading={loading}
                      renderOption={option => (<span> <UserStatusIcon user={option} /> {option.name}</span>)}
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          label={i18n.t("transferTicketModal.fieldLabel")}
                          variant="outlined"
                          onChange={(e) => setSearchParam(e.target.value)}
                          InputProps={{
                            ...params.InputProps,
                            endAdornment: (
                              <React.Fragment>
                                {loading ? (
                                  <CircularProgress color="inherit" size={20} />
                                ) : null}
                                {params.InputProps.endAdornment}
                              </React.Fragment>
                            ),
                          }}
                        />
                      )}
                    />
                  </Grid>

                  <Grid xs={12} sm={6} md={6} item>
                    <FormControl
                      variant="outlined"
                      margin="dense"
                      fullWidth
                      className={classes.formControl}
                    >
                      <InputLabel>
                        {i18n.t("transferTicketModal.fieldQueueLabel")}
                      </InputLabel>
                      <Select
                        value={selectedQueue}
                        onChange={(e) => setSelectedQueue(e.target.value)}
                        label={i18n.t("transferTicketModal.fieldQueuePlaceholder")}
                        required={!isNil(selectedUser)}
                        disabled={!campaignEditable || values.openTicket === 'disabled'}
                      >
                        {queues.map((queue) => (
                          <MenuItem key={queue.id} value={queue.id}>
                            {queue.name}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>

                  <Grid xs={12} sm={6} md={6} item>
                    <FormControl
                      variant="outlined"
                      margin="dense"
                      fullWidth
                      className={classes.formControl}
                    >
                      <InputLabel id="statusTicket-selection-label">
                        {i18n.t("campaigns.dialog.form.statusTicket")}
                      </InputLabel>
                      <Field
                        as={Select}
                        label={i18n.t("campaigns.dialog.form.statusTicket")}
                        placeholder={i18n.t("campaigns.dialog.form.statusTicket")}
                        labelId="statusTicket-selection-label"
                        id="statusTicket"
                        name="statusTicket"
                        error={touched.statusTicket && Boolean(errors.statusTicket)}
                        disabled={!campaignEditable || values.openTicket === 'disabled'}
                      >
                        <MenuItem value={"closed"}>{i18n.t("campaigns.dialog.form.closedTicketStatus")}</MenuItem>
                        <MenuItem value={"pending"}>{i18n.t("campaigns.dialog.form.pendingTicketStatus")}</MenuItem>
                        <MenuItem value={"open"}>{i18n.t("campaigns.dialog.form.openTicketStatus")}</MenuItem>
                      </Field>
                    </FormControl>
                  </Grid>
                  </>)}

                  {currentStep === 5 && (<>
                  {/* LAYOUT DUAS COLUNAS: Mensagem + Preview */}
                  <Grid xs={12} item>
                    <div id="cm-step-5" className="cm-v2-section-title"><ChatBubbleOutlineIcon fontSize="small" />{i18n.t("campaignWizard.messageTitle")}</div>
                  </Grid>
                  <Grid xs={12} item>
                    <Grid spacing={2} container>
                      {/* Coluna única - Campo de Mensagem (preview vai no celular à direita) */}
                       <Grid xs={12} item>

                        <Typography variant="subtitle2" style={{ marginBottom: 8, fontWeight: 600 }}>
                          {i18n.t("campaignModal.campaignMessage")}
                        </Typography>
                        {/* "Gerar 5 variantes da mensagem" com IA — pega o texto já
                            digitado em Mensagem 1 e preenche as abas Variação 2..5
                            automaticamente. */}
                        {!isOficialSelected && !values.confirmation && (
                          <Box
                            onClick={() => !generatingVariants && campaignEditable && generateVariantsWithAi(setFieldValue, values)}
                            style={{
                              border: isDark ? "1px dashed rgba(76,175,80,0.5)" : "1px dashed #66bb6a",
                              borderRadius: 8,
                              padding: 12,
                              marginBottom: 10,
                              display: "flex",
                              alignItems: "flex-start",
                              gap: 10,
                              cursor: campaignEditable ? "pointer" : "default",
                              opacity: campaignEditable ? 1 : 0.6,
                              backgroundColor: isDark ? "rgba(76,175,80,0.06)" : "rgba(102,187,106,0.06)"
                            }}
                          >
                            {generatingVariants ? (
                              <CircularProgress size={22} style={{ color: "#66bb6a", marginTop: 2 }} />
                            ) : (
                              <EmojiObjectsIcon style={{ color: "#66bb6a", marginTop: 2 }} />
                            )}
                            <Box>
                              <Typography variant="body2" style={{ fontWeight: 600 }}>
                                {i18n.t("campaignModal.generateVariantsTitle")}
                              </Typography>
                              <Typography variant="caption" color="textSecondary">
                                {generatingVariants
                                  ? i18n.t("campaignModal.generatingVariants")
                                  : i18n.t("campaignModal.generateVariantsDesc")}
                              </Typography>
                            </Box>
                          </Box>
                        )}
                        {/* Chips de variáveis clicáveis - ocultos para API Oficial */}
                        {!isOficialSelected && (
                        <Box display="flex" flexWrap="wrap" style={{ gap: 4, marginBottom: 8 }}>
                          {[
                            { label: i18n.t("campaignModal.varName"), value: "{nome}" },
                            { label: i18n.t("campaignModal.varNumber"), value: "{numero}" },
                            { label: i18n.t("campaignModal.varEmail"), value: "{email}" },
                            { label: i18n.t("campaignModal.varGreeting"), value: "{greeting}" },
                            { label: i18n.t("campaignModal.varProtocol"), value: "{protocol}" },
                            { label: i18n.t("campaignModal.varFirstName"), value: "{primeiroNome}" },
                            { label: i18n.t("campaignModal.varAgent"), value: "{atendente}" },
                          ].map((v) => (
                            <Chip
                              key={v.value}
                              label={v.label}
                              size="small"
                              color="primary"
                              variant="outlined"
                              clickable
                              disabled={!campaignEditable && campaign.status !== "CANCELADA"}
                              onClick={() => {
                                const targetSlot = values.confirmation ? "message1" : selectedVariationSlot;
                                const field = document.getElementById(targetSlot);
                                if (field) {
                                  const start = field.selectionStart || 0;
                                  const end = field.selectionEnd || 0;
                                  const current = values[targetSlot] || "";
                                  const newVal = current.substring(0, start) + v.value + current.substring(end);
                                  setFieldValue(targetSlot, newVal);
                                  setTimeout(() => {
                                    field.focus();
                                    const pos = start + v.value.length;
                                    field.setSelectionRange(pos, pos);
                                  }, 50);
                                } else {
                                  setFieldValue(targetSlot, (values[targetSlot] || "") + v.value);
                                }
                              }}
                              style={{ cursor: "pointer" }}
                            />
                          ))}
                        </Box>
                        )}
                        {/* Abas de variação de mensagem (message1..message5) — o disparo
                            já sorteia entre as variações preenchidas por contato, pra
                            reduzir padrão repetitivo de texto. Só aparece fora do modo
                            "confirmation" (que usa message1 + confirmationMessage1 num
                            fluxo próprio) e fora da API Oficial (que usa template). */}
                        {!isOficialSelected && !values.confirmation && (
                          <Box display="flex" flexWrap="wrap" style={{ gap: 6, marginBottom: 8 }}>
                            {["message1", "message2", "message3", "message4", "message5"].map((slot, i) => {
                              const filled = !!(values[slot] && String(values[slot]).trim());
                              const selected = selectedVariationSlot === slot;
                              return (
                                <Chip
                                  key={slot}
                                  label={`${i18n.t("campaignModal.variationLabel")} ${i + 1}${filled ? " ✓" : ""}`}
                                  size="small"
                                  clickable
                                  color={selected ? "primary" : "default"}
                                  variant={selected ? "default" : "outlined"}
                                  onClick={() => setSelectedVariationSlot(slot)}
                                  style={{ cursor: "pointer", fontWeight: selected ? 600 : 400 }}
                                />
                              );
                            })}
                          </Box>
                        )}
                        {isOficialSelected ? (
                          <Box>
                            <Box p={2} style={{ backgroundColor: isDark ? "#1a1c2e" : "#f5f5f5", borderRadius: 8, textAlign: "center", marginBottom: 12 }}>
                              <Typography variant="body2" color="textSecondary">
                                {i18n.t("campaignModal.apiOfficialNote")}
                              </Typography>
                            </Box>
                            <Box
                              p={1.5}
                              style={{
                                backgroundColor: isDark ? "#3d2200" : "#fff3e0",
                                border: isDark ? "1px solid #e65100" : "1px solid #ffb74d",
                                borderRadius: 8,
                                marginBottom: 12,
                                display: "flex",
                                alignItems: "flex-start",
                                gap: 8
                              }}
                            >
                              <Typography
                                variant="body2"
                                style={{ color: isDark ? "#ffb74d" : "#e65100", fontSize: 12, lineHeight: 1.4 }}
                              >
                                {i18n.t("campaignModal.apiOfficialNoFollowUp")}
                              </Typography>
                            </Box>
                            {/* Campos de variáveis do template (quando houver) */}
                            {isOficialSelected && selectedTemplateId && (
                              <TemplatePreview
                                template={oficialTemplates.find(t => t.id === selectedTemplateId)}
                                attachment={attachment}
                                variables={templateVarValues}
                                onVariablesChange={(next) => setTemplateVarValues(next)}
                                hidePreview
                              />
                            )}
                          </Box>
                        ) : values.confirmation ? (
                          <Grid spacing={2} container>
                            <Grid xs={12} item>
                              <>{renderMessageField("message1")}</>
                            </Grid>
                            <Grid xs={12} item>
                              <>{renderConfirmationMessageField("confirmationMessage1")}</>
                            </Grid>
                          </Grid>
                        ) : (
                          <>{renderMessageField(selectedVariationSlot)}</>
                        )}

                      </Grid>
                    </Grid>
                    </Grid>
                  </>)}

                  {currentStep === 6 && (<>
                  {/* Seletor simples de lista de contatos e tags */}
                  <Grid xs={12} item>
                    <div id="cm-step-6" className="cm-v2-section-title"><GroupIcon fontSize="small" />{i18n.t("campaignWizard.contactsTitle")}</div>
                  </Grid>
                  <Grid xs={12} item>
                    <Box style={{ border: isDark ? "1px solid rgba(255,255,255,0.12)" : "1px solid #e0e0e0", borderRadius: 8, padding: "12px 16px", backgroundColor: isDark ? "#161b22" : undefined }}>
                      <Typography variant="subtitle2" style={{ fontWeight: 600, marginBottom: 8, display: "flex", alignItems: "center", gap: 6 }}>
                        {i18n.t("campaignModal.contactListTitle")}
                      </Typography>
                      <Typography variant="body2" color="textSecondary" style={{ fontSize: 12, marginBottom: 12 }}>
                        {i18n.t("campaignModal.contactListDesc")}
                      </Typography>
                      <Grid spacing={1} container>
                        <Grid xs={12} sm={6} item>

                          <FormControl variant="outlined" size="small" fullWidth disabled={!campaignEditable}>
                            <InputLabel id="contactListId-label">{i18n.t("campaignModal.contactList")}</InputLabel>
                            <Select
                              labelId="contactListId-label"
                              label={i18n.t("campaignModal.contactList")}
                              value={values.contactListId || ""}
                              onChange={(e) => setFieldValue("contactListId", e.target.value)}
                            >
                              <MenuItem value="">
                                <em>{i18n.t("campaignModal.noListSelected")}</em>
                              </MenuItem>
                              {contactLists.map((cl) => (
                                <MenuItem key={cl.id} value={cl.id}>
                                  {cl.name}
                                  {cl.contactsCount !== undefined && (
                                    <Typography component="span" style={{ fontSize: 11, color: "#999", marginLeft: 8 }}>
                                      ({cl.contactsCount} {i18n.t("campaignModal.contacts")})
                                    </Typography>
                                  )}
                                </MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                        </Grid>
                        <Grid xs={12} sm={6} item>

                          <FormControl variant="outlined" size="small" fullWidth disabled={!campaignEditable}>
                            <InputLabel id="tagListId-label">{i18n.t("campaignModal.filterByTag")}</InputLabel>
                            <Select
                              labelId="tagListId-label"
                              label={i18n.t("campaignModal.filterByTag")}
                              value={values.tagListId || "none"}
                              onChange={(e) => setFieldValue("tagListId", e.target.value)}
                            >
                              <MenuItem value="none">
                                <em>{i18n.t("campaignModal.noTagFilter")}</em>
                              </MenuItem>
                              {tagLists.map((tl) => (
                                <MenuItem key={tl.id} value={tl.id}>
                                  {tl.name}
                                </MenuItem>
                              ))}
                            </Select>
                          </FormControl>
                        </Grid>
                      </Grid>
                      <Box mt={1} display="flex" style={{ gap: 8, flexWrap: "wrap" }}>
                        {values.contactListId && (
                          <Button
                            size="small"
                            style={{ fontSize: 11, textTransform: "none" }}
                            onClick={() => { setFieldValue("contactListId", ""); setMessageTab(1); }}
                          >
                            {i18n.t("campaignModal.switchList")}
                          </Button>
                        )}
                        {!values.contactListId && campaignEditable && (
                          <Button
                            size="small"
                            variant="outlined"
                            color="primary"
                            style={{ fontSize: 11, textTransform: "none" }}
                            onClick={() => setMessageTab(1)}
                          >
                            {i18n.t("campaignModal.createOrSelectList")}
                          </Button>
                        )}
                      </Box>
                    </Box>
                  </Grid>
                  </>)}
                </Grid>
              </DialogContent>
              </div>

              {/* ABA 1: Listas de Contatos */}
              <div hidden={messageTab !== 1}>
                <DialogContent dividers>
                  <CampaignContactSelector
                    contactListId={values.contactListId}
                    tagListId={values.tagListId}
                    tagLists={tagLists}
                    contactLists={contactLists}
                    onTagChange={(val) => setFieldValue("tagListId", val)}
                    onContactListChange={(val) => {
                      setFieldValue("contactListId", val);
                      if (val) {
                        // Recarregar listas para ter dados atualizados
                        api.get(`/contact-lists/list`, { params: { companyId } })
                          .then(({ data }) => setContactLists(data))
                          .catch(() => {});
                      }
                    }}
                    onSelectedContactsChange={setIndividualContacts}
                    campaignEditable={campaignEditable}
                    campaignName={values.name}
                    whatsappId={whatsappId}
                    onGoToCampaignTab={() => setMessageTab(0)}
                  />
                </DialogContent>
              </div>

              {/* ABA 2: Configurações de Disparo */}
              <div hidden={messageTab !== 2}>
                <DialogContent dividers>
                    <Grid spacing={2} container>
                      <Grid xs={12} item>
                        <Typography variant="subtitle1" style={{ fontWeight: 600, marginBottom: 8 }}>
                          {i18n.t("campaignModal.dispatchIntervals")}
                        </Typography>
                        <Typography variant="body2" color="textSecondary" style={{ marginBottom: 16 }}>
                          {i18n.t("campaignModal.dispatchIntervalsDesc")}
                        </Typography>
                      </Grid>
                    <Grid xs={12} sm={6} md={6} item>
                      <FormControl variant="outlined" fullWidth size="small">
                        <InputLabel id="cfg-messageInterval-label">
                          {i18n.t("campaigns.settings.randomInterval")}
                        </InputLabel>
                        <Select
                          labelId="cfg-messageInterval-label"
                          label={i18n.t("campaigns.settings.randomInterval")}
                          value={campaignSettings.messageInterval}
                          onChange={(e) => setCampaignSettings((p) => ({ ...p, messageInterval: Number(e.target.value) }))}
                        >
                          <MenuItem value={0}>{i18n.t("campaigns.settings.noBreak")}</MenuItem>
                          <MenuItem value={5}>5 {i18n.t("campaignModalExtra.seconds")}</MenuItem>
                          <MenuItem value={10}>10 {i18n.t("campaignModalExtra.seconds")}</MenuItem>
                          <MenuItem value={15}>15 {i18n.t("campaignModalExtra.seconds")}</MenuItem>
                          <MenuItem value={20}>20 {i18n.t("campaignModalExtra.seconds")}</MenuItem>
                          <MenuItem value={30}>30 {i18n.t("campaignModalExtra.seconds")}</MenuItem>
                          <MenuItem value={60}>60 {i18n.t("campaignModalExtra.seconds")}</MenuItem>
                          <MenuItem value={80}>80 {i18n.t("campaignModalExtra.seconds")}</MenuItem>
                          <MenuItem value={100}>100 {i18n.t("campaignModalExtra.seconds")}</MenuItem>
                          <MenuItem value={120}>120 {i18n.t("campaignModalExtra.seconds")}</MenuItem>
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid xs={12} sm={6} md={6} item>
                      <FormControl variant="outlined" fullWidth size="small">
                        <InputLabel id="cfg-longerIntervalAfter-label">
                          {i18n.t("campaigns.settings.intervalGapAfter")}
                        </InputLabel>
                        <Select
                          labelId="cfg-longerIntervalAfter-label"
                          label={i18n.t("campaigns.settings.intervalGapAfter")}
                          value={campaignSettings.longerIntervalAfter}
                          onChange={(e) => setCampaignSettings((p) => ({ ...p, longerIntervalAfter: Number(e.target.value) }))}
                        >
                          <MenuItem value={0}>{i18n.t("campaigns.settings.undefined")}</MenuItem>
                          <MenuItem value={5}>5 {i18n.t("campaigns.settings.messages")}</MenuItem>
                          <MenuItem value={10}>10 {i18n.t("campaigns.settings.messages")}</MenuItem>
                          <MenuItem value={20}>20 {i18n.t("campaigns.settings.messages")}</MenuItem>
                          <MenuItem value={30}>30 {i18n.t("campaigns.settings.messages")}</MenuItem>
                          <MenuItem value={50}>50 {i18n.t("campaigns.settings.messages")}</MenuItem>
                        </Select>
                      </FormControl>
                    </Grid>
                    <Grid xs={12} sm={6} md={6} item>
                      <FormControl variant="outlined" fullWidth size="small">
                        <InputLabel id="cfg-greaterInterval-label">
                          {i18n.t("campaigns.settings.laggerTriggerRange")}
                        </InputLabel>
                        <Select
                          labelId="cfg-greaterInterval-label"
                          label={i18n.t("campaigns.settings.laggerTriggerRange")}
                          value={campaignSettings.greaterInterval}
                          onChange={(e) => setCampaignSettings((p) => ({ ...p, greaterInterval: Number(e.target.value) }))}
                        >
                          <MenuItem value={0}>{i18n.t("campaigns.settings.noBreak")}</MenuItem>
                          <MenuItem value={20}>20 {i18n.t("campaignModalExtra.seconds")}</MenuItem>
                          <MenuItem value={30}>30 {i18n.t("campaignModalExtra.seconds")}</MenuItem>
                          <MenuItem value={60}>60 {i18n.t("campaignModalExtra.seconds")}</MenuItem>
                          <MenuItem value={90}>90 {i18n.t("campaignModalExtra.seconds")}</MenuItem>
                          <MenuItem value={120}>120 {i18n.t("campaignModalExtra.seconds")}</MenuItem>
                          <MenuItem value={180}>180 {i18n.t("campaignModalExtra.seconds")}</MenuItem>
                        </Select>
                      </FormControl>
                    </Grid>
                    {/* Anti-Ban */}
                    <Grid xs={12} item>
                      <div style={{ borderTop: isDark ? "1px dashed rgba(255,255,255,0.12)" : "1px dashed #e0e0e0", margin: "16px 0 10px", display: "flex", alignItems: "center", gap: 8 }}>
                        <span style={{ fontSize: 12, fontWeight: 700, color: "#e65100", background: isDark ? "#3d2200" : "#fff3e0", borderRadius: 4, padding: "2px 10px" }}>🛡️ {i18n.t("campaignModal.antiBan")}</span>
                        <span style={{ fontSize: 11, color: isDark ? "#9aa0a6" : "#888" }}>{i18n.t("campaignModal.antiBanDesc")}</span>
                      </div>
                    </Grid>
                     <Grid xs={12} sm={6} md={6} item>
                       <JitterSlider campaignSettings={campaignSettings} setCampaignSettings={setCampaignSettings} />
                     </Grid>
                     <Grid xs={12} sm={6} md={6} item>
                       <FormControl variant="outlined" fullWidth size="small">
                          <InputLabel id="cfg-longPauseEvery-label">{i18n.t("campaignModal.extraPauseEvery")}</InputLabel>
                         <Select
                           labelId="cfg-longPauseEvery-label"
                           label={i18n.t("campaignModal.extraPauseEvery")}
                           value={campaignSettings.longPauseEvery !== undefined && campaignSettings.longPauseEvery !== null ? campaignSettings.longPauseEvery : 50}
                            onChange={(e) => {
                              setCampaignSettings((p) => ({ ...p, longPauseEvery: Number(e.target.value) }));
                            }}
                         >
                           <MenuItem value={0}>{i18n.t("campaignModal.disabled")}</MenuItem>
                           <MenuItem value={10}>{i18n.t("campaignModal.everyNMessages", { n: 10 })}</MenuItem>
                           <MenuItem value={20}>{i18n.t("campaignModal.everyNMessages", { n: 20 })}</MenuItem>
                           <MenuItem value={30}>{i18n.t("campaignModal.everyNMessages", { n: 30 })}</MenuItem>
                           <MenuItem value={50}>{i18n.t("campaignModal.everyNMessages", { n: 50 })}</MenuItem>
                           <MenuItem value={100}>{i18n.t("campaignModal.everyNMessages", { n: 100 })}</MenuItem>
                         </Select>
                       </FormControl>
                     </Grid>
                     <Grid xs={12} sm={6} md={6} item>
                       <FormControl variant="outlined" fullWidth size="small">
                          <InputLabel id="cfg-longPauseDuration-label">{i18n.t("campaignModal.extraPauseDuration")}</InputLabel>
                         <Select
                           labelId="cfg-longPauseDuration-label"
                           label={i18n.t("campaignModal.extraPauseDuration")}
                           value={campaignSettings.longPauseDuration !== undefined && campaignSettings.longPauseDuration !== null ? campaignSettings.longPauseDuration : 30}
                           disabled={campaignSettings.longPauseEvery === 0}
                            onChange={(e) => {
                              setCampaignSettings((p) => ({ ...p, longPauseDuration: Number(e.target.value) }));
                            }}
                         >
                           <MenuItem value={15}>15 {i18n.t("campaignModalExtra.seconds")}</MenuItem>
                           <MenuItem value={30}>30 {i18n.t("campaignModalExtra.seconds")}</MenuItem>
                           <MenuItem value={60}>{i18n.t("campaignModal.minute1")}</MenuItem>
                           <MenuItem value={120}>{i18n.t("campaignModal.minutes2")}</MenuItem>
                           <MenuItem value={300}>{i18n.t("campaignModal.minutes5")}</MenuItem>
                         </Select>
                       </FormControl>
                     </Grid>

                    <Grid xs={12} item style={{ textAlign: "right" }}>
                      <Button
                        variant="contained"
                        color="primary"
                        disabled={savingSettings}
                        onClick={async () => {
                          setSavingSettings(true);
                          try {
                            await api.post("/campaign-settings", { settings: campaignSettings });
                            toast.success(i18n.t("campaignModal.settingsSaved"));
                          } catch (err) {
                            toastError(err);
                          } finally {
                            setSavingSettings(false);
                          }
                        }}
                      >
                        {savingSettings ? <CircularProgress size={20} color="inherit" /> : i18n.t("campaigns.settings.save")}
                      </Button>
                    </Grid>
                   </Grid>
                </DialogContent>
               </div>
               </div>
               <aside className="cm-v2-wizard-preview">
                 <div className="cm-v2-preview-eyebrow">{i18n.t("campaignWizard.preview")}</div>
                 <div className="cm-v2-phone">
                    <div className="cm-v2-phone-header">
                      <div className="cm-v2-phone-avatar" />
                      <div className="cm-v2-phone-contact">
                        <span className="cm-v2-phone-name">{i18n.t("campaignWizard.previewClient")}</span>
                        <span className="cm-v2-phone-status">{i18n.t("campaignWizard.previewOnline")}</span>
                      </div>
                    </div>
                     <div className="cm-v2-phone-body">
                       <div className="cm-v2-phone-daychip">{i18n.t("campaignWizard.previewToday")}</div>
                      {(() => {
                        // Calcula texto do balão: template (API Oficial) com variáveis,
                        // ou message1/message2 quando não-oficial.
                        if (isOficialSelected && selectedTemplateId) {
                          const tpl = oficialTemplates.find(t => t.id === selectedTemplateId);
                          const comps = (tpl && tpl.components) || [];
                          const headerComp = comps.find(c => (c.type || "").toLowerCase() === "header" && (c.format || "TEXT").toUpperCase() === "TEXT");
                          const bodyComp = comps.find(c => (c.type || "").toLowerCase() === "body");
                          const footerComp = comps.find(c => (c.type || "").toLowerCase() === "footer");
                          const vars = (templateVarValuesByTemplate && templateVarValuesByTemplate[selectedTemplateId]) || {};
                          const subst = (text) => String(text || "").replace(/\{\{([^}]+)\}\}/g, (m, k) => {
                            const v = vars[String(k).trim()];
                            return (v !== undefined && v !== "") ? v : m;
                          });
                          const headerTxt = headerComp ? subst(headerComp.text) : "";
                          const bodyTxt = bodyComp ? subst(bodyComp.text) : "";
                          const footerTxt = footerComp ? subst(footerComp.text) : "";
                          const hasAny = headerTxt || bodyTxt || footerTxt;
                          return (
                            <div className="cm-v2-phone-bubble">
                              {hasAny ? (
                                <>
                                  {headerTxt && <div style={{ fontWeight: 700, marginBottom: 4 }}>{headerTxt}</div>}
                                  {bodyTxt && <div style={{ whiteSpace: "pre-wrap" }}>{bodyTxt}</div>}
                                  {footerTxt && <div style={{ marginTop: 6, fontSize: "0.85em", opacity: 0.7, fontStyle: "italic" }}>{footerTxt}</div>}
                                </>
                              ) : (
                                i18n.t("campaignWizard.previewTemplatePlaceholder")
                              )}
                              <span className="cm-v2-phone-time">09:00 ✓✓</span>
                            </div>
                          );
                        }
                        const getSlotImageUrl = (slot) => {
                          const local = messageMedias[slot];
                          if (local && local.type && local.type.startsWith("image/")) {
                            try { return URL.createObjectURL(local); } catch { return null; }
                          }
                          const saved = savedMessageMedias[slot];
                          if (saved && saved.path && /\.(png|jpe?g|gif|webp|bmp)$/i.test(saved.name || saved.path)) {
                            return `${getBackendUrl()}/public/${saved.path}`;
                          }
                          // fallback campaign-level media (mediaPath) só para message1 quando não houver per-message
                          if (slot === "message1" && !local && !saved && campaign.mediaPath && /\.(png|jpe?g|gif|webp|bmp)$/i.test(campaign.mediaName || campaign.mediaPath)) {
                            return `${getBackendUrl()}/public/${campaign.mediaPath}`;
                          }
                          return null;
                        };
                        const img1 = getSlotImageUrl("message1");
                        const img2 = getSlotImageUrl("message2");
                        return (
                          <>
                            <div className="cm-v2-phone-bubble">
                              {img1 && (
                                <img src={img1} alt="" style={{ display: "block", maxWidth: "100%", borderRadius: 6, marginBottom: 6 }} />
                              )}
                              <div style={{ whiteSpace: "pre-wrap" }}>
                                {(values.message1 && values.message1.trim()) || (img1 ? "" : i18n.t("campaignWizard.previewMsg1Placeholder"))}
                              </div>
                              <span className="cm-v2-phone-time">09:00 ✓✓</span>
                            </div>
                            {(values.message2 && values.message2.trim()) || img2 ? (
                              <div className="cm-v2-phone-bubble">
                                {img2 && (
                                  <img src={img2} alt="" style={{ display: "block", maxWidth: "100%", borderRadius: 6, marginBottom: 6 }} />
                                )}
                                {values.message2 && values.message2.trim() ? (
                                  <div style={{ whiteSpace: "pre-wrap" }}>{values.message2}</div>
                                ) : null}
                                <span className="cm-v2-phone-time">09:00 ✓✓</span>
                              </div>
                            ) : null}
                          </>
                        );
                      })()}
                    </div>
                 </div>
               </aside>
               </div>


              <DialogActions className={classes.dialogActions}>

                {campaign.status === "CANCELADA" && (
                  <Button
                    color="primary"
                    onClick={() => restartCampaign()}
                    variant="outlined"
                    className={classes.dialogActionButton}
                  >
                    {i18n.t("campaigns.dialog.buttons.restart")}
                  </Button>
                )}
                {campaign.status === "EM_ANDAMENTO" && (
                  <Button
                    color="primary"
                    onClick={() => cancelCampaign()}
                    variant="outlined"
                    className={classes.dialogActionButton}
                  >
                    {i18n.t("campaigns.dialog.buttons.cancel")}
                  </Button>
                )}

                <Button
                  onClick={handleClose}
                  color="primary"
                  disabled={isSubmitting}
                  variant="outlined"
                  className={classes.dialogActionButton}
                >
                  {i18n.t("campaigns.dialog.buttons.close")}
                </Button>

                {/* Navegação Voltar / Continuar (somente na aba Campanha) */}
                {messageTab === 0 && (campaignEditable || campaign.status === "CANCELADA") && (
                  <>
                    <Button
                      onClick={() => {
                        if (currentStep <= 1) return;
                        const prev = currentStep - 1;
                        setCurrentStep(prev);
                        scrollToStep(prev);
                      }}
                      disabled={currentStep <= 1 || isSubmitting}
                      variant="outlined"
                      color="primary"
                      className={classes.dialogActionButton}
                    >
                      {i18n.t("campaignWizard.back")}
                    </Button>
                    {currentStep < 6 && (
                      <Button
                        onClick={() => {
                          if (!flagStepAndAdvance(currentStep)) return;
                          const next = currentStep + 1;
                          setMaxUnlocked((m) => Math.max(m, next));
                          setCurrentStep(next);
                          scrollToStep(next);
                        }}
                        disabled={isSubmitting}
                        variant="contained"
                        color="primary"
                        className={`${classes.btnWrapper} ${classes.dialogActionButton}`}
                      >
                        {i18n.t("campaignWizard.continue")}
                      </Button>
                    )}
                    {currentStep === 6 && (
                      <Button
                        onClick={() => {
                          // valida todas as etapas antes de abrir revisão; para na primeira inválida
                          for (let n = 1; n <= 6; n++) {
                            const v = validateCampaignStep(n, stepCtx);
                            if (!v.ok) {
                              setCurrentStep(n);
                              scrollToStep(n);
                              flagStepAndAdvance(n);
                              return;
                            }
                          }
                          setStepErrors({ step: null, fieldErrors: {}, extraErrors: {} });
                          setMaxUnlocked(6);
                          setShowReview(true);
                        }}
                        disabled={isSubmitting}
                        variant="contained"
                        color="primary"
                        className={`${classes.btnWrapper} ${classes.dialogActionButton}`}
                      >
                        Revisar e salvar
                      </Button>
                    )}
                  </>
                )}

                {/* Salvar direto continua disponível na aba 1 (listas) */}
                {messageTab === 1 && (campaignEditable || campaign.status === "CANCELADA") && (
                  <Button
                    type="submit"
                    color="primary"
                    disabled={isSubmitting}
                    variant="contained"
                    className={`${classes.btnWrapper} ${classes.dialogActionButton}`}
                  >
                    {campaignId
                      ? `${i18n.t("campaigns.dialog.buttons.edit")}`
                      : `${i18n.t("campaigns.dialog.buttons.add")}`}
                    {isSubmitting && (
                      <CircularProgress size={24} className={classes.buttonProgress} />
                    )}
                  </Button>
                )}
              </DialogActions>

              {/* ===== Overlay de Revisão final ===== */}
              {showReview && (
                <div className="cm-review-overlay" role="dialog" aria-modal="true" aria-label="Revisão da campanha">
                  <div className="cm-review-panel">
                    <div className="cm-review-head">
                      <div>
                        <div className="cm-review-eyebrow">Antes de enviar</div>
                        <div className="cm-review-title">Revise as configurações da campanha</div>
                      </div>
                      <button type="button" className="cm-v2-close-btn" onClick={() => setShowReview(false)} aria-label="Fechar revisão">
                        <CloseIcon />
                      </button>
                    </div>
                    <div className="cm-review-body">
                      {(() => {
                        const wppName = (whatsapps.find((w) => w.id === values.whatsappId) || {}).name || "—";
                        const listName = (contactLists.find((c) => String(c.id) === String(values.contactListId)) || {}).name || "—";
                        const rows = [
                          { n: 1, label: "Identificação", items: [
                            ["Nome", values.name || "—"],
                            ["Conexão", wppName],
                            ...(isOficialSelected ? [["Template", (oficialTemplates.find((t) => t.id === selectedTemplateId) || {}).shortcode || "—"]] : []),
                          ]},
                          { n: 2, label: "Distribuição", items: [
                            ["Rotação", rotationEnabled ? "Ativada" : "Desativada"],
                            ...(rotationEnabled ? [
                              ["Conexões na rotação", (rotationWhatsappIds || []).length],
                              ["Tamanho do bloco", rotationBlockSize],
                              ["Sequencial", rotationSequential ? "Sim" : "Não"],
                            ] : []),
                          ]},
                          { n: 3, label: "Agendamento", items: [
                            ["Agendado para", values.scheduledAt ? String(values.scheduledAt).replace("T", " ") : "Envio imediato"],
                          ]},
                          { n: 4, label: "Ticket", items: [
                            ["Fila", values.queueId || "—"],
                            ["Status do ticket", values.statusTicket || "—"],
                          ]},
                          { n: 5, label: "Mensagem", items: [
                            ["Mensagem 1", (values.message1 || "").slice(0, 120) + ((values.message1 || "").length > 120 ? "…" : "") || "—"],
                            ...["message2","message3","message4","message5"].filter((k) => values[k]).map((k, i) => [`Mensagem ${i + 2}`, (values[k] || "").slice(0, 80) + "…"]),
                          ]},
                          { n: 6, label: "Contatos", items: [
                            ["Lista", listName],
                          ]},
                        ];
                        return rows.map((row) => (
                          <div className="cm-review-row" key={row.n}>
                            <div className="cm-review-row-head">
                              <span className="cm-review-row-num">{row.n}</span>
                              <span className="cm-review-row-title">{row.label}</span>
                              <button
                                type="button"
                                className="cm-review-edit"
                                onClick={() => { setShowReview(false); goToStep(row.n); }}
                              >
                                Editar
                              </button>
                            </div>
                            <dl className="cm-review-row-items">
                              {row.items.map(([k, v], i) => (
                                <div className="cm-review-kv" key={i}>
                                  <dt>{k}</dt>
                                  <dd>{v ?? "—"}</dd>
                                </div>
                              ))}
                            </dl>
                          </div>
                        ));
                      })()}
                    </div>
                    <div className="cm-review-foot">
                      <Button variant="outlined" color="primary" onClick={() => setShowReview(false)} disabled={isSubmitting}>
                        Voltar à edição
                      </Button>
                      <Button
                        type="submit"
                        variant="contained"
                        color="primary"
                        disabled={isSubmitting}
                      >
                        {campaignId
                          ? `Confirmar e ${i18n.t("campaigns.dialog.buttons.edit").toLowerCase()}`
                          : `Confirmar e ${i18n.t("campaigns.dialog.buttons.add").toLowerCase()}`}
                        {isSubmitting && <CircularProgress size={20} style={{ marginLeft: 8 }} />}
                      </Button>
                    </div>
                  </div>
                </div>
              )}
            </Form>
            );
          }}
        </Formik>
      </Dialog>
    </div>
  );
};

export default CampaignModal;
