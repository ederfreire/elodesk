import React, { useContext, useState, useEffect, useReducer, useRef } from "react";
import isSameDay from "date-fns/isSameDay";
import parseISO from "date-fns/parseISO";
import format from "date-fns/format";
import clsx from "clsx";
import { isNil } from "lodash";
import blue from "@material-ui/core/colors/blue";
import green from "@material-ui/core/colors/green";
import { Button, Typography, IconButton, makeStyles } from "@material-ui/core";

import AccessTime from "@material-ui/icons/AccessTime";
import Done from "@material-ui/icons/Done";
import DoneAll from "@material-ui/icons/DoneAll";
import ExpandMore from "@material-ui/icons/ExpandMore";
import GetApp from "@material-ui/icons/GetApp";
import Facebook from "@material-ui/icons/Facebook";
import Instagram from "@material-ui/icons/Instagram";
import Reply from "@material-ui/icons/Reply";
import WhatsApp from "@material-ui/icons/WhatsApp";
import MarkdownWrapper from "../MarkdownWrapper";
import { renderInteractiveOrMarkdown } from "../InteractiveBodyPreview";
import VcardPreview from "../VcardPreview";
import LocationPreview from "../LocationPreview";
import ModalImageCors from "../ModalImageCors";
import MessageOptionsMenu from "../MessageOptionsMenu";
import whatsBackground from "../../assets/wa-background.png";
import whatsBackgroundDark from "../../assets/wa-background-dark.png";
import YouTubePreview from "../ModalYoutubeCors";
import PdfPreview from "../PdfPreview";
import { ReplyMessageContext } from "../../context/ReplyingMessage/ReplyingMessageContext";
import { ForwardMessageContext } from "../../context/ForwarMessage/ForwardMessageContext";
import AdMetaPreview from "../AdMetaPreview";
import FacebookPostPreview from "../FacebookPostPreview";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import { i18n } from "../../translate/i18n";
import SelectMessageCheckbox from "./SelectMessageCheckbox";
import useCompanySettings from "../../hooks/useSettings/companySettings";
import { AuthContext } from "../../context/Auth/AuthContext";
import { QueueSelectedContext } from "../../context/QueuesSelected/QueuesSelectedContext";
import AudioModal from "../AudioModal";
import { CircularProgress } from "@material-ui/core";
import { useParams, useHistory } from 'react-router-dom';
import { downloadResource } from "../../utils";
import Template from "./templates";
import { usePdfViewer } from "../../hooks/usePdfViewer";

const useStyles = makeStyles((theme) => ({
  messagesListWrapper: {
    overflow: "hidden",
    position: "relative",
    display: "flex",
    flexDirection: "column",
    flexGrow: 1,
    width: "100%",
    minWidth: 300,
    minHeight: 200,
    "@media (max-width: 960px)": {
      flex: 1,
      minHeight: 0,
      overflow: "hidden",
    },
  },

  currentTick: {
    display: "flex",
    justifyContent: "center",
    margin: "10px 0",
  },

  currentTicktText: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 12px",
    borderRadius: 14,
    fontSize: "0.78rem",
    fontWeight: 500,
    backgroundColor: theme.mode === "dark" ? "rgba(255, 244, 200, 0.12)" : "#FFF8DC",
    color: theme.mode === "dark" ? "#f0e6b3" : "#7a6a1f",
    boxShadow: theme.mode === "dark" ? "0 1px 1px rgba(0,0,0,0.5)" : "0 1px 1px rgba(0,0,0,0.08)",
    border: theme.mode === "dark" ? "1px solid rgba(255,244,200,0.15)" : "1px solid #f0e6b3",
    maxWidth: "92%",
    flexWrap: "wrap",
    justifyContent: "center",
  },

  currentTickBadge: {
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
    fontSize: "0.7rem",
    fontWeight: 500,
    opacity: 0.85,
    marginLeft: 4,
  },

  currentTickSep: {
    opacity: 0.55,
    margin: "0 2px",
  },

  currentTickTime: {
    fontSize: "0.72rem",
    color: theme.mode === "dark" ? "#d8c97f" : "#a8932f",
    marginLeft: 4,
  },

  messagesList: {
    backgroundImage: theme.mode === 'light' ? `url(${whatsBackground})` : `url(${whatsBackgroundDark})`,
    backgroundColor: theme.mode === 'light' ? "#ebebeb" : "#0b0b0d",
    backgroundSize: theme.mode === 'light' ? "412.5px 749.25px" : "cover",
    backgroundRepeat: "repeat",
    fontFamily: '"Segoe UI", "Helvetica Neue", Helvetica, "Apple Color Emoji", Arial, sans-serif',
    display: "flex",
    flexDirection: "column",
    flexGrow: 1,
    padding: "20px 20px 30px 20px",
    overflowY: "scroll",
    ...theme.scrollbarStyles,
    "@media (max-width: 960px)": {
      padding: "10px 8px 4px 8px",
      flex: 1,
      minHeight: 0,
      overflowY: "auto",
      scrollbarWidth: "none",
      "&::-webkit-scrollbar": {
        display: "none",
      },
    },
  },
  dragElement: {
    background: 'rgba(255, 255, 255, 0.8)',
    position: "absolute",
    width: "100%",
    height: "100%",
    zIndex: 999999,
    textAlign: "center",
    fontSize: "3em",
    border: "5px dashed #333",
    color: '#333',
    display: "flex",
    justifyContent: "center",
    alignItems: "center"
  },
  circleLoading: {
    color: blue[500],
    position: "absolute",
    opacity: "70%",
    top: 0,
    left: "50%",
    marginTop: 12,
  },

  messageLeft: {
    marginRight: 20,
    marginTop: 2,
    minWidth: 100,
    maxWidth: 600,
    height: "auto",
    display: "inline-block",
    position: "relative",
    "&:hover #messageActionsButton": {
      display: "flex",
      position: "absolute",
      top: 0,
      right: 0,
    },

    whiteSpace: "pre-wrap",
    fontFamily: '"Segoe UI", "Helvetica Neue", Helvetica, "Apple Color Emoji", Arial, sans-serif',
    backgroundColor: theme.mode === 'light' ? "#ffffff" : "#202c33",
    color: theme.mode === 'light' ? "#303030" : "#ffffff",
    alignSelf: "flex-start",
    borderTopLeftRadius: 0,
    borderTopRightRadius: 8,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    paddingLeft: 5,
    paddingRight: 5,
    paddingTop: 5,
    paddingBottom: 0,
    boxShadow: theme.mode === 'light' ? "0 1px 1px #b3b3b3" : "0 1px 1px #000000"
  },

  quotedContainerLeft: {
    margin: "-3px -80px 6px -6px",
    overflow: "hidden",
    backgroundColor: theme.mode === 'light' ? "#f0f0f0" : "#1d282f",
    borderRadius: "7.5px",
    display: "flex",
    position: "relative",
  },

  quotedMsg: {
    padding: 10,
    maxWidth: 300,
    height: "auto",
    display: "block",
    whiteSpace: "pre-wrap",
    overflow: "hidden",
  },

  quotedSideColorLeft: {
    flex: "none",
    width: "4px",
    backgroundColor: "#388aff",
  },

  messageRight: {
    marginLeft: 20,
    marginTop: 2,
    minWidth: 100,
    maxWidth: 600,
    height: "auto",
    display: "inline-block",
    position: "relative",
    "&:hover #messageActionsButton": {
      display: "flex",
      position: "absolute",
      top: 0,
      right: 0,
    },
    whiteSpace: "pre-wrap",
    fontFamily: '"Segoe UI", "Helvetica Neue", Helvetica, "Apple Color Emoji", Arial, sans-serif',
    backgroundColor: theme.mode === 'light' ? "#dcf8c6" : "#005c4b",
    color: theme.mode === 'light' ? "#303030" : "#ffffff",
    alignSelf: "flex-end",
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 0,
    paddingLeft: 5,
    paddingRight: 5,
    paddingTop: 5,
    paddingBottom: 0,
    boxShadow: theme.mode === 'light' ? "0 1px 1px #b3b3b3" : "0 1px 1px #000000"
  },

  messageRightPrivate: {
    marginLeft: 20,
    marginTop: 2,
    minWidth: 100,
    maxWidth: 600,
    height: "auto",
    display: "inline-block",
    position: "relative",
    "&:hover #messageActionsButton": {
      display: "flex",
      position: "absolute",
      top: 0,
      right: 0,
    },
    whiteSpace: "pre-wrap",
    backgroundColor: "#F0E68C",
    color: "#303030",
    alignSelf: "flex-end",
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 0,
    paddingLeft: 5,
    paddingRight: 5,
    paddingTop: 5,
    paddingBottom: 0,
    boxShadow: theme.mode === 'light' ? "0 1px 1px #b3b3b3" : "0 1px 1px #000000"
  },

  quotedContainerRight: {
    margin: "-3px -80px 6px -6px",
    overflowY: "hidden",
    backgroundColor: theme.mode === 'light' ? "#cfe9ba" : "#025144",
    borderRadius: "7.5px",
    display: "flex",
    position: "relative",
  },

  quotedMsgRight: {
    padding: 10,
    maxWidth: 300,
    height: "auto",
    whiteSpace: "pre-wrap",
  },

  quotedSideColorRight: {
    flex: "none",
    width: "4px",
    backgroundColor: "#35cd96",
  },

  messageActionsButton: {
    display: "none",
    position: "relative",
    color: "#999",
    zIndex: 1,
    backgroundColor: "inherit",
    opacity: "90%",
    "&:hover, &.Mui-focusVisible": { backgroundColor: "inherit" },
  },

  messageContactName: {
    display: "flex",
    color: "#6bcbef",
    fontWeight: 500,
  },

  textContentItem: {
    overflowWrap: "break-word",
    padding: "3px 80px 6px 6px",
  },

  captionLimit: {
    maxWidth: 400,
  },

  textContentItemDeleted: {
    fontStyle: "italic",
    color: "rgba(0, 0, 0, 0.36)",
    overflowWrap: "break-word",
    padding: "3px 80px 6px 6px",
  },

  messageMedia: {
    // ✅ CORREÇÃO: objectFit removido para vídeos funcionarem melhor
    // objectFit: "cover", // Removido pois pode causar problemas em vídeos
    width: 400,
    height: "auto",
    borderTopLeftRadius: 8,
    borderTopRightRadius: 8,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    // ✅ CORREÇÃO: Adicionar estilos específicos para vídeo
    "&[controls]": {
      objectFit: "contain", // Para vídeos, usar contain em vez de cover
    }
  },

  timestamp: {
    fontSize: 11,
    position: "absolute",
    bottom: 0,
    right: 5,
    color: "#999",
  },

  forwardMessage: {
    fontSize: 12,
    fontStyle: "italic",
    position: "absolute",
    top: 0,
    left: 5,
    color: "#999",
    display: "flex",
    alignItems: "center"
  },

  dailyTimestamp: {
    alignItems: "center",
    textAlign: "center",
    alignSelf: "center",
    width: "110px",
    backgroundColor: theme.mode === "dark" ? "rgba(255,255,255,0.1)" : "#e1f3fb",
    margin: "10px",
    borderRadius: "10px",
    boxShadow: theme.mode === "dark" ? "0 1px 1px rgba(0,0,0,0.5)" : "0 1px 1px #b3b3b3",
  },

  dailyTimestampText: {
    color: theme.mode === "dark" ? "#ccc" : "#808888",
    padding: 8,
    alignSelf: "center",
    marginLeft: "0px",
  },

  logPillWrapper: {
    display: "flex",
    justifyContent: "center",
    margin: "6px 0",
  },
  logPill: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "4px 12px",
    borderRadius: 14,
    fontSize: "0.78rem",
    backgroundColor: theme.mode === "dark" ? "rgba(255, 244, 200, 0.12)" : "#FFF8DC",
    color: theme.mode === "dark" ? "#f0e6b3" : "#7a6a1f",
    boxShadow: theme.mode === "dark" ? "0 1px 1px rgba(0,0,0,0.5)" : "0 1px 1px rgba(0,0,0,0.08)",
    border: theme.mode === "dark" ? "1px solid rgba(255,244,200,0.15)" : "1px solid #f0e6b3",
  },
  logPillTime: {
    fontSize: "0.72rem",
    color: theme.mode === "dark" ? "#d8c97f" : "#a8932f",
    marginLeft: 4,
  },

  ackIcons: {
    fontSize: 18,
    verticalAlign: "middle",
    marginLeft: 4,
  },

  deletedIcon: {
    fontSize: 18,
    verticalAlign: "middle",
    marginRight: 4,
  },

  ackDoneAllIcon: {
    color: blue[500],
    fontSize: 18,
    verticalAlign: "middle",
    marginLeft: 4,
  },

  ackPlayedIcon: {
    color: green[500],
    fontSize: 18,
    verticalAlign: "middle",
    marginLeft: 4,
  },
  downloadMedia: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "inherit",
    padding: 10,
    color: theme.mode === "light" ? theme.palette.light : theme.palette.dark,
  },

  messageCenter: {
    marginTop: 5,
    alignItems: "center",
    verticalAlign: "center",
    alignContent: "center",
    backgroundColor: "#E1F5FEEB",
    fontSize: "12px",
    minWidth: 100,
    maxWidth: 270,
    color: "#272727",
    borderTopLeftRadius: 0,
    borderTopRightRadius: 8,
    borderBottomLeftRadius: 8,
    borderBottomRightRadius: 8,
    paddingLeft: 5,
    paddingRight: 5,
    paddingTop: 5,
    paddingBottom: 0,
    boxShadow: "0 1px 1px #b3b3b3",
  },

  deletedMessage: {
    color: '#f55d65'
  }
}));

