/**
 * TESTAR A URA SEM LIGAR PARA O NÚMERO.
 *
 * Percorre o fluxo do mesmo jeito que a ligação percorre: segue as arestas
 * pelo `sourceHandle`, exatamente como o executor faz em `flowNextOf`. Onde a
 * ligação ouviria o cliente, aqui a tela pergunta — tecla, opção do menu, ou
 * o lado da condição.
 *
 * O áudio é o DE VERDADE: vem do mesmo sintetizador que a ligação usa, pelo
 * endpoint /voice-ivr/ouvir. Uma prévia com outra voz seria pior que nenhuma,
 * porque daria confiança no que não foi conferido.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  Button,
  CircularProgress,
  Divider,
  IconButton,
  TextField,
  Typography,
} from "@material-ui/core";
import PlayArrow from "@material-ui/icons/PlayArrow";
import VolumeUp from "@material-ui/icons/VolumeUp";
import ReplayIcon from "@material-ui/icons/Replay";
import CloseIcon from "@material-ui/icons/Close";
import api from "../../services/api";
import { i18n } from "../../translate/i18n";
import { ID_INICIO } from "./grafo";

/** Toca uma frase com a voz do fluxo. Devolve o erro em texto, se houver. */
export async function falar(texto, voz, refAudio) {
  const limpo = String(texto || "").trim();
  if (!limpo) return null;
  try {
    const { data } = await api.post(
      "/voice-ivr/ouvir",
      { text: limpo, voice: voz || null },
      { responseType: "blob" }
    );
    const url = URL.createObjectURL(data);
    if (refAudio.current) {
      refAudio.current.pause();
      URL.revokeObjectURL(refAudio.current.src);
    }
    const audio = new Audio(url);
    refAudio.current = audio;
    try {
      await audio.play();
    } catch (bloqueio) {
      // O navegador pode recusar tocar som sem um clique recente. Isso NÃO é
      // falha do servidor: o áudio chegou. Dizer "não consegui gerar" aqui
      // mandaria o usuário procurar problema no lugar errado.
      return i18n.t(
        "voiceIvrFlow.audioBloqueado",
        "O navegador bloqueou o som. Clique em qualquer lugar da página e toque de novo."
      );
    }
    return null;
  } catch (err) {
    // O corpo do erro vem como blob porque pedimos blob; vira texto aqui.
    let msg = i18n.t("voiceIvrFlow.ouvirFalhou", "Não consegui gerar o áudio.");
    try {
      const bruto = await err?.response?.data?.text?.();
      msg = JSON.parse(bruto)?.error || msg;
    } catch {
      /* sem corpo legível: fica a mensagem padrão */
    }
    // Sem voz instalada no servidor, a mensagem crua ("fallback offline
    // espeak-ng não instalado") não diz o que fazer. Aqui ela vira instrução.
    if (/espeak|piper|tts|voz/i.test(msg)) {
      msg +=
        " " +
        i18n.t(
          "voiceIvrFlow.vozNaoInstalada",
          "Parece que o servidor está sem voz instalada: rode o instalador em Atualizar, ou instale com: apt install espeak-ng"
        );
    }
    return msg;
  }
}

/**
 * Por onde a ligação segue — CÓPIA FIEL do `flowNextOf` do executor
 * (flowexec.go), inclusive na ordem das decisões.
 *
 * A versão anterior, quando não havia saída nomeada, pegava a PRIMEIRA aresta
 * do passo, qualquer que fosse. Numa ligação de verdade o executor ignora as
 * arestas de saída nomeada nesse caso: um menu em que ninguém respondeu
 * encerraria, enquanto o teste seguia alegremente pela opção 1 e dizia que
 * estava tudo certo. Um teste que anda diferente da ligação é pior que
 * nenhum teste.
 */
const proximo = (arestas, de, handle) => {
  const links = arestas || [];
  const h = handle || "";
  for (const e of links) {
    if (e.source !== de) continue;
    const eh = e.sourceHandle || "";
    if (h !== "" && eh !== h) continue;
    // Sem saída nomeada, uma aresta de saída nomeada não serve ("out" conta
    // como sem nome).
    if (h === "" && eh !== "" && eh !== "out") continue;
    return e.target;
  }
  // Reserva do executor: pediu uma saída nomeada que não existe, segue a
  // primeira que sair do passo.
  if (h !== "") {
    const qualquer = links.find((e) => e.source === de);
    if (qualquer) return qualquer.target;
  }
  return null;
};

