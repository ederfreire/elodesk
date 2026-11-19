import React, { useState, useContext } from "react";

import MenuItem from "@material-ui/core/MenuItem";
import { makeStyles, Popover } from "@material-ui/core";

import { i18n } from "../../translate/i18n";
import api from "../../services/api";
import ConfirmationModal from "../ConfirmationModal";
import { Menu } from "@material-ui/core";
import { ReplyMessageContext } from "../../context/ReplyingMessage/ReplyingMessageContext";
import { ForwardMessageContext } from "../../context/ForwarMessage/ForwardMessageContext";
import { EditMessageContext } from "../../context/EditingMessage/EditingMessageContext";

import { TicketsContext } from "../../context/Tickets/TicketsContext";

import toastError from "../../errors/toastError";
import { useHistory } from "react-router-dom";
import { AuthContext } from "../../context/Auth/AuthContext";
import ForwardModal from "../../components/ForwardMessageModal";
import ShowTicketOpen from "../ShowTicketOpenModal";
import AcceptTicketWithoutQueue from "../AcceptTicketWithoutQueueModal";
import { toast } from "react-toastify";

const REACTION_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🙏", "🎉", "🔥", "👏", "🤔"];

const useStyles = makeStyles((theme) => ({
  reactionBar: {
    display: "flex",
    gap: 2,
    padding: "4px 8px",
    flexWrap: "wrap",
    maxWidth: 280,
  },
  reactionButton: {
    fontSize: 22,
    padding: 4,
    minWidth: 36,
    height: 36,
    borderRadius: 8,
    cursor: "pointer",
    border: "none",
    background: "transparent",
    transition: "all 0.15s",
    "&:hover": {
      background: theme.palette.action.hover,
      transform: "scale(1.3)",
    },
  },
}));

