import React, { useState, useContext, useEffect, useRef } from "react";
import LeadSourceSelector from "../LeadSourceSelector";
import { i18n } from "../../translate/i18n";
import { Avatar, CardHeader, Dialog, DialogContent } from "@material-ui/core";
import { makeStyles } from "@material-ui/core/styles";
import { AuthContext } from "../../context/Auth/AuthContext";

const useStyles = makeStyles((theme) => ({
    // ... keep existing code (imageModal, imageModalContent, expandedImage, clickableAvatar)
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
        "&:hover": {
            opacity: 0.8,
        },
    },
    ticketInfoContainer: {
        display: "flex",
        alignItems: "center",
        overflow: "hidden",
        flexShrink: 1,
        minWidth: 0,
        flex: 1,
        "& .MuiCardHeader-root": {
            padding: "8px 10px",
            overflow: "hidden",
            width: "100%",
        },
        [theme.breakpoints.down("sm")]: {
            "& .MuiCardHeader-root": {
                padding: "2px 4px",
            },
			"& .MuiAvatar-root": {
				width: 30,
				height: 30,
			},
            "& .MuiCardHeader-title": {
                fontSize: "0.82rem",
            },
            "& .MuiCardHeader-subheader": {
                fontSize: "0.65rem",
            },
        },
        "& .MuiCardHeader-content": {
            overflow: "hidden",
            minWidth: 0,
        },
        "& .MuiCardHeader-title": {
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            fontSize: "0.9rem",
            fontWeight: 600,
            maxWidth: "100%",
            display: "block",
            color: theme.mode === "dark" ? "#e2e8f0" : "#1e293b",
            letterSpacing: "-0.01em",
        },
        "& .MuiCardHeader-subheader": {
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
            fontSize: "0.72rem",
            maxWidth: "100%",
            display: "block",
            color: theme.mode === "dark" ? "#94a3b8" : "#64748b",
        },
    },
    typingIndicator: {
        color: "#25D366",
        fontSize: "0.75rem",
        fontStyle: "italic",
        animation: "$blink 1.4s infinite",
        marginTop: -2,
    },
    onlineIndicator: {
        color: "#25D366",
        fontSize: "0.75rem",
        fontWeight: 600,
        marginTop: -2,
    },
    offlineIndicator: {
        color: theme.mode === "dark" ? "#94a3b8" : "#64748b",
        fontSize: "0.72rem",
        marginTop: -2,
    },
    "@keyframes blink": {
        "0%, 100%": { opacity: 1 },
        "50%": { opacity: 0.4 },
    },
}));

const TicketInfo = ({ contact, ticket, onClick, presenceState, presenceLastSeen, onContactUpdated }) => {
    const classes = useStyles();
    const [amount, setAmount] = useState("");
    const { user } = useContext(AuthContext);
    const [imageModalOpen, setImageModalOpen] = useState(false);

    const handleImageClick = (e) => {
        e.stopPropagation();
        if (contact?.urlPicture) {
            setImageModalOpen(true);
        }
    };

    const handleImageModalClose = () => {
        setImageModalOpen(false);
    };

    const formatLastSeen = (ts) => {
        if (!ts) return null;
        try {
            const ms = Number(ts) < 1e12 ? Number(ts) * 1000 : Number(ts);
            const d = new Date(ms);
            const now = new Date();
            const sameDay = d.toDateString() === now.toDateString();
            const time = d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
            if (sameDay) return `visto por último às ${time}`;
            return `visto por último em ${d.toLocaleDateString()} ${time}`;
        } catch {
            return null;
        }
    };

    const renderPresence = () => {
        if (presenceState === "composing") {
            return <span className={classes.typingIndicator}>digitando...</span>;
        }
        if (presenceState === "recording") {
            return <span className={classes.typingIndicator}>gravando áudio...</span>;
        }
        if (presenceState === "available") {
            return <span className={classes.onlineIndicator}>● online</span>;
        }
        if (presenceState === "unavailable") {
            const last = formatLastSeen(presenceLastSeen);
            if (last) return <span className={classes.offlineIndicator}>{last}</span>;
        }
        return null;
    };

    const presenceNode = renderPresence();

    const buildSubheader = () => {
        const parts = [
            ticket?.user && `${i18n.t("messagesList.header.assignedTo")} ${ticket?.user?.name}`,
            contact?.contactWallets && contact.contactWallets.length > 0
                ? `• ${i18n.t("wallets.wallet")}: ${contact.contactWallets[0].wallet?.name || 'N/A'}`
                : null
        ].filter(Boolean).join(' ');

        // O seletor de origem entra na subheader, ao lado de "Atribuido a" e
        // da presenca. E onde o atendente ja olha ao abrir a conversa, e o
        // chip fica visivel sem competir com o nome do contato.
        const origem = contact?.id ? (
            <LeadSourceSelector contact={contact} onUpdated={onContactUpdated} />
        ) : null;

        return (
            <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                {parts}
                {presenceNode && (
                    <>
                        {parts ? " · " : null}
                        {presenceNode}
                    </>
                )}
                {origem}
            </span>
        );
    };

    const renderCardReader = () => {
        return (
            <CardHeader
                onClick={onClick}
                style={{ cursor: "pointer" }}
                titleTypographyProps={{ noWrap: true }}
                subheaderTypographyProps={{ noWrap: true }}
                avatar={
                    <Avatar 
                        src={contact?.urlPicture} 
                        alt="contact_image" 
                        className={classes.clickableAvatar}
                        onClick={handleImageClick}
                        style={{ 
                            backgroundColor: !contact?.urlPicture ? '#6366f1' : undefined, 
                            color: '#fff', 
                            fontWeight: 600,
                            width: 40,
                            height: 40,
                            fontSize: '0.9rem',
                            boxShadow: '0 2px 8px rgba(0,0,0,0.1)',
                        }}
                    >
                        {!contact?.urlPicture && contact?.name
                            ? contact.name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase()).join('')
                            : null}
                    </Avatar>
                }
                title={`${contact?.name || '(sem contato)'} #${ticket?.id}`}
                subheader={buildSubheader()}
            />
        );
    }

    const handleChange = (event) => {
        const value = event.target.value;
        setAmount(value);
    }

    return (
        <React.Fragment>
            <div className={classes.ticketInfoContainer}>
                {renderCardReader()}
            </div>

            <Dialog
                open={imageModalOpen}
                onClose={handleImageModalClose}
                className={classes.imageModal}
                maxWidth="md"
                fullWidth
            >
                <DialogContent className={classes.imageModalContent}>
                    <img 
                        src={contact?.urlPicture} 
                        alt={contact?.name || "Foto do contato"}
                        className={classes.expandedImage}
                    />
                </DialogContent>
            </Dialog>
        </React.Fragment>
    );
};

export default TicketInfo;