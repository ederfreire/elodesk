/**
 * NÓS DA URA DE VOZ para o canvas.
 *
 * Cada nó aqui corresponde a um tipo que o executor do serviço de chamadas
 * sabe rodar (ver flowexec.go). Os nomes dos campos em `data` NÃO são
 * livres: são exatamente as chaves que o Go lê durante a ligação. Trocar um
 * nome aqui não dá erro em lugar nenhum — a URA só deixa de fazer aquilo.
 */
import React, { memo } from "react";
import { Handle } from "react-flow-renderer";
import { i18n } from "../../translate/i18n";
import Delete from "@mui/icons-material/Delete";
import ContentCopy from "@mui/icons-material/ContentCopy";
import RecordVoiceOver from "@mui/icons-material/RecordVoiceOver";
import Dialpad from "@mui/icons-material/Dialpad";
import Hearing from "@mui/icons-material/Hearing";
import PhoneForwarded from "@mui/icons-material/PhoneForwarded";
import CallSplit from "@mui/icons-material/CallSplit";
import AccessTime from "@mui/icons-material/AccessTime";
import CallEnd from "@mui/icons-material/CallEnd";
import PlayCircleFilled from "@mui/icons-material/PlayCircleFilled";
import ListAlt from "@mui/icons-material/ListAlt";
import Http from "@mui/icons-material/Http";
import WhatsApp from "@mui/icons-material/WhatsApp";
import Image from "@mui/icons-material/Image";
import DataObject from "@mui/icons-material/DataObject";

const CORES = {
  start: "#2e7d32",
  message: "#455a64",
  voice_menu: "#5e35b1",
  dtmf_capture: "#00695c",
  record_audio: "#0277bd",
  transfer: "#ef6c00",
  condition: "#6d4c41",
  delay: "#546e7a",
  end: "#c62828",
  // Automações: o que a URA faz por fora da conversa.
  webhook: "#1565c0",
  whatsapp_send: "#2e7d32",
  whatsapp_media: "#388e3c",
  set_variable: "#7b1fa2",
};

const ENTRADA = { background: "#fff", border: "2px solid #90a4ae", width: 12, height: 12, left: -7 };
const SAIDA = { background: "#fff", border: "2px solid #90a4ae", width: 12, height: 12, right: -7 };

function Cabecalho({ Icone, titulo, id, aoApagar, aoDuplicar, podeApagar = true }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
      <Icone sx={{ width: 16, height: 16, color: "#fff" }} />
      <span style={{ color: "#fff", fontSize: 13, fontWeight: 700, flex: 1 }}>{titulo}</span>
      {podeApagar && (
        <>
          <ContentCopy
            onClick={(e) => { e.stopPropagation(); aoDuplicar(id); }}
            sx={{ width: 13, height: 13, color: "#fff", opacity: 0.75, cursor: "pointer" }}
          />
          <Delete
            onClick={(e) => { e.stopPropagation(); aoApagar(id); }}
            sx={{ width: 13, height: 13, color: "#fff", opacity: 0.75, cursor: "pointer" }}
          />
        </>
      )}
    </div>
  );
}

function Caixa({ tipo, children }) {
  return (
    <div
      style={{
        background: CORES[tipo],
        borderRadius: 10,
        padding: "8px 10px",
        width: 210,
        boxShadow: "0 2px 6px rgba(0,0,0,.25)",
      }}
    >
      {children}
    </div>
  );
}

const Resumo = ({ children }) => (
  <div style={{ color: "#eceff1", fontSize: 11, lineHeight: 1.35, wordBreak: "break-word" }}>
    {children}
  </div>
);

const vazio = (txt, padrao) =>
  String(txt || "").trim() ? String(txt).trim() : <i style={{ opacity: 0.65 }}>{padrao}</i>;

/** Início: não é um nó do fluxo salvo — ele só aponta por onde a ligação começa. */
export const NoInicio = memo(({ isConnectable }) => (
  <Caixa tipo="start">
    <Cabecalho Icone={PlayCircleFilled} titulo={i18n.t("voiceIvrFlow.nos.inicio", "A ligação começa aqui")} podeApagar={false} />
    <Resumo>{i18n.t("voiceIvrFlow.nos.inicioAjuda", "Ligue esta saída no primeiro passo.")}</Resumo>
    <Handle type="source" position="right" id="out" style={SAIDA} isConnectable={isConnectable} />
  </Caixa>
));

