import React, { useState, useEffect, useMemo, useCallback, useContext } from 'react';
import { makeStyles } from '@material-ui/core/styles';
import api from "../../services/api";
import { toast } from 'react-toastify';
import {
  TextField, Button, List, ListItem, ListItemText, ListItemSecondaryAction,
  IconButton, Checkbox, Chip, Paper, Typography, Tabs, Tab, Select, MenuItem,
  FormControl, InputLabel, Dialog, DialogTitle, DialogContent, DialogContentText,
  DialogActions, InputAdornment, Box, LinearProgress, Collapse, Tooltip,
} from '@material-ui/core';
import { Alert } from '@material-ui/lab';
import DeleteIcon from "@material-ui/icons/Delete";
import EditIcon from "@material-ui/icons/Edit";
import SearchIcon from "@material-ui/icons/Search";
import AddIcon from "@material-ui/icons/Add";
import EmptyIcon from "@material-ui/icons/AssignmentTurnedIn";
import DragIcon from "@material-ui/icons/DragIndicator";
import ExpandMoreIcon from "@material-ui/icons/ExpandMore";
import ExpandLessIcon from "@material-ui/icons/ExpandLess";
import CloseIcon from "@material-ui/icons/Close";
import PersonIcon from "@material-ui/icons/Person";
import NoteIcon from "@material-ui/icons/Note";
import { DragDropContext, Droppable, Draggable } from 'react-beautiful-dnd';
import { AuthContext } from "../../context/Auth/AuthContext";
import { i18n } from "../../translate/i18n";

const CATEGORY_KEYS = ['general', 'work', 'personal', 'urgent', 'study'];
const PRIORITY_KEYS = ['high', 'medium', 'low'];
const PRIORITY_COLORS = { high: '#ef4444', medium: '#f59e0b', low: '#22c55e' };
const STATUS_KEYS = ['pending', 'in_progress', 'done'];
const STATUS_COLORS = { pending: '#94a3b8', in_progress: '#3b82f6', done: '#22c55e' };

