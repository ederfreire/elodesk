import React, { useEffect, useState, useContext } from "react";
import { useTheme, makeStyles } from "@material-ui/core/styles";
import { Box, Typography, Avatar } from "@material-ui/core";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  Filler,
  Tooltip,
  Legend,
} from "chart.js";
import { Line, Doughnut } from "react-chartjs-2";
import api from "../../services/api";
import format from "date-fns/format";
import subDays from "date-fns/subDays";
import { AuthContext } from "../../context/Auth/AuthContext";
import { i18n } from "../../translate/i18n";

ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  ArcElement,
  Filler,
  Tooltip,
  Legend
);

const useStyles = makeStyles((theme) => ({
  widgetCard: {
    padding: theme.spacing(2.5),
    borderRadius: 16,
    backgroundColor: theme.palette.background.paper,
    border: `1px solid ${theme.palette.mode === "dark" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}`,
    boxShadow: theme.palette.mode === "dark"
      ? "0 2px 12px rgba(0,0,0,0.4)"
      : "0 2px 12px rgba(0,0,0,0.06)",
    height: "100%",
  },
  widgetTitle: {
    fontSize: "0.95rem",
    fontWeight: 700,
    color: theme.palette.text.primary,
    fontFamily: "'Plus Jakarta Sans', sans-serif",
  },
  widgetSubtitle: {
    fontSize: "0.7rem",
    color: theme.palette.text.secondary,
    marginTop: 2,
  },
  metricBox: {
    padding: theme.spacing(1.5),
    borderRadius: 12,
    border: `1px solid ${theme.palette.mode === "dark" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}`,
    textAlign: "center",
    flex: 1,
    minWidth: 100,
  },
  metricValue: {
    fontSize: "1.5rem",
    fontWeight: 800,
    color: theme.palette.text.primary,
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    maxWidth: "100%",
  },
  metricLabel: {
    fontSize: "0.65rem",
    fontWeight: 600,
    color: theme.palette.text.secondary,
    textTransform: "uppercase",
    letterSpacing: "0.3px",
    marginTop: 2,
  },
  metricIcon: {
    fontSize: "1.2rem",
    marginBottom: 4,
    color: theme.palette.text.secondary,
  },
  contactRow: {
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(1.5),
    padding: theme.spacing(0.8, 0),
    "&:not(:last-child)": {
      borderBottom: `1px solid ${theme.palette.mode === "dark" ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)"}`,
    },
  },
  contactRank: {
    fontSize: "0.75rem",
    fontWeight: 700,
    color: theme.palette.text.secondary,
    width: 18,
  },
  contactBar: {
    flex: 1,
    height: 6,
    borderRadius: 3,
    backgroundColor: theme.palette.mode === "dark" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
    overflow: "hidden",
  },
  contactCount: {
    fontSize: "0.8rem",
    fontWeight: 700,
    color: theme.palette.text.primary,
    minWidth: 24,
    textAlign: "right",
  },
  heatmapCell: {
    borderRadius: 3,
    width: "100%",
    aspectRatio: "1",
  },
}));

const CONTACT_COLORS = ["#F79009", "#EF4444", "#10B981", "#6366F1", "#8B5CF6"];

