import React, { useState, useEffect, useContext, useCallback, lazy, Suspense } from "react";
import { toast } from "react-toastify";
import { makeStyles } from "@material-ui/core/styles";
import {
  Paper, Button, Table, TableBody, TableCell, TableHead, TableRow,
  IconButton, TextField, InputAdornment, Grid, Select, MenuItem,
  FormControl, InputLabel, Dialog, DialogTitle, DialogContent,
  DialogActions, Chip, Box, Typography, CircularProgress, Tooltip,
  Divider, Card, CardContent, Tabs, Tab
} from "@material-ui/core";
import SearchIcon from "@material-ui/icons/Search";
import DeleteIcon from "@material-ui/icons/Delete";
import AddIcon from "@material-ui/icons/Add";
import SyncIcon from "@material-ui/icons/Sync";
import CheckCircleIcon from "@material-ui/icons/CheckCircle";
import PendingIcon from "@material-ui/icons/HourglassEmpty";
import RejectedIcon from "@material-ui/icons/Cancel";
import ViewIcon from "@material-ui/icons/Visibility";
import EditIcon from "@material-ui/icons/Edit";
import CloudUploadIcon from "@material-ui/icons/CloudUpload";
import HealthIcon from "@material-ui/icons/Favorite";
import TemplatesIcon from "@material-ui/icons/Description";

const WhatsappHealth = lazy(() => import("../WhatsappHealth"));
const MetaUnifiedWebhook = lazy(() => import("../MetaUnifiedWebhook"));

import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import Title from "../../components/Title";
import api from "../../services/api";
import { i18n } from "../../translate/i18n";
import toastError from "../../errors/toastError";
import ConfirmationModal from "../../components/ConfirmationModal";
import { AuthContext } from "../../context/Auth/AuthContext";
import TableRowSkeleton from "../../components/TableRowSkeleton";

const useStyles = makeStyles((theme) => ({
  pageWrap: {
    padding: theme.spacing(0, 0.5),
  },
  heroHeader: {
    background: "linear-gradient(135deg, #1d4ed8 0%, #2563eb 45%, #4f46e5 100%)",
    borderRadius: 12,
    padding: theme.spacing(1.25, 2),
    color: "#fff",
    boxShadow: "0 6px 20px -12px rgba(37,99,235,0.45)",
    marginBottom: theme.spacing(1.25),
    display: "flex",
    flexWrap: "wrap",
    alignItems: "center",
    gap: theme.spacing(1.5),
    justifyContent: "space-between",
  },
  heroTitle: {
    fontSize: 16,
    fontWeight: 700,
    color: "#fff",
    margin: 0,
    letterSpacing: 0.1,
  },
  heroSubtitle: {
    fontSize: 11,
    opacity: 0.85,
    marginTop: 1,
  },
  tabsBar: {
    background: "#fff",
    borderRadius: 10,
    padding: theme.spacing(0.25, 0.75),
    boxShadow: "0 2px 12px -6px rgba(15,23,42,0.18)",
    border: "1px solid rgba(15,23,42,0.06)",
    marginBottom: theme.spacing(1.25),
    minHeight: 38,
  },
  tabRoot: {
    textTransform: "none",
    fontWeight: 600,
    fontSize: 12.5,
    minHeight: 36,
    borderRadius: 8,
    color: "#475569",
    padding: "4px 10px",
    "&.Mui-selected": {
      color: "#1d4ed8",
      background: "rgba(37,99,235,0.08)",
    },
  },
  tabsIndicator: { display: "none" },
  mainPaper: {
    flex: 1,
    padding: 0,
    overflowY: "auto",
    borderRadius: 12,
    border: "1px solid rgba(15,23,42,0.06)",
    ...theme.scrollbarStyles,
  },
  summaryCard: {
    borderRadius: 10,
    minWidth: 100,
    textAlign: "center",
    border: "1px solid rgba(15,23,42,0.06)",
    boxShadow: "0 2px 8px -6px rgba(15,23,42,0.2)",
    transition: "transform 0.2s, box-shadow 0.2s",
    "&:hover": {
      transform: "translateY(-1px)",
      boxShadow: "0 8px 18px -12px rgba(37,99,235,0.3)",
    },
  },
  summaryValue: {
    fontSize: "1.25rem",
    fontWeight: 800,
    lineHeight: 1.1,
    letterSpacing: -0.3,
  },
  summaryLabel: {
    fontSize: "0.7rem",
    color: theme.palette.text.secondary,
    marginTop: 2,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: 0.3,
  },

  filterContainer: {
    padding: theme.spacing(1.5, 2),
    marginBottom: theme.spacing(1.5),
    borderRadius: 8,
  },
  tableHeader: {
    fontWeight: 700,
    backgroundColor: theme.palette.grey[100],
    fontSize: "0.78rem",
    color: theme.palette.text.secondary,
    padding: theme.spacing(1, 1.5),
    whiteSpace: "nowrap",
  },
  tableCell: {
    fontSize: "0.85rem",
    padding: theme.spacing(0.8, 1.5),
  },
  formControl: {
    minWidth: 200,
  },
  statusApproved: { color: "#4caf50" },
  statusPending: { color: "#ff9800" },
  statusRejected: { color: "#f44336" },
  componentBox: {
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: 8,
    padding: theme.spacing(2),
    marginBottom: theme.spacing(1),
  },
  previewBox: {
    backgroundColor: "#e5ddd5",
    backgroundImage:
      "url(\"data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' width='40' height='40'><circle cx='20' cy='20' r='1' fill='%23d4ccc2'/></svg>\")",
    borderRadius: 8,
    padding: theme.spacing(2),
    maxWidth: 420,
  },
  previewBubble: {
    position: "relative",
    backgroundColor: "#dcf8c6",
    borderRadius: 8,
    padding: theme.spacing(1),
    paddingBottom: 18,
    marginBottom: theme.spacing(0.5),
    boxShadow: "0 1px 0.5px rgba(0,0,0,0.13)",
    "&::before": {
      content: '""',
      position: "absolute",
      top: 0,
      left: -8,
      width: 0,
      height: 0,
      borderTop: "8px solid #dcf8c6",
      borderLeft: "8px solid transparent",
    },
  },
  previewHeaderText: {
    fontWeight: 700,
    fontSize: 14.5,
    marginBottom: 4,
    color: "#111",
  },
  previewBodyText: {
    fontSize: 14.2,
    color: "#111",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },
  previewFooter: {
    fontSize: 12,
    color: "#667781",
    marginTop: 4,
  },
  previewMeta: {
    position: "absolute",
    right: 8,
    bottom: 4,
    fontSize: 10.5,
    color: "#667781",
  },
  previewMedia: {
    width: "100%",
    maxHeight: 180,
    objectFit: "cover",
    borderRadius: 6,
    marginBottom: 6,
    backgroundColor: "#cfcfcf",
  },
  previewMediaPlaceholder: {
    width: "100%",
    height: 140,
    borderRadius: 6,
    marginBottom: 6,
    backgroundColor: "rgba(0,0,0,0.08)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#667781",
    fontSize: 12,
  },
  previewBtn: {
    backgroundColor: "#fff",
    color: "#00a5f4",
    borderRadius: 6,
    textAlign: "center",
    padding: "8px 4px",
    marginTop: 4,
    fontSize: 13.5,
    fontWeight: 500,
    boxShadow: "0 1px 0.5px rgba(0,0,0,0.13)",
  },
  previewCtaBtn: {
    backgroundColor: "#fff",
    color: "#00a5f4",
    borderRadius: 8,
    textAlign: "center",
    padding: "10px 8px",
    marginTop: 4,
    fontSize: 14,
    fontWeight: 500,
    boxShadow: "0 1px 0.5px rgba(0,0,0,0.13)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    cursor: "default",
  },
  previewQrRow: {
    display: "flex",
    gap: 4,
    marginTop: 4,
    flexWrap: "wrap",
  },
  previewQrBtn: {
    flex: "1 1 calc(50% - 2px)",
    minWidth: "calc(50% - 2px)",
    backgroundColor: "#fff",
    color: "#00a5f4",
    borderRadius: 8,
    textAlign: "center",
    padding: "9px 6px",
    fontSize: 13.5,
    fontWeight: 500,
    boxShadow: "0 1px 0.5px rgba(0,0,0,0.13)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
    cursor: "default",
  },
  previewMoreBtn: {
    backgroundColor: "#fff",
    color: "#00a5f4",
    borderRadius: 8,
    textAlign: "center",
    padding: "10px 8px",
    marginTop: 4,
    fontSize: 14,
    fontWeight: 500,
    boxShadow: "0 1px 0.5px rgba(0,0,0,0.13)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    gap: 6,
  },
}));

