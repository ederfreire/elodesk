import React, { useContext, useState, useEffect, useMemo, useRef } from "react";
import jsPDF from "jspdf";
import html2canvas from "html2canvas";

import Paper from "@material-ui/core/Paper";
import Typography from "@material-ui/core/Typography";
import { makeStyles } from "@material-ui/core/styles";
import { useTheme } from "@material-ui/core/styles";
import { IconButton } from "@mui/material";
import Groups from "@mui/icons-material/Groups";
import SaveAlt from "@mui/icons-material/SaveAlt";
import TrendingUp from "@mui/icons-material/TrendingUp";
import Assessment from "@mui/icons-material/Assessment";
import Speed from "@mui/icons-material/Speed";

import CallIcon from "@material-ui/icons/Call";
import PictureAsPdfIcon from "@material-ui/icons/PictureAsPdf";
import RecordVoiceOverIcon from "@material-ui/icons/RecordVoiceOver";
import GroupAddIcon from "@material-ui/icons/GroupAdd";
import HourglassEmptyIcon from "@material-ui/icons/HourglassEmpty";
import CheckCircleIcon from "@material-ui/icons/CheckCircle";
import FilterListIcon from "@material-ui/icons/FilterList";
import ClearIcon from "@material-ui/icons/Clear";
import SendIcon from "@material-ui/icons/Send";
import MessageIcon from "@material-ui/icons/Message";
import AccessAlarmIcon from "@material-ui/icons/AccessAlarm";
import TimerIcon from "@material-ui/icons/Timer";
import * as XLSX from "xlsx";

import { toast } from "react-toastify";

import MainContainer from "../../components/MainContainer";
import TableAttendantsStatus from "../../components/Dashboard/TableAttendantsStatus";
import { isArray } from "lodash";

import { AuthContext } from "../../context/Auth/AuthContext";

import useDashboard from "../../hooks/useDashboard";
import useContacts from "../../hooks/useContacts";
import useMessages from "../../hooks/useMessages";
import { ChatsUser } from "./ChartsUser";

import Filters from "./Filters";
import { isEmpty } from "lodash";
import moment from "moment";
import { ChartsDate } from "./ChartsDate";
import AnalyticsWidgets from "./AnalyticsWidgets";
import {
  Button,
  Container,
  LinearProgress,
  Box,
} from "@mui/material";
import { i18n } from "../../translate/i18n";
import Grid2 from "@mui/material/Unstable_Grid2/Grid2";
import ForbiddenPage from "../../components/ForbiddenPage";
import ArrowDownward from "@material-ui/icons/ArrowDownward";
import ArrowUpward from "@material-ui/icons/ArrowUpward";

