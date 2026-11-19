import React, { useEffect, useState } from "react";

import { Card, CircularProgress, IconButton, Tooltip } from "@material-ui/core";
import { makeStyles } from "@material-ui/core/styles";
import TicketHeaderSkeleton from "../TicketHeaderSkeleton";
import ArrowBackIosNewIcon from "@material-ui/icons/ArrowBackIos";
import CallIcon from "@material-ui/icons/Call";
import { useHistory } from "react-router-dom";
import { useWaCalls } from "../../context/WaCalls/WaCallsContext";
import toastError from "../../errors/toastError";
import { discarOficial } from "../../services/telefonia";


const useStyles = makeStyles(theme => ({
	ticketHeader: {
		display: "flex",
		alignItems: "center",
		background: theme.mode === "dark" 
			? "linear-gradient(135deg, #1e1e2f 0%, #252540 100%)" 
			: "linear-gradient(135deg, #ffffff 0%, #f8f9fc 100%)",
		flex: "none",
		flexShrink: 0,
		borderBottom: "none",
		boxShadow: theme.mode === "dark"
			? "0 1px 8px rgba(0,0,0,0.3)"
			: "0 1px 8px rgba(0,0,0,0.06)",
		height: "64px",
		flexWrap: "nowrap",
		overflow: "hidden",
		zIndex: 2,
		"@media (max-width: 960px)": {
			height: "58px",
			minHeight: "58px",
			padding: "0 2px",
			zIndex: 10,
			flexShrink: 0,
			position: "sticky",
			top: 0,
		},
	},
	backButton: {
		marginLeft: 4,
		padding: 8,
		color: theme.mode === "dark" ? "#94a3b8" : "#64748b",
		transition: "all 0.2s ease",
		"&:hover": {
			backgroundColor: theme.mode === "dark" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
			color: theme.palette.primary.main,
		},
	},
	backIcon: {
		fontSize: 18,
	},
}));

const TicketHeader = ({ loading, children, ticket }) => {
	const classes = useStyles();
	const history = useHistory();
	const waCalls = (() => { try { return useWaCalls(); } catch { return null; } })();

	const handleBack = () => { history.push("/tickets"); };

	const isWacalls = ticket?.whatsapp?.channel === "wacalls" || ticket?.channel === "wacalls";

	// A API Oficial também faz ligação (Calling API da Meta), mas o botão só
	// existia para o WhatsApp Plus — num atendimento oficial não aparecia nada,
	// mesmo com "Permitir ligações de voz" ativo no painel da Meta.
	const isOficial =
		ticket?.whatsapp?.channel === "whatsapp_oficial" ||
		ticket?.channel === "whatsapp_oficial";

	const canCall =
		!!ticket?.contact?.number &&
		((isWacalls && !!waCalls?.dial) || isOficial);

	const [calling, setCalling] = useState(false);

	const handleCall = async () => {
		if (calling) return;
		setCalling(true);
		try {
			if (isOficial) {
				// A ligação oficial é conduzida pelo painel que já fica montado na
				// tela (OfficialCallPanel), porque é ele que mantém o WebRTC e
				// recebe as chamadas. Aqui só pedimos a discagem pelo barramento —
				// mover essa lógica para cá arriscaria quebrar o atendimento de
				// chamadas recebidas.
				discarOficial(ticket.contact.number, ticket.whatsappId || ticket.whatsapp?.id);
				return;
			}

			// wacallsSessionId é campo antigo (era do wacalls-voip) e nunca é
			// preenchido desde a migração pro wacalls-chat — usar ele aqui sempre
			// mandava undefined, e o dial() só funcionava por sorte (fallback pra
			// primeira sessão conectada). O campo certo é wacallsChatSessionId.
			//
			// Preferir remoteJid ao número: contatos que só existem como LID (sem
			// telefone real exposto pelo WhatsApp) têm o campo `number` preenchido
			// só com os dígitos do LID (sem indicar que é @lid) — discar isso como
			// se fosse telefone normal manda pra um número que não existe e a
			// ligação trava até dar timeout. `remoteJid` carrega o domínio certo
			// (@lid ou @s.whatsapp.net).
			const dialTarget = ticket.contact.remoteJid || ticket.contact.number;
			await waCalls.dial(dialTarget, ticket.whatsapp?.wacallsChatSessionId);
		} catch (e) {
			// Backend já traduz timeout/erro de conexão pra uma mensagem legível
			// (WacallsController.friendlyCallError) — cai num toast discreto em
			// vez do alert() nativo do navegador, que travava a tela e mostrava
			// texto técnico em inglês pro agente.
			toastError(e);
		} finally {
			setCalling(false);
		}
	};

	return (
		<>
			{loading ? (
				<TicketHeaderSkeleton />
			) : (
				<Card square className={classes.ticketHeader} elevation={0}>
					<IconButton className={classes.backButton} onClick={handleBack} size="small">
						<ArrowBackIosNewIcon className={classes.backIcon} />
					</IconButton>
					{children}
					{canCall && (
						<Tooltip
							title={
								calling
									? "Ligando…"
									: isOficial
									? "Ligar (API Oficial)"
									: "Ligar (WhatsApp Plus - Voz + Msg)"
							}
						>
							<span>
								<IconButton
									onClick={handleCall}
									disabled={calling}
									size="small"
									style={{ marginRight: 8, color: "#22c55e" }}
								>
									{calling ? <CircularProgress size={18} style={{ color: "#22c55e" }} /> : <CallIcon />}
								</IconButton>
							</span>
						</Tooltip>
					)}
				</Card>
			)}
		</>
	);
};

export default TicketHeader;

