import React, { useState, useEffect, useContext } from "react";
import {
  makeStyles,
  useTheme,
} from "@material-ui/core/styles";
import {
  Box,
  Button,
  Grid,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableContainer,
  TableHead,
  TableRow,
  TextField,
  Typography,
  LinearProgress,
  Chip,
  IconButton,
  TableSortLabel,
} from "@material-ui/core";
import SaveAlt from "@material-ui/icons/SaveAlt";
import AccessAlarm from "@material-ui/icons/AccessAlarm";
import Timer from "@material-ui/icons/Timer";
import Star from "@material-ui/icons/Star";
import TrendingUp from "@material-ui/icons/TrendingUp";
import People from "@material-ui/icons/People";
import Assessment from "@material-ui/icons/Assessment";
import FilterList from "@material-ui/icons/FilterList";
import { Rating } from "@material-ui/lab";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  BarElement,
  ArcElement,
  Title,
  Tooltip,
  Legend,
} from "chart.js";
import { Bar, Doughnut } from "react-chartjs-2";
import ChartDataLabels from "chartjs-plugin-datalabels";
import * as XLSX from "xlsx";
import format from "date-fns/format";
import subDays from "date-fns/subDays";
import moment from "moment";

import MainContainer from "../../components/MainContainer";
import { i18n } from "../../translate/i18n";
import { AuthContext } from "../../context/Auth/AuthContext";
import api from "../../services/api";
import { toast } from "react-toastify";
import ForbiddenPage from "../../components/ForbiddenPage";

ChartJS.register(CategoryScale, LinearScale, BarElement, ArcElement, Title, Tooltip, Legend, ChartDataLabels);

