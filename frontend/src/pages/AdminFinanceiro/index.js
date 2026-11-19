import React, { useState, useEffect, useReducer, useContext, useMemo } from "react";
import { makeStyles } from "@material-ui/core/styles";
import Paper from "@material-ui/core/Paper";
import Table from "@material-ui/core/Table";
import TableBody from "@material-ui/core/TableBody";
import TableCell from "@material-ui/core/TableCell";
import TableHead from "@material-ui/core/TableHead";
import TableRow from "@material-ui/core/TableRow";
import TextField from "@material-ui/core/TextField";
import InputAdornment from "@material-ui/core/InputAdornment";
import SearchIcon from "@material-ui/icons/Search";
import IconButton from "@material-ui/core/IconButton";
import Chip from "@material-ui/core/Chip";
import Select from "@material-ui/core/Select";
import MenuItem from "@material-ui/core/MenuItem";
import FormControl from "@material-ui/core/FormControl";
import InputLabel from "@material-ui/core/InputLabel";
import Tooltip from "@material-ui/core/Tooltip";
import Button from "@material-ui/core/Button";
import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import Title from "../../components/Title";
import ConfirmationModal from "../../components/ConfirmationModal";
import api from "../../services/api";
import TableRowSkeleton from "../../components/TableRowSkeleton";
import toastError from "../../errors/toastError";
import { toast } from "react-toastify";
import { formatCurrency } from "../../helpers/currencyHelper";
import { AuthContext } from "../../context/Auth/AuthContext";
import useCompanyCurrency from "../../hooks/useCompanyCurrency";
import { i18n } from "../../translate/i18n";
import moment from "moment";
import {
  Chart as ChartJS,
  ArcElement,
  BarElement,
  CategoryScale,
  LinearScale,
  Tooltip as ChartTooltip,
  Legend,
  LineElement,
  PointElement,
  Filler,
} from "chart.js";
import { Doughnut, Bar, Line } from "react-chartjs-2";
import { Skeleton } from "@material-ui/lab";

ChartJS.register(ArcElement, BarElement, CategoryScale, LinearScale, ChartTooltip, Legend, LineElement, PointElement, Filler);

const reducer = (state, action) => {
  if (action.type === "LOAD_INVOICES") {
    const invoices = action.payload.invoices || action.payload;
    const newInvoices = [];
    invoices.forEach((invoice) => {
      const invoiceIndex = state.findIndex((i) => i.id === invoice.id);
      if (invoiceIndex !== -1) {
        state[invoiceIndex] = invoice;
      } else {
        newInvoices.push(invoice);
      }
    });
    return [...state, ...newInvoices];
  }
  if (action.type === "RESET") return [];
  return state;
};

const useStyles = makeStyles((theme) => ({
  root: {
    padding: theme.spacing(2),
    display: "flex",
    flexDirection: "column",
    gap: theme.spacing(2),
  },
  kpiRow: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: theme.spacing(2),
  },
  kpiCard: {
    borderRadius: 16,
    padding: theme.spacing(2.5),
    display: "flex",
    flexDirection: "column",
    gap: 4,
    position: "relative",
    overflow: "hidden",
    boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
    "&::before": {
      content: '""',
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      height: 4,
    },
  },
  kpiLabel: {
    fontSize: 12,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    opacity: 0.7,
  },
  kpiValue: {
    fontSize: 28,
    fontWeight: 800,
    lineHeight: 1.2,
  },
  kpiSub: {
    fontSize: 12,
    opacity: 0.6,
  },
  chartsRow: {
    display: "grid",
    gridTemplateColumns: "1fr 1fr 1fr",
    gap: theme.spacing(2),
    [theme.breakpoints.down("md")]: {
      gridTemplateColumns: "1fr",
    },
  },
  chartCard: {
    borderRadius: 16,
    padding: theme.spacing(2),
    boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
  },
  chartTitle: {
    fontSize: 14,
    fontWeight: 700,
    marginBottom: theme.spacing(1.5),
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  },
  filtersRow: {
    display: "flex",
    gap: theme.spacing(2),
    alignItems: "center",
    flexWrap: "wrap",
  },
  tablePaper: {
    borderRadius: 16,
    overflow: "hidden",
    boxShadow: "0 2px 12px rgba(0,0,0,0.08)",
  },
  tableHead: {
    backgroundColor: theme.palette.primary.main,
    "& th": {
      color: "#fff",
      fontWeight: 700,
      fontSize: 12,
      textTransform: "uppercase",
      letterSpacing: "0.5px",
      borderBottom: "none",
    },
  },
  tableRow: {
    transition: "background-color 0.15s",
    "&:hover": {
      backgroundColor: theme.mode === "light" ? "rgba(0,0,0,0.02)" : "rgba(255,255,255,0.03)",
    },
  },
  chipPaid: {
    backgroundColor: "#e8f5e9",
    color: "#2e7d32",
    fontWeight: 700,
    fontSize: 11,
  },
  chipOpen: {
    backgroundColor: "#fff3e0",
    color: "#e65100",
    fontWeight: 700,
    fontSize: 11,
  },
  chipOverdue: {
    backgroundColor: "#ffebee",
    color: "#c62828",
    fontWeight: 700,
    fontSize: 11,
  },
}));

