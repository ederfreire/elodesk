import React, { useState, useContext, useEffect, useMemo, useCallback, useRef } from "react";
import clsx from "clsx";
import { makeStyles, AppBar, Toolbar, Typography, Button, MenuItem, IconButton, Menu, useTheme, useMediaQuery, Avatar, Badge, withStyles, Dialog, DialogTitle, DialogContent, DialogActions, ListItem, ListItemAvatar, ListItemText, List, Drawer, Divider, Popper, Grow, Paper, ClickAwayListener, MenuList } from "@material-ui/core";
import MenuIcon from "@mui/icons-material/Menu";
import NotificationsIcon from "@mui/icons-material/NotificationsNone";
import ExpandMoreIcon from "@mui/icons-material/KeyboardArrowDownRounded";
import DashboardOutlinedIcon from "@mui/icons-material/DashboardOutlined";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";
import SyncAltIcon from "@mui/icons-material/SyncAlt";
import SettingsOutlinedIcon from "@mui/icons-material/SettingsOutlined";
import PeopleAltOutlinedIcon from "@mui/icons-material/PeopleAltOutlined";
import ContactPhoneOutlinedIcon from "@mui/icons-material/ContactPhoneOutlined";
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import FlashOnIcon from "@mui/icons-material/BoltOutlined";
import HelpOutlineIcon from "@mui/icons-material/HelpOutline";
import CodeRoundedIcon from "@mui/icons-material/CodeRounded";
import ViewKanban from "@mui/icons-material/ViewKanban";
import Schedule from "@mui/icons-material/Schedule";
import LocalOfferIcon from "@mui/icons-material/LocalOfferOutlined";
import EventAvailableIcon from "@mui/icons-material/EventAvailableOutlined";
import CakeIcon from "@mui/icons-material/CakeOutlined";
import ForumIcon from "@mui/icons-material/ForumOutlined";
import LocalAtmIcon from "@mui/icons-material/LocalAtmOutlined";
import BusinessIcon from "@mui/icons-material/BusinessOutlined";
import AnnouncementIcon from "@mui/icons-material/CampaignOutlined";
import AccountBalanceWalletIcon from "@mui/icons-material/AccountBalanceWalletOutlined";
import AllInclusive from "@mui/icons-material/AllInclusive";
import Assessment from "@mui/icons-material/AssessmentOutlined";
import AttachFile from "@mui/icons-material/AttachFile";
import Dashboard from "@mui/icons-material/DashboardOutlined";
import Description from "@mui/icons-material/Description";
import DeviceHubOutlined from "@mui/icons-material/DeviceHubOutlined";
import GridOn from "@mui/icons-material/GridOn";
import PhoneIcon from "@mui/icons-material/PhoneOutlined";
import PhonelinkSetup from "@mui/icons-material/PhonelinkSetup";
import SwapHoriz from "@mui/icons-material/SwapHoriz";
import CheckBoxOutlinedIcon from "@mui/icons-material/CheckBoxOutlined";
import Webhook from "@mui/icons-material/Webhook";
import ShapeLine from "@mui/icons-material/ShapeLine";
import GroupsIcon from "@mui/icons-material/GroupsOutlined";

import api from "../services/api";
import NotificationsPopOver from "../components/NotificationsPopOver";
import WelcomeGreeting from "../components/WelcomeGreeting";
import InstallAppPrompt from "../components/InstallAppPrompt";
import usePushAutoSync from "../hooks/usePushAutoSync";
import UserModal from "../components/UserModal";
import RamaisPanel from "../components/RamaisPanel";
import OfficialCallPanel from "../components/OfficialCallPanel";
import { AuthContext } from "../context/Auth/AuthContext";
import BackdropLoading from "../components/BackdropLoading";
import { i18n } from "../translate/i18n";
import toastError from "../errors/toastError";
import AnnouncementsPopover from "../components/AnnouncementsPopover";
import BirthdayModal from "../components/BirthdayModal";
import ChatPopover from "../pages/Chat/ChatPopover";
import { useDate } from "../hooks/useDate";
import ColorModeContext from "../layout/themeContext";
import { getBackendUrl } from "../config";
import useSettings from "../hooks/useSettings";
import VersionControl from "../components/VersionControl";
import useSocketListener from "../hooks/useSocketListener";

import usePlans from "../hooks/usePlans";
import useHelps from "../hooks/useHelps";
import { WhatsAppsContext } from "../context/WhatsApp/WhatsAppsContext";
import WavoipWebphoneWidget from "../components/WavoipWebphone";
import { useHistory, useLocation } from "react-router-dom";
import useCompanySettings from "../hooks/useSettings/companySettings";
import { setCompanyCurrency } from "../helpers/currencyHelper";
import MainListItems from "./MainListItems";

const backendUrl = getBackendUrl();

