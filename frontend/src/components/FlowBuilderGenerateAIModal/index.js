import React, { useEffect, useState } from "react";

// IMPORTANTE: componentes e makeStyles vem do @material-ui (v4), nao do @mui
// (v5). O App.js cria o tema com `createTheme` do @material-ui/core/styles e
// so monta o ThemeProvider do v4. Um makeStyles do @mui/styles nao enxerga
// esse contexto: ele cai no tema PADRAO do v5, entao `theme.palette.mode`
// seria sempre "light" e as cores do modal ficariam fora do tema da empresa
// (e erradas no modo escuro). Os demais modais do FlowBuilder ja seguem o v4
// por esse mesmo motivo.
import { makeStyles } from "@material-ui/core/styles";
import Button from "@material-ui/core/Button";
import Chip from "@material-ui/core/Chip";
import CircularProgress from "@material-ui/core/CircularProgress";
import Dialog from "@material-ui/core/Dialog";
import DialogActions from "@material-ui/core/DialogActions";
import DialogContent from "@material-ui/core/DialogContent";
import DialogTitle from "@material-ui/core/DialogTitle";
import FormControl from "@material-ui/core/FormControl";
import InputLabel from "@material-ui/core/InputLabel";
import MenuItem from "@material-ui/core/MenuItem";
import Select from "@material-ui/core/Select";
import TextField from "@material-ui/core/TextField";
import AutoAwesomeIcon from "@mui/icons-material/AutoAwesome";

import { toast } from "react-toastify";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import { i18n } from "../../translate/i18n";

const useStyles = makeStyles((theme) => ({
  titulo: {
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(1.2),
    fontWeight: 700,
    fontSize: 20,
  },
  brilho: {
    color: "#7C4DFF",
  },
  ajuda: {
    color: theme.palette.text.secondary,
    fontSize: 14,
    marginBottom: theme.spacing(2.5),
    lineHeight: 1.5,
  },
  campo: {
    marginBottom: theme.spacing(2),
  },
  rotuloExemplos: {
    color: theme.palette.text.secondary,
    fontSize: 12,
    marginTop: theme.spacing(1),
    marginBottom: theme.spacing(1),
  },
  exemplos: {
    display: "flex",
    flexWrap: "wrap",
    gap: theme.spacing(1),
  },
  exemplo: {
    borderRadius: 8,
    fontWeight: 500,
    maxWidth: "100%",
    cursor: "pointer",
  },
  aviso: {
    marginTop: theme.spacing(3),
    padding: theme.spacing(1.8),
    borderRadius: 10,
    backgroundColor:
      theme.palette.type === "dark"
        ? "rgba(124,77,255,0.12)"
        : "rgba(124,77,255,0.07)",
    color: theme.palette.type === "dark" ? "#C9B6FF" : "#5B3AC4",
    fontSize: 13,
    lineHeight: 1.5,
  },
  botaoGerar: {
    background: "linear-gradient(135deg, #7C4DFF 0%, #6435E0 100%)",
    color: "#fff",
    borderRadius: 10,
    textTransform: "none",
    fontWeight: 600,
    padding: "9px 20px",
    "&:hover": {
      background: "linear-gradient(135deg, #6D3BFF 0%, #5628CF 100%)",
    },
    "&.Mui-disabled": {
      background: theme.palette.action.disabledBackground,
      color: theme.palette.action.disabled,
    },
  },
  botaoCancelar: {
    textTransform: "none",
    fontWeight: 600,
  },
}));

// Chaves das categorias combinam com o mapa CATEGORIAS do
// GenerateFlowAIService.ts no backend. Mudar uma exige mudar a outra.
const CATEGORIAS = [
  { valor: "atendimento", chave: "customerService" },
  { valor: "vendas", chave: "sales" },
  { valor: "suporte", chave: "support" },
  { valor: "qualificacao", chave: "leadQualification" },
  { valor: "agendamento", chave: "scheduling" },
  { valor: "nps", chave: "nps" },
  { valor: "boasVindas", chave: "welcome" },
  { valor: "cobranca", chave: "billing" },
  { valor: "outro", chave: "other" },
];

const EXEMPLOS = ["example1", "example2", "example3", "example4"];

