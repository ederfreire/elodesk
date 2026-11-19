import React, { useState, useEffect, useContext, useRef, useCallback, Suspense, useMemo } from "react";
import { useParams, useHistory } from "react-router-dom";

import clsx from "clsx";

import { makeStyles, Paper, useMediaQuery, CircularProgress } from "@material-ui/core";
import { useTheme } from "@material-ui/core/styles";

import api from "../../services/api";
import { ReplyMessageProvider } from "../../context/ReplyingMessage/ReplyingMessageContext";
import { ForwardMessageProvider } from "../../context/ForwarMessage/ForwardMessageContext";
import toastError from "../../errors/toastError";
import { AuthContext } from "../../context/Auth/AuthContext";
import { TagsContainer } from "../TagsContainer";
import { isNil } from 'lodash';
import { EditMessageProvider } from "../../context/EditingMessage/EditingMessageContext";
import { TicketsContext } from "../../context/Tickets/TicketsContext";

const ContactDrawer = React.lazy(() => import("../ContactDrawer"));
const MessageInput = React.lazy(() => import("../MessageInput/"));
const TicketHeader = React.lazy(() => import("../TicketHeader"));
const TicketInfo = React.lazy(() => import("../TicketInfo"));
const MessagesList = React.lazy(() => import("../MessagesList"));
const TicketActionButtons = React.lazy(() => import("../TicketActionButtonsCustom"));
const OfficialApiCountdown = React.lazy(() => import("../OfficialApiCountdown"));

const drawerWidth = 320;

const useStyles = makeStyles((theme) => ({
  root: {
    display: "flex",
    height: "100%",
    maxHeight: "100%",
    minHeight: 0,
    position: "relative",
    overflow: "hidden",
    // Mesma cor do papel de parede do chat — cobre qualquer sobra visível
    // atrás/ao redor do Paper de conversa (ex: durante a transição de
    // abrir/fechar o drawer, quando marginRight negativo do mainWrapper
    // pode deixar uma fresta aparecer).
    backgroundColor: theme.palette.type === "dark" ? "#0b0b0d" : "#ebebeb",
    "@media (max-width: 960px)": {
      flex: 1,
      minHeight: 0,
      height: "100%",
      maxHeight: "100%",
      overflow: "hidden",
      flexDirection: "column",
    },
  },

  mainWrapper: {
    flex: 1,
    height: "100%",
    maxHeight: "100%",
    minHeight: 0,
    display: "flex",
    flexDirection: "column",
    overflow: "hidden",
    borderTopLeftRadius: 0,
    borderBottomLeftRadius: 0,
    borderLeft: "0",
    marginRight: -drawerWidth,
    // Mesma cor do papel de parede do chat (ver MessagesList/MessageInput)
    // — sem isso, qualquer folga de altura que sobra no flex mostra o
    // branco padrão do Paper por baixo, criando aquela tira de cor
    // diferente no rodapé da página.
    backgroundColor: theme.palette.type === "dark" ? "#0b0b0d" : "#ebebeb",
    transition: theme.transitions.create("margin", {
      easing: theme.transitions.easing.sharp,
      duration: theme.transitions.duration.leavingScreen,
    }),
    "@media (max-width: 960px)": {
      marginRight: 0,
      flex: 1,
      minHeight: 0,
      height: "100%",
      maxHeight: "100%",
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
    },
  },

  mainWrapperShift: {
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
    transition: theme.transitions.create("margin", {
      easing: theme.transitions.easing.easeOut,
      duration: theme.transitions.duration.enteringScreen,
    }),
    marginRight: 0,
    [theme.breakpoints.down('md')]: {
      marginRight: 0,
    },
  },

  headerGroup: {
    display: "flex",
    flexDirection: "column",
    flexShrink: 0,
    minHeight: "fit-content",
    overflow: "hidden",
    position: "relative",
    zIndex: 11,
    backgroundColor: theme.palette.background.paper,
  },

  tagsWrapper: {
    flexShrink: 0,
    overflow: "hidden",
    borderRadius: 0,
    borderTop: `1px solid ${theme.palette.divider}`,
    boxShadow: "none",
    zIndex: 10,
    backgroundColor: theme.palette.background.paper,
  },

  conversationArea: {
    flex: 1,
    minHeight: 0,
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    position: "relative",
  },
}));

