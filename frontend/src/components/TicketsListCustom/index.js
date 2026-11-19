import React, { useState, useEffect, useReducer, useContext, useMemo, useCallback, memo } from "react";
import { makeStyles } from "@material-ui/core/styles";
import List from "@material-ui/core/List";
import Paper from "@material-ui/core/Paper";
import Box from "@material-ui/core/Box";
import Pagination from "@material-ui/lab/Pagination";
import TicketListItemBase from "../TicketListItemCustom";
import TicketsListSkeleton from "../TicketsListSkeleton";
import ErrorBoundary from "../ErrorBoundary";
import useTickets from "../../hooks/useTickets";
import { i18n } from "../../translate/i18n";
import { AuthContext } from "../../context/Auth/AuthContext";

const MemoizedTicketListItem = memo(TicketListItemBase, (prev, next) => {
    if (!prev?.ticket || !next?.ticket) return prev?.ticket === next?.ticket;
    return prev.ticket.id === next.ticket.id &&
        prev.ticket.updatedAt === next.ticket.updatedAt &&
        prev.ticket.unreadMessages === next.ticket.unreadMessages &&
        prev.ticket.status === next.ticket.status &&
        prev.ticket.lastMessage === next.ticket.lastMessage &&
        JSON.stringify(prev.ticket.contact?.tags) === JSON.stringify(next.ticket.contact?.tags) &&
        JSON.stringify(prev.ticket.tags) === JSON.stringify(next.ticket.tags);
});

const useStyles = makeStyles((theme) => ({
    ticketsListWrapper: {
        position: "relative",
        display: "flex",
        height: "100%",
        flexDirection: "column",
        overflow: "hidden",
        borderTopRightRadius: 0,
        borderBottomRightRadius: 0,
    },

    ticketsList: {
        flex: 1,
        maxHeight: "100%",
        overflowY: "auto",
        scrollbarWidth: "none",
        "&::-webkit-scrollbar": {
            display: "none",
        },
        borderTop: "2px solid rgba(0, 0, 0, 0.12)",
    },

    ticketsListHeader: {
        color: "rgb(67, 83, 105)",
        zIndex: 2,
        backgroundColor: "white",
        borderBottom: "1px solid rgba(0, 0, 0, 0.12)",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
    },

    ticketsCount: {
        fontWeight: "normal",
        color: "rgb(104, 121, 146)",
        marginLeft: "8px",
        fontSize: "14px",
    },

    noTicketsText: {
        textAlign: "center",
        color: "rgb(104, 121, 146)",
        fontSize: "14px",
        lineHeight: "1.4",
    },

    noTicketsTitle: {
        textAlign: "center",
        fontSize: "16px",
        fontWeight: "600",
        margin: "0px",
    },

    noTicketsDiv: {
        display: "flex",
        margin: 40,
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
    },

    paginationBar: {
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: "10px 8px",
        borderTop: `1px solid ${theme.palette.divider}`,
        backgroundColor: theme.palette.background.paper,
    },

    paginationControl: {
        "& .MuiPagination-ul": {
            justifyContent: "center",
        },
    },
}));

const ticketSortAsc = (a, b) => {
    if (a.updatedAt < b.updatedAt) return -1;
    if (a.updatedAt > b.updatedAt) return 1;
    return 0;
}

const ticketSortDesc = (a, b) => {
    if (a.updatedAt > b.updatedAt) return -1;
    if (a.updatedAt < b.updatedAt) return 1;
    return 0;
}

const isTruthy = (value) => value === true || value === "true" || value === 1 || value === "1";

const isTicketGroup = (ticket) => {
    return isTruthy(ticket?.isGroup) ||
        ticket?.status === "group" ||
        isTruthy(ticket?.contact?.isGroup) ||
        String(ticket?.contact?.remoteJid || ticket?.remoteJid || "").includes("@g.us");
};

