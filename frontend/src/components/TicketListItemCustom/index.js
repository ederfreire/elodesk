import React, {
  useState,
  useEffect,
  useRef,
  useContext,
  useCallback,
  useMemo,
} from "react";

import { useHistory, useParams } from "react-router-dom";
import parseISO from "date-fns/parseISO";
import format from "date-fns/format";
import formatDistanceToNow from "date-fns/formatDistanceToNow";
import ptBR from "date-fns/locale/pt-BR";
import esLocale from "date-fns/locale/es";
import enUS from "date-fns/locale/en-US";
import clsx from "clsx";

import { makeStyles, useTheme } from "@material-ui/core/styles";
import green from "@material-ui/core/colors/green";
import grey from "@material-ui/core/colors/grey";
import { i18n } from "../../translate/i18n";

import api from "../../services/api";
import ButtonWithSpinner from "../ButtonWithSpinner";
import MarkdownWrapper from "../MarkdownWrapper";
import { Tooltip, Popover } from "@material-ui/core";
import { AuthContext } from "../../context/Auth/AuthContext";
import { TicketsContext } from "../../context/Tickets/TicketsContext";
import toastError from "../../errors/toastError";
import { v4 as uuidv4 } from "uuid";

import GroupIcon from "@material-ui/icons/Group";
import ContactTag from "../ContactTag";
import ConnectionIcon from "../ConnectionIcon";
import AcceptTicketWithouSelectQueue from "../AcceptTicketWithoutQueueModal";
import TransferTicketModalCustom from "../TransferTicketModalCustom";
import ShowTicketOpen from "../ShowTicketOpenModal";
import FinalizacaoVendaModal from "../FinalizacaoVendaModal";
import CloseTicketModal from "../CloseTicketModal";
import { isNil } from "lodash";
import { toast } from "react-toastify";
import Done from "@material-ui/icons/Done";
import HighlightOff from "@material-ui/icons/HighlightOff";
import SwapHoriz from "@material-ui/icons/SwapHoriz";
import VisibilityIcon from "@material-ui/icons/Visibility";
import WhatsAppIcon from "@material-ui/icons/WhatsApp";
import VerifiedIcon from "@material-ui/icons/VerifiedUser";
import PersonIcon from "@material-ui/icons/Person";
import useCompanySettings from "../../hooks/useSettings/companySettings";
import NewTicketModal from "../NewTicketModal";
import { Avatar, Badge, ListItemAvatar, ListItem, Typography, Dialog, DialogTitle, DialogActions, Button, DialogContent } from "@material-ui/core";

