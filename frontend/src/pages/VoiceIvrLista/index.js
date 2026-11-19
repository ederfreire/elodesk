import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useHistory } from "react-router-dom";
import { toast } from "react-toastify";

import { makeStyles, useTheme } from "@material-ui/core/styles";
import TextField from "@material-ui/core/TextField";
import InputAdornment from "@material-ui/core/InputAdornment";
import SearchIcon from "@material-ui/icons/Search";
import AddCircle from "@mui/icons-material/AddCircle";
import ViewQuiltIcon from "@mui/icons-material/ViewQuilt";
import MoreVert from "@mui/icons-material/MoreVert";
import Edit from "@mui/icons-material/Edit";
import Delete from "@mui/icons-material/Delete";
import PlayArrow from "@mui/icons-material/PlayArrow";
import Pause from "@mui/icons-material/Pause";
import ContentCopy from "@mui/icons-material/ContentCopy";
import FileDownload from "@mui/icons-material/FileDownload";
import HeadsetMicIcon from "@mui/icons-material/HeadsetMic";
import AccountTree from "@mui/icons-material/AccountTree";
import {
  Button,
  CircularProgress,
  Stack,
  Box,
  Typography,
  Chip,
  IconButton,
  Menu,
  MenuItem,
  Divider,
  Grid,
  Select,
  FormControl,
} from "@mui/material";

import api from "../../services/api";
import toastError from "../../errors/toastError";
import { i18n } from "../../translate/i18n";
import MainContainer from "../../components/MainContainer";
import ConfirmationModal from "../../components/ConfirmationModal";
import VoiceIvrTemplatesModal from "../../components/VoiceIvrTemplatesModal";
import { nomeDeUraTraduzido } from "../VoiceIvrFlow/modelos";

const TEAL = "#0F766E";

