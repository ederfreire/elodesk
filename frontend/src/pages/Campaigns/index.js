/* eslint-disable no-unused-vars */

import React, { useState, useEffect, useReducer, useContext, useCallback } from "react";
import { toast } from "react-toastify";
import { useHistory } from "react-router-dom";
import { makeStyles } from "@material-ui/core/styles";
import Paper from "@material-ui/core/Paper";
import Button from "@material-ui/core/Button";
import Table from "@material-ui/core/Table";
import TableBody from "@material-ui/core/TableBody";
import TableCell from "@material-ui/core/TableCell";
import TableHead from "@material-ui/core/TableHead";
import TableRow from "@material-ui/core/TableRow";
import IconButton from "@material-ui/core/IconButton";
import SearchIcon from "@material-ui/icons/Search";
import TextField from "@material-ui/core/TextField";
import InputAdornment from "@material-ui/core/InputAdornment";
import Tooltip from "@material-ui/core/Tooltip";
import Chip from "@material-ui/core/Chip";
import DeleteOutlineIcon from "@material-ui/icons/DeleteOutline";
import EditIcon from "@material-ui/icons/Edit";
import DescriptionIcon from "@material-ui/icons/Description";
import PlayCircleOutlineIcon from "@material-ui/icons/PlayCircleOutline";
import PauseCircleOutlineIcon from "@material-ui/icons/PauseCircleOutline";
import RepeatIcon from "@material-ui/icons/Repeat";
import StopIcon from "@material-ui/icons/Stop";
import ScheduleIcon from "@material-ui/icons/Schedule";
import FileCopyIcon from "@material-ui/icons/FileCopy";
import GetAppIcon from "@material-ui/icons/GetApp";
import ChatBubbleOutlineIcon from "@material-ui/icons/ChatBubbleOutline";
import FiberManualRecordIcon from "@material-ui/icons/FiberManualRecord";
import Checkbox from "@material-ui/core/Checkbox";
import LinearProgress from "@material-ui/core/LinearProgress";
import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import Title from "../../components/Title";
import api from "../../services/api";
import { i18n } from "../../translate/i18n";
import TableRowSkeleton from "../../components/TableRowSkeleton";
import CampaignModal from "../../components/CampaignModal";
import ErrorBoundary from "../../components/ErrorBoundary";
import ConfirmationModal from "../../components/ConfirmationModal";
import toastError from "../../errors/toastError";
import { Grid, FormControl, InputLabel, Select, MenuItem, TablePagination, Box, Typography, Card, CardContent, Popover } from "@material-ui/core";
import { isArray } from "lodash";
import { useDate } from "../../hooks/useDate";
import ForbiddenPage from "../../components/ForbiddenPage";
import usePlans from "../../hooks/usePlans";
import { AuthContext } from "../../context/Auth/AuthContext";

const reducer = (state, action) => {
  if (action.type === "LOAD_CAMPAIGNS") {
    const campaigns = action.payload;
    const newCampaigns = [];
    if (isArray(campaigns)) {
      campaigns.forEach((campaign) => {
        const idx = state.findIndex((u) => u.id === campaign.id);
        if (idx !== -1) {
          state[idx] = campaign;
        } else {
          newCampaigns.push(campaign);
        }
      });
    }
    return [...state, ...newCampaigns];
  }

  if (action.type === "UPDATE_CAMPAIGNS") {
    const campaign = action.payload;
    const idx = state.findIndex((u) => u.id === campaign.id);
    if (idx !== -1) {
      const updated = [...state];
      updated[idx] = campaign;
      return updated;
    }
    return [campaign, ...state];
  }

  if (action.type === "DELETE_CAMPAIGN") {
    return state.filter((u) => u.id !== action.payload);
  }

  if (action.type === "RESET") {
    return [];
  }
};