const useStyles = makeStyles((theme) => ({
  "@keyframes ticketSlideIn": {
    "0%": {
      opacity: 0,
      transform: "translateY(8px)",
    },
    "100%": {
      opacity: 1,
      transform: "translateY(0)",
    },
  },
  ticket: {
    position: "relative",
    borderRadius: "12px",
    margin: "4px 0",
    width: "100%",
    boxSizing: "border-box",
    padding: "10px 12px !important",
    overflow: "visible",
    transition: "all 0.2s ease",
    animation: "$ticketSlideIn 0.35s ease-out both",
    backgroundColor: theme.mode === "light" ? "#ffffff" : "#141428",
    border: theme.mode === "light" ? "1px solid #f0eeff" : "1px solid #2d2b55",
    "&:hover": {
      backgroundColor: theme.mode === "light" ? "#f8f7ff" : "#1a1a2e",
      boxShadow: "0 2px 8px rgba(108, 92, 231, 0.15)",
    },
    "&.Mui-selected": {
      backgroundColor: theme.mode === "light" ? "#ece9ff" : "#2d2b55",
      borderColor: theme.mode === "light" ? "#6c5ce7" : "#a29bfe",
      "&:hover": {
        backgroundColor: theme.mode === "light" ? "#e0dcff" : "#35336b",
      },
    },
  },

  pendingTicket: {
    cursor: "unset",
    borderLeft: "3px solid #f39c12",
  },
  queueTag: {
    background: "#FCFCFC",
    color: "#000",
    marginRight: 1,
    padding: 1,
    fontWeight: "bold",
    borderRadius: 3,
    fontSize: "0.5em",
    whiteSpace: "nowrap",
  },
  noTicketsDiv: {
    display: "flex",
    height: "100px",
    margin: 40,
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
  },
  newMessagesCount: {
    justifySelf: "flex-end",
    textAlign: "right",
    position: "relative",
    top: 0,
    color: "#6c5ce7",
    fontWeight: "bold",
    marginRight: "10px",
    borderRadius: 0,
  },
  noTicketsText: {
    textAlign: "center",
    color: "rgb(104, 121, 146)",
    fontSize: "14px",
    lineHeight: "1.4",
  },
  connectionTag: {
    color: "#FFF",
    marginRight: 4,
    padding: "2px 8px",
    fontWeight: "600",
    borderRadius: "6px",
    fontSize: "0.65em",
    letterSpacing: "0.3px",
    display: "inline-block",
    lineHeight: "1.4",
  },
  noTicketsTitle: {
    textAlign: "center",
    fontSize: "16px",
    fontWeight: "600",
    margin: "0px",
  },

  contactNameWrapper: {
    display: "flex",
    justifyContent: "space-between",
    marginLeft: "5px",
    fontWeight: "600",
    color: theme.mode === "light" ? "#2d2b55" : "#e0e0e0",
  },

  lastMessageTime: {
    justifySelf: "flex-end",
    textAlign: "right",
    position: "relative",
    top: -30,
    marginRight: "1px",
    color: theme.mode === "light" ? "#888" : grey[400],
    fontSize: "0.75rem",
  },

  lastMessageTimeUnread: {
    justifySelf: "flex-end",
    textAlign: "right",
    position: "relative",
    top: -30,
    color: "#6c5ce7",
    fontWeight: "bold",
    marginRight: "1px",
    fontSize: "0.75rem",
  },

  closedBadge: {
    alignSelf: "center",
    justifySelf: "flex-end",
    marginRight: 32,
    marginLeft: "auto",
  },

  contactLastMessage: {
    paddingRight: "0%",
    marginLeft: "5px",
    color: theme.mode === "light" ? "#777" : grey[400],
    fontSize: "0.85rem",
  },

  contactLastMessageUnread: {
    paddingRight: 20,
    fontWeight: "bold",
    color: theme.mode === "light" ? "#2d2b55" : grey[300],
    fontSize: "0.85rem",
  },

  badgeStyle: {
    color: "white",
    backgroundColor: "#6c5ce7",
    fontWeight: "700",
    fontSize: "0.7rem",
    minWidth: "20px",
    height: "20px",
    borderRadius: "10px",
  },

  acceptButton: {
  },

  actionBtn: {
    backgroundColor: "transparent",
    boxShadow: "none",
    border: "none",
    padding: "6px",
    borderRadius: "10px",
    minWidth: "32px",
    width: "32px",
    height: "32px",
    fontSize: "0.6rem",
    transition: "all 0.2s cubic-bezier(0.4, 0, 0.2, 1)",
    "& .MuiSvgIcon-root": {
      fontSize: "1.15rem",
    },
    "&:hover": {
      transform: "scale(1.15)",
    },
    "&:active": {
      transform: "scale(0.92)",
    },
  },
  actionBtnAccept: {
    color: "#22C55E",
    backgroundColor: "rgba(34, 197, 94, 0.08)",
    "&:hover": {
      color: "#16A34A",
      backgroundColor: "rgba(34, 197, 94, 0.18)",
      boxShadow: "0 2px 8px rgba(34, 197, 94, 0.25)",
    },
  },
  actionBtnTransfer: {
    color: "#6c5ce7",
    backgroundColor: "rgba(108, 92, 231, 0.08)",
    "&:hover": {
      color: "#5a4bd1",
      backgroundColor: "rgba(108, 92, 231, 0.18)",
      boxShadow: "0 2px 8px rgba(108, 92, 231, 0.25)",
    },
  },
  actionBtnClose: {
    color: "#EF4444",
    backgroundColor: "rgba(239, 68, 68, 0.08)",
    "&:hover": {
      color: "#DC2626",
      backgroundColor: "rgba(239, 68, 68, 0.18)",
      boxShadow: "0 2px 8px rgba(239, 68, 68, 0.25)",
    },
  },
  actionBtnSpy: {
    color: "#3B82F6",
    backgroundColor: "rgba(59, 130, 246, 0.08)",
    "&:hover": {
      color: "#2563EB",
      backgroundColor: "rgba(59, 130, 246, 0.18)",
      boxShadow: "0 2px 8px rgba(59, 130, 246, 0.25)",
    },
  },

  ticketQueueColor: {
    flex: "none",
    height: "100%",
    position: "absolute",
    top: "0%",
    left: "0%",
    borderRadius: "12px 0 0 12px",
  },

  ticketInfo: {
    position: "relative",
    top: -13,
  },
  secondaryContentSecond: {
    display: "flex",
    alignItems: "flex-start",
    flexWrap: "wrap",
    flexDirection: "row",
    alignContent: "flex-start",
    gap: "2px",
    marginTop: "3px",
  },
  ticketInfo1: {
    position: "relative",
    top: 13,
    right: 0,
  },
  Radiusdot: {
    "& .MuiBadge-badge": {
      borderRadius: 6,
      position: "inherit",
      height: 18,
      margin: 2,
      padding: "2px 6px",
      fontSize: "0.65rem",
      fontWeight: 600,
    },
    "& .MuiBadge-anchorOriginTopRightRectangle": {
      transform: "scale(1) translate(0%, -40%)",
    },
  },
  connectionIcon: {
    marginRight: theme.spacing(0.5),
  },

  imageModal: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  imageModalContent: {
    outline: "none",
    maxWidth: "90vw",
    maxHeight: "90vh",
  },
  expandedImage: {
    width: "100%",
    height: "auto",
    maxWidth: "500px",
    borderRadius: theme.spacing(1),
  },
  clickableAvatar: {
    cursor: "pointer",
    transition: "transform 0.2s ease",
    "&:hover": {
      opacity: 0.85,
      transform: "scale(1.05)",
    },
  },

  // Right side info column
  ticketRightInfo: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    gap: "4px",
    minWidth: "104px",
    maxWidth: "118px",
    overflow: "hidden",
    marginRight: "0px",
    flexShrink: 0,
    position: "relative",
    zIndex: 2,
  },

  // Queue name label on the right
  queueNameLabel: {
    fontSize: "11px",
    fontWeight: 600,
    color: theme.mode === "light" ? "#555" : "#aaa",
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    textAlign: "right",
    maxWidth: "100%",
    fontFamily: "'Inter', 'Roboto', sans-serif",
  },

  // Relative time label
  relativeTime: {
    fontSize: "11px",
    fontWeight: 400,
    color: theme.mode === "light" ? "#999" : "#777",
    whiteSpace: "normal",
    wordBreak: "break-word",
    textAlign: "right",
    fontFamily: "'Inter', 'Roboto', sans-serif",
  },

  relativeTimeUnread: {
    fontSize: "11px",
    fontWeight: 600,
    color: "#6c5ce7",
    whiteSpace: "normal",
    wordBreak: "break-word",
    textAlign: "right",
    fontFamily: "'Inter', 'Roboto', sans-serif",
  },

  badgeActionsRow: {
    display: "flex",
    alignItems: "center",
    justifyContent: "flex-end",
    gap: "6px",
    minHeight: 22,
    width: "100%",
  },

  inlineActions: {
    display: "flex",
    alignItems: "center",
    gap: "4px",
  },

  // Unread badge (green/red circle)
  unreadBadge: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    minWidth: 22,
    height: 22,
    borderRadius: 11,
    fontSize: "11px",
    fontWeight: 700,
    color: "#fff",
    backgroundColor: "#27ae60",
  },

  unreadBadgeHigh: {
    backgroundColor: "#e74c3c",
  },

  // Tags row
  tagsRow: {
    display: "flex",
     flexWrap: "wrap",
     overflow: "visible",
    gap: "3px",
    marginTop: "4px",
    marginLeft: "5px",
    minWidth: 0,
    maxWidth: "100%",
  },

  tagsRowWrap: {
    display: "flex",
    flexWrap: "wrap",
    gap: "3px",
    marginTop: "3px",
    marginLeft: "5px",
     overflow: "visible",
  },

  tagPill: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    padding: "3px 10px",
    borderRadius: 999,
    fontSize: "10px",
    fontWeight: 700,
    letterSpacing: "0.4px",
    color: theme.mode === "light" ? "#3b3b54" : "#e6e6f0",
    backgroundColor: theme.mode === "light" ? "#f3f2fb" : "#2a2a3a",
    border: theme.mode === "light" ? "1px solid #e4e2f3" : "1px solid #3a3a4d",
    lineHeight: "14px",
    textTransform: "uppercase",
    fontFamily: "'Inter', 'Roboto', sans-serif",
    boxShadow: "none",
    flexShrink: 0,
     maxWidth: "100%",
    minWidth: 0,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
  },

  tagDot: {
    display: "inline-block",
    width: 7,
    height: 7,
    borderRadius: "50%",
    flexShrink: 0,
  },
}));

