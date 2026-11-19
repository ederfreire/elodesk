import React from 'react';
import { makeStyles } from '@material-ui/core/styles';
import { DragDropContext, Droppable } from 'react-beautiful-dnd';
import KanbanColumn from './KanbanColumn';

const useStyles = makeStyles(theme => ({
  board: {
    display: 'flex',
    overflowX: 'auto',
    ...theme.scrollbarStyles,
    padding: theme.spacing(1),
    [theme.breakpoints.down('sm')]: {
      padding: theme.spacing(0.5),
      WebkitOverflowScrolling: 'touch',
      scrollSnapType: 'x proximity',
    },
  },
}));

const KanbanBoard = ({ lanes, onCardMove, onLaneReorder, updateTicket, slaLimits, slaColors, compactMode, focusedLane, focusedCard }) => {
  const classes = useStyles();

  const handleDragEnd = result => {
    if (!result.destination) return;

    const { source, destination, draggableId, type } = result;

    // Se for reordenação de lane
    if (type === 'LANE') {
      // "Em aberto" (lane0) é a entrada do funil e fica fixa na 1ª posição:
      // não se arrasta, e nenhuma outra coluna pode ser solta antes dela.
      const laneArrastada = lanes[source.index];
      if (laneArrastada?.id === 'lane0' || destination.index === 0) {
        return;
      }
      if (source.index !== destination.index) {
        onLaneReorder(source.index, destination.index);
      }
      return;
    }

    // Se for movimentação de card
    if (
      source.droppableId !== destination.droppableId ||
      source.index !== destination.index
    ) {
      onCardMove(
        draggableId,
        destination.droppableId,
        source.droppableId,
        source.index,
        destination.index
      );
    }
  };

  return (
    <DragDropContext onDragEnd={handleDragEnd}>
      <Droppable droppableId="lanes" direction="horizontal" type="LANE">
        {(provided, snapshot) => (
          <div 
            className={classes.board}
            ref={provided.innerRef}
            {...provided.droppableProps}
          >
            {lanes.map((lane, index) => (
              <KanbanColumn
                key={lane.id}
                id={lane.id}
                title={lane.title}
                tickets={lane.tickets}
                color={lane.color}
                index={index}
                isFixa={lane.id === 'lane0'}
                updateTicket={updateTicket}
                slaLimits={slaLimits}
                slaColors={slaColors}
                compactMode={compactMode}
                isFocused={focusedLane === index}
                focusedCardIndex={focusedLane === index ? focusedCard : -1}
              />
            ))}
            {provided.placeholder}
          </div>
        )}
      </Droppable>
    </DragDropContext>
  );
};

export default KanbanBoard;