const useStyles = makeStyles((theme) => ({
  mainPaper: {
    flex: 1,
    padding: 0,
    overflowY: "auto",
    borderRadius: 8,
    ...theme.scrollbarStyles,
  },
  recurringChip: {
    backgroundColor: theme.palette.primary.main,
    color: theme.palette.primary.contrastText,
    fontSize: "0.7rem",
    height: 20,
  },
  statusChip: {
    fontSize: "0.7rem",
    height: 20,
  },
  nextExecutionCell: {
    fontWeight: 500,
    color: theme.palette.text.secondary,
    fontSize: "0.8rem",
  },
  filterContainer: {
    padding: theme.spacing(1.5, 2),
    marginBottom: theme.spacing(1.5),
    borderRadius: 8,
  },
  tableHeader: {
    fontWeight: 700,
    backgroundColor: theme.palette.grey[100],
    fontSize: "0.78rem",
    color: theme.palette.text.secondary,
    padding: theme.spacing(1, 1.5),
    whiteSpace: "nowrap",
  },
  tableCell: {
    fontSize: "0.82rem",
    padding: theme.spacing(0.8, 1.5),
  },
  summaryCard: {
    borderRadius: 12,
    minWidth: 140,
    textAlign: "center",
    transition: "transform 0.2s",
    "&:hover": { transform: "translateY(-2px)" },
  },
  summaryValue: {
    fontSize: "1.8rem",
    fontWeight: 700,
    lineHeight: 1.2,
  },
  summaryLabel: {
    fontSize: "0.75rem",
    color: theme.palette.text.secondary,
    marginTop: 2,
  },
  progressBar: {
    height: 6,
    borderRadius: 3,
    marginTop: 4,
  },
  progressText: {
    fontSize: "0.65rem",
    color: theme.palette.text.secondary,
  },
  bulkToolbar: {
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(1),
    padding: theme.spacing(1, 2),
    backgroundColor: theme.palette.primary.light,
    color: theme.palette.primary.contrastText,
    borderRadius: "8px 8px 0 0",
  },
  messagePreview: {
    padding: theme.spacing(1.5),
    maxWidth: 300,
    fontSize: "0.8rem",
    whiteSpace: "pre-wrap",
    wordBreak: "break-word",
  },
  connectionBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
  },
}));

