import React, { useState, useEffect, useContext, useRef } from "react";
import { useHistory } from "react-router-dom";
import { makeStyles } from "@material-ui/core/styles";
import {
  Button,
  CircularProgress,
  TextField,
  Typography,
  Box,
  Select,
  MenuItem,
  FormControl,
  InputLabel,
  Collapse,
  IconButton,
  Chip,
  Tooltip,
  Switch,
  FormControlLabel,
  Tabs,
  Tab,
} from "@material-ui/core";
import ExpandMore from "@material-ui/icons/ExpandMore";
import ExpandLess from "@material-ui/icons/ExpandLess";
import PlayArrow from "@material-ui/icons/PlayArrow";
import Code from "@material-ui/icons/Code";
import Send from "@material-ui/icons/Send";
import ContactPhone from "@material-ui/icons/ContactPhone";
import Chat from "@material-ui/icons/Chat";
import Settings from "@material-ui/icons/Settings";
import FileCopy from "@material-ui/icons/FileCopy";
import Group from "@material-ui/icons/Group";
import Image from "@material-ui/icons/Image";
import List from "@material-ui/icons/List";
import BugReport from "@material-ui/icons/BugReport";
import History from "@material-ui/icons/History";
import DeleteIcon from "@material-ui/icons/Delete";
import DeleteSweep from "@material-ui/icons/DeleteSweep";
import toastError from "../../errors/toastError";
import { toast } from "react-toastify";
import axios from "axios";
import usePlans from "../../hooks/usePlans";
import { AuthContext } from "../../context/Auth/AuthContext";
import { i18n } from "../../translate/i18n";

const useStyles = makeStyles((theme) => ({
  root: {
    display: "flex",
    height: "calc(100vh - 65px)",
    overflow: "hidden",
  },
  sidebar: {
    width: 260,
    minWidth: 260,
    borderRight: "1px solid #e0e0e0",
    backgroundColor: "#fafafa",
    overflowY: "auto",
    padding: theme.spacing(2, 0),
  },
  sidebarHeader: {
    padding: theme.spacing(0, 2, 2, 2),
    borderBottom: "1px solid #e0e0e0",
    marginBottom: theme.spacing(1),
  },
  sidebarTitle: {
    fontWeight: 700,
    fontSize: 18,
    display: "flex",
    alignItems: "center",
    gap: 8,
    color: theme.palette.primary.main,
  },
  sidebarSubtitle: {
    fontSize: 12,
    color: "#888",
    marginTop: 4,
  },
  searchField: {
    margin: theme.spacing(1.5, 2, 0.5, 2),
  },
  sidebarCategory: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: theme.spacing(1, 2),
    cursor: "pointer",
    userSelect: "none",
    "&:hover": { backgroundColor: "#f0f0f0" },
  },
  categoryLabel: {
    fontWeight: 700,
    fontSize: 11,
    textTransform: "uppercase",
    letterSpacing: 1,
    color: theme.palette.primary.main,
    display: "flex",
    alignItems: "center",
    gap: 6,
  },
  sidebarItem: {
    padding: theme.spacing(0.8, 2, 0.8, 3),
    cursor: "pointer",
    fontSize: 13,
    color: "#555",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    "&:hover": { backgroundColor: "#e8e8e8", color: "#333" },
    transition: "all 0.15s",
  },
  sidebarItemActive: {
    backgroundColor: theme.palette.primary.main + "15",
    color: theme.palette.primary.main,
    fontWeight: 600,
    borderLeft: `3px solid ${theme.palette.primary.main}`,
    paddingLeft: theme.spacing(3) - 3,
  },
  mainContent: {
    flex: 1,
    overflowY: "auto",
    padding: theme.spacing(3, 4),
    backgroundColor: "#fff",
  },
  playgroundHeader: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    marginBottom: theme.spacing(1),
  },
  playgroundIcon: {
    color: theme.palette.primary.main,
    fontSize: 28,
  },
  playgroundTitle: {
    fontWeight: 700,
    fontSize: 22,
  },
  playgroundDesc: {
    color: "#666",
    marginBottom: theme.spacing(2),
    fontSize: 14,
  },
  configRow: {
    display: "flex",
    gap: theme.spacing(1.5),
    marginBottom: theme.spacing(1.5),
    alignItems: "center",
    flexWrap: "wrap",
  },
  urlField: {
    flex: 1,
    minWidth: 250,
  },
  tokenField: {
    width: 220,
  },
  methodSelect: {
    width: 110,
  },
  pathField: {
    flex: 1,
    minWidth: 200,
  },
  sendButton: {
    height: 40,
    minWidth: 120,
    fontWeight: 700,
    textTransform: "none",
    borderRadius: 8,
  },
  endpointSelect: {
    flex: 1,
  },
  bodyEditor: {
    fontFamily: "'Fira Code', 'Consolas', monospace",
    fontSize: 13,
    backgroundColor: "#1e1e2e",
    color: "#cdd6f4",
    borderRadius: 8,
    padding: theme.spacing(2),
    minHeight: 200,
    resize: "vertical",
    width: "100%",
    border: "none",
    outline: "none",
    whiteSpace: "pre",
    overflowX: "auto",
  },
  responseArea: {
    fontFamily: "'Fira Code', 'Consolas', monospace",
    fontSize: 12,
    backgroundColor: "#1e1e2e",
    color: "#a6e3a1",
    borderRadius: 8,
    padding: theme.spacing(2),
    minHeight: 120,
    maxHeight: 300,
    overflowY: "auto",
    whiteSpace: "pre-wrap",
    wordBreak: "break-all",
  },
  responseError: {
    color: "#f38ba8",
  },
  tabPanel: {
    marginTop: theme.spacing(1.5),
  },
  docSection: {
    marginBottom: theme.spacing(4),
    scrollMarginTop: 20,
  },
  docTitle: {
    fontWeight: 700,
    fontSize: 18,
    marginBottom: theme.spacing(1),
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  codeBlock: {
    backgroundColor: "#1e1e2e",
    color: "#cdd6f4",
    borderRadius: 8,
    padding: theme.spacing(2),
    fontFamily: "'Fira Code', 'Consolas', monospace",
    fontSize: 12,
    whiteSpace: "pre-wrap",
    wordBreak: "break-all",
    marginTop: theme.spacing(1),
    marginBottom: theme.spacing(1),
    position: "relative",
  },
  copyBtn: {
    position: "absolute",
    top: 4,
    right: 4,
    color: "#888",
    "&:hover": { color: "#fff" },
  },
  endpointBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 10px",
    borderRadius: 6,
    fontWeight: 700,
    fontSize: 12,
    fontFamily: "monospace",
  },
  methodPost: {
    backgroundColor: "#89b4fa22",
    color: "#89b4fa",
    border: "1px solid #89b4fa44",
  },
  methodGet: {
    backgroundColor: "#a6e3a122",
    color: "#a6e3a1",
    border: "1px solid #a6e3a144",
  },
  paramTable: {
    width: "100%",
    borderCollapse: "collapse",
    marginTop: theme.spacing(1),
    "& th": {
      textAlign: "left",
      padding: "8px 12px",
      backgroundColor: "#f5f5f5",
      fontWeight: 600,
      fontSize: 12,
      borderBottom: "2px solid #ddd",
    },
    "& td": {
      padding: "6px 12px",
      borderBottom: "1px solid #eee",
      fontSize: 13,
    },
  },
  badge: {
    fontSize: 10,
    fontWeight: 700,
    padding: "2px 6px",
    borderRadius: 4,
    marginLeft: 6,
  },
  badgeNew: {
    backgroundColor: "#a6e3a1",
    color: "#1e1e2e",
  },
  badgeRequired: {
    backgroundColor: "#f38ba8",
    color: "#fff",
  },
  badgeOptional: {
    backgroundColor: "#cdd6f4",
    color: "#1e1e2e",
  },
  groupSwitch: {
    marginLeft: theme.spacing(1),
  },
  fileUpload: {
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(1),
    marginTop: theme.spacing(1),
  },
  historyItem: {
    padding: theme.spacing(0.8, 2, 0.8, 3),
    cursor: "pointer",
    fontSize: 12,
    color: "#555",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 4,
    "&:hover": { backgroundColor: "#e8e8e8", color: "#333" },
    transition: "all 0.15s",
    borderBottom: "1px solid #f0f0f0",
  },
  historyMethod: {
    fontWeight: 700,
    fontSize: 10,
    fontFamily: "monospace",
    padding: "1px 4px",
    borderRadius: 3,
    marginRight: 4,
  },
  historyPath: {
    flex: 1,
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
    fontSize: 11,
    fontFamily: "monospace",
  },
  historyTime: {
    fontSize: 10,
    color: "#aaa",
    whiteSpace: "nowrap",
  },
  historyStatus: {
    fontSize: 10,
    fontWeight: 700,
    padding: "1px 5px",
    borderRadius: 3,
  },
  historyActions: {
    display: "flex",
    alignItems: "center",
    gap: 2,
  },
  historyHeader: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: theme.spacing(0.5, 2, 0.5, 3),
  },
}));

