import React, { useEffect, useState, useContext, useMemo, useCallback, useRef } from "react";
import { Paper, Typography, Box, Card, Chip, TextField, Select, MenuItem, FormControl, InputLabel, CircularProgress, IconButton, Tooltip, Avatar, Dialog, DialogTitle, DialogContent, LinearProgress } from "@material-ui/core";
import { makeStyles } from "@material-ui/core/styles";
import Search from "@material-ui/icons/Search";
import Refresh from "@material-ui/icons/Refresh";
import PauseCircleFilled from "@material-ui/icons/PauseCircleFilled";
import PlayCircleFilled from "@material-ui/icons/PlayCircleFilled";
import ErrorIcon from "@material-ui/icons/Error";
import CheckCircle from "@material-ui/icons/CheckCircle";
import Schedule from "@material-ui/icons/Schedule";
import TrendingUp from "@material-ui/icons/TrendingUp";
import People from "@material-ui/icons/People";
import Warning from "@material-ui/icons/Warning";
import WhatsApp from "@material-ui/icons/WhatsApp";
import Telegram from "@material-ui/icons/Telegram";
import Facebook from "@material-ui/icons/Facebook";
import Instagram from "@material-ui/icons/Instagram";
import Close from "@material-ui/icons/Close";
import History from "@material-ui/icons/History";
import ThumbUp from "@material-ui/icons/ThumbUp";
import DoneAll from "@material-ui/icons/DoneAll";
import format from "date-fns/format";
import parseISO from "date-fns/parseISO";
import { ptBR } from "date-fns/locale";
import api from "../../services/api";
import { useHistory } from "react-router-dom";
import { AuthContext } from "../../context/Auth/AuthContext";
import { i18n } from "../../translate/i18n";

const useStyles = makeStyles(theme => ({
  root: {
    padding: 20,
    height: "100%",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 16,
    flexWrap: "wrap",
    gap: 12,
  },
  titleArea: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  titleIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    background: "linear-gradient(135deg, #7c3aed, #a78bfa)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#fff",
    boxShadow: "0 4px 14px rgba(124,58,237,0.3)",
  },
  metricsRow: {
    display: "flex",
    gap: 12,
    marginBottom: 16,
    overflowX: "auto",
    paddingBottom: 4,
  },
  metricCard: {
    minWidth: 160,
    borderRadius: 14,
    padding: "14px 18px",
    display: "flex",
    alignItems: "center",
    gap: 12,
    boxShadow: "0 2px 8px rgba(0,0,0,0.06)",
    border: "1px solid rgba(0,0,0,0.06)",
    transition: "all 0.2s",
    "&:hover": {
      transform: "translateY(-1px)",
      boxShadow: "0 4px 16px rgba(0,0,0,0.1)",
    },
  },
  metricIcon: {
    width: 38,
    height: 38,
    borderRadius: 10,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: 20,
  },
  metricValue: {
    fontSize: 22,
    fontWeight: 700,
    lineHeight: 1,
  },
  metricLabel: {
    fontSize: 11,
    color: theme.palette.text.secondary,
    fontWeight: 500,
    textTransform: "uppercase",
    letterSpacing: 0.5,
  },
  filtersBar: {
    display: "flex",
    gap: 10,
    alignItems: "center",
    marginBottom: 14,
    flexWrap: "wrap",
  },
  funnelBar: {
    display: "flex",
    borderRadius: 10,
    overflow: "hidden",
    height: 32,
    marginBottom: 16,
    background: "#f1f5f9",
    position: "relative",
  },
  funnelSegment: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#fff",
    fontWeight: 600,
    fontSize: 11,
    transition: "width 0.5s ease",
    position: "relative",
    cursor: "pointer",
    "&:hover": {
      filter: "brightness(1.1)",
    },
  },
  boardArea: {
    display: "flex",
    overflowX: "auto",
    flex: 1,
    paddingBottom: 8,
    gap: 14,
  },
  column: {
    minWidth: 310,
    maxWidth: 310,
    borderRadius: 14,
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
    overflow: "hidden",
    background: "#f8fafc",
    border: "1px solid #e2e8f0",
  },
  columnHeader: {
    padding: "14px 16px 10px",
    position: "relative",
    overflow: "hidden",
  },
  columnPattern: {
    position: "absolute",
    top: 0, right: 0, bottom: 0, left: 0,
    background: "radial-gradient(circle at 90% 20%, rgba(255,255,255,0.15) 0%, transparent 60%)",
    pointerEvents: "none",
  },
  columnTitle: {
    color: "#fff",
    fontWeight: 700,
    fontSize: 14,
    position: "relative",
    zIndex: 1,
  },
  columnMeta: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    position: "relative",
    zIndex: 1,
    marginTop: 6,
  },
  columnCount: {
    background: "rgba(255,255,255,0.25)",
    color: "#fff",
    fontWeight: 700,
    fontSize: 11,
    padding: "2px 8px",
    borderRadius: 10,
  },
  messagePreview: {
    padding: "8px 12px",
    borderBottom: "1px solid #e2e8f0",
    background: "#fff",
  },
  messageText: {
    fontSize: 11,
    color: theme.palette.text.secondary,
    fontStyle: "italic",
    lineHeight: 1.4,
    display: "-webkit-box",
    WebkitLineClamp: 2,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  },
  cardList: {
    flex: 1,
    overflowY: "auto",
    padding: "8px 10px",
    "&::-webkit-scrollbar": { width: 4 },
    "&::-webkit-scrollbar-thumb": { borderRadius: 4, background: "#cbd5e1" },
  },
  contactCard: {
    borderRadius: 12,
    marginBottom: 8,
    cursor: "pointer",
    transition: "all 0.15s ease",
    boxShadow: "0 1px 3px rgba(0,0,0,0.06)",
    overflow: "hidden",
    border: "1px solid transparent",
    "&:hover": {
      boxShadow: "0 4px 12px rgba(0,0,0,0.1)",
      transform: "translateY(-1px)",
      borderColor: "#7c3aed",
    },
  },
  cardStatusBar: {
    height: 3,
    width: "100%",
  },
  cardBody: {
    padding: "10px 12px",
  },
  cardHeader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 6,
  },
  cardAvatar: {
    width: 36,
    height: 36,
    fontSize: 14,
    fontWeight: 600,
  },
  cardName: {
    fontSize: 13,
    fontWeight: 600,
    lineHeight: 1.2,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    flex: 1,
  },
  cardNumber: {
    fontSize: 11,
    color: theme.palette.text.secondary,
  },
  cardProgress: {
    margin: "6px 0",
  },
  progressLabel: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 3,
  },
  progressText: {
    fontSize: 10,
    color: theme.palette.text.secondary,
    fontWeight: 500,
  },
  cardFooter: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginTop: 6,
  },
  nextRunChip: {
    fontSize: 9,
    height: 20,
    fontWeight: 500,
  },
  cardActions: {
    display: "flex",
    gap: 2,
  },
  actionBtn: {
    padding: 3,
    "& svg": { fontSize: 16 },
  },
  channelIcon: {
    fontSize: 14,
    marginRight: 4,
  },
  emptyColumn: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    color: "#94a3b8",
  },
  statusChip: {
    height: 18,
    fontSize: 9,
    fontWeight: 600,
  },
  historyDialog: {
    borderRadius: 16,
    maxWidth: 500,
  },
  timelineContainer: {
    position: "relative",
    paddingLeft: 28,
    "&::before": {
      content: '""',
      position: "absolute",
      left: 11,
      top: 0,
      bottom: 0,
      width: 2,
      background: "linear-gradient(180deg, #7c3aed 0%, #e2e8f0 100%)",
    },
  },
  timelineItem: {
    position: "relative",
    paddingBottom: 20,
    "&:last-child": { paddingBottom: 0 },
  },
  timelineDot: {
    position: "absolute",
    left: -22,
    top: 2,
    width: 14,
    height: 14,
    borderRadius: "50%",
    border: "2px solid #fff",
    boxShadow: "0 0 0 2px currentColor",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 1,
  },
  timelineCard: {
    borderRadius: 10,
    padding: "10px 14px",
    border: "1px solid #e2e8f0",
    background: "#fff",
    transition: "all 0.15s",
    "&:hover": {
      boxShadow: "0 2px 8px rgba(0,0,0,0.08)",
      borderColor: "#7c3aed",
    },
  },
  timelineStepLabel: {
    fontSize: 12,
    fontWeight: 700,
    lineHeight: 1.3,
  },
  timelineMessage: {
    fontSize: 11,
    color: theme.palette.text.secondary,
    lineHeight: 1.4,
    marginTop: 4,
    background: "#f8fafc",
    padding: "6px 10px",
    borderRadius: 8,
    borderLeft: "3px solid #7c3aed",
    fontStyle: "italic",
  },
  timelineMeta: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    marginTop: 6,
    flexWrap: "wrap",
  },
  timelineDate: {
    fontSize: 10,
    color: "#94a3b8",
  },
  historyContent: {
    flex: 1,
  },
  filterChip: {
    cursor: "pointer",
    transition: "all 0.15s",
    "&:hover": {
      transform: "scale(1.05)",
    },
  },
}));

