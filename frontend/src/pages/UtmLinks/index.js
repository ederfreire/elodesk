import React, { useEffect, useState } from "react";
import { makeStyles } from "@material-ui/core/styles";
import Paper from "@material-ui/core/Paper";
import Button from "@material-ui/core/Button";
import IconButton from "@material-ui/core/IconButton";
import TextField from "@material-ui/core/TextField";
import MenuItem from "@material-ui/core/MenuItem";
import Table from "@material-ui/core/Table";
import TableBody from "@material-ui/core/TableBody";
import TableCell from "@material-ui/core/TableCell";
import TableHead from "@material-ui/core/TableHead";
import TableRow from "@material-ui/core/TableRow";
import Tooltip from "@material-ui/core/Tooltip";
import Typography from "@material-ui/core/Typography";
import CircularProgress from "@material-ui/core/CircularProgress";
import { Copy, Trash2, Plus, Link2 } from "lucide-react";

import { toast } from "react-toastify";
import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import Title from "../../components/Title";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import { i18n } from "../../translate/i18n";

/**
 * Links UTM para anúncios que levam ao WhatsApp.
 *
 * POR QUE NÃO É SÓ MONTAR UMA URL COM ?utm_source=...
 * UTM na query string só funciona quando o destino é um site, que lê a URL.
 * Aqui o destino é o WhatsApp: o wa.me descarta tudo que não seja `text`, e
 * o app não repassa nada da URL para dentro da conversa. Qualquer utm_source
 * grudado no wa.me se perde no caminho.
 *
 * O único canal que sobrevive do anúncio até o atendimento é o TEXTO da
 * primeira mensagem. Por isso cada link carrega um código curto embutido na
 * mensagem pré-preenchida; o backend lê esse código na primeira mensagem e
 * liga o contato ao anúncio (ver IdentifyUtmFromMessage.ts).
 */

const ORIGENS = [
  { valor: "facebook", rotulo: "Facebook" },
  { valor: "instagram", rotulo: "Instagram" },
  { valor: "messenger", rotulo: "Messenger" },
  { valor: "google", rotulo: "Google" },
  { valor: "tiktok", rotulo: "TikTok" },
  { valor: "youtube", rotulo: "YouTube" },
  { valor: "kwai", rotulo: "Kwai" },
  { valor: "linkedin", rotulo: "LinkedIn" },
  { valor: "whatsapp", rotulo: "WhatsApp" },
  { valor: "email", rotulo: "E-mail" },
  { valor: "sms", rotulo: "SMS" },
  { valor: "outro", rotulo: "Outro" },
];

const MEIOS = ["cpc", "cpm", "social", "orgânico", "e-mail", "influencer", "outro"];

const useStyles = makeStyles(theme => ({
  paper: { padding: theme.spacing(2), width: "100%" },
  // O formulario era uma grade solta de campos sobre o fundo do Paper, sem
  // nada separando "criar" de "listar". Vira um bloco proprio, com titulo e
  // fundo levemente destacado.
  blocoForm: {
    borderRadius: 14,
    border: `1px solid ${theme.palette.divider}`,
    backgroundColor:
      theme.palette.type === "dark"
        ? "rgba(255,255,255,0.02)"
        : "rgba(99,102,241,0.03)",
    padding: theme.spacing(2.5),
    marginBottom: theme.spacing(3),
  },
  tituloBloco: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 15,
    fontWeight: 700,
    marginBottom: theme.spacing(0.5),
  },
  formulario: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(210px, 1fr))",
    gap: theme.spacing(2),
    marginTop: theme.spacing(2),
  },
  previa: {
    gridColumn: "1 / -1",
    marginTop: theme.spacing(0.5),
    padding: theme.spacing(1.5),
    borderRadius: 10,
    border: `1px dashed ${theme.palette.divider}`,
    fontFamily: "'Roboto Mono', monospace",
    fontSize: 12,
    lineHeight: 1.6,
    wordBreak: "break-all",
    color: theme.palette.text.secondary,
  },
  previaRotulo: {
    display: "block",
    fontFamily: "inherit",
    fontSize: 11,
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
    marginBottom: 4,
    color: theme.palette.text.secondary,
  },
  destaqueCodigo: { color: "#16a34a", fontWeight: 700 },
  linhaBotao: { gridColumn: "1 / -1", display: "flex", justifyContent: "flex-end" },
  ajuda: {
    fontSize: 13,
    lineHeight: 1.6,
    color: theme.palette.text.secondary,
    marginBottom: theme.spacing(2),
  },
  url: {
    fontFamily: "'Roboto Mono', monospace",
    fontSize: 12,
    wordBreak: "break-all",
    maxWidth: 340,
    display: "inline-block",
  },
  codigo: {
    fontFamily: "'Roboto Mono', monospace",
    fontWeight: 700,
    fontSize: 12,
  },
  alternar: {
    color: "#4338ca",
    cursor: "pointer",
    fontWeight: 600,
    "&:hover": { textDecoration: "underline" },
  },
  itemConexao: { display: "inline-flex", alignItems: "center", gap: 8 },
  pontoStatus: {
    width: 8,
    height: 8,
    borderRadius: "50%",
    flexShrink: 0,
  },
  vazio: {
    padding: theme.spacing(4),
    textAlign: "center",
    color: theme.palette.text.secondary,
  },
}));

