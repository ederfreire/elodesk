import React, { useState, useEffect, useContext, useCallback, useRef, useMemo, lazy, Suspense } from "react";

import { makeStyles } from "@material-ui/core/styles";
import Paper from "@material-ui/core/Paper";
import Table from "@material-ui/core/Table";
import TableBody from "@material-ui/core/TableBody";
import TableCell from "@material-ui/core/TableCell";
import TableHead from "@material-ui/core/TableHead";
import TableRow from "@material-ui/core/TableRow";
import TextField from "@material-ui/core/TextField";
import MenuItem from "@material-ui/core/MenuItem";
import Select from "@material-ui/core/Select";
import FormControl from "@material-ui/core/FormControl";
import InputLabel from "@material-ui/core/InputLabel";
import IconButton from "@material-ui/core/IconButton";
import Chip from "@material-ui/core/Chip";
import Typography from "@material-ui/core/Typography";
import Tooltip from "@material-ui/core/Tooltip";
import PhoneIcon from "@material-ui/icons/Phone";
import RefreshIcon from "@material-ui/icons/Refresh";
import GetAppIcon from "@material-ui/icons/GetApp";
import CallMadeIcon from "@material-ui/icons/CallMade";
import CallReceivedIcon from "@material-ui/icons/CallReceived";
import CallMissedIcon from "@material-ui/icons/CallMissed";
import BlockIcon from "@material-ui/icons/Block";
import FilterListIcon from "@material-ui/icons/FilterList";
import { Box } from "@material-ui/core";

import { Bar, Doughnut } from "react-chartjs-2";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Tooltip as ChartTooltip,
  Legend,
} from "chart.js";
import ChartDataLabels from "chartjs-plugin-datalabels";
import api from "../../services/api";
import TableRowSkeleton from "../../components/TableRowSkeleton";
import toastError from "../../errors/toastError";
import { AuthContext } from "../../context/Auth/AuthContext";
import { i18n } from "../../translate/i18n";

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, ChartTooltip, Legend, ChartDataLabels);

