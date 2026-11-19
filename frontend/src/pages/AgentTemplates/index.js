import React, { useEffect, useState } from "react";
import { makeStyles } from "@material-ui/core/styles";
import Paper from "@material-ui/core/Paper";
import Button from "@material-ui/core/Button";
import IconButton from "@material-ui/core/IconButton";
import TextField from "@material-ui/core/TextField";
import MenuItem from "@material-ui/core/MenuItem";
import Chip from "@material-ui/core/Chip";
import Typography from "@material-ui/core/Typography";
import CircularProgress from "@material-ui/core/CircularProgress";
import Tooltip from "@material-ui/core/Tooltip";
import { Plus, Trash2, Copy, FileText, Lock } from "lucide-react";

import { toast } from "react-toastify";
import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import Title from "../../components/Title";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import { i18n } from "../../translate/i18n";

/**
 * Biblioteca de Modelos de Agente — módulo independente.
 *
 * Os quatro modelos de sistema (SDR, Recuperação, Pós-venda, Vendedor direto)
 * vêm marcados com cadeado: podem ser duplicados, não editados. Os que a
 * empresa cria são livres. Qualquer agente — de conversa ou comercial — lê
 * desta lista na hora de escolher um ponto de partida.
 */

const useStyles = makeStyles(theme => ({
  paper: { padding: theme.spacing(2), width: "100%" },
  bloco: {
    padding: theme.spacing(2.5),
    borderRadius: 14,
    border: `1px solid ${theme.palette.divider}`,
    marginBottom: theme.spacing(2),
  },
  tituloBloco: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 15,
    fontWeight: 700,
    marginBottom: 12,
  },
  item: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
    padding: theme.spacing(1.75),
    borderRadius: 10,
    border: `1px solid ${theme.palette.divider}`,
    marginBottom: theme.spacing(1),
    cursor: "pointer",
    gap: theme.spacing(2),
  },
  itemAtivo: { borderColor: "#2563eb", borderWidth: 2 },
  itemInfo: { flex: 1, minWidth: 0 },
  itemNome: { fontWeight: 600, display: "flex", alignItems: "center", gap: 6 },
  itemDesc: {
    fontSize: 12.5,
    color: theme.palette.text.secondary,
    marginTop: 2,
  },
  acoesItem: { display: "flex", gap: 4, flexShrink: 0 },
  grade: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: theme.spacing(2),
    marginBottom: theme.spacing(2),
  },
  acoes: { display: "flex", justifyContent: "flex-end", gap: theme.spacing(1.5) },
  vazio: {
    padding: theme.spacing(4),
    textAlign: "center",
    color: theme.palette.text.secondary,
    fontSize: 13,
  },
}));

const VAZIO = {
  label: "",
  description: "",
  scope: "ambos",
  niche: "",
  prompt: "",
  extractionInstructions: "",
  active: true,
};

