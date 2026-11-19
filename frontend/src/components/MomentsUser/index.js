import React, {
  Fragment,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { useHistory } from "react-router-dom";
import api from "../../services/api";
import { i18n } from "../../translate/i18n";
import toastError from "../../errors/toastError";

import { AuthContext } from "../../context/Auth/AuthContext";
import ReportProblem from "@mui/icons-material/ReportProblem";
import VisibilityOutlined from "@mui/icons-material/VisibilityOutlined";
import SearchIcon from "@mui/icons-material/Search";
import RefreshIcon from "@mui/icons-material/Refresh";
import PeopleIcon from "@mui/icons-material/People";
import HourglassIcon from "@mui/icons-material/HourglassEmpty";
import ChatIcon from "@mui/icons-material/Chat";
import SupervisorIcon from "@mui/icons-material/SupervisorAccount";
import FilterIcon from "@mui/icons-material/FilterList";
import GridIcon from "@mui/icons-material/ViewModule";
import ListIcon from "@mui/icons-material/ViewList";
import FullscreenIcon from "@mui/icons-material/Fullscreen";
import FullscreenExitIcon from "@mui/icons-material/FullscreenExit";
import { toast } from "react-toastify";
import { Avatar, List, ListItem, ListItemAvatar, ListItemText, Paper, Typography, makeStyles, Badge, Tooltip, TextField, InputAdornment, IconButton, MenuItem, Chip, Box } from "@material-ui/core";
import { ToggleButton, ToggleButtonGroup } from "@material-ui/lab";
import format from "date-fns/format";
import isSameDay from "date-fns/isSameDay";
import parseISO from "date-fns/parseISO";
import { getBackendUrl } from "../../config";

const backendUrl = getBackendUrl();

const useStyles = makeStyles((theme) => {
  const isDark = theme.mode === "dark";
  return {
    root: {
      width: "100%",
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(2),
    },
    statsRow: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
      gap: theme.spacing(1.5),
    },
    statCard: {
      padding: theme.spacing(1.75, 2),
      borderRadius: 14,
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(1.5),
      border: isDark
        ? "1px solid rgba(255,255,255,0.06)"
        : "1px solid rgba(0,0,0,0.06)",
      background: isDark ? "#141620" : "#fff",
      transition: "transform .15s ease, box-shadow .15s ease",
      "&:hover": {
        transform: "translateY(-1px)",
        boxShadow: isDark
          ? "0 4px 14px rgba(0,0,0,0.4)"
          : "0 4px 14px rgba(0,0,0,0.06)",
      },
    },
    statIcon: {
      width: 42,
      height: 42,
      borderRadius: 12,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      color: "#fff",
      flexShrink: 0,
    },
    statValue: {
      fontSize: 22,
      fontWeight: 700,
      lineHeight: 1.1,
      color: isDark ? "#e8eaed" : "#1a1a1a",
    },
    statLabel: {
      fontSize: 12,
      color: isDark ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.55)",
      textTransform: "uppercase",
      letterSpacing: 0.4,
    },
    toolbar: {
      padding: theme.spacing(1.25, 1.5),
      borderRadius: 14,
      display: "flex",
      flexWrap: "wrap",
      gap: theme.spacing(1),
      alignItems: "center",
      border: isDark
        ? "1px solid rgba(255,255,255,0.06)"
        : "1px solid rgba(0,0,0,0.06)",
      background: isDark ? "#141620" : "#fff",
    },
    searchField: {
      flex: 1,
      minWidth: 220,
    },
    grid: {
      display: "grid",
      gridTemplateColumns: "repeat(auto-fill, minmax(340px, 1fr))",
      gap: theme.spacing(1.75),
    },
    agentCard: {
      borderRadius: 14,
      overflow: "hidden",
      border: isDark
        ? "1px solid rgba(255,255,255,0.06)"
        : "1px solid rgba(0,0,0,0.06)",
      background: isDark ? "#141620" : "#fff",
      display: "flex",
      flexDirection: "column",
      transition: "transform .15s ease, box-shadow .15s ease",
      "&:hover": {
        transform: "translateY(-2px)",
        boxShadow: isDark
          ? "0 8px 24px rgba(0,0,0,0.45)"
          : "0 8px 24px rgba(0,0,0,0.08)",
      },
    },
    agentHeader: {
      padding: theme.spacing(1.5, 2),
      display: "flex",
      alignItems: "center",
      gap: theme.spacing(1.5),
      borderBottom: isDark
        ? "1px solid rgba(255,255,255,0.06)"
        : "1px solid rgba(0,0,0,0.06)",
    },
    agentHeaderPending: {
      background: isDark
        ? "linear-gradient(135deg, rgba(255,193,7,0.12), rgba(255,87,34,0.10))"
        : "linear-gradient(135deg, #fff7e0, #ffe4d6)",
    },
    agentTitle: {
      fontWeight: 700,
      fontSize: 14,
      color: isDark ? "#e8eaed" : "#1a1a1a",
      lineHeight: 1.2,
    },
    agentSubtitle: {
      fontSize: 11.5,
      color: isDark ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.55)",
      marginTop: 2,
    },
    countChip: {
      marginLeft: "auto",
      height: 22,
      fontSize: 11,
      fontWeight: 700,
    },
    ticketList: {
      maxHeight: 320,
      overflowY: "auto",
      padding: 0,
      ...theme.scrollbarStyles,
    },
    ticketItem: {
      paddingTop: 8,
      paddingBottom: 8,
      borderBottom: isDark
        ? "1px solid rgba(255,255,255,0.04)"
        : "1px solid rgba(0,0,0,0.04)",
      "&:last-child": { borderBottom: "none" },
    },
    contactName: {
      fontSize: 13.5,
      fontWeight: 600,
      color: isDark ? "#e8eaed" : "#1a1a1a",
    },
    lastMsg: {
      fontSize: 12.5,
      color: isDark ? "rgba(255,255,255,0.6)" : "rgba(0,0,0,0.6)",
      display: "block",
      marginTop: 2,
    },
    tagsRow: {
      display: "flex",
      gap: 4,
      marginTop: 4,
      flexWrap: "wrap",
    },
    miniTag: {
      height: 18,
      fontSize: 10,
      fontWeight: 600,
      color: "#fff",
      "& .MuiChip-label": { padding: "0 6px" },
    },
    rightCol: {
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-end",
      gap: 4,
      marginLeft: 8,
    },
    timeText: {
      fontSize: 11,
      color: isDark ? "rgba(255,255,255,0.5)" : "rgba(0,0,0,0.45)",
    },
    timeUnread: {
      fontSize: 11,
      color: "#2eb872",
      fontWeight: 700,
    },
    unreadDot: {
      minWidth: 18,
      height: 18,
      borderRadius: 9,
      background: "#2eb872",
      color: "#fff",
      fontSize: 10,
      fontWeight: 700,
      display: "inline-flex",
      alignItems: "center",
      justifyContent: "center",
      padding: "0 6px",
    },
    emptyState: {
      gridColumn: "1 / -1",
      padding: theme.spacing(6, 2),
      textAlign: "center",
      color: isDark ? "rgba(255,255,255,0.55)" : "rgba(0,0,0,0.55)",
      borderRadius: 14,
      border: isDark
        ? "1px dashed rgba(255,255,255,0.08)"
        : "1px dashed rgba(0,0,0,0.12)",
    },
    listView: {
      display: "flex",
      flexDirection: "column",
      gap: theme.spacing(1.25),
    },
  };
});