const Ticket = () => {
  const { ticketId } = useParams();
  const history = useHistory();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const classes = useStyles();

  const { user, socket } = useContext(AuthContext);
  const { setTabOpen } = useContext(TicketsContext);

  const [drawerOpen, setDrawerOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [contact, setContact] = useState({});
  const [ticket, setTicket] = useState({});
  const [dragDropFiles, setDragDropFiles] = useState([]);
  const [presenceState, setPresenceState] = useState(null);
  const [presenceLastSeen, setPresenceLastSeen] = useState(null);
  const presenceTimeoutRef = useRef(null);
  const presenceIntervalRef = useRef(null);
  const presenceHiddenTimeoutRef = useRef(null);
  const activePresenceUntilRef = useRef(0);
  const ticketRef = useRef({});
  const { companyId } = user;

  useEffect(() => {
    ticketRef.current = ticket;
  }, [ticket]);

  // Cor de fundo do body só enquanto o chat está na tela — pedido foi pra
  // não afetar Dashboard/Contatos/etc, que usam o cinza padrão do tema
  // global (App.js, CssBaseline). Isso cobre a última fresta que sobrava
  // atrás do papel de parede do chat sem mudar o resto do sistema: aplica
  // ao montar, desfaz ao desmontar (troca de tela).
  useEffect(() => {
    const previousBackground = document.body.style.backgroundColor;
    document.body.style.backgroundColor = theme.palette.type === "dark" ? "#0b0b0d" : "#ebebeb";
    return () => {
      document.body.style.backgroundColor = previousBackground;
    };
  }, [theme.palette.type]);

  useEffect(() => {
    setLoading(true);
    const delayDebounceFn = setTimeout(() => {
      const fetchTicket = async () => {
        try {
          if (!isNil(ticketId) && ticketId !== "undefined") {
            const { data } = await api.get("/tickets/u/" + ticketId);

            setContact(data.contact);
            setTicket(data);

            const urlParams = new URLSearchParams(window.location.search);
            const tabParam = urlParams.get('tab');

            if (tabParam && ["pending", "open", "group", "closed"].includes(tabParam)) {
              setTimeout(() => {
                setTabOpen(tabParam);
              }, 200);
            } else {
              if (["pending", "open", "group"].includes(data.status)) {
                setTimeout(() => {
                  setTabOpen(data.status);
                }, 200);
              }
            }
            setLoading(false);
          }
        } catch (err) {
          history.push("/tickets");
          setLoading(false);
          toastError(err);
        }
      };
      fetchTicket();
    }, 500);

    return () => clearTimeout(delayDebounceFn);
  }, [ticketId, history]);

  useEffect(() => {
    if (!ticketId || ticketId === "undefined" || !user.companyId) {
      return;
    }

    const onConnectTicket = () => {
      const t = ticketRef.current;
      if (t?.id) {
        socket.emit("joinChatBox", `${t.id}`);
      }
    };

    const onCompanyTicket = (data) => {
      const t = ticketRef.current;
      if (data.action === "update" && data.ticket.id === t?.id) {
        setTicket(data.ticket);
      }
      if (data.action === "delete" && data.ticketId === t?.id) {
        history.push("/tickets");
      }
    };

    const onCompanyContactTicket = (data) => {
      if (data.action === "update") {
        setContact((prevState) => {
          if (prevState.id === data.contact?.id) {
            return { ...prevState, ...data.contact };
          }
          return prevState;
        });
      }
    };

    const onPresenceUpdate = (data) => {
      const t = ticketRef.current;
      if (String(data.ticketId) !== String(t?.id)) {
        return;
      }

      const p = data.presence;
      if (data.lastSeen) {
        setPresenceLastSeen(Number(data.lastSeen));
      } else if (p === "available" || p === "composing" || p === "recording") {
        setPresenceLastSeen(Math.floor(Date.now() / 1000));
      }

      // Não escondemos a presença por um timer cego: o WhatsApp só envia
      // presence.update quando o estado MUDA (não fica reenviando "available"),
      // então um timeout aqui apagaria o "Online" de um contato que continua
      // online porém parado. A limpeza fica a cargo do evento "unavailable"
      // vindo do backend.

      if (p === "composing" || p === "recording") {
        activePresenceUntilRef.current = Date.now() + 8000;
        setPresenceState(p);
        clearTimeout(presenceTimeoutRef.current);
        presenceTimeoutRef.current = setTimeout(() => {
          activePresenceUntilRef.current = 0;
          setPresenceState("available");
        }, 8000);
      } else if (p === "available") {
        if (activePresenceUntilRef.current > Date.now()) return;
        setPresenceState("available");
        clearTimeout(presenceTimeoutRef.current);
      } else if (p === "paused") {
        // Parar de digitar não significa offline → manter "Online"
        if (activePresenceUntilRef.current > Date.now()) return;
        setPresenceState("available");
        clearTimeout(presenceTimeoutRef.current);
      } else if (p === "unavailable") {
        activePresenceUntilRef.current = 0;
        setPresenceState("unavailable");
        clearTimeout(presenceTimeoutRef.current);
      }
    };

    socket.on("connect", onConnectTicket);
    socket.on(`company-${companyId}-ticket`, onCompanyTicket);
    socket.on(`company-${companyId}-contact`, onCompanyContactTicket);
    socket.on(`company-${companyId}-presence`, onPresenceUpdate);

    return () => {
      const t = ticketRef.current;
      if (t?.id) {
        socket.emit("joinChatBoxLeave", `${t.id}`);
      }
      socket.off("connect", onConnectTicket);
      socket.off(`company-${companyId}-ticket`, onCompanyTicket);
      socket.off(`company-${companyId}-contact`, onCompanyContactTicket);
      socket.off(`company-${companyId}-presence`, onPresenceUpdate);
      clearTimeout(presenceTimeoutRef.current);
      clearTimeout(presenceHiddenTimeoutRef.current);
      activePresenceUntilRef.current = 0;
    };
  }, [ticketId, companyId, socket, history]);

  useEffect(() => {
    if (!ticket?.id) return;

    socket.emit("joinChatBox", `${ticket.id}`);

    if (ticket.contact?.number && ticket.whatsappId) {
      // Normaliza o número (remove +, espaços e sufixos do JID)
      const rawNumber = String(ticket.contact.number)
        .replace(/[+\s]/g, "")
        .replace(/@.*$/, "");

      const subscribePayload = {
        ticketId: ticket.id,
        contactNumber: rawNumber,
        whatsappId: ticket.whatsappId,
        isGroup: ticket.isGroup,
      };

      const doSubscribe = () => {
        try {
          socket.emit("presenceSubscribe", subscribePayload);
        } catch (err) {
          console.warn("[PRESENCE-FRONT] erro ao emitir presenceSubscribe", err);
        }
      };

      // Assina imediatamente e renova periodicamente. A assinatura do Baileys
      // expira em ~55s; renovamos a cada 25s para tolerar atrasos da rede e
      // do throttling de timers em abas em segundo plano.
      doSubscribe();
      clearInterval(presenceIntervalRef.current);
      presenceIntervalRef.current = setInterval(doSubscribe, 20000);

      // Re-assina ao reconectar o socket, ao voltar a aba e ao recuperar foco.
      const onReconnect = () => doSubscribe();
      const onVisibility = () => {
        if (document.visibilityState === "visible") doSubscribe();
      };
      const onFocus = () => doSubscribe();

      socket.on("connect", onReconnect);
      socket.on("reconnect", onReconnect);
      document.addEventListener("visibilitychange", onVisibility);
      window.addEventListener("focus", onFocus);

      return () => {
        clearInterval(presenceIntervalRef.current);
        presenceIntervalRef.current = null;
        socket.off("connect", onReconnect);
        socket.off("reconnect", onReconnect);
        document.removeEventListener("visibilitychange", onVisibility);
        window.removeEventListener("focus", onFocus);
      };
    }
  }, [ticket?.id, ticket?.contact?.number, ticket?.whatsappId, ticket?.isGroup, socket]);

  const handleDrawerOpen = useCallback(() => {
    setDrawerOpen(true);
  }, []);

  const handleDrawerClose = useCallback(() => {
    setDrawerOpen(false);
  }, []);

  const handleQuickMessageSelect = (quickMessage) => {
    try {
      if (quickMessage.message) {
        const event = new CustomEvent('insertQuickMessage', {
          detail: { message: quickMessage.message }
        });
        window.dispatchEvent(event);
      }

    } catch (error) {
      console.error("Erro ao inserir resposta rápida:", error);
      toastError("Erro ao inserir resposta rápida");
    }
  };

  const renderMessagesList = () => {
    return (
      <>
        <Suspense fallback={<CircularProgress size={24} />}>
          <MessagesList
            isGroup={ticket.isGroup}
            onDrop={setDragDropFiles}
            whatsappId={ticket.whatsappId}
            queueId={ticket.queueId}
            channel={ticket.channel}
            ticketStatus={ticket.status}
            numericTicketId={ticket.id}
          />
        </Suspense>
        <Suspense fallback={<CircularProgress size={24} />}>
          <MessageInput
            ticketId={ticket.id}
            ticketStatus={ticket.status}
            ticketChannel={ticket.channel}
            droppedFiles={dragDropFiles}
            contactId={contact.id}
            whatsappId={ticket.whatsappId}
            isGroup={ticket.isGroup}
          />
        </Suspense>
      </>
    );
  };

  return (
    <div className={classes.root} id="drawer-container">
      <Paper
        variant="outlined"
        elevation={0}
        className={clsx(classes.mainWrapper, {
          [classes.mainWrapperShift]: drawerOpen && !isMobile,
        })}
      >
        <div className={classes.headerGroup}>
          <Suspense fallback={<CircularProgress size={24} />}>
            <TicketHeader loading={loading} ticket={ticket}>
              {ticket.contact !== undefined && (
                <div id="TicketHeader" style={{ overflow: "hidden", flexShrink: 1, minWidth: 0, maxWidth: isMobile ? "calc(100% - 56px)" : "calc(100% - 120px)" }}>
                  <Suspense fallback={null}>
                    <TicketInfo
                      contact={contact}
                      ticket={ticket}
                      onClick={handleDrawerOpen}
                      presenceState={presenceState}
                      presenceLastSeen={presenceLastSeen}
                      onContactUpdated={(atualizado) =>
                        setContact((anterior) => ({ ...anterior, ...atualizado }))
                      }
                    />
                  </Suspense>
                </div>
              )}
              <Suspense fallback={<CircularProgress size={24} />}>
                <Suspense fallback={null}>
                  <OfficialApiCountdown ticket={ticket} />
                </Suspense>
                <TicketActionButtons
                  ticket={ticket}
                  contact={contact}
                  onQuickMessageSelect={handleQuickMessageSelect}
                />
              </Suspense>
            </TicketHeader>
          </Suspense>

          <Paper className={classes.tagsWrapper} square elevation={0}>
            <TagsContainer contact={contact} />
          </Paper>
        </div>

        <div className={classes.conversationArea}>
          <ReplyMessageProvider>
            <ForwardMessageProvider>
              <EditMessageProvider>
                {renderMessagesList()}
              </EditMessageProvider>
            </ForwardMessageProvider>
          </ReplyMessageProvider>
        </div>
      </Paper>

      <Suspense fallback={null}>
        <ContactDrawer
          open={drawerOpen}
          handleDrawerClose={handleDrawerClose}
          contact={contact}
          loading={loading}
          ticket={ticket}
        />
      </Suspense>
    </div>
  );
};

export default Ticket;