const useStyles = makeStyles((theme) => ({
  mainPaper: {
    flex: 1,
    overflowY: "auto",
    overflowX: "hidden",
    ...theme.scrollbarStyles,
    backgroundColor: theme.palette.mode === "dark" ? "#0d1117" : "#f0f2f5",
    borderRadius: "10px",
    border: "none !important",
  },
  // Compact KPI strip item
  kpiStrip: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "10px 14px",
    borderRadius: 10,
    backgroundColor: theme.palette.mode === "dark" ? "#161b22" : "#fff",
    border: `1px solid ${theme.palette.mode === "dark" ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"}`,
    transition: "box-shadow 0.2s",
    "&:hover": {
      boxShadow: theme.palette.mode === "dark"
        ? "0 4px 16px rgba(0,0,0,0.4)"
        : "0 4px 16px rgba(0,0,0,0.08)",
    },
  },
  kpiIconSmall: {
    width: 36,
    height: 36,
    borderRadius: 8,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  kpiValueSmall: {
    fontSize: "1.25rem",
    fontWeight: 800,
    lineHeight: 1.1,
    color: theme.palette.text.primary,
    fontFamily: "'Plus Jakarta Sans', sans-serif",
  },
  kpiLabelSmall: {
    fontSize: "0.65rem",
    fontWeight: 600,
    color: theme.palette.text.secondary,
    textTransform: "uppercase",
    letterSpacing: "0.3px",
    lineHeight: 1.2,
  },
  // Section
  sectionHeader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: 12,
    marginTop: 20,
  },
  sectionIcon: {
    width: 30,
    height: 30,
    borderRadius: 8,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.primary.dark || theme.palette.primary.main})`,
  },
  sectionTitle: {
    fontSize: "0.95rem",
    fontWeight: 700,
    color: theme.palette.text.primary,
    letterSpacing: "-0.01em",
  },
  // Combined panel
  panel: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: theme.palette.mode === "dark" ? "#161b22" : "#fff",
    border: `1px solid ${theme.palette.mode === "dark" ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"}`,
  },
  // NPS inline
  npsRow: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "8px 0",
  },
  npsBarBg: {
    flex: 1,
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.palette.mode === "dark" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)",
    overflow: "hidden",
  },
  npsBarFill: {
    height: "100%",
    borderRadius: 4,
    transition: "width 0.6s ease",
  },
  // Filter
  filterPaper: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: theme.palette.mode === "dark" ? "#161b22" : "#fff",
    border: `1px solid ${theme.palette.mode === "dark" ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"}`,
  },
  // Chart card
  chartCard: {
    padding: 16,
    borderRadius: 12,
    backgroundColor: theme.palette.mode === "dark" ? "#161b22" : "#fff",
    border: `1px solid ${theme.palette.mode === "dark" ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"}`,
  },
  tableCard: {
    padding: 12,
    borderRadius: 12,
    backgroundColor: theme.palette.mode === "dark" ? "#161b22" : "#fff",
    border: `1px solid ${theme.palette.mode === "dark" ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"}`,
  },
  // Rating compact
  ratingRow: {
    display: "flex",
    alignItems: "center",
    gap: 16,
    padding: "12px 16px",
    borderRadius: 12,
    backgroundColor: theme.palette.mode === "dark" ? "#161b22" : "#fff",
    border: `1px solid ${theme.palette.mode === "dark" ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"}`,
  },
}));

const COLORS = {
  teal: { bg: "rgba(1, 187, 172, 0.12)", icon: "#2DD4BF" },
  slate: { bg: "rgba(100, 130, 150, 0.12)", icon: "#8BADC0" },
  purple: { bg: "rgba(120, 110, 200, 0.12)", icon: "#9B8FE0" },
  brown: { bg: "rgba(170, 120, 110, 0.12)", icon: "#C9A69E" },
  gold: { bg: "rgba(200, 160, 50, 0.12)", icon: "#E0B84A" },
  dark: { bg: "rgba(140, 140, 150, 0.12)", icon: "#A8A8B2" },
  green: { bg: "rgba(100, 180, 110, 0.12)", icon: "#7CD486" },
  orange: { bg: "rgba(247, 144, 9, 0.12)", icon: "#F9A83A" },
  crimson: { bg: "rgba(200, 80, 100, 0.12)", icon: "#E0708A" },
  red: { bg: "rgba(238, 69, 18, 0.12)", icon: "#F06840" },
  blue: { bg: "rgba(40, 192, 55, 0.12)", icon: "#4AD85A" },
};

