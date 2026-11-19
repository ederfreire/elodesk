import React, { useState, useEffect, useReducer, useContext } from "react";

import { toast } from "react-toastify";
import { useHistory } from "react-router-dom";

import { makeStyles } from "@material-ui/core/styles";
import { useTheme } from "@material-ui/core/styles";
import useMediaQuery from "@material-ui/core/useMediaQuery";

import Paper from "@material-ui/core/Paper";
import TextField from "@material-ui/core/TextField";
import InputAdornment from "@material-ui/core/InputAdornment";
import Card from "@material-ui/core/Card";
import CardContent from "@material-ui/core/CardContent";

import SearchIcon from "@material-ui/icons/Search";
import AddCircle from "@mui/icons-material/AddCircle";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";
import ContentCopy from "@mui/icons-material/ContentCopy";
import DevicesFold from "@mui/icons-material/DevicesFold";
import MoreVert from "@mui/icons-material/MoreVert";
import Edit from "@mui/icons-material/Edit";
import Delete from "@mui/icons-material/Delete";
import PlayArrow from "@mui/icons-material/PlayArrow";
import Pause from "@mui/icons-material/Pause";
import BarChartIcon from "@mui/icons-material/BarChart";
import GetAppIcon from "@mui/icons-material/GetApp";
import { Button, CircularProgress, Stack, Box, Typography, Chip, IconButton, Menu, MenuItem, Fab, useScrollTrigger, Slide, Divider, Grid, Select, FormControl } from "@mui/material";

import api from "../../services/api";
import TableRowSkeleton from "../../components/TableRowSkeleton";
import ContactModal from "../../components/ContactModal";
import ConfirmationModal from "../../components/ConfirmationModal";
import FlowBuilderModal from "../../components/FlowBuilderModal";
import FlowReportModal from "../../components/FlowReportModal";

import { i18n } from "../../translate/i18n";
import FlowBuilderGenerateAIModal from "../../components/FlowBuilderGenerateAIModal";
import MainHeader from "../../components/MainHeader";
import Title from "../../components/Title";
import MainHeaderButtonsWrapper from "../../components/MainHeaderButtonsWrapper";
import MainContainer from "../../components/MainContainer";
import toastError from "../../errors/toastError";
import { AuthContext } from "../../context/Auth/AuthContext";
import { Can } from "../../components/Can";
import ForbiddenPage from "../../components/ForbiddenPage";
import NewTicketModal from "../../components/NewTicketModal";
import { SocketContext } from "../../context/Socket/SocketContext";

const reducer = (state, action) => {
  if (action.type === "LOAD_CONTACTS") {
    const contacts = action.payload;
    const newContacts = [];

    contacts.forEach((contact) => {
      const contactIndex = state.findIndex((c) => c.id === contact.id);
      if (contactIndex !== -1) {
        state[contactIndex] = contact;
      } else {
        newContacts.push(contact);
      }
    });

    return [...state, ...newContacts];
  }

  if (action.type === "UPDATE_CONTACTS") {
    const contact = action.payload;
    const contactIndex = state.findIndex((c) => c.id === contact.id);

    if (contactIndex !== -1) {
      state[contactIndex] = contact;
      return [...state];
    } else {
      return [contact, ...state];
    }
  }

  if (action.type === "DELETE_CONTACT") {
    const contactId = action.payload;
    const contactIndex = state.findIndex((c) => c.id === contactId);
    if (contactIndex !== -1) {
      state.splice(contactIndex, 1);
    }
    return [...state];
  }

  if (action.type === "RESET") {
    return [];
  }
};

