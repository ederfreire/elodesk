import React, { useState, useEffect } from "react";
import { Dialog, DialogTitle, DialogContent, DialogActions, Button, TextField, FormControlLabel, Checkbox, Typography, Divider, Select, MenuItem, FormControl, InputLabel, Alert } from "@mui/material";
import { makeStyles } from "@material-ui/core/styles";
import { toast } from "react-toastify";
import WebhookIcon from "@mui/icons-material/Webhook";
import HourglassEmptyIcon from "@mui/icons-material/HourglassEmpty";
import ManageSearchIcon from "@mui/icons-material/ManageSearch";
import SendIcon from "@mui/icons-material/Send";
import { i18n } from "../../translate/i18n";

const useStyles = makeStyles((theme) => ({
  dialog: {
    "& .MuiPaper-root": {
      borderRadius: 12,
      minWidth: 500,
    },
  },
  title: {
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(1),
    backgroundColor: "#EA4B71",
    color: "#fff",
    padding: theme.spacing(1.5, 2),
  },
  section: {
    marginTop: theme.spacing(2),
    marginBottom: theme.spacing(1),
  },
}));

const FlowBuilderN8NModal = ({ open, onSave, data, onUpdate, close }) => {
  const classes = useStyles();
  const t = (key) => i18n.t(`n8nModal.${key}`);

  const [n8nType, setN8nType] = useState("n8nWebhook");
  const [webhookUrl, setWebhookUrl] = useState("");
  const [authToken, setAuthToken] = useState("");
  const [sendTicketData, setSendTicketData] = useState(true);
  const [sendContactData, setSendContactData] = useState(true);
  const [sendMessageData, setSendMessageData] = useState(false);
  const [customPayload, setCustomPayload] = useState("");
  const [timeoutMinutes, setTimeoutMinutes] = useState(5);
  const [saveResponseVar, setSaveResponseVar] = useState("");
  const [callbackMessage, setCallbackMessage] = useState("");
  const [queryName, setQueryName] = useState("");
  const [queryPayload, setQueryPayload] = useState("");
  const [queryResponseVar, setQueryResponseVar] = useState("");
  const [sendMessageOnResponse, setSendMessageOnResponse] = useState(false);
  const [responseTemplate, setResponseTemplate] = useState("");
  const [waitForResponse, setWaitForResponse] = useState(true);
  const [responseField, setResponseField] = useState("message");
  const [sendMsgVar, setSendMsgVar] = useState("");
  const [sendMsgTimeout, setSendMsgTimeout] = useState(30);
  const [fallbackMessage, setFallbackMessage] = useState("");

  useEffect(() => {
    if (open === "edit" && data) {
      const nodeType = data.type || "n8nWebhook";
      setN8nType(nodeType);
      setWebhookUrl(data.data?.webhookUrl || "");
      setAuthToken(data.data?.authToken || "");

      if (nodeType === "n8nWebhook") {
        setSendTicketData(data.data?.sendTicketData !== false);
        setSendContactData(data.data?.sendContactData !== false);
        setSendMessageData(data.data?.sendMessageData || false);
        setCustomPayload(data.data?.customPayload || "");
      } else if (nodeType === "n8nWait") {
        setTimeoutMinutes(data.data?.timeoutMinutes || 5);
        setSaveResponseVar(data.data?.saveResponseVar || "");
        setCallbackMessage(data.data?.callbackMessage || "");
      } else if (nodeType === "n8nQuery") {
        setQueryName(data.data?.queryName || "");
        setQueryPayload(data.data?.queryPayload || "");
        setQueryResponseVar(data.data?.saveResponseVar || "");
        setSendMessageOnResponse(data.data?.sendMessageOnResponse || false);
        setResponseTemplate(data.data?.responseTemplate || "");
      } else if (nodeType === "n8nSendMessage") {
        setWaitForResponse(data.data?.waitForResponse !== false);
        setResponseField(data.data?.responseField || "message");
        setSendMsgVar(data.data?.saveResponseVar || "");
        setSendMsgTimeout(data.data?.timeoutSeconds || 30);
        setFallbackMessage(data.data?.fallbackMessage || "");
      }
    } else if (open === "create") {
      resetFields();
    }
  }, [open, data]);

  const resetFields = () => {
    setWebhookUrl(""); setAuthToken("");
    setSendTicketData(true); setSendContactData(true); setSendMessageData(false);
    setCustomPayload(""); setTimeoutMinutes(5); setSaveResponseVar("");
    setCallbackMessage(""); setQueryName(""); setQueryPayload("");
    setQueryResponseVar(""); setSendMessageOnResponse(false); setResponseTemplate("");
    setWaitForResponse(true); setResponseField("message"); setSendMsgVar("");
    setSendMsgTimeout(30); setFallbackMessage("");
  };

  const handleSave = () => {
    if (!webhookUrl.trim()) {
      toast.error(t("webhookRequired"));
      return;
    }

    const baseData = { webhookUrl: webhookUrl.trim(), authToken: authToken.trim() };

    if (n8nType === "n8nWebhook") {
      const nodeData = { ...baseData, sendTicketData, sendContactData, sendMessageData, customPayload: customPayload.trim() };
      if (open === "edit") onUpdate({ ...data, data: { ...data.data, ...nodeData } });
      else onSave(nodeData);
    } else if (n8nType === "n8nWait") {
      const nodeData = { ...baseData, timeoutMinutes: parseInt(timeoutMinutes) || 5, saveResponseVar: saveResponseVar.trim(), callbackMessage: callbackMessage.trim() };
      if (open === "edit") onUpdate({ ...data, data: { ...data.data, ...nodeData } });
      else onSave(nodeData);
    } else if (n8nType === "n8nQuery") {
      const nodeData = { ...baseData, queryName: queryName.trim(), queryPayload: queryPayload.trim(), saveResponseVar: queryResponseVar.trim(), sendMessageOnResponse, responseTemplate: responseTemplate.trim() };
      if (open === "edit") onUpdate({ ...data, data: { ...data.data, ...nodeData } });
      else onSave(nodeData);
    } else if (n8nType === "n8nSendMessage") {
      const nodeData = { ...baseData, waitForResponse, responseField: responseField.trim(), saveResponseVar: sendMsgVar.trim(), timeoutSeconds: parseInt(sendMsgTimeout) || 30, fallbackMessage: fallbackMessage.trim() };
      if (open === "edit") onUpdate({ ...data, data: { ...data.data, ...nodeData } });
      else onSave(nodeData);
    }
  };

  const getIcon = () => {
    if (n8nType === "n8nWait") return <HourglassEmptyIcon />;
    if (n8nType === "n8nQuery") return <ManageSearchIcon />;
    if (n8nType === "n8nSendMessage") return <SendIcon />;
    return <WebhookIcon />;
  };

  const getTitle = () => {
    if (open === "edit") {
      if (n8nType === "n8nWait") return t("editWait");
      if (n8nType === "n8nQuery") return t("editQuery");
      if (n8nType === "n8nSendMessage") return t("editSendMessage");
      return t("editWebhook");
    }
    if (n8nType === "n8nWait") return t("addWait");
    if (n8nType === "n8nQuery") return t("addQuery");
    if (n8nType === "n8nSendMessage") return t("addSendMessage");
    return t("addWebhook");
  };

  if (!open) return null;

  return (
    <Dialog open={!!open} onClose={() => close(null)} className={classes.dialog} maxWidth="sm" fullWidth>
      <DialogTitle className={classes.title}>
        {getIcon()}
        <span>{getTitle()}</span>
      </DialogTitle>

      <DialogContent dividers>
        {open === "create" && (
          <FormControl fullWidth margin="dense" variant="outlined" size="small">
            <InputLabel>{t("nodeType")}</InputLabel>
            <Select value={n8nType} onChange={(e) => { setN8nType(e.target.value); resetFields(); }} label={t("nodeType")}>
              <MenuItem value="n8nWebhook">🔗 {t("webhookOption")}</MenuItem>
              <MenuItem value="n8nWait">⏳ {t("waitOption")}</MenuItem>
              <MenuItem value="n8nQuery">🔍 {t("queryOption")}</MenuItem>
              <MenuItem value="n8nSendMessage">💬 {t("sendMessageOption")}</MenuItem>
            </Select>
          </FormControl>
        )}

        <Alert severity="info" sx={{ mt: 1, mb: 1 }}>
          {n8nType === "n8nWebhook" && t("webhookInfo")}
          {n8nType === "n8nWait" && t("waitInfo")}
          {n8nType === "n8nQuery" && t("queryInfo")}
          {n8nType === "n8nSendMessage" && t("sendMessageInfo")}
        </Alert>

        <Divider sx={{ my: 1 }} />

        <TextField fullWidth margin="dense" variant="outlined" size="small" label={t("webhookUrlLabel")} placeholder={t("webhookUrlPlaceholder")} value={webhookUrl} onChange={(e) => setWebhookUrl(e.target.value)} required />
        <TextField fullWidth margin="dense" variant="outlined" size="small" label={t("authTokenLabel")} placeholder={t("authTokenPlaceholder")} value={authToken} onChange={(e) => setAuthToken(e.target.value)} />

        <Divider sx={{ my: 1.5 }} />

        {n8nType === "n8nWebhook" && (
          <>
            <Typography variant="subtitle2" color="textSecondary" className={classes.section}>{t("dataToSend")}</Typography>
            <FormControlLabel control={<Checkbox checked={sendTicketData} onChange={(e) => setSendTicketData(e.target.checked)} size="small" sx={{ color: "#EA4B71", "&.Mui-checked": { color: "#EA4B71" } }} />} label={t("ticketData")} />
            <FormControlLabel control={<Checkbox checked={sendContactData} onChange={(e) => setSendContactData(e.target.checked)} size="small" sx={{ color: "#EA4B71", "&.Mui-checked": { color: "#EA4B71" } }} />} label={t("contactData")} />
            <FormControlLabel control={<Checkbox checked={sendMessageData} onChange={(e) => setSendMessageData(e.target.checked)} size="small" sx={{ color: "#EA4B71", "&.Mui-checked": { color: "#EA4B71" } }} />} label={t("lastMessage")} />
            <TextField fullWidth margin="dense" variant="outlined" size="small" label={t("customPayload")} placeholder='{"campo": "valor", "variavel": "{{nome}}"}' value={customPayload} onChange={(e) => setCustomPayload(e.target.value)} multiline rows={3} />
          </>
        )}

        {n8nType === "n8nWait" && (
          <>
            <Typography variant="subtitle2" color="textSecondary" className={classes.section}>{t("waitConfig")}</Typography>
            <TextField fullWidth margin="dense" variant="outlined" size="small" type="number" label={t("timeoutMinutes")} value={timeoutMinutes} onChange={(e) => setTimeoutMinutes(e.target.value)} helperText={t("timeoutHelper")} inputProps={{ min: 1, max: 1440 }} />
            <TextField fullWidth margin="dense" variant="outlined" size="small" label={t("saveResponseVar")} placeholder="ex: n8n_resultado" value={saveResponseVar} onChange={(e) => setSaveResponseVar(e.target.value)} helperText={t("saveResponseHelper")} />
            <TextField fullWidth margin="dense" variant="outlined" size="small" label={t("waitingMessage")} placeholder="..." value={callbackMessage} onChange={(e) => setCallbackMessage(e.target.value)} />
          </>
        )}

        {n8nType === "n8nQuery" && (
          <>
            <Typography variant="subtitle2" color="textSecondary" className={classes.section}>{t("queryConfig")}</Typography>
            <TextField fullWidth margin="dense" variant="outlined" size="small" label={t("queryNameLabel")} placeholder="ex: Buscar cliente no CRM" value={queryName} onChange={(e) => setQueryName(e.target.value)} />
            <TextField fullWidth margin="dense" variant="outlined" size="small" label={t("queryPayloadLabel")} placeholder='{"cpf": "{{cpf}}"}' value={queryPayload} onChange={(e) => setQueryPayload(e.target.value)} multiline rows={3} helperText={t("queryPayloadHelper")} />
            <TextField fullWidth margin="dense" variant="outlined" size="small" label={t("queryResultVar")} placeholder="ex: resultado_crm" value={queryResponseVar} onChange={(e) => setQueryResponseVar(e.target.value)} helperText={t("queryResultHelper")} />
            <FormControlLabel control={<Checkbox checked={sendMessageOnResponse} onChange={(e) => setSendMessageOnResponse(e.target.checked)} size="small" sx={{ color: "#EA4B71", "&.Mui-checked": { color: "#EA4B71" } }} />} label={t("sendResultAsMessage")} />
            {sendMessageOnResponse && (
              <TextField fullWidth margin="dense" variant="outlined" size="small" label={t("messageTemplate")} placeholder="{{resultado_crm}}" value={responseTemplate} onChange={(e) => setResponseTemplate(e.target.value)} multiline rows={2} helperText={t("messageTemplateHelper")} />
            )}
          </>
        )}

        {n8nType === "n8nSendMessage" && (
          <>
            <Typography variant="subtitle2" color="textSecondary" className={classes.section}>{t("sendConfig")}</Typography>
            <TextField fullWidth margin="dense" variant="outlined" size="small" label={t("responseFieldLabel")} placeholder="ex: message, text, response.text" value={responseField} onChange={(e) => setResponseField(e.target.value)} helperText={t("responseFieldHelper")} />
            <TextField fullWidth margin="dense" variant="outlined" size="small" type="number" label={t("timeoutSeconds")} value={sendMsgTimeout} onChange={(e) => setSendMsgTimeout(e.target.value)} helperText={t("timeoutSecondsHelper")} inputProps={{ min: 5, max: 120 }} />
            <TextField fullWidth margin="dense" variant="outlined" size="small" label={t("saveResponseVarOptional")} placeholder="ex: n8n_msg" value={sendMsgVar} onChange={(e) => setSendMsgVar(e.target.value)} helperText={t("saveResponseVarHelper")} />
            <TextField fullWidth margin="dense" variant="outlined" size="small" label={t("fallbackMessage")} placeholder="..." value={fallbackMessage} onChange={(e) => setFallbackMessage(e.target.value)} multiline rows={2} helperText={t("fallbackHelper")} />
            <Alert severity="warning" sx={{ mt: 1 }}>
              <strong>Flow:</strong> {t("flowWarning")}
            </Alert>
          </>
        )}
      </DialogContent>

      <DialogActions sx={{ p: 2 }}>
        <Button onClick={() => close(null)} variant="outlined" color="inherit">{t("cancel")}</Button>
        <Button onClick={handleSave} variant="contained" sx={{ backgroundColor: "#EA4B71", "&:hover": { backgroundColor: "#D63D63" } }}>
          {open === "edit" ? t("save") : t("add")}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default FlowBuilderN8NModal;
