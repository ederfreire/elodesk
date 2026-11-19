import React, { useState, useEffect, useContext, useRef } from "react";
import { useTheme } from "@material-ui/core/styles";
import { useHistory, useLocation } from "react-router-dom";
import { makeStyles, Paper, InputBase, Tabs, Tab, Badge, IconButton, Typography, Tooltip, Switch, Menu, MenuItem, ListItemIcon, ListItemText, Divider, useMediaQuery } from "@material-ui/core";
import MoveToInboxIcon from "@material-ui/icons/MoveToInbox";
import CheckBoxIcon from "@material-ui/icons/CheckBox";
import SearchIcon from "@material-ui/icons/Search";
import AddIcon from "@material-ui/icons/Add";
import TextRotateUp from "@material-ui/icons/TextRotateUp";
import TextRotationDown from "@material-ui/icons/TextRotationDown";
import MoreVertIcon from "@material-ui/icons/MoreVert";
import MenuIcon from "@material-ui/icons/Menu";
import VisibilityIcon from "@material-ui/icons/Visibility";
import VisibilityOffIcon from "@material-ui/icons/VisibilityOff";
import ToggleButton from "@material-ui/lab/ToggleButton";

import FilterAltOff from "@mui/icons-material/FilterAltOff";
import FilterAlt from "@mui/icons-material/FilterAlt";
import PlaylistAddCheckOutlined from "@mui/icons-material/PlaylistAddCheckOutlined";
import TrendingUp from "@mui/icons-material/TrendingUp";
import AssignmentOutlined from "@mui/icons-material/AssignmentOutlined";
import SettingsOutlined from "@mui/icons-material/SettingsOutlined";
import SwapHoriz from "@mui/icons-material/SwapHoriz";
import NewTicketModal from "../NewTicketModal";
import TicketsList from "../TicketsListCustom";
import TabPanel from "../TabPanel";
import { Can } from "../Can";
import TicketsQueueSelect from "../TicketsQueueSelect";
import { TagsFilter } from "../TagsFilter";
import { UsersFilter } from "../UsersFilter";
import { StatusFilter } from "../StatusFilter";
import { WhatsappsFilter } from "../WhatsappsFilter";
import { Button, Snackbar } from "@material-ui/core";

import { i18n } from "../../translate/i18n";
import { AuthContext } from "../../context/Auth/AuthContext";
import { QueueSelectedContext } from "../../context/QueuesSelected/QueuesSelectedContext";

import api from "../../services/api";
import { TicketsContext } from "../../context/Tickets/TicketsContext";

