/**
 * URAS PRONTAS.
 *
 * Começar do zero numa tela em branco é a parte mais difícil: dá para montar
 * uma URA errada sem perceber (menu sem saída, transferência sem fila). Estes
 * modelos saem prontos e corretos — é só trocar os textos e escolher a fila.
 *
 * O formato é o MESMO que o editor usa e que o serviço de chamadas executa:
 * `nodes` + `edges` + `startNodeId`, com a posição de cada passo dentro de
 * `data` (`_x`, `_y`). Nenhum tratamento especial no caminho.
 *
 * As frases de cada opção (`synonyms`) importam: o cliente fala "boleto", não
 * "opção dois". O executor casa a fala contra a chave, o rótulo e essas
 * frases (ver flowexec.go), inclusive com erro de pronúncia ou de
 * transcrição.
 */
import { i18n } from "../../translate/i18n";

const no = (id, type, x, y, data) => ({ id, type, data: { ...data, _x: x, _y: y } });
const liga = (de, para, handle = "") => ({
  id: `${de}-${para}-${handle || "out"}`,
  source: de,
  target: para,
  sourceHandle: handle,
});

const t = (chave, padrao) => i18n.t(chave, padrao);

/** 1. Recepção: saudação, menu de três opções, transfere ou encerra. */
const recepcao = () => ({
  kind: "voice",
  startNodeId: "ola",
  startX: 40,
  startY: 180,
  nodes: [
    no("ola", "message", 300, 180, {
      prompt: t("voiceIvrFlow.modelos.recepcao.ola",
        "Olá! Você ligou para a nossa empresa. Já vou te ajudar."),
    }),
    no("menu", "voice_menu", 600, 180, {
      timeout: 8,
      prompt: t("voiceIvrFlow.modelos.recepcao.menu",
        "Diga ou digite: um para falar com um atendente, dois para o financeiro, ou três para encerrar."),
      options: [
        { key: "1", label: t("voiceIvrFlow.modelos.recepcao.op1", "Atendente"),
          synonyms: ["atendente", "humano", "pessoa", "operador", "falar com alguem"] },
        { key: "2", label: t("voiceIvrFlow.modelos.recepcao.op2", "Financeiro"),
          synonyms: ["financeiro", "boleto", "pagamento", "fatura", "segunda via"] },
        { key: "3", label: t("voiceIvrFlow.modelos.recepcao.op3", "Encerrar"),
          synonyms: ["encerrar", "sair", "tchau", "obrigado", "nada"] },
      ],
    }),
    no("paraAtendente", "transfer", 960, 60, {
      queueId: "", userId: "",
      prompt: t("voiceIvrFlow.modelos.recepcao.transferindo", "Certo, vou te transferir. Um momento."),
    }),
    no("paraFinanceiro", "transfer", 960, 220, {
      queueId: "", userId: "",
      prompt: t("voiceIvrFlow.modelos.recepcao.transferindoFin", "Vou te passar para o financeiro. Um momento."),
    }),
    no("fim", "end", 960, 390, {
      mode: "hangup",
      finalText: t("voiceIvrFlow.modelos.recepcao.tchau", "Obrigado por ligar. Até logo!"),
    }),
  ],
  edges: [
    liga("ola", "menu"),
    liga("menu", "paraAtendente", "1"),
    liga("menu", "paraFinanceiro", "2"),
    liga("menu", "fim", "3"),
  ],
});

/** 2. Fora do horário: avisa e encerra. */
const foraDoHorario = () => ({
  kind: "voice",
  startNodeId: "aviso",
  startX: 40,
  startY: 140,
  nodes: [
    no("aviso", "message", 300, 140, {
      prompt: t("voiceIvrFlow.modelos.fora.aviso",
        "Olá! No momento estamos fora do horário de atendimento. Funcionamos de segunda a sexta, das nove às dezoito horas."),
    }),
    no("recado", "message", 600, 140, {
      prompt: t("voiceIvrFlow.modelos.fora.recado",
        "Se preferir, mande uma mensagem neste mesmo número que respondemos assim que abrirmos."),
    }),
    no("fim", "end", 900, 140, {
      mode: "hangup",
      finalText: t("voiceIvrFlow.modelos.fora.tchau", "Obrigado pela ligação. Até breve!"),
    }),
  ],
  edges: [liga("aviso", "recado"), liga("recado", "fim")],
});

