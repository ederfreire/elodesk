import React, { useState, useEffect, useReducer, useContext, useMemo } from "react";
import { useHistory } from "react-router-dom";
import { makeStyles } from "@material-ui/core/styles";
import Paper from "@material-ui/core/Paper";
import Button from "@material-ui/core/Button";
import Table from "@material-ui/core/Table";
import TableBody from "@material-ui/core/TableBody";
import TableCell from "@material-ui/core/TableCell";
import TableHead from "@material-ui/core/TableHead";
import TableRow from "@material-ui/core/TableRow";
import Chip from "@material-ui/core/Chip";
import Grid from "@material-ui/core/Grid";
import LinearProgress from "@material-ui/core/LinearProgress";
import { Skeleton } from "@material-ui/lab";
import { toast } from "react-toastify";
import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import Title from "../../components/Title";
import SubscriptionModal from "../../components/SubscriptionModal";
import ConfirmationModal from "../../components/ConfirmationModal";
import api from "../../services/api";
import TableRowSkeleton from "../../components/TableRowSkeleton";
import toastError from "../../errors/toastError";
import { formatCurrency } from "../../helpers/currencyHelper";
import { AuthContext } from "../../context/Auth/AuthContext";
import useCompanyCurrency from "../../hooks/useCompanyCurrency";
import usePlans from "../../hooks/usePlans";
import moment from "moment";
import { i18n } from "../../translate/i18n";

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
  if (action.type === "UPDATE_INVOICES") {
    const invoice = action.payload;
    const invoiceIndex = state.findIndex((i) => i.id === invoice.id);
    if (invoiceIndex !== -1) {
      state[invoiceIndex] = invoice;
      return [...state];
    } else {
      return [invoice, ...state];
    }
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
  planCard: {
    borderRadius: 10,
    padding: theme.spacing(3),
    border: `1px solid ${theme.palette.divider}`,
    boxShadow: 'none',
    position: "relative",
    overflow: "hidden",
    "&::before": {
      content: '""',
      position: "absolute",
      top: 0,
      left: 0,
      right: 0,
      height: 3,
      backgroundColor: theme.palette.primary.main,
    },
  },
  planTitle: {
    fontSize: 18,
    fontWeight: 700,
    marginBottom: theme.spacing(0.5),
  },
  planSubtitle: {
    fontSize: 13,
    color: theme.palette.text.secondary,
    marginBottom: theme.spacing(2),
  },
  detailsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
    gap: theme.spacing(1.5),
    marginBottom: theme.spacing(2),
  },
  detailItem: {
    textAlign: "center",
    padding: theme.spacing(1.5),
    borderRadius: 8,
    border: `1px solid ${theme.palette.divider}`,
  },
  detailLabel: {
    fontSize: 10,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    color: theme.palette.text.secondary,
    display: "block",
  },
  detailValue: {
    fontSize: 20,
    fontWeight: 800,
    display: "block",
    marginTop: 2,
  },
  expirySection: {
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(2),
    padding: theme.spacing(1.5, 2),
    borderRadius: 8,
    marginBottom: theme.spacing(1),
    border: `1px solid ${theme.palette.divider}`,
  },
  expiryDays: {
    fontSize: 32,
    fontWeight: 900,
    lineHeight: 1,
  },
  progressBar: {
    height: 6,
    borderRadius: 3,
    flex: 1,
  },
  tablePaper: {
    borderRadius: 10,
    overflow: "hidden",
    border: `1px solid ${theme.palette.divider}`,
    boxShadow: 'none',
  },
  tableHead: {
    backgroundColor: theme.palette.primary.main,
    "& th": {
      color: "#fff",
      fontWeight: 600,
      fontSize: 11,
      textTransform: "uppercase",
      letterSpacing: "0.5px",
      borderBottom: "none",
    },
  },
  tableRow: {
    transition: "background-color 0.15s",
    "&:hover": {
      backgroundColor: theme.palette.action.hover,
    },
  },
  chipPaid: {
    backgroundColor: "#e8f5e9",
    color: "#2e7d32",
    fontWeight: 600,
    fontSize: 11,
  },
  chipOpen: {
    backgroundColor: "#fff3e0",
    color: "#e65100",
    fontWeight: 600,
    fontSize: 11,
  },
  chipOverdue: {
    backgroundColor: "#ffebee",
    color: "#c62828",
    fontWeight: 600,
    fontSize: 11,
  },
  plansSection: {
    marginTop: theme.spacing(1),
  },
  planOption: {
    borderRadius: 10,
    padding: theme.spacing(2),
    border: `1px solid ${theme.palette.divider}`,
    boxShadow: 'none',
    cursor: "pointer",
    transition: "border-color 0.2s",
    "&:hover": {
      borderColor: theme.palette.primary.main,
    },
  },
  planOptionActive: {
    borderColor: theme.palette.primary.main,
    boxShadow: `0 0 0 1px ${theme.palette.primary.main}`,
  },
  sectionTitle: {
    fontSize: 15,
    fontWeight: 700,
    marginBottom: theme.spacing(1.5),
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(1),
  },
  alertBanner: {
    borderRadius: 8,
    padding: theme.spacing(1.5, 2),
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(1.5),
    marginBottom: theme.spacing(1),
  },
}));