// Mensagem que TEM CARA de template, mesmo sem mediaType === "template".
//
// Automação, agendamento e campanha às vezes gravam o corpo no mesmo formato
// `texto||||[json de botões]` mas com outro mediaType. Nesses casos a tela não
// reconhecia como template e mostrava o JSON cru dos botões no meio da
// conversa. Este teste olha o FORMATO do corpo em vez de confiar só no rótulo.
const messageBodyLooksLikeTemplate = (message) =>
  typeof message?.body === "string" && /\|\|\|\|\s*\[/.test(message.body);

const reducer = (state, action) => {
  if (action.type === "LOAD_MESSAGES") {
    const messages = action.payload;
    const newMessages = [];

    messages.forEach((message) => {

      const messageIndex = state.findIndex((m) => m.id === message.id);
      if (messageIndex !== -1) {
        state[messageIndex] = message;
      } else {
        newMessages.push(message);
      }
    });

    return [...newMessages, ...state];
  }

  if (action.type === "ADD_MESSAGE") {
    const newMessage = action.payload;
    const messageIndex = state.findIndex((m) => m.id === newMessage.id);

    if (messageIndex !== -1) {
      state[messageIndex] = newMessage;
    } else {
      state.push(newMessage);
    }

    return [...state];
  }

  if (action.type === "UPDATE_MESSAGE") {
    const messageToUpdate = action.payload;
    const messageIndex = state.findIndex((m) => m.id === messageToUpdate.id);

    if (messageIndex !== -1) {
      state[messageIndex] = messageToUpdate;
    }

    return [...state];
  }

  if (action.type === "RESET") {
    return [];
  }
};

const MessagesList = ({
  isGroup,
  onDrop,
  whatsappId,
  queueId,
  channel,
  ticketStatus,
  numericTicketId,
}) => {
  const classes = useStyles();
  const [messagesList, dispatch] = useReducer(reducer, []);
  const [ticketLogs, setTicketLogs] = useState([]);
  const [pageNumber, setPageNumber] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const history = useHistory();
  const lastMessageRef = useRef();

  const [selectedMessage, setSelectedMessage] = useState({});
  const { setReplyingMessage } = useContext(ReplyMessageContext);
  const [anchorEl, setAnchorEl] = useState(null);
  const messageOptionsMenuOpen = Boolean(anchorEl);
  const { ticketId } = useParams();

  const currentTicketId = useRef(ticketId);
  const currentTicketMeta = useRef({
    contactId: null,
    whatsappId: null,
    isGroup: null,
  });
  const { getAll } = useCompanySettings();
  const [dragActive, setDragActive] = useState(false);
  const [dragTimeout, setDragTimeout] = useState(null);

  const [videoLoading, setVideoLoading] = useState(true);
  const [videoError, setVideoError] = useState(false);
  

  const [lgpdDeleteMessage, setLGPDDeleteMessage] = useState(false);
  const { selectedQueuesMessage } = useContext(QueueSelectedContext);

  // Hook simplificado para PDF
  const {
    downloadPdf,
    extractPdfInfoFromMessage,
    isPdfUrl
  } = usePdfViewer();

  const { showSelectMessageCheckbox } = useContext(ForwardMessageContext);
  const { user, socket } = useContext(AuthContext);
  const companyId = user.companyId;

  useEffect(() => {
    async function fetchData() {
      const settings = await getAll(companyId);

      let settinglgpdDeleteMessage;
      let settingEnableLGPD;

      for (const [key, value] of Object.entries(settings)) {
        if (key === "lgpdDeleteMessage") settinglgpdDeleteMessage = value
        if (key === "enableLGPD") settingEnableLGPD = value
      }
      if (settingEnableLGPD === "enabled" && settinglgpdDeleteMessage === "enabled") {
        setLGPDDeleteMessage(true);
      }
    }
    fetchData();
  }, [])

  useEffect(() => {
    dispatch({ type: "RESET" });
    setPageNumber(1);
    setTicketLogs([]);
    currentTicketId.current = ticketId;
  }, [ticketId, selectedQueuesMessage]);

  useEffect(() => {
    const logId = numericTicketId || ticketId;
    if (!logId || logId === "undefined") return;
    let cancelled = false;
    const fetchLogs = async () => {
      try {
        const { data } = await api.get(`/tickets-log/${logId}`);
        if (cancelled) return;
        const raw = Array.isArray(data) ? data : [];
        // Ordena ascendente por data e remove logs duplicados consecutivos
        // (mesmo tipo + mesmo usuário + mesma fila) dentro de 5 minutos.
        const sorted = [...raw].sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));
        const deduped = [];
        const seenKeys = new Map(); // key -> last timestamp
        for (const log of sorted) {
          const key = `${log.type}|${log?.user?.id || ""}|${log?.queue?.id || ""}`;
          const ts = new Date(log.createdAt).getTime();
          const last = seenKeys.get(key);
          if (last && ts - last < 5 * 60 * 1000) {
            continue; // ignora duplicado próximo
          }
          seenKeys.set(key, ts);
          deduped.push(log);
        }
        setTicketLogs(deduped);
      } catch (err) {
        // silencioso - histórico inline é complementar
      }
    };

    fetchLogs();
    return () => { cancelled = true; };
  }, [ticketId, numericTicketId, messagesList.length]);

  useEffect(() => {
    setLoading(true);
    const abortController = new AbortController();
    const delayDebounceFn = setTimeout(() => {
      const fetchMessages = async () => {
        if (ticketId === "undefined") {
          history.push("/tickets");
          return;
        }
        if (isNil(ticketId)) return;
        try {
          const { data } = await api.get("/messages/" + ticketId, {
            params: { pageNumber, selectedQueues: JSON.stringify(selectedQueuesMessage) },
            signal: abortController.signal,
          });

          if (currentTicketId.current === ticketId) {
            currentTicketMeta.current = {
              contactId: data?.ticket?.contactId ?? null,
              whatsappId: data?.ticket?.whatsappId ?? null,
              isGroup: data?.ticket?.isGroup ?? null,
            };
            dispatch({ type: "LOAD_MESSAGES", payload: data.messages });
            setHasMore(data.hasMore);
            setLoading(false);
            setLoadingMore(false);
          }

          if (pageNumber === 1 && data.messages.length > 1) {
            scrollToBottom();
          }
        } catch (err) {
          if (err.name === 'AbortError' || err.name === 'CanceledError') return;
          setLoading(false);
          toastError(err);
          setLoadingMore(false);
        }
      };

      fetchMessages();
    }, 500);
    return () => {
      clearTimeout(delayDebounceFn);
      abortController.abort();
    };
  }, [pageNumber, ticketId, selectedQueuesMessage]);

  // Ref to always have the current ticketId available inside socket handlers
  const ticketIdRef = useRef(ticketId);
  useEffect(() => {
    ticketIdRef.current = ticketId;
  }, [ticketId]);

  useEffect(() => {
    if (ticketId === "undefined" || !numericTicketId) {
      return;
    }

    const companyId = user.companyId;
    const socketRoomId = `${numericTicketId}`;

    const connectEventMessagesList = () => {
      socket.emit("joinChatBox", socketRoomId);
    }

    const reloadCurrentTicketMessages = () => {
      dispatch({ type: "RESET" });
      setPageNumber(1);
      setLoading(true);
    };

    const isRelatedTicketEvent = (eventTicket) => {
      const currentUuid = ticketIdRef.current;
      if (!eventTicket || eventTicket.uuid === currentUuid) {
        return false;
      }

      const { contactId, whatsappId, isGroup } = currentTicketMeta.current;

      return Boolean(
        contactId &&
        whatsappId &&
        contactId === eventTicket.contactId &&
        whatsappId === eventTicket.whatsappId &&
        isGroup === eventTicket.isGroup
      );
    };

    const onAppMessageMessagesList = (data) => {
      const currentUuid = ticketIdRef.current;

      if (data.action === "create" && data.ticket?.uuid === currentUuid) {
        dispatch({ type: "ADD_MESSAGE", payload: data.message });
        scrollToBottom();
        return;
      }

      if (data.action === "create" && isRelatedTicketEvent(data.ticket)) {
        reloadCurrentTicketMessages();
        return;
      }

      if (data.action === "update" && data?.message?.ticket?.uuid === currentUuid) {
        dispatch({ type: "UPDATE_MESSAGE", payload: data.message });
        return;
      }

      if (data.action === "update" && isRelatedTicketEvent(data?.message?.ticket)) {
        reloadCurrentTicketMessages();
        return;
      }

      if (data.action == "delete" && data.message?.ticket?.uuid === currentUuid) {
        dispatch({ type: "DELETE_MESSAGE", payload: data.messageId });
        return;
      }

      if (data.action === "delete" && isRelatedTicketEvent(data?.message?.ticket)) {
        reloadCurrentTicketMessages();
      }
    }
    // Emitir imediatamente caso o socket já esteja conectado
    socket.emit("joinChatBox", socketRoomId);

    socket.on("connect", connectEventMessagesList);
    socket.on(`company-${companyId}-appMessage`, onAppMessageMessagesList);

    // Re-join chatbox when mobile browser returns from background
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") {
        socket.emit("joinChatBox", socketRoomId);
        // Re-fetch messages lost while in background
        setTimeout(async () => {
          try {
            const currentUuid = ticketIdRef.current;
            const { data } = await api.get("/messages/" + currentUuid, {
              params: { pageNumber: 1, selectedQueues: JSON.stringify(selectedQueuesMessage) },
            });
            if (currentTicketId.current === currentUuid) {
              dispatch({ type: "LOAD_MESSAGES", payload: data.messages });
              scrollToBottom();
            }
          } catch (err) {
            console.warn("Failed to re-fetch messages on visibility change", err);
          }
        }, 1000);
      }
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);

    return () => {
      socket.emit("joinChatBoxLeave", socketRoomId)
      socket.off("connect", connectEventMessagesList);
      socket.off(`company-${companyId}-appMessage`, onAppMessageMessagesList);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };

  }, [ticketId, numericTicketId, socket, companyId]);

  useEffect(() => {
    return () => {
      if (dragTimeout) {
        clearTimeout(dragTimeout);
      }
    };
  }, [dragTimeout]);

  const loadMore = () => {
    if (loadingMore) return;
    setLoadingMore(true);
    setPageNumber((prevPageNumber) => prevPageNumber + 1);
  };

  const scrollToBottom = () => {
    const doScroll = () => {
      if (lastMessageRef.current) {
        lastMessageRef.current.scrollIntoView({ behavior: "instant", block: "end" });
      } else {
        const messagesList = document.getElementById("messagesList");
        if (messagesList) {
          messagesList.scrollTop = messagesList.scrollHeight;
        }
      }
    };
    // Scroll imediato + fallbacks para garantir que o DOM renderizou
    requestAnimationFrame(doScroll);
    setTimeout(doScroll, 50);
    setTimeout(doScroll, 150);
    setTimeout(doScroll, 400);
  };

  const handleScroll = (e) => {
    if (!hasMore) return;
    const { scrollTop } = e.currentTarget;

    if (scrollTop === 0) {
      document.getElementById("messagesList").scrollTop = 1;
    }

    if (loading) {
      return;
    }

    if (scrollTop < 50) {
      loadMore();
    }
  };

  const handleOpenMessageOptionsMenu = (e, message) => {
    setAnchorEl(e.currentTarget);
    setSelectedMessage(message);
  };

  const handleCloseMessageOptionsMenu = (e) => {
    setAnchorEl(null);
  };

  const hanldeReplyMessage = (e, message) => {
    setAnchorEl(null);
    setReplyingMessage(message);
  };

  const getBasename = (filepath) => {
    if (!filepath) return '';
    // Remove query strings e hashes
    const cleanPath = filepath.split('?')[0].split('#')[0];
    // Pega o último segmento após /
    const segments = cleanPath.split('/');
    return segments[segments.length - 1];
  };

  const checkMessageMedia = (message) => {
    const isAudioMessage = (message) => {
      if (message.mediaType === "audio") {
        return true;
      }

      if (message.mediaUrl) {
        const audioExtensions = ['.mp3', '.wav', '.ogg', '.m4a', '.aac', '.webm'];
        const url = message.mediaUrl.toLowerCase();
        const hasAudioExtension = audioExtensions.some(ext => url.includes(ext));

        if (hasAudioExtension) {
          return true;
        }
      }

      if (message.body && typeof message.body === 'string') {
        const body = message.body.toLowerCase();
        const isAudioBody = body.includes('áudio gravado') ||
          body.includes('audio_') ||
          body.includes('🎵') ||
          body.includes('arquivo de áudio') ||
          body.includes('mensagem de voz');

        if (isAudioBody) {
          return true;
        }
      }

      return false;
    };

    // Templates
    if (message.mediaType === "template" || messageBodyLooksLikeTemplate(message)) {
      return <Template message={message} />;
    }

    // Localização
    else if (message.mediaType === "locationMessage" && message.body.split('|').length >= 2) {
      let locationParts = message.body.split('|');
      let imageLocation = locationParts[0];
      let linkLocation = locationParts[1];
      let descriptionLocation = locationParts.length > 2 ? locationParts[2] : null;

      return <LocationPreview 
        image={imageLocation} 
        link={linkLocation} 
        description={descriptionLocation} 
      />;
    }

    // Contatos
    else if (message.mediaType === "contactMessage") {
      // Um vCard pode trazer VÁRIOS contatos (blocos BEGIN:VCARD...END:VCARD
      // concatenados). O parser anterior varria linha a linha procurando "+"
      // e "FN", o que dava dois problemas visíveis na conversa:
      //   1. número em formato waid= (sem "+") não era reconhecido, e a linha
      //      seguinte do cartão acabava exibida no lugar — era daí que saía
      //      "X-WA-BIZ-NAME" aparecendo como se fosse o telefone;
      //   2. só o primeiro contato aparecia (numbers={obj[0]?.number}).
      const raw = String(message.body || "");
      const cartoes = raw.match(/BEGIN:VCARD[\s\S]*?END:VCARD/g) || [raw];

      const contatos = cartoes
        .map(cartao => {
          // "FN:" puro só cobre o caso ideal. Cartões reais às vezes vêm
          // como "FN;CHARSET=UTF-8:Nome" ou com espaço/CRLF diferente, e
          // esse formato não batia no regex antigo — o nome saía vazio, o
          // fallback virava o número (ou coisa pior), e era um dos jeitos
          // do POST /contacts chegar no backend sem name preenchido.
          let nome = (cartao.match(/^FN(?:;[^:\n]*)?:(.*)$/m)?.[1] || "").trim();
          if (!nome) {
            // Sem FN, tenta montar o nome a partir do campo N (estrutura
            // "Sobrenome;Nome;Nome do meio;Prefixo;Sufixo").
            const nCampo = cartao.match(/^N(?:;[^:\n]*)?:(.*)$/m)?.[1] || "";
            nome = nCampo
              .split(";")
              .map(p => p.trim())
              .filter(Boolean)
              .join(" ")
              .trim();
          }
          // Cuidados com o formato real do vCard 3.0 do WhatsApp:
          //  - as linhas vêm prefixadas ("item1.TEL;waid=..."), então o
          //    regex não pode exigir TEL no início da linha;
          //  - o campo PHOTO;BASE64 é gigante e cheio de dígitos — se o
          //    regex escapar pra ele, sai lixo no lugar do telefone (era
          //    daí que vinham os "1" e "150" nos cartões vazios).
          const bruto =
            cartao.match(/waid=(\d+)/)?.[1] ||
            cartao.match(/^(?:[\w-]+\.)?TEL[^:\n]*:([^\n\r]+)/m)?.[1] ||
            "";
          const numero = bruto.replace(/[^\d+]/g, "").trim();
          return { nome, numero };
        })
        // O nome pode vir vazio (FN: sem valor) — nesse caso o cartão ainda
        // é válido e mostramos pelo telefone. O que não pode faltar é um
        // telefone plausível.
        .filter(c => c.numero.replace(/\D/g, "").length >= 8);

      if (contatos.length === 0) {
        return <VcardPreview
          contact=""
          numbers=""
          queueId={message?.ticket?.queueId}
          whatsappId={message?.ticket?.whatsappId}
          channel={channel}
        />;
      }

      // Vários contatos: um cartão por contato, em vez de descartar os demais.
      return (
        <>
          {contatos.map((c, i) => (
            <VcardPreview
              key={`${message.id}-vcard-${i}`}
              contact={c.nome}
              numbers={c.numero}
              queueId={message?.ticket?.queueId}
              whatsappId={message?.ticket?.whatsappId}
              channel={channel}
            />
          ))}
        </>
      );
    }

    else if (message.mediaType === "adMetaPreview") { // Adicionado para renderizar o componente de preview de anúncio
      // ✅ CORREÇÃO: Parse correto dos dados - formato: image|sourceUrl|title|body|messageUser
      let [image, sourceUrl, title, body, messageUser] = message.body.split('|');
      
      // Fallback para messageUser se não estiver presente
      if (!messageUser || messageUser.trim() === "") {
        messageUser = "Olá! Tenho interesse e queria mais informações, por favor.";
      }
      
      return <AdMetaPreview 
        image={image} 
        sourceUrl={sourceUrl} 
        title={title} 
        body={body} 
        messageUser={messageUser} 
      />;
    }

    else if (message.mediaType === "facebookPostPreview") { // ✅ NOVO: Preview de post do Facebook
      // Formato: image|url|title|body|comment
      let [image, sourceUrl, title, body, comment] = message.body.split('|');
      
      return <FacebookPostPreview 
        image={image} 
        sourceUrl={sourceUrl} 
        title={title} 
        body={body} 
        comment={comment} 
      />;
    }

    // PDF e Documentos - SÓ DOWNLOAD
    else if (isPdfUrl(message.mediaUrl, message.body, message.mediaType)) {
      
      // ✅ CORRIGIDO: Passar companyId para construir a URL correta
      const pdfInfo = extractPdfInfoFromMessage(message, companyId);

      return (
        <PdfPreview
          url={pdfInfo.url}
          filename={pdfInfo.filename}
          size={pdfInfo.size}
          mediaType={pdfInfo.mediaType}
          onDownload={(url, name) => {
            downloadPdf(url, name);
          }}
        />
      );
    }

    // Áudio
    else if (isAudioMessage(message)) {
      return (
        <div style={{
          width: '100%',
          maxWidth: '300px',
          padding: '8px',
          backgroundColor: 'transparent'
        }}>
          <AudioModal
            url={message.mediaUrl}
            message={message}
          />
        </div>
      );
    }

    // Imagens
    else if (message.mediaType === "image") {
      // ✅ CORRIGIDO: O mediaUrl já vem do backend com a URL completa construída pelo modelo Message
      // O modelo Message constrói: ${BACKEND_URL}/public/company${companyId}/${mediaUrl}
      // Se mediaUrl = "flow/logo-swl-plus.png", a URL final será: ${BACKEND_URL}/public/company1/flow/logo-swl-plus.png
      // Então não precisamos fazer nenhuma transformação aqui, apenas usar o mediaUrl diretamente
      const imageUrl = message.mediaUrl || '';
      return <ModalImageCors imageUrl={imageUrl} />;
    }

    // Figurinhas (stickers) — WEBP (às vezes animado). Sem esse caso, caía
    // no bloco de "documento genérico" abaixo e virava um card "[sticker]
    // Clique para baixar" em vez de aparecer inline como no WhatsApp de
    // verdade. <img> já reproduz WEBP animado nativamente, então basta
    // renderizar num tamanho parecido com o do app oficial (~140px).
    else if (message.mediaType === "sticker") {
      const stickerUrl = message.mediaUrl || '';
      return (
        <img
          src={stickerUrl}
          alt="sticker"
          style={{
            width: 140,
            height: 140,
            objectFit: "contain",
            display: "block",
            background: "transparent"
          }}
        />
      );
    }

    // Vídeos
    else if (message.mediaType === "video") {
      
      return (
        <div style={{ maxWidth: "400px", width: "100%", position: "relative" }}>
          {/* Loading indicator */}
          {videoLoading && !videoError && (
            <div style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%, -50%)",
              zIndex: 2,
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: "8px"
            }}>
              <CircularProgress size={30} />
              <Typography variant="caption" color="textSecondary">
                Carregando vídeo...
              </Typography>
            </div>
          )}
          
          {/* Vídeo player melhorado */}
          <video
            className={classes.messageMedia}
            src={message.mediaUrl}
            controls
            preload="metadata"
            playsInline
            style={{ 
              width: "100%", 
              height: "auto", 
              maxHeight: "300px",
              borderRadius: "8px",
              backgroundColor: "#f0f0f0",
              opacity: videoLoading ? 0.3 : 1,
              transition: "opacity 0.3s ease"
            }}
            onLoadStart={() => {
              setVideoLoading(true);
              setVideoError(false);
            }}
            onLoadedData={() => {
              setVideoLoading(false);
            }}
            onCanPlay={() => {
              setVideoLoading(false);
            }}
            onError={(e) => {
              console.error("❌ Erro ao carregar vídeo:", e);
              setVideoLoading(false);
              setVideoError(true);
            }}
          >
            {/* ✅ CORREÇÃO: Múltiplos formatos para compatibilidade */}
            <source src={message.mediaUrl} type="video/mp4" />
            <source src={message.mediaUrl} type="video/webm" />
            <source src={message.mediaUrl} type="video/ogg" />
            
            {/* Fallback para navegadores antigos */}
            Seu navegador não suporta reprodução de vídeo.
          </video>
          
          {/* Error state */}
          {videoError && (
            <div style={{ 
              padding: "20px", 
              textAlign: "center", 
              backgroundColor: "#f5f5f5",
              borderRadius: "8px",
              color: "#666",
              marginTop: "8px"
            }}>
              <Typography variant="body2" style={{ marginBottom: "12px" }}>
                ❌ Erro ao carregar vídeo
              </Typography>
              <Button
                startIcon={<GetApp />}
                onClick={() => {
                  const link = document.createElement('a');
                  link.href = message.mediaUrl;
                  link.download = message.body || 'video.mp4';
                  link.click();
                }}
                variant="outlined"
                size="small"
              >
                Baixar Vídeo
              </Button>
            </div>
          )}
        </div>
      );
    }

    // Documentos genéricos (ZIP, RAR, DOC, XLS, etc.)
    else if (message.mediaType === "document" || message.mediaType === "application" || message.mediaUrl) {
      // Determinar nome do arquivo
      const fileName = message.body || message.mediaUrl?.split('/').pop() || 'arquivo';
      
      // Determinar ícone baseado na extensão
      const getFileIcon = (name) => {
        const ext = (name || '').split('.').pop()?.toLowerCase();
        const iconMap = {
          zip: '🗜️', rar: '🗜️', '7z': '🗜️', tar: '🗜️', gz: '🗜️', bz2: '🗜️',
          doc: '📝', docx: '📝', odt: '📝', rtf: '📝', txt: '📝',
          xls: '📊', xlsx: '📊', ods: '📊', csv: '📊',
          ppt: '📽️', pptx: '📽️', odp: '📽️',
          exe: '⚙️', msi: '⚙️',
        };
        return iconMap[ext] || '📄';
      };
      
      const fileIcon = getFileIcon(fileName);
      const fileExt = (fileName || '').split('.').pop()?.toUpperCase() || 'ARQUIVO';
      
      
      return (
        <div style={{
          display: "flex",
          alignItems: "center",
          gap: "10px",
          padding: "10px 14px",
          borderRadius: "8px",
          backgroundColor: "rgba(0,0,0,0.04)",
          maxWidth: "320px",
          cursor: "pointer",
          transition: "background-color 0.2s",
        }}
          onClick={() => {
            if (message.mediaUrl) {
              const link = document.createElement('a');
              link.href = message.mediaUrl;
              link.download = fileName;
              link.target = '_blank';
              document.body.appendChild(link);
              link.click();
              document.body.removeChild(link);
            }
          }}
          onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.08)'}
          onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'rgba(0,0,0,0.04)'}
        >
          <span style={{ fontSize: "28px", lineHeight: 1 }}>{fileIcon}</span>
          <div style={{ flex: 1, minWidth: 0, overflow: "hidden" }}>
            <div style={{
              fontSize: "13px",
              fontWeight: 500,
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
              color: "inherit"
            }}>
              {fileName}
            </div>
            <div style={{ fontSize: "11px", color: "#667781", marginTop: "2px" }}>
              {fileExt} • Clique para baixar
            </div>
          </div>
          <GetApp style={{ color: "#667781", fontSize: "20px", flexShrink: 0 }} />
        </div>
      );
    }

    return null;
  };

  const renderMessageAck = (message) => {
    if (message.ack === 0) {
      return <AccessTime fontSize="small" className={classes.ackIcons} />;
    } else
      if (message.ack === 1) {
        return <Done fontSize="small" className={classes.ackIcons} />;
      } else
        if (message.ack === 2 || message.ack === 3) {
          return <DoneAll fontSize="small" className={classes.ackIcons} />;
        } else
          if (message.ack === 4) {
            return <DoneAll fontSize="small" className={message.mediaType === "audio" ? classes.ackPlayedIcon : classes.ackDoneAllIcon} />;
          } else
            if (message.ack === 5) {
              return <DoneAll fontSize="small" className={classes.ackDoneAllIcon} />
            }
  };

  const getLogLabel = (log) => {
    const userName = log?.user?.name || "";
    const queueName = log?.queue?.name || "";
    switch (log.type) {
      case "create": return i18n.t("ticketInlineLog.create", { user: userName });
      case "open": return i18n.t("ticketInlineLog.open", { user: userName });
      case "access": return null; // removido: mensagem de "entrou na conversa"
      case "transfered": return i18n.t("ticketInlineLog.transfered", { user: userName });
      case "receivedTransfer": return i18n.t("ticketInlineLog.receivedTransfer", { user: userName, queue: queueName });
      case "pending": return i18n.t("ticketInlineLog.pending", { user: userName });
      case "closed": return i18n.t("ticketInlineLog.closed", { user: userName });
      case "reopen": return i18n.t("ticketInlineLog.reopen", { user: userName });
      case "queue": return i18n.t("ticketInlineLog.queue", { queue: queueName });
      case "redirect": return i18n.t("ticketInlineLog.redirect", { queue: queueName });
      case "chatBot": return i18n.t("ticketInlineLog.chatBot");
      case "clientClosed": return i18n.t("ticketInlineLog.clientClosed");
      default: return null;
    }
  };

  const getLogIcon = (type) => {
    if (type === "closed" || type === "clientClosed") return "✓";
    if (type === "reopen" || type === "open") return "↻";
    if (type === "pending") return "⏱";
    if (type === "transfered" || type === "receivedTransfer" || type === "redirect") return "↪";
    return "•";
  };

  const renderInlineLogs = (message, index) => {
    if (!ticketLogs || ticketLogs.length === 0) return null;
    const currentTime = new Date(message.createdAt).getTime();
    const previousTime = index > 0
      ? new Date(messagesList[index - 1].createdAt).getTime()
      : 0;
    const logsToRender = ticketLogs.filter((log) => {
      if (!log?.createdAt) return false;
      const t = new Date(log.createdAt).getTime();
      return t > previousTime && t <= currentTime;
    });
    if (logsToRender.length === 0) return null;
    return logsToRender.map((log) => {
      const label = getLogLabel(log);
      if (!label) return null;
      return (
        <div key={`log-${log.id}`} className={classes.logPillWrapper}>
          <div className={classes.logPill}>
            <span>{getLogIcon(log.type)}</span>
            <span>{label}</span>
            <span className={classes.logPillTime}>
              {format(parseISO(log.createdAt), "HH:mm")}
            </span>
          </div>
        </div>
      );
    });
  };

  const renderTrailingLogs = () => {
    if (!ticketLogs || ticketLogs.length === 0 || messagesList.length === 0) return null;
    const lastTime = new Date(messagesList[messagesList.length - 1].createdAt).getTime();
    const logsToRender = ticketLogs.filter((log) => {
      if (!log?.createdAt) return false;
      return new Date(log.createdAt).getTime() > lastTime;
    });
    if (logsToRender.length === 0) return null;
    return logsToRender.map((log) => {
      const label = getLogLabel(log);
      if (!label) return null;
      return (
        <div key={`log-trail-${log.id}`} className={classes.logPillWrapper}>
          <div className={classes.logPill}>
            <span>{getLogIcon(log.type)}</span>
            <span>{label}</span>
            <span className={classes.logPillTime}>
              {format(parseISO(log.createdAt), "HH:mm")}
            </span>
          </div>
        </div>
      );
    });
  };

  const renderDailyTimestamps = (message, index) => {
    const today = format(new Date(), "dd/MM/yyyy")

    if (index === 0) {
      return (
        <span
          className={classes.dailyTimestamp}
          key={`timestamp-${message.id}`}
        >
          <div className={classes.dailyTimestampText}>
            {today === format(parseISO(messagesList[index].createdAt), "dd/MM/yyyy") ? i18n.t("chatMessages.today") : format(parseISO(messagesList[index].createdAt), "dd/MM/yyyy")}
          </div>
        </span>
      );
    } else if (index > 0) {
        let messageDay = parseISO(messagesList[index].createdAt);
        let previousMessageDay = parseISO(messagesList[index - 1].createdAt);

        if (!isSameDay(messageDay, previousMessageDay)) {
          return (
            <span
              className={classes.dailyTimestamp}
              key={`timestamp-${message.id}`}
            >
              <div className={classes.dailyTimestampText}>
                {today === format(parseISO(messagesList[index].createdAt), "dd/MM/yyyy") ? i18n.t("chatMessages.today") : format(parseISO(messagesList[index].createdAt), "dd/MM/yyyy")}
              </div>
            </span>
          );
        }
      }
  };

  const renderTicketsSeparator = (message, index) => {
    let lastTicket = messagesList[index - 1]?.ticketId;
    let currentTicket = message.ticketId;

    if (lastTicket !== currentTicket && lastTicket !== undefined) {
      const buildProtocol = (msg) => {
        try {
          const created = msg?.ticket?.createdAt || msg?.createdAt;
          const id = msg?.ticketId;
          if (!created || !id) return null;
          const d = new Date(created);
          if (isNaN(d.getTime())) return null;
          const yyyy = d.getFullYear();
          const mm = String(d.getMonth() + 1).padStart(2, "0");
          const dd = String(d.getDate()).padStart(2, "0");
          return `${yyyy}${mm}${dd}${String(id).padStart(6, "0")}`;
        } catch {
          return null;
        }
      };
      const protocol = buildProtocol(message);
      const ticketTime = message?.ticket?.createdAt || message?.createdAt;
      const timeLabel = ticketTime ? format(parseISO(ticketTime), "HH:mm") : null;
      const queueName = message?.ticket?.queue?.name || i18n.t("ticketsList.noQueue");
      return (
        <span className={classes.currentTick} key={`timestamp-${message.id}a`}>
          <div className={classes.currentTicktText}>
            <span>↻</span>
            <span>
              #{i18n.t("ticketsList.called")} {message?.ticketId}
              <span className={classes.currentTickSep}> • </span>
              {queueName}
            </span>
            {protocol && (
              <span className={classes.currentTickBadge}>
                Protocolo {protocol}
              </span>
            )}
            {timeLabel && (
              <span className={classes.currentTickTime}>{timeLabel}</span>
            )}
          </div>
        </span>
      );
    }

  };

  const renderMessageDivider = (message, index) => {
    if (index < messagesList.length && index > 0) {
      let messageUser = messagesList[index].fromMe;
      let previousMessageUser = messagesList[index - 1].fromMe;
      if (messageUser !== previousMessageUser) {
        return (

          <span style={{ marginTop: 16 }} key={`divider-${message.id}`}></span>
        );
      }
    }
  };

  const renderQuotedMessage = (message) => {

    return (
      <div
        className={clsx(classes.quotedContainerLeft, {
          [classes.quotedContainerRight]: message.fromMe,
        })}
      >
        <span
          className={clsx(classes.quotedSideColorLeft, {
            [classes.quotedSideColorRight]: message.quotedMsg?.fromMe,
          })}
        ></span>
        <div className={classes.quotedMsg}>
          {!message.quotedMsg?.fromMe && (
            <span className={classes.messageContactName}>
              {message.quotedMsg?.contact?.name}
            </span>
          )}

          {message.quotedMsg.mediaType === "audio"
            && (
              <div className={classes.downloadMedia}>
                <AudioModal url={message.quotedMsg.mediaUrl} />
              </div>
            )
          }
          {message.quotedMsg.mediaType === "video"
            && (
              <div style={{ maxWidth: "300px", width: "100%" }}>
                <video
                  className={classes.messageMedia}
                  src={message.quotedMsg.mediaUrl}
                  controls
                  preload="metadata"
                  style={{ 
                    width: "100%", 
                    height: "auto", 
                    maxHeight: "200px",
                    borderRadius: "6px",
                    backgroundColor: "#f0f0f0"
                  }}
                  onError={(e) => {
                    console.error("❌ Erro ao carregar vídeo citado:", e);
                  }}
                >
                  <source src={message.quotedMsg.mediaUrl} type="video/mp4" />
                  <source src={message.quotedMsg.mediaUrl} type="video/webm" />
                  <source src={message.quotedMsg.mediaUrl} type="video/ogg" />
                  <div style={{ padding: "10px", textAlign: "center", fontSize: "12px", color: "#999" }}>
                    ❌ Erro ao carregar vídeo
                  </div>
                </video>
              </div>
            )
          }
          {message.quotedMsg.mediaType === "contactMessage"
            && (
              "Contato"
            )
          }
          {(message.quotedMsg.mediaType === "application" || message.quotedMsg.mediaType === "document")
            && (
              <div className={classes.downloadMedia}>
                <Button
                  startIcon={<GetApp />}
                  variant="outlined"
                  target="_blank"
                  href={message.quotedMsg.mediaUrl}
                >
                  Download
                </Button>
              </div>
            )
          }

          {message.quotedMsg.mediaType === "image"
            && (
              <ModalImageCors imageUrl={message.quotedMsg.mediaUrl} />)
            || message.quotedMsg?.body}

          {!message.quotedMsg.mediaType === "image" && message.quotedMsg?.body}

        </div>
      </div>
    );
  };

  const handleDrag = event => {
    event.preventDefault();
    event.stopPropagation();

    if (event.type === "dragenter" || event.type === "dragover") {
      const hasFiles = event.dataTransfer &&
        event.dataTransfer.types &&
        (event.dataTransfer.types.includes('Files') ||
          event.dataTransfer.types.includes('application/x-moz-file'));

      if (hasFiles) {
        if (dragTimeout) {
          clearTimeout(dragTimeout);
        }

        const timeout = setTimeout(() => {
          if (event.dataTransfer.items && event.dataTransfer.items.length > 0) {
            setDragActive(true);
          }
        }, 100);

        setDragTimeout(timeout);
      }
    } else if (event.type === "dragleave") {
      if (dragTimeout) {
        clearTimeout(dragTimeout);
        setDragTimeout(null);
      }

      const rect = event.currentTarget.getBoundingClientRect();
      const x = event.clientX;
      const y = event.clientY;

      if (x < rect.left || x > rect.right || y < rect.top || y > rect.bottom) {
        setDragActive(false);
      }
    }
  }

  const isYouTubeLink = (url) => {
    const youtubeRegex = /(?:youtube\.com\/(?:[^\/\n\s]+\/\S+\/|(?:v|e(?:mbed)?)\/|\S*?[?&]v=)|youtu\.be\/)([a-zA-Z0-9_-]{11})/;
    return youtubeRegex.test(url);
  };

  const handleDrop = event => {
    event.preventDefault();
    event.stopPropagation();

    if (dragTimeout) {
      clearTimeout(dragTimeout);
      setDragTimeout(null);
    }

    setDragActive(false);

    if (event.dataTransfer.files &&
      event.dataTransfer.files.length > 0 &&
      event.dataTransfer.files[0] instanceof File) {
      if (onDrop) {
        onDrop(event.dataTransfer.files);
      }
    }
  }
  const xmlRegex = /<([^>]+)>/g;
  const boldRegex = /\*(.*?)\*/g;

  const formatXml = (xmlString) => {
    // Verifica se o XML contém a assinatura com nome do atendente
    if (boldRegex.test(xmlString)) {
      // Formata o texto dentro da assinatura em negrito
      xmlString = xmlString.replace(boldRegex, "**$1**");
    }
    return xmlString;
  };

  const renderMessages = () => {

    if (messagesList.length > 0) {
      const viewMessagesList = messagesList.map((message, index) => {
        // mediaType "call" = card de chamada recebida via WhatsApp Plus/SIP
        // (ver HandleWacallsCall.ts, body fixo "📞 Chamada recebida" em
        // português) — diferente de "call_log" (chamada perdida do Baileys),
        // essa aqui é sempre uma ligação que TOCOU/foi recebida, não perdida,
        // por isso ícone verde e texto próprio em vez de reaproveitar
        // ticketsList.missedCall. Antes caía direto pro balão de texto
        // genérico com o body cru em português fixo, sem respeitar o idioma
        // configurado.
        if (message.mediaType === "call") {
          return (
            <React.Fragment key={message.id}>
              {renderDailyTimestamps(message, index)}
              {renderTicketsSeparator(message, index)}
              {renderMessageDivider(message, index)}
              {renderInlineLogs(message, index)}
              <div className={classes.messageCenter}>
                <IconButton
                  variant="contained"
                  size="small"
                  id="messageActionsButton"
                  disabled={message.isDeleted}
                  className={classes.messageActionsButton}
                  onClick={(e) => handleOpenMessageOptionsMenu(e, message)}
                >
                  <ExpandMore />
                </IconButton>
                {isGroup && (
                  <span className={classes.messageContactName}>
                    {message.contact?.name}
                  </span>
                )}

                <div>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 17" width="20" height="17">
                    <path fill="#25d366" d="M18.2 12.1c-1.5-1.8-5-2.7-8.2-2.7s-6.7 1-8.2 2.7c-.7.8-.3 2.3.2 2.8.2.2.3.3.5.3 1.4 0 3.6-.7 3.6-.7.5-.2.8-.5.8-1v-1.3c.7-1.2 5.4-1.2 6.4-.1l.1.1v1.3c0 .2.1.4.2.6.1.2.3.3.5.4 0 0 2.2.7 3.6.7.2 0 1.4-2 .5-3.1zM5.4 3.2l4.7 4.6 5.8-5.7-.9-.8L10.1 6 6.4 2.3h2.5V1H4.1v4.8h1.3V3.2z"></path>
                  </svg> <span>{i18n.t("hardcoded.incomingCall")} {format(parseISO(message.createdAt), "HH:mm")}</span>
                </div>
              </div>
            </React.Fragment>
          );
        }

        if (message.mediaType === "call_log") {
          return (
            <React.Fragment key={message.id}>
              {renderDailyTimestamps(message, index)}
              {renderTicketsSeparator(message, index)}
              {renderMessageDivider(message, index)}
              {renderInlineLogs(message, index)}
              <div className={classes.messageCenter}>
                <IconButton
                  variant="contained"
                  size="small"
                  id="messageActionsButton"
                  disabled={message.isDeleted}
                  className={classes.messageActionsButton}
                  onClick={(e) => handleOpenMessageOptionsMenu(e, message)}
                >
                  <ExpandMore />
                </IconButton>
                {isGroup && (
                  <span className={classes.messageContactName}>
                    {message.contact?.name}
                  </span>
                )}

                <div>
                  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 17" width="20" height="17">
                    <path fill="#df3333" d="M18.2 12.1c-1.5-1.8-5-2.7-8.2-2.7s-6.7 1-8.2 2.7c-.7.8-.3 2.3.2 2.8.2.2.3.3.5.3 1.4 0 3.6-.7 3.6-.7.5-.2.8-.5.8-1v-1.3c.7-1.2 5.4-1.2 6.4-.1l.1.1v1.3c0 .2.1.4.2.6.1.2.3.3.5.4 0 0 2.2.7 3.6.7.2 0 1.4-2 .5-3.1zM5.4 3.2l4.7 4.6 5.8-5.7-.9-.8L10.1 6 6.4 2.3h2.5V1H4.1v4.8h1.3V3.2z"></path>
                  </svg> <span>{i18n.t("ticketsList.missedCall")} {format(parseISO(message.createdAt), "HH:mm")}</span>
                </div>
              </div>
            </React.Fragment>
          );
        }

        if (!message.fromMe) {
          return (
            <React.Fragment key={message.id}>
              {renderDailyTimestamps(message, index)}
              {renderTicketsSeparator(message, index)}
              {renderMessageDivider(message, index)}
              {renderInlineLogs(message, index)}
              <div
                className={classes.messageLeft}
                title={message.queueId && message.queue?.name}
                onDoubleClick={(e) => hanldeReplyMessage(e, message)}
              >
                {showSelectMessageCheckbox && (
                  <SelectMessageCheckbox
                    message={message}
                  />
                )}
                <IconButton
                  variant="contained"
                  size="small"
                  id="messageActionsButton"
                  disabled={message.isDeleted}
                  className={classes.messageActionsButton}
                  onClick={(e) => handleOpenMessageOptionsMenu(e, message)}
                >
                  <ExpandMore />
                </IconButton>

                {message.isForwarded && (
                  <div>
                    <span className={classes.forwardMessage}
                    ><Reply style={{ color: "grey", transform: 'scaleX(-1)' }} /> Encaminhada
                    </span>
                    <br />
                  </div>
                )}
                {isGroup && (
                  <span className={classes.messageContactName}>
                    {message.contact?.name}
                  </span>
                )}
                {isYouTubeLink(message.body) && (
                  <>
                    <YouTubePreview videoUrl={message.body} />
                  </>
                )}

                {!lgpdDeleteMessage && message.isDeleted && (
                  <div>
                    <span className={classes.deletedMessage}
                    >🚫 Este mensaje fue eliminado por el contacto &nbsp;
                    </span>
                  </div>
                )}

                {(message.mediaUrl || message.mediaType === "locationMessage" || message.mediaType === "contactMessage" || message.mediaType === "template" || message.mediaType === "adMetaPreview" || message.mediaType === "facebookPostPreview" || messageBodyLooksLikeTemplate(message)
                ) && checkMessageMedia(message)}

                <div className={clsx(classes.textContentItem, {
                  [classes.textContentItemDeleted]: message.isDeleted,
                  [classes.captionLimit]: message.mediaType === "image" || message.mediaType === "video",
                })}>
                  {message.quotedMsg && renderQuotedMessage(message)}
                  {(message.mediaType === "buttonsResponseMessage" || message.mediaType === "listResponseMessage" || message.mediaType === "messageContextInfo") && !message.isDeleted && (
                    <div style={{
                      display: "flex",
                      alignItems: "center",
                      gap: "4px",
                      marginBottom: "2px",
                      fontSize: "11px",
                      color: "#667781",
                      fontStyle: "italic",
                    }}>
                      <span>📌 {i18n.t("messagesList.opcaoSelecionada", "Selecionou:")}</span>
                      <span style={{ fontWeight: "bold", color: "#1d6f42" }}>{message.body}</span>
                    </div>
                  )}
                  {
                    message.mediaType !== "adMetaPreview" && message.mediaType !== "facebookPostPreview" &&
                    message.mediaType !== "buttonsResponseMessage" && message.mediaType !== "listResponseMessage" && message.mediaType !== "messageContextInfo" && (
                      (message.mediaUrl !== null && (message.mediaType === "image" || message.mediaType === "video") && getBasename(message.mediaUrl).trim() !== message.body.trim()) ||
                      message.mediaType !== "audio" &&
                      message.mediaType !== "image" &&
                      message.mediaType !== "video" &&
                      message.mediaType !== "sticker" &&
                      message.mediaType != "reactionMessage" &&
                      message.mediaType != "locationMessage" &&
                      message.mediaType !== "contactMessage" &&
                      message.mediaType !== "template" &&
                      !messageBodyLooksLikeTemplate(message)
                    ) && (
                      <>
                        {xmlRegex.test(message.body) && (
                          <span>{message.body}</span>

                        )}
                        {!xmlRegex.test(message.body) && (
                          ((lgpdDeleteMessage && message.isDeleted)
                            ? <MarkdownWrapper>🚫 _Mensaje eliminado_ </MarkdownWrapper>
                            : renderInteractiveOrMarkdown(message.body)
                          )
                        )}

                      </>

                    )}

                  {message.quotedMsg && message.mediaType === "reactionMessage" && (
                    <>
                      <span style={{ marginLeft: "0px" }}>
                        <MarkdownWrapper>
                          {"" + message?.contact?.name + " reaccionó... " + message.body}
                        </MarkdownWrapper>
                      </span>
                    </>
                  )}

                  <span className={classes.timestamp}>
                    {message.isEdited ? "Editada " + format(parseISO(message.createdAt), "HH:mm") : format(parseISO(message.createdAt), "HH:mm")}
                  </span>
                </div>
              </div>
            </React.Fragment>
          );
        } else {
          return (
            <React.Fragment key={message.id}>
              {renderDailyTimestamps(message, index)}
              {renderTicketsSeparator(message, index)}
              {renderMessageDivider(message, index)}
              {renderInlineLogs(message, index)}
              <div
                className={message.isPrivate ? classes.messageRightPrivate : classes.messageRight}
                title={message.queueId && message.queue?.name}
                onDoubleClick={(e) => hanldeReplyMessage(e, message)}
              >
                {showSelectMessageCheckbox && (
                  <SelectMessageCheckbox
                    message={message}
                  />
                )}

                <IconButton
                  variant="contained"
                  size="small"
                  id="messageActionsButton"
                  disabled={message.isDeleted}
                  className={classes.messageActionsButton}
                  onClick={(e) => handleOpenMessageOptionsMenu(e, message)}
                >
                  <ExpandMore />
                </IconButton>
                {message.isForwarded && (
                  <div>
                    <span className={classes.forwardMessage}
                    ><Reply style={{ color: "grey", transform: 'scaleX(-1)' }} /> Reenviada
                    </span>
                    <br />
                  </div>
                )}
                {/* Cabeçalho com nome do atendente removido para evitar assinatura duplicada.
                    A assinatura oficial do sistema é adicionada no corpo da mensagem (*Nome:*)
                    quando a configuração sendSignMessage estiver habilitada. */}

                {isYouTubeLink(message.body) && (
                  <>
                    <YouTubePreview videoUrl={message.body} />
                  </>
                )}
                {!lgpdDeleteMessage && message.isDeleted && (
                  <div>
                    <span className={classes.deletedMessage}
                    >🚫 Este mensaje fue eliminado &nbsp;
                    </span>
                  </div>
                )}
                {(message.mediaUrl || message.mediaType === "locationMessage" || message.mediaType === "contactMessage" || message.mediaType === "template" || message.mediaType === "adMetaPreview" || message.mediaType === "facebookPostPreview" || messageBodyLooksLikeTemplate(message)
                ) && checkMessageMedia(message)}
                <div
                  className={clsx(classes.textContentItem, {
                    [classes.textContentItemDeleted]: message.isDeleted,
                    [classes.captionLimit]: message.mediaType === "image" || message.mediaType === "video",
                  })}
                >

                  {message.quotedMsg && renderQuotedMessage(message)}

                  {
                    ((message.mediaType === "image" || message.mediaType === "video") && getBasename(message.mediaUrl) === message.body) ||
                    (message.mediaType !== "audio" && message.mediaType !== "sticker" && message.mediaType != "reactionMessage" && message.mediaType != "locationMessage" && message.mediaType !== "contactMessage" && message.mediaType !== "template" && message.mediaType !== "adMetaPreview" && message.mediaType !== "facebookPostPreview" && message.mediaType !== "buttonsResponseMessage" && message.mediaType !== "listResponseMessage" && message.mediaType !== "messageContextInfo" && !messageBodyLooksLikeTemplate(message)) && (
                      <>
                        {xmlRegex.test(message.body) && (
                          <div>{formatXml(message.body)}</div>

                        )}
                        {!xmlRegex.test(message.body) && renderInteractiveOrMarkdown(message.body)}

                      </>
                    )}

                  {message.quotedMsg && message.mediaType === "reactionMessage" && (
                    <>
                      <span style={{ marginLeft: "0px" }}>
                        <MarkdownWrapper>
                          {"Reaccionaste... " + message.body}
                        </MarkdownWrapper>
                      </span>
                    </>
                  )}

                  <span className={classes.timestamp}>
                    {message.isEdited ? "Editada " + format(parseISO(message.createdAt), "HH:mm") : format(parseISO(message.createdAt), "HH:mm")}
                    {renderMessageAck(message)}
                  </span>
                </div>
              </div>
            </React.Fragment>
          );
        }
      });
      return [...viewMessagesList, renderTrailingLogs()];
    } else {
      return <div>Diga olá para seu novo contato!</div>;
    }
  };