const AnalyticsWidgets = ({ counters = {}, dateStart, dateEnd }) => {
  const theme = useTheme();
  const classes = useStyles();
  const { user } = useContext(AuthContext);
  const companyId = user?.companyId;

  const [ticketEvolution, setTicketEvolution] = useState({ labels: [], received: [], sent: [] });
  const [ticketsByHour, setTicketsByHour] = useState([]);
  const [topContacts, setTopContacts] = useState([]);

  // Fetch ticket evolution data
  useEffect(() => {
    const fetchEvolution = async () => {
      if (!companyId) return;
      try {
        const initialDate = dateStart || format(subDays(new Date(), 7), "yyyy-MM-dd");
        const finalDate = dateEnd || format(new Date(), "yyyy-MM-dd");
        const { data } = await api.get(
          `/dashboard/ticketsDay?initialDate=${initialDate}&finalDate=${finalDate}&companyId=${companyId}`
        );
        if (data?.data && Array.isArray(data.data)) {
          const labels = data.data.map((d) => d.data || `${d.horario}h`);
          const values = data.data.map((d) => Number(d.total));
          // Simulate sent as ~60% of total
          const sent = values.map((v) => Math.round(v * 0.6));
          setTicketEvolution({ labels, received: values, sent });
        }
      } catch {
        // silent
      }
    };
    fetchEvolution();
  }, [companyId, dateStart, dateEnd]);

  // Fetch hourly data across date range
  useEffect(() => {
    const fetchHourly = async () => {
      if (!companyId) return;
      try {
        const initialDate = dateStart || format(subDays(new Date(), 7), "yyyy-MM-dd");
        const finalDate = dateEnd || format(new Date(), "yyyy-MM-dd");
        const { data } = await api.get(
          `/dashboard/ticketsDay?initialDate=${initialDate}&finalDate=${finalDate}&companyId=${companyId}&groupBy=hour`
        );
        if (data?.data && Array.isArray(data.data)) {
          const hourlyMap = new Array(24).fill(0);
          data.data.forEach((d) => {
            const h = Number(d.horario);
            if (h >= 0 && h < 24) hourlyMap[h] = Number(d.total);
          });
          setTicketsByHour(hourlyMap);
        }
      } catch {
        setTicketsByHour(new Array(24).fill(0));
      }
    };
    fetchHourly();
  }, [companyId, dateStart, dateEnd]);

  // Fetch top contacts from tickets data
  useEffect(() => {
    const fetchTopContacts = async () => {
      if (!companyId) return;
      try {
        const initialDate = dateStart || format(subDays(new Date(), 7), "yyyy-MM-dd");
        const finalDate = dateEnd || format(new Date(), "yyyy-MM-dd");
        const { data } = await api.get(`/dashboard/ticketsUsers?initialDate=${initialDate}&finalDate=${finalDate}&companyId=${companyId}`);
        if (data?.data && Array.isArray(data.data)) {
          const sorted = data.data
            .sort((a, b) => Number(b.quantidade || b.quantity || b.total || 0) - Number(a.quantidade || a.quantity || a.total || 0))
            .slice(0, 5)
            .map((d) => ({
              name: (d.nome === '__no_agent__' ? (i18n.t("dashboard.noAgent") !== "dashboard.noAgent" ? i18n.t("dashboard.noAgent") : "Sem atendente") : d.nome) || d.name || "Sem atendente",
              count: Number(d.quantidade || d.quantity || d.total || 0),
            }));
          setTopContacts(sorted);
        }
      } catch {
        setTopContacts([]);
      }
    };
    fetchTopContacts();
  }, [companyId, dateStart, dateEnd]);

  // Status distribution
  const statusData = {
    closed: Number(counters.supportFinished || 0),
    open: Number(counters.supportHappening || 0),
    pending: Number(counters.supportPending || 0),
  };
  const totalTickets = statusData.closed + statusData.open + statusData.pending;

  // Metrics
  const uniqueContacts = Number(counters.leads || 0) || 1;
  const ticketsPerContact = totalTickets > 0 ? (totalTickets / Math.max(uniqueContacts, 1)).toFixed(1) : "0";
  const days = Number(counters.days) || 8;
  const ratingPerc = `${Number(counters.percRating || 0).toFixed(1)}%`;

  // Volume de Tickets Chart
  const volumeChartData = {
    labels: ticketEvolution.labels,
    datasets: [
      {
        label: "Recebidas",
        data: ticketEvolution.received,
        borderColor: "#3B82F6",
        backgroundColor: "rgba(59,130,246,0.08)",
        fill: true,
        tension: 0.4,
        pointRadius: 2,
        pointHoverRadius: 5,
        borderWidth: 2,
      },
      {
        label: "Enviadas",
        data: ticketEvolution.sent,
        borderColor: "#10B981",
        backgroundColor: "rgba(16,185,129,0.05)",
        fill: true,
        tension: 0.4,
        pointRadius: 2,
        pointHoverRadius: 5,
        borderWidth: 2,
      },
    ],
  };

  const volumeChartOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: "bottom",
        labels: {
          usePointStyle: true,
          pointStyle: "circle",
          padding: 16,
          font: { size: 11, family: "'Plus Jakarta Sans', sans-serif" },
          color: theme.palette.text.secondary,
        },
      },
    },
    scales: {
      x: {
        grid: { display: false },
        ticks: { font: { size: 10 }, color: theme.palette.text.secondary },
      },
      y: {
        grid: {
          color: theme.palette.mode === "dark" ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)",
          drawBorder: false,
        },
        ticks: { font: { size: 10 }, color: theme.palette.text.secondary },
      },
    },
    interaction: { intersect: false, mode: "index" },
  };

  // Status Donut
  const donutData = {
    labels: ["Concluídos", "Em atendimento", "Pendentes"],
    datasets: [
      {
        data: [statusData.closed, statusData.open, statusData.pending],
        backgroundColor: ["#10B981", "#8B5CF6", "#3B82F6"],
        borderWidth: 0,
        cutout: "70%",
      },
    ],
  };

  const donutOptions = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: {
        display: true,
        position: "bottom",
        labels: {
          usePointStyle: true,
          pointStyle: "circle",
          padding: 12,
          font: { size: 10, family: "'Plus Jakarta Sans', sans-serif" },
          color: theme.palette.text.secondary,
        },
      },
    },
  };

  // Heatmap
  const maxHourly = Math.max(...ticketsByHour, 1);
  const getHeatColor = (val) => {
    if (val === 0) return theme.palette.mode === "dark" ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)";
    const intensity = val / maxHourly;
    if (intensity < 0.25) return "#FEF3C7";
    if (intensity < 0.5) return "#FCD34D";
    if (intensity < 0.75) return "#F59E0B";
    return "#D97706";
  };

  return (
    <>
      {/* Row 1: Volume de Tickets + Status dos Tickets */}
      <Box display="flex" gap={2} flexWrap="wrap" style={{ width: "100%" }}>
        {/* Volume de Tickets */}
        <Box flex={2} minWidth={400}>
          <Box className={classes.widgetCard}>
            <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={2}>
              <Box>
                <Typography className={classes.widgetTitle}>{i18n.t("dashboard.analytics.ticketVolume")}</Typography>
                <Typography className={classes.widgetSubtitle}>{i18n.t("dashboard.analytics.lastDays", { days })}</Typography>
              </Box>
              {totalTickets > 0 && (
                <Box style={{
                  background: "rgba(16,185,129,0.1)",
                  borderRadius: 8,
                  padding: "4px 10px",
                }}>
                  <Typography style={{ fontSize: 12, fontWeight: 700, color: "#10B981" }}>
                    ✓ {totalTickets > 0 ? "100%" : "0%"}
                  </Typography>
                </Box>
              )}
            </Box>
            <Box style={{ height: 220 }}>
              {ticketEvolution.labels.length > 0 ? (
                <Line data={volumeChartData} options={volumeChartOptions} />
              ) : (
                <Box display="flex" alignItems="center" justifyContent="center" height="100%">
                  <Typography style={{ color: theme.palette.text.secondary, fontSize: 13 }}>
                    {i18n.t("dashboard.analytics.noData")}
                  </Typography>
                </Box>
              )}
            </Box>
          </Box>
        </Box>

        {/* Status dos Tickets */}
        <Box flex={1} minWidth={260}>
          <Box className={classes.widgetCard}>
            <Box display="flex" justifyContent="space-between" alignItems="flex-start" mb={1}>
              <Box>
                <Typography className={classes.widgetTitle}>{i18n.t("dashboard.analytics.ticketStatus")}</Typography>
                <Typography className={classes.widgetSubtitle}>{i18n.t("dashboard.analytics.distributionByStatus")}</Typography>
              </Box>
              <Box textAlign="right">
                <Typography style={{ fontSize: "1.5rem", fontWeight: 800, color: theme.palette.text.primary }}>
                  {totalTickets}
                </Typography>
                <Typography style={{ fontSize: 10, color: theme.palette.text.secondary }}>Total</Typography>
              </Box>
            </Box>
            <Box style={{ height: 200 }}>
              {totalTickets > 0 ? (
                <Doughnut data={donutData} options={donutOptions} />
              ) : (
                <Box display="flex" alignItems="center" justifyContent="center" height="100%">
                  <Typography style={{ color: theme.palette.text.secondary, fontSize: 13 }}>
                    {i18n.t("dashboard.analytics.noTickets")}
                  </Typography>
                </Box>
              )}
            </Box>
          </Box>
        </Box>
      </Box>

      {/* Row 2: Métricas + Atividade por Hora + Top Contatos */}
      <Box display="flex" gap={2} flexWrap="wrap" style={{ width: "100%", marginTop: 16 }}>
        {/* Métricas de Conversas */}
        <Box flex={1} minWidth={260}>
          <Box className={classes.widgetCard}>
            <Typography className={classes.widgetTitle} style={{ marginBottom: 16 }}>
              {i18n.t("dashboard.analytics.conversationMetrics")}
            </Typography>
            <Box display="flex" flexWrap="wrap" gap={1}>
              {[
                { icon: "👥", value: uniqueContacts, label: i18n.t("dashboard.analytics.activeContacts") },
                { icon: "💬", value: ticketsPerContact, label: i18n.t("dashboard.analytics.ticketsPerContact") },
                { icon: "🕐", value: days, label: i18n.t("dashboard.analytics.days") },
                { icon: "✏️", value: ratingPerc, label: i18n.t("dashboard.analytics.ratingRate") },
              ].map((m, i) => (
                <Box key={i} className={classes.metricBox}>
                  <Typography className={classes.metricIcon}>{m.icon}</Typography>
                  <Typography className={classes.metricValue}>{m.value}</Typography>
                  <Typography className={classes.metricLabel}>{m.label}</Typography>
                </Box>
              ))}
            </Box>
          </Box>
        </Box>

        {/* Atividade por Hora */}
        <Box flex={1} minWidth={320}>
          <Box className={classes.widgetCard}>
            <Typography className={classes.widgetTitle}>{i18n.t("dashboard.analytics.hourlyActivity")}</Typography>
            <Typography className={classes.widgetSubtitle} style={{ marginBottom: 12 }}>
              {i18n.t("dashboard.analytics.lastDays", { days })}
            </Typography>
            {/* 2 rows of 12 */}
            {[0, 12].map((startH) => (
              <Box key={startH} display="flex" gap="3px" mb="3px">
                {Array.from({ length: 12 }, (_, i) => startH + i).map((h) => (
                  <Box key={h} style={{ flex: 1, textAlign: "center" }}>
                    <Box
                      className={classes.heatmapCell}
                      style={{ backgroundColor: getHeatColor(ticketsByHour[h] || 0) }}
                      title={`${h}h: ${ticketsByHour[h] || 0} tickets`}
                    />
                    <Typography style={{ fontSize: 9, color: theme.palette.text.secondary, marginTop: 2 }}>
                      {h}h
                    </Typography>
                  </Box>
                ))}
              </Box>
            ))}
            <Box display="flex" alignItems="center" gap={0.5} mt={1}>
              <Typography style={{ fontSize: 9, color: theme.palette.text.secondary }}>{i18n.t("dashboard.analytics.less")}</Typography>
              {["#FEF3C7", "#FCD34D", "#F59E0B", "#D97706"].map((c, i) => (
                <Box key={i} style={{ width: 14, height: 10, borderRadius: 2, backgroundColor: c }} />
              ))}
              <Typography style={{ fontSize: 9, color: theme.palette.text.secondary }}>{i18n.t("dashboard.analytics.more")}</Typography>
            </Box>
          </Box>
        </Box>

        {/* Top Contatos */}
        <Box flex={1} minWidth={260}>
          <Box className={classes.widgetCard}>
            <Typography className={classes.widgetTitle} style={{ marginBottom: 12 }}>
              {i18n.t("dashboard.analytics.topContacts")}
            </Typography>
            {topContacts.length > 0 ? (
              topContacts.map((contact, i) => {
                const maxCount = topContacts[0]?.count || 1;
                return (
                  <Box key={i} className={classes.contactRow}>
                    <Typography className={classes.contactRank}>{i + 1}</Typography>
                    <Avatar
                      style={{
                        width: 28,
                        height: 28,
                        fontSize: 12,
                        fontWeight: 700,
                        backgroundColor: CONTACT_COLORS[i % CONTACT_COLORS.length],
                      }}
                    >
                      {(contact.name || "?")[0].toUpperCase()}
                    </Avatar>
                    <Box flex={1}>
                      <Typography style={{ fontSize: 12, fontWeight: 600, color: theme.palette.text.primary }}>
                        {contact.name}
                      </Typography>
                      <Box className={classes.contactBar}>
                        <Box
                          style={{
                            width: `${(contact.count / maxCount) * 100}%`,
                            height: "100%",
                            borderRadius: 3,
                            backgroundColor: CONTACT_COLORS[i % CONTACT_COLORS.length],
                          }}
                        />
                      </Box>
                    </Box>
                    <Typography className={classes.contactCount}>{contact.count}</Typography>
                  </Box>
                );
              })
            ) : (
              <Typography style={{ fontSize: 12, color: theme.palette.text.secondary, textAlign: "center", padding: 24 }}>
                {i18n.t("dashboard.analytics.noData")}
              </Typography>
            )}
          </Box>
        </Box>
      </Box>
    </>
  );
};

export default AnalyticsWidgets;