const useStyles = makeStyles((theme) => ({
  ticketsWrapper: {
    position: "relative",
    display: "flex",
    height: "100%",
    flexDirection: "column",
    overflow: "hidden",
    overflowX: "hidden",
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
  },

  tabsHeader: {
    minWidth: "auto",
    width: "auto",
    borderRadius: 8,
    marginTop: theme.spacing(0.5),
    marginBottom: theme.spacing(0.5),
    marginLeft: theme.spacing(0.5),
    marginRight: theme.spacing(0.5),
  },

  settingsIcon: {
    alignSelf: "center",
    marginLeft: "auto",
    padding: theme.spacing(1),
  },

  tab: {
    minWidth: "auto",
    width: "auto",
    padding: theme.spacing(0.5, 1),
    borderRadius: 8,
    transition: "0.3s",
    borderColor: "#aaa",
    borderWidth: "1px",
    borderStyle: "solid",
    marginRight: theme.spacing(0.5),
    marginLeft: theme.spacing(0.5),

    [theme.breakpoints.down("lg")]: {
      fontSize: "0.9rem",
      padding: theme.spacing(0.4, 0.8),
      marginRight: theme.spacing(0.4),
      marginLeft: theme.spacing(0.4),
    },

    [theme.breakpoints.down("md")]: {
      fontSize: "0.75rem",
      padding: theme.spacing(0.25, 0.5),
      marginRight: theme.spacing(0.25),
      marginLeft: theme.spacing(0.25),
    },

    // Específico para monitores de 11-13 polegadas
    '@media (max-width: 1366px)': {
      fontSize: "0.8rem",
      padding: theme.spacing(0.3, 0.6),
      marginRight: theme.spacing(0.3),
      marginLeft: theme.spacing(0.3),
    },

    "&:hover": {
      backgroundColor: "rgba(0, 0, 0, 0.1)",
    },
  },

  tabPanelItem: {
    minWidth: "auto",
    fontSize: 11,
    marginLeft: 0,
    transition: "all 0.3s ease",
    fontWeight: 600,
    borderRadius: "20px",
    margin: "4px 4px",
    padding: "4px 14px",
    minHeight: 32,
    opacity: 0.7,
    textTransform: "none",
    whiteSpace: "nowrap",
    "&.Mui-selected": {
      opacity: 1,
      backgroundColor: `${theme.palette.primary.main}22`,
      color: `${theme.palette.primary.main} !important`,
      boxShadow: "none",
    },
    "&:hover": {
      opacity: 1,
      backgroundColor: `${theme.palette.primary.main}25`,
    },
    [theme.breakpoints.down('sm')]: {
      minWidth: "auto",
      fontSize: 9,
      padding: "3px 10px",
    },
    [theme.breakpoints.down('xs')]: {
      minWidth: "auto",
      fontSize: 8,
    },
  },

  tabIndicator: {
    display: "none",
  },
  tabsBadge: {
    top: "105%",
    right: "55%",
    transform: "translate(45%, 0)",
    whiteSpace: "nowrap",
    borderRadius: "12px",
    padding: "0 8px",
    backgroundColor: theme.mode === "light" ? theme.palette.primary.main : "#FFF",
    color: theme.mode === "light" ? "#FFF" : theme.palette.primary.main,
  },
  ticketOptionsBox: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    background: theme.palette.optionsBackground,
    borderRadius: 8,
    borderColor: "#aaa",
    borderWidth: "1px",
    borderStyle: "solid",
    marginTop: theme.spacing(0.5),
    marginBottom: theme.spacing(1),
    marginLeft: theme.spacing(1),
    marginRight: theme.spacing(1),
    padding: theme.spacing(0.5),
    [theme.breakpoints.down("md")]: {
      display: "none",
    },
  },

  conversasHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: "8px 8px",
    background: theme.mode === "dark" 
      ? "linear-gradient(180deg, #1a1d2e 0%, #1e2132 100%)" 
      : "#fff",
    borderBottom: theme.mode === "dark" 
      ? "1px solid rgba(255,255,255,0.06)" 
      : "1px solid rgba(0,0,0,0.08)",
  },
  conversasTitle: {
    fontSize: 18,
    fontWeight: 700,
    color: theme.mode === "dark" ? "#e8eaed" : "#1a1a2e",
    flex: 1,
    textAlign: "center",
  },
  headerActions: {
    display: "flex",
    alignItems: "center",
    gap: 4,
  },
  headerIconButton: {
    padding: 8,
    color: theme.mode === "dark" ? "#9ca3af" : "#6b7280",
    "&:hover": {
      backgroundColor: theme.mode === "dark" ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.04)",
    },
  },

  serachInputWrapper: {
    flex: 1,
    height: 40,
    background: theme.palette.total,
    display: "flex",
    borderRadius: 40,
    padding: 4,
    borderColor: "#aaa",
    borderWidth: "1px",
    borderStyle: "solid",
    marginTop: theme.spacing(0.5),
    marginBottom: theme.spacing(0.5),
    marginLeft: theme.spacing(1),
    marginRight: theme.spacing(1),
  },

  searchIcon: {
    color: "grey",
    marginLeft: 6,
    marginRight: 6,
    alignSelf: "center",
  },

  searchInput: {
    flex: 1,
    border: "none",
    borderRadius: 30,
  },

  badge: {
    // right: "-10px",
  },

  customBadge: {
    right: "-12px",
    top: "-10px",
    transform: "translate(30%, -30%)",
    backgroundColor: theme.palette.primary.main,
    color: "#fff",
    borderRadius: "10px",
    padding: "0 6px",
    fontWeight: "bold",
    fontSize: "0.75rem",
    minWidth: "20px",
    height: "20px",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    zIndex: 10,
    boxShadow: "0 2px 5px rgba(0,0,0,0.2)",
  },
  
  modernTabs: {
    minHeight: 42,
    borderRadius: 0,
    backgroundColor: "transparent",
    padding: "4px 8px",
    margin: "0",
    transition: "all 0.3s ease",
    position: "relative",
    display: "flex",
    justifyContent: "center",
    "& .MuiTabs-flexContainer": {
      justifyContent: "center",
    },
    [theme.breakpoints.down("md")]: {
      display: "none",
    },
  },

  show: {
    display: "block",
  },

  hide: {
    display: "none !important",
  },

  closeAllFab: {
    backgroundColor: "red",
    marginBottom: "4px",
    "&:hover": {
      backgroundColor: "darkred",
    },
  },

  speedDial: {
    position: "absolute",
    bottom: theme.spacing(1),
    right: theme.spacing(1),
    "& .MuiFab-root": {
      width: "40px",
      height: "40px",
      marginTop: "4px",
    },
    "& .MuiFab-label": {
      width: "100%",
      height: "100%",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
    },
  },

  snackbar: {
    display: "flex",
    justifyContent: "space-between",
    backgroundColor: theme.palette.primary.main,
    color: "white",
    borderRadius: 30,
    [theme.breakpoints.down("sm")]: {
      fontSize: "0.8em",
    },
    [theme.breakpoints.up("md")]: {
      fontSize: "1em",
    },
  },

  yesButton: {
    backgroundColor: "#FFF",
    color: "rgba(0, 100, 0, 1)",
    padding: "4px 4px",
    fontSize: "1em",
    fontWeight: "bold",
    textTransform: "uppercase",
    marginRight: theme.spacing(1),
    "&:hover": {
      backgroundColor: "darkGreen",
      color: "#FFF",
    },
    borderRadius: 30,
  },
  noButton: {
    backgroundColor: "#FFF",
    color: "rgba(139, 0, 0, 1)",
    padding: "4px 4px",
    fontSize: "1em",
    fontWeight: "bold",
    textTransform: "uppercase",
    "&:hover": {
      backgroundColor: "darkRed",
      color: "#FFF",
    },
    borderRadius: 30,
  },
  filterIcon: {
    marginRight: 6,
    alignSelf: "center",
    color: theme.mode === "light" ? "#0872b9" : "#FFF",
    cursor: "pointer",
  },
  button: {
    height: 30,
    width: 30,
    border: "2px solid",
    borderColor: "#aaa",
    borderRadius: 8,
    marginRight: 8,
    "&:hover": {
      borderColor: theme.mode === "light" ? theme.palette.primary.main : "#FFF",
    },
  },
  icon: {
    color: "#aaa",
    "&:hover": {
      color: theme.mode === "light" ? theme.palette.primary.main : "#FFF",
    },
  },
  buttonOpen: {
    "& $icon": {
      color: theme.mode === "light" ? theme.palette.primary.main : "#FFF",
    },
  },
  // Classe padronizada para todos os botões de ação
  standardButton: {
    height: 30,
    width: 30,
    border: "2px solid #aaa",
    borderRadius: 8,
    marginRight: 8,
    padding: 0,
    minWidth: 'auto',
    "&:hover": {
      borderColor: theme.mode === "light" ? theme.palette.primary.main : "#FFF",
    },
    [theme.breakpoints.down('sm')]: {
      height: 28,
      width: 28,
      marginRight: 6,
    },
    // Ajuste para monitores pequenos (11-13 polegadas)
    '@media (max-width: 1366px)': {
      height: 28,
      width: 28,
      marginRight: 6,
    },
  },
  activeButton: {
    borderColor: theme.mode === "light" ? theme.palette.primary.main : "#FFF",
    borderWidth: "3px",
  },
  standardIcon: {
    color: "#aaa",
    fontSize: 18,
    "&:hover": {
      color: theme.mode === "light" ? theme.palette.primary.main : "#FFF",
    },
    [theme.breakpoints.down('sm')]: {
      fontSize: 16,
    },
  },
  activeIcon: {
    color: theme.mode === "light" ? theme.palette.primary.main : "#FFF",
  },
}));