const Dashboard = () => {
  const theme = useTheme();
  const classes = useStyles();
  const [counters, setCounters] = useState({});
  const [attendants, setAttendants] = useState([]);
  const [period, setPeriod] = useState(0);
  const [loading, setLoading] = useState(false);
  const { find } = useDashboard();

  const [selectedUsers, setSelectedUsers] = useState([]);
  const [selectedQueues, setSelectedQueues] = useState([]);

  let newDate = new Date();
  let date = newDate.getDate();
  let month = newDate.getMonth() + 1;
  let year = newDate.getFullYear();
  let nowIni = `${year}-${month < 10 ? `0${month}` : `${month}`}-01`;
  let now = `${year}-${month < 10 ? `0${month}` : `${month}`}-${date < 10 ? `0${date}` : `${date}`}`;

  const [showFilter, setShowFilter] = useState(false);
  const [dateStartTicket, setDateStartTicket] = useState(nowIni);
  const [dateEndTicket, setDateEndTicket] = useState(now);
  const [queueTicket, setQueueTicket] = useState(false);
  const [userTicket, setUserTicket] = useState("");
  const [fetchDataFilter, setFetchDataFilter] = useState(false);

  const { user } = useContext(AuthContext);

  const dashboardRef = useRef(null);
  const [exportingPdf, setExportingPdf] = useState(false);

  const exportarGridParaExcel = () => {
    const ws = XLSX.utils.table_to_sheet(document.getElementById("grid-attendants"));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "RelatorioDeAtendentes");
    XLSX.writeFile(wb, "relatorio-de-atendentes.xlsx");
  };

  const exportarDashboardParaPDF = async () => {
    if (!dashboardRef.current || exportingPdf) return;
    try {
      setExportingPdf(true);
      const element = dashboardRef.current;
      const isDark = theme.palette.mode === "dark";
      const bgColor = isDark ? "#0d1117" : "#f0f2f5";
      const canvas = await html2canvas(element, {
        scale: 2,
        useCORS: true,
        backgroundColor: bgColor,
        scrollX: 0,
        scrollY: -window.scrollY,
        windowWidth: element.scrollWidth,
        windowHeight: element.scrollHeight,
      });
      const imgData = canvas.toDataURL("image/png");
      const pdf = new jsPDF({
        orientation: canvas.width > canvas.height ? "landscape" : "portrait",
        unit: "px",
        format: [canvas.width, canvas.height],
      });
      pdf.addImage(imgData, "PNG", 0, 0, canvas.width, canvas.height);
      pdf.save(`dashboard-${moment().format("YYYY-MM-DD_HH-mm")}.pdf`);
    } catch (err) {
      console.error("PDF export error:", err);
      toast.error(i18n.t("dashboard.pdfError") || "Erro ao gerar PDF");
    } finally {
      setExportingPdf(false);
    }
  };

  var userQueueIds = [];
  if (user.queues && user.queues.length > 0) {
    userQueueIds = user.queues.map((q) => q.id);
  }

  useEffect(() => {
    let isMounted = true;
    async function firstLoad() {
      if (isMounted) await fetchData();
    }
    const timeoutId = setTimeout(() => { firstLoad(); }, 500);
    return () => { isMounted = false; clearTimeout(timeoutId); };
  }, [fetchDataFilter, userTicket, dateStartTicket, dateEndTicket]);

  async function fetchData() {
    setLoading(true);
    let params = {};
    if (period > 0) {
      params = { days: period };
    } else {
      if (!isEmpty(dateStartTicket) && moment(dateStartTicket).isValid()) {
        params = { ...params, date_from: moment(dateStartTicket).format("YYYY-MM-DD") };
      }
      if (!isEmpty(dateEndTicket) && moment(dateEndTicket).isValid()) {
        params = { ...params, date_to: moment(dateEndTicket).format("YYYY-MM-DD") };
      }
    }
    if (userTicket !== undefined && userTicket !== null && `${userTicket}` !== "") {
      params = { ...params, userId: String(userTicket) };
    }
    if (Object.keys(params).length === 0) {
      params = { days: 30 };
    }
    try {
      const data = await find(params);
      setCounters(data.counters || {});
      setAttendants(isArray(data.attendants) ? data.attendants : []);
    } catch (error) {
      console.error('Dashboard fetch error:', error);
      toast.error(i18n.t('dashboard.fetchError'));
      setCounters({
        avgSupportTime: 0, avgWaitTime: 0, supportFinished: 0,
        supportHappening: 0, supportPending: 0, supportGroups: 0,
        leads: 0, activeTickets: 0, passiveTickets: 0, tickets: 0,
        waitRating: 0, withoutRating: 0, withRating: 0, percRating: 0,
        npsPromotersPerc: 0, npsPassivePerc: 0, npsDetractorsPerc: 0, npsScore: 0
      });
      setAttendants([]);
    } finally {
      setLoading(false);
    }
  }

  function formatTime(minutes) {
    return moment().startOf("day").add(minutes, "minutes").format("HH[h] mm[m]");
  }

  const GetUsers = () => {
    let userOnline = 0;
    attendants.forEach((u) => { if (u.online === true) userOnline++; });
    return userOnline;
  };

  const GetContacts = (all) => {
    let props = {};
    if (!all) props = { dateStart: dateStartTicket, dateEnd: dateEndTicket };
    const { count } = useContacts(props);
    return count;
  };

  const GetMessages = (all, fromMe) => {
    let props = {};
    if (all) {
      props = fromMe ? { fromMe: true } : { fromMe: false };
    } else {
      props = fromMe
        ? { fromMe: true, dateStart: dateStartTicket, dateEnd: dateEndTicket }
        : { fromMe: false, dateStart: dateStartTicket, dateEnd: dateEndTicket };
    }
    const { count } = useMessages(props);
    return count;
  };

  function toggleShowFilter() { setShowFilter(!showFilter); }

  // Compact KPI item
  const Kpi = ({ label, value, icon, color }) => (
    <Box className={classes.kpiStrip}>
      <Box className={classes.kpiIconSmall} style={{ backgroundColor: color.bg }}>
        {React.cloneElement(icon, { style: { color: color.icon, fontSize: "1.1rem" } })}
      </Box>
      <Box>
        <Typography className={classes.kpiValueSmall}>{value}</Typography>
        <Typography className={classes.kpiLabelSmall}>{label}</Typography>
      </Box>
    </Box>
  );

  const SectionHeader = ({ title, icon }) => (
    <Box className={classes.sectionHeader}>
      <Box className={classes.sectionIcon}>
        {React.cloneElement(icon, { style: { color: "#fff", fontSize: "1rem" } })}
      </Box>
      <Typography className={classes.sectionTitle}>{title}</Typography>
    </Box>
  );

  // Format percent: max 1 decimal, drop trailing .0
  const formatPerc = (v) => {
    const n = Number(v);
    if (!isFinite(n)) return 0;
    return Math.round(n * 10) / 10;
  };

  // NPS inline row
  const NpsRow = ({ label, value, color }) => {
    const perc = formatPerc(value);
    return (
      <Box className={classes.npsRow}>
        <Typography style={{ fontSize: "0.72rem", fontWeight: 600, color: theme.palette.text.secondary, textTransform: "uppercase", width: 90, flexShrink: 0 }}>
          {label}
        </Typography>
        <Box className={classes.npsBarBg}>
          <Box className={classes.npsBarFill} style={{ width: `${Math.min(Math.max(perc, 0), 100)}%`, backgroundColor: color }} />
        </Box>
        <Typography style={{ fontSize: "1rem", fontWeight: 800, color, minWidth: 48, textAlign: "right", whiteSpace: "nowrap" }}>
          {perc}%
        </Typography>
      </Box>
    );
  };

  const kpiIndicators = [
    { label: i18n.t("dashboard.cards.inAttendance"), value: counters.supportHappening || 0, icon: <CallIcon />, color: COLORS.teal },
    { label: i18n.t("dashboard.cards.waiting"), value: counters.supportPending || 0, icon: <HourglassEmptyIcon />, color: COLORS.slate },
    { label: i18n.t("dashboard.cards.finalized"), value: counters.supportFinished || 0, icon: <CheckCircleIcon />, color: COLORS.purple },
    { label: i18n.t("dashboard.cards.groups"), value: counters.supportGroups || 0, icon: <Groups />, color: COLORS.teal },
    { label: i18n.t("dashboard.cards.activeAttendants"), value: `${GetUsers()}/${attendants.length}`, icon: <RecordVoiceOverIcon />, color: COLORS.brown },
    { label: i18n.t("dashboard.cards.newContacts"), value: counters.leads || 0, icon: <GroupAddIcon />, color: COLORS.gold },
  ];

  const kpiMessages = [
    { label: i18n.t("dashboard.cards.totalReceivedMessages"), value: `${GetMessages(false, false)}/${GetMessages(true, false)}`, icon: <MessageIcon />, color: COLORS.dark },
    { label: i18n.t("dashboard.cards.totalSentMessages"), value: `${GetMessages(false, true)}/${GetMessages(true, true)}`, icon: <SendIcon />, color: COLORS.green },
    { label: i18n.t("dashboard.cards.averageServiceTime"), value: formatTime(counters.avgSupportTime), icon: <AccessAlarmIcon />, color: COLORS.orange },
    { label: i18n.t("dashboard.cards.averageWaitingTime"), value: formatTime(counters.avgWaitTime), icon: <TimerIcon />, color: COLORS.crimson },
    { label: i18n.t("dashboard.cards.activeTickets"), value: counters.activeTickets || 0, icon: <ArrowUpward />, color: COLORS.red },
    { label: i18n.t("dashboard.cards.passiveTickets"), value: counters.passiveTickets || 0, icon: <ArrowDownward />, color: COLORS.blue },
  ];

  const npsItems = [
    { label: i18n.t("dashboard.assessments.score"), value: counters.npsScore || 0, color: theme.palette.primary.main },
    { label: i18n.t("dashboard.assessments.prosecutors"), value: counters.npsPromotersPerc || 0, color: "#10B981" },
    { label: i18n.t("dashboard.assessments.neutral"), value: counters.npsPassivePerc || 0, color: "#F59E0B" },
    { label: i18n.t("dashboard.assessments.detractors"), value: counters.npsDetractorsPerc || 0, color: "#EF4444" },
  ];

  const attendanceItems = [
    { label: i18n.t("dashboard.assessments.totalCalls"), value: counters.tickets || 0, icon: <CallIcon />, color: COLORS.teal },
    { label: i18n.t("dashboard.assessments.callsWaitRating"), value: counters.waitRating || 0, icon: <HourglassEmptyIcon />, color: COLORS.slate },
    { label: i18n.t("dashboard.assessments.callsWithoutRating"), value: counters.withoutRating || 0, icon: <RecordVoiceOverIcon />, color: COLORS.crimson },
    { label: i18n.t("dashboard.assessments.ratedCalls"), value: counters.withRating || 0, icon: <RecordVoiceOverIcon />, color: COLORS.brown },
  ];

  return (
    <>
      {user.showDashboard !== "enabled" ? (
        <ForbiddenPage />
      ) : (
        <MainContainer>
          <Paper className={classes.mainPaper} variant="outlined">
            <Container maxWidth={false} style={{ padding: '16px 14px', maxWidth: '100%', overflowX: 'hidden' }}>
              <Grid2 ref={dashboardRef} container spacing={1.5} style={{ margin: 0, width: '100%' }}>

                {/* Header */}
                <Grid2 xs={12} container justifyContent="space-between" alignItems="center">
                  <Box>
                    <Typography style={{
                      fontSize: "1.3rem",
                      fontWeight: 800,
                      color: theme.palette.text.primary,
                      letterSpacing: "-0.02em",
                      fontFamily: "'Plus Jakarta Sans', sans-serif",
                    }}>
                      📊 {i18n.t("mainDrawer.listItems.dashboard")}
                    </Typography>
                    <Typography style={{ fontSize: "0.75rem", color: theme.palette.text.secondary }}>
                      {i18n.t("dashboard.subtitle")}
                    </Typography>
                  </Box>
                  <Box display="flex" gap={1} style={{ position: "relative", zIndex: 10 }}>
                    <Button
                      onClick={toggleShowFilter}
                      variant={showFilter ? "contained" : "outlined"}
                      color="primary"
                      size="small"
                      startIcon={!showFilter ? <FilterListIcon /> : <ClearIcon />}
                      style={{ borderRadius: 8, textTransform: "none", fontWeight: 600, fontSize: "0.75rem" }}
                    >
                      {showFilter ? i18n.t("dashboard.hideFilters") : i18n.t("dashboard.filters")}
                    </Button>
                    <IconButton
                      onClick={exportarGridParaExcel}
                      size="small"
                      title={i18n.t("dashboard.exportExcel") || "Exportar Excel"}
                      style={{
                        borderRadius: 8,
                        border: `1px solid ${theme.palette.mode === "dark" ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"}`,
                      }}
                    >
                      <SaveAlt fontSize="small" />
                    </IconButton>
                    <IconButton
                      onClick={exportarDashboardParaPDF}
                      disabled={exportingPdf}
                      size="small"
                      title={i18n.t("dashboard.exportPdf") || "Baixar PDF"}
                      style={{
                        borderRadius: 8,
                        border: `1px solid ${theme.palette.mode === "dark" ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"}`,
                      }}
                    >
                      <PictureAsPdfIcon fontSize="small" />
                    </IconButton>
                  </Box>
                </Grid2>

                {/* Filters */}
                {showFilter && (
                  <Grid2 item xs={12}>
                    <Box className={classes.filterPaper}>
                      <Filters
                        classes={classes}
                        setDateStartTicket={setDateStartTicket}
                        setDateEndTicket={setDateEndTicket}
                        dateStartTicket={dateStartTicket}
                        dateEndTicket={dateEndTicket}
                        setQueueTicket={setQueueTicket}
                        queueTicket={queueTicket}
                        setUserTicket={setUserTicket}
                        userTicket={userTicket}
                        fetchData={setFetchDataFilter}
                      />
                    </Box>
                  </Grid2>
                )}

                {/* KPI Strip — Atendimento */}
                <Grid2 item xs={12}>
                  <SectionHeader title={i18n.t("dashboard.tabs.indicators")} icon={<Speed />} />
                </Grid2>
                {kpiIndicators.map((kpi, idx) => (
                  <Grid2 item xs={6} sm={4} md={2} key={`a-${idx}`}>
                    <Kpi {...kpi} />
                  </Grid2>
                ))}

                {/* KPI Strip — Mensagens & Tempos */}
                {kpiMessages.map((kpi, idx) => (
                  <Grid2 item xs={6} sm={4} md={2} key={`b-${idx}`}>
                    <Kpi {...kpi} />
                  </Grid2>
                ))}

                {/* NPS + Atendimentos — single row compact */}
                <Grid2 item xs={12} md={5}>
                  <SectionHeader title={i18n.t("dashboard.npsTitle")} icon={<Assessment />} />
                  <Box className={classes.panel} style={{ padding: "12px 16px" }}>
                    {npsItems.map((item, idx) => (
                      <Box key={idx} display="flex" alignItems="center" gap={1} py={0.4}>
                        <Typography style={{ fontSize: "0.7rem", fontWeight: 600, color: theme.palette.text.secondary, textTransform: "uppercase", width: 80, flexShrink: 0 }}>
                          {item.label}
                        </Typography>
                        <Box flex={1} height={6} borderRadius={3} overflow="hidden"
                          style={{ backgroundColor: theme.palette.mode === "dark" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)" }}>
                          <Box height="100%" borderRadius={3} style={{ width: `${Math.min(item.value, 100)}%`, backgroundColor: item.color, transition: "width 0.6s ease" }} />
                        </Box>
                        <Typography style={{ fontSize: "0.85rem", fontWeight: 800, color: item.color, minWidth: 40, textAlign: "right" }}>
                          {item.value}%
                        </Typography>
                      </Box>
                    ))}
                  </Box>
                </Grid2>

                <Grid2 item xs={12} md={7}>
                  <SectionHeader title={i18n.t("dashboard.calls")} icon={<CallIcon />} />
                  <Box className={classes.panel} style={{ padding: "12px 16px" }}>
                    <Grid2 container spacing={1}>
                      {attendanceItems.map((item, idx) => (
                        <Grid2 item xs={6} sm={3} key={idx}>
                          <Box display="flex" alignItems="center" gap={1}>
                            <Box className={classes.kpiIconSmall} style={{ backgroundColor: item.color.bg, width: 32, height: 32, borderRadius: 6 }}>
                              {React.cloneElement(item.icon, { style: { color: item.color.icon, fontSize: "0.95rem" } })}
                            </Box>
                            <Box>
                              <Typography style={{ fontSize: "1.1rem", fontWeight: 800, lineHeight: 1.1, color: theme.palette.text.primary }}>{item.value}</Typography>
                              <Typography style={{ fontSize: "0.6rem", fontWeight: 600, color: theme.palette.text.secondary, textTransform: "uppercase", lineHeight: 1.2 }}>{item.label}</Typography>
                            </Box>
                          </Box>
                        </Grid2>
                      ))}
                      <Grid2 item xs={12}>
                        <Box display="flex" alignItems="center" gap={1.5} mt={0.5}>
                          <Typography style={{ fontSize: "0.7rem", fontWeight: 600, color: theme.palette.text.secondary, textTransform: "uppercase", flexShrink: 0 }}>
                            {i18n.t("dashboard.assessments.evaluationIndex")}
                          </Typography>
                          <Box flex={1}>
                            <LinearProgress variant="determinate" value={counters.percRating || 0}
                              sx={{ height: 6, borderRadius: 3, backgroundColor: theme.palette.mode === "dark" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.05)",
                                '& .MuiLinearProgress-bar': { borderRadius: 3, background: "linear-gradient(90deg, #F79009, #F59E0B)" } }} />
                          </Box>
                          <Typography style={{ fontSize: "0.9rem", fontWeight: 800, color: "#F79009" }}>
                            {Number(counters.percRating / 100).toLocaleString(undefined, { style: 'percent' }) || "0%"}
                          </Typography>
                        </Box>
                      </Grid2>
                    </Grid2>
                  </Box>
                </Grid2>

                {/* Attendants Table */}
                <Grid2 item xs={12}>
                  <SectionHeader title={i18n.t("dashboard.tabs.attendants")} icon={<RecordVoiceOverIcon />} />
                  <Box className={classes.tableCard}>
                    <TableAttendantsStatus attendants={attendants} loading={loading} />
                  </Box>
                </Grid2>

                {/* Analytics Widgets */}
                <Grid2 item xs={12} style={{ marginTop: 4 }}>
                  <SectionHeader title={i18n.t("dashboard.analytics.title")} icon={<TrendingUp />} />
                  <AnalyticsWidgets
                    counters={counters}
                    dateStart={dateStartTicket}
                    dateEnd={dateEndTicket}
                  />
                </Grid2>

                {/* Charts */}
                <Grid2 container spacing={1.5} item xs={12} style={{ marginTop: 4 }}>
                  <Grid2 item xs={12} md={6}>
                    <Box className={classes.chartCard}>
                      <ChatsUser />
                    </Box>
                  </Grid2>
                  <Grid2 item xs={12} md={6}>
                    <Box className={classes.chartCard}>
                      <ChartsDate />
                    </Box>
                  </Grid2>
                </Grid2>
              </Grid2>
            </Container>
          </Paper>
        </MainContainer>
      )}
    </>
  );
};

export default Dashboard;
