import React, { useState, useEffect, useRef } from "react";

import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Chip,
  Divider,
  CircularProgress,
} from "@material-ui/core";
import { makeStyles } from "@material-ui/core/styles";
import PictureAsPdf from "@material-ui/icons/PictureAsPdf";
import AccessTime from "@material-ui/icons/AccessTime";
import Person from "@material-ui/icons/Person";
import GroupWork from "@material-ui/icons/GroupWork";
import format from "date-fns/format";
import parseISO from "date-fns/parseISO";
import html2pdf from "../../utils/html2pdf";

import { i18n } from "../../translate/i18n";
import api from "../../services/api";
import toastError from "../../errors/toastError";

const useStyles = makeStyles((theme) => ({
  paper: {
    borderRadius: 16,
    width: "100%",
    maxWidth: 620,
  },
  title: {
    fontWeight: 700,
  },
  content: {
    paddingTop: 0,
  },
  section: {
    marginBottom: theme.spacing(2.5),
  },
  sectionHeader: {
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(1),
    marginBottom: theme.spacing(1),
    color: theme.palette.text.secondary,
    "& svg": { fontSize: 18 },
  },
  sectionTitle: {
    fontSize: "0.78rem",
    fontWeight: 700,
    textTransform: "uppercase",
    letterSpacing: "0.5px",
  },
  value: {
    fontSize: "0.95rem",
    color: theme.palette.text.primary,
    whiteSpace: "pre-wrap",
  },
  muted: {
    color: theme.palette.text.secondary,
    fontStyle: "italic",
  },
  infoGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(2, 1fr)",
    gap: theme.spacing(1.5),
    [theme.breakpoints.down("xs")]: {
      gridTemplateColumns: "1fr",
    },
  },
  infoItem: {
    backgroundColor:
      theme.mode === "dark" ? "rgba(255,255,255,0.04)" : "#f5f6fa",
    borderRadius: 10,
    padding: theme.spacing(1.25, 1.5),
  },
  infoLabel: {
    fontSize: "0.72rem",
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: "0.4px",
    color: theme.palette.text.secondary,
    marginBottom: 2,
  },
  infoValue: {
    fontSize: "0.95rem",
    fontWeight: 600,
    color: theme.palette.text.primary,
  },
  chips: {
    display: "flex",
    flexWrap: "wrap",
    gap: theme.spacing(0.75),
  },
  chip: {
    fontWeight: 600,
  },
  timelineItem: {
    display: "flex",
    gap: theme.spacing(1.5),
    paddingBottom: theme.spacing(1.5),
    position: "relative",
  },
  timelineDot: {
    width: 10,
    height: 10,
    borderRadius: "50%",
    backgroundColor: theme.palette.primary.main,
    marginTop: 5,
    flexShrink: 0,
  },
  timelineText: {
    fontSize: "0.88rem",
    color: theme.palette.text.primary,
  },
  timelineDate: {
    fontSize: "0.75rem",
    color: theme.palette.text.secondary,
  },
}));