const Campaigns = () => {
  const classes = useStyles();
  const history = useHistory();

  const [loading, setLoading] = useState(false);
  const [pageNumber, setPageNumber] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [hasMore, setHasMore] = useState(false);
  const [selectedCampaign, setSelectedCampaign] = useState(null);
  const [deletingCampaign, setDeletingCampaign] = useState(null);
  const [campaignModalOpen, setCampaignModalOpen] = useState(false);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [stopRecurrenceModalOpen, setStopRecurrenceModalOpen] = useState(false);
  const [searchParam, setSearchParam] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [recurrenceFilter, setRecurrenceFilter] = useState("");
  const [campaigns, dispatch] = useReducer(reducer, []);
  const { user, socket } = useContext(AuthContext);
  const { datetimeToClient } = useDate();
  const { getPlanCompany } = usePlans();

  // Bulk actions
  const [selectedIds, setSelectedIds] = useState([]);
  const [bulkConfirmOpen, setBulkConfirmOpen] = useState(false);
  const [bulkAction, setBulkAction] = useState(null);

  // Message preview popover
  const [previewAnchor, setPreviewAnchor] = useState(null);
  const [previewMessage, setPreviewMessage] = useState("");

  useEffect(() => {
    async function fetchData() {
      const companyId = user.companyId;
      const planConfigs = await getPlanCompany(undefined, companyId);
      if (!planConfigs.plan.useCampaigns) {
        toast.error(i18n.t("campaigns.toasts.noPermission"));
        setTimeout(() => { history.push(`/`); }, 1000);
      }
    }
    fetchData();
  }, []);

  useEffect(() => {
    dispatch({ type: "RESET" });
    setPageNumber(1);
  }, [searchParam, statusFilter, recurrenceFilter, pageSize]);

  useEffect(() => {
    setLoading(true);
    const delayDebounceFn = setTimeout(() => { fetchCampaigns(); }, 500);
    return () => clearTimeout(delayDebounceFn);
  }, [searchParam, pageNumber, statusFilter, recurrenceFilter, pageSize]);

  useEffect(() => {
    const companyId = user.companyId;
    const onCompanyCampaign = (data) => {
      if (data.action === "update" || data.action === "create") {
        dispatch({ type: "UPDATE_CAMPAIGNS", payload: data.record });
      }
      if (data.action === "delete") {
        dispatch({ type: "DELETE_CAMPAIGN", payload: +data.id });
      }
    };
    socket.on(`company-${companyId}-campaign`, onCompanyCampaign);
    return () => { socket.off(`company-${companyId}-campaign`, onCompanyCampaign); };
  }, [user]);

  const fetchCampaigns = async () => {
    try {
      const { data } = await api.get("/campaigns/", {
        params: { searchParam, pageNumber, pageSize, status: statusFilter, isRecurring: recurrenceFilter },
      });
      if (pageNumber === 1) { dispatch({ type: "RESET" }); }
      dispatch({ type: "LOAD_CAMPAIGNS", payload: data.records });
      setHasMore(data.hasMore);
      setTotalPages(data.totalPages || 1);
      setTotalCount(data.count || 0);
      setLoading(false);
    } catch (err) {
      toastError(err);
    }
  };

  // Auto-refresh a cada 15s quando há campanhas Em Andamento
  useEffect(() => {
    const hasCampaignInProgress = campaigns.some(c => c.status === "EM_ANDAMENTO");
    if (!hasCampaignInProgress) return;
    const interval = setInterval(() => { fetchCampaigns(); }, 15000);
    return () => clearInterval(interval);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [campaigns]);


  const handleOpenCampaignModal = () => { setSelectedCampaign(null); setCampaignModalOpen(true); };
  const handleCloseCampaignModal = () => { setSelectedCampaign(null); setCampaignModalOpen(false); };
  const handleSearch = (event) => { setSearchParam(event.target.value.toLowerCase()); };
  const handleStatusFilterChange = (event) => { setStatusFilter(event.target.value); };
  const handleRecurrenceFilterChange = (event) => { setRecurrenceFilter(event.target.value); };
  const handleEditCampaign = (campaign) => { setSelectedCampaign(campaign); setCampaignModalOpen(true); };

  const handleDeleteCampaign = async (campaignId) => {
    try {
      await api.delete(`/campaigns/${campaignId}`);
      toast.success(i18n.t("campaigns.toasts.deleted"));
    } catch (err) {
      toastError(err);
    }
    setDeletingCampaign(null);
    setSearchParam("");
    setPageNumber(1);
  };

  const handleStopRecurrence = async (campaignId) => {
    try {
      await api.post(`/campaigns/${campaignId}/stop-recurrence`);
      toast.success(i18n.t("campaigns.toasts.recurrenceStopped"));
      setPageNumber(1);
      fetchCampaigns();
    } catch (err) {
      toastError(err);
    }
    setStopRecurrenceModalOpen(false);
    setSelectedCampaign(null);
  };

  const handlePageChange = (event, newPage) => { setPageNumber(newPage + 1); };
  const handlePageSizeChange = (event) => { setPageSize(parseInt(event.target.value, 10)); setPageNumber(1); };

  const formatStatus = (val) => {
    const map = { INATIVA: i18n.t("campaigns.statuses.inactive"), PROGRAMADA: i18n.t("campaigns.statuses.scheduled"), EM_ANDAMENTO: i18n.t("campaigns.statuses.inProgress"), CANCELADA: i18n.t("campaigns.statuses.cancelled"), FINALIZADA: i18n.t("campaigns.statuses.finished") };
    return map[val] || val;
  };

  const getStatusColor = (status) => {
    if (status === "PROGRAMADA") return "primary";
    if (status === "EM_ANDAMENTO") return "secondary";
    return "default";
  };

  const formatRecurrenceType = (type) => {
    const map = { minutely: i18n.t("campaigns.recurrence.minutely"), hourly: i18n.t("campaigns.recurrence.hourly"), daily: i18n.t("campaigns.recurrence.daily"), weekly: i18n.t("campaigns.recurrence.weekly"), biweekly: i18n.t("campaigns.recurrence.biweekly"), monthly: i18n.t("campaigns.recurrence.monthly"), yearly: i18n.t("campaigns.recurrence.yearly") };
    return map[type] || type;
  };

  const cancelCampaign = async (campaign) => {
    try {
      await api.post(`/campaigns/${campaign.id}/cancel`);
      toast.success(i18n.t("campaigns.toasts.cancel"));
      setPageNumber(1);
      fetchCampaigns();
    } catch (err) {
      toast.error(err.message);
    }
  };

  const restartCampaign = async (campaign) => {
    try {
      await api.post(`/campaigns/${campaign.id}/restart`);
      toast.success(i18n.t("campaigns.toasts.restart"));
      setPageNumber(1);
      fetchCampaigns();
    } catch (err) {
      toast.error(err.message);
    }
  };

  // Duplicate campaign
  const handleDuplicate = async (campaign) => {
    try {
      await api.post(`/campaigns/${campaign.id}/duplicate`);
      toast.success(i18n.t("campaigns.toasts.duplicated"));
      setPageNumber(1);
      fetchCampaigns();
    } catch (err) {
      toastError(err);
    }
  };

  // Export campaigns to CSV
  const handleExport = useCallback(() => {
    const headers = [
      i18n.t("campaigns.table.name"),
      i18n.t("campaigns.table.status"),
      i18n.t("campaigns.table.recurrence"),
      i18n.t("campaigns.table.contactList"),
      i18n.t("campaigns.table.whatsapp"),
      i18n.t("campaigns.table.scheduledAt"),
      i18n.t("campaigns.table.completedAt"),
    ];
    const rows = campaigns.map(c => [
      c.name,
      formatStatus(c.status),
      c.isRecurring ? formatRecurrenceType(c.recurrenceType) : i18n.t("campaigns.filters.single"),
      c.contactList?.name || c.tagListId || "—",
      c.whatsapp?.name || "—",
      c.scheduledAt ? datetimeToClient(c.scheduledAt) : "—",
      c.completedAt ? datetimeToClient(c.completedAt) : "—",
    ]);
    const csvContent = [headers, ...rows].map(r => r.map(v => `"${String(v).replace(/"/g, '""')}"`).join(",")).join("\n");
    const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `campaigns_${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }, [campaigns]);

  // Bulk selection
  const handleSelectAll = (e) => {
    if (e.target.checked) {
      setSelectedIds(campaigns.map(c => c.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleSelectOne = (id) => {
    setSelectedIds(prev =>
      prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
    );
  };

  const executeBulkAction = async () => {
    try {
      for (const id of selectedIds) {
        if (bulkAction === "delete") {
          await api.delete(`/campaigns/${id}`);
        } else if (bulkAction === "cancel") {
          await api.post(`/campaigns/${id}/cancel`);
        } else if (bulkAction === "restart") {
          await api.post(`/campaigns/${id}/restart`);
        }
      }
      toast.success(i18n.t("campaigns.toasts.bulkSuccess"));
      setSelectedIds([]);
      setPageNumber(1);
      fetchCampaigns();
    } catch (err) {
      toastError(err);
    }
    setBulkConfirmOpen(false);
    setBulkAction(null);
  };

  // Message preview
  const handlePreviewOpen = (event, message) => {
    setPreviewAnchor(event.currentTarget);
    setPreviewMessage(message || i18n.t("campaigns.noMessage"));
  };
  const handlePreviewClose = () => {
    setPreviewAnchor(null);
    setPreviewMessage("");
  };

  // Summary metrics
  const summaryMetrics = React.useMemo(() => {
    const total = totalCount;
    const inProgress = campaigns.filter(c => c.status === "EM_ANDAMENTO").length;
    const finished = campaigns.filter(c => c.status === "FINALIZADA").length;
    const cancelled = campaigns.filter(c => c.status === "CANCELADA").length;
    const scheduled = campaigns.filter(c => c.status === "PROGRAMADA").length;
    return { total, inProgress, finished, cancelled, scheduled };
  }, [campaigns, totalCount]);

  if (user.showCampaign !== "enabled") {
    return <ForbiddenPage />;
  }

  return (
    <MainContainer>
      <ConfirmationModal
        title={deletingCampaign && `${i18n.t("campaigns.confirmationModal.deleteTitle")} ${deletingCampaign.name}?`}
        open={confirmModalOpen}
        onClose={setConfirmModalOpen}
        onConfirm={() => handleDeleteCampaign(deletingCampaign.id)}
      >
        {i18n.t("campaigns.confirmationModal.deleteMessage")}
      </ConfirmationModal>

      <ConfirmationModal
        title={i18n.t("campaigns.stopRecurrence.title")}
        open={stopRecurrenceModalOpen}
        onClose={() => setStopRecurrenceModalOpen(false)}
        onConfirm={() => handleStopRecurrence(selectedCampaign?.id)}
      >
        {i18n.t("campaigns.stopRecurrence.message")}
      </ConfirmationModal>

      {/* Bulk action confirmation */}
      <ConfirmationModal
        title={i18n.t("campaigns.bulk.confirmTitle")}
        open={bulkConfirmOpen}
        onClose={() => setBulkConfirmOpen(false)}
        onConfirm={executeBulkAction}
      >
        {i18n.t("campaigns.bulk.confirmMessage", { count: selectedIds.length })}
      </ConfirmationModal>

      {/* Message preview popover */}
      <Popover
        open={Boolean(previewAnchor)}
        anchorEl={previewAnchor}
        onClose={handlePreviewClose}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
        transformOrigin={{ vertical: "top", horizontal: "center" }}
      >
        <div className={classes.messagePreview}>{previewMessage}</div>
      </Popover>

      {campaignModalOpen && (
        <ErrorBoundary
          message="Erro ao abrir modal de campanha"
          onError={() => handleCloseCampaignModal()}
        >
          <CampaignModal
            resetPagination={() => { setPageNumber(1); fetchCampaigns(); }}
            open={campaignModalOpen}
            onClose={handleCloseCampaignModal}
            aria-labelledby="form-dialog-title"
            campaignId={selectedCampaign && selectedCampaign.id}
          />
        </ErrorBoundary>
      )}

      {user.profile === "user" && user?.showCampaign === "disabled" ? (
        <ForbiddenPage />
      ) : (
        <>
          <MainHeader>
            <Grid style={{ width: "99.6%" }} container>
              <Grid xs={12} sm={8} item>
                <Title>{i18n.t("campaigns.title")}</Title>
              </Grid>
              <Grid xs={12} sm={4} item>
                <Grid spacing={2} container>
                  <Grid xs={4} sm={4} item>
                    <TextField
                      fullWidth
                      placeholder={i18n.t("campaigns.searchPlaceholder")}
                      type="search"
                      value={searchParam}
                      onChange={handleSearch}
                      InputProps={{
                        startAdornment: (
                          <InputAdornment position="start">
                            <SearchIcon style={{ color: "gray" }} />
                          </InputAdornment>
                        ),
                      }}
                    />
                  </Grid>
                  <Grid xs={4} sm={4} item>
                    <Tooltip title={i18n.t("campaigns.tooltips.export")}>
                      <Button fullWidth variant="outlined" onClick={handleExport} color="default" style={{ height: "100%" }}>
                        <GetAppIcon fontSize="small" style={{ marginRight: 4 }} />
                        CSV
                      </Button>
                    </Tooltip>
                  </Grid>
                  <Grid xs={4} sm={4} item>
                    <Button fullWidth variant="contained" onClick={handleOpenCampaignModal} color="primary">
                      {i18n.t("campaigns.buttons.add")}
                    </Button>
                  </Grid>
                </Grid>
              </Grid>
            </Grid>
          </MainHeader>

          {/* Dashboard Summary Cards */}
          <Grid container spacing={2} style={{ marginBottom: 12 }}>
            {[
              { label: i18n.t("campaigns.summary.total"), value: summaryMetrics.total, color: "#607D8B" },
              { label: i18n.t("campaigns.summary.scheduled"), value: summaryMetrics.scheduled, color: "#1976d2" },
              { label: i18n.t("campaigns.summary.inProgress"), value: summaryMetrics.inProgress, color: "#ff9800" },
              { label: i18n.t("campaigns.summary.finished"), value: summaryMetrics.finished, color: "#4caf50" },
              { label: i18n.t("campaigns.summary.cancelled"), value: summaryMetrics.cancelled, color: "#f44336" },
            ].map((item, idx) => (
              <Grid item xs={6} sm={2} key={idx}>
                <Card className={classes.summaryCard} variant="outlined">
                  <CardContent style={{ padding: 12 }}>
                    <Typography className={classes.summaryValue} style={{ color: item.color }}>
                      {item.value}
                    </Typography>
                    <Typography className={classes.summaryLabel}>{item.label}</Typography>
                  </CardContent>
                </Card>
              </Grid>
            ))}
          </Grid>

          {/* Filtros */}
          <Paper className={classes.filterContainer} variant="outlined">
            <Grid spacing={2} container alignItems="center">
              <Grid xs={12} sm={4} item>
                <FormControl fullWidth variant="outlined" size="small">
                  <InputLabel>{i18n.t("campaigns.filters.status")}</InputLabel>
                  <Select value={statusFilter} onChange={handleStatusFilterChange} label={i18n.t("campaigns.filters.status")}>
                    <MenuItem value="">{i18n.t("campaigns.filters.all")}</MenuItem>
                    <MenuItem value="INATIVA">{i18n.t("campaigns.statuses.inactive")}</MenuItem>
                    <MenuItem value="PROGRAMADA">{i18n.t("campaigns.statuses.scheduled")}</MenuItem>
                    <MenuItem value="EM_ANDAMENTO">{i18n.t("campaigns.statuses.inProgress")}</MenuItem>
                    <MenuItem value="CANCELADA">{i18n.t("campaigns.statuses.cancelled")}</MenuItem>
                    <MenuItem value="FINALIZADA">{i18n.t("campaigns.statuses.finished")}</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
              <Grid xs={12} sm={4} item>
                <FormControl fullWidth variant="outlined" size="small">
                  <InputLabel>{i18n.t("campaigns.filters.recurrence")}</InputLabel>
                  <Select value={recurrenceFilter} onChange={handleRecurrenceFilterChange} label={i18n.t("campaigns.filters.recurrence")}>
                    <MenuItem value="">{i18n.t("campaigns.filters.allFem")}</MenuItem>
                    <MenuItem value="true">{i18n.t("campaigns.filters.recurring")}</MenuItem>
                    <MenuItem value="false">{i18n.t("campaigns.filters.single")}</MenuItem>
                  </Select>
                </FormControl>
              </Grid>
            </Grid>
          </Paper>

          {/* Bulk Actions Toolbar */}
          {selectedIds.length > 0 && (
            <div className={classes.bulkToolbar}>
              <Typography variant="body2" style={{ fontWeight: 600 }}>
                {selectedIds.length} {i18n.t("campaigns.bulk.selected")}
              </Typography>
              <Button size="small" variant="contained" color="secondary" onClick={() => { setBulkAction("cancel"); setBulkConfirmOpen(true); }}>
                {i18n.t("campaigns.bulk.cancelAll")}
              </Button>
              <Button size="small" variant="contained" style={{ backgroundColor: "#4caf50", color: "#fff" }} onClick={() => { setBulkAction("restart"); setBulkConfirmOpen(true); }}>
                {i18n.t("campaigns.bulk.restartAll")}
              </Button>
              <Button size="small" variant="contained" style={{ backgroundColor: "#f44336", color: "#fff" }} onClick={() => { setBulkAction("delete"); setBulkConfirmOpen(true); }}>
                {i18n.t("campaigns.bulk.deleteAll")}
              </Button>
            </div>
          )}

          <Paper className={classes.mainPaper} variant="outlined">
            <Table size="small">
              <TableHead>
                <TableRow>
                  <TableCell padding="checkbox" className={classes.tableHeader}>
                    <Checkbox
                      indeterminate={selectedIds.length > 0 && selectedIds.length < campaigns.length}
                      checked={campaigns.length > 0 && selectedIds.length === campaigns.length}
                      onChange={handleSelectAll}
                      size="small"
                    />
                  </TableCell>
                  <TableCell align="left" className={classes.tableHeader}>{i18n.t("campaigns.table.name")}</TableCell>
                  <TableCell align="center" className={classes.tableHeader}>{i18n.t("campaigns.table.status")}</TableCell>
                  <TableCell align="center" className={classes.tableHeader}>{i18n.t("campaigns.table.recurrence")}</TableCell>
                  <TableCell align="center" className={classes.tableHeader}>{i18n.t("campaigns.table.contactList")}</TableCell>
                  <TableCell align="center" className={classes.tableHeader}>{i18n.t("campaigns.table.whatsapp")}</TableCell>
                  <TableCell align="center" className={classes.tableHeader}>{i18n.t("campaigns.table.scheduledAt")}</TableCell>
                  <TableCell align="center" className={classes.tableHeader}>{i18n.t("campaigns.table.nextExecution")}</TableCell>
                  <TableCell align="center" className={classes.tableHeader}>{i18n.t("campaigns.table.completedAt")}</TableCell>
                  <TableCell align="center" className={classes.tableHeader}>{i18n.t("campaigns.table.actions")}</TableCell>
                </TableRow>
              </TableHead>
              <TableBody>
                <>
                  {campaigns.map((campaign) => (
                    <TableRow key={campaign.id} hover selected={selectedIds.includes(campaign.id)}>
                      <TableCell padding="checkbox">
                        <Checkbox
                          checked={selectedIds.includes(campaign.id)}
                          onChange={() => handleSelectOne(campaign.id)}
                          size="small"
                        />
                      </TableCell>
                      <TableCell align="left" className={classes.tableCell}>
                        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                          {campaign.isRecurring && (
                            <Tooltip title={i18n.t("campaigns.tooltips.recurring")}>
                              <RepeatIcon color="primary" style={{ fontSize: 16 }} />
                            </Tooltip>
                          )}
                          <span style={{ fontWeight: 500, cursor: "pointer" }}
                            onMouseEnter={(e) => handlePreviewOpen(e, campaign.message1)}
                            onMouseLeave={handlePreviewClose}
                          >
                            {campaign.name}
                          </span>
                          {campaign.message1 && (
                            <Tooltip title={i18n.t("campaigns.tooltips.preview")}>
                              <ChatBubbleOutlineIcon style={{ fontSize: 14, color: "#999", cursor: "pointer" }}
                                onMouseEnter={(e) => handlePreviewOpen(e, campaign.message1)}
                                onMouseLeave={handlePreviewClose}
                              />
                            </Tooltip>
                          )}
                        </div>
                      </TableCell>
                      <TableCell align="center" className={classes.tableCell}>
                        <div>
                          <Chip
                            label={formatStatus(campaign.status)}
                            color={getStatusColor(campaign.status)}
                            size="small"
                            className={classes.statusChip}
                          />
                          {/* Progress bar for EM_ANDAMENTO */}
                          {(campaign.status === "EM_ANDAMENTO" || campaign.status === "FINALIZADA") && (campaign.dataValues?.shippingTotal || campaign.shippingTotal) > 0 && (
                            <div style={{ marginTop: 4 }}>
                              <LinearProgress
                                variant="determinate"
                                value={(() => {
                                  const total = Number(campaign.dataValues?.shippingTotal || campaign.shippingTotal || 0);
                                  const delivered = Number(campaign.dataValues?.shippingDelivered || campaign.shippingDelivered || 0);
                                  return total > 0 ? (delivered / total) * 100 : 0;
                                })()}
                                className={classes.progressBar}
                                color={campaign.status === "FINALIZADA" ? "primary" : "secondary"}
                              />
                              <span className={classes.progressText} style={{ display: "flex", flexDirection: "column", alignItems: "center", lineHeight: 1.2 }}>
                                <span>Enviadas: {Number(campaign.dataValues?.shippingDelivered || campaign.shippingDelivered || 0)} / Contatos: {Number(campaign.dataValues?.shippingTotal || campaign.shippingTotal || 0)}</span>
                              </span>
                            </div>
                          )}
                        </div>
                      </TableCell>
                      <TableCell align="center" className={classes.tableCell}>
                        {campaign.isRecurring ? (
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                            <Chip label={formatRecurrenceType(campaign.recurrenceType)} className={classes.recurringChip} size="small" />
                            <span style={{ fontSize: "0.7rem", color: "#888" }}>{campaign.executionCount || 0}x</span>
                          </div>
                        ) : (
                          <Chip label={i18n.t("campaigns.filters.single")} variant="outlined" size="small" className={classes.statusChip} />
                        )}
                      </TableCell>
                      <TableCell align="center" className={classes.tableCell}>
                        {(() => {
                          const tagName =
                            campaign.dataValues?.tagListName || campaign.tagListName;
                          if (campaign.contactListId && campaign.contactList?.name) {
                            return campaign.contactList.name;
                          }
                          if (campaign.tagListId && campaign.tagListId !== "none" && campaign.tagListId !== "Nenhuma") {
                            return tagName ? `Tag: ${tagName}` : `Tag #${campaign.tagListId}`;
                          }
                          if (campaign.contactListId) {
                            return i18n.t("campaigns.listRemoved");
                          }
                          return "—";
                        })()}
                      </TableCell>
                      <TableCell align="center" className={classes.tableCell}>
                        {campaign.whatsapp ? (
                          <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                            <span className={classes.connectionBadge}>
                              <FiberManualRecordIcon
                                style={{
                                  fontSize: 10,
                                  color: campaign.whatsapp.status === "CONNECTED" ? "#4caf50" : "#f44336",
                                }}
                              />
                              {campaign.whatsapp.name}
                            </span>
                            {campaign.whatsapp.isOficial && (
                              <Chip
                                label="API Oficial"
                                size="small"
                                style={{ height: 18, fontSize: "0.65rem", backgroundColor: "#1976d2", color: "#fff" }}
                              />
                            )}
                            {campaign.whatsapp.channel === "wacalls" && (
                              <Chip
                                label="WhatsApp Plus - Voz + Msg"
                                size="small"
                                style={{ height: 18, fontSize: "0.65rem", backgroundColor: "#f97316", color: "#fff" }}
                              />
                            )}
                          </div>
                        ) : campaign.whatsappId ? (
                          <span className={classes.connectionBadge} title={i18n.t("campaigns.connectionDeleted")}>
                            <FiberManualRecordIcon style={{ fontSize: 10, color: "#999" }} />
                            {`${i18n.t("campaigns.connectionPrefix")} #${campaign.whatsappId}`}
                          </span>
                        ) : (
                          i18n.t("campaigns.noConnection")
                        )}
                      </TableCell>
                      <TableCell align="center" className={classes.tableCell} style={{ whiteSpace: "nowrap" }}>
                        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 2 }}>
                          <span>{campaign.scheduledAt ? datetimeToClient(campaign.scheduledAt) : "—"}</span>
                          {campaign.templateId && (
                            <span style={{ fontSize: "0.7rem", color: "#1976d2" }}>
                              <DescriptionIcon style={{ fontSize: 11, verticalAlign: "middle" }} />
                              {" "}{campaign.templateName || `Template #${campaign.templateId}`}
                            </span>
                          )}
                          {campaign.sendFollowUpMessage && !campaign.whatsapp?.isOficial && (
                            <Tooltip title="Follow-up ativo">
                              <span style={{ fontSize: "0.7rem", color: "#f57c00" }}>
                                <RepeatIcon style={{ fontSize: 11, verticalAlign: "middle" }} />
                                {" "}Follow-up
                              </span>
                            </Tooltip>
                          )}
                        </div>
                      </TableCell>
                      <TableCell align="center" className={classes.nextExecutionCell} style={{ whiteSpace: "nowrap" }}>
                        {campaign.isRecurring && campaign.nextScheduledAt ? (
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 4 }}>
                            <ScheduleIcon style={{ fontSize: 14 }} color="primary" />
                            {datetimeToClient(campaign.nextScheduledAt)}
                          </div>
                        ) : campaign.isRecurring && campaign.status === "FINALIZADA" ? (
                          <span style={{ color: "#999", fontSize: "0.75rem" }}>{i18n.t("campaigns.statuses.finished")}</span>
                        ) : "—"}
                      </TableCell>
                      <TableCell align="center" className={classes.tableCell} style={{ whiteSpace: "nowrap" }}>
                        {campaign.completedAt ? datetimeToClient(campaign.completedAt) : i18n.t("campaigns.notCompleted")}
                      </TableCell>
                      <TableCell align="center" className={classes.tableCell}>
                        <div style={{ display: "flex", justifyContent: "center", gap: 2 }}>
                          {campaign.status === "EM_ANDAMENTO" && (
                            <Tooltip title={i18n.t("campaigns.tooltips.stop")}>
                              <IconButton onClick={() => cancelCampaign(campaign)} size="small">
                                <PauseCircleOutlineIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                          {campaign.status === "CANCELADA" && (
                            <Tooltip title={i18n.t("campaigns.tooltips.restart")}>
                              <IconButton onClick={() => restartCampaign(campaign)} size="small">
                                <PlayCircleOutlineIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                          {campaign.isRecurring && campaign.status !== "FINALIZADA" && (
                            <Tooltip title={i18n.t("campaigns.tooltips.stopRecurrence")}>
                              <IconButton
                                onClick={() => { setSelectedCampaign(campaign); setStopRecurrenceModalOpen(true); }}
                                size="small"
                                color="secondary"
                              >
                                <StopIcon fontSize="small" />
                              </IconButton>
                            </Tooltip>
                          )}
                          <Tooltip title={i18n.t("campaigns.tooltips.duplicate")}>
                            <IconButton onClick={() => handleDuplicate(campaign)} size="small">
                              <FileCopyIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title={i18n.t("tooltips.report")}>
                            <IconButton onClick={() => history.push(`/campaign/${campaign.id}/report`)} size="small">
                              <DescriptionIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title={i18n.t("tooltips.edit")}>
                            <IconButton size="small" onClick={() => handleEditCampaign(campaign)}>
                              <EditIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                          <Tooltip title={i18n.t("tooltips.delete")}>
                            <IconButton
                              size="small"
                              onClick={() => { setConfirmModalOpen(true); setDeletingCampaign(campaign); }}
                            >
                              <DeleteOutlineIcon fontSize="small" />
                            </IconButton>
                          </Tooltip>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                  {loading && <TableRowSkeleton columns={10} />}
                </>
              </TableBody>
            </Table>

            {/* Paginação */}
            <Box display="flex" justifyContent="space-between" alignItems="center" p={2}>
              <Box color="text.secondary" fontSize="0.875rem">
                Total: {totalCount} {i18n.t("campaigns.totalLabel")}
              </Box>
              <TablePagination
                component="div"
                count={totalCount}
                page={pageNumber - 1}
                onPageChange={handlePageChange}
                rowsPerPage={pageSize}
                onRowsPerPageChange={handlePageSizeChange}
                rowsPerPageOptions={[5, 10, 25, 50, 100]}
                labelRowsPerPage={i18n.t("campaigns.pagination.rowsPerPage")}
                labelDisplayedRows={({ from, to, count }) =>
                  `${from}-${to} ${i18n.t("campaigns.pagination.of")} ${count !== -1 ? count : `${i18n.t("campaigns.pagination.moreThan")} ${to}`}`
                }
              />
            </Box>
          </Paper>
        </>
      )}
    </MainContainer>
  );
};

export default Campaigns;