const STEP_COLORS = [
  "#7c3aed", "#3b82f6", "#06b6d4", "#10b981", "#f59e0b",
  "#ef4444", "#ec4899", "#8b5cf6", "#14b8a6", "#f97316"
];

const getChannelIcon = (channel) => {
  switch (channel?.toLowerCase()) {
    case "telegram": return <Telegram style={{ fontSize: 14, color: "#0088cc" }} />;
    case "facebook": return <Facebook style={{ fontSize: 14, color: "#1877f2" }} />;
    case "instagram": return <Instagram style={{ fontSize: 14, color: "#e4405f" }} />;
    default: return <WhatsApp style={{ fontSize: 14, color: "#25d366" }} />;
  }
};

const FloupDashboard = () => {
  const classes = useStyles();
  const history = useHistory();
  const { user, socket } = useContext(AuthContext);
  const [floups, setFloups] = useState([]);
  const [selectedFloupId, setSelectedFloupId] = useState(null);
  const [floupData, setFloupData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadingFloups, setLoadingFloups] = useState(true);
  const [filters, setFilters] = useState({ channel: "", search: "", status: "" });
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyContact, setHistoryContact] = useState(null);
  const [historyData, setHistoryData] = useState(null);
  const [loadingHistory, setLoadingHistory] = useState(false);
  const [isRefreshConsolidated, setIsRefreshConsolidated] = useState(false);
  const dashboardRefreshTimeoutRef = useRef(null);
  const lastDashboardRefreshRef = useRef(0);
  const dashboardRefreshInFlightRef = useRef(false);
  const pendingDashboardRefreshRef = useRef(false);
  const selectedFloupIdRef = useRef(null);
  const filtersRef = useRef({ channel: "", search: "", status: "" });
  const historyOpenRef = useRef(false);
  const historyContactRef = useRef(null);

  // "wacalls" é o identificador interno do WhatsApp Plus. Faltava aqui, então
  // não dava pra filtrar por essa conexão mesmo tendo agendamentos nela.
  const channels = ["whatsapp", "wacalls", "whatsapp_oficial", "facebook", "instagram", "telegram"];

  // O nome do canal era montado a partir do próprio identificador, o que
  // mostraria "Wacalls" — nome interno que não existe pro usuário.
  const rotulosDeCanal = {
    whatsapp: "WhatsApp",
    wacalls: "WhatsApp Plus",
    whatsapp_oficial: "WhatsApp Oficial",
    facebook: "Facebook",
    instagram: "Instagram",
    telegram: "Telegram"
  };

  const rotuloDoCanal = ch =>
    rotulosDeCanal[ch] || ch.charAt(0).toUpperCase() + ch.slice(1).replace("_", " ");

  const loadFloups = async () => {
    try {
      setLoadingFloups(true);
      const { data } = await api.get("/plugins/floup");
      setFloups(data || []);
      if (data && data.length > 0) {
        setSelectedFloupId((prev) => prev || data[0].id);
      }
    } catch (error) {
      console.error("Erro ao carregar Floups:", error);
    } finally {
      setLoadingFloups(false);
    }
  };

  useEffect(() => {
    selectedFloupIdRef.current = selectedFloupId;
  }, [selectedFloupId]);

  useEffect(() => {
    filtersRef.current = filters;
  }, [filters]);

  useEffect(() => {
    historyOpenRef.current = historyOpen;
  }, [historyOpen]);

  useEffect(() => {
    historyContactRef.current = historyContact;
  }, [historyContact]);

  const fetchContactHistory = useCallback(async (contact, floupIdOverride) => {
    const contactId = contact?.contactId;
    const targetFloupId = floupIdOverride || selectedFloupIdRef.current;

    if (!contactId || !targetFloupId) return;

    try {
      const { data } = await api.get(`/plugins/floup/${targetFloupId}/contact/${contactId}/history`);
      setHistoryData(data);
    } catch (error) {
      console.error("Erro ao carregar histórico:", error);
    }
  }, []);

  const applyOptimisticStepChange = useCallback((eventData) => {
    if (!eventData?.contactId) return;

    setFloupData((previousData) => {
      if (!previousData?.steps?.length) return previousData;

      let movedContact = null;
      const nextSteps = previousData.steps.map((step) => {
        const contacts = Array.isArray(step.contacts) ? step.contacts : [];
        const nextContacts = contacts.filter((contact) => {
          const isTargetContact = Number(contact.contactId) === Number(eventData.contactId);

          if (
            isTargetContact &&
            (eventData.scheduleId == null || Number(contact.scheduleId) === Number(eventData.scheduleId))
          ) {
            movedContact = {
              ...contact,
              currentStepIndex: eventData.currentStepIndex,
              nextRunAt: eventData.nextRunAt || contact.nextRunAt,
              status: "PENDING",
              hasRecentError: false,
            };
            return false;
          }

          return true;
        });

        return {
          ...step,
          contacts: nextContacts,
          contactsCount: nextContacts.length,
        };
      });

      if (!movedContact) return previousData;

      const targetIndex = Math.max(Number(eventData.currentStepIndex) || 0, 0);
      if (!nextSteps[targetIndex]) return previousData;

      nextSteps[targetIndex] = {
        ...nextSteps[targetIndex],
        contacts: [movedContact, ...(nextSteps[targetIndex].contacts || [])],
        contactsCount: (nextSteps[targetIndex].contacts?.length || 0) + 1,
      };

      return {
        ...previousData,
        steps: nextSteps,
      };
    });
  }, []);

  const loadFloupDashboard = useCallback(async () => {
    const currentSelectedFloupId = selectedFloupIdRef.current;
    const currentFilters = filtersRef.current;

    if (!currentSelectedFloupId) {
      pendingDashboardRefreshRef.current = false;
      setIsRefreshConsolidated(false);
      setFloupData(null);
      setLoading(false);
      return;
    }

    if (dashboardRefreshInFlightRef.current) {
      pendingDashboardRefreshRef.current = true;
      setIsRefreshConsolidated(true);
      return;
    }

    dashboardRefreshInFlightRef.current = true;
    pendingDashboardRefreshRef.current = false;

    try {
      setLoading(true);
      const params = new URLSearchParams();
      if (currentFilters.channel) params.append("channel", currentFilters.channel);
      if (currentFilters.search) params.append("search", currentFilters.search);
      const { data } = await api.get(`/plugins/floup/dashboard/${currentSelectedFloupId}?${params.toString()}`);
      setFloupData(data);
    } catch (error) {
      console.error("Erro ao carregar dashboard do Floup:", error);
      setFloupData(null);
    } finally {
      dashboardRefreshInFlightRef.current = false;
      setLoading(false);

      if (pendingDashboardRefreshRef.current) {
        setIsRefreshConsolidated(true);
        pendingDashboardRefreshRef.current = false;
        Promise.resolve().then(() => loadFloupDashboard());
      } else {
        setIsRefreshConsolidated(false);
      }
    }
  }, []);

  useEffect(() => { loadFloups(); }, []);

  useEffect(() => {
    loadFloupDashboard();
  }, [selectedFloupId, filters, loadFloupDashboard]);

  useEffect(() => {
    const interval = setInterval(loadFloupDashboard, 30000);
    return () => clearInterval(interval);
  }, [loadFloupDashboard]);

  useEffect(() => {
    if (!socket || !user?.companyId) return;
    const stoppedEvent = `company-${user.companyId}-floup-stopped`;
    const stepExecutedEvent = `company-${user.companyId}-floup-step-executed`;
    const stepChangedEvent = `company-${user.companyId}-floup-step-changed`;
    const scheduleEvent = `company-${user.companyId}-floup-schedule`;
    const assignedEvent = `company-${user.companyId}-floup-assigned`;
    const stepEventEvent = `company-${user.companyId}-floup-step-event`;
    const throttleMs = 500;

    const shouldRefresh = (data) => {
      const currentSelectedFloupId = selectedFloupIdRef.current;
      return !currentSelectedFloupId || Number(data?.floupId) === Number(currentSelectedFloupId);
    };
    const scheduleDashboardRefresh = (immediate = false) => {
      const now = Date.now();
      const elapsed = now - lastDashboardRefreshRef.current;

      if (dashboardRefreshTimeoutRef.current) {
        clearTimeout(dashboardRefreshTimeoutRef.current);
        dashboardRefreshTimeoutRef.current = null;
      }

      if (immediate || elapsed >= throttleMs) {
        setIsRefreshConsolidated(false);
        lastDashboardRefreshRef.current = now;
        loadFloupDashboard();
        return;
      }

      setIsRefreshConsolidated(true);
      dashboardRefreshTimeoutRef.current = setTimeout(() => {
        lastDashboardRefreshRef.current = Date.now();
        loadFloupDashboard();
        dashboardRefreshTimeoutRef.current = null;
      }, throttleMs - elapsed);
    };

    const refreshDashboard = (data) => {
      if (shouldRefresh(data)) {
        scheduleDashboardRefresh(false);
      }
    };

    const refreshDashboardImmediately = (data) => {
      if (!shouldRefresh(data)) return;
      scheduleDashboardRefresh(true);

      // Se o modal de histórico estiver aberto para esse contato,
      // recarrega a timeline imediatamente para refletir a execução.
      if (
        historyOpenRef.current &&
        data?.contactId &&
        Number(historyContactRef.current?.contactId) === Number(data?.contactId)
      ) {
        fetchContactHistory(historyContactRef.current, data?.floupId);
      }
    };

    const handleStepChanged = (data) => {
      if (!shouldRefresh(data)) return;

      applyOptimisticStepChange(data);
      scheduleDashboardRefresh(true);

      if (
        historyOpenRef.current &&
        Number(historyContactRef.current?.contactId) === Number(data?.contactId)
      ) {
        fetchContactHistory(historyContactRef.current, data?.floupId);
      }
    };

    const handleSocketReconnect = () => {
      scheduleDashboardRefresh(true);
    };

    // New: handler for FloupStepEvent persistence (instant card + timeline update)
    const handleStepEvent = (payload) => {
      const data = payload?.event || payload;
      if (!shouldRefresh(data)) return;

      // Refresh dashboard cards immediately so executedSteps/progressPercent
      // reflect the new event without waiting for the throttled refresh.
      scheduleDashboardRefresh(true);

      // If history modal is open for this contact, reload timeline now.
      if (
        historyOpenRef.current &&
        data?.contactId &&
        Number(historyContactRef.current?.contactId) === Number(data?.contactId)
      ) {
        fetchContactHistory(historyContactRef.current, data?.floupId);
      }
    };

    socket.on(stoppedEvent, refreshDashboard);
    socket.on(stepExecutedEvent, refreshDashboardImmediately);
    socket.on(stepChangedEvent, handleStepChanged);
    socket.on(scheduleEvent, refreshDashboard);
    socket.on(assignedEvent, refreshDashboardImmediately);
    socket.on(stepEventEvent, handleStepEvent);
    socket.on("connect", handleSocketReconnect);

    return () => {
      if (dashboardRefreshTimeoutRef.current) {
        clearTimeout(dashboardRefreshTimeoutRef.current);
        dashboardRefreshTimeoutRef.current = null;
      }
      setIsRefreshConsolidated(false);
      socket.off(stoppedEvent, refreshDashboard);
      socket.off(stepExecutedEvent, refreshDashboardImmediately);
      socket.off(stepChangedEvent, handleStepChanged);
      socket.off(scheduleEvent, refreshDashboard);
      socket.off(assignedEvent, refreshDashboardImmediately);
      socket.off(stepEventEvent, handleStepEvent);
      socket.off("connect", handleSocketReconnect);
    };
  }, [socket, user?.companyId, loadFloupDashboard, applyOptimisticStepChange, fetchContactHistory]);

  // Computed metrics
  const metrics = useMemo(() => {
    if (!floupData?.steps) return { total: 0, active: 0, errors: 0, paused: 0 };

    const activeMetrics = floupData.activeMetrics || {};
    let errors = 0;

    floupData.steps.forEach(step => {
      const contacts = step.contacts || [];
      errors += contacts.filter(c => c.status === "ERROR" || c.hasRecentError).length;
    });

    return {
      total: activeMetrics.total || 0,
      active: activeMetrics.runningCount || 0,
      errors: activeMetrics.errorCount ?? errors,
      paused: activeMetrics.pausedCount || 0,
    };
  }, [floupData]);

  // Funnel data
  const funnelData = useMemo(() => {
    if (!floupData?.steps) return [];
    const total = metrics.total || 1;
    return floupData.steps.map((step, idx) => ({
      label: `${i18n.t("hardcoded.step")} ${step.stepOrder}`,
      count: step.contacts?.length || 0,
      pct: ((step.contacts?.length || 0) / total * 100),
      color: STEP_COLORS[idx % STEP_COLORS.length],
    }));
  }, [floupData, metrics]);

  const handleContactClick = (contact) => {
    if (contact.ticketUuid) {
      const tabParam = contact.ticketStatus ? `?tab=${contact.ticketStatus}` : "";
      history.push(`/tickets/${contact.ticketUuid}${tabParam}`);
    } else if (contact.ticketId) {
      history.push(`/tickets?contactId=${contact.contactId}`);
    }
  };

  const handleShowHistory = async (e, contact) => {
    e.stopPropagation();
    setHistoryContact(contact);
    setHistoryOpen(true);
    setHistoryData(null);
    setLoadingHistory(true);
    try {
      await fetchContactHistory(contact, selectedFloupId);
    } catch (error) {
    } finally {
      setLoadingHistory(false);
    }
  };

  const getStatusInfo = (contact) => {
    if (contact.status === "ERROR" || contact.hasRecentError) return { color: "#ef4444", label: i18n.t("hardcoded.withErrors"), icon: <ErrorIcon style={{ fontSize: 12 }} /> };
    if (contact.status === "PAUSED") return { color: "#f59e0b", label: i18n.t("hardcoded.paused"), icon: <PauseCircleFilled style={{ fontSize: 12 }} /> };
    if (contact.status === "COMPLETED") return { color: "#10b981", label: i18n.t("campaignReport.finished"), icon: <CheckCircle style={{ fontSize: 12 }} /> };
    return { color: "#3b82f6", label: i18n.t("hardcoded.active"), icon: <PlayCircleFilled style={{ fontSize: 12 }} /> };
  };

  const handleTogglePause = async (e, contact) => {
    e.stopPropagation();
    try {
      await api.put(`/plugins/floup/schedules/${contact.scheduleId}/toggle-pause`);
      loadFloupDashboard();
    } catch (error) {
      console.error("Erro ao pausar/retomar:", error);
    }
  };

  const renderContactCard = (contact, totalSteps) => {
    const status = getStatusInfo(contact);
    // Prefer backend-calculated values (executedSteps/progressPercent) for consistency
    const backendExecuted = Number.isFinite(contact.executedSteps) ? contact.executedSteps : null;
    const backendProgress = Number.isFinite(contact.progressPercent) ? contact.progressPercent : null;
    const fallbackExecuted = totalSteps > 0
      ? Math.min(
          contact.status === "COMPLETED"
            ? totalSteps
            : Math.max(contact.currentStepIndex || 0, 0),
          totalSteps
        )
      : 0;
    const executedSteps = backendExecuted !== null ? backendExecuted : fallbackExecuted;
    const currentStepNumber = totalSteps > 0 ? executedSteps : 0;
    const progress = backendProgress !== null
      ? backendProgress
      : (totalSteps > 0 ? (executedSteps / totalSteps) * 100 : 0);
    const hasPendingNext =
      contact.status !== "COMPLETED" &&
      contact.status !== "PAUSED" &&
      executedSteps < totalSteps &&
      !!contact.nextRunAt;
    const avatarInitials = contact.contactName
      ? contact.contactName.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase()).join("")
      : "?";

    return (
      <Card key={contact.contactId} className={classes.contactCard} onClick={() => handleContactClick(contact)}>
        <div className={classes.cardStatusBar} style={{ background: status.color }} />
        <div className={classes.cardBody}>
          <div className={classes.cardHeader}>
            <Avatar
              src={contact.contactProfilePicUrl}
              className={classes.cardAvatar}
              style={{ backgroundColor: !contact.contactProfilePicUrl ? status.color : undefined }}
            >
              {!contact.contactProfilePicUrl && avatarInitials}
            </Avatar>
            <Box flex={1} minWidth={0}>
              <Typography className={classes.cardName}>{contact.contactName}</Typography>
              <Box display="flex" alignItems="center" gap={0.5}>
                {getChannelIcon(contact.channel)}
                <Typography className={classes.cardNumber}>{contact.contactNumber}</Typography>
              </Box>
            </Box>
            <Chip
              size="small"
              icon={status.icon}
              label={status.label}
              className={classes.statusChip}
              style={{ backgroundColor: `${status.color}15`, color: status.color, border: `1px solid ${status.color}30` }}
            />
          </div>

          {/* Progress */}
          <div className={classes.cardProgress}>
            <div className={classes.progressLabel}>
              <Typography className={classes.progressText}>
                 {i18n.t("hardcoded.step")} {currentStepNumber}/{totalSteps}
              </Typography>
              <Typography className={classes.progressText} style={{ fontWeight: 600 }}>
                {Math.round(progress)}%
              </Typography>
            </div>
            <LinearProgress
              variant="determinate"
              value={progress}
              style={{ height: 4, borderRadius: 4, backgroundColor: "#e2e8f0" }}
            />
          </div>

          {/* Footer */}
          <div className={classes.cardFooter}>
            {contact.nextRunAt ? (
              <Box display="flex" alignItems="center" gap={0.5} flexWrap="wrap">
                {hasPendingNext && (
                  <Chip
                    size="small"
                    icon={<Schedule style={{ fontSize: 11, color: "#f59e0b" }} />}
                    label={i18n.t("hardcoded.awaitingExecution")}
                    style={{
                      height: 20,
                      fontSize: 10,
                      fontWeight: 600,
                      backgroundColor: "#fef3c7",
                      color: "#b45309",
                      border: "1px solid #fcd34d",
                    }}
                  />
                )}
                <Chip
                  size="small"
                  icon={<Schedule style={{ fontSize: 11 }} />}
                  label={format(new Date(contact.nextRunAt), "dd/MM HH:mm", { locale: ptBR })}
                  className={classes.nextRunChip}
                  variant="outlined"
                />
              </Box>
            ) : <span />}
            <div className={classes.cardActions}>
              <Tooltip title={contact.status === "PAUSED" ? i18n.t("hardcoded.resume") : i18n.t("hardcoded.pause")}>
                <IconButton className={classes.actionBtn} onClick={(e) => handleTogglePause(e, contact)}>
                  {contact.status === "PAUSED" ? <PlayCircleFilled style={{ color: "#10b981" }} /> : <PauseCircleFilled style={{ color: "#f59e0b" }} />}
                </IconButton>
              </Tooltip>
              <Tooltip title={i18n.t("hardcoded.history")}>
                <IconButton className={classes.actionBtn} onClick={(e) => handleShowHistory(e, contact)}>
                  <History />
                </IconButton>
              </Tooltip>
            </div>
          </div>

          {contact.hasRecentError && (
            <Box mt={0.5} p={0.5} style={{ background: "#fef2f2", borderRadius: 6, display: "flex", alignItems: "center", gap: 4 }}>
              <Warning style={{ fontSize: 12, color: "#ef4444" }} />
              <Typography style={{ fontSize: 10, color: "#ef4444", fontWeight: 500 }}>{i18n.t("hardcoded.lastSendError")}</Typography>
            </Box>
          )}
        </div>
      </Card>
    );
  };

  const renderColumn = (step, idx) => {
    const contacts = step.contacts || [];
    const color = STEP_COLORS[idx % STEP_COLORS.length];
    const totalSteps = floupData?.steps?.length || 1;

    // Apply status filter
    const filteredContacts = filters.status
      ? contacts.filter(c => {
          if (filters.status === "error") return c.status === "ERROR" || c.hasRecentError;
          if (filters.status === "paused") return c.status === "PAUSED";
          if (filters.status === "active") return c.status !== "ERROR" && !c.hasRecentError && c.status !== "PAUSED";
          return true;
        })
      : contacts;

    return (
      <div key={step.stepIndex} className={classes.column}>
        <div className={classes.columnHeader} style={{ background: `linear-gradient(135deg, ${color}, ${color}cc)` }}>
          <div className={classes.columnPattern} />
          <Box display="flex" alignItems="center" justifyContent="space-between" position="relative" zIndex={1}>
            <Typography className={classes.columnTitle}>
              {i18n.t("hardcoded.step")} {step.stepOrder}
            </Typography>
            <span className={classes.columnCount}>{contacts.length}</span>
          </Box>
          <div className={classes.columnMeta}>
            {step.stepMessage && (
              <Typography style={{ fontSize: 10, color: "rgba(255,255,255,0.8)", maxWidth: "80%" }} noWrap>
                📝 {step.stepMessage.substring(0, 40)}...
              </Typography>
            )}
          </div>
        </div>

        {step.stepMessage && (
          <div className={classes.messagePreview}>
            <Typography className={classes.messageText}>
              "{step.stepMessage.substring(0, 120)}{step.stepMessage.length > 120 ? "..." : ""}"
            </Typography>
          </div>
        )}

        <div className={classes.cardList}>
          {filteredContacts.length === 0 ? (
            <div className={classes.emptyColumn}>
              <People style={{ fontSize: 32, marginBottom: 8, opacity: 0.4 }} />
              <Typography style={{ fontSize: 12 }}>{i18n.t("hardcoded.noContact")}</Typography>
            </div>
          ) : (
            filteredContacts.map(c => renderContactCard(c, totalSteps))
          )}
        </div>
      </div>
    );
  };

  return (
    <div className={classes.root}>
      {/* Header */}
      <div className={classes.header}>
        <div className={classes.titleArea}>
          <div className={classes.titleIcon}>
            <TrendingUp />
          </div>
          <Box>
            <Typography variant="h5" style={{ fontWeight: 700, lineHeight: 1.2 }}>
              Dashboard Follow Up
            </Typography>
            <Typography variant="body2" color="textSecondary" style={{ fontSize: 12 }}>
              {i18n.t("hardcoded.dashboardSubtitle")}
            </Typography>
          </Box>
        </div>
        <Box display="flex" alignItems="center" gap={1}>
          {isRefreshConsolidated && (
            <Chip
              size="small"
              label="Atualizando..."
              color="primary"
              variant="outlined"
            />
          )}
          <FormControl variant="outlined" size="small" style={{ minWidth: 180 }}>
            <InputLabel style={{ fontSize: 12 }}>Follow UP</InputLabel>
            <Select
              value={selectedFloupId || ""}
              onChange={(e) => { setSelectedFloupId(e.target.value); setFloupData(null); }}
              label="Follow UP"
              disabled={loadingFloups}
              style={{ fontSize: 13, borderRadius: 10 }}
            >
              {floups.map((floup) => (
                <MenuItem key={floup.id} value={floup.id} style={{ fontSize: 13 }}>
                  {floup.name} {floup.isActive ? "" : `(${i18n.t("hardcoded.inactive")})`}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
          <Tooltip title={i18n.t("hardcoded.refresh")}>
            <IconButton onClick={loadFloupDashboard} disabled={loading} size="small">
              <Refresh />
            </IconButton>
          </Tooltip>
        </Box>
      </div>

      {loading ? (
        <Box display="flex" justifyContent="center" alignItems="center" flex={1}>
          <CircularProgress style={{ color: "#7c3aed" }} />
        </Box>
      ) : !floupData ? (
        <Box display="flex" flexDirection="column" justifyContent="center" alignItems="center" flex={1} style={{ color: "#94a3b8" }}>
          <TrendingUp style={{ fontSize: 64, marginBottom: 16, opacity: 0.3 }} />
          <Typography variant="h6" style={{ fontWeight: 500 }}>
            {selectedFloupId ? i18n.t("hardcoded.noDataFound") : i18n.t("hardcoded.selectFollowUp")}
          </Typography>
        </Box>
      ) : (
        <>
          {/* Metrics */}
          <div className={classes.metricsRow}>
            <Paper className={classes.metricCard}>
              <div className={classes.metricIcon} style={{ background: "#ede9fe", color: "#7c3aed" }}>
                <People />
              </div>
              <Box>
                <Typography className={classes.metricValue}>{metrics.total}</Typography>
                <Typography className={classes.metricLabel}>{i18n.t("hardcoded.totalContacts")}</Typography>
              </Box>
            </Paper>
            <Paper className={classes.metricCard}>
              <div className={classes.metricIcon} style={{ background: "#dbeafe", color: "#3b82f6" }}>
                <PlayCircleFilled />
              </div>
              <Box>
                <Typography className={classes.metricValue}>{metrics.active}</Typography>
                <Typography className={classes.metricLabel}>{i18n.t("hardcoded.active")}</Typography>
              </Box>
            </Paper>
            <Paper className={classes.metricCard}>
              <div className={classes.metricIcon} style={{ background: "#fef3c7", color: "#f59e0b" }}>
                <PauseCircleFilled />
              </div>
              <Box>
                <Typography className={classes.metricValue}>{metrics.paused}</Typography>
                <Typography className={classes.metricLabel}>{i18n.t("hardcoded.paused")}</Typography>
              </Box>
            </Paper>
            <Paper className={classes.metricCard}>
              <div className={classes.metricIcon} style={{ background: "#fef3c7", color: "#f59e0b" }}>
                <ErrorIcon />
              </div>
              <Box>
                <Typography className={classes.metricValue} style={{ color: metrics.errors > 0 ? "#ef4444" : undefined }}>
                  {metrics.errors}
                </Typography>
                <Typography className={classes.metricLabel}>{i18n.t("hardcoded.withErrors")}</Typography>
              </Box>
            </Paper>
            <Paper className={classes.metricCard}>
              <div className={classes.metricIcon} style={{ background: "#d1fae5", color: "#10b981" }}>
                <CheckCircle />
              </div>
              <Box>
                <Typography className={classes.metricValue}>{floupData.totalSteps}</Typography>
                <Typography className={classes.metricLabel}>{i18n.t("hardcoded.steps")}</Typography>
              </Box>
            </Paper>
            <Paper className={classes.metricCard}>
              <div className={classes.metricIcon} style={{ background: "#dbeafe", color: "#2563eb" }}>
                <DoneAll />
              </div>
              <Box>
                <Typography className={classes.metricValue}>
                  {floupData.historicalMetrics?.completionRate || 0}%
                </Typography>
                <Typography className={classes.metricLabel}>{i18n.t("hardcoded.completionRate")}</Typography>
                <Typography style={{ fontSize: 9, color: "#94a3b8" }}>
                  {floupData.historicalMetrics?.completionProgressCount || 0}/{floupData.historicalMetrics?.completionProgressTotal || 0}
                </Typography>
              </Box>
            </Paper>
            <Paper className={classes.metricCard}>
              <div className={classes.metricIcon} style={{ background: "#fce7f3", color: "#ec4899" }}>
                <ThumbUp />
              </div>
              <Box>
                <Typography className={classes.metricValue}>
                  {floupData.historicalMetrics?.responseRate || 0}%
                </Typography>
                <Typography className={classes.metricLabel}>{i18n.t("hardcoded.responseRate")}</Typography>
                <Typography style={{ fontSize: 9, color: "#94a3b8" }}>
                  {floupData.historicalMetrics?.respondedCount || 0}/{floupData.historicalMetrics?.totalHistorical || 0}
                </Typography>
              </Box>
            </Paper>
          </div>

          {/* Funnel Bar */}
          {funnelData.length > 0 && (
            <Tooltip title={i18n.t("hardcoded.contactDistribution")}>
              <div className={classes.funnelBar}>
                {funnelData.map((seg, idx) => (
                  seg.pct > 0 && (
                    <div
                      key={idx}
                      className={classes.funnelSegment}
                      style={{
                        width: `${Math.max(seg.pct, 8)}%`,
                        background: seg.color,
                      }}
                    >
                      {seg.pct >= 12 && `${seg.count}`}
                    </div>
                  )
                ))}
              </div>
            </Tooltip>
          )}

          {/* Filters */}
          <div className={classes.filtersBar}>
            <TextField
              size="small"
              variant="outlined"
              placeholder={i18n.t("hardcoded.searchContact")}
              value={filters.search}
              onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
              InputProps={{
                startAdornment: <Search style={{ marginRight: 4, color: "#999", fontSize: 16 }} />,
                style: { fontSize: 12, borderRadius: 10, height: 34 },
              }}
              style={{ width: 200 }}
            />
            <FormControl variant="outlined" size="small" style={{ minWidth: 120 }}>
              <Select
                value={filters.channel}
                onChange={(e) => setFilters(prev => ({ ...prev, channel: e.target.value }))}
                displayEmpty
                style={{ fontSize: 12, borderRadius: 10, height: 34 }}
              >
                <MenuItem value="" style={{ fontSize: 12 }}>{i18n.t("hardcoded.allChannels")}</MenuItem>
                {channels.map(ch => (
                  <MenuItem key={ch} value={ch} style={{ fontSize: 12 }}>
                    {rotuloDoCanal(ch)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <Chip
              label={i18n.t("hardcoded.allFilter")}
              size="small"
              className={classes.filterChip}
              color={!filters.status ? "primary" : "default"}
              onClick={() => setFilters(prev => ({ ...prev, status: "" }))}
            />
            <Chip
              label={i18n.t("hardcoded.withErrorsFilter")}
              size="small"
              className={classes.filterChip}
              icon={<ErrorIcon style={{ fontSize: 12 }} />}
              color={filters.status === "error" ? "secondary" : "default"}
              onClick={() => setFilters(prev => ({ ...prev, status: prev.status === "error" ? "" : "error" }))}
            />
            <Chip
              label={i18n.t("hardcoded.pausedFilter")}
              size="small"
              className={classes.filterChip}
              icon={<PauseCircleFilled style={{ fontSize: 12 }} />}
              color={filters.status === "paused" ? "primary" : "default"}
              onClick={() => setFilters(prev => ({ ...prev, status: prev.status === "paused" ? "" : "paused" }))}
            />
          </div>

          {/* Kanban Board */}
          <div className={classes.boardArea}>
            {floupData.steps && floupData.steps.length > 0 ? (
              floupData.steps.map((step, idx) => renderColumn(step, idx))
            ) : (
              <Box display="flex" alignItems="center" justifyContent="center" width="100%" style={{ color: "#999" }}>
                <Typography>{i18n.t("hardcoded.noStepFound")}</Typography>
              </Box>
            )}
          </div>
        </>
      )}

      {/* History Timeline Dialog */}
      <Dialog
        open={historyOpen}
        onClose={() => { setHistoryOpen(false); setHistoryData(null); }}
        classes={{ paper: classes.historyDialog }}
        maxWidth="sm"
        fullWidth
      >
        <DialogTitle style={{ paddingBottom: 8 }}>
          <Box display="flex" alignItems="center" justifyContent="space-between">
            <Box display="flex" alignItems="center" gap={1}>
              <History style={{ color: "#7c3aed" }} />
              <Typography variant="h6" style={{ fontSize: 16, fontWeight: 700 }}>
                {i18n.t("hardcoded.timelineFollowUp")}
              </Typography>
            </Box>
            <IconButton size="small" onClick={() => { setHistoryOpen(false); setHistoryData(null); }}>
              <Close />
            </IconButton>
          </Box>
        </DialogTitle>
        <DialogContent style={{ paddingBottom: 24 }}>
          {/* Contact info header */}
          {(historyData || historyContact) && (
            <Box display="flex" alignItems="center" gap={1} mb={2} p={1.5}
              style={{ background: "#f8fafc", borderRadius: 12, border: "1px solid #e2e8f0" }}>
              <Avatar
                src={historyData?.contactProfilePicUrl || historyContact?.contactProfilePicUrl}
                style={{ width: 40, height: 40, backgroundColor: "#7c3aed" }}
              >
                {(historyData?.contactName || historyContact?.contactName)?.[0]?.toUpperCase()}
              </Avatar>
              <Box flex={1}>
                <Typography style={{ fontSize: 14, fontWeight: 600 }}>
                  {historyData?.contactName || historyContact?.contactName}
                </Typography>
                <Typography style={{ fontSize: 11, color: "#666" }}>
                  {historyData?.contactNumber || historyContact?.contactNumber}
                </Typography>
              </Box>
              {historyData && (
                <Box textAlign="right">
                  <Typography style={{ fontSize: 11, color: "#7c3aed", fontWeight: 600 }}>
                    {historyData.floupName}
                  </Typography>
                  <Typography style={{ fontSize: 10, color: "#94a3b8" }}>
                    {historyData.totalSteps || historyData.timeline?.length || 0} etapa(s) • Total {historyData.totalSteps}
                  </Typography>
                </Box>
              )}
            </Box>
          )}

          {loadingHistory ? (
            <Box display="flex" justifyContent="center" py={4}>
              <CircularProgress size={32} style={{ color: "#7c3aed" }} />
            </Box>
          ) : historyData?.timeline?.length > 0 ? (
            <div className={classes.timelineContainer}>
              {[...(historyData.timeline || [])]
                .sort((a, b) => {
                  if ((a.stepOrder || 0) !== (b.stepOrder || 0)) {
                    return (a.stepOrder || 0) - (b.stepOrder || 0);
                  }

                  const aTime = new Date(a.nextRunAt || a.updatedAt || a.createdAt || 0).getTime();
                  const bTime = new Date(b.nextRunAt || b.updatedAt || b.createdAt || 0).getTime();
                  return aTime - bTime;
                })
                .map((item, idx) => (
                <div key={item.scheduleId} className={classes.timelineItem}>
                  <div
                    className={classes.timelineDot}
                    style={{ color: item.statusColor, backgroundColor: item.statusColor }}
                  />
                  <div className={classes.timelineCard}>
                    <Box display="flex" alignItems="center" justifyContent="space-between">
                      <Typography className={classes.timelineStepLabel}>
                        {i18n.t("hardcoded.step")} {item.stepOrder}
                      </Typography>
                      <Chip
                        size="small"
                        label={item.status === "PENDING" ? i18n.t("hardcoded.awaitingExecution") : item.statusLabel}
                        style={{
                          height: 20,
                          fontSize: 10,
                          fontWeight: 600,
                          backgroundColor: `${item.statusColor}15`,
                          color: item.statusColor,
                          border: `1px solid ${item.statusColor}30`,
                        }}
                      />
                    </Box>

                    {item.stepMessage && (
                      <div className={classes.timelineMessage}>
                        {item.stepMessage.length > 200
                          ? item.stepMessage.substring(0, 200) + "..."
                          : item.stepMessage}
                      </div>
                    )}

                    {item.stepMediaUrl && (
                      <Box mt={0.5} display="flex" alignItems="center" gap={0.5}>
                        <Chip
                          size="small"
                          label={`📎 ${item.stepMediaType || "Mídia"}`}
                          style={{ height: 18, fontSize: 9, background: "#ede9fe", color: "#7c3aed" }}
                        />
                      </Box>
                    )}

                    <div className={classes.timelineMeta}>
                      {item.createdAt && (
                        <Typography className={classes.timelineDate}>
                          📅 {i18n.t("hardcoded.created")}: {format(parseISO(item.createdAt), "dd/MM/yy HH:mm", { locale: ptBR })}
                        </Typography>
                      )}
                      {item.status === "COMPLETED" && item.updatedAt && (
                        <Typography className={classes.timelineDate}>
                          ✅ {i18n.t("hardcoded.sent")}: {format(parseISO(item.updatedAt), "dd/MM/yy HH:mm", { locale: ptBR })}
                        </Typography>
                      )}
                      {item.status === "PENDING" && item.nextRunAt && (
                        <Typography className={classes.timelineDate}>
                          ⏳ {i18n.t("hardcoded.next")}: {format(new Date(item.nextRunAt), "dd/MM/yy HH:mm", { locale: ptBR })}
                        </Typography>
                      )}
                      {item.channel && item.channel !== "N/A" && (
                        <Chip
                          size="small"
                          icon={getChannelIcon(item.channel)}
                          label={item.channel}
                          style={{ height: 18, fontSize: 9 }}
                          variant="outlined"
                        />
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <Box textAlign="center" py={4} style={{ color: "#94a3b8" }}>
              <History style={{ fontSize: 40, opacity: 0.3, marginBottom: 8 }} />
              <Typography style={{ fontSize: 13 }}>{i18n.t("hardcoded.noHistoryFound")}</Typography>
            </Box>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default FloupDashboard;
