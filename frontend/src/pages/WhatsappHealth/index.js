import React, { useCallback, useEffect, useMemo, useState } from "react";
import { Avatar, Box, Card, CardContent, CircularProgress, Grid, IconButton, InputAdornment, LinearProgress, Paper, TextField, Tooltip, Typography, makeStyles } from "@material-ui/core";
import RefreshIcon from "@material-ui/icons/Refresh";
import SearchIcon from "@material-ui/icons/Search";
import WhatsAppIcon from "@material-ui/icons/WhatsApp";
import CheckCircleIcon from "@material-ui/icons/CheckCircle";
import ErrorIcon from "@material-ui/icons/Error";
import WarningIcon from "@material-ui/icons/Warning";
import VerifiedUserIcon from "@material-ui/icons/VerifiedUser";
import SpeedIcon from "@material-ui/icons/Speed";
import FingerprintIcon from "@material-ui/icons/Fingerprint";
import BusinessIcon from "@material-ui/icons/Business";
import SendIcon from "@material-ui/icons/Send";
import DoneAllIcon from "@material-ui/icons/DoneAll";
import PictureAsPdfIcon from "@material-ui/icons/PictureAsPdf";
import ScheduleIcon from "@material-ui/icons/Schedule";
import DescriptionIcon from "@material-ui/icons/Description";
import { Link as RouterLink } from "react-router-dom";
import Button from "@material-ui/core/Button";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import { i18n } from "../../translate/i18n";
import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import Title from "../../components/Title";

const POLL_INTERVAL_MS = 30000;

const useStyles = makeStyles(theme => ({
  mainPaper: {
    flex: 1,
    padding: theme.spacing(3),
    overflowY: "auto",
    background: "transparent",
    border: "none",
    boxShadow: "none",
    ...theme.scrollbarStyles
  },
  toolbar: {
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(1.5),
    marginLeft: "auto"
  },
  pageTitle: {
    fontSize: 20,
    fontWeight: 600,
    lineHeight: 1.2,
    margin: 0
  },
  searchField: {
    minWidth: 260,
    background: theme.palette.background.paper,
    borderRadius: 10
  },
  statsRow: {
    marginBottom: theme.spacing(1.5)
  },
  statCard: {
    padding: theme.spacing(1, 1.25),
    borderRadius: 10,
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(1.25),
    border: `1px solid ${theme.palette.divider}`,
    background: theme.palette.background.paper,
    transition: "transform .15s ease, box-shadow .15s ease",
    "&:hover": { transform: "translateY(-1px)", boxShadow: theme.shadows[2] }
  },
  statIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    display: "flex",
    alignItems: "center",
    justifyContent: "center"
  },
  statValue: { fontSize: 16, fontWeight: 700, lineHeight: 1 },
  statLabel: { fontSize: 11, color: theme.palette.text.secondary, marginTop: 2 },
  card: {
    height: "100%",
    display: "flex",
    flexDirection: "column",
    borderRadius: 12,
    overflow: "hidden",
    border: `1px solid ${theme.palette.divider}`,
    transition: "transform .15s ease, box-shadow .15s ease",
    "&:hover": { transform: "translateY(-2px)", boxShadow: theme.shadows[4] }
  },
  cardTop: {
    padding: theme.spacing(1.25, 1.5),
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(1),
    color: "#fff"
  },
  cardAvatar: {
    background: "rgba(255,255,255,0.22)",
    color: "#fff",
    width: 34,
    height: 34
  },
  cardName: { fontWeight: 700, fontSize: 13.5, lineHeight: 1.2, color: "#fff" },
  cardPhone: { fontSize: 11.5, opacity: 0.92, color: "#fff" },

  qualityPill: {
    marginLeft: "auto",
    background: "rgba(255,255,255,0.18)",
    color: "#fff",
    fontWeight: 700,
    fontSize: 11,
    borderRadius: 999,
    padding: "4px 10px",
    display: "flex",
    alignItems: "center",
    gap: 6
  },
  qualityDot: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    background: "#fff"
  },
  body: { padding: theme.spacing(2) },
  row: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: theme.spacing(0.75, 0),
    borderBottom: `1px dashed ${theme.palette.divider}`,
    "&:last-child": { borderBottom: "none" }
  },
  rowLabel: { color: theme.palette.text.secondary, fontSize: 12.5 },
  rowValue: { fontWeight: 600, fontSize: 13 },
  mono: { fontFamily: "ui-monospace, SFMono-Regular, Menlo, monospace", fontSize: 12 },
  errorBanner: {
    margin: theme.spacing(0, 2, 2),
    padding: theme.spacing(1, 1.5),
    background: "rgba(244,67,54,0.08)",
    border: "1px solid rgba(244,67,54,0.3)",
    color: "#c62828",
    borderRadius: 10,
    fontSize: 12,
    display: "flex",
    gap: 8,
    alignItems: "flex-start"
  },
  empty: {
    textAlign: "center",
    padding: theme.spacing(8, 2),
    color: theme.palette.text.secondary
  },
  tierBar: {
    height: 6,
    borderRadius: 4,
    marginTop: 6
  }
}));

