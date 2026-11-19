import React, { useContext, useEffect, useReducer, useState } from "react";

import openSocket from "socket.io-client";

import {
  Button,
  IconButton,
  Paper,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Box,
  Typography,
  Grid,
  Tooltip,
  LinearProgress,
  Chip,
  Switch
} from "@material-ui/core";

import { makeStyles } from "@material-ui/core/styles";

import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import MainHeaderButtonsWrapper from "../../components/MainHeaderButtonsWrapper";
import TableRowSkeleton from "../../components/TableRowSkeleton";
import Title from "../../components/Title";
import { i18n } from "../../translate/i18n";
import toastError from "../../errors/toastError";
import api from "../../services/api";
import DeleteOutline from "@material-ui/icons/DeleteOutline";
import FileCopy from "@material-ui/icons/FileCopy";
import Edit from "@material-ui/icons/Edit";
import PromptModal from "../../components/PromptModal";
import { toast } from "react-toastify";
import ConfirmationModal from "../../components/ConfirmationModal";
import { AuthContext } from "../../context/Auth/AuthContext";
import usePlans from "../../hooks/usePlans";
import { useHistory } from "react-router-dom/cjs/react-router-dom.min";
import ForbiddenPage from "../../components/ForbiddenPage";

const useStyles = makeStyles((theme) => ({
  mainPaper: {
    flex: 1,
    padding: theme.spacing(1),
    overflowY: "scroll",
    ...theme.scrollbarStyles,
  },
  customTableCell: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  metricsContainer: {
    padding: theme.spacing(2),
    marginBottom: theme.spacing(2),
  },
  metricCard: {
    padding: theme.spacing(2),
    borderRadius: 12,
    textAlign: "center",
    background: theme.palette.type === "dark"
      ? "linear-gradient(135deg, #1e1e2f 0%, #2d2d44 100%)"
      : "linear-gradient(135deg, #f5f7fa 0%, #e4e9f2 100%)",
    border: `1px solid ${theme.palette.divider}`,
    transition: "transform 0.2s, box-shadow 0.2s",
    "&:hover": {
      transform: "translateY(-2px)",
      boxShadow: theme.shadows[4],
    },
  },
  metricValue: {
    fontSize: "1.8rem",
    fontWeight: 700,
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    color: theme.palette.primary.main,
  },
  metricLabel: {
    fontSize: "0.75rem",
    textTransform: "uppercase",
    letterSpacing: "0.5px",
    color: theme.palette.text.secondary,
    marginTop: 4,
  },
  costValue: {
    fontSize: "1.8rem",
    fontWeight: 700,
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    color: theme.palette.secondary.main,
  },
  tokenChip: {
    margin: theme.spacing(0.5),
    fontFamily: "'Plus Jakarta Sans', sans-serif",
    fontWeight: 600,
  },
}));

const reducer = (state, action) => {
  if (action.type === "LOAD_PROMPTS") {
    const prompts = action.payload;
    const newPrompts = [];

    prompts.forEach((prompt) => {
      const promptIndex = state.findIndex((p) => p.id === prompt.id);
      if (promptIndex !== -1) {
        state[promptIndex] = prompt;
      } else {
        newPrompts.push(prompt);
      }
    });

    return [...state, ...newPrompts];
  }

  if (action.type === "UPDATE_PROMPTS") {
    const prompt = action.payload;
    const promptIndex = state.findIndex((p) => p.id === prompt.id);

    if (promptIndex !== -1) {
      state[promptIndex] = prompt;
      return [...state];
    } else {
      return [prompt, ...state];
    }
  }

  if (action.type === "DELETE_PROMPT") {
    const promptId = action.payload;
    const promptIndex = state.findIndex((p) => p.id === promptId);
    if (promptIndex !== -1) {
      state.splice(promptIndex, 1);
    }
    return [...state];
  }

  if (action.type === "RESET") {
    return [];
  }
};

// Custo estimado por 1K tokens (média GPT-4o-mini input/output)
const COST_PER_1K_INPUT = 0.00015;
const COST_PER_1K_OUTPUT = 0.0006;