const StatCard = ({ icon: Icon, value, label, color, classes }) => (
  <Paper elevation={0} className={classes.statCard}>
    <div className={classes.statIcon} style={{ background: color }}>
      <Icon style={{ fontSize: 22 }} />
    </div>
    <div>
      <div className={classes.statValue}>{value}</div>
      <div className={classes.statLabel}>{label}</div>
    </div>
  </Paper>
);

const DashboardManage = () => {
  const classes = useStyles();
  const history = useHistory();
  const { user, socket } = useContext(AuthContext);

  const [tickets, setTickets] = useState([]);
  const [, setUpdate] = useState(false);
  const [search, setSearch] = useState("");
  const [queueFilter, setQueueFilter] = useState("all");
  const [statusFilter, setStatusFilter] = useState("all"); // all | open | pending
  const [view, setView] = useState("grid");
  const [loading, setLoading] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);

  const rootRef = useRef(null);
  const companyId = user.companyId;

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await api.get("/usersMoments");
      setTickets(data);
      setUpdate((u) => !u);
    } catch (err) {
      if (err.response?.status !== 500) {
        toastError(err);
      } else {
        toast.error(`${i18n.t("frontEndErrors.getUsers")}`);
      }
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  // Real-time updates via socket
  useEffect(() => {
    if (!socket) return undefined;
    const onAppMessage = (data) => {
      if (!data || ["create", "update", "delete"].includes(data.action)) {
        fetchData();
      }
    };
    const events = [
      `company-${companyId}-ticket`,
      `company-${companyId}-appMessage`,
      `company-${companyId}-contact`,
      `company-${companyId}-notification`,
    ];
    events.forEach((ev) => socket.on(ev, onAppMessage));
    // Re-fetch when socket reconnects (e.g. after sleep/lost connection)
    const onReconnect = () => fetchData();
    socket.on?.("connect", onReconnect);
    return () => {
      events.forEach((ev) => socket.off(ev, onAppMessage));
      socket.off?.("connect", onReconnect);
    };
  }, [socket, companyId, fetchData]);

  // Polling fallback — garante atualização em tempo real
  // mesmo se o socket cair ou perder eventos.
  useEffect(() => {
    const interval = setInterval(() => {
      if (!document.hidden) fetchData();
    }, 15000);
    const onVisible = () => {
      if (!document.hidden) fetchData();
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [fetchData]);

  // Fullscreen
  const toggleFullscreen = () => {
    const el = rootRef.current;
    if (!el) return;
    if (!document.fullscreenElement) {
      (el.requestFullscreen ||
        el.webkitRequestFullscreen ||
        el.msRequestFullscreen)?.call(el);
    } else {
      (document.exitFullscreen ||
        document.webkitExitFullscreen ||
        document.msExitFullscreen)?.call(document);
    }
  };

  useEffect(() => {
    const onChange = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", onChange);
    return () => document.removeEventListener("fullscreenchange", onChange);
  }, []);

  // ---- Derived data ----
  const queues = useMemo(() => {
    const map = new Map();
    tickets.forEach((t) => {
      if (t.queue?.id) map.set(t.queue.id, t.queue);
    });
    return Array.from(map.values());
  }, [tickets]);

  const filteredTickets = useMemo(() => {
    const term = search.trim().toLowerCase();
    return tickets.filter((t) => {
      if (queueFilter !== "all" && t.queue?.id !== queueFilter) return false;
      if (statusFilter === "open" && !t.user) return false;
      if (statusFilter === "pending" && t.user) return false;
      if (term) {
        const contact = (t.contact?.name || "").toLowerCase();
        const last = (t.lastMessage || "").toLowerCase();
        const agent = (t.user?.name || "").toLowerCase();
        if (
          !contact.includes(term) &&
          !last.includes(term) &&
          !agent.includes(term)
        )
          return false;
      }
      return true;
    });
  }, [tickets, search, queueFilter, statusFilter]);

  const stats = useMemo(() => {
    const total = tickets.length;
    const pending = tickets.filter((t) => !t.user).length;
    const open = total - pending;
    const agents = new Set(
      tickets.filter((t) => t.user).map((t) => t.user.id)
    ).size;
    return { total, pending, open, agents };
  }, [tickets]);

  const grouped = useMemo(() => {
    const byUser = [];
    const pending = [];
    filteredTickets.forEach((ticket) => {
      if (!ticket.user) {
        pending.push(ticket);
        return;
      }
      const idx = byUser.findIndex((g) => g.user.id === ticket.user.id);
      if (idx === -1) byUser.push({ user: ticket.user, tickets: [ticket] });
      else byUser[idx].tickets.push(ticket);
    });
    return { byUser, pending };
  }, [filteredTickets]);

  // ---- Renderers ----
  const renderTicketItem = (ticket) => {
    const unread = Number(ticket.unreadMessages) > 0;
    return (
      <ListItem
        key={ticket.id}
        dense
        button
        className={classes.ticketItem}
        onClick={() => {
          if (user.profile === "admin" || ticket.userId === user.id) {
            history.push(`/tickets/${ticket.uuid}`);
          }
        }}
      >
        <ListItemAvatar>
          <Badge
            color="error"
            badgeContent={unread ? Number(ticket.unreadMessages) : 0}
            overlap="circular"
          >
            <Avatar
              alt={ticket.contact?.name}
              src={ticket.contact?.urlPicture}
            />
          </Badge>
        </ListItemAvatar>
        <ListItemText
          disableTypography
          primary={
            <span className={classes.contactName}>
              {ticket?.contact?.name?.length > 28
                ? ticket.contact.name.substring(0, 25) + "..."
                : ticket?.contact?.name}
            </span>
          }
          secondary={
            <Fragment>
              <span className={classes.lastMsg}>
                {ticket.lastMessage?.length > 38
                  ? String(ticket.lastMessage).substring(0, 36) + "..."
                  : ticket.lastMessage || "—"}
              </span>
              <div className={classes.tagsRow}>
                {ticket?.whatsapp?.name && (
                  <Chip
                    size="small"
                    label={ticket.whatsapp.name}
                    className={classes.miniTag}
                    style={{ background: "#2eb872" }}
                  />
                )}
                <Chip
                  size="small"
                  label={
                    ticket.queue?.name?.toUpperCase() ||
                    `${i18n.t("momentsUser.noqueue")}`
                  }
                  className={classes.miniTag}
                  style={{ background: ticket.queue?.color || "#7c7c7c" }}
                />
              </div>
            </Fragment>
          }
        />
        <div className={classes.rightCol}>
          <span className={unread ? classes.timeUnread : classes.timeText}>
            {ticket.updatedAt &&
              (isSameDay(parseISO(ticket.updatedAt), new Date())
                ? format(parseISO(ticket.updatedAt), "HH:mm")
                : format(parseISO(ticket.updatedAt), "dd/MM/yyyy"))}
          </span>
          {(user.profile === "admin" || ticket.userId === user.id) && (
            <Tooltip title={i18n.t("hardcoded.accessTicket")}>
              <IconButton
                size="small"
                onClick={(e) => {
                  e.stopPropagation();
                  history.push(`/tickets/${ticket.uuid}`);
                }}
              >
                <VisibilityOutlined style={{ fontSize: 18 }} />
              </IconButton>
            </Tooltip>
          )}
        </div>
      </ListItem>
    );
  };

  const renderAgentCard = (group) => (
    <Paper key={group.user.id} elevation={0} className={classes.agentCard}>
      <div className={classes.agentHeader}>
        <Avatar
          src={
            group.user.profileImage
              ? `${backendUrl}/public/company${companyId}/user/${group.user.profileImage}`
              : null
          }
        >
          {group.user.name?.[0]}
        </Avatar>
        <div style={{ minWidth: 0 }}>
          <div className={classes.agentTitle}>{group.user.name}</div>
          <div className={classes.agentSubtitle}>
            {i18n.t("momentsUser.services")} {group.tickets.length}
          </div>
        </div>
        <Chip
          label={group.tickets.length}
          size="small"
          className={classes.countChip}
          style={{ background: "#4E93FF", color: "#fff" }}
        />
      </div>
      <List className={classes.ticketList}>
        {group.tickets.map(renderTicketItem)}
      </List>
    </Paper>
  );

  const renderPendingCard = (pendingTickets) => (
    <Paper elevation={0} className={classes.agentCard}>
      <div className={`${classes.agentHeader} ${classes.agentHeaderPending}`}>
        <Avatar style={{ background: "#ff9800" }}>
          <ReportProblem style={{ color: "#fff" }} />
        </Avatar>
        <div style={{ minWidth: 0 }}>
          <div className={classes.agentTitle}>
            {i18n.t("momentsUser.pending")}
          </div>
          <div className={classes.agentSubtitle}>
            {i18n.t("momentsUser.services")} {pendingTickets.length}
          </div>
        </div>
        <Chip
          label={pendingTickets.length}
          size="small"
          className={classes.countChip}
          style={{ background: "#ff9800", color: "#fff" }}
        />
      </div>
      <List className={classes.ticketList}>
        {pendingTickets.map(renderTicketItem)}
      </List>
    </Paper>
  );

  const hasData = grouped.byUser.length > 0 || grouped.pending.length > 0;

  return (
    <div
      className={classes.root}
      ref={rootRef}
      style={isFullscreen ? { background: "#fff", padding: 16, overflow: "auto", height: "100vh" } : undefined}
    >
      {/* Stats */}
      <div className={classes.statsRow}>
        <StatCard
          icon={ChatIcon}
          value={stats.total}
          label={i18n.t("momentsUser.total")}
          color="#4E93FF"
          classes={classes}
        />
        <StatCard
          icon={PeopleIcon}
          value={stats.open}
          label={i18n.t("momentsUser.inService")}
          color="#2eb872"
          classes={classes}
        />
        <StatCard
          icon={HourglassIcon}
          value={stats.pending}
          label={i18n.t("momentsUser.pending")}
          color="#ff9800"
          classes={classes}
        />
        <StatCard
          icon={SupervisorIcon}
          value={stats.agents}
          label={i18n.t("momentsUser.activeAgents")}
          color="#8e44ad"
          classes={classes}
        />
      </div>

      {/* Toolbar */}
      <Paper elevation={0} className={classes.toolbar}>
        <TextField
          variant="outlined"
          size="small"
          placeholder={i18n.t("momentsUser.searchPlaceholder")}
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className={classes.searchField}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
        />
        <TextField
          select
          size="small"
          variant="outlined"
          value={queueFilter}
          onChange={(e) => setQueueFilter(e.target.value)}
          style={{ minWidth: 160 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <FilterIcon fontSize="small" />
              </InputAdornment>
            ),
          }}
        >
          <MenuItem value="all">{i18n.t("momentsUser.allQueues")}</MenuItem>
          {queues.map((q) => (
            <MenuItem key={q.id} value={q.id}>
              {q.name}
            </MenuItem>
          ))}
        </TextField>
        <ToggleButtonGroup
          size="small"
          value={statusFilter}
          exclusive
          onChange={(_, v) => v && setStatusFilter(v)}
        >
          <ToggleButton value="all">{i18n.t("momentsUser.all")}</ToggleButton>
          <ToggleButton value="open">{i18n.t("momentsUser.inService")}</ToggleButton>
          <ToggleButton value="pending">{i18n.t("momentsUser.pending")}</ToggleButton>
        </ToggleButtonGroup>
        <ToggleButtonGroup
          size="small"
          value={view}
          exclusive
          onChange={(_, v) => v && setView(v)}
        >
          <ToggleButton value="grid">
            <GridIcon fontSize="small" />
          </ToggleButton>
          <ToggleButton value="list">
            <ListIcon fontSize="small" />
          </ToggleButton>
        </ToggleButtonGroup>
        <Tooltip title={i18n.t("momentsUser.refresh")}>
          <IconButton size="small" onClick={fetchData} disabled={loading}>
            <RefreshIcon
              fontSize="small"
              style={{
                animation: loading ? "spin 1s linear infinite" : undefined,
              }}
            />
          </IconButton>
        </Tooltip>
        <Tooltip title={isFullscreen ? i18n.t("momentsUser.exitFullscreen") : i18n.t("momentsUser.fullscreen")}>
          <IconButton size="small" onClick={toggleFullscreen}>
            {isFullscreen ? (
              <FullscreenExitIcon fontSize="small" />
            ) : (
              <FullscreenIcon fontSize="small" />
            )}
          </IconButton>
        </Tooltip>
        <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      </Paper>

      {/* Cards */}
      <Box className={view === "grid" ? classes.grid : classes.listView}>
        {grouped.pending.length > 0 && renderPendingCard(grouped.pending)}
        {grouped.byUser.map(renderAgentCard)}
        {!hasData && (
          <div className={classes.emptyState}>
            <Typography variant="body2">
              {i18n.t("momentsUser.noTicketsForFilters", { defaultValue: "Nenhum atendimento para os filtros atuais." })}
            </Typography>
          </div>
        )}
      </Box>
    </div>
  );
};

export default DashboardManage;
