import React, { useState, useEffect, useContext } from "react";
import { toast } from "react-toastify";
import { makeStyles } from "@material-ui/core/styles";
import { Paper, Typography, Switch, FormControlLabel, TextField, Button, Grid, Box, IconButton, Collapse, Select, MenuItem, FormControl, InputLabel } from "@material-ui/core";
import PersonIcon from "@material-ui/icons/Person";
import PhoneIcon from "@material-ui/icons/Phone";
import ScheduleIcon from "@material-ui/icons/Schedule";
import ExpandMoreIcon from "@material-ui/icons/ExpandMore";
import SaveIcon from "@material-ui/icons/Save";
import TestIcon from "@material-ui/icons/Settings";
import InfoIcon from "@material-ui/icons/Info";
import { i18n } from "../../translate/i18n";
import api from "../../services/api";
import { WhatsAppsContext } from "../../context/WhatsApp/WhatsAppsContext";

const useStyles = makeStyles((theme) => ({
  root: {
    padding: theme.spacing(3)
  },
  paper: {
    padding: theme.spacing(3),
    marginBottom: theme.spacing(2)
  },
  sectionTitle: {
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(1),
    marginBottom: theme.spacing(2),
    color: theme.palette.primary.main,
    fontWeight: 600
  },
  settingItem: {
    marginBottom: theme.spacing(2)
  },
  messageField: {
    marginTop: theme.spacing(1)
  },
  timeField: {
    maxWidth: 200
  },
  saveButton: {
    background: "linear-gradient(135deg, #1976d2 0%, #1565c0 100%)",
    color: "white",
    fontWeight: 600,
    textTransform: "none",
    borderRadius: 8,
    padding: theme.spacing(1, 3),
    "&:hover": {
      transform: "translateY(-1px)",
      boxShadow: "0 4px 12px rgba(25, 118, 210, 0.3)"
    }
  },
  testButton: {
    background: "linear-gradient(135deg, #ff9800 0%, #f57c00 100%)",
    color: "white",
    fontWeight: 600,
    textTransform: "none",
    borderRadius: 8,
    marginLeft: theme.spacing(1),
    "&:hover": {
      transform: "translateY(-1px)",
      boxShadow: "0 4px 12px rgba(255, 152, 0, 0.3)"
    }
  },
  expandButton: {
    transform: "rotate(0deg)",
    transition: theme.transitions.create("transform", {
      duration: theme.transitions.duration.shortest
    })
  },
  expandButtonOpen: {
    transform: "rotate(180deg)"
  },
  helpText: {
    fontSize: "0.875rem",
    color: theme.palette.text.secondary,
    marginTop: theme.spacing(0.5)
  },
  messagePreview: {
    backgroundColor: theme.palette.grey[100],
    padding: theme.spacing(2),
    borderRadius: 8,
    marginTop: theme.spacing(1),
    border: `1px solid ${theme.palette.grey[300]}`
  },
  variableChip: {
    backgroundColor: theme.palette.primary.main,
    color: "white",
    padding: "2px 8px",
    borderRadius: 4,
    fontSize: "0.75rem",
    fontFamily: "monospace",
    margin: "0 2px"
  },
  infoBox: {
    backgroundColor: "#e3f2fd",
    border: "1px solid #90caf9",
    borderRadius: 8,
    padding: theme.spacing(2),
    marginTop: theme.spacing(2),
    display: "flex",
    alignItems: "flex-start",
    gap: theme.spacing(1)
  },
  infoIcon: {
    color: "#1976d2",
    fontSize: "1.25rem",
    marginTop: 2
  },
  infoContent: {
    flex: 1
  }
}));