const CATEGORIES = [
  { value: "MARKETING", label: i18n.t("templateManagerPage.marketing") },
  { value: "UTILITY", label: i18n.t("templateManagerPage.utility") },
  { value: "AUTHENTICATION", label: i18n.t("templateManagerPage.authentication") },
];

const LANGUAGES = [
  { value: "pt_BR", label: "Português (BR)" },
  { value: "en_US", label: "English (US)" },
  { value: "es", label: "Español" },
];

const TemplateManager = () => {
  const classes = useStyles();
  const { user } = useContext(AuthContext);

  const [loading, setLoading] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [whatsapps, setWhatsapps] = useState([]);
  const [selectedWhatsappId, setSelectedWhatsappId] = useState("");
  const [searchParam, setSearchParam] = useState("");
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [viewModalOpen, setViewModalOpen] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState(null);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [deletingTemplate, setDeletingTemplate] = useState(null);
  const [activeTab, setActiveTab] = useState("templates");

  // Form state
  const [templateName, setTemplateName] = useState("");
  const [templateCategory, setTemplateCategory] = useState("MARKETING");
  const [templateLanguage, setTemplateLanguage] = useState("pt_BR");
  const [headerType, setHeaderType] = useState("NONE"); // NONE | TEXT | IMAGE | VIDEO | DOCUMENT
  const [headerText, setHeaderText] = useState("");
  const [headerMediaUrl, setHeaderMediaUrl] = useState("");
  const [headerMediaFilename, setHeaderMediaFilename] = useState("");
  const [headerMediaUploading, setHeaderMediaUploading] = useState(false);
  const headerMediaInputRef = React.useRef(null);
  const [bodyText, setBodyText] = useState("");
  const [footerText, setFooterText] = useState("");
  const [variableExamples, setVariableExamples] = useState({}); // { "1": "valor", ... }
  const [buttons, setButtons] = useState([]);
  const [submitting, setSubmitting] = useState(false);
  const bodyRef = React.useRef(null);

  // ===== Helpers de variáveis =====
  const HEADER_LIMIT = 60;
  const BODY_LIMIT = 1024;
  const FOOTER_LIMIT = 60;

  const extractVarNumbers = (text) => {
    const re = /\{\{(\d+)\}\}/g;
    const out = [];
    let m;
    while ((m = re.exec(text || "")) !== null) {
      const n = m[1];
      if (!out.includes(n)) out.push(n);
    }
    return out;
  };

  const allUsedVars = React.useMemo(() => {
    const set = new Set();
    [headerType === "TEXT" ? headerText : "", bodyText, footerText].forEach(t => {
      extractVarNumbers(t).forEach(n => set.add(n));
    });
    return Array.from(set).sort((a, b) => Number(a) - Number(b));
  }, [headerText, bodyText, footerText, headerType]);

  const insertVariableInBody = () => {
    const used = extractVarNumbers(bodyText).map(Number);
    let next = 1;
    while (used.includes(next)) next += 1;
    const token = `{{${next}}}`;
    const el = bodyRef.current;
    if (el && typeof el.selectionStart === "number") {
      const start = el.selectionStart;
      const end = el.selectionEnd;
      const newVal = bodyText.slice(0, start) + token + bodyText.slice(end);
      setBodyText(newVal);
      requestAnimationFrame(() => {
        try {
          el.focus();
          el.setSelectionRange(start + token.length, start + token.length);
        } catch (_) { /* ignore */ }
      });
    } else {
      setBodyText((prev) => `${prev}${token}`);
    }
  };

  // Fetch official whatsapp connections
  useEffect(() => {
    const fetchWhatsapps = async () => {
      try {
        const { data } = await api.get("/whatsapp/?session=0");
        const oficial = data.filter(w => w.channel === "whatsapp_oficial");
        setWhatsapps(oficial);
        if (oficial.length > 0 && !selectedWhatsappId) {
          setSelectedWhatsappId(oficial[0].id);
        }
      } catch (err) {
        toastError(err);
      }
    };
    fetchWhatsapps();
  }, []);

  // Fetch templates when whatsapp changes
  const fetchTemplates = useCallback(async () => {
    if (!selectedWhatsappId) return;
    setLoading(true);
    try {
      const { data } = await api.get("/quick-messages/list", {
        params: {
          companyId: user.companyId,
          isOficial: "true",
          whatsappId: selectedWhatsappId
        }
      });
      setTemplates(Array.isArray(data) ? data : []);
    } catch (err) {
      toastError(err);
    } finally {
      setLoading(false);
    }
  }, [selectedWhatsappId, user.companyId]);

  useEffect(() => {
    fetchTemplates();
  }, [fetchTemplates]);

  // Listen for template status change notifications via socket
  useEffect(() => {
    if (!user?.companyId) return;
    
    // Import socket from context if available
    const handleStatusChange = (data) => {
      if (data.action === "statusChange" && data.changes) {
        data.changes.forEach(change => {
          const statusLabel = {
            APPROVED: "✅ APROVADO",
            REJECTED: "❌ REJEITADO",
            PENDING: "⏳ PENDENTE",
            PAUSED: "⏸️ PAUSADO",
          };
          const newLabel = statusLabel[change.newStatus] || change.newStatus;
          const oldLabel = statusLabel[change.oldStatus] || change.oldStatus;

          if (change.newStatus === "APPROVED") {
            toast.success(`Template "${change.name}" foi ${newLabel}! 🎉`, { autoClose: 8000 });
          } else if (change.newStatus === "REJECTED") {
            toast.error(`Template "${change.name}" foi ${newLabel}`, { autoClose: 10000 });
          } else {
            toast.info(`Template "${change.name}": ${oldLabel} → ${newLabel}`, { autoClose: 6000 });
          }
        });
        // Refresh templates list
        fetchTemplates();
      }
    };

    // We'll handle notifications from the sync response instead
    return () => {};
  }, [user?.companyId, fetchTemplates]);

  const handleSync = async () => {
    if (!selectedWhatsappId) return;
    setSyncing(true);
    try {
      const { data } = await api.get(`/whatsapp/sync-templates/${selectedWhatsappId}`);
      
      // Show status change notifications
      if (data.statusChanges && data.statusChanges.length > 0) {
        data.statusChanges.forEach(change => {
          if (change.newStatus === "APPROVED") {
            toast.success(`🎉 Template "${change.name}" foi APROVADO pela Meta!`, { autoClose: 8000 });
          } else if (change.newStatus === "REJECTED") {
            toast.error(`❌ Template "${change.name}" ${i18n.t("templateManagerForm.rejected")}`, { autoClose: 10000 });
          } else {
            toast.info(`Template "${change.name}": ${change.oldStatus} → ${change.newStatus}`, { autoClose: 6000 });
          }
        });
        toast.success(`${i18n.t("templateManagerForm.syncComplete")} - ${data.statusChanges.length} template(s) ${i18n.t("templateManagerForm.statusChanged")}`);
      } else {
        toast.success(i18n.t("templateManagerForm.syncNoChanges"));
      }
      
      await fetchTemplates();
    } catch (err) {
      const errMsg = err?.response?.data?.error || err?.response?.data?.message || err?.message || "";
      if (errMsg.includes("TOKEN_EXPIRED") || errMsg.includes("token") && (errMsg.includes("expirou") || errMsg.includes("inválido"))) {
        toast.error(i18n.t("templateManagerForm.tokenExpired"), { autoClose: 12000 });
      } else {
        toastError(err);
      }
    } finally {
      setSyncing(false);
    }
  };

  const handleCreateTemplate = async () => {
    if (!templateName || !bodyText) {
      toast.error(i18n.t("templateManagerForm.nameBodyRequired"));
      return;
    }

    // Validate template name (only lowercase, numbers and underscores)
    const nameRegex = /^[a-z0-9_]+$/;
    if (!nameRegex.test(templateName)) {
      toast.error(i18n.t("templateManagerForm.nameValidation"));
      return;
    }

    // Validar limites
    if (headerType === "TEXT" && headerText.length > HEADER_LIMIT) {
      toast.error(`Cabeçalho excede ${HEADER_LIMIT} caracteres.`);
      return;
    }
    if (bodyText.length > BODY_LIMIT) {
      toast.error(`Corpo excede ${BODY_LIMIT} caracteres.`);
      return;
    }
    if (footerText.length > FOOTER_LIMIT) {
      toast.error(`Rodapé excede ${FOOTER_LIMIT} caracteres.`);
      return;
    }

    // Validar exemplos de variáveis
    const missingExamples = allUsedVars.filter(
      n => !variableExamples[n] || !String(variableExamples[n]).trim()
    );
    if (missingExamples.length > 0) {
      toast.error(
        `Preencha um valor de exemplo para as variáveis: ${missingExamples
          .map(n => `{{${n}}}`)
          .join(", ")}`
      );
      return;
    }

    if (["IMAGE", "VIDEO", "DOCUMENT"].includes(headerType) && !headerMediaUrl) {
      toast.error("Informe a URL pública da mídia do cabeçalho.");
      return;
    }

    setSubmitting(true);
    try {
      const components = [];

      // HEADER
      if (headerType === "TEXT" && headerText) {
        const headerVars = extractVarNumbers(headerText);
        const headerComp = { type: "HEADER", format: "TEXT", text: headerText };
        if (headerVars.length > 0) {
          headerComp.example = {
            header_text: headerVars.map(n => variableExamples[n] || "")
          };
        }
        components.push(headerComp);
      } else if (["IMAGE", "VIDEO", "DOCUMENT"].includes(headerType)) {
        components.push({
          type: "HEADER",
          format: headerType,
          example: { header_handle: [headerMediaUrl] }
        });
      }

      // BODY (com exemplos)
      const bodyVars = extractVarNumbers(bodyText);
      const bodyComp = { type: "BODY", text: bodyText };
      if (bodyVars.length > 0) {
        bodyComp.example = {
          body_text: [bodyVars.map(n => variableExamples[n] || "")]
        };
      }
      components.push(bodyComp);

      // FOOTER (Meta não aceita variáveis em FOOTER, mas mantemos texto livre)
      if (footerText) {
        components.push({ type: "FOOTER", text: footerText });
      }

      if (buttons.length > 0) {
        components.push({
          type: "BUTTONS",
          buttons: buttons.map(b => ({
            type: b.type,
            text: b.text,
            ...(b.type === "URL" ? { url: b.url } : {}),
            ...(b.type === "PHONE_NUMBER" ? { phone_number: b.phone } : {})
          }))
        });
      }

      await api.post(`/whatsapp/${selectedWhatsappId}/create-template`, {
        name: templateName,
        language: templateLanguage,
        category: templateCategory,
        components
      });

      toast.success(i18n.t("templateManagerForm.sentForApproval"));
      setCreateModalOpen(false);
      resetForm();

      // Sync to get latest status
      await handleSync();
    } catch (err) {
      const errMsg = err?.response?.data?.error || err?.response?.data?.message || err?.message || "";
      if (errMsg.includes("TOKEN_EXPIRED") || (errMsg.includes("token") && (errMsg.includes("expirou") || errMsg.includes("inválido")))) {
        toast.error(i18n.t("templateManagerForm.tokenExpired"), { autoClose: 12000 });
      } else {
        toastError(err);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteTemplate = async () => {
    if (!deletingTemplate) return;
    try {
      await api.delete(`/whatsapp/${selectedWhatsappId}/delete-template/${deletingTemplate.shortcode}`);
      toast.success(i18n.t("templateManagerForm.deleteSuccess"));
      setConfirmModalOpen(false);
      setDeletingTemplate(null);
      await fetchTemplates();
    } catch (err) {
      const errMsg = err?.response?.data?.error || err?.response?.data?.message || err?.message || "";
      if (errMsg.includes("TOKEN_EXPIRED") || (errMsg.includes("token") && (errMsg.includes("expirou") || errMsg.includes("inválido")))) {
        toast.error(i18n.t("templateManagerForm.tokenExpired"), { autoClose: 12000 });
      } else {
        toastError(err);
      }
    }
  };

  const handleEditTemplate = (template) => {
    // Pre-fill the create form with existing template data for re-creation
    setTemplateName(template.shortcode || "");
    setTemplateCategory(template.category || "MARKETING");
    setTemplateLanguage(template.language || "pt_BR");
    
    // Parse components if available
    if (template.components && template.components.length > 0) {
      const header = template.components.find(c => c.type === "HEADER");
      const body = template.components.find(c => c.type === "BODY");
      const footer = template.components.find(c => c.type === "FOOTER");
      const btns = template.components.find(c => c.type === "BUTTONS");

      const fmt = (header?.format || "").toUpperCase();
      if (header && ["IMAGE", "VIDEO", "DOCUMENT"].includes(fmt)) {
        setHeaderType(fmt);
        setHeaderText("");
        let url = "";
        try {
          const ex = typeof header.example === "string" ? JSON.parse(header.example) : header.example;
          url = ex?.header_handle?.[0] || "";
        } catch (_) { /* ignore */ }
        setHeaderMediaUrl(url);
      } else if (header?.text) {
        setHeaderType("TEXT");
        setHeaderText(header.text);
        setHeaderMediaUrl("");
      } else {
        setHeaderType("NONE");
        setHeaderText("");
        setHeaderMediaUrl("");
      }
      setBodyText(body?.text || "");
      setFooterText(footer?.text || "");
      // Pré-preencher exemplos a partir de body.example.body_text
      try {
        const ex = typeof body?.example === "string" ? JSON.parse(body.example) : body?.example;
        const arr = ex?.body_text?.[0];
        if (Array.isArray(arr)) {
          const map = {};
          arr.forEach((v, i) => { map[String(i + 1)] = v || ""; });
          setVariableExamples(map);
        } else {
          setVariableExamples({});
        }
      } catch (_) { setVariableExamples({}); }

      if (btns?.buttons) {
        const parsed = typeof btns.buttons === "string" ? JSON.parse(btns.buttons) : btns.buttons;
        setButtons((parsed || []).map(b => ({
          type: b.type || "QUICK_REPLY",
          text: b.text || "",
          url: b.url || "",
          phone: b.phone_number || ""
        })));
      } else {
        setButtons([]);
      }
    } else {
      setHeaderType("NONE");
      setHeaderText("");
      setHeaderMediaUrl("");
      setBodyText(template.message || "");
      setFooterText("");
      setButtons([]);
      setVariableExamples({});
    }

    setCreateModalOpen(true);
  };

  const resetForm = () => {
    setTemplateName("");
    setTemplateCategory("MARKETING");
    setTemplateLanguage("pt_BR");
    setHeaderType("NONE");
    setHeaderText("");
    setHeaderMediaUrl("");
    setHeaderMediaFilename("");
    setBodyText("");
    setFooterText("");
    setButtons([]);
    setVariableExamples({});
  };

  const addButton = (type) => {
    if (buttons.length >= 3) {
      toast.warning(i18n.t("hardcoded.maxButtonsReached"));
      return;
    }
    setButtons([...buttons, { type, text: "", url: "", phone: "" }]);
  };

  const updateButton = (index, field, value) => {
    const updated = [...buttons];
    updated[index][field] = value;
    setButtons(updated);
  };

  const removeButton = (index) => {
    setButtons(buttons.filter((_, i) => i !== index));
  };

  const getStatusIcon = (status) => {
    switch (status?.toUpperCase()) {
      case "APPROVED":
        return <Chip icon={<CheckCircleIcon />} label={i18n.t("hardcoded.approved")} size="small" style={{ backgroundColor: "#e8f5e9", color: "#2e7d32" }} />;
      case "PENDING":
        return <Chip icon={<PendingIcon />} label={i18n.t("hardcoded.pending")} size="small" style={{ backgroundColor: "#fff3e0", color: "#e65100" }} />;
      case "REJECTED":
        return <Chip icon={<RejectedIcon />} label={i18n.t("hardcoded.rejected")} size="small" style={{ backgroundColor: "#ffebee", color: "#c62828" }} />;
      default:
        return <Chip label={status || "N/A"} size="small" />;
    }
  };

  const getCategoryLabel = (cat) => {
    const found = CATEGORIES.find(c => c.value === cat);
    return found ? found.label : cat;
  };

  const filteredTemplates = templates.filter(t => {
    const matchSearch = !searchParam || t.shortcode?.toLowerCase().includes(searchParam.toLowerCase());
    return matchSearch;
  });

  const summaryMetrics = React.useMemo(() => {
    const s = { total: templates.length, approved: 0, pending: 0, rejected: 0 };
    templates.forEach(t => {
      const st = String(t.status || "").toUpperCase();
      if (st === "APPROVED") s.approved++;
      else if (st === "PENDING" || st === "IN_REVIEW") s.pending++;
      else if (st === "REJECTED") s.rejected++;
    });
    return s;
  }, [templates]);

  return (
    <MainContainer>
      <ConfirmationModal
        title={i18n.t("templateManagerExtraV2.deleteTemplateConfirm", { name: deletingTemplate?.shortcode })}
        open={confirmModalOpen}
        onClose={() => setConfirmModalOpen(false)}
        onConfirm={handleDeleteTemplate}
      >
        {i18n.t("templateManagerForm.confirmDeleteMessage")}
      </ConfirmationModal>

      {/* View Modal */}
      <Dialog open={viewModalOpen} onClose={() => setViewModalOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{i18n.t("templateManagerForm.templateDetails")}</DialogTitle>
        <DialogContent>
          {selectedTemplate && (
            <Box>
              <Grid container spacing={2}>
                <Grid item xs={6}>
                  <Typography variant="subtitle2" color="textSecondary">{i18n.t("templateManagerForm.name")}</Typography>
                  <Typography>{selectedTemplate.shortcode}</Typography>
                </Grid>
                <Grid item xs={3}>
                  <Typography variant="subtitle2" color="textSecondary">{i18n.t("templateManagerForm.language")}</Typography>
                  <Typography>{selectedTemplate.language || "pt_BR"}</Typography>
                </Grid>
                <Grid item xs={3}>
                  <Typography variant="subtitle2" color="textSecondary">{i18n.t("templateManagerForm.status")}</Typography>
                  {getStatusIcon(selectedTemplate.status)}
                </Grid>
              </Grid>
              <Box mt={2}>
                <Typography variant="subtitle2" color="textSecondary">{i18n.t("templateManagerForm.category")}</Typography>
                <Typography>{getCategoryLabel(selectedTemplate.category)}</Typography>
              </Box>
              {selectedTemplate.components && selectedTemplate.components.length > 0 && (
                <Box mt={2}>
                  <Typography variant="subtitle2" color="textSecondary" gutterBottom>{i18n.t("templateManagerForm.components")}</Typography>
                  <Box className={classes.previewBox}>
                    {selectedTemplate.components.map((comp, i) => (
                      <Box key={i} mb={1}>
                        {comp.type === "HEADER" && (
                          <Typography variant="subtitle1" style={{ fontWeight: 700 }}>{comp.text}</Typography>
                        )}
                        {comp.type === "BODY" && (
                          <Box className={classes.previewBubble}>
                            <Typography style={{ whiteSpace: "pre-wrap" }}>{comp.text}</Typography>
                          </Box>
                        )}
                        {comp.type === "FOOTER" && (
                          <Typography variant="caption" color="textSecondary">{comp.text}</Typography>
                        )}
                        {comp.type === "BUTTONS" && comp.buttons && (
                          <Box mt={1}>
                            {(typeof comp.buttons === "string" ? JSON.parse(comp.buttons) : comp.buttons).map((btn, j) => (
                              <Button key={j} variant="outlined" size="small" fullWidth style={{ marginBottom: 4 }}>
                                {btn.text}
                              </Button>
                            ))}
                          </Box>
                        )}
                      </Box>
                    ))}
                  </Box>
                </Box>
              )}
            </Box>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setViewModalOpen(false)} color="primary">{i18n.t("templateManagerForm.close")}</Button>
        </DialogActions>
      </Dialog>

      {/* Create Modal */}
      <Dialog open={createModalOpen} onClose={() => setCreateModalOpen(false)} maxWidth="md" fullWidth>
        <DialogTitle>{i18n.t("templateManagerPageExtra.createNewTemplate")}</DialogTitle>
        <DialogContent>
          <Grid container spacing={2}>
            <Grid item xs={12} md={4}>
              <TextField
                label={i18n.t("templateManagerPageExtra.templateNameLabel")}
                fullWidth
                margin="dense"
                variant="outlined"
                value={templateName}
                onChange={e => setTemplateName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, "_"))}
                helperText={i18n.t("templateManagerForm.nameHelper")}
                required
              />
            </Grid>
            <Grid item xs={12} md={4}>
              <FormControl fullWidth margin="dense" variant="outlined">
                <InputLabel>{i18n.t("templateManagerForm.category")}</InputLabel>
                <Select value={templateCategory} onChange={e => setTemplateCategory(e.target.value)} label={i18n.t("templateManagerForm.category")}>
                  {CATEGORIES.map(c => (
                    <MenuItem key={c.value} value={c.value}>{c.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} md={4}>
              <FormControl fullWidth margin="dense" variant="outlined">
                <InputLabel>{i18n.t("templateManagerForm.language")}</InputLabel>
                <Select value={templateLanguage} onChange={e => setTemplateLanguage(e.target.value)} label={i18n.t("templateManagerForm.language")}>
                  {LANGUAGES.map(l => (
                    <MenuItem key={l.value} value={l.value}>{l.label}</MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
          </Grid>

          <Divider style={{ margin: "16px 0" }} />

          {/* Tipo de cabeçalho */}
          <Box display="flex" alignItems="center" style={{ gap: 12, marginTop: 8, marginBottom: 4, flexWrap: "wrap" }}>
            <Typography variant="subtitle2">{i18n.t("templateManagerExtraV2.headerTypeTitle")}</Typography>
            {[
              { v: "NONE", label: i18n.t("templateManagerExtraV2.headerTypeNone") },
              { v: "TEXT", label: i18n.t("templateManagerExtraV2.headerTypeText") },
              { v: "IMAGE", label: i18n.t("templateManagerExtraV2.headerTypeImage") },
              { v: "VIDEO", label: i18n.t("templateManagerExtraV2.headerTypeVideo") },
              { v: "DOCUMENT", label: i18n.t("templateManagerExtraV2.headerTypeDocument") },
            ].map(opt => (
              <Chip
                key={opt.v}
                label={opt.label}
                size="small"
                clickable
                color={headerType === opt.v ? "primary" : "default"}
                onClick={() => setHeaderType(opt.v)}
              />
            ))}
          </Box>

          {headerType === "TEXT" && (
            <TextField
              label={i18n.t("templateManagerForm.headerOptional")}
              fullWidth
              margin="dense"
              variant="outlined"
              value={headerText}
              onChange={e => setHeaderText(e.target.value.slice(0, HEADER_LIMIT))}
              inputProps={{ maxLength: HEADER_LIMIT }}
              helperText={`${headerText.length}/${HEADER_LIMIT} • ${i18n.t("templateManagerForm.headerHelper")}`}
            />
          )}

          {["IMAGE", "VIDEO", "DOCUMENT"].includes(headerType) && (
            <Box mt={1}>
              <TextField
                label={
                  headerType === "IMAGE"
                    ? i18n.t("templateManagerExtraV2.mediaUrlImageLabel")
                    : headerType === "VIDEO"
                      ? i18n.t("templateManagerExtraV2.mediaUrlVideoLabel")
                      : i18n.t("templateManagerExtraV2.mediaUrlDocumentLabel")
                }
                fullWidth
                margin="dense"
                variant="outlined"
                value={headerMediaUrl}
                onChange={e => setHeaderMediaUrl(e.target.value)}
                placeholder="https://..."
                helperText={i18n.t("templateManagerExtraV2.mediaUrlHelper")}
                InputProps={{
                  endAdornment: (
                    <InputAdornment position="end">
                      <input
                        ref={headerMediaInputRef}
                        type="file"
                        style={{ display: "none" }}
                        accept={
                          headerType === "IMAGE"
                            ? "image/*"
                            : headerType === "VIDEO"
                            ? "video/*"
                            : ".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.txt"
                        }
                        onChange={async (e) => {
                          const file = e.target.files?.[0];
                          e.target.value = "";
                          if (!file) return;
                          try {
                            setHeaderMediaUploading(true);
                            const fd = new FormData();
                            fd.append("file", file);
                            const { data } = await api.post(
                              "/template-media-upload",
                              fd,
                              { headers: { "Content-Type": "multipart/form-data" } }
                            );
                            if (data?.url) {
                              setHeaderMediaUrl(data.url);
                              if (headerType === "DOCUMENT" && !headerMediaFilename) {
                                setHeaderMediaFilename(file.name);
                              }
                              toast.success(i18n.t("templateManagerExtraV2.uploadSuccess"));
                            } else {
                              toast.error(i18n.t("templateManagerExtraV2.uploadNoUrl"));
                            }
                          } catch (err) {
                            toastError(err);
                          } finally {
                            setHeaderMediaUploading(false);
                          }
                        }}
                      />
                      <Button
                        size="small"
                        variant="outlined"
                        color="primary"
                        startIcon={
                          headerMediaUploading
                            ? <CircularProgress size={14} />
                            : <CloudUploadIcon fontSize="small" />
                        }
                        disabled={headerMediaUploading}
                        onClick={() => headerMediaInputRef.current?.click()}
                      >
                        {headerMediaUploading ? i18n.t("templateManagerExtraV2.uploading") : i18n.t("templateManagerExtraV2.uploadFile")}
                      </Button>
                    </InputAdornment>
                  )
                }}
              />
              {headerType === "DOCUMENT" && (
                <TextField
                  label={i18n.t("templateManagerExtraV2.fileNameLabel")}
                  fullWidth
                  margin="dense"
                  variant="outlined"
                  value={headerMediaFilename}
                  onChange={e => setHeaderMediaFilename(e.target.value)}
                  placeholder="documento.pdf"
                />
              )}
              {headerMediaUrl && (
                <Box
                  mt={1}
                  p={1.5}
                  style={{
                    border: "1px solid #e0e0e0",
                    borderRadius: 8,
                    backgroundColor: "#fafafa",
                  }}
                >
                  <Typography
                    variant="caption"
                    color="textSecondary"
                    style={{ display: "block", marginBottom: 6, fontWeight: 600 }}
                  >
                    {i18n.t("templateManagerExtraV2.preview")}
                  </Typography>
                  {headerType === "IMAGE" && (
                    <img
                      src={headerMediaUrl}
                      alt={i18n.t("templateManagerExtraV2.preview")}
                      style={{
                        maxWidth: "100%",
                        maxHeight: 220,
                        borderRadius: 6,
                        display: "block",
                        objectFit: "contain",
                        backgroundColor: "#fff",
                      }}
                      onError={(e) => {
                        e.currentTarget.style.display = "none";
                        const fallback = e.currentTarget.nextElementSibling;
                        if (fallback) fallback.style.display = "block";
                      }}
                    />
                  )}
                  {headerType === "IMAGE" && (
                    <Typography
                      variant="caption"
                      color="error"
                      style={{ display: "none" }}
                    >
                      {i18n.t("templateManagerExtraV2.imageLoadError")}
                    </Typography>
                  )}
                  {headerType === "VIDEO" && (
                    <video
                      src={headerMediaUrl}
                      controls
                      style={{
                        maxWidth: "100%",
                        maxHeight: 240,
                        borderRadius: 6,
                        display: "block",
                        backgroundColor: "#000",
                      }}
                    />
                  )}
                  {headerType === "DOCUMENT" && (() => {
                    let fileName = headerMediaFilename;
                    let ext = "";
                    try {
                      const u = new URL(headerMediaUrl);
                      const pathPart = u.pathname.split("/").pop() || "";
                      if (!fileName) fileName = decodeURIComponent(pathPart);
                      const dot = pathPart.lastIndexOf(".");
                      if (dot >= 0) ext = pathPart.slice(dot + 1).toUpperCase();
                    } catch (_) {
                      if (!fileName) fileName = headerMediaUrl.split("/").pop() || i18n.t("templateManagerExtraV2.documentFallback");
                    }
                    return (
                      <Box display="flex" alignItems="center" style={{ gap: 12 }}>
                        <Box
                          style={{
                            width: 48,
                            height: 56,
                            borderRadius: 6,
                            backgroundColor: "#1976d2",
                            color: "#fff",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            fontWeight: 700,
                            fontSize: 11,
                            flexShrink: 0,
                          }}
                        >
                          {ext || "DOC"}
                        </Box>
                        <Box style={{ minWidth: 0, flex: 1 }}>
                          <Typography
                            variant="body2"
                            style={{
                              fontWeight: 600,
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {fileName || i18n.t("templateManagerExtraV2.documentFallback")}
                          </Typography>
                          <Typography variant="caption" color="textSecondary">
                            <a
                              href={headerMediaUrl}
                              target="_blank"
                              rel="noopener noreferrer"
                              style={{ color: "#1976d2" }}
                            >
                              {i18n.t("templateManagerExtraV2.openDocument")}
                            </a>
                          </Typography>
                        </Box>
                      </Box>
                    );
                  })()}
                </Box>
              )}
            </Box>
          )}

          {/* Toolbar do corpo + variáveis */}
          <Box display="flex" alignItems="center" justifyContent="space-between" mt={1}>
            <Typography variant="subtitle2">{i18n.t("templateManagerExtraV2.bodyRequiredTitle")}</Typography>
            <Box>
              <Button size="small" variant="outlined" onClick={insertVariableInBody}>
                {i18n.t("templateManagerExtraV2.insertVariable")}
              </Button>
            </Box>
          </Box>
          <TextField
            inputRef={bodyRef}
            fullWidth
            margin="dense"
            variant="outlined"
            multiline
            rows={5}
            value={bodyText}
            onChange={e => setBodyText(e.target.value.slice(0, BODY_LIMIT))}
            inputProps={{ maxLength: BODY_LIMIT }}
            helperText={`${bodyText.length}/${BODY_LIMIT} • ${i18n.t("templateManagerForm.messageBodyHelper")}`}
            required
          />

          {/* Exemplos das variáveis */}
          {allUsedVars.length > 0 && (
            <Box mt={1} p={1.5} style={{ border: "1px solid #e0e0e0", borderRadius: 8, backgroundColor: "#fafafa" }}>
              <Typography variant="subtitle2" style={{ fontWeight: 600, marginBottom: 4 }}>
                {i18n.t("templateManagerExtraV2.varExamplesTitle")}
              </Typography>
              <Typography variant="caption" color="textSecondary" style={{ display: "block", marginBottom: 8 }}>
                {i18n.t("templateManagerExtraV2.varExamplesDesc")}
              </Typography>
              <Grid container spacing={1}>
                {allUsedVars.map(n => (
                  <Grid item xs={12} sm={6} md={4} key={n}>
                    <TextField
                      fullWidth
                      size="small"
                      variant="outlined"
                      label={i18n.t("templateManagerExtraV2.varExampleLabel", { var: `{{${n}}}` })}
                      value={variableExamples[n] || ""}
                      onChange={e => {
                        const value = e.target.value;
                        setVariableExamples(prev => ({ ...prev, [n]: value }));
                      }}
                    />
                  </Grid>
                ))}
              </Grid>
            </Box>
          )}

          <TextField
            label={i18n.t("templateManagerForm.footerOptional")}
            fullWidth
            margin="dense"
            variant="outlined"
            value={footerText}
            onChange={e => setFooterText(e.target.value.slice(0, FOOTER_LIMIT))}
            inputProps={{ maxLength: FOOTER_LIMIT }}
            helperText={`${footerText.length}/${FOOTER_LIMIT} • ${i18n.t("templateManagerForm.footerHelper")}`}
          />

          <Divider style={{ margin: "16px 0" }} />

          <Box display="flex" alignItems="center" justifyContent="space-between" mb={1}>
            <Typography variant="subtitle2">{i18n.t("templateManagerForm.buttonsOptional")}</Typography>
            <Box>
              <Button size="small" onClick={() => addButton("QUICK_REPLY")} style={{ marginRight: 8 }}>
                + {i18n.t("templateManagerForm.quickReply")}
              </Button>
              <Button size="small" onClick={() => addButton("URL")}>
                + {i18n.t("templateManagerExtraV2.link")}
              </Button>
              <Button size="small" onClick={() => addButton("PHONE_NUMBER")} style={{ marginLeft: 8 }}>
                + {i18n.t("templateManagerForm.phone")}
              </Button>
            </Box>
          </Box>

          {buttons.map((btn, i) => (
            <Box key={i} className={classes.componentBox}>
              <Grid container spacing={1} alignItems="center">
                <Grid item xs={3}>
                  <Chip label={btn.type === "QUICK_REPLY" ? i18n.t("templateManagerForm.quickReply") : btn.type === "URL" ? i18n.t("templateManagerExtraV2.link") : i18n.t("templateManagerForm.phone")} size="small" />
                </Grid>
                <Grid item xs={btn.type === "QUICK_REPLY" ? 8 : 4}>
                  <TextField
                    size="small"
                    label={i18n.t("templateManagerForm.text")}
                    fullWidth
                    value={btn.text}
                    onChange={e => updateButton(i, "text", e.target.value)}
                  />
                </Grid>
                {btn.type === "URL" && (
                  <Grid item xs={4}>
                    <TextField
                      size="small"
                      label="URL"
                      fullWidth
                      value={btn.url}
                      onChange={e => updateButton(i, "url", e.target.value)}
                    />
                  </Grid>
                )}
                {btn.type === "PHONE_NUMBER" && (
                  <Grid item xs={4}>
                    <TextField
                      size="small"
                      label={i18n.t("templateManagerForm.phone")}
                      fullWidth
                      value={btn.phone}
                      onChange={e => updateButton(i, "phone", e.target.value)}
                    />
                  </Grid>
                )}
                <Grid item xs={1}>
                  <IconButton size="small" onClick={() => removeButton(i)}>
                    <DeleteIcon fontSize="small" />
                  </IconButton>
                </Grid>
              </Grid>
            </Box>
          ))}

          {/* Preview WhatsApp */}
          {(bodyText || headerText || headerType !== "NONE") && (() => {
            const applyVars = (txt) =>
              (txt || "").replace(/\{\{(\d+)\}\}/g, (_, n) => {
                const v = variableExamples[n];
                return v && String(v).trim() ? v : `{{${n}}}`;
              });
            const now = new Date();
            const hh = String(now.getHours()).padStart(2, "0");
            const mm = String(now.getMinutes()).padStart(2, "0");
            const renderedHeader = applyVars(headerText);
            const renderedBody = applyVars(bodyText);
            const renderedFooter = footerText;
            return (
              <Box mt={2}>
                <Typography variant="subtitle2" gutterBottom>
                  {i18n.t("templateManagerForm.preview")} — WhatsApp
                </Typography>
                <Box className={classes.previewBox}>
                  <Box className={classes.previewBubble}>
                    {headerType === "IMAGE" && (
                      headerMediaUrl
                        ? <img src={headerMediaUrl} alt="header" className={classes.previewMedia} />
                        : <Box className={classes.previewMediaPlaceholder}>🖼️ {i18n.t("templateManagerExtraV2.previewImage")}</Box>
                    )}
                    {headerType === "VIDEO" && (
                      headerMediaUrl
                        ? <video src={headerMediaUrl} className={classes.previewMedia} controls />
                        : <Box className={classes.previewMediaPlaceholder}>🎬 {i18n.t("templateManagerExtraV2.previewVideo")}</Box>
                    )}
                    {headerType === "DOCUMENT" && (
                      <Box className={classes.previewMediaPlaceholder}>
                        📄 {headerMediaUrl ? i18n.t("templateManagerExtraV2.previewDocumentAttached") : i18n.t("templateManagerExtraV2.previewDocument")}
                      </Box>
                    )}
                    {headerType === "TEXT" && renderedHeader && (
                      <Typography className={classes.previewHeaderText}>
                        {renderedHeader}
                      </Typography>
                    )}
                    {renderedBody && (
                      <Typography className={classes.previewBodyText}>
                        {renderedBody}
                      </Typography>
                    )}
                    {renderedFooter && (
                      <Typography className={classes.previewFooter}>
                        {renderedFooter}
                      </Typography>
                    )}
                    <span className={classes.previewMeta}>{hh}:{mm} ✓✓</span>
                  </Box>
                  {buttons.length > 0 && (() => {
                    const quick = buttons.filter(b => b.type === "QUICK_REPLY");
                    const ctas  = buttons.filter(b => b.type === "URL" || b.type === "PHONE_NUMBER");
                    // WhatsApp mostra até 3 botões diretos; o restante vai para "Ver todas as opções"
                    const visibleCtas = ctas.slice(0, 2);
                    const hiddenCtas  = ctas.slice(2);
                    const visibleQr   = quick.slice(0, 3);
                    const hiddenQr    = quick.slice(3);
                    const hiddenCount = hiddenCtas.length + hiddenQr.length;
                    const labelFallback = (i) => `${i18n.t("templateManagerForm.button")} ${i + 1}`;
                    return (
                      <Box>
                        {/* CTAs (URL/Telefone) — full width, com ícone */}
                        {visibleCtas.map((btn, i) => (
                          <Box key={`cta-${i}`} className={classes.previewCtaBtn}>
                            <span style={{ fontSize: 16, lineHeight: 1 }}>
                              {btn.type === "URL" ? "🔗" : "📞"}
                            </span>
                            <span>{btn.text || labelFallback(i)}</span>
                          </Box>
                        ))}
                        {/* Quick replies — em pares lado a lado */}
                        {visibleQr.length > 0 && (
                          <Box className={classes.previewQrRow}>
                            {visibleQr.map((btn, i) => (
                              <Box key={`qr-${i}`} className={classes.previewQrBtn}>
                                <span>{btn.text || labelFallback(i)}</span>
                              </Box>
                            ))}
                          </Box>
                        )}
                        {hiddenCount > 0 && (
                          <Box className={classes.previewMoreBtn}>
                            <span style={{ fontSize: 16, lineHeight: 1 }}>⋯</span>
                            <span>{i18n.t("templateManagerExtraV2.seeAllOptions")} ({hiddenCount})</span>
                          </Box>
                        )}
                      </Box>
                    );
                  })()}
                </Box>
                <Typography variant="caption" color="textSecondary" style={{ display: "block", marginTop: 6 }}>
                  {i18n.t("templateManagerExtraV2.previewVarsNote")}
                </Typography>
              </Box>
            );
          })()}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setCreateModalOpen(false); resetForm(); }}>
            {i18n.t("templateManagerForm.cancel")}
          </Button>
          <Button
            onClick={handleCreateTemplate}
            color="primary"
            variant="contained"
            disabled={submitting || !templateName || !bodyText}
          >
            {submitting ? <CircularProgress size={24} /> : i18n.t("templateManagerPage.submitApproval")}
          </Button>
        </DialogActions>
      </Dialog>

      <Box className={classes.pageWrap}>
        <Box className={classes.heroHeader}>
          <Box>
            <Typography className={classes.heroTitle}>
              {i18n.t("templateManagerPage.title")}
            </Typography>
            <Typography className={classes.heroSubtitle}>
              {i18n.t("templateManagerPage.heroSubtitle", "Templates, saúde do número e webhook Meta em um só lugar")}
            </Typography>
          </Box>
          <Box display="flex" alignItems="center" style={{ gap: 12, flexWrap: "wrap" }}>
            {activeTab === "templates" && (
              <>
                <FormControl size="small" variant="outlined" style={{ minWidth: 220, background: "#fff", borderRadius: 8 }}>
                  <Select
                    displayEmpty
                    value={selectedWhatsappId || ""}
                    onChange={e => setSelectedWhatsappId(e.target.value)}
                    style={{ color: "#0f172a" }}
                    renderValue={(val) => {
                      if (!val) return <span style={{ color: "#94a3b8" }}>{i18n.t("templateManagerPage.connection")}</span>;
                      const w = whatsapps.find(x => x.id === val);
                      return <span style={{ color: "#0f172a" }}>{w ? w.name : ""}</span>;
                    }}
                  >
                    {whatsapps.map(w => (
                      <MenuItem key={w.id} value={w.id} style={{ color: "#0f172a" }}>{w.name}</MenuItem>
                    ))}
                  </Select>
                </FormControl>

                <TextField
                  size="small"
                  placeholder={i18n.t("templateManagerPage.search")}
                  type="search"
                  value={searchParam}
                  onChange={e => setSearchParam(e.target.value)}
                  style={{ background: "rgba(255,255,255,0.95)", borderRadius: 8, minWidth: 180 }}
                  variant="outlined"
                  InputProps={{
                    startAdornment: (
                      <InputAdornment position="start">
                        <SearchIcon style={{ color: "#64748b" }} fontSize="small" />
                      </InputAdornment>
                    ),
                  }}
                />
                <Tooltip title={i18n.t("templateManagerPage.syncTooltip")}>
                  <span>
                    <Button
                      variant="contained"
                      onClick={handleSync}
                      disabled={syncing || !selectedWhatsappId}
                      startIcon={syncing ? <CircularProgress size={16} /> : <SyncIcon />}
                      style={{ background: "rgba(255,255,255,0.15)", color: "#fff", border: "1px solid rgba(255,255,255,0.35)", boxShadow: "none" }}
                    >
                      {i18n.t("templateManagerPage.sync")}
                    </Button>
                  </span>
                </Tooltip>
                <Button
                  variant="contained"
                  onClick={() => setCreateModalOpen(true)}
                  disabled={!selectedWhatsappId}
                  startIcon={<AddIcon />}
                  style={{ background: "#fff", color: "#1d4ed8", fontWeight: 700 }}
                >
                  {i18n.t("templateManagerPage.createTemplate")}
                </Button>
              </>
            )}
          </Box>
        </Box>

        <Paper className={classes.tabsBar} elevation={0}>
          <Tabs
            value={activeTab}
            onChange={(_, v) => setActiveTab(v)}
            classes={{ indicator: classes.tabsIndicator }}
            variant="scrollable"
            scrollButtons="auto"
          >
            <Tab
              value="templates"
              icon={<TemplatesIcon fontSize="small" />}
              iconPosition="start"
              label={i18n.t("templateManagerPage.title")}
              classes={{ root: classes.tabRoot }}
            />
            <Tab
              value="health"
              icon={<HealthIcon fontSize="small" style={{ color: activeTab === "health" ? "#16a34a" : undefined }} />}
              iconPosition="start"
              label={i18n.t("templateManager.health") || "Saúde"}
              classes={{ root: classes.tabRoot }}
            />
            <Tab
              value="webhook"
              icon={<CloudUploadIcon fontSize="small" style={{ color: activeTab === "webhook" ? "#1877F2" : undefined }} />}
              iconPosition="start"
              label={i18n.t("templateManager.webhookMeta") || "Webhook Meta"}
              classes={{ root: classes.tabRoot }}
            />
          </Tabs>
        </Paper>

        {activeTab === "templates" && (
          <>
            <Grid container spacing={2} style={{ marginBottom: 12 }}>
              {[
                { label: i18n.t("templateManagerPage.summary.total") || "Total", value: summaryMetrics.total, color: "#475569" },
                { label: i18n.t("templateManagerPage.summary.approved") || "Aprovados", value: summaryMetrics.approved, color: "#16a34a" },
                { label: i18n.t("templateManagerPage.summary.pending") || "Pendentes", value: summaryMetrics.pending, color: "#f59e0b" },
                { label: i18n.t("templateManagerPage.summary.rejected") || "Rejeitados", value: summaryMetrics.rejected, color: "#ef4444" },
              ].map((item, idx) => (
                <Grid item xs={6} sm={3} key={idx}>
                  <Card className={classes.summaryCard} variant="outlined">
                    <CardContent style={{ padding: "8px 12px" }}>
                      <Typography className={classes.summaryValue} style={{ color: item.color }}>
                        {item.value}
                      </Typography>
                      <Typography className={classes.summaryLabel}>{item.label}</Typography>
                    </CardContent>
                  </Card>
                </Grid>
              ))}
            </Grid>

            <Paper className={classes.mainPaper} variant="outlined">
              {whatsapps.length === 0 && !loading ? (
                <Box p={4} textAlign="center">
                  <Typography color="textSecondary">
                    {i18n.t("templateManagerPage.noOfficialConnection")}
                  </Typography>
                </Box>
              ) : (
                <Table size="small">
                  <TableHead>
                    <TableRow>
                      <TableCell className={classes.tableHeader}>{i18n.t("templateManagerPage.tableName")}</TableCell>
                      <TableCell align="center" className={classes.tableHeader}>{i18n.t("templateManagerPage.tableCategory")}</TableCell>
                      <TableCell align="center" className={classes.tableHeader}>{i18n.t("templateManagerPage.tableLanguage")}</TableCell>
                      <TableCell align="center" className={classes.tableHeader}>{i18n.t("templateManagerPage.tableStatus")}</TableCell>
                      <TableCell align="center" className={classes.tableHeader}>{i18n.t("templateManagerPage.tableActions")}</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {filteredTemplates.map((template) => (
                      <TableRow key={template.id} hover>
                        <TableCell className={classes.tableCell} style={{ fontWeight: 500 }}>{template.shortcode}</TableCell>
                        <TableCell align="center" className={classes.tableCell}>
                          <Chip label={getCategoryLabel(template.category)} size="small" variant="outlined" />
                        </TableCell>
                        <TableCell align="center" className={classes.tableCell}>{template.language || "pt_BR"}</TableCell>
                        <TableCell align="center" className={classes.tableCell}>{getStatusIcon(template.status)}</TableCell>
                        <TableCell align="center" className={classes.tableCell}>
                          <Tooltip title={i18n.t("templateManagerPage.viewDetails")}>
                            <IconButton size="small" onClick={() => { setSelectedTemplate(template); setViewModalOpen(true); }}>
                              <ViewIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title={i18n.t("templateManagerPage.editTemplate")}>
                            <IconButton size="small" onClick={() => handleEditTemplate(template)}>
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title={i18n.t("templateManagerPage.deleteTemplate")}>
                            <IconButton size="small" onClick={() => { setDeletingTemplate(template); setConfirmModalOpen(true); }}>
                              <DeleteIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    ))}
                    {loading && <TableRowSkeleton columns={5} />}
                    {!loading && filteredTemplates.length === 0 && (
                      <TableRow>
                        <TableCell colSpan={5} align="center">
                          <Typography color="textSecondary" style={{ padding: 16 }}>
                            {i18n.t("templateManagerPage.noTemplatesFound")}
                          </Typography>
                        </TableCell>
                      </TableRow>
                    )}
                  </TableBody>
                </Table>
              )}
            </Paper>
          </>
        )}

        {activeTab === "health" && (
          <Suspense fallback={<Box display="flex" justifyContent="center" p={6}><CircularProgress /></Box>}>
            <WhatsappHealth />
          </Suspense>
        )}

        {activeTab === "webhook" && (
          <Suspense fallback={<Box display="flex" justifyContent="center" p={6}><CircularProgress /></Box>}>
            <MetaUnifiedWebhook />
          </Suspense>
        )}
      </Box>


    </MainContainer>
  );
};

export default TemplateManager;
