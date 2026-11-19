import React, { useState, useRef, useEffect, useContext, useMemo, useCallback } from "react";
import { useTheme } from "@material-ui/core/styles";
import { useHistory } from "react-router-dom";
import format from "date-fns/format";
import isSameDay from "date-fns/isSameDay";
import useSound from "use-sound";
import api from "../../services/api";

import Popover from "@material-ui/core/Popover";
import IconButton from "@material-ui/core/IconButton";
import { makeStyles } from "@material-ui/core/styles";
import Badge from "@material-ui/core/Badge";
import Avatar from "@material-ui/core/Avatar";
import Typography from "@material-ui/core/Typography";
import Box from "@material-ui/core/Box";
import { MdNotificationsNone } from "react-icons/md";
import WhatsAppIcon from "@material-ui/icons/WhatsApp";
import InstagramIcon from "@material-ui/icons/Instagram";
import FacebookIcon from "@material-ui/icons/Facebook";

import useTickets from "../../hooks/useTickets";
import alertSound from "../../assets/sound.mp3";
import { AuthContext } from "../../context/Auth/AuthContext";
import { i18n } from "../../translate/i18n";
// toastError deixou de ser usado aqui: falha ao ler configuracao vira apenas log.
import useCompanySettings from "../../hooks/useSettings/companySettings";
import Favicon from "react-favicon";
import { TicketsContext } from "../../context/Tickets/TicketsContext";
import { areNotificationsDisabled } from "../../helpers/notificationPrefs";
import { requestDesktopNotificationPermission, showDesktopNotification } from "../../helpers/desktopNotification";

const cleanInteractivePreview = (text) => {
	if (!text || typeof text !== "string") return text;
	if (/^\[BUTTON\]/i.test(text)) {
		const cleaned = text.replace(/^\[BUTTON\]\s*/i, "").split("\n")[0].replace(/\*/g, "").trim();
		return `🔘 ${cleaned}`;
	}
	if (/^\[LIST\]/i.test(text)) {
		const cleaned = text.replace(/^\[LIST\]\s*/i, "").split("\n")[0].replace(/\*/g, "").trim();
		return `📋 ${cleaned}`;
	}
	return text;
};

const defaultLogoFavicon = "/favicon.ico";

const isTruthy = (val) => {
	if (typeof val === "string") {
		return ["true", "enabled", "enable", "1", "yes", "sim"].includes(val.trim().toLowerCase());
	}

	return val === true || val === 1;
};

const isGroupNotificationTicket = (ticket) => (
	isTruthy(ticket?.isGroup) ||
	ticket?.status === "group" ||
	isTruthy(ticket?.contact?.isGroup) ||
	String(ticket?.contact?.remoteJid || ticket?.remoteJid || "").includes("@g.us")
);

