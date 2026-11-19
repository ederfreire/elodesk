import React, { useEffect, useState } from "react";
import { Paper, Typography, Button, Dialog, DialogTitle, DialogContent, DialogActions, TextField, IconButton, List, ListItem, ListItemText, ListItemSecondaryAction, Divider, Box, Select, MenuItem, InputLabel, FormControl, Card, Chip, Grid, Switch, FormControlLabel, Tooltip, InputAdornment, useTheme, ButtonGroup } from "@material-ui/core";
import { makeStyles } from "@material-ui/core/styles";
import Add from "@material-ui/icons/Add";
import Edit from "@material-ui/icons/Edit";
import Delete from "@material-ui/icons/Delete";
import FileCopy from "@material-ui/icons/FileCopy";
import Save from "@material-ui/icons/Save";
import Close from "@material-ui/icons/Close";
import AttachFile from "@material-ui/icons/AttachFile";
import Schedule from "@material-ui/icons/Schedule";
import CloudUpload from "@material-ui/icons/CloudUpload";
import InsertLink from "@material-ui/icons/InsertLink";
import PlayArrow from "@material-ui/icons/PlayArrow";
import ArrowForward from "@material-ui/icons/ArrowForward";
import ArrowBack from "@material-ui/icons/ArrowBack";
import WhatsApp from "@material-ui/icons/WhatsApp";
import CheckCircle from "@material-ui/icons/CheckCircle";
import Info from "@material-ui/icons/Info";
import Timer from "@material-ui/icons/Timer";
import api from "../../services/api";
import { i18n } from "../../translate/i18n";

const useStyles = makeStyles(theme => ({
  root: {
    padding: 20,
  },
  header: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 20,
  },
  titleArea: {
    display: "flex",
    alignItems: "center",
    gap: 12,
  },
  titleIcon: {
    width: 44,
    height: 44,
    borderRadius: 12,
    background: "linear-gradient(135deg, #7c3aed, #a78bfa)",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: "#fff",
    boxShadow: "0 4px 14px rgba(124,58,237,0.3)",
  },
  floupList: {
    borderRadius: 14,
    overflow: "hidden",
  },
  floupItem: {
    borderLeft: "4px solid transparent",
    transition: "all 0.2s",
    "&:hover": {
      backgroundColor: theme.mode === "dark"
        ? "rgba(124,58,237,0.15)"
        : "#f8f5ff",
      borderLeftColor: "#7c3aed",
    },
  },
  floupInfo: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
  },
  floupMeta: {
    display: "flex",
    gap: 6,
    flexWrap: "wrap",
  },
  dialogPaper: {
    borderRadius: 16,
    maxHeight: "90vh",
  },
  dialogHeader: {
    background: "linear-gradient(135deg, #7c3aed, #6d28d9)",
    color: "#fff",
    padding: "16px 24px",
  },
  stepperRoot: {
    padding: "16px 0",
  },
  wizardNav: {
    display: "flex",
    justifyContent: "space-between",
    alignItems: "center",
    padding: "12px 0",
    borderTop: `1px solid ${theme.palette.divider}`,
    marginTop: 16,
  },
  stepCard: {
    borderRadius: 12,
    marginBottom: 12,
    border: `1px solid ${theme.palette.divider}`,
    overflow: "hidden",
    transition: "all 0.2s",
    "&:hover": {
      boxShadow: "0 4px 12px rgba(0,0,0,0.08)",
    },
  },
  stepHeader: {
    display: "flex",
    alignItems: "center",
    padding: "10px 14px",
    cursor: "pointer",
    gap: 10,
  },
  stepNumber: {
    width: 28,
    height: 28,
    borderRadius: 8,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontWeight: 700,
    fontSize: 13,
    color: "#fff",
    flexShrink: 0,
  },
  stepBody: {
    padding: "0 14px 14px",
  },
  stepConnector: {
    width: 2,
    height: 16,
    background: "#d4d4d8",
    margin: "0 auto",
  },
  whatsappPreview: {
    background: "#e5ddd5",
    borderRadius: 12,
    padding: 16,
    maxWidth: 320,
    margin: "0 auto",
  },
  whatsappBubble: {
    background: "#dcf8c6",
    borderRadius: "0 10px 10px 10px",
    padding: "8px 12px",
    maxWidth: 260,
    marginBottom: 4,
    position: "relative",
    boxShadow: "0 1px 1px rgba(0,0,0,0.1)",
    color: "#111",
  },
  whatsappTime: {
    fontSize: 10,
    color: "#667781",
    textAlign: "right",
    marginTop: 2,
  },
  conditionCard: {
    borderRadius: 12,
    border: `2px solid ${theme.palette.primary.main}20`,
    background: `${theme.palette.primary.main}05`,
    padding: 16,
  },
  stopCard: {
    borderRadius: 12,
    border: "2px solid #ff990020",
    background: "#ff990005",
    padding: 16,
  },
  infoBox: {
    borderRadius: 10,
    padding: "10px 14px",
    display: "flex",
    alignItems: "flex-start",
    gap: 10,
    marginBottom: 12,
  },
}));