const useStyles = makeStyles((theme) => ({
  mainContainer: {
    maxWidth: 1280,
    margin: "0 auto",
    padding: theme.spacing(4, 4, 6),
    [theme.breakpoints.down("sm")]: { padding: theme.spacing(2) },
  },
  pageHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: theme.spacing(2),
    marginBottom: theme.spacing(3),
    flexWrap: "wrap",
  },
  pageTitle: { fontSize: "1.25rem", fontWeight: 700, color: theme.palette.text.primary, lineHeight: 1.2, margin: 0 },
  pageSubtitle: { fontSize: "0.8125rem", color: theme.palette.text.secondary, marginTop: 4 },
  headerActions: {
    display: "flex",
    alignItems: "stretch",
    justifyContent: "flex-end",
    gap: theme.spacing(1.5),
    flexWrap: "wrap",
    [theme.breakpoints.down("sm")]: { width: "100%", justifyContent: "flex-start" },
  },
  actionGroup: {
    display: "flex",
    flexDirection: "column",
    gap: 6,
    padding: theme.spacing(1, 1.5, 1.25),
    borderRadius: 14,
    border: `1px solid ${theme.palette.divider}`,
    backgroundColor: theme.palette.background.paper,
  },
  actionGroupLabel: {
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: 0.6,
    textTransform: "uppercase",
    color: theme.palette.text.secondary,
    lineHeight: 1,
  },
  actionGroupButtons: { display: "flex", alignItems: "center", gap: theme.spacing(1), flexWrap: "wrap" },
  newVoiceBtn: {
    backgroundColor: TEAL,
    "&, & .MuiButton-label": { color: "#ffffff !important" },
    "& .MuiSvgIcon-root": { color: "#ffffff !important" },
    borderRadius: 10,
    textTransform: "none",
    fontWeight: 600,
    padding: "10px 18px",
    boxShadow: "0 1px 2px rgba(15,118,110,0.25)",
    "&:hover": { backgroundColor: "#0D625B" },
  },
  outlineBtn: {
    borderRadius: 10,
    textTransform: "none",
    fontWeight: 600,
    padding: "9px 16px",
    borderColor: theme.palette.divider,
    color: theme.palette.text.primary,
  },
  filtersRow: {
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(1),
    flex: "1 1 320px",
    maxWidth: 440,
    alignSelf: "center",
    [theme.breakpoints.down("sm")]: { maxWidth: "none", width: "100%" },
  },
  searchField: {
    flex: 1,
    minWidth: 150,
    "& .MuiOutlinedInput-root": {
      backgroundColor: theme.palette.background.paper,
      borderRadius: 8,
      fontSize: 13,
      "& fieldset": { borderColor: theme.palette.divider },
    },
    "& .MuiOutlinedInput-input": { padding: "8px 10px" },
  },
  statusSelect: {
    minWidth: 130,
    "& .MuiOutlinedInput-root": {
      backgroundColor: theme.palette.background.paper,
      borderRadius: 8,
      fontSize: 13,
      "& fieldset": { borderColor: theme.palette.divider },
    },
    "& .MuiSelect-select": { padding: "8px 28px 8px 10px" },
  },
  statsGrid: {
    display: "grid",
    gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
    gap: theme.spacing(2),
    marginBottom: theme.spacing(3),
    [theme.breakpoints.down("sm")]: { gridTemplateColumns: "repeat(2, minmax(0, 1fr))" },
  },
  statCard: {
    backgroundColor: theme.palette.background.paper,
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: 12,
    padding: theme.spacing(2, 2.25),
  },
  statLabel: { fontSize: "0.8125rem", color: theme.palette.text.secondary, marginBottom: 6, fontWeight: 500 },
  statValue: { fontSize: "1.75rem", fontWeight: 800, lineHeight: 1, color: theme.palette.text.primary },


  flowCard: {
    backgroundColor: theme.palette.background.paper,
    borderRadius: 12,
    border: `1px solid ${theme.palette.divider}`,
    padding: theme.spacing(2),
    cursor: "pointer",
    transition: "all .18s ease",
    "&:hover": { borderColor: TEAL, boxShadow: "0 4px 14px rgba(15,23,42,0.06)" },
  },
  flowIconBox: {
    width: 40,
    height: 40,
    borderRadius: 10,
    backgroundColor: theme.palette.type === "dark" ? "rgba(15,118,110,0.22)" : "#E6F4F2",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: TEAL,
    flexShrink: 0,
  },
  flowName: { fontSize: "0.9375rem", fontWeight: 700, color: theme.palette.text.primary, lineHeight: 1.25 },
  flowType: { fontSize: "0.8125rem", color: theme.palette.text.secondary, marginTop: 2 },
  activeBadge: {
    height: 22,
    borderRadius: 999,
    fontSize: "0.75rem",
    fontWeight: 600,
    backgroundColor: theme.palette.type === "dark" ? "#14331F" : "#DCFCE7",
    border: `1px solid ${theme.palette.type === "dark" ? "#166534" : "#BBF7D0"}`,
    "&, & .MuiChip-label": { color: `${theme.palette.type === "dark" ? "#4ADE80" : "#15803D"} !important` },
  },
  inactiveBadge: {
    height: 22,
    borderRadius: 999,
    fontSize: "0.75rem",
    fontWeight: 600,
    backgroundColor: theme.palette.type === "dark" ? "#3F1D1D" : "#FEE2E2",
    border: `1px solid ${theme.palette.type === "dark" ? "#7F1D1D" : "#FECACA"}`,
    "&, & .MuiChip-label": { color: `${theme.palette.type === "dark" ? "#FCA5A5" : "#B91C1C"} !important` },
  },
  cardMetaRow: { display: "flex", alignItems: "center", gap: 10, marginTop: theme.spacing(1.5), fontSize: "0.8125rem", color: theme.palette.text.secondary },
  metaDivider: { width: 1, height: 14, backgroundColor: theme.palette.divider },
  emptyState: {
    textAlign: "center",
    padding: theme.spacing(8, 3),
    backgroundColor: theme.palette.background.paper,
    borderRadius: 12,
    border: `1px solid ${theme.palette.divider}`,
  },
  emptyIcon: { fontSize: 56, color: theme.palette.text.disabled, marginBottom: theme.spacing(2) },
  emptyTitle: { fontSize: "1.125rem", fontWeight: 700, marginBottom: 6 },
  emptyDescription: { color: theme.palette.text.secondary, fontSize: "0.9rem" },
  loadingContainer: { display: "flex", justifyContent: "center", padding: theme.spacing(8) },
  menu: {
    "& .MuiPaper-root": {
      borderRadius: 10,
      border: `1px solid ${theme.palette.divider}`,
      boxShadow: "0 8px 24px rgba(15,23,42,0.08)",
      minWidth: 180,
    },
  },
}));

const t = (chave, padrao, opcoes) => i18n.t(`voiceIvrLista.${chave}`, { defaultValue: padrao, ...(opcoes || {}) });

const contarNos = (f) => {
  try {
    const g = typeof f.graph === "string" ? JSON.parse(f.graph || "{}") : f.graph || {};
    return Array.isArray(g.nodes) ? g.nodes.length : 0;
  } catch {
    return 0;
  }
};

