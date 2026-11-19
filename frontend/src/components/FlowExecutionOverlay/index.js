import React, { useState, useMemo } from "react";
import {
  Paper,
  Box,
  Typography,
  IconButton,
  Chip,
  Tooltip,
  Collapse,
  Divider,
} from "@mui/material";
import CloseIcon from "@mui/icons-material/Close";
import ExpandLessIcon from "@mui/icons-material/ExpandLess";
import ExpandMoreIcon from "@mui/icons-material/ExpandMore";
import ErrorOutlineIcon from "@mui/icons-material/ErrorOutline";
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import PlayArrowIcon from "@mui/icons-material/PlayArrow";
import BoltIcon from "@mui/icons-material/Bolt";

const statusColor = (status) => {
  if (status === "error") return "#e53935";
  if (status === "success") return "#43a047";
  if (status === "running") return "#fb8c00";
  return "#1976d2";
};

const statusIcon = (status) => {
  if (status === "error") return <ErrorOutlineIcon fontSize="small" />;
  if (status === "success") return <CheckCircleOutlineIcon fontSize="small" />;
  return <PlayArrowIcon fontSize="small" />;
};

const formatTime = (ts) => {
  try {
    const d = new Date(ts);
    return d.toLocaleTimeString();
  } catch {
    return "";
  }
};

/**
 * Painel flutuante que mostra em tempo real as etapas do FlowBuilder
 * sendo executadas (semelhante ao n8n): status por nó, erros e histórico.
 */
const FlowExecutionOverlay = ({ events = [], state = {}, onClear }) => {
  const [open, setOpen] = useState(true);

  const runningCount = useMemo(
    () => Object.values(state).filter((s) => s?.status === "running").length,
    [state]
  );
  const errorCount = useMemo(
    () => events.filter((e) => e.status === "error").length,
    [events]
  );

  if (events.length === 0) return null;

  return (
    <Paper
      elevation={8}
      style={{
        position: "absolute",
        right: 16,
        bottom: 16,
        width: 360,
        maxHeight: "60vh",
        display: "flex",
        flexDirection: "column",
        zIndex: 20,
        overflow: "hidden",
        borderRadius: 10,
      }}
    >
      <Box
        display="flex"
        alignItems="center"
        justifyContent="space-between"
        p={1}
        px={1.5}
        style={{ background: "#1e1e2f", color: "#fff", cursor: "pointer" }}
        onClick={() => setOpen((v) => !v)}
      >
        <Box display="flex" alignItems="center" gridGap={8}>
          <BoltIcon fontSize="small" style={{ color: "#fbc02d" }} />
          <Typography variant="subtitle2" style={{ fontWeight: 600 }}>
            Execução em tempo real
          </Typography>
          {runningCount > 0 && (
            <Chip
              size="small"
              label={`${runningCount} rodando`}
              style={{
                background: "#fb8c00",
                color: "#fff",
                height: 20,
                fontSize: 11,
              }}
            />
          )}
          {errorCount > 0 && (
            <Chip
              size="small"
              label={`${errorCount} erro${errorCount > 1 ? "s" : ""}`}
              style={{
                background: "#e53935",
                color: "#fff",
                height: 20,
                fontSize: 11,
              }}
            />
          )}
        </Box>
        <Box display="flex" alignItems="center">
          {onClear && (
            <Tooltip title="Limpar">
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  onClear();
                }}
                style={{ color: "#fff" }}
              >
                <CloseIcon fontSize="small" />
              </IconButton>
            </Tooltip>
          )}
          <IconButton size="small" style={{ color: "#fff" }}>
            {open ? (
              <ExpandMoreIcon fontSize="small" />
            ) : (
              <ExpandLessIcon fontSize="small" />
            )}
          </IconButton>
        </Box>
      </Box>

      <Collapse in={open}>
        <Box
          style={{
            overflowY: "auto",
            maxHeight: "calc(60vh - 44px)",
            background: "#fafafa",
          }}
        >
          {events.map((ev, idx) => {
            const color = statusColor(ev.status);
            return (
              <Box key={`${ev.nodeId}-${ev.ts}-${idx}`}>
                <Box p={1.2} px={1.5} display="flex" alignItems="flex-start">
                  <Box
                    style={{
                      color,
                      marginRight: 8,
                      marginTop: 2,
                      display: "flex",
                    }}
                  >
                    {statusIcon(ev.status)}
                  </Box>
                  <Box flex={1} minWidth={0}>
                    <Box
                      display="flex"
                      alignItems="center"
                      justifyContent="space-between"
                    >
                      <Typography
                        variant="body2"
                        style={{ fontWeight: 600, color: "#222" }}
                        noWrap
                      >
                        {ev.nodeType || "nó"}
                      </Typography>
                      <Typography
                        variant="caption"
                        style={{ color: "#777", marginLeft: 8 }}
                      >
                        {formatTime(ev.ts)}
                      </Typography>
                    </Box>
                    <Typography
                      variant="caption"
                      style={{ color: "#666", display: "block" }}
                    >
                      id: {ev.nodeId}
                      {ev.ticketId ? ` · ticket #${ev.ticketId}` : ""}
                    </Typography>
                    {ev.status === "error" && ev.errorMessage && (
                      <Box
                        mt={0.5}
                        p={0.8}
                        style={{
                          background: "#ffebee",
                          border: "1px solid #ffcdd2",
                          borderRadius: 4,
                        }}
                      >
                        <Typography
                          variant="caption"
                          style={{ color: "#b71c1c", whiteSpace: "pre-wrap" }}
                        >
                          {ev.errorMessage}
                        </Typography>
                      </Box>
                    )}
                  </Box>
                </Box>
                <Divider />
              </Box>
            );
          })}
        </Box>
      </Collapse>
    </Paper>
  );
};

export default FlowExecutionOverlay;
