import React, { useState, useEffect } from "react";
import { toast } from "react-toastify";
import { i18n } from "../../translate/i18n";
import {
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Typography,
  Grid,
  Card,
  CardContent,
  TextField,
  Button,
  FormControl,
  InputLabel,
  Select,
  MenuItem,
  Box,
  Chip,
} from "@material-ui/core";
import { makeStyles } from "@material-ui/core/styles";
import format from "date-fns/format";

import api from "../../services/api";
import toastError from "../../errors/toastError";
import { formatCurrency } from "../../helpers/currencyHelper";
import { Skeleton } from "@material-ui/lab";
import { useContext } from "react";
import { AuthContext } from "../../context/Auth/AuthContext";
import useCompanyCurrency from "../../hooks/useCompanyCurrency";

const useStyles = makeStyles((theme) => ({
  root: {
    padding: theme.spacing(3),
  },
  title: {
    marginBottom: theme.spacing(3),
  },
  card: {
    marginBottom: theme.spacing(2),
  },
  statsCard: {
    textAlign: "center",
    marginBottom: theme.spacing(2),
  },
  statsValue: {
    fontSize: "2rem",
    fontWeight: "bold",
    color: theme.palette.primary.main,
  },
  statsLabel: {
    color: theme.palette.text.secondary,
  },
  filterSection: {
    marginBottom: theme.spacing(3),
    padding: theme.spacing(2),
    backgroundColor: theme.palette.background.default,
  },
  table: {
    minWidth: 650,
  },
  chip: {
    margin: theme.spacing(0.5),
  },
}));

