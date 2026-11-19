import { i18n } from '../../translate/i18n';

// Mapeia os nomes padrão (em PT) criados pelos templates de board para chaves i18n.
// Caso o usuário tenha renomeado, retornamos o próprio nome cadastrado.
const KEY_MAP = {
  "Novo": "novo",
  "Em análise": "emAnalise",
  "Em analise": "emAnalise",
  "Aguardando cliente": "aguardandoCliente",
  "Resolvido": "resolvido",
  "Lead": "lead",
  "Qualificado": "qualificado",
  "Proposta": "proposta",
  "Fechado": "fechado",
  "Perdido": "perdido",
  "Em aberto": "emAberto",
  "Negociação": "negociacao",
  "Negociacao": "negociacao",
  "Acordo": "acordo",
  "Pago": "pago",
  "Inadimplente": "inadimplente",
  "Boas-vindas": "boasVindas",
  "Treinamento": "treinamento",
  "Ativação": "ativacao",
  "Ativacao": "ativacao",
  "Cliente ativo": "clienteAtivo",
};

export const translateLaneName = (name) => {
  if (!name || typeof name !== 'string') return name;
  const key = KEY_MAP[name.trim()];
  if (!key) return name;
  const path = `kanbanLanes.${key}`;
  const translated = i18n.t(path);
  return translated && translated !== path ? translated : name;
};

export default translateLaneName;