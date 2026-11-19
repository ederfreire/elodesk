import React, { useState, useEffect, useContext, useMemo } from "react";
import { iconeDoCanal } from "../../components/IconeDoCanal";

import { useHistory } from "react-router-dom";
import { makeStyles } from "@material-ui/core/styles";
import Table from "@material-ui/core/Table";
import TableBody from "@material-ui/core/TableBody";
import TableCell from "@material-ui/core/TableCell";
import TableHead from "@material-ui/core/TableHead";
import TableRow from "@material-ui/core/TableRow";
import Paper from "@material-ui/core/Paper";
import Button from "@material-ui/core/Button";
import Pagination from "@material-ui/lab/Pagination";
import * as XLSX from "xlsx";
import api from "../../services/api";
import TableRowSkeleton from "../../components/TableRowSkeleton";
import { i18n } from "../../translate/i18n";
import { getTicketProtocol } from "../../helpers/ticketProtocol";
import MainContainer from "../../components/MainContainer";
import toastError from "../../errors/toastError";
import { AuthContext } from "../../context/Auth/AuthContext";
import ForbiddenPage from "../../components/ForbiddenPage";
import { CircularProgress, FormControl, FormControlLabel, IconButton, MenuItem, Select, Switch, TextField, Tooltip, Typography, Box, Chip, Collapse } from "@material-ui/core";
import { UsersFilter } from "../../components/UsersFilter";
import { WhatsappsFilter } from "../../components/WhatsappsFilter";
import { StatusFilter } from "../../components/StatusFilter";
import useDashboard from "../../hooks/useDashboard";
import QueueSelectCustom from "../../components/QueueSelectCustom";
import moment from "moment";
import ShowTicketLogModal from "../../components/ShowTicketLogModal";
import blue from "@material-ui/core/colors/blue";
import green from "@material-ui/core/colors/green";
import Forward from "@material-ui/icons/Forward";
import History from "@material-ui/icons/History";
import SaveAlt from "@material-ui/icons/SaveAlt";
import Assessment from "@material-ui/icons/Assessment";
import Schedule from "@material-ui/icons/Schedule";
import CheckCircle from "@material-ui/icons/CheckCircle";
import HourglassEmpty from "@material-ui/icons/HourglassEmpty";
import PieChartIcon from "@material-ui/icons/PieChart";
import BarChartIcon from "@material-ui/icons/BarChart";
import PeopleIcon from "@material-ui/icons/People";
import FilterList from "@material-ui/icons/FilterList";
import ExpandMore from "@material-ui/icons/ExpandMore";
import ExpandLess from "@material-ui/icons/ExpandLess";
import ArrowUpward from "@material-ui/icons/ArrowUpward";
import ArrowDownward from "@material-ui/icons/ArrowDownward";
import UnfoldMore from "@material-ui/icons/UnfoldMore";
import FileCopyIcon from "@material-ui/icons/FileCopy";
import Autocomplete, { createFilterOptions } from "@material-ui/lab/Autocomplete";
import { Doughnut, Bar } from "react-chartjs-2";
import {
  Chart as ChartJS,
  ArcElement,
  CategoryScale,
  LinearScale,
  BarElement,
  Title as ChartTitle,
  Tooltip as ChartTooltip,
  Legend,
} from "chart.js";
import ChartDataLabels from "chartjs-plugin-datalabels";

const ContactDrawer = React.lazy(() => import("../../components/ContactDrawer"));

ChartJS.register(ArcElement, CategoryScale, LinearScale, BarElement, ChartTitle, ChartTooltip, Legend, ChartDataLabels);