const useStyles = makeStyles((theme) => ({
  mainPaper: {
    flex: 1,
    overflowY: "auto",
    overflowX: "hidden",
    ...theme.scrollbarStyles,
    backgroundColor: theme.palette.mode === "dark" ? "#0d1117" : "#f0f2f5",
    borderRadius: 10,
    border: "none !important",
  },
  card: {
    padding: theme.spacing(2.5),
    borderRadius: 16,
    backgroundColor: theme.palette.mode === "dark" ? "#161b22" : theme.palette.background.paper,
    border: `1px solid ${theme.palette.mode === "dark" ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.06)"}`,
    boxShadow: theme.palette.mode === "dark"
      ? "0 2px 8px rgba(0,0,0,0.5)"
      : "0 2px 12px rgba(0,0,0,0.06)",
    position: "relative",
    overflow: "hidden",
  },
  summaryCard: {
    padding: theme.spacing(2),
    borderRadius: 16,
    backgroundColor: theme.palette.mode === "dark" ? "#161b22" : theme.palette.background.paper,
    border: `1px solid ${theme.palette.mode === "dark" ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.06)"}`,
    boxShadow: theme.palette.mode === "dark"
      ? "0 2px 8px rgba(0,0,0,0.5)"
      : "0 2px 12px rgba(0,0,0,0.06)",
    textAlign: "center",
    position: "relative",
    overflow: "hidden",
    transition: "transform 0.2s",
    "&:hover": { transform: "translateY(-2px)" },
  },
  accent: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    height: 3,
    borderRadius: "16px 16px 0 0",
  },
  iconBox: {
    width: 44,
    height: 44,
    borderRadius: 12,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    margin: "0 auto",
    marginBottom: theme.spacing(1),
  },
  summaryValue: {
    fontSize: "1.6rem",
    fontWeight: 800,
    lineHeight: 1.2,
    color: theme.palette.text.primary,
    fontFamily: "'Plus Jakarta Sans', sans-serif",
  },
  summaryLabel: {
    fontSize: "0.7rem",
    fontWeight: 600,
    color: theme.palette.text.secondary,
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    marginTop: 4,
  },
  tableContainer: {
    borderRadius: 16,
    overflow: "hidden",
    backgroundColor: theme.palette.mode === "dark" ? "#161b22" : theme.palette.background.paper,
    border: `1px solid ${theme.palette.mode === "dark" ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.06)"}`,
    boxShadow: theme.palette.mode === "dark"
      ? "0 2px 8px rgba(0,0,0,0.5)"
      : "0 2px 12px rgba(0,0,0,0.06)",
  },
  tableHeader: {
    backgroundColor: theme.palette.mode === "dark" ? "#0d1117" : "#f8fafc",
    "& th": {
      fontWeight: 700,
      fontSize: "0.75rem",
      textTransform: "uppercase",
      letterSpacing: "0.5px",
      color: theme.palette.text.secondary,
      borderBottom: `2px solid ${theme.palette.divider}`,
      padding: "12px 16px",
    },
  },
  tableRow: {
    transition: "background-color 0.15s",
    "&:hover": {
      backgroundColor: theme.palette.mode === "dark" ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.02)",
    },
    "& td": {
      padding: "10px 16px",
      fontSize: "0.85rem",
    },
  },
  onlineBadge: {
    width: 10,
    height: 10,
    borderRadius: "50%",
    display: "inline-block",
    marginRight: 8,
  },
  filterBtn: {
    borderRadius: 10,
    textTransform: "none",
    fontWeight: 600,
    padding: "8px 24px",
    boxShadow: "none",
  },
  sectionHeader: {
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(1.5),
    marginBottom: theme.spacing(2),
    marginTop: theme.spacing(3),
  },
  sectionIcon: {
    width: 36,
    height: 36,
    borderRadius: 10,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.primary.dark || theme.palette.primary.main})`,
  },
  sectionTitle: {
    fontSize: "1.1rem",
    fontWeight: 700,
    color: theme.palette.text.primary,
    letterSpacing: "-0.02em",
  },
  progressBar: {
    height: 8,
    borderRadius: 4,
    backgroundColor: theme.palette.mode === "dark" ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)",
  },
}));

const SUMMARY_COLORS = [
  { bg: "rgba(59, 130, 246, 0.15)", accent: "#3B82F6", icon: "#60A5FA" },
  { bg: "rgba(16, 185, 129, 0.15)", accent: "#10B981", icon: "#34D399" },
  { bg: "rgba(245, 158, 11, 0.15)", accent: "#F59E0B", icon: "#FBBF24" },
  { bg: "rgba(139, 92, 246, 0.15)", accent: "#8B5CF6", icon: "#A78BFA" },
  { bg: "rgba(239, 68, 68, 0.15)", accent: "#EF4444", icon: "#F87171" },
];

function formatMinutes(min) {
  if (!min || min <= 0) return "0m";
  const h = Math.floor(min / 60);
  const m = Math.round(min % 60);
  if (h > 0) return `${h}h ${m}m`;
  return `${m}m`;
}

const UserPerformanceReport = () => {
  const classes = useStyles();
  const theme = useTheme();
  const { user } = useContext(AuthContext);

  const [initialDate, setInitialDate] = useState(format(subDays(new Date(), 30), "yyyy-MM-dd"));
  const [finalDate, setFinalDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState([]);
  const [summary, setSummary] = useState({});
  const [orderBy, setOrderBy] = useState("totalTickets");
  const [orderDir, setOrderDir] = useState("desc");

  useEffect(() => {
    fetchData();
  }, []);

  const fetchData = async () => {
    setLoading(true);
    try {
      const { data: result } = await api.get("/dashboard/user-performance", {
        params: { initialDate, finalDate },
      });
      setData(result.data || []);
      setSummary(result.summary || {});
    } catch (err) {
      console.error(err);
      toast.error(i18n.t("userPerformance.fetchError"));
    } finally {
      setLoading(false);
    }
  };

  const handleSort = (field) => {
    if (orderBy === field) {
      setOrderDir(orderDir === "asc" ? "desc" : "asc");
    } else {
      setOrderBy(field);
      setOrderDir("desc");
    }
  };

  const sortedData = [...data].sort((a, b) => {
    const aVal = a[orderBy] || 0;
    const bVal = b[orderBy] || 0;
    return orderDir === "asc" ? aVal - bVal : bVal - aVal;
  });

  const exportToExcel = () => {
    const rows = sortedData.map((u) => ({
      [i18n.t("userPerformance.table.user")]: u.userName,
      [i18n.t("userPerformance.table.totalTickets")]: u.totalTickets,
      [i18n.t("userPerformance.table.open")]: u.openTickets,
      [i18n.t("userPerformance.table.pending")]: u.pendingTickets,
      [i18n.t("userPerformance.table.closed")]: u.closedTickets,
      [i18n.t("userPerformance.table.avgTime")]: formatMinutes(u.avgSupportTime),
      [i18n.t("userPerformance.table.avgWait")]: formatMinutes(u.avgWaitTime),
      [i18n.t("userPerformance.table.minTime")]: formatMinutes(u.minSupportTime),
      [i18n.t("userPerformance.table.maxTime")]: formatMinutes(u.maxSupportTime),
      [i18n.t("userPerformance.table.rating")]: u.avgRating?.toFixed(1),
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Performance");
    XLSX.writeFile(wb, `user-performance-${initialDate}-${finalDate}.xlsx`);
  };

  // Chart: top users by tickets
  const top10 = sortedData.slice(0, 10);
  const barChartData = {
    labels: top10.map((u) => u.userName),
    datasets: [
      {
        label: i18n.t("userPerformance.table.closed"),
        data: top10.map((u) => u.closedTickets),
        backgroundColor: "rgba(16, 185, 129, 0.8)",
        borderRadius: 6,
        borderSkipped: false,
      },
      {
        label: i18n.t("userPerformance.table.open"),
        data: top10.map((u) => u.openTickets),
        backgroundColor: "rgba(59, 130, 246, 0.8)",
        borderRadius: 6,
        borderSkipped: false,
      },
      {
        label: i18n.t("userPerformance.table.pending"),
        data: top10.map((u) => u.pendingTickets),
        backgroundColor: "rgba(245, 158, 11, 0.8)",
        borderRadius: 6,
        borderSkipped: false,
      },
    ],
  };

  const barChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "top",
        labels: {
          color: theme.palette.text.secondary,
          font: { size: 11, family: "'Plus Jakarta Sans', sans-serif" },
          usePointStyle: true,
          pointStyle: "rectRounded",
        },
      },
      datalabels: { display: false },
      tooltip: {
        backgroundColor: theme.palette.mode === "dark" ? "#1e293b" : "#fff",
        titleColor: theme.palette.text.primary,
        bodyColor: theme.palette.text.secondary,
        borderColor: theme.palette.divider,
        borderWidth: 1,
        cornerRadius: 10,
        padding: 12,
      },
    },
    scales: {
      x: {
        stacked: true,
        grid: { display: false },
        ticks: { color: theme.palette.text.secondary, font: { size: 11 } },
        border: { display: false },
      },
      y: {
        stacked: true,
        grid: { color: theme.palette.mode === "dark" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)" },
        ticks: { color: theme.palette.text.secondary, font: { size: 11 }, stepSize: 1 },
        border: { display: false },
        beginAtZero: true,
      },
    },
  };

  // Doughnut: status distribution
  const totalOpen = data.reduce((a, u) => a + u.openTickets, 0);
  const totalPending = data.reduce((a, u) => a + u.pendingTickets, 0);
  const totalClosed = data.reduce((a, u) => a + u.closedTickets, 0);

  const doughnutData = {
    labels: [
      i18n.t("userPerformance.table.open"),
      i18n.t("userPerformance.table.pending"),
      i18n.t("userPerformance.table.closed"),
    ],
    datasets: [{
      data: [totalOpen, totalPending, totalClosed],
      backgroundColor: [
        "rgba(59, 130, 246, 0.85)",
        "rgba(245, 158, 11, 0.85)",
        "rgba(16, 185, 129, 0.85)",
      ],
      borderWidth: 0,
      cutout: "70%",
    }],
  };

  const doughnutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        position: "bottom",
        labels: {
          color: theme.palette.text.secondary,
          font: { size: 12 },
          usePointStyle: true,
          padding: 16,
        },
      },
      datalabels: {
        color: "#fff",
        font: { size: 14, weight: "bold" },
        formatter: (value) => value > 0 ? value : "",
      },
    },
  };

  const summaryItems = [
    { label: i18n.t("userPerformance.summary.totalTickets"), value: summary.totalTickets || 0, icon: <Assessment />, color: SUMMARY_COLORS[0] },
    { label: i18n.t("userPerformance.summary.activeUsers"), value: summary.totalUsers || 0, icon: <People />, color: SUMMARY_COLORS[1] },
    { label: i18n.t("userPerformance.summary.avgSupportTime"), value: formatMinutes(summary.avgSupportTime), icon: <AccessAlarm />, color: SUMMARY_COLORS[2] },
    { label: i18n.t("userPerformance.summary.avgWaitTime"), value: formatMinutes(summary.avgWaitTime), icon: <Timer />, color: SUMMARY_COLORS[3] },
    { label: i18n.t("userPerformance.summary.avgRating"), value: (summary.avgRating || 0).toFixed(1), icon: <Star />, color: SUMMARY_COLORS[4] },
  ];

  const maxTickets = Math.max(...data.map((u) => u.totalTickets), 1);

  const sortableColumns = [
    { field: "totalTickets", label: i18n.t("userPerformance.table.totalTickets") },
    { field: "openTickets", label: i18n.t("userPerformance.table.open") },
    { field: "pendingTickets", label: i18n.t("userPerformance.table.pending") },
    { field: "closedTickets", label: i18n.t("userPerformance.table.closed") },
    { field: "avgSupportTime", label: i18n.t("userPerformance.table.avgTime") },
    { field: "avgWaitTime", label: i18n.t("userPerformance.table.avgWait") },
    { field: "minSupportTime", label: i18n.t("userPerformance.table.minTime") },
    { field: "maxSupportTime", label: i18n.t("userPerformance.table.maxTime") },
    { field: "avgRating", label: i18n.t("userPerformance.table.rating") },
  ];

  if (user.showDashboard !== "enabled") {
    return <ForbiddenPage />;
  }

  return (
    <MainContainer>
      <Paper className={classes.mainPaper} variant="outlined">
        <Box padding="20px 16px" maxWidth="100%">
          {/* Header */}
          <Box display="flex" justifyContent="space-between" alignItems="center" flexWrap="wrap" mb={2}>
            <Box>
              <Typography style={{
                fontSize: "1.5rem",
                fontWeight: 800,
                color: theme.palette.text.primary,
                fontFamily: "'Plus Jakarta Sans', sans-serif",
              }}>
                📈 {i18n.t("userPerformance.title")}
              </Typography>
              <Typography style={{ fontSize: "0.8rem", color: theme.palette.text.secondary, marginTop: 2 }}>
                {i18n.t("userPerformance.subtitle")}
              </Typography>
            </Box>
            <IconButton
              onClick={exportToExcel}
              size="small"
              style={{
                borderRadius: 10,
                border: `1px solid ${theme.palette.mode === "dark" ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.1)"}`,
              }}
            >
              <SaveAlt fontSize="small" />
            </IconButton>
          </Box>

          {/* Filters */}
          <Box className={classes.card} mb={3}>
            <Grid container spacing={2} alignItems="center">
              <Grid item xs={12} sm={4} md={3}>
                <TextField
                  fullWidth
                  size="small"
                  type="date"
                  label={i18n.t("dashboard.date.initialDate")}
                  value={initialDate}
                  onChange={(e) => setInitialDate(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  variant="outlined"
                />
              </Grid>
              <Grid item xs={12} sm={4} md={3}>
                <TextField
                  fullWidth
                  size="small"
                  type="date"
                  label={i18n.t("dashboard.date.finalDate")}
                  value={finalDate}
                  onChange={(e) => setFinalDate(e.target.value)}
                  InputLabelProps={{ shrink: true }}
                  variant="outlined"
                />
              </Grid>
              <Grid item>
                <Button
                  className={classes.filterBtn}
                  variant="contained"
                  color="primary"
                  onClick={fetchData}
                  startIcon={<FilterList />}
                  disabled={loading}
                >
                  {loading ? i18n.t("userPerformance.loading") : i18n.t("dashboard.filter")}
                </Button>
              </Grid>
            </Grid>
          </Box>

          {loading && <LinearProgress style={{ marginBottom: 16, borderRadius: 4 }} />}

          {/* Summary Cards */}
          <Grid container spacing={2}>
            {summaryItems.map((item, i) => (
              <Grid item xs={6} sm={4} md key={i}>
                <Box className={classes.summaryCard}>
                  <Box className={classes.accent} style={{ background: item.color.accent }} />
                  <Box className={classes.iconBox} style={{ backgroundColor: item.color.bg }}>
                    {React.cloneElement(item.icon, { style: { color: item.color.icon, fontSize: "1.3rem" } })}
                  </Box>
                  <Typography className={classes.summaryValue}>{item.value}</Typography>
                  <Typography className={classes.summaryLabel}>{item.label}</Typography>
                </Box>
              </Grid>
            ))}
          </Grid>

          {/* Charts */}
          <Grid container spacing={2} style={{ marginTop: 8 }}>
            <Grid item xs={12} md={8}>
              <Box className={classes.card}>
                <Box className={classes.sectionHeader} style={{ marginTop: 0 }}>
                  <Box className={classes.sectionIcon}>
                    <TrendingUp style={{ color: "#fff", fontSize: "1.2rem" }} />
                  </Box>
                  <Typography className={classes.sectionTitle}>
                    {i18n.t("userPerformance.charts.ticketsByUser")}
                  </Typography>
                </Box>
                <Box style={{ height: 320 }}>
                  <Bar data={barChartData} options={barChartOptions} />
                </Box>
              </Box>
            </Grid>
            <Grid item xs={12} md={4}>
              <Box className={classes.card} style={{ height: "100%" }}>
                <Box className={classes.sectionHeader} style={{ marginTop: 0 }}>
                  <Box className={classes.sectionIcon}>
                    <Assessment style={{ color: "#fff", fontSize: "1.2rem" }} />
                  </Box>
                  <Typography className={classes.sectionTitle}>
                    {i18n.t("userPerformance.charts.statusDistribution")}
                  </Typography>
                </Box>
                <Box style={{ height: 280 }}>
                  <Doughnut data={doughnutData} options={doughnutOptions} />
                </Box>
              </Box>
            </Grid>
          </Grid>

          {/* Detailed Table */}
          <Box mt={3}>
            <Box className={classes.sectionHeader}>
              <Box className={classes.sectionIcon}>
                <People style={{ color: "#fff", fontSize: "1.2rem" }} />
              </Box>
              <Typography className={classes.sectionTitle}>
                {i18n.t("userPerformance.table.title")}
              </Typography>
            </Box>
            <TableContainer className={classes.tableContainer}>
              <Table size="small">
                <TableHead className={classes.tableHeader}>
                  <TableRow>
                    <TableCell>{i18n.t("userPerformance.table.user")}</TableCell>
                    {sortableColumns.map((col) => (
                      <TableCell key={col.field} align="center">
                        <TableSortLabel
                          active={orderBy === col.field}
                          direction={orderBy === col.field ? orderDir : "asc"}
                          onClick={() => handleSort(col.field)}
                        >
                          {col.label}
                        </TableSortLabel>
                      </TableCell>
                    ))}
                    <TableCell align="center" style={{ minWidth: 120 }}>
                      {i18n.t("userPerformance.table.distribution")}
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {sortedData.map((u, idx) => (
                    <TableRow key={u.userId} className={classes.tableRow}>
                      <TableCell>
                        <Box display="flex" alignItems="center">
                          <span
                            className={classes.onlineBadge}
                            style={{ backgroundColor: u.online ? "#10B981" : "#9CA3AF" }}
                          />
                          <Typography style={{ fontWeight: 600, fontSize: "0.85rem" }}>
                            {u.userName}
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell align="center">
                        <Chip
                          label={u.totalTickets}
                          size="small"
                          style={{
                            fontWeight: 700,
                            backgroundColor: theme.palette.primary.main,
                            color: "#fff",
                          }}
                        />
                      </TableCell>
                      <TableCell align="center">
                        <Chip label={u.openTickets} size="small" style={{ backgroundColor: "rgba(59,130,246,0.15)", color: "#3B82F6", fontWeight: 600 }} />
                      </TableCell>
                      <TableCell align="center">
                        <Chip label={u.pendingTickets} size="small" style={{ backgroundColor: "rgba(245,158,11,0.15)", color: "#F59E0B", fontWeight: 600 }} />
                      </TableCell>
                      <TableCell align="center">
                        <Chip label={u.closedTickets} size="small" style={{ backgroundColor: "rgba(16,185,129,0.15)", color: "#10B981", fontWeight: 600 }} />
                      </TableCell>
                      <TableCell align="center" style={{ fontWeight: 600 }}>
                        {formatMinutes(u.avgSupportTime)}
                      </TableCell>
                      <TableCell align="center" style={{ fontWeight: 600 }}>
                        {formatMinutes(u.avgWaitTime)}
                      </TableCell>
                      <TableCell align="center" style={{ fontSize: "0.8rem" }}>
                        {formatMinutes(u.minSupportTime)}
                      </TableCell>
                      <TableCell align="center" style={{ fontSize: "0.8rem" }}>
                        {formatMinutes(u.maxSupportTime)}
                      </TableCell>
                      <TableCell align="center">
                        <Box display="flex" alignItems="center" justifyContent="center" gap={0.5}>
                          <Rating value={u.avgRating} precision={0.5} size="small" readOnly />
                          <Typography style={{ fontSize: "0.75rem", color: theme.palette.text.secondary, marginLeft: 4 }}>
                            ({u.totalRatings})
                          </Typography>
                        </Box>
                      </TableCell>
                      <TableCell align="center">
                        <LinearProgress
                          variant="determinate"
                          value={(u.totalTickets / maxTickets) * 100}
                          className={classes.progressBar}
                          style={{ minWidth: 80 }}
                          sx={{
                            "& .MuiLinearProgress-bar": {
                              borderRadius: 4,
                              background: `linear-gradient(90deg, ${theme.palette.primary.main}, ${theme.palette.primary.light || theme.palette.primary.main})`,
                            },
                          }}
                        />
                      </TableCell>
                    </TableRow>
                  ))}
                  {sortedData.length === 0 && !loading && (
                    <TableRow>
                      <TableCell colSpan={11} align="center" style={{ padding: 40 }}>
                        <Typography color="textSecondary">
                          {i18n.t("userPerformance.noData")}
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </TableContainer>
          </Box>
        </Box>
      </Paper>
    </MainContainer>
  );
};

export default UserPerformanceReport;