const Invoices = () => {
  const classes = useStyles();
  const history = useHistory();
  const { user } = useContext(AuthContext);
  const { getPlanCompany, list: listPlans } = usePlans();

  useEffect(() => {
    if (user && user.super) {
      history.replace("/admin-financeiro");
    }
  }, [user, history]);

  const [loading, setLoading] = useState(false);
  const [pageNumber, setPageNumber] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [searchParam] = useState("");
  const [invoices, dispatch] = useReducer(reducer, []);
  const [storagePlans, setStoragePlans] = useState([]);
  const [selectedContactId, setSelectedContactId] = useState(null);
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [currentPlan, setCurrentPlan] = useState(null);
  const [availablePlans, setAvailablePlans] = useState([]);
  const [refundInvoice, setRefundInvoice] = useState(null);
  const { currencyReady, currency: liveCurrency } = useCompanyCurrency(user?.companyId);

  useEffect(() => {
    const fetchPlan = async () => {
      try {
        if (user?.companyId) {
          const planData = await getPlanCompany(undefined, user.companyId);
          setCurrentPlan(planData);
        }
      } catch (err) {
        console.error("Error fetching plan:", err);
      }
    };
    fetchPlan();
  }, [user]);

  useEffect(() => {
    const fetchPlans = async () => {
      try {
        const plans = await listPlans();
        const allPlans = Array.isArray(plans) ? plans : [];
        // Filtrar apenas planos públicos para empresas
        setAvailablePlans(allPlans.filter(p => p.isPublic === true));
      } catch (err) {
        console.error("Error fetching plans:", err);
      }
    };
    fetchPlans();
  }, []);

  const handleOpenContactModal = (invoice) => {
    setStoragePlans(invoice);
    setSelectedContactId(null);
    setContactModalOpen(true);
  };

  const handleChangePlan = async (plan) => {
    try {
      // Update company plan
      await api.put(`/companies/${user.companyId}`, {
        planId: plan.id,
      });

      // Create a new invoice for the selected plan
      const dueDate = moment().add(30, "days").format("YYYY-MM-DD");
      const { data: newInvoice } = await api.post("/invoices", {
        companyId: user.companyId,
        dueDate,
        detail: plan.name,
        status: "open",
        value: parseFloat(plan.amount || 0),
        users: plan.users,
        connections: plan.connections,
        queues: plan.queues,
        useWhatsapp: plan.useWhatsapp || false,
        useFacebook: plan.useFacebook || false,
        useInstagram: plan.useInstagram || false,
        useCampaigns: plan.useCampaigns || false,
        useSchedules: plan.useSchedules || false,
        useInternalChat: plan.useInternalChat || false,
        useExternalApi: plan.useExternalApi || false,
      });

      // Refresh current plan
      const planData = await getPlanCompany(undefined, user.companyId);
      setCurrentPlan(planData);

      // Open payment modal with the new invoice
      handleOpenContactModal(newInvoice);
    } catch (err) {
      toastError(err);
    }
  };

  const handleEarlyPayment = async () => {
    try {
      // Check if there's already an open invoice
      const openInvoice = invoices.find(inv => inv.status === "open");
      if (openInvoice) {
        handleOpenContactModal(openInvoice);
        return;
      }

      // Create a new invoice for early payment
      const plan = currentPlan?.plan;
      if (!plan) {
        toastError({ message: "Plano não encontrado" });
        return;
      }

      const dueDate = user?.company?.dueDate
        ? moment(user.company.dueDate).format("YYYY-MM-DD")
        : moment().add(30, "days").format("YYYY-MM-DD");

      const { data: newInvoice } = await api.post("/invoices", {
        companyId: user.companyId,
        dueDate,
        detail: plan.name,
        status: "open",
        value: parseFloat(plan.amount || 0),
        users: plan.users,
        connections: plan.connections,
        queues: plan.queues,
        useWhatsapp: plan.useWhatsapp || false,
        useFacebook: plan.useFacebook || false,
        useInstagram: plan.useInstagram || false,
        useCampaigns: plan.useCampaigns || false,
        useSchedules: plan.useSchedules || false,
        useInternalChat: plan.useInternalChat || false,
        useExternalApi: plan.useExternalApi || false,
      });

      dispatch({ type: "UPDATE_INVOICES", payload: newInvoice });
      handleOpenContactModal(newInvoice);
    } catch (err) {
      toastError(err);
    }
  };

  const handleCloseContactModal = () => {
    setSelectedContactId(null);
    setContactModalOpen(false);
  };

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
    if (status === "refunded") return i18n.t("financeiroPage.refunded");
    if (status === "paid") return i18n.t("financeiroPage.paid");
    if (status === "overdue") return i18n.t("financeiroPage.overdue");
    return i18n.t("financeiroPage.open");
  };

  const handleRefundInvoice = async () => {
    if (!refundInvoice) return;

    try {
      const { data } = await api.put(`/invoices/${refundInvoice.id}`, {
        id: refundInvoice.id,
        status: "refunded",
      });

      dispatch({ type: "UPDATE_INVOICES", payload: data });
      toast.success(i18n.t("companyFinanceiro.refundSuccess"));
    } catch (err) {
      toastError(err);
    } finally {
      setRefundInvoice(null);
    }
  };

  const daysRemaining = useMemo(() => {
    if (!user?.company?.dueDate) return null;
    return moment(user.company.dueDate).diff(moment(), "days");
  }, [user]);

  const totalDays = useMemo(() => {
    if (!user?.company?.createdAt || !user?.company?.dueDate) return 30;
    return moment(user.company.dueDate).diff(moment(user.company.createdAt), "days") || 30;
  }, [user]);

  const progressPercent = useMemo(() => {
    if (daysRemaining === null || totalDays === 0) return 0;
    const elapsed = totalDays - daysRemaining;
    return Math.min(100, Math.max(0, (elapsed / totalDays) * 100));
  }, [daysRemaining, totalDays]);

  const isExpired = daysRemaining !== null && daysRemaining < 0;

  return (
    <MainContainer>
      <ConfirmationModal
        title={i18n.t("companyFinanceiro.refundTitle")}
        open={Boolean(refundInvoice)}
        onClose={() => setRefundInvoice(null)}
        onConfirm={handleRefundInvoice}
      >
        {i18n.t("companyFinanceiro.refundMessage")}
      </ConfirmationModal>
      <SubscriptionModal
        open={contactModalOpen}
        onClose={handleCloseContactModal}
        Invoice={storagePlans}
        contactId={selectedContactId}
      />
      <MainHeader>
        <Title>{i18n.t("companyFinanceiro.title")}</Title>
      </MainHeader>

      <div className={classes.root}>
        {isExpired && (
          <div className={classes.alertBanner} style={{ backgroundColor: "#ffebee", border: "1px solid #ef9a9a" }}>
            <span style={{ fontSize: 22 }}>⚠️</span>
            <div>
              <strong style={{ color: "#c62828", fontSize: 13 }}>{i18n.t("companyFinanceiro.expiredTitle")}</strong>
              <p style={{ margin: 0, fontSize: 12, color: "#c62828", opacity: 0.8 }}>
                {i18n.t("companyFinanceiro.expiredMessage")}
              </p>
            </div>
          </div>
        )}

        <Paper className={classes.planCard}>
          <div className={classes.planTitle}>
            {currentPlan?.plan?.name || user?.company?.name || i18n.t("companyFinanceiro.myPlan")}
          </div>
          <div className={classes.planSubtitle}>
            {i18n.t("companyFinanceiro.company")}: {user?.company?.name}
          </div>

          <div className={classes.detailsGrid}>
            <div className={classes.detailItem}>
              <span className={classes.detailLabel}>{i18n.t("companyFinanceiro.users")}</span>
              <span className={classes.detailValue}>{currentPlan?.plan?.users || "∞"}</span>
            </div>
            <div className={classes.detailItem}>
              <span className={classes.detailLabel}>{i18n.t("companyFinanceiro.connections")}</span>
              <span className={classes.detailValue}>{currentPlan?.plan?.connections || "∞"}</span>
            </div>
            <div className={classes.detailItem}>
              <span className={classes.detailLabel}>{i18n.t("companyFinanceiro.queues")}</span>
              <span className={classes.detailValue}>{currentPlan?.plan?.queues || "∞"}</span>
            </div>
            <div className={classes.detailItem}>
              <span className={classes.detailLabel}>{i18n.t("companyFinanceiro.value")}</span>
              <span className={classes.detailValue} style={{ color: 'inherit' }}>
                {currencyReady
                  ? formatCurrency(parseFloat(currentPlan?.plan?.amount || 0), liveCurrency)
                  : <Skeleton variant="text" width={80} style={{ display: "inline-block" }} />}
              </span>
            </div>
            </div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
            {[
              { key: "useWhatsapp", label: "WhatsApp" },
              { key: "useFacebook", label: "Facebook" },
              { key: "useInstagram", label: "Instagram" },
              { key: "useCampaigns", label: i18n.t("companyFinanceiro.features.campaigns") || "Campanhas" },
              { key: "useSchedules", label: i18n.t("companyFinanceiro.features.schedules") || "Agendamentos" },
              { key: "useInternalChat", label: i18n.t("companyFinanceiro.features.internalChat") || "Chat Interno" },
              { key: "useExternalApi", label: "API Externa" },
              { key: "useKanban", label: "Kanban" },
              { key: "useOpenAi", label: "OpenAI" },
              { key: "useIntegrations", label: i18n.t("companyFinanceiro.features.integrations") || "Integrações" },
              { key: "useFlows", label: i18n.t("companyFinanceiro.features.flows") || "Fluxos" },
              { key: "useContacts", label: i18n.t("companyFinanceiro.features.contacts") || "Contatos" },
              { key: "useDashboard", label: "Dashboard" },
              { key: "useRealTime", label: i18n.t("companyFinanceiro.features.realTime") || "Tempo Real" },
              { key: "useWhatsappOfficial", label: "WhatsApp Oficial" },
              { key: "wavoip", label: "VoIP" },
              { key: "useTelegram", label: "Telegram" },
              { key: "useZapi", label: "Z-API" },
              { key: "useWhatsappEmbeddedSignup", label: "WhatsApp Embedded Signup" },
            ].map((feat) => (
              currentPlan?.plan?.[feat.key] != null && (
                <Chip
                  key={feat.key}
                  size="small"
                  label={feat.label}
                  style={{
                    backgroundColor: currentPlan.plan[feat.key] ? "#e8f5e9" : "#ffebee",
                    color: currentPlan.plan[feat.key] ? "#2e7d32" : "#c62828",
                    fontWeight: 600,
                    fontSize: 11,
                  }}
                />
              )
            ))}
          </div>


          <div
            className={classes.expirySection}
            style={{
              backgroundColor: isExpired ? "#ffebee" : daysRemaining <= 7 ? "#fff3e0" : "#e8f5e9",
              color: "#1b1b1b",
            }}
          >
            <div>
              <span className={classes.expiryDays} style={{
                color: isExpired ? "#c62828" : daysRemaining <= 7 ? "#e65100" : "#2e7d32",
              }}>
                {daysRemaining !== null ? Math.abs(daysRemaining) : "—"}
              </span>
              <span style={{ fontSize: 10, display: "block", opacity: 0.7, fontWeight: 600, color: "#1b1b1b" }}>
                {isExpired ? i18n.t("companyFinanceiro.daysOverdue") : i18n.t("companyFinanceiro.daysLeft")}
              </span>
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontSize: 12, marginBottom: 4, fontWeight: 600, color: "#1b1b1b" }}>
                {i18n.t("companyFinanceiro.expiresOn")}: {user?.company?.dueDate ? moment(user.company.dueDate).format("DD/MM/YYYY") : "—"}
              </div>
              <LinearProgress
                variant="determinate"
                value={progressPercent}
                className={classes.progressBar}
                style={{ backgroundColor: "rgba(0,0,0,0.08)" }}
              />
            </div>
          </div>
          <div style={{ marginTop: 16, textAlign: "center" }}>
            <Button
              variant="contained"
              color="primary"
              onClick={handleEarlyPayment}
              style={{ borderRadius: 8, textTransform: "none", fontWeight: 700, fontSize: 14, padding: "8px 32px" }}
            >
              💳 {i18n.t("companyFinanceiro.earlyPayment") || "Pagamento Antecipado"}
            </Button>
          </div>
        </Paper>

        {availablePlans.length > 0 && (
          <div className={classes.plansSection}>
            <div className={classes.sectionTitle}>
              📋 {i18n.t("companyFinanceiro.availablePlans")}
            </div>
            <Grid container spacing={2}>
              {availablePlans.map((plan) => (
                <Grid item xs={12} sm={6} md={4} key={plan.id}>
                  <Paper
                    className={`${classes.planOption} ${currentPlan?.plan?.id === plan.id ? classes.planOptionActive : ""}`}
                  >
                    <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 4 }}>{plan.name}</div>
                    <div style={{ fontSize: 20, fontWeight: 800, marginBottom: 6 }}>
                      {currencyReady
                        ? formatCurrency(parseFloat(plan.amount || 0), liveCurrency)
                        : <Skeleton variant="text" width={70} style={{ display: "inline-block" }} />}
                      <span style={{ fontSize: 12, fontWeight: 400, opacity: 0.6 }}>/{i18n.t("companyFinanceiro.month")}</span>
                    </div>
                    <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 8 }}>
                      {plan.users} {i18n.t("companyFinanceiro.users")} · {plan.connections} {i18n.t("companyFinanceiro.connections")} · {plan.queues} {i18n.t("companyFinanceiro.queues")}
                    </div>
                    <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginBottom: 8 }}>
                      {[
                        
                        { key: "useKanban", label: i18n.t("companyFinanceiro.features.kanban") || "Kanban" },
                        { key: "useOpenAi", label: i18n.t("companyFinanceiro.features.openai") || "OpenAI" },
                        { key: "useCampaigns", label: i18n.t("companyFinanceiro.features.campaigns") || "Campanhas" },
                        { key: "useTelegram", label: i18n.t("companyFinanceiro.features.telegram") || "Telegram" },
                        { key: "useFlows", label: i18n.t("companyFinanceiro.features.flows") || "Fluxos" },
                        { key: "useDashboard", label: i18n.t("companyFinanceiro.features.dashboard") || "Dashboard" },
                        { key: "useIntegrations", label: i18n.t("companyFinanceiro.features.integrations") || "Integrações" },
                        { key: "useZapi", label: i18n.t("companyFinanceiro.features.zapi") || "Z-API" },
                      ]
                        .filter(f => plan[f.key] === true)
                        .map(f => (
                          <Chip key={f.key} size="small" label={f.label}
                            style={{ fontSize: 10, height: 20, backgroundColor: "#e3f2fd", color: "#1565c0" }} />
                        ))}
                    </div>
                    {currentPlan?.plan?.id === plan.id ? (
                      <Chip size="small" label={i18n.t("companyFinanceiro.currentPlan")} style={{ backgroundColor: "#e8f5e9", color: "#2e7d32", fontWeight: 600, fontSize: 11 }} />
                    ) : (
                      <Button
                        size="small"
                        variant="outlined"
                        color="primary"
                        onClick={() => handleChangePlan(plan)}
                        style={{ borderRadius: 6, textTransform: 'none', fontWeight: 600, fontSize: 12 }}
                      >
                        {i18n.t("companyFinanceiro.changePlan")}
                      </Button>
                    )}
                  </Paper>
                </Grid>
              ))}
            </Grid>
          </div>
        )}

        <div>
          <div className={classes.sectionTitle}>
            📄 {i18n.t("companyFinanceiro.invoiceHistory")} ({invoices.filter(inv => {
              const s = getInvoiceStatus(inv);
              return s === "open" || s === "overdue" || s === "paid";
            }).length})
          </div>
          <Paper className={classes.tablePaper} onScroll={handleScroll} style={{ maxHeight: 400, overflow: "auto" }}>
            <Table size="small" stickyHeader>
              <TableHead className={classes.tableHead}>
                <TableRow>
                  <TableCell>{i18n.t("companyFinanceiro.detail")}</TableCell>
                  <TableCell align="center">{i18n.t("companyFinanceiro.users")}</TableCell>
                  <TableCell align="center">{i18n.t("companyFinanceiro.connections")}</TableCell>
                  <TableCell align="center">{i18n.t("companyFinanceiro.queues")}</TableCell>
                  <TableCell align="right">{i18n.t("companyFinanceiro.value")}</TableCell>
                  <TableCell align="center">{i18n.t("companyFinanceiro.dueDate")}</TableCell>
                  <TableCell align="center">{i18n.t("companyFinanceiro.status")}</TableCell>
                  <TableCell align="center">{i18n.t("companyFinanceiro.action")}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {invoices
                  .filter((inv) => {
                    const s = getInvoiceStatus(inv);
                    return s === "open" || s === "overdue" || s === "paid";
                  })
                  .sort((a, b) => {
                    const sa = getInvoiceStatus(a) === "paid" ? 1 : 0;
                    const sb = getInvoiceStatus(b) === "paid" ? 1 : 0;
                    if (sa !== sb) return sa - sb;
                    return moment(a.dueDate).diff(moment(b.dueDate));
                  })
                  .map((inv) => {
                  const status = getInvoiceStatus(inv);
                  return (
                    <TableRow key={inv.id} className={classes.tableRow}>
                      <TableCell>{inv.detail}</TableCell>
                      <TableCell align="center">{inv.users}</TableCell>
                      <TableCell align="center">{inv.connections}</TableCell>
                      <TableCell align="center">{inv.queues}</TableCell>
                      <TableCell align="right" style={{ fontWeight: 700 }}>
                        {currencyReady
                          ? formatCurrency(inv.value, liveCurrency)
                          : <Skeleton variant="text" width={70} style={{ display: "inline-block" }} />}
                      </TableCell>
                      <TableCell align="center">{moment(inv.dueDate).format("DD/MM/YYYY")}</TableCell>
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
                             {i18n.t("companyFinanceiro.refund")}
                           </Button>
                         ) : status === "refunded" ? (
                           <Chip
                             size="small"
                             label={i18n.t("financeiroPage.refunded")}
                             className={classes.chipOverdue}
                           />
                         ) : (
                          <Button
                            size="small"
                            variant="contained"
                            color="primary"
                            onClick={() => handleOpenContactModal(inv)}
                            style={{ borderRadius: 6, textTransform: "none", fontWeight: 600, fontSize: 12 }}
                          >
                            {i18n.t("companyFinanceiro.pay")}
                          </Button>
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
                {loading && <TableRowSkeleton columns={8} />}
              </TableBody>
            </Table>
          </Paper>
        </div>
      </div>
    </MainContainer>
  );
};

export default Invoices;