const useStyles = makeStyles((theme) => ({
  root: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    overflow: "auto",
    // Mesmo motivo do AdsReport: como aba de Relatorios esta tela recebe
    // altura fixa, e sem isso os blocos filhos encolhem ate cortar o
    // conteudo, cada um com sua barra de rolagem.
    "& > *": { flexShrink: 0 },
    background: theme.palette.type === "dark" ? "#0b0f19" : "#f4f6fb",
    padding: theme.spacing(2),
    gap: theme.spacing(1.5),
    [theme.breakpoints.down("xs")]: {
      padding: theme.spacing(1),
      gap: theme.spacing(1),
    },
  },
  // Top bar with KPIs + filter toggle
  topBar: {
    display: "flex",
    alignItems: "stretch",
    gap: theme.spacing(1.5),
    flexWrap: "wrap",
  },
  kpiCard: {
    flex: "1 1 0",
    minWidth: 140,
    display: "flex",
    alignItems: "center",
    gap: 12,
    padding: "12px 16px",
    borderRadius: 14,
    [theme.breakpoints.down("xs")]: {
      flex: "1 1 calc(50% - 6px)",
      minWidth: "auto",
      padding: "10px 12px",
      gap: 8,
    },
    backgroundColor: theme.palette.background.paper,
    border: `1px solid ${theme.palette.type === "dark" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}`,
    boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
    transition: "box-shadow 0.2s",
    "&:hover": {
      boxShadow: "0 4px 16px rgba(0,0,0,0.08)",
    },
  },
  kpiIcon: {
    width: 40,
    height: 40,
    borderRadius: 10,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  kpiValue: {
    fontSize: "1.6rem",
    fontWeight: 800,
    lineHeight: 1,
    color: theme.palette.text.primary,
  },
  kpiLabel: {
    fontSize: "0.65rem",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    color: theme.palette.text.secondary,
    marginTop: 2,
  },
  // Filters
  filterSection: {
    borderRadius: 14,
    backgroundColor: theme.palette.background.paper,
    border: `1px solid ${theme.palette.type === "dark" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}`,
    overflow: "hidden",
  },
  filterToggle: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "8px 16px",
    cursor: "pointer",
    userSelect: "none",
    "&:hover": {
      backgroundColor: theme.palette.type === "dark" ? "rgba(255,255,255,0.03)" : "rgba(0,0,0,0.02)",
    },
  },
  filterContent: {
    padding: "8px 16px 14px",
  },
  // Uma linha só, com rolagem horizontal quando a tela é estreita.
  //
  // Antes era `flexWrap: "wrap"` com larguras-base grandes (140px, 130px...):
  // em telas médias os campos quebravam em duas ou três linhas e, pior, cada
  // um encolhia abaixo do necessário para o rótulo caber — daí "Filtro por
  // Conexão" aparecer cortado por cima da setinha e "Digite para pesquisar o
  // contato" ocupar duas linhas dentro da caixa.
  //
  // Com nowrap + larguras-base menores, tudo fica lado a lado. Se ainda assim
  // não couber (celular), rola na horizontal em vez de quebrar e embolar.
  singleFilterRow: {
    display: "flex",
    flexWrap: "nowrap",
    alignItems: "center",
    gap: 8,
    overflowX: "auto",
    paddingBottom: 4,
    // Barra de rolagem discreta: sem isso ela ocupa espaço e desalinha a linha.
    scrollbarWidth: "thin",
    "&::-webkit-scrollbar": { height: 6 },
    "&::-webkit-scrollbar-thumb": {
      backgroundColor: "rgba(0,0,0,0.18)",
      borderRadius: 3,
    },
  },
  compactFiltersRow: {
    display: "grid",
    gridTemplateColumns: "repeat(5, 1fr)",
    gap: 12,
    alignItems: "start",
    [theme.breakpoints.down("md")]: {
      gridTemplateColumns: "repeat(3, 1fr)",
      gap: 10,
    },
    [theme.breakpoints.down("sm")]: {
      gridTemplateColumns: "repeat(2, 1fr)",
      gap: 8,
    },
    [theme.breakpoints.down("xs")]: {
      gridTemplateColumns: "1fr 1fr",
      gap: 8,
    },
  },
  compactFilterItem: {
    minWidth: 0,
    [theme.breakpoints.down("xs")]: {
      "& .MuiOutlinedInput-root": {
        height: 36,
        fontSize: "0.78rem",
      },
    },
    "& .MuiAutocomplete-root": {
      width: "100%",
    },
    "& .MuiOutlinedInput-root": {
      height: 40,
      borderRadius: 10,
      fontSize: "0.82rem",
      backgroundColor: theme.palette.type === "dark" ? "rgba(255,255,255,0.03)" : "#fafbfc",
      transition: "all 0.2s ease",
      "&:hover": {
        backgroundColor: theme.palette.type === "dark" ? "rgba(255,255,255,0.06)" : "#f0f2f5",
      },
      "&.Mui-focused": {
        backgroundColor: theme.palette.type === "dark" ? "rgba(255,255,255,0.04)" : "#fff",
        boxShadow: `0 0 0 2px ${theme.palette.primary.main}33`,
      },
    },
    "& .MuiOutlinedInput-notchedOutline": {
      borderColor: theme.palette.type === "dark" ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.12)",
    },
    "& .MuiOutlinedInput-input": {
      padding: "9px 12px !important",
      fontSize: "0.82rem",
    },
    "& .MuiAutocomplete-inputRoot[class*='MuiOutlinedInput-root']": {
      padding: "2px 8px !important",
      height: 40,
    },
    "& .MuiAutocomplete-inputRoot[class*='MuiOutlinedInput-root'] .MuiAutocomplete-input": {
      padding: "4px 4px !important",
    },
    "& .MuiChip-root": {
      height: 22,
      margin: "1px 2px",
      borderRadius: 6,
    },
    // Rótulo em uma linha só, cortado com "..." quando não couber.
    //
    // Sem isto, "Digite para pesquisar o contato" quebrava em DUAS linhas
    // dentro da caixa e "Filtro por Conexão" passava por cima da setinha do
    // select. Reservar espaço à direita (calc) impede a sobreposição.
    "& .MuiInputLabel-outlined": {
      transform: "translate(14px, 12px) scale(1)",
      fontSize: "0.78rem",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
      maxWidth: "calc(100% - 34px)",
    },
    // Texto selecionado também não pode encostar na seta.
    "& .MuiSelect-select": {
      paddingRight: "26px !important",
      whiteSpace: "nowrap",
      overflow: "hidden",
      textOverflow: "ellipsis",
    },
    "& .MuiInputLabel-outlined.MuiInputLabel-shrink": {
      transform: "translate(14px, -6px) scale(0.75)",
    },
  },
  compactActionRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 12,
    flexWrap: "wrap",
    marginTop: 12,
    [theme.breakpoints.down("xs")]: {
      flexDirection: "column",
      alignItems: "stretch",
      gap: 8,
    },
  },
  compactDateGroup: {
    display: "flex",
    gap: 12,
    flexWrap: "wrap",
    alignItems: "center",
    flex: 1,
    [theme.breakpoints.down("xs")]: {
      flexDirection: "column",
      gap: 8,
      "& .MuiTextField-root": {
        width: "100%",
      },
    },
  },
  // Charts in a 2-column grid with the doughnut smaller
  chartsArea: {
    display: "grid",
    gridTemplateColumns: "280px 1fr 1fr",
    gap: theme.spacing(1.5),
    [theme.breakpoints.down("md")]: {
      gridTemplateColumns: "1fr 1fr",
    },
    [theme.breakpoints.down("sm")]: {
      gridTemplateColumns: "1fr",
    },
  },
  chartCard: {
    padding: theme.spacing(1.5),
    borderRadius: 14,
    backgroundColor: theme.palette.background.paper,
    border: `1px solid ${theme.palette.type === "dark" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}`,
    boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
  },
  chartHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  chartLabel: {
    fontSize: "0.75rem",
    fontWeight: 700,
    color: theme.palette.text.primary,
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  // Table area
  tableArea: {
    borderRadius: 14,
    backgroundColor: theme.palette.background.paper,
    border: `1px solid ${theme.palette.type === "dark" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}`,
    boxShadow: "0 1px 4px rgba(0,0,0,0.04)",
    overflow: "hidden",
    flex: 1,
    display: "flex",
    flexDirection: "column",
  },
  tableScroll: {
    overflow: "auto",
    flex: 1,
    maxHeight: "50vh",
    ...theme.scrollbarStylesSoftBig,
  },
  tableHeader: {
    backgroundColor: theme.palette.type === "dark" ? "#161b22" : "#f8fafc",
    position: "sticky",
    top: 0,
    zIndex: 2,
    "& th": {
      fontWeight: 700,
      fontSize: "0.65rem",
      textTransform: "uppercase",
      letterSpacing: "0.5px",
      color: theme.palette.text.secondary,
      borderBottom: `2px solid ${theme.palette.primary.main}`,
      padding: "10px 8px",
      whiteSpace: "nowrap",
    },
  },
  tableRow: {
    transition: "background-color 0.15s",
    "&:hover": {
      backgroundColor: theme.palette.type === "dark" ? "rgba(255,255,255,0.02)" : "rgba(59,130,246,0.03)",
    },
    "& td": {
      padding: "8px 8px",
      fontSize: "0.78rem",
      borderBottom: `1px solid ${theme.palette.type === "dark" ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)"}`,
    },
  },
  statusChip: {
    fontSize: "0.65rem",
    fontWeight: 600,
    height: 22,
    borderRadius: 6,
  },
  paginationBar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "10px 16px",
    borderTop: `1px solid ${theme.palette.type === "dark" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}`,
    gap: 12,
    flexWrap: "wrap",
    [theme.breakpoints.down("xs")]: {
      flexDirection: "column",
      padding: "8px 10px",
      gap: 8,
    },
  },
  paginationControls: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    flexShrink: 0,
    whiteSpace: "nowrap",
  },
  pageSizeLabel: {
    fontSize: "0.78rem",
    fontWeight: 600,
    color: theme.palette.text.secondary,
  },
  pageSizeSelect: {
    minWidth: 74,
    "& .MuiOutlinedInput-root": {
      height: 34,
      borderRadius: 10,
      backgroundColor: theme.palette.type === "dark" ? "rgba(255,255,255,0.02)" : "#fff",
    },
    "& .MuiSelect-select": {
      paddingTop: 8,
      paddingBottom: 8,
      fontSize: "0.8rem",
    },
  },
  headerRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    [theme.breakpoints.down("xs")]: {
      flexDirection: "column",
      alignItems: "flex-start",
      gap: 8,
    },
  },
  pageTitle: {
    fontSize: "1.2rem",
    fontWeight: 800,
    color: theme.palette.text.primary,
    display: "flex",
    alignItems: "center",
    gap: 8,
    [theme.breakpoints.down("xs")]: {
      fontSize: "1rem",
    },
  },
}));