const ticketBelongsToTab = (ticket, tabStatus) => {
    if (tabStatus === "group") return isTicketGroup(ticket);
    if (tabStatus === "pending") return !isTicketGroup(ticket) && ticket?.status === "pending";
    if (tabStatus === "open") return !isTicketGroup(ticket) && ticket?.status === "open";
    if (tabStatus === "closed") return ticket?.status === "closed";
    if (tabStatus === "chatbot") return ticket?.status === "chatbot";
    if (tabStatus === "search") return true;
    return ticket?.status === tabStatus;
};

const reducer = (state, action) => {
    const sortDir = action.sortDir;

    if (action.type === "LOAD_TICKETS") {
        const newTickets = Array.isArray(action.payload) ? action.payload.filter(Boolean) : [];

        newTickets.forEach((ticket) => {
            const ticketIndex = state.findIndex((t) => t.id === ticket.id);
            if (ticketIndex !== -1) {
                state[ticketIndex] = ticket;
                if (ticket.unreadMessages > 0) {
                    state.unshift(state.splice(ticketIndex, 1)[0]);
                }
            } else {
                state.push(ticket);
            }
        });
        if (sortDir && ['ASC', 'DESC'].includes(sortDir)) {
            sortDir === 'ASC' ? state.sort(ticketSortAsc) : state.sort(ticketSortDesc);
        }

        return [...state];
    }

    if (action.type === "RESET_UNREAD") {
        const ticketId = action.payload;
        const ticketIndex = state.findIndex((t) => t.id === ticketId);
        if (ticketIndex !== -1) {
            // Preserve unread count for pending tickets so the awaiting tab
            // keeps showing the message count badge until the ticket is accepted.
            if (state[ticketIndex].status !== "pending") {
                state[ticketIndex].unreadMessages = 0;
            }
        }
        if (sortDir && ['ASC', 'DESC'].includes(sortDir)) {
            sortDir === 'ASC' ? state.sort(ticketSortAsc) : state.sort(ticketSortDesc);
        }
        return [...state];
    }

    if (action.type === "UPDATE_TICKET") {
        const ticket = action.payload;
        if (!ticket) return [...state];
        const ticketIndex = state.findIndex((t) => t.id === ticket.id);
        if (ticketIndex !== -1) {
            // If the ticket no longer belongs to this tab (e.g. a group ticket showing on the "open" tab),
            // remove it so realtime state matches what the backend returns on reload.
            if (!ticketBelongsToTab(ticket, action.status)) {
                state.splice(ticketIndex, 1);
            } else {
                state[ticketIndex] = ticket;
            }
        } else {
            // Only insert when the ticket actually belongs to this tab — prevents groups
            // from appearing in "open"/"pending" lists and then disappearing on refresh.
            if (ticketBelongsToTab(ticket, action.status)) {
                state.unshift(ticket);
            }
        }
        if (sortDir && ['ASC', 'DESC'].includes(sortDir)) {
            sortDir === 'ASC' ? state.sort(ticketSortAsc) : state.sort(ticketSortDesc);
        }
        return [...state];
    }

    if (action.type === "UPDATE_TICKET_UNREAD_MESSAGES") {
        const ticket = action.payload;
        if (!ticket) return [...state];
        const ticketIndex = state.findIndex((t) => t.id === ticket.id);
        if (ticketIndex !== -1) {
            state[ticketIndex] = ticket;
            state.unshift(state.splice(ticketIndex, 1)[0]);
        } else {
            // Use tab classification instead of raw status comparison
            if (ticketBelongsToTab(ticket, action.status)) {
                state.unshift(ticket);
            }
        }
        if (sortDir && ['ASC', 'DESC'].includes(sortDir)) {
            sortDir === 'ASC' ? state.sort(ticketSortAsc) : state.sort(ticketSortDesc);
        }
        return [...state];
    }

    if (action.type === "UPDATE_TICKET_CONTACT") {
        const contact = action.payload;
        const ticketIndex = state.findIndex((t) => t.contactId === contact.id);
        if (ticketIndex !== -1) {
            state[ticketIndex].contact = contact;
        }
        return [...state];
    }

    if (action.type === "DELETE_TICKET") {
        const ticketId = action.payload;
        const ticketIndex = state.findIndex((t) => t.id === ticketId);
        if (ticketIndex !== -1) {
            state.splice(ticketIndex, 1);
        }
        if (sortDir && ['ASC', 'DESC'].includes(sortDir)) {
            sortDir === 'ASC' ? state.sort(ticketSortAsc) : state.sort(ticketSortDesc);
        }
        return [...state];
    }

    if (action.type === "RESET") {
        return [];
    }
};

