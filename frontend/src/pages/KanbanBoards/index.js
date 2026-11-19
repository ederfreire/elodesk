import React, { useCallback, useContext, useEffect, useState } from "react";
import { useHistory } from "react-router-dom";
import { makeStyles } from "@material-ui/core/styles";
import { Button, Paper, Table, TableBody, TableCell, TableHead, TableRow, IconButton, Tooltip, Chip, Dialog, DialogTitle, DialogContent, DialogActions, TextField, FormControlLabel, Switch, CircularProgress } from "@material-ui/core";
import EditIcon from "@material-ui/icons/Edit";
import DeleteIcon from "@material-ui/icons/Delete";
import StarIcon from "@material-ui/icons/Star";
import StarBorderIcon from "@material-ui/icons/StarBorder";
import ViewKanbanIcon from "@material-ui/icons/ViewColumn";
import VisibilityIcon from "@material-ui/icons/Visibility";
import ArrowBackIcon from "@material-ui/icons/ArrowBack";
import { toast } from "react-toastify";

import Checkbox from "@material-ui/core/Checkbox";

import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import MainHeaderButtonsWrapper from "../../components/MainHeaderButtonsWrapper";
import Title from "../../components/Title";
import ConfirmationModal from "../../components/ConfirmationModal";
import { AuthContext } from "../../context/Auth/AuthContext";
import { i18n } from "../../translate/i18n";
import api from "../../services/api";

import {
  listBoards,
  listTemplates,
  createBoard,
  updateBoard,
  deleteBoard,
  setDefaultBoard,
} from "../../services/kanbanBoardsService";

const useStyles = makeStyles((theme) => ({
  mainPaper: {
    flex: 1,
    padding: theme.spacing(2),
    overflowY: "auto",
    ...theme.scrollbarStyles,
    borderRadius: 10,
  },
  colorDot: {
    display: "inline-block",
    width: 14,
    height: 14,
    borderRadius: "50%",
    marginRight: 8,
    verticalAlign: "middle",
    border: "1px solid #ddd",
  },
  empty: {
    textAlign: "center",
    padding: theme.spacing(6),
    color: theme.palette.text.secondary,
  },
  loading: { textAlign: "center", padding: theme.spacing(6) },
  templateCard: {
    cursor: "pointer",
    border: "2px solid transparent",
    borderRadius: 8,
    padding: theme.spacing(1.5),
    marginBottom: theme.spacing(1),
    transition: "all .15s",
    "&:hover": { borderColor: theme.palette.primary.light, background: "rgba(0,0,0,0.02)" },
  },
  templateCardActive: {
    borderColor: theme.palette.primary.main,
    background: "rgba(78, 147, 255, 0.08)",
  },
  colorInput: { width: 50, height: 40, padding: 0, border: "none", background: "transparent", cursor: "pointer" },
}));

const PRESET_COLORS = ["#3B82F6", "#10B981", "#F59E0B", "#EF4444", "#A855F7", "#EC4899", "#14B8A6", "#6366F1", "#64748B"];

const emptyForm = {
  id: null,
  name: "",
  description: "",
  color: "#3B82F6",
  icon: "Board",
  isShared: false,
  templateKey: "",
  tagIds: [],
};