const TicketsManagerTabs = () => {
  const theme = useTheme();
  const classes = useStyles();
  const isMobile = useMediaQuery(theme.breakpoints.down("md"));
  const history = useHistory();
  const location = useLocation();

  const [searchParam, setSearchParam] = useState("");
  const [tab, setTab] = useState("open");
  const [newTicketModalOpen, setNewTicketModalOpen] = useState(false);
  const [showAllTickets, setShowAllTickets] = useState(false);
  const [sortTickets, setSortTickets] = useState(false);

  const searchInputRef = useRef();
  const [searchOnMessages, setSearchOnMessages] = useState(false);
  const [searchVisible, setSearchVisible] = useState(false);

  const { user, socket } = useContext(AuthContext);
  const { profile } = user;
  const { setSelectedQueuesMessage } = useContext(QueueSelectedContext);
  const {
    tabOpen,
    setTabOpen,
    openCount,
    setOpenCount,
    pendingCount,
    setPendingCount,
    groupingCount,
    setGroupingCount,
  } = useContext(TicketsContext);

  const [pendingUnreadCount, setPendingUnreadCount] = useState(0);
  // Persistent unread group counter — survives tab switches and is independent
  // from the mounted TicketsList. Tracks tickets with unreadMessages > 0.
  const [groupingUnreadCount, setGroupingUnreadCount] = useState(0);

  const userQueueIds = user.queues.map((q) => q.id);
  const [selectedQueueIds, setSelectedQueueIds] = useState(userQueueIds || []);
  const [selectedTags, setSelectedTags] = useState([]);
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [selectedWhatsapp, setSelectedWhatsapp] = useState([]);
  const [forceSearch, setForceSearch] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedStatus, setSelectedStatus] = useState([]);
  const [filter, setFilter] = useState(false);

  useEffect(() => {
    const handleTagsUpdated = () => {
      setRefreshKey(prev => prev + 1);
    };
    window.addEventListener("tagsUpdated", handleTagsUpdated);
    return () => window.removeEventListener("tagsUpdated", handleTagsUpdated);
  }, []);

  // Persistent unread pending counter — fetches via API and stays in sync via socket.
  // Independent from the mounted TicketsList so it survives switching tabs.
  useEffect(() => {
    let cancelled = false;

    const isTruthy = (v) => v === true || v === "true" || v === 1 || v === "1";
    const isGroupTicket = (t) => {
      return isTruthy(t?.isGroup) ||
        t?.status === "group" ||
        isTruthy(t?.contact?.isGroup) ||
        String(t?.contact?.remoteJid || t?.remoteJid || "").includes("@g.us");
    };

    const fetchPendingUnread = async () => {
      try {
        // ANTES: este bloco paginava /tickets?withUnreadMessages=true ate 10
        // paginas — baixava ate 400 tickets COMPLETOS (com contato, tags,
        // fila, conexao e carteiras) so para usar `length` no fim. Eram 3 a
        // 10 requisicoes pesadas por carregamento, e o custo de montar os
        // objetos no Sequelize e serializar para JSON ia todo para o lixo.
        //
        // AGORA: uma chamada que devolve dois numeros, contados no banco.
        // Resolve de quebra o teto de 400 que o codigo antigo tinha.
        // Sem parametros: o backend resolve filas e visibilidade pelo token
        // do usuario. Passar filtros aqui daria valor velho, porque as deps
        // deste efeito sao [user.companyId, socket].
        const { data } = await api.get("/tickets/unread-counts");
        if (cancelled) return;
        setPendingUnreadCount(Number(data?.pending) || 0);
      } catch (err) {
        // silent — badge just stays at previous value
      }
    };

    fetchPendingUnread();

    const companyId = user.companyId;
    if (!companyId || !socket || typeof socket.on !== "function") {
      return () => { cancelled = true; };
    }

    const onAppMessage = () => {
      fetchPendingUnread();
    };

    const onTicket = () => {
      fetchPendingUnread();
    };

    const appMessageEvent = `company-${companyId}-appMessage`;
    const ticketEvent = `company-${companyId}-ticket`;
    socket.on(appMessageEvent, onAppMessage);
    socket.on(ticketEvent, onTicket);

    return () => {
      cancelled = true;
      if (socket && typeof socket.off === "function") {
        socket.off(appMessageEvent, onAppMessage);
        socket.off(ticketEvent, onTicket);
      }
    };
  }, [user.companyId, socket]);

  // Persistent unread group counter — fetches via API and stays in sync via socket.
  // Independent from the mounted TicketsList so it survives switching to other main tabs.
  useEffect(() => {
    if (!user?.allowGroup) return;

    let cancelled = false;

    const isTruthy = (v) => v === true || v === "true" || v === 1 || v === "1";
    const isGroupTicket = (t) => {
      return isTruthy(t?.isGroup) ||
        t?.status === "group" ||
        isTruthy(t?.contact?.isGroup) ||
        String(t?.contact?.remoteJid || t?.remoteJid || "").includes("@g.us");
    };

    const fetchGroupUnread = async () => {
      try {
        // Mesma troca do contador de pendentes: baixava a lista inteira de
        // grupos para filtrar por unreadMessages no navegador, e ainda ficava
        // limitada a primeira pagina. Agora vem contado do banco.
        const { data } = await api.get("/tickets/unread-counts");
        if (cancelled) return;
        setGroupingUnreadCount(Number(data?.group) || 0);
      } catch (err) {
        // silent — badge just stays at previous value
      }
    };

    fetchGroupUnread();

    const companyId = user.companyId;
    if (!companyId || !socket || typeof socket.on !== "function") {
      return () => { cancelled = true; };
    }

    const onAppMessage = (data) => {
      if (!data?.ticket) return;
      if (!isGroupTicket(data.ticket)) return;
      // New unread message arrived — refetch the authoritative count
      fetchGroupUnread();
    };

    const onTicket = (data) => {
      if (data?.action === "delete") {
        fetchGroupUnread();
        return;
      }
      if (data?.ticket && isGroupTicket(data.ticket)) {
        fetchGroupUnread();
      }
    };

    const appMessageEvent = `company-${companyId}-appMessage`;
    const ticketEvent = `company-${companyId}-ticket`;
    socket.on(appMessageEvent, onAppMessage);
    socket.on(ticketEvent, onTicket);

    return () => {
      cancelled = true;
      if (socket && typeof socket.off === "function") {
        socket.off(appMessageEvent, onAppMessage);
        socket.off(ticketEvent, onTicket);
      }
    };
  }, [user?.allowGroup, user?.companyId, socket]);

  const [snackbarOpen, setSnackbarOpen] = useState(false);
  const [hoveredButton, setHoveredButton] = useState(null);
  const [isHoveredAll, setIsHoveredAll] = useState(false);
  const [isHoveredNew, setIsHoveredNew] = useState(false);
  const [isHoveredResolve, setIsHoveredResolve] = useState(false);
  const [isHoveredOpen, setIsHoveredOpen] = useState(false);
  const [isHoveredClosed, setIsHoveredClosed] = useState(false);
  const [isHoveredSort, setIsHoveredSort] = useState(false);

  const [isFilterActive, setIsFilterActive] = useState(false);
  const [moreMenuAnchor, setMoreMenuAnchor] = useState(null);
  const [hamburgerMenuAnchor, setHamburgerMenuAnchor] = useState(null);

  useEffect(() => {
    setSelectedQueuesMessage(selectedQueueIds);
  }, [selectedQueueIds]);

  useEffect(() => {
    if (String(user?.profile || "").toUpperCase() === "ADMIN" || String(user?.allUserChat || "").toUpperCase() === "ENABLED") {
      setShowAllTickets(false);
    }
    
    // Verificar se há parâmetro 'tab' na URL ao carregar
    const urlParams = new URLSearchParams(window.location.search);
    const tabParam = urlParams.get('tab');
    if (tabParam && ["pending", "open", "group", "closed"].includes(tabParam)) {
      // Definir a tab principal primeiro
      if (tabParam === "pending") {
        setTab("open"); // "Aguardando" está dentro da tab "open"
      } else if (tabParam === "open") {
        setTab("open");
      } else if (tabParam === "closed") {
        setTab("closed");
      } else if (tabParam === "group") {
        setTab("open"); // "Grupos" está dentro da tab "open"
      }
      // Depois definir a sub-aba (tabOpen)
      setTimeout(() => {
        setTabOpen(tabParam);
      }, 50);
    }
  }, []);

  // Monitorar mudanças na URL para atualizar a aba quando necessário
  useEffect(() => {
    const urlParams = new URLSearchParams(location.search);
    const tabParam = urlParams.get('tab');
    if (tabParam && ["pending", "open", "group", "closed"].includes(tabParam)) {
      // Se o parâmetro tab mudou, atualizar a aba
      if (tabOpen !== tabParam) {
        // Definir a tab principal primeiro
        if (tabParam === "pending") {
          setTab("open"); // "Aguardando" está dentro da tab "open"
        } else if (tabParam === "open") {
          setTab("open");
        } else if (tabParam === "closed") {
          setTab("closed");
        } else if (tabParam === "group") {
          setTab("open"); // "Grupos" está dentro da tab "open"
        }
        // Depois definir a sub-aba (tabOpen) com um pequeno delay
        setTimeout(() => {
          setTabOpen(tabParam);
        }, 100);
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [location.search]);

  useEffect(() => {
    if (tab === "search") {
      searchInputRef.current.focus();
    }
    setForceSearch(!forceSearch);
  }, [tab]);

  // useRef, não uma variável local: `let searchTimeout` era recriado a cada
  // render, então o clearTimeout logo abaixo sempre limpava `undefined` e
  // NENHUM disparo era cancelado. Digitar "91028" agendava cinco buscas em vez
  // de uma — cinco requisições concorrentes cujas respostas podiam chegar fora
  // de ordem. Com o ref, o agendamento anterior é realmente cancelado.
  const searchTimeoutRef = useRef(null);

  const handleSearch = (e) => {
    const searchedTerm = e.target.value.toLowerCase();

    clearTimeout(searchTimeoutRef.current);

    if (searchedTerm === "") {
      setSearchParam(searchedTerm);
      setForceSearch(!forceSearch);
      setTab("open");
      return;
    } else if (tab !== "search") {
      setTab("search");
    }

    searchTimeoutRef.current = setTimeout(() => {
      setSearchParam(searchedTerm);
      setForceSearch(!forceSearch);
    }, 500);
  };

  const handleBack = () => {
    history.push("/tickets");
  };

  const handleChangeTab = (e, newValue) => {
    setTab(newValue);
  };

  const handleChangeTabOpen = (e, newValue) => {
    handleBack();
    setTabOpen(newValue);
  };

  const applyPanelStyle = (status) => {
    if (tabOpen !== status) {
      return { width: 0, height: 0 };
    }
  };

  const handleSnackbarOpen = () => {
    setSnackbarOpen(true);
  };

  const handleSnackbarClose = () => {
    setSnackbarOpen(false);
  };

  const CloseAllTicket = async () => {
    try {
      const { data } = await api.post("/tickets/closeAll", {
        status: tabOpen,
        selectedQueueIds,
      });
      handleSnackbarClose();
    } catch (err) {
    }
  };

  const handleCloseOrOpenTicket = (ticket) => {
    setNewTicketModalOpen(false);
    if (ticket !== undefined && ticket.uuid !== undefined) {
      history.push(`/tickets/${ticket.uuid}`);
    }
  };

  // Cada filtro atualiza o próprio estado na hora. Antes os quatro campos
  // dividiam um único timer de 500 ms: mexer em Tags e logo depois em Conexão
  // cancelava a atualização de Tags, e o filtro escolhido sumia. A mudança de
  // estado já dispara a nova consulta, então não precisa de debounce.
  const handleSelectedTags = (selecteds) => {
    setSelectedTags((selecteds || []).map((t) => t.id));
  };

  const handleSelectedUsers = (selecteds) => {
    setSelectedUsers((selecteds || []).map((t) => t.id));
  };

  const handleSelectedWhatsapps = (selecteds) => {
    setSelectedWhatsapp((selecteds || []).map((t) => t.id));
  };

  const handleSelectedStatus = (selecteds) => {
    setSelectedStatus((selecteds || []).map((t) => t.status));
  };

  const handleFilter = () => {
    if (filter) {
      setFilter(false);
    } else {
      setFilter(true);
    }
  };

  const [open, setOpen] = React.useState(false);
  const [hidden, setHidden] = React.useState(false);

  const handleVisibility = () => {
    setHidden((prevHidden) => !prevHidden);
  };

  const handleOpen = () => {
    setOpen(true);
  };

  const handleClosed = () => {
    setOpen(false);
  };

  const tooltipTitleStyle = {
    fontSize: "10px",
  };

  return (
    <Paper elevation={0} variant="outlined" className={classes.ticketsWrapper}>
      <NewTicketModal
        modalOpen={newTicketModalOpen}
        onClose={(ticket) => {
          handleCloseOrOpenTicket(ticket);
        }}
      />
{(
        <div className={classes.conversasHeader}>
          <IconButton
            className={classes.headerIconButton}
            size="small"
            onClick={(e) => setHamburgerMenuAnchor(e.currentTarget)}
          >
            <MenuIcon style={{ fontSize: 22 }} />
          </IconButton>
          <Typography className={classes.conversasTitle}>
            {i18n.t("ticketsManager.header.title")}
          </Typography>
          <div className={classes.headerActions}>
            <IconButton
              className={classes.headerIconButton}
              size="small"
              onClick={() => {
                setIsFilterActive((prevState) => !prevState);
                handleFilter();
              }}
            >
              <Badge
                badgeContent={
                  (selectedTags?.length || 0) +
                  (selectedUsers?.length || 0) +
                  (selectedWhatsapp?.length || 0) +
                  (selectedStatus?.length || 0)
                }
                color="secondary"
                invisible={
                  (selectedTags?.length || 0) +
                  (selectedUsers?.length || 0) +
                  (selectedWhatsapp?.length || 0) +
                  (selectedStatus?.length || 0) === 0
                }
              >
                {isFilterActive ? (
                  <FilterAlt style={{ fontSize: 20 }} />
                ) : (
                  <FilterAltOff style={{ fontSize: 20 }} />
                )}
              </Badge>
            </IconButton>
            <IconButton
              className={classes.headerIconButton}
              size="small"
              onClick={() => setSearchVisible((prev) => !prev)}
            >
              <SearchIcon style={{ fontSize: 20 }} />
            </IconButton>
            <IconButton
              className={classes.headerIconButton}
              size="small"
              onClick={(e) => setMoreMenuAnchor(e.currentTarget)}
            >
              <MoreVertIcon style={{ fontSize: 20 }} />
            </IconButton>
          </div>
        </div>
      )}

      {searchVisible && (
        <div className={classes.serachInputWrapper}>
          <SearchIcon className={classes.searchIcon} />
          <InputBase
            className={classes.searchInput}
            inputRef={searchInputRef}
            placeholder={i18n.t("tickets.search.placeholder")}
            type="search"
            onChange={handleSearch}
            autoFocus
          />
          <Tooltip placement="top" title={i18n.t("ticketsManagerExtra.searchOnMessages")}>
            <div>
              <Switch
                size="small"
                checked={searchOnMessages}
                onChange={(e) => { setSearchOnMessages(e.target.checked) }}
              />
            </div>
          </Tooltip>
        </div>
      )}
        <Menu
          anchorEl={moreMenuAnchor}
          open={Boolean(moreMenuAnchor)}
          onClose={() => setMoreMenuAnchor(null)}
          PaperProps={{
            style: {
              borderRadius: 16,
              minWidth: 240,
              boxShadow: theme.mode === "dark"
                ? "0 12px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06)"
                : "0 8px 24px rgba(0,0,0,0.15)",
              background: theme.mode === "dark"
                ? "linear-gradient(180deg, #1e2035 0%, #171928 100%)"
                : "#fff",
              border: theme.mode === "dark" ? "1px solid rgba(255,255,255,0.08)" : "none",
              padding: "6px 0",
            },
          }}
        >
          <MenuItem
            onClick={() => { setMoreMenuAnchor(null); history.push("/kanban"); }}
            style={{
              padding: "10px 16px",
              borderRadius: 8,
              margin: "2px 6px",
              transition: "all 0.15s ease",
            }}
          >
            <ListItemIcon style={{ minWidth: 36 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 10,
                background: "linear-gradient(135deg, #f97316 0%, #fb923c 100%)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <TrendingUp style={{ color: "#fff", fontSize: 18 }} />
              </div>
            </ListItemIcon>
            <ListItemText
              primary={<span style={{ fontWeight: 600, fontSize: 14, color: theme.mode === "dark" ? "#e2e8f0" : "#1e293b" }}>{i18n.t("mainDrawer.listItems.salesPipeline")}</span>}
              secondary={<span style={{ fontSize: 12, color: theme.mode === "dark" ? "#64748b" : "#94a3b8" }}>{i18n.t("mainDrawer.listItems.salesPipelineDesc")}</span>}
            />
          </MenuItem>
          <MenuItem
            onClick={() => { setMoreMenuAnchor(null); history.push("/todolist"); }}
            style={{
              padding: "10px 16px",
              borderRadius: 8,
              margin: "2px 6px",
              transition: "all 0.15s ease",
            }}
          >
            <ListItemIcon style={{ minWidth: 36 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 10,
                background: "linear-gradient(135deg, #8b5cf6 0%, #a78bfa 100%)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <AssignmentOutlined style={{ color: "#fff", fontSize: 18 }} />
              </div>
            </ListItemIcon>
            <ListItemText
              primary={<span style={{ fontWeight: 600, fontSize: 14, color: theme.mode === "dark" ? "#e2e8f0" : "#1e293b" }}>{i18n.t("mainDrawer.listItems.taskList")}</span>}
              secondary={<span style={{ fontSize: 12, color: theme.mode === "dark" ? "#64748b" : "#94a3b8" }}>{i18n.t("mainDrawer.listItems.taskListDesc")}</span>}
            />
          </MenuItem>
          <Divider style={{ margin: "6px 12px", backgroundColor: theme.mode === "dark" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)" }} />
          <MenuItem
            onClick={() => { setMoreMenuAnchor(null); history.push("/settings"); }}
            style={{
              padding: "10px 16px",
              borderRadius: 8,
              margin: "2px 6px",
              transition: "all 0.15s ease",
            }}
          >
            <ListItemIcon style={{ minWidth: 36 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 10,
                background: theme.mode === "dark"
                  ? "linear-gradient(135deg, #374151 0%, #4b5563 100%)"
                  : "linear-gradient(135deg, #9ca3af 0%, #6b7280 100%)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <SettingsOutlined style={{ color: "#fff", fontSize: 18 }} />
              </div>
            </ListItemIcon>
            <ListItemText
              primary={<span style={{ fontWeight: 600, fontSize: 14, color: theme.mode === "dark" ? "#e2e8f0" : "#1e293b" }}>{i18n.t("mainDrawer.listItems.preferences")}</span>}
              secondary={<span style={{ fontSize: 12, color: theme.mode === "dark" ? "#64748b" : "#94a3b8" }}>{i18n.t("mainDrawer.listItems.preferencesDesc")}</span>}
            />
          </MenuItem>
          <MenuItem
            onClick={() => { setMoreMenuAnchor(null); history.push("/account-switch"); }}
            style={{
              padding: "10px 16px",
              borderRadius: 8,
              margin: "2px 6px",
              transition: "all 0.15s ease",
            }}
          >
            <ListItemIcon style={{ minWidth: 36 }}>
              <div style={{
                width: 32, height: 32, borderRadius: 10,
                background: "linear-gradient(135deg, #3b82f6 0%, #60a5fa 100%)",
                display: "flex", alignItems: "center", justifyContent: "center",
              }}>
                <SwapHoriz style={{ color: "#fff", fontSize: 18 }} />
              </div>
            </ListItemIcon>
            <ListItemText
              primary={<span style={{ fontWeight: 600, fontSize: 14, color: theme.mode === "dark" ? "#e2e8f0" : "#1e293b" }}>{i18n.t("mainDrawer.listItems.switchAccount")}</span>}
              secondary={<span style={{ fontSize: 12, color: theme.mode === "dark" ? "#64748b" : "#94a3b8" }}>{i18n.t("mainDrawer.listItems.switchAccountDesc")}</span>}
            />
          </MenuItem>
        </Menu>

      {/* Hamburger Menu with toolbar options */}
      <Menu
        anchorEl={hamburgerMenuAnchor}
        open={Boolean(hamburgerMenuAnchor)}
        onClose={() => setHamburgerMenuAnchor(null)}
        PaperProps={{
          style: {
            borderRadius: 16,
            minWidth: 260,
            boxShadow: theme.mode === "dark"
              ? "0 12px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(255,255,255,0.06)"
              : "0 8px 24px rgba(0,0,0,0.15)",
            background: theme.mode === "dark"
              ? "linear-gradient(180deg, #1e2035 0%, #171928 100%)"
              : "#fff",
            border: theme.mode === "dark" ? "1px solid rgba(255,255,255,0.08)" : "none",
            padding: "6px 0",
          },
        }}
      >
        <Can
          role={user.allUserChat === 'enabled' && user.profile === 'user' ? 'admin' : user.profile}
          perform="tickets-manager:showall"
          yes={() => (
            <MenuItem
              onClick={() => { setShowAllTickets((prev) => !prev); }}
              style={{ padding: "10px 16px", borderRadius: 8, margin: "2px 6px" }}
            >
              <ListItemIcon style={{ minWidth: 36 }}>
                {showAllTickets ? (
                  <VisibilityIcon style={{ color: theme.palette.primary.main, fontSize: 20 }} />
                ) : (
                  <VisibilityOffIcon style={{ color: "#9ca3af", fontSize: 20 }} />
                )}
              </ListItemIcon>
              <ListItemText
                primary={<span style={{ fontWeight: 600, fontSize: 14, color: theme.mode === "dark" ? "#e2e8f0" : "#1e293b" }}>
                  {showAllTickets ? "Ver todos (ativo)" : "Ver todos"}
                </span>}
              />
            </MenuItem>
          )}
        />
        <MenuItem
          onClick={() => { setHamburgerMenuAnchor(null); setNewTicketModalOpen(true); }}
          style={{ padding: "10px 16px", borderRadius: 8, margin: "2px 6px" }}
        >
          <ListItemIcon style={{ minWidth: 36 }}>
            <AddIcon style={{ color: "#10b981", fontSize: 20 }} />
          </ListItemIcon>
          <ListItemText
            primary={<span style={{ fontWeight: 600, fontSize: 14, color: theme.mode === "dark" ? "#e2e8f0" : "#1e293b" }}>{i18n.t("tickets.inbox.newTicket")}</span>}
          />
        </MenuItem>
        {user.profile === "admin" && (
          <MenuItem
            onClick={() => { handleSnackbarOpen(); }}
            style={{ padding: "10px 16px", borderRadius: 8, margin: "2px 6px" }}
          >
            <ListItemIcon style={{ minWidth: 36 }}>
              <PlaylistAddCheckOutlined style={{ color: "#ef4444", fontSize: 20 }} />
            </ListItemIcon>
            <ListItemText
              primary={<span style={{ fontWeight: 600, fontSize: 14, color: theme.mode === "dark" ? "#e2e8f0" : "#1e293b" }}>{i18n.t("tickets.inbox.closedAll")}</span>}
            />
          </MenuItem>
        )}
        <Divider style={{ margin: "6px 12px", backgroundColor: theme.mode === "dark" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)" }} />
        <MenuItem
          onClick={() => { setHamburgerMenuAnchor(null); handleChangeTab(null, "open"); }}
          style={{ padding: "10px 16px", borderRadius: 8, margin: "2px 6px", backgroundColor: tab === "open" ? `${theme.palette.primary.main}15` : "transparent" }}
        >
          <ListItemIcon style={{ minWidth: 36 }}>
            <MoveToInboxIcon style={{ color: tab === "open" ? theme.palette.primary.main : "#9ca3af", fontSize: 20 }} />
          </ListItemIcon>
          <ListItemText
            primary={<span style={{ fontWeight: 600, fontSize: 14, color: tab === "open" ? theme.palette.primary.main : (theme.mode === "dark" ? "#e2e8f0" : "#1e293b") }}>{i18n.t("tickets.inbox.open")}</span>}
          />
        </MenuItem>
        <MenuItem
          onClick={() => { setHamburgerMenuAnchor(null); handleChangeTab(null, "closed"); }}
          style={{ padding: "10px 16px", borderRadius: 8, margin: "2px 6px", backgroundColor: tab === "closed" ? `${theme.palette.primary.main}15` : "transparent" }}
        >
          <ListItemIcon style={{ minWidth: 36 }}>
            <CheckBoxIcon style={{ color: tab === "closed" ? theme.palette.primary.main : "#9ca3af", fontSize: 20 }} />
          </ListItemIcon>
          <ListItemText
            primary={<span style={{ fontWeight: 600, fontSize: 14, color: tab === "closed" ? theme.palette.primary.main : (theme.mode === "dark" ? "#e2e8f0" : "#1e293b") }}>{i18n.t("tickets.inbox.resolverd")}</span>}
          />
        </MenuItem>
        {tab !== "closed" && tab !== "search" && (
          <MenuItem
            onClick={() => { setSortTickets((prev) => !prev); }}
            style={{ padding: "10px 16px", borderRadius: 8, margin: "2px 6px" }}
          >
            <ListItemIcon style={{ minWidth: 36 }}>
              {!sortTickets ? (
                <TextRotateUp style={{ color: "#9ca3af", fontSize: 20 }} />
              ) : (
                <TextRotationDown style={{ color: theme.palette.primary.main, fontSize: 20 }} />
              )}
            </ListItemIcon>
            <ListItemText
              primary={<span style={{ fontWeight: 600, fontSize: 14, color: theme.mode === "dark" ? "#e2e8f0" : "#1e293b" }}>
                {!sortTickets ? i18n.t("ticketsManagerExtra.ascending") : i18n.t("ticketsManagerExtra.descending")}
              </span>}
            />
          </MenuItem>
        )}
        <Divider style={{ margin: "6px 12px", backgroundColor: theme.mode === "dark" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)" }} />
        <div style={{ padding: "8px 16px" }}>
          <Typography style={{ fontSize: 12, fontWeight: 600, color: theme.mode === "dark" ? "#64748b" : "#94a3b8", marginBottom: 6, textTransform: "uppercase" }}>
            Filas
          </Typography>
          <TicketsQueueSelect
            selectedQueueIds={selectedQueueIds}
            userQueues={user?.queues}
            onChange={(values) => setSelectedQueueIds(values)}
          />
        </div>
      </Menu>

      <Snackbar
        open={snackbarOpen}
        onClose={handleSnackbarClose}
        message={i18n.t("tickets.inbox.closedAllTickets")}
        ContentProps={{
          className: classes.snackbar,
        }}
        action={
          <>
            <Button
              className={classes.yesButton}
              size="small"
              onClick={CloseAllTicket}
            >
              {i18n.t("tickets.inbox.yes")}
            </Button>
            <Button
              className={classes.noButton}
              size="small"
              onClick={handleSnackbarClose}
            >
              {i18n.t("tickets.inbox.no")}
            </Button>
          </>
        }
      />

      {/* Fica montado mesmo fechado: desmontar apagava os campos enquanto o
          filtro continuava valendo na lista. */}
      <div style={filter === true ? undefined : { display: "none" }}>
        <TagsFilter onFiltered={handleSelectedTags} />
        <WhatsappsFilter onFiltered={handleSelectedWhatsapps} />
        <StatusFilter onFiltered={handleSelectedStatus} />
        {profile === "admin" && (
          <UsersFilter onFiltered={handleSelectedUsers} />
        )}
      </div>

      <TabPanel value={tab} name="open" className={classes.ticketsWrapper}>
        {!isMobile && (
          <Tabs
            value={tabOpen}
            onChange={handleChangeTabOpen}
            indicatorColor="primary"
            textColor="primary"
            variant="standard"
            scrollButtons="auto"
            TabIndicatorProps={{ className: classes.tabIndicator }}
            className={classes.modernTabs}
            style={{ minHeight: 40, display: "flex", justifyContent: "center", paddingLeft: 0 }}
          >
            <Tab
              label={
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {i18n.t("ticketsList.assignedHeader")}
                  {openCount > 0 && (
                     <span style={{
                      backgroundColor: tabOpen === "open" ? theme.palette.primary.main : `${theme.palette.primary.main}33`,
                      color: "#fff",
                      borderRadius: 10,
                      padding: "1px 6px",
                      fontSize: 10,
                      fontWeight: 700,
                      minWidth: 18,
                      textAlign: "center",
                    }}>
                      {openCount}
                    </span>
                  )}
                </span>
              }
              value={"open"}
              name="open"
              classes={{ root: classes.tabPanelItem }}
            />
            <Tab
              label={
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  {i18n.t("ticketsList.pendingHeader")}
                  {/* Sempre mostra pendingCount (o total REAL, já filtrado por
                      fila/tag/usuário — vem do próprio TicketsList via
                      updateCount, é o mesmo número de tickets que aparece na
                      lista). Antes, quando havia ticket pendente não lido em
                      QUALQUER fila da empresa (pendingUnreadCount, contagem
                      sem filtro nenhum, buscada à parte em /tickets), o badge
                      mostrava ESSE número no lugar — podendo divergir bastante
                      da lista visível (ex.: "3" no badge com só 1 ticket na
                      tela, porque os outros 2 não lidos estavam em filas fora
                      do filtro atual). Mantemos o alerta visual (vermelho)
                      quando há pendente não lido em algum lugar, mas o NÚMERO
                      exibido é sempre o que bate com o que está na tela. */}
                  {pendingCount > 0 && (
                     <span style={{
                      backgroundColor: pendingUnreadCount > 0
                        ? (theme.palette.error?.main || "#e53935")
                        : (tabOpen === "pending" ? theme.palette.primary.main : `${theme.palette.primary.main}33`),
                      color: pendingUnreadCount > 0 || tabOpen === "pending" ? "#fff" : theme.palette.primary.main,
                      borderRadius: 10,
                      padding: "1px 6px",
                      fontSize: 10,
                      fontWeight: 700,
                      minWidth: 18,
                      textAlign: "center",
                      boxShadow: pendingUnreadCount > 0 ? "0 0 0 2px rgba(255,255,255,0.6)" : "none",
                    }}>
                      {pendingCount > 99 ? "99+" : pendingCount}
                    </span>
                  )}
                </span>
              }
              value={"pending"}
              name="pending"
              classes={{ root: classes.tabPanelItem }}
            />
            {user.allowGroup && (
              <Tab
                label={
                  <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    {i18n.t("ticketsList.groupingHeader")}
                    {groupingUnreadCount > 0 && (
                      <span style={{
                        backgroundColor: theme.palette.error?.main || "#e53935",
                        color: "#fff",
                        borderRadius: 10,
                        padding: "1px 6px",
                        fontSize: 10,
                        fontWeight: 700,
                        minWidth: 18,
                        textAlign: "center",
                        boxShadow: "0 0 0 2px rgba(255,255,255,0.6)",
                      }}>
                        {groupingUnreadCount > 99 ? "99+" : groupingUnreadCount}
                      </span>
                    )}
                    {groupingUnreadCount === 0 && groupingCount > 0 && (
                      <span style={{
                        backgroundColor: tabOpen === "group" ? theme.palette.primary.main : `${theme.palette.primary.main}33`,
                        color: tabOpen === "group" ? "#fff" : theme.palette.primary.main,
                        borderRadius: 10,
                        padding: "1px 6px",
                        fontSize: 10,
                        fontWeight: 700,
                        minWidth: 18,
                        textAlign: "center",
                      }}>
                        {groupingCount}
                      </span>
                    )}
                  </span>
                }
                value={"group"}
                name="group"
                classes={{ root: classes.tabPanelItem }}
              />
            )}
          </Tabs>
        )}

        <Paper className={classes.ticketsWrapper}>
           <TicketsList
            status="open"
            showAll={showAllTickets}
            sortTickets={sortTickets ? "ASC" : "DESC"}
            selectedQueueIds={selectedQueueIds}
            updateCount={(val) => setOpenCount(val)}
            style={applyPanelStyle("open")}
            setTabOpen={setTabOpen}
            forceSearch={forceSearch}
            refreshKey={refreshKey}
            tags={selectedTags}
            users={selectedUsers}
            whatsappIds={selectedWhatsapp}
            statusFilter={selectedStatus}
           />
           <TicketsList
             status="pending"
             selectedQueueIds={selectedQueueIds}
             sortTickets={sortTickets ? "ASC" : "DESC"}
             showAll={user.profile === "admin" || user.allUserChat === 'enabled' ? showAllTickets : false}
             updateCount={(val) => setPendingCount(val)}
             style={applyPanelStyle("pending")}
             setTabOpen={setTabOpen}
             forceSearch={forceSearch}
             refreshKey={refreshKey}
             tags={selectedTags}
             users={selectedUsers}
             whatsappIds={selectedWhatsapp}
             statusFilter={selectedStatus}
           />
           {user.allowGroup && (
             <TicketsList
               status="group"
               showAll={showAllTickets}
               sortTickets={sortTickets ? "ASC" : "DESC"}
               selectedQueueIds={selectedQueueIds}
               updateCount={(val) => setGroupingCount(val)}
               style={applyPanelStyle("group")}
               setTabOpen={setTabOpen}
               forceSearch={forceSearch}
               refreshKey={refreshKey}
               tags={selectedTags}
               users={selectedUsers}
               whatsappIds={selectedWhatsapp}
               statusFilter={selectedStatus}
             />
           )}
        </Paper>
      </TabPanel>

      <TabPanel value={tab} name="closed" className={classes.ticketsWrapper}>
        <TicketsList
          status="closed"
          showAll={showAllTickets}
          selectedQueueIds={selectedQueueIds}
          tags={selectedTags}
          users={selectedUsers}
          whatsappIds={selectedWhatsapp}
          statusFilter={selectedStatus}
          forceSearch={forceSearch}
          setTabOpen={setTabOpen}
        />
      </TabPanel>

      <TabPanel value={tab} name="search" className={classes.ticketsWrapper}>
        {profile === "admin" && (
          <>
            <TicketsList
              statusFilter={selectedStatus}
              searchParam={searchParam}
              showAll={showAllTickets}
              tags={selectedTags}
              users={selectedUsers}
              selectedQueueIds={selectedQueueIds}
              whatsappIds={selectedWhatsapp}
              forceSearch={forceSearch}
              searchOnMessages={searchOnMessages}
              status="search"
            />
          </>
        )}

        {profile === "user" && (
          <TicketsList
            statusFilter={selectedStatus}
            searchParam={searchParam}
            showAll={false}
            tags={selectedTags}
            selectedQueueIds={selectedQueueIds}
            whatsappIds={selectedWhatsapp}
            forceSearch={forceSearch}
            searchOnMessages={searchOnMessages}
            status="search"
          />
        )}
      </TabPanel>
    </Paper >
  );
};

export default TicketsManagerTabs;