const getStatusColor = (status) => {
  const s = (status || "").toUpperCase();
  switch (s) {
    case "ABERTO":
    case "OPEN": return { bg: "#DBEAFE", color: "#1D4ED8", label: i18n.t("reports.ticketDuration.open") };
    case "FECHADO":
    case "CLOSED": return { bg: "#D1FAE5", color: "#065F46", label: i18n.t("reports.ticketDuration.finished") };
    case "PENDENTE":
    case "PENDING": return { bg: "#FEF3C7", color: "#92400E", label: i18n.t("reports.ticketDuration.pending") };
    case "GRUPO":
    case "GROUP": return { bg: "#E0E7FF", color: "#3730A3", label: i18n.t("dashboard.cards.groups") };
    case "NPS": return { bg: "#FDE68A", color: "#78350F", label: "NPS" };
    case "LGPD": return { bg: "#FECDD3", color: "#9F1239", label: "LGPD" };
    default: return { bg: "#F3F4F6", color: "#374151", label: status };
  }
};

const Reports = () => {
  const classes = useStyles();
  const history = useHistory();
  const { getReport } = useDashboard();
  const { user } = useContext(AuthContext);

  const [loading, setLoading] = useState(false);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [searchParam, setSearchParam] = useState("");
  const [selectedContactId, setSelectedContactId] = useState(null);
  const [selectedWhatsapp, setSelectedWhatsapp] = useState([]);
  const [selectedStatus, setSelectedStatus] = useState([]);
  const [queueIds, setQueueIds] = useState([]);
  const [userIds, setUserIds] = useState([]);
  const [options, setOptions] = useState([]);
  const [dateFrom, setDateFrom] = useState(moment("1", "D").format("YYYY-MM-DD"));
  const [dateTo, setDateTo] = useState(moment().format("YYYY-MM-DD"));
  const [onlyRated, setOnlyRated] = useState(false);
  const [protocolSearch, setProtocolSearch] = useState("");
  const [sortBy, setSortBy] = useState(null); // 'protocol' | null
  const [sortOrder, setSortOrder] = useState("desc"); // 'asc' | 'desc'
  const [totalTickets, setTotalTickets] = useState(0);
  const [totalsByStatus, setTotalsByStatus] = useState({ open: 0, pending: 0, closed: 0, group: 0 });
  const [tickets, setTickets] = useState([]);
  const [chartTickets, setChartTickets] = useState([]);
  const [openTicketMessageDialog, setOpenTicketMessageDialog] = useState(false);
  const [ticketOpen, setTicketOpen] = useState(null);
  const [contactDrawerOpen, setContactDrawerOpen] = useState(false);
  const [drawerTicket, setDrawerTicket] = useState(null);
  const [drawerLoading, setDrawerLoading] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [showFilters, setShowFilters] = useState(true);
  const [showCharts, setShowCharts] = useState(true);

  const USERS_PER_PAGE = 6;
  const QUEUES_PER_PAGE = 6;
  const [userChartPage, setUserChartPage] = useState(0);
  const [queueChartPage, setQueueChartPage] = useState(0);

  // --- Data fetching (same logic) ---
  useEffect(() => {
    setLoading(true);
    const delayDebounceFn = setTimeout(() => {
      const fetchContacts = async () => {
        try {
          const { data } = await api.get("contacts", { params: { searchParam } });
          setOptions(data.contacts);
          setLoading(false);
        } catch (err) {
          setLoading(false);
          toastError(err);
        }
      };
      fetchContacts();
    }, 500);
    return () => clearTimeout(delayDebounceFn);
  }, [searchParam]);

  useEffect(() => {
    if (userIds !== undefined) handleFilter(1);
  }, [userIds, queueIds, selectedWhatsapp, selectedStatus, dateFrom, dateTo, onlyRated, sortBy, sortOrder]);

  const toggleProtocolSort = () => {
    if (sortBy !== "protocol") {
      setSortBy("protocol");
      setSortOrder("asc");
    } else if (sortOrder === "asc") {
      setSortOrder("desc");
    } else {
      // 3º clique: limpa ordenação e volta ao padrão (createdAt DESC)
      setSortBy(null);
      setSortOrder("desc");
    }
  };

  const openContactDrawerFromTicket = async (ticket) => {
    if (!ticket) return;
    setContactDrawerOpen(true);
    setDrawerLoading(true);
    try {
      const idOrUuid = ticket.uuid || ticket.id;
      const { data } = await api.get(`/tickets/u/${idOrUuid}`);
      setDrawerTicket(data);
    } catch (err) {
      toastError(err);
      setContactDrawerOpen(false);
    } finally {
      setDrawerLoading(false);
    }
  };

  const normalizeStatus = (s) => (s || "").toUpperCase();
  const openCount = totalsByStatus.open;
  const closedCount = totalsByStatus.closed;
  const pendingCount = totalsByStatus.pending;
  const groupCount = totalsByStatus.group;

  // Queue distribution
  const queueDistributionAll = useMemo(() => {
    const map = {};
    chartTickets.forEach(t => {
      const q = t.queueName || i18n.t("reportsExtra.noQueue");
      map[q] = (map[q] || 0) + 1;
    });
    const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]);
    return { labels: sorted.map(s => s[0]), data: sorted.map(s => s[1]) };
  }, [chartTickets]);

  const queueChartTotalPages = Math.max(1, Math.ceil(queueDistributionAll.labels.length / QUEUES_PER_PAGE));
  useEffect(() => { setQueueChartPage(0); }, [queueDistributionAll]);

  const queueDistribution = useMemo(() => {
    const start = queueChartPage * QUEUES_PER_PAGE;
    return {
      labels: queueDistributionAll.labels.slice(start, start + QUEUES_PER_PAGE),
      data: queueDistributionAll.data.slice(start, start + QUEUES_PER_PAGE),
    };
  }, [queueDistributionAll, queueChartPage]);

  // User distribution
  const userDistributionAll = useMemo(() => {
    const map = {};
    chartTickets.forEach(t => {
      const u = t.userName || i18n.t("reportsExtra.noUser");
      map[u] = (map[u] || 0) + 1;
    });
    const sorted = Object.entries(map).sort((a, b) => b[1] - a[1]);
    return { labels: sorted.map(s => s[0]), data: sorted.map(s => s[1]) };
  }, [chartTickets]);

  const userChartTotalPages = Math.max(1, Math.ceil(userDistributionAll.labels.length / USERS_PER_PAGE));
  useEffect(() => { setUserChartPage(0); }, [userDistributionAll]);

  const userDistribution = useMemo(() => {
    const start = userChartPage * USERS_PER_PAGE;
    return {
      labels: userDistributionAll.labels.slice(start, start + USERS_PER_PAGE),
      data: userDistributionAll.data.slice(start, start + USERS_PER_PAGE),
    };
  }, [userDistributionAll, userChartPage]);

  // Chart data
  const doughnutData = useMemo(() => ({
    labels: [
      i18n.t("reports.ticketDuration.open"),
      i18n.t("reports.ticketDuration.finished"),
      i18n.t("reports.ticketDuration.pending"),
      i18n.t("dashboard.cards.groups"),
    ],
    datasets: [{
      data: [openCount, closedCount, pendingCount, groupCount],
      backgroundColor: ["#3B82F6", "#10B981", "#F59E0B", "#6366F1"],
      borderWidth: 0,
      hoverOffset: 6,
    }],
  }), [openCount, closedCount, pendingCount, groupCount]);

  const barData = useMemo(() => ({
    labels: queueDistribution.labels,
    datasets: [{
      label: i18n.t("reportsExtra.ticketsByQueue"),
      data: queueDistribution.data,
      backgroundColor: "rgba(59,130,246,0.75)",
      borderRadius: 6,
      barThickness: 22,
    }],
  }), [queueDistribution]);

  const userBarData = useMemo(() => ({
    labels: userDistribution.labels,
    datasets: [{
      label: i18n.t("reportsExtra.ticketsByUser"),
      data: userDistribution.data,
      backgroundColor: userDistribution.data.map((_, i) => {
        const colors = ["rgba(139,92,246,0.8)", "rgba(59,130,246,0.8)", "rgba(16,185,129,0.8)", "rgba(245,158,11,0.8)", "rgba(239,68,68,0.8)", "rgba(20,184,166,0.8)"];
        return colors[i % colors.length];
      }),
      borderRadius: 6,
      barThickness: 22,
    }],
  }), [userDistribution]);

  // --- Export ---
  const exportarGridParaExcel = async () => {
    setLoading(true);
    try {
      const data = await getReport({
        searchParam, contactId: selectedContactId,
        whatsappId: JSON.stringify(selectedWhatsapp), users: JSON.stringify(userIds),
        queueIds: JSON.stringify(queueIds), status: JSON.stringify(selectedStatus),
        dateFrom, dateTo, page: 1, pageSize: 9999999, onlyRated: onlyRated ? "true" : "false",
        protocol: protocolSearch,
        sortBy: sortBy || undefined,
        sortOrder,
      });

      const ticketsData = data.tickets.map((ticket) => {
        const formatDate = (dateString) => {
          if (!dateString) return { date: "", time: "" };
          if (dateString.includes("/") && dateString.includes(" ")) {
            const [datePart, timePart] = dateString.split(" ");
            return { date: datePart, time: timePart };
          }
          const date = new Date(dateString);
          if (isNaN(date.getTime())) return { date: "", time: "" };
          return { date: date.toLocaleDateString("pt-BR"), time: date.toLocaleTimeString("pt-BR") };
        };
        const formatSupportTime = (timeString) => {
          if (!timeString) return "";
          if (timeString === "0") return "0min";
          const match = timeString.match(/(\d+)\s*d,?\s*(\d+)\s*hr?s?\s*e?\s*(\d+)\s*m/);
          if (!match) return timeString;
          const days = parseInt(match[1]), hours = parseInt(match[2]), minutes = parseInt(match[3]);
          let result = "";
          if (days > 0) result += `${days}d`;
          if (hours > 0) result += `${hours}h`;
          if (minutes > 0) result += `${minutes}min`;
          return result || "0min";
        };
        const createdAtFormatted = formatDate(ticket.createdAt);
        const closedAtFormatted = formatDate(ticket.closedAt);
        return {
          id: ticket.id, connection: ticket.whatsappName, contact: ticket.contactName,
          user: ticket.userName, queue: ticket.queueName, status: getStatusColor(ticket.status).label,
          lastMessage: ticket.lastMessage, openDate: createdAtFormatted.date,
          openTime: createdAtFormatted.time, closeDate: closedAtFormatted.date,
          closeTime: closedAtFormatted.time, supportTime: formatSupportTime(ticket.supportTime),
          nps: ticket.NPS || "", saleValue: ticket.valorVenda ?? "-",
          noSaleReason: ticket.motivoNaoVenda || "-",
          closedWithSale: ticket.finalizadoComVenda === true ? i18n.t("reports.yes") : ticket.finalizadoComVenda === false ? i18n.t("reports.no") : "-",
        };
      });

      const gt = (key, fb) => { const t = i18n.t(key); return t !== key ? t : fb; };
      const fmtD = (d) => { if (!d) return "N/A"; const [y, m, dy] = d.split("-"); return `${dy}/${m}/${y}`; };

      // FILTROS APLICADOS, DENTRO DA PLANILHA
      //
      // O cabeçalho só trazia as datas. Uma planilha com 40 linhas não diz se
      // veio de "todas as conexões" ou de uma fila específica — e quem recebe o
      // arquivo por e-mail dias depois não tem como saber. Passar a registrar
      // os filtros torna o arquivo autoexplicativo e conferível.
      const nomesDe = (lista, campoNome = "name") =>
        Array.isArray(lista) && lista.length > 0
          ? lista.map((i) => i?.[campoNome] ?? i?.label ?? i?.id ?? i).join(", ")
          : gt("reports.exportExcel.all", "Todos");

      const rotuloDeStatus = (lista) =>
        Array.isArray(lista) && lista.length > 0
          ? lista.map((s) => getStatusColor(s?.status ?? s).label).join(", ")
          : gt("reports.exportExcel.all", "Todos");

      const linhasDeFiltro = [
        [gt("reports.exportExcel.title", "Reports")],
        [`${gt("reports.exportExcel.startDate", "Start Date")}: ${fmtD(dateFrom)}`],
        [`${gt("reports.exportExcel.endDate", "End Date")}: ${fmtD(dateTo)}`],
        [`${gt("reports.exportExcel.filters", "Filtros aplicados")}:`],
        [`  ${gt("reports.exportExcel.columns.connection", "Conexão")}: ${nomesDe(selectedWhatsapp)}`],
        [`  ${gt("reports.exportExcel.columns.status", "Status")}: ${rotuloDeStatus(selectedStatus)}`],
        [`  ${gt("reports.exportExcel.columns.user", "Usuário")}: ${nomesDe(userIds)}`],
        [`  ${gt("reports.exportExcel.columns.queue", "Fila")}: ${
          Array.isArray(queueIds) && queueIds.length > 0
            ? queueIds.join(", ")
            : gt("reports.exportExcel.all", "Todos")
        }`],
        [`  ${gt("reports.protocol", "Protocolo")}: ${protocolSearch || gt("reports.exportExcel.all", "Todos")}`],
        [`  ${gt("reports.buttons.onlyRated", "Apenas avaliados")}: ${onlyRated ? gt("reports.yes", "Sim") : gt("reports.no", "Não")}`],
        [`  ${gt("reports.exportExcel.totalFound", "Registros no arquivo")}: ${ticketsData.length}`],
        [`  ${gt("reports.exportExcel.generatedAt", "Gerado em")}: ${moment().format("DD/MM/YYYY HH:mm")}`],
      ];

      const wb = XLSX.utils.book_new();
      const ws = XLSX.utils.aoa_to_sheet([
        ...linhasDeFiltro,
        [],
        [gt("reports.exportExcel.columns.id","ID"), gt("reports.exportExcel.columns.connection","Connection"), gt("reports.exportExcel.columns.contact","Contact"),
         gt("reports.exportExcel.columns.user","User"), gt("reports.exportExcel.columns.queue","Queue"), gt("reports.exportExcel.columns.status","Status"),
         gt("reports.exportExcel.columns.lastMessage","Last Message"), gt("reports.exportExcel.columns.openDate","Open Date"), gt("reports.exportExcel.columns.openTime","Open Time"),
         gt("reports.exportExcel.columns.closeDate","Close Date"), gt("reports.exportExcel.columns.closeTime","Close Time"), gt("reports.exportExcel.columns.supportTime","Support Time"),
         gt("reports.exportExcel.columns.nps","NPS"), gt("reports.saleValue","Sale Value"), gt("reports.noSaleReason","No Sale Reason"), gt("reports.closedWithSale","Closed with Sale")],
      ]);
      // A origem era "A6" fixa, calculada na mão para o cabeçalho antigo de 5
      // linhas. Como o cabeçalho passou a ser variável, deixar fixo faria os
      // dados sobrescreverem os filtros. Calculado a partir do próprio
      // cabeçalho: N linhas de filtro + 1 linha em branco + 1 de títulos.
      const primeiraLinhaDeDados = linhasDeFiltro.length + 3;
      XLSX.utils.sheet_add_json(ws, ticketsData, {
        origin: `A${primeiraLinhaDeDados}`,
        skipHeader: true
      });
      if (!ws["!merges"]) ws["!merges"] = [];
      ws["!merges"].push({ s: { c: 0, r: 0 }, e: { c: 12, r: 0 } });
      ws["!cols"] = [{ wch: 8 },{ wch: 15 },{ wch: 25 },{ wch: 20 },{ wch: 15 },{ wch: 12 },{ wch: 30 },{ wch: 12 },{ wch: 12 },{ wch: 12 },{ wch: 12 },{ wch: 18 },{ wch: 8 },{ wch: 15 },{ wch: 15 },{ wch: 15 }];
      XLSX.utils.book_append_sheet(wb, ws, "Report");
      XLSX.writeFile(wb, "report.xlsx", { cellStyles: true, bookType: "xlsx" });
      setPageNumber(pageNumber);
    } catch (error) {
      toastError(error);
    } finally {
      setLoading(false);
    }
  };

  const handleFilter = async (pageNumber) => {
    setLoading(true);
    try {
      const baseParams = {
        searchParam, contactId: selectedContactId,
        whatsappId: JSON.stringify(selectedWhatsapp), users: JSON.stringify(userIds),
        queueIds: JSON.stringify(queueIds), status: JSON.stringify(selectedStatus),
        dateFrom, dateTo, onlyRated: onlyRated ? "true" : "false",
        protocol: protocolSearch,
        sortBy: sortBy || undefined,
        sortOrder,
      };
      const [pagedData, chartData] = await Promise.all([
        getReport({ ...baseParams, page: pageNumber, pageSize }),
        getReport({ ...baseParams, page: 1, pageSize: 999999 }),
      ]);
      setTotalTickets(pagedData?.totalTickets?.total || pagedData?.tickets?.length || 0);
      setTotalsByStatus({
        open: parseInt(pagedData?.totalTickets?.totalOpen || 0),
        pending: parseInt(pagedData?.totalTickets?.totalPending || 0),
        closed: parseInt(pagedData?.totalTickets?.totalClosed || 0),
        group: parseInt(pagedData?.totalTickets?.totalGroup || 0),
      });
      setHasMore(pagedData.tickets.length === pageSize);
      setTickets(pagedData.tickets);
      setChartTickets(chartData.tickets);
      setPageNumber(pageNumber);
    } catch (error) {
      toastError(error);
    } finally {
      setLoading(false);
    }
  };

  const handleSelectedUsers = (selecteds) => setUserIds(selecteds.map(t => t.id));
  const handleSelectedWhatsapps = (selecteds) => setSelectedWhatsapp(selecteds.map(t => t.id));
  const handleSelectedStatus = (selecteds) => setSelectedStatus(selecteds.map(t => t.status));

  // Ícone de cada canal — antes os canais fora de Facebook/Instagram/WhatsApp
  // (WhatsApp Plus, Webchat, LinkedIn, TikTok…) apareciam como "error".
  const IconChannel = (channel) => iconeDoCanal(channel, { alinhar: true });

  const renderOption = (option) => {
    if (option.number) {
      return (
        <>
          {IconChannel(option.channel)}
          <Typography component="span" style={{ fontSize: 14, marginLeft: 10, display: "inline-flex", alignItems: "center", lineHeight: "2" }}>
            {option.name} - {option.number}
          </Typography>
        </>
      );
    }
    return `${i18n.t("newTicketModal.add")} ${option.name}`;
  };

  const handleSelectOption = (e, newValue) => { setSelectedContactId(newValue.id); setSearchParam(""); };
  const renderOptionLabel = (option) => option.number ? `${option.name} - ${option.number}` : `${option.name}`;
  const filter = createFilterOptions({ trim: true });
  const createAddContactOption = (filterOptions, params) => {
    const filtered = filter(filterOptions, params);
    if (params.inputValue !== "" && !loading && searchParam.length >= 3) filtered.push({ name: `${params.inputValue}` });
    return filtered;
  };

  if (user.showDashboard !== "enabled") return <ForbiddenPage />;

  const doughnutOptions = {
    responsive: true, maintainAspectRatio: false, cutout: "60%",
    plugins: {
      legend: { position: "bottom", labels: { padding: 10, usePointStyle: true, pointStyleWidth: 8, font: { size: 10 } } },
      datalabels: { color: "#fff", font: { weight: "bold", size: 12 }, formatter: (v) => v > 0 ? v : "" },
    },
  };

  const barOptions = {
    responsive: true, maintainAspectRatio: false, indexAxis: "y",
    plugins: {
      legend: { display: false },
      datalabels: { anchor: "end", align: "end", font: { weight: "bold", size: 11 }, color: "#555" },
    },
    scales: {
      x: { grid: { display: false }, ticks: { font: { size: 10 } } },
      y: { grid: { display: false }, ticks: { font: { size: 10 } } },
    },
  };

  const kpis = [
    { label: "Total", value: totalTickets || 0, color: "#3B82F6", icon: <Assessment style={{ color: "#fff", fontSize: 20 }} /> },
    { label: i18n.t("reports.ticketDuration.open"), value: openCount, color: "#0EA5E9", icon: <Schedule style={{ color: "#fff", fontSize: 20 }} /> },
    { label: i18n.t("reports.ticketDuration.finished"), value: closedCount, color: "#10B981", icon: <CheckCircle style={{ color: "#fff", fontSize: 20 }} /> },
    { label: i18n.t("reports.ticketDuration.pending"), value: pendingCount, color: "#F59E0B", icon: <HourglassEmpty style={{ color: "#fff", fontSize: 20 }} /> },
  ];

  const PaginationNav = ({ page, totalPages, onPrev, onNext }) => totalPages > 1 ? (
    <Box style={{ display: "flex", alignItems: "center", gap: 2 }}>
      <IconButton size="small" disabled={page === 0} onClick={onPrev} style={{ padding: 2 }}><span style={{ fontSize: 14 }}>◀</span></IconButton>
      <Typography variant="caption" style={{ color: "#888", minWidth: 32, textAlign: "center" }}>{page + 1}/{totalPages}</Typography>
      <IconButton size="small" disabled={page >= totalPages - 1} onClick={onNext} style={{ padding: 2 }}><span style={{ fontSize: 14 }}>▶</span></IconButton>
    </Box>
  ) : null;

  return (
    <>
    <MainContainer>
      <Box className={classes.root}>
        {openTicketMessageDialog && (
          <ShowTicketLogModal isOpen={openTicketMessageDialog} handleClose={() => setOpenTicketMessageDialog(false)} ticketId={ticketOpen.id} />
        )}

        {/* Header */}
        <Box className={classes.headerRow}>
          <Typography className={classes.pageTitle}>
            📊 {i18n.t("reports.title")}
          </Typography>
          <Box style={{ display: "flex", gap: 8 }}>
            <Tooltip title={i18n.t("reports.exportExcel.title")}>
              <IconButton onClick={exportarGridParaExcel} size="small" style={{ border: "1px solid rgba(0,0,0,0.1)", borderRadius: 10 }}>
                <SaveAlt fontSize="small" />
              </IconButton>
            </Tooltip>
          </Box>
        </Box>

        {/* KPI Cards */}
        <Box className={classes.topBar}>
          {kpis.map((kpi, i) => (
            <Box key={i} className={classes.kpiCard}>
              <Box className={classes.kpiIcon} style={{ backgroundColor: kpi.color }}>
                {kpi.icon}
              </Box>
              <Box>
                <Typography className={classes.kpiValue}>{kpi.value}</Typography>
                <Typography className={classes.kpiLabel}>{kpi.label}</Typography>
              </Box>
            </Box>
          ))}
        </Box>

        {/* Collapsible Filters */}
        <Box className={classes.filterSection}>
          <Box className={classes.filterToggle} onClick={() => setShowFilters(!showFilters)}>
            <Box style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <FilterList style={{ fontSize: 18, color: "#3B82F6" }} />
              <Typography style={{ fontSize: "0.8rem", fontWeight: 700 }}>Filtros</Typography>
            </Box>
            {showFilters ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
          </Box>
          <Collapse in={showFilters}>
            <Box className={classes.filterContent}>
              <Box className={classes.singleFilterRow}>
                <Box className={classes.compactFilterItem} style={{ flex: "1 1 150px", minWidth: 150 }}>
                  <Autocomplete
                    fullWidth options={options} loading={loading} clearOnBlur autoHighlight freeSolo size="small" clearOnEscape
                    getOptionLabel={renderOptionLabel} renderOption={renderOption} filterOptions={createAddContactOption}
                    onChange={(e, v) => handleSelectOption(e, v)}
                    renderInput={(params) => (
                      <TextField {...params} label={i18n.t("newTicketModal.fieldLabel")} variant="outlined" size="small"
                        onChange={(e) => setSearchParam(e.target.value)}
                        InputProps={{ ...params.InputProps, endAdornment: (<>{loading ? <CircularProgress color="inherit" size={18} /> : null}{params.InputProps.endAdornment}</>) }}
                      />
                    )}
                  />
                </Box>
                <Box className={classes.compactFilterItem} style={{ flex: "0 0 130px" }}><WhatsappsFilter onFiltered={handleSelectedWhatsapps} /></Box>
                <Box className={classes.compactFilterItem} style={{ flex: "0 0 120px" }}><StatusFilter onFiltered={handleSelectedStatus} /></Box>
                <Box className={classes.compactFilterItem} style={{ flex: "0 0 130px" }}><UsersFilter onFiltered={handleSelectedUsers} /></Box>
                <Box className={classes.compactFilterItem} style={{ flex: "0 0 110px" }}><QueueSelectCustom selectedQueueIds={queueIds} onChange={(values) => setQueueIds(values)} /></Box>
                <Box className={classes.compactFilterItem} style={{ flex: "0 0 132px" }}>
                  <TextField label={i18n.t("reports.startDate")} type="date" value={dateFrom} variant="outlined" size="small" onChange={(e) => setDateFrom(e.target.value)} InputLabelProps={{ shrink: true }} fullWidth />
                </Box>
                <Box className={classes.compactFilterItem} style={{ flex: "0 0 132px" }}>
                  <TextField label={i18n.t("reports.endDate")} type="date" value={dateTo} variant="outlined" size="small" onChange={(e) => setDateTo(e.target.value)} InputLabelProps={{ shrink: true }} fullWidth />
                </Box>
                <Box className={classes.compactFilterItem} style={{ flex: "0 0 155px" }}>
                  <TextField
                    label={i18n.t("reports.protocol", "Protocolo")}
                    placeholder={i18n.t("reports.protocolPlaceholder", "Ex.: 20260526000123")}
                    value={protocolSearch}
                    variant="outlined"
                    size="small"
                    onChange={(e) => setProtocolSearch(e.target.value.replace(/[^0-9]/g, ""))}
                    onKeyDown={(e) => { if (e.key === "Enter") handleFilter(1); }}
                    InputLabelProps={{ shrink: true }}
                    fullWidth
                  />
                </Box>
                <FormControlLabel
                  control={<Switch color="primary" checked={onlyRated} onChange={() => setOnlyRated(!onlyRated)} size="small" />}
                  label={<span style={{ fontSize: "0.72rem", fontWeight: 500 }}>{i18n.t("reports.buttons.onlyRated")}</span>}
                  style={{ margin: 0, whiteSpace: "nowrap", flex: "0 0 auto" }}
                />
                <Button variant="contained" color="primary" onClick={() => handleFilter(pageNumber)} size="small"
                  style={{ borderRadius: 10, textTransform: "none", fontWeight: 700, padding: "0 14px", minWidth: 100, height: 40, flex: "0 0 auto" }}>
                  {i18n.t("reports.buttons.filter")}
                </Button>
              </Box>
            </Box>
          </Collapse>
        </Box>

        {/* Charts - collapsible */}
        {tickets.length > 0 && (
          <>
            <Box style={{ display: "flex", alignItems: "center", gap: 8, cursor: "pointer" }} onClick={() => setShowCharts(!showCharts)}>
              <Typography style={{ fontSize: "0.8rem", fontWeight: 700, color: "#6366F1" }}>Gráficos</Typography>
              {showCharts ? <ExpandLess style={{ fontSize: 18 }} /> : <ExpandMore style={{ fontSize: 18 }} />}
            </Box>
            <Collapse in={showCharts}>
              <Box className={classes.chartsArea}>
                {/* Doughnut */}
                <Box className={classes.chartCard}>
                  <Typography className={classes.chartLabel}>
                    <PieChartIcon style={{ fontSize: 16, color: "#6366F1" }} />
                    {i18n.t("reportsExtra.statusDistribution")}
                  </Typography>
                  <Box style={{ height: 200, position: "relative" }}>
                    <Doughnut data={doughnutData} options={doughnutOptions} />
                  </Box>
                </Box>

                {/* Tickets por Fila */}
                <Box className={classes.chartCard}>
                  <Box className={classes.chartHeader}>
                    <Typography className={classes.chartLabel}>
                      <BarChartIcon style={{ fontSize: 16, color: "#3B82F6" }} />
                      {i18n.t("reportsExtra.ticketsByQueue")}
                    </Typography>
                    <PaginationNav page={queueChartPage} totalPages={queueChartTotalPages} onPrev={() => setQueueChartPage(p => p - 1)} onNext={() => setQueueChartPage(p => p + 1)} />
                  </Box>
                  <Box style={{ height: 200, position: "relative" }}>
                    {queueDistribution.labels.length > 0
                      ? <Bar data={barData} options={barOptions} />
                      : <Box style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#999", fontSize: "0.8rem" }}>{i18n.t("reportsExtra.noDataForChart")}</Box>
                    }
                  </Box>
                </Box>

                {/* Tickets por Usuário */}
                <Box className={classes.chartCard}>
                  <Box className={classes.chartHeader}>
                    <Typography className={classes.chartLabel}>
                      <PeopleIcon style={{ fontSize: 16, color: "#8B5CF6" }} />
                      {i18n.t("reportsExtra.ticketsByUser")}
                    </Typography>
                    <PaginationNav page={userChartPage} totalPages={userChartTotalPages} onPrev={() => setUserChartPage(p => p - 1)} onNext={() => setUserChartPage(p => p + 1)} />
                  </Box>
                  <Box style={{ height: 200, position: "relative" }}>
                    {userDistribution.labels.length > 0
                      ? <Bar data={userBarData} options={barOptions} />
                      : <Box style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#999", fontSize: "0.8rem" }}>{i18n.t("reportsExtra.noDataForChart")}</Box>
                    }
                  </Box>
                </Box>
              </Box>
            </Collapse>
          </>
        )}

        {/* Table */}
        <Box className={classes.tableArea}>
          <Box className={classes.tableScroll}>
            <Table size="small" stickyHeader>
              <TableHead className={classes.tableHeader}>
                <TableRow>
                  <TableCell align="center">{i18n.t("reports.table.id")}</TableCell>
                  <TableCell
                    align="center"
                    onClick={toggleProtocolSort}
                    style={{ cursor: "pointer", userSelect: "none", whiteSpace: "nowrap" }}
                    title={
                      sortBy === "protocol"
                        ? sortOrder === "asc"
                          ? "Ordenado crescente — clique para decrescente"
                          : "Ordenado decrescente — clique para limpar"
                        : "Clique para ordenar por protocolo"
                    }
                  >
                    <Box style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                      {i18n.t("reports.protocol", "Protocolo")}
                      {sortBy === "protocol" ? (
                        sortOrder === "asc"
                          ? <ArrowUpward style={{ fontSize: 14 }} />
                          : <ArrowDownward style={{ fontSize: 14 }} />
                      ) : (
                        <UnfoldMore style={{ fontSize: 14, opacity: 0.5 }} />
                      )}
                    </Box>
                  </TableCell>
                  <TableCell>{i18n.t("reports.table.whatsapp")}</TableCell>
                  <TableCell>{i18n.t("reports.table.contact")}</TableCell>
                  <TableCell>{i18n.t("reports.table.user")}</TableCell>
                  <TableCell>{i18n.t("reports.table.queue")}</TableCell>
                  <TableCell>{i18n.t("wallets.wallet")}</TableCell>
                  <TableCell align="center">{i18n.t("reports.table.status")}</TableCell>
                  <TableCell>{i18n.t("reports.table.lastMessage")}</TableCell>
                  <TableCell align="center">{i18n.t("reports.table.dateOpen")}</TableCell>
                  <TableCell align="center">{i18n.t("reports.table.dateClose")}</TableCell>
                  <TableCell align="center">{i18n.t("reports.table.supportTime")}</TableCell>
                  <TableCell align="center">{i18n.t("reports.table.NPS")}</TableCell>
                  <TableCell align="center">{i18n.t("reports.saleValue")}</TableCell>
                  <TableCell align="center">{i18n.t("reports.noSaleReason")}</TableCell>
                  <TableCell align="center">{i18n.t("reports.closedWithSale")}</TableCell>
                  <TableCell align="center">{i18n.t("reports.table.actions")}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {tickets.map((ticket) => {
                  const statusInfo = getStatusColor(ticket.status);
                  return (
                    <TableRow key={ticket.id} className={classes.tableRow}>
                      <TableCell align="center" style={{ fontWeight: 700, color: "#3B82F6" }}>#{ticket.id}</TableCell>
                      <TableCell align="center" style={{ fontFamily: "monospace", fontSize: "0.72rem", whiteSpace: "nowrap" }}>
                        <Box style={{ display: "inline-flex", alignItems: "center", gap: 4 }}>
                          <Tooltip title={i18n.t("reports.openContact", "Abrir ficha do contato")}>
                            <Box
                              component="span"
                              style={{ cursor: "pointer", color: "#3B82F6", textDecoration: "underline" }}
                              onClick={() => openContactDrawerFromTicket(ticket)}
                            >
                              {getTicketProtocol(ticket)}
                            </Box>
                          </Tooltip>
                          <Tooltip title={i18n.t("reports.copyProtocol", "Copiar protocolo")}>
                            <IconButton
                              size="small"
                              style={{ padding: 2 }}
                              onClick={(e) => {
                                e.stopPropagation();
                                try { navigator.clipboard.writeText(getTicketProtocol(ticket)); } catch (err) { /* noop */ }
                              }}
                            >
                              <FileCopyIcon style={{ fontSize: 12, opacity: 0.6 }} />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      </TableCell>
                      <TableCell>{ticket?.whatsappName}</TableCell>
                      <TableCell style={{ fontWeight: 600 }}>{ticket?.contactName}</TableCell>
                      <TableCell>{ticket?.userName}</TableCell>
                      <TableCell>
                        {ticket?.queueName && (
                          <Chip label={ticket.queueName} size="small" style={{ fontSize: "0.65rem", fontWeight: 600, height: 20, borderRadius: 5 }} />
                        )}
                      </TableCell>
                      <TableCell>{ticket?.walletName || "-"}</TableCell>
                      <TableCell align="center">
                        <Chip label={statusInfo.label} size="small" className={classes.statusChip} style={{ backgroundColor: statusInfo.bg, color: statusInfo.color }} />
                      </TableCell>
                      <TableCell style={{ maxWidth: 160, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {ticket?.lastMessage}
                      </TableCell>
                      <TableCell align="center" style={{ fontSize: "0.72rem", whiteSpace: "nowrap" }}>{ticket?.createdAt}</TableCell>
                      <TableCell align="center" style={{ fontSize: "0.72rem", whiteSpace: "nowrap" }}>{ticket?.closedAt}</TableCell>
                      <TableCell align="center">{ticket?.supportTime}</TableCell>
                      <TableCell align="center">
                        {ticket?.NPS && (
                          <Chip label={ticket.NPS} size="small" style={{
                            fontSize: "0.68rem", fontWeight: 700, height: 20, borderRadius: 5,
                            backgroundColor: ticket.NPS >= 9 ? "#D1FAE5" : ticket.NPS >= 7 ? "#FEF3C7" : "#FEE2E2",
                            color: ticket.NPS >= 9 ? "#065F46" : ticket.NPS >= 7 ? "#92400E" : "#991B1B",
                          }} />
                        )}
                      </TableCell>
                      <TableCell align="center">{ticket?.valorVenda ?? "-"}</TableCell>
                      <TableCell align="center">{ticket?.motivoNaoVenda || "-"}</TableCell>
                      <TableCell align="center">
                        {ticket?.finalizadoComVenda === true ? (
                          <Chip label={i18n.t("reports.yes")} size="small" style={{ fontSize: "0.65rem", fontWeight: 600, height: 20, borderRadius: 5, backgroundColor: "#D1FAE5", color: "#065F46" }} />
                        ) : ticket?.finalizadoComVenda === false ? (
                          <Chip label={i18n.t("reports.no")} size="small" style={{ fontSize: "0.65rem", fontWeight: 600, height: 20, borderRadius: 5, backgroundColor: "#FEE2E2", color: "#991B1B" }} />
                        ) : "-"}
                      </TableCell>
                      <TableCell align="center">
                        <Box style={{ display: "flex", justifyContent: "center", gap: 4 }}>
                          <Tooltip title={i18n.t("reports.ticketLogs")}>
                            <IconButton size="small" onClick={() => { setOpenTicketMessageDialog(true); setTicketOpen(ticket); }} style={{ borderRadius: 6, backgroundColor: "rgba(59,130,246,0.08)", padding: 4 }}>
                              <History style={{ fontSize: 16, color: blue[700] }} />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title={i18n.t("reports.accessTicket")}>
                            <IconButton size="small" onClick={() => history.push(`/tickets/${ticket.uuid}`)} style={{ borderRadius: 6, backgroundColor: "rgba(16,185,129,0.08)", padding: 4 }}>
                              <Forward style={{ fontSize: 16, color: green[700] }} />
                            </IconButton>
                          </Tooltip>
                        </Box>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {loading && <TableRowSkeleton avatar columns={3} />}
              </TableBody>
            </Table>
          </Box>

          {/* Pagination */}
          <Box className={classes.paginationBar}>
            <Pagination count={Math.ceil(totalTickets / pageSize)} page={pageNumber} onChange={(e, v) => handleFilter(v)} color="primary" shape="rounded" size="small" />
            <Box className={classes.paginationControls}>
              <Typography className={classes.pageSizeLabel}>Por página</Typography>
              <FormControl variant="outlined" size="small" className={classes.pageSizeSelect}>
                <Select
                  value={pageSize}
                  onChange={(e) => setPageSize(e.target.value)}
                  MenuProps={{ anchorOrigin: { vertical: "bottom", horizontal: "left" }, transformOrigin: { vertical: "top", horizontal: "left" }, getContentAnchorEl: null }}
                >
                  <MenuItem value={5}>5</MenuItem>
                  <MenuItem value={10}>10</MenuItem>
                  <MenuItem value={20}>20</MenuItem>
                  <MenuItem value={50}>50</MenuItem>
                </Select>
              </FormControl>
            </Box>
          </Box>
        </Box>
      </Box>
    </MainContainer>
      {contactDrawerOpen && (
        <React.Suspense fallback={null}>
          <ContactDrawer
            open={contactDrawerOpen}
            handleDrawerClose={() => { setContactDrawerOpen(false); setDrawerTicket(null); }}
            contact={drawerTicket?.contact || {}}
            ticket={drawerTicket || {}}
            loading={drawerLoading}
            onNotesCancel={() => { setContactDrawerOpen(false); setDrawerTicket(null); }}
          />
        </React.Suspense>
      )}
    </>
  );
};

export default Reports;
