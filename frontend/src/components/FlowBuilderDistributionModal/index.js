import React, { useState, useEffect, useRef } from "react";

import { toast } from "react-toastify";
import { makeStyles } from "@material-ui/core/styles";
import Button from "@material-ui/core/Button";
import Dialog from "@material-ui/core/Dialog";
import DialogActions from "@material-ui/core/DialogActions";
import DialogContent from "@material-ui/core/DialogContent";
import DialogTitle from "@material-ui/core/DialogTitle";
import Typography from "@material-ui/core/Typography";
import Chip from "@material-ui/core/Chip";
import Autocomplete from "@material-ui/lab/Autocomplete";
import TextField from "@material-ui/core/TextField";
import ToggleButton from "@material-ui/lab/ToggleButton";
import ToggleButtonGroup from "@material-ui/lab/ToggleButtonGroup";
import SyncAltIcon from "@material-ui/icons/SyncAlt";
import TrendingDownIcon from "@material-ui/icons/TrendingDown";

import { i18n } from "../../translate/i18n";
import api from "../../services/api";
import toastError from "../../errors/toastError";

const useStyles = makeStyles(theme => ({
  typeCards: {
    display: "flex",
    gap: 12,
    marginBottom: 20
  },
  typeCard: {
    flex: 1,
    border: "1px solid #e0e0e0",
    borderRadius: 8,
    padding: 12,
    cursor: "pointer",
    display: "flex",
    gap: 8,
    alignItems: "flex-start"
  },
  typeCardSelected: {
    border: "1px solid #3f51b5",
    backgroundColor: "rgba(63, 81, 181, 0.06)"
  },
  chipAvatar: {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    width: 22,
    height: 22,
    borderRadius: "50%",
    fontSize: 11,
    fontWeight: 700,
    color: "#fff",
    marginRight: 4
  }
}));

// Mesmas cores usadas nos avatares de contato/usuário do resto do sistema —
// só um jeito determinístico de colorir os chips de membro (nome -> cor
// estável), pra bater com o visual de referência (bolinha colorida + nome).
const AVATAR_COLORS = [
  "#f06292", "#ba68c8", "#7986cb", "#4fc3f7",
  "#4db6ac", "#81c784", "#ffb74d", "#ff8a65"
];
const colorForName = name => {
  const str = String(name || "");
  let hash = 0;
  for (let i = 0; i < str.length; i++) hash = str.charCodeAt(i) + ((hash << 5) - hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
};
const initialsOf = name => {
  const parts = String(name || "").trim().split(/\s+/);
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[1][0]).toUpperCase();
};

