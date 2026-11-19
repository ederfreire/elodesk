import Company from "../models/Company";
import Plan from "../models/Plan";

/**
 * O plano da empresa libera o recurso? Usado no processamento das mensagens
 * (agente comercial, identificação do link UTM), por isso guarda a resposta
 * por 60 s em memória para não consultar o banco a cada mensagem.
 */
const guardado = new Map<string, { em: number; sim: boolean }>();
const VALIDADE_MS = 60 * 1000;

const planoLibera = async (
  companyId: number,
  recurso: "useUtmLinks" | "useSalesAgents"
): Promise<boolean> => {
  const chave = `${companyId}:${recurso}`;
  const g = guardado.get(chave);
  if (g && Date.now() - g.em < VALIDADE_MS) return g.sim;
  const empresa = await Company.findByPk(companyId, {
    attributes: ["id"],
    include: [{ model: Plan, as: "plan", attributes: [recurso] }]
  });
  const valor = (empresa as any)?.plan?.[recurso];
  // Sem plano ou coluna ainda sem valor: libera (é o padrão da coluna).
  const sim = valor !== false;
  guardado.set(chave, { em: Date.now(), sim });
  return sim;
};

export default planoLibera;