const useStyles = makeStyles((theme) => ({
  root: {
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    padding: theme.spacing(3),
    minHeight: '100%',
    background: theme.palette.type === 'dark'
      ? 'linear-gradient(180deg, #0d0f18 0%, #1a1c2e 100%)'
      : '#f5f5f5',
  },
  container: {
    width: '100%',
    maxWidth: 800,
  },
  header: {
    marginBottom: theme.spacing(2),
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  title: {
    fontWeight: 700,
    fontSize: '1.6rem',
    color: theme.palette.type === 'dark' ? '#fff' : '#1e293b',
  },
  counter: {
    fontSize: '0.85rem',
    color: theme.palette.type === 'dark' ? '#94a3b8' : '#64748b',
  },
  formCard: {
    padding: theme.spacing(2),
    marginBottom: theme.spacing(2),
    borderRadius: 12,
    background: theme.palette.type === 'dark' ? '#1e2038' : '#fff',
  },
  formRow: {
    display: 'flex',
    gap: theme.spacing(1),
    marginBottom: theme.spacing(1),
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  filtersRow: {
    display: 'flex',
    gap: theme.spacing(1),
    marginBottom: theme.spacing(2),
    flexWrap: 'wrap',
    alignItems: 'center',
  },
  taskCard: {
    borderRadius: 10,
    marginBottom: theme.spacing(1),
    padding: theme.spacing(1, 2),
    background: theme.palette.type === 'dark' ? '#1e2038' : '#fff',
    transition: 'box-shadow 0.2s',
    '&:hover': {
      boxShadow: '0 2px 12px rgba(0,0,0,0.12)',
    },
  },
  taskCardDragging: {
    boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
  },
  dragHandle: {
    cursor: 'grab',
    color: theme.palette.type === 'dark' ? '#64748b' : '#94a3b8',
    marginRight: theme.spacing(0.5),
    display: 'flex',
    alignItems: 'center',
  },
  completedText: {
    textDecoration: 'line-through',
    opacity: 0.5,
  },
  emptyState: {
    textAlign: 'center',
    padding: theme.spacing(6),
    color: theme.palette.type === 'dark' ? '#64748b' : '#94a3b8',
  },
  priorityChip: {
    fontWeight: 600,
    fontSize: '0.7rem',
    height: 22,
    marginRight: theme.spacing(0.5),
  },
  categoryChip: {
    fontSize: '0.7rem',
    height: 22,
  },
  statusChip: {
    fontWeight: 600,
    fontSize: '0.7rem',
    height: 22,
    marginRight: theme.spacing(0.5),
  },
  assignedChip: {
    fontSize: '0.7rem',
    height: 22,
    marginRight: theme.spacing(0.5),
  },
  dueDateText: {
    fontSize: '0.75rem',
    color: theme.palette.type === 'dark' ? '#94a3b8' : '#64748b',
  },
  overdue: {
    color: '#ef4444',
    fontWeight: 600,
  },
  subtaskSection: {
    paddingLeft: theme.spacing(5),
    borderLeft: `2px solid ${theme.palette.type === 'dark' ? '#2d3154' : '#e2e8f0'}`,
    marginLeft: theme.spacing(2),
    marginTop: theme.spacing(0.5),
    paddingBottom: theme.spacing(0.5),
  },
  subtaskItem: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(0.5),
    padding: theme.spacing(0.25, 0),
  },
  subtaskText: {
    fontSize: '0.85rem',
    color: theme.palette.type === 'dark' ? '#cbd5e1' : '#475569',
  },
  subtaskCompleted: {
    textDecoration: 'line-through',
    opacity: 0.5,
  },
  subtaskProgress: {
    height: 4,
    borderRadius: 2,
    marginTop: 4,
    width: 100,
  },
  subtaskToggle: {
    display: 'flex',
    alignItems: 'center',
    gap: 4,
    cursor: 'pointer',
    fontSize: '0.75rem',
    color: theme.palette.type === 'dark' ? '#94a3b8' : '#64748b',
    marginTop: 2,
    '&:hover': {
      color: theme.palette.primary.main,
    },
  },
  subtaskAddRow: {
    display: 'flex',
    alignItems: 'center',
    gap: theme.spacing(0.5),
    marginTop: theme.spacing(0.5),
  },
  notesSection: {
    marginTop: theme.spacing(0.5),
    padding: theme.spacing(1),
    backgroundColor: theme.palette.type === 'dark' ? '#161830' : '#f8fafc',
    borderRadius: 6,
    fontSize: '0.8rem',
    color: theme.palette.type === 'dark' ? '#94a3b8' : '#64748b',
    whiteSpace: 'pre-wrap',
  },
  createdByText: {
    fontSize: '0.7rem',
    color: theme.palette.type === 'dark' ? '#64748b' : '#94a3b8',
    fontStyle: 'italic',
  },
}));

const ToDoList = () => {
  const classes = useStyles();
  const { user } = useContext(AuthContext);
  const isAdmin = user?.profile === "admin";

  const [loading, setLoading] = useState(false);
  const [tasks, setTasks] = useState([]);
  const [users, setUsers] = useState([]);
  const [text, setText] = useState('');
  const [priority, setPriority] = useState('medium');
  const [category, setCategory] = useState('general');
  const [dueDate, setDueDate] = useState('');
  const [status, setStatus] = useState('pending');
  const [notes, setNotes] = useState('');
  const [assignedToId, setAssignedToId] = useState('');
  const [editId, setEditId] = useState(null);
  const [search, setSearch] = useState('');
  const [tabFilter, setTabFilter] = useState(0);
  const [priorityFilter, setPriorityFilter] = useState('all');
  const [userFilter, setUserFilter] = useState('all');
  const [sortBy, setSortBy] = useState('createdAt');
  const [deleteDialog, setDeleteDialog] = useState({ open: false, id: null });
  const [expandedTask, setExpandedTask] = useState(null);
  const [expandedNotes, setExpandedNotes] = useState(null);
  const [newSubtaskText, setNewSubtaskText] = useState('');
  const [showDueNotification, setShowDueNotification] = useState(true);
  const [editingSubtask, setEditingSubtask] = useState(null);
  const [editSubtaskText, setEditSubtaskText] = useState('');

  const mapTask = (t) => ({
    id: t.id,
    text: t.title,
    priority: t.priority || 'medium',
    category: t.category || 'general',
    dueDate: t.dueDate || null,
    completed: t.completed || false,
    status: t.status || 'pending',
    notes: t.notes || '',
    sortOrder: t.sortOrder || 0,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
    assignedTo: t.assignedTo || null,
    createdBy: t.createdBy || null,
    assignedToId: t.assignedToId || null,
    subtasks: (t.subtasks || []).map(s => ({
      id: s.id,
      text: s.text,
      completed: s.completed || false,
      sortOrder: s.sortOrder || 0,
    })),
  });

  const fetchTasks = useCallback(async () => {
    try {
      setLoading(true);
      const { data } = await api.get("/todo-tasks");
      setTasks((data.tasks || []).map(mapTask));
    } catch (err) {
      toast.error(i18n.t("todoList.toasts.loadError"));
    } finally {
      setLoading(false);
    }
  }, []);

  const fetchUsers = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const { data } = await api.get("/users/list");
      setUsers(data || []);
    } catch (err) {
      // silent
    }
  }, [isAdmin]);

  useEffect(() => {
    fetchTasks();
    fetchUsers();
  }, [fetchTasks, fetchUsers]);

  const handleSubmit = async () => {
    if (!text.trim()) return;
    try {
      if (editId) {
        const task = tasks.find(t => t.id === editId);
        const { data } = await api.put(`/todo-tasks/${editId}`, {
          title: text.trim(), priority, category, dueDate: dueDate || null,
          status, notes: notes || null,
          assignedToId: assignedToId || null,
          subtasks: task?.subtasks || [],
        });
        setTasks(prev => prev.map(t => t.id === editId ? mapTask(data) : t));
        setEditId(null);
      } else {
        const { data } = await api.post("/todo-tasks", {
          title: text.trim(), priority, category, dueDate: dueDate || null,
          sortOrder: tasks.length, status, notes: notes || null,
          assignedToId: assignedToId || null,
        });
        setTasks(prev => [...prev, mapTask(data)]);
      }
      resetForm();
    } catch (err) {
      toast.error(i18n.t("todoList.toasts.saveError"));
    }
  };

  const resetForm = () => {
    setText(''); setPriority('medium'); setCategory('general');
    setDueDate(''); setStatus('pending'); setNotes(''); setAssignedToId('');
  };

  const handleStatusChange = async (id, newStatus) => {
    const task = tasks.find(t => t.id === id);
    if (!task) return;
    try {
      const completed = newStatus === 'done';
      const { data } = await api.put(`/todo-tasks/${id}`, {
        status: newStatus,
        completed,
        subtasks: task.subtasks,
      });
      setTasks(prev => prev.map(t => t.id === id ? mapTask(data) : t));
    } catch (err) {
      toast.error(i18n.t("todoList.toasts.statusError"));
    }
  };

  const handleEdit = (task) => {
    setText(task.text);
    setPriority(task.priority);
    setCategory(task.category);
    setDueDate(task.dueDate || '');
    setStatus(task.status || 'pending');
    setNotes(task.notes || '');
    setAssignedToId(task.assignedToId || '');
    setEditId(task.id);
  };

  const handleDelete = async () => {
    try {
      await api.delete(`/todo-tasks/${deleteDialog.id}`);
      setTasks(prev => prev.filter(t => t.id !== deleteDialog.id));
    } catch (err) {
      toast.error(i18n.t("todoList.toasts.deleteError"));
    }
    setDeleteDialog({ open: false, id: null });
  };

  const updateTaskSubtasks = async (taskId, newSubtasks) => {
    try {
      const { data } = await api.put(`/todo-tasks/${taskId}`, { subtasks: newSubtasks });
      setTasks(prev => prev.map(t => t.id === taskId ? mapTask(data) : t));
    } catch (err) {
      toast.error(i18n.t("todoList.toasts.subtaskError"));
    }
  };

  const handleAddSubtask = async (taskId) => {
    if (!newSubtaskText.trim()) return;
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    const newSubs = [...(task.subtasks || []), { text: newSubtaskText.trim(), completed: false, sortOrder: (task.subtasks || []).length }];
    await updateTaskSubtasks(taskId, newSubs);
    setNewSubtaskText('');
  };

  const handleToggleSubtask = async (taskId, subtaskId) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    const newSubs = (task.subtasks || []).map(s => s.id === subtaskId ? { ...s, completed: !s.completed } : s);
    await updateTaskSubtasks(taskId, newSubs);
  };

  const handleDeleteSubtask = async (taskId, subtaskId) => {
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    const newSubs = (task.subtasks || []).filter(s => s.id !== subtaskId);
    await updateTaskSubtasks(taskId, newSubs);
  };

  const handleEditSubtask = async (taskId, subtaskId, newText) => {
    if (!newText.trim()) return;
    const task = tasks.find(t => t.id === taskId);
    if (!task) return;
    const newSubs = (task.subtasks || []).map(s => s.id === subtaskId ? { ...s, text: newText.trim() } : s);
    await updateTaskSubtasks(taskId, newSubs);
    setEditingSubtask(null);
    setEditSubtaskText('');
  };

  const isDueSoon = (dateStr) => {
    if (!dateStr) return false;
    const today = new Date(new Date().toDateString());
    const due = new Date(dateStr + 'T00:00:00');
    const diffDays = Math.ceil((due - today) / (1000 * 60 * 60 * 24));
    return diffDays >= 0 && diffDays <= 1;
  };

  const dueSoonTasks = useMemo(() => {
    return tasks.filter(t => t.status !== 'done' && !t.completed && isDueSoon(t.dueDate));
  }, [tasks]);

  const PRIORITY_ORDER = { high: 0, medium: 1, low: 2 };

  const filtered = useMemo(() => {
    let result = tasks.filter(t => {
      if (tabFilter === 1 && t.status === 'done') return false;
      if (tabFilter === 2 && t.status !== 'done') return false;
      if (priorityFilter !== 'all' && t.priority !== priorityFilter) return false;
      if (userFilter !== 'all' && t.assignedToId !== Number(userFilter)) return false;
      if (search) {
        const q = search.toLowerCase();
        const matchText = t.text.toLowerCase().includes(q);
        const matchSubtask = (t.subtasks || []).some(s => s.text.toLowerCase().includes(q));
        const matchNotes = (t.notes || '').toLowerCase().includes(q);
        if (!matchText && !matchSubtask && !matchNotes) return false;
      }
      return true;
    });
    if (sortBy !== 'manual') {
      result.sort((a, b) => {
        if (sortBy === 'priority') return PRIORITY_ORDER[a.priority] - PRIORITY_ORDER[b.priority];
        if (sortBy === 'dueDate') {
          if (!a.dueDate && !b.dueDate) return 0;
          if (!a.dueDate) return 1;
          if (!b.dueDate) return -1;
          return new Date(a.dueDate) - new Date(b.dueDate);
        }
        return new Date(b.createdAt) - new Date(a.createdAt);
      });
    }
    return result;
  }, [tasks, tabFilter, priorityFilter, userFilter, search, sortBy]);

  const handleDragEnd = async (result) => {
    if (!result.destination) return;
    const { source, destination } = result;
    if (source.index === destination.index) return;
    const draggedId = filtered[source.index].id;
    const targetId = filtered[destination.index].id;
    setTasks(prev => {
      const newTasks = [...prev];
      const fromIdx = newTasks.findIndex(t => t.id === draggedId);
      const toIdx = newTasks.findIndex(t => t.id === targetId);
      const [moved] = newTasks.splice(fromIdx, 1);
      newTasks.splice(toIdx, 0, moved);
      newTasks.forEach((t, i) => {
        t.sortOrder = i;
        api.put(`/todo-tasks/${t.id}`, { sortOrder: i, subtasks: t.subtasks }).catch(() => {});
      });
      return newTasks;
    });
  };

  const pendingCount = tasks.filter(t => t.status !== 'done').length;

  const isOverdue = (dateStr) => {
    if (!dateStr) return false;
    return new Date(dateStr) < new Date(new Date().toDateString());
  };

  const getSubtaskProgress = (task) => {
    const subs = task.subtasks || [];
    if (subs.length === 0) return null;
    const done = subs.filter(s => s.completed).length;
    return { done, total: subs.length, percent: (done / subs.length) * 100 };
  };


  return (
    <div className={classes.root}>
      <div className={classes.container}>
        {/* Due soon notification */}
        {showDueNotification && dueSoonTasks.length > 0 && (
          <Alert
            severity="warning"
            onClose={() => setShowDueNotification(false)}
            style={{ marginBottom: 16, borderRadius: 10 }}
          >
            ⚠ {dueSoonTasks.length} {i18n.t("todoList.dueSoonAlert")}{' '}
            <strong>{dueSoonTasks.map(t => t.text).join(', ')}</strong>
          </Alert>
        )}
        <div className={classes.header}>
          <div>
            <Typography className={classes.title}>{i18n.t("todoList.title")}</Typography>
            <Typography className={classes.counter}>
              {i18n.t("todoList.counter", { pending: pendingCount, total: tasks.length })}
            </Typography>
          </div>
        </div>

        {/* Form */}
        <Paper className={classes.formCard} elevation={0}>
          <div className={classes.formRow}>
            <TextField
              label={editId ? i18n.t("todoList.editTask") : i18n.t("todoList.newTask")}
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && handleSubmit()}
              variant="outlined"
              size="small"
              style={{ flex: 1, minWidth: 200 }}
            />
            <Button
              variant="contained"
              color="primary"
              onClick={handleSubmit}
              startIcon={editId ? <EditIcon /> : <AddIcon />}
              size="medium"
            >
              {editId ? i18n.t("todoList.save") : i18n.t("todoList.add")}
            </Button>
            {editId && (
              <Button size="small" onClick={() => { setEditId(null); resetForm(); }}>
                {i18n.t("todoList.cancel")}
              </Button>
            )}
          </div>
          <div className={classes.formRow}>
            <FormControl variant="outlined" size="small" style={{ minWidth: 120 }}>
              <InputLabel>{i18n.t("todoList.priority")}</InputLabel>
              <Select value={priority} onChange={(e) => setPriority(e.target.value)} label={i18n.t("todoList.priority")}>
                {PRIORITY_KEYS.map(k => (
                  <MenuItem key={k} value={k}>
                    <span style={{ color: PRIORITY_COLORS[k], fontWeight: 600 }}>●</span>&nbsp;{i18n.t(`todoList.priorities.${k}`)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <FormControl variant="outlined" size="small" style={{ minWidth: 120 }}>
              <InputLabel>{i18n.t("todoList.category")}</InputLabel>
              <Select value={category} onChange={(e) => setCategory(e.target.value)} label={i18n.t("todoList.category")}>
                {CATEGORY_KEYS.map(c => <MenuItem key={c} value={c}>{i18n.t(`todoList.categories.${c}`)}</MenuItem>)}
              </Select>
            </FormControl>
            <FormControl variant="outlined" size="small" style={{ minWidth: 130 }}>
              <InputLabel>{i18n.t("todoList.status")}</InputLabel>
              <Select value={status} onChange={(e) => setStatus(e.target.value)} label={i18n.t("todoList.status")}>
                {STATUS_KEYS.map(k => (
                  <MenuItem key={k} value={k}>
                    <span style={{ color: STATUS_COLORS[k], fontWeight: 600 }}>●</span>&nbsp;{i18n.t(`todoList.statuses.${k}`)}
                  </MenuItem>
                ))}
              </Select>
            </FormControl>
            <TextField
              type="date"
              label={i18n.t("todoList.dueDate")}
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              variant="outlined"
              size="small"
              InputLabelProps={{ shrink: true }}
              style={{ minWidth: 150 }}
            />
          </div>
          <div className={classes.formRow}>
            {isAdmin && (
              <FormControl variant="outlined" size="small" style={{ minWidth: 160 }}>
              <InputLabel>{i18n.t("todoList.assignTo")}</InputLabel>
                <Select value={assignedToId} onChange={(e) => setAssignedToId(e.target.value)} label={i18n.t("todoList.assignTo")}>
                  <MenuItem value="">{i18n.t("todoList.nobody")}</MenuItem>
                  {users.map(u => <MenuItem key={u.id} value={u.id}>{u.name}</MenuItem>)}
                </Select>
              </FormControl>
            )}
            <TextField
              label={i18n.t("todoList.notes")}
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              variant="outlined"
              size="small"
              multiline
              rowsMax={3}
              style={{ flex: 1, minWidth: 200 }}
            />
          </div>
        </Paper>

        {/* Filters */}
        <div className={classes.filtersRow}>
          <Tabs value={tabFilter} onChange={(_, v) => setTabFilter(v)} indicatorColor="primary" textColor="primary" style={{ minHeight: 36 }}>
            <Tab label={i18n.t("todoList.allTabs")} style={{ minHeight: 36, minWidth: 80 }} />
            <Tab label={i18n.t("todoList.pendingTabs")} style={{ minHeight: 36, minWidth: 80 }} />
            <Tab label={i18n.t("todoList.doneTabs")} style={{ minHeight: 36, minWidth: 80 }} />
          </Tabs>
          <FormControl variant="outlined" size="small" style={{ minWidth: 110, marginLeft: 'auto' }}>
            <InputLabel>{i18n.t("todoList.priority")}</InputLabel>
            <Select value={priorityFilter} onChange={(e) => setPriorityFilter(e.target.value)} label={i18n.t("todoList.priority")}>
              <MenuItem value="all">{i18n.t("todoList.allPriorities")}</MenuItem>
              {PRIORITY_KEYS.map(k => <MenuItem key={k} value={k}>{i18n.t(`todoList.priorities.${k}`)}</MenuItem>)}
            </Select>
          </FormControl>
          {isAdmin && (
            <FormControl variant="outlined" size="small" style={{ minWidth: 140 }}>
              <InputLabel>{i18n.t("todoList.user")}</InputLabel>
              <Select value={userFilter} onChange={(e) => setUserFilter(e.target.value)} label={i18n.t("todoList.user")}>
                <MenuItem value="all">{i18n.t("todoList.allUsers")}</MenuItem>
                {users.map(u => <MenuItem key={u.id} value={u.id}>{u.name}</MenuItem>)}
              </Select>
            </FormControl>
          )}
          <FormControl variant="outlined" size="small" style={{ minWidth: 130 }}>
            <InputLabel>{i18n.t("todoList.sortBy")}</InputLabel>
            <Select value={sortBy} onChange={(e) => setSortBy(e.target.value)} label={i18n.t("todoList.sortBy")}>
              <MenuItem value="createdAt">{i18n.t("todoList.sortCreatedAt")}</MenuItem>
              <MenuItem value="priority">{i18n.t("todoList.sortPriority")}</MenuItem>
              <MenuItem value="dueDate">{i18n.t("todoList.sortDueDate")}</MenuItem>
              <MenuItem value="manual">{i18n.t("todoList.sortManual")}</MenuItem>
            </Select>
          </FormControl>
          <TextField
            placeholder={i18n.t("todoList.search")}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            variant="outlined"
            size="small"
            style={{ minWidth: 160 }}
            InputProps={{
              startAdornment: <InputAdornment position="start"><SearchIcon fontSize="small" /></InputAdornment>,
            }}
          />
        </div>

        {/* Task List */}
        {filtered.length === 0 ? (
          <div className={classes.emptyState}>
            <EmptyIcon style={{ fontSize: 64, opacity: 0.3 }} />
            <Typography variant="h6" style={{ marginTop: 8, opacity: 0.5 }}>
              {tasks.length === 0 ? i18n.t("todoList.emptyNoTasks") : i18n.t("todoList.emptyFiltered")}
            </Typography>
            <Typography variant="body2" style={{ opacity: 0.4 }}>
              {tasks.length === 0 ? i18n.t("todoList.emptyAddFirst") : i18n.t("todoList.emptyAdjustFilters")}
            </Typography>
          </div>
        ) : (
          <DragDropContext onDragEnd={handleDragEnd}>
            <Droppable droppableId="todolist" isDropDisabled={sortBy !== 'manual'}>
              {(provided) => (
                <List disablePadding ref={provided.innerRef} {...provided.droppableProps}>
                  {filtered.map((task, index) => {
                    const progress = getSubtaskProgress(task);
                    const isExpanded = expandedTask === task.id;
                    const isNotesExpanded = expandedNotes === task.id;
                    return (
                    <Draggable key={task.id} draggableId={String(task.id)} index={index} isDragDisabled={sortBy !== 'manual'}>
                      {(provided, snapshot) => (
                        <div
                          ref={provided.innerRef}
                          {...provided.draggableProps}
                        >
                          <Paper
                            className={`${classes.taskCard} ${snapshot.isDragging ? classes.taskCardDragging : ''}`}
                            elevation={snapshot.isDragging ? 4 : 0}
                          >
                            <ListItem disableGutters style={{ padding: 0 }}>
                              {sortBy === 'manual' && (
                                <span className={classes.dragHandle} {...provided.dragHandleProps}>
                                  <DragIcon fontSize="small" />
                                </span>
                              )}
                              {sortBy !== 'manual' && <span {...provided.dragHandleProps} style={{ display: 'none' }} />}

                              {/* Status select inline */}
                              <FormControl size="small" style={{ minWidth: 32, marginRight: 4 }}>
                                <Select
                                  value={task.status}
                                  onChange={(e) => handleStatusChange(task.id, e.target.value)}
                                  disableUnderline
                                  renderValue={(val) => (
                                    <span style={{
                                      display: 'inline-block',
                                      width: 14, height: 14,
                                      borderRadius: '50%',
                                      backgroundColor: STATUS_COLORS[val] || '#94a3b8',
                                      border: val === 'done' ? '2px solid #16a34a' : '2px solid transparent',
                                    }} />
                                  )}
                                  style={{ minWidth: 32 }}
                                >
                                  {STATUS_KEYS.map(k => (
                                    <MenuItem key={k} value={k}>
                                      <span style={{ color: STATUS_COLORS[k], fontWeight: 600 }}>●</span>&nbsp;{i18n.t(`todoList.statuses.${k}`)}
                                    </MenuItem>
                                  ))}
                                </Select>
                              </FormControl>

                              <ListItemText
                                primary={
                                  <Box display="flex" flexDirection="column" style={{ gap: 4 }}>
                                    <span
                                      className={task.status === 'done' ? classes.completedText : ''}
                                      style={{
                                        display: 'block',
                                        overflow: 'hidden',
                                        textOverflow: 'ellipsis',
                                        whiteSpace: 'nowrap',
                                        maxWidth: '100%',
                                        fontWeight: 500,
                                      }}
                                    >
                                      {task.text}
                                    </span>
                                    <Box display="flex" alignItems="center" flexWrap="wrap" style={{ gap: 4 }}>
                                      <Chip
                                        className={classes.priorityChip}
                                        label={i18n.t(`todoList.priorities.${task.priority}`)}
                                        style={{ backgroundColor: PRIORITY_COLORS[task.priority], color: '#fff' }}
                                        size="small"
                                      />
                                      <Chip
                                        className={classes.statusChip}
                                        label={i18n.t(`todoList.statuses.${task.status}`) || i18n.t("todoList.statuses.pending")}
                                        style={{ backgroundColor: STATUS_COLORS[task.status] || '#94a3b8', color: '#fff' }}
                                        size="small"
                                      />
                                      <Chip
                                        className={classes.categoryChip}
                                        label={i18n.t(`todoList.categories.${task.category}`) || task.category}
                                        variant="outlined"
                                        size="small"
                                      />
                                      {task.assignedTo && (
                                        <Tooltip title={`${i18n.t("todoList.assignedTo")} ${task.assignedTo.name}`}>
                                          <Chip
                                            className={classes.assignedChip}
                                            icon={<PersonIcon style={{ fontSize: 14 }} />}
                                            label={task.assignedTo.name}
                                            variant="outlined"
                                            size="small"
                                            color="primary"
                                          />
                                        </Tooltip>
                                      )}
                                    </Box>
                                  </Box>
                                }
                                secondary={
                                  <Box display="flex" alignItems="center" flexWrap="wrap" style={{ gap: 8, marginTop: 2 }}>
                                    <span style={{ fontSize: '0.75rem' }}>
                                      {new Date(task.createdAt).toLocaleDateString('pt-BR')}
                                    </span>
                                    {task.dueDate && (
                                      <span className={`${classes.dueDateText} ${isOverdue(task.dueDate) && task.status !== 'done' ? classes.overdue : ''}`}>
                                        📅 {new Date(task.dueDate + 'T00:00:00').toLocaleDateString('pt-BR')}
                                        {isOverdue(task.dueDate) && task.status !== 'done' ? ` (${i18n.t("todoList.overdue")})` : ''}
                                      </span>
                                    )}
                                    {task.createdBy && task.assignedTo && task.createdBy.id !== task.assignedTo.id && (
                                      <span className={classes.createdByText}>
                                        {i18n.t("todoList.createdBy")} {task.createdBy.name}
                                      </span>
                                    )}
                                    {progress && (
                                      <Box display="flex" alignItems="center" style={{ gap: 4 }}>
                                        <LinearProgress
                                          variant="determinate"
                                          value={progress.percent}
                                          className={classes.subtaskProgress}
                                          color={progress.percent === 100 ? "primary" : "secondary"}
                                        />
                                        <span style={{ fontSize: '0.7rem', whiteSpace: 'nowrap' }}>
                                          {progress.done}/{progress.total}
                                        </span>
                                      </Box>
                                    )}
                                    <span
                                      className={classes.subtaskToggle}
                                      onClick={(e) => { e.stopPropagation(); setExpandedTask(isExpanded ? null : task.id); setNewSubtaskText(''); }}
                                    >
                                      {isExpanded ? <ExpandLessIcon style={{ fontSize: 16 }} /> : <ExpandMoreIcon style={{ fontSize: 16 }} />}
                                      {i18n.t("todoList.subtasks")}
                                    </span>
                                    {task.notes && (
                                      <span
                                        className={classes.subtaskToggle}
                                        onClick={(e) => { e.stopPropagation(); setExpandedNotes(isNotesExpanded ? null : task.id); }}
                                      >
                                        <NoteIcon style={{ fontSize: 14 }} />
                                        {i18n.t("todoList.notesLabel")}
                                      </span>
                                    )}
                                  </Box>
                                }
                              />
                              <ListItemSecondaryAction>
                                <IconButton size="small" onClick={() => handleEdit(task)}>
                                  <EditIcon fontSize="small" />
                                </IconButton>
                                <IconButton size="small" onClick={() => setDeleteDialog({ open: true, id: task.id })}>
                                  <DeleteIcon fontSize="small" />
                                </IconButton>
                              </ListItemSecondaryAction>
                            </ListItem>

                            {/* Notes */}
                            <Collapse in={isNotesExpanded}>
                              <div className={classes.notesSection}>
                                {task.notes}
                              </div>
                            </Collapse>

                            {/* Subtasks */}
                            <Collapse in={isExpanded}>
                              <div className={classes.subtaskSection}>
                                {(task.subtasks || []).map(sub => (
                                  <div key={sub.id} className={classes.subtaskItem}>
                                    <Checkbox
                                      checked={sub.completed}
                                      onChange={() => handleToggleSubtask(task.id, sub.id)}
                                      size="small"
                                      color="primary"
                                      style={{ padding: 2 }}
                                    />
                                    {editingSubtask && editingSubtask.taskId === task.id && editingSubtask.subtaskId === sub.id ? (
                                      <TextField
                                        value={editSubtaskText}
                                        onChange={(e) => setEditSubtaskText(e.target.value)}
                                        onKeyDown={(e) => {
                                          if (e.key === 'Enter') handleEditSubtask(task.id, sub.id, editSubtaskText);
                                          if (e.key === 'Escape') { setEditingSubtask(null); setEditSubtaskText(''); }
                                        }}
                                        onBlur={() => { handleEditSubtask(task.id, sub.id, editSubtaskText); }}
                                        variant="standard"
                                        size="small"
                                        autoFocus
                                        InputProps={{ style: { fontSize: '0.85rem' } }}
                                        style={{ flex: 1 }}
                                      />
                                    ) : (
                                      <span
                                        className={`${classes.subtaskText} ${sub.completed ? classes.subtaskCompleted : ''}`}
                                        onClick={() => { setEditingSubtask({ taskId: task.id, subtaskId: sub.id }); setEditSubtaskText(sub.text); }}
                                        style={{ cursor: 'pointer' }}
                                      >
                                        {sub.text}
                                      </span>
                                    )}
                                    <IconButton size="small" onClick={() => handleDeleteSubtask(task.id, sub.id)} style={{ padding: 2 }}>
                                      <CloseIcon style={{ fontSize: 14 }} />
                                    </IconButton>
                                  </div>
                                ))}
                                <div className={classes.subtaskAddRow}>
                                  <TextField
                                    placeholder={i18n.t("todoList.newSubtask")}
                                    value={newSubtaskText}
                                    onChange={(e) => setNewSubtaskText(e.target.value)}
                                    onKeyDown={(e) => e.key === 'Enter' && handleAddSubtask(task.id)}
                                    variant="outlined"
                                    size="small"
                                    style={{ flex: 1 }}
                                    InputProps={{ style: { fontSize: '0.85rem', height: 32 } }}
                                  />
                                  <IconButton size="small" color="primary" onClick={() => handleAddSubtask(task.id)}>
                                    <AddIcon fontSize="small" />
                                  </IconButton>
                                </div>
                              </div>
                            </Collapse>
                          </Paper>
                        </div>
                      )}
                    </Draggable>
                  );
                  })}
                  {provided.placeholder}
                </List>
              )}
            </Droppable>
          </DragDropContext>
        )}

        {/* Delete confirmation */}
        <Dialog open={deleteDialog.open} onClose={() => setDeleteDialog({ open: false, id: null })}>
          <DialogTitle>{i18n.t("todoList.deleteTitle")}</DialogTitle>
          <DialogContent>
            <DialogContentText>{i18n.t("todoList.deleteMessage")}</DialogContentText>
          </DialogContent>
          <DialogActions>
            <Button onClick={() => setDeleteDialog({ open: false, id: null })}>{i18n.t("todoList.cancel")}</Button>
            <Button onClick={handleDelete} color="secondary" variant="contained">{i18n.t("todoList.deleteConfirm")}</Button>
          </DialogActions>
        </Dialog>
      </div>
    </div>
  );
};

export default ToDoList;