export default function PainelDeTeste({ nos, arestas, voz, classes, aoFechar }) {
  const [linhas, setLinhas] = useState([]);
  const [atual, setAtual] = useState(null);
  const [digitos, setDigitos] = useState("");
  const [tocando, setTocando] = useState(false);
  const refAudio = useRef(null);
  const refFim = useRef(null);

  const achar = useCallback((id) => nos.find((n) => n.id === id) || null, [nos]);

  const dizer = useCallback(
    async (texto) => {
      if (!texto) return;
      setTocando(true);
      const erro = await falar(texto, voz, refAudio);
      setTocando(false);
      if (erro) setLinhas((l) => [...l, { tipo: "erro", texto: erro }]);
    },
    [voz]
  );

  const entrar = useCallback(
    async (id) => {
      const no = achar(id);
      if (!no) {
        setLinhas((l) => [
          ...l,
          { tipo: "fim", texto: i18n.t("voiceIvrFlow.teste.semSaida", "A ligação para aqui: o passo não leva a lugar nenhum.") },
        ]);
        setAtual(null);
        return;
      }
      setAtual(no);
      const d = no.data || {};
      if (no.type === "message" || no.type === "voice_menu" || no.type === "dtmf_capture") {
        if (d.prompt) {
          setLinhas((l) => [...l, { tipo: "ura", texto: d.prompt }]);
          await dizer(d.prompt);
        }
      }
      if (no.type === "message") {
        setTimeout(() => entrar(proximo(arestas, no.id)), 150);
      } else if (no.type === "delay") {
        setLinhas((l) => [
          ...l,
          { tipo: "nota", texto: i18n.t("voiceIvrFlow.teste.espera", "(espera {s}s)").replace("{s}", d.seconds || 1) },
        ]);
        setTimeout(() => entrar(proximo(arestas, no.id)), 300);
      } else if (["webhook", "whatsapp_send", "whatsapp_media", "set_variable"].includes(no.type)) {
        // Automações não rodam no teste (não dispara webhook nem manda
        // WhatsApp de verdade): só mostra o que aconteceria e segue.
        const rotulos = {
          webhook: i18n.t("voiceIvrFlow.teste.webhook", "(webhook {x} — não é disparado no teste)").replace("{x}", d.url || ""),
          whatsapp_send: i18n.t("voiceIvrFlow.teste.whatsapp", "(WhatsApp enviado: {x} — não é enviado no teste)").replace("{x}", d.template || ""),
          whatsapp_media: i18n.t("voiceIvrFlow.teste.midia", "(arquivo enviado por WhatsApp — não é enviado no teste)"),
          set_variable: i18n.t("voiceIvrFlow.teste.variavel", "(variável {x} definida)").replace("{x}", d.variable || ""),
        };
        setLinhas((l) => [...l, { tipo: "nota", texto: rotulos[no.type] }]);
        setTimeout(() => entrar(proximo(arestas, no.id)), 200);
      } else if (no.type === "record_audio") {
        setLinhas((l) => [
          ...l,
          { tipo: "nota", texto: i18n.t("voiceIvrFlow.teste.ouvindo", "(a URA ouve o cliente por até {s}s)").replace("{s}", d.seconds || 10) },
        ]);
        setTimeout(() => entrar(proximo(arestas, no.id)), 300);
      } else if (no.type === "transfer") {
        if (d.prompt) {
          setLinhas((l) => [...l, { tipo: "ura", texto: d.prompt }]);
          await dizer(d.prompt);
        }
        setLinhas((l) => [
          ...l,
          { tipo: "fim", texto: d.queueId || d.userId
              ? i18n.t("voiceIvrFlow.teste.transferiu", "Transferido. A ligação sai da URA aqui.")
              : i18n.t("voiceIvrFlow.teste.transferSemDestino", "Transferência SEM fila nem operador: a ligação não vai a lugar nenhum.") },
        ]);
        setAtual(null);
      } else if (no.type === "end") {
        if (d.finalText) {
          setLinhas((l) => [...l, { tipo: "ura", texto: d.finalText }]);
          await dizer(d.finalText);
        }
        setLinhas((l) => [...l, { tipo: "fim", texto: i18n.t("voiceIvrFlow.teste.desligou", "A URA desligou.") }]);
        setAtual(null);
      }
    },
    [achar, arestas, dizer]
  );

  const comecar = useCallback(() => {
    setLinhas([]);
    setDigitos("");
    const primeiro = arestas.find((e) => e.source === ID_INICIO);
    if (!primeiro) {
      setLinhas([{ tipo: "erro", texto: i18n.t("voiceIvrFlow.avisos.semInicio", "Ligue o “A ligação começa aqui” no primeiro passo — sem isso a URA não tem por onde começar.") }]);
      setAtual(null);
      return;
    }
    entrar(primeiro.target);
  }, [arestas, entrar]);

  useEffect(() => {
    comecar();
    return () => {
      if (refAudio.current) refAudio.current.pause();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (refFim.current) refFim.current.scrollIntoView({ block: "end" });
  }, [linhas]);

  const responder = (texto, handle) => {
    setLinhas((l) => [...l, { tipo: "cliente", texto }]);
    const de = atual;
    setDigitos("");
    if (de) entrar(proximo(arestas, de.id, handle));
  };

  const d = atual?.data || {};

  return (
    <div className={classes.painelTeste}>
      <div className={classes.tituloTeste}>
        <VolumeUp style={{ fontSize: 18, marginRight: 6 }} />
        <Typography variant="subtitle2" style={{ flex: 1, fontWeight: 700 }}>
          {i18n.t("voiceIvrFlow.teste.titulo", "Testar a ligação")}
        </Typography>
        {tocando && <CircularProgress size={14} style={{ marginRight: 6 }} />}
        <IconButton size="small" onClick={comecar} title={i18n.t("voiceIvrFlow.teste.recomecar", "Recomeçar")}>
          <ReplayIcon fontSize="small" />
        </IconButton>
        <IconButton size="small" onClick={aoFechar}>
          <CloseIcon fontSize="small" />
        </IconButton>
      </div>
      <Divider />

      <div className={classes.conversaTeste}>
        {linhas.map((l, i) => (
          <div key={i} className={classes[`fala_${l.tipo}`] || classes.fala_nota}>
            {l.texto}
          </div>
        ))}
        <div ref={refFim} />
      </div>

      {atual?.type === "voice_menu" && (
        <div className={classes.respostasTeste}>
          <Typography variant="caption" color="textSecondary">
            {i18n.t("voiceIvrFlow.teste.escolha", "O que o cliente responde:")}
          </Typography>
          {(d.options || []).map((o) => (
            <Button
              key={o.key}
              size="small"
              variant="outlined"
              fullWidth
              style={{ marginTop: 4, justifyContent: "flex-start", textTransform: "none" }}
              onClick={() => responder(`${o.key} — ${o.label || ""}`.trim(), o.key)}
            >
              {o.key} · {o.label}
            </Button>
          ))}
        </div>
      )}

      {atual?.type === "dtmf_capture" && (
        <div className={classes.respostasTeste}>
          <TextField
            fullWidth
            size="small"
            variant="outlined"
            margin="dense"
            label={i18n.t("voiceIvrFlow.teste.digite", "O cliente digita")}
            value={digitos}
            onChange={(e) => setDigitos(e.target.value.replace(/\D/g, "").slice(0, d.maxDigits || 1))}
            onKeyDown={(e) => {
              if (e.key === "Enter" && digitos) responder(digitos);
            }}
          />
          <Button
            size="small"
            variant="contained"
            color="primary"
            disableElevation
            fullWidth
            disabled={!digitos}
            startIcon={<PlayArrow />}
            onClick={() => responder(digitos)}
          >
            {i18n.t("voiceIvrFlow.teste.enviar", "Continuar")}
          </Button>
        </div>
      )}

      {atual?.type === "condition" && (
        <div className={classes.respostasTeste}>
          <Typography variant="caption" color="textSecondary">
            {i18n.t("voiceIvrFlow.teste.condicao", "Nesta ligação, a condição deu:")}
          </Typography>
          <Button size="small" variant="outlined" fullWidth style={{ marginTop: 4, textTransform: "none" }}
            onClick={() => responder(i18n.t("voiceIvrFlow.nos.verdadeiro", "verdadeiro"), "true")}>
            {i18n.t("voiceIvrFlow.nos.verdadeiro", "verdadeiro")}
          </Button>
          <Button size="small" variant="outlined" fullWidth style={{ marginTop: 4, textTransform: "none" }}
            onClick={() => responder(i18n.t("voiceIvrFlow.nos.falso", "falso"), "false")}>
            {i18n.t("voiceIvrFlow.nos.falso", "falso")}
          </Button>
        </div>
      )}
    </div>
  );
}