const MessageOptionsMenu = ({
  message,
  menuOpen,
  handleClose,
  anchorEl,
  isGroup,
  queueId,
  whatsappId,
  channel
}) => {
  const classes = useStyles();
  const { setReplyingMessage } = useContext(ReplyMessageContext);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const { user } = useContext(AuthContext);
  const editingContext = useContext(EditMessageContext);
  const setEditingMessage = editingContext ? editingContext.setEditingMessage : null;
  const { setTabOpen } = useContext(TicketsContext);
  const history = useHistory();

  const [openAlert, setOpenAlert] = useState(false);
  const [userTicketOpen, setUserTicketOpen] = useState("");
  const [queueTicketOpen, setQueueTicketOpen] = useState("");
  const [acceptTicketWithouSelectQueueOpen, setAcceptTicketWithouSelectQueueOpen] = useState(false);

  const [ticketOpen, setTicketOpen] = useState(null);
  const [reactionAnchorEl, setReactionAnchorEl] = useState(null);

  const { showSelectMessageCheckbox,
    setShowSelectMessageCheckbox,
    selectedMessages,
    forwardMessageModalOpen,
    setForwardMessageModalOpen } = useContext(ForwardMessageContext);

  const isTelegramMessage = channel === "telegram";

  const handleSaveTicket = async (contactId) => {
    if (!contactId) return;

    try {
      const { data: ticket } = await api.post("/tickets", {
        contactId: contactId,
        userId: user?.id,
        status: "open",
        queueId: queueId,
        whatsappId: whatsappId
      });

      setTicketOpen(ticket);
      if (ticket.queueId === null) {
        setAcceptTicketWithouSelectQueueOpen(true);
      } else {
        setTabOpen("open");
        history.push(`/tickets/${ticket.uuid}`);
      }
    } catch (err) {
      const ticket = JSON.parse(err.response.data.error);

      if (ticket.userId !== user?.id) {
        setOpenAlert(true);
        setUserTicketOpen(ticket.user.name);
        setQueueTicketOpen(ticket.queue.name);
      } else {
        setOpenAlert(false);
        setUserTicketOpen("");
        setQueueTicketOpen("");

        setTabOpen(ticket.status);
        history.push(`/tickets/${ticket.uuid}`);
      }
    }
    handleClose();
  };

  const handleCloseAlert = () => {
    setOpenAlert(false);
    setUserTicketOpen("");
    setQueueTicketOpen("");
  };

  const handleSetShowSelectCheckbox = () => {
    setShowSelectMessageCheckbox(!showSelectMessageCheckbox);
    handleClose();
  };

  const handleDeleteMessage = async () => {
    try {
      await api.delete(`/messages/${message.id}`);
    } catch (err) {
      toastError(err);
    }
  };

  const handleEditMessage = async () => {
    setEditingMessage(message);
    handleClose();
  };

  const hanldeReplyMessage = () => {
    setReplyingMessage(message);
    handleClose();
  };

  const isWithinFifteenMinutes = () => {
    const fifteenMinutesInMilliseconds = 15 * 60 * 1000;
    const currentTime = new Date();
    const messageTime = new Date(message.createdAt);
    return currentTime - messageTime <= fifteenMinutesInMilliseconds;
  };

  const handleOpenConfirmationModal = (e) => {
    setConfirmationOpen(true);
    handleClose();
  };

  const handleOpenReactionPicker = (e) => {
    setReactionAnchorEl(e.currentTarget);
  };

  const handleCloseReactionPicker = () => {
    setReactionAnchorEl(null);
  };

  const handleSendReaction = async (emoji) => {
    try {
      await api.post(`/messages/${message.id}/react`, { emoji });
      toast.success(`${i18n.t("messageOptionsMenu.reactionSent")} ${emoji}`);
    } catch (err) {
      toastError(err);
    }
    handleCloseReactionPicker();
    handleClose();
  };

  return (
    <>
      <AcceptTicketWithoutQueue
        modalOpen={acceptTicketWithouSelectQueueOpen}
        onClose={(e) => setAcceptTicketWithouSelectQueueOpen(false)}
        ticket={ticketOpen}
        ticketId={ticketOpen?.id}
      />
      <ShowTicketOpen
        isOpen={openAlert}
        handleClose={handleCloseAlert}
        user={userTicketOpen}
        queue={queueTicketOpen}
      />
      <ConfirmationModal
        title={i18n.t("messageOptionsMenu.confirmationModal.title")}
        open={confirmationOpen}
        onClose={setConfirmationOpen}
        onConfirm={handleDeleteMessage}
      >
        {i18n.t("messageOptionsMenu.confirmationModal.message")}
      </ConfirmationModal>

      <ForwardModal
        modalOpen={forwardMessageModalOpen}
        messages={selectedMessages}
        onClose={(e) => {
          setForwardMessageModalOpen(false);
          setShowSelectMessageCheckbox(false);
        }}
      />

      {/* Reaction Picker Popover */}
      <Popover
        open={Boolean(reactionAnchorEl)}
        anchorEl={reactionAnchorEl}
        onClose={handleCloseReactionPicker}
        anchorOrigin={{
          vertical: "top",
          horizontal: "center",
        }}
        transformOrigin={{
          vertical: "bottom",
          horizontal: "center",
        }}
        PaperProps={{
          style: { borderRadius: 16, boxShadow: "0 4px 20px rgba(0,0,0,0.15)" }
        }}
      >
        <div className={classes.reactionBar}>
          {REACTION_EMOJIS.map((emoji) => (
            <button
              key={emoji}
              className={classes.reactionButton}
              onClick={() => handleSendReaction(emoji)}
              title={emoji}
            >
              {emoji}
            </button>
          ))}
        </div>
      </Popover>

      <Menu
        anchorEl={anchorEl}
        getContentAnchorEl={null}
        anchorOrigin={{
          vertical: "bottom",
          horizontal: "right",
        }}
        transformOrigin={{
          vertical: "top",
          horizontal: "right",
        }}
        open={menuOpen}
        onClose={handleClose}
      >
        {message.fromMe && (
          <MenuItem key="delete" onClick={handleOpenConfirmationModal}>
            {i18n.t("messageOptionsMenu.delete")}
          </MenuItem>
        )}
        {message.fromMe && isWithinFifteenMinutes() && (
          <MenuItem key="edit" onClick={handleEditMessage}>
            {i18n.t("messageOptionsMenu.edit")}
          </MenuItem>
        )}
        <MenuItem onClick={hanldeReplyMessage}>
          {i18n.t("messageOptionsMenu.reply")}
        </MenuItem>
        <MenuItem onClick={handleSetShowSelectCheckbox}>
          {i18n.t("messageOptionsMenu.forward")}
        </MenuItem>
        {isTelegramMessage && !message.fromMe && (
          <MenuItem onClick={handleOpenReactionPicker}>
            😀 {i18n.t("messageOptionsMenu.react")}
          </MenuItem>
        )}
        {!message.fromMe && isGroup && (
          <MenuItem onClick={() => handleSaveTicket(message?.contact?.id)}>
            {i18n.t("messageOptionsMenu.talkTo")}
          </MenuItem>
        )}
      </Menu>
    </>
  );
};

export default MessageOptionsMenu;