export const NoFalar = memo(({ data, id, isConnectable }) => (
  <Caixa tipo="message">
    <Handle type="target" position="left" style={ENTRADA} isConnectable={isConnectable} />
    <Cabecalho Icone={RecordVoiceOver} titulo={i18n.t("voiceIvrFlow.nos.falar", "Falar")} id={id} aoApagar={data.aoApagar} aoDuplicar={data.aoDuplicar} />
    <Resumo>{vazio(data.prompt, i18n.t("voiceIvrFlow.nos.semTexto", "sem texto"))}</Resumo>
    <Handle type="source" position="right" id="out" style={SAIDA} isConnectable={isConnectable} />
  </Caixa>
));

/** Menu falado: cada opção vira uma saída própria. A aresta carrega a chave. */
export const NoMenu = memo(({ data, id, isConnectable }) => {
  const opcoes = Array.isArray(data.options) ? data.options : [];
  return (
    <Caixa tipo="voice_menu">
      <Handle type="target" position="left" style={ENTRADA} isConnectable={isConnectable} />
      <Cabecalho Icone={ListAlt} titulo={i18n.t("voiceIvrFlow.nos.menu", "Menu falado")} id={id} aoApagar={data.aoApagar} aoDuplicar={data.aoDuplicar} />
      <Resumo>{vazio(data.prompt, i18n.t("voiceIvrFlow.nos.semPergunta", "sem pergunta"))}</Resumo>
      <div style={{ marginTop: 6 }}>
        {opcoes.length === 0 && <Resumo><i style={{ opacity: 0.65 }}>{i18n.t("voiceIvrFlow.nos.semOpcoes", "sem opções")}</i></Resumo>}
        {opcoes.map((o, i) => (
          <div
            key={o.key || i}
            style={{
              position: "relative",
              color: "#fff",
              fontSize: 11,
              background: "rgba(255,255,255,.14)",
              borderRadius: 6,
              padding: "3px 8px",
              marginTop: 3,
            }}
          >
            <b>{o.key}</b> {o.label}
            <Handle
              type="source"
              position="right"
              id={o.key}
              style={{ ...SAIDA, top: "50%", right: -17 }}
              isConnectable={isConnectable}
            />
          </div>
        ))}
      </div>
    </Caixa>
  );
});

export const NoTecla = memo(({ data, id, isConnectable }) => (
  <Caixa tipo="dtmf_capture">
    <Handle type="target" position="left" style={ENTRADA} isConnectable={isConnectable} />
    <Cabecalho Icone={Dialpad} titulo={i18n.t("voiceIvrFlow.nos.tecla", "Capturar tecla")} id={id} aoApagar={data.aoApagar} aoDuplicar={data.aoDuplicar} />
    <Resumo>
      {vazio(data.prompt, i18n.t("voiceIvrFlow.nos.semPergunta", "sem pergunta"))}
      <br />
      {`${data.maxDigits || 1} ${i18n.t("voiceIvrFlow.nos.digitos", "dígito(s)")} → `}
      <b>{data.saveAs || "—"}</b>
    </Resumo>
    <Handle type="source" position="right" id="out" style={SAIDA} isConnectable={isConnectable} />
  </Caixa>
));

export const NoOuvir = memo(({ data, id, isConnectable }) => (
  <Caixa tipo="record_audio">
    <Handle type="target" position="left" style={ENTRADA} isConnectable={isConnectable} />
    <Cabecalho Icone={Hearing} titulo={i18n.t("voiceIvrFlow.nos.ouvir", "Ouvir o cliente")} id={id} aoApagar={data.aoApagar} aoDuplicar={data.aoDuplicar} />
    <Resumo>
      {`${i18n.t("voiceIvrFlow.nos.ate", "até")} ${data.seconds || 10}s → `}
      <b>{data.saveAs || "—"}</b>
    </Resumo>
    <Handle type="source" position="right" id="out" style={SAIDA} isConnectable={isConnectable} />
  </Caixa>
));

export const NoTransferir = memo(({ data, id, isConnectable }) => (
  <Caixa tipo="transfer">
    <Handle type="target" position="left" style={ENTRADA} isConnectable={isConnectable} />
    <Cabecalho Icone={PhoneForwarded} titulo={i18n.t("voiceIvrFlow.nos.transferir", "Transferir")} id={id} aoApagar={data.aoApagar} aoDuplicar={data.aoDuplicar} />
    <Resumo>
      {data.nomeDoDestino ? <b>{data.nomeDoDestino}</b> : <i style={{ opacity: 0.65 }}>{i18n.t("voiceIvrFlow.nos.semDestino", "escolha a fila ou o operador")}</i>}
      {data.prompt ? <><br />{data.prompt}</> : null}
    </Resumo>
  </Caixa>
));

