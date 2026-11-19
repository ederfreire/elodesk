/**
 * EDITOR VISUAL DA URA DE VOZ.
 *
 * Mesmo canvas dos fluxos de conversa (react-flow): arrastar o passo para a
 * tela, ligar um no outro com a seta, clicar para configurar. O que muda são
 * os passos, que aqui são de ligação — falar, ouvir, menu falado, transferir.
 *
 * O fluxo NÃO é salvo no banco da plataforma: ele vive no serviço de chamadas,
 * que é quem executa durante a ligação. Esta tela fala com ele pelos endpoints
 * /voice-ivr, que já existiam.
 */
import React, { useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { useHistory, useParams } from "react-router-dom";
import ReactFlow, {
  addEdge,
  Background,
  Controls,
  MiniMap,
  useEdgesState,
  useNodesState,
} from "react-flow-renderer";
import { makeStyles } from "@material-ui/core/styles";
import {
  Button,
  CircularProgress,
  Divider,
  FormControl,
  IconButton,
  InputAdornment,
  InputLabel,
  MenuItem,
  Select,
  Switch,
  FormControlLabel,
  TextField,
  Tooltip,
  Typography,
} from "@material-ui/core";
import ArrowBackIcon from "@material-ui/icons/ArrowBack";
import SaveIcon from "@material-ui/icons/Save";
import RefreshIcon from "@material-ui/icons/Refresh";
import VisibilityIcon from "@material-ui/icons/Visibility";
import VisibilityOffIcon from "@material-ui/icons/VisibilityOff";
import DeleteIcon from "@material-ui/icons/Delete";
import WarningIcon from "@material-ui/icons/ReportProblemOutlined";
import VolumeUpIcon from "@material-ui/icons/VolumeUp";
import CloudUploadIcon from "@material-ui/icons/CloudUpload";
import PlayCircleOutlineIcon from "@material-ui/icons/PlayCircleOutline";
import Dialog from "@material-ui/core/Dialog";
import DialogTitle from "@material-ui/core/DialogTitle";
import DialogContent from "@material-ui/core/DialogContent";
import DialogActions from "@material-ui/core/DialogActions";
import { toast } from "react-toastify";

import api from "../../services/api";
import toastError from "../../errors/toastError";
import { i18n } from "../../translate/i18n";
import { AuthContext } from "../../context/Auth/AuthContext";
import { tiposDeNo, paleta } from "./nos";
import { paraCanvas, paraServidor, problemas, ID_INICIO } from "./grafo";
import { modelos } from "./modelos";
import { traduzirTextosDeModelo } from "./traduzirModelo";
import PainelDeTeste, { falar } from "./teste";

const useStyles = makeStyles((theme) => ({
  /* A altura e MEDIDA, nao chutada. Antes era `calc(100vh - 48px)`, que
     supunha so a barra do topo — mas dentro do <main> ainda ha o espacador de
     48px, e em algumas empresas uma faixa de aviso de vencimento. O editor
     ficava mais alto que o espaco disponivel, a pagina ganhava rolagem e o
     painel da direita era cortado na borda. */
  tela: {
    display: "flex",
    flexDirection: "column",
    width: "100%",
    maxWidth: "100%",
    minWidth: 0,
    overflow: "hidden",
    boxSizing: "border-box",
    background: theme.palette.background.default,
  },
  topo: {
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(1),
    padding: "10px 16px",
    borderBottom: `1px solid ${theme.palette.divider}`,
    flexShrink: 0,
    flexWrap: "wrap",
  },
  nome: { minWidth: 240, flex: "0 1 320px" },
  corpo: { display: "flex", flex: "1 1 auto", minHeight: 0, minWidth: 0, overflow: "hidden" },
  paleta: {
    width: 180,
    maxWidth: "26%",
    flexShrink: 0,
    borderRight: `1px solid ${theme.palette.divider}`,
    padding: theme.spacing(1),
    overflowY: "auto",
    ...theme.scrollbarStyles,
  },
  itemPaleta: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    color: "#fff",
    borderRadius: 8,
    padding: "7px 10px",
    marginBottom: 6,
    fontSize: 13,
    fontWeight: 600,
    cursor: "grab",
    userSelect: "none",
  },
  canvas: { flex: "1 1 auto", minWidth: 0, position: "relative" },
  painel: {
    width: 300,
    maxWidth: "34%",
    flexShrink: 0,
    borderLeft: `1px solid ${theme.palette.divider}`,
    padding: theme.spacing(1.5),
    overflowY: "auto",
    ...theme.scrollbarStyles,
  },
  secao: { fontWeight: 700, marginBottom: theme.spacing(1) },
  campo: { marginBottom: theme.spacing(1) },
  opcao: { display: "flex", gap: 6, alignItems: "center", marginBottom: 6 },
  avisos: {
    background: theme.palette.type === "dark" ? "rgba(255,193,7,.12)" : "#fff8e1",
    border: "1px solid rgba(255,193,7,.6)",
    borderRadius: 8,
    padding: "8px 10px",
    margin: theme.spacing(1),
    fontSize: 12,
    lineHeight: 1.5,
  },
  carregando: { display: "flex", alignItems: "center", justifyContent: "center", flex: 1 },
  blocoOpcao: {
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: 8,
    padding: "6px 8px",
    marginBottom: 8,
  },
  cartaoModelo: {
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: 10,
    padding: "10px 12px",
    marginBottom: 8,
    cursor: "pointer",
    "&:hover": {
      borderColor: theme.palette.primary.main,
      background: theme.palette.type === "dark" ? "rgba(255,255,255,.04)" : "rgba(0,0,0,.02)",
    },
  },
  /* Painel de teste: entra entre o canvas e as propriedades. */
  painelTeste: {
    width: 280,
    maxWidth: "32%",
    flexShrink: 0,
    borderLeft: `1px solid ${theme.palette.divider}`,
    display: "flex",
    flexDirection: "column",
    minHeight: 0,
  },
  tituloTeste: { display: "flex", alignItems: "center", padding: "8px 8px 8px 12px" },
  conversaTeste: {
    flex: "1 1 auto",
    minHeight: 0,
    overflowY: "auto",
    padding: theme.spacing(1),
    ...theme.scrollbarStyles,
  },
  fala_ura: {
    background: theme.palette.type === "dark" ? "rgba(255,255,255,.08)" : "#eceff1",
    borderRadius: "10px 10px 10px 2px",
    padding: "6px 9px",
    marginBottom: 6,
    fontSize: 13,
  },
  fala_cliente: {
    background: theme.palette.primary.main,
    color: "#fff",
    borderRadius: "10px 10px 2px 10px",
    padding: "6px 9px",
    marginBottom: 6,
    fontSize: 13,
    marginLeft: "22%",
  },
  fala_nota: { fontSize: 12, opacity: 0.7, fontStyle: "italic", marginBottom: 6 },
  fala_fim: {
    fontSize: 12,
    fontWeight: 700,
    color: theme.palette.text.secondary,
    borderTop: `1px dashed ${theme.palette.divider}`,
    paddingTop: 6,
    marginTop: 4,
  },
  fala_erro: {
    fontSize: 12,
    color: theme.palette.error.main,
    marginBottom: 6,
  },
  respostasTeste: {
    borderTop: `1px solid ${theme.palette.divider}`,
    padding: theme.spacing(1),
    flexShrink: 0,
  },
}));