/** Monta a URL final do wa.me com a mensagem e o código embutidos. */
export const montarUrlUtm = link => {
  const numero = String(link.whatsappNumber || "").replace(/\D/g, "");
  // Texto padrão traduzido: é a mensagem que o lead já encontra escrita ao
  // abrir o WhatsApp pelo anúncio. Cada link pode ter a sua própria (campo
  // "message"); esta só vale quando o campo está vazio.
  const padrao = i18n.t("utmLinks.defaultMessage", "Olá! Vim pelo anúncio.");
  const texto = `${link.message || padrao} [EQ:${link.code}]`;
  if (!numero) return "";
  return `https://wa.me/${numero}?text=${encodeURIComponent(texto)}`;
};

const copiar = (texto, mensagemOk) => {
  if (!texto) return;
  // navigator.clipboard só existe em contexto seguro; em instalação acessada
  // por IP puro ele é undefined e o botão não faria nada.
  if (navigator.clipboard?.writeText) {
    navigator.clipboard.writeText(texto);
  } else {
    const campo = document.createElement("textarea");
    campo.value = texto;
    campo.style.position = "fixed";
    campo.style.opacity = "0";
    document.body.appendChild(campo);
    campo.select();
    document.execCommand("copy");
    document.body.removeChild(campo);
  }
  toast.success(mensagemOk);
};

