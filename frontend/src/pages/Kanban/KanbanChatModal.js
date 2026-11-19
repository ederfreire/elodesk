import React, { useState, useEffect, useContext, useRef } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import {
  Dialog,
  DialogContent,
  Typography,
  Avatar,
  IconButton,
  Chip,
  CircularProgress,
  InputBase,
} from '@material-ui/core';
import SendIcon from '@material-ui/icons/Send';
import AttachFileIcon from '@material-ui/icons/AttachFile';
import CloseIcon from '@material-ui/icons/Close';
import DoneAllIcon from '@material-ui/icons/DoneAll';
import DoneIcon from '@material-ui/icons/Done';
import format from "date-fns/format";
import parseISO from "date-fns/parseISO";
import { AuthContext } from '../../context/Auth/AuthContext';
import api from '../../services/api';
import { i18n } from '../../translate/i18n';

const useStyles = makeStyles(theme => ({
  dialogPaper: {
    borderRadius: 16,
    maxWidth: 480,
    width: '100%',
    maxHeight: '80vh',
    overflow: 'hidden',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '12px 16px',
    background: '#7c3aed',
    color: '#fff',
  },
  headerLeft: {
    display: 'flex',
    alignItems: 'center',
    gap: 12,
  },
  headerAvatar: {
    width: 36,
    height: 36,
    border: '2px solid rgba(255,255,255,0.3)',
  },
  headerName: {
    fontSize: '0.95rem',
    fontWeight: 600,
    color: '#fff',
  },
  headerTicket: {
    fontSize: '0.75rem',
    color: 'rgba(255,255,255,0.8)',
  },
  statusBadge: {
    height: 22,
    fontSize: '0.7rem',
    fontWeight: 600,
    borderRadius: 4,
  },
  closeBtn: {
    color: '#fff',
    padding: 6,
  },
  content: {
    padding: 0,
    display: 'flex',
    flexDirection: 'column',
    height: '60vh',
    overflow: 'hidden',
  },
  messagesArea: {
    flex: 1,
    overflowY: 'auto',
    padding: '12px 16px',
    background: '#f5f3ff',
    display: 'flex',
    flexDirection: 'column',
    gap: 8,
    ...theme.scrollbarStyles,
  },
  messageRow: {
    display: 'flex',
    flexDirection: 'column',
    maxWidth: '80%',
  },
  messageFromMe: {
    alignSelf: 'flex-end',
    alignItems: 'flex-end',
  },
  messageFromOther: {
    alignSelf: 'flex-start',
    alignItems: 'flex-start',
  },
  messageBubble: {
    padding: '8px 12px',
    borderRadius: 12,
    fontSize: '0.85rem',
    lineHeight: 1.4,
    position: 'relative',
    wordBreak: 'break-word',
  },
  bubbleFromMe: {
    background: '#e9e3ff',
    borderBottomRightRadius: 4,
    color: '#1a1a1a',
  },
  bubbleFromOther: {
    background: '#fff',
    borderBottomLeftRadius: 4,
    color: '#1a1a1a',
    boxShadow: '0 1px 2px rgba(0,0,0,0.06)',
  },
  messageTime: {
    fontSize: '0.65rem',
    color: '#999',
    marginTop: 2,
    display: 'flex',
    alignItems: 'center',
    gap: 2,
  },
  readIcon: {
    fontSize: 14,
    color: '#34b7f1',
  },
  sentIcon: {
    fontSize: 14,
    color: '#999',
  },
  loadingWrapper: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100%',
  },
  dayDivider: {
    textAlign: 'center',
    margin: '8px 0',
  },
  dayDividerText: {
    fontSize: '0.7rem',
    color: '#888',
    background: '#ede9fe',
    padding: '2px 10px',
    borderRadius: 10,
    display: 'inline-block',
  },
  emptyMessages: {
    display: 'flex',
    justifyContent: 'center',
    alignItems: 'center',
    height: '100%',
    color: '#999',
    fontSize: '0.9rem',
  },
  mediaMessage: {
    maxWidth: '100%',
    borderRadius: 8,
    marginBottom: 4,
  },
  mediaImage: {
    maxWidth: 200,
    maxHeight: 200,
    borderRadius: 8,
  },
  inputArea: {
    display: 'flex',
    alignItems: 'center',
    padding: '8px 12px',
    background: '#fff',
    borderTop: '1px solid #e5e7eb',
    gap: 8,
  },
  inputField: {
    flex: 1,
    background: '#f3f4f6',
    borderRadius: 20,
    padding: '8px 16px',
    fontSize: '0.85rem',
    '& input': {
      padding: 0,
    },
  },
  sendBtn: {
    background: '#7c3aed',
    color: '#fff',
    padding: 8,
    '&:hover': {
      background: '#6d28d9',
    },
    '&:disabled': {
      background: '#d1d5db',
      color: '#9ca3af',
    },
  },
  attachBtn: {
    color: '#9ca3af',
    padding: 8,
  },
}));

