import React, { useEffect, useState } from "react";
import { makeStyles } from "@material-ui/core/styles";
import Dialog from "@material-ui/core/Dialog";
import DialogTitle from "@material-ui/core/DialogTitle";
import DialogContent from "@material-ui/core/DialogContent";
import DialogActions from "@material-ui/core/DialogActions";
import Button from "@material-ui/core/Button";
import TextField from "@material-ui/core/TextField";
import Typography from "@material-ui/core/Typography";
import Grid from "@material-ui/core/Grid";
import Alert from "@material-ui/lab/Alert";
import { i18n } from "../../translate/i18n";

const useStyles = makeStyles((theme) => ({
  content: {
    padding: theme.spacing(2.5),
  },
  fieldGroup: {
    display: "flex",
    flexDirection: "column",
    gap: theme.spacing(2),
  },
  sectionTitle: {
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(1),
    color: theme.palette.text.secondary,
    marginTop: theme.spacing(0.5),
    "&::before, &::after": {
      content: '""',
      flex: 1,
      borderTop: `1px solid ${theme.palette.divider}`,
    },
  },
  multilineInput: {
    resize: "vertical",
    minHeight: 64,
    maxHeight: 180,
    overflow: "auto",
  },
}));

const DEFAULT = {
  summary: "Atendimento {{nome}}",
  description: "",
  dateVar: "data",
  timeVar: "hora",
  professionalVar: "profissional",
  customerEmailVar: "email",
  durationMinutes: 30,
  calendarId: "",
  timezone: "America/Sao_Paulo",
  saveResponseVar: "googleEvent",
  confirmationMessage:
    "Seu agendamento foi confirmado! ✅\nLink: {{googleEventLink}}",
};

const t = (key, fallback) => {
  try {
    const v = i18n.t(`flowBuilderGoogleCalendarModal.${key}`, fallback);
    return v && v !== `flowBuilderGoogleCalendarModal.${key}` ? v : fallback;
  } catch (_e) {
    return fallback;
  }
};

const FlowBuilderGoogleCalendarModal = ({ open, onSave, data, onUpdate, close }) => {
  const classes = useStyles();
  const [form, setForm] = useState(DEFAULT);

  useEffect(() => {
    if (open === "edit" && data) {
      setForm({ ...DEFAULT, ...(data.data || {}) });
    } else if (open === "create") {
      setForm({ ...DEFAULT });
    }
  }, [open, data]);

  const handleChange = (field) => (e) => {
    const value = e?.target?.value ?? "";
    setForm((f) => ({ ...f, [field]: value }));
  };

  const handleClose = () => close(null);

  const handleSubmit = () => {
    if (open === "edit") {
      onUpdate({ ...data, data: { ...form, label: "Google Agenda" } });
    } else {
      onSave({ ...form, label: "Google Agenda" });
    }
    close(null);
  };

  return (
    <Dialog open={!!open} onClose={handleClose} fullWidth maxWidth="sm" scroll="paper">
      <DialogTitle>
        {open === "edit"
          ? t("editTitle", "Editar Agendamento Google")
          : t("addTitle", "Adicionar Agendamento Google")}
      </DialogTitle>
      <DialogContent dividers className={classes.content}>
        <Alert severity="info" style={{ marginBottom: 16 }}>
          {t(
            "infoAlert",
            'Coleta as variáveis de data e hora antes deste nó (use o nó Pergunta). Variáveis aceitam o formato 15/06/2026, 15:30, "hoje", "amanhã".'
          )}
        </Alert>
        <div className={classes.fieldGroup}>
          <TextField
            label={t("eventTitle", "Título do evento")}
            value={form.summary || ""}
            onChange={handleChange("summary")}
            helperText={t("eventTitleHelper", "Use {{variavel}} para inserir dados coletados")}
            fullWidth
          />
          <TextField
            label={t("description", "Descrição")}
            value={form.description || ""}
            onChange={handleChange("description")}
            multiline
            rows={3}
            InputProps={{ classes: { inputMultiline: classes.multilineInput } }}
            fullWidth
          />
          <div className={classes.sectionTitle}>
            <Typography variant="caption">{t("flowVariables", "Variáveis do fluxo")}</Typography>
          </div>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <TextField
                label={t("dateVar", "Variável da data")}
                value={form.dateVar || ""}
                onChange={handleChange("dateVar")}
                helperText={t("dateVarHelper", "Ex.: data")}
                fullWidth
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label={t("timeVar", "Variável da hora")}
                value={form.timeVar || ""}
                onChange={handleChange("timeVar")}
                helperText={t("timeVarHelper", "Ex.: hora")}
                fullWidth
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label={t("professionalVar", "Variável do profissional (opcional)")}
                value={form.professionalVar || ""}
                onChange={handleChange("professionalVar")}
                fullWidth
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label={t("customerEmailVar", "Variável do e-mail do cliente (opcional)")}
                value={form.customerEmailVar || ""}
                onChange={handleChange("customerEmailVar")}
                fullWidth
              />
            </Grid>
          </Grid>
          <div className={classes.sectionTitle}>
            <Typography variant="caption">{t("event", "Evento")}</Typography>
          </div>
          <Grid container spacing={2}>
            <Grid item xs={12} sm={6}>
              <TextField
                label={t("duration", "Duração (minutos)")}
                type="number"
                value={form.durationMinutes ?? 30}
                onChange={handleChange("durationMinutes")}
                fullWidth
              />
            </Grid>
            <Grid item xs={12} sm={6}>
              <TextField
                label={t("timezone", "Fuso horário")}
                value={form.timezone || ""}
                onChange={handleChange("timezone")}
                fullWidth
              />
            </Grid>
          </Grid>
          <TextField
            label={t("calendarId", "Calendar ID (vazio = padrão da empresa)")}
            value={form.calendarId || ""}
            onChange={handleChange("calendarId")}
            fullWidth
          />
          <TextField
            label={t("saveResponseVar", "Nome da variável de saída")}
            value={form.saveResponseVar || ""}
            onChange={handleChange("saveResponseVar")}
            helperText={t(
              "saveResponseVarHelper",
              "Gera {nome}Id e {nome}Link para próximos nós"
            )}
            fullWidth
          />
          <TextField
            label={t(
              "confirmationMessage",
              "Mensagem de confirmação ao cliente (opcional)"
            )}
            value={form.confirmationMessage || ""}
            onChange={handleChange("confirmationMessage")}
            multiline
            rows={3}
            InputProps={{ classes: { inputMultiline: classes.multilineInput } }}
            helperText={t(
              "confirmationMessageHelper",
              "Use {{googleEventLink}} para o link do evento"
            )}
            fullWidth
          />
        </div>
      </DialogContent>
      <DialogActions>
        <Button onClick={handleClose}>{t("cancel", "Cancelar")}</Button>
        <Button variant="contained" onClick={handleSubmit}>
          {t("save", "Salvar")}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default FlowBuilderGoogleCalendarModal;
