import React, { useState, useEffect, useReducer, useContext, useMemo, useCallback } from "react";
import { toast } from "react-toastify";
import { useHistory } from "react-router-dom";
import { Bar, Doughnut } from "react-chartjs-2";
import { Chart as ChartJS, ArcElement, Tooltip as ChartTooltip, Legend, CategoryScale, LinearScale, BarElement } from "chart.js";
import ChartDataLabels from "chartjs-plugin-datalabels";
import { makeStyles } from "@material-ui/core/styles";
import Table from "@material-ui/core/Table";
import TableBody from "@material-ui/core/TableBody";
import TableCell from "@material-ui/core/TableCell";
import TableHead from "@material-ui/core/TableHead";
import TableRow from "@material-ui/core/TableRow";
import Paper from "@material-ui/core/Paper";
import Button from "@material-ui/core/Button";
import Avatar from "@material-ui/core/Avatar";
import SearchIcon from "@material-ui/icons/Search";
import TextField from "@material-ui/core/TextField";
import InputAdornment from "@material-ui/core/InputAdornment";
import IconButton from "@material-ui/core/IconButton";
import DeleteOutlineIcon from "@material-ui/icons/DeleteOutline";
import EditIcon from "@material-ui/icons/Edit";
import AccountBalanceWalletIcon from "@material-ui/icons/AccountBalanceWallet";
import PersonIcon from "@material-ui/icons/Person";
import QueueIcon from "@material-ui/icons/Queue";
import PeopleIcon from "@material-ui/icons/People";
import EmailIcon from "@material-ui/icons/Email";
import Chip from "@material-ui/core/Chip";
import Tooltip from "@material-ui/core/Tooltip";
import Typography from "@material-ui/core/Typography";
import Box from "@material-ui/core/Box";
import WhatsAppIcon from "@material-ui/icons/WhatsApp";

import api from "../../services/api";
import TableRowSkeleton from "../../components/TableRowSkeleton";
import ConfirmationModal from "../../components/ConfirmationModal/";
import { i18n } from "../../translate/i18n";
import MainHeader from "../../components/MainHeader";
import Title from "../../components/Title";
import MainHeaderButtonsWrapper from "../../components/MainHeaderButtonsWrapper";
import MainContainer from "../../components/MainContainer";
import toastError from "../../errors/toastError";
import { AuthContext } from "../../context/Auth/AuthContext";
import FormControl from "@material-ui/core/FormControl";
import InputLabel from "@material-ui/core/InputLabel";
import Select from "@material-ui/core/Select";
import MenuItem from "@material-ui/core/MenuItem";
import Dialog from "@material-ui/core/Dialog";
import DialogTitle from "@material-ui/core/DialogTitle";
import DialogContent from "@material-ui/core/DialogContent";
import DialogActions from "@material-ui/core/DialogActions";
import Autocomplete from "@material-ui/lab/Autocomplete";
import CircularProgress from "@material-ui/core/CircularProgress";

ChartJS.register(ArcElement, ChartTooltip, Legend, CategoryScale, LinearScale, BarElement, ChartDataLabels);

const reducer = (state, action) => {
  if (action.type === "LOAD_WALLETS") {
    const wallets = action.payload;
    const newWallets = [];

    wallets.forEach((wallet) => {
      const walletIndex = state.findIndex((w) => w.id === wallet.id);
      if (walletIndex !== -1) {
        state[walletIndex] = wallet;
      } else {
        newWallets.push(wallet);
      }
    });

    return [...state, ...newWallets];
  }

  if (action.type === "UPDATE_WALLET") {
    const wallet = action.payload;
    const walletIndex = state.findIndex((w) => w.id === wallet.id);

    if (walletIndex !== -1) {
      state[walletIndex] = wallet;
      return [...state];
    } else {
      return [wallet, ...state];
    }
  }

  if (action.type === "DELETE_WALLET") {
    const walletId = action.payload;
    return state.filter((w) => w.id !== walletId);
  }

  if (action.type === "RESET") {
    return [];
  }
};

