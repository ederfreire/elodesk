import React, { useState, useMemo } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import { Droppable, Draggable } from 'react-beautiful-dnd';
import KanbanCard from './KanbanCard';
import { Typography, InputBase, Tooltip } from '@material-ui/core';
import DragIndicatorIcon from '@material-ui/icons/DragIndicator';
import SearchIcon from '@material-ui/icons/Search';
import AttachMoneyIcon from '@material-ui/icons/AttachMoney';
import { formatCurrency } from '../../helpers/currencyHelper';
import differenceInMinutes from "date-fns/differenceInMinutes";
import parseISO from "date-fns/parseISO";
import { i18n } from '../../translate/i18n';

const useStyles = makeStyles(theme => ({
  column: {
    backgroundColor: '#f1f5f9',
    borderRadius: 16,
    minWidth: 300,
    maxWidth: 300,
    display: 'flex',
    flexDirection: 'column',
    flexShrink: 0,
    marginRight: theme.spacing(1.5),
    overflow: 'hidden',
    boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
    [theme.breakpoints.down('sm')]: {
      minWidth: 'calc(100vw - 24px)',
      maxWidth: 'calc(100vw - 24px)',
      marginRight: theme.spacing(1),
      scrollSnapAlign: 'start',
    },
  },
  // Header area with color
  headerArea: props => ({
    background: `linear-gradient(135deg, ${props.color || '#6366f1'}, ${props.colorDark || '#4f46e5'})`,
    padding: '12px 14px 10px',
    position: 'relative',
  }),
  headerPattern: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    background: 'radial-gradient(circle at 90% 20%, rgba(255,255,255,0.12) 0%, transparent 60%)',
    pointerEvents: 'none',
  },
  headerTop: {
    display: 'flex',
    alignItems: 'center',
    position: 'relative',
    zIndex: 1,
  },
  dragHandle: {
    cursor: 'grab',
    color: 'rgba(255, 255, 255, 0.6)',
    padding: 2,
    marginRight: 4,
    borderRadius: 4,
    display: 'flex',
    transition: 'color 0.15s',
    '&:hover': {
      color: '#fff',
    },
  },
  columnTitle: {
    fontWeight: 800,
    fontSize: '0.92rem',
    color: '#fff',
    flex: 1,
    letterSpacing: '0.2px',
    whiteSpace: 'nowrap',
    overflow: 'hidden',
    textOverflow: 'ellipsis',
  },
  columnIdBadge: {
    fontSize: 10,
    lineHeight: 1,
    opacity: 0.45,
    fontFamily: 'monospace',
    marginLeft: 4,
    cursor: 'default',
  },
  ticketCountBadge: {
    background: 'rgba(255,255,255,0.25)',
    backdropFilter: 'blur(4px)',
    color: '#fff',
    borderRadius: 20,
    padding: '2px 10px',
    fontSize: '0.75rem',
    fontWeight: 700,
    marginLeft: 8,
    flexShrink: 0,
  },
  // Stats row
  statsRow: {
    display: 'flex',
    alignItems: 'center',
    gap: 6,
    marginTop: 8,
    position: 'relative',
    zIndex: 1,
  },
  slaDot: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 3,
    padding: '2px 8px',
    borderRadius: 12,
    fontSize: '0.65rem',
    fontWeight: 700,
    letterSpacing: '0.3px',
  },
  slaGreenDot: {
    background: 'rgba(255,255,255,0.2)',
    color: '#bbf7d0',
  },
  slaYellowDot: {
    background: 'rgba(255,255,255,0.2)',
    color: '#fef08a',
  },
  slaRedDot: {
    background: 'rgba(255,255,255,0.2)',
    color: '#fca5a5',
  },
  dotCircle: {
    width: 7,
    height: 7,
    borderRadius: '50%',
  },
  valueTag: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: 2,
    marginLeft: 'auto',
    padding: '2px 8px',
    borderRadius: 12,
    background: 'rgba(255,255,255,0.2)',
    color: '#fff',
    fontSize: '0.68rem',
    fontWeight: 700,
    flexShrink: 0,
  },
  valueIcon: {
    fontSize: 13,
  },
  // Search
  searchWrapper: {
    display: 'flex',
    alignItems: 'center',
    background: '#fff',
    borderRadius: 10,
    padding: '3px 10px',
    margin: '8px 10px 4px',
    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
    border: '1px solid #e2e8f0',
    transition: 'border-color 0.15s',
    '&:focus-within': {
      borderColor: '#a5b4fc',
      boxShadow: '0 0 0 3px rgba(99,102,241,0.1)',
    },
  },
  searchIcon: {
    color: '#94a3b8',
    fontSize: 16,
    marginRight: 6,
  },
  searchInput: {
    fontSize: '0.78rem',
    color: '#334155',
    flex: 1,
    '& input': {
      padding: '4px 0',
      '&::placeholder': {
        color: '#94a3b8',
        opacity: 1,
      },
    },
  },
  // Card list
  cardList: {
    flexGrow: 1,
    overflowY: 'auto',
    padding: '4px 8px 8px',
    ...theme.scrollbarStyles,
    maxHeight: 'calc(100vh - 280px)',
    [theme.breakpoints.down('sm')]: {
      maxHeight: 'calc(100vh - 340px)',
      padding: '4px 6px 6px',
    },
  },
  emptyState: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: theme.spacing(3),
    color: '#94a3b8',
  },
  emptyIcon: {
    fontSize: 32,
    marginBottom: 4,
    opacity: 0.4,
  },
  emptyText: {
    fontSize: '0.78rem',
    fontWeight: 500,
  },
}));

