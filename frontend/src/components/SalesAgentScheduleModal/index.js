import React, { useEffect, useState } from "react";
import { makeStyles } from "@material-ui/core/styles";
import Dialog from "@material-ui/core/Dialog";
import DialogTitle from "@material-ui/core/DialogTitle";
import DialogContent from "@material-ui/core/DialogContent";
import DialogActions from "@material-ui/core/DialogActions";
import Button from "@material-ui/core/Button";
import TextField from "@material-ui/core/TextField";
import Typography from "@material-ui/core/Typography";
import CircularProgress from "@material-ui/core/CircularProgress";
import { CalendarClock, Video, Check } from "lucide-react";

import { toast } from "react-toastify";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import { i18n } from "../../translate/i18n";

/**
 * Agendamento a partir do atendimento.
 *
 * Os horários vêm da agenda de verdade, via `freebusy` do Google. Nada é
 * sugerido sem consulta: marcar reunião que não está na agenda é o pior
 * desfecho possível, porque o cliente aparece e não há nada marcado.
 *
 * Se a consulta não retornar horário nenhum, a tela diz isso claramente em
 * vez de mostrar uma lista vazia sem explicação.
 */

const useStyles = makeStyles(theme => ({
  titulo: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    fontWeight: 700,
    fontSize: 18,
  },
  ajuda: {
    fontSize: 13,
    color: theme.palette.text.secondary,
    marginBottom: theme.spacing(2),
    lineHeight: 1.55,
  },
  horarios: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(200px, 1fr))",
    gap: theme.spacing(1.2),
    marginBottom: theme.spacing(2),
  },
  horario: {
    padding: "12px 14px",
    borderRadius: 10,
    border: `1px solid ${theme.palette.divider}`,
    cursor: "pointer",
    fontSize: 13.5,
    textAlign: "left",
    background: "transparent",
    fontFamily: "inherit",
    color: theme.palette.text.primary,
    display: "flex",
    alignItems: "center",
    gap: 8,
    "&:hover": { borderColor: "#2563eb" },
  },
  selecionado: {
    borderColor: "#2563eb",
    borderWidth: 2,
    backgroundColor:
      theme.palette.type === "dark"
        ? "rgba(37,99,235,0.14)"
        : "rgba(37,99,235,0.06)",
  },
  vazio: {
    padding: theme.spacing(4),
    textAlign: "center",
    color: theme.palette.text.secondary,
    fontSize: 13,
    lineHeight: 1.6,
  },
  confirmado: {
    padding: theme.spacing(2),
    borderRadius: 10,
    backgroundColor: "rgba(34,197,94,0.10)",
    border: "1px solid rgba(34,197,94,0.35)",
    fontSize: 13.5,
    lineHeight: 1.7,
  },
  link: {
    display: "inline-flex",
    alignItems: "center",
    gap: 6,
    color: "#2563eb",
    wordBreak: "break-all",
  },
}));

const SalesAgentScheduleModal = ({ open, onClose, ticketId }) => {
  const classes = useStyles();

  const [horarios, setHorarios] = useState([]);
  const [escolhido, setEscolhido] = useState(null);
  const [observacao, setObservacao] = useState("");
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [resultado, setResultado] = useState(null);

  useEffect(() => {
    if (!open) return;

    setEscolhido(null);
    setObservacao("");
    setResultado(null);
    setCarregando(true);

    api
      .get("/sales-agents/slots")
      .then(({ data }) => setHorarios(Array.isArray(data) ? data : []))
      .catch(() => setHorarios([]))
      .finally(() => setCarregando(false));
  }, [open]);

  const agendar = async () => {
    if (!escolhido) return;

    setSalvando(true);
    try {
      const { data } = await api.post("/sales-agents/schedule", {
        ticketId,
        startISO: escolhido.inicio,
        observacao: observacao.trim() || undefined,
      });

      // Só confirma depois que o Google devolveu o evento. O backend lança se
      // não vier eventId, então chegar aqui significa que está na agenda.
      setResultado({ ...data, rotulo: escolhido.rotulo });
      toast.success(i18n.t("salesAgentSchedule.done", "Agendamento criado!"));
    } catch (err) {
      toastError(err);
    } finally {
      setSalvando(false);
    }
  };

  return (
    <Dialog open={open} onClose={salvando ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle className={classes.titulo}>
        <CalendarClock size={20} strokeWidth={2.2} />
        {i18n.t("salesAgentSchedule.title", "Agendar com o cliente")}
      </DialogTitle>

      <DialogContent dividers>
        {resultado ? (
          <div className={classes.confirmado}>
            <div style={{ fontWeight: 700, marginBottom: 6 }}>
              <Check size={15} strokeWidth={2.5} style={{ verticalAlign: "-2px" }} />{" "}
              {i18n.t("salesAgentSchedule.confirmed", "Agendado para")} {resultado.rotulo}
            </div>
            {resultado.meetLink && (
              <div>
                <Video size={14} strokeWidth={2} style={{ verticalAlign: "-2px" }} />{" "}
                <a
                  className={classes.link}
                  href={resultado.meetLink}
                  target="_blank"
                  rel="noreferrer"
                >
                  {resultado.meetLink}
                </a>
              </div>
            )}
            <div style={{ marginTop: 8, fontSize: 12, opacity: 0.8 }}>
              {i18n.t(
                "salesAgentSchedule.sendHint",
                "Copie e envie o horário ao cliente na conversa."
              )}
            </div>
          </div>
        ) : carregando ? (
          <div className={classes.vazio}>
            <CircularProgress size={24} />
          </div>
        ) : horarios.length === 0 ? (
          <div className={classes.vazio}>
            {i18n.t(
              "salesAgentSchedule.noSlots",
              "Nenhum horário disponível. Verifique se o agendamento está ativo no agente e se a integração com o Google Agenda está conectada."
            )}
          </div>
        ) : (
          <>
            <Typography className={classes.ajuda}>
              {i18n.t(
                "salesAgentSchedule.help",
                "Horários livres na agenda, nos próximos dias. Escolha um para criar o evento."
              )}
            </Typography>

            <div className={classes.horarios}>
              {horarios.map(h => (
                <button
                  key={h.inicio}
                  type="button"
                  className={`${classes.horario} ${
                    escolhido?.inicio === h.inicio ? classes.selecionado : ""
                  }`}
                  onClick={() => setEscolhido(h)}
                >
                  <CalendarClock size={15} strokeWidth={2} />
                  {h.rotulo}
                </button>
              ))}
            </div>

            <TextField
              fullWidth
              multiline
              minRows={2}
              size="small"
              variant="outlined"
              label={i18n.t("salesAgentSchedule.note", "Observação (opcional)")}
              value={observacao}
              onChange={e => setObservacao(e.target.value)}
            />
          </>
        )}
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} disabled={salvando}>
          {resultado
            ? i18n.t("salesAgentSchedule.close", "Fechar")
            : i18n.t("salesAgentSchedule.cancel", "Cancelar")}
        </Button>
        {!resultado && (
          <Button
            variant="contained"
            color="primary"
            disabled={!escolhido || salvando}
            onClick={agendar}
            startIcon={salvando ? <CircularProgress size={15} color="inherit" /> : null}
          >
            {i18n.t("salesAgentSchedule.confirm", "Confirmar agendamento")}
          </Button>
        )}
      </DialogActions>
    </Dialog>
  );
};

export default SalesAgentScheduleModal;