const qualityMap = {
  GREEN: { bg: "linear-gradient(135deg, #16a34a 0%, #22c55e 100%)", label: "Alta" },
  YELLOW: { bg: "linear-gradient(135deg, #d97706 0%, #f59e0b 100%)", label: "Média" },
  RED: { bg: "linear-gradient(135deg, #b91c1c 0%, #ef4444 100%)", label: "Baixa" },
  UNKNOWN: { bg: "linear-gradient(135deg, #475569 0%, #64748b 100%)", label: "—" }
};

const qualityOf = q => qualityMap[String(q || "").toUpperCase()] || qualityMap.UNKNOWN;

const tierInfo = t => {
  const map = {
    TIER_50: { label: "50 / dia", pct: 10 },
    TIER_250: { label: "250 / dia", pct: 25 },
    TIER_1K: { label: "1.000 / dia", pct: 45 },
    TIER_10K: { label: "10.000 / dia", pct: 65 },
    TIER_100K: { label: "100.000 / dia", pct: 85 },
    TIER_UNLIMITED: { label: "Ilimitado", pct: 100 }
  };
  return map[String(t || "").toUpperCase()] || { label: t || "—", pct: 0 };
};

const statusChip = s => {
  const v = String(s || "").toUpperCase();
  if (["APPROVED", "VERIFIED", "CONNECTED"].includes(v))
    return { color: "#0f7b3a", bg: "rgba(34,197,94,0.15)", label: v };
  if (["PENDING", "IN_REVIEW"].includes(v))
    return { color: "#92400e", bg: "rgba(245,158,11,0.18)", label: v };
  if (["REJECTED", "FLAGGED", "RESTRICTED", "FAILED", "EXPIRED"].includes(v))
    return { color: "#991b1b", bg: "rgba(239,68,68,0.16)", label: v };
  return { color: "#475569", bg: "rgba(100,116,139,0.15)", label: v || "—" };
};

const StatusBadge = ({ value }) => {
  const s = statusChip(value);
  return (
    <span
      style={{
        background: s.bg,
        color: s.color,
        fontWeight: 700,
        fontSize: 11,
        letterSpacing: 0.3,
        padding: "3px 10px",
        borderRadius: 999
      }}
    >
      {s.label}
    </span>
  );
};

