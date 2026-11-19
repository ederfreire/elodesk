import React, { useState, useEffect, useContext, useRef } from "react";
import {
  Drawer,
  Box,
  Typography,
  IconButton,
  Chip,
  Divider,
  TextField,
  MenuItem,
  Tooltip,
  CircularProgress,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import RefreshIcon from "@mui/icons-material/Refresh";
import DeleteSweepIcon from "@mui/icons-material/DeleteSweep";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ChevronRightIcon from "@mui/icons-material/ChevronRight";
import FiberManualRecordIcon from "@mui/icons-material/FiberManualRecord";
import { AuthContext } from "../../context/Auth/AuthContext";
import { socketConnection } from "../../services/socket";
import api from "../../services/api";
import { i18n } from "../../translate/i18n";

const STATUS_COLOR = {
  success: "#22C55E",
  error: "#EF4444",
  pending: "#F59E0B",
};

const N8nLogsDrawer = ({ open, onClose, flowId }) => {
  const { user } = useContext(AuthContext);
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [statusFilter, setStatusFilter] = useState("");
  const [eventFilter, setEventFilter] = useState("");
  const [expanded, setExpanded] = useState({});
  const [liveCount, setLiveCount] = useState(0);
  const listRef = useRef(null);

  const fetchLogs = async () => {
    if (!user?.companyId) return;
    setLoading(true);
    try {
      const params = { nodeType: "n8nTrigger", pageNumber: 1 };
      if (statusFilter) params.status = statusFilter;
      const { data } = await api.get("/n8n-logs", { params });
      let rows = data?.logs || [];
      if (flowId) {
        rows = rows.filter(
          (l) =>
            String(l?.requestPayload?.__flowId ?? "") === String(flowId) ||
            !l?.requestPayload?.__flowId
        );
      }
      setLogs(rows);
      setLiveCount(0);
    } catch (err) {
      // silencia — só logs
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) fetchLogs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, statusFilter]);

  useEffect(() => {
    if (!open || !user?.companyId) return;
    const socket = socketConnection({ companyId: user.companyId, userId: user.id });
    const channel = `company-${user.companyId}-n8n-log`;
    const handler = (data) => {
      if (data?.action !== "create" || !data?.log) return;
      const log = data.log;
      if (log.nodeType !== "n8nTrigger") return;
      if (flowId && log?.requestPayload?.__flowId && String(log.requestPayload.__flowId) !== String(flowId)) return;
      setLogs((old) => [log, ...old].slice(0, 200));
      setLiveCount((c) => c + 1);
    };
    socket.on(channel, handler);
    return () => {
      socket.off(channel, handler);
    };
  }, [open, user?.companyId, user?.id, flowId]);

  const visibleLogs = logs.filter((l) => {
    if (eventFilter && l?.requestPayload?.__event !== eventFilter) return false;
    return true;
  });

  const formatTime = (d) => {
    try {
      return new Date(d).toLocaleTimeString();
    } catch {
      return "";
    }
  };

  return (
    <Drawer
      anchor="right"
      open={open}
      onClose={onClose}
      PaperProps={{ sx: { width: 460, maxWidth: "100vw" } }}
    >
      <Box sx={{ display: "flex", flexDirection: "column", height: "100%" }}>
        <Box
          sx={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            p: 1.5,
            borderBottom: "1px solid #eee",
            backgroundColor: "#EA4B71",
            color: "#fff",
          }}
        >
          <Box sx={{ display: "flex", alignItems: "center", gap: 1 }}>
            <FiberManualRecordIcon sx={{ fontSize: 12, color: "#22C55E" }} />
            <Typography variant="subtitle1" sx={{ fontWeight: 600 }}>
              {i18n.t("n8nLogsDrawer.title", { defaultValue: "Logs n8n em tempo real" })}
            </Typography>
            {liveCount > 0 && (
              <Chip
                size="small"
                label={i18n.t("n8nLogsDrawer.newCount", { defaultValue: "+{{n}} novos", n: liveCount })}
                sx={{ backgroundColor: "#fff", color: "#EA4B71", fontWeight: 600 }}
              />
            )}
          </Box>
          <Box>
            <Tooltip title={i18n.t("n8nLogsDrawer.refresh", { defaultValue: "Atualizar" })}>
              <IconButton size="small" sx={{ color: "#fff" }} onClick={fetchLogs}>
                <RefreshIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <Tooltip title={i18n.t("n8nLogsDrawer.clear", { defaultValue: "Limpar visualização" })}>
              <IconButton
                size="small"
                sx={{ color: "#fff" }}
                onClick={() => setLogs([])}
              >
                <DeleteSweepIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <IconButton size="small" sx={{ color: "#fff" }} onClick={onClose}>
              <CloseIcon fontSize="small" />
            </IconButton>
          </Box>
        </Box>

        <Box sx={{ display: "flex", gap: 1, p: 1.5, borderBottom: "1px solid #eee" }}>
          <TextField
            select
            size="small"
            label={i18n.t("n8nLogsDrawer.status", { defaultValue: "Status" })}
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            sx={{ flex: 1 }}
          >
            <MenuItem value="">{i18n.t("n8nLogsDrawer.all", { defaultValue: "Todos" })}</MenuItem>
            <MenuItem value="success">{i18n.t("n8nLogsDrawer.success", { defaultValue: "Sucesso" })}</MenuItem>
            <MenuItem value="error">{i18n.t("n8nLogsDrawer.error", { defaultValue: "Erro" })}</MenuItem>
            <MenuItem value="pending">{i18n.t("n8nLogsDrawer.pending", { defaultValue: "Pendente" })}</MenuItem>
          </TextField>
          <TextField
            select
            size="small"
            label={i18n.t("n8nLogsDrawer.event", { defaultValue: "Evento" })}
            value={eventFilter}
            onChange={(e) => setEventFilter(e.target.value)}
            sx={{ flex: 1 }}
          >
            <MenuItem value="">{i18n.t("n8nLogsDrawer.all", { defaultValue: "Todos" })}</MenuItem>
            <MenuItem value="ticket">{i18n.t("n8nLogsDrawer.evTicket", { defaultValue: "Ticket" })}</MenuItem>
            <MenuItem value="connection">{i18n.t("n8nLogsDrawer.evConnection", { defaultValue: "Conexão" })}</MenuItem>
            <MenuItem value="message">{i18n.t("n8nLogsDrawer.evMessage", { defaultValue: "Mensagem" })}</MenuItem>
            <MenuItem value="contact">{i18n.t("n8nLogsDrawer.evContact", { defaultValue: "Contato" })}</MenuItem>
          </TextField>
        </Box>

        <Box
          ref={listRef}
          sx={{ flex: 1, overflowY: "auto", backgroundColor: "#FAFAFA" }}
        >
          {loading ? (
            <Box sx={{ display: "flex", justifyContent: "center", p: 4 }}>
              <CircularProgress size={28} />
            </Box>
          ) : visibleLogs.length === 0 ? (
            <Box sx={{ p: 4, textAlign: "center", color: "#888" }}>
              <Typography variant="body2">
                {i18n.t("n8nLogsDrawer.empty", { defaultValue: "Nenhum log ainda. Execute o fluxo e os disparos do n8n aparecerão aqui em tempo real." })}
              </Typography>
            </Box>
          ) : (
            visibleLogs.map((log) => {
              const isOpen = !!expanded[log.id];
              const color = STATUS_COLOR[log.status] || "#888";
              const evt = log?.requestPayload?.__event || "—";
              const mode = log?.requestPayload?.__mode || "—";
              return (
                <Box
                  key={log.id}
                  sx={{
                    borderBottom: "1px solid #eee",
                    backgroundColor: "#fff",
                    "&:hover": { backgroundColor: "#FFF7F9" },
                  }}
                >
                  <Box
                    sx={{
                      display: "flex",
                      alignItems: "center",
                      gap: 1,
                      p: 1,
                      cursor: "pointer",
                    }}
                    onClick={() =>
                      setExpanded((e) => ({ ...e, [log.id]: !e[log.id] }))
                    }
                  >
                    {isOpen ? (
                      <ExpandMoreIcon fontSize="small" />
                    ) : (
                      <ChevronRightIcon fontSize="small" />
                    )}
                    <Chip
                      size="small"
                      label={log.status}
                      sx={{
                        backgroundColor: color,
                        color: "#fff",
                        fontWeight: 600,
                        textTransform: "uppercase",
                        fontSize: 10,
                        height: 18,
                      }}
                    />
                    <Typography sx={{ fontSize: 11, color: "#666", minWidth: 70 }}>
                      {formatTime(log.createdAt)}
                    </Typography>
                    <Typography sx={{ fontSize: 11, fontWeight: 600, color: "#333" }}>
                      {evt}
                    </Typography>
                    <Typography sx={{ fontSize: 10, color: "#999" }}>
                      {mode}
                    </Typography>
                    <Box sx={{ flex: 1 }} />
                    {log.duration != null && (
                      <Typography sx={{ fontSize: 10, color: "#888" }}>
                        {log.duration}ms
                      </Typography>
                    )}
                  </Box>
                  {isOpen && (
                    <Box sx={{ p: 1.5, pt: 0 }}>
                      <Typography sx={{ fontSize: 10, color: "#888", mb: 0.5 }}>
                        {i18n.t("n8nLogsDrawer.url", { defaultValue: "URL" })}
                      </Typography>
                      <Box
                        sx={{
                          fontFamily: "monospace",
                          fontSize: 11,
                          backgroundColor: "#F4F4F5",
                          p: 0.75,
                          borderRadius: 1,
                          wordBreak: "break-all",
                          mb: 1,
                        }}
                      >
                        {log.webhookUrl || "—"}
                      </Box>
                      {log.errorMessage && (
                        <>
                          <Typography sx={{ fontSize: 10, color: "#EF4444", mb: 0.5 }}>
                            {i18n.t("n8nLogsDrawer.errorLabel", { defaultValue: "Erro" })}
                          </Typography>
                          <Box
                            sx={{
                              fontFamily: "monospace",
                              fontSize: 11,
                              backgroundColor: "#FEE2E2",
                              color: "#7F1D1D",
                              p: 0.75,
                              borderRadius: 1,
                              mb: 1,
                            }}
                          >
                            {log.errorMessage}
                          </Box>
                        </>
                      )}
                      <Typography sx={{ fontSize: 10, color: "#888", mb: 0.5 }}>
                        {i18n.t("n8nLogsDrawer.payload", { defaultValue: "Payload enviado" })}
                      </Typography>
                      <Box
                        component="pre"
                        sx={{
                          fontFamily: "monospace",
                          fontSize: 10,
                          backgroundColor: "#F4F4F5",
                          p: 0.75,
                          borderRadius: 1,
                          maxHeight: 200,
                          overflow: "auto",
                          m: 0,
                          mb: 1,
                        }}
                      >
                        {JSON.stringify(log.requestPayload, null, 2)}
                      </Box>
                      {log.responseData && (
                        <>
                          <Typography sx={{ fontSize: 10, color: "#888", mb: 0.5 }}>
                            {i18n.t("n8nLogsDrawer.response", { defaultValue: "Resposta do n8n" })}
                          </Typography>
                          <Box
                            component="pre"
                            sx={{
                              fontFamily: "monospace",
                              fontSize: 10,
                              backgroundColor: "#ECFDF5",
                              p: 0.75,
                              borderRadius: 1,
                              maxHeight: 200,
                              overflow: "auto",
                              m: 0,
                            }}
                          >
                            {JSON.stringify(log.responseData, null, 2)}
                          </Box>
                        </>
                      )}
                    </Box>
                  )}
                </Box>
              );
            })
          )}
        </Box>

        <Divider />
        <Box sx={{ p: 1, fontSize: 11, color: "#888", textAlign: "center" }}>
          {i18n.t("n8nLogsDrawer.footer", { defaultValue: "Mostrando até 200 logs. Use filtros para refinar." })}
        </Box>
      </Box>
    </Drawer>
  );
};

export default N8nLogsDrawer;
