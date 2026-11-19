import React, { useEffect, useState } from "react";
import { makeStyles } from "@material-ui/core/styles";
import Paper from "@material-ui/core/Paper";
import Button from "@material-ui/core/Button";
import IconButton from "@material-ui/core/IconButton";
import TextField from "@material-ui/core/TextField";
import MenuItem from "@material-ui/core/MenuItem";
import Switch from "@material-ui/core/Switch";
import Typography from "@material-ui/core/Typography";
import CircularProgress from "@material-ui/core/CircularProgress";
import Tooltip from "@material-ui/core/Tooltip";
import { Plus, Trash2, Target, Tag as IconeTag, Users, CalendarClock, Copy } from "lucide-react";

import { toast } from "react-toastify";
import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import Title from "../../components/Title";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import { i18n } from "../../translate/i18n";

/**
 * Configuração do Agente Comercial.
 *
 * A tela é dividida em blocos que seguem a ordem do processo: o que o agente
 * precisa descobrir, quando considerar qualificado, o que fazer nesse caso,
 * e o que fazer quando não for. Cada ação é opcional — um agente que só
 * etiqueta é válido.
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
    marginBottom: 4,
  },
  ajuda: {
    fontSize: 12.5,
    color: theme.palette.text.secondary,
    marginBottom: theme.spacing(2),
    lineHeight: 1.55,
  },
  grade: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))",
    gap: theme.spacing(2),
  },
  linhaCampo: {
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(1.5),
    marginBottom: theme.spacing(1),
  },
  interruptor: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 14,
  },
  lista: { marginBottom: theme.spacing(2) },
  itemLista: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    padding: theme.spacing(1.5),
    borderRadius: 10,
    border: `1px solid ${theme.palette.divider}`,
    marginBottom: theme.spacing(1),
    cursor: "pointer",
  },
  itemAtivo: { borderColor: "#2563eb", borderWidth: 2 },
  acoes: { display: "flex", justifyContent: "flex-end", gap: theme.spacing(1.5) },
  vazio: {
    padding: theme.spacing(4),
    textAlign: "center",
    color: theme.palette.text.secondary,
    fontSize: 13,
  },
}));

const VAZIO = {
  name: "",
  active: true,
  promptId: "",
  templateId: "",
  extractionInstructions: "",
  requiredFields: [],
  minValue: "",
  maxValue: "",
  qualifiedTagId: "",
  qualifiedKanbanTagId: "",
  qualifiedQueueId: "",
  qualifiedUserId: "",
  transferOnQualify: false,
  disqualifiedTagId: "",
  disqualifiedKanbanTagId: "",
  schedulingEnabled: false,
  createMeetLink: false,
  eventDurationMinutes: 30,
};

const SalesAgents = () => {
  const classes = useStyles();

  const [agentes, setAgentes] = useState([]);
  const [selecionado, setSelecionado] = useState(null);
  const [form, setForm] = useState(VAZIO);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const [tags, setTags] = useState([]);
  const [kanbanTags, setKanbanTags] = useState([]);
  const [filas, setFilas] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const [prompts, setPrompts] = useState([]);
  const [templates, setTemplates] = useState([]);

  // Base de conhecimento (mídias) do prompt vinculado ao agente.
  const [knowledgeItems, setKnowledgeItems] = useState([]);
  const [knowledgeLoading, setKnowledgeLoading] = useState(false);
  const [uploading, setUploading] = useState(false);

  const carregar = async () => {
    try {
      const { data } = await api.get("/sales-agents");
      setAgentes(Array.isArray(data) ? data : []);
    } catch (err) {
      toastError(err);
    } finally {
      setCarregando(false);
    }
  };

  const carregarApoio = async () => {
    // Cada lista falha em silêncio: a ausência de filas não pode impedir de
    // configurar etiquetas.
    api.get("/tags/list").then(({ data }) => setTags(data || [])).catch(() => {});
    api.get("/tag/kanban/").then(({ data }) => setKanbanTags(data?.lista || data || [])).catch(() => {});
    api.get("/queue").then(({ data }) => setFilas(data || [])).catch(() => {});
    api.get("/users/list").then(({ data }) => setUsuarios(data || [])).catch(() => {});
    api.get("/prompt").then(({ data }) => setPrompts(data?.prompts || [])).catch(() => {});
    // scope comercial: traz modelos comerciais + os marcados como "ambos".
    api.get("/agent-templates?scope=comercial").then(({ data }) => setTemplates(data || [])).catch(() => {});
  };

  useEffect(() => {
    carregar();
    carregarApoio();
  }, []);

  const abrir = agente => {
    setSelecionado(agente.id);
    setForm({
      ...VAZIO,
      ...agente,
      // null vindo do banco quebra o Select controlado do MUI.
      promptId: agente.promptId || "",
      templateId: agente.templateId || "",
      extractionInstructions: agente.extractionInstructions || "",
      qualifiedTagId: agente.qualifiedTagId || "",
      qualifiedKanbanTagId: agente.qualifiedKanbanTagId || "",
      qualifiedQueueId: agente.qualifiedQueueId || "",
      qualifiedUserId: agente.qualifiedUserId || "",
      disqualifiedTagId: agente.disqualifiedTagId || "",
      disqualifiedKanbanTagId: agente.disqualifiedKanbanTagId || "",
      minValue: agente.minValue ?? "",
      maxValue: agente.maxValue ?? "",
      requiredFields: Array.isArray(agente.requiredFields) ? agente.requiredFields : [],
    });
  };

  const novo = () => {
    setSelecionado("novo");
    setForm({
      ...VAZIO,
      requiredFields: [
        { key: "product", label: "Produto de interesse", required: true, type: "text" },
        { key: "value", label: "Valor / orçamento", required: false, type: "money" },
      ],
    });
  };

  const salvar = async () => {
    if (!form.name.trim()) {
      toast.warning(i18n.t("salesAgents.nameRequired", "Informe o nome do agente."));
      return;
    }

    setSalvando(true);
    try {
      // Select vazio vira null; string vazia num campo de id daria erro de
      // chave estrangeira no banco.
      const payload = {
        ...form,
        promptId: form.promptId || null,
        templateId: form.templateId || null,
        extractionInstructions: form.extractionInstructions || null,
        qualifiedTagId: form.qualifiedTagId || null,
        qualifiedKanbanTagId: form.qualifiedKanbanTagId || null,
        qualifiedQueueId: form.qualifiedQueueId || null,
        qualifiedUserId: form.qualifiedUserId || null,
        disqualifiedTagId: form.disqualifiedTagId || null,
        disqualifiedKanbanTagId: form.disqualifiedKanbanTagId || null,
        minValue: form.minValue === "" ? null : Number(form.minValue),
        maxValue: form.maxValue === "" ? null : Number(form.maxValue),
      };

      if (selecionado === "novo") {
        await api.post("/sales-agents", payload);
      } else {
        await api.put(`/sales-agents/${selecionado}`, payload);
      }

      toast.success(i18n.t("salesAgents.saved", "Agente salvo!"));
      setSelecionado(null);
      carregar();
    } catch (err) {
      toastError(err);
    } finally {
      setSalvando(false);
    }
  };

  const remover = async agente => {
    try {
      await api.delete(`/sales-agents/${agente.id}`);
      toast.success(i18n.t("salesAgents.removed", "Agente removido."));
      if (selecionado === agente.id) setSelecionado(null);
      carregar();
    } catch (err) {
      toastError(err);
    }
  };

  const duplicar = async agente => {
    try {
      await api.post(`/sales-agents/${agente.id}/duplicate`);
      toast.success(i18n.t("salesAgents.duplicated", "Agente duplicado."));
      carregar();
    } catch (err) {
      toastError(err);
    }
  };

  const alterar = (campo, valor) => setForm(f => ({ ...f, [campo]: valor }));

  // Aplicar um modelo preenche as instruções de extração do agente (e é
  // guardado em templateId como referência). Não sobrescreve o promptId: a
  // conversa segue definida pelo Prompt escolhido — o modelo só semeia a
  // extração. Se o modelo não traz instruções próprias, não apaga o que havia.
  const aplicarModelo = templateId => {
    setForm(f => ({ ...f, templateId }));
    if (!templateId) return;
    const modelo = templates.find(t => String(t.id) === String(templateId));
    if (modelo && modelo.extractionInstructions) {
      setForm(f => ({ ...f, extractionInstructions: modelo.extractionInstructions }));
      toast.info(
        i18n.t(
          "salesAgents.templateApplied",
          "Instruções de extração preenchidas a partir do modelo."
        )
      );
    }
  };

  // Base de conhecimento é do Prompt: só carrega/mostra quando há prompt
  // vinculado (a mídia alimenta a conversa, que é o Prompt).
  const carregarKnowledge = async promptId => {
    if (!promptId) {
      setKnowledgeItems([]);
      return;
    }
    setKnowledgeLoading(true);
    try {
      const { data } = await api.get(`/prompt/${promptId}/knowledge`);
      setKnowledgeItems(Array.isArray(data) ? data : []);
    } catch (err) {
      // Silencioso: knowledge é acessório à configuração do agente.
      setKnowledgeItems([]);
    } finally {
      setKnowledgeLoading(false);
    }
  };

  useEffect(() => {
    carregarKnowledge(form.promptId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [form.promptId]);

  const enviarMidia = async e => {
    const file = e.target.files?.[0];
    e.target.value = ""; // permite reenviar o mesmo arquivo depois
    if (!file) return;
    if (!form.promptId) {
      toast.warning(
        i18n.t(
          "salesAgents.knowledgeNeedsPrompt",
          "Vincule um prompt de conversa antes de enviar mídias."
        )
      );
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("name", file.name);
      await api.post(`/prompt/${form.promptId}/knowledge/upload`, formData, {
        headers: { "Content-Type": "multipart/form-data" },
      });
      toast.success(i18n.t("salesAgents.knowledgeUploaded", "Mídia enviada."));
      carregarKnowledge(form.promptId);
    } catch (err) {
      toastError(err);
    } finally {
      setUploading(false);
    }
  };

  const removerMidia = async id => {
    if (!window.confirm(i18n.t("salesAgents.knowledgeRemoveConfirm", "Remover este item?"))) return;
    try {
      await api.delete(`/prompt/knowledge/${id}`);
      toast.success(i18n.t("salesAgents.knowledgeRemoved", "Item removido."));
      carregarKnowledge(form.promptId);
    } catch (err) {
      toastError(err);
    }
  };

  const alterarCampo = (indice, chave, valor) => {
    setForm(f => ({
      ...f,
      requiredFields: f.requiredFields.map((c, i) =>
        i === indice ? { ...c, [chave]: valor } : c
      ),
    }));
  };

  const seletor = (rotulo, campo, opcoes, rotuloDe = o => o.name) => (
    <TextField
      select
      size="small"
      variant="outlined"
      label={rotulo}
      value={form[campo]}
      onChange={e => alterar(campo, e.target.value)}
    >
      <MenuItem value="">{i18n.t("salesAgents.none", "Nenhum")}</MenuItem>
      {opcoes.map(o => (
        <MenuItem key={o.id} value={o.id}>
          {rotuloDe(o)}
        </MenuItem>
      ))}
    </TextField>
  );

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
        <Title>{i18n.t("salesAgents.title", "Agentes Comerciais")}</Title>
        <Button
          variant="contained"
          color="primary"
          startIcon={<Plus size={16} strokeWidth={2.2} />}
          onClick={novo}
        >
          {i18n.t("salesAgents.new", "Novo agente")}
        </Button>
      </MainHeader>

      <Paper className={classes.paper} variant="outlined">
        {!selecionado && (
          <div className={classes.lista}>
            {agentes.length === 0 ? (
              <div className={classes.vazio}>
                <Target size={28} strokeWidth={1.6} />
                <div style={{ marginTop: 8 }}>
                  {i18n.t(
                    "salesAgents.empty",
                    "Nenhum agente comercial configurado ainda."
                  )}
                </div>
              </div>
            ) : (
              agentes.map(a => (
                <div
                  key={a.id}
                  className={classes.itemLista}
                  onClick={() => abrir(a)}
                >
                  <div>
                    <div style={{ fontWeight: 600 }}>{a.name}</div>
                    <Typography variant="caption" color="textSecondary">
                      {a.active
                        ? i18n.t("salesAgents.activeOn", "Ativo")
                        : i18n.t("salesAgents.activeOff", "Pausado")}
                    </Typography>
                  </div>
                  <Tooltip title={i18n.t("salesAgents.duplicate", "Duplicar")}>
                    <IconButton
                      size="small"
                      onClick={e => {
                        e.stopPropagation();
                        duplicar(a);
                      }}
                    >
                      <Copy size={16} strokeWidth={2} />
                    </IconButton>
                  </Tooltip>
                  <Tooltip title={i18n.t("salesAgents.remove", "Remover")}>
                    <IconButton
                      size="small"
                      onClick={e => {
                        e.stopPropagation();
                        remover(a);
                      }}
                    >
                      <Trash2 size={16} strokeWidth={2} color="#ef4444" />
                    </IconButton>
                  </Tooltip>
                </div>
              ))
            )}
          </div>
        )}

        {selecionado && (
          <div>
            {/* IDENTIFICAÇÃO */}
            <div className={classes.bloco}>
              <div className={classes.tituloBloco}>
                <Target size={17} strokeWidth={2.2} />
                {i18n.t("salesAgents.identification", "Identificação")}
              </div>
              <div className={classes.grade}>
                <TextField
                  size="small"
                  variant="outlined"
                  label={i18n.t("salesAgents.name", "Nome do agente")}
                  value={form.name}
                  onChange={e => alterar("name", e.target.value)}
                />
                {seletor(
                  i18n.t("salesAgents.prompt", "Prompt de conversa"),
                  "promptId",
                  prompts
                )}
                <TextField
                  select
                  size="small"
                  variant="outlined"
                  label={i18n.t("salesAgents.template", "Modelo de partida")}
                  value={form.templateId}
                  onChange={e => aplicarModelo(e.target.value)}
                  helperText={i18n.t(
                    "salesAgents.templateHelp",
                    "Preenche as instruções de extração."
                  )}
                >
                  <MenuItem value="">{i18n.t("salesAgents.none", "Nenhum")}</MenuItem>
                  {templates.map(t => (
                    <MenuItem key={t.id} value={t.id}>
                      {t.label}
                    </MenuItem>
                  ))}
                </TextField>
                <div className={classes.interruptor}>
                  <Switch
                    color="primary"
                    checked={!!form.active}
                    onChange={e => alterar("active", e.target.checked)}
                  />
                  {form.active
                    ? i18n.t("salesAgents.activeOn", "Ativo")
                    : i18n.t("salesAgents.activeOff", "Pausado")}
                </div>
              </div>
            </div>

            {/* O QUE DESCOBRIR */}
            <div className={classes.bloco}>
              <div className={classes.tituloBloco}>
                <IconeTag size={17} strokeWidth={2.2} />
                {i18n.t("salesAgents.fields", "O que o agente precisa descobrir")}
              </div>
              <Typography className={classes.ajuda}>
                {i18n.t(
                  "salesAgents.fieldsHelp",
                  "O lead é considerado qualificado quando todos os campos marcados como obrigatórios forem descobertos na conversa."
                )}
              </Typography>

              {form.requiredFields.map((campo, i) => (
                <div key={i} className={classes.linhaCampo}>
                  <TextField
                    size="small"
                    variant="outlined"
                    label={i18n.t("salesAgents.fieldLabel", "Nome do campo")}
                    value={campo.label || ""}
                    onChange={e => alterarCampo(i, "label", e.target.value)}
                    style={{ flex: 2 }}
                  />
                  <TextField
                    size="small"
                    variant="outlined"
                    label={i18n.t("salesAgents.fieldKey", "Chave")}
                    value={campo.key || ""}
                    onChange={e =>
                      alterarCampo(i, "key", e.target.value.replace(/[^a-zA-Z0-9_]/g, ""))
                    }
                    style={{ flex: 1 }}
                  />
                  <TextField
                    select
                    size="small"
                    variant="outlined"
                    label={i18n.t("salesAgents.fieldType", "Tipo")}
                    value={campo.type || "text"}
                    onChange={e => alterarCampo(i, "type", e.target.value)}
                    style={{ width: 120 }}
                  >
                    <MenuItem value="text">Texto</MenuItem>
                    <MenuItem value="money">Valor</MenuItem>
                    <MenuItem value="date">Data</MenuItem>
                  </TextField>
                  <div className={classes.interruptor}>
                    <Switch
                      size="small"
                      color="primary"
                      checked={!!campo.required}
                      onChange={e => alterarCampo(i, "required", e.target.checked)}
                    />
                    {i18n.t("salesAgents.fieldRequired", "Obrigatório")}
                  </div>
                  <IconButton
                    size="small"
                    onClick={() =>
                      setForm(f => ({
                        ...f,
                        requiredFields: f.requiredFields.filter((_, x) => x !== i),
                      }))
                    }
                  >
                    <Trash2 size={15} strokeWidth={2} color="#ef4444" />
                  </IconButton>
                </div>
              ))}

              <Button
                size="small"
                startIcon={<Plus size={15} strokeWidth={2.2} />}
                onClick={() =>
                  setForm(f => ({
                    ...f,
                    requiredFields: [
                      ...f.requiredFields,
                      { key: "", label: "", required: false, type: "text" },
                    ],
                  }))
                }
              >
                {i18n.t("salesAgents.addField", "Adicionar campo")}
              </Button>

              <div className={classes.grade} style={{ marginTop: 16 }}>
                <TextField
                  size="small"
                  type="number"
                  variant="outlined"
                  label={i18n.t("salesAgents.minValue", "Valor mínimo")}
                  value={form.minValue}
                  onChange={e => alterar("minValue", e.target.value)}
                  helperText={i18n.t(
                    "salesAgents.valueHelp",
                    "Fora da faixa, o lead é desqualificado. Deixe vazio para não usar."
                  )}
                />
                <TextField
                  size="small"
                  type="number"
                  variant="outlined"
                  label={i18n.t("salesAgents.maxValue", "Valor máximo")}
                  value={form.maxValue}
                  onChange={e => alterar("maxValue", e.target.value)}
                />
              </div>
            </div>

            {/* INSTRUÇÕES DE EXTRAÇÃO */}
            <div className={classes.bloco}>
              <div className={classes.tituloBloco}>
                <Target size={17} strokeWidth={2.2} />
                {i18n.t("salesAgents.extraction", "Como a IA lê a conversa")}
              </div>
              <Typography className={classes.ajuda}>
                {i18n.t(
                  "salesAgents.extractionHelp",
                  "Opcional. Orienta a IA na hora de extrair os dados do lead. Vazio, usa o padrão do sistema. Escolher um modelo acima preenche isto para você."
                )}
              </Typography>
              <TextField
                fullWidth
                multiline
                minRows={4}
                maxRows={14}
                size="small"
                variant="outlined"
                value={form.extractionInstructions || ""}
                onChange={e => alterar("extractionInstructions", e.target.value)}
                placeholder={i18n.t(
                  "salesAgents.extractionPlaceholder",
                  "Ex.: Priorize identificar urgência e orçamento. Trate 'quero ver' como interesse morno..."
                )}
              />
            </div>

            {/* CONHECIMENTO / MÍDIAS */}
            <div className={classes.bloco}>
              <div className={classes.tituloBloco}>
                <IconeTag size={17} strokeWidth={2.2} />
                {i18n.t("salesAgents.knowledge", "Conhecimento e mídias")}
              </div>
              <Typography className={classes.ajuda}>
                {i18n.t(
                  "salesAgents.knowledgeHelp",
                  "Arquivos (PDF, DOC, TXT, áudio, vídeo) que alimentam a conversa do prompt vinculado. O texto de PDFs, DOCs e TXTs é extraído automaticamente."
                )}
              </Typography>

              {!form.promptId ? (
                <Typography variant="body2" color="textSecondary" style={{ fontSize: 12.5 }}>
                  {i18n.t(
                    "salesAgents.knowledgeNeedsPromptHint",
                    "Vincule um prompt de conversa na Identificação para enviar mídias."
                  )}
                </Typography>
              ) : (
                <>
                  <div style={{ marginBottom: 12 }}>
                    <input
                      id="salesAgentUpload"
                      type="file"
                      style={{ display: "none" }}
                      onChange={enviarMidia}
                    />
                    <label htmlFor="salesAgentUpload">
                      <Button
                        component="span"
                        size="small"
                        variant="outlined"
                        disabled={uploading}
                        startIcon={
                          uploading ? <CircularProgress size={14} /> : <Plus size={15} strokeWidth={2.2} />
                        }
                      >
                        {i18n.t("salesAgents.knowledgeUpload", "Enviar mídia")}
                      </Button>
                    </label>
                  </div>

                  {knowledgeLoading ? (
                    <CircularProgress size={20} />
                  ) : knowledgeItems.length === 0 ? (
                    <Typography variant="body2" color="textSecondary" style={{ fontSize: 12.5 }}>
                      {i18n.t("salesAgents.knowledgeEmpty", "Nenhuma mídia ainda.")}
                    </Typography>
                  ) : (
                    knowledgeItems.map(item => (
                      <div key={item.id} className={classes.itemLista} style={{ cursor: "default" }}>
                        <div>
                          <div style={{ fontWeight: 600 }}>{item.name}</div>
                          <Typography variant="caption" color="textSecondary">
                            {String(item.type || "").toUpperCase()}
                            {item.originalName ? ` • ${item.originalName}` : ""}
                          </Typography>
                        </div>
                        <Tooltip title={i18n.t("salesAgents.remove", "Remover")}>
                          <IconButton size="small" onClick={() => removerMidia(item.id)}>
                            <Trash2 size={15} strokeWidth={2} color="#ef4444" />
                          </IconButton>
                        </Tooltip>
                      </div>
                    ))
                  )}
                </>
              )}
            </div>

            {/* AO QUALIFICAR */}
            <div className={classes.bloco}>
              <div className={classes.tituloBloco}>
                <Users size={17} strokeWidth={2.2} />
                {i18n.t("salesAgents.onQualify", "Quando qualificar")}
              </div>
              <Typography className={classes.ajuda}>
                {i18n.t(
                  "salesAgents.onQualifyHelp",
                  "Cada ação é opcional e independente. A etiqueta é aplicada no atendimento e no contato."
                )}
              </Typography>
              <div className={classes.grade}>
                {seletor(i18n.t("salesAgents.tag", "Etiqueta"), "qualifiedTagId", tags)}
                {seletor(
                  i18n.t("salesAgents.kanban", "Etapa do Kanban"),
                  "qualifiedKanbanTagId",
                  kanbanTags
                )}
                {seletor(i18n.t("salesAgents.queue", "Fila"), "qualifiedQueueId", filas)}
                {seletor(
                  i18n.t("salesAgents.user", "Atendente"),
                  "qualifiedUserId",
                  usuarios
                )}
                <div className={classes.interruptor}>
                  <Switch
                    color="primary"
                    checked={!!form.transferOnQualify}
                    onChange={e => alterar("transferOnQualify", e.target.checked)}
                  />
                  {i18n.t("salesAgents.transfer", "Transferir para humano")}
                </div>
              </div>
            </div>

            {/* AO DESQUALIFICAR */}
            <div className={classes.bloco}>
              <div className={classes.tituloBloco}>
                <IconeTag size={17} strokeWidth={2.2} />
                {i18n.t("salesAgents.onDisqualify", "Quando desqualificar")}
              </div>
              <div className={classes.grade}>
                {seletor(
                  i18n.t("salesAgents.tag", "Etiqueta"),
                  "disqualifiedTagId",
                  tags
                )}
                {seletor(
                  i18n.t("salesAgents.kanban", "Etapa do Kanban"),
                  "disqualifiedKanbanTagId",
                  kanbanTags
                )}
              </div>
            </div>

            {/* AGENDAMENTO */}
            <div className={classes.bloco}>
              <div className={classes.tituloBloco}>
                <CalendarClock size={17} strokeWidth={2.2} />
                {i18n.t("salesAgents.scheduling", "Agendamento")}
              </div>
              <Typography className={classes.ajuda}>
                {i18n.t(
                  "salesAgents.schedulingHelp",
                  "Requer a integração com Google Agenda configurada. A execução do agendamento entra na próxima etapa."
                )}
              </Typography>
              <div className={classes.grade}>
                <div className={classes.interruptor}>
                  <Switch
                    color="primary"
                    checked={!!form.schedulingEnabled}
                    onChange={e => alterar("schedulingEnabled", e.target.checked)}
                  />
                  {i18n.t("salesAgents.schedulingOn", "Permitir agendar")}
                </div>
                <div className={classes.interruptor}>
                  <Switch
                    color="primary"
                    checked={!!form.createMeetLink}
                    onChange={e => alterar("createMeetLink", e.target.checked)}
                  />
                  {i18n.t("salesAgents.meet", "Criar link do Meet")}
                </div>
                <TextField
                  size="small"
                  type="number"
                  variant="outlined"
                  label={i18n.t("salesAgents.duration", "Duração (min)")}
                  value={form.eventDurationMinutes}
                  onChange={e => alterar("eventDurationMinutes", e.target.value)}
                />
              </div>
            </div>

            <div className={classes.acoes}>
              <Button onClick={() => setSelecionado(null)}>
                {i18n.t("salesAgents.cancel", "Cancelar")}
              </Button>
              <Button
                variant="contained"
                color="primary"
                disabled={salvando}
                onClick={salvar}
                startIcon={salvando ? <CircularProgress size={15} /> : null}
              >
                {i18n.t("salesAgents.save", "Salvar")}
              </Button>
            </div>
          </div>
        )}
      </Paper>
    </MainContainer>
  );
};

export default SalesAgents;