const WhatsappHealth = () => {
  const classes = useStyles();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastUpdate, setLastUpdate] = useState(null);
  const [search, setSearch] = useState("");
  const [downloadingPdf, setDownloadingPdf] = useState(false);
  const [reports, setReports] = useState([]);
  const [reportsOpen, setReportsOpen] = useState(false);

  const handleDownloadPdf = useCallback(async () => {
    setDownloadingPdf(true);
    try {
      const lang = (localStorage.getItem("language") || localStorage.getItem("i18nextLng") || "pt").split("-")[0];
      const res = await api.get("/whatsapp-oficial/health/report.pdf", {
        params: { lang },
        responseType: "blob"
      });
      const url = window.URL.createObjectURL(new Blob([res.data], { type: "application/pdf" }));
      const a = document.createElement("a");
      a.href = url;
      const date = new Date().toISOString().slice(0, 10);
      a.download = `saude-numeros-${date}.pdf`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      toastError(err);
    } finally {
      setDownloadingPdf(false);
    }
  }, []);

  const handleOpenReports = useCallback(async () => {
    setReportsOpen(true);
    try {
      const { data } = await api.get("/whatsapp-oficial/health/reports");
      setReports(Array.isArray(data) ? data : []);
    } catch (err) {
      toastError(err);
    }
  }, []);

  const fetchData = useCallback(async (showSpinner = false) => {
    if (showSpinner) setRefreshing(true);
    try {
      const { data } = await api.get("/whatsapp-oficial/health");
      setItems(Array.isArray(data) ? data : []);
      setLastUpdate(new Date());
    } catch (err) {
      toastError(err);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
    const id = setInterval(() => fetchData(false), POLL_INTERVAL_MS);
    return () => clearInterval(id);
  }, [fetchData]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return items;
    return items.filter(it =>
      [it.name, it.display_phone_number, it.phone_number, it.waba_name, it.waba_id, it.phone_number_id]
        .filter(Boolean)
        .some(v => String(v).toLowerCase().includes(q))
    );
  }, [items, search]);

  const stats = useMemo(() => {
    const total = items.length;
    let green = 0, yellow = 0, red = 0, withError = 0;
    let sent = 0, delivered = 0, limit = 0, anyUnlimited = false;
    items.forEach(it => {
      const q = String(it.quality_rating || "").toUpperCase();
      if (q === "GREEN") green++;
      else if (q === "YELLOW") yellow++;
      else if (q === "RED") red++;
      if (it.error) withError++;
      if (typeof it.sent_24h === "number") sent += it.sent_24h;
      if (typeof it.delivered_24h === "number") delivered += it.delivered_24h;
      if (it.limit_24h === -1) anyUnlimited = true;
      else if (typeof it.limit_24h === "number" && it.limit_24h > 0) limit += it.limit_24h;
    });
    const usagePct = anyUnlimited ? 0 : (limit > 0 ? Math.min(100, Math.round((sent / limit) * 100)) : 0);
    return { total, green, yellow, red, withError, sent, delivered, limit, anyUnlimited, usagePct };
  }, [items]);

  const StatTile = ({ icon, value, label, color }) => (
    <Card variant="outlined" className={classes.statCard} elevation={0}>
      <div className={classes.statIcon} style={{ background: color + "22", color }}>
        {icon}
      </div>
      <div>
        <div className={classes.statValue}>{value}</div>
        <div className={classes.statLabel}>{label}</div>
      </div>
    </Card>
  );

  const Row = ({ label, value, mono }) => (
    <div className={classes.row}>
      <span className={classes.rowLabel}>{label}</span>
      <span className={`${classes.rowValue} ${mono ? classes.mono : ""}`}>
        {value || "—"}
      </span>
    </div>
  );

  return (
    <MainContainer>
      <MainHeader>
        <Title className={classes.pageTitle}>{i18n.t("whatsappHealth.title") || "Saúde dos Números (API Oficial)"}</Title>
        <div className={classes.toolbar}>
          <TextField
            placeholder={i18n.t("whatsappHealth.searchPlaceholder")}
            variant="outlined"
            size="small"
            value={search}
            onChange={e => setSearch(e.target.value)}
            className={classes.searchField}
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon fontSize="small" />
                </InputAdornment>
              )
            }}
          />
          {lastUpdate && (
            <Typography variant="caption" color="textSecondary">
              {i18n.t("whatsappHealth.updatedAt")} {lastUpdate.toLocaleTimeString()}
            </Typography>
          )}
          <Tooltip title={i18n.t("whatsappHealth.reloadTooltip")}>
            <IconButton size="small" onClick={() => fetchData(true)} disabled={refreshing}>
              {refreshing ? <CircularProgress size={18} /> : <RefreshIcon fontSize="small" />}
            </IconButton>
          </Tooltip>
          <Button
            variant="contained"
            color="primary"
            size="small"
            startIcon={downloadingPdf ? <CircularProgress size={16} color="inherit" /> : <PictureAsPdfIcon />}
            onClick={handleDownloadPdf}
            disabled={downloadingPdf || loading || items.length === 0}
          >
            {i18n.t("whatsappHealth.downloadPdf")}
          </Button>
          <Tooltip title={i18n.t("whatsappHealth.templatesTooltip")}>
            <Button
              variant="outlined"
              color="primary"
              size="small"
              startIcon={<DescriptionIcon />}
              component={RouterLink}
              to="/template-manager"
            >
              {i18n.t("whatsappHealth.templates")}
            </Button>
          </Tooltip>
          <Tooltip title={i18n.t("whatsappHealth.historyTooltip")}>
            <Button
              variant="outlined"
              size="small"
              startIcon={<ScheduleIcon />}
              onClick={handleOpenReports}
            >
              {i18n.t("whatsappHealth.history")}
            </Button>
          </Tooltip>
        </div>
      </MainHeader>

      <Paper className={classes.mainPaper} elevation={0}>
        {!loading && items.length > 0 && (
          <>
          <Grid container spacing={2} className={classes.statsRow}>
            <Grid item xs={6} sm={3}>
              <StatTile
                icon={<WhatsAppIcon />}
                value={stats.total}
                label={i18n.t("whatsappHealth.statConnected")}
                color="#2563eb"
              />
            </Grid>
            <Grid item xs={6} sm={3}>
              <StatTile
                icon={<CheckCircleIcon />}
                value={stats.green}
                label={i18n.t("whatsappHealth.statHigh")}
                color="#16a34a"
              />
            </Grid>
            <Grid item xs={6} sm={3}>
              <StatTile
                icon={<WarningIcon />}
                value={stats.yellow}
                label={i18n.t("whatsappHealth.statMedium")}
                color="#f59e0b"
              />
            </Grid>
            <Grid item xs={6} sm={3}>
              <StatTile
                icon={<ErrorIcon />}
                value={stats.red + stats.withError}
                label={i18n.t("whatsappHealth.statAttention")}
                color="#ef4444"
              />
            </Grid>
          </Grid>

          </>
        )}

        {loading ? (
          <Box display="flex" justifyContent="center" p={6}>
            <CircularProgress />
          </Box>
        ) : filtered.length === 0 ? (
          <div className={classes.empty}>
            <WhatsAppIcon style={{ fontSize: 48, opacity: 0.3 }} />
            <Typography variant="body1" style={{ marginTop: 8 }}>
              {items.length === 0
                ? i18n.t("whatsappHealth.emptyAll")
                : i18n.t("whatsappHealth.emptyFiltered")}
            </Typography>
          </div>
        ) : (
          <Grid container spacing={2}>
            {/* Cartões de números */}
            <Grid item xs={12}>
              <Grid container spacing={2}>
                {filtered.map(it => {
                  const q = qualityOf(it.quality_rating);
                  const tier = tierInfo(it.messaging_limit_tier);
                  return (
                    <Grid item xs={12} sm={6} lg={6} key={it.whatsappId}>
                      <Card className={classes.card} elevation={0}>
                        <div className={classes.cardTop} style={{ background: q.bg }}>
                          <Avatar className={classes.cardAvatar}>
                            <WhatsAppIcon />
                          </Avatar>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div className={classes.cardName} title={it.name}>
                              {it.name}
                            </div>
                            <div className={classes.cardPhone}>
                              {it.display_phone_number || it.phone_number || "—"}
                            </div>
                          </div>
                          <span className={classes.qualityPill}>
                            <span className={classes.qualityDot} />
                            {it.quality_rating || "—"}
                          </span>
                        </div>

                        {it.error && !/messaging_limit_tier|whatsapp_business_management|tier/i.test(it.error) && (
                          <div className={classes.errorBanner}>
                            <ErrorIcon fontSize="small" />
                            <span>{it.error}</span>
                          </div>
                        )}

                        <CardContent className={classes.body}>
                          <Row label={i18n.t("whatsappHealth.verifiedName")} value={it.verified_name} />
                          <div className={classes.row}>
                            <span className={classes.rowLabel}>
                              <SpeedIcon style={{ fontSize: 14, verticalAlign: "middle", marginRight: 4 }} />
                              {i18n.t("whatsappHealth.limit24h")}
                            </span>
                            <span className={classes.rowValue}>{tier.label}</span>
                          </div>
                          {tier.pct > 0 && (
                            <LinearProgress
                              variant="determinate"
                              value={tier.pct}
                              className={classes.tierBar}
                            />
                          )}

                          {(typeof it.sent_24h === "number" || typeof it.limit_24h === "number") && (() => {
                            const sent = it.sent_24h || 0;
                            const delivered = it.delivered_24h || 0;
                            const lim = it.limit_24h;
                            const unlimited = lim === -1;
                            const pct = !unlimited && lim > 0 ? Math.min(100, Math.round((sent / lim) * 100)) : 0;
                            const avail = !unlimited && lim > 0 ? Math.max(0, lim - sent) : null;
                            const barColor = pct >= 90 ? "#ef4444" : pct >= 70 ? "#f59e0b" : "#16a34a";
                            return (
                              <Box mt={1} mb={0.5} p={1} style={{ background: "rgba(37,99,235,0.06)", border: "1px solid rgba(37,99,235,0.18)", borderRadius: 10 }}>
                                <Box display="flex" justifyContent="space-between" alignItems="center" mb={0.5}>
                                  <span style={{ fontSize: 11, fontWeight: 700, color: "#1d4ed8", letterSpacing: 0.3 }}>
                                    {i18n.t("whatsappHealth.shipments24h")}
                                  </span>
                                  <span style={{ fontSize: 11, color: "#475569" }}>
                                    {unlimited ? i18n.t("whatsappHealth.unlimited") : (lim ? `${pct}%` : "")}
                                  </span>
                                </Box>
                                <Box display="flex" justifyContent="space-between" style={{ fontSize: 12, marginBottom: 4 }}>
                                  <span><SendIcon style={{ fontSize: 12, verticalAlign: "middle" }} /> {sent.toLocaleString("pt-BR")} {i18n.t("whatsappHealth.sentLow")}</span>
                                  <span><DoneAllIcon style={{ fontSize: 12, verticalAlign: "middle" }} /> {delivered.toLocaleString("pt-BR")} {i18n.t("whatsappHealth.deliveredLow")}</span>
                                </Box>
                                {!unlimited && lim > 0 && (
                                  <>
                                    <LinearProgress
                                      variant="determinate"
                                      value={pct}
                                      style={{ height: 6, borderRadius: 4, background: "rgba(0,0,0,0.06)" }}
                                      classes={{ bar: "" }}
                                    />
                                    <div style={{ fontSize: 11, marginTop: 4, color: "#475569" }}>
                                      {i18n.t("whatsappHealth.available")}: <strong style={{ color: barColor }}>{avail.toLocaleString("pt-BR")}</strong> / {lim.toLocaleString("pt-BR")}
                                    </div>
                                  </>
                                )}
                              </Box>
                            );
                          })()}

                          <Row label={i18n.t("whatsappHealth.platform")} value={it.platform_type} />
                          <div className={classes.row}>
                            <span className={classes.rowLabel}>
                              <FingerprintIcon style={{ fontSize: 14, verticalAlign: "middle", marginRight: 4 }} />
                              {i18n.t("whatsappHealth.codeVerification")}
                            </span>
                            <StatusBadge value={it.code_verification_status} />
                          </div>
                          <div className={classes.row}>
                            <span className={classes.rowLabel}>{i18n.t("whatsappHealth.nameStatus")}</span>
                            <StatusBadge value={it.name_status} />
                          </div>
                          <div className={classes.row}>
                            <span className={classes.rowLabel}>{i18n.t("whatsappHealth.accountReview")}</span>
                            <StatusBadge value={it.account_review_status} />
                          </div>
                          <div className={classes.row}>
                            <span className={classes.rowLabel}>
                              <VerifiedUserIcon style={{ fontSize: 14, verticalAlign: "middle", marginRight: 4 }} />
                              {i18n.t("whatsappHealth.businessVerification")}
                            </span>
                            <StatusBadge value={it.business_verification_status} />
                          </div>
                          <div className={classes.row}>
                            <span className={classes.rowLabel}>
                              <BusinessIcon style={{ fontSize: 14, verticalAlign: "middle", marginRight: 4 }} />
                              {i18n.t("whatsappHealth.wabaName")}
                            </span>
                            <span className={classes.rowValue}>{it.waba_name || "—"}</span>
                          </div>
                          <Row label={i18n.t("whatsappHealth.wabaId") || "WABA ID"} value={it.waba_id} mono />
                          <Row label={i18n.t("whatsappHealth.phoneNumberId")} value={it.phone_number_id} mono />
                          {it.throughput?.level && (
                            <Row label={i18n.t("whatsappHealth.throughput")} value={it.throughput.level} />
                          )}
                        </CardContent>
                      </Card>
                    </Grid>
                  );
                })}
              </Grid>
            </Grid>
          </Grid>
        )}
      </Paper>
      <ReportsDialog
        open={reportsOpen}
        onClose={() => setReportsOpen(false)}
        reports={reports}
      />
    </MainContainer>
  );
};