const BirthdaySettings = () => {
  const classes = useStyles();
  const { whatsApps } = useContext(WhatsAppsContext);
  const [settings, setSettings] = useState(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [expandedSections, setExpandedSections] = useState({
    user: true,
    contact: true,
    general: true
  });

  useEffect(() => {
    fetchSettings();
  }, []);

  const fetchSettings = async () => {
    try {
      const { data } = await api.get("/birthdays/settings");
      setSettings(data.data);
    } catch (error) {
      toast.error(i18n.t("birthdaySettings.toasts.loadError"));
    } finally {
      setLoading(false);
    }
  };

  const handleSettingChange = (field, value) => {
    setSettings(prev => ({
      ...prev,
      [field]: value
    }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.put("/birthdays/settings", settings);
      toast.success(i18n.t("birthdaySettings.toasts.saved"));
    } catch (error) {
      toast.error(i18n.t("birthdaySettings.toasts.saveError"));
    } finally {
      setSaving(false);
    }
  };

  const handleTestMessage = async (messageType) => {
    // Para teste, vamos pedir um contato válido
    const contactId = prompt("Digite o ID de um contato para teste:");
    if (!contactId) return;

    try {
      await api.post("/birthdays/test-message", {
        contactId: parseInt(contactId),
        messageType
      });
      toast.success(i18n.t("birthdaySettings.toasts.testSent"));
    } catch (error) {
      toast.error(i18n.t("birthdaySettings.toasts.testError"));
    }
  };

  const toggleSection = (section) => {
    setExpandedSections(prev => ({
      ...prev,
      [section]: !prev[section]
    }));
  };

  const renderMessagePreview = (message, type) => {
    if (!message) return null;

    let previewMessage = message;
    previewMessage = previewMessage.replace(
      /{nome}/g, 
      `<span class="${classes.variableChip}">João Silva</span>`
    );
    previewMessage = previewMessage.replace(
      /{idade}/g, 
      `<span class="${classes.variableChip}">30</span>`
    );

    return (
      <Box className={classes.messagePreview}>
        <Typography variant="caption" color="textSecondary">
          {i18n.t("birthdaySettings.preview")}
        </Typography>
        <Typography 
          variant="body2" 
          dangerouslySetInnerHTML={{ __html: previewMessage }}
        />
      </Box>
    );
  };

  if (loading) {
    return (
      <Box className={classes.root}>
        <Typography>{i18n.t("birthdaySettings.loading")}</Typography>
      </Box>
    );
  }

  return (
    <Box className={classes.root}>
      <Typography variant="h4" gutterBottom>
        {i18n.t("birthdaySettings.title")}
      </Typography>

      {/* Configurações de Usuários */}
      <Paper className={classes.paper}>
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Typography variant="h6" className={classes.sectionTitle}>
            <PersonIcon />
            {i18n.t("birthdaySettings.userSection")}
          </Typography>
          <IconButton
            className={`${classes.expandButton} ${
              expandedSections.user ? classes.expandButtonOpen : ""
            }`}
            onClick={() => toggleSection("user")}
          >
            <ExpandMoreIcon />
          </IconButton>
        </Box>

        <Collapse in={expandedSections.user}>
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Switch
                    checked={settings?.userBirthdayEnabled || false}
                    onChange={(e) => handleSettingChange("userBirthdayEnabled", e.target.checked)}
                    color="primary"
                  />
                }
                label={i18n.t("birthdaySettings.enableUserNotifications")}
              />
              <Typography className={classes.helpText}>
                {i18n.t("birthdaySettings.enableUserNotificationsHelp")}
              </Typography>
            </Grid>

            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Switch
                    checked={settings?.createAnnouncementForUsers || false}
                    onChange={(e) => handleSettingChange("createAnnouncementForUsers", e.target.checked)}
                    color="primary"
                    disabled={!settings?.userBirthdayEnabled}
                  />
                }
                label={i18n.t("birthdaySettings.createAnnouncementUsers")}
              />
              <Typography className={classes.helpText}>
                {i18n.t("birthdaySettings.createAnnouncementUsersHelp")}
              </Typography>
            </Grid>

            <Grid item xs={12}>
              <TextField
                fullWidth
                multiline
                rows={3}
                label={i18n.t("birthdaySettings.userBirthdayMessage")}
                value={settings?.userBirthdayMessage || ""}
                onChange={(e) => handleSettingChange("userBirthdayMessage", e.target.value)}
                disabled={!settings?.userBirthdayEnabled}
                className={classes.messageField}
                helperText={i18n.t("birthdaySettings.userMessageHelper")}
              />
              {renderMessagePreview(settings?.userBirthdayMessage, "user")}
            </Grid>
          </Grid>
        </Collapse>
      </Paper>

      {/* Configurações de Contatos */}
      <Paper className={classes.paper}>
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Typography variant="h6" className={classes.sectionTitle}>
            <PhoneIcon />
            {i18n.t("birthdaySettings.contactSection")}
          </Typography>
          <IconButton
            className={`${classes.expandButton} ${
              expandedSections.contact ? classes.expandButtonOpen : ""
            }`}
            onClick={() => toggleSection("contact")}
          >
            <ExpandMoreIcon />
          </IconButton>
        </Box>

        <Collapse in={expandedSections.contact}>
          <Grid container spacing={3}>
            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Switch
                    checked={settings?.contactBirthdayEnabled || false}
                    onChange={(e) => handleSettingChange("contactBirthdayEnabled", e.target.checked)}
                    color="primary"
                  />
                }
                label={i18n.t("birthdaySettings.enableContactMessages")}
              />
              <Typography className={classes.helpText}>
                {i18n.t("birthdaySettings.enableContactMessagesHelp")}
              </Typography>
            </Grid>

            <Grid item xs={12}>
              <TextField
                fullWidth
                multiline
                rows={4}
                label={i18n.t("birthdaySettings.contactBirthdayMessage")}
                value={settings?.contactBirthdayMessage || ""}
                onChange={(e) => handleSettingChange("contactBirthdayMessage", e.target.value)}
                disabled={!settings?.contactBirthdayEnabled}
                className={classes.messageField}
                helperText={i18n.t("birthdaySettings.contactMessageHelper")}
              />
              {renderMessagePreview(settings?.contactBirthdayMessage, "contact")}
              
              {settings?.contactBirthdayEnabled && (
                <Button
                  variant="contained"
                  className={classes.testButton}
                  startIcon={<TestIcon />}
                  onClick={() => handleTestMessage("contact")}
                  size="small"
                  style={{ marginTop: 8 }}
                >
                  {i18n.t("birthdaySettings.testMessage")}
                </Button>
              )}
            </Grid>
          </Grid>
        </Collapse>
      </Paper>

      {/* Configurações Gerais */}
      <Paper className={classes.paper}>
        <Box display="flex" alignItems="center" justifyContent="space-between">
          <Typography variant="h6" className={classes.sectionTitle}>
            <ScheduleIcon />
            {i18n.t("birthdaySettings.generalSection")}
          </Typography>
          <IconButton
            className={`${classes.expandButton} ${
              expandedSections.general ? classes.expandButtonOpen : ""
            }`}
            onClick={() => toggleSection("general")}
          >
            <ExpandMoreIcon />
          </IconButton>
        </Box>

        <Collapse in={expandedSections.general}>
          <Grid container spacing={3}>
            <Grid item xs={12} md={6}>
              <TextField
                type="time"
                label={i18n.t("birthdaySettings.sendTime")}
                value={settings?.sendBirthdayTime || "09:00:00"}
                onChange={(e) => {
                  const timeValue = e.target.value;
                  const formattedTime = timeValue ? `${timeValue}:00` : "09:00:00";
                  handleSettingChange("sendBirthdayTime", formattedTime);
                }}
                className={classes.timeField}
                InputLabelProps={{ shrink: true }}
                helperText={i18n.t("birthdaySettings.sendTimeHelper")}
              />
              />
            </Grid>

            <Grid item xs={12} md={6}>
              <FormControl fullWidth>
                <InputLabel>{i18n.t("birthdaySettings.whatsappConnection")}</InputLabel>
             <Select
               value={settings?.whatsappId || ""}
               onChange={(e) => handleSettingChange("whatsappId", e.target.value || null)}
               label={i18n.t("birthdaySettings.whatsappConnection")}
               disabled={!settings?.contactBirthdayEnabled}
             >
                  <MenuItem value="">
                    <em>{i18n.t("birthdaySettings.selectConnection")}</em>
                  </MenuItem>
                  {whatsApps?.length > 0 &&
                    whatsApps.map((whatsapp) => (
                      <MenuItem key={whatsapp.id} value={whatsapp.id}>
                        <Box display="flex" alignItems="center">
                          <Box
                            width={8}
                            height={8}
                            borderRadius="50%"
                            bgcolor={whatsapp.status === "CONNECTED" ? "success.main" : "error.main"}
                            mr={1}
                          />
                          {whatsapp.name} ({whatsapp.status})
                        </Box>
                      </MenuItem>
                    ))}
                </Select>
                <Typography className={classes.helpText}>
                  {i18n.t("birthdaySettings.whatsappConnectionHelp")}
                </Typography>
              </FormControl>
            </Grid>

            <Grid item xs={12}>
              <FormControlLabel
                control={
                  <Switch
                    checked={settings?.createAnnouncementForUsers || false}
                    onChange={(e) => handleSettingChange("createAnnouncementForUsers", e.target.checked)}
                    color="primary"
                  />
                }
                label={i18n.t("birthdaySettings.createInternalAnnouncement")}
              />
              <Typography className={classes.helpText}>
                {i18n.t("birthdaySettings.createInternalAnnouncementHelp")}
              </Typography>
            </Grid>
          </Grid>

          <Box className={classes.infoBox}>
            <InfoIcon className={classes.infoIcon} />
            <Box className={classes.infoContent}>
              <Typography variant="body2" style={{ fontWeight: 600, marginBottom: 8 }}>
                {i18n.t("birthdaySettings.availableVariables")}
              </Typography>
              <Typography variant="body2" component="div">
                • <code>{"{nome}"}</code> - {i18n.t("birthdaySettings.varName")}<br/>
                • <code>{"{idade}"}</code> - {i18n.t("birthdaySettings.varAge")}
              </Typography>
            </Box>
          </Box>
        </Collapse>
      </Paper>

      {/* Botão Salvar */}
      <Box textAlign="center" mt={3}>
        <Button
          variant="contained"
          className={classes.saveButton}
          startIcon={<SaveIcon />}
          onClick={handleSave}
          disabled={saving}
          size="large"
        >
          {saving ? i18n.t("birthdaySettings.saving") : i18n.t("birthdaySettings.saveSettings")}
        </Button>
      </Box>
    </Box>
  );
};

export default BirthdaySettings;