const FlowBuilderDistributionModal = ({ open, onSave, data, onUpdate, close }) => {
  const classes = useStyles();
  const isMounted = useRef(true);

  const [activeModal, setActiveModal] = useState(false);
  const [distributionType, setDistributionType] = useState("roundRobin");
  const [memberType, setMemberType] = useState("user");
  const [selectedMembers, setSelectedMembers] = useState([]);
  const [availableUsers, setAvailableUsers] = useState([]);
  const [availableQueues, setAvailableQueues] = useState([]);
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
        const [{ data: usersResult }, { data: queuesResult }] = await Promise.all([
          api.get("/users"),
          api.get("/queue")
        ]);
        if (!isMounted.current) return;
        setAvailableUsers(usersResult.users || []);
        setAvailableQueues(queuesResult || []);

        if (open === "edit") {
          const nodeData = data?.data || {};
          setDistributionType(nodeData.distributionType === "leastBusy" ? "leastBusy" : "roundRobin");
          setMemberType(nodeData.memberType === "queue" ? "queue" : "user");
          setSelectedMembers(Array.isArray(nodeData.members) ? nodeData.members : []);
        } else {
          setDistributionType("roundRobin");
          setMemberType("user");
          setSelectedMembers([]);
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

  // Ao trocar entre Fila/Atendente, os membros já selecionados não fazem
  // mais sentido (são de outra lista) — limpa pra evitar salvar um id
  // ambíguo (mesmo número podendo ser tanto id de fila quanto de usuário).
  const handleMemberTypeChange = (event, value) => {
    if (!value) return;
    setMemberType(value);
    setSelectedMembers([]);
  };

  const optionsForCurrentType = (memberType === "queue" ? availableQueues : availableUsers).map(o => ({
    id: o.id,
    name: o.name
  }));

  const handleSave = () => {
    if (selectedMembers.length === 0) {
      return toast.error(i18n.t("flowBuilderDistributionModal.selectMembersError"));
    }

    const payload = {
      distributionType,
      memberType,
      members: selectedMembers.map(m => ({ id: m.id, name: m.name })),
      lastAssignedIndex: -1
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
          ? i18n.t("flowBuilderDistributionModal.addTitle")
          : i18n.t("flowBuilderDistributionModal.editTitle")}
      </DialogTitle>
      <DialogContent dividers>
        <Typography variant="subtitle2" style={{ marginBottom: 8, fontWeight: 600 }}>
          {i18n.t("flowBuilderDistributionModal.distributionTypeLabel")}
        </Typography>
        <div className={classes.typeCards}>
          <div
            className={`${classes.typeCard} ${distributionType === "roundRobin" ? classes.typeCardSelected : ""}`}
            onClick={() => setDistributionType("roundRobin")}
          >
            <SyncAltIcon color="primary" fontSize="small" style={{ marginTop: 2 }} />
            <div>
              <Typography variant="body2" style={{ fontWeight: 600 }}>
                {i18n.t("flowBuilderDistributionModal.roundRobinTitle")}
              </Typography>
              <Typography variant="caption" color="textSecondary">
                {i18n.t("flowBuilderDistributionModal.roundRobinDesc")}
              </Typography>
            </div>
          </div>
          <div
            className={`${classes.typeCard} ${distributionType === "leastBusy" ? classes.typeCardSelected : ""}`}
            onClick={() => setDistributionType("leastBusy")}
          >
            <TrendingDownIcon color="primary" fontSize="small" style={{ marginTop: 2 }} />
            <div>
              <Typography variant="body2" style={{ fontWeight: 600 }}>
                {i18n.t("flowBuilderDistributionModal.leastBusyTitle")}
              </Typography>
              <Typography variant="caption" color="textSecondary">
                {i18n.t("flowBuilderDistributionModal.leastBusyDesc")}
              </Typography>
            </div>
          </div>
        </div>

        <Typography variant="subtitle2" style={{ marginBottom: 8, fontWeight: 600 }}>
          {i18n.t("flowBuilderDistributionModal.memberTypeLabel")}
        </Typography>
        <ToggleButtonGroup
          value={memberType}
          exclusive
          onChange={handleMemberTypeChange}
          size="small"
          style={{ marginBottom: 16 }}
        >
          <ToggleButton value="user">{i18n.t("flowBuilderDistributionModal.memberTypeUser")}</ToggleButton>
          <ToggleButton value="queue">{i18n.t("flowBuilderDistributionModal.memberTypeQueue")}</ToggleButton>
        </ToggleButtonGroup>

        <Typography variant="subtitle2" style={{ marginBottom: 8, fontWeight: 600 }}>
          {i18n.t("flowBuilderDistributionModal.membersLabel", { count: selectedMembers.length })}
        </Typography>
        <Autocomplete
          multiple
          loading={loading}
          options={optionsForCurrentType}
          value={selectedMembers}
          getOptionLabel={option => option.name || ""}
          getOptionSelected={(option, value) => option.id === value.id}
          onChange={(event, value) => setSelectedMembers(value)}
          renderTags={(value, getTagProps) =>
            value.map((option, index) => (
              <Chip
                {...getTagProps({ index })}
                key={option.id}
                label={
                  <span>
                    <span
                      className={classes.chipAvatar}
                      style={{ backgroundColor: colorForName(option.name) }}
                    >
                      {initialsOf(option.name)}
                    </span>
                    {option.name}
                  </span>
                }
              />
            ))
          }
          renderInput={params => (
            <TextField
              {...params}
              variant="outlined"
              size="small"
              placeholder={i18n.t("flowBuilderDistributionModal.membersPlaceholder")}
            />
          )}
        />
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose} color="secondary" variant="outlined">
          {i18n.t("contactModal.buttons.cancel")}
        </Button>
        <Button onClick={handleSave} color="primary" variant="contained">
          {open === "create" ? i18n.t("flowBuilderDistributionModal.add") : i18n.t("flowBuilderDistributionModal.saveEdit")}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default FlowBuilderDistributionModal;