/** 3. Identifica o cliente pelo CPF e encaminha. */
const porCpf = () => ({
  kind: "voice",
  startNodeId: "ola",
  startX: 40,
  startY: 200,
  nodes: [
    no("ola", "message", 280, 200, {
      prompt: t("voiceIvrFlow.modelos.cpf.ola", "Olá! Para agilizar, preciso te identificar."),
    }),
    no("cpf", "dtmf_capture", 560, 200, {
      maxDigits: 11,
      timeout: 20,
      saveAs: "cpf",
      prompt: t("voiceIvrFlow.modelos.cpf.peca",
        "Digite o seu CPF, apenas números, e aguarde."),
    }),
    no("confere", "condition", 860, 200, {
      variable: "cpf",
      operator: "not_empty",
      value: "",
    }),
    no("ok", "transfer", 1160, 90, {
      queueId: "", userId: "",
      prompt: t("voiceIvrFlow.modelos.cpf.ok", "Obrigado! Vou te transferir para um atendente."),
    }),
    no("semCpf", "message", 1160, 320, {
      prompt: t("voiceIvrFlow.modelos.cpf.semCpf",
        "Não consegui identificar o seu CPF. Vou te passar para um atendente mesmo assim."),
    }),
    no("ajuda", "transfer", 1460, 320, {
      queueId: "", userId: "",
      prompt: "",
    }),
  ],
  edges: [
    liga("ola", "cpf"),
    liga("cpf", "confere"),
    liga("confere", "ok", "true"),
    liga("confere", "semCpf", "false"),
    liga("semCpf", "ajuda"),
  ],
});

/** 4. Pesquisa rápida: pergunta, ouve a resposta e agradece. */
const pesquisa = () => ({
  kind: "voice",
  startNodeId: "ola",
  startX: 40,
  startY: 160,
  nodes: [
    no("ola", "message", 300, 160, {
      prompt: t("voiceIvrFlow.modelos.pesquisa.ola",
        "Olá! Podemos fazer uma pergunta rápida sobre o seu último atendimento?"),
    }),
    no("nota", "dtmf_capture", 600, 160, {
      maxDigits: 1,
      timeout: 10,
      saveAs: "nota",
      prompt: t("voiceIvrFlow.modelos.pesquisa.nota",
        "De zero a nove, que nota você dá para o nosso atendimento? Digite a nota."),
    }),
    no("comentario", "record_audio", 900, 160, {
      seconds: 20,
      saveAs: "comentario",
    }),
    no("fim", "end", 1200, 160, {
      mode: "hangup",
      finalText: t("voiceIvrFlow.modelos.pesquisa.tchau",
        "Obrigado pela sua resposta! Ela ajuda muito. Até logo."),
    }),
  ],
  edges: [liga("ola", "nota"), liga("nota", "comentario"), liga("comentario", "fim")],
});

/** 5. Recepção + WhatsApp: avisa por mensagem e transfere. */
const comWhatsapp = () => ({
  kind: "voice",
  startNodeId: "ola",
  startX: 40,
  startY: 160,
  nodes: [
    no("ola", "message", 300, 160, {
      prompt: t("voiceIvrFlow.modelos.whats.ola",
        "Olá! Obrigado por ligar. Vou te enviar uma mensagem no WhatsApp com os nossos canais."),
    }),
    no("zap", "whatsapp_send", 600, 160, {
      to: "",
      msgKind: "text",
      template: t("voiceIvrFlow.modelos.whats.msg",
        "Olá! Recebemos a sua ligação. Em instantes um atendente fala com você por aqui."),
    }),
    no("passa", "transfer", 900, 160, {
      queueId: "", userId: "",
      prompt: t("voiceIvrFlow.modelos.whats.transferindo", "Vou te transferir para um atendente. Um momento."),
    }),
  ],
  edges: [liga("ola", "zap"), liga("zap", "passa")],
});