const STEP_COLORS = [
  "#7c3aed", "#3b82f6", "#06b6d4", "#10b981", "#f59e0b",
  "#ef4444", "#ec4899", "#8b5cf6", "#14b8a6", "#f97316"
];

const FloupPage = () => {
  const classes = useStyles();
  const theme = useTheme();
  const [floups, setFloups] = useState([]);
  const [open, setOpen] = useState(false);
  const [wizardStep, setWizardStep] = useState(0);
  const [expandedStep, setExpandedStep] = useState(0);
  const [form, setForm] = useState({
    id: null, name: "", description: "", templateType: "personalizado",
    condition: "queue", conditionValue: "",
    steps: [], stopConditions: [], pauseConditions: []
  });
  const [tags, setTags] = useState([]);
  const [queues, setQueues] = useState([]);
  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);
  const [floupToDelete, setFloupToDelete] = useState(null);
  const [statusFilter, setStatusFilter] = useState("all");

  const uploadFile = async (file) => {
    const formData = new FormData();
    formData.append('file', file);
    formData.append('typeArch', 'floup');
    if (form.id) formData.append('floupId', form.id.toString());
    try {
      const response = await api.post('/plugins/floup/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      return response.data?.url || null;
    } catch (error) {
      console.error('[FLOUP] uploadFile → Erro:', error);
      return null;
    }
  };

  const deleteFile = async (fileUrl) => {
    if (!fileUrl) return;
    try {
      await api.delete('/plugins/floup/upload', { data: { fileUrl } });
    } catch (error) {
      console.error('[FLOUP] deleteFile → Erro:', error);
    }
  };

  const load = async () => {
    const { data } = await api.get("/plugins/floup");
    setFloups(data);
    try { const { data: tagList } = await api.get('/tags/list'); setTags(tagList || []); } catch {}
    try { const { data: queueList } = await api.get('/queue'); setQueues(queueList || []); } catch { setQueues([]); }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async () => {
    const stepsWithDefaults = form.steps.map((step, index) => ({
      order: step.order || (index + 1),
      message: step.message || '',
      timeUnit: step.timeUnit || 'minutes',
      timeValue: step.timeValue || 0,
      mediaUrl: step.mediaUrl || '',
      mediaType: step.mediaType || 'url'
    }));
    const payload = {
      name: form.name, description: form.description,
      templateType: form.templateType,
      condition: form.condition || "queue",
      conditionValue: form.conditionValue || "",
      isActive: true, steps: stepsWithDefaults,
      stopConditions: form.stopConditions || [],
      pauseConditions: form.pauseConditions || []
    };
    try {
      if (form.id) {
        await api.put(`/plugins/floup/${form.id}`, payload);
      } else {
        await api.post(`/plugins/floup`, payload);
      }
      setOpen(false);
      resetForm();
      await load();
    } catch (error) {
      console.error('[FLOUP] Erro ao salvar:', error);
      alert('Erro ao salvar o Follow UP.');
    }
  };

  const resetForm = () => {
    setForm({ id: null, name: "", description: "", templateType: "personalizado", condition: "queue", conditionValue: "", steps: [], stopConditions: [], pauseConditions: [] });
    setWizardStep(0);
    setExpandedStep(0);
  };

  const handleDelete = (id) => {
    const floup = floups.find(f => f.id === id);
    setFloupToDelete({ id, name: floup?.name || 'este floup' });
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = async () => {
    if (floupToDelete) {
      try {
        await api.delete(`/plugins/floup/${floupToDelete.id}`);
        await load();
        setDeleteConfirmOpen(false);
        setFloupToDelete(null);
      } catch (error) {
        alert('Erro ao deletar o Follow UP.');
      }
    }
  };

  const handleDuplicate = async (id) => { await api.post(`/plugins/floup/${id}/duplicate`); await load(); };

  const updateStep = (idx, key, value) => {
    setForm(prev => {
      const steps = [...prev.steps];
      if (!steps[idx]) steps[idx] = { order: idx + 1, message: "", timeUnit: "minutes", timeValue: 0, mediaUrl: "", mediaType: "url" };
      steps[idx] = { ...steps[idx], [key]: value };
      return { ...prev, steps };
    });
  };

  const addStep = () => {
    const newStep = { order: form.steps.length + 1, message: "", timeUnit: "minutes", timeValue: 0, mediaUrl: "", mediaType: "url" };
    setForm({ ...form, steps: [...form.steps, newStep] });
    setExpandedStep(form.steps.length);
  };

  const removeStep = (idx) => setForm({ ...form, steps: form.steps.filter((_, i) => i !== idx).map((s, i) => ({ ...s, order: i + 1 })) });

  const moveStep = (idx, direction) => {
    const newIdx = idx + direction;
    if (newIdx < 0 || newIdx >= form.steps.length) return;
    const steps = [...form.steps];
    [steps[idx], steps[newIdx]] = [steps[newIdx], steps[idx]];
    steps.forEach((s, i) => s.order = i + 1);
    setForm({ ...form, steps });
    setExpandedStep(newIdx);
  };

  const isImageFile = (url) => {
    if (!url) return false;
    const l = url.toLowerCase();
    return l.startsWith('data:image/') || ['.jpg', '.jpeg', '.png', '.gif', '.webp', '.svg'].some(ext => l.includes(ext));
  };

  const isVideoFile = (url) => {
    if (!url) return false;
    const l = url.toLowerCase();
    return l.startsWith('data:video/') || ['.mp4', '.webm', '.ogg', '.avi', '.mov'].some(ext => l.includes(ext));
  };

  const getTimeLabel = (value, unit) => {
    const labels = { minutes: "min", hours: "h", days: "d", weeks: "sem", months: "mês", years: "ano" };
    return `${value || 0}${labels[unit] || unit}`;
  };

  // Wizard steps
  const wizardSteps = [
    { label: i18n.t("floupPage.basicInfo"), icon: <Info /> },
    { label: i18n.t("floupPage.triggerCondition"), icon: <PlayArrow /> },
    { label: i18n.t("floupPage.flowSteps"), icon: <Schedule /> },
    { label: i18n.t("floupPage.flowStopControls"), icon: <CheckCircle /> },
  ];

  const renderWizardContent = () => {
    switch (wizardStep) {
      case 0: return renderBasicInfo();
      case 1: return renderCondition();
      case 2: return renderSteps();
      case 3: return renderStopControls();
      default: return null;
    }
  };

  const renderBasicInfo = () => (
    <Box>
      <div className={classes.infoBox} style={{ background: "#ede9fe", border: "1px solid #c4b5fd" }}>
        <Info style={{ color: "#7c3aed", fontSize: 18, marginTop: 2 }} />
        <Typography style={{ fontSize: 12, color: "#5b21b6" }}>
          {i18n.t("floupPage.basicInfoDesc")}
        </Typography>
      </div>
      <Grid container spacing={2}>
        <Grid item xs={12} md={6}>
          <TextField fullWidth label={i18n.t("floupPage.templateName")} value={form.name} onChange={e => setForm({ ...form, name: e.target.value })} variant="outlined" />
        </Grid>
        <Grid item xs={12} md={6}>
          <FormControl fullWidth variant="outlined">
            <InputLabel>{i18n.t("floupPage.templateType")}</InputLabel>
            <Select value={form.templateType} onChange={e => setForm({ ...form, templateType: e.target.value })} label={i18n.t("floupPage.templateType")}>
              <MenuItem value="cliente">{i18n.t("floupPage.client")}</MenuItem>
              <MenuItem value="lead">{i18n.t("floupPage.lead")}</MenuItem>
              <MenuItem value="personalizado">{i18n.t("floupPage.customized")}</MenuItem>
            </Select>
          </FormControl>
        </Grid>
        <Grid item xs={12}>
          <TextField fullWidth label={i18n.t("floupPage.description")} value={form.description} onChange={e => setForm({ ...form, description: e.target.value })} multiline rows={3} variant="outlined" />
        </Grid>
      </Grid>
    </Box>
  );

  const renderCondition = () => (
    <Box>
      <div className={classes.infoBox} style={{ background: "#dbeafe", border: "1px solid #93c5fd" }}>
        <PlayArrow style={{ color: "#2563eb", fontSize: 18, marginTop: 2 }} />
        <Typography style={{ fontSize: 12, color: "#1e40af" }}>
          {i18n.t("floupPage.triggerConditionDesc")}
        </Typography>
      </div>
      <div className={classes.conditionCard}>
        <Grid container spacing={2}>
          <Grid item xs={12} md={6}>
            <FormControl fullWidth variant="outlined">
              <InputLabel>{i18n.t("floupPage.condition")}</InputLabel>
              <Select value={form.condition || "queue"} onChange={e => setForm({ ...form, condition: e.target.value, conditionValue: "" })} label={i18n.t("floupPage.condition")}>
                <MenuItem value="queue">{i18n.t("floupPage.systemQueue")}</MenuItem>
                <MenuItem value="tag">{i18n.t("floupPage.systemTag")}</MenuItem>
                <MenuItem value="firstClientInteraction">{i18n.t("floupPage.firstClientInteraction")}</MenuItem>
                <MenuItem value="firstAttendantInteraction">{i18n.t("floupPage.firstAttendantInteraction")}</MenuItem>
              </Select>
            </FormControl>
          </Grid>
          <Grid item xs={12} md={6}>
            {form.condition === "queue" && (
              <FormControl fullWidth variant="outlined">
                <InputLabel>{i18n.t("floupPage.queue")}</InputLabel>
                <Select value={form.conditionValue || ""} onChange={e => setForm({ ...form, conditionValue: e.target.value })} displayEmpty label={i18n.t("floupPage.queue")}>
                  <MenuItem value=""><em>{i18n.t("floupPage.selectQueue")}</em></MenuItem>
                  {queues.map(q => (<MenuItem key={q.id} value={q.name}>{q.name}</MenuItem>))}
                </Select>
              </FormControl>
            )}
            {form.condition === "tag" && (
              <FormControl fullWidth variant="outlined">
                <InputLabel>Tag</InputLabel>
                <Select value={form.conditionValue || ""} onChange={e => setForm({ ...form, conditionValue: e.target.value })} displayEmpty label="Tag">
                  <MenuItem value=""><em>{i18n.t("floupPage.selectTag")}</em></MenuItem>
                  {tags.map(t => (<MenuItem key={t.id} value={t.name}>{t.name}</MenuItem>))}
                </Select>
              </FormControl>
            )}
            {(form.condition === "firstClientInteraction" || form.condition === "firstAttendantInteraction") && (
              <TextField fullWidth label={i18n.t("floupPage.conditionDescription")} value={form.conditionValue || ""} onChange={e => setForm({ ...form, conditionValue: e.target.value })} variant="outlined" placeholder={i18n.t("floupPage.conditionPlaceholder")} />
            )}
          </Grid>
        </Grid>
      </div>
    </Box>
  );

  const renderSteps = () => (
    <Box>
      <div className={classes.infoBox} style={{ background: "#ecfdf5", border: "1px solid #6ee7b7" }}>
        <Schedule style={{ color: "#059669", fontSize: 18, marginTop: 2 }} />
        <Typography style={{ fontSize: 12, color: "#065f46" }}>
          {i18n.t("floupPage.stepsDesc")}
        </Typography>
      </div>

      <Grid container spacing={2}>
        {/* Steps List */}
        <Grid item xs={12} md={7}>
          {form.steps.map((step, idx) => {
            const color = STEP_COLORS[idx % STEP_COLORS.length];
            const isExpanded = expandedStep === idx;
            return (
              <React.Fragment key={idx}>
                {idx > 0 && <div className={classes.stepConnector} />}
                <Card className={classes.stepCard} style={{ borderColor: isExpanded ? color : undefined }}>
                  <div
                    className={classes.stepHeader}
                    onClick={() => setExpandedStep(isExpanded ? -1 : idx)}
                    style={{ background: isExpanded ? `${color}08` : undefined }}
                  >
                    <div className={classes.stepNumber} style={{ background: color }}>
                      {step.order}
                    </div>
                    <Box flex={1} minWidth={0}>
                      <Typography style={{ fontSize: 13, fontWeight: 600 }}>
                        {i18n.t("floupPage.step")} {step.order}
                      </Typography>
                      <Typography style={{ fontSize: 11, color: "#888" }} noWrap>
                        {step.message ? step.message.substring(0, 50) + (step.message.length > 50 ? "..." : "") : i18n.t("floupPage.emptyMessage")}
                      </Typography>
                    </Box>
                    {step.timeValue > 0 && (
                      <Chip
                        size="small"
                        icon={<Timer style={{ fontSize: 12 }} />}
                        label={getTimeLabel(step.timeValue, step.timeUnit)}
                        style={{ height: 22, fontSize: 10 }}
                      />
                    )}
                    {step.mediaUrl && step.mediaUrl.trim() && !step.mediaUrl.includes("__UPLOADING__") && (
                      <AttachFile style={{ fontSize: 14, color: "#999" }} />
                    )}
                    <Box display="flex" gap={0.5}>
                      <IconButton size="small" onClick={(e) => { e.stopPropagation(); moveStep(idx, -1); }} disabled={idx === 0}>
                        <ArrowBack style={{ fontSize: 14 }} />
                      </IconButton>
                      <IconButton size="small" onClick={(e) => { e.stopPropagation(); moveStep(idx, 1); }} disabled={idx === form.steps.length - 1}>
                        <ArrowForward style={{ fontSize: 14 }} />
                      </IconButton>
                    </Box>
                  </div>

                  {isExpanded && (
                    <div className={classes.stepBody}>
                      <Grid container spacing={2}>
                        <Grid item xs={12}>
                          <TextField
                            fullWidth
                            label={i18n.t("floupPage.message")}
                            value={step.message}
                            onChange={e => updateStep(idx, "message", e.target.value)}
                            multiline
                            rows={3}
                            variant="outlined"
                            inputProps={{ maxLength: 500 }}
                            helperText={
                              <Box display="flex" justifyContent="space-between">
                                <span style={{ fontSize: 10, color: "#999" }}>
                                  {i18n.t("floupPage.variablesHint")}
                                </span>
                                <span>{(step.message || "").length}/500</span>
                              </Box>
                            }
                          />
                        </Grid>
                        <Grid item xs={6}>
                          <TextField
                            fullWidth
                            type="number"
                            label={i18n.t("floupPage.interval")}
                            value={step.timeValue || 0}
                            onChange={e => updateStep(idx, "timeValue", parseInt(e.target.value || "0"))}
                            inputProps={{ min: 0 }}
                            variant="outlined"
                            size="small"
                          />
                        </Grid>
                        <Grid item xs={6}>
                          <FormControl fullWidth variant="outlined" size="small">
                            <InputLabel>{i18n.t("floupPage.unit")}</InputLabel>
                            <Select value={step.timeUnit || "minutes"} onChange={e => updateStep(idx, "timeUnit", e.target.value)} label={i18n.t("floupPage.unit")}>
                              <MenuItem value="minutes">{i18n.t("floupPage.minutesLabel")}</MenuItem>
                              <MenuItem value="hours">{i18n.t("floupPage.hoursLabel")}</MenuItem>
                              <MenuItem value="days">{i18n.t("floupPage.daysLabel")}</MenuItem>
                              <MenuItem value="weeks">{i18n.t("floupPage.weeksLabel")}</MenuItem>
                              <MenuItem value="months">{i18n.t("floupPage.monthsLabel")}</MenuItem>
                            </Select>
                          </FormControl>
                        </Grid>
                        <Grid item xs={12}>
                          <Typography variant="caption" style={{ fontWeight: 500 }}>{i18n.t("floupPage.attachment")}</Typography>
                          <Box display="flex" alignItems="center" gap={1} mt={0.5}>
                            <FormControl size="small" variant="outlined" style={{ minWidth: 90 }}>
                              <Select value={step.mediaType || "url"} onChange={e => updateStep(idx, "mediaType", e.target.value)}>
                                <MenuItem value="url">Link</MenuItem>
                                <MenuItem value="upload">Upload</MenuItem>
                              </Select>
                            </FormControl>
                            {step.mediaType === "url" ? (
                              <TextField
                                size="small"
                                variant="outlined"
                                placeholder={i18n.t("floupPage.pasteUrl")}
                                value={step.mediaUrl || ""}
                                onChange={e => updateStep(idx, "mediaUrl", e.target.value)}
                                style={{ flex: 1 }}
                                InputProps={{
                                  startAdornment: <InputAdornment position="start"><InsertLink style={{ fontSize: 14 }} /></InputAdornment>,
                                  endAdornment: step.mediaUrl ? (
                                    <IconButton size="small" onClick={() => updateStep(idx, "mediaUrl", "")}>
                                      <Delete style={{ fontSize: 14 }} />
                                    </IconButton>
                                  ) : null,
                                }}
                              />
                            ) : (
                              <>
                                <input
                                  accept="image/*,video/*,audio/*,.pdf,.doc,.docx,.txt"
                                  style={{ display: 'none' }}
                                  id={`file-upload-${idx}`}
                                  type="file"
                                  onChange={async (e) => {
                                    const file = e.target.files[0];
                                    if (file) {
                                      updateStep(idx, "mediaUrl", `__UPLOADING__ ${file.name}`);
                                      const uploadedUrl = await uploadFile(file);
                                      if (uploadedUrl) {
                                        updateStep(idx, "mediaUrl", uploadedUrl);
                                      } else {
                                        updateStep(idx, "mediaUrl", "");
                                        alert(i18n.t("floupPage.uploadError"));
                                      }
                                    }
                                    e.target.value = '';
                                  }}
                                />
                                {!step.mediaUrl || step.mediaUrl.includes('__UPLOADING__') ? (
                                  <label htmlFor={`file-upload-${idx}`}>
                                    <Button variant="outlined" component="span" startIcon={<CloudUpload />} size="small">
                                      {i18n.t("floupPage.choose")}
                                    </Button>
                                  </label>
                                ) : (
                                  <Box display="flex" alignItems="center" gap={0.5} style={{ background: "#f5f5f5", padding: "4px 8px", borderRadius: 6, flex: 1 }}>
                                    <AttachFile style={{ fontSize: 14 }} />
                                    <Typography style={{ fontSize: 11, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", flex: 1 }}>
                                      {step.mediaUrl.split('/').pop()}
                                    </Typography>
                                    <IconButton size="small" onClick={async () => {
                                      await deleteFile(step.mediaUrl);
                                      updateStep(idx, "mediaUrl", "");
                                    }}>
                                      <Delete style={{ fontSize: 14 }} />
                                    </IconButton>
                                  </Box>
                                )}
                              </>
                            )}
                          </Box>
                        </Grid>
                        <Grid item xs={12}>
                          <Box display="flex" justifyContent="flex-end">
                            <Button onClick={() => removeStep(idx)} startIcon={<Delete />} color="secondary" size="small">
                              {i18n.t("floupPage.removeStep")}
                            </Button>
                          </Box>
                        </Grid>
                      </Grid>
                    </div>
                  )}
                </Card>
              </React.Fragment>
            );
          })}
          <Box mt={1}>
            <Button onClick={addStep} startIcon={<Add />} variant="outlined" color="primary" fullWidth style={{ borderRadius: 10, borderStyle: "dashed" }}>
              {i18n.t("floupPage.addStep")}
            </Button>
          </Box>
        </Grid>

        {/* WhatsApp Preview */}
        <Grid item xs={12} md={5}>
          <Typography style={{ fontSize: 12, fontWeight: 600, marginBottom: 8, color: "#666" }}>
            <WhatsApp style={{ fontSize: 14, verticalAlign: "middle", color: "#25d366", marginRight: 4 }} />
            {i18n.t("floupPage.conversationPreview")}
          </Typography>
          <div className={classes.whatsappPreview}>
            {form.steps.length === 0 ? (
              <Typography style={{ fontSize: 12, color: "#999", textAlign: "center", padding: 20 }}>
                {i18n.t("floupPage.addStepsForPreview")}
              </Typography>
            ) : (
              form.steps.map((step, idx) => (
                <Box key={idx} mb={1}>
                  {idx > 0 && step.timeValue > 0 && (
                    <Box display="flex" justifyContent="center" mb={1}>
                      <Chip
                        size="small"
                        icon={<Timer style={{ fontSize: 10 }} />}
                        label={`${i18n.t("floupPage.afterLabel")} ${getTimeLabel(step.timeValue, step.timeUnit)}`}
                        style={{ height: 18, fontSize: 9, background: "rgba(255,255,255,0.8)" }}
                      />
                    </Box>
                  )}
                  {step.mediaUrl && step.mediaUrl.trim() && !step.mediaUrl.includes("__UPLOADING__") && (
                    <Box mb={0.5}>
                      {isImageFile(step.mediaUrl) ? (
                        <img src={step.mediaUrl} alt="" style={{ width: "100%", maxWidth: 200, borderRadius: 8 }} onError={e => e.target.style.display = 'none'} />
                      ) : (
                        <Chip size="small" icon={<AttachFile style={{ fontSize: 10 }} />} label={i18n.t("floupPage.fileLabel")} style={{ height: 18, fontSize: 9 }} />
                      )}
                    </Box>
                  )}
                  <div className={classes.whatsappBubble}>
                    <Typography style={{ fontSize: 12, lineHeight: 1.4, whiteSpace: "pre-wrap", color: "#111" }}>
                      {step.message || "..."}
                    </Typography>
                    <Typography className={classes.whatsappTime} style={{ color: "#667781" }}>
                      {new Date().getHours()}:{String(new Date().getMinutes()).padStart(2, '0')} ✓✓
                    </Typography>
                  </div>
                </Box>
              ))
            )}
          </div>
        </Grid>
      </Grid>
    </Box>
  );

  const renderStopControls = () => (
    <Box>
      <div className={classes.infoBox} style={{ background: "#fef3c7", border: "1px solid #fcd34d" }}>
        <CheckCircle style={{ color: "#d97706", fontSize: 18, marginTop: 2 }} />
        <Typography style={{ fontSize: 12, color: "#92400e" }}>
          {i18n.t("floupPage.stopControlsDesc")}
        </Typography>
      </div>
      <div className={classes.stopCard}>
        <Grid container spacing={2}>
          <Grid item xs={12}>
            <FormControlLabel
              control={
                <Switch
                  checked={form.stopConditions?.some(c => c.type === 'anyMessage') || false}
                  onChange={e => {
                    const sc = form.stopConditions || [];
                    if (e.target.checked) {
                      if (!sc.some(c => c.type === 'anyMessage')) setForm({ ...form, stopConditions: [...sc, { type: 'anyMessage', enabled: true }] });
                    } else {
                      setForm({ ...form, stopConditions: sc.filter(c => c.type !== 'anyMessage') });
                    }
                  }}
                  color="primary"
                />
              }
              label={<Typography style={{ fontSize: 13 }}>{i18n.t("floupPage.stopAnyMessage")}</Typography>}
            />
          </Grid>
          <Grid item xs={12}>
            <FormControlLabel
              control={
                <Switch
                  checked={form.stopConditions?.some(c => c.type === 'keyword') || false}
                  onChange={e => {
                    const sc = form.stopConditions || [];
                    if (e.target.checked) {
                      if (!sc.some(c => c.type === 'keyword')) setForm({ ...form, stopConditions: [...sc, { type: 'keyword', enabled: true, keyword: '' }] });
                    } else {
                      setForm({ ...form, stopConditions: sc.filter(c => c.type !== 'keyword') });
                    }
                  }}
                  color="primary"
                />
              }
              label={<Typography style={{ fontSize: 13 }}>{i18n.t("floupPage.stopKeyword")}</Typography>}
            />
            {form.stopConditions?.some(c => c.type === 'keyword') && (
              <TextField
                fullWidth
                size="small"
                variant="outlined"
                label={i18n.t("floupPage.keyword")}
                value={form.stopConditions.find(c => c.type === 'keyword')?.keyword || ''}
                onChange={e => {
                  const sc = [...(form.stopConditions || [])];
                  const kw = sc.find(c => c.type === 'keyword');
                  if (kw) { kw.keyword = e.target.value; setForm({ ...form, stopConditions: sc }); }
                }}
                placeholder={i18n.t("floupPage.keywordPlaceholder")}
                style={{ marginTop: 8, marginLeft: 40 }}
              />
            )}
          </Grid>
          <Grid item xs={12}>
            <FormControlLabel
              control={
                <Switch
                  checked={form.stopConditions?.some(c => c.type === 'ticketClosed') || false}
                  onChange={e => {
                    const sc = form.stopConditions || [];
                    if (e.target.checked) {
                      if (!sc.some(c => c.type === 'ticketClosed')) setForm({ ...form, stopConditions: [...sc, { type: 'ticketClosed', enabled: true }] });
                    } else {
                      setForm({ ...form, stopConditions: sc.filter(c => c.type !== 'ticketClosed') });
                    }
                  }}
                  color="primary"
                />
              }
              label={<Typography style={{ fontSize: 13 }}>{i18n.t("floupPage.stopTicketClosed")}</Typography>}
            />
          </Grid>
        </Grid>
      </div>
    </Box>
  );

  const canProceed = () => {
    switch (wizardStep) {
      case 0: return !!form.name.trim();
      case 1: return true;
      case 2: return form.steps.length > 0;
      case 3: return true;
      default: return true;
    }
  };

  return (
    <Box className={classes.root}>
      {/* Header */}
      <div className={classes.header}>
        <div className={classes.titleArea}>
          <div className={classes.titleIcon}>
            <Schedule />
          </div>
          <Box>
            <Typography variant="h5" style={{ fontWeight: 700 }}>{i18n.t("floupPage.title")}</Typography>
            <Typography variant="body2" color="textSecondary" style={{ fontSize: 12 }}>
              {i18n.t("floupPage.subtitle")}
            </Typography>
          </Box>
        </div>
        <Button
          variant="contained"
          color="primary"
          startIcon={<Add />}
          onClick={() => { resetForm(); setOpen(true); }}
          style={{ borderRadius: 10, textTransform: "none", fontWeight: 600 }}
        >
          {i18n.t("floupPage.newTemplate")}
        </Button>
      </div>

      {/* Status filters */}
      {(() => {
        const counts = {
          active: floups.filter(f => f.isActive && (f.steps || []).length > 0).length,
          error: floups.filter(f => (f.steps || []).length === 0).length,
          paused: floups.filter(f => !f.isActive).length,
          all: floups.length,
        };
        const filters = [
          { key: "active", label: i18n.t("floupPage.filterActive"), count: counts.active },
          { key: "error", label: i18n.t("floupPage.filterError"), count: counts.error },
          { key: "paused", label: i18n.t("floupPage.filterPaused"), count: counts.paused },
          { key: "all", label: i18n.t("floupPage.filterAll"), count: counts.all },
        ];
        return (
          <Box marginBottom={2}>
            <ButtonGroup size="small" variant="outlined">
              {filters.map(f => (
                <Button
                  key={f.key}
                  onClick={() => setStatusFilter(f.key)}
                  variant={statusFilter === f.key ? "contained" : "outlined"}
                  color={statusFilter === f.key ? "primary" : "default"}
                  style={{ textTransform: "none", fontWeight: 600 }}
                >
                  {f.label} ({f.count})
                </Button>
              ))}
            </ButtonGroup>
          </Box>
        );
      })()}

      {/* Floup List */}
      <Paper className={classes.floupList} variant="outlined">
        <List disablePadding>
          {(() => {
            const filteredFloups = floups.filter(f => {
              if (statusFilter === "all") return true;
              if (statusFilter === "active") return f.isActive && (f.steps || []).length > 0;
              if (statusFilter === "error") return (f.steps || []).length === 0;
              if (statusFilter === "paused") return !f.isActive;
              return true;
            });
            return filteredFloups.length === 0 ? (
            <Box display="flex" flexDirection="column" alignItems="center" py={4} style={{ color: "#999" }}>
              <Schedule style={{ fontSize: 48, marginBottom: 8, opacity: 0.3 }} />
              <Typography>{i18n.t("floupPage.noFlowsYet")}</Typography>
            </Box>
          ) : (
            filteredFloups.map((f, idx) => (
              <React.Fragment key={f.id}>
                <ListItem className={classes.floupItem}>
                  <ListItemText
                    primary={
                      <Typography style={{ fontWeight: 600, fontSize: 15 }}>{f.name}</Typography>
                    }
                    secondary={
                      <div className={classes.floupInfo}>
                        {f.description && (
                          <Typography variant="body2" color="textSecondary" style={{ fontSize: 12 }}>{f.description}</Typography>
                        )}
                        <div className={classes.floupMeta}>
                          <Chip label={f.templateType || "personalizado"} size="small" style={{ height: 20, fontSize: 10 }} color="primary" variant="outlined" />
                          <Chip label={`${(f.steps || []).length} ${i18n.t("floupPage.stepsCount")}`} size="small" style={{ height: 20, fontSize: 10 }} />
                          <Chip
                            icon={f.isActive ? <CheckCircle style={{ fontSize: 12 }} /> : undefined}
                            label={f.isActive ? i18n.t("floupPage.active") : i18n.t("floupPage.inactive")}
                            size="small"
                            style={{
                              height: 20, fontSize: 10,
                              backgroundColor: f.isActive ? "#d1fae5" : "#fee2e2",
                              color: f.isActive ? "#065f46" : "#991b1b",
                            }}
                          />
                          {f.condition && (
                            <Chip
                              label={`${f.condition === "queue" ? i18n.t("floupPage.queueLabel") : f.condition === "tag" ? i18n.t("floupPage.tagLabel") : i18n.t("floupPage.interactionLabel")}: ${f.conditionValue || "—"}`}
                              size="small"
                              style={{ height: 20, fontSize: 10 }}
                              variant="outlined"
                            />
                          )}
                        </div>
                      </div>
                    }
                  />
                  <ListItemSecondaryAction>
                    <Tooltip title={i18n.t("floupPage.edit")}>
                      <IconButton onClick={() => {
                        setForm({
                          id: f.id, name: f.name, description: f.description,
                          templateType: f.templateType || "personalizado",
                          condition: f.condition || "queue",
                          conditionValue: f.conditionValue || "",
                          steps: f.steps || [],
                          stopConditions: f.stopConditions || [],
                          pauseConditions: f.pauseConditions || []
                        });
                        setWizardStep(0);
                        setOpen(true);
                      }}>
                        <Edit />
                      </IconButton>
                    </Tooltip>
                    <Tooltip title={i18n.t("floupPage.duplicate")}>
                      <IconButton onClick={() => handleDuplicate(f.id)}><FileCopy /></IconButton>
                    </Tooltip>
                    <Tooltip title={i18n.t("floupPage.delete")}>
                      <IconButton onClick={() => handleDelete(f.id)}><Delete /></IconButton>
                    </Tooltip>
                  </ListItemSecondaryAction>
                </ListItem>
                {idx < filteredFloups.length - 1 && <Divider />}
              </React.Fragment>
            ))
            );
          })()}
        </List>
      </Paper>

      {/* Wizard Dialog */}
      <Dialog
        open={open}
        onClose={() => setOpen(false)}
        maxWidth="lg"
        fullWidth
        classes={{ paper: classes.dialogPaper }}
      >
        <div className={classes.dialogHeader}>
          <Box display="flex" alignItems="center" justifyContent="space-between">
            <Box display="flex" alignItems="center" gap={1}>
              <Schedule />
              <Typography variant="h6" style={{ fontWeight: 600 }}>
                {form.id ? i18n.t("floupPage.editTemplate") : i18n.t("floupPage.newTemplate")}
              </Typography>
            </Box>
            <IconButton size="small" onClick={() => setOpen(false)} style={{ color: "#fff" }}>
              <Close />
            </IconButton>
          </Box>
          {/* Wizard Steps indicator */}
          <Box display="flex" gap={1} mt={1.5}>
            {wizardSteps.map((ws, idx) => (
              <Chip
                key={idx}
                icon={ws.icon}
                label={ws.label}
                size="small"
                onClick={() => setWizardStep(idx)}
                style={{
                  backgroundColor: wizardStep === idx ? "rgba(255,255,255,0.25)" : "rgba(255,255,255,0.1)",
                  color: "#fff",
                  fontWeight: wizardStep === idx ? 700 : 400,
                  fontSize: 11,
                  cursor: "pointer",
                  border: wizardStep === idx ? "1px solid rgba(255,255,255,0.5)" : "1px solid transparent",
                }}
              />
            ))}
          </Box>
        </div>
        <DialogContent style={{ padding: 24 }}>
          {renderWizardContent()}
        </DialogContent>
        <DialogActions style={{ padding: "12px 24px", borderTop: `1px solid ${theme.palette.divider}` }}>
          <Box display="flex" justifyContent="space-between" width="100%">
            <Button
              onClick={() => setWizardStep(prev => Math.max(0, prev - 1))}
              disabled={wizardStep === 0}
              startIcon={<ArrowBack />}
            >
              {i18n.t("floupPage.previous")}
            </Button>
            <Box display="flex" gap={1}>
              <Button onClick={() => setOpen(false)}>{i18n.t("floupPage.cancel")}</Button>
              {wizardStep < wizardSteps.length - 1 ? (
                <Button
                  variant="contained"
                  color="primary"
                  onClick={() => setWizardStep(prev => prev + 1)}
                  endIcon={<ArrowForward />}
                  disabled={!canProceed()}
                  style={{ borderRadius: 8 }}
                >
                  {i18n.t("floupPage.next")}
                </Button>
              ) : (
                <Button
                  variant="contained"
                  color="primary"
                  onClick={handleSave}
                  startIcon={<Save />}
                  disabled={!form.name || form.steps.length === 0}
                  style={{ borderRadius: 8 }}
                >
                  {i18n.t("floupPage.saveTemplate")}
                </Button>
              )}
            </Box>
          </Box>
        </DialogActions>
      </Dialog>

      {/* Delete Confirmation */}
      <Dialog open={deleteConfirmOpen} onClose={() => { setDeleteConfirmOpen(false); setFloupToDelete(null); }}>
        <DialogTitle>{i18n.t("floupPage.confirmDeleteTitle")}</DialogTitle>
        <DialogContent>
          <Typography>
            {i18n.t("floupPage.confirmDeleteMessage")} <strong>"{floupToDelete?.name}"</strong>?
            <br /><br />
            {i18n.t("floupPage.confirmDeleteWarning")}
          </Typography>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => { setDeleteConfirmOpen(false); setFloupToDelete(null); }} color="primary">
            {i18n.t("floupPage.cancel")}
          </Button>
          <Button onClick={confirmDelete} color="secondary" variant="contained" startIcon={<Delete />}>
            {i18n.t("floupPage.delete")}
          </Button>
        </DialogActions>
      </Dialog>
    </Box>
  );
};

export default FloupPage;