const AgentTemplates = () => {
  const classes = useStyles();

  const [templates, setTemplates] = useState([]);
  const [selecionado, setSelecionado] = useState(null); // id, "novo", ou null
  const [form, setForm] = useState(VAZIO);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const carregar = async () => {
    try {
      const { data } = await api.get("/agent-templates");
      setTemplates(Array.isArray(data) ? data : []);
    } catch (err) {
      toastError(err);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    carregar();
  }, []);

  const abrir = t => {
    if (t.isSystem) {
      // Sistema é só leitura: abrir mostra o conteúdo, mas nada é salvável.
      setSelecionado(t.id);
      setForm({ ...VAZIO, ...t });
      return;
    }
    setSelecionado(t.id);
    setForm({ ...VAZIO, ...t });
  };

  const novo = () => {
    setSelecionado("novo");
    setForm({ ...VAZIO });
  };

  const alterar = (campo, valor) => setForm(f => ({ ...f, [campo]: valor }));

  const salvar = async () => {
    if (!form.label.trim()) {
      toast.warning(i18n.t("agentTemplates.labelRequired", "Informe o nome do modelo."));
      return;
    }
    setSalvando(true);
    try {
      const payload = {
        label: form.label,
        description: form.description,
        scope: form.scope,
        niche: form.niche || null,
        prompt: form.prompt,
        extractionInstructions: form.extractionInstructions,
        active: form.active,
      };
      if (selecionado === "novo") {
        await api.post("/agent-templates", payload);
      } else {
        await api.put(`/agent-templates/${selecionado}`, payload);
      }
      toast.success(i18n.t("agentTemplates.saved", "Modelo salvo!"));
      setSelecionado(null);
      carregar();
    } catch (err) {
      toastError(err);
    } finally {
      setSalvando(false);
    }
  };

  const duplicar = async (t, e) => {
    if (e) e.stopPropagation();
    try {
      await api.post(`/agent-templates/${t.id}/duplicate`);
      toast.success(i18n.t("agentTemplates.duplicated", "Modelo duplicado."));
      carregar();
    } catch (err) {
      toastError(err);
    }
  };

  const remover = async (t, e) => {
    if (e) e.stopPropagation();
    if (!window.confirm(i18n.t("agentTemplates.removeConfirm", "Remover este modelo?"))) return;
    try {
      await api.delete(`/agent-templates/${t.id}`);
      toast.success(i18n.t("agentTemplates.removed", "Modelo removido."));
      if (selecionado === t.id) setSelecionado(null);
      carregar();
    } catch (err) {
      toastError(err);
    }
  };

  const rotuloScope = s => {
    if (s === "comercial") return i18n.t("agentTemplates.scopeCommercial", "Comercial");
    if (s === "conversa") return i18n.t("agentTemplates.scopeConversation", "Conversa");
    return i18n.t("agentTemplates.scopeBoth", "Ambos");
  };

  const somenteLeitura = selecionado && selecionado !== "novo" && form.isSystem;

  if (carregando) {
    return (
      <MainContainer>
        <div className={classes.vazio}>
          <CircularProgress size={26} />
        </div>
      </MainContainer>
    );
  }

  return (
    <MainContainer>
      <MainHeader>
        <Title>{i18n.t("agentTemplates.title", "Modelos de Agente")}</Title>
        <Button
          variant="contained"
          color="primary"
          startIcon={<Plus size={16} strokeWidth={2.2} />}
          onClick={novo}
        >
          {i18n.t("agentTemplates.new", "Novo modelo")}
        </Button>
      </MainHeader>

      <Paper className={classes.paper} variant="outlined">
        {!selecionado && (
          <div>
            {templates.length === 0 ? (
              <div className={classes.vazio}>
                <FileText size={28} strokeWidth={1.6} />
                <div style={{ marginTop: 8 }}>
                  {i18n.t("agentTemplates.empty", "Nenhum modelo ainda.")}
                </div>
              </div>
            ) : (
              templates.map(t => (
                <div key={t.id} className={classes.item} onClick={() => abrir(t)}>
                  <div className={classes.itemInfo}>
                    <div className={classes.itemNome}>
                      {t.isSystem && (
                        <Tooltip title={i18n.t("agentTemplates.systemLocked", "Modelo de sistema (somente leitura)")}>
                          <Lock size={13} strokeWidth={2} color="#94a3b8" />
                        </Tooltip>
                      )}
                      {t.label}
                      <Chip
                        size="small"
                        label={rotuloScope(t.scope)}
                        style={{ height: 20, fontSize: 11 }}
                      />
                      {t.niche && (
                        <Chip
                          size="small"
                          variant="outlined"
                          label={t.niche}
                          style={{ height: 20, fontSize: 11 }}
                        />
                      )}
                    </div>
                    {t.description && (
                      <div className={classes.itemDesc}>{t.description}</div>
                    )}
                  </div>
                  <div className={classes.acoesItem}>
                    <Tooltip title={i18n.t("agentTemplates.duplicate", "Duplicar")}>
                      <IconButton size="small" onClick={e => duplicar(t, e)}>
                        <Copy size={15} strokeWidth={2} />
                      </IconButton>
                    </Tooltip>
                    {!t.isSystem && (
                      <Tooltip title={i18n.t("agentTemplates.remove", "Remover")}>
                        <IconButton size="small" onClick={e => remover(t, e)}>
                          <Trash2 size={15} strokeWidth={2} color="#ef4444" />
                        </IconButton>
                      </Tooltip>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        )}

        {selecionado && (
          <div>
            {somenteLeitura && (
              <div
                className={classes.bloco}
                style={{ background: "#f8fafc", display: "flex", alignItems: "center", gap: 8 }}
              >
                <Lock size={15} strokeWidth={2} color="#64748b" />
                <Typography variant="body2" color="textSecondary">
                  {i18n.t(
                    "agentTemplates.systemReadonlyHelp",
                    "Modelo de sistema. Para ajustar, duplique e edite a cópia."
                  )}
                </Typography>
                <Button
                  size="small"
                  variant="outlined"
                  startIcon={<Copy size={14} />}
                  style={{ marginLeft: "auto" }}
                  onClick={() => duplicar(form)}
                >
                  {i18n.t("agentTemplates.duplicate", "Duplicar")}
                </Button>
              </div>
            )}

            <div className={classes.bloco}>
              <div className={classes.grade}>
                <TextField
                  size="small"
                  variant="outlined"
                  label={i18n.t("agentTemplates.label", "Nome do modelo")}
                  value={form.label}
                  onChange={e => alterar("label", e.target.value)}
                  disabled={somenteLeitura}
                />
                <TextField
                  select
                  size="small"
                  variant="outlined"
                  label={i18n.t("agentTemplates.scope", "Aplica-se a")}
                  value={form.scope}
                  onChange={e => alterar("scope", e.target.value)}
                  disabled={somenteLeitura}
                >
                  <MenuItem value="ambos">{i18n.t("agentTemplates.scopeBoth", "Ambos")}</MenuItem>
                  <MenuItem value="conversa">{i18n.t("agentTemplates.scopeConversation", "Conversa")}</MenuItem>
                  <MenuItem value="comercial">{i18n.t("agentTemplates.scopeCommercial", "Comercial")}</MenuItem>
                </TextField>
                <TextField
                  size="small"
                  variant="outlined"
                  label={i18n.t("agentTemplates.niche", "Nicho (opcional)")}
                  value={form.niche || ""}
                  onChange={e => alterar("niche", e.target.value)}
                  disabled={somenteLeitura}
                />
              </div>
              <TextField
                fullWidth
                size="small"
                variant="outlined"
                label={i18n.t("agentTemplates.description", "Descrição curta")}
                value={form.description || ""}
                onChange={e => alterar("description", e.target.value)}
                disabled={somenteLeitura}
              />
            </div>

            <div className={classes.bloco}>
              <div className={classes.tituloBloco}>
                {i18n.t("agentTemplates.promptTitle", "Prompt de conversa")}
              </div>
              <TextField
                fullWidth
                multiline
                minRows={10}
                maxRows={24}
                size="small"
                variant="outlined"
                value={form.prompt || ""}
                onChange={e => alterar("prompt", e.target.value)}
                disabled={somenteLeitura}
                placeholder={i18n.t(
                  "agentTemplates.promptPlaceholder",
                  "As instruções que definem como o agente conversa..."
                )}
              />
            </div>

            <div className={classes.bloco}>
              <div className={classes.tituloBloco}>
                {i18n.t("agentTemplates.extractionTitle", "Instruções de extração (agente comercial)")}
              </div>
              <Typography variant="body2" color="textSecondary" style={{ marginBottom: 10, fontSize: 12.5 }}>
                {i18n.t(
                  "agentTemplates.extractionHelp",
                  "Opcional. Orienta como a IA lê a conversa para qualificar o lead. Deixe vazio para usar o padrão."
                )}
              </Typography>
              <TextField
                fullWidth
                multiline
                minRows={5}
                maxRows={16}
                size="small"
                variant="outlined"
                value={form.extractionInstructions || ""}
                onChange={e => alterar("extractionInstructions", e.target.value)}
                disabled={somenteLeitura}
              />
            </div>

            <div className={classes.acoes}>
              <Button onClick={() => setSelecionado(null)}>
                {i18n.t("agentTemplates.cancel", "Voltar")}
              </Button>
              {!somenteLeitura && (
                <Button
                  variant="contained"
                  color="primary"
                  disabled={salvando}
                  onClick={salvar}
                  startIcon={salvando ? <CircularProgress size={15} /> : null}
                >
                  {i18n.t("agentTemplates.save", "Salvar")}
                </Button>
              )}
            </div>
          </div>
        )}
      </Paper>
    </MainContainer>
  );
};

export default AgentTemplates;
