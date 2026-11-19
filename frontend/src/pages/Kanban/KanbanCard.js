import React, { useState } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import {
  Avatar,
  Button,
  Tooltip,
  Typography,
  Chip,
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  TextField,
  IconButton,
} from '@material-ui/core';
import CloseIcon from '@material-ui/icons/Close';
import WhatsAppIcon from '@material-ui/icons/WhatsApp';
import TelegramIcon from '@material-ui/icons/Telegram';
import PersonIcon from '@material-ui/icons/Person';
import AccessTimeIcon from '@material-ui/icons/AccessTime';
import AttachMoneyIcon from '@material-ui/icons/AttachMoney';
import ChatBubbleOutlineIcon from '@material-ui/icons/ChatBubbleOutline';
import format from "date-fns/format";
import parseISO from "date-fns/parseISO";
import formatDistanceToNow from "date-fns/formatDistanceToNow";
import differenceInMinutes from "date-fns/differenceInMinutes";
import ptBR from 'date-fns/locale/pt-BR';
import esLocale from 'date-fns/locale/es';
import enUS from 'date-fns/locale/en-US';
import arLocale from 'date-fns/locale/ar';
import { useHistory } from 'react-router-dom';
import { Draggable } from 'react-beautiful-dnd';
import api from '../../services/api';
import { formatCurrency } from '../../helpers/currencyHelper';
import { i18n } from '../../translate/i18n';
import KanbanChatModal from './KanbanChatModal';

const getDateFnsLocale = (lang) => {
  let l = String(lang || '').toLowerCase();
  if (!l || l === 'pt-br') {
    try {
      l = String(
        localStorage.getItem('language') ||
        localStorage.getItem('i18nextLng') ||
        l
      ).toLowerCase();
    } catch (_) {}
  }
  if (l.startsWith('es')) return esLocale;
  if (l.startsWith('en')) return enUS;
  if (l.startsWith('ar')) return arLocale;
  return ptBR;
};