/** 6. Registrar a ligação num sistema seu (webhook) e seguir. */
const comWebhook = () => ({
  kind: "voice",
  startNodeId: "registra",
  startX: 40,
  startY: 160,
  nodes: [
    no("registra", "webhook", 300, 160, {
      url: "https://",
      method: "POST",
      body: '{"telefone": "{{.call.from}}", "origem": "ura"}',
      saveAs: "retorno",
    }),
    no("ola", "message", 600, 160, {
      prompt: t("voiceIvrFlow.modelos.hook.ola", "Olá! Já registramos a sua ligação. Vou te transferir."),
    }),
    no("passa", "transfer", 900, 160, {
      queueId: "", userId: "",
      prompt: "",
    }),
  ],
  edges: [liga("registra", "ola"), liga("ola", "passa")],
});

/**
 * A lista é função, e não constante: como constante, o i18n rodaria no
 * momento do import — antes de o idioma estar escolhido — e os textos
 * ficariam presos no primeiro idioma carregado.
 */
/**
 * Uma URA criada a partir de um modelo pronto recebe o nome do modelo no
 * idioma de quem criou ("Recepção com menu"). Se o nome ainda for exatamente
 * o de um modelo, em qualquer idioma, mostra no idioma atual.
 */
const IDS_MODELOS = ["recepcao", "fora", "cpf", "pesquisa", "whats", "hook"];
export const nomeDeUraTraduzido = (nome) => {
  const atual = String(nome || "").trim();
  if (!atual) return nome;
  for (const id of IDS_MODELOS) {
    const chave = `voiceIvrFlow.modelos.${id}.nome`;
    for (const lng of ["pt", "en", "es"]) {
      if (i18n.t(chave, { lng }) === atual) return i18n.t(chave);
    }
  }
  return nome;
};

export const modelos = () => [
  {
    id: "recepcao",
    nome: t("voiceIvrFlow.modelos.recepcao.nome", "Recepção com menu"),
    resumo: t("voiceIvrFlow.modelos.recepcao.resumo",
      "Saúda, oferece atendente, financeiro ou encerrar, e transfere."),
    grafo: recepcao,
  },
  {
    id: "fora",
    nome: t("voiceIvrFlow.modelos.fora.nome", "Fora do horário"),
    resumo: t("voiceIvrFlow.modelos.fora.resumo",
      "Avisa o horário de atendimento, pede uma mensagem e encerra."),
    grafo: foraDoHorario,
  },
  {
    id: "cpf",
    nome: t("voiceIvrFlow.modelos.cpf.nome", "Identificação por CPF"),
    resumo: t("voiceIvrFlow.modelos.cpf.resumo",
      "Pede o CPF pelo teclado e encaminha conforme o cliente for identificado."),
    grafo: porCpf,
  },
  {
    id: "pesquisa",
    nome: t("voiceIvrFlow.modelos.pesquisa.nome", "Pesquisa de satisfação"),
    resumo: t("voiceIvrFlow.modelos.pesquisa.resumo",
      "Pede uma nota pelo teclado, grava um comentário e agradece."),
    grafo: pesquisa,
  },
  {
    id: "whats",
    nome: t("voiceIvrFlow.modelos.whats.nome", "Recepção + aviso por WhatsApp"),
    resumo: t("voiceIvrFlow.modelos.whats.resumo",
      "Fala com o cliente, manda uma mensagem no WhatsApp dele e transfere."),
    grafo: comWhatsapp,
  },
  {
    id: "hook",
    nome: t("voiceIvrFlow.modelos.hook.nome", "Registrar ligação em outro sistema"),
    resumo: t("voiceIvrFlow.modelos.hook.resumo",
      "Avisa o seu sistema (CRM, planilha, n8n) por webhook e transfere."),
    grafo: comWebhook,
  },
];