function UraCard({ ura, execucoes, classes, onEdit, onToggle, onDuplicate, onExport, onDelete }) {
  const [ancora, setAncora] = useState(null);
  const theme = useTheme();
  const ativa = ura.enabled !== false;
  const nos = contarNos(ura);
  const fechar = () => setAncora(null);
  const acao = (fn) => {
    fechar();
    setTimeout(fn, 80);
  };
  const aoClicar = (e) => {
    if (e.target.closest("button") || e.target.closest('[role="button"]')) return;
    onEdit();
  };
  const icone = { marginRight: 12, color: theme.palette.text.secondary };

  return (
    <div className={classes.flowCard} onClick={aoClicar}>
      <Stack direction="row" alignItems="flex-start" spacing={1.5}>
        <div className={classes.flowIconBox}>
          <HeadsetMicIcon style={{ fontSize: 20 }} />
        </div>
        <Box flex={1} minWidth={0}>
          <Stack direction="row" alignItems="center" justifyContent="space-between" spacing={1}>
            <Box minWidth={0} flex={1}>
              <Typography className={classes.flowName} noWrap>{nomeDeUraTraduzido(ura.name)}</Typography>
              <Typography className={classes.flowType} noWrap>{t("tipo", "Ligação recebida")}</Typography>
            </Box>
            <Stack direction="row" alignItems="center" spacing={0.5}>
              <Chip
                size="small"
                label={ativa ? t("ativa", "Ativa") : t("pausada", "Pausada")}
                className={ativa ? classes.activeBadge : classes.inactiveBadge}
              />
              <IconButton size="small" onClick={(e) => { e.stopPropagation(); setAncora(e.currentTarget); }}>
                <MoreVert fontSize="small" />
              </IconButton>
            </Stack>
          </Stack>
          <div className={classes.cardMetaRow}>
            <span>{nos} {nos === 1 ? t("no", "nó") : t("nos", "nós")}</span>
            <span className={classes.metaDivider} />
            <span>{Number(execucoes || 0).toLocaleString(i18n.language || "pt-BR")} {t("ligacoes", "ligações")}</span>
          </div>
        </Box>
      </Stack>

      <Menu className={classes.menu} anchorEl={ancora} open={Boolean(ancora)} onClose={fechar}>
        <MenuItem onClick={(e) => { e.stopPropagation(); acao(onEdit); }}>
          <Edit fontSize="small" style={icone} />
          {t("editar", "Editar")}
        </MenuItem>
        <MenuItem onClick={(e) => { e.stopPropagation(); acao(onToggle); }}>
          {ativa ? <Pause fontSize="small" style={icone} /> : <PlayArrow fontSize="small" style={icone} />}
          {ativa ? t("pausar", "Pausar") : t("ativar", "Ativar")}
        </MenuItem>
        <MenuItem onClick={(e) => { e.stopPropagation(); acao(onDuplicate); }}>
          <ContentCopy fontSize="small" style={icone} />
          {t("duplicar", "Duplicar")}
        </MenuItem>
        <MenuItem onClick={(e) => { e.stopPropagation(); acao(onExport); }}>
          <FileDownload fontSize="small" style={icone} />
          {t("exportar", "Exportar (.zip)")}
        </MenuItem>
        <Divider />
        <MenuItem onClick={(e) => { e.stopPropagation(); acao(onDelete); }}>
          <Delete fontSize="small" style={{ marginRight: 12, color: theme.palette.error.main }} />
          <span style={{ color: theme.palette.error.main }}>{t("excluir", "Excluir")}</span>
        </MenuItem>
      </Menu>
    </div>
  );
}

