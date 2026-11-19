import React, { useEffect, useState, useCallback } from "react";
import {
  Paper,
  Grid,
  Typography,
  Button,
  Chip,
  CircularProgress,
  Box,
  IconButton,
  Tooltip,
} from "@material-ui/core";
import Refresh from "@material-ui/icons/Refresh";
import PlayArrow from "@material-ui/icons/PlayArrow";
import Description from "@material-ui/icons/Description";
import { makeStyles } from "@material-ui/core/styles";
import { toast } from "react-toastify";
import api from "../../services/api";
import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import Title from "../../components/Title";
import toastError from "../../errors/toastError";

const useStyles = makeStyles(theme => ({
  root: { padding: theme.spacing(2) },
  card: {
    padding: theme.spacing(2),
    display: "flex",
    flexDirection: "column",
    gap: theme.spacing(1),
    minHeight: 180,
  },
  cardHeader: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
  },
  meta: { color: theme.palette.text.secondary, fontSize: 12 },
  actions: { display: "flex", gap: theme.spacing(1), marginTop: "auto" },
  logsBox: {
    marginTop: theme.spacing(2),
    padding: theme.spacing(1.5),
    background: "#0d1117",
    color: "#e6edf3",
    fontFamily: "monospace",
    fontSize: 12,
    whiteSpace: "pre-wrap",
    maxHeight: 420,
    overflow: "auto",
    borderRadius: 6,
  },
}));

const statusColor = svc => {
  if (!svc.installed) return "default";
  if (svc.running && (svc.health === "healthy" || svc.health === null)) return "primary";
  if (svc.health === "unhealthy") return "secondary";
  return "default";
};

const statusLabel = svc => {
  if (!svc.installed) return "Não instalado";
  if (!svc.running) return svc.status || "Parado";
  if (svc.health) return `${svc.status} (${svc.health})`;
  return svc.status || "running";
};

const StackStatus = () => {
  const classes = useStyles();
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [logs, setLogs] = useState({ service: null, content: "" });
  const [logsLoading, setLogsLoading] = useState(false);

  const fetchStatus = useCallback(async () => {
    try {
      const { data } = await api.get("/stack-status");
      setServices(data.services || []);
    } catch (err) {
      toastError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
    const id = setInterval(fetchStatus, 15000);
    return () => clearInterval(id);
  }, [fetchStatus]);

  const handleLogs = async key => {
    setLogsLoading(true);
    setLogs({ service: key, content: "" });
    try {
      const { data } = await api.get(`/stack-status/${key}/logs?tail=300`);
      setLogs({ service: key, content: data.logs || "(sem logs)" });
    } catch (err) {
      toastError(err);
      setLogs({ service: key, content: "Erro ao buscar logs." });
    } finally {
      setLogsLoading(false);
    }
  };

  const handleRestart = async key => {
    if (!window.confirm(`Reiniciar container "${key}"?`)) return;
    try {
      await api.post(`/stack-status/${key}/restart`);
      toast.success("Container reiniciando...");
      setTimeout(fetchStatus, 2000);
    } catch (err) {
      toastError(err);
    }
  };

  return (
    <MainContainer>
      <MainHeader>
        <Title>Status da Stack (n8n / Typebot)</Title>
        <Tooltip title="Atualizar">
          <IconButton onClick={fetchStatus}>
            <Refresh />
          </IconButton>
        </Tooltip>
      </MainHeader>

      <Paper className={classes.root} variant="outlined">
        {loading ? (
          <Box display="flex" justifyContent="center" p={4}>
            <CircularProgress />
          </Box>
        ) : (
          <Grid container spacing={2}>
            {services.map(svc => (
              <Grid item xs={12} md={4} key={svc.key}>
                <Paper className={classes.card} variant="outlined">
                  <div className={classes.cardHeader}>
                    <Typography variant="h6">{svc.label}</Typography>
                    <Chip
                      size="small"
                      label={statusLabel(svc)}
                      color={statusColor(svc)}
                    />
                  </div>
                  <Typography className={classes.meta}>
                    Container: {svc.name}
                  </Typography>
                  {svc.installed && (
                    <>
                      <Typography className={classes.meta}>
                        Imagem: {svc.image}
                      </Typography>
                      <Typography className={classes.meta}>
                        Restarts: {svc.restartCount} ·{" "}
                        {svc.startedAt
                          ? `Iniciado em ${new Date(svc.startedAt).toLocaleString()}`
                          : "—"}
                      </Typography>
                    </>
                  )}
                  {!svc.installed && (
                    <Typography className={classes.meta}>
                      Container não encontrado. Rode o instalador informando a URL deste serviço.
                    </Typography>
                  )}
                  <div className={classes.actions}>
                    <Button
                      size="small"
                      variant="outlined"
                      startIcon={<Description />}
                      onClick={() => handleLogs(svc.key)}
                      disabled={!svc.installed}
                    >
                      Logs
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      color="primary"
                      startIcon={<PlayArrow />}
                      onClick={() => handleRestart(svc.key)}
                      disabled={!svc.installed}
                    >
                      Reiniciar
                    </Button>
                  </div>
                </Paper>
              </Grid>
            ))}
          </Grid>
        )}

        {logs.service && (
          <Box mt={2}>
            <Typography variant="subtitle2">
              Logs — {logs.service} {logsLoading && "(carregando...)"}
            </Typography>
            <pre className={classes.logsBox}>{logs.content}</pre>
          </Box>
        )}
      </Paper>
    </MainContainer>
  );
};

export default StackStatus;