const shouldBlurMessages = ticketStatus === "pending" && user.allowSeeMessagesInPendingTickets === "disabled";

  return (
    <div className={classes.messagesListWrapper} onDragEnter={handleDrag}>
      {dragActive && <div className={classes.dragElement} onDragEnter={handleDrag} onDragLeave={handleDrag} onDragOver={handleDrag} onDrop={handleDrop}>Solte o arquivo aqui</div>}
      <MessageOptionsMenu
        message={selectedMessage}
        anchorEl={anchorEl}
        menuOpen={messageOptionsMenuOpen}
        handleClose={handleCloseMessageOptionsMenu}
        isGroup={isGroup}
        whatsappId={whatsappId}
        queueId={queueId}
        channel={channel}
      />
      

<div
  id="messagesList"
  className={classes.messagesList}
  onScroll={handleScroll}
  style={{
    filter: shouldBlurMessages ? "blur(4px)" : "none",
    pointerEvents: shouldBlurMessages ? "none" : "auto"
  }}
>
  {messagesList.length > 0 ? renderMessages() : []}
  <div ref={lastMessageRef} style={{ float: "left", clear: "both" }} />
</div>

      {(channel !== "whatsapp" && channel !== undefined && channel !== "whatsapp_oficial" && channel !== "telegram" && channel !== "webchat" && channel !== "wacalls") && (
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "8px",
            padding: "10px 20px",
            margin: "8px auto",
            maxWidth: "90%",
            backgroundColor: "#E1F3FB",
            borderRadius: "24px",
            fontSize: "13px",
            color: "#0C5460",
            fontWeight: 500,
            textAlign: "center",
          }}
        >
          {channel === "facebook" ? (
            <Facebook style={{ fontSize: 18 }} />
          ) : channel === "instagram" ? (
            <Instagram style={{ fontSize: 18 }} />
          ) : (
            <WhatsApp style={{ fontSize: 18 }} />
          )}

          <span>
            Você tem 24h para responder após receber uma mensagem, de acordo
            com as políticas da Meta.
          </span>
        </div>
      )}
      
      {loading && (
        <div>
          <CircularProgress className={classes.circleLoading} />
        </div>
      )}
    </div>
  );
};

export default MessagesList;