const VoiceIvrLista = () => {
  const classes = useStyles();
  const theme = useTheme();
  const history = useHistory();

  const [carregando, setCarregando] = useState(true);
  const [uras, setUras] = useState([]);
  const [busca, setBusca] = useState("");
  const [status, setStatus] = useState("all");
  const [modelosAbertos, setModelosAbertos] = useState(false);
  const [excluindo, setExcluindo] = useState(null);
  const [numeros, setNumeros] = useState(null);

  const carregar = useCallback(async () => {
    setCarregando(true);
    try {
      const { data } = await api.get("/voice-ivr");
      setUras(Array.isArray(data) ? data : []);
    } catch (err) {
      toastError(err);
    } finally {
      setCarregando(false);
    }
  }, []);

  useEffect(() => {
    carregar();
  }, [carregar]);

  // Só o contador de ligações de cada cartão; os gráficos ficam no Relatório
  // de ligações. Falhar aqui nunca derruba a tela.
  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const { data } = await api.get("/voice-ivr/estatisticas", { params: { days: 30 } });
        if (vivo) setNumeros(data);
      } catch (err) {
        if (vivo) setNumeros(null);
      }
    })();
    return () => {
      vivo = false;
    };
  }, []);

  const filtradas = useMemo(
    () =>
      uras.filter((u) => {
        const ativa = u.enabled !== false;
        if (status === "active" && !ativa) return false;
        if (status === "inactive" && ativa) return false;
        return !busca.trim() || String(u.name || "").toLowerCase().includes(busca.trim().toLowerCase());
      }),
    [uras, busca, status]
  );

  const resumo = {
    total: uras.length,
    ativas: uras.filter((u) => u.enabled !== false).length,
    pausadas: uras.filter((u) => u.enabled === false).length,
  };

  const alternar = async (u) => {
    const ativar = u.enabled === false;
    try {
      await api.put(`/voice-ivr/${u.id}`, { name: u.name, graph: u.graph, enabled: ativar });
      toast.success(ativar ? t("ativadaOk", "URA ativada.") : t("pausadaOk", "URA pausada."));
      carregar();
    } catch (err) {
      toastError(err);
    }
  };

  const duplicar = async (u) => {
    try {
      await api.post("/voice-ivr", {
        name: t("copia", "{{nome}} (cópia)", { nome: u.name }),
        graph: u.graph,
        enabled: false,
      });
      toast.success(t("duplicadaOk", "URA duplicada (a cópia começa pausada)."));
      carregar();
    } catch (err) {
      toastError(err);
    }
  };

  const exportar = async (u) => {
    try {
      const resposta = await api.get(`/voice-ivr/${u.id}/export`, { responseType: "blob" });
      const url = window.URL.createObjectURL(new Blob([resposta.data], { type: "application/zip" }));
      const link = document.createElement("a");
      link.href = url;
      link.setAttribute("download", `${String(u.name || "ura").replace(/[^a-z0-9-_]/gi, "_")}.zip`);
      document.body.appendChild(link);
      link.click();
      link.parentNode.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (err) {
      toastError(err);
    }
  };

  const inputImportar = useRef(null);
  const importar = async (e) => {
    const arquivo = e.target.files && e.target.files[0];
    e.target.value = null;
    if (!arquivo) return;
    const nome = arquivo.name.toLowerCase();
    if (!nome.endsWith(".zip") && !nome.endsWith(".json")) {
      toast.error(t("arquivoInvalido", "Escolha um arquivo .zip ou .json."));
      return;
    }
    try {
      const form = new FormData();
      form.append("file", arquivo);
      await api.post("/voice-ivr/import", form, { headers: { "Content-Type": "multipart/form-data" } });
      toast.success(t("importadaOk", "URA importada (ela começa pausada)."));
      carregar();
    } catch (err) {
      toastError(err);
    }
  };

  const excluir = async () => {
    const u = excluindo;
    setExcluindo(null);
    if (!u) return;
    try {
      await api.delete(`/voice-ivr/${u.id}`);
      toast.success(t("excluidaOk", "URA excluída."));
      carregar();
    } catch (err) {
      toastError(err);
    }
  };

  const corTexto = theme.palette.text.secondary;

  return (
    <MainContainer className={classes.mainContainer}>
      <ConfirmationModal
        title={t("excluirTitulo", "Excluir a URA \"{{nome}}\"?", { nome: excluindo?.name || "" })}
        open={!!excluindo}
        onClose={() => setExcluindo(null)}
        onConfirm={excluir}
      >
        {t("excluirTexto", "As conexões que usam esta URA voltam a tocar direto para o atendente.")}
      </ConfirmationModal>

      <VoiceIvrTemplatesModal
        open={modelosAbertos}
        onClose={() => setModelosAbertos(false)}
        onCreated={(nova) => {
          setModelosAbertos(false);
          if (nova?.id) history.push(`/voice-ivr/${nova.id}`);
          else carregar();
        }}
      />

      <div className={classes.pageHeader}>
        <div>
          <h1 className={classes.pageTitle}>{t("titulo", "URAs de voz")}</h1>
          <div className={classes.pageSubtitle}>
            {t("subtitulo", "Atenda as ligações automaticamente e acompanhe o que a URA resolve")}
          </div>
        </div>
        <div className={classes.filtersRow}>
          <TextField
            className={classes.searchField}
            placeholder={t("buscar", "Buscar URAs...")}
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            variant="outlined"
            size="small"
            InputProps={{
              startAdornment: (
                <InputAdornment position="start">
                  <SearchIcon style={{ color: corTexto, fontSize: 18 }} />
                </InputAdornment>
              ),
            }}
          />
          <FormControl className={classes.statusSelect} size="small" variant="outlined">
            <Select native value={status} onChange={(e) => setStatus(e.target.value)}>
              <option value="all">{t("todosStatus", "Todos os status")}</option>
              <option value="active">{t("soAtivas", "Ativas")}</option>
              <option value="inactive">{t("soPausadas", "Pausadas")}</option>
            </Select>
          </FormControl>
        </div>
        <div className={classes.headerActions}>
          <div className={classes.actionGroup}>
            <span className={classes.actionGroupLabel}>{t("grupo", "URA de voz")}</span>
            <div className={classes.actionGroupButtons}>
              <input
                ref={inputImportar}
                type="file"
                accept=".zip,.json,application/zip,application/json"
                style={{ display: "none" }}
                onChange={importar}
              />
              <Button
                variant="outlined"
                className={classes.outlineBtn}
                onClick={() => inputImportar.current && inputImportar.current.click()}
              >
                {t("importar", "Importar (.zip)")}
              </Button>
              <Button
                variant="outlined"
                className={classes.outlineBtn}
                startIcon={<AccountTree />}
                onClick={() => history.push("/flowbuilders")}
              >
                {t("fluxosDeConversa", "Fluxos de conversa")}
              </Button>
              <Button
                variant="outlined"
                className={classes.outlineBtn}
                startIcon={<ViewQuiltIcon />}
                onClick={() => setModelosAbertos(true)}
              >
                {t("modelos", "Modelos")}
              </Button>
              <Button
                variant="contained"
                disableElevation
                className={classes.newVoiceBtn}
                startIcon={<AddCircle />}
                onClick={() => history.push("/voice-ivr/novo")}
              >
                {t("nova", "Nova URA de voz")}
              </Button>
            </div>
          </div>
        </div>
      </div>

      <div className={classes.statsGrid}>
        <div className={classes.statCard}>
          <div className={classes.statLabel}>{t("statTotal", "Total de URAs")}</div>
          <div className={classes.statValue}>{resumo.total}</div>
        </div>
        <div className={classes.statCard}>
          <div className={classes.statLabel}>{t("statAtivas", "URAs ativas")}</div>
          <div className={classes.statValue} style={{ color: "#16A34A" }}>{resumo.ativas}</div>
        </div>
        <div className={classes.statCard}>
          <div className={classes.statLabel}>{t("statPausadas", "Pausadas")}</div>
          <div className={classes.statValue} style={{ color: "#EA580C" }}>{resumo.pausadas}</div>
        </div>
      </div>

      {carregando && !uras.length ? (
        <div className={classes.loadingContainer}>
          <CircularProgress style={{ color: TEAL }} />
        </div>
      ) : filtradas.length === 0 ? (
        <div className={classes.emptyState}>
          <HeadsetMicIcon className={classes.emptyIcon} />
          <Typography className={classes.emptyTitle}>
            {busca ? t("nenhumaAchada", "Nenhuma URA encontrada") : t("nenhumaCriada", "Nenhuma URA criada ainda")}
          </Typography>
          <Typography className={classes.emptyDescription}>
            {busca
              ? t("tenteOutra", "Tente outra busca.")
              : t("criePrimeira", "Crie uma para que as ligações recebidas sejam atendidas automaticamente.")}
          </Typography>
          {!busca && (
            <Button
              variant="contained"
              disableElevation
              className={classes.newVoiceBtn}
              startIcon={<AddCircle />}
              style={{ marginTop: 24 }}
              onClick={() => history.push("/voice-ivr/novo")}
            >
              {t("nova", "Nova URA de voz")}
            </Button>
          )}
        </div>
      ) : (
        <Grid container spacing={2}>
          {filtradas.map((u) => (
            <Grid item xs={12} sm={6} md={4} key={u.id}>
              <UraCard
                ura={u}
                classes={classes}
                execucoes={numeros?.porFluxo?.[u.id] || 0}
                onEdit={() => history.push(`/voice-ivr/${u.id}`)}
                onToggle={() => alternar(u)}
                onDuplicate={() => duplicar(u)}
                onExport={() => exportar(u)}
                onDelete={() => setExcluindo(u)}
              />
            </Grid>
          ))}
        </Grid>
      )}
    </MainContainer>
  );
};

export default VoiceIvrLista;