const KanbanChatModal = ({ open, onClose, ticket }) => {
  const classes = useStyles();
  const { user, socket } = useContext(AuthContext);
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [inputMessage, setInputMessage] = useState('');
  const [sending, setSending] = useState(false);
  const messagesEndRef = useRef(null);
  const fileInputRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSendMessage = async () => {
    if (!inputMessage.trim() || sending) return;
    setSending(true);
    try {
      await api.post(`/messages/${ticket.id}`, {
        read: 1,
        fromMe: true,
        mediaUrl: '',
        body: inputMessage.trim(),
      });
      setInputMessage('');
    } catch (err) {
      console.error('Erro ao enviar mensagem:', err);
    } finally {
      setSending(false);
    }
  };

  const handleSendMedia = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    setSending(true);
    try {
      const formData = new FormData();
      formData.append('medias', file);
      formData.append('body', '');
      formData.append('fromMe', true);
      await api.post(`/messages/${ticket.id}`, formData);
    } catch (err) {
      console.error('Erro ao enviar mídia:', err);
    } finally {
      setSending(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleKeyPress = (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSendMessage();
    }
  };

  useEffect(() => {
    if (!open || !ticket?.id) return;

    const fetchMessages = async () => {
      setLoading(true);
      try {
        const { data } = await api.get(`/messages/${ticket.id}`, {
          params: { pageNumber: 1 },
        });
        setMessages(data.messages.reverse());
      } catch (err) {
        console.error('Erro ao buscar mensagens:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchMessages();
  }, [open, ticket?.id]);

  // Real-time messages via socket
  useEffect(() => {
    if (!open || !ticket?.id || !socket) return;

    const companyId = user.companyId;

    socket.emit("joinChatBox", `${ticket.id}`);

    const onNewMessage = (data) => {
      if (data.action === "create" && data.ticket?.id === ticket.id) {
        setMessages(prev => [...prev, data.message]);
      }
      if (data.action === "update") {
        setMessages(prev =>
          prev.map(msg => (msg.id === data.message?.id ? data.message : msg))
        );
      }
    };

    socket.on(`company-${companyId}-appMessage`, onNewMessage);

    return () => {
      socket.emit("joinChatBoxLeave", `${ticket.id}`);
      socket.off(`company-${companyId}-appMessage`, onNewMessage);
    };
  }, [open, ticket?.id, socket, user.companyId]);

  useEffect(() => {
    if (messages.length > 0) {
      scrollToBottom();
    }
  }, [messages]);

  const getStatusColor = (status) => {
    switch (status) {
      case 'open': return '#22c55e';
      case 'pending': return '#f59e0b';
      case 'closed': return '#ef4444';
      default: return '#888';
    }
  };

  const getStatusLabel = (status) => {
    switch (status) {
      case 'open': return i18n.t("kanbanChat.statusOpen");
      case 'pending': return i18n.t("kanbanChat.statusPending");
      case 'closed': return i18n.t("kanbanChat.statusClosed");
      default: return status;
    }
  };

  const renderMessage = (message, index) => {
    const isFromMe = message.fromMe;
    const time = (() => {
      try {
        return format(parseISO(message.createdAt), 'HH:mm');
      } catch {
        return '';
      }
    })();

    return (
      <div
        key={message.id}
        className={`${classes.messageRow} ${isFromMe ? classes.messageFromMe : classes.messageFromOther}`}
      >
        {message.mediaUrl && message.mediaType === 'image' && (
          <img
            src={message.mediaUrl}
            alt="media"
            className={classes.mediaImage}
          />
        )}
        <div
          className={`${classes.messageBubble} ${isFromMe ? classes.bubbleFromMe : classes.bubbleFromOther}`}
        >
          <Typography style={{ fontSize: '0.85rem', lineHeight: 1.4 }}>
            {message.body}
          </Typography>
        </div>
        <div className={classes.messageTime}>
          {time}
          {isFromMe && (
            message.read ? (
              <DoneAllIcon className={classes.readIcon} />
            ) : (
              <DoneIcon className={classes.sentIcon} />
            )
          )}
        </div>
      </div>
    );
  };

  if (!ticket) return null;

  return (
    <Dialog
      open={open}
      onClose={onClose}
      classes={{ paper: classes.dialogPaper }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div className={classes.header}>
        <div className={classes.headerLeft}>
          <Avatar
            src={ticket.contact?.urlPicture}
            className={classes.headerAvatar}
            style={{
              backgroundColor: !ticket.contact?.urlPicture ? '#a78bfa' : undefined,
            }}
          >
            {!ticket.contact?.urlPicture && ticket.contact?.name
              ? ticket.contact.name[0]?.toUpperCase()
              : '?'}
          </Avatar>
          <div>
            <Typography className={classes.headerName}>
              #{ticket.id} • {ticket.contact?.name || i18n.t("kanbanChat.contact")}
            </Typography>
            <Typography className={classes.headerTicket}>
              {ticket.queue?.name || i18n.t("kanbanChat.noQueue")}
            </Typography>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <Chip
            label={getStatusLabel(ticket.status)}
            className={classes.statusBadge}
            style={{
              backgroundColor: getStatusColor(ticket.status),
              color: '#fff',
            }}
            size="small"
          />
          <IconButton className={classes.closeBtn} onClick={onClose}>
            <CloseIcon />
          </IconButton>
        </div>
      </div>

      {/* Messages */}
      <DialogContent className={classes.content}>
        <div className={classes.messagesArea}>
          {loading ? (
            <div className={classes.loadingWrapper}>
              <CircularProgress size={32} style={{ color: '#7c3aed' }} />
            </div>
          ) : messages.length === 0 ? (
            <div className={classes.emptyMessages}>
              {i18n.t("kanbanChat.noMessages")}
            </div>
          ) : (
            <>
              {messages.map((msg, idx) => renderMessage(msg, idx))}
              <div ref={messagesEndRef} />
            </>
          )}
        </div>
      </DialogContent>

      {/* Input bar */}
      <div className={classes.inputArea}>
        <input
          type="file"
          ref={fileInputRef}
          style={{ display: 'none' }}
          onChange={handleSendMedia}
        />
        <IconButton
          className={classes.attachBtn}
          onClick={() => fileInputRef.current?.click()}
          disabled={sending}
        >
          <AttachFileIcon fontSize="small" />
        </IconButton>
        <InputBase
          className={classes.inputField}
          placeholder={i18n.t("kanbanChat.inputPlaceholder")}
          value={inputMessage}
          onChange={(e) => setInputMessage(e.target.value)}
          onKeyPress={handleKeyPress}
          disabled={sending}
        />
        <IconButton
          className={classes.sendBtn}
          onClick={handleSendMessage}
          disabled={!inputMessage.trim() || sending}
          size="small"
        >
          <SendIcon fontSize="small" />
        </IconButton>
      </div>
    </Dialog>
  );
};

export default KanbanChatModal;
