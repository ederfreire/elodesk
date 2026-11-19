import React, { useState, useEffect } from "react";
import Button from "@material-ui/core/Button";
import TextField from "@material-ui/core/TextField";
import Dialog from "@material-ui/core/Dialog";
import DialogActions from "@material-ui/core/DialogActions";
import DialogContent from "@material-ui/core/DialogContent";
import DialogTitle from "@material-ui/core/DialogTitle";
import { Box, IconButton, Typography } from "@mui/material";
import Delete from "@mui/icons-material/Delete";
import Add from "@mui/icons-material/Add";
import { i18n } from "../../translate/i18n";

const FlowBuilderInstagramReplyModal = ({ open, onSave, onUpdate, data, close }) => {
  const [active, setActive] = useState(false);
  const [variations, setVariations] = useState([""]);

  useEffect(() => {
    if (open === "edit") {
      setVariations(data?.data?.variations?.length ? data.data.variations : [""]);
      setActive(true);
    } else if (open === "create") { setVariations([""]); setActive(true); }
    else setActive(false);
  }, [open, data]);

  const close_ = () => { close(null); setActive(false); };

  const updateVar = (i, v) => { const c = [...variations]; c[i] = v; setVariations(c); };
  const addVar = () => setVariations([...variations, ""]);
  const removeVar = i => setVariations(variations.filter((_, idx) => idx !== i));

  const handleSave = () => {
    const cleaned = variations.map(v => v.trim()).filter(Boolean);
    if (cleaned.length === 0) return;
    const payload = { variations: cleaned };
    if (open === "edit") onUpdate({ ...data, data: payload }); else onSave(payload);
    close_();
  };

  return (
    <Dialog open={active} onClose={close_} fullWidth maxWidth="sm">
      <DialogTitle>{i18n.t("flowBuilderInstagramReplyModal.title")}</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2" sx={{ mb: 2 }}>
          {i18n.t("flowBuilderInstagramReplyModal.hint")}
        </Typography>
        {variations.map((v, i) => (
          <Box key={i} display="flex" gap={1} mb={1}>
            <TextField fullWidth multiline minRows={1} maxRows={3} label={`${i18n.t("flowBuilderInstagramReplyModal.variation")} ${i + 1}`} value={v} onChange={e => updateVar(i, e.target.value)} variant="outlined" size="small" />
            <IconButton onClick={() => removeVar(i)} disabled={variations.length <= 1}><Delete /></IconButton>
          </Box>
        ))}
        <Button startIcon={<Add />} onClick={addVar}>{i18n.t("flowBuilderInstagramReplyModal.addVariation")}</Button>
      </DialogContent>
      <DialogActions>
        <Button onClick={close_}>{i18n.t("flowBuilderInstagramReplyModal.cancel")}</Button>
        <Button onClick={handleSave} variant="contained" color="primary">{i18n.t("flowBuilderInstagramReplyModal.save")}</Button>
      </DialogActions>
    </Dialog>
  );
};

export default FlowBuilderInstagramReplyModal;
