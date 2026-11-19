/**
 * CONVERSÃO ENTRE O CANVAS E O FORMATO QUE O SERVIÇO DE CHAMADAS EXECUTA.
 *
 * O formato do serviço (ver flowexec.go) já é `nodes` + `edges` +
 * `startNodeId` — quase o mesmo do canvas. As duas diferenças que importam:
 *
 *  1. O servidor NÃO guarda posição de nó. Se a posição não fosse junto, toda
 *     URA reabriria com os nós empilhados no mesmo canto. Vai dentro de
 *     `data` (`_x`, `_y`): o executor ignora chave que não conhece.
 *
 *  2. O "começa aqui" é um nó no canvas, mas no servidor é só o campo
 *     `startNodeId`. Ele é criado na leitura e desfeito na gravação — se
 *     fosse salvo como nó, o executor tentaria executá-lo e pararia no
 *     primeiro passo, porque não existe esse tipo lá.
 *
 * Funções puras de propósito: é isto que quebra calado quando se mexe no
 * editor, então é isto que os testes rodam.
 */

export const ID_INICIO = "__inicio__";

const num = (v, padrao) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : padrao;
};

/** Formato do servidor -> canvas. */
export function paraCanvas(grafo) {
  const g = grafo || {};
  const nosServidor = Array.isArray(g.nodes) ? g.nodes : [];
  const arestas = Array.isArray(g.edges) ? g.edges : [];

  // Nós em grade quando a URA vem de fora (importada, ou criada antes do
  // editor visual existir): sem posição, todos cairiam em 0,0.
  const nos = nosServidor.map((n, i) => {
    const data = { ...(n.data || {}) };
    const x = num(data._x, 320 + (i % 3) * 280);
    const y = num(data._y, 60 + Math.floor(i / 3) * 190);
    delete data._x;
    delete data._y;
    return { id: n.id, type: n.type, position: { x, y }, data };
  });

  const noInicio = {
    id: ID_INICIO,
    type: "start",
    position: { x: num(g.startX, 40), y: num(g.startY, 60) },
    data: {},
    deletable: false,
  };

  const arestasCanvas = arestas.map((e, i) => ({
    id: e.id || `e${i}`,
    source: e.source,
    target: e.target,
    sourceHandle: e.sourceHandle || "out",
  }));

  // A seta do "começa aqui" existe só no canvas.
  if (g.startNodeId && nos.some((n) => n.id === g.startNodeId)) {
    arestasCanvas.unshift({
      id: "e-inicio",
      source: ID_INICIO,
      target: g.startNodeId,
      sourceHandle: "out",
    });
  }

  return { nos: [noInicio, ...nos], arestas: arestasCanvas };
}

/** Canvas -> formato do servidor. */
export function paraServidor(nos, arestas, voz) {
  const lista = Array.isArray(nos) ? nos : [];
  const links = Array.isArray(arestas) ? arestas : [];

  const inicio = lista.find((n) => n.id === ID_INICIO);
  const ligacaoDoInicio = links.find((e) => e.source === ID_INICIO);

  const nodes = lista
    .filter((n) => n.id !== ID_INICIO)
    .map((n) => ({
      id: n.id,
      type: n.type,
      data: {
        ...(n.data || {}),
        _x: Math.round(n.position?.x || 0),
        _y: Math.round(n.position?.y || 0),
      },
    }));

  // Campos que só servem para desenhar não vão para o servidor: eles não
  // significam nada lá e só engordariam o fluxo.
  for (const n of nodes) {
    delete n.data.aoApagar;
    delete n.data.aoDuplicar;
    delete n.data.nomeDoDestino;
  }

  const edges = links
    .filter((e) => e.source !== ID_INICIO)
    .map((e, i) => ({
      id: e.id || `e${i}`,
      source: e.source,
      target: e.target,
      sourceHandle: e.sourceHandle && e.sourceHandle !== "out" ? e.sourceHandle : "",
    }));

  return {
    kind: "voice",
    startNodeId: ligacaoDoInicio ? ligacaoDoInicio.target : "",
    startX: Math.round(inicio?.position?.x || 40),
    startY: Math.round(inicio?.position?.y || 60),
    nodes,
    edges,
    ...(voz ? { voice: voz } : {}),
  };
}

/**
 * Problemas que fazem a URA parar no meio da ligação. Cada um é uma coisa que
 * o executor não consegue resolver sozinho, e que o usuário não descobriria
 * até um cliente real ligar.
 */