const FlowBuilderGenerateAIModal = ({ open, onClose, onGenerated }) => {
  const classes = useStyles();

  const [categoria, setCategoria] = useState("atendimento");
  const [nome, setNome] = useState("");
  const [descricao, setDescricao] = useState("");
  const [gerando, setGerando] = useState(false);

  useEffect(() => {
    if (open) {
      setCategoria("atendimento");
      setNome("");
      setDescricao("");
      setGerando(false);
    }
  }, [open]);

  const handleGerar = async () => {
    if (descricao.trim().length < 10) {
      toast.warning(i18n.t("flowBuilderAIGenerate.descriptionTooShort"));
      return;
    }

    setGerando(true);
    try {
      const { data } = await api.post("/flowbuilder/generate-ai", {
        categoria,
        nome: nome.trim() || undefined,
        descricao: descricao.trim(),
      });

      toast.success(i18n.t("flowBuilderAIGenerate.success"));

      // Avisos nao sao erro: a geracao deu certo, mas alguma coisa foi
      // ajustada (uma fila citada que nao existe, por exemplo). Mostrar isso
      // evita o usuario abrir o fluxo e achar que a IA "esqueceu" um passo.
      if (Array.isArray(data?.avisos)) {
        data.avisos.forEach((aviso) => toast.info(aviso));
      }

      if (onGenerated) onGenerated(data?.flow);
      onClose();
    } catch (err) {
      toastError(err);
    } finally {
      setGerando(false);
    }
  };

  return (
    <Dialog open={open} onClose={gerando ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle className={classes.titulo}>
        <AutoAwesomeIcon className={classes.brilho} />
        {i18n.t("flowBuilderAIGenerate.title")}
      </DialogTitle>

      <DialogContent dividers>
        <div className={classes.ajuda}>{i18n.t("flowBuilderAIGenerate.help")}</div>

        <FormControl fullWidth size="small" variant="outlined" className={classes.campo}>
          <InputLabel>{i18n.t("flowBuilderAIGenerate.category")}</InputLabel>
          <Select
            label={i18n.t("flowBuilderAIGenerate.category")}
            value={categoria}
            onChange={(e) => setCategoria(e.target.value)}
            disabled={gerando}
          >
            {CATEGORIAS.map((item) => (
              <MenuItem key={item.valor} value={item.valor}>
                {i18n.t(`flowBuilderAIGenerate.categories.${item.chave}`)}
              </MenuItem>
            ))}
          </Select>
        </FormControl>

        <TextField
          className={classes.campo}
          fullWidth
          size="small"
          variant="outlined"
          placeholder={i18n.t("flowBuilderAIGenerate.namePlaceholder")}
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          disabled={gerando}
          inputProps={{ maxLength: 80 }}
        />

        <TextField
          className={classes.campo}
          fullWidth
          multiline
          variant="outlined"
          minRows={4}
          label={i18n.t("flowBuilderAIGenerate.description")}
          value={descricao}
          onChange={(e) => setDescricao(e.target.value)}
          disabled={gerando}
          inputProps={{ maxLength: 1200 }}
        />

        <div className={classes.rotuloExemplos}>
          {i18n.t("flowBuilderAIGenerate.examplesLabel")}
        </div>
        <div className={classes.exemplos}>
          {EXEMPLOS.map((chave) => {
            const texto = i18n.t(`flowBuilderAIGenerate.examples.${chave}`);
            return (
              <Chip
                key={chave}
                label={texto}
                variant="outlined"
                className={classes.exemplo}
                onClick={() => !gerando && setDescricao(texto)}
              />
            );
          })}
        </div>

        <div className={classes.aviso}>{i18n.t("flowBuilderAIGenerate.keyNotice")}</div>
      </DialogContent>

      <DialogActions>
        <Button
          onClick={onClose}
          disabled={gerando}
          color="secondary"
          className={classes.botaoCancelar}
        >
          {i18n.t("flowBuilderAIGenerate.cancel")}
        </Button>
        <Button
          className={classes.botaoGerar}
          onClick={handleGerar}
          disabled={gerando}
          startIcon={
            gerando ? (
              <CircularProgress size={16} color="inherit" />
            ) : (
              <AutoAwesomeIcon />
            )
          }
        >
          {gerando
            ? i18n.t("flowBuilderAIGenerate.generating")
            : i18n.t("flowBuilderAIGenerate.generate")}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default FlowBuilderGenerateAIModal;
