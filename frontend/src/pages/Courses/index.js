import React, { useEffect, useState, useContext, useCallback } from "react";
import { makeStyles } from "@material-ui/core/styles";
import {
  Paper, Button, IconButton, TextField, MenuItem, Typography, CircularProgress,
  Dialog, DialogTitle, DialogContent, DialogActions, Chip, Tooltip, Divider,
  FormControl, InputLabel, Select, Checkbox, ListItemText, Avatar, Badge
} from "@material-ui/core";
import {
  Plus, Trash2, Pencil, Play, FileText, MessageSquare, CornerDownRight, Save, X, Upload, BookOpen, Bell
} from "lucide-react";
import { toast } from "react-toastify";

import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import Title from "../../components/Title";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import { i18n } from "../../translate/i18n";
import { AuthContext } from "../../context/Auth/AuthContext";

const useStyles = makeStyles(theme => ({
  paper: { padding: theme.spacing(2), width: "100%" },
  descBox: {
    padding: theme.spacing(2),
    borderRadius: 12,
    background: theme.palette.type === "dark" ? "#1e293b" : "#f8fafc",
    border: `1px solid ${theme.palette.divider}`,
    marginBottom: theme.spacing(2)
  },
  grid: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fill, minmax(230px, 1fr))",
    gap: theme.spacing(2)
  },
  card: {
    border: `1px solid ${theme.palette.divider}`,
    borderRadius: 12,
    overflow: "hidden",
    cursor: "pointer",
    transition: "box-shadow .15s",
    "&:hover": { boxShadow: "0 4px 14px rgba(0,0,0,.1)" }
  },
  cover: { width: "100%", height: 130, objectFit: "cover", background: "#e2e8f0", display: "block" },
  coverPlaceholder: {
    width: "100%", height: 130, background: "linear-gradient(135deg,#1e3a8a,#2563eb)",
    display: "flex", alignItems: "center", justifyContent: "center", color: "#fff"
  },
  cardBody: { padding: theme.spacing(1.5) },
  cardTitle: { fontWeight: 600, fontSize: 14 },
  cardDesc: { fontSize: 12, color: theme.palette.text.secondary, marginTop: 4 },
  adminBar: { display: "flex", gap: 8, marginBottom: theme.spacing(2), flexWrap: "wrap" },
  lessonItem: {
    display: "flex", alignItems: "center", justifyContent: "space-between",
    padding: theme.spacing(1.25, 1.5), borderRadius: 8,
    border: `1px solid ${theme.palette.divider}`, marginBottom: theme.spacing(1),
    cursor: "pointer", gap: 8
  },
  lessonAtivo: { borderColor: "#2563eb", borderWidth: 2 },
  // Layout da tela do curso: vídeo à esquerda, lista de aulas à direita.
  // Em telas pequenas vira uma coluna só.
  layoutCurso: {
    display: "grid",
    gridTemplateColumns: "1fr 300px",
    gap: theme.spacing(2.5),
    alignItems: "start",
    [theme.breakpoints.down("sm")]: {
      gridTemplateColumns: "1fr"
    }
  },
  // Limita a LARGURA do player em função da altura disponível da janela, para
  // que o vídeo e os comentários caibam na mesma tela sem rolagem enorme.
  // Como o wrapper mantém 16:9, limitar a largura limita a altura junto.
  videoOuter: {
    width: "100%",
    maxWidth: "calc((100vh - 330px) * 1.7778)",
    margin: "0 auto",
    [theme.breakpoints.down("sm")]: { maxWidth: "100%" }
  },
  // Lista de aulas com rolagem própria: um curso com muitas aulas não estica
  // a página nem empurra os comentários para fora da tela.
  painelAulas: {
    maxHeight: "calc(100vh - 300px)",
    overflowY: "auto",
    paddingRight: 4,
    [theme.breakpoints.down("sm")]: { maxHeight: "none", overflowY: "visible" }
  },
  feedItem: {
    display: "flex",
    gap: 10,
    padding: theme.spacing(1.25, 1),
    borderRadius: 8,
    cursor: "pointer",
    borderBottom: `1px solid ${theme.palette.divider}`,
    "&:hover": { background: theme.palette.action.hover }
  },
  feedHora: { fontSize: 11, color: theme.palette.text.secondary, marginLeft: "auto" },
  feedOrigem: { fontSize: 11.5, color: "#2563eb", margin: "2px 0 3px" },
  videoWrap: { position: "relative", paddingTop: "56.25%", borderRadius: 12, overflow: "hidden", background: "#000" },
  videoFrame: { position: "absolute", top: 0, left: 0, width: "100%", height: "100%", border: 0 },
  voltar: { marginBottom: theme.spacing(2) },
  comment: {
    display: "flex", gap: 10, padding: theme.spacing(1.25, 0),
    borderBottom: `1px solid ${theme.palette.divider}`
  },
  commentReply: { marginLeft: theme.spacing(5) },
  avatar: { width: 34, height: 34, fontSize: 14 },
  commentAutor: { fontWeight: 600, fontSize: 13 },
  commentEmpresa: { fontSize: 11, color: theme.palette.text.secondary, marginLeft: 6 },
  commentTexto: { fontSize: 13.5, marginTop: 2, whiteSpace: "pre-wrap" },
  commentAcoes: { display: "flex", gap: 10, marginTop: 4 },
  linkAcao: { fontSize: 12, color: "#2563eb", cursor: "pointer" }
}));