// ===========================
// Endpoint definitions
// ===========================
const ENDPOINTS = [
  {
    id: "send-text",
    label: i18n.t("messagesAPIPage.sendTextMedia"),
    method: "POST",
    path: "/send",
    category: "messages",
    badge: null,
    supportsGroup: true,
    supportsMedia: true,
    body: {
      number: "5585999999999",
      body: i18n.t("messagesAPIPage.yourMessageHere"),
      userId: "",
      queueId: "",
      isGroup: false,
      sendSignature: false,
      closeTicket: false,
    },
  },
  {
    id: "send-image-url",
    label: i18n.t("messagesAPIPage.sendImageUrl"),
    method: "POST",
    path: "/send/linkImage",
    category: "messages",
    badge: i18n.t("messagesAPIPage.badges.new"),
    supportsGroup: true,
    body: {
      number: "5585999999999",
      url: "https://exemplo.com/imagem.jpg",
      caption: i18n.t("messagesAPIPage.imageCaption"),
      isGroup: false,
    },
  },
  {
    id: "send-no-ticket",
    label: i18n.t("messagesAPIPage.sendNoTicket"),
    method: "POST",
    path: "/send/noTicket",
    category: "messages",
    badge: i18n.t("messagesAPIPage.badges.new"),
    supportsGroup: true,
    body: {
      number: "5585999999999",
      body: i18n.t("messagesAPIPage.messageNoTicket"),
      isGroup: false,
    },
  },
  {
    id: "send-bulk",
    label: i18n.t("messagesAPIPage.batchSend"),
    method: "POST",
    path: "/send/bulk",
    category: "messages",
    badge: i18n.t("messagesAPIPage.badges.new"),
    supportsGroup: true,
    body: {
      delay: 2000,
      messages: [
        { number: "5585999999999", body: "Olá João!", isGroup: false },
        { number: "5585888888888", body: "Olá Maria!", isGroup: false },
      ],
    },
  },
  {
    id: "send-buttons",
    label: i18n.t("messagesAPIPage.interactiveMessages"),
    method: "POST",
    path: "/send/buttons",
    category: "messages",
    badge: i18n.t("messagesAPIPage.badges.new"),
    supportsGroup: true,
    body: {
      number: "5585999999999",
      body: i18n.t("messagesAPIPage.chooseOption"),
      footer: i18n.t("messagesAPIPage.optionalFooter"),
      type: "buttons",
      isGroup: false,
      buttons: [
        { text: i18n.t("messagesAPIPage.sales"), id: "1", queueId: 5, userId: 12 },
        { text: i18n.t("messagesAPIPage.support"), id: "2", queueId: 3 },
        { text: i18n.t("messagesAPIPage.financial"), id: "3" },
      ],
    },
  },
  {
    id: "check-number",
    label: i18n.t("messagesAPIPage.endpoints.checkNumber"),
    method: "POST",
    path: "/checkNumber",
    category: "messages",
    badge: i18n.t("messagesAPIPage.badges.new"),
    body: {
      number: "5585999999999",
    },
  },
  {
    id: "list-connections",
    label: i18n.t("messagesAPIPage.endpoints.listConnections"),
    method: "GET",
    path: "/connections",
    category: "messages",
    badge: i18n.t("messagesAPIPage.badges.new"),
    body: null,
  },
  {
    id: "contacts-list",
    label: i18n.t("messagesAPIPage.endpoints.listContacts"),
    method: "GET",
    path: "/contacts",
    category: "contacts",
    body: null,
  },
  {
    id: "contacts-show",
    label: i18n.t("messagesAPIPage.endpoints.showContact"),
    method: "GET",
    path: "/contacts/{contactId}",
    category: "contacts",
    body: null,
  },
  {
    id: "contacts-create",
    label: i18n.t("messagesAPIPage.endpoints.createContact"),
    method: "POST",
    path: "/contacts",
    category: "contacts",
    badge: i18n.t("messagesAPIPage.badges.new"),
    body: {
      name: "João Silva",
      number: "5585999999999",
      email: "joao@email.com",
    },
  },
  {
    id: "contacts-update",
    label: i18n.t("messagesAPIPage.endpoints.updateContact"),
    method: "PUT",
    path: "/contacts/{contactId}",
    category: "contacts",
    badge: i18n.t("messagesAPIPage.badges.new"),
    body: {
      name: "João Silva Atualizado",
      number: "5585999999999",
      email: "joao.novo@email.com",
    },
  },
  {
    id: "contacts-delete",
    label: i18n.t("messagesAPIPage.endpoints.deleteContact"),
    method: "DELETE",
    path: "/contacts/{contactId}",
    category: "contacts",
    badge: i18n.t("messagesAPIPage.badges.new"),
    body: null,
  },
  {
    id: "tickets-list",
    label: i18n.t("messagesAPIPage.endpoints.listTickets"),
    method: "GET",
    path: "/tickets",
    category: "tickets",
    body: null,
  },
  {
    id: "tickets-show",
    label: i18n.t("messagesAPIPage.endpoints.showTicket"),
    method: "GET",
    path: "/tickets/{ticketId}",
    category: "tickets",
    body: null,
  },
  {
    id: "tickets-create",
    label: i18n.t("messagesAPIPage.endpoints.createTicket"),
    method: "POST",
    path: "/tickets",
    category: "tickets",
    badge: i18n.t("messagesAPIPage.badges.new"),
    body: {
      contactId: 1,
      status: "open",
      queueId: 1,
      userId: 1,
    },
  },
  {
    id: "tickets-update",
    label: i18n.t("messagesAPIPage.endpoints.updateTicket"),
    method: "PUT",
    path: "/tickets/{ticketId}",
    category: "tickets",
    badge: i18n.t("messagesAPIPage.badges.new"),
    body: {
      status: "closed",
      userId: 1,
      queueId: 2,
    },
  },
  {
    id: "tickets-delete",
    label: i18n.t("messagesAPIPage.endpoints.deleteTicket"),
    method: "DELETE",
    path: "/tickets/{ticketId}",
    category: "tickets",
    badge: i18n.t("messagesAPIPage.badges.new"),
    body: null,
  },
  {
    id: "tickets-close-all",
    label: i18n.t("messagesAPIPage.endpoints.closeAllTickets"),
    method: "POST",
    path: "/tickets/closeAll",
    category: "tickets",
    badge: i18n.t("messagesAPIPage.badges.new"),
    body: {
      status: "closed",
    },
  },
  {
    id: "messages-range",
    label: i18n.t("messagesAPIPage.endpoints.messagesRange"),
    method: "GET",
    path: "/messagesRange",
    category: "tickets",
    body: {
      companyId: 1,
      startDate: "2024-01-01",
      lastDate: "2024-12-31",
    },
  },
];

const CATEGORIES = [
  { id: "playground", label: i18n.t("messagesAPIPage.sidebar.playground"), icon: <BugReport fontSize="small" /> },
  { id: "history", label: i18n.t("messagesAPIPage.sidebar.history"), icon: <History fontSize="small" /> },
  { id: "intro", label: i18n.t("messagesAPIPage.sidebar.intro"), icon: <Code fontSize="small" /> },
  { id: "messages", label: i18n.t("messagesAPIPage.sidebar.messages"), icon: <Send fontSize="small" /> },
  { id: "contacts", label: i18n.t("messagesAPIPage.sidebar.contacts"), icon: <ContactPhone fontSize="small" /> },
  { id: "tickets", label: i18n.t("messagesAPIPage.sidebar.tickets"), icon: <Chat fontSize="small" /> },
];

const INTRO_ITEMS = [
  { id: "auth", label: i18n.t("messagesAPIPage.introItems.auth") },
  { id: "rate-limit", label: i18n.t("messagesAPIPage.introItems.rateLimit") },
  { id: "error-codes", label: i18n.t("messagesAPIPage.introItems.errorCodes") },
];

