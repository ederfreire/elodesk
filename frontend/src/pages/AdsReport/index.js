import React, { useEffect, useState, useCallback, useMemo} from "react";
import * as XLSX from "xlsx";
import {
  Paper,
  Grid,
  TextField,
  MenuItem,
  Button,
  Table,
  TableHead,
  TableBody,
  TableRow,
  TableCell,
  Typography,
  Box,
  Chip,
  CircularProgress,
  Tooltip,
} from "@material-ui/core";
import { makeStyles } from "@material-ui/core/styles";
import SaveAlt from "@material-ui/icons/SaveAlt";
import CampaignIcon from "@mui/icons-material/Campaign";
import moment from "moment";
import api from "../../services/api";
import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import Title from "../../components/Title";
import toastError from "../../errors/toastError";
import { i18n } from "../../translate/i18n";
import {
  ResponsiveContainer,
  BarChart,
  Bar,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RTooltip,
  Legend,
} from "recharts";

const useStyles = makeStyles((theme) => ({
  root: {
    padding: theme.spacing(2),
    display: "flex",
    flexDirection: "column",
    gap: theme.spacing(2),
    overflow: "auto",
    // Item de flex encolhe por padrao (`flex-shrink: 1`). Enquanto esta tela
    // era uma pagina inteira isso nunca aparecia, porque a altura era livre.
    // Dentro da aba de Relatorios ela passou a receber altura fixa, e cada
    // Paper foi espremido ate virar uma faixa com barra de rolagem propria —
    // as tabelas ficavam cortadas em ~40px.
    //
    // Com flexShrink 0 os blocos mantem a altura do conteudo e quem rola e o
    // container, uma barra so para a pagina toda.
    "& > *": {
      flexShrink: 0,
    },
  },
  filters: {
    padding: theme.spacing(2),
  },
  kpis: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(140px, 1fr))",
    gap: theme.spacing(1.5),
  },
  kpiCard: {
    padding: theme.spacing(1.5, 2),
    display: "flex",
    flexDirection: "column",
    gap: 4,
  },
  kpiValue: { fontSize: 22, fontWeight: 700 },
  kpiLabel: { fontSize: 12, color: theme.palette.text.secondary, textTransform: "uppercase" },
  graficos: {
    flexShrink: 0,
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))",
    gap: 16,
    marginBottom: 16,
  },
  grafico: {
    padding: 16,
    borderRadius: 12,
  },
  tituloGrafico: {
    fontWeight: 700,
    fontSize: 14,
    marginBottom: 12,
  },
  tableWrap: { padding: theme.spacing(1.5), overflowX: "auto" },
}));

const STATUS_COLOR = {
  new: "default",
  contact: "primary",
  qualified: "primary",
  purchase: "secondary",
  lost: "default",
};
const statusLabel = (k) =>
  i18n.t(`adsReport.statusOptions.${k}`) || k;

const today = moment().format("YYYY-MM-DD");
const monthAgo = moment().subtract(30, "days").format("YYYY-MM-DD");

