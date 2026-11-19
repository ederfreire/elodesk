import React, { useEffect, useState } from "react";
import Button from "@material-ui/core/Button";
import TextField from "@material-ui/core/TextField";
import Dialog from "@material-ui/core/Dialog";
import DialogActions from "@material-ui/core/DialogActions";
import DialogContent from "@material-ui/core/DialogContent";
import DialogTitle from "@material-ui/core/DialogTitle";
import Typography from "@material-ui/core/Typography";
import Switch from "@material-ui/core/Switch";
import FormControlLabel from "@material-ui/core/FormControlLabel";
import MenuItem from "@material-ui/core/MenuItem";
import Divider from "@material-ui/core/Divider";
import { i18n } from "../../translate/i18n";

const DEFAULT_REMINDER = () => i18n.t("flowBuilderConfigPage.waitInputDefaultReminder");

const FlowBuilderWaitInputModal = ({ open, onSave, data, onUpdate, close }) => {
  const [variableName, setVariableName] = useState("lastResponse");
  const [reminderEnabled, setReminderEnabled] = useState(false);
  const [reminderDelayMinutes, setReminderDelayMinutes] = useState(5);
  const [reminderMessage, setReminderMessage] = useState(DEFAULT_REMINDER());
  const [timeoutAfterReminderMinutes, setTimeoutAfterReminderMinutes] = useState(5);
  const [timeoutAction, setTimeoutAction] = useState("continueFlow");

  useEffect(() => {
    if (open === "edit" && data?.data) {
      setVariableName(data.data.variableName || "lastResponse");
      setReminderEnabled(!!data.data.reminderEnabled);
      setReminderDelayMinutes(Number(data.data.reminderDelayMinutes) || 5);
      setReminderMessage(data.data.reminderMessage || DEFAULT_REMINDER());
      setTimeoutAfterReminderMinutes(Number(data.data.timeoutAfterReminderMinutes) || 5);
      setTimeoutAction(data.data.timeoutAction || "continueFlow");
    } else if (open === "create") {
      setVariableName("lastResponse");
      setReminderEnabled(false);
      setReminderDelayMinutes(5);
      setReminderMessage(DEFAULT_REMINDER());
      setTimeoutAfterReminderMinutes(5);
      setTimeoutAction("continueFlow");
    }
  }, [open, data]);

  const handleClose = () => close(null);

  const handleSave = () => {
    const payload = {
      variableName: (variableName || "lastResponse").trim(),
      reminderEnabled: !!reminderEnabled,
      reminderDelayMinutes: Math.max(1, Number(reminderDelayMinutes) || 1),
      reminderMessage: (reminderMessage || "").trim() || DEFAULT_REMINDER(),
      timeoutAfterReminderMinutes: Math.max(0, Number(timeoutAfterReminderMinutes) || 0),
      timeoutAction: timeoutAction || "continueFlow"
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
      <DialogTitle>{i18n.t("flowBuilderConfigPage.waitInputModalTitle")}</DialogTitle>
      <DialogContent>
        <Typography variant="body2" style={{ marginBottom: 12, color: "#666" }}>
          {i18n.t("flowBuilderConfigPage.waitInputModalBody")}
        </Typography>
        <TextField
          fullWidth
          label={i18n.t("flowBuilderConfigPage.waitInputVariableLabel")}
          helperText={i18n.t("flowBuilderConfigPage.waitInputVariableHelp")}
          value={variableName}
          onChange={(e) => setVariableName(e.target.value.replace(/[^A-Za-z0-9_]/g, ""))}
          variant="outlined"
          size="small"
        />

        <Divider style={{ margin: "20px 0 12px" }} />

        <FormControlLabel
          control={
            <Switch
              checked={reminderEnabled}
              onChange={(e) => setReminderEnabled(e.target.checked)}
              color="primary"
            />
          }
          label={i18n.t("flowBuilderConfigPage.waitInputSendReminder")}
        />

        {reminderEnabled && (
          <div style={{ marginTop: 12 }}>
            <TextField
              fullWidth
              type="number"
              label={i18n.t("flowBuilderConfigPage.waitInputReminderDelay")}
              value={reminderDelayMinutes}
              onChange={(e) => setReminderDelayMinutes(e.target.value)}
              variant="outlined"
              size="small"
              inputProps={{ min: 1 }}
              style={{ marginBottom: 12 }}
            />
            <TextField
              fullWidth
              multiline
              minRows={2}
              label={i18n.t("flowBuilderConfigPage.waitInputReminderMessage")}
              helperText={i18n.t("flowBuilderConfigPage.waitInputAvailableVars")}
              value={reminderMessage}
              onChange={(e) => setReminderMessage(e.target.value)}
              variant="outlined"
              size="small"
              style={{ marginBottom: 12 }}
            />
            <TextField
              select
              fullWidth
              label={i18n.t("flowBuilderConfigPage.waitInputTimeoutActionLabel")}
              value={timeoutAction}
              onChange={(e) => setTimeoutAction(e.target.value)}
              variant="outlined"
              size="small"
              style={{ marginBottom: 12 }}
            >
              <MenuItem value="continueFlow">{i18n.t("flowBuilderConfigPage.waitInputTimeoutContinueFlow")}</MenuItem>
              <MenuItem value="closeTicket">{i18n.t("flowBuilderConfigPage.waitInputTimeoutCloseTicket")}</MenuItem>
              <MenuItem value="keepWaiting">{i18n.t("flowBuilderConfigPage.waitInputTimeoutKeepWaiting")}</MenuItem>
            </TextField>
            {timeoutAction !== "keepWaiting" && (
              <TextField
                fullWidth
                type="number"
                label={i18n.t("flowBuilderConfigPage.waitInputTimeoutDelay")}
                helperText={i18n.t("flowBuilderConfigPage.waitInputTimeoutDelayHelp")}
                value={timeoutAfterReminderMinutes}
                onChange={(e) => setTimeoutAfterReminderMinutes(e.target.value)}
                variant="outlined"
                size="small"
                inputProps={{ min: 0 }}
              />
            )}
          </div>
        )}
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

export default FlowBuilderWaitInputModal;