const useStyles = makeStyles(theme => ({
  card: {
    background: '#ffffff',
    borderRadius: 14,
    boxShadow: '0 1px 4px rgba(0,0,0,0.06), 0 2px 12px rgba(0,0,0,0.04)',
    marginBottom: theme.spacing(1),
    cursor: 'grab',
    display: 'flex',
    flexDirection: 'column',
    position: 'relative',
    overflow: 'hidden',
    transition: 'all 0.2s cubic-bezier(0.4,0,0.2,1)',
    '&:hover': {
      boxShadow: '0 4px 20px rgba(0,0,0,0.12)',
      transform: 'translateY(-1px)',
    },
  },
  cardDragging: {
    boxShadow: '0 8px 32px rgba(0,0,0,0.18)',
    transform: 'rotate(2deg)',
  },
  colorStripe: {
    height: 3,
    width: '100%',
  },
  cardContent: {
    padding: '10px 12px 8px',
    [theme.breakpoints.down('sm')]: {
      padding: '8px 10px 6px',
    },
  },
  // Header
  header: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 6,
  },
  avatarWrapper: {
    position: 'relative',
    flexShrink: 0,
  },
  avatar: {
    width: 42,
    height: 42,
    fontSize: '0.85rem',
    fontWeight: 700,
    border: '2px solid #f0f0f0',
  },
  onlineIndicator: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 12,
    height: 12,
    borderRadius: '50%',
    border: '2px solid #fff',
    background: '#22c55e',
  },
  headerInfo: {
    flex: 1,
    minWidth: 0,
  },
  nameRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
  },
  contactName: {
    fontSize: '0.88rem',
    fontWeight: 700,
    color: '#1e293b',
    lineHeight: 1.3,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    flex: 1,
  },
  ticketIdBadge: {
    fontSize: '0.65rem',
    color: '#94a3b8',
    fontWeight: 600,
    background: '#f1f5f9',
    padding: '1px 6px',
    borderRadius: 4,
    flexShrink: 0,
  },
  contactMeta: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    marginTop: 2,
    flexWrap: 'wrap',
  },
  channelIcon: {
    fontSize: 13,
  },
  phoneNumber: {
    fontSize: '0.72rem',
    color: '#64748b',
    letterSpacing: '0.2px',
  },
  timeChip: {
    fontSize: '0.62rem',
    color: '#94a3b8',
    flexShrink: 0,
    whiteSpace: 'nowrap',
    marginTop: 3,
    display: 'flex',
    alignItems: 'center',
    gap: 3,
  },
  metaDivider: {
    width: '100%',
    height: 0,
  },
  // Unread badge
  unreadBadge: {
    position: 'absolute',
    top: -1,
    right: -1,
    background: 'linear-gradient(135deg, #22c55e, #16a34a)',
    color: '#fff',
    borderRadius: 10,
    minWidth: 20,
    height: 20,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    fontSize: '0.68rem',
    fontWeight: 800,
    padding: '0 5px',
    boxShadow: '0 2px 6px rgba(34,197,94,0.4)',
    zIndex: 2,
  },
  // SLA
  slaBar: {
    display: 'flex',
    alignItems: 'center',
    gap: 5,
    padding: '3px 8px',
    borderRadius: 8,
    margin: '4px 0 6px',
  },
  slaGreen: {
    background: 'linear-gradient(90deg, rgba(34,197,94,0.08), rgba(34,197,94,0.15))',
    color: '#15803d',
  },
  slaYellow: {
    background: 'linear-gradient(90deg, rgba(245,158,11,0.08), rgba(245,158,11,0.15))',
    color: '#b45309',
  },
  slaRed: {
    background: 'linear-gradient(90deg, rgba(239,68,68,0.08), rgba(239,68,68,0.15))',
    color: '#dc2626',
  },
  slaIcon: {
    fontSize: 13,
  },
  slaText: {
    fontSize: '0.68rem',
    fontWeight: 700,
    letterSpacing: '0.3px',
  },
  slaPulse: {
    animation: '$pulse 1.5s infinite',
  },
  '@keyframes pulse': {
    '0%, 100%': { opacity: 1 },
    '50%': { opacity: 0.5 },
  },
  // Last message
  lastMessage: {
    fontSize: '0.78rem',
    color: '#64748b',
    lineHeight: 1.45,
    display: '-webkit-box',
    WebkitLineClamp: 2,
    WebkitBoxOrient: 'vertical',
    overflow: 'hidden',
    margin: '2px 0 6px',
    padding: '4px 8px',
    background: '#f8fafc',
    borderRadius: 8,
    borderLeft: '2px solid #e2e8f0',
  },
  lastMessageUnread: {
    fontWeight: 600,
    color: '#1e293b',
    background: '#f0fdf4',
    borderLeft: '2px solid #22c55e',
  },
  // Tags
  tagsRow: {
    display: 'flex',
    flexWrap: 'wrap',
    gap: 4,
    marginBottom: 6,
  },
  tag: {
    height: 18,
    fontSize: '0.6rem',
    fontWeight: 700,
    borderRadius: 4,
    letterSpacing: '0.3px',
    textTransform: 'uppercase',
  },
  // Value
  valueRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  valueChip: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 3,
    fontSize: '0.78rem',
    fontWeight: 700,
    color: '#7c3aed',
    background: 'rgba(124,58,237,0.08)',
    padding: '2px 8px',
    borderRadius: 6,
    cursor: 'pointer',
    transition: 'background 0.15s',
    '&:hover': {
      background: 'rgba(124,58,237,0.15)',
    },
  },
  removeValueButton: {
    padding: 0,
    marginLeft: 2,
    color: '#ef4444',
    '&:hover': {
      background: 'rgba(239,68,68,0.1)',
    },
  },
  // Footer
  footer: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: '6px 12px 8px',
    borderTop: '1px solid #f1f5f9',
    background: '#fafbfc',
    [theme.breakpoints.down('sm')]: {
      padding: '4px 10px 6px',
    },
  },
  userInfo: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
  },
  userAvatar: {
    width: 18,
    height: 18,
    fontSize: '0.55rem',
    fontWeight: 700,
    background: '#e2e8f0',
    color: '#64748b',
  },
  userName: {
    fontSize: '0.7rem',
    color: '#64748b',
    fontWeight: 500,
    maxWidth: 80,
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  actionsRow: {
    display: 'flex',
    gap: 4,
    alignItems: 'center',
  },
  actionBtn: {
    minWidth: 0,
    width: 28,
    height: 28,
    borderRadius: 8,
    padding: 0,
    transition: 'all 0.15s',
  },
  chatBtn: {
    background: 'linear-gradient(135deg, #7c3aed, #6d28d9)',
    color: '#fff',
    boxShadow: '0 2px 6px rgba(124,58,237,0.3)',
    '&:hover': {
      background: 'linear-gradient(135deg, #6d28d9, #5b21b6)',
      boxShadow: '0 3px 10px rgba(124,58,237,0.4)',
    },
  },
  moneyBtn: {
    background: '#f1f5f9',
    color: '#7c3aed',
    '&:hover': {
      background: '#e2e8f0',
    },
  },
  // Dialog
  textField: {
    '& .MuiOutlinedInput-root': {
      borderRadius: 10,
    },
  },
  dialogPaper: {
    borderRadius: 16,
  },
  dialogButton: {
    borderRadius: 10,
    textTransform: 'none',
    fontWeight: 600,
  },
}));

