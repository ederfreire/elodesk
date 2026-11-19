import React, { useState, useEffect, useContext, useRef } from 'react';
import toastError from "../../errors/toastError";
import { makeStyles, useTheme } from '@material-ui/core/styles';
import useMediaQuery from '@material-ui/core/useMediaQuery';
import api from '../../services/api';
import useCompanySettings from '../../hooks/useSettings/companySettings';
import { AuthContext } from '../../context/Auth/AuthContext';
import { toast } from 'react-toastify';
import { i18n } from '../../translate/i18n';
import { useHistory } from 'react-router-dom';
import { setKanbanLaneOrder, getKanbanLaneOrder } from '../../services/companyKanbanService';
import { listBoards } from '../../services/kanbanBoardsService';
import { translateLaneName } from './translateLaneName';
import { Button, TextField, Paper, FormControl, InputLabel, Select, FormControlLabel, Switch, Chip, Tooltip, IconButton, Dialog, DialogTitle, DialogContent, DialogActions } from '@material-ui/core';
import SettingsIcon from '@material-ui/icons/Settings';
import AccessTimeIcon from '@material-ui/icons/AccessTime';
import CloseIcon from '@material-ui/icons/Close';
import ViewCompactIcon from '@material-ui/icons/ViewCompact';
import ViewModuleIcon from '@material-ui/icons/ViewModule';
import ClearIcon from '@material-ui/icons/Clear';
import HelpOutlineIcon from '@material-ui/icons/HelpOutline';
import format from "date-fns/format";
import differenceInMinutes from "date-fns/differenceInMinutes";
import parseISO from "date-fns/parseISO";
import { Can } from '../../components/Can';
import MainContainer from '../../components/MainContainer';
import MainHeader from '../../components/MainHeader';
import MainHeaderButtonsWrapper from '../../components/MainHeaderButtonsWrapper';
import Title from '../../components/Title';
import KanbanBoard from './KanbanBoard';
import KanbanSlaSettings from '../../components/Settings/KanbanSlaSettings';

const useStyles = makeStyles(theme => ({
  mainPaper: {
    flex: 1,
    display: 'flex',
    padding: theme.spacing(1),
    overflowX: 'auto',
    ...theme.scrollbarStyles,
    borderRadius: '10px',
    [theme.breakpoints.down('sm')]: {
      padding: theme.spacing(0.5),
      minWidth: 0,
      borderRadius: 0,
    },
  },
  button: {
    borderRadius: '10px',
  },
  dateInput: {
    '& .MuiOutlinedInput-root': {
      borderRadius: '10px',
    },
    marginRight: theme.spacing(1),
    [theme.breakpoints.down('sm')]: {
      marginRight: theme.spacing(0.5),
      flex: 1,
      minWidth: 0,
    },
  },
  sortSelect: {
    minWidth: 150,
    marginRight: theme.spacing(1),
    '& .MuiOutlinedInput-root': {
      borderRadius: '10px',
    },
    [theme.breakpoints.down('sm')]: {
      minWidth: 0,
      flex: 1,
      marginRight: theme.spacing(0.5),
    },
  },
  mobileFilters: {
    display: 'flex',
    flexDirection: 'column',
    gap: theme.spacing(1),
    padding: theme.spacing(1),
    width: '100%',
  },
  mobileFilterRow: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(1),
    flexWrap: 'wrap',
    width: '100%',
  },
}));