const formatDuration = (ms) => {
  if (ms === null || ms === undefined) return "-";
  const totalSeconds = Math.floor(ms / 1000);
  const days = Math.floor(totalSeconds / 86400);
  const hours = Math.floor((totalSeconds % 86400) / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;

  const parts = [];
  if (days) parts.push(`${days}${i18n.t("ticketReport.duration.days")}`);
  if (hours) parts.push(`${hours}${i18n.t("ticketReport.duration.hours")}`);
  if (minutes)
    parts.push(`${minutes}${i18n.t("ticketReport.duration.minutes")}`);
  if (!days && !hours)
    parts.push(`${seconds}${i18n.t("ticketReport.duration.seconds")}`);
  return parts.join(" ") || "-";
};

const safeDate = (value, pattern = "dd/MM/yyyy HH:mm") => {
  if (!value) return "-";
  try {
    return format(parseISO(value), pattern);
  } catch (err) {
    return "-";
  }
};

const TicketReportModal = ({ open, onClose, ticketId }) => {
  const classes = useStyles();
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState(null);
  const reportRef = useRef(null);

  const typeDescriptions = {
    create: i18n.t("showTicketLogModal.options.create"),
    chatBot: i18n.t("showTicketLogModal.options.chatBot"),
    queue: i18n.t("showTicketLogModal.options.queue"),
    open: i18n.t("showTicketLogModal.options.open"),
    access: i18n.t("showTicketLogModal.options.access"),
    transfered: i18n.t("showTicketLogModal.options.transfered"),
    receivedTransfer: i18n.t("showTicketLogModal.options.receivedTransfer"),
    pending: i18n.t("showTicketLogModal.options.pending"),
    closed: i18n.t("showTicketLogModal.options.closed"),
    reopen: i18n.t("showTicketLogModal.options.reopen"),
    redirect: i18n.t("showTicketLogModal.options.redirect"),
    clientClosed: i18n.t("showTicketLogModal.options.clientClosed"),
  };

  useEffect(() => {
    if (!open || !ticketId) return;
    setReport(null);
    setLoading(true);
    const fetchReport = async () => {
      try {
        const { data } = await api.get(`/tickets-report/${ticketId}`);
        setReport(data);
      } catch (err) {
        toastError(err);
      } finally {
        setLoading(false);
      }
    };
    fetchReport();
  }, [open, ticketId]);

  const handleExportPDF = () => {
    if (!reportRef.current) return;
    const opt = {
      margin: 0.5,
      filename: `${i18n.t("ticketReport.filename")}-${ticketId}.pdf`,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2, backgroundColor: "#ffffff" },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    };
    html2pdf().from(reportRef.current).set(opt).save();
  };

  const renderTimelineLabel = (entry) => {
    const who =
      entry.type === "access" ||
      entry.type === "transfered" ||
      entry.type === "open" ||
      entry.type === "pending" ||
      entry.type === "closed" ||
      entry.type === "reopen"
        ? entry.userName
        : entry.type === "queue" || entry.type === "redirect"
        ? entry.queueName
        : entry.type === "receivedTransfer"
        ? `${entry.queueName || ""} - ${entry.userName || ""}`
        : "";
    return `${who ? who + " " : ""}${typeDescriptions[entry.type] || entry.type}`;
  };

  return (
    <Dialog
      open={open}
      onClose={onClose}
      classes={{ paper: classes.paper }}
      maxWidth="sm"
      fullWidth
    >
      <DialogTitle className={classes.title}>
        {i18n.t("ticketReport.title")}
      </DialogTitle>
      <DialogContent className={classes.content} dividers>
        {loading && (
          <div style={{ textAlign: "center", padding: 40 }}>
            <CircularProgress />
          </div>
        )}

        {!loading && report && (
          <div ref={reportRef}>
            {/* Identification */}
            <div className={classes.section}>
              <div className={classes.infoGrid}>
                <div className={classes.infoItem}>
                  <Typography className={classes.infoLabel}>
                    {i18n.t("ticketReport.contact")}
                  </Typography>
                  <Typography className={classes.infoValue}>
                    {report.ticket.contact?.name || "-"}
                  </Typography>
                </div>
                <div className={classes.infoItem}>
                  <Typography className={classes.infoLabel}>
                    {i18n.t("ticketReport.ticketId")}
                  </Typography>
                  <Typography className={classes.infoValue}>
                    #{report.ticket.id}
                  </Typography>
                </div>
              </div>
            </div>

            {/* Subject */}
            <div className={classes.section}>
              <div className={classes.sectionHeader}>
                <Typography className={classes.sectionTitle}>
                  {i18n.t("ticketReport.subject")}
                </Typography>
              </div>
              <Typography
                className={`${classes.value} ${
                  report.ticket.closingSubject ? "" : classes.muted
                }`}
              >
                {report.ticket.closingSubject ||
                  report.ticket.motivoFinalizacao ||
                  i18n.t("ticketReport.notInformed")}
              </Typography>
            </div>

            {/* Summary */}
            <div className={classes.section}>
              <div className={classes.sectionHeader}>
                <Typography className={classes.sectionTitle}>
                  {i18n.t("ticketReport.summary")}
                </Typography>
              </div>
              <Typography
                className={`${classes.value} ${
                  report.ticket.closingSummary ? "" : classes.muted
                }`}
              >
                {report.ticket.closingSummary ||
                  i18n.t("ticketReport.notInformed")}
              </Typography>
            </div>

            <Divider style={{ margin: "16px 0" }} />

            {/* Timing */}
            <div className={classes.section}>
              <div className={classes.sectionHeader}>
                <AccessTime />
                <Typography className={classes.sectionTitle}>
                  {i18n.t("ticketReport.timing")}
                </Typography>
              </div>
              <div className={classes.infoGrid}>
                <div className={classes.infoItem}>
                  <Typography className={classes.infoLabel}>
                    {i18n.t("ticketReport.totalDuration")}
                  </Typography>
                  <Typography className={classes.infoValue}>
                    {formatDuration(report.durationMs)}
                  </Typography>
                </div>
                <div className={classes.infoItem}>
                  <Typography className={classes.infoLabel}>
                    {i18n.t("ticketReport.startedAt")}
                  </Typography>
                  <Typography className={classes.infoValue}>
                    {safeDate(report.startedAt)}
                  </Typography>
                </div>
                <div className={classes.infoItem}>
                  <Typography className={classes.infoLabel}>
                    {i18n.t("ticketReport.closedAt")}
                  </Typography>
                  <Typography className={classes.infoValue}>
                    {safeDate(report.closedAt)}
                  </Typography>
                </div>
                <div className={classes.infoItem}>
                  <Typography className={classes.infoLabel}>
                    {i18n.t("ticketReport.connection")}
                  </Typography>
                  <Typography className={classes.infoValue}>
                    {report.ticket.whatsapp?.name || "-"}
                  </Typography>
                </div>
              </div>
            </div>

            {/* Agents */}
            <div className={classes.section}>
              <div className={classes.sectionHeader}>
                <Person />
                <Typography className={classes.sectionTitle}>
                  {i18n.t("ticketReport.agents")}
                </Typography>
              </div>
              <div className={classes.chips}>
                {report.agents.length > 0 ? (
                  report.agents.map((a) => (
                    <Chip
                      key={a.id}
                      label={a.name}
                      size="small"
                      className={classes.chip}
                    />
                  ))
                ) : (
                  <Typography className={`${classes.value} ${classes.muted}`}>
                    {i18n.t("ticketReport.notInformed")}
                  </Typography>
                )}
              </div>
            </div>

            {/* Queues */}
            <div className={classes.section}>
              <div className={classes.sectionHeader}>
                <GroupWork />
                <Typography className={classes.sectionTitle}>
                  {i18n.t("ticketReport.queues")}
                </Typography>
              </div>
              <div className={classes.chips}>
                {report.queues.length > 0 ? (
                  report.queues.map((q) => (
                    <Chip
                      key={q.id}
                      label={q.name}
                      size="small"
                      color="primary"
                      variant="outlined"
                      className={classes.chip}
                    />
                  ))
                ) : (
                  <Typography className={`${classes.value} ${classes.muted}`}>
                    {i18n.t("ticketReport.notInformed")}
                  </Typography>
                )}
              </div>
            </div>

            <Divider style={{ margin: "16px 0" }} />

            {/* Timeline */}
            <div className={classes.section}>
              <div className={classes.sectionHeader}>
                <Typography className={classes.sectionTitle}>
                  {i18n.t("ticketReport.timeline")}
                </Typography>
              </div>
              {report.timeline.length > 0 ? (
                report.timeline.map((entry, idx) => (
                  <div className={classes.timelineItem} key={idx}>
                    <div className={classes.timelineDot} />
                    <div>
                      <Typography className={classes.timelineText}>
                        {renderTimelineLabel(entry)}
                      </Typography>
                      <Typography className={classes.timelineDate}>
                        {safeDate(entry.createdAt)}
                      </Typography>
                    </div>
                  </div>
                ))
              ) : (
                <Typography className={`${classes.value} ${classes.muted}`}>
                  {i18n.t("ticketReport.notInformed")}
                </Typography>
              )}
            </div>
          </div>
        )}
      </DialogContent>
      <DialogActions style={{ padding: 16 }}>
        <Button
          onClick={handleExportPDF}
          startIcon={<PictureAsPdf />}
          disabled={loading || !report}
        >
          {i18n.t("ticketReport.exportPDF")}
        </Button>
        <Button onClick={onClose} color="primary" variant="contained">
          {i18n.t("ticketReport.close")}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default TicketReportModal;
