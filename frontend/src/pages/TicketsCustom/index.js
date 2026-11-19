import React, { useContext, Suspense } from "react";
import { useParams } from "react-router-dom";
import Paper from "@material-ui/core/Paper";
import Hidden from "@material-ui/core/Hidden";
import { makeStyles } from "@material-ui/core/styles";
import TicketsManagerTabs from "../../components/TicketsManagerTabs";
import { QueueSelectedProvider } from "../../context/QueuesSelected/QueuesSelectedContext";
import { TicketsContext } from "../../context/Tickets/TicketsContext";
import { i18n } from "../../translate/i18n";
import { AuthContext } from "../../context/Auth/AuthContext";
import { CircularProgress } from "@material-ui/core";

const Ticket = React.lazy(() => import("../../components/Ticket"));

const FIXED_TICKETS_MANAGER_WIDTH = 440;

const useStyles = makeStyles((theme) => ({
	chatContainer: {
		flex: 1,
		padding: "2px",
		height: `calc(100% - 48px)`,
		overflowY: "hidden",
	},
	chatPapper: {
		display: "flex",
		height: "100%",
	},
	contactsWrapper: {
		display: "flex",
		height: "100%",
		flexDirection: "column",
		overflowY: "hidden",
		position: "relative",
		width: `${FIXED_TICKETS_MANAGER_WIDTH}px`,
		minWidth: `${FIXED_TICKETS_MANAGER_WIDTH}px`,
		maxWidth: `${FIXED_TICKETS_MANAGER_WIDTH}px`,
		[theme.breakpoints.down("sm")]: {
			minWidth: "100%",
			width: "100% !important",
			maxWidth: "100% !important",
		},
	},
	messagesWrapper: {
		display: "flex",
		height: "100%",
		flexDirection: "column",
		flexGrow: 1,
		[theme.breakpoints.down("sm")]: {
			display: (props) => props.ticketId ? "flex" : "none",
			position: "fixed",
			top: 0,
			left: 0,
			right: 0,
			bottom: 0,
			zIndex: 1200,
			backgroundColor: theme.palette.background?.default || "#fff",
		},
	},
	welcomeMsg: {
		background: theme.palette.tabHeaderBackground,
		display: "flex",
		justifyContent: "space-evenly",
		alignItems: "center",
		height: "100%",
		textAlign: "center",
	},
	logo: {
		logo: theme.logo,
		content: "url(" + (theme.mode === "light" 
			? theme.calculatedLogoLight() 
			: theme.calculatedLogoDark()) + ")"
	},
}));

const TicketsCustom = () => {
	const { user } = useContext(AuthContext);
	const { ticketId } = useParams();
	const classes = useStyles({ ticketId });

	return (
		<QueueSelectedProvider>
			<div className={classes.chatContainer}>
				<div className={classes.chatPapper}>
					<div className={classes.contactsWrapper}>
						<TicketsManagerTabs />
					</div>
					<div className={classes.messagesWrapper}>
						{ticketId ? (
							<Suspense fallback={<div style={{display:'flex',justifyContent:'center',alignItems:'center',height:'100%'}}><CircularProgress /></div>}>
								<Ticket />
							</Suspense>
						) : (
							<Hidden only={["sm", "xs"]}>
								<Paper square variant="outlined" className={classes.welcomeMsg}>
									<span>
										<center>
											<img className={classes.logo} width="50%" alt="" />
										</center>
										{i18n.t("chat.noTicketMessage")}
									</span>
								</Paper>
							</Hidden>
						)}
					</div>
				</div>
			</div>
		</QueueSelectedProvider>
	);
};

export default TicketsCustom;