const AdsReport = () => {
  const classes = useStyles();
  const [loading, setLoading] = useState(false);
  const [startDate, setStartDate] = useState(monthAgo);
  const [endDate, setEndDate] = useState(today);
  const [status, setStatus] = useState("all");
  const [searchParam, setSearchParam] = useState("");
  const [data, setData] = useState({ leads: [], totals: {}, byAd: [], count: 0 });
  const [utmData, setUtmData] = useState([]);
  const [sourceData, setSourceData] = useState([]);

  // Dados dos graficos derivados do proprio `data`, com useMemo: sem isso
  // eles seriam remontados a cada render e o recharts refaria a animacao de
  // entrada toda vez que qualquer estado da tela mudasse.
  // "__sem_origem__" e o marcador que o backend usa para contato sem origem
  // marcada. Traduzido aqui, e nao no SQL, para respeitar o idioma da tela.
  const nomeOrigem = (s) =>
    s === "__sem_origem__" ? i18n.t("leadSource.none") : s;

  const origensOrdenadas = useMemo(
    () => [...sourceData].sort((a, b) => b.leads - a.leads),
    [sourceData]
  );

  const graficoOrigens = useMemo(
    () =>
      origensOrdenadas
        .filter((o) => o.leads > 0)
        .slice(0, 10)
        .map((o) => ({
          nome: nomeOrigem(o.source),
          leads: o.leads,
          cor: o.color || "#6366f1",
        })),
    [origensOrdenadas]
  );

  const dadosFunil = useMemo(() => {
    const t = data.totals || {};
    return [
      { nome: i18n.t("adsReport.kpis.total"), valor: Number(t.total) || 0, cor: "#6366f1" },
      { nome: i18n.t("adsReport.kpis.new"), valor: Number(t.new) || 0, cor: "#3b82f6" },
      { nome: i18n.t("adsReport.kpis.contact"), valor: Number(t.contact) || 0, cor: "#0ea5e9" },
      { nome: i18n.t("adsReport.kpis.qualified"), valor: Number(t.qualified) || 0, cor: "#f59e0b" },
      { nome: i18n.t("adsReport.kpis.purchase"), valor: Number(t.purchase) || 0, cor: "#22c55e" },
      { nome: i18n.t("adsReport.kpis.lost"), valor: Number(t.lost) || 0, cor: "#ef4444" },
    ];
  }, [data.totals]);

  // O rosca ignora o "total", que nao e um status e sim a soma — inclui-lo
  // faria metade da rosca ser a propria rosca.
  const dadosStatus = useMemo(
    () => dadosFunil.filter(d => d.valor > 0 && d.nome !== i18n.t("adsReport.kpis.total")),
    [dadosFunil]
  );

  // Top 8: com dezenas de anuncios as barras ficam finas demais para ler, e o
  // que interessa num ranking sao os primeiros.
  const topAnuncios = useMemo(
    () =>
      [...(data.byAd || [])]
        .map(a => ({
          nome: String(a.name || a.adName || a.id || "—").slice(0, 28),
          leads: Number(a.leads ?? a.count ?? 0),
        }))
        .filter(a => a.leads > 0)
        .sort((a, b) => b.leads - a.leads)
        .slice(0, 8)
        .reverse(),
    [data.byAd]
  );

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      // Relatorio UTM: os links criados em "Links UTM" tem a propria
      // atribuicao (codigo na primeira mensagem), separada da captura de
      // anuncio da Meta. Como as duas respondem a mesma pergunta — qual
      // anuncio trouxe cliente — passam a conviver nesta tela, em vez de
      // exigirem dois relatorios em lugares diferentes.
      api
        .get("/utm-links/report", { params: { startDate, endDate } })
        .then(({ data: utm }) => setUtmData(Array.isArray(utm) ? utm : []))
        .catch(() => setUtmData([]));

      // Origem do lead: o que o atendente marca no chip do atendimento.
      // Convive com a captura da Meta e com os links UTM porque as tres
      // respondem a mesma pergunta por caminhos diferentes — anuncio
      // capturado, codigo no link, e marcacao manual.
      api
        .get("/lead-sources/report", { params: { startDate, endDate } })
        .then(({ data: src }) => setSourceData(Array.isArray(src) ? src : []))
        .catch(() => setSourceData([]));

      const { data: res } = await api.get("/leads/report", {
        params: { startDate, endDate, status, searchParam, pageNumber: 1 },
      });
      setData(res);
    } catch (err) {
      toastError(err);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, status, searchParam]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const exportXlsx = () => {
    const c = (k) => i18n.t(`adsReport.columns.${k}`);
    const rows = data.leads.map((l) => ({
      [c("date")]: moment(l.createdAt).format("DD/MM/YYYY HH:mm"),
      [c("contact")]: l.contact?.name || "",
      [c("phone")]: l.phone,
      [c("ad")]: l.adTitle || "",
      [`${c("ad")} ${c("id")}`]: l.adId || "",
      "CTWA CLID": l.ctwa_clid || "",
      [c("origin")]: l.sourceType || "",
      URL: l.sourceUrl || "",
      [c("channel")]: l.channel,
      [c("status")]: statusLabel(l.status),
      [c("capi")]: l.lastCapiEvent || "",
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, i18n.t("adsReport.leadsTitle"));

    const adsRows = (data.byAd || []).map((a) => ({
      [c("ad")]: a.adTitle,
      [`${c("ad")} ${c("id")}`]: a.adId,
      [c("leads")]: a.total,
      [c("sales")]: a.purchases,
      [c("conv")]: a.total ? ((a.purchases / a.total) * 100).toFixed(1) : "0",
    }));
    const wsAds = XLSX.utils.json_to_sheet(adsRows);
    XLSX.utils.book_append_sheet(wb, wsAds, i18n.t("adsReport.performanceTitle"));

    XLSX.writeFile(wb, `relatorio-anuncios-${today}.xlsx`);
  };

  return (
    <MainContainer>
      <MainHeader>
        <Title>
          <CampaignIcon style={{ verticalAlign: "middle", marginRight: 8 }} />
          {i18n.t("adsReport.title")}
        </Title>
      </MainHeader>

      <Paper className={classes.root} variant="outlined">
        <Paper className={classes.filters} variant="outlined">
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} sm={6} md={2}>
              <TextField
                fullWidth
                size="small"
                label={i18n.t("adsReport.startDate")}
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={2}>
              <TextField
                fullWidth
                size="small"
                label={i18n.t("adsReport.endDate")}
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12} sm={6} md={2}>
              <TextField
                fullWidth
                size="small"
                select
                label={i18n.t("adsReport.status")}
                value={status}
                onChange={(e) => setStatus(e.target.value)}
              >
                <MenuItem value="all">{i18n.t("adsReport.statusOptions.all")}</MenuItem>
                <MenuItem value="new">{i18n.t("adsReport.statusOptions.new")}</MenuItem>
                <MenuItem value="contact">{i18n.t("adsReport.statusOptions.contact")}</MenuItem>
                <MenuItem value="qualified">{i18n.t("adsReport.statusOptions.qualified")}</MenuItem>
                <MenuItem value="purchase">{i18n.t("adsReport.statusOptions.purchase")}</MenuItem>
                <MenuItem value="lost">{i18n.t("adsReport.statusOptions.lost")}</MenuItem>
              </TextField>
            </Grid>
            <Grid item xs={12} sm={6} md={3}>
              <TextField
                fullWidth
                size="small"
                label={i18n.t("adsReport.search")}
                value={searchParam}
                onChange={(e) => setSearchParam(e.target.value)}
              />
            </Grid>
            <Grid item xs={12} md={3}>
              <Box display="flex" gap={1} style={{ gap: 8 }}>
                <Button variant="contained" color="primary" onClick={fetchData} disabled={loading}>
                  {loading ? <CircularProgress size={20} /> : i18n.t("adsReport.filter")}
                </Button>
                <Button variant="outlined" startIcon={<SaveAlt />} onClick={exportXlsx} disabled={!data.leads.length}>
                  {i18n.t("adsReport.export")}
                </Button>
              </Box>
            </Grid>
          </Grid>
        </Paper>

        <Box className={classes.kpis}>
          {[
            { k: "total", label: i18n.t("adsReport.kpis.total") },
            { k: "new", label: i18n.t("adsReport.kpis.new") },
            { k: "contact", label: i18n.t("adsReport.kpis.contact") },
            { k: "qualified", label: i18n.t("adsReport.kpis.qualified") },
            { k: "purchase", label: i18n.t("adsReport.kpis.purchase") },
            { k: "lost", label: i18n.t("adsReport.kpis.lost") },
          ].map((kpi) => (
            <Paper key={kpi.k} className={classes.kpiCard} variant="outlined">
              <span className={classes.kpiLabel}>{kpi.label}</span>
              <span className={classes.kpiValue}>{data.totals?.[kpi.k] || 0}</span>
            </Paper>
          ))}
        </Box>

        {/* GRAFICOS
            Vem logo depois dos KPIs e antes das tabelas: numero grande da a
            ordem de grandeza, grafico mostra a distribuicao, tabela traz o
            detalhe. Ler na ordem inversa obriga a somar de cabeca. */}
        <Box className={classes.graficos}>
          <Paper className={classes.grafico} variant="outlined">
            <Typography variant="subtitle2" className={classes.tituloGrafico}>
              {i18n.t("adsReport.charts.funnel")}
            </Typography>
            <ResponsiveContainer width="100%" height={260}>
              <BarChart data={dadosFunil} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
                <XAxis dataKey="nome" tick={{ fontSize: 12 }} />
                <YAxis allowDecimals={false} tick={{ fontSize: 12 }} />
                <RTooltip />
                <Bar dataKey="valor" radius={[6, 6, 0, 0]}>
                  {dadosFunil.map((d, i) => (
                    <Cell key={i} fill={d.cor} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </Paper>

          <Paper className={classes.grafico} variant="outlined">
            <Typography variant="subtitle2" className={classes.tituloGrafico}>
              {i18n.t("adsReport.charts.byStatus")}
            </Typography>
            <ResponsiveContainer width="100%" height={260}>
              <PieChart>
                <Pie
                  data={dadosStatus}
                  dataKey="valor"
                  nameKey="nome"
                  innerRadius={58}
                  outerRadius={92}
                  paddingAngle={2}
                >
                  {dadosStatus.map((d, i) => (
                    <Cell key={i} fill={d.cor} />
                  ))}
                </Pie>
                <RTooltip />
                <Legend verticalAlign="bottom" iconType="circle" wrapperStyle={{ fontSize: 12 }} />
              </PieChart>
            </ResponsiveContainer>
          </Paper>

          {graficoOrigens.length > 0 && (
            <Paper className={classes.grafico} variant="outlined">
              <Typography variant="subtitle2" className={classes.tituloGrafico}>
                {i18n.t("adsReport.charts.bySource")}
              </Typography>
              <ResponsiveContainer width="100%" height={260}>
                {/* Horizontal: nome de origem e longo ("Instagram Ads") e
                    ficaria ilegivel girado no eixo X. */}
                <BarChart
                  data={[...graficoOrigens].reverse()}
                  layout="vertical"
                  margin={{ top: 8, right: 16, left: 8, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                  <YAxis type="category" dataKey="nome" width={130} tick={{ fontSize: 11 }} />
                  <RTooltip />
                  <Bar dataKey="leads" radius={[0, 6, 6, 0]}>
                    {[...graficoOrigens].reverse().map((d, i) => (
                      <Cell key={i} fill={d.cor} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </Paper>
          )}

          {topAnuncios.length > 0 && (
            <Paper className={classes.grafico} variant="outlined">
              <Typography variant="subtitle2" className={classes.tituloGrafico}>
                {i18n.t("adsReport.charts.topAds")}
              </Typography>
              <ResponsiveContainer width="100%" height={260}>
                {/* layout vertical: nome de anuncio e longo e ficaria
                    ilegivel girado no eixo X. */}
                <BarChart
                  data={topAnuncios}
                  layout="vertical"
                  margin={{ top: 8, right: 16, left: 8, bottom: 0 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#e2e8f0" />
                  <XAxis type="number" allowDecimals={false} tick={{ fontSize: 12 }} />
                  <YAxis
                    type="category"
                    dataKey="nome"
                    width={130}
                    tick={{ fontSize: 11 }}
                  />
                  <RTooltip />
                  <Bar dataKey="leads" fill="#6366f1" radius={[0, 6, 6, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </Paper>
          )}
        </Box>

        <Paper className={classes.tableWrap} variant="outlined">
          <Typography variant="subtitle1" style={{ padding: 8 }}>
            {i18n.t("adsReport.performanceTitle")}
          </Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{i18n.t("adsReport.columns.ad")}</TableCell>
                <TableCell>{i18n.t("adsReport.columns.id")}</TableCell>
                <TableCell align="right">{i18n.t("adsReport.columns.leads")}</TableCell>
                <TableCell align="right">{i18n.t("adsReport.columns.sales")}</TableCell>
                <TableCell align="right">{i18n.t("adsReport.columns.conv")}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {(data.byAd || []).map((a, idx) => (
                <TableRow key={`${a.adId}-${idx}`}>
                  <TableCell>{a.adTitle}</TableCell>
                  <TableCell>{a.adId}</TableCell>
                  <TableCell align="right">{a.total}</TableCell>
                  <TableCell align="right">{a.purchases}</TableCell>
                  <TableCell align="right">
                    {a.total ? ((a.purchases / a.total) * 100).toFixed(1) : "0"}%
                  </TableCell>
                </TableRow>
              ))}
              {!data.byAd?.length && (
                <TableRow>
                  <TableCell colSpan={5} align="center" style={{ color: "#888" }}>
                    {i18n.t("adsReport.empty.ads")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Paper>

        {sourceData.length > 0 && (
          <Paper className={classes.tableWrap} variant="outlined">
            <Typography variant="subtitle1" style={{ padding: 8 }}>
              {i18n.t("adsReport.sourceTitle")}
            </Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{i18n.t("leadSource.label")}</TableCell>
                  <TableCell align="right">{i18n.t("utmLinks.report.leads")}</TableCell>
                  <TableCell align="right">{i18n.t("utmLinks.report.tickets")}</TableCell>
                  <TableCell align="right">{i18n.t("utmLinks.report.closed")}</TableCell>
                  <TableCell align="right">{i18n.t("utmLinks.report.converted")}</TableCell>
                  <TableCell align="right">{i18n.t("adsReport.columns.conv")}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {origensOrdenadas.map((o) => (
                  <TableRow key={o.source}>
                    <TableCell>
                      <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
                        {/* Bolinha na cor cadastrada da origem: liga a linha
                            da tabela a barra do grafico acima. */}
                        <span
                          style={{
                            width: 10,
                            height: 10,
                            borderRadius: "50%",
                            backgroundColor: o.color || "#94a3b8",
                            flexShrink: 0,
                          }}
                        />
                        {nomeOrigem(o.source)}
                      </span>
                    </TableCell>
                    <TableCell align="right"><strong>{o.leads}</strong></TableCell>
                    <TableCell align="right">{o.tickets}</TableCell>
                    <TableCell align="right">{o.closedTickets}</TableCell>
                    <TableCell align="right">{o.convertedLeads}</TableCell>
                    <TableCell align="right">{(o.conversionRate ?? 0).toFixed(1)}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>
        )}

        {/* Links UTM — so aparece quando ha link cadastrado, para nao poluir
            a tela de quem nao usa esse recurso. */}
        {utmData.length > 0 && (
          <Paper className={classes.tableWrap} variant="outlined">
            <Typography variant="subtitle1" style={{ padding: 8 }}>
              {i18n.t("adsReport.utmTitle")}
            </Typography>
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell>{i18n.t("utmLinks.fields.name")}</TableCell>
                  <TableCell>{i18n.t("utmLinks.fields.source")}</TableCell>
                  <TableCell>{i18n.t("utmLinks.fields.campaign")}</TableCell>
                  <TableCell>{i18n.t("utmLinks.code")}</TableCell>
                  <TableCell align="right">{i18n.t("utmLinks.report.leads")}</TableCell>
                  <TableCell align="right">{i18n.t("utmLinks.report.tickets")}</TableCell>
                  <TableCell align="right">{i18n.t("utmLinks.report.closed")}</TableCell>
                  <TableCell align="right">{i18n.t("utmLinks.report.converted")}</TableCell>
                  <TableCell align="right">{i18n.t("adsReport.columns.conv")}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                {utmData.map((u) => (
                  <TableRow key={u.id}>
                    <TableCell>{u.name}</TableCell>
                    <TableCell>{u.source}</TableCell>
                    <TableCell>{u.campaign || "—"}</TableCell>
                    <TableCell style={{ fontFamily: "'Roboto Mono', monospace", fontWeight: 700 }}>
                      {u.code}
                    </TableCell>
                    <TableCell align="right"><strong>{u.leads}</strong></TableCell>
                    <TableCell align="right">{u.tickets}</TableCell>
                    <TableCell align="right">{u.closedTickets}</TableCell>
                    <TableCell align="right">{u.convertedLeads ?? 0}</TableCell>
                    {/* Conversao vem pronta do backend. O calculo que estava
                        aqui era encerrados/leads, e como um lead pode abrir
                        varios atendimentos passava de 100% facilmente — 1 lead
                        com 15 encerrados dava 1500%. Agora e leads que
                        converteram sobre leads totais. */}
                    <TableCell align="right">
                      {(u.conversionRate ?? 0).toFixed(1)}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </Paper>
        )}

        <Paper className={classes.tableWrap} variant="outlined">
          <Typography variant="subtitle1" style={{ padding: 8 }}>
            {i18n.t("adsReport.leadsTitle")} ({data.count || 0})
          </Typography>
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell>{i18n.t("adsReport.columns.date")}</TableCell>
                <TableCell>{i18n.t("adsReport.columns.contact")}</TableCell>
                <TableCell>{i18n.t("adsReport.columns.phone")}</TableCell>
                <TableCell>{i18n.t("adsReport.columns.ad")}</TableCell>
                <TableCell>{i18n.t("adsReport.columns.origin")}</TableCell>
                <TableCell>{i18n.t("adsReport.columns.channel")}</TableCell>
                <TableCell>{i18n.t("adsReport.columns.status")}</TableCell>
                <TableCell>{i18n.t("adsReport.columns.capi")}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {data.leads.map((l) => {
                const st = { label: statusLabel(l.status), color: STATUS_COLOR[l.status] || "default" };
                return (
                  <TableRow key={l.id}>
                    <TableCell>{moment(l.createdAt).format("DD/MM/YY HH:mm")}</TableCell>
                    <TableCell>{l.contact?.name || "-"}</TableCell>
                    <TableCell>{l.phone}</TableCell>
                    <TableCell>
                      <Tooltip title={l.adBody || ""}>
                        <span>{l.adTitle || "-"}</span>
                      </Tooltip>
                    </TableCell>
                    <TableCell>{l.sourceType || "-"}</TableCell>
                    <TableCell>{l.channel}</TableCell>
                    <TableCell>
                      <Chip size="small" label={st.label} color={st.color} />
                    </TableCell>
                    <TableCell>
                      {l.lastCapiEvent ? (
                        <Tooltip title={l.lastCapiError || i18n.t("adsReport.capiTooltip", { when: moment(l.lastCapiAt).fromNow() })}>
                          <Chip
                            size="small"
                            label={l.lastCapiEvent}
                            color={l.lastCapiError ? "default" : "primary"}
                          />
                        </Tooltip>
                      ) : (
                        "-"
                      )}
                    </TableCell>
                  </TableRow>
                );
              })}
              {!data.leads.length && (
                <TableRow>
                  <TableCell colSpan={8} align="center" style={{ color: "#888" }}>
                    {i18n.t("adsReport.empty.leads")}
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Paper>
      </Paper>
    </MainContainer>
  );
};

export default AdsReport;