const useStyles = makeStyles((theme) => ({
  root: {
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    height: "100dvh",
    backgroundColor: theme.palette.fancyBackground,
    "& .MuiButton-outlinedPrimary": {
      color: theme.palette.primary.main,
      border: `1px solid ${theme.palette.primary.main}40`,
      borderRadius: "8px",
      fontWeight: 600,
      textTransform: "none",
      transition: "all 0.3s ease",
      "&:hover": {
        backgroundColor: `${theme.palette.primary.main}10`,
        borderColor: theme.palette.primary.main,
        transform: "translateY(-1px)",
        boxShadow: `0 4px 12px ${theme.palette.primary.main}30`,
      },
    },
    "& .MuiTab-textColorPrimary.Mui-selected": {
      color: theme.palette.primary.main,
      fontWeight: 700,
    },
  },

  appBar: {
    zIndex: theme.zIndex.drawer + 1,
    boxShadow: theme.palette.type === "light"
      ? "0 2px 8px rgba(0, 0, 0, 0.1)"
      : "0 1px 0 rgba(255, 255, 255, 0.05)",
    borderBottom: theme.palette.type === "dark" ? "1px solid rgba(255,255,255,0.06)" : "none",
  },

  toolbar: {
    paddingRight: 12,
    paddingLeft: 12,
    color: theme.palette.type === "dark" ? "#e5e7eb" : "#374151",
    background: theme.palette.type === "dark" ? "#1a1c2e" : "#e5e7eb",
    minHeight: "48px !important",
    display: "flex",
    alignItems: "center",
    gap: 0,
    borderBottom: theme.palette.type === "dark" ? "1px solid rgba(255,255,255,0.08)" : "none",
  },

  logo: {
    height: "44px",
    maxWidth: 170,
    marginLeft: 12,
    marginRight: 20,
    content:
      "url(" +
      (theme.mode === "light"
        ? theme.calculatedLogoLight()
        : theme.calculatedLogoDark()) +
      ")",
    backgroundColor: "transparent",
    mixBlendMode: theme.mode === "dark" ? "screen" : "normal",
    cursor: "pointer",
    objectFit: "contain",
  },

  navSection: {
    display: "flex",
    alignItems: "center",
    gap: 2,
    flex: 1,
  },

  navButton: {
    color: theme.palette.type === "light" ? "#374151" : "rgba(255, 255, 255, 0.9)",
    textTransform: "none",
    fontSize: "13px",
    fontWeight: 500,
    padding: "6px 12px",
    borderRadius: "8px",
    minWidth: "auto",
    whiteSpace: "nowrap",
    transition: "all 0.2s ease",
    "&:hover": {
      backgroundColor: theme.palette.type === "light" ? "rgba(0, 0, 0, 0.06)" : "rgba(255, 255, 255, 0.12)",
    },
    "& .MuiSvgIcon-root": {
      fontSize: "18px",
      marginRight: 4,
    },
    "& .MuiButton-endIcon": {
      marginLeft: 2,
    },
  },

  // Mesma linguagem visual dos ícones da barra de ferramentas (toolbarButton
  // logo abaixo): fundo suave e claro, sem cor sólida saturada, cantos
  // discretos. A primeira tentativa usou preenchimento sólido tipo "aba
  // ativa" clássica — o pedido foi pra ficar com a cara minimalista que já
  // existe nos ícones do canto direito (chat, WhatsApp, sino, etc).
  navButtonActive: {
    backgroundColor: theme.palette.type === "light"
      ? `${theme.palette.primary.main}14`
      : `${theme.palette.primary.main}26`,
    color: `${theme.palette.primary.main} !important`,
    fontWeight: 600,
    "&:hover": {
      backgroundColor: theme.palette.type === "light"
        ? `${theme.palette.primary.main}1f`
        : `${theme.palette.primary.main}33`,
    },
    "& .MuiSvgIcon-root": {
      color: `${theme.palette.primary.main} !important`,
    },
  },

  rightSection: {
    display: "flex",
    alignItems: "center",
    gap: 2,
    marginLeft: "auto",
  },

  toolbarButton: {
    color: theme.palette.type === "dark" ? "#9ca3af" : "#6b7280",
    borderRadius: "8px",
    padding: "6px",
    transition: "all 0.2s ease",
    "&:hover": {
      backgroundColor: theme.palette.type === "light" ? "rgba(0, 0, 0, 0.06)" : "rgba(255, 255, 255, 0.1)",
    },
  },

  dropdownPaper: {
    marginTop: 6,
    borderRadius: "12px",
    boxShadow: "0 10px 28px rgba(0, 0, 0, 0.12)",
    minWidth: "210px",
    padding: "6px",
    backgroundColor: theme.palette.type === "light" ? "#fff" : "#1a1c2e",
    border: theme.palette.type === "dark" ? "1px solid rgba(255,255,255,0.08)" : "1px solid rgba(0,0,0,0.04)",
  },

  dropdownItem: {
    padding: "8px 12px",
    borderRadius: "8px",
    margin: "1px 0",
    fontSize: "13px",
    fontWeight: 500,
    display: "flex",
    alignItems: "center",
    gap: 10,
    color: theme.palette.type === "light" ? "#374151" : "#d1d5db",
    transition: "all 0.15s ease",
    "&:hover": {
      backgroundColor: theme.palette.type === "light"
        ? `${theme.palette.primary.main}10`
        : "rgba(255,255,255,0.06)",
      color: theme.palette.primary.main,
    },
    "& .MuiSvgIcon-root": {
      fontSize: "18px",
      color: theme.palette.type === "light" ? "#9ca3af" : "#6b7280",
    },
    "&:hover .MuiSvgIcon-root": {
      color: theme.palette.primary.main,
    },
  },

  content: {
    flex: 1,
    overflow: "auto",
    padding: 0,
    margin: 0,
  },

  appBarSpacer: {
    minHeight: "48px",
  },

  avatar2: {
    width: 32,
    height: 32,
    cursor: "pointer",
    borderRadius: "50%",
    border: "2px solid rgba(255,255,255,0.3)",
    transition: "all 0.2s ease",
    "&:hover": {
      transform: "scale(1.05)",
      borderColor: "rgba(255,255,255,0.6)",
    },
  },

  badgeIcon: {
    position: "relative",
    "& .MuiBadge-badge": {
      top: 2,
      right: 2,
      minWidth: 16,
      height: 16,
      fontSize: "10px",
      fontWeight: 700,
      backgroundColor: "#ef4444",
      color: "#fff",
      borderRadius: 8,
      boxShadow: "0 2px 6px rgba(239,68,68,0.4)",
    },
  },

  mobileDrawer: {
    width: 280,
    backgroundColor: theme.palette.type === "light" ? "#f9fafb" : "#0d0f18",
    "& .MuiListItem-root": {
      borderRadius: "10px",
      margin: "2px 8px",
    },
  },

  mobileToolbar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    width: "100%",
  },

  mobileLogoSection: {
    display: "flex",
    alignItems: "center",
    flex: 1,
    minWidth: 0,
  },

  mobileActionsSection: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    flexShrink: 0,
    overflow: "visible",
  },

  mobileDrawerHeader: {
    padding: "16px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    borderBottom: theme.palette.type === "dark" 
      ? "1px solid rgba(255,255,255,0.08)" 
      : "1px solid rgba(0,0,0,0.08)",
    background: theme.palette.type === "dark" ? "#131525" : "#fff",
  },

  mobileDrawerUserSection: {
    padding: "16px",
    display: "flex",
    alignItems: "center",
    gap: 12,
    background: theme.palette.type === "dark" 
      ? "linear-gradient(135deg, #1a1c2e 0%, #131525 100%)" 
      : "linear-gradient(135deg, #f0f1ff 0%, #e8e9f5 100%)",
    borderBottom: theme.palette.type === "dark" 
      ? "1px solid rgba(255,255,255,0.06)" 
      : "1px solid rgba(0,0,0,0.06)",
  },
}));

const StyledBadge = withStyles((theme) => ({
  badge: {
    backgroundColor: "#44b700",
    color: "#44b700",
    boxShadow: `0 0 0 2px ${theme.palette.background.paper}`,
    "&::after": {
      position: "absolute",
      top: 0,
      left: 0,
      width: "100%",
      height: "100%",
      borderRadius: "50%",
      animation: "$ripple 1.2s infinite ease-in-out",
      border: "1px solid currentColor",
      content: '""',
    },
  },
  "@keyframes ripple": {
    "0%": { transform: "scale(.8)", opacity: 1 },
    "100%": { transform: "scale(2.4)", opacity: 0 },
  },
}))(Badge);

// Dropdown menu component
const NavDropdown = ({ label, icon, items, classes, badgeCount }) => {
  const [open, setOpen] = useState(false);
  const anchorRef = useRef(null);
  const history = useHistory();
  const location = useLocation();

  const isActive = items.some(item => location.pathname === item.to || location.pathname.startsWith(item.to + "/"));

  const handleToggle = () => setOpen(prev => !prev);
  const handleClose = (e) => {
    if (anchorRef.current && anchorRef.current.contains(e.target)) return;
    setOpen(false);
  };

  const handleNav = (to) => {
    history.push(to);
    setOpen(false);
  };

  return (
    <>
      <Button
        ref={anchorRef}
        className={clsx(classes.navButton, isActive && classes.navButtonActive)}
        onClick={handleToggle}
        startIcon={
          badgeCount > 0 ? (
            <Badge
              badgeContent={badgeCount}
              max={99}
              color="error"
              overlap="rectangular"
              anchorOrigin={{ vertical: "top", horizontal: "right" }}
              sx={{
                "& .MuiBadge-badge": {
                  backgroundColor: "#ef4444 !important",
                  color: "#fff",
                  fontSize: 10,
                  fontWeight: 800,
                  minWidth: 18,
                  height: 18,
                  border: "2px solid #fff",
                  borderRadius: "9px",
                  boxShadow: "0 2px 6px rgba(239,68,68,0.5)",
                  padding: "0 4px",
                  top: 0,
                  right: 0,
                }
              }}
            >
              {icon}
            </Badge>
          ) : icon
        }
        endIcon={<ExpandMoreIcon style={{ fontSize: 16, transform: open ? "rotate(180deg)" : "none", transition: "transform 0.2s" }} />}
      >
        {label}
      </Button>
      <Popper open={open} anchorEl={anchorRef.current} transition disablePortal placement="bottom-start" style={{ zIndex: 1300 }}>
        {({ TransitionProps }) => (
          <Grow {...TransitionProps}>
            <Paper className={classes.dropdownPaper}>
              <ClickAwayListener onClickAway={handleClose}>
                <MenuList autoFocusItem={open}>
                  {items.map((item, idx) => (
                    <MenuItem
                      key={idx}
                      className={classes.dropdownItem}
                      onClick={() => handleNav(item.to)}
                      selected={location.pathname === item.to}
                    >
                      {item.icon}
                      {item.label}
                    </MenuItem>
                  ))}
                </MenuList>
              </ClickAwayListener>
            </Paper>
          </Grow>
        )}
      </Popper>
    </>
  );
};

// Simple nav link button
const NavLink = ({ label, icon, to, classes }) => {
  const history = useHistory();
  const location = useLocation();
  const isActive = location.pathname === to || location.pathname.startsWith(to + "/");

  return (
    <Button
      className={clsx(classes.navButton, isActive && classes.navButtonActive)}
      onClick={() => history.push(to)}
      startIcon={icon}
    >
      {label}
    </Button>
  );
};

