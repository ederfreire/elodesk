import React, { useState, useEffect } from "react";
import Button from "@material-ui/core/Button";
import TextField from "@material-ui/core/TextField";
import Dialog from "@material-ui/core/Dialog";
import DialogActions from "@material-ui/core/DialogActions";
import DialogContent from "@material-ui/core/DialogContent";
import DialogTitle from "@material-ui/core/DialogTitle";
import { Typography } from "@mui/material";
import { i18n } from "../../translate/i18n";

const FlowBuilderInstagramDmModal = ({ open, onSave, onUpdate, data, close }) => {
  const [active, setActive] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (open === "edit") { setMessage(data?.data?.message || ""); setActive(true); }
    else if (open === "create") { setMessage(""); setActive(true); }
    else setActive(false);
  }, [open, data]);

  const close_ = () => { close(null); setActive(false); };

  const handleSave = () => {
    const payload = { message };
    if (open === "edit") onUpdate({ ...data, data: payload }); else onSave(payload);
    close_();
  };

  return (
    <Dialog open={active} onClose={close_} fullWidth maxWidth="sm">
      <DialogTitle>{i18n.t("flowBuilderInstagramDmModal.title")}</DialogTitle>
      <DialogContent dividers>
        <TextField fullWidth multiline minRows={4} label={i18n.t("flowBuilderInstagramDmModal.message")} value={message} onChange={e => setMessage(e.target.value)} variant="outlined" />
        <Typography variant="caption" sx={{ mt: 1, display: "block", color: "text.secondary" }}>
          {i18n.t("flowBuilderInstagramDmModal.hint")}
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={close_}>{i18n.t("flowBuilderInstagramDmModal.cancel")}</Button>
        <Button onClick={handleSave} variant="contained" color="primary" disabled={!message.trim()}>{i18n.t("flowBuilderInstagramDmModal.save")}</Button>
      </DialogActions>
    </Dialog>
  );
};

export default FlowBuilderInstagramDmModal;
