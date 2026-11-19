export interface BoardTemplateColumn {
  name: string;
  color: string;
}

export interface BoardTemplate {
  key: string;
  name: string;
  category: string;
  icon: string;
  color: string;
  description: string;
  columns: BoardTemplateColumn[];
}

export const BOARD_TEMPLATES: BoardTemplate[] = [
  {
    key: "sales",
    name: "Vendas",
    category: "sales",
    icon: "TrendingUp",
    color: "#10B981",
    description: "Pipeline comercial: do lead ao fechamento.",
    columns: [
      { name: "Lead", color: "#94A3B8" },
      { name: "Qualificado", color: "#3B82F6" },
      { name: "Proposta", color: "#F59E0B" },
      { name: "Fechado", color: "#10B981" },
      { name: "Perdido", color: "#EF4444" }
    ]
  },
  {
    key: "support",
    name: "Suporte",
    category: "support",
    icon: "Headset",
    color: "#3B82F6",
    description: "Helpdesk e atendimento ao cliente.",
    columns: [
      { name: "Novo", color: "#3B82F6" },
      { name: "Em análise", color: "#F59E0B" },
      { name: "Aguardando cliente", color: "#A855F7" },
      { name: "Resolvido", color: "#10B981" }
    ]
  },
  {
    key: "billing",
    name: "Cobrança",
    category: "billing",
    icon: "DollarSign",
    color: "#F59E0B",
    description: "Recuperação financeira e negociação.",
    columns: [
      { name: "Em aberto", color: "#F59E0B" },
      { name: "Negociação", color: "#3B82F6" },
      { name: "Acordo", color: "#A855F7" },
      { name: "Pago", color: "#10B981" },
      { name: "Inadimplente", color: "#EF4444" }
    ]
  },
  {
    key: "onboarding",
    name: "Onboarding",
    category: "onboarding",
    icon: "Sparkles",
    color: "#A855F7",
    description: "Sucesso do cliente e ativação.",
    columns: [
      { name: "Boas-vindas", color: "#3B82F6" },
      { name: "Treinamento", color: "#F59E0B" },
      { name: "Ativação", color: "#A855F7" },
      { name: "Cliente ativo", color: "#10B981" }
    ]
  }
];

export const findTemplate = (key: string): BoardTemplate | undefined =>
  BOARD_TEMPLATES.find(t => t.key === key);