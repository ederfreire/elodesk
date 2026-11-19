import {
  Table, Column, CreatedAt, UpdatedAt, Model, PrimaryKey, AutoIncrement,
  ForeignKey, BelongsTo, Default, AllowNull, DataType
} from "sequelize-typescript";

import Company from "./Company";

/**
 * Biblioteca de modelos de agente — módulo independente.
 *
 * Antes os modelos viviam presos no arquivo agentTemplates.js do frontend,
 * usáveis só pelo PromptModal. Agora são dados: qualquer agente (Prompt de
 * conversa OU Agente Comercial) lê desta tabela, e a empresa pode criar os
 * seus próprios sem tocar em código.
 *
 * MODELOS DE SISTEMA vs DA EMPRESA
 * `isSystem = true` são os quatro que já vinham no código (SDR, Recuperação,
 * Pós-venda, Vendedor direto), semeados por migration. companyId null nesses.
 * A empresa não pode apagar um de sistema — só duplicar e ajustar. Os que ela
 * cria têm companyId preenchido e são totalmente editáveis.
 */
@Table({ tableName: "AgentTemplates" })
class AgentTemplate extends Model<AgentTemplate> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  /** Chave curta estável (ex.: "sdr"). Nos de sistema, casa com o value antigo. */
  @AllowNull(false)
  @Column
  slug: string;

  @AllowNull(false)
  @Column
  label: string;

  @AllowNull(true)
  @Column(DataType.TEXT)
  description: string;

  /** O corpo do prompt em markdown. */
  @AllowNull(true)
  @Column(DataType.TEXT)
  prompt: string;

  /**
   * Instruções de extração próprias do modelo. Quando o modelo é aplicado a um
   * Agente Comercial, isto vira o extractionInstructions do agente — é o que
   * faz a extração usar as instruções do próprio agente, não um texto fixo.
   */
  @AllowNull(true)
  @Column(DataType.TEXT)
  extractionInstructions: string;

  /**
   * A quem o modelo se destina: "conversa" (Prompt), "comercial" (SalesAgent)
   * ou "ambos". Só filtra a listagem — não impede uso.
   */
  @AllowNull(true)
  @Default("ambos")
  @Column
  scope: string;

  /** Agrupador opcional por nicho (clínica, imobiliária, infoproduto...). */
  @AllowNull(true)
  @Column
  niche: string;

  @Default(false)
  @Column
  isSystem: boolean;

  @Default(true)
  @Column
  active: boolean;

  /** Ordena a lista; sistema vem primeiro por padrão. */
  @Default(0)
  @Column
  sortOrder: number;

  /** Null = modelo de sistema (visível a todas as empresas). */
  @AllowNull(true)
  @ForeignKey(() => Company)
  @Column
  companyId: number;

  @BelongsTo(() => Company)
  company: Company;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default AgentTemplate;