export function problemas(nos, arestas, t) {
  // `t` e a funcao de traducao, recebida de fora: assim este arquivo continua
  // sem depender do i18n e pode ser testado sozinho.
  const txt = typeof t === "function" ? t : (_chave, padrao) => padrao;
  const lista = (nos || []).filter((n) => n.id !== ID_INICIO);
  const links = arestas || [];
  const achados = [];

  if (!links.some((e) => e.source === ID_INICIO)) {
    achados.push(txt("voiceIvrFlow.avisos.semInicio", "Ligue o “A ligação começa aqui” no primeiro passo — sem isso a URA não tem por onde começar."));
  }
  if (lista.length === 0) {
    achados.push(txt("voiceIvrFlow.avisos.vazia", "A URA está vazia: arraste pelo menos um passo para a tela."));
  }

  const temSaida = (id, handle) =>
    links.some((e) => e.source === id && (handle ? e.sourceHandle === handle : true));

  for (const n of lista) {
    const rotulo = n.data?.prompt || n.data?.finalText || n.type;
    if (n.type === "voice_menu") {
      const opcoes = Array.isArray(n.data?.options) ? n.data.options : [];
      if (opcoes.length === 0) {
        achados.push(txt("voiceIvrFlow.avisos.menuSemOpcao", "O menu “{x}” não tem nenhuma opção.").replace("{x}", rotulo));
      }
      for (const o of opcoes) {
        if (!temSaida(n.id, o.key)) {
          achados.push(txt("voiceIvrFlow.avisos.opcaoSolta", "No menu “{x}”, a opção {y} não leva a lugar nenhum.").replace("{x}", rotulo).replace("{y}", o.key));
        }
      }
    } else if (n.type === "condition") {
      for (const lado of ["true", "false"]) {
        if (!temSaida(n.id, lado)) {
          achados.push(txt("voiceIvrFlow.avisos.condicaoSemSaida", "A condição “{x}” não tem saída para o caso {y}.").replace("{x}", rotulo).replace("{y}", lado === "true" ? txt("voiceIvrFlow.nos.verdadeiro", "verdadeiro") : txt("voiceIvrFlow.nos.falso", "falso")));
        }
      }
    } else if (n.type !== "end" && n.type !== "transfer") {
      if (!temSaida(n.id)) {
        achados.push(txt("voiceIvrFlow.avisos.passoSemSaida", "O passo “{x}” não leva a lugar nenhum: a ligação para aí.").replace("{x}", rotulo));
      }
    }
    if (n.type === "webhook" && !/^https?:\/\/\S+/i.test(String(n.data?.url || "").trim())) {
      achados.push(txt("voiceIvrFlow.avisos.webhookSemUrl", "Há um webhook sem endereço (URL) válido."));
    }
    if (n.type === "whatsapp_send" && !String(n.data?.template || "").trim()) {
      achados.push(txt("voiceIvrFlow.avisos.whatsappSemTexto", "Há um “Enviar WhatsApp” sem mensagem."));
    }
    if (n.type === "whatsapp_media" && !/^(https?:\/\/|\/api\/media\/)\S+/i.test(String(n.data?.mediaUrl || "").trim())) {
      achados.push(txt("voiceIvrFlow.avisos.midiaSemUrl", "Há um “Enviar arquivo” sem endereço (URL) do arquivo."));
    }
    if (n.type === "set_variable" && !String(n.data?.variable || "").trim()) {
      achados.push(txt("voiceIvrFlow.avisos.variavelSemNome", "Há um “Definir variável” sem nome."));
    }
    if (n.type === "transfer" && !n.data?.queueId && !n.data?.userId) {
      achados.push(
        n.data?.target === "wallet"
          ? txt("voiceIvrFlow.carteira.semReserva", "Transferência para a carteira sem fila de reserva: se ninguém atender, a ligação fica sem destino.")
          : txt("voiceIvrFlow.avisos.transferSemDestino", "Há uma transferência sem fila nem operador escolhido.")
      );
    }
  }

  // Nó que ninguém alcança: fica no desenho mas nunca roda.
  const alcancados = new Set();
  const inicioAlvo = links.find((e) => e.source === ID_INICIO)?.target;
  const fila = inicioAlvo ? [inicioAlvo] : [];
  while (fila.length) {
    const atual = fila.shift();
    if (alcancados.has(atual)) continue;
    alcancados.add(atual);
    for (const e of links) if (e.source === atual) fila.push(e.target);
  }
  for (const n of lista) {
    if (!alcancados.has(n.id)) {
      achados.push(txt("voiceIvrFlow.avisos.inalcancavel", "O passo “{x}” não é alcançado por nenhum caminho.").replace("{x}", n.data?.prompt || n.type));
    }
  }

  return achados;
}
