import React from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Stack,
  LinearProgress,
} from "@mui/material";
import BarChart from "@mui/icons-material/BarChart";
import People from "@mui/icons-material/People";
import CheckCircle from "@mui/icons-material/CheckCircle";
import AutoAwesome from "@mui/icons-material/AutoAwesome";
import ShowChart from "@mui/icons-material/ShowChart";
import { useTheme } from "@material-ui/core/styles";
import { i18n } from "../../translate/i18n";

const StatBox = ({ icon, value, label, color }) => {
  const theme = useTheme();
  return (
    <Box
      sx={{
        flex: 1,
        minWidth: 100,
        border: `1px solid ${theme.palette.divider}`,
        borderRadius: 2,
        p: 1.5,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 0.5,
        backgroundColor: theme.palette.background.paper,
      }}
    >
      <Box sx={{ color }}>{icon}</Box>
      <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1 }}>
        {value}
      </Typography>
      <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
        {label}
      </Typography>
    </Box>
  );
};

const FlowReportModal = ({ open, onClose, flow }) => {
  const theme = useTheme();
  if (!flow) return null;

  const exec = Number(flow.executionCount || 0);
  const failure = Number(flow.failureCount || 0);
  const success = Math.max(0, exec - failure);
  const completed = success;
  const interacted = exec;
  const started = exec;
  const completionRate = exec > 0 ? Math.round((success / exec) * 100) : 0;

  // Total de nós configurados no fluxo
  const nodesTotal = Array.isArray(flow?.flow?.nodes)
    ? flow.flow.nodes.length
    : Array.isArray(flow?.nodes)
    ? flow.nodes.length
    : 0;

  // Taxa de clique = proporção de execuções que tiveram interação (sucesso)
  const clickRate =
    started > 0 ? Math.round((interacted / started) * 100) : 0;

  // Média de nós percorridos por execução bem-sucedida
  const avgNodesVisited = exec > 0 ? nodesTotal : 0;

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>
        <Stack direction="row" alignItems="center" spacing={1}>
          <BarChart color="primary" />
          <Box>
            <Typography variant="h6" sx={{ fontWeight: 700, lineHeight: 1.2 }}>
              {i18n.t("flowReport.title")}
            </Typography>
            <Typography variant="caption" sx={{ color: theme.palette.text.secondary }}>
              {flow.name}
            </Typography>
          </Box>
        </Stack>
      </DialogTitle>
      <DialogContent dividers>
        <Stack direction="row" spacing={1.5} sx={{ mb: 2 }}>
          <StatBox icon={<People />} value={exec} label={i18n.t("flowReport.executions")} color="#7c4dff" />
          <StatBox
            icon={<CheckCircle />}
            value={`${completionRate}%`}
            label={i18n.t("flowReport.completion")}
            color="#2e7d32"
          />
          <StatBox
            icon={<AutoAwesome />}
            value={`${clickRate}%`}
            label={i18n.t("flowReport.clickRate")}
            color="#ff9800"
          />
          <StatBox
            icon={<ShowChart />}
            value={`${avgNodesVisited}/${nodesTotal}`}
            label={i18n.t("flowReport.avgNodes")}
            color="#1976d2"
          />
        </Stack>

        <Box
          sx={{
            border: `1px solid ${theme.palette.divider}`,
            borderRadius: 2,
            p: 2,
          }}
        >
          <Stack direction="row" alignItems="center" spacing={1} sx={{ mb: 1.5 }}>
            <AutoAwesome fontSize="small" color="primary" />
            <Typography variant="subtitle2" sx={{ fontWeight: 700 }}>
              {i18n.t("flowReport.interactionRate")}
            </Typography>
          </Stack>
          <Stack direction="row" spacing={2} justifyContent="space-around" sx={{ mb: 2 }}>
            <Box sx={{ textAlign: "center" }}>
              <Typography variant="h6" sx={{ fontWeight: 700 }}>{started}</Typography>
              <Typography variant="caption" color="textSecondary">{i18n.t("flowReport.started")}</Typography>
            </Box>
            <Box sx={{ textAlign: "center" }}>
              <Typography variant="h6" sx={{ fontWeight: 700, color: "#ff9800" }}>
                {interacted}
              </Typography>
              <Typography variant="caption" color="textSecondary">{i18n.t("flowReport.interacted")}</Typography>
            </Box>
            <Box sx={{ textAlign: "center" }}>
              <Typography variant="h6" sx={{ fontWeight: 700, color: "#2e7d32" }}>
                {completed}
              </Typography>
              <Typography variant="caption" color="textSecondary">{i18n.t("flowReport.completed")}</Typography>
            </Box>
          </Stack>
          <LinearProgress
            variant="determinate"
            value={completionRate}
            sx={{ height: 6, borderRadius: 3 }}
          />
          <Stack direction="row" justifyContent="space-between" sx={{ mt: 0.5 }}>
            <Typography variant="caption" color="textSecondary">0%</Typography>
            <Typography variant="caption" color="textSecondary">
              {i18n.t("flowReport.completionRate")}: {completionRate}%
            </Typography>
            <Typography variant="caption" color="textSecondary">100%</Typography>
          </Stack>
        </Box>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} fullWidth variant="outlined" color="primary">
          {i18n.t("flowReport.close")}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default FlowReportModal;