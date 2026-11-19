import React, { useState, useEffect, useRef, useContext } from "react";
import { makeStyles } from "@material-ui/core/styles";
import Button from "@material-ui/core/Button";
import Dialog from "@material-ui/core/Dialog";
import DialogActions from "@material-ui/core/DialogActions";
import DialogContent from "@material-ui/core/DialogContent";
import DialogTitle from "@material-ui/core/DialogTitle";
import CircularProgress from "@material-ui/core/CircularProgress";
import {
  MenuItem,
  FormControl,
  InputLabel,
  Select,
  Typography,
  Box,
} from "@material-ui/core";
import SmartToy from "@mui/icons-material/SmartToy";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import { AuthContext } from "../../context/Auth/AuthContext";
import { i18n } from "../../translate/i18n";

const useStyles = makeStyles((theme) => ({
  root: {
    display: "flex",
    flexWrap: "wrap",
  },
  headerIcon: {
    width: 40,
    height: 40,
    borderRadius: "50%",
    backgroundColor: "#F97316",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
}));

const FlowBuilderAiAgentModal = ({ open, onSave, data, onUpdate, close }) => {
  const classes = useStyles();
  const isMounted = useRef(true);
  const { user } = useContext(AuthContext);

  const [agents, setAgents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedAgentId, setSelectedAgentId] = useState("");
  const [labels, setLabels] = useState({
    title: i18n.t("flowBuilderAiAgentModal.addTitle"),
    btn: i18n.t("flowBuilderAiAgentModal.add"),
  });

  useEffect(() => {
    const fetchAgents = async () => {
      try {
        setLoading(true);
        const companyId = user.companyId;
        const { data: response } = await api.get("/prompt", {
          params: { companyId },
        });
        setAgents((response.prompts || []).filter(a => a.active !== false));
      } catch (err) {
        toastError(err);
      } finally {
        setLoading(false);
      }
    };

    if (open) fetchAgents();
  }, [open, user]);

  useEffect(() => {
    if (open === "edit") {
      setLabels({ title: i18n.t("flowBuilderAiAgentModal.editTitle"), btn: i18n.t("flowBuilderAiAgentModal.save") });
      const agentData = data?.data || {};
      setSelectedAgentId(agentData.promptId || "");
    } else if (open === "create") {
      setLabels({ title: i18n.t("flowBuilderAiAgentModal.addTitle"), btn: i18n.t("flowBuilderAiAgentModal.add") });
      setSelectedAgentId("");
    }

    return () => {
      isMounted.current = false;
    };
  }, [open, data]);

  const handleClose = () => {
    close(null);
  };

  const handleSave = () => {
    if (!selectedAgentId) {
      toastError(i18n.t("flowBuilderAiAgentModal.selectAgent"));
      return;
    }

    const agent = agents.find(a => a.id === selectedAgentId);
    const saveData = {
      promptId: selectedAgentId,
      agentName: agent?.name || i18n.t("flowBuilderAiAgentModal.defaultAgentName"),
    };

    if (open === "edit") {
      onUpdate({
        ...data,
        data: saveData,
      });
    } else if (open === "create") {
      onSave(saveData);
    }
    handleClose();
  };

  const activeAgents = agents.length > 0 ? agents : [];

  return (
    <div className={classes.root}>
      <Dialog
        open={open === "create" || open === "edit"}
        onClose={handleClose}
        fullWidth
        maxWidth="xs"
        scroll="paper"
      >
        <DialogTitle disableTypography>
          <Box display="flex" alignItems="center" style={{ gap: 10 }}>
            <div className={classes.headerIcon}>
              <SmartToy style={{ color: "#fff", fontSize: 22 }} />
            </div>
            <div>
              <Typography variant="h6" style={{ fontWeight: "bold", fontSize: 16 }}>
                {labels.title}
              </Typography>
              <Typography variant="caption" color="textSecondary">
                {i18n.t("flowBuilderAiAgentModal.subtitle")}
              </Typography>
            </div>
          </Box>
        </DialogTitle>
        <DialogContent dividers>
          {loading ? (
            <Box display="flex" justifyContent="center" p={3}>
              <CircularProgress />
            </Box>
          ) : (
            <>
              <FormControl fullWidth variant="outlined" margin="dense">
                <InputLabel>{i18n.t("flowBuilderAiAgentModal.agentLabel")}</InputLabel>
                <Select
                  value={selectedAgentId}
                  onChange={(e) => setSelectedAgentId(e.target.value)}
                  label={i18n.t("flowBuilderAiAgentModal.agentLabel")}
                >
                  <MenuItem value="">
                    <em>{i18n.t("flowBuilderAiAgentModal.selectPlaceholder")}</em>
                  </MenuItem>
                  {activeAgents.map((agent) => (
                    <MenuItem key={agent.id} value={agent.id}>
                      {agent.name}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>

              {activeAgents.length === 0 && (
                <Typography
                  variant="body2"
                  color="textSecondary"
                  align="center"
                  style={{ marginTop: 12 }}
                >
                  {i18n.t("flowBuilderAiAgentModal.noAgentsFound")}
                </Typography>
              )}
            </>
          )}
        </DialogContent>

        <DialogActions>
          <Button onClick={handleClose} variant="outlined" style={{ borderColor: "#F97316", color: "#F97316" }}>
            {i18n.t("flowBuilderAiAgentModal.cancel")}
          </Button>
          <Button
            onClick={handleSave}
            variant="contained"
            disabled={!selectedAgentId}
            style={{
              backgroundColor: selectedAgentId ? "#F97316" : undefined,
              color: selectedAgentId ? "#fff" : undefined,
            }}
          >
            {labels.btn}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
};

export default FlowBuilderAiAgentModal;
