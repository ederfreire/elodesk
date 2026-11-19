import React, { useState } from "react";

// @material-ui (v4): o tema da empresa só existe no ThemeProvider do v4.
import { makeStyles } from "@material-ui/core/styles";
import Button from "@material-ui/core/Button";
import CircularProgress from "@material-ui/core/CircularProgress";
import Dialog from "@material-ui/core/Dialog";
import DialogActions from "@material-ui/core/DialogActions";
import DialogContent from "@material-ui/core/DialogContent";
import DialogTitle from "@material-ui/core/DialogTitle";
import TextField from "@material-ui/core/TextField";
import Typography from "@material-ui/core/Typography";

import { toast } from "react-toastify";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import { i18n } from "../../translate/i18n";
import { modelos } from "../../pages/VoiceIvrFlow/modelos";
import { paraCanvas, paraServidor } from "../../pages/VoiceIvrFlow/grafo";

const useStyles = makeStyles((theme) => ({
  ajuda: { color: theme.palette.text.secondary, fontSize: 14, marginBottom: theme.spacing(2), lineHeight: 1.5 },
  grade: { display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))", gap: theme.spacing(1.5) },
  cartao: {
    display: "flex",
    flexDirection: "column",
    gap: 4,
    textAlign: "left",
    cursor: "pointer",
    padding: theme.spacing(1.5, 1.75),
    borderRadius: 12,
    border: `1px solid ${theme.palette.divider}`,
    background: theme.palette.background.paper,
    color: theme.palette.text.primary,
    font: "inherit",
    transition: "border-color .15s, box-shadow .15s, transform .15s",
    "&:hover": { borderColor: "#0F766E", boxShadow: "0 4px 14px rgba(15,118,110,.16)", transform: "translateY(-1px)" },
    "&:focus-visible": { outline: "2px solid #0F766E", outlineOffset: 2 },
  },
  cartaoAtivo: { borderColor: "#0F766E", boxShadow: "0 0 0 2px rgba(15,118,110,.25)" },
  cartaoNome: { fontWeight: 700, fontSize: 14 },
  cartaoResumo: { fontSize: 12.5, color: theme.palette.text.secondary, lineHeight: 1.4 },
  nome: { marginTop: theme.spacing(2.5) },
}));

/**
 * Modelos prontos de URA de voz — o mesmo papel do modal de modelos dos
 * fluxos de conversa. Cria a URA já montada (usando os mesmos modelos do
 * editor) e devolve o id para abrir no editor.
 */
const VoiceIvrTemplatesModal = ({ open, onClose, onCreated }) => {
  const classes = useStyles();
  const [escolhido, setEscolhido] = useState(null);
  const [nome, setNome] = useState("");
  const [criando, setCriando] = useState(false);

  const lista = modelos();

  const fechar = () => {
    if (criando) return;
    setEscolhido(null);
    setNome("");
    onClose && onClose();
  };

  const escolher = (m) => {
    setEscolhido(m.id);
    setNome(m.nome);
  };

  const criar = async () => {
    const modelo = lista.find((m) => m.id === escolhido);
    if (!modelo) return;
    if (!nome.trim()) {
      toast.warn(i18n.t("voiceIvrLista.erroNome", "Dê um nome para a URA."));
      return;
    }
    setCriando(true);
    try {
      const { nos, arestas } = paraCanvas(modelo.grafo());
      const grafo = paraServidor(nos, arestas, { provider: "piper", voiceId: "" });
      const { data } = await api.post("/voice-ivr", {
        name: nome.trim(),
        enabled: true,
        graph: JSON.stringify(grafo),
      });
      toast.success(i18n.t("voiceIvrLista.criada", "URA criada a partir do modelo."));
      setEscolhido(null);
      setNome("");
      onCreated && onCreated(data);
    } catch (err) {
      toastError(err);
    } finally {
      setCriando(false);
    }
  };

  return (
    <Dialog open={!!open} onClose={fechar} maxWidth="sm" fullWidth>
      <DialogTitle>{i18n.t("voiceIvrFlow.modelos.titulo", "Começar com uma URA pronta")}</DialogTitle>
      <DialogContent dividers>
        <Typography className={classes.ajuda}>
          {i18n.t(
            "voiceIvrFlow.modelos.ajuda",
            "Escolha um ponto de partida. Depois é só trocar os textos e escolher a fila de cada transferência."
          )}
        </Typography>
        <div className={classes.grade}>
          {lista.map((m) => (
            <button
              type="button"
              key={m.id}
              className={`${classes.cartao} ${escolhido === m.id ? classes.cartaoAtivo : ""}`}
              onClick={() => escolher(m)}
            >
              <span className={classes.cartaoNome}>{m.nome}</span>
              <span className={classes.cartaoResumo}>{m.resumo}</span>
            </button>
          ))}
        </div>
        {escolhido && (
          <TextField
            className={classes.nome}
            fullWidth
            variant="outlined"
            size="small"
            label={i18n.t("voiceIvrLista.nomeDaUra", "Nome da URA")}
            value={nome}
            onChange={(e) => setNome(e.target.value)}
          />
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={fechar} disabled={criando}>
          {i18n.t("voiceIvrLista.cancelar", "Cancelar")}
        </Button>
        <Button
          color="primary"
          variant="contained"
          disabled={!escolhido || criando}
          onClick={criar}
          startIcon={criando ? <CircularProgress size={14} /> : null}
        >
          {i18n.t("voiceIvrLista.criar", "Criar URA")}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default VoiceIvrTemplatesModal;