const useStyles = makeStyles((theme) => ({
  root: {
    backgroundColor: theme.palette.type === "dark" ? theme.palette.background.default : "#F8FAFC",
    minHeight: "100vh",
  },
  mainContainer: {
    maxWidth: 1280,
    margin: "0 auto",
    padding: theme.spacing(4, 4, 6),
    [theme.breakpoints.down("sm")]: { padding: theme.spacing(2) },
  },
  pageHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: theme.spacing(2),
    marginBottom: theme.spacing(3),
    flexWrap: "wrap",
  },
  pageTitle: {
    fontSize: "1.875rem",
    fontWeight: 800,
    color: theme.palette.text.primary,
    lineHeight: 1.2,
    margin: 0,
  },
  pageSubtitle: {
    fontSize: "0.9375rem",
    color: theme.palette.text.secondary,
    marginTop: 4,
  },
  headerActions: {
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(1),
  },
  newFlowBtn: {
    backgroundColor: "#2563EB",
    "&, & .MuiButton-label": { color: "#ffffff !important" },
    "& .MuiSvgIcon-root": { color: "#ffffff !important" },
    borderRadius: 10,
    textTransform: "none",
    fontWeight: 600,
    padding: "10px 18px",
    boxShadow: "0 1px 2px rgba(59,130,246,0.25)",
    "&:hover": { backgroundColor: "#2563EB" },
  },
  aiBtn: {
    // Cor solida em vez de gradiente. O gradiente ia de #7C4DFF a #6435E0 e,
    // com o texto por cima, o contraste caia no meio do botao — era o
    // "nao da pra ver".
    backgroundColor: "#5B21B6",
    borderRadius: 10,
    textTransform: "none",
    fontWeight: 700,
    padding: "10px 18px",
    boxShadow: "0 1px 3px rgba(91,33,182,0.35)",

    // A cor do texto e forcada tambem no .MuiButton-label. O rotulo do Button
    // no MUI v4 e um <span>, e o App.js tem regras globais no CssBaseline
    // atingindo `span` (com !important no modo escuro). Declarar so no root
    // deixava o rotulo a merce dessas regras.
    "&, & .MuiButton-label": {
      color: "#ffffff !important",
    },
    "& .MuiButton-label svg, & .MuiSvgIcon-root": {
      color: "#ffffff !important",
    },

    "&:hover": {
      backgroundColor: "#4C1D95",
    },
  },
  importBtn: {
    borderRadius: 10,
    textTransform: "none",
    fontWeight: 600,
    padding: "9px 16px",
    borderColor: theme.palette.divider,
    color: theme.palette.text.primary,
  },
  filtersRow: {
    display: "flex",
    gap: theme.spacing(1.5),
    marginBottom: theme.spacing(2.5),
    flexWrap: "wrap",
  },
  searchField: {
    flex: 1,
    minWidth: 260,
    "& .MuiOutlinedInput-root": {
      backgroundColor: theme.palette.background.paper,
      borderRadius: 10,
      "& fieldset": { borderColor: theme.palette.divider },
    },
  },
  statusSelect: {
    minWidth: 200,
    "& .MuiOutlinedInput-root": {
      backgroundColor: theme.palette.background.paper,
      borderRadius: 10,
      "& fieldset": { borderColor: theme.palette.divider },
    },
  },
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: theme.spacing(2),
    marginBottom: theme.spacing(3),
    [theme.breakpoints.down("sm")]: {
      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    },
  },
  statCard: {
    backgroundColor: theme.palette.background.paper,
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: 12,
    padding: theme.spacing(2, 2.25),
  },
  statLabel: {
    fontSize: "0.8125rem",
    color: theme.palette.text.secondary,
    marginBottom: 6,
    fontWeight: 500,
  },
  statValue: {
    fontSize: "1.75rem",
    fontWeight: 800,
    lineHeight: 1,
    color: theme.palette.text.primary,
  },
  flowCard: {
    backgroundColor: theme.palette.background.paper,
    borderRadius: 12,
    border: `1px solid ${theme.palette.divider}`,
    padding: theme.spacing(2),
    cursor: "pointer",
    transition: "all .18s ease",
    "&:hover": {
      borderColor: "#3B82F6",
      boxShadow: "0 4px 14px rgba(15,23,42,0.06)",
    },
  },
  flowIconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: theme.palette.type === "dark" ? "rgba(59,130,246,0.18)" : "#EFF6FF",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#3B82F6",
    flexShrink: 0,
  },
  flowName: {
    fontSize: "0.9375rem",
    fontWeight: 700,
    color: theme.palette.text.primary,
    lineHeight: 1.25,
  },
  flowType: {
    fontSize: "0.8125rem",
    color: theme.palette.text.secondary,
    marginTop: 2,
  },
  activeBadge: {
    height: 22,
    borderRadius: 999,
    fontSize: "0.75rem",
    fontWeight: 600,
    // Estava com cores fixas de tema claro (fundo #DCFCE7, texto #15803D),
    // enquanto o inactiveBadge logo abaixo ja tratava os dois temas. No
    // escuro o verde-claro sumia e o texto saia preto, porque o App.js tem
    // `.MuiChip-root { color: unset !important }` no modo escuro — a regra
    // anula a cor da classe e o rotulo passa a herdar.
    backgroundColor: theme.palette.type === "dark" ? "#14331F" : "#DCFCE7",
    border: `1px solid ${theme.palette.type === "dark" ? "#166534" : "#BBF7D0"}`,
    // Forcado tambem no .MuiChip-label, que e onde o texto vive e onde a
    // regra global do CssBaseline bate.
    "&, & .MuiChip-label": {
      color: `${theme.palette.type === "dark" ? "#4ADE80" : "#15803D"} !important`,
    },
  },
  inactiveBadge: {
    height: 22,
    borderRadius: 999,
    fontSize: "0.75rem",
    fontWeight: 600,
    backgroundColor: theme.palette.type === "dark" ? "#3F1D1D" : "#FEE2E2",
    border: `1px solid ${theme.palette.type === "dark" ? "#7F1D1D" : "#FECACA"}`,
    // Mesmo motivo do activeBadge: a cor precisa vencer a regra global.
    "&, & .MuiChip-label": {
      color: `${theme.palette.type === "dark" ? "#FCA5A5" : "#B91C1C"} !important`,
    },
  },
  cardMetaRow: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginTop: theme.spacing(1.5),
    fontSize: "0.8125rem",
    color: theme.palette.text.secondary,
  },
  metaDivider: {
    width: 1,
    height: 14,
    backgroundColor: theme.palette.divider,
  },
  emptyState: {
    textAlign: "center",
    padding: theme.spacing(8, 3),
    backgroundColor: theme.palette.background.paper,
    borderRadius: 12,
    border: `1px solid ${theme.palette.divider}`,
  },
  emptyIcon: { fontSize: 56, color: theme.palette.text.disabled, marginBottom: theme.spacing(2) },
  emptyTitle: { fontSize: "1.125rem", fontWeight: 700, marginBottom: 6 },
  emptyDescription: { color: theme.palette.text.secondary, fontSize: "0.9rem" },
  addButton: {
    backgroundColor: "#3B82F6",
    color: "#fff",
    borderRadius: 10,
    padding: "10px 18px",
    textTransform: "none",
    fontWeight: 600,
    "&:hover": { backgroundColor: "#2563EB" },
  },
  fab: {
    position: "fixed",
    bottom: theme.spacing(3),
    right: theme.spacing(3),
    backgroundColor: "#3B82F6",
    color: "#fff",
    "&:hover": { backgroundColor: "#2563EB" },
  },
  loadingContainer: {
    display: "flex",
    justifyContent: "center",
    padding: theme.spacing(8),
  },
  menu: {
    "& .MuiPaper-root": {
      borderRadius: 10,
      border: `1px solid ${theme.palette.divider}`,
      boxShadow: "0 8px 24px rgba(15,23,42,0.08)",
      minWidth: 180,
    },
  },
}));