export const NoCondicao = memo(({ data, id, isConnectable }) => (
  <Caixa tipo="condition">
    <Handle type="target" position="left" style={ENTRADA} isConnectable={isConnectable} />
    <Cabecalho Icone={CallSplit} titulo={i18n.t("voiceIvrFlow.nos.se", "Se...")} id={id} aoApagar={data.aoApagar} aoDuplicar={data.aoDuplicar} />
    <Resumo>
      {vazio(data.variable, i18n.t("voiceIvrFlow.variavel", "variável"))} {data.operator || "="} {vazio(data.value, i18n.t("voiceIvrFlow.valor", "valor"))}
    </Resumo>
    <div style={{ position: "relative", marginTop: 6 }}>
      <div style={{ color: "#fff", fontSize: 11, textAlign: "right" }}>{i18n.t("voiceIvrFlow.nos.verdadeiro", "verdadeiro")}</div>
      <Handle type="source" position="right" id="true" style={{ ...SAIDA, top: 8 }} isConnectable={isConnectable} />
      <div style={{ color: "#fff", fontSize: 11, textAlign: "right" }}>{i18n.t("voiceIvrFlow.nos.falso", "falso")}</div>
      <Handle type="source" position="right" id="false" style={{ ...SAIDA, top: 28 }} isConnectable={isConnectable} />
    </div>
  </Caixa>
));

export const NoEsperar = memo(({ data, id, isConnectable }) => (
  <Caixa tipo="delay">
    <Handle type="target" position="left" style={ENTRADA} isConnectable={isConnectable} />
    <Cabecalho Icone={AccessTime} titulo={i18n.t("voiceIvrFlow.nos.esperar", "Esperar")} id={id} aoApagar={data.aoApagar} aoDuplicar={data.aoDuplicar} />
    <Resumo>{data.seconds || 1}s</Resumo>
    <Handle type="source" position="right" id="out" style={SAIDA} isConnectable={isConnectable} />
  </Caixa>
));

export const NoEncerrar = memo(({ data, id, isConnectable }) => (
  <Caixa tipo="end">
    <Handle type="target" position="left" style={ENTRADA} isConnectable={isConnectable} />
    <Cabecalho Icone={CallEnd} titulo={i18n.t("voiceIvrFlow.nos.encerrar", "Encerrar")} id={id} aoApagar={data.aoApagar} aoDuplicar={data.aoDuplicar} />
    <Resumo>{vazio(data.finalText, i18n.t("voiceIvrFlow.nos.semDespedida", "desliga sem despedida"))}</Resumo>
  </Caixa>
));

/** AUTOMAÇÕES — passos que não falam: chamam outro sistema ou mandam WhatsApp. */
export const NoWebhook = memo(({ data, id, isConnectable }) => (
  <Caixa tipo="webhook">
    <Handle type="target" position="left" style={ENTRADA} isConnectable={isConnectable} />
    <Cabecalho Icone={Http} titulo={i18n.t("voiceIvrFlow.nos.webhook", "Webhook")} id={id} aoApagar={data.aoApagar} aoDuplicar={data.aoDuplicar} />
    <Resumo>
      <b>{data.method || "POST"}</b>{" "}
      {vazio(data.url, i18n.t("voiceIvrFlow.nos.semUrl", "sem endereço"))}
      {data.saveAs ? <><br />→ <b>{data.saveAs}</b></> : null}
    </Resumo>
    <Handle type="source" position="right" id="out" style={SAIDA} isConnectable={isConnectable} />
  </Caixa>
));

export const NoWhatsapp = memo(({ data, id, isConnectable }) => (
  <Caixa tipo="whatsapp_send">
    <Handle type="target" position="left" style={ENTRADA} isConnectable={isConnectable} />
    <Cabecalho Icone={WhatsApp} titulo={i18n.t("voiceIvrFlow.nos.whatsapp", "Enviar WhatsApp")} id={id} aoApagar={data.aoApagar} aoDuplicar={data.aoDuplicar} />
    <Resumo>{vazio(data.template, i18n.t("voiceIvrFlow.nos.semMensagem", "sem mensagem"))}</Resumo>
    <Handle type="source" position="right" id="out" style={SAIDA} isConnectable={isConnectable} />
  </Caixa>
));

export const NoMidia = memo(({ data, id, isConnectable }) => (
  <Caixa tipo="whatsapp_media">
    <Handle type="target" position="left" style={ENTRADA} isConnectable={isConnectable} />
    <Cabecalho Icone={Image} titulo={i18n.t("voiceIvrFlow.nos.midia", "Enviar arquivo")} id={id} aoApagar={data.aoApagar} aoDuplicar={data.aoDuplicar} />
    <Resumo>
      <b>{data.mediaKind || "image"}</b>{" "}
      {vazio(data.mediaUrl, i18n.t("voiceIvrFlow.nos.semUrl", "sem endereço"))}
    </Resumo>
    <Handle type="source" position="right" id="out" style={SAIDA} isConnectable={isConnectable} />
  </Caixa>
));

