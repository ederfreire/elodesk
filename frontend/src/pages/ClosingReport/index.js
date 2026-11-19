import React, { useState, useEffect, useContext, useMemo } from "react";
import { makeStyles } from "@material-ui/core/styles";
import {
  Paper,
  Box,
  Typography,
  TextField,
  Button,
  MenuItem,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  CircularProgress,
} from "@material-ui/core";
import PictureAsPdf from "@material-ui/icons/PictureAsPdf";
import GridOn from "@material-ui/icons/GridOn";
import FilterList from "@material-ui/icons/FilterList";
import * as XLSX from "xlsx";
import html2pdf from "../../utils/html2pdf";
import moment from "moment";

import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import Title from "../../components/Title";
import { UsersFilter } from "../../components/UsersFilter";
import { StatusFilter } from "../../components/StatusFilter";
import QueueSelectCustom from "../../components/QueueSelectCustom";
import ForbiddenPage from "../../components/ForbiddenPage";
import { AuthContext } from "../../context/Auth/AuthContext";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import { i18n } from "../../translate/i18n";

const useStyles = makeStyles((theme) => ({
  mainPaper: {
    flex: 1,
    padding: theme.spacing(2),
    overflowY: "auto",
    ...theme.scrollbarStyles,
  },
  filtersBox: {
    display: "flex",
    flexWrap: "wrap",
    gap: theme.spacing(2),
    alignItems: "flex-end",
    marginBottom: theme.spacing(2),
  },
  filterItem: {
    flex: "1 1 180px",
    minWidth: 150,
  },
  actionsBox: {
    display: "flex",
    gap: theme.spacing(1),
    marginBottom: theme.spacing(2),
    flexWrap: "wrap",
  },
  tableWrapper: {
    overflowX: "auto",
    ...theme.scrollbarStyles,
  },
  statusChip: {
    padding: "2px 8px",
    borderRadius: 6,
    fontSize: 12,
    fontWeight: 600,
    display: "inline-block",
  },
  summaryCell: {
    maxWidth: 280,
    whiteSpace: "normal",
  },
  summaryBox: {
    display: "flex",
    flexWrap: "wrap",
    gap: theme.spacing(2),
    marginBottom: theme.spacing(2),
  },
  summaryCard: {
    flex: "1 1 160px",
    minWidth: 140,
    padding: theme.spacing(2),
    borderRadius: 10,
    border: `1px solid ${theme.palette.divider}`,
    background:
      theme.mode === "light"
        ? "rgba(0,51,102,0.03)"
        : "rgba(255,255,255,0.04)",
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  summaryValue: {
    fontSize: 26,
    fontWeight: 700,
    lineHeight: 1.1,
  },
  summaryLabel: {
    fontSize: 12,
    color: theme.palette.text.secondary,
    fontWeight: 600,
    textTransform: "uppercase",
    letterSpacing: 0.4,
  },
}));

const statusStyle = (status) => {
  switch (status) {
    case "FECHADO":
      return { background: "#D1FAE5", color: "#065F46" };
    case "ABERTO":
      return { background: "#DBEAFE", color: "#1D4ED8" };
    case "PENDENTE":
      return { background: "#FEF3C7", color: "#92400E" };
    case "GRUPO":
      return { background: "#E0E7FF", color: "#3730A3" };
    default:
      return { background: "#F3F4F6", color: "#374151" };
  }
};

const ClosingReport = () => {
  const classes = useStyles();
  const { user } = useContext(AuthContext);

  const [dateFrom, setDateFrom] = useState(moment("1", "D").format("YYYY-MM-DD"));
  const [dateTo, setDateTo] = useState(moment().format("YYYY-MM-DD"));
  const [userIds, setUserIds] = useState([]);
  const [queueIds, setQueueIds] = useState([]);
  const [selectedStatus, setSelectedStatus] = useState([]);
  const [closingSubject, setClosingSubject] = useState("");
  const [reasons, setReasons] = useState([]);

  const [tickets, setTickets] = useState([]);
  // Guarda o assunto que foi REALMENTE enviado na última consulta. Sem isso
  // não há como distinguir "filtrei e não achei nada" de "o filtro nem saiu",
  // que foi exatamente a dúvida que travou o diagnóstico desta tela.
  const [assuntoAplicado, setAssuntoAplicado] = useState("");
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  useEffect(() => {
    const fetchReasons = async () => {
      try {
        const { data } = await api.get("/ticketFinalizationReasons");
        setReasons(Array.isArray(data) ? data : []);
      } catch (err) {
        // silencioso
      }
    };
    fetchReasons();
    handleFilter();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // `sobrescritas` existe porque o React só atualiza o estado no próximo
  // render: chamando handleFilter de dentro de um onChange, o valor recém
  // escolhido ainda não estaria em `closingSubject`. Passando explícito, a
  // consulta sai com o valor certo já na primeira vez.
  const buildParams = (sobrescritas = {}) => ({
    dateFrom,
    dateTo,
    users: JSON.stringify(userIds),
    queueIds: JSON.stringify(queueIds),
    status: JSON.stringify(selectedStatus),
    closingSubject: closingSubject || undefined,
    ...sobrescritas,
  });

  const handleFilter = async (sobrescritas = {}) => {
    setLoading(true);
    try {
      const parametros = buildParams(sobrescritas);
      const { data } = await api.get("/ticketreport/closing", {
        params: parametros,
      });
      setTickets(data?.tickets || []);
      setAssuntoAplicado(parametros.closingSubject || "");
    } catch (err) {
      toastError(err);
    } finally {
      setLoading(false);
    }
  };

  const handleClearFilters = () => {
    setDateFrom(moment("1", "D").format("YYYY-MM-DD"));
    setDateTo(moment().format("YYYY-MM-DD"));
    setUserIds([]);
    setQueueIds([]);
    setSelectedStatus([]);
    setClosingSubject("");
  };

  const summary = useMemo(() => {
    const norm = (s) => String(s || "").toUpperCase();
    const closed = tickets.filter((t) => norm(t.status) === "FECHADO").length;
    const pending = tickets.filter((t) => norm(t.status) === "PENDENTE").length;
    const open = tickets.filter(
      (t) => norm(t.status) === "ABERTO" || norm(t.status) === "OPEN"
    ).length;

    let avgMinutes = 0;
    const durations = tickets
      .map((t) => {
        const o = t.openDate ? moment(t.openDate, "DD/MM/YYYY HH:mm") : null;
        const c = t.closeDate ? moment(t.closeDate, "DD/MM/YYYY HH:mm") : null;
        if (o && c && o.isValid() && c.isValid()) {
          return c.diff(o, "minutes");
        }
        return null;
      })
      .filter((v) => v !== null && v >= 0);
    if (durations.length) {
      avgMinutes = Math.round(
        durations.reduce((a, b) => a + b, 0) / durations.length
      );
    }
    const h = Math.floor(avgMinutes / 60);
    const m = avgMinutes % 60;
    const avgLabel = avgMinutes
      ? `${h > 0 ? `${h}h ` : ""}${m}min`
      : "-";

    return { total: tickets.length, closed, pending, open, avgLabel };
  }, [tickets]);

  const formatProtocol = (t) => {
    const created = t.openDate ? moment(t.openDate, "DD/MM/YYYY HH:mm") : null;
    const datePart = created && created.isValid() ? created.format("YYYYMMDD") : "";
    return `${datePart}${String(t.id).padStart(6, "0")}`;
  };

  const columns = () => [
    i18n.t("closingReport.columns.protocol"),
    i18n.t("closingReport.columns.contact"),
    i18n.t("closingReport.columns.agent"),
    i18n.t("closingReport.columns.queue"),
    i18n.t("closingReport.columns.status"),
    i18n.t("closingReport.columns.subject"),
    i18n.t("closingReport.columns.summary"),
    i18n.t("closingReport.columns.openDate"),
    i18n.t("closingReport.columns.closeDate"),
    i18n.t("closingReport.columns.duration"),
  ];

  const translateStatus = (status) => {
    if (!status) return "-";
    return i18n.t(`closingReport.statusLabels.${String(status).toUpperCase()}`, {
      defaultValue: status,
    });
  };

  const rowValues = (t) => [
    formatProtocol(t),
    t.contactName || "-",
    t.userName || "-",
    t.queueName || "-",
    translateStatus(t.status),
    t.closingSubject || "-",
    t.closingSummary || "-",
    t.openDate || "-",
    t.closeDate || "-",
    t.supportTime || "-",
  ];

  const exportExcel = () => {
    setExporting(true);
    try {
      const aoa = [
        [i18n.t("closingReport.title")],
        [
          `${i18n.t("closingReport.startDate")}: ${moment(dateFrom).format("DD/MM/YYYY")}`,
        ],
        [`${i18n.t("closingReport.endDate")}: ${moment(dateTo).format("DD/MM/YYYY")}`],
        [],
        columns(),
        ...tickets.map(rowValues),
      ];
      const ws = XLSX.utils.aoa_to_sheet(aoa);
      ws["!cols"] = columns().map(() => ({ wch: 20 }));
      const wb = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(wb, ws, "Report");
      XLSX.writeFile(wb, `${i18n.t("closingReport.filename")}.xlsx`);
    } catch (err) {
      toastError(err);
    } finally {
      setExporting(false);
    }
  };

  const exportPDF = () => {
    setExporting(true);
    try {
      const headerCells = columns()
        .map(
          (c) =>
            `<th style="border:1px solid #ddd;padding:6px;background:#003366;color:#fff;font-size:10px;text-align:left;">${c}</th>`
        )
        .join("");

      const bodyRows = tickets
        .map(
          (t) =>
            `<tr>${rowValues(t)
              .map(
                (v) =>
                  `<td style="border:1px solid #ddd;padding:6px;font-size:9px;">${String(
                    v
                  ).replace(/</g, "&lt;")}</td>`
              )
              .join("")}</tr>`
        )
        .join("");

      const html = `
        <div style="font-family: Arial, sans-serif; padding: 16px;">
          <h2 style="color:#003366;margin:0 0 4px;">${i18n.t("closingReport.title")}</h2>
          <p style="margin:0;font-size:11px;color:#555;">
            ${i18n.t("closingReport.startDate")}: ${moment(dateFrom).format("DD/MM/YYYY")} —
            ${i18n.t("closingReport.endDate")}: ${moment(dateTo).format("DD/MM/YYYY")}
          </p>
          <p style="margin:2px 0 12px;font-size:11px;color:#555;">
            ${i18n.t("closingReport.total")}: ${tickets.length}
          </p>
          <table style="width:100%;border-collapse:collapse;">
            <thead><tr>${headerCells}</tr></thead>
            <tbody>${bodyRows}</tbody>
          </table>
        </div>`;

      const element = document.createElement("div");
      element.innerHTML = html;

      html2pdf()
        .set({
          margin: 8,
          filename: `${i18n.t("closingReport.filename")}.pdf`,
          image: { type: "jpeg", quality: 0.98 },
          html2canvas: { scale: 2 },
          jsPDF: { unit: "mm", format: "a4", orientation: "landscape" },
        })
        .from(element)
        .save()
        .finally(() => setExporting(false));
    } catch (err) {
      toastError(err);
      setExporting(false);
    }
  };

  if (user.showDashboard !== "enabled" && user.profile !== "admin") {
    return <ForbiddenPage />;
  }

  return (
    <MainContainer>
      <MainHeader>
        <Title>{i18n.t("closingReport.title")}</Title>
      </MainHeader>
      <Paper className={classes.mainPaper} variant="outlined">
        <Box className={classes.filtersBox}>
          <TextField
            className={classes.filterItem}
            label={i18n.t("closingReport.startDate")}
            type="date"
            size="small"
            value={dateFrom}
            onChange={(e) => setDateFrom(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <TextField
            className={classes.filterItem}
            label={i18n.t("closingReport.endDate")}
            type="date"
            size="small"
            value={dateTo}
            onChange={(e) => setDateTo(e.target.value)}
            InputLabelProps={{ shrink: true }}
          />
          <Box className={classes.filterItem}>
            <UsersFilter onFiltered={(s) => setUserIds(s.map((u) => u.id))} />
          </Box>
          <Box className={classes.filterItem}>
            <QueueSelectCustom
              selectedQueueIds={queueIds}
              onChange={(values) => setQueueIds(values)}
            />
          </Box>
          <Box className={classes.filterItem}>
            <StatusFilter onFiltered={(s) => setSelectedStatus(s.map((i) => i.status))} />
          </Box>
          <TextField
            className={classes.filterItem}
            label={i18n.t("closingReport.subject")}
            select
            size="small"
            value={closingSubject}
            onChange={(e) => {
              const escolhido = e.target.value;
              setClosingSubject(escolhido);
              // Aplica na hora. Antes só valia depois de clicar em Filtrar,
              // e a tela continuava mostrando a lista inteira — parecia que
              // o filtro não funcionava.
              handleFilter({ closingSubject: escolhido || undefined });
            }}
            InputLabelProps={{ shrink: true }}
          >
            <MenuItem value="">{i18n.t("closingReport.allSubjects")}</MenuItem>
            {reasons.map((r) => (
              <MenuItem key={r.id} value={r.name}>
                {r.name}
              </MenuItem>
            ))}
          </TextField>
        </Box>

        <Box className={classes.actionsBox}>
          <Button
            variant="contained"
            color="primary"
            startIcon={<FilterList />}
            // Sem a arrow, o React passa o EVENTO como argumento e ele era
            // espalhado dentro dos parâmetros da consulta (buildParams recebe
            // `sobrescritas`), enchendo a query string com propriedades do
            // evento do DOM.
            onClick={() => handleFilter()}
            disabled={loading}
          >
            {i18n.t("closingReport.filter")}
          </Button>
          <Button
            variant="outlined"
            onClick={handleClearFilters}
            disabled={loading}
          >
            {i18n.t("closingReport.clearFilters")}
          </Button>
          <Button
            variant="outlined"
            startIcon={<GridOn />}
            onClick={exportExcel}
            disabled={exporting || tickets.length === 0}
          >
            {i18n.t("closingReport.exportExcel")}
          </Button>
          <Button
            variant="outlined"
            startIcon={<PictureAsPdf />}
            onClick={exportPDF}
            disabled={exporting || tickets.length === 0}
          >
            {i18n.t("closingReport.exportPDF")}
          </Button>
        </Box>

        {assuntoAplicado && (
          <Box style={{ marginBottom: 8 }}>
            <Typography variant="caption" color="textSecondary">
              Filtrando por assunto: <strong>{assuntoAplicado}</strong> — a
              lista abaixo mostra somente atendimentos com este assunto
              gravado.
            </Typography>
          </Box>
        )}

        <Box className={classes.summaryBox}>
          {[
            { label: i18n.t("closingReport.summary.total"), value: summary.total, color: undefined },
            { label: i18n.t("closingReport.summary.closed"), value: summary.closed, color: "#065F46" },
            { label: i18n.t("closingReport.summary.pending"), value: summary.pending, color: "#92400E" },
            { label: i18n.t("closingReport.summary.open"), value: summary.open, color: "#1D4ED8" },
            { label: i18n.t("closingReport.summary.avgDuration"), value: summary.avgLabel, color: undefined },
          ].map((card) => (
            <Box key={card.label} className={classes.summaryCard}>
              <span className={classes.summaryValue} style={card.color ? { color: card.color } : undefined}>
                {card.value}
              </span>
              <span className={classes.summaryLabel}>{card.label}</span>
            </Box>
          ))}
        </Box>



        {loading ? (
          <Box display="flex" justifyContent="center" p={4}>
            <CircularProgress />
          </Box>
        ) : (
          <div className={classes.tableWrapper}>
            <Table size="small">
              <TableHead>
                <TableRow>
                  {columns().map((c) => (
                    <TableCell key={c} style={{ fontWeight: 700 }}>
                      {c}
                    </TableCell>
                  ))}
                </TableRow>
              </TableHead>
              <TableBody>
                {tickets.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={columns().length} align="center">
                      <Typography variant="body2" color="textSecondary">
                        {i18n.t("closingReport.noData")}
                      </Typography>
                      {/* O assunto só é gravado quando a tela de fechamento
                          está ligada nas configurações. Sem esse aviso, filtrar
                          por assunto e não achar nada parece defeito do filtro,
                          quando na verdade nenhum atendimento tem assunto. */}
                      {closingSubject && (
                        <Typography
                          variant="caption"
                          color="textSecondary"
                          style={{ display: "block", marginTop: 8 }}
                        >
                          Nenhum atendimento com este assunto no período. O
                          assunto só é gravado quando a opção "Tela de
                          fechamento de chamado" está ativa em Configurações —
                          atendimentos fechados antes disso ficam sem assunto.
                        </Typography>
                      )}
                    </TableCell>
                  </TableRow>
                ) : (
                  tickets.map((t) => (
                    <TableRow key={t.id} hover>
                      <TableCell>{formatProtocol(t)}</TableCell>
                      <TableCell>{t.contactName || "-"}</TableCell>
                      <TableCell>{t.userName || "-"}</TableCell>
                      <TableCell>{t.queueName || "-"}</TableCell>
                      <TableCell>
                        <span
                          className={classes.statusChip}
                          style={statusStyle(t.status)}
                        >
                          {t.status
                            ? i18n.t(`closingReport.statusLabels.${String(t.status).toUpperCase()}`, { defaultValue: t.status })
                            : "-"}
                        </span>
                      </TableCell>
                      <TableCell>{t.closingSubject || "-"}</TableCell>
                      <TableCell className={classes.summaryCell}>
                        {t.closingSummary || "-"}
                      </TableCell>
                      <TableCell>{t.openDate || "-"}</TableCell>
                      <TableCell>{t.closeDate || "-"}</TableCell>
                      <TableCell>{t.supportTime || "-"}</TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        )}
      </Paper>
    </MainContainer>
  );
};

export default ClosingReport;
