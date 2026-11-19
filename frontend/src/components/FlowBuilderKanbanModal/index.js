import React, { useState, useEffect, useRef } from "react";

import { toast } from "react-toastify";
import Button from "@material-ui/core/Button";
import Dialog from "@material-ui/core/Dialog";
import DialogActions from "@material-ui/core/DialogActions";
import DialogContent from "@material-ui/core/DialogContent";
import DialogTitle from "@material-ui/core/DialogTitle";
import Typography from "@material-ui/core/Typography";
import TextField from "@material-ui/core/TextField";
import Autocomplete from "@material-ui/lab/Autocomplete";
import CircularProgress from "@material-ui/core/CircularProgress";

import { i18n } from "../../translate/i18n";
import api from "../../services/api";
import toastError from "../../errors/toastError";

const FlowBuilderKanbanModal = ({ open, onSave, data, onUpdate, close }) => {
  const isMounted = useRef(true);

  const [activeModal, setActiveModal] = useState(false);
  const [selectedLane, setSelectedLane] = useState(null);
  const [availableLanes, setAvailableLanes] = useState([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (open !== "edit" && open !== "create") return;

    (async () => {
      setLoading(true);
      try {
        // As colunas do Kanban são Tags com kanban=1 — é assim que o quadro
        // é montado (ver pages/Kanban/index.js). Por isso a lista de etapas
        // vem de /tags/kanban, não de um endpoint próprio de kanban.
        const { data: tagsResult } = await api.get("/tag/kanban");
        if (!isMounted.current) return;

        const lanes = (tagsResult?.lista || tagsResult || []).map(t => ({
          id: t.id,
          name: t.name,
          color: t.color
        }));
        setAvailableLanes(lanes);

        if (open === "edit") {
          const nodeData = data?.data || {};
          const atual = lanes.find(l => String(l.id) === String(nodeData.tagId));
          setSelectedLane(atual || null);
        } else {
          setSelectedLane(null);
        }
        setActiveModal(true);
      } catch (err) {
        toastError(err);
      } finally {
        setLoading(false);
      }
    })();
  }, [open, data]);

  const handleClose = () => {
    close(null);
    setActiveModal(false);
  };

  const handleSave = () => {
    if (!selectedLane) {
      return toast.error(i18n.t("flowBuilderKanbanModal.selectLaneError"));
    }

    const payload = {
      tagId: selectedLane.id,
      // Guarda o nome junto pra o nó no canvas conseguir mostrar a etapa sem
      // ter que buscar na API a cada render.
      tagName: selectedLane.name
    };

    if (open === "edit") {
      onUpdate({ ...data, data: { ...data.data, ...payload } });
    } else if (open === "create") {
      onSave(payload);
    }
    handleClose();
  };

  return (
    <Dialog open={activeModal} onClose={handleClose} fullWidth maxWidth="sm" scroll="paper">
      <DialogTitle>
        {open === "create"
          ? i18n.t("flowBuilderKanbanModal.addTitle")
          : i18n.t("flowBuilderKanbanModal.editTitle")}
      </DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" color="textSecondary" style={{ marginBottom: 16 }}>
          {i18n.t("flowBuilderKanbanModal.description")}
        </Typography>

        <Typography variant="subtitle2" style={{ marginBottom: 8, fontWeight: 600 }}>
          {i18n.t("flowBuilderKanbanModal.laneLabel")}
        </Typography>

        <Autocomplete
          options={availableLanes}
          getOptionLabel={option => option.name || ""}
          getOptionSelected={(option, value) => option.id === value?.id}
          value={selectedLane}
          onChange={(e, value) => setSelectedLane(value)}
          loading={loading}
          noOptionsText={i18n.t("flowBuilderKanbanModal.noLanesAvailable")}
          renderOption={option => (
            <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <span
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: 3,
                  backgroundColor: option.color || "#0EA5E9",
                  display: "inline-block"
                }}
              />
              {option.name}
            </span>
          )}
          renderInput={params => (
            <TextField
              {...params}
              variant="outlined"
              placeholder={i18n.t("flowBuilderKanbanModal.lanePlaceholder")}
              InputProps={{
                ...params.InputProps,
                endAdornment: (
                  <>
                    {loading ? <CircularProgress size={18} /> : null}
                    {params.InputProps.endAdornment}
                  </>
                )
              }}
            />
          )}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} color="secondary" variant="outlined">
          {i18n.t("flowBuilderKanbanModal.cancel")}
        </Button>
        <Button onClick={handleSave} color="primary" variant="contained">
          {open === "create"
            ? i18n.t("flowBuilderKanbanModal.add")
            : i18n.t("flowBuilderKanbanModal.saveEdit")}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default FlowBuilderKanbanModal;