const useStyles = makeStyles(theme => ({
	popoverPaper: {
		width: "100%",
		maxWidth: 380,
		borderRadius: 16,
		overflow: "hidden",
		boxShadow: "0 20px 60px rgba(0,0,0,0.15), 0 4px 20px rgba(0,0,0,0.08)",
		border: `1px solid ${theme.palette.type === "dark" ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.06)"}`,
		[theme.breakpoints.down("sm")]: {
			maxWidth: 320,
		},
	},
	badgeCustom: {
		backgroundColor: "#ef4444 !important",
		color: "#fff",
		fontSize: 11,
		fontWeight: 700,
		minWidth: 20,
		height: 20,
		borderRadius: 10,
		padding: "0 5px",
	},
	header: {
		display: "flex",
		alignItems: "center",
		justifyContent: "space-between",
		padding: "16px 20px 12px",
		borderBottom: `1px solid ${theme.palette.type === "dark" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.06)"}`,
		background: theme.palette.type === "dark"
			? "linear-gradient(135deg, #1e1e2e 0%, #2a2a3e 100%)"
			: "linear-gradient(135deg, #f8fafc 0%, #f1f5f9 100%)",
	},
	headerTitle: {
		fontSize: 16,
		fontWeight: 700,
		color: theme.palette.text.primary,
		letterSpacing: "-0.01em",
	},
	headerBadge: {
		display: "inline-flex",
		alignItems: "center",
		justifyContent: "center",
		minWidth: 28,
		height: 24,
		borderRadius: 12,
		backgroundColor: "#ef4444",
		color: "#fff",
		fontSize: 12,
		fontWeight: 700,
		padding: "0 8px",
	},
	listContainer: {
		overflowY: "auto",
		maxHeight: 400,
		padding: "4px 0",
		background: theme.palette.type === "dark" ? "#1a1a2e" : "#fff",
		"&::-webkit-scrollbar": {
			width: 5,
		},
		"&::-webkit-scrollbar-thumb": {
			borderRadius: 10,
			background: theme.palette.type === "dark" ? "rgba(255,255,255,0.12)" : "rgba(0,0,0,0.12)",
		},
	},
	notificationItem: {
		display: "flex",
		alignItems: "center",
		gap: 12,
		padding: "10px 16px",
		cursor: "pointer",
		transition: "background 0.15s ease",
		borderBottom: `1px solid ${theme.palette.type === "dark" ? "rgba(255,255,255,0.04)" : "rgba(0,0,0,0.04)"}`,
		"&:hover": {
			background: theme.palette.type === "dark" ? "rgba(255,255,255,0.05)" : "rgba(0,0,0,0.03)",
		},
		"&:last-child": {
			borderBottom: "none",
		},
	},
	queueBar: {
		width: 3,
		minHeight: 40,
		borderRadius: 4,
		flexShrink: 0,
		alignSelf: "stretch",
	},
	avatarWrapper: {
		position: "relative",
		flexShrink: 0,
	},
	avatar: {
		width: 40,
		height: 40,
		fontSize: 15,
		fontWeight: 600,
		backgroundColor: theme.palette.type === "dark" ? "#374151" : "#e2e8f0",
		color: theme.palette.type === "dark" ? "#d1d5db" : "#64748b",
	},
	channelIcon: {
		position: "absolute",
		bottom: -2,
		right: -2,
		width: 18,
		height: 18,
		borderRadius: "50%",
		display: "flex",
		alignItems: "center",
		justifyContent: "center",
		background: theme.palette.type === "dark" ? "#1a1a2e" : "#fff",
		border: `1.5px solid ${theme.palette.type === "dark" ? "#1a1a2e" : "#fff"}`,
	},
	contentWrapper: {
		flex: 1,
		minWidth: 0,
		display: "flex",
		flexDirection: "column",
		gap: 2,
	},
	topRow: {
		display: "flex",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 8,
	},
	contactName: {
		fontSize: 13,
		fontWeight: 600,
		color: theme.palette.text.primary,
		overflow: "hidden",
		textOverflow: "ellipsis",
		whiteSpace: "nowrap",
		flex: 1,
	},
	timestamp: {
		fontSize: 11,
		color: theme.palette.type === "dark" ? "#6b7280" : "#94a3b8",
		flexShrink: 0,
		fontWeight: 500,
	},
	bottomRow: {
		display: "flex",
		alignItems: "center",
		justifyContent: "space-between",
		gap: 8,
	},
	lastMessage: {
		fontSize: 12,
		color: theme.palette.type === "dark" ? "#9ca3af" : "#64748b",
		flex: 1,
		lineHeight: 1.4,
		display: "-webkit-box",
		WebkitLineClamp: 2,
		WebkitBoxOrient: "vertical",
		overflow: "hidden",
		wordBreak: "break-word",
	},
	unreadBadge: {
		display: "inline-flex",
		alignItems: "center",
		justifyContent: "center",
		minWidth: 20,
		height: 20,
		borderRadius: 10,
		backgroundColor: "#22c55e",
		color: "#fff",
		fontSize: 11,
		fontWeight: 700,
		padding: "0 5px",
		flexShrink: 0,
	},
	emptyState: {
		display: "flex",
		flexDirection: "column",
		alignItems: "center",
		justifyContent: "center",
		padding: "40px 20px",
		gap: 12,
	},
	emptyIcon: {
		color: theme.palette.type === "dark" ? "#374151" : "#cbd5e1",
		fontSize: 48,
	},
	emptyText: {
		fontSize: 14,
		color: theme.palette.type === "dark" ? "#6b7280" : "#94a3b8",
		fontWeight: 500,
	},
}));

const ChannelIndicator = ({ channel }) => {
	if (channel === "whatsapp") return <WhatsAppIcon style={{ fontSize: 13, color: "#25D366" }} />;
	if (channel === "instagram") return <InstagramIcon style={{ fontSize: 13, color: "#e1306c" }} />;
	if (channel === "facebook") return <FacebookIcon style={{ fontSize: 13, color: "#3b5998" }} />;
	return null;
};

const formatTimestamp = (dateStr) => {
	if (!dateStr) return "";
	const date = new Date(dateStr);
	if (isSameDay(date, new Date())) {
		return format(date, "HH:mm");
	}
	return format(date, "dd/MM");
};