const formatNumber = (n) => {
  if (!n) return "0";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}K`;
  return n.toLocaleString();
};

const estimateCost = (promptTokens, completionTokens) => {
  const inputCost = ((promptTokens || 0) / 1000) * COST_PER_1K_INPUT;
  const outputCost = ((completionTokens || 0) / 1000) * COST_PER_1K_OUTPUT;
  return (inputCost + outputCost).toFixed(4);
};

const Prompts = () => {
  const classes = useStyles();

  const [prompts, dispatch] = useReducer(reducer, []);
  const [loading, setLoading] = useState(false);
  const [tokenStats, setTokenStats] = useState(null);

  const [promptModalOpen, setPromptModalOpen] = useState(false);
  const [selectedPrompt, setSelectedPrompt] = useState(null);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const { user, socket } = useContext(AuthContext);

  const { getPlanCompany } = usePlans();
  const history = useHistory();
  const companyId = user.companyId;

  useEffect(() => {
    async function fetchData() {
      const planConfigs = await getPlanCompany(undefined, companyId);
      if (!planConfigs.plan.useOpenAi) {
        toast.error(i18n.t("prompts.noPermission"));
        setTimeout(() => {
          history.push(`/`)
        }, 1000);
      }
    }
    fetchData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try {
        const { data } = await api.get("/prompt");
        const promptsList = Array.isArray(data) ? data : Array.isArray(data?.prompts) ? data.prompts : [];
        dispatch({ type: "LOAD_PROMPTS", payload: promptsList });

        setLoading(false);
      } catch (err) {
        toastError(err);
        setLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get("/prompt/token-stats");
        setTokenStats(data);
      } catch (err) {
        // silently fail - stats are optional
      }
    })();
  }, []);

  useEffect(() => {
    const onPromptEvent = (data) => {
      if (data.action === "update" || data.action === "create") {
        dispatch({ type: "UPDATE_PROMPTS", payload: data.prompt });
      }

      if (data.action === "delete") {
        dispatch({ type: "DELETE_PROMPT", payload: data.promptId });
      }
    };

    socket.on(`company-${companyId}-prompt`, onPromptEvent);
    return () => {
      socket.off(`company-${companyId}-prompt`, onPromptEvent);
    };
  }, [socket]);

  const handleOpenPromptModal = () => {
    setPromptModalOpen(true);
    setSelectedPrompt(null);
  };

  const handleClosePromptModal = () => {
    setPromptModalOpen(false);
    setSelectedPrompt(null);
  };

  const handleEditPrompt = (prompt) => {
    setSelectedPrompt(prompt);
    setPromptModalOpen(true);
  };

  const handleCloseConfirmationModal = () => {
    setConfirmModalOpen(false);
    setSelectedPrompt(null);
  };

  const handleDeletePrompt = async (promptId) => {
    try {
      const { data } = await api.delete(`/prompt/${promptId}`);
      toast.info(i18n.t(data.message));
    } catch (err) {
      toastError(err);
    }
    setSelectedPrompt(null);
  };

  const handleDuplicatePrompt = async (promptId) => {
    try {
      await api.post(`/prompt/${promptId}/duplicate`);
      toast.success(i18n.t("prompts.duplicated", "Agente duplicado."));
    } catch (err) {
      toastError(err);
    }
  };

  const handleToggleActive = async (prompt) => {
    try {
      const newActive = !(prompt.active !== false);
      // optimistic update
      dispatch({ type: "UPDATE_PROMPTS", payload: { ...prompt, active: newActive } });
      await api.put(`/prompt/${prompt.id}`, { ...prompt, active: newActive });
      toast.success(
        newActive
          ? i18n.t("prompts.toasts.activated")
          : i18n.t("prompts.toasts.deactivated")
      );
    } catch (err) {
      // rollback
      dispatch({ type: "UPDATE_PROMPTS", payload: prompt });
      toastError(err);
    }
  };

  return (
    <MainContainer>
      <ConfirmationModal
        title={
          selectedPrompt &&
          `${i18n.t("prompts.confirmationModal.deleteTitle")} ${selectedPrompt.name
          }?`
        }
        open={confirmModalOpen}
        onClose={handleCloseConfirmationModal}
        onConfirm={() => handleDeletePrompt(selectedPrompt.id)}
      >
        {i18n.t("prompts.confirmationModal.deleteMessage")}
      </ConfirmationModal>
      <PromptModal
        open={promptModalOpen}
        onClose={handleClosePromptModal}
        promptId={selectedPrompt?.id}
      />
      {user.profile === "user" ?
        <ForbiddenPage />
        :
        <>
          <MainHeader>
            <Title>{i18n.t("prompts.title")}</Title>
            <MainHeaderButtonsWrapper>
              <Button
                variant="contained"
                color="primary"
                onClick={handleOpenPromptModal}
              >
                {i18n.t("prompts.buttons.add")}
              </Button>
            </MainHeaderButtonsWrapper>
          </MainHeader>

          {/* Token Usage Metrics */}
          {tokenStats && tokenStats.totals && (
            <Paper className={classes.metricsContainer} variant="outlined">
              <Typography variant="subtitle2" style={{ marginBottom: 12, fontWeight: 600 }}>
                📊 {i18n.t("prompts.metrics.title")}
              </Typography>
              <Grid container spacing={2}>
                <Grid item xs={6} sm={3}>
                  <Box className={classes.metricCard}>
                    <Typography className={classes.metricValue}>
                      {formatNumber(tokenStats.totals.totalTokens)}
                    </Typography>
                    <Typography className={classes.metricLabel}>
                      {i18n.t("prompts.metrics.totalTokens")}
                    </Typography>
                  </Box>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Box className={classes.metricCard}>
                    <Typography className={classes.metricValue}>
                      {formatNumber(tokenStats.totals.promptTokens)}
                    </Typography>
                    <Typography className={classes.metricLabel}>
                      {i18n.t("prompts.metrics.inputTokens")}
                    </Typography>
                  </Box>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Box className={classes.metricCard}>
                    <Typography className={classes.metricValue}>
                      {formatNumber(tokenStats.totals.completionTokens)}
                    </Typography>
                    <Typography className={classes.metricLabel}>
                      {i18n.t("prompts.metrics.outputTokens")}
                    </Typography>
                  </Box>
                </Grid>
                <Grid item xs={6} sm={3}>
                  <Tooltip title={i18n.t("prompts.metrics.costTooltip")}>
                    <Box className={classes.metricCard}>
                      <Typography className={classes.costValue}>
                        ${estimateCost(tokenStats.totals.promptTokens, tokenStats.totals.completionTokens)}
                      </Typography>
                      <Typography className={classes.metricLabel}>
                        {i18n.t("prompts.metrics.estimatedCost")}
                      </Typography>
                    </Box>
                  </Tooltip>
                </Grid>
              </Grid>

              {/* Per-agent breakdown */}
              {tokenStats.prompts && tokenStats.prompts.length > 0 && tokenStats.totals.totalTokens > 0 && (
                <Box mt={2}>
                  <Typography variant="caption" color="textSecondary" style={{ marginBottom: 8, display: "block" }}>
                    {i18n.t("prompts.metrics.perAgent")}
                  </Typography>
                  {tokenStats.prompts
                    .filter(p => p.totalTokens > 0)
                    .sort((a, b) => (b.totalTokens || 0) - (a.totalTokens || 0))
                    .map(p => {
                      const pct = Math.round(((p.totalTokens || 0) / tokenStats.totals.totalTokens) * 100);
                      return (
                        <Box key={p.id} display="flex" alignItems="center" mb={0.5}>
                          <Typography variant="body2" style={{ width: 140, flexShrink: 0, fontWeight: 500 }}>
                            {p.name}
                          </Typography>
                          <Box flex={1} mx={1}>
                            <LinearProgress
                              variant="determinate"
                              value={pct}
                              style={{ height: 8, borderRadius: 4 }}
                            />
                          </Box>
                          <Chip
                            label={`${formatNumber(p.totalTokens)} (${pct}%)`}
                            size="small"
                            className={classes.tokenChip}
                            color="primary"
                            variant="outlined"
                          />
                        </Box>
                      );
                    })}
                </Box>
              )}
            </Paper>
          )}

          <Paper className={classes.mainPaper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell align="left">
                    {i18n.t("prompts.table.name")}
                  </TableCell>
                  <TableCell align="left">
                    {i18n.t("prompts.table.queue")}
                  </TableCell>
                  <TableCell align="left">
                    {i18n.t("prompts.table.max_tokens")}
                  </TableCell>
                  <TableCell align="center">
                    {i18n.t("prompts.table.tokens_used")}
                  </TableCell>
                  <TableCell align="center">
                    {i18n.t("prompts.table.status")}
                  </TableCell>
                  <TableCell align="center">
                    {i18n.t("prompts.table.actions")}
                  </TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <>
                  {prompts.map((prompt) => {
                    const statsPrompt = tokenStats?.prompts?.find(p => p.id === prompt.id);
                    return (
                      <TableRow key={prompt.id}>
                        <TableCell align="left">{prompt.name}</TableCell>
                        <TableCell align="left">{prompt.queue?.name || "-"}</TableCell>
                        <TableCell align="left">{prompt.maxTokens}</TableCell>
                        <TableCell align="center">
                          <Tooltip title={
                            statsPrompt
                              ? `Input: ${formatNumber(statsPrompt.promptTokens)} | Output: ${formatNumber(statsPrompt.completionTokens)}`
                              : "-"
                          }>
                            <span>{statsPrompt ? formatNumber(statsPrompt.totalTokens) : "0"}</span>
                          </Tooltip>
                        </TableCell>
                        <TableCell align="center">
                          <Tooltip
                            title={
                              prompt.active !== false
                                ? i18n.t("prompts.toasts.deactivate")
                                : i18n.t("prompts.toasts.activate")
                            }
                          >
                            <Switch
                              checked={prompt.active !== false}
                              onChange={() => handleToggleActive(prompt)}
                              color="primary"
                              size="small"
                            />
                          </Tooltip>
                        </TableCell>
                        <TableCell align="center">
                          <IconButton
                            size="small"
                            onClick={() => handleEditPrompt(prompt)}
                          >
                            <Edit />
                          </IconButton>

                          <Tooltip title={i18n.t("prompts.duplicate", "Duplicar")}>
                            <IconButton
                              size="small"
                              onClick={() => handleDuplicatePrompt(prompt.id)}
                            >
                              <FileCopy />
                            </IconButton>
                          </Tooltip>

                          <IconButton
                            size="small"
                            onClick={() => {
                              setSelectedPrompt(prompt);
                              setConfirmModalOpen(true);
                            }}
                          >
                            <DeleteOutline />
                          </IconButton>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                  {loading && <TableRowSkeleton columns={6} />}
                </>
              </TableBody>
            </Table>
          </Paper>
        </>}
    </MainContainer>
  );
};

export default Prompts;