const MessagesAPI = () => {
  const classes = useStyles();
  const history = useHistory();
  const { user } = useContext(AuthContext);
  const { getPlanCompany } = usePlans();
  const mainRef = useRef(null);

  // State
  const [apiUrl, setApiUrl] = useState(process.env.REACT_APP_BACKEND_URL + "/api/messages");
  const [token, setToken] = useState("");
  const [selectedEndpoint, setSelectedEndpoint] = useState(ENDPOINTS[0]);
  const [method, setMethod] = useState("POST");
  const [path, setPath] = useState("/send");
  const [bodyText, setBodyText] = useState(JSON.stringify(ENDPOINTS[0].body, null, 2));
  const [response, setResponse] = useState(null);
  const [responseError, setResponseError] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeSection, setActiveSection] = useState("playground");
  const [expandedCats, setExpandedCats] = useState({ playground: true, history: false, intro: true, messages: true, contacts: true, tickets: true });
  const [searchTerm, setSearchTerm] = useState("");
  const [file, setFile] = useState(null);
  const [playgroundTab, setPlaygroundTab] = useState(0);
  const [isGroup, setIsGroup] = useState(false);
  const [requestHistory, setRequestHistory] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("api_playground_history") || "[]");
    } catch { return []; }
  });

  useEffect(() => {
    async function fetchData() {
      const companyId = user.companyId;
      const planConfigs = await getPlanCompany(undefined, companyId);
      if (!planConfigs.plan.useExternalApi) {
        toast.error(i18n.t("hardcoded.noPermissionShort"));
        setTimeout(() => history.push(`/`), 1000);
      }
    }
    fetchData();
  }, []);

  const handleSelectEndpoint = (ep) => {
    setSelectedEndpoint(ep);
    setMethod(ep.method);
    setPath(ep.path);
    setBodyText(ep.body ? JSON.stringify(ep.body, null, 2) : "");
    setResponse(null);
    setResponseError(false);
    setFile(null);
    setActiveSection(ep.id);
  };

  const handleSend = async () => {
    if (!token) {
      toast.error(i18n.t("hardcoded.enterToken"));
      return;
    }
    setLoading(true);
    setResponse(null);
    setResponseError(false);

    try {
      const fullUrl = `${apiUrl}${path}`;
      let res;

      if (file && selectedEndpoint.supportsMedia) {
        const data = new FormData();
        let parsedBody = {};
        try { parsedBody = JSON.parse(bodyText); } catch { }
        Object.entries(parsedBody).forEach(([key, val]) => {
          data.append(key, typeof val === "object" ? JSON.stringify(val) : String(val));
        });
        data.append("medias", file);
        res = await axios({
          method: method.toLowerCase(),
          url: fullUrl,
          data,
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "multipart/form-data" },
        });
      } else if (method === "GET") {
        res = await axios.get(fullUrl, {
          headers: { Authorization: `Bearer ${token}` },
        });
      } else {
        let parsedBody = {};
        try { parsedBody = JSON.parse(bodyText); } catch { }
        res = await axios({
          method: method.toLowerCase(),
          url: fullUrl,
          data: parsedBody,
          headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        });
      }

      const resData = JSON.stringify(res.data, null, 2);
      setResponse(resData);
      addToHistory(method, path, bodyText, res.status, resData, false);
      toast.success(i18n.t("hardcoded.requestSuccess"));
    } catch (err) {
      const errData = err.response?.data || { error: err.message };
      const errStr = JSON.stringify(errData, null, 2);
      setResponse(errStr);
      setResponseError(true);
      addToHistory(method, path, bodyText, err.response?.status || 500, errStr, true);
      toastError(err);
    } finally {
      setLoading(false);
    }
  };

  const addToHistory = (m, p, body, status, resp, isError) => {
    const entry = {
      id: Date.now(),
      method: m,
      path: p,
      body: body,
      status,
      response: resp,
      isError,
      timestamp: new Date().toISOString(),
    };
    setRequestHistory((prev) => {
      const updated = [entry, ...prev].slice(0, 50);
      localStorage.setItem("api_playground_history", JSON.stringify(updated));
      return updated;
    });
  };

  const replayHistoryItem = (item) => {
    setMethod(item.method);
    setPath(item.path);
    setBodyText(item.body || "");
    setResponse(null);
    setResponseError(false);
    setActiveSection("playground");
    mainRef.current?.scrollTo(0, 0);
    toast.info(i18n.t("hardcoded.requestLoaded"));
  };

  const removeHistoryItem = (id) => {
    setRequestHistory((prev) => {
      const updated = prev.filter((h) => h.id !== id);
      localStorage.setItem("api_playground_history", JSON.stringify(updated));
      return updated;
    });
  };

  const clearHistory = () => {
    setRequestHistory([]);
    localStorage.removeItem("api_playground_history");
    toast.success(i18n.t("hardcoded.historyCleared"));
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    toast.success(i18n.t("hardcoded.copied"));
  };

  const toggleCat = (catId) => {
    setExpandedCats((prev) => ({ ...prev, [catId]: !prev[catId] }));
  };

  const filteredEndpoints = (catId) =>
    ENDPOINTS.filter((ep) => ep.category === catId && (!searchTerm || ep.label.toLowerCase().includes(searchTerm.toLowerCase())));

  const toggleGroupInBody = (checked) => {
    setIsGroup(checked);
    try {
      const parsed = JSON.parse(bodyText);
      if (typeof parsed === "object" && parsed !== null) {
        parsed.isGroup = checked;
        if (checked && parsed.number) {
          // Keep number, user will put group ID
        }
        setBodyText(JSON.stringify(parsed, null, 2));
      }
    } catch { }
  };

  // ===========================
  // RENDER
  // ===========================

  const totalEndpoints = ENDPOINTS.length;

  return (
    <div className={classes.root}>
      {/* SIDEBAR */}
      <div className={classes.sidebar}>
        <div className={classes.sidebarHeader}>
          <Typography className={classes.sidebarTitle}>
            <Code /> API Docs
          </Typography>
          <Typography className={classes.sidebarSubtitle}>
            {i18n.t("messagesAPIPage.sidebar.docSubtitle", { count: totalEndpoints })}
          </Typography>
        </div>

        <TextField
          className={classes.searchField}
          placeholder={i18n.t("messagesAPIPage.sidebar.searchEndpoint")}
          variant="outlined"
          size="small"
          fullWidth
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          style={{ width: "calc(100% - 32px)" }}
        />

        {CATEGORIES.map((cat) => (
          <div key={cat.id}>
            <div className={classes.sidebarCategory} onClick={() => toggleCat(cat.id)}>
              <span className={classes.categoryLabel}>
                {cat.icon} {cat.label}
              </span>
              {expandedCats[cat.id] ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
            </div>
            <Collapse in={expandedCats[cat.id]}>
              {cat.id === "playground" && (
                <div
                  className={`${classes.sidebarItem} ${activeSection === "playground" ? classes.sidebarItemActive : ""}`}
                  onClick={() => { setActiveSection("playground"); mainRef.current?.scrollTo(0, 0); }}
                >
                  {i18n.t("messagesAPIPage.sidebar.testEndpoint")}
                </div>
              )}
              {cat.id === "history" && (
                <>
                  {requestHistory.length > 0 && (
                    <div className={classes.historyHeader}>
                      <Typography variant="caption" style={{ color: "#888" }}>
                        {requestHistory.length} {i18n.t("messagesAPIPage.sidebar.requestCount")}
                      </Typography>
                      <Tooltip title={i18n.t("messagesAPIPage.sidebar.clearHistory")}>
                        <IconButton size="small" onClick={clearHistory} style={{ padding: 2 }}>
                          <DeleteSweep fontSize="small" style={{ fontSize: 14, color: "#ccc" }} />
                        </IconButton>
                      </Tooltip>
                    </div>
                  )}
                  {requestHistory.length === 0 && (
                    <Typography variant="caption" style={{ padding: "8px 24px", color: "#aaa", display: "block" }}>
                      {i18n.t("messagesAPIPage.sidebar.noRequests")}
                    </Typography>
                  )}
                  {requestHistory.slice(0, 15).map((item) => {
                    const methodColors = { GET: "#a6e3a1", POST: "#89b4fa", PUT: "#fab387", DELETE: "#f38ba8" };
                    const time = new Date(item.timestamp);
                    const timeStr = `${time.getHours().toString().padStart(2, "0")}:${time.getMinutes().toString().padStart(2, "0")}`;
                    return (
                      <div key={item.id} className={classes.historyItem} onClick={() => replayHistoryItem(item)}>
                        <span
                          className={classes.historyMethod}
                          style={{ color: methodColors[item.method] || "#cdd6f4", backgroundColor: (methodColors[item.method] || "#cdd6f4") + "18" }}
                        >
                          {item.method}
                        </span>
                        <span className={classes.historyPath}>{item.path}</span>
                        <span
                          className={classes.historyStatus}
                          style={{
                            color: item.isError ? "#f38ba8" : "#a6e3a1",
                            backgroundColor: item.isError ? "#f38ba818" : "#a6e3a118",
                          }}
                        >
                          {item.status}
                        </span>
                        <span className={classes.historyTime}>{timeStr}</span>
                        <Tooltip title={i18n.t("messagesAPIPage.sidebar.remove")}>
                          <IconButton
                            size="small"
                            onClick={(e) => { e.stopPropagation(); removeHistoryItem(item.id); }}
                            style={{ padding: 2 }}
                          >
                            <DeleteIcon fontSize="small" style={{ fontSize: 12, color: "#ccc" }} />
                          </IconButton>
                        </Tooltip>
                      </div>
                    );
                  })}
                </>
              )}
              {cat.id === "intro" &&
                INTRO_ITEMS.filter((item) => !searchTerm || item.label.toLowerCase().includes(searchTerm.toLowerCase())).map((item) => (
                  <div
                    key={item.id}
                    className={`${classes.sidebarItem} ${activeSection === item.id ? classes.sidebarItemActive : ""}`}
                    onClick={() => setActiveSection(item.id)}
                  >
                    {item.label}
                  </div>
                ))}
              {cat.id !== "playground" && cat.id !== "intro" &&
                filteredEndpoints(cat.id).map((ep) => (
                  <div
                    key={ep.id}
                    className={`${classes.sidebarItem} ${activeSection === ep.id ? classes.sidebarItemActive : ""}`}
                    onClick={() => handleSelectEndpoint(ep)}
                  >
                    <span>{ep.label}</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      {ep.badge && <span className={`${classes.badge} ${classes.badgeNew}`}>{ep.badge}</span>}
                      {ep.supportsGroup && (
                        <Tooltip title={i18n.t("messagesAPIPage.sidebar.supportsGroups")}><Group fontSize="small" style={{ color: "#888", fontSize: 14 }} /></Tooltip>
                      )}
                    </span>
                  </div>
                ))}
            </Collapse>
          </div>
        ))}
      </div>

      {/* MAIN CONTENT */}
      <div className={classes.mainContent} ref={mainRef}>
        {/* PLAYGROUND */}
        <div className={classes.docSection}>
          <div className={classes.playgroundHeader}>
            <PlayArrow className={classes.playgroundIcon} />
            <Typography className={classes.playgroundTitle}>{i18n.t("messagesAPIPage.playground.title")}</Typography>
          </div>
          <Typography className={classes.playgroundDesc}>
            {i18n.t("messagesAPIPage.playground.desc")}
          </Typography>

          {/* Config Row 1: URL + Token */}
          <div className={classes.configRow}>
            <TextField
              className={classes.urlField}
              label={i18n.t("messagesAPIPage.playground.apiUrl")}
              variant="outlined"
              size="small"
              value={apiUrl}
              onChange={(e) => setApiUrl(e.target.value)}
            />
            <TextField
              className={classes.tokenField}
              label="Token"
              variant="outlined"
              size="small"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              InputProps={{
                endAdornment: (
                  <Tooltip title={i18n.t("messagesAPIPage.playground.copyCurl")}>
                    <IconButton size="small" onClick={() => {
                      const curl = method === "GET"
                        ? `curl -X GET "${apiUrl}${path}" -H "Authorization: Bearer ${token}"`
                        : `curl -X ${method} "${apiUrl}${path}" -H "Authorization: Bearer ${token}" -H "Content-Type: application/json" -d '${bodyText}'`;
                      copyToClipboard(curl);
                    }}>
                      <Code fontSize="small" />
                    </IconButton>
                  </Tooltip>
                ),
              }}
            />
          </div>

          {/* Config Row 2: Endpoint select */}
          <div className={classes.configRow}>
            <FormControl variant="outlined" size="small" className={classes.endpointSelect}>
              <InputLabel>{i18n.t("messagesAPIPage.playground.selectEndpoint")}</InputLabel>
              <Select
                label={i18n.t("messagesAPIPage.playground.selectEndpoint")}
                value={selectedEndpoint.id}
                onChange={(e) => {
                  const ep = ENDPOINTS.find((ep) => ep.id === e.target.value);
                  if (ep) handleSelectEndpoint(ep);
                }}
              >
                {ENDPOINTS.map((ep) => (
                  <MenuItem key={ep.id} value={ep.id}>
                    <span style={{ fontWeight: 600, marginRight: 8, color: ep.method === "GET" ? "#a6e3a1" : "#89b4fa", fontSize: 12 }}>
                      {ep.method}
                    </span>
                    {ep.label}
                    {ep.supportsGroup && " 👥"}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
          </div>

          {/* Config Row 3: Method + Path + Group + Send */}
          <div className={classes.configRow}>
            <FormControl variant="outlined" size="small" className={classes.methodSelect}>
              <Select value={method} onChange={(e) => setMethod(e.target.value)}>
                <MenuItem value="GET"><span style={{ color: "#a6e3a1", fontWeight: 700 }}>GET</span></MenuItem>
                <MenuItem value="POST"><span style={{ color: "#89b4fa", fontWeight: 700 }}>POST</span></MenuItem>
                <MenuItem value="PUT"><span style={{ color: "#fab387", fontWeight: 700 }}>PUT</span></MenuItem>
                <MenuItem value="DELETE"><span style={{ color: "#f38ba8", fontWeight: 700 }}>DELETE</span></MenuItem>
              </Select>
            </FormControl>
            <TextField
              className={classes.pathField}
              variant="outlined"
              size="small"
              value={path}
              onChange={(e) => setPath(e.target.value)}
            />
            {selectedEndpoint.supportsGroup && (
              <FormControlLabel
                className={classes.groupSwitch}
                control={
                  <Switch
                    checked={isGroup}
                    onChange={(e) => toggleGroupInBody(e.target.checked)}
                    color="primary"
                    size="small"
                  />
                }
                label={<span style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 4 }}><Group fontSize="small" /> {i18n.t("messagesAPIPage.playground.group")}</span>}
              />
            )}
            <Button
              className={classes.sendButton}
              variant="contained"
              color="primary"
              onClick={handleSend}
              disabled={loading}
              startIcon={loading ? <CircularProgress size={18} /> : <PlayArrow />}
            >
              {i18n.t("messagesAPIPage.playground.send")}
            </Button>
          </div>

          {/* Tabs: Body / Headers / File Upload */}
          <Tabs
            value={playgroundTab}
            onChange={(_, v) => setPlaygroundTab(v)}
            indicatorColor="primary"
            textColor="primary"
            style={{ marginTop: 8, marginBottom: 0 }}
          >
            <Tab label="Body" />
            <Tab label="Headers" />
            {selectedEndpoint.supportsMedia && <Tab label={i18n.t("messagesAPIPage.playground.uploadMedia")} />}
          </Tabs>

          <div className={classes.tabPanel}>
            {playgroundTab === 0 && (
              <div style={{ position: "relative" }}>
                <textarea
                  className={classes.bodyEditor}
                  value={bodyText}
                  onChange={(e) => setBodyText(e.target.value)}
                  spellCheck={false}
                />
                <Tooltip title={i18n.t("messagesAPIPage.playground.formatJson")}>
                  <IconButton
                    size="small"
                    style={{ position: "absolute", top: 8, right: 8, color: "#888" }}
                    onClick={() => {
                      try {
                        setBodyText(JSON.stringify(JSON.parse(bodyText), null, 2));
                      } catch {
                        toast.error(i18n.t("hardcoded.invalidJson"));
                      }
                    }}
                  >
                    <Code fontSize="small" />
                  </IconButton>
                </Tooltip>
              </div>
            )}
            {playgroundTab === 1 && (
              <div className={classes.codeBlock}>
                {`Authorization: Bearer ${token || i18n.t("messagesAPIPage.playground.yourToken")}\nContent-Type: application/json`}
              </div>
            )}
            {playgroundTab === 2 && selectedEndpoint.supportsMedia && (
              <Box className={classes.fileUpload}>
                <input
                  type="file"
                  id="playground-file"
                  onChange={(e) => setFile(e.target.files?.[0] || null)}
                />
                {file && (
                  <Chip
                    label={file.name}
                    onDelete={() => { setFile(null); document.getElementById("playground-file").value = null; }}
                    color="primary"
                    size="small"
                  />
                )}
                <Typography variant="caption" color="textSecondary">
                  {i18n.t("messagesAPIPage.playground.mediaHint")}
                </Typography>
              </Box>
            )}
          </div>

          {/* Response */}
          {response && (
            <Box mt={2}>
              <Typography variant="subtitle2" style={{ marginBottom: 4, display: "flex", alignItems: "center", gap: 6 }}>
                {responseError ? <span style={{ color: "#f38ba8" }}>❌ {i18n.t("messagesAPIPage.playground.error")}</span> : <span style={{ color: "#a6e3a1" }}>✅ {i18n.t("messagesAPIPage.playground.response")}</span>}
                <IconButton size="small" onClick={() => copyToClipboard(response)}>
                  <FileCopy fontSize="small" />
                </IconButton>
              </Typography>
              <div className={`${classes.responseArea} ${responseError ? classes.responseError : ""}`}>
                {response}
              </div>
            </Box>
          )}
        </div>

        {/* ===== DOCUMENTATION SECTIONS ===== */}

        {/* INTRO: AUTH */}
        <div className={classes.docSection} id="auth">
          <Typography className={classes.docTitle}><Settings fontSize="small" /> {i18n.t("messagesAPIPage.docs.authTitle")}</Typography>
          <Typography variant="body2" paragraph dangerouslySetInnerHTML={{ __html: i18n.t("messagesAPIPage.docs.authDesc") }} />
          <div className={classes.codeBlock}>
            {`curl -X POST "${apiUrl}/send" \\\n  -H "Authorization: Bearer SEU_TOKEN_AQUI" \\\n  -H "Content-Type: application/json" \\\n  -d '{"number":"5585999999999","body":"Olá!"}'`}
            <IconButton className={classes.copyBtn} size="small" onClick={() => copyToClipboard(`curl -X POST "${apiUrl}/send" -H "Authorization: Bearer SEU_TOKEN_AQUI" -H "Content-Type: application/json" -d '{"number":"5585999999999","body":"Olá!"}'`)}>
              <FileCopy fontSize="small" />
            </IconButton>
          </div>
        </div>

        {/* INTRO: RATE LIMIT */}
        <div className={classes.docSection} id="rate-limit">
          <Typography className={classes.docTitle}>⏱️ {i18n.t("messagesAPIPage.docs.rateLimitTitle")}</Typography>
          <Typography variant="body2" paragraph dangerouslySetInnerHTML={{ __html: i18n.t("messagesAPIPage.docs.rateLimitDesc") }} />
        </div>

        {/* INTRO: ERROR CODES */}
        <div className={classes.docSection} id="error-codes">
          <Typography className={classes.docTitle}>🚨 {i18n.t("messagesAPIPage.docs.errorCodesTitle")}</Typography>
          <table className={classes.paramTable}>
            <thead>
              <tr><th>{i18n.t("messagesAPIPage.docs.code")}</th><th>{i18n.t("messagesAPIPage.docs.meaning")}</th></tr>
            </thead>
            <tbody>
              <tr><td><code>200</code></td><td>{i18n.t("messagesAPIPage.docs.success")}</td></tr>
              <tr><td><code>400</code></td><td>{i18n.t("messagesAPIPage.docs.invalidParams")}</td></tr>
              <tr><td><code>401</code></td><td>{i18n.t("messagesAPIPage.docs.invalidToken")}</td></tr>
              <tr><td><code>404</code></td><td>{i18n.t("messagesAPIPage.docs.notFound")}</td></tr>
              <tr><td><code>500</code></td><td>{i18n.t("messagesAPIPage.docs.serverError")}</td></tr>
            </tbody>
          </table>
        </div>

        {/* API SECTIONS - MESSAGES */}
        <Typography variant="h5" style={{ fontWeight: 700, marginBottom: 16, marginTop: 16, display: "flex", alignItems: "center", gap: 8 }}>
          <Send /> {i18n.t("messagesAPIPage.docs.messagesSection")}
        </Typography>

        {/* Send Text/Media */}
        <div className={classes.docSection} id="send-text">
          <Typography className={classes.docTitle}>
            <span className={`${classes.endpointBadge} ${classes.methodPost}`}>POST</span>
            &nbsp; {i18n.t("messagesAPIPage.docs.sendTextTitle")}
            <Tooltip title={i18n.t("messagesAPIPage.sidebar.supportsGroups")}><Group fontSize="small" style={{ color: "#888" }} /></Tooltip>
          </Typography>
          <Typography variant="body2" paragraph dangerouslySetInnerHTML={{ __html: i18n.t("messagesAPIPage.docs.sendTextDesc") }} />
          <div className={classes.codeBlock}>
            {`POST ${apiUrl}/send\n\n// Texto para contato\n{\n  "number": "5585999999999",\n  "body": "Olá!",\n  "isGroup": false\n}\n\n// Texto para GRUPO\n{\n  "number": "120363xxxxxxxxxx",\n  "body": "Olá grupo!",\n  "isGroup": true\n}\n\n// Mídia para GRUPO (multipart/form-data)\n// number: "120363xxxxxxxxxx"\n// body: "Legenda"\n// isGroup: true\n// medias: arquivo`}
            <IconButton className={classes.copyBtn} size="small" onClick={() => copyToClipboard(`{"number":"5585999999999","body":"Olá!","isGroup":false}`)}>
              <FileCopy fontSize="small" />
            </IconButton>
          </div>
          <table className={classes.paramTable}>
            <thead><tr><th>{i18n.t("messagesAPIPage.docs.parameter")}</th><th>{i18n.t("messagesAPIPage.docs.type")}</th><th>{i18n.t("messagesAPIPage.docs.description")}</th></tr></thead>
            <tbody>
              <tr><td><code>number</code><span className={`${classes.badge} ${classes.badgeRequired}`}>{i18n.t("messagesAPIPage.badges.required")}</span></td><td>string</td><td>{i18n.t("messagesAPIPage.docs.paramNumber")}</td></tr>
              <tr><td><code>body</code><span className={`${classes.badge} ${classes.badgeRequired}`}>{i18n.t("messagesAPIPage.badges.required")}</span></td><td>string</td><td>{i18n.t("messagesAPIPage.docs.paramBody")}</td></tr>
              <tr><td><code>isGroup</code><span className={`${classes.badge} ${classes.badgeNew}`}>{i18n.t("messagesAPIPage.badges.new")}</span></td><td>boolean</td><td dangerouslySetInnerHTML={{ __html: i18n.t("messagesAPIPage.docs.paramIsGroup") }} /></tr>
              <tr><td><code>medias</code><span className={`${classes.badge} ${classes.badgeOptional}`}>{i18n.t("messagesAPIPage.badges.optional")}</span></td><td>file</td><td>{i18n.t("messagesAPIPage.docs.paramMedias")}</td></tr>
              <tr><td><code>userId</code><span className={`${classes.badge} ${classes.badgeOptional}`}>{i18n.t("messagesAPIPage.badges.optional")}</span></td><td>number</td><td>{i18n.t("messagesAPIPage.docs.paramUserId")}</td></tr>
              <tr><td><code>queueId</code><span className={`${classes.badge} ${classes.badgeOptional}`}>{i18n.t("messagesAPIPage.badges.optional")}</span></td><td>number</td><td>{i18n.t("messagesAPIPage.docs.paramQueueId")}</td></tr>
              <tr><td><code>sendSignature</code><span className={`${classes.badge} ${classes.badgeOptional}`}>{i18n.t("messagesAPIPage.badges.optional")}</span></td><td>boolean</td><td>{i18n.t("messagesAPIPage.docs.paramSendSignature")}</td></tr>
              <tr><td><code>closeTicket</code><span className={`${classes.badge} ${classes.badgeOptional}`}>{i18n.t("messagesAPIPage.badges.optional")}</span></td><td>boolean</td><td>{i18n.t("messagesAPIPage.docs.paramCloseTicket")}</td></tr>
              <tr><td><code>noRegister</code><span className={`${classes.badge} ${classes.badgeOptional}`}>{i18n.t("messagesAPIPage.badges.optional")}</span></td><td>boolean</td><td>{i18n.t("messagesAPIPage.docs.paramNoRegister")}</td></tr>
            </tbody>
          </table>
        </div>

        {/* Send Image URL */}
        <div className={classes.docSection} id="send-image-url">
          <Typography className={classes.docTitle}>
            <span className={`${classes.endpointBadge} ${classes.methodPost}`}>POST</span>
            &nbsp; {i18n.t("messagesAPIPage.docs.sendImageTitle")}
            <span className={`${classes.badge} ${classes.badgeNew}`}>{i18n.t("messagesAPIPage.badges.new")}</span>
            <Tooltip title={i18n.t("messagesAPIPage.sidebar.supportsGroups")}><Group fontSize="small" style={{ color: "#888" }} /></Tooltip>
          </Typography>
          <Typography variant="body2" paragraph dangerouslySetInnerHTML={{ __html: i18n.t("messagesAPIPage.docs.sendImageDesc") }} />
          <div className={classes.codeBlock}>
            {`POST ${apiUrl}/send/linkImage\n\n{\n  "number": "120363xxxxxxxxxx",\n  "url": "https://exemplo.com/foto.jpg",\n  "caption": "Foto do grupo",\n  "isGroup": true\n}`}
          </div>
          <table className={classes.paramTable}>
            <thead><tr><th>{i18n.t("messagesAPIPage.docs.parameter")}</th><th>{i18n.t("messagesAPIPage.docs.type")}</th><th>{i18n.t("messagesAPIPage.docs.description")}</th></tr></thead>
            <tbody>
              <tr><td><code>number</code><span className={`${classes.badge} ${classes.badgeRequired}`}>{i18n.t("messagesAPIPage.badges.required")}</span></td><td>string</td><td>{i18n.t("messagesAPIPage.docs.paramNumberOrJid")}</td></tr>
              <tr><td><code>url</code><span className={`${classes.badge} ${classes.badgeRequired}`}>{i18n.t("messagesAPIPage.badges.required")}</span></td><td>string</td><td>{i18n.t("messagesAPIPage.docs.paramUrl")}</td></tr>
              <tr><td><code>caption</code><span className={`${classes.badge} ${classes.badgeOptional}`}>{i18n.t("messagesAPIPage.badges.optional")}</span></td><td>string</td><td>{i18n.t("messagesAPIPage.docs.paramCaption")}</td></tr>
              <tr><td><code>isGroup</code><span className={`${classes.badge} ${classes.badgeNew}`}>{i18n.t("messagesAPIPage.badges.new")}</span></td><td>boolean</td><td dangerouslySetInnerHTML={{ __html: i18n.t("messagesAPIPage.docs.paramIsGroupSend") }} /></tr>
            </tbody>
          </table>
        </div>

        {/* Send No Ticket */}
        <div className={classes.docSection} id="send-no-ticket">
          <Typography className={classes.docTitle}>
            <span className={`${classes.endpointBadge} ${classes.methodPost}`}>POST</span>
            &nbsp; {i18n.t("messagesAPIPage.docs.sendNoTicketTitle")}
            <span className={`${classes.badge} ${classes.badgeNew}`}>{i18n.t("messagesAPIPage.badges.new")}</span>
            <Tooltip title={i18n.t("messagesAPIPage.sidebar.supportsGroups")}><Group fontSize="small" style={{ color: "#888" }} /></Tooltip>
          </Typography>
          <Typography variant="body2" paragraph dangerouslySetInnerHTML={{ __html: i18n.t("messagesAPIPage.docs.sendNoTicketDesc") }} />
          <div className={classes.codeBlock}>
            {`POST ${apiUrl}/send/noTicket\n\n// Para grupo:\n{\n  "number": "120363xxxxxxxxxx",\n  "body": "Aviso para o grupo!",\n  "isGroup": true\n}`}
          </div>
        </div>

        {/* Bulk */}
        <div className={classes.docSection} id="send-bulk">
          <Typography className={classes.docTitle}>
            <span className={`${classes.endpointBadge} ${classes.methodPost}`}>POST</span>
            &nbsp; {i18n.t("messagesAPIPage.docs.bulkTitle")}
            <span className={`${classes.badge} ${classes.badgeNew}`}>{i18n.t("messagesAPIPage.badges.new")}</span>
          </Typography>
          <Typography variant="body2" paragraph dangerouslySetInnerHTML={{ __html: i18n.t("messagesAPIPage.docs.bulkDesc") }} />
          <div className={classes.codeBlock}>
            {`POST ${apiUrl}/send/bulk\n\n{\n  "delay": 2000,\n  "messages": [\n    {"number": "5585999999999", "body": "Olá!", "isGroup": false},\n    {"number": "120363xxxxxxxxxx", "body": "Olá grupo!", "isGroup": true}\n  ]\n}`}
          </div>
        </div>

        {/* Buttons */}
        <div className={classes.docSection} id="send-buttons">
          <Typography className={classes.docTitle}>
            <span className={`${classes.endpointBadge} ${classes.methodPost}`}>POST</span>
            &nbsp; {i18n.t("messagesAPIPage.docs.buttonsTitle")}
            <span className={`${classes.badge} ${classes.badgeNew}`}>{i18n.t("messagesAPIPage.badges.new")}</span>
            <Tooltip title={i18n.t("messagesAPIPage.sidebar.supportsGroups")}><Group fontSize="small" style={{ color: "#888" }} /></Tooltip>
          </Typography>
          <Typography variant="body2" paragraph dangerouslySetInnerHTML={{ __html: i18n.t("messagesAPIPage.docs.buttonsDesc") }} />
          <div className={classes.codeBlock}>
            {`POST ${apiUrl}/send/buttons\n\n// Botões para grupo:\n{\n  "number": "120363xxxxxxxxxx",\n  "body": "Escolha:",\n  "type": "buttons",\n  "isGroup": true,\n  "buttons": [\n    {"text": "Opção 1", "id": "1"},\n    {"text": "Opção 2", "id": "2"}\n  ]\n}\n\n// Tipos: buttons | list | url | copy | pix | mixed`}
          </div>
        </div>

        {/* Check Number */}
        <div className={classes.docSection} id="check-number">
          <Typography className={classes.docTitle}>
            <span className={`${classes.endpointBadge} ${classes.methodPost}`}>POST</span>
            &nbsp; {i18n.t("messagesAPIPage.docs.checkNumberTitle")}
            <span className={`${classes.badge} ${classes.badgeNew}`}>{i18n.t("messagesAPIPage.badges.new")}</span>
          </Typography>
          <Typography variant="body2" paragraph>
            {i18n.t("messagesAPIPage.docs.checkNumberDesc")}
          </Typography>
          <div className={classes.codeBlock}>
            {`POST ${apiUrl}/checkNumber\n\n{"number": "5585999999999"}\n\n// Resposta:\n{"existsInWhatsapp": true, "number": "5585999999999", "numberFormatted": "5585999999999@s.whatsapp.net"}`}
          </div>
        </div>

        {/* ===== CONTACTS SECTION ===== */}
        <Typography variant="h5" style={{ fontWeight: 700, marginBottom: 16, marginTop: 32, display: "flex", alignItems: "center", gap: 8 }}>
          <ContactPhone /> {i18n.t("messagesAPIPage.docs.contactsSection")}
        </Typography>

        {/* List Contacts */}
        <div className={classes.docSection} id="contacts-list">
          <Typography className={classes.docTitle}>
            <span className={`${classes.endpointBadge} ${classes.methodGet}`}>GET</span>
            &nbsp; {i18n.t("messagesAPIPage.docs.listContactsTitle")}
          </Typography>
          <Typography variant="body2" paragraph>
            {i18n.t("messagesAPIPage.docs.listContactsDesc")}
          </Typography>
          <div className={classes.codeBlock}>
            {`GET ${apiUrl}/contacts?searchParam=joao&pageNumber=1\n\n// Resposta:\n{\n  "contacts": [\n    {"id": 1, "name": "João Silva", "number": "5585999999999", "email": "joao@email.com", "profilePicUrl": "..."}\n  ],\n  "count": 1,\n  "hasMore": false\n}`}
          </div>
          <table className={classes.paramTable}>
            <thead><tr><th>{i18n.t("messagesAPIPage.docs.parameter")}</th><th>{i18n.t("messagesAPIPage.docs.type")}</th><th>{i18n.t("messagesAPIPage.docs.description")}</th></tr></thead>
            <tbody>
              <tr><td><code>searchParam</code><span className={`${classes.badge} ${classes.badgeOptional}`}>{i18n.t("messagesAPIPage.badges.optional")}</span></td><td>string</td><td>{i18n.t("messagesAPIPage.docs.paramSearchParam")}</td></tr>
              <tr><td><code>pageNumber</code><span className={`${classes.badge} ${classes.badgeOptional}`}>{i18n.t("messagesAPIPage.badges.optional")}</span></td><td>number</td><td>{i18n.t("messagesAPIPage.docs.paramPageNumber")}</td></tr>
            </tbody>
          </table>
        </div>

        {/* Show Contact */}
        <div className={classes.docSection} id="contacts-show">
          <Typography className={classes.docTitle}>
            <span className={`${classes.endpointBadge} ${classes.methodGet}`}>GET</span>
            &nbsp; {i18n.t("messagesAPIPage.docs.showContactTitle")}
          </Typography>
          <Typography variant="body2" paragraph>
            {i18n.t("messagesAPIPage.docs.showContactDesc")}
          </Typography>
          <div className={classes.codeBlock}>
            {`GET ${apiUrl}/contacts/123\n\n// Resposta:\n{\n  "id": 123,\n  "name": "João Silva",\n  "number": "5585999999999",\n  "email": "joao@email.com",\n  "profilePicUrl": "...",\n  "extraInfo": [],\n  "tags": []\n}`}
          </div>
        </div>

        {/* Create Contact */}
        <div className={classes.docSection} id="contacts-create">
          <Typography className={classes.docTitle}>
            <span className={`${classes.endpointBadge} ${classes.methodPost}`}>POST</span>
            &nbsp; {i18n.t("messagesAPIPage.docs.createContactTitle")}
            <span className={`${classes.badge} ${classes.badgeNew}`}>{i18n.t("messagesAPIPage.badges.new")}</span>
          </Typography>
          <Typography variant="body2" paragraph>
            {i18n.t("messagesAPIPage.docs.createContactDesc")}
          </Typography>
          <div className={classes.codeBlock}>
            {`POST ${apiUrl}/contacts\n\n{\n  "name": "João Silva",\n  "number": "5585999999999",\n  "email": "joao@email.com",\n  "extraInfo": [\n    {"name": "Empresa", "value": "Acme Corp"}\n  ]\n}`}
          </div>
          <table className={classes.paramTable}>
            <thead><tr><th>{i18n.t("messagesAPIPage.docs.parameter")}</th><th>{i18n.t("messagesAPIPage.docs.type")}</th><th>{i18n.t("messagesAPIPage.docs.description")}</th></tr></thead>
            <tbody>
              <tr><td><code>name</code><span className={`${classes.badge} ${classes.badgeRequired}`}>{i18n.t("messagesAPIPage.badges.required")}</span></td><td>string</td><td>{i18n.t("messagesAPIPage.docs.paramName")}</td></tr>
              <tr><td><code>number</code><span className={`${classes.badge} ${classes.badgeRequired}`}>{i18n.t("messagesAPIPage.badges.required")}</span></td><td>string</td><td>{i18n.t("messagesAPIPage.docs.paramNumberWhatsApp")}</td></tr>
              <tr><td><code>email</code><span className={`${classes.badge} ${classes.badgeOptional}`}>{i18n.t("messagesAPIPage.badges.optional")}</span></td><td>string</td><td>{i18n.t("messagesAPIPage.docs.paramEmail")}</td></tr>
              <tr><td><code>extraInfo</code><span className={`${classes.badge} ${classes.badgeOptional}`}>{i18n.t("messagesAPIPage.badges.optional")}</span></td><td>array</td><td>{i18n.t("messagesAPIPage.docs.paramExtraInfo")} <code>[{"{name, value}"}]</code></td></tr>
            </tbody>
          </table>
        </div>

        {/* Update Contact */}
        <div className={classes.docSection} id="contacts-update">
          <Typography className={classes.docTitle}>
            <span className={`${classes.endpointBadge} ${classes.methodPost}`}>PUT</span>
            &nbsp; {i18n.t("messagesAPIPage.docs.updateContactTitle")}
            <span className={`${classes.badge} ${classes.badgeNew}`}>{i18n.t("messagesAPIPage.badges.new")}</span>
          </Typography>
          <Typography variant="body2" paragraph>
            {i18n.t("messagesAPIPage.docs.updateContactDesc")}
          </Typography>
          <div className={classes.codeBlock}>
            {`PUT ${apiUrl}/contacts/123\n\n{\n  "name": "João Silva Atualizado",\n  "email": "joao.novo@email.com"\n}`}
          </div>
        </div>

        {/* Delete Contact */}
        <div className={classes.docSection} id="contacts-delete">
          <Typography className={classes.docTitle}>
            <span className={`${classes.endpointBadge} ${classes.methodPost}`}>DELETE</span>
            &nbsp; {i18n.t("messagesAPIPage.docs.deleteContactTitle")}
            <span className={`${classes.badge} ${classes.badgeNew}`}>{i18n.t("messagesAPIPage.badges.new")}</span>
          </Typography>
          <Typography variant="body2" paragraph dangerouslySetInnerHTML={{ __html: i18n.t("messagesAPIPage.docs.deleteContactDesc") }} />
          <div className={classes.codeBlock}>
            {`DELETE ${apiUrl}/contacts/123\n\n// Resposta:\n{"message": "Contact deleted"}`}
          </div>
        </div>

        {/* ===== TICKETS SECTION ===== */}
        <Typography variant="h5" style={{ fontWeight: 700, marginBottom: 16, marginTop: 32, display: "flex", alignItems: "center", gap: 8 }}>
          <Chat /> {i18n.t("messagesAPIPage.docs.ticketsSection")}
        </Typography>

        {/* List Tickets */}
        <div className={classes.docSection} id="tickets-list">
          <Typography className={classes.docTitle}>
            <span className={`${classes.endpointBadge} ${classes.methodGet}`}>GET</span>
            &nbsp; {i18n.t("messagesAPIPage.docs.listTicketsTitle")}
          </Typography>
          <Typography variant="body2" paragraph>
            {i18n.t("messagesAPIPage.docs.listTicketsDesc")}
          </Typography>
          <div className={classes.codeBlock}>
            {`GET ${apiUrl}/tickets?status=open&queueIds=1,2&pageNumber=1\n\n// Resposta:\n{\n  "tickets": [\n    {"id": 1, "status": "open", "lastMessage": "Olá!", "contact": {"name": "João"}, "queue": {"name": "Suporte"}, "user": {"name": "Atendente 1"}}\n  ],\n  "count": 1,\n  "hasMore": false\n}`}
          </div>
          <table className={classes.paramTable}>
            <thead><tr><th>{i18n.t("messagesAPIPage.docs.parameter")}</th><th>{i18n.t("messagesAPIPage.docs.type")}</th><th>{i18n.t("messagesAPIPage.docs.description")}</th></tr></thead>
            <tbody>
              <tr><td><code>status</code><span className={`${classes.badge} ${classes.badgeOptional}`}>{i18n.t("messagesAPIPage.badges.optional")}</span></td><td>string</td><td dangerouslySetInnerHTML={{ __html: i18n.t("messagesAPIPage.docs.paramStatus") }} /></tr>
              <tr><td><code>queueIds</code><span className={`${classes.badge} ${classes.badgeOptional}`}>{i18n.t("messagesAPIPage.badges.optional")}</span></td><td>string</td><td>{i18n.t("messagesAPIPage.docs.paramQueueIds")}</td></tr>
              <tr><td><code>searchParam</code><span className={`${classes.badge} ${classes.badgeOptional}`}>{i18n.t("messagesAPIPage.badges.optional")}</span></td><td>string</td><td>{i18n.t("messagesAPIPage.docs.paramSearchTicket")}</td></tr>
              <tr><td><code>pageNumber</code><span className={`${classes.badge} ${classes.badgeOptional}`}>{i18n.t("messagesAPIPage.badges.optional")}</span></td><td>number</td><td>{i18n.t("messagesAPIPage.docs.paramPageNumber")}</td></tr>
              <tr><td><code>showAll</code><span className={`${classes.badge} ${classes.badgeOptional}`}>{i18n.t("messagesAPIPage.badges.optional")}</span></td><td>string</td><td dangerouslySetInnerHTML={{ __html: i18n.t("messagesAPIPage.docs.paramShowAll") }} /></tr>
            </tbody>
          </table>
        </div>

        {/* Show Ticket */}
        <div className={classes.docSection} id="tickets-show">
          <Typography className={classes.docTitle}>
            <span className={`${classes.endpointBadge} ${classes.methodGet}`}>GET</span>
            &nbsp; {i18n.t("messagesAPIPage.docs.showTicketTitle")}
          </Typography>
          <Typography variant="body2" paragraph>
            {i18n.t("messagesAPIPage.docs.showTicketDesc")}
          </Typography>
          <div className={classes.codeBlock}>
            {`GET ${apiUrl}/tickets/456\n\n// Resposta:\n{\n  "id": 456,\n  "status": "open",\n  "lastMessage": "Olá, preciso de ajuda!",\n  "contact": {"id": 1, "name": "João Silva", "number": "5585999999999"},\n  "queue": {"id": 1, "name": "Suporte"},\n  "user": {"id": 1, "name": "Atendente"},\n  "whatsapp": {"id": 1, "name": "Conexão Principal"},\n  "messages": [...]\n}`}
          </div>
        </div>

        {/* Create Ticket */}
        <div className={classes.docSection} id="tickets-create">
          <Typography className={classes.docTitle}>
            <span className={`${classes.endpointBadge} ${classes.methodPost}`}>POST</span>
            &nbsp; {i18n.t("messagesAPIPage.docs.createTicketTitle")}
            <span className={`${classes.badge} ${classes.badgeNew}`}>{i18n.t("messagesAPIPage.badges.new")}</span>
          </Typography>
          <Typography variant="body2" paragraph>
            {i18n.t("messagesAPIPage.docs.createTicketDesc")}
          </Typography>
          <div className={classes.codeBlock}>
            {`POST ${apiUrl}/tickets\n\n{\n  "contactId": 1,\n  "status": "open",\n  "queueId": 1,\n  "userId": 1\n}`}
          </div>
          <table className={classes.paramTable}>
            <thead><tr><th>{i18n.t("messagesAPIPage.docs.parameter")}</th><th>{i18n.t("messagesAPIPage.docs.type")}</th><th>{i18n.t("messagesAPIPage.docs.description")}</th></tr></thead>
            <tbody>
              <tr><td><code>contactId</code><span className={`${classes.badge} ${classes.badgeRequired}`}>{i18n.t("messagesAPIPage.badges.required")}</span></td><td>number</td><td>{i18n.t("messagesAPIPage.docs.paramContactId")}</td></tr>
              <tr><td><code>status</code><span className={`${classes.badge} ${classes.badgeOptional}`}>{i18n.t("messagesAPIPage.badges.optional")}</span></td><td>string</td><td dangerouslySetInnerHTML={{ __html: i18n.t("messagesAPIPage.docs.paramStatusDefault") }} /></tr>
              <tr><td><code>queueId</code><span className={`${classes.badge} ${classes.badgeOptional}`}>{i18n.t("messagesAPIPage.badges.optional")}</span></td><td>number</td><td>{i18n.t("messagesAPIPage.docs.paramQueueIdTicket")}</td></tr>
              <tr><td><code>userId</code><span className={`${classes.badge} ${classes.badgeOptional}`}>{i18n.t("messagesAPIPage.badges.optional")}</span></td><td>number</td><td>{i18n.t("messagesAPIPage.docs.paramUserIdTicket")}</td></tr>
            </tbody>
          </table>
        </div>

        {/* Update Ticket */}
        <div className={classes.docSection} id="tickets-update">
          <Typography className={classes.docTitle}>
            <span className={`${classes.endpointBadge} ${classes.methodPost}`}>PUT</span>
            &nbsp; {i18n.t("messagesAPIPage.docs.updateTicketTitle")}
            <span className={`${classes.badge} ${classes.badgeNew}`}>{i18n.t("messagesAPIPage.badges.new")}</span>
          </Typography>
          <Typography variant="body2" paragraph>
            {i18n.t("messagesAPIPage.docs.updateTicketDesc")}
          </Typography>
          <div className={classes.codeBlock}>
            {`PUT ${apiUrl}/tickets/456\n\n// Fechar ticket:\n{"status": "closed"}\n\n// Transferir para outra fila:\n{"queueId": 2, "userId": 3}\n\n// Reabrir ticket:\n{"status": "open"}`}
          </div>
          <table className={classes.paramTable}>
            <thead><tr><th>{i18n.t("messagesAPIPage.docs.parameter")}</th><th>{i18n.t("messagesAPIPage.docs.type")}</th><th>{i18n.t("messagesAPIPage.docs.description")}</th></tr></thead>
            <tbody>
              <tr><td><code>status</code><span className={`${classes.badge} ${classes.badgeOptional}`}>{i18n.t("messagesAPIPage.badges.optional")}</span></td><td>string</td><td dangerouslySetInnerHTML={{ __html: i18n.t("messagesAPIPage.docs.paramStatus") }} /></tr>
              <tr><td><code>queueId</code><span className={`${classes.badge} ${classes.badgeOptional}`}>{i18n.t("messagesAPIPage.badges.optional")}</span></td><td>number</td><td>{i18n.t("messagesAPIPage.docs.paramNewQueueId")}</td></tr>
              <tr><td><code>userId</code><span className={`${classes.badge} ${classes.badgeOptional}`}>{i18n.t("messagesAPIPage.badges.optional")}</span></td><td>number</td><td>{i18n.t("messagesAPIPage.docs.paramNewUserId")}</td></tr>
            </tbody>
          </table>
        </div>

        {/* Delete Ticket */}
        <div className={classes.docSection} id="tickets-delete">
          <Typography className={classes.docTitle}>
            <span className={`${classes.endpointBadge} ${classes.methodPost}`}>DELETE</span>
            &nbsp; {i18n.t("messagesAPIPage.docs.deleteTicketTitle")}
            <span className={`${classes.badge} ${classes.badgeNew}`}>{i18n.t("messagesAPIPage.badges.new")}</span>
          </Typography>
          <Typography variant="body2" paragraph dangerouslySetInnerHTML={{ __html: i18n.t("messagesAPIPage.docs.deleteTicketDesc") }} />
          <div className={classes.codeBlock}>
            {`DELETE ${apiUrl}/tickets/456\n\n// Resposta:\n{"message": "Ticket deleted"}`}
          </div>
        </div>

        {/* Close All Tickets */}
        <div className={classes.docSection} id="tickets-close-all">
          <Typography className={classes.docTitle}>
            <span className={`${classes.endpointBadge} ${classes.methodPost}`}>POST</span>
            &nbsp; {i18n.t("messagesAPIPage.docs.closeAllTitle")}
            <span className={`${classes.badge} ${classes.badgeNew}`}>{i18n.t("messagesAPIPage.badges.new")}</span>
          </Typography>
          <Typography variant="body2" paragraph>
            {i18n.t("messagesAPIPage.docs.closeAllDesc")}
          </Typography>
          <div className={classes.codeBlock}>
            {`POST ${apiUrl}/tickets/closeAll\n\n{"status": "closed"}\n\n// Resposta:\n{"message": "All tickets closed", "count": 15}`}
          </div>
        </div>

        {/* Messages Range */}
        <div className={classes.docSection} id="messages-range">
          <Typography className={classes.docTitle}>
            <span className={`${classes.endpointBadge} ${classes.methodGet}`}>GET</span>
            &nbsp; {i18n.t("messagesAPIPage.docs.messagesRangeTitle")}
          </Typography>
          <Typography variant="body2" paragraph>
            {i18n.t("messagesAPIPage.docs.messagesRangeDesc")}
          </Typography>
          <div className={classes.codeBlock}>
            {`GET ${apiUrl}/messagesRange?companyId=1&startDate=2024-01-01&lastDate=2024-12-31\n\n// Resposta:\n{\n  "messages": [...],\n  "count": 150\n}`}
          </div>
          <table className={classes.paramTable}>
            <thead><tr><th>{i18n.t("messagesAPIPage.docs.parameter")}</th><th>{i18n.t("messagesAPIPage.docs.type")}</th><th>{i18n.t("messagesAPIPage.docs.description")}</th></tr></thead>
            <tbody>
              <tr><td><code>companyId</code><span className={`${classes.badge} ${classes.badgeRequired}`}>{i18n.t("messagesAPIPage.badges.required")}</span></td><td>number</td><td>{i18n.t("messagesAPIPage.docs.paramCompanyId")}</td></tr>
              <tr><td><code>startDate</code><span className={`${classes.badge} ${classes.badgeRequired}`}>{i18n.t("messagesAPIPage.badges.required")}</span></td><td>string</td><td>{i18n.t("messagesAPIPage.docs.paramStartDate")}</td></tr>
              <tr><td><code>lastDate</code><span className={`${classes.badge} ${classes.badgeRequired}`}>{i18n.t("messagesAPIPage.badges.required")}</span></td><td>string</td><td>{i18n.t("messagesAPIPage.docs.paramEndDate")}</td></tr>
            </tbody>
          </table>
        </div>

      </div>
    </div>
  );
};

export default MessagesAPI;