const KanbanBoards = () => {
  const classes = useStyles();
  const history = useHistory();
  const { user } = useContext(AuthContext);
  const isAdmin = user?.profile === "admin";

  const [loading, setLoading] = useState(true);
  const [boards, setBoards] = useState([]);
  const [templates, setTemplates] = useState([]);
  const [showAll, setShowAll] = useState(false);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  // Colunas (Tags kanban=1) já existentes na empresa, pra marcar quais
  // pertencem a este board — antes disso, um board só ganhava colunas na
  // criação (via template) e não tinha NENHUMA forma de editar depois, o
  // que deixava boards criados "em branco" presos sem colunas pra sempre.
  const [availableTags, setAvailableTags] = useState([]);
  const [loadingTags, setLoadingTags] = useState(false);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [boardToDelete, setBoardToDelete] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [b, t] = await Promise.all([listBoards(isAdmin && showAll), listTemplates()]);
      setBoards(Array.isArray(b) ? b : []);
      setTemplates(Array.isArray(t) ? t : []);
    } catch (err) {
      console.error(err);
      toast.error(i18n.t("kanbanBoards.toasts.loadError"));
    } finally {
      setLoading(false);
    }
  }, [isAdmin, showAll]);

  useEffect(() => { load(); }, [load]);

  const loadAvailableTags = useCallback(async () => {
    setLoadingTags(true);
    try {
      const { data } = await api.get("/tag/kanban");
      setAvailableTags(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error(err);
    } finally {
      setLoadingTags(false);
    }
  }, []);

  const openCreate = () => {
    setForm(emptyForm);
    loadAvailableTags();
    setDialogOpen(true);
  };
  const openEdit = (board) => {
    setForm({
      id: board.id,
      name: board.name || "",
      description: board.description || "",
      color: board.color || "#3B82F6",
      icon: board.icon || "Board",
      isShared: !!board.isShared,
      templateKey: "",
      tagIds: (Array.isArray(board.tagIds) ? board.tagIds : []).map(Number),
    });
    loadAvailableTags();
    setDialogOpen(true);
  };

  const toggleTagId = (tagId) => {
    setForm((prev) => {
      const has = prev.tagIds.includes(tagId);
      return {
        ...prev,
        tagIds: has ? prev.tagIds.filter((id) => id !== tagId) : [...prev.tagIds, tagId],
      };
    });
  };

  const handleSave = async () => {
    if (!form.name.trim()) { toast.warn(i18n.t("kanbanBoards.toasts.nameRequired")); return; }
    setSaving(true);
    try {
      if (form.id) {
        await updateBoard(form.id, {
          name: form.name,
          description: form.description,
          color: form.color,
          icon: form.icon,
          isShared: form.isShared,
          // Antes, editar um board NUNCA enviava tagIds (o diálogo de edição
          // não tinha nenhum campo pra isso) — era essa a causa de "criei um
          // board e não consigo editar as colunas dele depois".
          tagIds: form.tagIds,
        });
        toast.success(i18n.t("kanbanBoards.toasts.updated"));
      } else {
        await createBoard({
          name: form.name,
          description: form.description,
          color: form.color,
          icon: form.icon,
          isShared: form.isShared,
          templateKey: form.templateKey || undefined,
          // Colunas existentes marcadas manualmente — só enviado quando NÃO
          // há template escolhido, porque createBoard (KanbanBoardService.ts)
          // ignora tagIds e substitui pelas colunas do template nesse caso.
          tagIds: form.templateKey ? undefined : form.tagIds,
        });
        toast.success(i18n.t("kanbanBoards.toasts.created"));
      }
      setDialogOpen(false);
      await load();
    } catch (err) {
      console.error(err);
      toast.error(err?.response?.data?.error || i18n.t("kanbanBoards.toasts.saveError"));
    } finally {
      setSaving(false);
    }
  };

  const handleToggleDefault = async (board) => {
    try {
      await setDefaultBoard(board.id);
      toast.success(board.isDefault
        ? i18n.t("kanbanBoards.toasts.defaultRemoved")
        : i18n.t("kanbanBoards.toasts.defaultSet"));
      await load();
    } catch (err) {
      toast.error(i18n.t("kanbanBoards.toasts.defaultError"));
    }
  };

  const askDelete = (board) => { setBoardToDelete(board); setConfirmOpen(true); };
  const confirmDelete = async () => {
    if (!boardToDelete) return;
    try {
      await deleteBoard(boardToDelete.id);
      toast.success(i18n.t("kanbanBoards.toasts.deleted"));
      setConfirmOpen(false);
      setBoardToDelete(null);
      await load();
    } catch (err) {
      toast.error(i18n.t("kanbanBoards.toasts.deleteError"));
    }
  };

  const openInKanban = (board) => {
    localStorage.setItem("kanbanActiveBoardId", String(board.id));
    history.push("/kanban");
  };

  return (
    <MainContainer>
      <MainHeader>
        <Title>{i18n.t("kanbanBoards.title")}</Title>
        <MainHeaderButtonsWrapper>
          <Button
            variant="outlined"
            startIcon={<ArrowBackIcon />}
            onClick={() => history.push("/kanban")}
            style={{ marginRight: 8 }}
          >
            {i18n.t("kanbanBoards.buttons.backToKanban")}
          </Button>
          {isAdmin && (
            <FormControlLabel
              control={
                <Switch
                  checked={showAll}
                  onChange={(e) => setShowAll(e.target.checked)}
                  color="primary"
                  size="small"
                />
              }
              label={showAll
                ? i18n.t("kanbanBoards.filters.allBoards")
                : i18n.t("kanbanBoards.filters.myBoards")}
              style={{ marginRight: 8 }}
            />
          )}
          <Button variant="contained" color="primary" onClick={openCreate}>
            {i18n.t("kanbanBoards.buttons.newBoard")}
          </Button>
        </MainHeaderButtonsWrapper>
      </MainHeader>

      <Paper variant="outlined" className={classes.mainPaper}>
        {loading ? (
          <div className={classes.loading}><CircularProgress /></div>
        ) : boards.length === 0 ? (
          <div className={classes.empty}>
            <ViewKanbanIcon style={{ fontSize: 48, opacity: 0.4 }} />
            <p
              dangerouslySetInnerHTML={{ __html: i18n.t("kanbanBoards.emptyState") }}
            />
          </div>
        ) : (
          <Table size="small">
            <TableHead>
              <TableRow>
                <TableCell></TableCell>
                <TableCell>{i18n.t("kanbanBoards.table.name")}</TableCell>
                <TableCell>{i18n.t("kanbanBoards.table.description")}</TableCell>
                <TableCell>{i18n.t("kanbanBoards.table.columns")}</TableCell>
                <TableCell align="center">{i18n.t("kanbanBoards.table.visibility")}</TableCell>
                {isAdmin && showAll && <TableCell>{i18n.t("kanbanBoards.table.owner")}</TableCell>}
                <TableCell align="center">{i18n.t("kanbanBoards.table.default")}</TableCell>
                <TableCell align="right">{i18n.t("kanbanBoards.table.actions")}</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {boards.map((b) => (
                <TableRow key={b.id} hover>
                  <TableCell><span className={classes.colorDot} style={{ background: b.color || "#999" }} /></TableCell>
                  <TableCell><b>{b.name}</b></TableCell>
                  <TableCell>{b.description}</TableCell>
                  <TableCell>{Array.isArray(b.tagIds) ? b.tagIds.length : 0}</TableCell>
                  <TableCell align="center">
                    <Chip
                      size="small"
                      label={b.isShared
                        ? i18n.t("kanbanBoards.visibility.shared")
                        : i18n.t("kanbanBoards.visibility.private")}
                      color={b.isShared ? "primary" : "default"}
                    />
                  </TableCell>
                  {isAdmin && showAll && (
                    <TableCell>{b.user?.name || `${i18n.t("kanbanBoards.table.user")} ${b.userId}`}</TableCell>
                  )}
                  <TableCell align="center">
                    <Tooltip title={b.isDefault
                      ? i18n.t("kanbanBoards.actions.removeDefault")
                      : i18n.t("kanbanBoards.actions.setDefault")}>
                      <IconButton size="small" onClick={() => handleToggleDefault(b)}>
                        {b.isDefault ? <StarIcon style={{ color: "#F59E0B" }} /> : <StarBorderIcon />}
                      </IconButton>
                    </Tooltip>
                  </TableCell>
                  <TableCell align="right">
                    <Tooltip title={i18n.t("kanbanBoards.actions.openInKanban")}>
                      <IconButton size="small" onClick={() => openInKanban(b)}><VisibilityIcon fontSize="small" /></IconButton>
                    </Tooltip>
                    <Tooltip title={i18n.t("kanbanBoards.actions.edit")}>
                      <IconButton size="small" onClick={() => openEdit(b)}><EditIcon fontSize="small" /></IconButton>
                    </Tooltip>
                    <Tooltip title={i18n.t("kanbanBoards.actions.delete")}>
                      <IconButton size="small" onClick={() => askDelete(b)}><DeleteIcon fontSize="small" /></IconButton>
                    </Tooltip>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </Paper>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{form.id
          ? i18n.t("kanbanBoards.dialog.editTitle")
          : i18n.t("kanbanBoards.dialog.newTitle")}</DialogTitle>
        <DialogContent dividers>
          <TextField
            label={i18n.t("kanbanBoards.dialog.nameLabel")}
            fullWidth
            variant="outlined"
            size="small"
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
            style={{ marginBottom: 12 }}
            autoFocus
          />
          <TextField
            label={i18n.t("kanbanBoards.dialog.descriptionLabel")}
            fullWidth
            variant="outlined"
            size="small"
            multiline
            minRows={2}
            value={form.description}
            onChange={(e) => setForm({ ...form, description: e.target.value })}
            style={{ marginBottom: 12 }}
          />

          <div style={{ display: "flex", alignItems: "center", gap: 16, marginBottom: 12 }}>
            <span style={{ fontSize: 13, fontWeight: 500 }}>{i18n.t("kanbanBoards.dialog.color")}</span>
            {PRESET_COLORS.map((c) => (
              <span
                key={c}
                onClick={() => setForm({ ...form, color: c })}
                style={{
                  display: "inline-block",
                  width: 24, height: 24, borderRadius: "50%",
                  background: c, cursor: "pointer",
                  border: form.color === c ? "3px solid #000" : "2px solid #ddd",
                }}
              />
            ))}
            <input
              type="color"
              value={form.color}
              onChange={(e) => setForm({ ...form, color: e.target.value })}
              className={classes.colorInput}
            />
          </div>

          <div style={{ marginTop: 8 }}>
            <FormControlLabel
              control={
                <Switch
                  checked={form.isShared}
                  onChange={(e) => setForm({ ...form, isShared: e.target.checked })}
                  color="primary"
                />
              }
              label={i18n.t("kanbanBoards.dialog.shareWithCompany")}
            />
            <div style={{ fontSize: 12, color: "#666", marginLeft: 48, marginTop: -4, lineHeight: 1.4 }}>
              <span
                dangerouslySetInnerHTML={{
                  __html: form.isShared
                    ? i18n.t("kanbanBoards.dialog.sharedHelp")
                    : i18n.t("kanbanBoards.dialog.privateHelp"),
                }}
              />
            </div>
          </div>

          <div style={{ marginTop: 16, marginBottom: 8, fontWeight: 500 }}>
            {i18n.t("kanbanBoards.dialog.columns", "Colunas deste quadro")}
          </div>
          {loadingTags ? (
            <div style={{ padding: 8 }}><CircularProgress size={18} /></div>
          ) : availableTags.length === 0 ? (
            <div style={{ fontSize: 12, color: "#666", marginBottom: 8 }}>
              {i18n.t(
                "kanbanBoards.dialog.noColumnsYet",
                "Nenhuma coluna cadastrada ainda — crie uma pela tela do Kanban (\"+ Adicionar colunas\") depois de salvar este quadro."
              )}
            </div>
          ) : (
            <div style={{ marginBottom: 8, maxHeight: 180, overflowY: "auto", border: "1px solid #eee", borderRadius: 6, padding: 4 }}>
              {!form.id && form.templateKey && (
                <div style={{ fontSize: 12, color: "#666", padding: "4px 8px" }}>
                  {i18n.t(
                    "kanbanBoards.dialog.columnsIgnoredWithTemplate",
                    "Um template foi escolhido abaixo — ele define as colunas deste quadro, a seleção aqui será ignorada."
                  )}
                </div>
              )}
              {availableTags.map((tag) => (
                <div key={tag.id} style={{ display: "flex", alignItems: "center" }}>
                  <Checkbox
                    size="small"
                    color="primary"
                    checked={form.tagIds.includes(tag.id)}
                    disabled={!form.id && !!form.templateKey}
                    onChange={() => toggleTagId(tag.id)}
                  />
                  <span className={classes.colorDot} style={{ background: tag.color || "#999" }} />
                  <span style={{ fontSize: 13 }}>{tag.name}</span>
                </div>
              ))}
            </div>
          )}

          {!form.id && (
            <>
              <div style={{ marginTop: 16, marginBottom: 8, fontWeight: 500 }}>
                {i18n.t("kanbanBoards.dialog.templateOptional")}
              </div>
              <div
                className={`${classes.templateCard} ${form.templateKey === "" ? classes.templateCardActive : ""}`}
                onClick={() => setForm({ ...form, templateKey: "" })}
              >
                <b>{i18n.t("kanbanBoards.dialog.blankTemplate")}</b>
                <div style={{ fontSize: 12, color: "#666" }}>
                  {i18n.t("kanbanBoards.dialog.blankTemplateDesc")}
                </div>
              </div>
              {templates.map((t) => (
                <div
                  key={t.key}
                  className={`${classes.templateCard} ${form.templateKey === t.key ? classes.templateCardActive : ""}`}
                  onClick={() => setForm({ ...form, templateKey: t.key, color: t.color, icon: t.icon })}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <span className={classes.colorDot} style={{ background: t.color }} />
                    <b>{i18n.t(`kanbanBoards.templates.${t.key}.name`, t.name)}</b>
                  </div>
                  <div style={{ fontSize: 12, color: "#666", marginTop: 4 }}>{i18n.t(`kanbanBoards.templates.${t.key}.description`, t.description)}</div>
                  <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 6 }}>
                    {t.columns.map((c, i) => (
                      <Chip
                        key={i}
                        size="small"
                        label={i18n.t(`kanbanBoards.templates.${t.key}.columns.${c.name}`, c.name)}
                        style={{ background: c.color, color: "#fff", fontSize: 11 }}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)} disabled={saving}>
            {i18n.t("kanbanBoards.dialog.cancel")}
          </Button>
          <Button onClick={handleSave} variant="contained" color="primary" disabled={saving}>
            {saving
              ? i18n.t("kanbanBoards.dialog.saving")
              : i18n.t("kanbanBoards.dialog.save")}
          </Button>
        </DialogActions>
      </Dialog>

      <ConfirmationModal
        title={i18n.t("kanbanBoards.confirmDelete.title")}
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={confirmDelete}
      >
        <span
          dangerouslySetInnerHTML={{
            __html: i18n.t("kanbanBoards.confirmDelete.message", {
              name: boardToDelete?.name || "",
            }),
          }}
        />
      </ConfirmationModal>
    </MainContainer>
  );
};

export default KanbanBoards;