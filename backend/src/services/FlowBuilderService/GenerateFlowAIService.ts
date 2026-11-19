import Prompt from "../../models/Prompt";
import Queue from "../../models/Queue";
import FlowBuilderModel from "../../models/FlowBuilder";
import AppError from "../../errors/AppError";
import logger from "../../utils/logger";
import { obterClienteIA } from "../../helpers/ControleDeIA";

/**
 * Gera um fluxo do FlowBuilder a partir de uma descricao em linguagem natural.
 *
 * DECISAO CENTRAL: a IA NAO devolve JSON do React Flow.
 * Pedir nodes/edges prontos parece o caminho curto, mas obriga o modelo a
 * acertar coordenadas, ids de handle ("a1", "a2"...), formato de aresta e o
 * shape exato de cada `data` — coisas que ele erra com frequencia e que
 * quebram o editor de um jeito dificil de diagnosticar. Em vez disso ele
 * devolve uma lista de PASSOS simples, e a conversao para React Flow
 * (posicoes, handles, arestas) e feita aqui, em codigo deterministico.
 */

type TipoPasso =
  | "mensagem"
  | "menu"
  | "pergunta"
  | "intervalo"
  | "fila"
  | "encerrar";

interface OpcaoPasso {
  texto: string;
  proximo?: string | null;
}

interface Passo {
  id: string;
  tipo: TipoPasso;
  texto?: string;
  mensagem?: string;
  pergunta?: string;
  variavel?: string;
  segundos?: number;
  fila?: string;
  opcoes?: OpcaoPasso[];
  proximo?: string | null;
}

interface Requisicao {
  companyId: number;
  userId: number;
  categoria: string;
  nome?: string;
  descricao: string;
}

const CATEGORIAS: Record<string, string> = {
  atendimento: "Atendimento ao Cliente",
  vendas: "Vendas / Pre-venda",
  suporte: "Suporte Tecnico",
  qualificacao: "Qualificacao de Leads",
  agendamento: "Agendamento",
  nps: "Pesquisa de Satisfacao (NPS)",
  boasVindas: "Boas-vindas / Menu Inicial",
  cobranca: "Cobranca / Financeiro",
  outro: "Outro"
};