const KanbanCard = ({ ticket, index, updateTicket, slaLimits = { green: 30, yellow: 60, red: 120 }, slaColors = { green: '#22c55e', yellow: '#eab308', red: '#ef4444' }, compactMode = false, isFocused = false }) => {
  const classes = useStyles();
  const history = useHistory();
  const cardRef = React.useRef(null);

  React.useEffect(() => {
    if (isFocused && cardRef.current) {
      try { cardRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' }); } catch {}
    }
  }, [isFocused]);

  const [open, setOpen] = useState(false);
  const [newValue, setNewValue] = useState('');
  const [chatOpen, setChatOpen] = useState(false);

  const unreadCount = Number(ticket.unreadMessages) || 0;

  const customFields = ticket.contact.extraInfo || [];
  const valueFieldIndex = customFields.findIndex(field => field.name === 'valor');
  const valueField = valueFieldIndex !== -1 ? customFields[valueFieldIndex] : null;
  const opportunityValue = valueField ? parseFloat(valueField.value) : null;

  const handleOpenModal = (e) => {
    e.stopPropagation();
    setNewValue(valueField ? valueField.value.toString() : '');
    setOpen(true);
  };

  const handleCloseModal = () => {
    setOpen(false);
  };

  const updateContactValue = async (contactId, value) => {
    try {
      await api.put(`/contacts/${contactId}`, {
        extraInfo: [{ name: 'valor', value: value.toString() }],
      });
    } catch (error) {
      console.error('Erro ao atualizar o valor:', error);
    }
  };

  const removeContactValue = async (e) => {
    e.stopPropagation();
    try {
      await api.put(`/contacts/${ticket.contact.id}`, {
        extraInfo: [],
      });
      if (valueFieldIndex !== -1) {
        customFields.splice(valueFieldIndex, 1);
      }
      updateTicket({ ...ticket });
    } catch (error) {
      console.error('Erro ao remover o valor:', error);
    }
  };

  const handleSaveValue = async () => {
    await updateContactValue(ticket.contact.id, newValue);
    if (valueField) {
      valueField.value = newValue;
    } else {
      if (!ticket.contact.extraInfo) {
        ticket.contact.extraInfo = [];
      }
      ticket.contact.extraInfo.push({ name: 'valor', value: newValue });
    }
    updateTicket({ ...ticket });
    setOpen(false);
  };

  const hexA = (hex, a) => {
    try {
      const h = (hex || '#000000').replace('#', '');
      const r = parseInt(h.substring(0,2),16), g = parseInt(h.substring(2,4),16), b = parseInt(h.substring(4,6),16);
      return `rgba(${r},${g},${b},${a})`;
    } catch { return `rgba(0,0,0,${a})`; }
  };

  const getSlaInfo = () => {
    try {
      const refDate = parseISO(ticket.updatedAt);
      const mins = differenceInMinutes(new Date(), refDate);
      const styleFor = (color) => ({
        background: `linear-gradient(90deg, ${hexA(color, 0.08)}, ${hexA(color, 0.18)})`,
        color,
      });
      if (mins <= slaLimits.green) {
        return { level: 'green', label: `${mins}min`, className: classes.slaGreen, style: styleFor(slaColors.green), tooltip: i18n.t("kanbanCard.slaOnTime") };
      } else if (mins <= slaLimits.yellow) {
        return { level: 'yellow', label: `${mins}min`, className: classes.slaYellow, style: styleFor(slaColors.yellow), tooltip: i18n.t("kanbanCard.slaWarning") };
      } else if (mins <= slaLimits.red) {
        const h = Math.floor(mins / 60);
        const m = mins % 60;
        return { level: 'red', label: `${h}h${m > 0 ? `${m}min` : ''}`, className: classes.slaRed, style: styleFor(slaColors.red), tooltip: i18n.t("kanbanCard.slaOverdue") };
      } else {
        const h = Math.floor(mins / 60);
        return { level: 'red', label: `${h}h+`, className: `${classes.slaRed} ${classes.slaPulse}`, style: styleFor(slaColors.red), tooltip: i18n.t("kanbanCard.slaOverdue") };
      }
    } catch {
      return null;
    }
  };

  const sla = getSlaInfo();

  const getTimeDisplay = () => {
    try {
      const date = parseISO(ticket.updatedAt);
      const timeAgo = formatDistanceToNow(date, { locale: getDateFnsLocale(i18n.language), addSuffix: true });
      const dateStr = format(date, 'dd/MM');
      return { timeAgo, dateStr };
    } catch {
      return { timeAgo: '', dateStr: '' };
    }
  };

  const { timeAgo, dateStr } = getTimeDisplay();
  const contactNumber = ticket.contact.number || '';
  const channel = ticket.whatsapp?.channel || ticket.channel || '';
  const isTelegram = channel === 'telegram';
  const queueColor = ticket.queue?.color || '#7c3aed';

  const ChannelIcon = isTelegram ? TelegramIcon : WhatsAppIcon;
  const channelColor = isTelegram ? '#0088cc' : '#25D366';

  return (
    <Draggable draggableId={ticket.id.toString()} index={index}>
      {(provided, snapshot) => (
        <div
          className={`${classes.card} ${snapshot.isDragging ? classes.cardDragging : ''}`}
          ref={(el) => { provided.innerRef(el); cardRef.current = el; }}
          {...provided.draggableProps}
          {...provided.dragHandleProps}
          style={{
            ...provided.draggableProps.style,
            ...(isFocused ? { boxShadow: '0 0 0 2px #6366f1, 0 4px 16px rgba(99,102,241,0.25)' } : {}),
          }}
        >
          {/* Color stripe top */}
          <div className={classes.colorStripe} style={{ background: `linear-gradient(90deg, ${queueColor}, ${queueColor}88)` }} />

          <div className={classes.cardContent}>
            {/* Header */}
            <div className={classes.header}>
              <div className={classes.avatarWrapper}>
                <Avatar
                  src={ticket.contact.urlPicture}
                  className={classes.avatar}
                  style={{
                    backgroundColor: !ticket.contact.urlPicture ? queueColor : undefined,
                    color: '#fff',
                  }}
                >
                  {!ticket.contact.urlPicture && ticket.contact.name
                    ? ticket.contact.name.trim().split(/\s+/).slice(0, 2).map(w => w[0]?.toUpperCase()).join('')
                    : null}
                </Avatar>
                {unreadCount > 0 && (
                  <div className={classes.unreadBadge}>{unreadCount > 9 ? '9+' : unreadCount}</div>
                )}
              </div>

              <div className={classes.headerInfo}>
                <div className={classes.nameRow}>
                  <Typography className={classes.contactName}>
                    {ticket.contact.name || i18n.t("kanbanCard.noName")}
                  </Typography>
                  <span className={classes.ticketIdBadge}>#{ticket.id}</span>
                </div>
                <div className={classes.contactMeta}>
                  <ChannelIcon className={classes.channelIcon} style={{ color: channelColor }} />
                  <Typography className={classes.phoneNumber}>
                    {contactNumber}
                  </Typography>
                  <div className={classes.metaDivider} />
                  <Typography className={classes.timeChip}>
                    <AccessTimeIcon style={{ fontSize: 11 }} />
                    {timeAgo}{dateStr ? ` · ${dateStr}` : ''}
                  </Typography>
                </div>
              </div>
            </div>

            {/* SLA Indicator */}
            {sla && (
              <Tooltip title={`${sla.tooltip} — ${sla.label}`}>
                <div className={`${classes.slaBar} ${sla.className}`} style={sla.style}>
                  <AccessTimeIcon className={classes.slaIcon} />
                  <Typography className={classes.slaText}>
                    {compactMode ? sla.label : `${sla.tooltip} — ${sla.label}`}
                  </Typography>
                </div>
              </Tooltip>
            )}

            {/* Last message (escondida em modo compacto) */}
            {!compactMode && (
              <Typography
                className={`${classes.lastMessage} ${unreadCount > 0 ? classes.lastMessageUnread : ''}`}
              >
                {ticket.lastMessage || i18n.t("kanbanCard.noMessages")}
              </Typography>
            )}

            {/* Tags (escondidas em modo compacto) */}
            {!compactMode && ticket.tags && ticket.tags.length > 0 && (
              <div className={classes.tagsRow}>
                {ticket.tags.map(tag => (
                  <Chip
                    key={tag.id}
                    label={tag.name}
                    className={classes.tag}
                    style={{
                      backgroundColor: tag.color || '#7c3aed',
                      color: '#fff',
                    }}
                    size="small"
                  />
                ))}
              </div>
            )}

            {/* Value */}
            {opportunityValue !== null && (
              <div className={classes.valueRow}>
                <div className={classes.valueChip} onClick={handleOpenModal}>
                  <AttachMoneyIcon style={{ fontSize: 14 }} />
                  {formatCurrency(opportunityValue)}
                  <Tooltip title={i18n.t("kanbanCard.remove")}>
                    <IconButton
                      className={classes.removeValueButton}
                      onClick={removeContactValue}
                      size="small"
                    >
                      <CloseIcon style={{ fontSize: 12 }} />
                    </IconButton>
                  </Tooltip>
                </div>
              </div>
            )}
          </div>

          {/* Footer (escondido em modo compacto) */}
          {!compactMode && (
          <div className={classes.footer}>
            <div className={classes.userInfo}>
              <Avatar className={classes.userAvatar}>
                {ticket.user?.name ? ticket.user.name[0]?.toUpperCase() : <PersonIcon style={{ fontSize: 12 }} />}
              </Avatar>
              <Typography className={classes.userName}>
                {ticket.user?.name || i18n.t("kanbanCard.pending")}
              </Typography>
            </div>
            <div className={classes.actionsRow}>
              {opportunityValue === null && (
                <Tooltip title={i18n.t("kanbanCard.addValue")}>
                  <IconButton
                    className={`${classes.actionBtn} ${classes.moneyBtn}`}
                    onClick={handleOpenModal}
                    size="small"
                  >
                    <AttachMoneyIcon style={{ fontSize: 16 }} />
                  </IconButton>
                </Tooltip>
              )}
              <Tooltip title={i18n.t("kanbanCard.viewChat")}>
                <IconButton
                  className={`${classes.actionBtn} ${classes.chatBtn}`}
                  onClick={(e) => {
                    e.stopPropagation();
                    setChatOpen(true);
                  }}
                  size="small"
                >
                  <ChatBubbleOutlineIcon style={{ fontSize: 15 }} />
                </IconButton>
              </Tooltip>
            </div>
          </div>
          )}

          {/* Value Dialog */}
          <Dialog
            open={open}
            onClose={handleCloseModal}
            classes={{ paper: classes.dialogPaper }}
          >
            <DialogTitle>
              {valueField ? i18n.t("kanbanCard.editValueTitle") : i18n.t("kanbanCard.assignValueTitle")}
            </DialogTitle>
            <DialogContent>
              <TextField
                label={i18n.t("kanbanCard.valueLabel")}
                type="number"
                fullWidth
                value={newValue}
                onChange={(e) => setNewValue(e.target.value)}
                variant="outlined"
                size="small"
                className={classes.textField}
              />
            </DialogContent>
            <DialogActions>
              <Button
                onClick={handleCloseModal}
                color="secondary"
                variant="outlined"
                className={classes.dialogButton}
              >
                {i18n.t("kanbanCard.cancel")}
              </Button>
              <Button
                onClick={handleSaveValue}
                color="primary"
                variant="contained"
                className={classes.dialogButton}
              >
                {i18n.t("kanbanCard.save")}
              </Button>
            </DialogActions>
          </Dialog>

          {/* Chat Modal */}
          <KanbanChatModal
            open={chatOpen}
            onClose={() => setChatOpen(false)}
            ticket={ticket}
          />
        </div>
      )}
    </Draggable>
  );
};

export default KanbanCard;