const KanbanColumn = ({ id, title, tickets, color, index, isFixa, updateTicket, slaLimits, slaColors = { green: '#22c55e', yellow: '#eab308', red: '#ef4444' }, compactMode, isFocused, focusedCardIndex }) => {
  // Darken color for gradient
  const colorDark = color ? adjustColor(color, -30) : '#4f46e5';
  const classes = useStyles({ color, colorDark });
  const [search, setSearch] = useState('');

  const totalValue = useMemo(() => tickets.reduce((acc, ticket) => {
    const customFields = ticket.contact.extraInfo || [];
    const valueField = customFields.find(field => field.name === 'valor');
    return acc + (valueField ? parseFloat(valueField.value) || 0 : 0);
  }, 0), [tickets]);

  // SLA counters
  const slaCounts = useMemo(() => {
    let green = 0, yellow = 0, red = 0;
    tickets.forEach(ticket => {
      try {
        const mins = differenceInMinutes(new Date(), parseISO(ticket.updatedAt));
        if (mins <= slaLimits.green) green++;
        else if (mins <= slaLimits.yellow) yellow++;
        else red++;
      } catch { red++; }
    });
    return { green, yellow, red };
  }, [tickets, slaLimits]);

  const filteredTickets = useMemo(() => {
    if (!search.trim()) return tickets;
    const q = search.toLowerCase();
    return tickets.filter(t =>
      t.contact.name?.toLowerCase().includes(q) ||
      t.contact.number?.includes(q) ||
      t.lastMessage?.toLowerCase().includes(q) ||
      t.id.toString().includes(q)
    );
  }, [tickets, search]);

  return (
    <Draggable draggableId={id} index={index} isDragDisabled={!!isFixa}>
      {(provided, snapshot) => (
        <div
          className={classes.column}
          style={isFocused ? { outline: '2px solid #6366f1', outlineOffset: 2 } : undefined}
          ref={provided.innerRef}
          {...provided.draggableProps}
        >
          {/* Header */}
          <div className={classes.headerArea}>
            <div className={classes.headerPattern} />
            <div className={classes.headerTop}>
              <div {...provided.dragHandleProps} className={classes.dragHandle}>
                <DragIndicatorIcon style={{ fontSize: 18 }} />
              </div>
              <Typography className={classes.columnTitle}>{title}</Typography>
              <span className={classes.ticketCountBadge}>{tickets.length}</span>
              {/* ID da coluna, discreto: ajuda a identificar a etiqueta ao
                  configurar fluxos e agentes, que pedem o ID. A coluna "Em
                  aberto" não tem etiqueta, então não mostra ID. */}
              {id !== 'lane0' && (
                <Tooltip title={`${i18n.t("kanbanColumn.columnId", "ID da coluna")}: ${id}`}>
                  <span className={classes.columnIdBadge}>#{id}</span>
                </Tooltip>
              )}
            </div>

            {/* Stats: SLA counters + value */}
            <div className={classes.statsRow}>
              <Tooltip title={`${i18n.t("kanbanColumn.slaOnTime")}: ${slaCounts.green}`}>
                <span className={`${classes.slaDot} ${classes.slaGreenDot}`}>
                  <span className={classes.dotCircle} style={{ background: slaColors.green }} />
                  {slaCounts.green}
                </span>
              </Tooltip>
              <Tooltip title={`${i18n.t("kanbanColumn.slaWarning")}: ${slaCounts.yellow}`}>
                <span className={`${classes.slaDot} ${classes.slaYellowDot}`}>
                  <span className={classes.dotCircle} style={{ background: slaColors.yellow }} />
                  {slaCounts.yellow}
                </span>
              </Tooltip>
              <Tooltip title={`${i18n.t("kanbanColumn.slaOverdue")}: ${slaCounts.red}`}>
                <span className={`${classes.slaDot} ${classes.slaRedDot}`}>
                  <span className={classes.dotCircle} style={{ background: slaColors.red }} />
                  {slaCounts.red}
                </span>
              </Tooltip>
              {totalValue > 0 && (
                <Tooltip title={`${i18n.t("kanbanColumn.totalValue")}: ${formatCurrency(totalValue)}`}>
                  <span className={classes.valueTag}>
                    <AttachMoneyIcon className={classes.valueIcon} />
                    {formatCurrency(totalValue)}
                  </span>
                </Tooltip>
              )}
            </div>
          </div>

          {/* Search */}
          <div className={classes.searchWrapper}>
            <SearchIcon className={classes.searchIcon} />
            <InputBase
              className={classes.searchInput}
              placeholder={i18n.t("kanbanColumn.searchPlaceholder")}
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          {/* Cards */}
          <Droppable droppableId={id} type="CARD">
            {(provided, snapshot) => (
              <div
                className={classes.cardList}
                ref={provided.innerRef}
                {...provided.droppableProps}
                style={{
                  background: snapshot.isDraggingOver ? 'rgba(99,102,241,0.04)' : undefined,
                  borderRadius: 8,
                  transition: 'background 0.2s',
                }}
              >
                {filteredTickets.length === 0 ? (
                  <div className={classes.emptyState}>
                    <Typography className={classes.emptyText}>
                      {search ? i18n.t("kanbanColumn.noResults") : i18n.t("kanbanColumn.noTickets")}
                    </Typography>
                  </div>
                ) : (
                  filteredTickets.map((ticket, index) => (
                    <KanbanCard
                      key={ticket.id}
                      ticket={ticket}
                      index={index}
                      updateTicket={updateTicket}
                      slaLimits={slaLimits}
                      slaColors={slaColors}
                      compactMode={compactMode}
                      isFocused={isFocused && focusedCardIndex === index}
                    />
                  ))
                )}
                {provided.placeholder}
              </div>
            )}
          </Droppable>
        </div>
      )}
    </Draggable>
  );
};

// Helper to darken/lighten a hex color
function adjustColor(hex, amount) {
  try {
    let color = hex.replace('#', '');
    if (color.length === 3) color = color.split('').map(c => c + c).join('');
    const num = parseInt(color, 16);
    let r = Math.min(255, Math.max(0, (num >> 16) + amount));
    let g = Math.min(255, Math.max(0, ((num >> 8) & 0x00FF) + amount));
    let b = Math.min(255, Math.max(0, (num & 0x0000FF) + amount));
    return `#${(1 << 24 | r << 16 | g << 8 | b).toString(16).slice(1)}`;
  } catch {
    return hex;
  }
}

export default KanbanColumn;