export const NoVariavel = memo(({ data, id, isConnectable }) => (
  <Caixa tipo="set_variable">
    <Handle type="target" position="left" style={ENTRADA} isConnectable={isConnectable} />
    <Cabecalho Icone={DataObject} titulo={i18n.t("voiceIvrFlow.nos.variavel", "Definir variável")} id={id} aoApagar={data.aoApagar} aoDuplicar={data.aoDuplicar} />
    <Resumo>
      <b>{data.variable || "—"}</b> = {vazio(data.value, "")}
    </Resumo>
    <Handle type="source" position="right" id="out" style={SAIDA} isConnectable={isConnectable} />
  </Caixa>
));

export const tiposDeNo = {
  start: NoInicio,
  message: NoFalar,
  voice_menu: NoMenu,
  dtmf_capture: NoTecla,
  record_audio: NoOuvir,
  transfer: NoTransferir,
  condition: NoCondicao,
  delay: NoEsperar,
  end: NoEncerrar,
  webhook: NoWebhook,
  whatsapp_send: NoWhatsapp,
  whatsapp_media: NoMidia,
  set_variable: NoVariavel,
};

/** Paleta: o que o usuário pode arrastar para o canvas.
 *  É função, e não constante: como constante, o i18n rodaria no momento do
 *  import — antes de o idioma estar escolhido — e os rótulos ficariam presos
 *  no primeiro idioma carregado. */
export const paleta = () => [
  { tipo: "message", titulo: i18n.t("voiceIvrFlow.nos.falar", "Falar"), icone: RecordVoiceOver, cor: CORES.message,
    padrao: { prompt: "" } },
  { tipo: "voice_menu", titulo: i18n.t("voiceIvrFlow.nos.menu", "Menu falado"), icone: ListAlt, cor: CORES.voice_menu,
    padrao: { prompt: "", timeout: 8, options: [{ key: "1", label: "" }] } },
  { tipo: "dtmf_capture", titulo: i18n.t("voiceIvrFlow.nos.tecla", "Capturar tecla"), icone: Dialpad, cor: CORES.dtmf_capture,
    padrao: { prompt: "", maxDigits: 1, timeout: 8, saveAs: "tecla" } },
  { tipo: "record_audio", titulo: i18n.t("voiceIvrFlow.nos.ouvir", "Ouvir o cliente"), icone: Hearing, cor: CORES.record_audio,
    padrao: { seconds: 10, saveAs: "resposta" } },
  { tipo: "transfer", titulo: i18n.t("voiceIvrFlow.nos.transferir", "Transferir"), icone: PhoneForwarded, cor: CORES.transfer,
    padrao: { queueId: "", userId: "", prompt: "" } },
  { tipo: "condition", titulo: i18n.t("voiceIvrFlow.nos.se", "Se..."), icone: CallSplit, cor: CORES.condition,
    padrao: { variable: "", operator: "eq", value: "" } },
  { tipo: "delay", titulo: i18n.t("voiceIvrFlow.nos.esperar", "Esperar"), icone: AccessTime, cor: CORES.delay,
    padrao: { seconds: 2 } },
  { tipo: "end", titulo: i18n.t("voiceIvrFlow.nos.encerrar", "Encerrar"), icone: CallEnd, cor: CORES.end,
    padrao: { mode: "hangup", finalText: "" } },
  // ---- Automações ----
  { grupo: "automacoes", tipo: "webhook", titulo: i18n.t("voiceIvrFlow.nos.webhook", "Webhook"), icone: Http, cor: CORES.webhook,
    padrao: { url: "https://", method: "POST", body: "{}", saveAs: "" } },
  { grupo: "automacoes", tipo: "whatsapp_send", titulo: i18n.t("voiceIvrFlow.nos.whatsapp", "Enviar WhatsApp"), icone: WhatsApp, cor: CORES.whatsapp_send,
    padrao: { to: "", template: "", msgKind: "text" } },
  { grupo: "automacoes", tipo: "whatsapp_media", titulo: i18n.t("voiceIvrFlow.nos.midia", "Enviar arquivo"), icone: Image, cor: CORES.whatsapp_media,
    padrao: { to: "", mediaKind: "image", mediaUrl: "", caption: "", filename: "" } },
  { grupo: "automacoes", tipo: "set_variable", titulo: i18n.t("voiceIvrFlow.nos.variavel", "Definir variável"), icone: DataObject, cor: CORES.set_variable,
    padrao: { variable: "", value: "" } },
];