/** Extrai o ID do vídeo de várias formas de URL do YouTube. */
const youtubeId = url => {
  if (!url) return null;
  const m = String(url).match(
    /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([A-Za-z0-9_-]{11})/
  );
  if (m) return m[1];
  if (/^[A-Za-z0-9_-]{11}$/.test(url.trim())) return url.trim();
  return null;
};

/**
 * Capa do curso: a imagem enviada pelo admin; se não houver, cai na miniatura
 * do primeiro vídeo do YouTube do curso. Só mostra o degradê quando não existe
 * nem imagem nem vídeo.
 */
const capaDoCurso = curso => {
  if (curso?.coverUrl) return curso.coverUrl;
  const aulaVideo = (curso?.lessons || []).find(
    l => l.kind === "video" && l.contentUrl && youtubeId(l.contentUrl)
  );
  if (aulaVideo) return `https://img.youtube.com/vi/${youtubeId(aulaVideo.contentUrl)}/hqdefault.jpg`;
  return null;
};

/** Hora amigável: "há 5 min", "há 2 h", ou a data completa se for antigo. */
const fmtQuando = iso => {
  if (!iso) return "";
  try {
    const d = new Date(iso);
    const diffMin = Math.floor((Date.now() - d.getTime()) / 60000);
    if (diffMin < 1) return "agora";
    if (diffMin < 60) return `há ${diffMin} min`;
    const h = Math.floor(diffMin / 60);
    if (h < 24) return `há ${h} h`;
    const dias = Math.floor(h / 24);
    if (dias < 7) return `há ${dias} d`;
    return d.toLocaleString();
  } catch {
    return "";
  }
};

/**
 * Textos da página (nome, rótulo do item, descrição) são escritos pelo admin e
 * guardados por idioma: { pt, es, en }. Aqui escolhemos o do idioma do usuário;
 * se estiver em branco, cai no português, que é o idioma nativo do sistema.
 * Também aceita o formato antigo (texto único) sem quebrar.
 */
const IDIOMAS_PAGINA = ["pt", "es", "en"];

const idiomaAtual = () => {
  const bruto = (i18n.language || "pt").toLowerCase();
  const base = bruto.split("-")[0];
  return IDIOMAS_PAGINA.includes(base) ? base : "pt";
};

const textoNoIdioma = (valor, padrao = "") => {
  if (!valor) return padrao;
  if (typeof valor === "string") return valor || padrao;
  const idioma = idiomaAtual();
  return valor[idioma] || valor.pt || valor.es || valor.en || padrao;
};

const VAZIO_CURSO = { title: "", description: "", coverUrl: "", active: true, companyIds: [], videoUrl: "" };
const VAZIO_AULA = { title: "", kind: "video", contentUrl: "", body: "", active: true };