const ReportsDialog = ({ open, onClose, reports }) => {
  // Lazy-imported MUI Dialog parts to avoid an extra top-level import block
  const Dialog = require("@material-ui/core/Dialog").default;
  const DialogTitle = require("@material-ui/core/DialogTitle").default;
  const DialogContent = require("@material-ui/core/DialogContent").default;
  const DialogActions = require("@material-ui/core/DialogActions").default;
  const List = require("@material-ui/core/List").default;
  const ListItem = require("@material-ui/core/ListItem").default;
  const ListItemText = require("@material-ui/core/ListItemText").default;
  const ListItemSecondaryAction = require("@material-ui/core/ListItemSecondaryAction").default;
  const MUIButton = require("@material-ui/core/Button").default;
  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>{i18n.t("whatsappHealth.reportsDialog.title", "Relatórios diários (gerados às 09:00)")}</DialogTitle>
      <DialogContent dividers>
        {(!reports || reports.length === 0) ? (
          <div style={{ padding: 16, color: "#666" }}>
            {i18n.t("whatsappHealth.reportsDialog.empty", "Nenhum relatório gerado ainda. Será gerado automaticamente amanhã às 09:00.")}
          </div>
        ) : (
          <List dense>
            {reports.map(r => (
              <ListItem key={r.filename}>
                <ListItemText
                  primary={r.filename}
                  secondary={`${new Date(r.date).toLocaleString()} · ${Math.round((r.size||0)/1024)} KB`}
                />
                <ListItemSecondaryAction>
                  <MUIButton
                    size="small"
                    color="primary"
                    variant="outlined"
                    href={r.url}
                    target="_blank"
                    rel="noopener noreferrer"
                  >
                    {i18n.t("whatsappHealth.reportsDialog.download", "Baixar")}
                  </MUIButton>
                </ListItemSecondaryAction>
              </ListItem>
            ))}
          </List>
        )}
      </DialogContent>
      <DialogActions>
        <MUIButton onClick={onClose}>{i18n.t("whatsappHealth.reportsDialog.close", "Fechar")}</MUIButton>
      </DialogActions>
    </Dialog>
  );
};

export default WhatsappHealth;