const useStyles = makeStyles((theme) => ({
  root: {
    padding: theme.spacing(3),
    backgroundColor: "#f5f6fa",
    minHeight: "100vh",
    overflow: "auto",
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: theme.spacing(3),
  },
  headerTitle: {
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(1.5),
  },
  titleIcon: {
    backgroundColor: "#ede7f6",
    borderRadius: 12,
    padding: 8,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  headerActions: {
    display: "flex",
    gap: theme.spacing(1),
  },
  exportBtn: {
    border: "1px solid #e0e0e0",
    borderRadius: 8,
    padding: "6px 16px",
    display: "flex",
    alignItems: "center",
    gap: 6,
    backgroundColor: "white",
    cursor: "pointer",
    fontSize: 14,
    "&:hover": { backgroundColor: "#f5f5f5" },
  },
  refreshBtn: {
    border: "1px solid #e0e0e0",
    borderRadius: 8,
    backgroundColor: "white",
    "&:hover": { backgroundColor: "#f5f5f5" },
  },
  kpiRow: {
    display: "grid",
    gridTemplateColumns: "repeat(5, 1fr)",
    gap: theme.spacing(2),
    marginBottom: theme.spacing(3),
    [theme.breakpoints.down("md")]: {
      gridTemplateColumns: "repeat(3, 1fr)",
    },
    [theme.breakpoints.down("sm")]: {
      gridTemplateColumns: "repeat(2, 1fr)",
    },
  },
  kpiCard: {
    backgroundColor: "white",
    borderRadius: 12,
    padding: theme.spacing(2.5),
    border: "1px solid #e8eaf0",
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    transition: "box-shadow 0.2s",
    "&:hover": { boxShadow: "0 4px 12px rgba(0,0,0,0.08)" },
  },
  kpiLabel: {
    fontSize: 11,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    color: "#8e99a4",
    marginBottom: 4,
  },
  kpiValue: {
    fontSize: 32,
    fontWeight: 700,
    color: "#1a1a2e",
    lineHeight: 1,
  },
  kpiIconWrap: {
    width: 44,
    height: 44,
    borderRadius: 12,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  chartsRow: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: theme.spacing(2),
    marginBottom: theme.spacing(3),
    [theme.breakpoints.down("md")]: {
      gridTemplateColumns: "1fr",
    },
  },
  chartCard: {
    backgroundColor: "white",
    borderRadius: 12,
    border: "1px solid #e8eaf0",
    padding: theme.spacing(2.5),
  },
  chartTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: "#1a1a2e",
    marginBottom: theme.spacing(2),
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  chartTitleBar: {
    width: 4,
    height: 18,
    borderRadius: 2,
  },
  filterRow: {
    backgroundColor: "white",
    borderRadius: 12,
    border: "1px solid #e8eaf0",
    padding: theme.spacing(1.5, 2),
    marginBottom: theme.spacing(2),
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(2),
    flexWrap: "wrap",
  },
  filterIcon: {
    color: "#8e99a4",
  },
  filterField: {
    minWidth: 140,
  },
  tableCard: {
    backgroundColor: "white",
    borderRadius: 12,
    border: "1px solid #e8eaf0",
    overflow: "hidden",
  },
  tableHead: {
    backgroundColor: "#f8f9fc",
  },
  tableHeadCell: {
    fontWeight: 700,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    color: "#8e99a4",
    borderBottom: "1px solid #e8eaf0",
    padding: "12px 16px",
  },
  tableCell: {
    padding: "12px 16px",
    fontSize: 13,
    color: "#3a3a4e",
    borderBottom: "1px solid #f0f1f5",
  },
  phoneLink: {
    color: "#7c4dff",
    textDecoration: "none",
    fontWeight: 500,
    "&:hover": { textDecoration: "underline" },
  },
  statusChipConcluida: {
    backgroundColor: "#e8f5e9",
    color: "#2e7d32",
    fontWeight: 600,
    fontSize: 12,
  },
  statusChipRejeitada: {
    backgroundColor: "#ffebee",
    color: "#c62828",
    fontWeight: 600,
    fontSize: 12,
  },
  statusChipPerdida: {
    backgroundColor: "#fff3e0",
    color: "#e65100",
    fontWeight: 600,
    fontSize: 12,
  },
  statusChipPending: {
    backgroundColor: "#e3f2fd",
    color: "#1565c0",
    fontWeight: 600,
    fontSize: 12,
  },
  providerChip: {
    backgroundColor: "#ede7f6",
    color: "#5e35b1",
    fontWeight: 600,
    fontSize: 12,
  },
  doughnutCenter: {
    position: "relative",
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
  },
}));

const ITEMS_PER_PAGE = 20;

const CallHistoricals = () => {
  const classes = useStyles();
  const [loading, setLoading] = useState(false);
  const [allCalls, setAllCalls] = useState([]);
  const [dateStart, setDateStart] = useState("");
  const [dateEnd, setDateEnd] = useState("");
  const [filterProvider, setFilterProvider] = useState("");
  const [filterAtendente, setFilterAtendente] = useState("");
  const [filterStatus, setFilterStatus] = useState("");
  const [currentPage, setCurrentPage] = useState(1);
  const { user, socket } = useContext(AuthContext);

  const fetchCallHistory = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/call/historical", { params: { showAll: "true" } });
      const calls = data.historical?.resultFinal || [];
      setAllCalls(calls);
    } catch (err) {
      toastError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchCallHistory();
  }, [fetchCallHistory]);

  useEffect(() => {
    const companyId = user.companyId;
    const onCallHistoryEvent = (data) => {
      if (data.action === "update" || data.action === "create") {
        fetchCallHistory();
      }
    };
    if (socket) {
      socket.on(`company-${companyId}-call-history`, onCallHistoryEvent);
    }
    return () => {
      if (socket) socket.off(`company-${companyId}-call-history`, onCallHistoryEvent);
    };
  }, [socket, user.companyId, fetchCallHistory]);

  // Reset page when filters change
  useEffect(() => { setCurrentPage(1); }, [dateStart, dateEnd, filterProvider, filterAtendente, filterStatus]);

  // ✅ Memoize filtered data to avoid recalculating on every render
  const filtered = useMemo(() => {
    return allCalls.filter((call) => {
      const dt = new Date(call.createdAt);
      if (dateStart && dt < new Date(dateStart + "T00:00:00")) return false;
      if (dateEnd && dt > new Date(dateEnd + "T23:59:59")) return false;
      if (filterProvider && (call.whatsappName || "N/A") !== filterProvider) return false;
      if (filterAtendente && (call.user?.name || "Sistema") !== filterAtendente) return false;
      if (filterStatus) {
        const s = getStatusKey(call);
        if (s !== filterStatus) return false;
      }
      return true;
    });
  }, [allCalls, dateStart, dateEnd, filterProvider, filterAtendente, filterStatus]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / ITEMS_PER_PAGE));
  const paginatedCalls = useMemo(() => 
    filtered.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE),
    [filtered, currentPage]
  );

  function getStatusKey(call) {
    const status = (call.status || "").toUpperCase();
    const duration = call.duration || 0;
    if (["COMPLETED", "ANSWERED", "ACCEPTED"].includes(status)) return i18n.t("callReport.completed");
    if (status === "ENDED" && duration > 0) return i18n.t("callReport.completed");
    if (duration > 0) return i18n.t("callReport.completed");
    if (["REJECTED", "DECLINED", "FAILED", "BUSY"].includes(status)) return i18n.t("callReport.rejected");
    if (["NO_ANSWER", "MISSED", "TIMEOUT", "CANCELLED", "CANCELED"].includes(status)) return i18n.t("callReport.notAnswered");
    if (status === "ENDED") return i18n.t("callReport.notAnswered");
    return i18n.t("callReport.pending");
  }

  // ✅ Memoize stats
  const stats = useMemo(() => {
    const rejectedLabel = i18n.t("callReport.rejected");
    const notAnsweredLabel = i18n.t("callReport.notAnswered");

    return {
      total: filtered.length,
      realizadas: filtered.filter((c) => (c.direction || "").toUpperCase() === "OUTGOING").length,
      recebidas: filtered.filter((c) => (c.direction || "").toUpperCase() === "INCOMING").length,
      naoAtendidas: filtered.filter((c) => getStatusKey(c) === notAnsweredLabel).length,
      rejeitadas: filtered.filter((c) => getStatusKey(c) === rejectedLabel).length,
    };
  }, [filtered]);

  // ✅ Memoize unique filter options
  const providers = useMemo(() => [...new Set(allCalls.map((c) => c.whatsappName || "N/A"))], [allCalls]);
  const atendentes = useMemo(() => [...new Set(allCalls.map((c) => c.user?.name || "Sistema"))], [allCalls]);
  const statusOptions = [i18n.t("callReport.completed"), i18n.t("callReport.rejected"), i18n.t("callReport.notAnswered"), i18n.t("callReport.pending")];

  // ✅ Memoize chart data
  const { hourLabels, hourData } = useMemo(() => {
    const hourCounts = new Array(24).fill(0);
    filtered.forEach((c) => {
      const h = new Date(c.createdAt).getHours();
      if (h >= 0 && h < 24) hourCounts[h]++;
    });
    return {
      // 24 faixas de 1 hora — antes agrupava de 3 em 3 e só mostrava 8 barras,
      // então "ligações por hora" nunca refletia a hora real da chamada.
      hourLabels: Array.from({ length: 24 }, (_, i) => `${String(i).padStart(2, "0")}h`),
      hourData: hourCounts
    };
  }, [filtered]);

  const { dayLabels, dayCounts } = useMemo(() => {
    const counts = new Array(7).fill(0);
    filtered.forEach((c) => {
      const d = new Date(c.createdAt).getDay();
      counts[d]++;
    });
    return {
      dayLabels: [i18n.t("callReport.sun"), i18n.t("callReport.mon"), i18n.t("callReport.tue"), i18n.t("callReport.wed"), i18n.t("callReport.thu"), i18n.t("callReport.fri"), i18n.t("callReport.sat")],
      dayCounts: counts
    };
  }, [filtered]);

  const { statusCounts, avgDuration } = useMemo(() => {
    const counts = {};
    filtered.forEach((c) => {
      const key = getStatusKey(c);
      counts[key] = (counts[key] || 0) + 1;
    });
    const withDuration = filtered.filter((c) => c.duration > 0);
    let avg = "0:00";
    if (withDuration.length) {
      const a = withDuration.reduce((a, c) => a + c.duration, 0) / withDuration.length;
      const m = Math.floor(a / 60);
      const s = Math.round(a % 60);
      avg = `${m}:${String(s).padStart(2, "0")}`;
    }
    return { statusCounts: counts, avgDuration: avg };
  }, [filtered]);

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    return date.toLocaleDateString("pt-BR") + ", " + date.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  };

  const formatPhone = (phone) => {
    if (!phone) return "-";
    return phone.replace(/@.*/, "");
  };

  const exportCSV = () => {
    const header = `${i18n.t("callReport.dateTime")},${i18n.t("callReport.phone")},${i18n.t("callReport.contact")},${i18n.t("callReport.attendant")},${i18n.t("callReport.connection")},${i18n.t("callReport.status")},${i18n.t("callReport.duration")}\n`;
    const rows = filtered.map((c) => {
      const dt = formatDate(c.createdAt);
      const phone = formatPhone(c.phone_to);
      const contato = (c.name || phone).replace(/,/g, " ");
      const atendente = c.user?.name || i18n.t("callReport.system");
      const conexao = c.whatsappName || "N/A";
      const status = getStatusKey(c);
      const dur = c.duration ? `${Math.floor(c.duration / 60)}:${String(c.duration % 60).padStart(2, "0")}` : "—";
      return `${dt},${phone},${contato},${atendente},${conexao},${status},${dur}`;
    }).join("\n");
    const blob = new Blob([header + rows], { type: "text/csv;charset=utf-8;" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = "relatorio_chamadas.csv";
    link.click();
  };

  const barOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: false },
      datalabels: { display: false },
    },
    scales: {
      x: { grid: { display: false }, ticks: { color: "#aab2bd", font: { size: 11 } } },
      y: { grid: { color: "#f0f1f5" }, ticks: { color: "#aab2bd", font: { size: 11 }, stepSize: 2 } },
    },
  };

  const doughnutStatusLabels = Object.keys(statusCounts);
  const doughnutStatusValues = Object.values(statusCounts);
  const doughnutColors = doughnutStatusLabels.map((s) => {
    if (s === i18n.t("callReport.completed")) return "#7c4dff";
    if (s === i18n.t("callReport.rejected")) return "#f44336";
    if (s === i18n.t("callReport.notAnswered")) return "#ff9800";
    return "#26c6da";
  });

  return (
    <div className={classes.root}>
      {/* Header */}
      <div className={classes.header}>
        <div className={classes.headerTitle}>
          <div className={classes.titleIcon}>
            <PhoneIcon style={{ color: "#7c4dff", fontSize: 28 }} />
          </div>
          <div>
            <Typography variant="h5" style={{ fontWeight: 700, color: "#1a1a2e" }}>
              {i18n.t("callReport.title")}
            </Typography>
            <Typography variant="body2" style={{ color: "#8e99a4" }}>
              {i18n.t("callReport.subtitle")}
            </Typography>
          </div>
        </div>
        <div className={classes.headerActions}>
          <IconButton className={classes.refreshBtn} onClick={fetchCallHistory} size="small">
            <RefreshIcon />
          </IconButton>
          <button className={classes.exportBtn} onClick={exportCSV}>
            <GetAppIcon fontSize="small" /> {i18n.t("callReport.exportCsv")}
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className={classes.kpiRow}>
        <div className={classes.kpiCard}>
          <div>
            <div className={classes.kpiLabel}>{i18n.t("callReport.totalCalls")}</div>
            <div className={classes.kpiValue}>{stats.total}</div>
          </div>
          <div className={classes.kpiIconWrap} style={{ backgroundColor: "#ede7f6" }}>
            <PhoneIcon style={{ color: "#7c4dff" }} />
          </div>
        </div>
        <div className={classes.kpiCard}>
          <div>
            <div className={classes.kpiLabel}>{i18n.t("callReport.made")}</div>
            <div className={classes.kpiValue}>{stats.realizadas}</div>
          </div>
          <div className={classes.kpiIconWrap} style={{ backgroundColor: "#e8f5e9" }}>
            <CallMadeIcon style={{ color: "#4caf50" }} />
          </div>
        </div>
        <div className={classes.kpiCard}>
          <div>
            <div className={classes.kpiLabel}>{i18n.t("callReport.received")}</div>
            <div className={classes.kpiValue}>{stats.recebidas}</div>
          </div>
          <div className={classes.kpiIconWrap} style={{ backgroundColor: "#e3f2fd" }}>
            <CallReceivedIcon style={{ color: "#1976d2" }} />
          </div>
        </div>
        <div className={classes.kpiCard}>
          <div>
            <div className={classes.kpiLabel}>{i18n.t("callReport.notAnswered")}</div>
            <div className={classes.kpiValue}>{stats.naoAtendidas}</div>
          </div>
          <div className={classes.kpiIconWrap} style={{ backgroundColor: "#fff3e0" }}>
            <CallMissedIcon style={{ color: "#fb8c00" }} />
          </div>
        </div>
        <div className={classes.kpiCard}>
          <div>
            <div className={classes.kpiLabel}>{i18n.t("callReport.rejected")}</div>
            <div className={classes.kpiValue}>{stats.rejeitadas}</div>
          </div>
          <div className={classes.kpiIconWrap} style={{ backgroundColor: "#fce4ec" }}>
            <BlockIcon style={{ color: "#e53935" }} />
          </div>
        </div>
      </div>

      {/* Charts */}
      <div className={classes.chartsRow}>
        <div className={classes.chartCard}>
          <div className={classes.chartTitle}>
            <span className={classes.chartTitleBar} style={{ backgroundColor: "#7c4dff" }} />
            {i18n.t("callReport.callsByHour")}
          </div>
          <div style={{ height: 200 }}>
            <Bar
              data={{
                labels: hourLabels,
                datasets: [{
                  data: hourData,
                  backgroundColor: "#7c4dff",
                  borderRadius: 4,
                  barThickness: 16,
                }],
              }}
              options={barOptions}
            />
          </div>
        </div>
        <div className={classes.chartCard}>
          <div className={classes.chartTitle}>
            <span className={classes.chartTitleBar} style={{ backgroundColor: "#7c4dff" }} />
            {i18n.t("callReport.callsByDay")}
          </div>
          <div style={{ height: 200 }}>
            <Bar
              data={{
                labels: dayLabels,
                datasets: [{
                  data: dayCounts,
                  backgroundColor: "#7c4dff",
                  borderRadius: 4,
                  barThickness: 20,
                }],
              }}
              options={barOptions}
            />
          </div>
        </div>
        <div className={classes.chartCard}>
          <div className={classes.chartTitle}>
            <span className={classes.chartTitleBar} style={{ backgroundColor: "#f44336" }} />
            {i18n.t("callReport.callStatus")}
          </div>
          <div className={classes.doughnutCenter} style={{ height: 200 }}>
            <Doughnut
              data={{
                labels: doughnutStatusLabels,
                datasets: [{
                  data: doughnutStatusValues,
                  backgroundColor: doughnutColors,
                  borderWidth: 0,
                  cutout: "70%",
                }],
              }}
              options={{
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                  legend: { position: "bottom", labels: { boxWidth: 12, padding: 12, font: { size: 11 } } },
                  datalabels: { display: false },
                },
              }}
            />
            <div style={{
              position: "absolute",
              top: "42%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              textAlign: "center",
            }}>
              <div style={{ fontSize: 11, color: "#8e99a4" }}>{i18n.t("callReport.average")}</div>
              <div style={{ fontSize: 20, fontWeight: 700, color: "#1a1a2e" }}>{avgDuration}</div>
            </div>
          </div>
        </div>
      </div>

      {/* Filters */}
      <div className={classes.filterRow}>
        <FilterListIcon className={classes.filterIcon} />
        <TextField
          className={classes.filterField}
          label={i18n.t("callReport.dateStart")}
          type="date"
          size="small"
          variant="outlined"
          value={dateStart}
          onChange={(e) => setDateStart(e.target.value)}
          InputLabelProps={{ shrink: true }}
        />
        <TextField
          className={classes.filterField}
          label={i18n.t("callReport.dateEnd")}
          type="date"
          size="small"
          variant="outlined"
          value={dateEnd}
          onChange={(e) => setDateEnd(e.target.value)}
          InputLabelProps={{ shrink: true }}
        />
        <FormControl variant="outlined" size="small" className={classes.filterField}>
          <InputLabel>{i18n.t("callReport.provider")}</InputLabel>
          <Select value={filterProvider} onChange={(e) => setFilterProvider(e.target.value)} label={i18n.t("callReport.provider")}>
            <MenuItem value="">{i18n.t("callReport.all")}</MenuItem>
            {providers.map((p) => <MenuItem key={p} value={p}>{p}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl variant="outlined" size="small" className={classes.filterField}>
          <InputLabel>{i18n.t("callReport.attendant")}</InputLabel>
          <Select value={filterAtendente} onChange={(e) => setFilterAtendente(e.target.value)} label={i18n.t("callReport.attendant")}>
            <MenuItem value="">{i18n.t("callReport.all")}</MenuItem>
            {atendentes.map((a) => <MenuItem key={a} value={a}>{a}</MenuItem>)}
          </Select>
        </FormControl>
        <FormControl variant="outlined" size="small" className={classes.filterField}>
          <InputLabel>{i18n.t("callReport.status")}</InputLabel>
          <Select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} label={i18n.t("callReport.status")}>
            <MenuItem value="">{i18n.t("callReport.all")}</MenuItem>
            {statusOptions.map((s) => <MenuItem key={s} value={s}>{s}</MenuItem>)}
          </Select>
        </FormControl>
      </div>

      {/* Table */}
      <div className={classes.tableCard}>
        <Table size="small">
          <TableHead className={classes.tableHead}>
            <TableRow>
              <TableCell className={classes.tableHeadCell}>{i18n.t("callReport.dateTime")}</TableCell>
              <TableCell className={classes.tableHeadCell}>{i18n.t("callReport.phone")}</TableCell>
              <TableCell className={classes.tableHeadCell}>{i18n.t("callReport.contact")}</TableCell>
              <TableCell className={classes.tableHeadCell}>{i18n.t("callReport.attendant")}</TableCell>
              <TableCell className={classes.tableHeadCell}>{i18n.t("callReport.provider")}</TableCell>
              <TableCell className={classes.tableHeadCell}>{i18n.t("callReport.status")}</TableCell>
              <TableCell className={classes.tableHeadCell}>{i18n.t("callReport.duration")}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {loading && <TableRowSkeleton columns={7} />}
            {!loading && filtered.length === 0 && (
              <TableRow>
                <TableCell colSpan={7} align="center" className={classes.tableCell}>
                  {i18n.t("callReport.noRecords")}
                </TableCell>
              </TableRow>
            )}
            {!loading && paginatedCalls.map((call, idx) => {
              const statusKey = getStatusKey(call);
              const statusClass =
                statusKey === i18n.t("callReport.completed") ? classes.statusChipConcluida :
                statusKey === i18n.t("callReport.rejected") ? classes.statusChipRejeitada :
                statusKey === i18n.t("callReport.notAnswered") ? classes.statusChipPerdida :
                classes.statusChipPending;

              return (
                <TableRow key={call.id || idx} hover>
                  <TableCell className={classes.tableCell}>
                    {formatDate(call.createdAt)}
                  </TableCell>
                  <TableCell className={classes.tableCell}>
                    <span className={classes.phoneLink}>{formatPhone(call.phone_to)}</span>
                  </TableCell>
                  <TableCell className={classes.tableCell}>
                    {call.name || formatPhone(call.phone_to)}
                  </TableCell>
                  <TableCell className={classes.tableCell}>
                    {call.user?.name || i18n.t("callReport.system")}
                  </TableCell>
                  <TableCell className={classes.tableCell}>
                    <Chip label={call.whatsappName || "N/A"} size="small" className={classes.providerChip} />
                  </TableCell>
                  <TableCell className={classes.tableCell}>
                    <Chip label={statusKey} size="small" className={statusClass} />
                  </TableCell>
                  <TableCell className={classes.tableCell}>
                    {call.duration
                      ? `${Math.floor(call.duration / 60)}:${String(call.duration % 60).padStart(2, "0")}`
                      : "—"}
                  </TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>

        {/* Pagination */}
        <Box display="flex" justifyContent="space-between" alignItems="center" px={2} py={1.5} style={{ borderTop: "1px solid #e8eaf0" }}>
          <Typography variant="body2" style={{ color: "#8e99a4", fontSize: 13 }}>
            {i18n.t("callReport.showing")} {filtered.length === 0 ? 0 : (currentPage - 1) * ITEMS_PER_PAGE + 1}–{Math.min(currentPage * ITEMS_PER_PAGE, filtered.length)} {i18n.t("callReport.of")} {filtered.length}
          </Typography>
          <Box display="flex" alignItems="center" style={{ gap: 4 }}>
            <IconButton
              size="small"
              disabled={currentPage <= 1}
              onClick={() => setCurrentPage((p) => p - 1)}
              style={{ borderRadius: 8, border: "1px solid #e0e0e0", width: 32, height: 32 }}
            >
              <span style={{ fontSize: 16 }}>‹</span>
            </IconButton>
            {Array.from({ length: Math.min(totalPages, 7) }, (_, i) => {
              let page;
              if (totalPages <= 7) {
                page = i + 1;
              } else if (currentPage <= 4) {
                page = i + 1;
              } else if (currentPage >= totalPages - 3) {
                page = totalPages - 6 + i;
              } else {
                page = currentPage - 3 + i;
              }
              return (
                <IconButton
                  key={page}
                  size="small"
                  onClick={() => setCurrentPage(page)}
                  style={{
                    borderRadius: 8,
                    width: 32,
                    height: 32,
                    backgroundColor: page === currentPage ? "#7c4dff" : "transparent",
                    color: page === currentPage ? "white" : "#3a3a4e",
                    fontWeight: page === currentPage ? 700 : 400,
                    fontSize: 13,
                    border: page === currentPage ? "none" : "1px solid #e0e0e0",
                  }}
                >
                  {page}
                </IconButton>
              );
            })}
            <IconButton
              size="small"
              disabled={currentPage >= totalPages}
              onClick={() => setCurrentPage((p) => p + 1)}
              style={{ borderRadius: 8, border: "1px solid #e0e0e0", width: 32, height: 32 }}
            >
              <span style={{ fontSize: 16 }}>›</span>
            </IconButton>
          </Box>
        </Box>
      </div>
    </div>
  );
};

export default CallHistoricals;