const novoId = () => `n${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

const VoiceIvrFlow = () => {
  const classes = useStyles();
  const history = useHistory();
  const { id } = useParams();
  const { user } = useContext(AuthContext);

  const [nos, setNos, aoMudarNos] = useNodesState([]);
  const [arestas, setArestas, aoMudarArestas] = useEdgesState([]);
  const [nome, setNome] = useState("");
  const [voz, setVoz] = useState({ provider: "piper", voiceId: "" });
  const [selecionado, setSelecionado] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);
  const [filas, setFilas] = useState([]);
  const [usuarios, setUsuarios] = useState([]);
  const areaRef = useRef(null);
  const raizRef = useRef(null);
  const refAudio = useRef(null);
  const [testando, setTestando] = useState(false);
  const [escolhendoModelo, setEscolhendoModelo] = useState(false);
  const [ouvindo, setOuvindo] = useState(false);
  const [mostrarChave, setMostrarChave] = useState(false);
  const [buscandoVozes, setBuscandoVozes] = useState(false);
  const [catalogo, setCatalogo] = useState({ vozes: [], modelos: [] });
  const [vozesGratis, setVozesGratis] = useState([]);
  // `fitView` do react-flow só roda ao montar. Quando o grafo é TROCADO
  // inteiro (abrir uma URA, aplicar um modelo), os passos novos ficavam fora
  // da vista e a tela parecia vazia. Mudar a chave remonta o canvas, e ele
  // reenquadra sozinho.
  const [versaoDoGrafo, setVersaoDoGrafo] = useState(0);
  const [altura, setAltura] = useState(null);

  // ALTURA MEDIDA, NAO CHUTADA.
  // O editor precisa de altura definida (o canvas nao funciona sem), mas o
  // que sobra na tela depende do shell: barra do topo, espacador, e a faixa
  // de aviso de vencimento que algumas empresas veem. Qualquer `calc(100vh -
  // alguma coisa)` acerta numa instalacao e erra na outra — e o erro aparece
  // como pagina rolando e painel cortado na borda.
  useLayoutEffect(() => {
    const medir = () => {
      const el = raizRef.current;
      if (!el) return;
      const topo = el.getBoundingClientRect().top;
      setAltura(Math.max(420, Math.floor(window.innerHeight - topo - 4)));
    };
    medir();
    window.addEventListener("resize", medir);
    return () => window.removeEventListener("resize", medir);
  }, []);

  // ---- carregar -----------------------------------------------------------
  useEffect(() => {
    (async () => {
      try {
        const [{ data: filasApi }, { data: usuariosApi }] = await Promise.all([
          api.get("/queue").catch(() => ({ data: [] })),
          api.get("/users/list").catch(() => ({ data: [] })),
        ]);
        // Vozes gratuitas (Piper) instaladas no servidor. Falha aqui nao
        // impede nada: sem a lista, a URA usa a voz padrao do servidor.
        api
          .get("/voice-ivr/vozes-gratis")
          .then(({ data }) => setVozesGratis(Array.isArray(data?.vozes) ? data.vozes : []))
          .catch(() => setVozesGratis([]));
        setFilas(Array.isArray(filasApi) ? filasApi : []);
        setUsuarios(Array.isArray(usuariosApi) ? usuariosApi : usuariosApi?.users || []);
      } catch (e) {
        /* a tela abre mesmo sem as listas; o aviso de transferência cobre */
      }
      // "novo" e a URA que ainda nao existe. Tratado por nome, e nao so pela
      // ordem das rotas: se um dia outra rota casar antes, a tela buscaria
      // uma URA chamada "novo" e o servico responderia "not found" — um erro
      // em ingles, sem explicacao, numa tela em branco.
      if (!id || id === "novo") {
        const { nos: n, arestas: a } = paraCanvas({});
        setNos(n);
        setArestas(a);
        setCarregando(false);
        // Tela em branco e a parte dificil: a escolha de modelo aparece de
        // cara, e "comecar do zero" continua a um clique.
        setEscolhendoModelo(true);
        return;
      }
      try {
        const { data } = await api.get(`/voice-ivr/${id}`);
        setNome(data?.name || "");
        let grafo = data?.graph || {};
        if (typeof grafo === "string") grafo = JSON.parse(grafo || "{}");
        if (grafo?.voice) setVoz(grafo.voice);
        const { nos: n, arestas: a } = paraCanvas(grafo);
        setNos(n);
        setArestas(a);
        setVersaoDoGrafo((v) => v + 1);
      } catch (err) {
        // A URA pode ter sido apagada, ou o link estar velho. O recado do
        // servico e "not found", em ingles e sem contexto: aqui vira uma
        // frase que diz o que aconteceu e o que da para fazer.
        const sumiu = err?.response?.status === 404;
        if (sumiu) {
          toast.warn(
            i18n.t(
              "voiceIvrFlow.naoEncontrada",
              "Esta URA não existe mais. Comece uma nova por aqui, ou volte para a lista."
            )
          );
          const { nos: n, arestas: a } = paraCanvas({});
          setNos(n);
          setArestas(a);
        } else {
          toastError(err);
        }
      } finally {
        setCarregando(false);
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [id]);

  // ---- canvas -------------------------------------------------------------
  const apagarNo = useCallback(
    (idNo) => {
      setNos((atual) => atual.filter((n) => n.id !== idNo));
      setArestas((atual) => atual.filter((e) => e.source !== idNo && e.target !== idNo));
      setSelecionado((s) => (s === idNo ? null : s));
    },
    [setNos, setArestas]
  );

  const duplicarNo = useCallback(
    (idNo) => {
      setNos((atual) => {
        const original = atual.find((n) => n.id === idNo);
        if (!original) return atual;
        return [
          ...atual,
          {
            ...original,
            id: novoId(),
            position: { x: original.position.x + 40, y: original.position.y + 60 },
            data: { ...original.data },
          },
        ];
      });
    },
    [setNos]
  );

  // As funções de apagar/duplicar entram no `data` porque é por ali que o
  // react-flow entrega qualquer coisa ao componente do nó. Elas são tiradas
  // antes de salvar (ver grafo.js).
  const nosComAcoes = useMemo(
    () =>
      nos.map((n) => {
        const fila = filas.find((f) => String(f.id) === String(n.data?.queueId));
        const operador = usuarios.find((u) => String(u.id) === String(n.data?.userId));
        return {
          ...n,
          data: {
            ...n.data,
            aoApagar: apagarNo,
            aoDuplicar: duplicarNo,
            nomeDoDestino:
              n.data?.target === "wallet"
                ? `${i18n.t("voiceIvrFlow.carteira.resumo", "Atendente da carteira")}${fila?.name || operador?.name ? ` → ${fila?.name || operador?.name}` : ""}`
                : !fila && operador
                  ? `📞 ${operador.name}`
                  : fila?.name || operador?.name || "",
          },
        };
      }),
    [nos, filas, usuarios, apagarNo, duplicarNo]
  );

  const aoConectar = useCallback(
    (params) =>
      setArestas((atual) => {
        // Uma saída leva a UM lugar. Sem isto, duas setas saindo do mesmo
        // ponto fariam a ligação seguir a primeira e a outra ficaria no
        // desenho sem nunca acontecer.
        const limpo = atual.filter(
          (e) =>
            !(
              e.source === params.source &&
              (e.sourceHandle || "out") === (params.sourceHandle || "out")
            )
        );
        return addEdge({ ...params, animated: true }, limpo);
      }),
    [setArestas]
  );

  const aoSoltar = useCallback(
    (evento) => {
      evento.preventDefault();
      const tipo = evento.dataTransfer.getData("application/ura");
      if (!tipo) return;
      const modelo = paleta().find((p) => p.tipo === tipo);
      if (!modelo) return;
      const area = areaRef.current.getBoundingClientRect();
      setNos((atual) => [
        ...atual,
        {
          id: novoId(),
          type: tipo,
          position: { x: evento.clientX - area.left - 100, y: evento.clientY - area.top - 20 },
          data: JSON.parse(JSON.stringify(modelo.padrao)),
        },
      ]);
    },
    [setNos]
  );

  // Cada provedor guarda a chave no SEU campo: e assim que o serviço de
  // chamadas lê (FlowVoiceConfig.elevenlabsApiKey / .openaiApiKey). Um campo
  // só, compartilhado, mandaria a chave do ElevenLabs para a OpenAI.
  const campoDaChave = (v) =>
    v.provider === "openai" ? "openaiApiKey" : "elevenlabsApiKey";
  const chaveDoProvedor = (v) => v[campoDaChave(v)] || "";
  const setChaveDoProvedor = (valor) =>
    setVoz((atual) => ({ ...atual, [campoDaChave(atual)]: valor }));

  const buscarVozes = async () => {
    const chave = chaveDoProvedor(voz);
    if (!chave) return;
    setBuscandoVozes(true);
    try {
      const { data } = await api.post("/voice-ivr/vozes", {
        provider: voz.provider,
        apiKey: chave,
      });
      const vozes = Array.isArray(data?.vozes) ? data.vozes : [];
      const modelosDeVoz = Array.isArray(data?.modelos) ? data.modelos : [];
      setCatalogo({ vozes, modelos: modelosDeVoz });
      if (!vozes.length) {
        toast.warn(
          i18n.t("voiceIvrFlow.semVozes", "Nenhuma voz encontrada nesta conta.")
        );
      } else if (!voz.voiceId) {
        // Escolhe a primeira: sem voz escolhida o provedor não fala, e o
        // usuário não tem como adivinhar que faltava isso.
        setVoz((atual) => ({ ...atual, voiceId: vozes[0].id }));
      }
    } catch (err) {
      toastError(err);
      setCatalogo({ vozes: [], modelos: [] });
    } finally {
      setBuscandoVozes(false);
    }
  };

  const aplicarModelo = (modelo) => {
    const g = modelo.grafo();
    const { nos: n, arestas: a } = paraCanvas(g);
    setNos(n);
    setArestas(a);
    setVersaoDoGrafo((v) => v + 1);
    if (!nome.trim()) setNome(modelo.nome);
    setEscolhendoModelo(false);
    setSelecionado(null);
  };

  // Ouvir UMA frase, com a voz do fluxo. O audio vem do mesmo sintetizador
  // que a ligacao usa — uma previa com outra voz daria confianca no que nao
  // foi conferido.
  const ouvirTrecho = async (texto) => {
    if (!String(texto || "").trim()) {
      toast.warn(i18n.t("voiceIvrFlow.semTextoParaOuvir", "Escreva o texto antes de ouvir."));
      return;
    }
    setOuvindo(true);
    const erro = await falar(texto, voz, refAudio);
    setOuvindo(false);
    if (erro) toast.error(erro);
  };

  const alterar = (campo, valor) =>
    setNos((atual) =>
      atual.map((n) => (n.id === selecionado ? { ...n, data: { ...n.data, [campo]: valor } } : n))
    );

  const [enviandoArquivo, setEnviandoArquivo] = useState(false);
  const enviarArquivo = async (arquivo) => {
    if (!arquivo) return;
    setEnviandoArquivo(true);
    try {
      const form = new FormData();
      form.append("file", arquivo);
      const { data } = await api.post("/voice-ivr/upload", form);
      setNos((atual) =>
        atual.map((n) =>
          n.id === selecionado
            ? { ...n, data: { ...n.data, mediaUrl: data.url, filename: data.filename || arquivo.name } }
            : n
        )
      );
    } catch (err) {
      toastError(err);
    } finally {
      setEnviandoArquivo(false);
    }
  };

  const PALETA = paleta();
  const noAtual = nos.find((n) => n.id === selecionado) || null;
  // `i18n.t` NAO pode ser passado como referencia: solto do objeto, o i18next
  // perde o `this` e estoura com "Cannot read properties of undefined
  // (reading 'translator')" — que derruba a tela inteira. Vai embrulhado.
  const traduzir = useCallback((chave, padrao) => i18n.t(chave, padrao), []);
  const pendencias = useMemo(() => problemas(nos, arestas, traduzir), [nos, arestas, traduzir]);

  // URA criada a partir de um modelo com a tela em outro idioma: os textos
  // ficaram gravados naquele idioma. Oferece trocar pelo idioma atual.
  const textosEmOutroIdioma = useMemo(
    () => traduzirTextosDeModelo(nos, nome).quantos,
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nos, nome, i18n.language]
  );
  const traduzirParaIdiomaAtual = () => {
    const r = traduzirTextosDeModelo(nos, nome);
    if (!r.quantos) return;
    setNos(r.nos);
    setNome(r.nome);
    toast.success(
      i18n.t("voiceIvrFlow.idioma.feito", "Textos trocados para o idioma atual. Confira e clique em Salvar.")
    );
  };

  // ---- salvar -------------------------------------------------------------
  const salvar = async () => {
    if (!nome.trim()) {
      toast.warn(i18n.t("voiceIvrFlow.nomeObrigatorio", "Dê um nome para a URA antes de salvar."));
      return;
    }
    setSalvando(true);
    try {
      // O backend espera `name` e `graph` (JSON em texto). Com outro nome de
      // campo ele salva uma URA VAZIA chamada "Nova URA", sem erro nenhum.
      const corpo = {
        name: nome.trim(),
        enabled: true,
        graph: JSON.stringify(paraServidor(nos, arestas, voz)),
      };
      if (id) {
        await api.put(`/voice-ivr/${id}`, corpo);
      } else {
        const { data } = await api.post("/voice-ivr", corpo);
        const novo = data?.id || data?.flow?.id;
        if (novo) history.replace(`/voice-ivr/${novo}`);
      }
      toast.success(i18n.t("voiceIvrFlow.salva", "URA salva."));
    } catch (err) {
      toastError(err);
    } finally {
      setSalvando(false);
    }
  };

  if (carregando) {
    return (
      <div className={classes.tela} ref={raizRef} style={{ height: altura || "70vh" }}>
        <div className={classes.carregando}>
          <CircularProgress />
        </div>
      </div>
    );
  }

  return (
    <div className={classes.tela} ref={raizRef} style={{ height: altura || "70vh" }}>
      <div className={classes.topo}>
        <Tooltip title={i18n.t("voiceIvrFlow.voltar", "Voltar")}>
          <IconButton size="small" onClick={() => history.push("/flowbuilders")}>
            <ArrowBackIcon />
          </IconButton>
        </Tooltip>
        <TextField
          className={classes.nome}
          label={i18n.t("voiceIvrFlow.nome", "Nome da URA")}
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          variant="outlined"
          margin="dense"
        />
        <FormControl variant="outlined" margin="dense" style={{ minWidth: 210 }}>
          <InputLabel>{i18n.t("voiceIvrFlow.voz", "Voz")}</InputLabel>
          <Select
            value={voz.provider || "piper"}
            label={i18n.t("voiceIvrFlow.voz", "Voz")}
            onChange={(e) => {
              // Voz e modelo de um provedor não valem no outro.
              setVoz({ ...voz, provider: e.target.value, voiceId: "", model: "" });
              setCatalogo({ vozes: [], modelos: [] });
            }}
          >
            <MenuItem value="piper">
              {i18n.t("voiceIvr.voz.provedores.piper", "Voz do servidor (grátis)")}
            </MenuItem>
            <MenuItem value="elevenlabs">ElevenLabs</MenuItem>
            <MenuItem value="openai">OpenAI</MenuItem>
          </Select>
        </FormControl>

        {/* QUAL voz gratuita. O Piper tem varios modelos — masculina,
            feminina, qualidades diferentes. Antes "voz do servidor" era
            oferecida como se fosse uma so, e quem instalasse outra nao tinha
            onde escolher. */}
        {voz.provider === "piper" && vozesGratis.length > 0 && (
          <FormControl variant="outlined" margin="dense" style={{ minWidth: 250 }}>
            <InputLabel>{i18n.t("voiceIvrFlow.qualVoz", "Qual voz")}</InputLabel>
            <Select
              value={voz.voiceId || ""}
              label={i18n.t("voiceIvrFlow.qualVoz", "Qual voz")}
              onChange={(e) => setVoz({ ...voz, voiceId: e.target.value })}
            >
              <MenuItem value="">
                {i18n.t("voiceIvrFlow.vozPadraoServidor", "Padrão do servidor")}
              </MenuItem>
              {vozesGratis.map((v) => (
                <MenuItem key={v.id} value={v.id}>
                  {v.nome}
                  {v.instalada === false && (
                    <span style={{ opacity: 0.6, marginLeft: 6, fontSize: "0.8em" }}>
                      {i18n.t("voiceIvrFlow.baixaNoPrimeiroUso", "(baixa no primeiro uso)")}
                    </span>
                  )}
                </MenuItem>
              ))}
            </Select>
          </FormControl>
        )}

        {/* CHAVE E VOZ DO PROVEDOR PAGO.
            Dava para escolher ElevenLabs ou OpenAI na lista, mas nao havia
            onde pôr a chave nem como escolher a voz: a URA salvava o provedor
            sem credencial e ficava MUDA, sem dizer por quê. */}
        {voz.provider !== "piper" && (
          <>
            <TextField
              style={{ minWidth: 230 }}
              label={i18n.t("voiceIvrFlow.chave", "Chave da API")}
              value={chaveDoProvedor(voz)}
              onChange={(e) => setChaveDoProvedor(e.target.value)}
              type={mostrarChave ? "text" : "password"}
              autoComplete="new-password"
              variant="outlined"
              margin="dense"
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  buscarVozes();
                }
              }}
              InputProps={{
                endAdornment: (
                  <InputAdornment position="end">
                    <IconButton size="small" edge="end" onClick={() => setMostrarChave((v) => !v)}>
                      {mostrarChave ? <VisibilityOffIcon fontSize="small" /> : <VisibilityIcon fontSize="small" />}
                    </IconButton>
                  </InputAdornment>
                ),
              }}
            />
            <Button
              variant="outlined"
              disabled={buscandoVozes || !chaveDoProvedor(voz)}
              startIcon={buscandoVozes ? <CircularProgress size={14} /> : <RefreshIcon />}
              onClick={buscarVozes}
            >
              {i18n.t("voiceIvrFlow.buscarVozes", "Buscar vozes")}
            </Button>
            {catalogo.vozes.length > 0 && (
              <FormControl variant="outlined" margin="dense" style={{ minWidth: 200 }}>
                <InputLabel>{i18n.t("voiceIvrFlow.escolhaVoz", "Voz")}</InputLabel>
                <Select
                  value={voz.voiceId || ""}
                  label={i18n.t("voiceIvrFlow.escolhaVoz", "Voz")}
                  onChange={(e) => setVoz({ ...voz, voiceId: e.target.value })}
                >
                  {catalogo.vozes.map((v) => (
                    <MenuItem key={v.id} value={v.id}>
                      {v.nome}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
            {catalogo.modelos.length > 0 && (
              <FormControl variant="outlined" margin="dense" style={{ minWidth: 180 }}>
                <InputLabel>{i18n.t("voiceIvrFlow.modelo", "Modelo")}</InputLabel>
                <Select
                  value={voz.model || ""}
                  label={i18n.t("voiceIvrFlow.modelo", "Modelo")}
                  onChange={(e) => setVoz({ ...voz, model: e.target.value })}
                >
                  {catalogo.modelos.map((m) => (
                    <MenuItem key={m.id} value={m.id}>
                      {m.nome}
                    </MenuItem>
                  ))}
                </Select>
              </FormControl>
            )}
          </>
        )}

        <div style={{ flex: 1 }} />
        <Button
          variant="outlined"
          onClick={() => setEscolhendoModelo(true)}
          startIcon={<PlayCircleOutlineIcon />}
        >
          {i18n.t("voiceIvrFlow.usarModelo", "Usar um modelo pronto")}
        </Button>
        {/* TESTAR: percorre o fluxo e TOCA o audio de verdade, sem precisar
            ligar para o numero. */}
        <Button
          variant="outlined"
          color="primary"
          onClick={() => setTestando((v) => !v)}
          startIcon={ouvindo ? <CircularProgress size={14} /> : <VolumeUpIcon />}
        >
          {testando
            ? i18n.t("voiceIvrFlow.fecharTeste", "Fechar teste")
            : i18n.t("voiceIvrFlow.testar", "Testar e ouvir")}
        </Button>
        <Button
          variant="contained"
          color="primary"
          disableElevation
          startIcon={salvando ? <CircularProgress size={16} /> : <SaveIcon />}
          disabled={salvando}
          onClick={salvar}
        >
          {i18n.t("voiceIvrFlow.salvar", "Salvar")}
        </Button>
      </div>

      {textosEmOutroIdioma > 0 && (
        <div className={classes.avisos} style={{ display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
          <span>
            <WarningIcon style={{ fontSize: 15, verticalAlign: "-2px", marginRight: 6 }} />
            {i18n.t(
              "voiceIvrFlow.idioma.aviso",
              "Esta URA foi criada a partir de um modelo em outro idioma, e os textos foram gravados naquele idioma."
            )}
          </span>
          <Button size="small" variant="outlined" color="primary" onClick={traduzirParaIdiomaAtual} style={{ textTransform: "none" }}>
            {i18n.t("voiceIvrFlow.idioma.botao", "Trocar os textos para o idioma atual")}
          </Button>
        </div>
      )}

      {pendencias.length > 0 && (
        <div className={classes.avisos}>
          <WarningIcon style={{ fontSize: 15, verticalAlign: "-2px", marginRight: 6 }} />
          <b>{i18n.t("voiceIvrFlow.revise", "Revise antes de usar com cliente de verdade:")}</b>
          <ul style={{ margin: "4px 0 0 18px", padding: 0 }}>
            {pendencias.slice(0, 5).map((p, i) => (
              <li key={i}>{p}</li>
            ))}
          </ul>
        </div>
      )}

      <div className={classes.corpo}>
        <div className={classes.paleta}>
          <Typography variant="caption" color="textSecondary">
            {i18n.t("voiceIvrFlow.arraste", "Arraste para a tela")}
          </Typography>
          <div style={{ height: 8 }} />
          {PALETA.map((p, idx) => {
            const Icone = p.icone;
            const abreGrupo = p.grupo === "automacoes" && PALETA[idx - 1]?.grupo !== "automacoes";
            return (
              <React.Fragment key={p.tipo}>
              {abreGrupo && (
                <Typography
                  variant="caption"
                  color="textSecondary"
                  style={{ display: "block", margin: "12px 2px 6px", fontWeight: 700, letterSpacing: 0.4, textTransform: "uppercase" }}
                >
                  {i18n.t("voiceIvrFlow.automacoes", "Automações")}
                </Typography>
              )}
              <div
                className={classes.itemPaleta}
                style={{ background: p.cor }}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData("application/ura", p.tipo);
                  e.dataTransfer.effectAllowed = "move";
                }}
              >
                <Icone style={{ fontSize: 16 }} />
                {p.titulo}
              </div>
              </React.Fragment>
            );
          })}
        </div>

        <div
          className={classes.canvas}
          ref={areaRef}
          onDrop={aoSoltar}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
          }}
        >
          <ReactFlow
            key={versaoDoGrafo}
            nodes={nosComAcoes}
            edges={arestas}
            onNodesChange={aoMudarNos}
            onEdgesChange={aoMudarArestas}
            onConnect={aoConectar}
            nodeTypes={tiposDeNo}
            onNodeClick={(_, n) => setSelecionado(n.id === ID_INICIO ? null : n.id)}
            onPaneClick={() => setSelecionado(null)}
            deleteKeyCode={null}
            fitView
          >
            <Background variant="dots" gap={16} size={1} />
            <Controls />
            <MiniMap pannable zoomable />
          </ReactFlow>
        </div>

        {testando && (
          <PainelDeTeste
            nos={nos}
            arestas={arestas}
            voz={voz}
            classes={classes}
            aoFechar={() => setTestando(false)}
          />
        )}

        <div className={classes.painel}>
          {!noAtual && (
            <Typography variant="body2" color="textSecondary">
              {i18n.t(
                "voiceIvrFlow.semSelecao",
                "Clique num passo para configurar o que ele faz na ligação."
              )}
            </Typography>
          )}

          {noAtual && (
            <>
              <Typography variant="subtitle2" className={classes.secao}>
                {PALETA.find((p) => p.tipo === noAtual.type)?.titulo || noAtual.type}
              </Typography>

              {["message", "voice_menu", "dtmf_capture", "transfer"].includes(noAtual.type) && (
                <>
                  <TextField
                    className={classes.campo}
                    fullWidth
                    multiline
                    minRows={2}
                    label={i18n.t("voiceIvrFlow.oQueFalar", "O que a URA fala")}
                    value={noAtual.data.prompt || ""}
                    onChange={(e) => alterar("prompt", e.target.value)}
                    variant="outlined"
                    margin="dense"
                  />
                  <Button
                    size="small"
                    startIcon={ouvindo ? <CircularProgress size={13} /> : <VolumeUpIcon />}
                    disabled={ouvindo}
                    onClick={() => ouvirTrecho(noAtual.data.prompt)}
                    style={{ marginBottom: 8, textTransform: "none" }}
                  >
                    {i18n.t("voiceIvrFlow.ouvirEste", "Ouvir este trecho")}
                  </Button>
                </>
              )}

              {noAtual.type === "voice_menu" && (
                <>
                  <div style={{ background: "#f4f6f8", border: "1px solid #e3e7eb", borderRadius: 8, padding: "10px 12px", marginBottom: 10 }}>
                    <FormControlLabel
                      style={{ margin: 0, width: "100%", justifyContent: "space-between" }}
                      labelPlacement="start"
                      control={
                        <Switch
                          color="primary"
                          checked={!!noAtual.data.voiceOnly}
                          onChange={(e) => alterar("voiceOnly", e.target.checked)}
                        />
                      }
                      label={<b style={{ fontSize: 12, textTransform: "uppercase" }}>{i18n.t("voiceIvrFlow.idVoz", "Identificação por voz")}</b>}
                    />
                    <Typography variant="caption" color="textSecondary" display="block">
                      {i18n.t("voiceIvrFlow.idVozAjuda", "Sim: ignora teclas e identifica apenas o áudio falado pelo cliente. Não: aceita voz e DTMF.")}
                    </Typography>
                  </div>
                  <TextField
                    className={classes.campo}
                    fullWidth
                    type="number"
                    inputProps={{ step: 0.1, min: 0.2 }}
                    label={i18n.t("voiceIvrFlow.silencio", "Pausa após o cliente falar (s)")}
                    helperText={i18n.t("voiceIvrFlow.silencioAjuda", "Quanto a URA espera em silêncio antes de entender a resposta e seguir. Menor = responde mais rápido (padrão 0.7; abaixo de 0.5 pode cortar frases).")}
                    value={noAtual.data.silenceMs ? noAtual.data.silenceMs / 1000 : 0.7}
                    onChange={(e) => alterar("silenceMs", Math.max(0, Math.round(Number(e.target.value) * 1000)))}
                    variant="outlined"
                    margin="dense"
                  />
                  <TextField
                    className={classes.campo}
                    fullWidth
                    type="number"
                    inputProps={{ step: 0.001, min: 0.001 }}
                    label={i18n.t("voiceIvrFlow.sensib", "Sensibilidade da voz (threshold)")}
                    helperText={i18n.t("voiceIvrFlow.sensibAjuda", "Menor = capta voz baixa; maior = evita ruído. Recomendado: 0.004 a 0.010.")}
                    value={noAtual.data.speechThreshold || 0.0025}
                    onChange={(e) => alterar("speechThreshold", Number(e.target.value))}
                    variant="outlined"
                    margin="dense"
                  />
                  <div style={{ display: "flex", gap: 8 }}>
                    <TextField
                      className={classes.campo}
                      fullWidth
                      type="number"
                      disabled={!!noAtual.data.voiceOnly}
                      label={i18n.t("voiceIvrFlow.janela", "Janela Goertzel/DTMF (ms)")}
                      helperText={i18n.t("voiceIvrFlow.janelaAjuda", "Usado só quando o DTMF está ativo.")}
                      value={noAtual.data.dtmfWindowMs || 40}
                      onChange={(e) => alterar("dtmfWindowMs", Number(e.target.value))}
                      variant="outlined"
                      margin="dense"
                    />
                    <TextField
                      className={classes.campo}
                      fullWidth
                      type="number"
                      disabled={!!noAtual.data.voiceOnly}
                      label={i18n.t("voiceIvrFlow.confirmacoes", "Confirmações DTMF")}
                      helperText={i18n.t("voiceIvrFlow.confirmacoesAjuda", "Quantas janelas iguais confirmam a tecla.")}
                      value={noAtual.data.dtmfStableWindows || 2}
                      onChange={(e) => alterar("dtmfStableWindows", Number(e.target.value))}
                      variant="outlined"
                      margin="dense"
                    />
                  </div>
                  <TextField
                    className={classes.campo}
                    fullWidth
                    type="number"
                    inputProps={{ min: 2 }}
                    label={i18n.t("voiceIvrFlow.timeoutTotal", "Timeout total (s)")}
                    value={noAtual.data.timeout || 8}
                    onChange={(e) => alterar("timeout", Number(e.target.value))}
                    variant="outlined"
                    margin="dense"
                  />
                  <Typography variant="caption" color="textSecondary">
                    {i18n.t(
                      "voiceIvrFlow.opcoesAjuda",
                      "Cada opção vira uma saída do bloco. O cliente pode falar ou teclar."
                    )}
                  </Typography>
                  {(noAtual.data.options || []).map((o, i) => (
                    <div key={i} className={classes.blocoOpcao}>
                      <div className={classes.opcao}>
                      <TextField
                        style={{ width: 56 }}
                        label={i18n.t("voiceIvrFlow.tecla", "Tecla")}
                        value={o.key || ""}
                        onChange={(e) => {
                          const copia = [...noAtual.data.options];
                          copia[i] = { ...copia[i], key: e.target.value };
                          alterar("options", copia);
                        }}
                        variant="outlined"
                        margin="dense"
                      />
                      <TextField
                        fullWidth
                        label={i18n.t("voiceIvrFlow.oQueE", "O que é")}
                        value={o.label || ""}
                        onChange={(e) => {
                          const copia = [...noAtual.data.options];
                          copia[i] = { ...copia[i], label: e.target.value };
                          alterar("options", copia);
                        }}
                        variant="outlined"
                        margin="dense"
                      />
                      <IconButton
                        size="small"
                        onClick={() =>
                          alterar(
                            "options",
                            noAtual.data.options.filter((_, k) => k !== i)
                          )
                        }
                      >
                        <DeleteIcon fontSize="small" />
                      </IconButton>
                      </div>
                      {/* COMO O CLIENTE FALA ISSO.
                          Ninguem liga e diz "opcao dois": diz "boleto",
                          "fatura", "segunda via". O executor casa a fala
                          contra a tecla, o rotulo E estas frases, inclusive
                          com erro de pronuncia ou de transcricao. Sem elas, o
                          menu so funciona por teclado. */}
                      <TextField
                        fullWidth
                        label={i18n.t("voiceIvrFlow.sinonimos", "Como o cliente pode falar isso")}
                        placeholder={i18n.t("voiceIvrFlow.sinonimosExemplo", "boleto, fatura, segunda via")}
                        helperText={i18n.t("voiceIvrFlow.sinonimosAjuda", "Separe por vírgula. Vale para a fala; a tecla funciona sempre.")}
                        value={o.synonymsText !== undefined ? o.synonymsText : (o.synonyms || []).join(", ")}
                        onChange={(e) => {
                          const copia = [...noAtual.data.options];
                          copia[i] = {
                            ...copia[i],
                            // Texto cru separado do array: sem isso a vírgula
                            // digitada sumia na hora (o filter(Boolean)
                            // apagava o item vazio) e era impossível escrever
                            // mais de um sinônimo.
                            synonymsText: e.target.value,
                            synonyms: e.target.value
                              .split(",")
                              .map((x) => x.trim())
                              .filter(Boolean),
                          };
                          alterar("options", copia);
                        }}
                        variant="outlined"
                        margin="dense"
                      />
                    </div>
                  ))}
                  <Button
                    size="small"
                    onClick={() =>
                      alterar("options", [
                        ...(noAtual.data.options || []),
                        { key: String((noAtual.data.options || []).length + 1), label: "" },
                      ])
                    }
                  >
                    + {i18n.t("voiceIvrFlow.novaOpcao", "opção")}
                  </Button>
                  <Divider style={{ margin: "10px 0" }} />
                </>
              )}

              {noAtual.type === "dtmf_capture" && (
                <>
                  <TextField
                    className={classes.campo}
                    fullWidth
                    type="number"
                    label={i18n.t("voiceIvrFlow.quantosDigitos", "Quantos dígitos")}
                    value={noAtual.data.maxDigits || 1}
                    onChange={(e) => alterar("maxDigits", Number(e.target.value))}
                    variant="outlined"
                    margin="dense"
                  />
                  <TextField
                    className={classes.campo}
                    fullWidth
                    type="number"
                    inputProps={{ min: 3, max: 120 }}
                    label={i18n.t("voiceIvrFlow.tempoParaDigitar", "Tempo para digitar (segundos)")}
                    placeholder={String(Math.max(10, (Number(noAtual.data.maxDigits) || 1) * 2 + 4))}
                    InputLabelProps={{ shrink: true }}
                    value={noAtual.data.timeout || ""}
                    onChange={(e) => alterar("timeout", e.target.value === "" ? "" : Number(e.target.value))}
                    variant="outlined"
                    margin="dense"
                  />
                  <TextField
                    className={classes.campo}
                    fullWidth
                    label={i18n.t("voiceIvrFlow.guardarEm", "Guardar em")}
                    value={noAtual.data.saveAs || ""}
                    onChange={(e) => alterar("saveAs", e.target.value)}
                    variant="outlined"
                    margin="dense"
                    helperText={i18n.t("voiceIvrFlow.guardarEmAjuda", "Use este nome no \"Se...\" ou no texto, assim: {x}. O # encerra a digitação antes do limite.").replace("{x}", `{{${noAtual.data.saveAs || "tecla"}}}`)}
                  />
                </>
              )}

              {noAtual.type === "record_audio" && (
                <>
                  <TextField
                    className={classes.campo}
                    fullWidth
                    type="number"
                    label={i18n.t("voiceIvrFlow.ouvirPorAte", "Ouvir por até (segundos)")}
                    value={noAtual.data.seconds || 10}
                    onChange={(e) => alterar("seconds", Number(e.target.value))}
                    variant="outlined"
                    margin="dense"
                  />
                  <TextField
                    className={classes.campo}
                    fullWidth
                    label={i18n.t("voiceIvrFlow.guardarEm", "Guardar em")}
                    value={noAtual.data.saveAs || ""}
                    onChange={(e) => alterar("saveAs", e.target.value)}
                    variant="outlined"
                    margin="dense"
                  />
                </>
              )}

              {noAtual.type === "transfer" && (
                <>
                  <FormControl variant="outlined" margin="dense" fullWidth className={classes.campo}>
                    <InputLabel>{i18n.t("voiceIvrFlow.fila", "Fila")}</InputLabel>
                    <Select
                      value={noAtual.data.queueId || ""}
                      label={i18n.t("voiceIvrFlow.fila", "Fila")}
                      onChange={(e) => {
                        alterar("queueId", e.target.value);
                        if (e.target.value) alterar("userId", "");
                      }}
                    >
                      <MenuItem value="">
                        {i18n.t("voiceIvrFlow.nenhuma", "Nenhuma")}
                      </MenuItem>
                      {filas.map((f) => (
                        <MenuItem key={f.id} value={f.id}>
                          {f.name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <FormControl variant="outlined" margin="dense" fullWidth className={classes.campo}>
                    <InputLabel>{i18n.t("voiceIvrFlow.operador", "Ou um operador")}</InputLabel>
                    <Select
                      value={noAtual.data.userId || ""}
                      label={i18n.t("voiceIvrFlow.operador", "Ou um operador")}
                      onChange={(e) => {
                        alterar("userId", e.target.value);
                        if (e.target.value) alterar("queueId", "");
                      }}
                    >
                      <MenuItem value="">
                        {i18n.t("voiceIvrFlow.nenhum", "Nenhum")}
                      </MenuItem>
                      {usuarios.map((u) => (
                        <MenuItem key={u.id} value={u.id}>
                          {u.name}
                        </MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <Typography variant="caption" color="textSecondary">
                    {i18n.t(
                      "voiceIvrFlow.transferenciaAjuda",
                      "A URA fala a mensagem acima (se houver), encerra a ligação e abre o atendimento no chat, na fila ou com o operador escolhido."
                    )}
                  </Typography>
                </>
              )}

              {noAtual.type === "condition" && (
                <>
                  <TextField
                    className={classes.campo}
                    fullWidth
                    label={i18n.t("voiceIvrFlow.variavel", "Variável")}
                    value={noAtual.data.variable || ""}
                    onChange={(e) => alterar("variable", e.target.value)}
                    variant="outlined"
                    margin="dense"
                  />
                  <FormControl variant="outlined" margin="dense" fullWidth className={classes.campo}>
                    <InputLabel>{i18n.t("voiceIvrFlow.comparacao", "Comparação")}</InputLabel>
                    <Select
                      value={noAtual.data.operator || "eq"}
                      label={i18n.t("voiceIvrFlow.comparacao", "Comparação")}
                      onChange={(e) => alterar("operator", e.target.value)}
                    >
                      <MenuItem value="eq">{i18n.t("voiceIvrFlow.igual", "é igual a")}</MenuItem>
                      <MenuItem value="neq">{i18n.t("voiceIvrFlow.diferente", "é diferente de")}</MenuItem>
                      <MenuItem value="contains">{i18n.t("voiceIvrFlow.contem", "contém")}</MenuItem>
                      <MenuItem value="empty">{i18n.t("voiceIvrFlow.vazia", "está vazia")}</MenuItem>
                      <MenuItem value="not_empty">{i18n.t("voiceIvrFlow.naoVazia", "não está vazia")}</MenuItem>
                    </Select>
                  </FormControl>
                  <TextField
                    className={classes.campo}
                    fullWidth
                    label={i18n.t("voiceIvrFlow.valor", "Valor")}
                    value={noAtual.data.value || ""}
                    onChange={(e) => alterar("value", e.target.value)}
                    variant="outlined"
                    margin="dense"
                  />
                </>
              )}


              {noAtual.type === "webhook" && (
                <>
                  <FormControl variant="outlined" margin="dense" fullWidth className={classes.campo}>
                    <InputLabel>{i18n.t("voiceIvrFlow.metodo", "Método")}</InputLabel>
                    <Select
                      value={noAtual.data.method || "POST"}
                      label={i18n.t("voiceIvrFlow.metodo", "Método")}
                      onChange={(e) => alterar("method", e.target.value)}
                    >
                      {["POST", "GET", "PUT", "PATCH", "DELETE"].map((m) => (
                        <MenuItem key={m} value={m}>{m}</MenuItem>
                      ))}
                    </Select>
                  </FormControl>
                  <TextField
                    className={classes.campo}
                    fullWidth
                    label={i18n.t("voiceIvrFlow.urlWebhook", "Endereço (URL)")}
                    value={noAtual.data.url || ""}
                    onChange={(e) => alterar("url", e.target.value)}
                    variant="outlined"
                    margin="dense"
                  />
                  <TextField
                    className={classes.campo}
                    fullWidth
                    multiline
                    minRows={3}
                    label={i18n.t("voiceIvrFlow.corpoJson", "Conteúdo enviado (JSON)")}
                    value={noAtual.data.body || ""}
                    onChange={(e) => alterar("body", e.target.value)}
                    variant="outlined"
                    margin="dense"
                    inputProps={{ style: { fontFamily: "monospace", fontSize: 12 } }}
                  />
                  <TextField
                    className={classes.campo}
                    fullWidth
                    label={i18n.t("voiceIvrFlow.guardarRespostaEm", "Guardar a resposta em")}
                    value={noAtual.data.saveAs || ""}
                    onChange={(e) => alterar("saveAs", e.target.value)}
                    variant="outlined"
                    margin="dense"
                  />
                  <Typography variant="caption" color="textSecondary">
                    {i18n
                      .t(
                        "voiceIvrFlow.ajudaWebhook",
                        "Dispara quando a ligação chega aqui. Variáveis: {tel} (telefone de quem ligou) e qualquer campo guardado antes, como {campo}. Endereços internos do servidor são bloqueados."
                      )
                      .replace("{tel}", "{{.call.from}}")
                      .replace("{campo}", "{{.vars.cpf}}")}
                  </Typography>
                </>
              )}

              {noAtual.type === "whatsapp_send" && (
                <>
                  <TextField
                    className={classes.campo}
                    fullWidth
                    label={i18n.t("voiceIvrFlow.destinatario", "Destinatário")}
                    placeholder={i18n.t("voiceIvrFlow.destinoVazio", "Vazio = o número de quem ligou")}
                    value={noAtual.data.to || ""}
                    onChange={(e) => alterar("to", e.target.value)}
                    variant="outlined"
                    margin="dense"
                  />
                  <TextField
                    className={classes.campo}
                    fullWidth
                    multiline
                    minRows={3}
                    label={i18n.t("voiceIvrFlow.mensagem", "Mensagem")}
                    value={noAtual.data.template || ""}
                    onChange={(e) => alterar("template", e.target.value)}
                    variant="outlined"
                    margin="dense"
                  />
                  <Typography variant="caption" color="textSecondary">
                    {i18n.t(
                      "voiceIvrFlow.ajudaWhatsapp",
                      "Deixe o destinatário vazio para responder ao número de quem ligou."
                    )}
                  </Typography>
                </>
              )}

              {noAtual.type === "whatsapp_media" && (
                <>
                  <FormControl variant="outlined" margin="dense" fullWidth className={classes.campo}>
                    <InputLabel>{i18n.t("voiceIvrFlow.tipoArquivo", "Tipo")}</InputLabel>
                    <Select
                      value={noAtual.data.mediaKind || "image"}
                      label={i18n.t("voiceIvrFlow.tipoArquivo", "Tipo")}
                      onChange={(e) => alterar("mediaKind", e.target.value)}
                    >
                      <MenuItem value="image">{i18n.t("voiceIvrFlow.tipoImagem", "Imagem")}</MenuItem>
                      <MenuItem value="document">{i18n.t("voiceIvrFlow.tipoDocumento", "Documento")}</MenuItem>
                      <MenuItem value="audio">{i18n.t("voiceIvrFlow.tipoAudio", "Áudio")}</MenuItem>
                      <MenuItem value="video">{i18n.t("voiceIvrFlow.tipoVideo", "Vídeo")}</MenuItem>
                    </Select>
                  </FormControl>
                  <input
                    id="ura-upload-arquivo"
                    type="file"
                    style={{ display: "none" }}
                    onChange={(e) => {
                      enviarArquivo(e.target.files && e.target.files[0]);
                      e.target.value = "";
                    }}
                  />
                  <label htmlFor="ura-upload-arquivo">
                    <Button
                      component="span"
                      variant="outlined"
                      size="small"
                      disabled={enviandoArquivo}
                      startIcon={enviandoArquivo ? <CircularProgress size={13} /> : <CloudUploadIcon />}
                      style={{ textTransform: "none", marginBottom: 6 }}
                    >
                      {enviandoArquivo
                        ? i18n.t("voiceIvrFlow.enviando", "Enviando…")
                        : noAtual.data.mediaUrl && String(noAtual.data.mediaUrl).startsWith("/api/media/")
                        ? i18n.t("voiceIvrFlow.trocarArquivo", "Trocar arquivo")
                        : i18n.t("voiceIvrFlow.enviarArquivo", "Enviar arquivo do computador")}
                    </Button>
                  </label>
                  {noAtual.data.mediaUrl && String(noAtual.data.mediaUrl).startsWith("/api/media/") && (
                    <Typography variant="caption" color="textSecondary" display="block" style={{ marginBottom: 6 }}>
                      {i18n
                        .t("voiceIvrFlow.arquivoOk", "Arquivo anexado: {nome}")
                        .replace("{nome}", noAtual.data.filename || noAtual.data.mediaUrl)}
                    </Typography>
                  )}
                  <TextField
                    className={classes.campo}
                    fullWidth
                    label={i18n.t("voiceIvrFlow.urlArquivo", "Endereço do arquivo (URL)")}
                    helperText={i18n.t("voiceIvrFlow.ouUrl", "ou informe o endereço (URL)")}
                    value={noAtual.data.mediaUrl || ""}
                    onChange={(e) => alterar("mediaUrl", e.target.value)}
                    variant="outlined"
                    margin="dense"
                  />
                  <TextField
                    className={classes.campo}
                    fullWidth
                    label={i18n.t("voiceIvrFlow.legenda", "Legenda (opcional)")}
                    value={noAtual.data.caption || ""}
                    onChange={(e) => alterar("caption", e.target.value)}
                    variant="outlined"
                    margin="dense"
                  />
                  <TextField
                    className={classes.campo}
                    fullWidth
                    label={i18n.t("voiceIvrFlow.destinatario", "Destinatário")}
                    placeholder={i18n.t("voiceIvrFlow.destinoVazio", "Vazio = o número de quem ligou")}
                    value={noAtual.data.to || ""}
                    onChange={(e) => alterar("to", e.target.value)}
                    variant="outlined"
                    margin="dense"
                  />
                </>
              )}

              {noAtual.type === "set_variable" && (
                <>
                  <TextField
                    className={classes.campo}
                    fullWidth
                    label={i18n.t("voiceIvrFlow.nomeVariavel", "Nome da variável")}
                    value={noAtual.data.variable || ""}
                    onChange={(e) => alterar("variable", e.target.value)}
                    variant="outlined"
                    margin="dense"
                  />
                  <TextField
                    className={classes.campo}
                    fullWidth
                    label={i18n.t("voiceIvrFlow.valor", "Valor")}
                    value={noAtual.data.value || ""}
                    onChange={(e) => alterar("value", e.target.value)}
                    variant="outlined"
                    margin="dense"
                  />
                </>
              )}

              {noAtual.type === "delay" && (
                <TextField
                  className={classes.campo}
                  fullWidth
                  type="number"
                  label={i18n.t("voiceIvrFlow.segundos", "Segundos")}
                  value={noAtual.data.seconds || 1}
                  onChange={(e) => alterar("seconds", Number(e.target.value))}
                  variant="outlined"
                  margin="dense"
                />
              )}

              {noAtual.type === "end" && (
                <>
                  <TextField
                    className={classes.campo}
                    fullWidth
                    multiline
                    minRows={2}
                    label={i18n.t("voiceIvrFlow.despedida", "Despedida (opcional)")}
                    value={noAtual.data.finalText || ""}
                    onChange={(e) => alterar("finalText", e.target.value)}
                    variant="outlined"
                    margin="dense"
                  />
                  <Button
                    size="small"
                    startIcon={ouvindo ? <CircularProgress size={13} /> : <VolumeUpIcon />}
                    disabled={ouvindo}
                    onClick={() => ouvirTrecho(noAtual.data.finalText)}
                    style={{ textTransform: "none" }}
                  >
                    {i18n.t("voiceIvrFlow.ouvirEste", "Ouvir este trecho")}
                  </Button>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* MODELOS PRONTOS.
          Tela em branco e onde se erra: menu sem saida, transferencia sem
          fila. Cada modelo sai pronto e sem pendencia — e so trocar os textos
          e escolher a fila. */}
      <Dialog open={escolhendoModelo} onClose={() => setEscolhendoModelo(false)} maxWidth="sm" fullWidth>
        <DialogTitle>{i18n.t("voiceIvrFlow.modelos.titulo", "Começar com uma URA pronta")}</DialogTitle>
        <DialogContent dividers>
          <Typography variant="body2" color="textSecondary" style={{ marginBottom: 10 }}>
            {i18n.t(
              "voiceIvrFlow.modelos.ajuda",
              "Escolha um ponto de partida. Depois é só trocar os textos e escolher a fila de cada transferência."
            )}
          </Typography>
          {modelos().map((m) => (
            <div key={m.id} className={classes.cartaoModelo} onClick={() => aplicarModelo(m)}>
              <div style={{ fontWeight: 700, marginBottom: 2 }}>{m.nome}</div>
              <div style={{ fontSize: 12, opacity: 0.75 }}>{m.resumo}</div>
            </div>
          ))}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setEscolhendoModelo(false)}>
            {i18n.t("voiceIvrFlow.modelos.doZero", "Começar do zero")}
          </Button>
        </DialogActions>
      </Dialog>
    </div>
  );
};

export default VoiceIvrFlow;
