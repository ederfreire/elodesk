import React, { useState, useEffect } from "react";
import Button from "@material-ui/core/Button";
import TextField from "@material-ui/core/TextField";
import Dialog from "@material-ui/core/Dialog";
import DialogActions from "@material-ui/core/DialogActions";
import DialogContent from "@material-ui/core/DialogContent";
import DialogTitle from "@material-ui/core/DialogTitle";
import { Typography, Box } from "@mui/material";
import api from "../../services/api";
import { i18n } from "../../translate/i18n";

const FlowBuilderInstagramRewardModal = ({ open, onSave, onUpdate, data, close }) => {
  const [active, setActive] = useState(false);
  const [fileName, setFileName] = useState("");
  const [caption, setCaption] = useState("");
  const [uploading, setUploading] = useState(false);

  useEffect(() => {
    if (open === "edit") {
      setFileName(data?.data?.fileName || "");
      setCaption(data?.data?.caption || "");
      setActive(true);
    } else if (open === "create") { setFileName(""); setCaption(""); setActive(true); }
    else setActive(false);
  }, [open, data]);

  const close_ = () => { close(null); setActive(false); };

  const handleUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    try {
      const fd = new FormData();
      fd.append("medias", file);
      fd.append("typeArch", "flow");
      const { data: res } = await api.post("/flowbuilder/content", fd, {
        headers: { "Content-Type": "multipart/form-data" },
        timeout: 120000
      });
      // Backend returns array of filename strings; also tolerate {name} objects
      const uploaded = Array.isArray(res) ? res[0] : res;
      const name = typeof uploaded === "string" ? uploaded : uploaded?.name;
      if (name) {
        setFileName(name);
      } else {
        console.error("Upload sem nome retornado", res);
        alert(i18n.t("flowBuilderInstagramRewardModal.uploadError", "Falha ao enviar arquivo"));
      }
    } catch (err) {
      console.error("Erro upload recompensa:", err);
      alert(i18n.t("flowBuilderInstagramRewardModal.uploadError", "Falha ao enviar arquivo"));
    } finally {
      setUploading(false);
      // permite reescolher o mesmo arquivo depois
      if (e?.target) e.target.value = "";
    }
  };

  const handleSave = () => {
    const payload = { fileName, caption };
    if (open === "edit") onUpdate({ ...data, data: payload }); else onSave(payload);
    close_();
  };

  return (
    <Dialog open={active} onClose={close_} fullWidth maxWidth="sm">
      <DialogTitle>{i18n.t("flowBuilderInstagramRewardModal.title")}</DialogTitle>
      <DialogContent dividers>
        <Box mb={2}>
          <Button variant="outlined" component="label" disabled={uploading}>
            {uploading ? i18n.t("flowBuilderInstagramRewardModal.uploading") : i18n.t("flowBuilderInstagramRewardModal.selectFile")}
            <input hidden type="file" onChange={handleUpload} accept=".pdf,.doc,.docx,.xls,.xlsx,.zip,image/*" />
          </Button>
          {fileName && <Typography variant="body2" sx={{ mt: 1 }}>{i18n.t("flowBuilderInstagramRewardModal.file")} <strong>{fileName}</strong></Typography>}
        </Box>
        <TextField fullWidth label={i18n.t("flowBuilderInstagramRewardModal.caption")} value={caption} onChange={e => setCaption(e.target.value)} variant="outlined" multiline minRows={2} />
        <Typography variant="caption" sx={{ mt: 1, display: "block", color: "text.secondary" }}>
          {i18n.t("flowBuilderInstagramRewardModal.hint")}
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={close_}>{i18n.t("flowBuilderInstagramRewardModal.cancel")}</Button>
        <Button onClick={handleSave} variant="contained" color="primary" disabled={!fileName}>{i18n.t("flowBuilderInstagramRewardModal.save")}</Button>
      </DialogActions>
    </Dialog>
  );
};

export default FlowBuilderInstagramRewardModal;
