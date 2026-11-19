import {
  Table, Column, CreatedAt, UpdatedAt, Model, PrimaryKey, AutoIncrement,
  ForeignKey, BelongsTo, Default, AllowNull, DataType, HasMany
} from "sequelize-typescript";

import Company from "./Company";
import Prompt from "./Prompt";
import Tag from "./Tag";
import Queue from "./Queue";
import User from "./User";
import SalesAgentLead from "./SalesAgentLead";

/**
 * Agente Comercial: a configuração do PROCESSO de qualificação.
 *
 * Separado do `Prompt` de propósito. O Prompt define como o agente conversa;
 * este define o que acontece com o resultado da conversa — que etiqueta
 * aplicar, para onde mover no funil, para quem transferir, se agenda.
 */
@Table({ tableName: "SalesAgents" })
class SalesAgent extends Model<SalesAgent> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @AllowNull(false)
  @Column
  name: string;

  @Default(true)
  @Column
  active: boolean;

  @ForeignKey(() => Prompt)
  @Column
  promptId: number;

  @BelongsTo(() => Prompt)
  prompt: Prompt;

  @Column(DataType.JSONB)
  requiredFields: any;

  /**
   * Instruções próprias de extração. Vazio = ExtractLeadDataService usa o texto
   * padrão. Preenchido = a IA lê a conversa segundo as regras deste agente.
   */
  @AllowNull(true)
  @Column(DataType.TEXT)
  extractionInstructions: string;

  /** De qual AgentTemplate este agente foi criado (referência, opcional). */
  @AllowNull(true)
  @Column
  templateId: number;

  @Column(DataType.DECIMAL(12, 2))
  minValue: number;

  @Column(DataType.DECIMAL(12, 2))
  maxValue: number;

  @ForeignKey(() => Tag)
  @Column
  qualifiedTagId: number;

  @ForeignKey(() => Tag)
  @Column
  qualifiedKanbanTagId: number;

  @ForeignKey(() => Queue)
  @Column
  qualifiedQueueId: number;

  @ForeignKey(() => User)
  @Column
  qualifiedUserId: number;

  @Default(false)
  @Column
  transferOnQualify: boolean;

  @ForeignKey(() => Tag)
  @Column
  disqualifiedTagId: number;

  @ForeignKey(() => Tag)
  @Column
  disqualifiedKanbanTagId: number;

  @Default(false)
  @Column
  schedulingEnabled: boolean;

  @Column
  googleCalendarId: string;

  @Default(false)
  @Column
  createMeetLink: boolean;

  @Default(30)
  @Column
  eventDurationMinutes: number;

  @ForeignKey(() => Company)
  @AllowNull(false)
  @Column
  companyId: number;

  @BelongsTo(() => Company)
  company: Company;

  @HasMany(() => SalesAgentLead)
  leads: SalesAgentLead[];

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default SalesAgent;