const UtmLinks = () => {
  const classes = useStyles();

  const [links, setLinks] = useState([]);
  // Numeros vindos das conexoes conectadas. Digitar o numero na mao era
  // convite a erro: um digito trocado gera um link que leva a lugar nenhum, e
  // so se descobre quando o anuncio ja esta rodando.
  const [conexoes, setConexoes] = useState([]);
  const [numeroManual, setNumeroManual] = useState(false);
  const [carregando, setCarregando] = useState(true);
  const [salvando, setSalvando] = useState(false);

  const vazio = {
    name: "",
    source: "facebook",
    medium: "cpc",
    campaign: "",
    content: "",
    term: "",
    whatsappNumber: "",
    message: i18n.t("utmLinks.defaultMessage", "Olá! Vim pelo anúncio."),
  };
  const [novo, setNovo] = useState(vazio);

  const carregarLinks = async () => {
    try {
      const { data } = await api.get("/utm-links");
      setLinks(Array.isArray(data) ? data : []);
    } catch (err) {
      toastError(err);
    } finally {
      setCarregando(false);
    }
  };

  const carregarConexoes = async () => {
    try {
      const { data } = await api.get("/whatsapp", { params: { session: 0 } });
      const disponiveis = (Array.isArray(data) ? data : [])
        .filter((c) => {
          const numero = String(c.number || c.phone_number || "").replace(/\D/g, "");
          // So conexao com numero real: Telegram, webchat e conexoes ainda
          // nao pareadas nao tem numero de WhatsApp para o wa.me.
          return numero.length >= 10;
        })
        .map((c) => ({
          id: c.id,
          nome: c.name,
          status: c.status,
          numero: String(c.number || c.phone_number || "").replace(/\D/g, ""),
        }));
      setConexoes(disponiveis);

      // Sem nenhuma conexao com numero, o campo ja abre no modo manual — um
      // seletor vazio nao daria como criar link nenhum.
      if (disponiveis.length === 0) setNumeroManual(true);
    } catch {
      setNumeroManual(true);
    }
  };

  useEffect(() => {
    carregarLinks();
    carregarConexoes();
  }, []);

  const criar = async () => {
    if (!novo.name.trim()) {
      toast.warning(i18n.t("utmLinks.nameRequired"));
      return;
    }
    if (!String(novo.whatsappNumber).replace(/\D/g, "")) {
      toast.warning(i18n.t("utmLinks.numberRequired"));
      return;
    }

    setSalvando(true);
    try {
      await api.post("/utm-links", novo);
      toast.success(i18n.t("utmLinks.created"));
      setNovo(vazio);
      carregarLinks();
    } catch (err) {
      toastError(err);
    } finally {
      setSalvando(false);
    }
  };

  const remover = async link => {
    try {
      await api.delete(`/utm-links/${link.id}`);
      toast.success(i18n.t("utmLinks.removed"));
      carregarLinks();
    } catch (err) {
      toastError(err);
    }
  };

  const campo = (chave, rotulo, extras = {}) => (
    <TextField
      size="small"
      variant="outlined"
      label={rotulo}
      value={novo[chave]}
      onChange={e => setNovo({ ...novo, [chave]: e.target.value })}
      {...extras}
    />
  );

  return (
    <MainContainer>
      <MainHeader>
        <Title>{i18n.t("utmLinks.title")}</Title>
      </MainHeader>

      <Paper className={classes.paper} variant="outlined">
        {/* Sem abas: o relatorio saiu daqui e foi para o Relatorio de
            Anuncios, que ja existia e responde a mesma pergunta. Ter dois
            relatorios de anuncio em lugares diferentes so obrigava a escolher
            qual abrir. */}
        <div>
            <div className={classes.blocoForm}>
              <div className={classes.tituloBloco}>
                <Link2 size={17} strokeWidth={2.2} />
                {i18n.t("utmLinks.newLink")}
              </div>
              <Typography className={classes.ajuda}>
                {i18n.t("utmLinks.help")}
              </Typography>

              <div className={classes.formulario}>
              {campo("name", i18n.t("utmLinks.fields.name"))}

              <TextField
                select
                size="small"
                variant="outlined"
                label={i18n.t("utmLinks.fields.source")}
                value={novo.source}
                onChange={e => setNovo({ ...novo, source: e.target.value })}
              >
                {ORIGENS.map(o => (
                  <MenuItem key={o.valor} value={o.valor}>
                    {o.rotulo}
                  </MenuItem>
                ))}
              </TextField>

              <TextField
                select
                size="small"
                variant="outlined"
                label={i18n.t("utmLinks.fields.medium")}
                value={novo.medium}
                onChange={e => setNovo({ ...novo, medium: e.target.value })}
              >
                {MEIOS.map(m => (
                  <MenuItem key={m} value={m}>
                    {m}
                  </MenuItem>
                ))}
              </TextField>

              {campo("campaign", i18n.t("utmLinks.fields.campaign"))}
              {campo("content", i18n.t("utmLinks.fields.content"))}
              {/* Numero: por padrao vem das conexoes conectadas; o modo
                  manual continua disponivel para numero que ainda nao esta no
                  sistema. */}
              {numeroManual || conexoes.length === 0 ? (
                <TextField
                  size="small"
                  variant="outlined"
                  label={i18n.t("utmLinks.fields.number")}
                  placeholder="5581999999999"
                  value={novo.whatsappNumber}
                  onChange={e =>
                    setNovo({ ...novo, whatsappNumber: e.target.value })
                  }
                  helperText={
                    conexoes.length > 0 ? (
                      <span
                        className={classes.alternar}
                        onClick={() => setNumeroManual(false)}
                      >
                        {i18n.t("utmLinks.useConnection")}
                      </span>
                    ) : (
                      i18n.t("utmLinks.noConnections")
                    )
                  }
                />
              ) : (
                <TextField
                  select
                  size="small"
                  variant="outlined"
                  label={i18n.t("utmLinks.fields.connection")}
                  value={novo.whatsappNumber}
                  onChange={e =>
                    setNovo({ ...novo, whatsappNumber: e.target.value })
                  }
                  helperText={
                    <span
                      className={classes.alternar}
                      onClick={() => {
                        setNumeroManual(true);
                        setNovo({ ...novo, whatsappNumber: "" });
                      }}
                    >
                      {i18n.t("utmLinks.useManual")}
                    </span>
                  }
                >
                  {conexoes.map(c => (
                    <MenuItem key={c.id} value={c.numero}>
                      <span className={classes.itemConexao}>
                        <span
                          className={classes.pontoStatus}
                          style={{
                            backgroundColor:
                              String(c.status).toUpperCase() === "CONNECTED"
                                ? "#22c55e"
                                : "#94a3b8",
                          }}
                        />
                        {c.nome} · {c.numero}
                      </span>
                    </MenuItem>
                  ))}
                </TextField>
              )}
              {campo("message", i18n.t("utmLinks.fields.message"), {
                style: { gridColumn: "1 / -1" },
              })}

              {/* Previa do link. Antes o usuario so via a URL depois de
                  criar; se o numero ou a mensagem estivessem errados, era
                  preciso apagar e refazer. */}
              <div className={classes.previa}>
                <span className={classes.previaRotulo}>
                  {i18n.t("utmLinks.preview")}
                </span>
                {String(novo.whatsappNumber).replace(/\D/g, "").length >= 10 ? (
                  <>
                    {`https://wa.me/${String(novo.whatsappNumber).replace(/\D/g, "")}?text=`}
                    {encodeURIComponent(novo.message || "")}
                    <span className={classes.destaqueCodigo}>
                      {encodeURIComponent(" [EQ:XXXXXX]")}
                    </span>
                  </>
                ) : (
                  i18n.t("utmLinks.previewEmpty")
                )}
              </div>

              <div className={classes.linhaBotao}>
                <Button
                  variant="contained"
                  color="primary"
                  disabled={salvando}
                  startIcon={
                    salvando ? (
                      <CircularProgress size={15} color="inherit" />
                    ) : (
                      <Plus size={16} strokeWidth={2.2} />
                    )
                  }
                  onClick={criar}
                >
                  {i18n.t("utmLinks.create")}
                </Button>
              </div>
              </div>
            </div>

            {carregando ? (
              <CircularProgress size={24} />
            ) : links.length === 0 ? (
              <div className={classes.vazio}>
                <Link2 size={28} strokeWidth={1.6} />
                <div style={{ marginTop: 8 }}>{i18n.t("utmLinks.emptyLinks")}</div>
              </div>
            ) : (
              <Table size="small">
                <TableHead>
                  <TableRow>
                    <TableCell>{i18n.t("utmLinks.fields.name")}</TableCell>
                    <TableCell>{i18n.t("utmLinks.fields.source")}</TableCell>
                    <TableCell>{i18n.t("utmLinks.fields.campaign")}</TableCell>
                    <TableCell>{i18n.t("utmLinks.code")}</TableCell>
                    <TableCell>{i18n.t("utmLinks.url")}</TableCell>
                    <TableCell align="center">
                      {i18n.t("utmLinks.actions")}
                    </TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {links.map(link => {
                    const url = montarUrlUtm(link);
                    return (
                      <TableRow key={link.id}>
                        <TableCell>{link.name}</TableCell>
                        <TableCell>{link.source}</TableCell>
                        <TableCell>{link.campaign || "—"}</TableCell>
                        <TableCell className={classes.codigo}>
                          {link.code}
                        </TableCell>
                        <TableCell>
                          <span className={classes.url}>{url || "—"}</span>
                        </TableCell>
                        <TableCell align="center">
                          <Tooltip title={i18n.t("utmLinks.copy")}>
                            <span>
                              <IconButton
                                size="small"
                                disabled={!url}
                                onClick={() =>
                                  copiar(url, i18n.t("utmLinks.copied"))
                                }
                              >
                                <Copy size={16} strokeWidth={2} />
                              </IconButton>
                            </span>
                          </Tooltip>
                          <Tooltip title={i18n.t("utmLinks.remove")}>
                            <IconButton size="small" onClick={() => remover(link)}>
                              <Trash2 size={16} strokeWidth={2} color="#ef4444" />
                            </IconButton>
                          </Tooltip>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
        </div>

      </Paper>
    </MainContainer>
  );
};

export default UtmLinks;