function HideOnScroll({ children }) {
  const trigger = useScrollTrigger();
  return (
    <Slide appear={false} direction="up" in={!trigger}>
      {children}
    </Slide>
  );
}

function FlowCard({ flow, onEdit, onDuplicate, onDelete, onNavigate, onToggleActive, onExport, onReport, classes }) {
  const [anchorEl, setAnchorEl] = useState(null);
  const theme = useTheme();

  const handleMenuOpen = (event) => { event.stopPropagation(); setAnchorEl(event.currentTarget); };
  const handleMenuClose = () => setAnchorEl(null);
  const handleAction = (action) => { handleMenuClose(); setTimeout(action, 80); };
  const handleCardClick = (event) => {
    if (event.target.closest("button") || event.target.closest('[role="button"]')) return;
    onNavigate(flow.id);
  };

  const exec = Number(flow.executionCount || 0);
  const nodesCount = Array.isArray(flow.flow?.nodes) ? flow.flow.nodes.length : (flow.nodesCount || 0);
  const triggerType = flow.triggerType || "keyword";
  const triggerKey = triggerType === "any_message" ? "anyMessage" : triggerType === "first_contact" ? "firstContact" : triggerType === "out_of_hours" ? "outOfHours" : triggerType;
  const triggerLabel = i18n.exists(`flowPage.triggerTypes.${triggerKey}`)
    ? i18n.t(`flowPage.triggerTypes.${triggerKey}`)
    : triggerType;

  return (
    <div className={classes.flowCard} onClick={handleCardClick}>
      <Stack direction="row" alignItems="flex-start" spacing={1.5}>
        <div className={classes.flowIconBox}>
          <DevicesFold style={{ fontSize: 20 }} />
        </div>
        <Box flex={1} minWidth={0}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
            <Box minWidth={0} flex={1}>
              <Typography className={classes.flowName} noWrap>{flow.name}</Typography>
              <Typography className={classes.flowType} noWrap>{triggerLabel}</Typography>
            </Box>
            <Stack direction="row" alignItems="center" spacing={0.5}>
              <Chip
                size="small"
                label={flow.active ? i18n.t("flowBuilderPage.activeStatus") : i18n.t("flowBuilderPage.inactiveStatus")}
                className={flow.active ? classes.activeBadge : classes.inactiveBadge}
              />
              <IconButton size="small" onClick={handleMenuOpen}>
                <MoreVert fontSize="small" />
              </IconButton>
            </Stack>
          </Stack>

          <div className={classes.cardMetaRow}>
            <span>{nodesCount} {i18n.t(nodesCount === 1 ? "flowPage.node" : "flowPage.nodes") || (nodesCount === 1 ? "nó" : "nós")}</span>
            <span className={classes.metaDivider} />
            <span>{exec.toLocaleString(i18n.language || "pt-BR")} {i18n.t("flowPage.executions") || "execuções"}</span>
          </div>
        </Box>
      </Stack>

      <Menu
        className={classes.menu}
        anchorEl={anchorEl}
        open={Boolean(anchorEl)}
        onClose={handleMenuClose}
      >
        <MenuItem onClick={(e) => { e.stopPropagation(); handleAction(onEdit); }}>
          <Edit fontSize="small" style={{ marginRight: 12, color: theme.palette.text.secondary }} />
          {i18n.t("flowPage.menu.edit")}
        </MenuItem>
        <MenuItem onClick={(e) => { e.stopPropagation(); handleAction(() => onToggleActive(flow.id, flow.active)); }}>
          {flow.active
            ? <Pause fontSize="small" style={{ marginRight: 12, color: theme.palette.text.secondary }} />
            : <PlayArrow fontSize="small" style={{ marginRight: 12, color: theme.palette.text.secondary }} />}
          {flow.active ? (i18n.t("flowPage.tooltipDeactivate") || "Pausar") : (i18n.t("flowPage.tooltipActivate") || "Ativar")}
        </MenuItem>
        <MenuItem onClick={(e) => { e.stopPropagation(); handleAction(() => onReport(flow)); }}>
          <BarChartIcon fontSize="small" style={{ marginRight: 12, color: theme.palette.text.secondary }} />
          {i18n.t("flowPage.menu.report")}
        </MenuItem>
        <MenuItem onClick={(e) => { e.stopPropagation(); handleAction(onDuplicate); }}>
          <ContentCopy fontSize="small" style={{ marginRight: 12, color: theme.palette.text.secondary }} />
          {i18n.t("flowPage.menu.duplicate")}
        </MenuItem>
        <MenuItem onClick={(e) => { e.stopPropagation(); handleAction(() => onExport(flow.id, flow.name)); }}>
          <GetAppIcon fontSize="small" style={{ marginRight: 12, color: theme.palette.text.secondary }} />
          {i18n.t("flowPage.menu.export")}
        </MenuItem>
        <Divider />
        <MenuItem onClick={(e) => { e.stopPropagation(); handleAction(onDelete); }}>
          <Delete fontSize="small" style={{ marginRight: 12, color: theme.palette.error.main }} />
          <span style={{ color: theme.palette.error.main }}>{i18n.t("flowPage.menu.delete")}</span>
        </MenuItem>
      </Menu>
    </div>
  );
}