const LoggedInLayout = ({ children, themeToggle, hideMenu = false }) => {
  const classes = useStyles();
  const [userModalOpen, setUserModalOpen] = useState(false);
  // Nome da área de cursos definido pelo admin (mesmo rótulo da página).
  const [coursesLabel, setCoursesLabel] = useState("");
  const [ramaisOpen, setRamaisOpen] = useState(false);
  const [ligacaoOficialOpen, setLigacaoOficialOpen] = useState(false);
  const [anchorEl, setAnchorEl] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const { handleLogout, loading, user, socket } = useContext(AuthContext);
  const { whatsApps, wavoipToken, wavoipWhatsappId } = useContext(WhatsAppsContext);

  // Reinscreve o push automaticamente quando a permissão já foi concedida.
  // É o que faz a notificação voltar sozinha quando o navegador descarta a
  // inscrição (troca de endpoint, service worker atualizado, celular dias sem
  // abrir o app). Sem isso, uma vez perdida, a inscrição só voltava se o
  // atendente fosse em Configurações desligar e ligar o push na mão.
  usePushAutoSync(!!user?.id);

  // Contador do menu "Atendimentos".
  //
  // Antes vinha do hook useTickets, que só consulta a API uma vez ao montar a
  // tela e não ouve nada do socket. Resultado: ao aceitar, resolver ou fechar
  // todos os tickets, o número continuava lá até dar F5. Agora o contador
  // refaz a consulta sempre que o backend avisa que um ticket ou uma mensagem
  // mudou.
  const [unreadTicketsCount, setUnreadTicketsCount] = useState(0);

  useEffect(() => {
    // Rótulo da área de cursos, para o menu do topo refletir o nome que o
    // admin definiu na página. Falha silenciosa cai no padrão traduzido.
    let ativo = true;
    api.get("/courses/page-config")
      .then(({ data }) => {
        if (!ativo || !data?.title) return;
        // O nome vem por idioma ({pt, es, en}); mostramos o do usuário e, se
        // estiver em branco, o português. Formato antigo (texto) também vale.
        const bruto = (i18n.language || "pt").toLowerCase().split("-")[0];
        const t = data.title;
        const nome = typeof t === "string" ? t : (t[bruto] || t.pt || t.es || t.en || "");
        if (nome) setCoursesLabel(nome);
      })
      .catch(() => {});
    return () => { ativo = false; };
  }, []);

  useEffect(() => {
    const companyId = user?.companyId;
    if (!companyId) return undefined;

    let cancelado = false;
    let agendado = null;

    const buscar = async () => {
      try {
        const { data } = await api.get("/tickets", {
          params: { pageNumber: 1, withUnreadMessages: "true" }
        });
        if (cancelado) return;
        const lista = Array.isArray(data?.tickets) ? data.tickets : [];
        setUnreadTicketsCount(
          lista.filter(t => Number(t?.unreadMessages) > 0).length
        );
      } catch {
        // silencioso: o badge apenas mantém o valor anterior
      }
    };

    // Vários eventos chegam juntos (fechar todos dispara um por ticket).
    // Agrupa em uma única consulta pra não disparar uma rajada de requisições.
    const buscarAgrupado = () => {
      if (agendado) clearTimeout(agendado);
      agendado = setTimeout(buscar, 400);
    };

    buscar();

    if (!socket || typeof socket.on !== "function") {
      return () => {
        cancelado = true;
        if (agendado) clearTimeout(agendado);
      };
    }

    const eventoTicket = `company-${companyId}-ticket`;
    const eventoMensagem = `company-${companyId}-appMessage`;
    socket.on(eventoTicket, buscarAgrupado);
    socket.on(eventoMensagem, buscarAgrupado);

    return () => {
      cancelado = true;
      if (agendado) clearTimeout(agendado);
      if (socket && typeof socket.off === "function") {
        socket.off(eventoTicket, buscarAgrupado);
        socket.off(eventoMensagem, buscarAgrupado);
      }
    };
  }, [user?.companyId, socket]);

  // Badge do ícone do app com o app ABERTO.
  //
  // Com o app fechado/em segundo plano quem estampa o número é o service
  // worker, ao receber o push. Mas com o app na frente nenhum push chega
  // (o navegador entrega o evento pelo socket direto pra página), então o
  // badge ficaria congelado no último valor. Aqui espelhamos no ícone o
  // mesmo contador do menu "Atendimentos", que já se atualiza via socket —
  // ao ler as conversas ele cai pra 0 e o balãozinho some sozinho.
  useEffect(() => {
    const n = Number(unreadTicketsCount) || 0;

    // Caminho direto: a Badging API também existe na página, não só no
    // service worker. Usar os dois cobre navegador que suporta num contexto
    // e não no outro.
    try {
      if (n > 0 && typeof navigator?.setAppBadge === "function") {
        navigator.setAppBadge(n).catch(() => {});
      } else if (typeof navigator?.clearAppBadge === "function") {
        navigator.clearAppBadge().catch(() => {});
      }
    } catch {
      // navegador sem suporte à Badging API — ignora
    }

    // Caminho pelo service worker (mantém o SW e a página com o mesmo valor,
    // evitando que um push atrasado reponha um número velho).
    try {
      const sw = navigator?.serviceWorker?.controller;
      if (sw && typeof sw.postMessage === "function") {
        sw.postMessage(
          n > 0 ? { type: "SET_BADGE", count: n } : { type: "CLEAR_BADGE" }
        );
      }
    } catch {
      // sem service worker ativo — ignora
    }
  }, [unreadTicketsCount]);

  const [showOptions, setShowOptions] = useState(false);
  const langSelectorRef = useRef(null);

  useEffect(() => {
    if (!showOptions) return;
    const handleClickOutside = (e) => {
      if (langSelectorRef.current && !langSelectorRef.current.contains(e.target)) {
        setShowOptions(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [showOptions]);
  const [showAnnouncementsModal, setShowAnnouncementsModal] = useState(false);
  const [announcements, setAnnouncements] = useState([]);
  const [selectedAnnouncement, setSelectedAnnouncement] = useState(null);
  const [showBirthdayModal, setShowBirthdayModal] = useState(false);
  const [dismissedAnnouncements, setDismissedAnnouncements] = useState(() => {
    try {
      const stored = localStorage.getItem("announcementsDismissed");
      return stored ? JSON.parse(stored) : {};
    } catch { return {}; }
  });

  // Mobile drawer state
  const [mobileOpen, setMobileOpen] = useState(false);

  const theme = useTheme();
  const { colorMode } = useContext(ColorModeContext);
  const greaterThenSm = useMediaQuery(theme.breakpoints.up("sm"));
  const isMobile = useMediaQuery(theme.breakpoints.down("sm"));

  const [volume, setVolume] = useState(localStorage.getItem("volume") || 1);
  const { dateToClient } = useDate();
  const [profileUrl, setProfileUrl] = useState(null);
  const [updateInProgress, setUpdateInProgress] = useState(false);
  const history = useHistory();

  // Plan features
  const { getPlanCompany } = usePlans();
  const [showCampaigns, setShowCampaigns] = useState(true);
  const [showUtmLinks, setShowUtmLinks] = useState(true);
  const [showSalesAgents, setShowSalesAgents] = useState(true);
  const [showKanban, setShowKanban] = useState(true);
  const [showOpenAi, setShowOpenAi] = useState(true);

  const [showIntegrations, setShowIntegrations] = useState(true);
  const [showSchedules, setShowSchedules] = useState(true);
  const [showInternalChat, setShowInternalChat] = useState(true);
  const [showExternalApi, setShowExternalApi] = useState(true);
  const [showFlows, setShowFlows] = useState(true);
  // URA de voz (WhatsApp Plus): só com o módulo de ligações no plano.
  const [showWacalls, setShowWacalls] = useState(false);
  const [showContacts, setShowContacts] = useState(true);
  const [showDashboard, setShowDashboard] = useState(true);
  const [showRealTime, setShowRealTime] = useState(true);
  const [connectionWarning, setConnectionWarning] = useState(false);
  const { list: listHelps } = useHelps();
  const [hasHelps, setHasHelps] = useState(false);
  const { get: getSetting } = useCompanySettings();
  const [showWallets, setShowWallets] = useState(false);

  useEffect(() => {
    async function fetchData() {
      try {
        const companyId = user.companyId;

        // Sem companyId nao ha o que buscar. O `user` do AuthContext comeca
        // como {} e so e preenchido depois do /auth/refresh_token, entao na
        // primeira execucao deste efeito o id ainda nao existe — a URL virava
        // "/companies/listPlan/undefined" e o backend respondia 400.
        // O efeito roda de novo quando o companyId chegar (esta nas deps).
        if (!companyId) return;

        const planConfigs = await getPlanCompany(undefined, companyId);
        setShowCampaigns(planConfigs.plan.useCampaigns);
        setShowUtmLinks(planConfigs.plan.useUtmLinks !== false);
        setShowSalesAgents(planConfigs.plan.useSalesAgents !== false);
        setShowKanban(planConfigs.plan.useKanban);
        setShowOpenAi(planConfigs.plan.useOpenAi);
        
        setShowIntegrations(planConfigs.plan.useIntegrations);
        setShowSchedules(planConfigs.plan.useSchedules);
        setShowInternalChat(planConfigs.plan.useInternalChat);
        setShowExternalApi(planConfigs.plan.useExternalApi);
        setShowFlows(planConfigs.plan.useFlows !== false);
        setShowWacalls(!!planConfigs.plan.useWacalls);
        setShowContacts(planConfigs.plan.useContacts !== false);
        setShowDashboard(planConfigs.plan.useDashboard !== false);
        setShowRealTime(planConfigs.plan.useRealTime !== false);
      } catch (err) { console.error("[Layout] Erro ao carregar plano:", err); }
    }
    fetchData();
  }, [user.companyId]);

  useEffect(() => {
    async function checkHelps() {
      const helps = await listHelps();
      setHasHelps(helps.length > 0);
    }
    checkHelps();
  }, []);

  useEffect(() => {
    const fetchSettings = async () => {
      try {
        const setting = await getSetting({ "column": "DirectTicketsToWallets" });
        setShowWallets(setting.DirectTicketsToWallets);
      } catch (err) { }
    };
    fetchSettings();
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (whatsApps.length > 0) {
        const offlineWhats = whatsApps.filter(w =>
          ["qrcode", "PAIRING", "DISCONNECTED", "TIMEOUT", "OPENING"].includes(w.status)
        );
        setConnectionWarning(offlineWhats.length > 0);
      }
    }, 2000);
    return () => clearTimeout(timer);
  }, [whatsApps]);

  // Announcement logic
  const handleDismissAnnouncement = (ann) => {
    const updatedAtKey = ann.updatedAt || ann.createdAt;
    setDismissedAnnouncements(prev => {
      const updated = { ...prev, [ann.id]: updatedAtKey };
      try { localStorage.setItem("announcementsDismissed", JSON.stringify(updated)); } catch {}
      return updated;
    });
    setAnnouncements(prev => prev.filter(a => a.id !== ann.id));
    setSelectedAnnouncement(null);
    const remaining = announcements.filter(a => a.id !== ann.id);
    if (remaining.length === 0) setShowAnnouncementsModal(false);
  };

  const settings = useSettings();

  useEffect(() => {
    const fetchAnnouncements = async () => {
      try {
        const { data } = await api.get("/announcements/for-company", {
          params: { status: true, pageNumber: "1" }
        });
        const activeAnnouncements = data.records.filter(a => {
          const isActive = a.status === true || a.status === "true";
          const isNotExpired = !a.expiresAt || new Date(a.expiresAt) > new Date();
          return isActive && isNotExpired;
        });
        setAnnouncements(activeAnnouncements);
        let storedDismissed = {};
        try {
          const stored = localStorage.getItem("announcementsDismissed");
          storedDismissed = stored ? JSON.parse(stored) : {};
        } catch {}
        const visibleAnnouncements = activeAnnouncements.filter(ann => {
          const dismissedAt = storedDismissed[ann.id];
          if (!dismissedAt) return true;
          return ann.updatedAt && ann.updatedAt !== dismissedAt;
        });
        if (visibleAnnouncements.length > 0) setShowAnnouncementsModal(true);
      } catch (err) { toastError(err); }
    };
    if (user?.id) fetchAnnouncements();
  }, [user?.id]);

  // Load company currency setting
  useEffect(() => {
    const loadCurrency = async () => {
      try {
        const url = user?.companyId
          ? `/companySettings/${user.companyId}`
          : "/companySettings";
        const { data } = await api.get(url);
        if (data?.currency) setCompanyCurrency(data.currency);
      } catch {}
    };
    if (user?.id) loadCurrency();
  }, [user?.id, user?.companyId]);

  // Profile URL
  useEffect(() => {
    const companyId = user?.companyId;
    if (companyId) {
      const savedProfileImage = localStorage.getItem("profileImage");
      const currentProfileImage = savedProfileImage || user.profileImage;
      if (currentProfileImage) {
        setProfileUrl(`${backendUrl}/public/company${companyId}/user/${currentProfileImage}`);
      } else {
        setProfileUrl(`${backendUrl}/public/app/noimage.png`);
      }
    }
  }, [user?.companyId, user?.profileImage]);

  // Socket events
  const handleAuthEvent = useCallback((data) => {
    if (data.user.id === +user?.id) {
      toastError("Sua conta foi acessada em outro computador.");
      setTimeout(() => { localStorage.clear(); window.location.reload(); }, 1000);
    }
  }, [user?.id]);

  const handleUserUpdate = useCallback((data) => {
    if (data.action === "update" && data.user.id === +user?.id && data.user.profileImage) {
      const newProfileUrl = `${backendUrl}/public/company${user?.companyId}/user/${data.user.profileImage}`;
      setProfileUrl(newProfileUrl);
      localStorage.setItem("profileImage", data.user.profileImage);
    }
  }, [user?.companyId, user?.id]);

  const handleUserBirthday = useCallback((data) => {
    if (data.userId === +user?.id) setShowBirthdayModal(true);
  }, [user?.id]);

  const handleContactBirthday = useCallback(() => {}, []);

  const checkBirthdaysOnLogin = useCallback(async () => {
    if (user?.id && user?.companyId) {
      try {
        const { data } = await api.get("/birthdays/today");
        const userBirthday = data.data.users.find(u => u.id === +user.id);
        if (userBirthday) setShowBirthdayModal(true);
      } catch (error) { }
    }
  }, [user?.id, user?.companyId]);

  useSocketListener(socket, user, 'auth', handleAuthEvent);
  useSocketListener(socket, user, 'user', handleUserUpdate);
  useSocketListener(socket, user, 'user-birthday', handleUserBirthday);
  useSocketListener(socket, user, 'contact-birthday', handleContactBirthday);

  useEffect(() => {
    if (user?.id && user?.companyId) {
      const timer = setTimeout(() => checkBirthdaysOnLogin(), 1000);
      return () => clearTimeout(timer);
    }
  }, [user?.id, user?.companyId, checkBirthdaysOnLogin]);

  useEffect(() => {
    if (socket?.emit && user?.companyId) {
      if (socket.connected) socket.emit("userStatus");
      const interval = setInterval(() => {
        // O intervalo continua rodando mesmo com o socket fora do ar; sem a
        // checagem, cada disparo vira um aviso no console.
        if (socket?.connected) socket.emit("userStatus");
      }, 1000 * 60 * 5);
      return () => clearInterval(interval);
    }
  }, [socket, user?.companyId]);

  const handleUpdateStart = () => setUpdateInProgress(true);
  const handleUpdateComplete = () => setUpdateInProgress(false);

  const handleMenu = (event) => { setAnchorEl(event.currentTarget); setMenuOpen(true); };
  const handleCloseMenu = () => { setAnchorEl(null); setMenuOpen(false); };
  const handleOpenUserModal = () => { setUserModalOpen(true); handleCloseMenu(); };
  const handleClickLogout = () => { handleCloseMenu(); handleLogout(); };
  const handleRefreshPage = () => window.location.reload(false);

  // Apply user's language from profile on load
  useEffect(() => {
    if (user?.language) {
      const normalizedLang = normalizeLanguageCode(user.language);
      const currentLang = localStorage.getItem("language");
      if (currentLang !== normalizedLang) {
        i18n.changeLanguage(normalizedLang);
        localStorage.setItem("language", normalizedLang);
        localStorage.setItem("i18nextLng", normalizedLang);
      }
    }
  }, [user?.language]);

  const createFlagDataUri = (svg) => `data:image/svg+xml;utf8,${encodeURIComponent(svg)}`;

  const FLAG_ICONS = {
    "pt-BR": createFlagDataUri(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 20">
        <rect width="28" height="20" rx="2" fill="#229E45"/>
        <polygon points="14,2.2 24.5,10 14,17.8 3.5,10" fill="#F7C948"/>
        <circle cx="14" cy="10" r="4.2" fill="#1F5AA6"/>
      </svg>
    `),
    "en": createFlagDataUri(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 20">
        <rect width="28" height="20" rx="2" fill="#fff"/>
        <rect width="28" height="2" y="0" fill="#B22234"/><rect width="28" height="2" y="3" fill="#B22234"/><rect width="28" height="2" y="6" fill="#B22234"/><rect width="28" height="2" y="9" fill="#B22234"/><rect width="28" height="2" y="12" fill="#B22234"/><rect width="28" height="2" y="15" fill="#B22234"/><rect width="28" height="2" y="18" fill="#B22234"/>
        <rect width="12" height="8.5" fill="#3C3B6E"/>
      </svg>
    `),
    "es": createFlagDataUri(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 20">
        <rect width="28" height="20" rx="2" fill="#AA151B"/>
        <rect y="5" width="28" height="10" fill="#F1BF00"/>
      </svg>
    `),
    "ar": createFlagDataUri(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 20">
        <rect width="28" height="20" rx="2" fill="#006C35"/>
        <rect x="6" y="14" width="16" height="1.6" rx="0.8" fill="#fff"/>
        <circle cx="9" cy="14.8" r="1.1" fill="#fff"/>
      </svg>
    `),
    "tr": createFlagDataUri(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 28 20">
        <rect width="28" height="20" rx="2" fill="#E30A17"/>
        <circle cx="11.5" cy="10" r="4.5" fill="#fff"/>
        <circle cx="12.8" cy="10" r="3.6" fill="#E30A17"/>
        <polygon points="17.8,10 20.8,11.1 19,8.5 19,11.5 20.8,8.9" fill="#fff"/>
      </svg>
    `),
  };

  const LANGUAGE_OPTIONS = [
    { code: "pt-BR", label: "Português", flag: FLAG_ICONS["pt-BR"], aliases: ["pt", "pt-br"] },
    { code: "en", label: "English", flag: FLAG_ICONS.en, aliases: ["en", "en-us", "en_US"] },
    { code: "es", label: "Español", flag: FLAG_ICONS.es, aliases: ["es", "es-es", "es_ES"] },
  ];

  const normalizeLanguageCode = (language) => {
    if (!language) return "pt-BR";

    const normalized = String(language).trim().toLowerCase().replace(/_/g, "-");
    const matchedOption = LANGUAGE_OPTIONS.find(option =>
      option.code.toLowerCase() === normalized || option.aliases.includes(normalized) || normalized.startsWith(`${option.code.toLowerCase()}-`) || option.aliases.some(alias => normalized.startsWith(`${alias.toLowerCase()}-`))
    );

    return matchedOption?.code || (normalized.startsWith("pt") ? "pt-BR" : "en");
  };

  const [enabledLanguages, setEnabledLanguages] = useState(["pt-BR", "en"]);
  const { getAll } = useSettings();
  useEffect(() => {
    async function fetchSettings() {
      try {
        const allSettings = await getAll();
        const enabledLanguagesSetting = allSettings.find(s => s.key === "enabledLanguages")?.value;
        let langs = ["pt-BR", "en"];
        try { if (enabledLanguagesSetting) langs = JSON.parse(enabledLanguagesSetting); } catch {}
        setEnabledLanguages(langs);
      } catch (error) { }
    }
    fetchSettings();
  }, [user?.companyId]);

  const filteredLanguageOptions = LANGUAGE_OPTIONS.filter(lang => enabledLanguages.includes(lang.code));
  const currentLanguageOption = LANGUAGE_OPTIONS.find(lang => lang.code === normalizeLanguageCode(user?.language || localStorage.getItem("language") || localStorage.getItem("i18nextLng") || i18n.resolvedLanguage || i18n.language)) || LANGUAGE_OPTIONS[0];

  if (loading || updateInProgress) return <BackdropLoading />;

  // Build menu items
  const podeVerMarketing = user?.profile === "admin" || !!user?.super || user?.showCampaign === "enabled";
  const atendimentosItems = [
    { to: "/tickets", label: i18n.t("mainDrawer.listItems.tickets"), icon: <WhatsAppIcon /> },
    { to: "/quick-messages", label: i18n.t("mainDrawer.listItems.quickMessages"), icon: <FlashOnIcon /> },
    { to: "/courses", label: coursesLabel || i18n.t("mainDrawer.listItems.courses", "Cursos"), icon: <FlashOnIcon /> },
    { to: "/template-manager", label: "Templates Meta", icon: <Description /> },
    ...(user.showKanban === "enabled" && showKanban ? [
      { to: "/kanban", label: i18n.t("mainDrawer.listItems.kanban"), icon: <ViewKanban /> },
      { to: "/kanban-boards", label: i18n.t("kanbanBoards.title"), icon: <ViewKanban /> },
    ] : []),
    ...(user.showContacts === "enabled" && showContacts ? [{ to: "/contacts", label: i18n.t("mainDrawer.listItems.contacts"), icon: <ContactPhoneOutlinedIcon /> }] : []),
    ...(user.showSchedules === "enabled" && showSchedules ? [{ to: "/schedules", label: i18n.t("mainDrawer.listItems.schedules"), icon: <Schedule /> }] : []),
    { to: "/tags", label: i18n.t("mainDrawer.listItems.tags"), icon: <LocalOfferIcon /> },
    { to: "/todolist", label: i18n.t("mainDrawer.listItems.tasks"), icon: <CheckBoxOutlinedIcon /> },
    ...(user.showInternalChat === "enabled" && showInternalChat ? [{ to: "/chats", label: i18n.t("mainDrawer.listItems.chats"), icon: <ForumIcon /> }] : []),
    ...(hasHelps ? [{ to: "/helps", label: i18n.t("mainDrawer.listItems.helps"), icon: <HelpOutlineIcon /> }] : []),
  ];

  const automationItems = [
    ...(user?.showCampaign === "enabled" && showCampaigns ? [
      { to: "/campaigns", label: i18n.t("mainDrawer.listItems.campaigns"), icon: <EventAvailableIcon /> },
    ] : []),
    // Links UTM e Agentes Comerciais têm opção própria no plano e não
    // dependem mais de Campanhas. Admin vê sempre que o plano libera; o
    // usuário comum, quando tem "Ver campanhas" (a permissão de marketing).
    ...(showUtmLinks && podeVerMarketing ? [
      { to: "/utm-links", label: i18n.t("mainDrawer.listItems.utmLinks", "Links UTM"), icon: <AllInclusive /> },
    ] : []),
    ...(showSalesAgents && podeVerMarketing ? [
      { to: "/sales-agents", label: i18n.t("mainDrawer.listItems.salesAgents", "Agentes Comerciais"), icon: <FlashOnIcon /> },
    ] : []),
    // Modelos de Agente servem ao Agente Comercial e ao Agente de IA.
    ...((showSalesAgents || showOpenAi) && podeVerMarketing ? [
      { to: "/agent-templates", label: i18n.t("mainDrawer.listItems.agentTemplates", "Modelos de Agente"), icon: <FlashOnIcon /> },
    ] : []),
    ...(user.showFlow === "enabled" && showFlows ? [
      { to: "/flowbuilders", label: i18n.t("flowBuilder.conversationFlows"), icon: <ShapeLine /> },
      { to: "/plugins/floup", label: i18n.t("mainDrawer.listItems.followUp"), icon: <Webhook /> },
    ] : []),
    ...(showWacalls && user.profile === "admin" ? [
      { to: "/voice-ivr", label: i18n.t("voiceIvr.titulo", "Construtor de URA"), icon: <PhoneIcon /> },
    ] : []),
    ...(user.showOpenAi === "enabled" && showOpenAi ? [{ to: "/prompts", label: i18n.t("mainDrawer.listItems.prompts"), icon: <AllInclusive /> }] : []),
    ...(user.showIntegrations === "enabled" && showIntegrations && user.profile === "admin" ? [{ to: "/queue-integration", label: i18n.t("mainDrawer.listItems.queueIntegration"), icon: <DeviceHubOutlined /> }] : []),
  ];

  const adminItems = [
    ...(user.super ? [{ to: "/announcements", label: i18n.t("mainDrawer.listItems.annoucements"), icon: <AnnouncementIcon /> }] : []),
    ...(showExternalApi && user.profile === "admin" ? [{ to: "/messages-api", label: i18n.t("mainDrawer.listItems.messagesAPI"), icon: <CodeRoundedIcon /> }] : []),
    ...(user.profile === "admin" ? [
      { to: "/users", label: i18n.t("mainDrawer.listItems.users"), icon: <PeopleAltOutlinedIcon /> },
      { to: "/birthday-settings", label: i18n.t("mainDrawer.listItems.birthdaySettings"), icon: <CakeIcon /> },
      { to: "/queues", label: i18n.t("mainDrawer.listItems.queues"), icon: <AccountTreeOutlinedIcon /> },
      { to: "/files", label: i18n.t("mainDrawer.listItems.files"), icon: <AttachFile /> },
    ] : []),
    ...((user.allowConnections === "enabled" || user.super) ? [{ to: "/connections", label: i18n.t("mainDrawer.listItems.connections"), icon: <SyncAltIcon /> }] : []),
    ...((user.allowConnections === "enabled" || user.super) ? [{ to: "/group-manager", label: i18n.t("mainDrawer.listItems.groupManager"), icon: <GroupsIcon /> }] : []),
    ...(user.super ? [{ to: "/allConnections", label: i18n.t("mainDrawer.listItems.allConnections"), icon: <PhonelinkSetup /> }] : []),
    ...((user.profile === "admin" && !user.super) ? [{ to: "/financeiro", label: i18n.t("mainDrawer.listItems.financeiro"), icon: <LocalAtmIcon /> }] : []),
    ...(user.super ? [{ to: "/admin-financeiro", label: i18n.t("mainDrawer.listItems.adminFinanceiro"), icon: <LocalAtmIcon /> }] : []),
    ...(user.super ? [{ to: "/companies", label: i18n.t("mainDrawer.listItems.companies"), icon: <BusinessIcon /> }] : []),

    // Google Agenda, Saude dos Numeros e Webhook Unificado Meta ficam
    // acessiveis por Atendimentos > Templates Meta. As rotas seguem
    // registradas no router; so sairam da navegacao para nao repetir a mesma
    // tela em dois caminhos.
    { to: "/account-switch", label: i18n.t("mainDrawer.appBar.user.switchAccount"), icon: <SwapHoriz /> },
    ...(user.super ? [{ to: "/stack-status", label: "Status Stack", icon: <DeviceHubOutlined /> }] : []),
  ];

  const configItems = [
    ...(user.profile === "admin" ? [
      { to: "/settings", label: i18n.t("mainDrawer.listItems.settings"), icon: <SettingsOutlinedIcon /> },
    ] : []),
  ];

  const dashboardItems = [];
  if (user.showDashboard === "enabled" && showDashboard) {
    dashboardItems.push({ to: "/", label: "Dashboard", icon: <DashboardOutlinedIcon /> });
    // Os cinco relatorios viraram abas dentro de /reports. Eram cinco
    // entradas soltas aqui, empurrando o resto do menu para baixo e obrigando
    // a voltar ao menu a cada troca de relatorio.
    dashboardItems.push({ to: "/reports", label: i18n.t("mainDrawer.listItems.reports"), icon: <Description /> });
  }
  if (user.allowRealTime === "enabled" && showRealTime) {
    dashboardItems.push({ to: "/moments", label: i18n.t("mainDrawer.listItems.chatsTempoReal"), icon: <GridOn /> });
  }

  if (user.profile === "admin" && showWallets) {
    dashboardItems.push({ to: "/wallets", label: i18n.t("mainDrawer.listItems.wallets"), icon: <AccountBalanceWalletIcon /> });
  }

  return (
    <div className={classes.root}>
      <AppBar position="fixed" className={classes.appBar} color="primary">
        <Toolbar variant="dense" className={classes.toolbar}>
          {isMobile ? (
            /* ===== MOBILE TOOLBAR ===== */
            <div className={classes.mobileToolbar}>
              <div className={classes.mobileLogoSection}>
                {!hideMenu && (
                  <IconButton
                    edge="start"
                    style={{ color: theme.palette.type === "dark" ? "#e5e7eb" : "#374151", padding: 8, marginRight: 4 }}
                    onClick={() => setMobileOpen(true)}
                  >
                    <MenuIcon style={{ fontSize: 22 }} />
                  </IconButton>
                )}
                <img
                  className={classes.logo}
                  src={theme.mode === "dark" ? theme.calculatedLogoDark() : theme.calculatedLogoLight()}
                  alt="logo"
                  onClick={() => history.push("/")}
                  style={{ height: 28, maxWidth: 110 }}
                />
              </div>

              {!hideMenu && (
                <div className={classes.mobileActionsSection}>
                  {/* Chat Interno oculto no mobile */}

                  {user.id && <NotificationsPopOver volume={volume} />}

                  {/* Language indicator (read-only) */}
                  <div style={{ display: "inline-flex", alignItems: "center", padding: 4 }}>
                    <img
                      src={currentLanguageOption.flag}
                      alt={currentLanguageOption.label}
                      style={{ width: 16, height: 16, objectFit: "cover", borderRadius: "50%", boxShadow: "0 0 0 1px rgba(0,0,0,0.08)" }}
                    />
                  </div>

                  {/* Dark mode */}
                  <IconButton onClick={colorMode.toggleColorMode} size="small" style={{ padding: 4 }}>
                    {theme.mode === "dark" ? (
                      <span style={{ fontSize: 16, lineHeight: 1 }}>🌙</span>
                    ) : (
                      <span style={{ fontSize: 16, lineHeight: 1 }}>☀️</span>
                    )}
                  </IconButton>

                  {/* User avatar */}
                  <StyledBadge
                    overlap="circular"
                    anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
                    variant="dot"
                    onClick={handleMenu}
                    style={{ cursor: "pointer" }}
                  >
                    <Avatar alt="User" style={{ width: 28, height: 28, cursor: "pointer", borderRadius: "50%", border: "2px solid rgba(255,255,255,0.3)" }} src={profileUrl} />
                  </StyledBadge>
                </div>
              )}
            </div>
          ) : (
            /* ===== DESKTOP TOOLBAR ===== */
            <>
              {/* Logo */}
              <img
                className={classes.logo}
                src={theme.mode === "dark" ? theme.calculatedLogoDark() : theme.calculatedLogoLight()}
                alt="logo"
                onClick={() => history.push("/")}
              />

              {/* Desktop horizontal navigation */}
              {!hideMenu && (
                <div className={classes.navSection}>
                  {/* Dashboard */}
                  {dashboardItems.length > 0 && (
                    dashboardItems.length === 1 ? (
                      <NavLink
                        label={dashboardItems[0].label}
                        icon={dashboardItems[0].icon}
                        to={dashboardItems[0].to}
                        classes={classes}
                      />
                    ) : (
                      <NavDropdown
                        label="Dashboard"
                        icon={<Dashboard />}
                        items={dashboardItems}
                        classes={classes}
                      />
                    )
                  )}

                  {/* Atendimentos */}
                  <NavDropdown
                    label={i18n.t("mainDrawer.listItems.tickets")}
                    icon={<WhatsAppIcon />}
                    items={atendimentosItems}
                    classes={classes}
                    badgeCount={unreadTicketsCount}
                  />

                  {/* Automações / Bots */}
                  {automationItems.length > 0 && (
                    <NavDropdown
                      label={i18n.t("mainDrawer.listItems.automations") || "Bots"}
                      icon={<Webhook />}
                      items={automationItems}
                      classes={classes}
                    />
                  )}

                  {/* Admin */}
                  {adminItems.length > 0 && (user.profile === "admin" || user.allowConnections === "enabled" || user.super) && (
                    <NavDropdown
                      label="Admin"
                      icon={<PeopleAltOutlinedIcon />}
                      items={adminItems}
                      classes={classes}
                    />
                  )}

                  {/* Configurações */}
                  {configItems.length > 0 && (
                    <NavDropdown
                      label={i18n.t("mainDrawer.listItems.settings")}
                      icon={<SettingsOutlinedIcon />}
                      items={configItems}
                      classes={classes}
                    />
                  )}
                </div>
              )}

              {/* Right side actions */}
              {!hideMenu && (
                <div className={classes.rightSection}>
                  {user.showInternalChat === "enabled" && showInternalChat && <ChatPopover />}
                  {(() => {
                    try {
                      // eslint-disable-next-line global-require
                      const { useWaCalls } = require("../context/WaCalls/WaCallsContext");
                      const wc = useWaCalls();
                      if (!wc?.enabled) return null;
                      return (
                        <IconButton size="small" style={{ padding: 6 }} onClick={wc.openDialer} title="Discador WhatsApp Plus - Voz + Msg">
                          <span style={{ display: "inline-flex", position: "relative" }}>
                            {/* Ícone inline (sem import de arquivo .svg separado, pra não
                                depender do asset-loader do webpack — build falhou logo
                                depois de trocar pra um import de arquivo, então trocamos
                                pra JSX puro, que não passa por loader nenhum). */}
                            <svg width="20" height="20" viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg">
                              <rect x="7" y="7" width="86" height="86" rx="26" stroke="#7CB342" strokeWidth="7" />
                              <path d="M58 22c7 1.2 12.8 7 14 14" stroke="#7CB342" strokeWidth="5.5" strokeLinecap="round" />
                              <path d="M58 32c3.6 0.9 6.5 3.8 7.4 7.4" stroke="#7CB342" strokeWidth="5.5" strokeLinecap="round" />
                              <path d="M31 33.5c4-4 7.5-4.6 10.6-1.9l5.4 4.7c2.4 2.1 2.3 5-0.4 8.3l-2.3 2.8c1.9 4.5 4.8 8.5 8.5 11.7 3.7 3.2 8 5.3 12.7 6.4l2.4-2.9c2.6-3.2 5.5-3.6 8.3-1.2l5.9 4.2c3.4 2.7 3.2 6.2-0.7 10.2-6.6 6.7-16.2 5.6-25.7-2.6C46.2 65 40.5 57.9 38 49.6 34.9 40.2 34.9 40.2 31 33.5z" fill="#7CB342" />
                            </svg>
                            {wc.missedCount > 0 && (
                              <span style={{ position: "absolute", top: -6, right: -8, background: "#ef4444", color: "#fff", borderRadius: 8, fontSize: 10, padding: "0 4px" }}>
                                {wc.missedCount}
                              </span>
                            )}
                          </span>
                        </IconButton>
                      );
                    } catch { return null; }
                  })()}

                  {/* Botão de telefone WaVoIP ao lado do Chat Interno */}
                  {wavoipToken && (
                    <IconButton
                      size="small"
                      style={{ padding: 6, borderRadius: 8 }}
                      onClick={() => {
                        if (window.__wavoipToggle) {
                          window.__wavoipToggle();
                        }
                      }}
                    >
                      <span role="img" aria-label="phone" style={{ fontSize: 18, lineHeight: 1 }}>📞</span>
                    </IconButton>
                  )}

                  {/* SDK WaVoIP invisível - apenas inicializa */}
                  {wavoipToken && (
                    <WavoipWebphoneWidget
                      token={wavoipToken}
                      position="top-right"
                      name={user?.company?.name || "waVoip"}
                      theme={theme.palette.type === "dark" ? "dark" : "light"}
                      whatsappId={wavoipWhatsappId}
                      companyId={user?.companyId}
                    />
                  )}

                  <VersionControl
                    onUpdateStart={handleUpdateStart}
                    onUpdateComplete={handleUpdateComplete}
                  />

                  {/* Language indicator (read-only) */}
                  <div style={{ display: "inline-flex", alignItems: "center", gap: 4, padding: 4 }}>
                    <img
                      src={currentLanguageOption.flag}
                      alt={currentLanguageOption.label}
                      style={{ width: 18, height: 18, objectFit: "cover", borderRadius: "50%", boxShadow: "0 0 0 1px rgba(0,0,0,0.08)" }}
                    />
                    <span style={{ fontSize: 12, fontWeight: 600, color: theme.palette.type === "dark" ? "#d1d5db" : "#6b7280" }}>
                      {currentLanguageOption.code === "pt-BR" ? "BR" : currentLanguageOption.code.toUpperCase()}
                    </span>
                  </div>

                  {/* Dark mode toggle */}
                  <IconButton onClick={colorMode.toggleColorMode} size="small" style={{ padding: 4 }}>
                    {theme.mode === "dark" ? (
                      <span style={{ fontSize: 18, lineHeight: 1 }}>🌙</span>
                    ) : (
                      <span style={{ fontSize: 18, lineHeight: 1 }}>☀️</span>
                    )}
                  </IconButton>

                  {/* Os botões separados de ramal e de API Oficial saíram
                      daqui: agora tudo é discado pelo discador único, que só
                      mostra os canais realmente configurados. Os painéis
                      continuam montados mais abaixo, porque são eles que
                      recebem as chamadas e conduzem o WebRTC. */}

                  {user.id && <NotificationsPopOver volume={volume} />}

                  <AnnouncementsPopover />

                  {/* User avatar */}
                  <StyledBadge
                    overlap="circular"
                    anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
                    variant="dot"
                    onClick={handleMenu}
                    style={{ cursor: "pointer" }}
                  >
                    <Avatar alt="User" className={classes.avatar2} src={profileUrl} />
                  </StyledBadge>

                </div>
              )}
            </>
          )}
        </Toolbar>
      </AppBar>

      {/* Ramais internos: fica montado sempre para poder receber ligações */}
      {user.id && (
        <RamaisPanel open={ramaisOpen} onClose={() => setRamaisOpen(false)} />
      )}

      {/* Ligações da API Oficial: montado sempre, pra receber chamada */}
      {user.id && (
        <OfficialCallPanel
          open={ligacaoOficialOpen}
          onClose={() => setLigacaoOficialOpen(false)}
        />
      )}

      {/* UserModal & Menu shared for both mobile/desktop */}
      <UserModal
        open={userModalOpen}
        onClose={() => setUserModalOpen(false)}
        onImageUpdate={(newProfileUrl) => setProfileUrl(newProfileUrl)}
        userId={user?.id}
      />
      <Menu
        id="menu-appbar"
        anchorEl={anchorEl}
        getContentAnchorEl={null}
        anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
        transformOrigin={{ vertical: "top", horizontal: "right" }}
        open={menuOpen}
        onClose={handleCloseMenu}
        PaperProps={{ style: { minWidth: "150px" } }}
      >
        <MenuItem onClick={handleOpenUserModal}>
          {i18n.t("mainDrawer.appBar.user.profile")}
        </MenuItem>
        <MenuItem onClick={() => { handleCloseMenu(); history.push("/account-switch"); }}>
          <SwapHoriz style={{ fontSize: 18, marginRight: 8 }} />
          {i18n.t("mainDrawer.appBar.user.switchAccount")}
        </MenuItem>
        <MenuItem onClick={handleClickLogout}>
          {i18n.t("mainDrawer.appBar.user.logout")}
        </MenuItem>
      </Menu>

      {/* Mobile drawer */}
      {isMobile && (
        <Drawer
          variant="temporary"
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          classes={{ paper: classes.mobileDrawer }}
          ModalProps={{ keepMounted: true }}
        >
          {/* Drawer header with logo */}
          <div className={classes.mobileDrawerHeader}>
            <img
              src={theme.mode === "dark" ? theme.calculatedLogoDark() : theme.calculatedLogoLight()}
              alt="logo"
              style={{ height: 32, objectFit: "contain", mixBlendMode: theme.mode === "dark" ? "screen" : "normal" }}
            />
            <IconButton size="small" onClick={() => setMobileOpen(false)} style={{ color: theme.palette.type === "dark" ? "#9ca3af" : "#6b7280" }}>
              <MenuIcon style={{ fontSize: 20 }} />
            </IconButton>
          </div>

          {/* User info section */}
          <div className={classes.mobileDrawerUserSection}>
            <StyledBadge
              overlap="circular"
              anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
              variant="dot"
            >
              <Avatar 
                alt="User" 
                src={profileUrl} 
                style={{ width: 40, height: 40, border: "2px solid rgba(255,255,255,0.3)" }} 
              />
            </StyledBadge>
            <div style={{ minWidth: 0, flex: 1 }}>
              <Typography variant="body2" style={{ fontWeight: 600, fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {user?.name || "Usuário"}
              </Typography>
              <Typography variant="caption" style={{ color: theme.palette.type === "dark" ? "#9ca3af" : "#6b7280", fontSize: 11 }}>
                {user?.profile === "admin" ? "Administrador" : "Atendente"}
              </Typography>
            </div>
          </div>

          {/* Navigation items */}
          <div style={{ flex: 1, overflowY: "auto", paddingTop: 8 }}>
            <MainListItems collapsed={false} drawerClose={() => setMobileOpen(false)} />
          </div>

          {/* Drawer footer */}
          <Divider />
          <div style={{ padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <Button
              size="small"
              onClick={() => { setMobileOpen(false); handleOpenUserModal(); }}
              style={{ fontSize: 12, textTransform: "none", color: theme.palette.type === "dark" ? "#9ca3af" : "#6b7280" }}
            >
              {i18n.t("mainDrawer.appBar.user.profile")}
            </Button>
            <Button
              size="small"
              onClick={handleClickLogout}
              style={{ fontSize: 12, textTransform: "none", color: "#ef4444" }}
            >
              {i18n.t("mainDrawer.appBar.user.logout")}
            </Button>
          </div>
        </Drawer>
      )}

      <main className={classes.content}>
        <div className={classes.appBarSpacer} />
        {(() => {
          if (!user?.company?.dueDate || user?.company?.id === 1 || user?.super || isMobile) return null;
          const moment_ = require("moment");
          const days = moment_(user.company.dueDate).startOf("day").diff(moment_().startOf("day"), "days");
          if (days > 5 || days < 0) return null;
          const isUrgent = days <= 1;
          const bgColor = isUrgent ? "#DC2626" : days <= 3 ? "#F59E0B" : "#3B82F6";
          const textColor = isUrgent || days <= 3 ? "#fff" : "#fff";
          const label = days === 0
            ? i18n.t("mainDrawer.planExpiresToday", "⚠️ Seu plano vence hoje! Renove agora para não perder o acesso.")
            : days === 1
            ? i18n.t("mainDrawer.planExpiresTomorrow", "⚠️ Seu plano vence amanhã! Renove para não perder o acesso.")
            : i18n.t("mainDrawer.planExpiresIn", { count: days, defaultValue: `⏳ Seu plano vence em ${days} dias. Renove para continuar usando o sistema.` });
          return (
            <div style={{
              background: bgColor,
              color: textColor,
              padding: "8px 16px",
              fontSize: 13,
              fontWeight: 600,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 12,
              zIndex: 1,
            }}>
              <span>{label}</span>
              <button
                onClick={() => history.push("/financeiro")}
                style={{
                  background: "rgba(255,255,255,0.2)",
                  border: "1px solid rgba(255,255,255,0.4)",
                  color: "#fff",
                  borderRadius: 6,
                  padding: "4px 14px",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {i18n.t("mainDrawer.renewNow", "Renovar agora")}
              </button>
            </div>
          );
        })()}
        {children ? children : null}
      </main>

      {/* Announcements Modal */}
      <Dialog open={showAnnouncementsModal} onClose={() => setShowAnnouncementsModal(false)} maxWidth="md" fullWidth>
        <DialogTitle>{i18n.t("announcementsPopover.title")}</DialogTitle>
        <DialogContent dividers>
          {selectedAnnouncement ? (
            <div>
              <Typography variant="h6" gutterBottom>{selectedAnnouncement.title}</Typography>
              <Typography variant="body1" style={{ whiteSpace: 'pre-line' }}>{selectedAnnouncement.text}</Typography>
              {selectedAnnouncement.mediaPath && (
                <div style={{ marginTop: 16 }}>
                  <img src={selectedAnnouncement.mediaPath} alt="Anexo" style={{ maxWidth: '100%' }} />
                </div>
              )}
              <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 16 }}>
                <Button onClick={() => handleDismissAnnouncement(selectedAnnouncement)} color="default" size="small" style={{ fontSize: 12, textTransform: "none", color: "#888" }}>
                  {i18n.t("announcementsPopover.dontShowAgain")}
                </Button>
                <Button onClick={() => setSelectedAnnouncement(null)} variant="outlined">{i18n.t("announcementsPopover.backToList")}</Button>
              </div>
            </div>
          ) : (
            <List>
              {announcements.map(announcement => (
                <ListItem button key={announcement.id} style={{ display: 'flex', alignItems: 'center' }}>
                  <div style={{ flex: 1, display: 'flex', alignItems: 'center' }} onClick={() => setSelectedAnnouncement(announcement)}>
                    <ListItemAvatar><Avatar><NotificationsIcon /></Avatar></ListItemAvatar>
                    <ListItemText
                      primary={announcement.title}
                      secondary={
                        <>
                          <Typography component="span" variant="body2" color="textPrimary">
                            {i18n.t("announcementsPopover.priorityLabel")}: {announcement.priority === 1 ? i18n.t("announcementsPopover.priority.high") : announcement.priority === 2 ? i18n.t("announcementsPopover.priority.medium") : i18n.t("announcementsPopover.priority.low")}
                          </Typography>
                          {` — ${new Date(announcement.createdAt).toLocaleDateString()}`}
                        </>
                      }
                    />
                  </div>
                  <Button
                    onClick={(e) => { e.stopPropagation(); handleDismissAnnouncement(announcement); }}
                    size="small"
                    style={{ fontSize: 11, textTransform: "none", color: "#999", minWidth: "auto", whiteSpace: "nowrap", marginLeft: 8 }}
                  >
                    {i18n.t("announcementsPopover.dismiss")}
                  </Button>
                </ListItem>
              ))}
            </List>
          )}
        </DialogContent>
        <DialogActions style={{ justifyContent: "space-between", padding: "8px 16px" }}>
          {!selectedAnnouncement && announcements.length > 1 && (
            <Button
              onClick={() => {
                announcements.forEach(ann => {
                  const updatedAtKey = ann.updatedAt || ann.createdAt;
                  setDismissedAnnouncements(prev => {
                    const updated = { ...prev, [ann.id]: updatedAtKey };
                    try { localStorage.setItem("announcementsDismissed", JSON.stringify(updated)); } catch {}
                    return updated;
                  });
                });
                setAnnouncements([]);
                setShowAnnouncementsModal(false);
              }}
              color="default"
              size="small"
              style={{ fontSize: 12, textTransform: "none", color: "#888" }}
            >
              {i18n.t("announcementsPopover.dismissAll")}
            </Button>
          )}
          {!selectedAnnouncement && announcements.length <= 1 && <span />}
          <Button onClick={() => setShowAnnouncementsModal(false)} color="primary">{i18n.t("announcementsPopover.close")}</Button>
        </DialogActions>
      </Dialog>

      <BirthdayModal open={showBirthdayModal} onClose={() => setShowBirthdayModal(false)} user={user} />

      <InstallAppPrompt />

      {/* Saudação pós-login. Fica no layout, e não na tela de login, porque
          o login desmonta ao redirecionar para /tickets. */}
      <WelcomeGreeting />
    </div>
  );
};

export default LoggedInLayout;