const RelatorioVendas = () => {
  const classes = useStyles();
  const { user } = useContext(AuthContext);
  const [loading, setLoading] = useState(false);
  const [relatorio, setRelatorio] = useState(null);
  const [users, setUsers] = useState([]);
  const [filters, setFilters] = useState({
    dateFrom: format(new Date().setDate(1), "yyyy-MM-dd"),
    dateTo: format(new Date(), "yyyy-MM-dd"),
    userId: "",
    motivoNaoVenda: "",
    motivoFinalizacao: "",
  });

  const { currencyReady } = useCompanyCurrency(user?.companyId);

  useEffect(() => {
    fetchUsers();
  }, []);

  const fetchUsers = async () => {
    try {
      const { data } = await api.get("/users");
      setUsers(data.users);
    } catch (err) {
      toastError(err);
    }
  };

  const handleFilterChange = (field, value) => {
    setFilters((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleGenerateReport = async () => {
    if (!filters.dateFrom || !filters.dateTo) {
      toast.error(i18n.t("hardcoded.selectPeriod"));
      return;
    }

    setLoading(true);
    try {
      const params = new URLSearchParams({
        dateFrom: filters.dateFrom,
        dateTo: filters.dateTo,
      });

      if (filters.userId) {
        params.append("userId", filters.userId);
      }

      const { data } = await api.get(`/ticketreport/vendas?${params}`);
      setRelatorio(data);
    } catch (err) {
      toastError(err);
    } finally {
      setLoading(false);
    }
  };

  // Novo: filtrar tickets por motivo
  const filteredTickets = (relatorio?.tickets || []).filter((ticket) => {
    let motivoNaoVendaOk = true;
    let motivoFinalizacaoOk = true;
    if (filters.motivoNaoVenda) {
      motivoNaoVendaOk = ticket.motivoNaoVenda === filters.motivoNaoVenda;
    }
    if (filters.motivoFinalizacao) {
      motivoFinalizacaoOk =
        ticket.motivoFinalizacao === filters.motivoFinalizacao;
    }
    return motivoNaoVendaOk && motivoFinalizacaoOk;
  });

  if (!relatorio) {
    return (
      <div className={classes.root}>
        <Typography variant="h4" className={classes.title}>
          {i18n.t("hardcoded.salesReport")}
        </Typography>

        <Paper className={classes.filterSection}>
          <Grid container spacing={2} alignItems="center">
            <Grid item xs={12} sm={3}>
              <TextField
                label={i18n.t("hardcoded.startDate")}
                type="date"
                value={filters.dateFrom}
                onChange={(e) => handleFilterChange("dateFrom", e.target.value)}
                fullWidth
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12} sm={3}>
              <TextField
                label={i18n.t("hardcoded.endDate")}
                type="date"
                value={filters.dateTo}
                onChange={(e) => handleFilterChange("dateTo", e.target.value)}
                fullWidth
                InputLabelProps={{ shrink: true }}
              />
            </Grid>
            <Grid item xs={12} sm={3}>
              <FormControl fullWidth>
                <InputLabel>{i18n.t("hardcoded.agent")}</InputLabel>
                <Select
                  value={filters.userId}
                  onChange={(e) => handleFilterChange("userId", e.target.value)}
                >
                  <MenuItem value="">{i18n.t("hardcoded.all")}</MenuItem>
                  {users.map((user) => (
                    <MenuItem key={user.id} value={user.id}>
                      {user.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            </Grid>
            <Grid item xs={12} sm={3}>
              <Button
                variant="contained"
                color="primary"
                onClick={handleGenerateReport}
                disabled={loading}
                fullWidth
              >
                {loading ? i18n.t("hardcoded.generating") : i18n.t("hardcoded.generateReport")}
              </Button>
            </Grid>
          </Grid>
        </Paper>
      </div>
    );
  }

  return (
    <div className={classes.root}>
      <Typography variant="h4" className={classes.title}>
        {i18n.t("hardcoded.salesReport")}
      </Typography>

      <Paper className={classes.filterSection}>
        <Grid container spacing={2} alignItems="center">
          <Grid item xs={12} sm={3}>
            <TextField
              label={i18n.t("hardcoded.startDate")}
              type="date"
              value={filters.dateFrom}
              onChange={(e) => handleFilterChange("dateFrom", e.target.value)}
              fullWidth
              InputLabelProps={{ shrink: true }}
            />
          </Grid>
          <Grid item xs={12} sm={3}>
            <TextField
              label={i18n.t("hardcoded.endDate")}
              type="date"
              value={filters.dateTo}
              onChange={(e) => handleFilterChange("dateTo", e.target.value)}
              fullWidth
              InputLabelProps={{ shrink: true }}
            />
          </Grid>
          <Grid item xs={12} sm={3}>
            <FormControl fullWidth>
              <InputLabel>{i18n.t("hardcoded.agent")}</InputLabel>
              <Select
                value={filters.userId}
                onChange={(e) => handleFilterChange("userId", e.target.value)}
              >
                  <MenuItem value="">{i18n.t("hardcoded.all")}</MenuItem>
                {users.map((user) => (
                  <MenuItem key={user.id} value={user.id}>
                    {user.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={3}>
            <FormControl fullWidth>
              <InputLabel>{i18n.t("hardcoded.nonSaleReasonFilter")}</InputLabel>
              <Select
                value={filters.motivoNaoVenda}
                onChange={(e) =>
                  handleFilterChange("motivoNaoVenda", e.target.value)
                }
              >
                <MenuItem value="">{i18n.t("hardcoded.all")}</MenuItem>
                {(relatorio?.motivosNaoVenda || []).map((item, idx) => (
                  <MenuItem key={idx} value={item.motivo}>
                    {item.motivo}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={3}>
            <FormControl fullWidth>
              <InputLabel>{i18n.t("hardcoded.closingReasonFilter")}</InputLabel>
              <Select
                value={filters.motivoFinalizacao}
                onChange={(e) =>
                  handleFilterChange("motivoFinalizacao", e.target.value)
                }
              >
                <MenuItem value="">{i18n.t("hardcoded.all")}</MenuItem>
                {(relatorio?.motivosFinalizacao || []).map((item, idx) => (
                  <MenuItem key={idx} value={item.motivo}>
                    {item.motivo}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} sm={3}>
            <Button
              variant="contained"
              color="primary"
              onClick={handleGenerateReport}
              disabled={loading}
              fullWidth
            >
              {loading ? i18n.t("hardcoded.generating") : i18n.t("hardcoded.generateReport")}
            </Button>
          </Grid>
        </Grid>
      </Paper>

      {/* Estatísticas Gerais */}
      <Grid container spacing={3} className={classes.card}>
        <Grid item xs={12} sm={3}>
          <Card className={classes.statsCard}>
            <CardContent>
              <Typography className={classes.statsValue}>
                {relatorio.totalVendas}
              </Typography>
              <Typography className={classes.statsLabel}>
                {i18n.t("hardcoded.totalSales")}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={3}>
          <Card className={classes.statsCard}>
            <CardContent>
              <Typography className={classes.statsValue}>
                {currencyReady ? formatCurrency(relatorio.totalValorVendas) : <Skeleton variant="text" width={120} style={{ display: "inline-block" }} />}
              </Typography>
              <Typography className={classes.statsLabel}>
                {i18n.t("hardcoded.totalSalesValue")}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={3}>
          <Card className={classes.statsCard}>
            <CardContent>
              <Typography className={classes.statsValue}>
                {relatorio.totalNaoVendas}
              </Typography>
              <Typography className={classes.statsLabel}>{i18n.t("hardcoded.nonSales")}</Typography>
            </CardContent>
          </Card>
        </Grid>
        <Grid item xs={12} sm={3}>
          <Card className={classes.statsCard}>
            <CardContent>
              <Typography className={classes.statsValue}>
                {relatorio.mediaTicketPorAtendente.toFixed(1)}
              </Typography>
              <Typography className={classes.statsLabel}>
                {i18n.t("hardcoded.avgTicketsPerAgent")}
              </Typography>
            </CardContent>
          </Card>
        </Grid>
      </Grid>

      {/* Motivos de Não Venda */}
      {relatorio.motivosNaoVenda.length > 0 && (
        <Paper className={classes.card}>
          <Typography variant="h6" style={{ padding: 16 }}>
            {i18n.t("hardcoded.nonSaleReasons")}
          </Typography>
          <Box style={{ padding: 16 }}>
            {relatorio.motivosNaoVenda.map((item, index) => (
              <Chip
                key={index}
                label={`${item.motivo} (${item.quantidade})`}
                className={classes.chip}
                color="secondary"
                variant="outlined"
              />
            ))}
          </Box>
        </Paper>
      )}

      {/* Tabela detalhada de tickets */}
      {filteredTickets.length > 0 && (
        <Paper className={classes.card}>
          <Typography variant="h6" style={{ padding: 16 }}>
            {i18n.t("hardcoded.closedTickets")}
          </Typography>
          <Table className={classes.table}>
            <TableHead>
              <TableRow>
                <TableCell>ID</TableCell>
                <TableCell>{i18n.t("hardcoded.agent")}</TableCell>
                <TableCell>{i18n.t("hardcoded.date")}</TableCell>
                <TableCell>{i18n.t("hardcoded.saleValue")}</TableCell>
                <TableCell>{i18n.t("hardcoded.nonSaleReason")}</TableCell>
                <TableCell>{i18n.t("hardcoded.closingReason")}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {filteredTickets.map((ticket) => (
                <TableRow key={ticket.id}>
                  <TableCell>{ticket.id}</TableCell>
                  <TableCell>{ticket.user?.name || "-"}</TableCell>
                  <TableCell>
                    {format(new Date(ticket.createdAt), "dd/MM/yyyy")}
                  </TableCell>
                  <TableCell>
                    {ticket.valorVenda
                      ? (currencyReady ? formatCurrency(ticket.valorVenda) : <Skeleton variant="text" width={70} style={{ display: "inline-block" }} />)
                      : "-"}
                  </TableCell>
                  <TableCell>{ticket.motivoNaoVenda || "-"}</TableCell>
                  <TableCell>{ticket.motivoFinalizacao || "-"}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </Paper>
      )}

      {/* Tabela de Atendentes */}
      <Paper className={classes.card}>
        <Typography variant="h6" style={{ padding: 16 }}>
          {i18n.t("hardcoded.agentPerformance")}
        </Typography>
        <Table className={classes.table}>
          <TableHead>
            <TableRow>
               <TableCell>{i18n.t("hardcoded.agent")}</TableCell>
              <TableCell align="right">{i18n.t("hardcoded.totalSales")}</TableCell>
              <TableCell align="right">{i18n.t("hardcoded.totalSalesValue")}</TableCell>
              <TableCell align="right">{i18n.t("hardcoded.nonSales")}</TableCell>
              <TableCell align="right">{i18n.t("hardcoded.totalTickets")}</TableCell>
              <TableCell align="right">{i18n.t("hardcoded.avgTickets")}</TableCell>
            </TableRow>
          </TableHead>
          <TableBody>
            {relatorio.atendentes.map((atendente) => (
              <TableRow key={atendente.id}>
                <TableCell>{atendente.name}</TableCell>
                <TableCell align="right">{atendente.totalVendas}</TableCell>
                <TableCell align="right">
                  {currencyReady ? formatCurrency(atendente.totalValorVendas) : <Skeleton variant="text" width={70} style={{ display: "inline-block" }} />}
                </TableCell>
                <TableCell align="right">{atendente.totalNaoVendas}</TableCell>
                <TableCell align="right">{atendente.totalTickets}</TableCell>
                <TableCell align="right">{atendente.mediaTicket}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
    </div>
  );
};

export default RelatorioVendas;