const normalizar = (texto: string): string =>
  String(texto || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .trim()
    .toLowerCase();

const idAleatorio = (tamanho = 30): string => {
  const caracteres =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let saida = "";
  for (let i = 0; i < tamanho; i += 1) {
    saida += caracteres.charAt(Math.floor(Math.random() * caracteres.length));
  }
  return saida;
};

const montarInstrucoes = (filas: string[]): string => `
Voce projeta fluxos de atendimento para WhatsApp.

Responda EXCLUSIVAMENTE com um objeto JSON valido, sem markdown, sem crases,
sem texto antes ou depois. O formato e:

{
  "nome": "titulo curto do fluxo",
  "passos": [ ...  ]
}

Cada passo tem "id" (string curta e unica, ex: "p1") e "tipo". Tipos aceitos:

- {"id","tipo":"mensagem","texto":"...","proximo":"<id ou null>"}
- {"id","tipo":"pergunta","pergunta":"...","variavel":"nome_da_variavel","proximo":"<id ou null>"}
- {"id","tipo":"intervalo","segundos":2,"proximo":"<id ou null>"}
- {"id","tipo":"menu","mensagem":"...","opcoes":[{"texto":"Vendas","proximo":"p3"}]}
- {"id","tipo":"fila","fila":"<nome exato de uma fila existente>","proximo":null}
- {"id","tipo":"encerrar","mensagem":"mensagem de despedida"}

REGRAS OBRIGATORIAS:
1. O primeiro passo do array e o inicio do fluxo.
2. Todo "proximo" aponta para o "id" de outro passo ou e null.
3. Nunca crie ciclos: um passo nunca aponta para si mesmo nem para um anterior.
4. "menu" precisa de 2 a 8 opcoes, cada uma com seu proprio "proximo".
5. Em "variavel" use apenas letras minusculas, numeros e underline.
6. Em "fila" use SOMENTE um destes nomes, copiado exatamente:
${filas.length > 0 ? filas.map(f => `   - ${f}`).join("\n") : "   (nenhuma fila cadastrada: NAO use passos do tipo fila)"}
7. Escreva todos os textos em portugues do Brasil, no tom de uma empresa
   falando com cliente no WhatsApp: curto, direto, sem formalidade excessiva.
8. Entre 4 e 14 passos. Prefira fluxos claros a fluxos longos.
`;

const extrairJson = (bruto: string): any => {
  const limpo = String(bruto || "")
    .replace(/```json/gi, "")
    .replace(/```/g, "")
    .trim();

  const inicio = limpo.indexOf("{");
  const fim = limpo.lastIndexOf("}");
  if (inicio === -1 || fim === -1 || fim <= inicio) {
    throw new AppError("ERR_FLOW_AI_INVALID_JSON", 400);
  }

  return JSON.parse(limpo.slice(inicio, fim + 1));
};

/**
 * Converte a lista de passos em nodes/connections do React Flow.
 *
 * O posicionamento e feito por nivel (BFS a partir do primeiro passo): a
 * profundidade define o X e a ordem dentro do nivel define o Y. Isso garante
 * um desenho legivel sem sobreposicao, que e o que o usuario ve ao abrir o
 * fluxo — um grafo bagunçado passa a impressao de que a geracao falhou mesmo
 * quando a logica esta correta.
 */
const converterParaReactFlow = (
  passos: Passo[],
  filasPorNome: Map<string, Queue>
): { nodes: any[]; connections: any[]; avisos: string[] } => {
  const avisos: string[] = [];

  const porId = new Map<string, Passo>();
  passos.forEach(p => porId.set(String(p.id), p));

  // Passos do tipo "fila" cuja fila nao existe sao descartados, e quem
  // apontava para eles passa a apontar para o destino seguinte. Deixar o no
  // com fila vazia seria pior: o fluxo salva, mas quebra na execucao.
  const descartados = new Set<string>();
  passos.forEach(p => {
    if (p.tipo === "fila") {
      const fila = filasPorNome.get(normalizar(p.fila || ""));
      if (!fila) {
        descartados.add(String(p.id));
        avisos.push(
          `A fila "${p.fila}" nao existe e o passo foi removido do fluxo.`
        );
      }
    }
  });

  const resolver = (alvo?: string | null): string | null => {
    let atual = alvo ? String(alvo) : null;
    const visitados = new Set<string>();
    while (atual && descartados.has(atual)) {
      if (visitados.has(atual)) return null;
      visitados.add(atual);
      atual = porId.get(atual)?.proximo
        ? String(porId.get(atual)?.proximo)
        : null;
    }
    return atual && porId.has(atual) ? atual : null;
  };

  const ativos = passos.filter(p => !descartados.has(String(p.id)));
  if (ativos.length === 0) {
    throw new AppError("ERR_FLOW_AI_EMPTY", 400);
  }

  // ── ids do React Flow ────────────────────────────────────────────────────
  const idNo = new Map<string, string>();
  ativos.forEach(p => idNo.set(String(p.id), idAleatorio(30)));

  // ── profundidade por BFS ────────────────────────────────────────────────
  const nivel = new Map<string, number>();
  const primeiro = String(ativos[0].id);
  nivel.set(primeiro, 1); // 0 fica reservado ao no "start"
  const fila: string[] = [primeiro];
  while (fila.length > 0) {
    const atual = fila.shift() as string;
    const passo = porId.get(atual);
    if (!passo) continue;

    const destinos: (string | null)[] =
      passo.tipo === "menu"
        ? (passo.opcoes || []).map(o => resolver(o.proximo))
        : [resolver(passo.proximo)];

    destinos.forEach(destino => {
      if (!destino || nivel.has(destino)) return;
      nivel.set(destino, (nivel.get(atual) || 1) + 1);
      fila.push(destino);
    });
  }

  // passos que ninguem alcancou (a IA as vezes deixa orfaos) vao para o fim
  const nivelMaximoAlcancado = Math.max(1, ...Array.from(nivel.values()));
  ativos.forEach(p => {
    if (!nivel.has(String(p.id))) nivel.set(String(p.id), nivelMaximoAlcancado + 1);
  });

  const ocupacao = new Map<number, number>();
  const posicaoDe = (chave: string) => {
    const n = nivel.get(chave) || 1;
    const indice = ocupacao.get(n) || 0;
    ocupacao.set(n, indice + 1);
    return { x: 60 + n * 380, y: 60 + indice * 260 };
  };

  const nodes: any[] = [
    {
      id: "1",
      position: { x: 250, y: 100 },
      data: { label: "Inicio do fluxo" },
      type: "start"
    }
  ];

  const ordenados = [...ativos].sort(
    (a, b) => (nivel.get(String(a.id)) || 0) - (nivel.get(String(b.id)) || 0)
  );

  ordenados.forEach(passo => {
    const chave = String(passo.id);
    const position = posicaoDe(chave);
    const id = idNo.get(chave) as string;

    if (passo.tipo === "mensagem") {
      nodes.push({
        id,
        position,
        data: { label: passo.texto || passo.mensagem || "" },
        type: "message"
      });
      return;
    }

    if (passo.tipo === "pergunta") {
      nodes.push({
        id,
        position,
        data: {
          question: passo.pergunta || passo.texto || "",
          variableName: (passo.variavel || "resposta")
            .replace(/[^a-zA-Z0-9_]/g, "_")
            .toLowerCase()
        },
        type: "input"
      });
      return;
    }

    if (passo.tipo === "intervalo") {
      const sec = Math.min(Math.max(Number(passo.segundos) || 1, 1), 120);
      nodes.push({
        id,
        position,
        data: { label: `Intervalo ${sec} seg.`, sec },
        type: "interval"
      });
      return;
    }

    if (passo.tipo === "menu") {
      nodes.push({
        id,
        position,
        data: {
          message: passo.mensagem || passo.texto || "",
          arrayOption: (passo.opcoes || []).map((o, i) => ({
            number: i + 1,
            value: o.texto
          }))
        },
        type: "menu"
      });
      return;
    }

    if (passo.tipo === "fila") {
      const fila = filasPorNome.get(normalizar(passo.fila || ""));
      nodes.push({
        id,
        position,
        // Mesmo shape que o FlowBuilderAddTicketModal grava: o objeto Queue
        // inteiro, nao so o id.
        data: { queue: fila ? fila.toJSON() : "" },
        type: "ticket"
      });
      return;
    }

    if (passo.tipo === "encerrar") {
      nodes.push({
        id,
        position,
        data: {
          farewellMessage:
            passo.mensagem ||
            passo.texto ||
            "Atendimento encerrado. Obrigado pelo contato!"
        },
        type: "exit"
      });
    }
  });

  // ── arestas ─────────────────────────────────────────────────────────────
  const connections: any[] = [];
  const ligar = (
    origem: string,
    destino: string,
    sourceHandle: string | null
  ) => {
    connections.push({
      id: `reactflow__edge-${origem}${sourceHandle || ""}-${destino}`,
      source: origem,
      sourceHandle: sourceHandle || null,
      target: destino,
      targetHandle: null
    });
  };

  ligar("1", idNo.get(primeiro) as string, null);

  ativos.forEach(passo => {
    const origem = idNo.get(String(passo.id)) as string;

    if (passo.tipo === "menu") {
      (passo.opcoes || []).forEach((opcao, i) => {
        const destino = resolver(opcao.proximo);
        if (destino && idNo.has(destino)) {
          // handles do menuNode sao "a1", "a2", ... na ordem das opcoes
          ligar(origem, idNo.get(destino) as string, `a${i + 1}`);
        }
      });
      return;
    }

    const destino = resolver(passo.proximo);
    if (destino && idNo.has(destino)) {
      ligar(origem, idNo.get(destino) as string, null);
    }
  });

  return { nodes, connections, avisos };
};

const GenerateFlowAIService = async ({
  companyId,
  userId,
  categoria,
  nome,
  descricao
}: Requisicao): Promise<{ flow: FlowBuilderModel; avisos: string[] }> => {
  if (!descricao || String(descricao).trim().length < 10) {
    throw new AppError("ERR_FLOW_AI_SHORT_DESCRIPTION", 400);
  }

  const prompt = await Prompt.findOne({
    where: { companyId },
    order: [["id", "ASC"]]
  });

  if (!prompt?.apiKey) {
    throw new AppError("ERR_FLOW_AI_NO_KEY", 400);
  }

  const filas = await Queue.findAll({
    where: { companyId },
    order: [["name", "ASC"]]
  });

  const filasPorNome = new Map<string, Queue>();
  filas.forEach(f => filasPorNome.set(normalizar(f.name), f));

  const cliente = obterClienteIA(prompt.apiKey);
  const modelo = prompt.aiModel || "gpt-4o-mini";

  let resposta;
  try {
    resposta = await cliente.chat.completions.create({
      model: modelo,
      temperature: 0.4,
      response_format: { type: "json_object" },
      messages: [
        {
          role: "system",
          content: montarInstrucoes(filas.map(f => f.name))
        },
        {
          role: "user",
          content: `Categoria: ${CATEGORIAS[categoria] || categoria || "Outro"}
${nome ? `Nome desejado: ${nome}` : ""}

Descricao do fluxo:
${descricao}`
        }
      ]
    });
  } catch (err: any) {
    logger.error(`[FLOW-AI] falha na chamada ao modelo: ${err?.message}`);
    throw new AppError("ERR_FLOW_AI_REQUEST_FAILED", 400);
  }

  const bruto = resposta?.choices?.[0]?.message?.content || "";

  let gerado: { nome?: string; passos?: Passo[] };
  try {
    gerado = extrairJson(bruto);
  } catch (err: any) {
    logger.error(`[FLOW-AI] JSON invalido do modelo: ${err?.message}`);
    throw new AppError("ERR_FLOW_AI_INVALID_JSON", 400);
  }

  if (!Array.isArray(gerado.passos) || gerado.passos.length === 0) {
    throw new AppError("ERR_FLOW_AI_EMPTY", 400);
  }

  const { nodes, connections, avisos } = converterParaReactFlow(
    gerado.passos,
    filasPorNome
  );

  const nomeFinal = String(nome || gerado.nome || "Fluxo gerado com IA").slice(
    0,
    80
  );

  // Nome duplicado nao pode derrubar a geracao depois de ja ter gasto a
  // chamada ao modelo: acrescenta sufixo ate encontrar um nome livre.
  let nomeUnico = nomeFinal;
  let tentativa = 2;
  // eslint-disable-next-line no-await-in-loop
  while (
    await FlowBuilderModel.findOne({
      where: { name: nomeUnico, company_id: companyId }
    })
  ) {
    nomeUnico = `${nomeFinal} (${tentativa})`;
    tentativa += 1;
    if (tentativa > 50) break;
  }

  const flow = await FlowBuilderModel.create({
    user_id: userId,
    name: nomeUnico,
    company_id: companyId,
    active: false, // nasce pausado: o usuario revisa antes de colocar no ar
    description: String(descricao).slice(0, 255),
    flow: { nodes, connections }
  } as any);

  logger.info(
    `[FLOW-AI] fluxo ${flow.id} gerado para company ${companyId} com ${nodes.length} no(s)`
  );

  return { flow, avisos };
};

export default GenerateFlowAIService;