const AdminFinanceiro = () => {
  const classes = useStyles();
  const { user } = useContext(AuthContext);
  const [loading, setLoading] = useState(false);
  const [pageNumber, setPageNumber] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [searchParam, setSearchParam] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [invoices, dispatch] = useReducer(reducer, []);
  const [refundInvoice, setRefundInvoice] = useState(null);
  const { currencyReady } = useCompanyCurrency(user?.companyId);

  useEffect(() => {
    dispatch({ type: "RESET" });
    setPageNumber(1);
  }, [searchParam]);

  useEffect(() => {
    setLoading(true);
    const delayDebounceFn = setTimeout(() => {
      const fetchInvoices = async () => {
        try {
          const { data } = await api.get("/invoices/all", {
            params: { searchParam, pageNumber },
          });
          dispatch({ type: "LOAD_INVOICES", payload: data });
          setHasMore(data.hasMore);
          setLoading(false);
        } catch (err) {
          toastError(err);
          setLoading(false);
        }
      };
      fetchInvoices();
    }, 500);
    return () => clearTimeout(delayDebounceFn);
  }, [searchParam, pageNumber]);

  const handleScroll = (e) => {
    if (!hasMore || loading) return;
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - (scrollTop + 100) < clientHeight) {
      setPageNumber((prev) => prev + 1);
    }
  };

  const getInvoiceStatus = (record) => {
    if (record.status === "refunded") return "refunded";
    if (record.status === "paid") return "paid";
    const diff = moment(record.dueDate).diff(moment(), "days");
    return diff < 0 ? "overdue" : "open";
  };

  const getStatusLabel = (status) => {
    if (status === "refunded") return i18n.t("adminFinanceiro.refunded");
    if (status === "paid") return i18n.t("adminFinanceiro.paid");
    if (status === "overdue") return i18n.t("adminFinanceiro.overdue");
    return i18n.t("adminFinanceiro.open");
  };

  const handleRefundInvoice = async () => {
    if (!refundInvoice) return;

    try {
      const { data } = await api.put(`/invoices/${refundInvoice.id}`, {
        id: refundInvoice.id,
        status: "refunded",
      });

      dispatch({ type: "LOAD_INVOICES", payload: [data] });
      toast.success(i18n.t("adminFinanceiro.refundSuccess"));
    } catch (err) {
      toastError(err);
    } finally {
      setRefundInvoice(null);
    }
  };

  const filteredInvoices = useMemo(() => {
    if (statusFilter === "all") return invoices;
    return invoices.filter((inv) => getInvoiceStatus(inv) === statusFilter);
  }, [invoices, statusFilter]);

  // KPIs
  const kpis = useMemo(() => {
    const totalRevenue = invoices.filter((i) => i.status === "paid").reduce((sum, i) => sum + (i.value || 0), 0);
    const openCount = invoices.filter((i) => getInvoiceStatus(i) === "open").length;
    const overdueCount = invoices.filter((i) => getInvoiceStatus(i) === "overdue").length;
    const paidCount = invoices.filter((i) => i.status === "paid").length;
    const overdueValue = invoices.filter((i) => getInvoiceStatus(i) === "overdue").reduce((sum, i) => sum + (i.value || 0), 0);
    const openValue = invoices.filter((i) => getInvoiceStatus(i) === "open").reduce((sum, i) => sum + (i.value || 0), 0);
    return { totalRevenue, openCount, overdueCount, paidCount, overdueValue, openValue };
  }, [invoices]);

  // Chart: status distribution
  const statusChartData = useMemo(() => {
    const paid = invoices.filter((i) => i.status === "paid").length;
    const open = invoices.filter((i) => getInvoiceStatus(i) === "open").length;
    const overdue = invoices.filter((i) => getInvoiceStatus(i) === "overdue").length;
    return {
      labels: [i18n.t("adminFinanceiro.paid"), i18n.t("adminFinanceiro.open"), i18n.t("adminFinanceiro.overdue")],
      datasets: [{
        data: [paid, open, overdue],
        backgroundColor: ["#4caf50", "#ff9800", "#f44336"],
        borderWidth: 0,
        hoverOffset: 8,
      }],
    };
  }, [invoices]);

  // Chart: revenue by month
  const revenueByMonth = useMemo(() => {
    const monthMap = {};
    invoices
      .filter((i) => i.status === "paid")
      .forEach((i) => {
        const month = moment(i.dueDate).format("MMM/YY");
        monthMap[month] = (monthMap[month] || 0) + (i.value || 0);
      });
    const sorted = Object.entries(monthMap).sort((a, b) => moment(a[0], "MMM/YY").valueOf() - moment(b[0], "MMM/YY").valueOf());
    return {
      labels: sorted.map((s) => s[0]),
      datasets: [{
        label: i18n.t("adminFinanceiro.revenue"),
        data: sorted.map((s) => s[1]),
        backgroundColor: "rgba(33, 150, 243, 0.15)",
        borderColor: "#2196f3",
        borderWidth: 2,
        tension: 0.4,
        fill: true,
        pointBackgroundColor: "#2196f3",
        pointRadius: 4,
      }],
    };
  }, [invoices]);

  // Chart: overdue by month
  const overdueByMonth = useMemo(() => {
    const monthMap = {};
    invoices
      .filter((i) => getInvoiceStatus(i) === "overdue")
      .forEach((i) => {
        const month = moment(i.dueDate).format("MMM/YY");
        monthMap[month] = (monthMap[month] || 0) + (i.value || 0);
      });
    const sorted = Object.entries(monthMap).sort((a, b) => moment(a[0], "MMM/YY").valueOf() - moment(b[0], "MMM/YY").valueOf());
    return {
      labels: sorted.map((s) => s[0]),
      datasets: [{
        label: i18n.t("adminFinanceiro.defaulting"),
        data: sorted.map((s) => s[1]),
        backgroundColor: "#ef5350",
        borderColor: "#c62828",
        borderWidth: 1,
        borderRadius: 6,
      }],
    };
  }, [invoices]);

  const daysUntilDue = (dueDate) => {
    const diff = moment(dueDate).diff(moment(), "days");
    return diff;
  };

  return (
    <MainContainer>
      <ConfirmationModal
        title={i18n.t("adminFinanceiro.refundTitle")}
        open={Boolean(refundInvoice)}
        onClose={() => setRefundInvoice(null)}
        onConfirm={handleRefundInvoice}
      >
        {i18n.t("adminFinanceiro.refundMessage")}
      </ConfirmationModal>
      <MainHeader>
        <Title>{i18n.t("adminFinanceiro.title")} ({invoices.length})</Title>
      </MainHeader>

      <div className={classes.root}>
        {/* KPI Cards */}
        <div className={classes.kpiRow}>
          <Paper className={classes.kpiCard} style={{ borderTop: "4px solid #4caf50" }}>
            <span className={classes.kpiLabel}>{i18n.t("adminFinanceiro.totalRevenue")}</span>
            <span className={classes.kpiValue} style={{ color: "#4caf50" }}>
              {currencyReady ? formatCurrency(kpis.totalRevenue) : <Skeleton variant="text" width={120} style={{ display: "inline-block" }} />}
            </span>
            <span className={classes.kpiSub}>{kpis.paidCount} {i18n.t("adminFinanceiro.paidInvoices")}</span>
          </Paper>
          <Paper className={classes.kpiCard} style={{ borderTop: "4px solid #ff9800" }}>
            <span className={classes.kpiLabel}>{i18n.t("adminFinanceiro.openInvoices")}</span>
            <span className={classes.kpiValue} style={{ color: "#ff9800" }}>{kpis.openCount}</span>
            <span className={classes.kpiSub}>
              {currencyReady ? formatCurrency(kpis.openValue) : <Skeleton variant="text" width={70} style={{ display: "inline-block" }} />}
            </span>
          </Paper>
          <Paper className={classes.kpiCard} style={{ borderTop: "4px solid #f44336" }}>
            <span className={classes.kpiLabel}>{i18n.t("adminFinanceiro.overdueInvoices")}</span>
            <span className={classes.kpiValue} style={{ color: "#f44336" }}>{kpis.overdueCount}</span>
            <span className={classes.kpiSub}>
              {currencyReady ? formatCurrency(kpis.overdueValue) : <Skeleton variant="text" width={70} style={{ display: "inline-block" }} />}
            </span>
          </Paper>
          <Paper className={classes.kpiCard} style={{ borderTop: "4px solid #2196f3" }}>
            <span className={classes.kpiLabel}>{i18n.t("adminFinanceiro.totalInvoices")}</span>
            <span className={classes.kpiValue} style={{ color: "#2196f3" }}>{invoices.length}</span>
            <span className={classes.kpiSub}>{i18n.t("adminFinanceiro.allCompanies")}</span>
          </Paper>
        </div>

        {/* Charts */}
        <div className={classes.chartsRow}>
          <Paper className={classes.chartCard}>
            <div className={classes.chartTitle}>{i18n.t("adminFinanceiro.statusDistribution")}</div>
            <div style={{ height: 220, display: "flex", justifyContent: "center" }}>
              <Doughnut
                data={statusChartData}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  cutout: "65%",
                  plugins: { legend: { position: "bottom", labels: { padding: 12, usePointStyle: true } } },
                }}
              />
            </div>
          </Paper>
          <Paper className={classes.chartCard}>
            <div className={classes.chartTitle}>{i18n.t("adminFinanceiro.revenueByMonth")}</div>
            <div style={{ height: 220 }}>
              <Line
                data={revenueByMonth}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: { legend: { display: false } },
                  scales: {
                    y: { beginAtZero: true, grid: { color: "rgba(0,0,0,0.05)" } },
                    x: { grid: { display: false } },
                  },
                }}
              />
            </div>
          </Paper>
          <Paper className={classes.chartCard}>
            <div className={classes.chartTitle}>{i18n.t("adminFinanceiro.defaultByMonth")}</div>
            <div style={{ height: 220 }}>
              <Bar
                data={overdueByMonth}
                options={{
                  responsive: true,
                  maintainAspectRatio: false,
                  plugins: { legend: { display: false } },
                  scales: {
                    y: { beginAtZero: true, grid: { color: "rgba(0,0,0,0.05)" } },
                    x: { grid: { display: false } },
                  },
                }}
              />
            </div>
          </Paper>
        </div>

        {/* Filters */}
        <div className={classes.filtersRow}>
          <TextField
            size="small"
            variant="outlined"
            placeholder={i18n.t("adminFinanceiro.search")}
            value={searchParam}
            onChange={(e) => setSearchParam(e.target.value)}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon color="disabled" />
                </InputAdornment>
              ),
            }}
            style={{ minWidth: 280 }}
          />
          <FormControl variant="outlined" size="small" style={{ minWidth: 160 }}>
            <InputLabel>{i18n.t("adminFinanceiro.filterStatus")}</InputLabel>
            <Select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              label={i18n.t("adminFinanceiro.filterStatus")}
            >
              <MenuItem value="all">{i18n.t("adminFinanceiro.all")}</MenuItem>
              <MenuItem value="paid">{i18n.t("adminFinanceiro.paid")}</MenuItem>
              <MenuItem value="open">{i18n.t("adminFinanceiro.open")}</MenuItem>
              <MenuItem value="overdue">{i18n.t("adminFinanceiro.overdue")}</MenuItem>
            </Select>
          </FormControl>
        </div>

        {/* Table */}
        <Paper className={classes.tablePaper} onScroll={handleScroll} style={{ maxHeight: 500, overflow: "auto" }}>
          <Table size="small" stickyHeader>
            <TableHead className={classes.tableHead}>
              <TableRow>
                <TableCell>ID</TableCell>
                <TableCell>{i18n.t("adminFinanceiro.company")}</TableCell>
                <TableCell>{i18n.t("adminFinanceiro.detail")}</TableCell>
                <TableCell align="center">{i18n.t("adminFinanceiro.users")}</TableCell>
                <TableCell align="center">{i18n.t("adminFinanceiro.connections")}</TableCell>
                <TableCell align="right">{i18n.t("adminFinanceiro.value")}</TableCell>
                <TableCell align="center">{i18n.t("adminFinanceiro.dueDate")}</TableCell>
                <TableCell align="center">{i18n.t("adminFinanceiro.daysLeft")}</TableCell>
                <TableCell align="center">{i18n.t("adminFinanceiro.status")}</TableCell>
                <TableCell align="center">{i18n.t("adminFinanceiro.action")}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredInvoices.map((inv) => {
                const status = getInvoiceStatus(inv);
                const days = daysUntilDue(inv.dueDate);
                return (
                  <TableRow key={inv.id} className={classes.tableRow}>
                    <TableCell>{inv.id}</TableCell>
                    <TableCell>{inv.company?.name || `#${inv.companyId}`}</TableCell>
                    <TableCell>{inv.detail}</TableCell>
                    <TableCell align="center">{inv.users}</TableCell>
                    <TableCell align="center">{inv.connections}</TableCell>
                    <TableCell align="right" style={{ fontWeight: 700 }}>
                      {currencyReady ? formatCurrency(inv.value) : <Skeleton variant="text" width={70} style={{ display: "inline-block" }} />}
                    </TableCell>
                    <TableCell align="center">{moment(inv.dueDate).format("DD/MM/YYYY")}</TableCell>
                    <TableCell align="center">
                      <Tooltip title={days >= 0 ? `${days} ${i18n.t("adminFinanceiro.daysRemaining")}` : `${Math.abs(days)} ${i18n.t("adminFinanceiro.daysOverdue")}`}>
                        <span style={{ fontWeight: 600, color: days < 0 ? "#c62828" : days <= 7 ? "#e65100" : "#2e7d32" }}>
                          {days >= 0 ? `${days}d` : `${days}d`}
                        </span>
                      </Tooltip>
                    </TableCell>
                    <TableCell align="center">
                      <Chip
                        size="small"
                        label={getStatusLabel(status)}
                        className={status === "paid" ? classes.chipPaid : status === "overdue" ? classes.chipOverdue : classes.chipOpen}
                      />
                    </TableCell>
                    <TableCell align="center">
                      {status === "paid" ? (
                        <Button
                          size="small"
                          variant="outlined"
                          color="secondary"
                          onClick={() => setRefundInvoice(inv)}
                          style={{ borderRadius: 6, textTransform: "none", fontWeight: 600, fontSize: 12 }}
                        >
                          {i18n.t("adminFinanceiro.refund")}
                        </Button>
                      ) : (
                        <span>-</span>
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {loading && <TableRowSkeleton columns={10} />}
            </TableBody>
          </Table>
        </Paper>
      </div>
    </MainContainer>
  );
};

export default AdminFinanceiro;