const Kanban = () => {
  const classes = useStyles();
  const history = useHistory();
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('sm'));
  const { user, socket } = useContext(AuthContext);
  const [tags, setTags] = useState([]);

  // Movimentações em andamento: ticketId -> laneId de destino.
  //
  // Mover um card são DOIS passos no servidor (tira a etiqueta atual, põe a
  // nova). Entre um e outro o ticket fica sem etiqueta nenhuma — e, para o
  // quadro, "sem etiqueta" é a coluna "Em aberto". Quando a lista de tickets
  // era recarregada nesse intervalo (por socket ou pelo recarregamento do
  // próprio quadro), o card aparecia pulando por "Em aberto" antes de chegar
  // ao destino. Enquanto o ticket estiver neste mapa, o quadro ignora o que o
  // servidor diz sobre as etiquetas dele e o mantém onde o usuário soltou.
  const movimentacoesEmCursoRef = useRef(new Map());
  const [tickets, setTickets] = useState([]);
  const [lanes, setLanes] = useState([]);
  const [startDate, setStartDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  const [endDate, setEndDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  // Sem preferência salva ainda (primeiro acesso, ou localStorage limpo):
  // admin começa vendo o Kanban de TODOS os usuários por padrão — sem essa
  // regra, um admin que nunca mexeu no switch "Todos os tickets"/"Meus
  // tickets" via o board como se fosse um usuário comum (só os próprios
  // tickets), o que não é o esperado pra quem gerencia a equipe. Usuário
  // comum nem vê esse switch (ver isAdmin logo abaixo) — sempre só os
  // próprios tickets, sem exceção.
  const [showAll, setShowAll] = useState(() => {
    const stored = localStorage.getItem('kanbanShowAll');
    return stored !== null ? stored === 'true' : user.profile === 'admin';
  });
  const isAdmin = user.profile === 'admin';
  const queueIds = user.queues.map(queue => queue.UserQueue.queueId);
  const whatsappIds = (user.whatsapps || []).map(w => w.id);
  const userWhatsappId = user.whatsappId;
  const { getAll: getAllSettings } = useCompanySettings();
  const [slaLimits, setSlaLimits] = useState({ green: 30, yellow: 60, red: 120 });
  const [slaColors, setSlaColors] = useState({ green: '#22c55e', yellow: '#eab308', red: '#ef4444' });
  const [filterSlaRed, setFilterSlaRed] = useState(false);
  const [slaModalOpen, setSlaModalOpen] = useState(false);
  const [companySettings, setCompanySettings] = useState(null);

  const [sortOrder, setSortOrder] = useState(() => {
    return localStorage.getItem('sortOrder') || 'ticketNumber';
  });

  const [laneOrder, setLaneOrder] = useState(null);
  const [loadingLaneOrder, setLoadingLaneOrder] = useState(true);

  // ===== Multi-boards =====
  const [boards, setBoards] = useState([]);
  const [activeBoardId, setActiveBoardId] = useState(() => {
    const v = localStorage.getItem('kanbanActiveBoardId');
    return v ? Number(v) : null;
  });
  const activeBoard = boards.find(b => b.id === activeBoardId) || null;

  useEffect(() => {
    const loadBoards = async () => {
      try {
        const data = await listBoards();
        const list = Array.isArray(data) ? data : [];
        setBoards(list);
        // se não há board ativo válido, escolher default ou primeiro
        if (!list.find(b => b.id === activeBoardId)) {
          const def = list.find(b => b.isDefault) || list[0];
          if (def) {
            setActiveBoardId(def.id);
            localStorage.setItem('kanbanActiveBoardId', String(def.id));
          } else {
            setActiveBoardId(null);
            localStorage.removeItem('kanbanActiveBoardId');
          }
        }
      } catch (e) {
        console.warn('Falha ao carregar boards', e);
      }
    };
    loadBoards();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleBoardChange = (e) => {
    const val = e.target.value;
    const id = val ? Number(val) : null;
    setActiveBoardId(id);
    if (id) localStorage.setItem('kanbanActiveBoardId', String(id));
    else localStorage.removeItem('kanbanActiveBoardId');
  };

  // ===== Turno A: filtros globais persistentes + modo compacto + atalhos =====
  const [usersList, setUsersList] = useState([]);
  const [queuesList, setQueuesList] = useState([]);
  const [whatsappsList, setWhatsappsList] = useState([]);
  const [filterUser, setFilterUser] = useState(() => localStorage.getItem('kanbanFilterUser') || '');
  const [filterQueue, setFilterQueue] = useState(() => localStorage.getItem('kanbanFilterQueue') || '');
  const [filterChannel, setFilterChannel] = useState(() => localStorage.getItem('kanbanFilterChannel') || '');
  const [filterTag, setFilterTag] = useState(() => localStorage.getItem('kanbanFilterTag') || '');
  const [compactMode, setCompactMode] = useState(() => localStorage.getItem('kanbanCompact') === 'true');
  const [focusedLane, setFocusedLane] = useState(0);
  const [focusedCard, setFocusedCard] = useState(0);

  useEffect(() => { localStorage.setItem('kanbanFilterUser', filterUser); }, [filterUser]);
  useEffect(() => { localStorage.setItem('kanbanFilterQueue', filterQueue); }, [filterQueue]);
  useEffect(() => { localStorage.setItem('kanbanFilterChannel', filterChannel); }, [filterChannel]);
  useEffect(() => { localStorage.setItem('kanbanFilterTag', filterTag); }, [filterTag]);
  useEffect(() => { localStorage.setItem('kanbanCompact', String(compactMode)); }, [compactMode]);

  // Carregar listas para selects
  useEffect(() => {
    const loadFilterOptions = async () => {
      try {
        const [usersRes, queuesRes, whatsappsRes] = await Promise.all([
          isAdmin ? api.get('/users/list').catch(() => ({ data: [] })) : Promise.resolve({ data: [] }),
          api.get('/queue').catch(() => ({ data: [] })),
          api.get('/whatsapp').catch(() => ({ data: [] })),
        ]);
        setUsersList(Array.isArray(usersRes.data) ? usersRes.data : (usersRes.data?.users || []));
        setQueuesList(Array.isArray(queuesRes.data) ? queuesRes.data : []);
        setWhatsappsList(Array.isArray(whatsappsRes.data) ? whatsappsRes.data : []);
      } catch (e) { console.warn('Kanban filter options load failed', e); }
    };
    loadFilterOptions();
  }, [isAdmin]);

  const clearAllFilters = () => {
    setFilterUser(''); setFilterQueue(''); setFilterChannel(''); setFilterTag('');
    setFilterSlaRed(false);
  };

  const hasActiveFilters = filterUser || filterQueue || filterChannel || filterTag || filterSlaRed;

  // Atalhos de teclado globais
  useEffect(() => {
    const handleKey = (e) => {
      const tag = (e.target?.tagName || '').toLowerCase();
      if (tag === 'input' || tag === 'textarea' || tag === 'select' || e.target?.isContentEditable) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      if (!lanes.length) return;

      if (e.key === 'ArrowRight') {
        setFocusedLane((i) => Math.min(lanes.length - 1, i + 1));
        setFocusedCard(0); e.preventDefault();
      } else if (e.key === 'ArrowLeft') {
        setFocusedLane((i) => Math.max(0, i - 1));
        setFocusedCard(0); e.preventDefault();
      } else if (e.key === 'ArrowDown' || e.key === 'j' || e.key === 'J') {
        const lane = lanes[focusedLane];
        if (lane) setFocusedCard((c) => Math.min((lane.tickets?.length || 1) - 1, c + 1));
        e.preventDefault();
      } else if (e.key === 'ArrowUp' || e.key === 'k' || e.key === 'K') {
        setFocusedCard((c) => Math.max(0, c - 1));
        e.preventDefault();
      } else if (e.key === 'Enter') {
        const lane = lanes[focusedLane];
        const ticket = lane?.tickets?.[focusedCard];
        if (ticket) {
          history.push(`/tickets/${ticket.uuid || ticket.id}`);
          e.preventDefault();
        }
      } else if (e.key === 'c' || e.key === 'C') {
        setCompactMode((v) => !v); e.preventDefault();
      } else if (e.key === '/') {
        const inp = document.querySelector('input[placeholder]');
        if (inp) { inp.focus(); e.preventDefault(); }
      }
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [lanes, focusedLane, focusedCard, history]);

  useEffect(() => {
    localStorage.setItem('sortOrder', sortOrder);
  }, [sortOrder]);

  // Carregar configurações de SLA
  useEffect(() => {
    const fetchSlaSettings = async () => {
      try {
        const settings = await getAllSettings(user.companyId);
        setCompanySettings(settings);
        setSlaLimits({
          green: parseInt(settings.slaGreenMinutes, 10) || 30,
          yellow: parseInt(settings.slaYellowMinutes, 10) || 60,
          red: parseInt(settings.slaRedMinutes, 10) || 120,
        });
        setSlaColors({
          green: settings.slaGreenColor || '#22c55e',
          yellow: settings.slaYellowColor || '#eab308',
          red: settings.slaRedColor || '#ef4444',
        });
      } catch {}
    };
    if (user?.companyId) fetchSlaSettings();
  }, [user?.companyId]);

  const handleSlaSettingsChange = (newSettings) => {
    setCompanySettings(newSettings);
    setSlaLimits({
      green: parseInt(newSettings.slaGreenMinutes, 10) || 30,
      yellow: parseInt(newSettings.slaYellowMinutes, 10) || 60,
      red: parseInt(newSettings.slaRedMinutes, 10) || 120,
    });
    setSlaColors({
      green: newSettings.slaGreenColor || '#22c55e',
      yellow: newSettings.slaYellowColor || '#eab308',
      red: newSettings.slaRedColor || '#ef4444',
    });
  };

  // Carregar ordem das lanes do banco de dados
  useEffect(() => {
    const loadLaneOrder = async () => {
      try {
        const savedOrder = await getKanbanLaneOrder();
        setLaneOrder(savedOrder);
      } catch (error) {
        console.error('Erro ao carregar ordem das lanes:', error);
      } finally {
        setLoadingLaneOrder(false);
      }
    };

    if (user && user.id) {
      loadLaneOrder();
    }
  }, [user]);

  useEffect(() => {
    fetchTags();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showAll]);

  const fetchTags = async () => {
    try {
      const response = await api.get('/tag/kanban/');
      const fetchedTags = response.data.lista || [];
      setTags(fetchedTags);
      fetchTickets(fetchedTags);
    } catch (error) {
    }
  };

  const fetchTickets = async (fetchedTags = tags) => {
    try {
      const allWhatsappIds = whatsappIds.length > 0 ? whatsappIds : (userWhatsappId ? [userWhatsappId] : []);
      const { data } = await api.get('/ticket/kanban', {
        params: {
          queueIds: JSON.stringify(queueIds),
          whatsappIds: JSON.stringify(allWhatsappIds),
          startDate: startDate,
          endDate: endDate,
          showAll: showAll ? 'true' : 'false',
        },
      });
      setTickets(data.tickets);
      organizeLanes(fetchedTags, data.tickets);
    } catch (err) {
      setTickets([]);
    }
  };

  useEffect(() => {
    const companyId = user.companyId;

    const onAppMessage = data => {
      if (['create', 'update', 'delete'].includes(data.action)) {
        fetchTickets();
      }
    };

    socket.on(`company-${companyId}-ticket`, onAppMessage);
    socket.on(`company-${companyId}-appMessage`, onAppMessage);

    return () => {
      socket.off(`company-${companyId}-ticket`, onAppMessage);
      socket.off(`company-${companyId}-appMessage`, onAppMessage);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [socket, user.companyId]);

  const handleSearchClick = () => {
    fetchTickets();
  };

  const handleStartDateChange = event => {
    setStartDate(event.target.value);
  };

  const handleEndDateChange = event => {
    setEndDate(event.target.value);
  };

  const updateTicket = updatedTicket => {
    setTickets(prevTickets =>
      prevTickets.map(ticket =>
        ticket.id === updatedTicket.id ? updatedTicket : ticket
      )
    );
  };

  const getOpportunityValue = (ticket) => {
    const customFields = ticket.contact.extraInfo || [];
    const valueField = customFields.find(field => field.name === 'valor');
    const opportunityValue = valueField ? parseFloat(valueField.value) : 0;
    return opportunityValue;
  };

  /**
   * Garante que a coluna "Em aberto" (lane0) seja sempre a primeira, venha a
   * ordem de onde vier — do banco, de um board ou de um arrasto.
   */
  const fixarEmAbertoNaPrimeira = listaDeLanes => {
    const indice = listaDeLanes.findIndex(lane => lane.id === 'lane0');
    if (indice <= 0) return listaDeLanes;
    const copia = Array.from(listaDeLanes);
    const [emAberto] = copia.splice(indice, 1);
    copia.unshift(emAberto);
    return copia;
  };

  const organizeLanes = (fetchedTags = tags, fetchedTickets = tickets) => {
    let sortedTickets = [...fetchedTickets];

    // Cards em movimento ficam no destino escolhido, mesmo que o servidor
    // ainda responda com a etiqueta antiga (ou com nenhuma).
    if (movimentacoesEmCursoRef.current.size > 0) {
      sortedTickets = sortedTickets.map(ticket => {
        if (!movimentacoesEmCursoRef.current.has(ticket.id)) return ticket;
        const destino = movimentacoesEmCursoRef.current.get(ticket.id);
        if (destino === 'lane0') return { ...ticket, tags: [] };
        const tagDestino = (fetchedTags || []).find(
          t => String(t.id) === String(destino)
        );
        return { ...ticket, tags: tagDestino ? [tagDestino] : ticket.tags };
      });
    }

    // ===== Turno A: aplicar filtros globais =====
    if (filterUser) {
      sortedTickets = sortedTickets.filter(t => String(t.userId || t.user?.id || '') === String(filterUser));
    }
    if (filterQueue) {
      sortedTickets = sortedTickets.filter(t => String(t.queueId || t.queue?.id || '') === String(filterQueue));
    }
    if (filterChannel) {
      sortedTickets = sortedTickets.filter(t => (t.whatsapp?.channel || t.channel) === filterChannel);
    }
    if (filterTag) {
      sortedTickets = sortedTickets.filter(t => (t.tags || []).some(tg => String(tg.id) === String(filterTag)));
    }

    // Filtrar por SLA atrasado se ativado
    if (filterSlaRed) {
      sortedTickets = sortedTickets.filter(ticket => {
        try {
          const mins = differenceInMinutes(new Date(), parseISO(ticket.updatedAt));
          return mins > slaLimits.yellow;
        } catch {
          return false;
        }
      });
    }

    if (sortOrder === 'ticketNumber') {
      sortedTickets.sort((a, b) => a.id - b.id);
    } else if (sortOrder === 'lastMessageTime') {
      sortedTickets.sort(
        (a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)
      );
    } else if (sortOrder === 'valorDesc') {
      sortedTickets.sort((a, b) => {
        const valorA = getOpportunityValue(a);
        const valorB = getOpportunityValue(b);
        return valorB - valorA;
      });
    }

    // Multi-boards: filtra tags conforme board ativo (mesmo que tagIds seja vazio)
    let tagsToShow = fetchedTags;
    let orderFromBoard = null;
    if (activeBoard) {
      const allowed = (Array.isArray(activeBoard.tagIds) ? activeBoard.tagIds : []).map(Number);
      tagsToShow = fetchedTags.filter(t => allowed.includes(Number(t.id)));
      if (Array.isArray(activeBoard.laneOrder) && activeBoard.laneOrder.length > 0) {
        orderFromBoard = activeBoard.laneOrder.map(String);
      }
    }

    const defaultTickets = sortedTickets.filter(
      ticket => ticket.tags.length === 0
    );

    const lanesData = [
      {
        id: 'lane0',
        title: i18n.t('tagsKanban.laneDefault'),
        tickets: defaultTickets,
        color: '#757575',
      },
      ...tagsToShow.map(tag => {
        const taggedTickets = sortedTickets.filter(ticket =>
          ticket.tags.some(t => t.id === tag.id)
        );
        return {
          id: tag.id.toString(),
          title: translateLaneName(tag.name),
          tickets: taggedTickets,
          color: tag.color || '#757575',
        };
      }),
    ];

    // Aplicar ordem do board ativo (prioridade) ou ordem global
    const effectiveOrder = orderFromBoard || (laneOrder && laneOrder.length > 0 ? laneOrder : null);
    if (effectiveOrder) {
      const orderedLanes = [];
      const laneMap = new Map(lanesData.map(lane => [lane.id, lane]));
      effectiveOrder.forEach(laneId => {
        const key = String(laneId);
        if (laneMap.has(key)) {
          orderedLanes.push(laneMap.get(key));
          laneMap.delete(key);
        }
      });
      laneMap.forEach(lane => orderedLanes.push(lane));
      setLanes(fixarEmAbertoNaPrimeira(orderedLanes));
    } else {
      setLanes(fixarEmAbertoNaPrimeira(lanesData));
    }
  };

  useEffect(() => {
    if (!loadingLaneOrder) {
      organizeLanes();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tags, tickets, sortOrder, laneOrder, loadingLaneOrder, filterSlaRed, slaLimits, filterUser, filterQueue, filterChannel, filterTag, activeBoardId, boards]);

  /**
   * Move o card de coluna.
   *
   * A operação são DOIS passos no servidor: tirar a etiqueta da coluna atual
   * e pôr a da coluna destino. Isso tem duas armadilhas, e o código antigo
   * caía nas duas:
   *
   *  - Se o segundo passo falha, o ticket fica SEM etiqueta nenhuma e some do
   *    quadro. Era o "tickets sumindo": o DELETE passava, o PUT não, e o card
   *    desaparecia. Agora, se o PUT falhar, devolvemos a etiqueta de origem.
   *
   *  - O erro caía num `console.log` e o quadro não era recarregado, então a
   *    tela continuava mostrando o card na coluna nova mesmo sem nada ter
   *    sido salvo. Era o "arrasta e não fica". Agora o erro aparece e o
   *    quadro é recarregado SEMPRE, dando certo ou errado.
   */
  const handleCardMove = async (ticketId, targetLaneId, sourceLaneId) => {
    ticketId = parseInt(ticketId, 10);

    // ATUALIZAÇÃO OTIMISTA
    //
    // O card vai para a coluna nova na hora, sem esperar o servidor. Antes, a
    // tela só mudava depois de duas chamadas e de um recarregamento inteiro do
    // quadro — dava a sensação de travado. Se o servidor recusar, desfazemos e
    // recarregamos, então a tela nunca fica mostrando algo que não foi salvo.
    const ticketsAntes = tickets;
    movimentacoesEmCursoRef.current.set(ticketId, targetLaneId);

    const tagDestino =
      targetLaneId === 'lane0'
        ? null
        : (tags || []).find(t => String(t.id) === String(targetLaneId));

    setTickets(prev =>
      prev.map(t =>
        t.id === ticketId
          ? { ...t, tags: tagDestino ? [tagDestino] : [] }
          : t
      )
    );

    try {
      await api.delete(`/ticket-tags/${ticketId}`);

      if (targetLaneId !== 'lane0') {
        try {
          await api.put(`/ticket-tags/${ticketId}/${targetLaneId}`);
        } catch (erroAoAplicar) {
          // Devolve a etiqueta de origem: melhor voltar ao lugar de antes do
          // que o card sumir do quadro por ficar sem etiqueta nenhuma.
          if (sourceLaneId && sourceLaneId !== 'lane0') {
            try {
              await api.put(`/ticket-tags/${ticketId}/${sourceLaneId}`);
            } catch (erroAoDesfazer) {
              // Sem o que fazer aqui — o recarregamento abaixo mostra a
              // situação real, seja ela qual for.
            }
          }
          throw erroAoAplicar;
        }
        toast.success(i18n.t("kanban.toasts.tagUpdated"));
      } else {
        toast.success(i18n.t("kanban.toasts.tagRemoved"));
      }

      // Deu certo: a tela já está correta desde o início do arrasto, então
      // NÃO recarregamos. É o recarregamento que causava o atraso e o pulo
      // do card pela coluna "Em aberto".
      movimentacoesEmCursoRef.current.delete(ticketId);
    } catch (err) {
      // Deu errado: desfaz a mudança na tela e busca o estado real.
      movimentacoesEmCursoRef.current.delete(ticketId);
      setTickets(ticketsAntes);
      toastError(err);
      fetchTickets();
    }
  };

  const handleAddColumnClick = () => {
    // Passa o board ativo por `location.state` pra TagsKanban conseguir
    // vincular a coluna nova a ele (POST /kanban-boards/:id/columns/:tagId)
    // assim que ela for criada — sem isso, a Tag era criada normalmente no
    // banco mas nunca entrava no `tagIds` de nenhum board, ficando invisível
    // em qualquer board diferente do "nenhum board selecionado" (que não
    // filtra por tagIds). Quando não há board ativo (activeBoardId null),
    // TagsKanban simplesmente não tenta vincular nada — comportamento igual
    // ao antigo.
    history.push('/tagsKanban', { boardId: activeBoardId || null });
  };

  const handleSortOrderChange = event => {
    setSortOrder(event.target.value);
  };

  const handleLaneReorder = async (sourceIndex, destinationIndex) => {
    // "Em aberto" (lane0) fica presa na 1ª posição: é a entrada do funil, e
    // colocar qualquer coluna antes dela bagunça a leitura do fluxo de vendas.
    // Bloqueia tanto arrastar a própria quanto soltar outra no lugar dela.
    if (lanes[sourceIndex]?.id === 'lane0' || destinationIndex === 0) {
      return;
    }

    const newLanes = Array.from(lanes);
    const [reorderedLane] = newLanes.splice(sourceIndex, 1);
    newLanes.splice(destinationIndex, 0, reorderedLane);
    
    setLanes(fixarEmAbertoNaPrimeira(newLanes));

    // Salvar nova ordem no banco de dados
    const newLaneOrder = fixarEmAbertoNaPrimeira(newLanes).map(lane => lane.id);
    setLaneOrder(newLaneOrder);
    
    try {
      await setKanbanLaneOrder(newLaneOrder);
      toast.success(i18n.t("kanban.toasts.laneOrderUpdated"));
    } catch (error) {
      console.error('Erro ao salvar ordem das lanes:', error);
      toast.error(i18n.t("kanban.toasts.laneOrderError"));
    }
  };

  const renderMobileHeader = () => (
    <div className={classes.mobileFilters}>
      <div className={classes.mobileFilterRow}>
        <Title>{i18n.t('kanban.title')}</Title>
      </div>
      <div className={classes.mobileFilterRow}>
        {isAdmin && (
          <FormControlLabel
            control={
              <Switch
                checked={showAll}
                onChange={(e) => {
                  const val = e.target.checked;
                  setShowAll(val);
                  localStorage.setItem('kanbanShowAll', String(val));
                }}
                color="primary"
                size="small"
              />
            }
            label={showAll ? i18n.t("kanban.allTickets") : i18n.t("kanban.myTickets")}
            style={{ marginRight: 8 }}
          />
        )}
        <Chip
          icon={<span style={{ fontSize: 12 }}>🔴</span>}
          label={filterSlaRed ? i18n.t("kanban.slaOverdue") : i18n.t("kanban.filterSla")}
          clickable
          onClick={() => setFilterSlaRed(!filterSlaRed)}
          color={filterSlaRed ? "secondary" : "default"}
          variant={filterSlaRed ? "default" : "outlined"}
          size="small"
          style={{ borderRadius: 20 }}
        />
        {isAdmin && (
          <Tooltip title="Configurar SLA">
            <IconButton size="small" onClick={() => setSlaModalOpen(true)}>
              <AccessTimeIcon fontSize="small" />
            </IconButton>
          </Tooltip>
        )}
      </div>
      <div className={classes.mobileFilterRow}>
        <FormControl variant="outlined" size="small" className={classes.sortSelect}>
          <InputLabel htmlFor="sort-order-select-m">{i18n.t('kanban.sortBy')}</InputLabel>
          <Select
            native
            value={sortOrder}
            onChange={handleSortOrderChange}
            label={i18n.t('kanban.sortBy')}
            inputProps={{ name: 'sortOrder', id: 'sort-order-select-m' }}
          >
            <option value="ticketNumber">{i18n.t('kanban.sortOptions.ticketNumber')}</option>
            <option value="lastMessageTime">{i18n.t('kanban.sortOptions.lastMessage')}</option>
            <option value="valorDesc">{i18n.t('kanban.sortOptions.valueDesc')}</option>
          </Select>
        </FormControl>
      </div>
      <div className={classes.mobileFilterRow}>
        <TextField
          label={i18n.t('kanban.startDate')}
          type="date"
          value={startDate}
          onChange={handleStartDateChange}
          InputLabelProps={{ shrink: true }}
          variant="outlined"
          className={classes.dateInput}
          size="small"
        />
        <TextField
          label={i18n.t('kanban.endDate')}
          type="date"
          value={endDate}
          onChange={handleEndDateChange}
          InputLabelProps={{ shrink: true }}
          variant="outlined"
          className={classes.dateInput}
          size="small"
        />
      </div>
      <div className={classes.mobileFilterRow} style={{ flexDirection: 'column' }}>
        <Button
          variant="contained"
          color="primary"
          onClick={handleSearchClick}
          className={classes.button}
          size="small"
          style={{ width: '100%' }}
        >
          {i18n.t('kanban.search')}
        </Button>
        <Can
          role={user.profile}
          perform="dashboard:view"
          yes={() => (
            <Button
              variant="contained"
              color="primary"
              onClick={handleAddColumnClick}
              className={classes.button}
              size="small"
              style={{ width: '100%', fontSize: '0.75rem' }}
            >
              + {i18n.t('kanban.addColumns')}
            </Button>
          )}
        />
      </div>
    </div>
  );

  return (
    <MainContainer>
      {isMobile ? (
        renderMobileHeader()
      ) : (
        <MainHeader>
          <Title>{i18n.t('kanban.title')}</Title>
          <MainHeaderButtonsWrapper>
            {boards.length > 0 && (
              <FormControl variant="outlined" size="small" style={{ minWidth: 200 }}>
                <InputLabel shrink>{i18n.t('kanban.boardLabel')}</InputLabel>
                <Select native value={activeBoardId || ''} onChange={handleBoardChange} label={i18n.t('kanban.boardLabel')}>
                  <option value="">{i18n.t('kanban.boardAll')}</option>
                  {boards.map(b => (
                    <option key={b.id} value={b.id}>{b.name}{b.isDefault ? ' ★' : ''}</option>
                  ))}
                </Select>
              </FormControl>
            )}
            <Tooltip title={i18n.t('kanban.manageBoards')}>
              <IconButton size="small" onClick={() => history.push('/kanban-boards')}>
                <SettingsIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            {isAdmin && (
              <FormControlLabel
                control={
                  <Switch
                    checked={showAll}
                    onChange={(e) => {
                      const val = e.target.checked;
                      setShowAll(val);
                      localStorage.setItem('kanbanShowAll', String(val));
                    }}
                    color="primary"
                    size="small"
                  />
                }
                label={showAll ? i18n.t("kanban.allTickets") : i18n.t("kanban.myTickets")}
              />
            )}
            <Chip
              icon={<span style={{ fontSize: 14 }}>🔴</span>}
              label={filterSlaRed ? i18n.t("kanban.slaOverdue") : i18n.t("kanban.filterSla")}
              clickable
              onClick={() => setFilterSlaRed(!filterSlaRed)}
              color={filterSlaRed ? "secondary" : "default"}
              variant={filterSlaRed ? "default" : "outlined"}
              style={{ borderRadius: 20, height: 32 }}
            />
            {isAdmin && (
              <Tooltip title="Configurar SLA do Kanban">
                <IconButton size="small" onClick={() => setSlaModalOpen(true)}>
                  <AccessTimeIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            {/* ===== Turno A: filtros globais ===== */}
            {isAdmin && (
              <FormControl variant="outlined" size="small" style={{ minWidth: 140 }}>
                <InputLabel shrink>{i18n.t('kanban.filterUser')}</InputLabel>
                <Select native value={filterUser} onChange={(e) => setFilterUser(e.target.value)} label={i18n.t('kanban.filterUser')}>
                  <option value="">{i18n.t('kanban.filterAll')}</option>
                  {usersList.map(u => (<option key={u.id} value={u.id}>{u.name}</option>))}
                </Select>
              </FormControl>
            )}
            <FormControl variant="outlined" size="small" style={{ minWidth: 130 }}>
              <InputLabel shrink>{i18n.t('kanban.filterQueue')}</InputLabel>
              <Select native value={filterQueue} onChange={(e) => setFilterQueue(e.target.value)} label={i18n.t('kanban.filterQueue')}>
                <option value="">{i18n.t('kanban.filterAll')}</option>
                {queuesList.map(q => (<option key={q.id} value={q.id}>{q.name}</option>))}
              </Select>
            </FormControl>
            <FormControl variant="outlined" size="small" style={{ minWidth: 140 }}>
              <InputLabel shrink>{i18n.t('kanban.filterChannel')}</InputLabel>
              <Select native value={filterChannel} onChange={(e) => setFilterChannel(e.target.value)} label={i18n.t('kanban.filterChannel')}>
                <option value="">{i18n.t('kanban.filterAll')}</option>
                <option value="whatsapp">WhatsApp</option>
                <option value="telegram">Telegram</option>
                <option value="facebook">Facebook</option>
                <option value="instagram">Instagram</option>
              </Select>
            </FormControl>
            <FormControl variant="outlined" size="small" style={{ minWidth: 130 }}>
              <InputLabel shrink>{i18n.t('kanban.filterTag')}</InputLabel>
              <Select native value={filterTag} onChange={(e) => setFilterTag(e.target.value)} label={i18n.t('kanban.filterTag')}>
                <option value="">{i18n.t('kanban.filterAll')}</option>
                {tags.map(t => (<option key={t.id} value={t.id}>{t.name}</option>))}
              </Select>
            </FormControl>
            {hasActiveFilters && (
              <Tooltip title={i18n.t('kanban.clearFilters')}>
                <IconButton size="small" onClick={clearAllFilters}>
                  <ClearIcon fontSize="small" />
                </IconButton>
              </Tooltip>
            )}
            <Tooltip title={compactMode ? i18n.t('kanban.expanded') : i18n.t('kanban.compact')}>
              <IconButton size="small" onClick={() => setCompactMode(v => !v)}>
                {compactMode ? <ViewModuleIcon fontSize="small" /> : <ViewCompactIcon fontSize="small" />}
              </IconButton>
            </Tooltip>
            <Tooltip title={i18n.t('kanban.shortcutsHelp')}>
              <IconButton size="small">
                <HelpOutlineIcon fontSize="small" />
              </IconButton>
            </Tooltip>
            <FormControl
              variant="outlined"
              size="small"
              style={{ minWidth: 170 }}
            >
              <InputLabel htmlFor="sort-order-select">{i18n.t('kanban.sortBy')}</InputLabel>
              <Select
                native
                value={sortOrder}
                onChange={handleSortOrderChange}
                label={i18n.t('kanban.sortBy')}
                inputProps={{
                  name: 'sortOrder',
                  id: 'sort-order-select',
                }}
              >
                <option value="ticketNumber">{i18n.t('kanban.sortOptions.ticketNumber')}</option>
                <option value="lastMessageTime">{i18n.t('kanban.sortOptions.lastMessage')}</option>
                <option value="valorDesc">{i18n.t('kanban.sortOptions.valueDesc')}</option>
              </Select>
            </FormControl>
            <TextField
              label={i18n.t('kanban.startDate')}
              type="date"
              value={startDate}
              onChange={handleStartDateChange}
              InputLabelProps={{ shrink: true }}
              variant="outlined"
              className={classes.dateInput}
              size="small"
            />
            <TextField
              label={i18n.t('kanban.endDate')}
              type="date"
              value={endDate}
              onChange={handleEndDateChange}
              InputLabelProps={{ shrink: true }}
              variant="outlined"
              className={classes.dateInput}
              size="small"
            />
            <Button
              variant="contained"
              color="primary"
              onClick={handleSearchClick}
              className={classes.button}
            >
              {i18n.t('kanban.search')}
            </Button>
            <Can
              role={user.profile}
              perform="dashboard:view"
              yes={() => (
                <Button
                  variant="contained"
                  color="primary"
                  onClick={handleAddColumnClick}
                  className={classes.button}
                >
                  + {i18n.t('kanban.addColumns')}
                </Button>
              )}
            />
          </MainHeaderButtonsWrapper>
        </MainHeader>
      )}
      <Paper variant="outlined" className={classes.mainPaper}>
        <KanbanBoard
          lanes={lanes}
          onCardMove={handleCardMove}
          onLaneReorder={handleLaneReorder}
          updateTicket={updateTicket}
          slaLimits={slaLimits}
          slaColors={slaColors}
          compactMode={compactMode}
          focusedLane={focusedLane}
          focusedCard={focusedCard}
        />
      </Paper>
      <Dialog
        open={slaModalOpen}
        onClose={() => setSlaModalOpen(false)}
        maxWidth="md"
        fullWidth
        fullScreen={isMobile}
      >
        <DialogTitle style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <span style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <AccessTimeIcon fontSize="small" />
            {i18n.t("hardcoded.slaTitle")}
          </span>
          <IconButton size="small" onClick={() => setSlaModalOpen(false)}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </DialogTitle>
        <DialogContent dividers>
          <KanbanSlaSettings
            settings={companySettings}
            onSettingsChange={handleSlaSettingsChange}
          />
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setSlaModalOpen(false)}>{i18n.t("hardcoded.slaClose")}</Button>
        </DialogActions>
      </Dialog>
    </MainContainer>
  );
};

export default Kanban;