const useStyles = makeStyles((theme) => ({
  mainPaper: {
    flex: 1,
    padding: theme.spacing(2),
    overflowY: "auto",
    ...theme.scrollbarStyles,
  },
  statsContainer: {
    display: "flex",
    gap: theme.spacing(2),
    marginBottom: theme.spacing(2),
    flexWrap: "wrap",
  },
  statCard: {
    flex: "1 1 180px",
    padding: theme.spacing(2),
    borderRadius: 12,
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(1.5),
    minWidth: 180,
    border: `1px solid ${theme.palette.divider}`,
    backgroundColor: theme.palette.background.paper,
  },
  statIconWrapper: {
    width: 44,
    height: 44,
    borderRadius: 10,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  statValue: {
    fontSize: "1.5rem",
    fontWeight: 700,
    lineHeight: 1,
  },
  statLabel: {
    fontSize: "0.75rem",
    color: theme.palette.text.secondary,
    marginTop: 2,
  },
  filterContainer: {
    display: "flex",
    gap: theme.spacing(2),
    marginBottom: theme.spacing(2),
    alignItems: "center",
    flexWrap: "wrap",
  },
  formControl: {
    minWidth: 200,
  },
  tableContainer: {
    borderRadius: 8,
    overflow: "hidden",
  },
  tableHead: {
    backgroundColor: theme.palette.type === "dark" ? theme.palette.background.default : "#f5f5f5",
  },
  tableHeadCell: {
    fontWeight: 600,
    fontSize: "0.8rem",
    textTransform: "uppercase",
    color: theme.palette.text.secondary,
    padding: "12px 16px",
  },
  tableRow: {
    "&:hover": {
      backgroundColor: theme.palette.action.hover,
    },
    transition: "background-color 0.15s",
  },
  tableCell: {
    padding: "10px 16px",
    borderBottom: `1px solid ${theme.palette.divider}`,
  },
  avatar: {
    width: 36,
    height: 36,
    fontSize: "0.9rem",
    fontWeight: 600,
  },
  contactInfo: {
    display: "flex",
    alignItems: "center",
    gap: 10,
  },
  contactName: {
    fontWeight: 600,
    fontSize: "0.9rem",
  },
  contactNumber: {
    fontSize: "0.75rem",
    color: theme.palette.text.secondary,
    display: "flex",
    alignItems: "center",
    gap: 4,
  },
  chip: {
    height: 26,
    fontSize: "0.75rem",
    fontWeight: 500,
  },
  userChip: {
    backgroundColor: theme.palette.type === "dark" ? "#1a3a5c" : "#e3f2fd",
    color: theme.palette.type === "dark" ? "#90caf9" : "#1565c0",
  },
  queueChip: {
    backgroundColor: theme.palette.type === "dark" ? "#1a3c1a" : "#e8f5e9",
    color: theme.palette.type === "dark" ? "#81c784" : "#2e7d32",
  },
  actionBtn: {
    padding: 6,
    transition: "all 0.2s",
    "&:hover": {
      transform: "scale(1.15)",
    },
  },
  editBtn: {
    color: theme.palette.primary.main,
  },
  deleteBtn: {
    color: theme.palette.error.main,
  },
  whatsappBtn: {
    color: "#25D366",
  },
  dialogContent: {
    minWidth: 400,
  },
  emptyState: {
    textAlign: "center",
    padding: theme.spacing(6),
    color: theme.palette.text.secondary,
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: theme.spacing(2),
    opacity: 0.3,
  },
  chartsContainer: {
    display: "flex",
    gap: theme.spacing(2),
    marginBottom: theme.spacing(2),
    flexWrap: "wrap",
  },
  chartCard: {
    flex: "1 1 340px",
    padding: theme.spacing(2),
    borderRadius: 12,
    border: `1px solid ${theme.palette.divider}`,
    backgroundColor: theme.palette.background.paper,
    minHeight: 280,
    display: "flex",
    flexDirection: "column",
  },
  chartTitle: {
    fontSize: "0.85rem",
    fontWeight: 600,
    marginBottom: theme.spacing(1.5),
    color: theme.palette.text.primary,
  },
  chartWrapper: {
    flex: 1,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    position: "relative",
  },
}));

const Wallets = () => {
  const classes = useStyles();
  const history = useHistory();
  const { user } = useContext(AuthContext);

  const [loading, setLoading] = useState(false);
  const [pageNumber, setPageNumber] = useState(1);
  const [searchParam, setSearchParam] = useState("");
  const [wallets, dispatch] = useReducer(reducer, []);
  const [selectedUserId, setSelectedUserId] = useState("");
  const [users, setUsers] = useState([]);
  const [loadingUsers, setLoadingUsers] = useState(false);
  const [deletingWallet, setDeletingWallet] = useState(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [editingWallet, setEditingWallet] = useState(null);
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedQueue, setSelectedQueue] = useState(null);
  const [queues, setQueues] = useState([]);
  const [loadingQueues, setLoadingQueues] = useState(false);

  const CHART_COLORS = [
    "#1976d2", "#388e3c", "#d32f2f", "#7b1fa2", "#f57c00",
    "#0097a7", "#5d4037", "#455a64", "#c2185b", "#00796b",
    "#ff5722", "#607d8b", "#8bc34a", "#ffc107", "#9c27b0",
  ];

  // Estatísticas calculadas
  const stats = useMemo(() => {
    const uniqueUsers = new Set(wallets.map((w) => w.userId));
    const uniqueQueues = new Set(wallets.map((w) => w.queueId));
    const withEmail = wallets.filter((w) => w.contactEmail).length;

    return {
      total: wallets.length,
      users: uniqueUsers.size,
      queues: uniqueQueues.size,
      withEmail,
    };
  }, [wallets]);

  // Dados dos gráficos
  const userDistribution = useMemo(() => {
    const countByUser = {};
    wallets.forEach((w) => {
      const name = w.userName || "Sem usuário";
      countByUser[name] = (countByUser[name] || 0) + 1;
    });
    const sorted = Object.entries(countByUser).sort((a, b) => b[1] - a[1]);
    return {
      labels: sorted.map(([name]) => name),
      datasets: [{
        data: sorted.map(([, count]) => count),
        backgroundColor: sorted.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]),
        borderWidth: 0,
      }],
    };
  }, [wallets]);

  const queueDistribution = useMemo(() => {
    const countByQueue = {};
    wallets.forEach((w) => {
      const name = w.queueName || "Sem fila";
      countByQueue[name] = (countByQueue[name] || 0) + 1;
    });
    const sorted = Object.entries(countByQueue).sort((a, b) => b[1] - a[1]).slice(0, 10);
    return {
      labels: sorted.map(([name]) => name.length > 15 ? name.slice(0, 15) + "…" : name),
      datasets: [{
        data: sorted.map(([, count]) => count),
        backgroundColor: sorted.map((_, i) => CHART_COLORS[i % CHART_COLORS.length]),
        borderRadius: 6,
        barThickness: 24,
      }],
    };
  }, [wallets]);

  useEffect(() => {
    dispatch({ type: "RESET" });
    setPageNumber(1);
  }, [searchParam, selectedUserId]);

  useEffect(() => {
    fetchUsers();
  }, []);

  useEffect(() => {
    setLoading(true);
    const delayDebounceFn = setTimeout(() => {
      const fetchWallets = async () => {
        try {
          const { data } = await api.get("/contacts/wallets", {
            params: {
              searchParam,
              pageNumber,
              userId: selectedUserId || undefined,
            },
          });
          dispatch({ type: "LOAD_WALLETS", payload: data.wallets });
          setHasMore(data.hasMore);
          setLoading(false);
        } catch (err) {
          toastError(err);
        }
      };

      fetchWallets();
    }, 500);
    return () => clearTimeout(delayDebounceFn);
  }, [searchParam, pageNumber, selectedUserId]);

  const fetchUsers = async () => {
    setLoadingUsers(true);
    try {
      const { data } = await api.get("/users/");
      setUsers(data.users);
    } catch (err) {
      toastError(err);
    } finally {
      setLoadingUsers(false);
    }
  };

  const handleSearch = (event) => {
    setSearchParam(event.target.value);
  };

  const handleUserChange = (event) => {
    setSelectedUserId(event.target.value);
  };

  const handleDeleteWallet = async (walletId) => {
    try {
      const wallet = wallets.find((w) => w.id === walletId);
      if (!wallet) {
        toast.error(i18n.t("hardcoded.walletNotFound"));
        return;
      }

      await api.delete(`/contacts/wallet/${wallet.contactId}`);
      dispatch({ type: "DELETE_WALLET", payload: walletId });
      toast.success(i18n.t("wallets.deleteSuccess"));
    } catch (err) {
      toastError(err);
    }
  };

  const handleOpenEditModal = (wallet) => {
    setEditingWallet(wallet);
    setSelectedUser({
      id: wallet.userId,
      name: wallet.userName,
    });
    setSelectedQueue(wallet.queueId);
    setQueues([{ id: wallet.queueId, name: wallet.queueName }]);
    setEditModalOpen(true);
  };

  const handleCloseEditModal = () => {
    setEditModalOpen(false);
    setEditingWallet(null);
    setSelectedUser(null);
    setSelectedQueue(null);
    setQueues([]);
  };

  const handleSaveEdit = async () => {
    if (!selectedUser || !selectedQueue) {
      toast.error(i18n.t("wallets.selectUserAndQueue"));
      return;
    }

    try {
      await api.put(`/contacts/wallet/${editingWallet.contactId}`, {
        wallets: {
          userId: selectedUser.id,
          queueId: selectedQueue,
        },
      });

      const updatedWallet = {
        ...editingWallet,
        userId: selectedUser.id,
        userName: selectedUser.name,
        queueId: selectedQueue,
        queueName: queues.find((q) => q.id === selectedQueue)?.name || "",
      };
      dispatch({ type: "UPDATE_WALLET", payload: updatedWallet });

      toast.success(i18n.t("wallets.updateSuccess"));
      handleCloseEditModal();
    } catch (err) {
      toastError(err);
    }
  };

  const loadMore = () => {
    setPageNumber((prevState) => prevState + 1);
  };

  const handleScroll = (e) => {
    if (!hasMore || loading) return;
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - (scrollTop + 100) < clientHeight) {
      loadMore();
    }
  };

  const formatPhoneNumber = (number) => {
    if (!number) return "";
    const cleaned = number.replace(/\D/g, "");
    const match = cleaned.match(/^(\d{2})(\d{2})(\d{4,5})(\d{4})$/);
    if (match) {
      return `+${match[1]} (${match[2]}) ${match[3]}-${match[4]}`;
    }
    return number;
  };

  const getAvatarColor = (name) => {
    if (!name) return "#9e9e9e";
    const colors = [
      "#1976d2", "#388e3c", "#d32f2f", "#7b1fa2",
      "#f57c00", "#0097a7", "#5d4037", "#455a64",
      "#c2185b", "#00796b",
    ];
    let hash = 0;
    for (let i = 0; i < name.length; i++) {
      hash = name.charCodeAt(i) + ((hash << 5) - hash);
    }
    return colors[Math.abs(hash) % colors.length];
  };

  const handleOpenWhatsApp = (number) => {
    if (!number) return;
    const cleaned = number.replace(/\D/g, "");
    window.open(`https://wa.me/${cleaned}`, "_blank");
  };

  return (
    <MainContainer>
      <MainHeader>
        <Title>{i18n.t("wallets.title")}</Title>
        <MainHeaderButtonsWrapper>
          <TextField
            placeholder={i18n.t("wallets.searchPlaceholder")}
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
            size="small"
          />
        </MainHeaderButtonsWrapper>
      </MainHeader>

      <Paper className={classes.mainPaper} variant="outlined" onScroll={handleScroll}>
        {/* Cards de Estatísticas */}
        <div className={classes.statsContainer}>
          <div className={classes.statCard}>
            <div className={classes.statIconWrapper} style={{ backgroundColor: "#e3f2fd" }}>
              <PeopleIcon style={{ color: "#1976d2" }} />
            </div>
            <div>
              <div className={classes.statValue}>{stats.total}</div>
              <div className={classes.statLabel}>{i18n.t("wallets.totalContacts") || "Total de Contatos"}</div>
            </div>
          </div>
          <div className={classes.statCard}>
            <div className={classes.statIconWrapper} style={{ backgroundColor: "#e8f5e9" }}>
              <PersonIcon style={{ color: "#388e3c" }} />
            </div>
            <div>
              <div className={classes.statValue}>{stats.users}</div>
              <div className={classes.statLabel}>{i18n.t("wallets.activeUsers") || "Usuários Ativos"}</div>
            </div>
          </div>
          <div className={classes.statCard}>
            <div className={classes.statIconWrapper} style={{ backgroundColor: "#fff3e0" }}>
              <QueueIcon style={{ color: "#f57c00" }} />
            </div>
            <div>
              <div className={classes.statValue}>{stats.queues}</div>
              <div className={classes.statLabel}>{i18n.t("wallets.activeQueues") || "Filas Ativas"}</div>
            </div>
          </div>
          <div className={classes.statCard}>
            <div className={classes.statIconWrapper} style={{ backgroundColor: "#fce4ec" }}>
              <EmailIcon style={{ color: "#c2185b" }} />
            </div>
            <div>
              <div className={classes.statValue}>{stats.withEmail}</div>
              <div className={classes.statLabel}>{i18n.t("wallets.withEmail") || "Com E-mail"}</div>
            </div>
          </div>
        </div>

        {/* Gráficos de Distribuição */}
        {wallets.length > 0 && (
          <div className={classes.chartsContainer}>
            <div className={classes.chartCard}>
              <div className={classes.chartTitle}>
                {i18n.t("wallets.chartByUser") || "Distribuição por Usuário"}
              </div>
              <div className={classes.chartWrapper}>
                <Doughnut
                  data={userDistribution}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    cutout: "60%",
                    plugins: {
                      legend: {
                        position: "right",
                        labels: { boxWidth: 12, padding: 8, font: { size: 11 } },
                      },
                      datalabels: {
                        color: "#fff",
                        font: { weight: "bold", size: 11 },
                        formatter: (value) => value > 0 ? value : "",
                      },
                    },
                  }}
                />
              </div>
            </div>
            <div className={classes.chartCard}>
              <div className={classes.chartTitle}>
                {i18n.t("wallets.chartByQueue") || "Contatos por Fila"}
              </div>
              <div className={classes.chartWrapper}>
                <Bar
                  data={queueDistribution}
                  options={{
                    responsive: true,
                    maintainAspectRatio: false,
                    indexAxis: "y",
                    plugins: {
                      legend: { display: false },
                      datalabels: {
                        anchor: "end",
                        align: "end",
                        font: { weight: "bold", size: 11 },
                        color: "#666",
                      },
                    },
                    scales: {
                      x: { display: false, grid: { display: false } },
                      y: {
                        grid: { display: false },
                        ticks: { font: { size: 11 } },
                      },
                    },
                  }}
                />
              </div>
            </div>
          </div>
        )}

        {/* Filtros */}
        <div className={classes.filterContainer}>
          <FormControl className={classes.formControl} variant="outlined" size="small">
            <InputLabel>{i18n.t("wallets.filterByUser")}</InputLabel>
            <Select
              value={selectedUserId}
              onChange={handleUserChange}
              disabled={loadingUsers}
              label={i18n.t("wallets.filterByUser")}
            >
              <MenuItem value="">
                <em>{i18n.t("wallets.allUsers")}</em>
              </MenuItem>
              {users.map((u) => (
                <MenuItem key={u.id} value={u.id}>
                  {u.name}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        </div>

        {/* Tabela */}
        <div className={classes.tableContainer}>
          <Table size="small">
            <TableHead className={classes.tableHead}>
              <TableRow>
                <TableCell className={classes.tableHeadCell} style={{ width: 50 }} />
                <TableCell className={classes.tableHeadCell}>{i18n.t("wallets.contact")}</TableCell>
                <TableCell className={classes.tableHeadCell}>{i18n.t("wallets.user")}</TableCell>
                <TableCell className={classes.tableHeadCell}>{i18n.t("wallets.queue")}</TableCell>
                <TableCell className={classes.tableHeadCell}>{i18n.t("wallets.phone")}</TableCell>
                <TableCell className={classes.tableHeadCell}>{i18n.t("wallets.email")}</TableCell>
                <TableCell className={classes.tableHeadCell} align="center">{i18n.t("wallets.actions")}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {wallets.map((wallet) => (
                <TableRow key={wallet.id} className={classes.tableRow}>
                  <TableCell className={classes.tableCell}>
                    <Avatar
                      className={classes.avatar}
                      style={{ backgroundColor: getAvatarColor(wallet.contactName) }}
                      src={wallet.contactProfilePicUrl || undefined}
                    >
                      {wallet.contactName ? wallet.contactName.charAt(0).toUpperCase() : "?"}
                    </Avatar>
                  </TableCell>
                  <TableCell className={classes.tableCell}>
                    <div className={classes.contactInfo}>
                      <div>
                        <div className={classes.contactName}>{wallet.contactName}</div>
                        <div className={classes.contactNumber}>
                          <WhatsAppIcon style={{ fontSize: 14, color: "#25D366" }} />
                          {formatPhoneNumber(wallet.contactNumber)}
                        </div>
                      </div>
                    </div>
                  </TableCell>
                  <TableCell className={classes.tableCell}>
                    <Chip
                      icon={<PersonIcon style={{ fontSize: 16 }} />}
                      label={wallet.userName}
                      size="small"
                      className={`${classes.chip} ${classes.userChip}`}
                    />
                  </TableCell>
                  <TableCell className={classes.tableCell}>
                    <Chip
                      icon={<QueueIcon style={{ fontSize: 16 }} />}
                      label={wallet.queueName}
                      size="small"
                      className={`${classes.chip} ${classes.queueChip}`}
                    />
                  </TableCell>
                  <TableCell className={classes.tableCell}>
                    {formatPhoneNumber(wallet.contactNumber)}
                  </TableCell>
                  <TableCell className={classes.tableCell}>
                    {wallet.contactEmail || (
                      <span style={{ color: "#bdbdbd", fontStyle: "italic" }}>—</span>
                    )}
                  </TableCell>
                  <TableCell className={classes.tableCell} align="center">
                    <Tooltip title="WhatsApp">
                      <IconButton
                        size="small"
                        className={`${classes.actionBtn} ${classes.whatsappBtn}`}
                        onClick={() => handleOpenWhatsApp(wallet.contactNumber)}
                        disabled={!wallet.contactNumber}
                      >
                        <WhatsAppIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title={i18n.t("wallets.editWallet")}>
                      <IconButton
                        size="small"
                        className={`${classes.actionBtn} ${classes.editBtn}`}
                        onClick={() => handleOpenEditModal(wallet)}
                      >
                        <EditIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title={i18n.t("wallets.confirmDeleteTitle")}>
                      <IconButton
                        size="small"
                        className={`${classes.actionBtn} ${classes.deleteBtn}`}
                        onClick={() => {
                          setDeletingWallet(wallet);
                          setConfirmOpen(true);
                        }}
                      >
                        <DeleteOutlineIcon fontSize="small" />
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
              {loading && <TableRowSkeleton avatar columns={7} />}
            </TableBody>
          </Table>
        </div>

        {/* Estado vazio */}
        {!loading && wallets.length === 0 && (
          <div className={classes.emptyState}>
            <AccountBalanceWalletIcon className={classes.emptyIcon} />
            <Typography variant="h6" gutterBottom>
              {i18n.t("wallets.emptyTitle") || "Nenhum contato na carteira"}
            </Typography>
            <Typography variant="body2">
              {i18n.t("wallets.emptySubtitle") || "Os contatos vinculados aparecerão aqui."}
            </Typography>
          </div>
        )}
      </Paper>

      {/* Modal de Edição */}
      <Dialog open={editModalOpen} onClose={handleCloseEditModal} maxWidth="sm" fullWidth>
        <DialogTitle>{i18n.t("wallets.editWallet")}</DialogTitle>
        <DialogContent className={classes.dialogContent}>
          <div style={{ marginBottom: 16 }}>
            <Autocomplete
              value={selectedUser}
              onChange={(e, newValue) => {
                setSelectedUser(newValue);
                if (newValue && newValue.queues) {
                  setQueues(newValue.queues);
                  if (newValue.queues.length === 1) {
                    setSelectedQueue(newValue.queues[0].id);
                  } else {
                    setSelectedQueue(null);
                  }
                } else {
                  setQueues([]);
                  setSelectedQueue(null);
                }
              }}
              options={users}
              getOptionLabel={(option) => option.name}
              loading={loadingUsers}
              renderInput={(params) => (
                <TextField
                  {...params}
                  label={i18n.t("wallets.selectUser")}
                  variant="outlined"
                  fullWidth
                  InputProps={{
                    ...params.InputProps,
                    endAdornment: (
                      <>
                        {loadingUsers ? <CircularProgress color="inherit" size={20} /> : null}
                        {params.InputProps.endAdornment}
                      </>
                    ),
                  }}
                />
              )}
            />
          </div>
          <div>
            <FormControl fullWidth variant="outlined">
              <InputLabel>{i18n.t("wallets.selectQueue")}</InputLabel>
              <Select
                value={selectedQueue || ""}
                onChange={(e) => setSelectedQueue(e.target.value)}
                label={i18n.t("wallets.selectQueue")}
              >
                {queues.map((queue) => (
                  <MenuItem key={queue.id} value={queue.id}>
                    {queue.name}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </div>
        </DialogContent>
        <DialogActions>
          <Button onClick={handleCloseEditModal} color="secondary">
            {i18n.t("wallets.cancel")}
          </Button>
          <Button onClick={handleSaveEdit} color="primary" variant="contained">
            {i18n.t("wallets.save")}
          </Button>
        </DialogActions>
      </Dialog>

      {/* Modal de Confirmação */}
      <ConfirmationModal
        title={i18n.t("wallets.confirmDeleteTitle")}
        open={confirmOpen}
        onClose={setConfirmOpen}
        onConfirm={() => {
          handleDeleteWallet(deletingWallet.id);
          setConfirmOpen(false);
        }}
      >
        {i18n.t("wallets.confirmDeleteMessage")}
      </ConfirmationModal>
    </MainContainer>
  );
};

export default Wallets;
