import React, { useEffect, useState, useRef } from "react";
import Button from "@material-ui/core/Button";
import TextField from "@material-ui/core/TextField";
import Dialog from "@material-ui/core/Dialog";
import DialogActions from "@material-ui/core/DialogActions";
import DialogContent from "@material-ui/core/DialogContent";
import DialogTitle from "@material-ui/core/DialogTitle";
import Typography from "@material-ui/core/Typography";
import Autocomplete from "@material-ui/lab/Autocomplete";
import { i18n } from "../../translate/i18n";
import api from "../../services/api";

const FlowBuilderExitModal = ({ open, onSave, data, onUpdate, close }) => {
  const isMounted = useRef(true);

  const [farewellMessage, setFarewellMessage] = useState(
    i18n.t("flowBuilderConfigPage.exitDefaultFarewell")
  );
  // Palavras que encerram o atendimento a qualquer momento do fluxo, sem
  // precisar chegar até este nó pelas conexões. Guardadas como texto
  // separado por vírgula na tela e convertidas em lista ao salvar.
  const [exitKeywords, setExitKeywords] = useState("");
  // Etapa do Kanban para onde o card vai ao encerrar (ex.: "Perdido").
  // Opcional: sem etapa escolhida, o card fica onde estava.
  const [selectedLane, setSelectedLane] = useState(null);
  const [availableLanes, setAvailableLanes] = useState([]);

  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (open !== "edit" && open !== "create") return;

    (async () => {
      let lanes = [];
      try {
        // As colunas do Kanban são Tags com kanban=1 — mesma origem usada
        // pelo quadro e pelo nó de Kanban do fluxo.
        const { data: tagsResult } = await api.get("/tag/kanban");
        lanes = (tagsResult?.lista || tagsResult || []).map(t => ({
          id: t.id,
          name: t.name,
          color: t.color
        }));
      } catch (err) {
        // Não bloqueia a edição do nó: sem a lista, o campo fica vazio e os
        // outros ajustes continuam funcionando.
        lanes = [];
      }

      if (!isMounted.current) return;
      setAvailableLanes(lanes);

      if (open === "edit" && data?.data) {
        setFarewellMessage(
          data.data.farewellMessage ?? i18n.t("flowBuilderConfigPage.exitDefaultFarewell")
        );
        setExitKeywords(
          Array.isArray(data.data.exitKeywords)
            ? data.data.exitKeywords.join(", ")
            : data.data.exitKeywords || ""
        );
        const atual = lanes.find(l => String(l.id) === String(data.data.kanbanTagId));
        setSelectedLane(atual || null);
      } else if (open === "create") {
        setFarewellMessage(i18n.t("flowBuilderConfigPage.exitDefaultFarewell"));
        setExitKeywords("");
        setSelectedLane(null);
      }
    })();
  }, [open, data]);

  const handleClose = () => close(null);

  const handleSave = () => {
    const payload = {
      farewellMessage: farewellMessage || "",
      exitKeywords: String(exitKeywords || "")
        .split(",")
        .map(p => p.trim())
        .filter(Boolean),
      // null = não mexer no Kanban ao encerrar (comportamento de quem não
      // configurar nada).
      kanbanTagId: selectedLane ? selectedLane.id : null,
      kanbanTagName: selectedLane ? selectedLane.name : null
    };
    if (open === "edit") {
      onUpdate({ ...data, data: payload });
    } else {
      onSave(payload);
    }
    close(null);
  };

  return (
    <Dialog open={open === "create" || open === "edit"} onClose={handleClose} fullWidth maxWidth="sm">
      <DialogTitle>{i18n.t("flowBuilderConfigPage.exitModalTitle")}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" style={{ marginBottom: 12, color: "#666" }}>
          {i18n.t("flowBuilderConfigPage.exitModalBody")}
        </Typography>
        <TextField
          fullWidth
          multiline
          rows={3}
          label={i18n.t("flowBuilderConfigPage.exitModalFarewellLabel")}
          value={farewellMessage}
          onChange={(e) => setFarewellMessage(e.target.value)}
          variant="outlined"
          size="small"
        />
        <TextField
          fullWidth
          style={{ marginTop: 16 }}
          label={i18n.t("flowBuilderConfigPage.exitModalKeywordsLabel")}
          placeholder={i18n.t("flowBuilderConfigPage.exitModalKeywordsPlaceholder")}
          value={exitKeywords}
          onChange={(e) => setExitKeywords(e.target.value)}
          variant="outlined"
          size="small"
          helperText={i18n.t("flowBuilderConfigPage.exitModalKeywordsHelp")}
        />
        <Autocomplete
          style={{ marginTop: 16 }}
          options={availableLanes}
          getOptionLabel={option => option.name || ""}
          getOptionSelected={(option, value) => String(option.id) === String(value?.id)}
          value={selectedLane}
          onChange={(_, novaLane) => setSelectedLane(novaLane)}
          renderInput={params => (
            <TextField
              {...params}
              label={i18n.t("flowBuilderConfigPage.exitModalLaneLabel")}
              placeholder={i18n.t("flowBuilderConfigPage.exitModalLanePlaceholder")}
              variant="outlined"
              size="small"
              helperText={i18n.t("flowBuilderConfigPage.exitModalLaneHelp")}
            />
          )}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>{i18n.t("flowBuilderConfigPage.cancel")}</Button>
        <Button onClick={handleSave} color="primary" variant="contained">
          {i18n.t("flowBuilderConfigPage.save")}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default FlowBuilderExitModal;