/**
 * Reconhece a mensagem que o backend cria para registrar uma ligação.
 *
 * O corpo é fixo em português no servidor ("📞 Chamada recebida"), então
 * casamos pelo emoji de telefone no começo, que é o que não muda. Compara
 * também a última mensagem do ticket porque o evento de atualização de
 * ticket nem sempre carrega a mensagem.
 */
const ehMensagemDeChamada = (message, ticket) => {
  const corpo = String(message?.body || ticket?.lastMessage || "").trim();
  if (!corpo) return false;
  // Só o marcador do servidor. Casar por texto solto ("chamada recebida")
  // silenciaria um cliente que por acaso escrevesse isso.
  return corpo.startsWith("\u{1F4DE}");
};

const NotificationsPopOver = (volume) => {
	const classes = useStyles();
	const theme = useTheme();

	const history = useHistory();
	const { user, socket } = useContext(AuthContext);
	const { queues } = user;
	const { setTabOpen } = useContext(TicketsContext);

	const ticketIdUrl = +history.location.pathname.split("/")[2];
	const ticketIdRef = useRef(ticketIdUrl);
	const anchorEl = useRef();
	const [isOpen, setIsOpen] = useState(false);
	const [notifications, setNotifications] = useState([]);
	// Force re-render when the app language changes so i18n.t() calls update
	const [, setLangTick] = useState(0);
	useEffect(() => {
		const handler = () => setLangTick((tick) => tick + 1);
		i18n.on("languageChanged", handler);
		return () => i18n.off("languageChanged", handler);
	}, []);

	const queueIds = useMemo(() => (
		(queues || [])
			.map(queue => Number(queue.id))
			.filter(queueId => Number.isInteger(queueId) && queueId > 0)
	), [queues]);

	const allowedWhatsappIds = useMemo(() => {
		// Só restringe por conexão quando o usuário tem uma LISTA explícita de
		// conexões vinculadas. O campo `user.whatsappId` é apenas a conexão
		// padrão de envio — usá-lo como filtro fazia mensagem que chega em
		// outra conexão (ex.: WhatsApp Plus/wacalls) nunca gerar notificação.
		return (user?.whatsapps || [])
			.map(whatsapp => Number(whatsapp.id))
			.filter(whatsappId => Number.isInteger(whatsappId) && whatsappId > 0);
	}, [user]);

	const { get: getSetting } = useCompanySettings();

	// Permissoes do PROPRIO usuario: derivadas direto do contexto, de forma
	// reativa. Antes elas eram gravadas em useState dentro do mesmo efeito que
	// buscava a configuracao da empresa (`await getSetting(...)`) e com
	// dependencia []. Isso tinha dois defeitos:
	//   1) se aquela chamada demorasse ou falhasse, o `setShowGroupNotification`
	//      logo abaixo do await NUNCA executava e grupo ficava false para
	//      sempre — sem nenhum erro visivel;
	//   2) o snapshot de `user` era o da primeira renderizacao, entao mudanca
	//      de permissao so valia depois de recarregar a pagina.
	// Resultado pratico: so "Atendendo" notificava, porque ticket meu passa
	// pelo atalho `isMine` e nao depende de flag nenhuma.
	const showTicketWithoutQueue = useMemo(() => isTruthy(user?.allTicket), [user]);
	const showGroupNotification = useMemo(() => isTruthy(user?.allowGroup), [user]);
	const [showNotificationPending, setShowNotificationPending] = useState(false);

	const [, setDesktopNotifications] = useState([]);

	const { tickets } = useTickets({
		withUnreadMessages: "true",
		forceSearch: showNotificationPending ? "pending-on" : "pending-off"
	});

	const [play] = useSound(alertSound, volume);
	const soundAlertRef = useRef();

	const historyRef = useRef(history);
	const notificationsRef = useRef([]);

	// Pede permissão de notificação do sistema uma única vez, para que o
	// popup nativo (estilo WhatsApp Desktop) funcione desde a 1ª mensagem.
	useEffect(() => {
		requestDesktopNotificationPermission();
	}, []);
	const lastAlertedUnreadRef = useRef({});
	// Guarda as dedupeKeys avisadas há pouco, para não notificar/tocar o mesmo
	// evento mais de uma vez. O mesmo ticket/mensagem chega por mais de um canal
	// (evento de ticket + evento de mensagem, e reconexões), e sem isto o som
	// tocava 2-3 vezes ao mesmo tempo. { [key]: timestamp }.
	const recentAlertKeysRef = useRef({});

	const normalizeNotificationTicket = useCallback((ticket) => {
		const shouldBlurMessages = ticket?.status === "pending" && user?.allowSeeMessagesInPendingTickets === "disabled";

		if (!shouldBlurMessages) {
			return ticket;
		}

		return {
			...ticket,
			lastMessage: i18n.t("notifications.messageHidden")
		};
	}, [user]);

	useEffect(() => {
		notificationsRef.current = notifications;
	}, [notifications]);

	const canShowTicketNotification = useCallback((ticket) => {
		if (!ticket) return false;

		const isGroupTicket = isGroupNotificationTicket(ticket);
		const isPendingTicket = ticket.status === "pending";
		const ticketWhatsappId = Number(ticket.whatsappId ?? ticket?.whatsapp?.id);
		const ticketQueueId = Number(ticket.queueId ?? ticket?.queue?.id);
		const ticketUserId = Number(ticket.userId ?? ticket?.user?.id);
		const currentUserId = Number(user?.id);

		// FILTRO DE CONEXAO — so vale para GRUPO.
		//
		// `user.whatsapps` e @BelongsToMany(Whatsapp, UserWhatsapp): sao as
		// conexoes vinculadas AQUELE usuario, quase sempre um subconjunto das
		// conexoes da empresa. Aplicar isso a todo tipo de ticket criava uma
		// regra que NENHUMA outra parte do sistema usa: o ListTicketsService
		// so filtra por conexao no ramo de grupo (groupVisibilityCondition) —
		// os ramos de "pending" e "open" nao filtram. Ou seja, o atendente via
		// e atendia normalmente um ticket de outra conexao, mas a notificacao
		// dele era descartada em silencio aqui.
		//
		// Era exatamente o sintoma: ticket na conexao vinculada ao usuario
		// notificava; ticket que entrava por outra conexao nao notificava nem
		// aparecia no sino, independente de estar em Aguardando ou Atendendo.
		//
		// O comentario de `allowedWhatsappIds` acima ja tinha identificado
		// metade do problema (parou de usar `user.whatsappId` como filtro),
		// mas manteve `user.whatsapps`, que sofre do mesmo defeito.
		const conexaoBloqueada =
			allowedWhatsappIds.length > 0 &&
			Number.isInteger(ticketWhatsappId) &&
			ticketWhatsappId > 0 &&
			!allowedWhatsappIds.includes(ticketWhatsappId);

		// REGRA DAS FILAS (vale para todo mundo): o usuário só é avisado de
		// ticket de uma fila À QUAL ELE ESTÁ VINCULADO. Antes, quem não tinha
		// nenhuma fila (queueIds vazio) passava em todos os testes e recebia
		// notificação da empresa inteira, e ticket pendente sem fila avisava
		// todo mundo. Agora:
		//   - ticket atribuído a mim  -> sempre avisa;
		//   - atribuído a outro       -> nunca;
		//   - com fila                -> só se a fila for minha;
		//   - sem fila                -> só com "ver tickets sem fila";
		//   - grupo                   -> precisa da permissão de grupo e,
		//                                se tiver fila, que a fila seja minha.
		const temFila = Number.isInteger(ticketQueueId) && ticketQueueId > 0;
		const filaMinha = temFila && queueIds.includes(ticketQueueId);

		// --- Group ticket rules ---
		if (isGroupTicket) {
			if (!showGroupNotification) return false;
			if (conexaoBloqueada) return false;
			if (temFila && !filaMinha) return false;
			return true;
		}

		// --- Non-group ticket rules ---

		// Skip special statuses
		if (["closed", "lgpd", "nps", "chatbot"].includes(ticket.status)) return false;

		const isMine =
			Number.isInteger(ticketUserId) &&
			ticketUserId > 0 &&
			Number.isInteger(currentUserId) &&
			ticketUserId === currentUserId;
		const deOutroAtendente =
			Number.isInteger(ticketUserId) &&
			ticketUserId > 0 &&
			Number.isInteger(currentUserId) &&
			ticketUserId !== currentUserId;

		// Pendentes só com a opção de notificar pendentes ligada.
		if (isPendingTicket && !showNotificationPending) return false;

		// Ticket que JÁ É MEU sempre notifica, com ou sem fila.
		if (isMine) return true;
		if (deOutroAtendente) return false;

		if (temFila) return filaMinha;
		return showTicketWithoutQueue;
	}, [allowedWhatsappIds, queueIds, showGroupNotification, showNotificationPending, showTicketWithoutQueue, user]);

	const getNotificationMessageBody = useCallback((ticket, message) => {
		const shouldBlurMessages = ticket?.status === "pending" && user?.allowSeeMessagesInPendingTickets === "disabled";

		if (shouldBlurMessages) {
			return i18n.t("notifications.messageHidden");
		}

		return cleanInteractivePreview(message?.body || ticket?.lastMessage) || i18n.t("tickets.notification.message");
	}, [user]);

	const shouldAlertFromTicketUpdate = useCallback((ticket) => {
		const ticketId = Number(ticket?.id);
		const isPendingTicket = ticket?.status === "pending" && !isGroupNotificationTicket(ticket);
		const nextUnreadMessages = Number(ticket?.unreadMessages || 0);
		const previousTicket = notificationsRef.current.find(currentTicket => currentTicket.id === ticketId);

		if (isPendingTicket && !previousTicket && canShowTicketNotification(ticket)) {
			return true;
		}

		if (!Number.isInteger(ticketId) || ticketId <= 0 || nextUnreadMessages <= 0) {
			return false;
		}

		const previousUnreadMessages = Number(previousTicket?.unreadMessages || 0);
		const lastAlertedUnreadMessages = Number(lastAlertedUnreadRef.current[ticketId] || 0);

		return nextUnreadMessages > previousUnreadMessages && nextUnreadMessages > lastAlertedUnreadMessages;
	}, [canShowTicketNotification]);

	const showTicketActivityNotification = useCallback(({ ticket, contact, message, dedupeKey }) => {
		// DEDUPE: o mesmo evento chega por mais de um canal de socket. Se já
		// avisamos esta dedupeKey nos últimos segundos, ignora — é o que impede
		// a notificação e o som de virem 2-3 vezes ao mesmo tempo. Sem quebrar
		// nada: a PRIMEIRA vez sempre passa; só as repetições imediatas somem.
		if (dedupeKey) {
			const agora = Date.now();
			const anterior = recentAlertKeysRef.current[dedupeKey];
			if (anterior && agora - anterior < 3000) {
				return;
			}
			recentAlertKeysRef.current[dedupeKey] = agora;
			// Limpeza: remove keys com mais de 10s para o objeto não crescer.
			for (const k of Object.keys(recentAlertKeysRef.current)) {
				if (agora - recentAlertKeysRef.current[k] > 10000) {
					delete recentAlertKeysRef.current[k];
				}
			}
		}

		// Segunda barreira, para o caso da MESMA mensagem chegar por dois canais
		// diferentes (evento de ticket e evento de mensagem), que têm dedupeKeys
		// distintas. Um mesmo ticket não dispara som/notificação duas vezes em
		// menos de 1,5s. Mensagens espaçadas (conversa real) passam normalmente.
		if (ticket?.id) {
			const agora = Date.now();
			const ultimoDoTicket = recentAlertKeysRef.current[`t-${ticket.id}`];
			if (ultimoDoTicket && agora - ultimoDoTicket < 1500) {
				return;
			}
			recentAlertKeysRef.current[`t-${ticket.id}`] = agora;
		}

		// Notificação de "nova mensagem" (toast + som + notificação do
		// navegador). O que decide se aparece ou não é:
		//  - a preferência local do navegador (areNotificationsDisabled), e
		//  - canShowTicketNotification (fila/conexão/usuário + a config
		//    "showNotificationPending" da empresa), aplicado por quem chama.
		// Não há mais bloqueio fixo por status: "Aguardando" (pending) e
		// "Atendendo" (open) notificam normalmente quando habilitado.
		if (!ticket) return;
		if (areNotificationsDisabled()) return;
		// Ligação não gera aviso de mensagem. O backend registra a chamada
		// como uma mensagem no atendimento ("📞 Chamada recebida", ver
		// HandleWacallsCall.ts) só pra ela aparecer no histórico da conversa —
		// mas quem avisa que o telefone está tocando é o modal de chamada,
		// com toque. O toast em cima disso virava aviso duplicado, e pior:
		// aparecia também quando a chamada só passava pelo atendimento sem
		// ninguém ligar de fato.
		if (ehMensagemDeChamada(message, ticket)) return;

		// O cartão flutuante dentro da página (toast com "Grupo"/"Aguardando" e
		// os botões Aceitar/Fechar) foi removido. O aviso agora é só a
		// notificação nativa do sistema operacional (igual WhatsApp Desktop)
		// + som, válido para grupos e atendimento normal.
		const ticketId = Number(ticket.id);
		const unreadMessages = Number(ticket.unreadMessages || 0);

		if (Number.isInteger(ticketId) && ticketId > 0 && unreadMessages > 0) {
			lastAlertedUnreadRef.current[ticketId] = unreadMessages;
		} else if (Number.isInteger(ticketId) && ticketId > 0 && ticket.status === "pending") {
			lastAlertedUnreadRef.current[ticketId] = Math.max(Number(lastAlertedUnreadRef.current[ticketId] || 0), 1);
		}

		const corpo = getNotificationMessageBody(ticket, message);
		handleBrowserNotification({ contact: contact || ticket.contact, ticket }, corpo);
		soundAlertRef.current?.();
	}, [getNotificationMessageBody, handleBrowserNotification]);

	const upsertNotification = useCallback((ticket) => {
		const ticketToAdd = normalizeNotificationTicket(ticket);

		setNotifications(prevState => {
			const ticketIndex = prevState.findIndex(t => t.id === ticketToAdd.id);
			if (ticketIndex !== -1) {
				const nextState = [...prevState];
				nextState[ticketIndex] = ticketToAdd;
				return nextState;
			}

			return [ticketToAdd, ...prevState];
		});

		return ticketToAdd;
	}, [normalizeNotificationTicket]);

	const removeNotification = useCallback((ticketId) => {
		setNotifications(prevState => prevState.filter(t => t.id !== ticketId));
		delete lastAlertedUnreadRef.current[ticketId];

		setDesktopNotifications(prevState => {
			prevState
				.filter(notification => notification.tag === String(ticketId))
				.forEach(notification => notification.close());

			return prevState.filter(notification => notification.tag !== String(ticketId));
		});
	}, []);

	const clearNotifications = useCallback(() => {
		setNotifications([]);

		setDesktopNotifications(prevState => {
			prevState.forEach(notification => notification.close());
			return [];
		});
	}, []);

	useEffect(() => {
		// Este efeito cuida SO da configuracao da empresa. Se ele falhar, as
		// notificacoes de grupo e de ticket sem fila continuam funcionando,
		// porque agora vem direto das permissoes do usuario (useMemo acima).
		const fetchSettings = async () => {
			try {
				const setting = await getSetting({
					"column": "showNotificationPending"
				});

				setShowNotificationPending(isTruthy(setting?.showNotificationPending));
			} catch (err) {
				// Nao usa toastError: falha aqui nao pode virar popup de erro a
				// cada carregamento, e ja nao derruba mais o resto.
				console.warn("[NOTIF] falha ao ler showNotificationPending", err?.message || err);
			}
		};

		fetchSettings();
		// eslint-disable-next-line react-hooks/exhaustive-deps
	}, [user?.companyId]);

	useEffect(() => {
		soundAlertRef.current = play;

		// Não solicitar permissão nem assinar push automaticamente.
	}, [play]);

	useEffect(() => {
		const filtered = tickets
			.filter(ticket => ticket.unreadMessages > 0 && canShowTicketNotification(ticket))
			.map(ticket => normalizeNotificationTicket(ticket));

		setNotifications(filtered);
	}, [tickets, canShowTicketNotification, normalizeNotificationTicket]);

	useEffect(() => {
		ticketIdRef.current = ticketIdUrl;
	}, [ticketIdUrl]);

	useEffect(() => {
		const companyId = user.companyId;
		if (!user.id || !socket) {
			return undefined;
		}


		const onConnectNotificationsPopover = () => {
			socket.emit("joinNotification");
		};

		const onCompanyTicketNotificationsPopover = (data) => {

			if (data.action === "updateUnread" || data.action === "delete") {
				removeNotification(data.ticketId);
				return;
			}

			if (data.action === "update" && data.ticket) {
				const ticket = data.ticket;
				const isPendingTicket = ticket.status === "pending" && !isGroupNotificationTicket(ticket);

				if ((!ticket.unreadMessages && !isPendingTicket) || !canShowTicketNotification(ticket)) {
					removeNotification(ticket.id);
					return;
				}

				const shouldAlert = shouldAlertFromTicketUpdate(ticket);

				upsertNotification(ticket);

				// Ticket novo em "Aguardando" (ou com contador de não lidas
				// subindo) chega por esse evento — sem notificar aqui, um
				// ticket que entra na fila sem evento de mensagem (transferência,
				// retorno de bot) não avisava ninguém.
				if (shouldAlert) {
					showTicketActivityNotification({
						ticket,
						contact: ticket?.contact,
						dedupeKey: `ticket-${ticket.id}-${ticket.unreadMessages || 0}`
					});
				}
			}
		};

		const onCompanyAppMessageNotificationsPopover = (data) => {

			if (data.action !== "create" || data.message.fromMe) return;

			const ticket = data.ticket || data.message?.ticket;
			const isPendingTicket = ticket?.status === "pending" && !isGroupNotificationTicket(ticket);

			if (!ticket) return;
			if (data.message.read && !isPendingTicket) return;
			if (!canShowTicketNotification(ticket)) {
				return;
			}

			upsertNotification(ticket);

			showTicketActivityNotification({
				ticket,
				contact: data.contact || ticket?.contact,
				message: data.message,
				dedupeKey: `msg-${data.message.id}`
			});
		};

		// Emitir em socket ainda nao conectado (ou ja fechando) faz o navegador
		// logar "WebSocket is already in CLOSING or CLOSED state" a cada
		// tentativa. Quando conectar, o handler de "connect" logo abaixo emite.
		// E o mesmo cuidado que o TicketsListCustom ja tomava.
		if (socket.connected) {
			socket.emit("joinNotification");
		}
		socket.on("connect", onConnectNotificationsPopover);
		socket.on(`company-${companyId}-ticket`, onCompanyTicketNotificationsPopover);
		socket.on(`company-${companyId}-appMessage`, onCompanyAppMessageNotificationsPopover);

		return () => {
			socket.off("connect", onConnectNotificationsPopover);
			socket.off(`company-${companyId}-ticket`, onCompanyTicketNotificationsPopover);
			socket.off(`company-${companyId}-appMessage`, onCompanyAppMessageNotificationsPopover);
		};
	}, [user, socket, canShowTicketNotification, removeNotification, showGroupNotification, showNotificationPending, showTicketWithoutQueue, shouldAlertFromTicketUpdate, showTicketActivityNotification, upsertNotification, queueIds, allowedWhatsappIds]);

	function handleBrowserNotification(data, messageBody) {
		// Notificação nativa do sistema (aparece mesmo com a aba em outra
		// janela / minimizada), igual ao WhatsApp Desktop. Vale para grupos e
		// para atendimento normal.
		const ticket = data?.ticket;
		const contact = data?.contact || ticket?.contact;
		if (!ticket) return;

		const isGroup = isGroupNotificationTicket(ticket);
		const title = contact?.name || i18n.t("tickets.notification.message");

		// Mensagem de contato (vCard) chega como o cartão cru — a notificação
		// do Windows mostrava "BEGIN:VCARD VERSION:3.0 N:;;;; FN:..." em vez
		// do nome de quem foi compartilhado. Converte pra algo legível,
		// suportando vários contatos no mesmo cartão.
		let corpoLegivel = messageBody || "";
		if (typeof corpoLegivel === "string" && corpoLegivel.includes("BEGIN:VCARD")) {
			const cartoes = corpoLegivel.match(/BEGIN:VCARD[\s\S]*?END:VCARD/g) || [corpoLegivel];
			// FN costuma vir vazio nos cartões do WhatsApp; nesse caso cai
			// pro telefone, senão a notificação ficaria só com o emoji.
			const nomes = cartoes
				.map(c => {
					const fn = (c.match(/^FN:(.*)$/m)?.[1] || "").trim();
					if (fn) return fn;
					const tel = (c.match(/waid=(\d+)/)?.[1] || "").trim();
					return tel;
				})
				.filter(Boolean);
			if (nomes.length === 1) {
				corpoLegivel = `📇 ${nomes[0]}`;
			} else if (nomes.length > 1) {
				corpoLegivel = `📇 ${nomes.length} contatos: ${nomes.join(", ")}`;
			} else {
				corpoLegivel = "📇 Contato";
			}
		}

		const notification = showDesktopNotification({
			title,
			body: corpoLegivel,
			icon: contact?.urlPicture || defaultLogoFavicon,
			tag: ticket.id,
			url: `/tickets/${ticket.uuid}`,
			onClick: () => {
				setTabOpen(isGroup ? "group" : ticket.status);
				historyRef.current.push(`/tickets/${ticket.uuid}`);
			},
		});

		if (notification) {
			setDesktopNotifications(prevState => [notification, ...prevState]);
		}
	}

	const handleClick = () => {
		setIsOpen(prevState => !prevState);
	};

	const handleClickAway = () => {
		setIsOpen(false);
	};

	const handleSelectTicket = (ticket) => {
		const status = isGroupNotificationTicket(ticket) ? "group" : ticket.status;
		setTabOpen(status);
		history.push(`/tickets/${ticket.uuid}`);
		handleClickAway();
	};

	const getInitials = (name) => {
		if (!name) return "?";
		const parts = name.trim().split(" ");
		if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
		return parts[0][0]?.toUpperCase() || "?";
	};

	const browserNotification = () => {
		const numbers = "⓿➊➋➌➍➎➏➐➑➒➓⓫⓬⓭⓮⓯⓰⓱⓲⓳⓴";
		if (notifications.length > 0) {
			if (notifications.length < 21) {
				document.title = numbers.substring(notifications.length, notifications.length + 1) + " - " + (theme.appName || "...");
			} else {
				document.title = "(" + notifications.length + ")" + (theme.appName || "...");
			}
		} else {
			document.title = theme.appName || "...";
		}
		return (
			<Favicon
				animated={true}
				url={(theme?.appLogoFavicon) ? theme.appLogoFavicon : defaultLogoFavicon}
				alertCount={notifications.length}
				iconSize={195}
			/>
		);
	};

	return (
		<>
			{browserNotification()}

			<IconButton
				onClick={handleClick}
				ref={anchorEl}
				aria-label="Open Notifications"
				color="inherit"
				size="small"
				style={{ padding: 8, minWidth: 40, minHeight: 40 }}
			>
				<Badge
					overlap="rectangular"
					badgeContent={notifications.length}
					max={99}
					color="error"
					anchorOrigin={{ vertical: "top", horizontal: "right" }}
				classes={{ badge: classes.badgeCustom }}
				invisible={notifications.length === 0}
				>
					<MdNotificationsNone size={24} color="#6b7280" />
				</Badge>
			</IconButton>

			<Popover
				disableScrollLock
				open={isOpen}
				anchorEl={anchorEl.current}
				anchorOrigin={{
					vertical: "bottom",
					horizontal: "right",
				}}
				transformOrigin={{
					vertical: "top",
					horizontal: "right",
				}}
				classes={{ paper: classes.popoverPaper }}
				onClose={handleClickAway}
			>
			{/* Header */}
				<Box className={classes.header}>
					<Box style={{ display: "flex", alignItems: "center", gap: 8 }}>
						<Typography className={classes.headerTitle}>
							{i18n.t("notifications.title")}
						</Typography>
						{notifications.length > 0 && (
							<span className={classes.headerBadge}>
								{notifications.length}
							</span>
						)}
					</Box>
					{notifications.length > 0 && (
						<span
							onClick={clearNotifications}
							style={{
								fontSize: 13,
								fontWeight: 500,
								color: "#6b7280",
								cursor: "pointer",
								userSelect: "none",
								padding: "2px 6px",
								borderRadius: 6,
								transition: "background 0.15s",
							}}
							onMouseEnter={(e) => e.target.style.background = "rgba(0,0,0,0.05)"}
							onMouseLeave={(e) => e.target.style.background = "transparent"}
						>
							{i18n.t("notifications.clearAll")}
						</span>
					)}
				</Box>

				{/* List */}
				<Box className={classes.listContainer}>
					{notifications.length === 0 ? (
						<Box className={classes.emptyState}>
							<MdNotificationsNone className={classes.emptyIcon} />
							<Typography className={classes.emptyText}>
								{i18n.t("notifications.noTickets")}
							</Typography>
						</Box>
					) : (
						notifications.map(ticket => (
							<Box
								key={ticket.id}
								className={classes.notificationItem}
								onClick={() => handleSelectTicket(ticket)}
							>
								{/* Queue color bar */}
								<Box
									className={classes.queueBar}
									style={{
										backgroundColor: ticket.queue?.color || "#94a3b8",
									}}
								/>

								{/* Avatar + channel icon */}
								<Box className={classes.avatarWrapper}>
									<Avatar
										className={classes.avatar}
										src={ticket.contact?.urlPicture}
										alt={ticket.contact?.name}
									>
										{getInitials(ticket.contact?.name)}
									</Avatar>
									{ticket.channel && (
										<Box className={classes.channelIcon}>
											<ChannelIndicator channel={ticket.channel} />
										</Box>
									)}
								</Box>

								{/* Content */}
								<Box className={classes.contentWrapper}>
									<Box className={classes.topRow}>
										<Typography className={classes.contactName}>
											{ticket.contact?.name || "#" + ticket.id}
										</Typography>
										<Typography className={classes.timestamp}>
											{formatTimestamp(ticket.updatedAt)}
										</Typography>
									</Box>
									<Box className={classes.bottomRow}>
										<Typography className={classes.lastMessage}>
											{cleanInteractivePreview(ticket.lastMessage) || "..."}
										</Typography>
										{ticket.unreadMessages > 0 && (
											<span className={classes.unreadBadge}>
												{ticket.unreadMessages}
											</span>
										)}
									</Box>
								</Box>
							</Box>
						))
					)}
				</Box>
			</Popover>
		</>
	);
};

export default NotificationsPopOver;