const FlowBuilder = () => {
  const classes = useStyles();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const history = useHistory();

  const [loading, setLoading] = useState(false);
  const [pageNumber, setPageNumber] = useState(1);
  const [searchParam, setSearchParam] = useState("");
  const [contacts, dispatch] = useReducer(reducer, []);
  const [webhooks, setWebhooks] = useState([]);
  const [selectedContactId, setSelectedContactId] = useState(null);
  const [selectedWebhookName, setSelectedWebhookName] = useState(null);
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [newTicketModalOpen, setNewTicketModalOpen] = useState(false);
  const [contactTicket, setContactTicket] = useState({});
  const [deletingContact, setDeletingContact] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmDuplicateOpen, setConfirmDuplicateOpen] = useState(false);
  const [importInputRef, setImportInputRef] = useState(null);
  const [reportFlow, setReportFlow] = useState(null);

  const [hasMore, setHasMore] = useState(false);
  const [reloadData, setReloadData] = useState(false);
  const { user, socket } = useContext(AuthContext);

  useEffect(() => {
    dispatch({ type: "RESET" });
    setPageNumber(1);
  }, [searchParam]);

  useEffect(() => {
    setLoading(true);
    const delayDebounceFn = setTimeout(() => {
      const fetchContacts = async () => {
        try {
          const { data } = await api.get("/flowbuilder");
          setWebhooks(data.flows);
          dispatch({ type: "LOAD_CONTACTS", payload: data.flows });
          setHasMore(data.hasMore);
          setLoading(false);
        } catch (err) {
          toastError(err);
          setLoading(false);
        }
      };
      fetchContacts();
    }, 500);
    return () => clearTimeout(delayDebounceFn);
  }, [searchParam, pageNumber, reloadData]);

  useEffect(() => {
    const companyId = user.companyId;

    const onContact = (data) => {
      if (data.action === "update" || data.action === "create") {
        dispatch({ type: "UPDATE_CONTACTS", payload: data.contact });
      }

      if (data.action === "delete") {
        dispatch({ type: "DELETE_CONTACT", payload: +data.contactId });
      }
    };

    socket.on(`company-${companyId}-contact`, onContact);

    return () => {
      socket.off(`company-${companyId}-contact`, onContact);
    };
  }, []);

  const handleSearch = (event) => {
    setSearchParam(event.target.value.toLowerCase());
  };

  const handleOpenContactModal = () => {
    setSelectedContactId(null);
    setContactModalOpen(true);
  };

  const handleCloseContactModal = () => {
    setSelectedContactId(null);
    setContactModalOpen(false);
  };

  const handleCloseOrOpenTicket = (ticket) => {
    setNewTicketModalOpen(false);
    if (ticket !== undefined && ticket.uuid !== undefined) {
      history.push(`/tickets/${ticket.uuid}`);
    }
  };

  const handleEditContact = (contact) => {
    setSelectedContactId(contact.id);
    setSelectedWebhookName(contact.name);
    setContactModalOpen(true);
  };

  const handleToggleFlowActive = async (flowId, currentActive) => {
    try {
      const newActive = !currentActive;
      const { data } = await api.put(`/flowbuilder/${flowId}/toggle-active`, {
        active: newActive
      });
      
      // Atualizar o fluxo no estado
      dispatch({
        type: "UPDATE_CONTACTS",
        payload: { ...data.data, id: flowId }
      });
      
      // Atualizar também no estado webhooks
      setWebhooks((prev) =>
        prev.map((flow) =>
          flow.id === flowId ? { ...flow, active: newActive } : flow
        )
      );
      
      toast.success(newActive
        ? i18n.t("flowBuilderPage.flowActivated", { defaultValue: "Flujo activado con éxito" })
        : i18n.t("flowBuilderPage.flowDeactivated", { defaultValue: "Flujo desactivado con éxito" }));
    } catch (err) {
      toastError(err);
    }
  };

  const handleDeleteWebhook = async (webhookId) => {
    try {
      await api.delete(`/flowbuilder/${webhookId}`);
      setDeletingContact(null);
      setConfirmOpen(false);
      setReloadData((old) => !old);
      toast.success(i18n.t("flowBuilderPage.flowDeleted"));
    } catch (err) {
      toastError(err);
    }
  };

  const handleDuplicateFlow = async (flowId) => {
    try {
      await api.post(`/flowbuilder/duplicate`, { flowId: flowId });
      setDeletingContact(null);
      setConfirmDuplicateOpen(false);
      setReloadData((old) => !old);
      toast.success(i18n.t("flowBuilderPage.flowDuplicated"));
    } catch (err) {
      toastError(err);
    }
  };

  const handleExportFlow = async (flowId, name) => {
    try {
      const response = await api.get(`/flowbuilder/${flowId}/export`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([response.data], { type: 'application/zip' }));
      const link = document.createElement('a');
      link.href = url;
      link.setAttribute('download', `${name.replace(/[^a-z0-9-_]/gi, '_')}.zip`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      toastError(err);
    }
  };

  const handleImportClick = () => {
    if (importInputRef) {
      importInputRef.click();
    }
  };

  const handleImportChange = async (e) => {
    const file = e.target.files && e.target.files[0];
    if (!file) return;
    
    if (!file.name.toLowerCase().endsWith('.zip')) {
      toast.error('Por favor, selecione um arquivo ZIP (.zip)');
      e.target.value = null;
      return;
    }
    
    try {
      const formData = new FormData();
      formData.append('file', file);
      
      await api.post('/flowbuilder/import', formData, {
        headers: {
          'Content-Type': 'multipart/form-data'
        }
      });
      toast.success('Fluxo importado com sucesso');
      setReloadData((old) => !old);
    } catch (err) {
      toastError(err);
    } finally {
      e.target.value = null;
    }
  };

  const loadMore = () => {
    setPageNumber((prevState) => prevState + 1);
  };

  const handleScroll = (e) => {
    if (!hasMore || loading) return;
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - (scrollTop + 100) < clientHeight) {
      loadMore();
    }
  };

  const [statusFilter, setStatusFilter] = useState("all");

  const filteredWebhooks = webhooks.filter((webhook) => {
    const matchesSearch = webhook.name.toLowerCase().includes(searchParam.toLowerCase());
    const matchesStatus =
      statusFilter === "all" ||
      (statusFilter === "active" && webhook.active) ||
      (statusFilter === "inactive" && !webhook.active);
    return matchesSearch && matchesStatus;
  });

  const stats = {
    total: webhooks.length,
    active: webhooks.filter((w) => w.active).length,
    paused: webhooks.filter((w) => !w.active).length,
    drafts: webhooks.filter((w) => w.isDraft).length,
  };

  if (user.showFlow !== "enabled") {
    return <ForbiddenPage />;
  }

  return (
    <MainContainer className={classes.mainContainer}>
      {/* Modais - mantendo todos originais */}
      <NewTicketModal
        modalOpen={newTicketModalOpen}
        initialContact={contactTicket}
        onClose={(ticket) => {
          handleCloseOrOpenTicket(ticket);
        }}
      />
      
      <FlowBuilderModal
        open={contactModalOpen}
        onClose={handleCloseContactModal}
        aria-labelledby="form-dialog-title"
        flowId={selectedContactId}
        nameWebhook={selectedWebhookName}
        onSave={() => setReloadData((old) => !old)}
      />

      <FlowBuilderGenerateAIModal
        open={aiModalOpen}
        onClose={() => setAiModalOpen(false)}
        onGenerated={() => setReloadData((old) => !old)}
      />

      <FlowReportModal
        open={!!reportFlow}
        onClose={() => setReportFlow(null)}
        flow={reportFlow}
      />
      
      <ConfirmationModal
        title={
          deletingContact
            ? i18n.t("flowBuilder.confirmDelete.title", { name: deletingContact.name, defaultValue: `Excluir fluxo "${deletingContact.name}"?` })
            : `${i18n.t("contacts.confirmationModal.importTitlte")}`
        }
        open={confirmOpen}
        onClose={setConfirmOpen}
        onConfirm={() => {
          if (deletingContact) {
            handleDeleteWebhook(deletingContact.id);
          }
        }}
      >
        {deletingContact
          ? i18n.t("flowBuilder.confirmDelete.message", { defaultValue: "Esta ação não pode ser desfeita. Todas as integrações relacionadas serão perdidas." })
          : `${i18n.t("contacts.confirmationModal.importMessage")}`}
      </ConfirmationModal>
      
      <ConfirmationModal
        title={
          deletingContact
            ? i18n.t("flowBuilder.confirmDuplicate.title", { name: deletingContact.name, defaultValue: `Duplicar fluxo "${deletingContact.name}"?` })
            : `${i18n.t("contacts.confirmationModal.importTitlte")}`
        }
        open={confirmDuplicateOpen}
        onClose={setConfirmDuplicateOpen}
        onConfirm={() => {
          if (deletingContact) {
            handleDuplicateFlow(deletingContact.id);
          }
        }}
      >
        {deletingContact
          ? i18n.t("flowBuilder.confirmDuplicate.message", { defaultValue: "Uma cópia do fluxo será criada para você editar." })
          : `${i18n.t("contacts.confirmationModal.importMessage")}`}
      </ConfirmationModal>

      {/* Page Header */}
      <div className={classes.pageHeader}>
        <div>
          <h1 className={classes.pageTitle}>{i18n.t("flowBuilder.pageTitle", { defaultValue: "Flows" })}</h1>
          <div className={classes.pageSubtitle}>{i18n.t("flowBuilder.pageSubtitle", { defaultValue: "Automatize conversas e processos com flows visuais" })}</div>
        </div>
        <div className={classes.headerActions}>
          <input
            type="file"
            accept=".zip,application/zip"
            ref={(ref) => setImportInputRef(ref)}
            style={{ display: "none" }}
            onChange={handleImportChange}
          />
          <Button
            variant="outlined"
            className={classes.importBtn}
            onClick={handleImportClick}
          >
            {i18n.t("flowBuilderPageExtra.importZip")}
          </Button>
          {/* variant="contained": sem variante o MUI usa "text", cujo fundo e
              transparente por definicao — e era por isso que o botao sumia no
              tema claro mesmo com backgroundColor na classe. O "Importar"
              funcionava justamente porque declara variant="outlined". */}
          <Button
            variant="contained"
            disableElevation
            className={classes.aiBtn}
            startIcon={<AutoAwesomeIcon />}
            onClick={() => setAiModalOpen(true)}
          >
            {i18n.t("flowBuilderAIGenerate.button")}
          </Button>
          <Button
            variant="contained"
            disableElevation
            className={classes.newFlowBtn}
            startIcon={<AddCircle />}
            onClick={handleOpenContactModal}
          >
            {i18n.t("flowBuilderPageExtra.newFlow") || "Novo Flow"}
          </Button>
        </div>
      </div>

      {/* Filters */}
      <div className={classes.filtersRow}>
        <TextField
          className={classes.searchField}
          placeholder={i18n.t("flowBuilderPage.searchFlows") || "Buscar flows..."}
          type="search"
          value={searchParam}
          onChange={handleSearch}
          variant="outlined"
          size="small"
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon style={{ color: theme.palette.text.secondary, fontSize: 20 }} />
              </InputAdornment>
            ),
          }}
        />
        <FormControl className={classes.statusSelect} size="small" variant="outlined">
          <Select
            native
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
          >
            <option value="all">Todos os status</option>
            <option value="active">Ativos</option>
            <option value="inactive">Pausados</option>
          </Select>
        </FormControl>
      </div>

      {/* Stats */}
      <div className={classes.statsGrid}>
        <div className={classes.statCard}>
          <div className={classes.statLabel}>{i18n.t("flowBuilderPage.statTotal", { defaultValue: "Total de Flujos" })}</div>
          <div className={classes.statValue} style={{ color: theme.palette.text.primary }}>{stats.total}</div>
        </div>
        <div className={classes.statCard}>
          <div className={classes.statLabel}>{i18n.t("flowBuilderPage.statActive", { defaultValue: "Flujos Activos" })}</div>
          <div className={classes.statValue} style={{ color: "#16A34A" }}>{stats.active}</div>
        </div>
        <div className={classes.statCard}>
          <div className={classes.statLabel}>{i18n.t("flowBuilderPage.statPaused", { defaultValue: "Pausados" })}</div>
          <div className={classes.statValue} style={{ color: "#EA580C" }}>{stats.paused}</div>
        </div>
        <div className={classes.statCard}>
          <div className={classes.statLabel}>{i18n.t("flowBuilderPage.statDrafts", { defaultValue: "Borradores" })}</div>
          <div className={classes.statValue}>{stats.drafts}</div>
        </div>
      </div>

      {/* Flow list */}
      <div onScroll={handleScroll}>
        {loading && !webhooks.length ? (
          <div className={classes.loadingContainer}>
            <CircularProgress style={{ color: "#3B82F6" }} />
          </div>
        ) : filteredWebhooks.length === 0 ? (
          <div className={classes.emptyState}>
            <DevicesFold className={classes.emptyIcon} />
            <Typography className={classes.emptyTitle}>
              {searchParam ? i18n.t("flowBuilderPageExtra.noFlowFound") : i18n.t("flowBuilderPageExtra.noFlowCreated")}
            </Typography>
            <Typography className={classes.emptyDescription}>
              {searchParam
                ? i18n.t("flowBuilderPageExtra.tryOtherSearch")
                : i18n.t("flowBuilderPageExtra.createFirstFlowDesc")}
            </Typography>
            {!searchParam && (
              <Button
                className={classes.addButton}
                onClick={handleOpenContactModal}
                startIcon={<AddCircle />}
                style={{ marginTop: 24 }}
              >
                {i18n.t("flowBuilderPageExtra.createFirstFlow")}
              </Button>
            )}
          </div>
        ) : (
          <Grid container spacing={2}>
            {filteredWebhooks.map((flow) => (
              <Grid item xs={12} sm={6} md={4} key={flow.id}>
                <FlowCard
                  flow={flow}
                  classes={classes}
                  onEdit={() => handleEditContact(flow)}
                  onDuplicate={() => { setDeletingContact(flow); setConfirmDuplicateOpen(true); }}
                  onDelete={() => { setDeletingContact(flow); setConfirmOpen(true); }}
                  onNavigate={(id) => history.push(`/flowbuilder/${id}`)}
                  onToggleActive={(id, active) => handleToggleFlowActive(id, active)}
                  onExport={handleExportFlow}
                  onReport={(f) => setReportFlow(f)}
                />
              </Grid>
            ))}
          </Grid>
        )}
        {loading && webhooks.length > 0 && (
          <Box display="flex" justifyContent="center" p={3}>
            <CircularProgress size={24} style={{ color: "#3B82F6" }} />
          </Box>
        )}
      </div>

      {isMobile && (
        <HideOnScroll>
          <Fab
            className={classes.fab}
            onClick={handleOpenContactModal}
            aria-label={i18n.t("flowBuilderPage.createFlow")}
          >
            <AddCircle />
          </Fab>
        </HideOnScroll>
      )}
    </MainContainer>
  );
};

export default FlowBuilder;