const TicketsListCustom = (props) => {
    const {
        setTabOpen,
        status,
        searchParam,
        searchOnMessages,
        tags,
        users,
        showAll,
        selectedQueueIds,
        updateCount,
        style,
        whatsappIds,
        forceSearch,
        refreshKey,
        statusFilter,
        userFilter,
        sortTickets
    } = props;

    const classes = useStyles();
    const [pageNumber, setPageNumber] = useState(1);
    const [softRefresh, setSoftRefresh] = useState(0);
    let [ticketsList, dispatch] = useReducer(reducer, []);
    const { user, socket } = useContext(AuthContext);

    const { profile, queues } = user;
    const showTicketWithoutQueue = user.allTicket === 'enable';
    const companyId = user.companyId;

    useEffect(() => {
        dispatch({ type: "RESET" });
        setPageNumber(1);
    }, [status, searchParam, dispatch, showAll, tags, users, forceSearch, selectedQueueIds, whatsappIds, statusFilter, sortTickets, searchOnMessages]);

    // Soft refresh: re-fetch without clearing the list (used by tagsUpdated)
    useEffect(() => {
        if (refreshKey > 0) {
            setSoftRefresh(prev => prev + 1);
            setPageNumber(1);
        }
    }, [refreshKey]);

    const { tickets, hasMore, loading, count } = useTickets({
        pageNumber,
        searchParam,
        status,
        showAll,
        searchOnMessages: searchOnMessages ? "true" : "false",
        tags: JSON.stringify(tags),
        users: JSON.stringify(users),
        queueIds: JSON.stringify(selectedQueueIds),
        whatsappIds: JSON.stringify(whatsappIds),
        statusFilter: JSON.stringify(statusFilter),
        userFilter,
        sortTickets,
        softRefresh
    });

    const TICKETS_PER_PAGE = 20;
    const totalPages = Math.max(1, Math.ceil((count || ticketsList.length) / TICKETS_PER_PAGE));

    useEffect(() => {
        if (companyId) {
            dispatch({
                type: "LOAD_TICKETS",
                payload: tickets,
                status,
                sortDir: sortTickets
            });
        }
    }, [tickets]);

    useEffect(() => {
        const normalizedSelectedQueueIds = (selectedQueueIds || [])
            .map(id => Number(id))
            .filter(id => Number.isInteger(id) && id > 0);

        const conexoesDoFiltro = (whatsappIds || []).map(Number).filter(id => Number.isInteger(id) && id > 0);
        const tagsDoFiltro = (tags || []).map(Number).filter(id => Number.isInteger(id) && id > 0);
        const usuariosDoFiltro = (users || []).map(Number).filter(id => Number.isInteger(id) && id > 0);
        const statusDoFiltro = (statusFilter || []).filter(Boolean);

        // Filtros da tela (Conexão / Tags / Usuários / Status) também valem para
        // o que chega em tempo real — antes só a primeira carga os respeitava.
        const atendeFiltrosDaTela = (ticket) => {
            if (conexoesDoFiltro.length > 0) {
                const idConexao = Number(ticket?.whatsappId ?? ticket?.whatsapp?.id);
                if (idConexao > 0 && !conexoesDoFiltro.includes(idConexao)) return false;
            }
            if (tagsDoFiltro.length > 0) {
                const tagsDoContato = ticket?.contact?.tags;
                if (Array.isArray(tagsDoContato) &&
                    !tagsDoContato.some(t => tagsDoFiltro.includes(Number(t?.id)))) {
                    return false;
                }
            }
            if (usuariosDoFiltro.length > 0 && !usuariosDoFiltro.includes(Number(ticket?.userId))) {
                return false;
            }
            if (statusDoFiltro.length > 0 && status !== "search") {
                const vaiPorGrupo = status === "group" && statusDoFiltro.includes("group");
                if (!vaiPorGrupo && !statusDoFiltro.includes(ticket?.status)) return false;
            }
            return true;
        };

        const shouldUpdateTicket = ticket => {
            if (!atendeFiltrosDaTela(ticket)) return false;
            const isGroupTicket = isTicketGroup(ticket);

            if (isGroupTicket) {
                const userWhatsappIds = (user?.whatsapps || []).map(w => Number(w.id));
                const allowedIds = userWhatsappIds.length > 0
                    ? userWhatsappIds
                    : (user?.whatsappId ? [Number(user.whatsappId)] : []);
                // Groups without queue are allowed; just check whatsapp connection
                const ticketWhatsappId = Number(ticket?.whatsappId ?? ticket?.whatsapp?.id);
                if (allowedIds.length > 0 && ticketWhatsappId > 0 && !allowedIds.includes(ticketWhatsappId)) return false;
                // Groups: allow if queue matches or no queue at all
                const tQueueId = Number(ticket?.queueId);
                if (tQueueId > 0 && normalizedSelectedQueueIds.length > 0 && normalizedSelectedQueueIds.indexOf(tQueueId) === -1) return false;
                return true;
            }

            const canSeeWithoutQueue = showTicketWithoutQueue;
            const tQueueId = Number(ticket?.queueId);
            return (!ticket?.userId || Number(ticket?.userId) === Number(user?.id) || showAll) &&
                ((!tQueueId && canSeeWithoutQueue) || normalizedSelectedQueueIds.indexOf(tQueueId) > -1)
        }

        const notBelongsToUserQueues = (ticket) => {
            const ticketQueueId = Number(ticket?.queueId);

            if (!ticketQueueId || normalizedSelectedQueueIds.length === 0) {
                return false;
            }

            return normalizedSelectedQueueIds.indexOf(ticketQueueId) === -1;
        };

        const onCompanyTicketTicketsList = (data) => {
            if (data.action === "updateUnread") {
                dispatch({
                    type: "RESET_UNREAD",
                    payload: data.ticketId,
                    status: status,
                    sortDir: sortTickets
                });
            }
            if (data.action === "update" &&
                shouldUpdateTicket(data.ticket) && ticketBelongsToTab(data.ticket, status)) {
                dispatch({
                    type: "UPDATE_TICKET",
                    payload: data.ticket,
                    status: status,
                    sortDir: sortTickets
                });
            }
            if (data.action === "update" && data.ticket && !atendeFiltrosDaTela(data.ticket)) {
                dispatch({
                    type: "DELETE_TICKET", payload: data.ticket?.id, status: status,
                    sortDir: sortTickets
                });
            }
            if (data.action === "update" && !isTicketGroup(data.ticket) && notBelongsToUserQueues(data.ticket)) {
                dispatch({
                    type: "DELETE_TICKET", payload: data.ticket?.id, status: status,
                    sortDir: sortTickets
                });
            }
            if (data.action === "delete") {
                dispatch({
                    type: "DELETE_TICKET", payload: data?.ticketId, status: status,
                    sortDir: sortTickets
                });
            }
        };

        const onCompanyAppMessageTicketsList = (data) => {
        if (data.action === "create" &&
                shouldUpdateTicket(data.ticket) && ticketBelongsToTab(data.ticket, status)) {
                const updatedTicket = {
                    ...data.ticket,
                    lastMessage: data.message?.body || data.ticket.lastMessage,
                    updatedAt: new Date().toISOString(),
                };
                dispatch({
                    type: "UPDATE_TICKET_UNREAD_MESSAGES",
                    payload: updatedTicket,
                    status: status,
                    sortDir: sortTickets
                });
            }
        };

        const onCompanyContactTicketsList = (data) => {
            if (data.action === "update" && data.contact) {
                dispatch({
                    type: "UPDATE_TICKET_CONTACT",
                    payload: data.contact,
                    status: status,
                    sortDir: sortTickets
                });
            }
        };

        const onConnectTicketsList = () => {
            if (status) {
                socket.emit("joinTickets", status);
            } else {
                socket.emit("joinNotification");
            }
        }

        if (socket.connected) {
            onConnectTicketsList();
        }

        socket.on("connect", onConnectTicketsList)
        socket.on(`company-${companyId}-ticket`, onCompanyTicketTicketsList);
        socket.on(`company-${companyId}-appMessage`, onCompanyAppMessageTicketsList);
        socket.on(`company-${companyId}-contact`, onCompanyContactTicketsList);

        return () => {
            // A limpeza roda tambem quando o socket ja esta caindo (troca de
            // pagina, reconexao). Emitir nesse instante gera o aviso de
            // "CLOSING or CLOSED" no console — e o servidor ja descarta a
            // inscricao sozinho quando a conexao morre.
            if (status && socket.connected) {
                socket.emit("leaveTickets", status);
            }
            // Não emitir leaveNotification aqui — o NotificationsPopOver é o dono da inscrição global
            socket.off("connect", onConnectTicketsList);
            socket.off(`company-${companyId}-ticket`, onCompanyTicketTicketsList);
            socket.off(`company-${companyId}-appMessage`, onCompanyAppMessageTicketsList);
            socket.off(`company-${companyId}-contact`, onCompanyContactTicketsList);
        };

    }, [status, showAll, user, selectedQueueIds, tags, users, profile, queues, sortTickets, showTicketWithoutQueue, whatsappIds, statusFilter]);

    // Última barreira do filtro de Conexão: o que estiver na lista e não for
    // de uma conexão escolhida não é exibido, venha de onde vier (carga, evento
    // em tempo real, item que ficou da lista anterior).
    const conexoesEscolhidas = (whatsappIds || []).map(Number).filter(id => Number.isInteger(id) && id > 0);
    const daConexaoEscolhida = (ticket) => {
        if (conexoesEscolhidas.length === 0) return true;
        const idConexao = Number(ticket?.whatsappId ?? ticket?.whatsapp?.id);
        return conexoesEscolhidas.includes(idConexao);
    };

    useEffect(() => {
        if (typeof updateCount === "function") {
            updateCount(ticketsList.filter(daConexaoEscolhida).length);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [ticketsList, whatsappIds]);

    ticketsList = ticketsList.filter(daConexaoEscolhida);

    if (status && status !== "search") {
        ticketsList = ticketsList.filter(ticket => ticketBelongsToTab(ticket, status))
    }

    return (
        <Paper className={classes.ticketsListWrapper} style={style}>
            <Paper
                square
                name="closed"
                elevation={0}
                className={classes.ticketsList}
            >
                <List style={{ paddingTop: 0 }} >
                    {ticketsList.length === 0 && !loading ? (
                        <div className={classes.noTicketsDiv}>
                            <span className={classes.noTicketsTitle}>
                                {i18n.t("ticketsList.noTicketsTitle")}
                            </span>
                            <p className={classes.noTicketsText}>
                                {i18n.t("ticketsList.noTicketsMessage")}
                            </p>
                        </div>
                    ) : (
                        <>
                            {ticketsList.filter(Boolean).map((ticket, index) => (
                                <ErrorBoundary key={ticket.id || index} fallback={null}>
                                    <MemoizedTicketListItem
                                        ticket={ticket}
                                        index={index}
                                        setTabOpen={setTabOpen}
                                    />
                                </ErrorBoundary>
                            ))}
                        </>
                    )}
                    {loading && <TicketsListSkeleton />}
                </List>
            </Paper>

            {(count > 0 || ticketsList.length > 0) && totalPages > 1 && (
                <Box className={classes.paginationBar}>
                    <Pagination
                        className={classes.paginationControl}
                        count={totalPages}
                        page={pageNumber}
                        size="small"
                        color="primary"
                        showFirstButton
                        showLastButton
                        onChange={(_, value) => {
                            if (value === pageNumber || loading) return;
                            dispatch({ type: "RESET" });
                            setPageNumber(value);
                        }}
                    />
                </Box>
            )}
        </Paper>
    );
};

export default TicketsListCustom;