const Courses = () => {
  const classes = useStyles();
  const { user } = useContext(AuthContext);
  const isAdmin = !!user?.super;

  const [loading, setLoading] = useState(true);
  const [courses, setCourses] = useState([]);
  // Mapas por idioma vindos do servidor; os textos exibidos derivam deles.
  const [pageDescMap, setPageDescMap] = useState({});
  const [pageTitleMap, setPageTitleMap] = useState({});
  const [itemLabelMap, setItemLabelMap] = useState({});

  const pageDesc = textoNoIdioma(pageDescMap);
  const pageTitle = textoNoIdioma(pageTitleMap, i18n.t("courses.title", "Cursos"));
  const itemLabel = textoNoIdioma(itemLabelMap, i18n.t("courses.itemDefault", "curso"));

  const [editandoDesc, setEditandoDesc] = useState(false);
  // Na edição, o admin escolhe qual idioma está preenchendo.
  const [idiomaEdicao, setIdiomaEdicao] = useState(idiomaAtual());
  const [descTemp, setDescTemp] = useState({});
  const [tituloTemp, setTituloTemp] = useState({});
  const [itemLabelTemp, setItemLabelTemp] = useState({});
  const [enviandoCapa, setEnviandoCapa] = useState(false);

  const [cursoAberto, setCursoAberto] = useState(null); // objeto do curso
  const [aulaAtiva, setAulaAtiva] = useState(null);

  // comentários
  const [comentarios, setComentarios] = useState([]);
  const [novoComentario, setNovoComentario] = useState("");
  const [respondendo, setRespondendo] = useState(null); // id do comentário pai

  // admin: empresas
  const [companies, setCompanies] = useState([]);

  // admin: feed de comentários (notificações)
  const [feedOpen, setFeedOpen] = useState(false);
  const [feedComments, setFeedComments] = useState([]);
  const [feedUnseen, setFeedUnseen] = useState(0);

  const carregarFeed = useCallback(async () => {
    if (!isAdmin) return;
    try {
      const { data } = await api.get("/courses/comments/feed");
      setFeedComments(Array.isArray(data?.comments) ? data.comments : []);
      setFeedUnseen(data?.unseen || 0);
    } catch (err) {
      // silencioso: o feed é acessório
    }
  }, [isAdmin]);

  useEffect(() => { carregarFeed(); }, [carregarFeed]);

  // Abre o painel e zera a bolinha de novidades.
  const abrirFeed = async () => {
    setFeedOpen(true);
    await carregarFeed();
    try {
      await api.put("/courses/comments/feed/seen");
      setFeedUnseen(0);
    } catch (err) { /* silencioso */ }
  };

  // Vai direto para a aula de onde veio o comentário, para o admin responder.
  const irParaComentario = async c => {
    const courseId = c?.lesson?.courseId || c?.lesson?.course?.id;
    if (!courseId) return;
    try {
      const { data } = await api.get(`/courses/${courseId}`);
      setCursoAberto(data);
      const aula = (data.lessons || []).find(l => String(l.id) === String(c.lessonId))
        || (data.lessons || [])[0] || null;
      setAulaAtiva(aula);
      if (aula) carregarComentarios(aula.id);
      setFeedOpen(false);
    } catch (err) { toastError(err); }
  };

  // modais admin
  const [cursoModal, setCursoModal] = useState(null); // "novo" | objeto | null
  const [cursoForm, setCursoForm] = useState(VAZIO_CURSO);
  const [aulaModal, setAulaModal] = useState(null); // "novo" | objeto | null
  const [aulaForm, setAulaForm] = useState(VAZIO_AULA);

  const carregar = useCallback(async () => {
    try {
      const [{ data: cs }, { data: pd }] = await Promise.all([
        api.get("/courses"),
        api.get("/courses/page-config")
      ]);
      setCourses(Array.isArray(cs) ? cs : []);
      const paraMapa = v => (typeof v === "string" ? { pt: v, es: v, en: v } : v || {});
      setPageDescMap(paraMapa(pd?.description));
      setPageTitleMap(paraMapa(pd?.title));
      setItemLabelMap(paraMapa(pd?.itemLabel));
    } catch (err) {
      toastError(err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  useEffect(() => {
    if (isAdmin) {
      api.get("/companies/list").then(({ data }) => {
        setCompanies(Array.isArray(data) ? data : (data?.companies || []));
      }).catch(() => {});
    }
  }, [isAdmin]);

  // ---------- descrição da página ----------
  const salvarDesc = async () => {
    try {
      const { data } = await api.put("/courses/page-config", {
        description: descTemp,
        title: tituloTemp,
        itemLabel: itemLabelTemp
      });
      const paraMapa = v => (typeof v === "string" ? { pt: v, es: v, en: v } : v || {});
      setPageDescMap(paraMapa(data?.description));
      setPageTitleMap(paraMapa(data?.title));
      setItemLabelMap(paraMapa(data?.itemLabel));
      setEditandoDesc(false);
      toast.success(i18n.t("courses.descSaved", "Descrição salva."));
    } catch (err) { toastError(err); }
  };

  const abrirEdicaoDesc = () => {
    setDescTemp({ ...pageDescMap });
    setTituloTemp({ ...pageTitleMap });
    setItemLabelTemp({ ...itemLabelMap });
    setIdiomaEdicao(idiomaAtual());
    setEditandoDesc(true);
  };

  // Upload da imagem de capa do curso.
  const enviarCapa = async e => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setEnviandoCapa(true);
    try {
      const fd = new FormData();
      // typeArch PRECISA vir antes do arquivo: o multer lê esse campo enquanto
      // processa o form para decidir a pasta de destino. Se o arquivo vier
      // primeiro, o destino é resolvido sem typeArch e a capa cai na pasta
      // errada. Mandamos também na query, que o upload.ts aceita como fallback.
      fd.append("typeArch", "courses");
      fd.append("file", file);
      const { data } = await api.post("/courses/cover-upload?typeArch=courses", fd, {
        headers: { "Content-Type": "multipart/form-data" }
      });
      setCursoForm(f => ({ ...f, coverUrl: data?.url || "" }));
      toast.success(i18n.t("courses.coverUploaded", "Imagem enviada."));
    } catch (err) {
      toastError(err);
    } finally {
      setEnviandoCapa(false);
    }
  };

  // ---------- abrir curso / aula ----------
  const abrirCurso = async curso => {
    try {
      const { data } = await api.get(`/courses/${curso.id}`);
      setCursoAberto(data);
      const primeira = (data.lessons || [])[0] || null;
      setAulaAtiva(primeira);
      if (primeira) carregarComentarios(primeira.id);
    } catch (err) { toastError(err); }
  };

  const selecionarAula = aula => {
    setAulaAtiva(aula);
    carregarComentarios(aula.id);
    setRespondendo(null);
    setNovoComentario("");
  };

  // ---------- comentários ----------
  const carregarComentarios = async lessonId => {
    try {
      const { data } = await api.get(`/courses/lessons/${lessonId}/comments`);
      setComentarios(Array.isArray(data) ? data : []);
    } catch (err) { setComentarios([]); }
  };

  const enviarComentario = async () => {
    if (!novoComentario.trim() || !aulaAtiva) return;
    try {
      await api.post(`/courses/lessons/${aulaAtiva.id}/comments`, {
        body: novoComentario,
        parentId: respondendo || null
      });
      setNovoComentario("");
      setRespondendo(null);
      carregarComentarios(aulaAtiva.id);
    } catch (err) { toastError(err); }
  };

  const removerComentario = async id => {
    if (!window.confirm(i18n.t("courses.removeCommentConfirm", "Remover este comentário?"))) return;
    try {
      await api.delete(`/courses/comments/${id}`);
      carregarComentarios(aulaAtiva.id);
    } catch (err) { toastError(err); }
  };

  // ---------- admin: curso ----------
  const abrirCursoModal = (curso) => {
    if (curso) {
      setCursoModal(curso);
      setCursoForm({
        title: curso.title, description: curso.description || "", coverUrl: curso.coverUrl || "",
        active: curso.active, companyIds: (curso.companies || []).map(c => c.id),
        // Só usado na criação; ao editar, as aulas são gerenciadas dentro do curso.
        videoUrl: ""
      });
    } else {
      setCursoModal("novo");
      setCursoForm(VAZIO_CURSO);
    }
  };

  const salvarCurso = async () => {
    if (!cursoForm.title.trim()) { toast.warning(i18n.t("courses.titleRequired", "Informe o título.")); return; }
    try {
      if (cursoModal === "novo") await api.post("/courses", cursoForm);
      else await api.put(`/courses/${cursoModal.id}`, cursoForm);
      toast.success(i18n.t("courses.saved", "Curso salvo."));
      setCursoModal(null);
      carregar();
    } catch (err) { toastError(err); }
  };

  const removerCurso = async (curso, e) => {
    if (e) e.stopPropagation();
    if (!window.confirm(i18n.t("courses.removeConfirm", "Remover este curso e suas aulas?"))) return;
    try {
      await api.delete(`/courses/${curso.id}`);
      toast.success(i18n.t("courses.removed", "Curso removido."));
      if (cursoAberto?.id === curso.id) setCursoAberto(null);
      carregar();
    } catch (err) { toastError(err); }
  };

  // ---------- admin: aula ----------
  const abrirAulaModal = (aula) => {
    if (aula) {
      setAulaModal(aula);
      setAulaForm({
        title: aula.title, kind: aula.kind, contentUrl: aula.contentUrl || "",
        body: aula.body || "", active: aula.active
      });
    } else {
      setAulaModal("novo");
      setAulaForm(VAZIO_AULA);
    }
  };

  const salvarAula = async () => {
    if (!aulaForm.title.trim()) { toast.warning(i18n.t("courses.lessonTitleRequired", "Informe o título da aula.")); return; }
    try {
      if (aulaModal === "novo") await api.post(`/courses/${cursoAberto.id}/lessons`, aulaForm);
      else await api.put(`/courses/lessons/${aulaModal.id}`, aulaForm);
      toast.success(i18n.t("courses.lessonSaved", "Aula salva."));
      setAulaModal(null);
      abrirCurso(cursoAberto); // recarrega as aulas
    } catch (err) { toastError(err); }
  };

  const removerAula = async (aula, e) => {
    if (e) e.stopPropagation();
    if (!window.confirm(i18n.t("courses.removeLessonConfirm", "Remover esta aula?"))) return;
    try {
      await api.delete(`/courses/lessons/${aula.id}`);
      toast.success(i18n.t("courses.lessonRemoved", "Aula removida."));
      abrirCurso(cursoAberto);
    } catch (err) { toastError(err); }
  };

  // ---------- render helpers ----------
  const iconeAula = kind =>
    kind === "pdf" ? <FileText size={16} /> : kind === "text" ? <FileText size={16} /> : <Play size={16} />;

  const renderPlayer = () => {
    if (!aulaAtiva) return null;
    if (aulaAtiva.kind === "video") {
      const id = youtubeId(aulaAtiva.contentUrl);
      if (!id) return <Typography color="textSecondary">{i18n.t("courses.badVideo", "Link de vídeo inválido.")}</Typography>;
      return (
        <div className={classes.videoOuter}>
          <div className={classes.videoWrap}>
            <iframe
              className={classes.videoFrame}
              src={`https://www.youtube.com/embed/${id}`}
              title={aulaAtiva.title}
              allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
              allowFullScreen
            />
          </div>
        </div>
      );
    }
    if (aulaAtiva.kind === "pdf") {
      return (
        <Button variant="contained" color="primary" startIcon={<FileText size={16} />}
          href={aulaAtiva.contentUrl} target="_blank" rel="noopener noreferrer">
          {i18n.t("courses.openPdf", "Abrir PDF")}
        </Button>
      );
    }
    return null;
  };

  // comentários em árvore (raiz + respostas)
  const raizes = comentarios.filter(c => !c.parentId);
  const respostasDe = pid => comentarios.filter(c => c.parentId === pid);

  const renderComentario = (c, isReply = false) => (
    <div key={c.id} className={`${classes.comment} ${isReply ? classes.commentReply : ""}`}>
      <Avatar className={classes.avatar}>{(c.user?.name || "?").charAt(0).toUpperCase()}</Avatar>
      <div style={{ flex: 1 }}>
        <div>
          <span className={classes.commentAutor}>{c.user?.name || "Usuário"}</span>
          {isAdmin && c.company?.name && <span className={classes.commentEmpresa}>· {c.company.name}</span>}
        </div>
        <div className={classes.commentTexto}>{c.body}</div>
        <div className={classes.commentAcoes}>
          {!isReply && (
            <span className={classes.linkAcao} onClick={() => { setRespondendo(c.id); setNovoComentario(""); }}>
              {i18n.t("courses.reply", "Responder")}
            </span>
          )}
          {(isAdmin || String(c.user?.id) === String(user?.id)) && (
            <span className={classes.linkAcao} style={{ color: "#ef4444" }} onClick={() => removerComentario(c.id)}>
              {i18n.t("courses.remove", "Remover")}
            </span>
          )}
        </div>

        {respondendo === c.id && (
          <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
            <TextField
              size="small" variant="outlined" fullWidth multiline
              placeholder={i18n.t("courses.writeReply", "Escreva uma resposta...")}
              value={novoComentario}
              onChange={e => setNovoComentario(e.target.value)}
            />
            <Button size="small" variant="contained" color="primary" onClick={enviarComentario}>
              {i18n.t("courses.send", "Enviar")}
            </Button>
            <IconButton size="small" onClick={() => { setRespondendo(null); setNovoComentario(""); }}>
              <X size={16} />
            </IconButton>
          </div>
        )}

        {respostasDe(c.id).map(r => renderComentario(r, true))}
      </div>
    </div>
  );

  // ===== MODAIS (JSX estável, definido antes dos returns para não recriar o
  // Select/Dialog a cada tecla — recriar quebrava o MUI v4 com "reading value") =====
  const cursoModalEl = (
    <Dialog open={cursoModal !== null} onClose={() => setCursoModal(null)} maxWidth="sm" fullWidth>
      <DialogTitle>{cursoModal === "novo"
        ? `${i18n.t("courses.newPrefix", "Novo")} ${itemLabel}`
        : `${i18n.t("courses.editPrefix", "Editar")} ${itemLabel}`}</DialogTitle>
      <DialogContent dividers>
        <TextField fullWidth size="small" variant="outlined" label={i18n.t("courses.courseTitle", "Título")}
          value={cursoForm.title} onChange={e => { const v = e.target.value; setCursoForm(f => ({ ...f, title: v })); }}
          style={{ marginBottom: 12 }} />
        <TextField fullWidth size="small" variant="outlined" multiline minRows={2} label={i18n.t("courses.description", "Descrição")}
          value={cursoForm.description} onChange={e => { const v = e.target.value; setCursoForm(f => ({ ...f, description: v })); }}
          style={{ marginBottom: 12 }} />
        <div style={{ marginBottom: 12 }}>
          <Typography variant="caption" color="textSecondary" style={{ display: "block", marginBottom: 6 }}>
            {i18n.t("courses.coverLabel", "Imagem de capa (opcional — sem ela, usamos a miniatura do vídeo)")}
          </Typography>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <input id="courseCoverUpload" type="file" accept="image/*" style={{ display: "none" }} onChange={enviarCapa} />
            <label htmlFor="courseCoverUpload">
              <Button component="span" size="small" variant="outlined" disabled={enviandoCapa}
                startIcon={enviandoCapa ? <CircularProgress size={14} /> : <Upload size={15} />}>
                {i18n.t("courses.uploadCover", "Enviar imagem")}
              </Button>
            </label>
            {cursoForm.coverUrl && (
              <>
                <img src={cursoForm.coverUrl} alt="capa"
                  style={{ height: 40, borderRadius: 6, objectFit: "cover" }} />
                <IconButton size="small" onClick={() => setCursoForm(f => ({ ...f, coverUrl: "" }))}>
                  <X size={14} />
                </IconButton>
              </>
            )}
          </div>
        </div>

        {cursoModal === "novo" && (
          <TextField fullWidth size="small" variant="outlined"
            label={i18n.t("courses.firstVideo", "Link do vídeo do YouTube (opcional)")}
            value={cursoForm.videoUrl}
            onChange={e => { const v = e.target.value; setCursoForm(f => ({ ...f, videoUrl: v })); }}
            helperText={i18n.t("courses.firstVideoHelp", "Cria a primeira aula já com este vídeo. Você adiciona mais aulas depois.")}
            style={{ marginBottom: 12 }} />
        )}
        <FormControl fullWidth size="small" variant="outlined" style={{ marginBottom: 12 }}>
          <InputLabel>{i18n.t("courses.companies", "Empresas que veem")}</InputLabel>
          <Select
            multiple
            value={cursoForm.companyIds}
            onChange={e => { const v = e.target.value; setCursoForm(f => ({ ...f, companyIds: v })); }}
            renderValue={sel => `${(sel || []).length} ${i18n.t("courses.companiesSelected", "empresa(s)")}`}
            label={i18n.t("courses.companies", "Empresas que veem")}
          >
            {companies.map(co => (
              <MenuItem key={co.id} value={co.id}>
                <Checkbox checked={cursoForm.companyIds.indexOf(co.id) > -1} />
                <ListItemText primary={co.name} />
              </MenuItem>
            ))}
          </Select>
        </FormControl>
        <FormControl fullWidth size="small" variant="outlined">
          <InputLabel>{i18n.t("courses.status", "Status")}</InputLabel>
          <Select value={cursoForm.active ? 1 : 0} onChange={e => { const v = e.target.value; setCursoForm(f => ({ ...f, active: !!v })); }} label={i18n.t("courses.status", "Status")}>
            <MenuItem value={1}>{i18n.t("courses.active", "Ativo")}</MenuItem>
            <MenuItem value={0}>{i18n.t("courses.inactive", "Inativo")}</MenuItem>
          </Select>
        </FormControl>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setCursoModal(null)}>{i18n.t("courses.cancel", "Cancelar")}</Button>
        <Button variant="contained" color="primary" onClick={salvarCurso}>{i18n.t("courses.save", "Salvar")}</Button>
      </DialogActions>
    </Dialog>
  );

  const aulaModalEl = (
    <Dialog open={aulaModal !== null} onClose={() => setAulaModal(null)} maxWidth="sm" fullWidth>
      <DialogTitle>{aulaModal === "novo" ? i18n.t("courses.newLesson", "Nova aula") : i18n.t("courses.editLesson", "Editar aula")}</DialogTitle>
      <DialogContent dividers>
        <TextField fullWidth size="small" variant="outlined" label={i18n.t("courses.lessonTitle", "Título da aula")}
          value={aulaForm.title} onChange={e => { const v = e.target.value; setAulaForm(f => ({ ...f, title: v })); }}
          style={{ marginBottom: 12 }} />
        <FormControl fullWidth size="small" variant="outlined" style={{ marginBottom: 12 }}>
          <InputLabel>{i18n.t("courses.lessonKind", "Tipo")}</InputLabel>
          <Select value={aulaForm.kind} onChange={e => { const v = e.target.value; setAulaForm(f => ({ ...f, kind: v })); }} label={i18n.t("courses.lessonKind", "Tipo")}>
            <MenuItem value="video">{i18n.t("courses.kindVideo", "Vídeo (YouTube)")}</MenuItem>
            <MenuItem value="pdf">{i18n.t("courses.kindPdf", "PDF")}</MenuItem>
            <MenuItem value="text">{i18n.t("courses.kindText", "Texto")}</MenuItem>
          </Select>
        </FormControl>
        {aulaForm.kind !== "text" && (
          <TextField fullWidth size="small" variant="outlined"
            label={aulaForm.kind === "pdf" ? i18n.t("courses.pdfUrl", "URL do PDF") : i18n.t("courses.videoUrl", "Link do YouTube")}
            value={aulaForm.contentUrl} onChange={e => { const v = e.target.value; setAulaForm(f => ({ ...f, contentUrl: v })); }}
            style={{ marginBottom: 12 }} />
        )}
        <TextField fullWidth size="small" variant="outlined" multiline minRows={3}
          label={i18n.t("courses.lessonBody", "Texto de apoio / conteúdo")}
          value={aulaForm.body} onChange={e => { const v = e.target.value; setAulaForm(f => ({ ...f, body: v })); }} />
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setAulaModal(null)}>{i18n.t("courses.cancel", "Cancelar")}</Button>
        <Button variant="contained" color="primary" onClick={salvarAula}>{i18n.t("courses.save", "Salvar")}</Button>
      </DialogActions>
    </Dialog>
  );

  // Painel de comentários do admin: de qual curso/aula veio, empresa, usuário e hora.
  const feedEl = (
    <Dialog open={feedOpen} onClose={() => setFeedOpen(false)} maxWidth="sm" fullWidth>
      <DialogTitle>{i18n.t("courses.commentsFeed", "Comentários dos usuários")}</DialogTitle>
      <DialogContent dividers>
        {feedComments.length === 0 ? (
          <Typography variant="body2" color="textSecondary" style={{ padding: 16, textAlign: "center" }}>
            {i18n.t("courses.feedEmpty", "Nenhum comentário ainda.")}
          </Typography>
        ) : (
          feedComments.map(c => (
            <div key={c.id} className={classes.feedItem} onClick={() => irParaComentario(c)}>
              <Avatar className={classes.avatar}>
                {(c.user?.name || "?").charAt(0).toUpperCase()}
              </Avatar>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 6, flexWrap: "wrap" }}>
                  <span className={classes.commentAutor}>{c.user?.name || "Usuário"}</span>
                  {c.company?.name && (
                    <Chip size="small" label={c.company.name} style={{ height: 18, fontSize: 10.5 }} />
                  )}
                  <span className={classes.feedHora}>{fmtQuando(c.createdAt)}</span>
                </div>
                <div className={classes.feedOrigem}>
                  {c.lesson?.course?.title ? `${c.lesson.course.title} › ` : ""}
                  {c.lesson?.title || ""}
                </div>
                <div className={classes.commentTexto}>{c.body}</div>
              </div>
            </div>
          ))
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setFeedOpen(false)}>{i18n.t("courses.close", "Fechar")}</Button>
      </DialogActions>
    </Dialog>
  );

  if (loading) {
    return <MainContainer><div style={{ padding: 40, textAlign: "center" }}><CircularProgress /></div></MainContainer>;
  }

  // ===== VISÃO DE UM CURSO ABERTO =====
  if (cursoAberto) {
    return (
      <MainContainer>
        <MainHeader>
          <Title>{cursoAberto.title}</Title>
          {isAdmin && (
            <Button size="small" variant="contained" color="primary" startIcon={<Plus size={15} />}
              onClick={() => abrirAulaModal(null)}>
              {i18n.t("courses.newLesson", "Nova aula")}
            </Button>
          )}
        </MainHeader>
        <Paper className={classes.paper} variant="outlined">
          <Button className={classes.voltar} onClick={() => setCursoAberto(null)}>
            ← {`${i18n.t("courses.backTo", "Voltar para")} ${pageTitle}`}
          </Button>

          <div className={classes.layoutCurso}>
            {/* Player + comentários */}
            <div>
              {/* Sem nenhuma aula: estado vazio explicando o próximo passo.
                  É aqui que antes parecia que "não vinha" o vídeo nem o
                  comentário — os dois só existem dentro de uma aula. */}
              {(cursoAberto.lessons || []).length === 0 && (
                <div style={{
                  padding: 40, textAlign: "center", border: "1px dashed #cbd5e1", borderRadius: 12
                }}>
                  <Play size={34} strokeWidth={1.4} color="#94a3b8" />
                  <Typography variant="body2" color="textSecondary" style={{ marginTop: 10 }}>
                    {isAdmin
                      ? i18n.t("courses.noLessonsAdmin", "Este curso ainda não tem aulas. Clique em \"Nova aula\" para adicionar um vídeo do YouTube, um PDF ou um texto.")
                      : i18n.t("courses.noLessonsUser", "Este curso ainda não tem aulas publicadas.")}
                  </Typography>
                  {isAdmin && (
                    <Button variant="contained" color="primary" size="small" startIcon={<Plus size={15} />}
                      style={{ marginTop: 14 }} onClick={() => abrirAulaModal(null)}>
                      {i18n.t("courses.newLesson", "Nova aula")}
                    </Button>
                  )}
                </div>
              )}

              {renderPlayer()}
              {aulaAtiva && (
                <>
                  <Typography variant="h6" style={{ marginTop: 12 }}>{aulaAtiva.title}</Typography>
                  {aulaAtiva.body && <Typography variant="body2" style={{ whiteSpace: "pre-wrap", marginTop: 6 }}>{aulaAtiva.body}</Typography>}

                  <Divider style={{ margin: "16px 0" }} />
                  <Typography variant="subtitle2" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <MessageSquare size={16} />
                    {i18n.t("courses.comments", "Comentários")}
                    {comentarios.length > 0 && ` (${comentarios.length})`}
                  </Typography>
                  <Typography variant="caption" color="textSecondary" style={{ display: "block", marginTop: 2 }}>
                    {/* Usa a descrição que o admin escreveu na página. Assim o
                        texto fala a linguagem do cliente, sem termo fixo. */}
                    {pageDesc || i18n.t("courses.commentsHint", "Deixe sua dúvida aqui — a equipe responde por aqui mesmo.")}
                  </Typography>

                  {!respondendo && (
                    <div style={{ display: "flex", gap: 8, margin: "10px 0" }}>
                      <TextField
                        size="small" variant="outlined" fullWidth multiline
                        placeholder={i18n.t("courses.writeComment", "Escreva um comentário...")}
                        value={novoComentario}
                        onChange={e => setNovoComentario(e.target.value)}
                      />
                      <Button variant="contained" color="primary" onClick={enviarComentario}>
                        {i18n.t("courses.send", "Enviar")}
                      </Button>
                    </div>
                  )}

                  <div>
                    {raizes.length === 0
                      ? <Typography variant="body2" color="textSecondary" style={{ padding: "8px 0" }}>
                          {i18n.t("courses.noComments", "Seja o primeiro a comentar.")}
                        </Typography>
                      : raizes.map(c => renderComentario(c))}
                  </div>
                </>
              )}
            </div>

            {/* Lista de aulas */}
            <div className={classes.painelAulas}>
              <Typography variant="subtitle2" style={{ marginBottom: 8 }}>{i18n.t("courses.lessons", "Aulas")}</Typography>
              {(cursoAberto.lessons || []).map(aula => (
                <div
                  key={aula.id}
                  className={`${classes.lessonItem} ${aulaAtiva?.id === aula.id ? classes.lessonAtivo : ""}`}
                  onClick={() => selecionarAula(aula)}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
                    {iconeAula(aula.kind)}
                    <span style={{ fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {aula.title}
                    </span>
                  </div>
                  {isAdmin && (
                    <div style={{ display: "flex", gap: 2 }}>
                      <IconButton size="small" onClick={e => { e.stopPropagation(); abrirAulaModal(aula); }}>
                        <Pencil size={14} />
                      </IconButton>
                      <IconButton size="small" onClick={e => removerAula(aula, e)}>
                        <Trash2 size={14} color="#ef4444" />
                      </IconButton>
                    </div>
                  )}
                </div>
              ))}
              {(cursoAberto.lessons || []).length === 0 && (
                <Typography variant="body2" color="textSecondary">{i18n.t("courses.noLessons", "Nenhuma aula ainda.")}</Typography>
              )}
            </div>
          </div>
        </Paper>

        {/* Modal de aula */}
        {aulaModalEl}
        {feedEl}
      </MainContainer>
    );
  }

  // ===== LISTA DE CURSOS =====
  return (
    <MainContainer>
      <MainHeader>
        <Title>{pageTitle}</Title>
        {isAdmin && (
          <>
            <Tooltip title={i18n.t("courses.commentsFeed", "Comentários dos usuários")}>
              <IconButton onClick={abrirFeed}>
                <Badge badgeContent={feedUnseen} color="error">
                  <Bell size={19} strokeWidth={2} />
                </Badge>
              </IconButton>
            </Tooltip>
            <Button
              variant="contained"
              color="primary"
              startIcon={<Plus size={16} />}
              onClick={() => abrirCursoModal(null)}
            >
              {`${i18n.t("courses.newPrefix", "Novo")} ${itemLabel}`}
            </Button>
          </>
        )}
      </MainHeader>

      <Paper className={classes.paper} variant="outlined">
        {/* Descrição da página */}
        <div className={classes.descBox}>
          {editandoDesc ? (
            <>
              {/* Um texto por idioma: o que o admin escreve aqui é dado, não
                  rótulo de tela, então não se traduz sozinho. O usuário vê o
                  do idioma dele; em branco, cai no português. */}
              <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 10, flexWrap: "wrap" }}>
                <span style={{ fontSize: 12.5, opacity: 0.75 }}>
                  {i18n.t("courses.editingLanguage", "Editando o idioma")}:
                </span>
                {IDIOMAS_PAGINA.map(idioma => (
                  <Button
                    key={idioma}
                    size="small"
                    variant={idiomaEdicao === idioma ? "contained" : "outlined"}
                    color={idiomaEdicao === idioma ? "primary" : "default"}
                    onClick={() => setIdiomaEdicao(idioma)}
                    style={{ minWidth: 46, textTransform: "uppercase" }}
                  >
                    {idioma}
                  </Button>
                ))}
                <span style={{ fontSize: 11.5, opacity: 0.6 }}>
                  {i18n.t("courses.languageHint", "Em branco, usa o português.")}
                </span>
              </div>

              <div style={{ display: "flex", gap: 12, marginBottom: 10, flexWrap: "wrap" }}>
                <TextField
                  size="small" variant="outlined" style={{ flex: "1 1 220px" }}
                  label={i18n.t("courses.pageTitleLabel", "Nome da página")}
                  value={tituloTemp[idiomaEdicao] || ""}
                  onChange={e => {
                    const v = e.target.value;
                    setTituloTemp(prev => ({ ...prev, [idiomaEdicao]: v }));
                  }}
                  placeholder="Ex.: Universidade QP"
                />
                <TextField
                  size="small" variant="outlined" style={{ flex: "1 1 220px" }}
                  label={i18n.t("courses.itemLabelLabel", "Nome do item (singular)")}
                  value={itemLabelTemp[idiomaEdicao] || ""}
                  onChange={e => {
                    const v = e.target.value;
                    setItemLabelTemp(prev => ({ ...prev, [idiomaEdicao]: v }));
                  }}
                  placeholder="Ex.: curso, treinamento, módulo"
                  helperText={`${i18n.t("courses.buttonPreview", "Botão ficará")}: "${i18n.t("courses.newPrefix", "Novo")} ${itemLabelTemp[idiomaEdicao] || itemLabel}"`}
                />
              </div>
              <TextField
                fullWidth multiline minRows={2} size="small" variant="outlined"
                label={i18n.t("courses.description", "Descrição")}
                value={descTemp[idiomaEdicao] || ""}
                onChange={e => {
                  const v = e.target.value;
                  setDescTemp(prev => ({ ...prev, [idiomaEdicao]: v }));
                }}
                placeholder={i18n.t("courses.descPlaceholder", "Escreva a descrição da área de cursos...")}
              />
              <div style={{ marginTop: 8, display: "flex", gap: 8 }}>
                <Button size="small" variant="contained" color="primary" startIcon={<Save size={15} />} onClick={salvarDesc}>
                  {i18n.t("courses.save", "Salvar")}
                </Button>
                <Button size="small" onClick={() => setEditandoDesc(false)}>{i18n.t("courses.cancel", "Cancelar")}</Button>
              </div>
            </>
          ) : (
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
              <Typography variant="body2" style={{ whiteSpace: "pre-wrap" }}>
                {pageDesc || i18n.t("courses.noDesc", "Área de cursos e treinamentos.")}
              </Typography>
              {isAdmin && (
                <Tooltip title={i18n.t("courses.editPage", "Editar nome e descrição da página")}>
                  <IconButton size="small" onClick={abrirEdicaoDesc}>
                    <Pencil size={15} />
                  </IconButton>
                </Tooltip>
              )}
            </div>
          )}
        </div>

        {courses.length === 0 ? (
          <div style={{ padding: 40, textAlign: "center" }}>
            <BookOpen size={36} strokeWidth={1.4} color="#94a3b8" />
            <Typography variant="body2" color="textSecondary" style={{ marginTop: 10 }}>
              {isAdmin
                ? `${i18n.t("courses.emptyAdmin", "Nenhum item ainda. Clique em")} "${i18n.t("courses.newPrefix", "Novo")} ${itemLabel}" ${i18n.t("courses.emptyAdmin2", "para criar o primeiro.")}`
                : i18n.t("courses.empty", "Nenhum curso disponível ainda.")}
            </Typography>
          </div>
        ) : (
          <div className={classes.grid}>
            {courses.map(curso => (
              <div key={curso.id} className={classes.card} onClick={() => abrirCurso(curso)}>
                {capaDoCurso(curso)
                  ? <img className={classes.cover} src={capaDoCurso(curso)} alt={curso.title} />
                  : <div className={classes.coverPlaceholder}><Play size={28} /></div>}
                <div className={classes.cardBody}>
                  <div className={classes.cardTitle}>{curso.title}</div>
                  {curso.description && <div className={classes.cardDesc}>{curso.description}</div>}
                  <div style={{ display: "flex", gap: 6, marginTop: 8, alignItems: "center" }}>
                    <Chip size="small" label={`${(curso.lessons || []).length} ${i18n.t("courses.lessonsShort", "aulas")}`} style={{ height: 20, fontSize: 11 }} />
                    {isAdmin && !curso.active && <Chip size="small" label={i18n.t("courses.inactive", "Inativo")} style={{ height: 20, fontSize: 11 }} />}
                    {isAdmin && (
                      <div style={{ marginLeft: "auto", display: "flex" }}>
                        <IconButton size="small" onClick={e => { e.stopPropagation(); abrirCursoModal(curso); }}>
                          <Pencil size={14} />
                        </IconButton>
                        <IconButton size="small" onClick={e => removerCurso(curso, e)}>
                          <Trash2 size={14} color="#ef4444" />
                        </IconButton>
                      </div>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </Paper>

      {/* Modal de curso (admin) */}
      {cursoModalEl}
      {feedEl}
    </MainContainer>
  );
};

export default Courses;