const TicketListItemCustom = ({ setTabOpen, ticket, index = 0 }) => {
  const classes = useStyles();
  const theme = useTheme();
  const history = useHistory();
  const [loading, setLoading] = useState(false);
  const [
    acceptTicketWithouSelectQueueOpen,
    setAcceptTicketWithouSelectQueueOpen,
  ] = useState(false);
  const [transferTicketModalOpen, setTransferTicketModalOpen] = useState(false);
  const [newTicketModalOpen, setNewTicketModalOpen] = useState(false);
  const [tagsAnchorEl, setTagsAnchorEl] = useState(null);

  const [openAlert, setOpenAlert] = useState(false);
  const [userTicketOpen, setUserTicketOpen] = useState("");
  const [queueTicketOpen, setQueueTicketOpen] = useState("");

  // Estados para o modal de finalização de venda
  const [openFinalizacaoVenda, setOpenFinalizacaoVenda] = useState(false);
  const [finalizacaoTipo, setFinalizacaoTipo] = useState(null);
  const [ticketDataToFinalize, setTicketDataToFinalize] = useState(null);
  const [showFinalizacaoOptions, setShowFinalizacaoOptions] = useState(false);

  // Estados para o modal de fechamento de chamado (assunto + resumo)
  const [closeTicketModalOpen, setCloseTicketModalOpen] = useState(false);
  const [closingTicket, setClosingTicket] = useState(false);
  const [enableCloseTicketModal, setEnableCloseTicketModal] = useState(true);

  const [imageModalOpen, setImageModalOpen] = useState(false); // Estado para o modal da imagem
  const [presenceState, setPresenceState] = useState(null); // "composing" | "recording" | null
  const presenceTimeoutRef = useRef(null);

  const { ticketId } = useParams();
  const isMounted = useRef(true);
  const { setCurrentTicket } = useContext(TicketsContext);
  const { user, socket } = useContext(AuthContext);

  const { get: getSetting } = useCompanySettings();

  const hasTicket = Boolean(ticket?.id);
  const rawContactName = String(ticket?.contact?.name || "").replace(/\s+/g, " ").trim();
  const contactName = /^(undefined|null)(\s+(undefined|null))*$/i.test(rawContactName)
    ? (ticket?.channel === "instagram" ? `Instagram ${ticket?.contact?.number || ""}`.trim() : ticket?.contact?.number || "Contato")
    : rawContactName || ticket?.contact?.number || "Contato";

  useEffect(() => {
    return () => {
      isMounted.current = false;
      clearTimeout(presenceTimeoutRef.current);
    };
  }, []);

  // Carregar configuração do modal de fechamento de chamado
  useEffect(() => {
    const loadEnableCloseTicketModal = async () => {
      try {
        const setting = await getSetting({ column: "enableCloseTicketModal" });
        const value = setting?.enableCloseTicketModal;
        if (value !== undefined && value !== null) {
          setEnableCloseTicketModal(
            value === true || value === "true" || value === "enabled"
          );
        }
      } catch (err) {
        // mantém habilitado por padrão
      }
    };
    loadEnableCloseTicketModal();
  }, []);

  // Presence listener
  useEffect(() => {
    if (!socket || !ticket?.id || !user?.companyId) return;

    const onPresence = (data) => {
      if (String(data.ticketId) !== String(ticket.id)) return;
      const active = data.presence === "composing" || data.presence === "recording";
      if (!isMounted.current) return;

      // Antes: um evento "parou de digitar" (paused) que chegasse dentro de
      // 15s do último "digitando" era IGNORADO de propósito — o indicador só
      // sumia quando o timeout de 15s vencia sozinho, mesmo que o WhatsApp já
      // tivesse avisado que a pessoa parou. Isso fazia "digitando..." durar
      // sempre mais do que devia, e se o evento de parada nunca chegasse (
      // problema de conexão do lado do contato), não tinha novo timeout
      // agendado pra tentar de novo — ficava preso.
      clearTimeout(presenceTimeoutRef.current);
      setPresenceState(active ? data.presence : null);

      if (active) {
        presenceTimeoutRef.current = setTimeout(() => {
          if (isMounted.current) setPresenceState(null);
        }, 15000);
      }
    };

    socket.on(`company-${user.companyId}-presence`, onPresence);
    return () => {
      socket.off(`company-${user.companyId}-presence`, onPresence);
    };
  }, [socket, ticket?.id, user?.companyId]);

  // Função para abrir modal da imagem
  const handleImageClick = (e) => {
    e.stopPropagation(); // Prevenir que o clique no avatar selecione o ticket
    if (ticket?.contact?.urlPicture) {
      setImageModalOpen(true);
    }
  };

  // Função para fechar modal da imagem
  const handleImageModalClose = () => {
    setImageModalOpen(false);
  };

  const handleOpenAcceptTicketWithouSelectQueue = useCallback(() => {
    setAcceptTicketWithouSelectQueueOpen(true);
  }, []);

  const handleCloseTicket = async (id) => {
    if (!hasTicket) return;
    // Verificar se a finalização com valor de venda está ativa
    if (
      user.finalizacaoComValorVendaAtiva === true ||
      user.finalizacaoComValorVendaAtiva === "true"
    ) {
      // Se estiver ativa, abrir o modal de finalização de venda
      setFinalizacaoTipo("comDespedida");
      setOpenFinalizacaoVenda(true);
      handleSelectTicket(ticket);
      history.push(`/tickets/${ticket.uuid}`);
      return;
    }

    // Verificar tag obrigatória antes de fechar
    try {
      const setting = await getSetting({ column: "requiredTag" });
      if (setting.requiredTag === "enabled") {
        const contactTags = await api.get(`/contactTags/${ticket.contact.id}`);
        if (!contactTags.data.tags) {
          toast.warning(i18n.t("messagesList.header.buttons.requiredTag"));
          return;
        }
      }
    } catch (err) {
      toastError(err);
      return;
    }

    // Sempre abrir o modal de finalização para que os toggles de
    // despedida / avaliação fiquem disponíveis. Quando enableCloseTicketModal
    // estiver desativado, o modal renderiza no modo compacto (sem assunto/resumo).
    setCloseTicketModalOpen(true);
  };

  const handleConfirmCloseTicket = async ({ closingSubject, closingSummary, sendRatingMessage, sendFarewellMessage }) => {
    if (!hasTicket) return;
    setClosingTicket(true);
    try {
      await api.put(`/tickets/${ticket.id}`, {
        status: "closed",
        userId: user?.id || null,
        closingSubject,
        closingSummary,
        ...(sendRatingMessage !== undefined ? { sendRatingMessage } : {}),
        ...(sendFarewellMessage !== undefined ? { sendFarewellMessage } : {}),
      });
      setCloseTicketModalOpen(false);
      history.push(`/tickets/`);
    } catch (err) {
      toastError(err);
    } finally {
      if (isMounted.current) {
        setClosingTicket(false);
      }
    }
  };

  const handleCloseIgnoreTicket = async (id) => {
    setLoading(true);
    try {
      await api.put(`/tickets/${id}`, {
        status: "closed",
        userId: user?.id || null,
        sendFarewellMessage: false,
        amountUsedBotQueues: 0,
      });
    } catch (err) {
      setLoading(false);
      toastError(err);
    }
    if (isMounted.current) {
      setLoading(false);
    }

    history.push(`/tickets/`);
  };

  const truncate = (str, len) => {
    if (!isNil(str)) {
      if (str.length > len) {
        return str.substring(0, len) + "...";
      }
      return str;
    }
  };

  const handleCloseTransferTicketModal = useCallback(() => {
    if (isMounted.current) {
      setTransferTicketModalOpen(false);
    }
  }, []);

  const handleOpenTransferModal = () => {
    if (!hasTicket) return;
    setLoading(true);
    setTransferTicketModalOpen(true);
    if (isMounted.current) {
      setLoading(false);
    }
    handleSelectTicket(ticket);
    history.push(`/tickets/${ticket.uuid}`);
  };

  const handleOpenNewTicketModal = () => {
    setNewTicketModalOpen(true);
  };

  const handleCloseNewTicketModal = (newTicket) => {
    setNewTicketModalOpen(false);
    if (newTicket) {
      // Se um novo ticket foi criado, redirecionar para ele
      handleSelectTicket(newTicket);
      history.push(`/tickets/${newTicket.uuid}`);
    }
  };

  const handleAcepptTicket = async (id) => {
    if (!hasTicket) return;
    setLoading(true);
    try {
      const otherTicket = await api.put(`/tickets/${id}`, {
        status:
          ticket.isGroup && ticket.channel === "whatsapp" ? "group" : "open",
        userId: user?.id,
      });

      if (otherTicket.data.id !== ticket.id) {
        if (otherTicket.data.userId !== user?.id) {
          setOpenAlert(true);
          setUserTicketOpen(otherTicket.data.user.name);
          setQueueTicketOpen(otherTicket.data.queue.name);
        } else {
          setLoading(false);
          setTabOpen(ticket.isGroup ? "group" : "open");
          handleSelectTicket(otherTicket.data);
          history.push(`/tickets/${otherTicket.uuid}`);
        }
      } else {
        let setting;

        try {
          setting = await getSetting({
            column: "sendGreetingAccepted",
          });
        } catch (err) {
          toastError(err);
        }

        if (
          setting.sendGreetingAccepted === "enabled" &&
          (!ticket.isGroup || ticket.whatsapp?.groupAsTicket === "enabled")
        ) {
          handleSendMessage(ticket.id);
        }
        if (isMounted.current) {
          setLoading(false);
        }

        setTabOpen(ticket.isGroup ? "group" : "open");
        handleSelectTicket(ticket);
        history.push(`/tickets/${ticket.uuid}`);
      }
    } catch (err) {
      setLoading(false);
      toastError(err);
    }
  };

  const handleSendMessage = async (id) => {
    let setting;

    try {
      setting = await getSetting({
        column: "greetingAcceptedMessage",
      });
    } catch (err) {
      toastError(err);
    }
    if (!setting.greetingAcceptedMessage) {
      toast.warning(
        i18n.t("messagesList.header.buttons.greetingAcceptedMessage")
      );
      return;
    }
    const msg = `${setting.greetingAcceptedMessage}`;
    const message = {
      read: 1,
      fromMe: true,
      mediaUrl: "",
      body: `${msg.trim()}`,
    };
    try {
      await api.post(`/messages/${id}`, message);
    } catch (err) {
      toastError(err);
    }
  };

  const handleCloseAlert = useCallback(() => {
    setOpenAlert(false);
    setLoading(false);
  }, []);

  const handleSelectTicket = (ticket) => {
    if (!ticket?.id || !ticket?.uuid) return;
    const code = uuidv4();
    const { id, uuid } = ticket;
    setCurrentTicket({ id, uuid, code });
  };

  const handleUpdateTicketStatusWithData = async (
    ticketData,
    sendFarewellMessage,
    finalizacaoMessage
  ) => {
    if (!hasTicket) return;
    try {
      await api.put(`/tickets/${ticket.id}`, {
        ...ticketData,
        sendFarewellMessage,
        finalizacaoMessage,
      });
      toast.success("Ticket finalizado com sucesso!");
      history.push(`/tickets/`);
    } catch (err) {
      toastError(err);
    }
  };

  // Função para espionar ticket chatbot
  const handleSpyTicket = () => {
    if (!hasTicket) return;
    handleSelectTicket(ticket);
    history.push(`/tickets/${ticket.uuid}`);
  };

  // Lógica de permissão para mensagens pending - MOVIDA PARA DEPOIS DE TODAS AS FUNÇÕES
  const shouldBlurMessages = ticket?.status === "pending" && user?.allowSeeMessagesInPendingTickets === "disabled";

  // Sem a permissão de ver mensagens em aguardando, o usuário também não pode
  // ACEITAR o ticket em aguardando (o backend recusa; aqui escondemos o botão
  // para não oferecer uma ação que vai falhar). Admin passa sempre.
  const podeAceitarPending =
    user?.profile === "admin" ||
    user?.super === true ||
    user?.allowSeeMessagesInPendingTickets !== "disabled";

  // Função para renderizar a mensagem com base na permissão - MOVIDA PARA DEPOIS DE TODAS AS FUNÇÕES
  const renderLastMessage = () => {
    if (shouldBlurMessages) {
      return (
        <MarkdownWrapper>
          {i18n.t("tickets.messageHidden") || "Mensagem oculta"}
        </MarkdownWrapper>
      );
    }

    if (!ticket.lastMessage) {
      return <br />;
    }

    // Mensagem apagada (vinda do backend com prefixo 🚫)
    if (/Mensagem\s+Apagada/i.test(ticket.lastMessage) || /mensaje\s+eliminad/i.test(ticket.lastMessage) || /deleted\s+message/i.test(ticket.lastMessage)) {
      return <MarkdownWrapper>{`🚫 _${i18n.t("ticketsList.lastMessage.deleted")}_`}</MarkdownWrapper>;
    }

    if (ticket.lastMessage.includes("data:image/png;base64")) {
      return <MarkdownWrapper>{`📍 ${i18n.t("ticketsList.lastMessage.location")}`}</MarkdownWrapper>;
    }

    if (ticket.lastMessage.includes("BEGIN:VCARD") || ticket.lastMessage.includes("CELLwaid=")) {
      const vcardCount = (ticket.lastMessage.match(/BEGIN:VCARD/g) || ticket.lastMessage.match(/CELLwaid=/g) || []).length;
      return <MarkdownWrapper>{vcardCount > 1
        ? `📇 ${i18n.t("ticketsList.lastMessage.contactCount", { count: vcardCount })}`
        : `📇 ${i18n.t("ticketsList.lastMessage.contact")}`}</MarkdownWrapper>;
    }

    // Detectar tipos de mídia pelo conteúdo do lastMessage
    let lastMsg = ticket.lastMessage;

    // Mensagens interativas (botões/lista) — remover tag e formatação
    if (/^\[BUTTON\]/i.test(lastMsg)) {
      const cleaned = lastMsg
        .replace(/^\[BUTTON\]\s*/i, "")
        .split("\n")[0]
        .replace(/\*/g, "")
        .trim();
      return <MarkdownWrapper>{`🔘 ${truncate(cleaned, 38)}`}</MarkdownWrapper>;
    }
    if (/^\[LIST\]/i.test(lastMsg)) {
      const cleaned = lastMsg
        .replace(/^\[LIST\]\s*/i, "")
        .split("\n")[0]
        .replace(/\*/g, "")
        .trim();
      return <MarkdownWrapper>{`📋 ${truncate(cleaned, 38)}`}</MarkdownWrapper>;
    }

    // Chamada de voz/vídeo (call_log do Baileys ou Z-API)
    if (/chamada de voz/i.test(lastMsg) || /chamada de v[ií]deo/i.test(lastMsg) || /missed.*call/i.test(lastMsg) || /call_log/i.test(lastMsg)) {
      const timeMatch = lastMsg.match(/(\d{1,2}:\d{2})/);
      const timeSuffix = timeMatch ? ` ${timeMatch[1]}` : "";
      return <MarkdownWrapper>{`📞 ${i18n.t("ticketsList.lastMessage.missedCall")}${timeSuffix}`}</MarkdownWrapper>;
    }

    // Chamada recebida via WhatsApp Plus/SIP (ver HandleWacallsCall.ts —
    // body fixo em português "📞 Chamada recebida", sem depender do idioma
    // configurado). Antes caía direto no texto cru abaixo, sempre em
    // português independente do idioma da tela.
    if (/chamada recebida/i.test(lastMsg)) {
      return <MarkdownWrapper>{`📞 ${i18n.t("hardcoded.incomingCall")}`}</MarkdownWrapper>;
    }

    // Áudio/voz
    if (/\.(opus|ogg|mp3|wav|aac|m4a)$/i.test(lastMsg) || lastMsg === "🎵 Áudio") {
      return <MarkdownWrapper>{`🎤 ${i18n.t("ticketsList.lastMessage.audio")}`}</MarkdownWrapper>;
    }

    // Imagem
    if (/\.(jpg|jpeg|png|gif|webp|bmp|svg)$/i.test(lastMsg)) {
      return <MarkdownWrapper>{`📷 ${i18n.t("ticketsList.lastMessage.photo")}`}</MarkdownWrapper>;
    }

    // Vídeo
    if (/\.(mp4|avi|mkv|mov|wmv|3gp|webm)$/i.test(lastMsg)) {
      return <MarkdownWrapper>{`🎥 ${i18n.t("ticketsList.lastMessage.video")}`}</MarkdownWrapper>;
    }

    // Documento
    if (/\.(pdf|doc|docx|xls|xlsx|ppt|pptx|csv|txt|zip|rar)$/i.test(lastMsg)) {
      return <MarkdownWrapper>{`📄 ${i18n.t("ticketsList.lastMessage.document")}`}</MarkdownWrapper>;
    }

    // Sticker
    if (/\.(webp)$/i.test(lastMsg) || lastMsg === "🏷️ Figurinha") {
      return <MarkdownWrapper>{`🏷️ ${i18n.t("ticketsList.lastMessage.sticker")}`}</MarkdownWrapper>;
    }

    return (
      <MarkdownWrapper>
        {truncate(ticket.lastMessage, 40)}
      </MarkdownWrapper>
    );
  };

  // Helper: format relative time like "há poucos segundos", "há 15 minutos", etc.
  const getRelativeTime = (dateStr) => {
    if (!dateStr) return "";
    try {
      return formatDistanceToNow(parseISO(dateStr), {
        addSuffix: true,
        locale: (i18n.language || "").startsWith("es")
          ? esLocale
          : (i18n.language || "").startsWith("en")
          ? enUS
          : ptBR,
      });
    } catch {
      return "";
    }
  };

  // Collect all tag pills (whatsapp connection, queue, user, contact tags, ticket tags)
  const allTags = useMemo(() => {
    const tags = [];
    // Connection (WhatsApp) tag
    if (ticket?.whatsapp?.name) {
      const isOficial =
        ticket?.channel === "whatsapp_oficial" ||
        ticket?.whatsapp?.channel === "whatsapp_oficial";
      tags.push({
        id: `wa-${ticket.whatsapp.id || ticket.whatsapp.name}`,
        name: ticket.whatsapp.name,
        color: isOficial ? "#1877F2" : "#25D366",
        kind: "connection",
        isOficial,
      });
    }
    // Queue tag
    if (ticket?.queueId && ticket?.queue) {
      tags.push({
        id: `queue-${ticket.queue.id}`,
        name: ticket.queue.name,
        color: ticket.queue.color || "#7c7c7c",
        kind: "dot",
      });
    } else if (ticket?.status === "lgpd") {
      tags.push({ id: "lgpd", name: "LGPD", color: "#e67e22", kind: "dot" });
    }
    // User (attendant) tag
    if (ticket?.user?.name) {
      tags.push({
        id: `user-${ticket.user.id || ticket.user.name}`,
        name: ticket.user.name,
        color: "#4E93FF",
        kind: "user",
      });
    }
    // Contact tags
    if (ticket?.contact?.tags) {
      ticket.contact.tags.forEach((t) => {
        tags.push({ id: `ct-${t.id}`, name: t.name, color: t.color || "#6c5ce7", kind: "dot" });
      });
    }
    // Ticket tags
    if (ticket?.tags) {
      ticket.tags.forEach((t) => {
        tags.push({ id: `tt-${t.id}`, name: t.name, color: t.color || "#6c5ce7", kind: "dot" });
      });
    }
    return tags;
  }, [ticket]);

  if (!hasTicket) return null;

  return (
    <React.Fragment key={ticket.id}>
      {openAlert && (
        <ShowTicketOpen
          isOpen={openAlert}
          handleClose={handleCloseAlert}
          user={userTicketOpen}
          queue={queueTicketOpen}
        />
      )}
      {acceptTicketWithouSelectQueueOpen && (
        <AcceptTicketWithouSelectQueue
          modalOpen={acceptTicketWithouSelectQueueOpen}
          onClose={(e) => setAcceptTicketWithouSelectQueueOpen(false)}
          ticketId={ticket.id}
          ticket={ticket}
        />
      )}
      {transferTicketModalOpen && (
        <TransferTicketModalCustom
          modalOpen={transferTicketModalOpen}
          onClose={handleCloseTransferTicketModal}
          ticketid={ticket.id}
          ticket={ticket}
        />
      )}
      {newTicketModalOpen && (
        <NewTicketModal
          modalOpen={newTicketModalOpen}
          onClose={handleCloseNewTicketModal}
          initialContact={ticket.contact}
        />
      )}
      <ListItem
        button
        dense
        onClick={(e) => {
          const isCheckboxClicked =
            (e.target.tagName.toLowerCase() === "input" &&
              e.target.type === "checkbox") ||
            (e.target.tagName.toLowerCase() === "svg" &&
              e.target.type === undefined) ||
            (e.target.tagName.toLowerCase() === "path" &&
              e.target.type === undefined);

          if (isCheckboxClicked) return;

          handleSelectTicket(ticket);
        }}
        selected={ticketId && ticketId === ticket.uuid}
        className={clsx(classes.ticket, {
          [classes.pendingTicket]: ticket.status === "pending",
        })}
        style={{ animationDelay: `${Math.min(index * 0.04, 0.5)}s` }}
      >
        {/* Avatar */}
        <ListItemAvatar style={{ marginLeft: "-4px" }}>
          <Badge
            overlap="circular"
            anchorOrigin={{ vertical: "bottom", horizontal: "right" }}
            badgeContent={
              ticket.channel ? (
                <span
                  style={{
                    background: "#fff",
                    borderRadius: "50%",
                    width: 18,
                    height: 18,
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    border: "1.5px solid #fff",
                    boxShadow: "0 1px 2px rgba(0,0,0,0.15)",
                  }}
                >
                  <ConnectionIcon
                    width="12"
                    height="12"
                    connectionType={ticket.channel}
                  />
                </span>
              ) : null
            }
          >
            <Avatar
            style={{
              width: "48px",
              height: "48px",
              borderRadius: "50%",
              backgroundColor: !ticket?.contact?.urlPicture ? '#6c5ce7' : undefined,
              color: '#fff',
              fontWeight: 'bold',
              fontSize: '16px',
              border: '2px solid #e8e5f5',
            }}
            src={`${ticket?.contact?.urlPicture}`}
            className={classes.clickableAvatar}
            onClick={handleImageClick}
          >
            {!ticket?.contact?.urlPicture && contactName
              ? contactName.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase()).join('')
              : null}
            </Avatar>
          </Badge>
        </ListItemAvatar>

        {/* Middle: name + last message + tags */}
        <div style={{ flex: 1, minWidth: 0, marginLeft: 4 }}>
          {/* Row 1: Name + channel icon */}
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            {ticket.isGroup && ticket.channel === "whatsapp" && (
              <GroupIcon fontSize="small" style={{ color: grey[500], fontSize: 16 }} />
            )}
            <Typography
              noWrap
              component="span"
              variant="body2"
              style={{
                fontWeight: 600,
                fontSize: "13.5px",
                color: theme.mode === "light" ? "#2d2b55" : "#e0e0e0",
              }}
            >
              {truncate(contactName, 30)}
            </Typography>
            {Number(ticket.unreadMessages) > 0 && (
              <span
                title={`${ticket.unreadMessages} ${Number(ticket.unreadMessages) === 1 ? "mensagem não lida" : "mensagens não lidas"}`}
                style={{
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  minWidth: 16,
                  height: 16,
                  padding: "0 5px",
                  borderRadius: 999,
                  fontSize: 10,
                  fontWeight: 700,
                  lineHeight: 1,
                  color: "#fff",
                  backgroundColor: Number(ticket.unreadMessages) >= 3 ? "#e53935" : "#22c55e",
                  flexShrink: 0,
                }}
              >
                {shouldBlurMessages ? "?" : ticket.unreadMessages}
              </span>
            )}
          </div>

          {/* Row 2: Tags pills */}
          {allTags.length > 0 && (() => {
            const leftTags = allTags.filter((t) => t.kind !== "connection");
            // Show queue + user side by side; the rest go into the +N popover
            const queueTag = leftTags.find((t) => String(t.id).startsWith("queue-") || t.id === "lgpd");
            const userTag = leftTags.find((t) => t.kind === "user");
            const visibleTags = [queueTag, userTag].filter(Boolean);
            const hiddenTags = leftTags.filter((t) => !visibleTags.includes(t));
            if (leftTags.length === 0) return null;
            const renderPill = (tag) => (
              <span
                key={tag.id}
                className={classes.tagPill}
              >
                <span
                  className={classes.tagDot}
                  style={{ backgroundColor: tag.color || "#3AC0E7" }}
                />
                {tag.kind === "connection" ? (
                  <WhatsAppIcon style={{ fontSize: 12 }} />
                ) : tag.kind === "user" ? (
                  <PersonIcon style={{ fontSize: 13 }} />
                ) : null}
                {tag.name}
              </span>
            );
            return (
              <>
                <div className={classes.tagsRow}>
                  {visibleTags.map(renderPill)}
                  {hiddenTags.length > 0 && (
                    <>
                      <span
                        className={classes.tagPill}
                        style={{ cursor: "pointer" }}
                        onClick={(e) => {
                          e.stopPropagation();
                          e.preventDefault();
                          setTagsAnchorEl(e.currentTarget);
                        }}
                      >
                        +{hiddenTags.length}
                      </span>
                      <Popover
                        open={Boolean(tagsAnchorEl)}
                        anchorEl={tagsAnchorEl}
                        onClose={(e) => {
                          if (e && e.stopPropagation) e.stopPropagation();
                          setTagsAnchorEl(null);
                        }}
                        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
                        transformOrigin={{ vertical: "top", horizontal: "center" }}
                        marginThreshold={12}
                        PaperProps={{
                          onClick: (e) => e.stopPropagation(),
                          style: {
                            padding: 10,
                            maxWidth: "min(320px, calc(100vw - 24px))",
                            maxHeight: "min(360px, calc(100vh - 80px))",
                            overflowY: "auto",
                            borderRadius: 10,
                            boxShadow: "0 8px 24px rgba(0,0,0,0.18)",
                            backgroundColor: theme.mode === "light" ? "#ffffff" : "#2a2a3a",
                            border: theme.mode === "light" ? "1px solid #e6e6ef" : "1px solid #3a3a4a",
                          },
                        }}
                      >
                        <div
                          style={{
                            fontSize: 11,
                            fontWeight: 700,
                            textTransform: "uppercase",
                            letterSpacing: 0.4,
                            color: theme.mode === "light" ? "#6b7280" : "#a8a8b8",
                            marginBottom: 8,
                            paddingLeft: 2,
                          }}
                        >
                          {hiddenTags.length} {hiddenTags.length === 1 ? "tag" : "tags"}
                        </div>
                        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                          {hiddenTags.map((t) => (
                            <span
                              key={t.id}
                              title={t.name}
                              style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: 6,
                                fontSize: 12,
                                lineHeight: 1.4,
                                padding: "4px 10px",
                                borderRadius: 999,
                                backgroundColor: t.color || "#6c5ce7",
                                color: "#fff",
                                fontWeight: 600,
                                maxWidth: 220,
                                overflow: "hidden",
                                textOverflow: "ellipsis",
                                whiteSpace: "nowrap",
                              }}
                            >
                              <span
                                style={{
                                  width: 6,
                                  height: 6,
                                  borderRadius: "50%",
                                  backgroundColor: "rgba(255,255,255,0.85)",
                                  display: "inline-block",
                                  flexShrink: 0,
                                }}
                              />
                              <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                                {t.name}
                              </span>
                            </span>
                          ))}
                        </div>
                      </Popover>
                    </>
                  )}
                </div>
              </>
            );
          })()}

          {/* Row 2.5: UTM Source / Ad Origin badge */}
          {ticket.utmSource && (
            <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 2 }}>
              <span style={{
                display: "inline-flex",
                alignItems: "center",
                gap: 3,
                fontSize: "10px",
                fontWeight: 600,
                padding: "1px 6px",
                borderRadius: 6,
                color: "#fff",
                backgroundColor:
                  ticket.utmSource.toLowerCase().includes("facebook") ? "#1877F2" :
                  ticket.utmSource.toLowerCase().includes("instagram") ? "#E4405F" :
                  ticket.utmSource.toLowerCase().includes("tiktok") ? "#000000" :
                  ticket.utmSource.toLowerCase().includes("google") ? "#4285F4" :
                  ticket.utmSource.toLowerCase().includes("youtube") ? "#FF0000" :
                  ticket.utmSource.toLowerCase().includes("twitter") || ticket.utmSource.toLowerCase().includes("x") ? "#1DA1F2" :
                  "#6c5ce7",
                textTransform: "capitalize",
                letterSpacing: "0.3px",
                lineHeight: "16px",
              }}>
                {ticket.utmSource.toLowerCase().includes("facebook") ? "📘" :
                 ticket.utmSource.toLowerCase().includes("instagram") ? "📸" :
                 ticket.utmSource.toLowerCase().includes("tiktok") ? "🎵" :
                 ticket.utmSource.toLowerCase().includes("google") ? "🔍" :
                 ticket.utmSource.toLowerCase().includes("youtube") ? "▶️" :
                 "📢"}
                {ticket.utmSource}
              </span>
              {ticket.utmCampaign && (
                <span style={{
                  fontSize: "9.5px",
                  color: theme.mode === "light" ? "#888" : "#aaa",
                  fontWeight: 500,
                  maxWidth: 100,
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  whiteSpace: "nowrap",
                }}>
                  {ticket.utmCampaign}
                </span>
              )}
            </div>
          )}

          {/* Row 3: Last message preview or presence indicator */}
          {presenceState ? (
            <Typography
              noWrap
              component="div"
              variant="body2"
              style={{
                marginTop: 2,
                marginLeft: 0,
                fontSize: "12.5px",
                color: "#6c5ce7",
                fontWeight: 600,
                fontStyle: "italic",
              }}
            >
              {presenceState === "composing" ? "✏️ digitando..." : "🎙️ gravando áudio..."}
            </Typography>
          ) : (
            <Typography
              noWrap
              component="div"
              variant="body2"
              style={{
                marginTop: 2,
                marginLeft: 0,
                fontSize: "12.5px",
                color: Number(ticket.unreadMessages) > 0
                  ? (theme.mode === "light" ? "#2d2b55" : "#e0e0e0")
                  : (theme.mode === "light" ? "#999" : "#777"),
                fontWeight: Number(ticket.unreadMessages) > 0 ? 600 : 400,
              }}
            >
              {renderLastMessage()}
            </Typography>
          )}
        </div>

        {/* Right side: queue name + time + unread badge + actions */}
        <div className={classes.ticketRightInfo}>
          {/* Connection (WhatsApp) pill */}
          {(() => {
            const conn = allTags.find((t) => t.kind === "connection");
            if (!conn) return null;
            return (
              <span
                className={classes.tagPill}
                style={{
                  maxWidth: "100%",
                  cursor: "default",
                  whiteSpace: "nowrap",
                  overflow: "hidden",
                  textOverflow: "ellipsis",
                  flexShrink: 0,
                  justifyContent: "flex-end",
                }}
                title={conn.name}
              >
                {conn.isOficial ? (
                  <VerifiedIcon style={{ fontSize: 12, color: conn.color, flexShrink: 0 }} />
                ) : (
                  <WhatsAppIcon style={{ fontSize: 12, color: conn.color, flexShrink: 0 }} />
                )}
                <span
                  style={{
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    whiteSpace: "nowrap",
                    minWidth: 0,
                  }}
                >
                  {conn.name}
                </span>
              </span>
            );
          })()}
          {/* Relative time */}
          <span
            className={
              Number(ticket.unreadMessages) > 0
                ? classes.relativeTimeUnread
                : classes.relativeTime
            }
          >
            {getRelativeTime(ticket.updatedAt)}
          </span>

          <div className={classes.badgeActionsRow}>
            <div className={classes.inlineActions}>
              {/* Para tickets com status chatbot, mostrar apenas o ícone de spy */}
              {ticket.status === "chatbot" && (
                <ButtonWithSpinner
                  variant="contained"
                  className={clsx(classes.actionBtn, classes.actionBtnSpy)}
                  size="small"
                  loading={loading}
                  onClick={(e) => {
                    e.stopPropagation();
                    handleSpyTicket();
                  }}
                >
                  <Tooltip title="Espiar conversa do chatbot">
                    <VisibilityIcon />
                  </Tooltip>
                </ButtonWithSpinner>
              )}

              {/* Para todos os outros status, manter os botões originais */}
              {ticket.status !== "chatbot" && (
                <>
                  {ticket.status === "pending" && podeAceitarPending &&
                    (ticket.queueId === null || ticket.queueId === undefined) && (
                      <ButtonWithSpinner
                        variant="contained"
                        className={clsx(classes.actionBtn, classes.actionBtnAccept)}
                        size="small"
                        loading={loading}
                        onClick={(e) => handleOpenAcceptTicketWithouSelectQueue()}
                      >
                        <Tooltip title={`${i18n.t("ticketsList.buttons.accept")}`}>
                          <Done />
                        </Tooltip>
                      </ButtonWithSpinner>
                    )}
                  {ticket.status === "pending" && podeAceitarPending && ticket.queueId !== null && (
                    <ButtonWithSpinner
                      variant="contained"
                      className={clsx(classes.actionBtn, classes.actionBtnAccept)}
                      size="small"
                      loading={loading}
                      onClick={(e) => handleAcepptTicket(ticket.id)}
                    >
                      <Tooltip title={`${i18n.t("ticketsList.buttons.accept")}`}>
                        <Done />
                      </Tooltip>
                    </ButtonWithSpinner>
                  )}
                  {(ticket.status === "pending" || ticket.status === "lgpd") &&
                    (user.userClosePendingTicket === "enabled" ||
                      user.profile === "admin") && (
                      <ButtonWithSpinner
                        variant="contained"
                        className={clsx(classes.actionBtn, classes.actionBtnClose)}
                        size="small"
                        loading={loading}
                        onClick={(e) => handleCloseIgnoreTicket(ticket.id)}
                      >
                        <Tooltip title={`${i18n.t("ticketsList.buttons.ignore")}`}>
                          <HighlightOff />
                        </Tooltip>
                      </ButtonWithSpinner>
                    )}
                  {ticket.status === "pending" && (
                    <ButtonWithSpinner
                      variant="contained"
                      className={clsx(classes.actionBtn, classes.actionBtnTransfer)}
                      size="small"
                      loading={loading}
                      onClick={(e) => {
                        e.stopPropagation();
                        handleOpenTransferModal();
                      }}
                    >
                      <Tooltip title={`${i18n.t("ticketsList.buttons.transfer") || "Transferir"}`}>
                        <SwapHoriz />
                      </Tooltip>
                    </ButtonWithSpinner>
                  )}
                  {ticket.status === "open" && (
                    <>
                      <ButtonWithSpinner
                        variant="contained"
                        className={clsx(classes.actionBtn, classes.actionBtnTransfer)}
                        size="small"
                        loading={loading}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleOpenTransferModal();
                        }}
                      >
                        <Tooltip title={`${i18n.t("ticketsList.buttons.transfer") || "Transferir"}`}>
                          <SwapHoriz />
                        </Tooltip>
                      </ButtonWithSpinner>
                      <ButtonWithSpinner
                        variant="contained"
                        className={clsx(classes.actionBtn, classes.actionBtnClose)}
                        size="small"
                        loading={loading}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleCloseTicket(ticket.id);
                        }}
                      >
                        <Tooltip title={`${i18n.t("ticketsList.buttons.closed") || "Fechar"}`}>
                          <HighlightOff />
                        </Tooltip>
                      </ButtonWithSpinner>
                    </>
                  )}
                </>
              )}
            </div>
          </div>
        </div>
      </ListItem>

      {/* Modal de Fechamento de Chamado (assunto + resumo) */}
      {closeTicketModalOpen && (
        <CloseTicketModal
          open={closeTicketModalOpen}
          onClose={() => setCloseTicketModalOpen(false)}
          onConfirm={handleConfirmCloseTicket}
          loading={closingTicket}
          compact={!enableCloseTicketModal}
        />
      )}

      {/* Modal de Finalização de Venda */}
      {openFinalizacaoVenda && (
        <FinalizacaoVendaModal
          open={openFinalizacaoVenda}
          onClose={() => setOpenFinalizacaoVenda(false)}
          ticket={ticket}
          onFinalizar={(ticketData) => {
            setOpenFinalizacaoVenda(false);
            setTicketDataToFinalize(ticketData);
            setShowFinalizacaoOptions(true);
          }}
        />
      )}

      {/* Modal de Opções de Finalização */}
      {showFinalizacaoOptions && (
        <Dialog
          open={showFinalizacaoOptions}
          onClose={() => setShowFinalizacaoOptions(false)}
          aria-labelledby="finalizacao-options-title"
        >
          <DialogTitle id="finalizacao-options-title">
            Como deseja finalizar?
          </DialogTitle>
          <DialogActions>
            <Button
              onClick={async () => {
                setShowFinalizacaoOptions(false);
                await handleUpdateTicketStatusWithData(
                  ticketDataToFinalize,
                  false,
                  null
                );
              }}
              style={{ background: theme.palette.primary.main, color: "white" }}
            >
              {i18n.t("messagesList.header.dialogRatingWithoutFarewellMsg")}
            </Button>
            <Button
              onClick={async () => {
                setShowFinalizacaoOptions(false);
                await handleUpdateTicketStatusWithData(
                  ticketDataToFinalize,
                  true,
                  null
                );
              }}
              style={{ background: theme.palette.primary.main, color: "white" }}
            >
              {i18n.t("messagesList.header.dialogRatingCancel")}
            </Button>
          </DialogActions>
        </Dialog>
      )}

      {/* Modal da Imagem */}
      <Dialog
        open={imageModalOpen}
        onClose={handleImageModalClose}
        className={classes.imageModal}
        maxWidth="md"
        fullWidth
      >
        <DialogContent className={classes.imageModalContent}>
          <img 
            src={ticket?.contact?.urlPicture} 
            alt={contactName || "Foto do contato"}
            className={classes.expandedImage}
          />
        </DialogContent>
      </Dialog>
    </React.Fragment>
  );
};

export default TicketListItemCustom;