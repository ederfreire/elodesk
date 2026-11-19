import {
  AllowNull,
  AutoIncrement,
  BelongsTo,
  Column,
  CreatedAt,
  DataType,
  Default,
  ForeignKey,
  Model,
  PrimaryKey,
  Table,
  UpdatedAt
} from "sequelize-typescript";
import Queue from "./Queue";
import Company from "./Company";

@Table
class Prompt extends Model<Prompt> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @AllowNull(false)
  @Column
  name: string;

  @AllowNull(true)
  @Column(DataType.TEXT)
  prompt: string;

  @AllowNull(true)
  @Column
  apiKey: string;

  @Column({ defaultValue: 10 })
  maxMessages: number;

  @Column({ defaultValue: 100 })
  maxTokens: number;

  @Column({ defaultValue: 1 })
  temperature: number;

  @Column({ defaultValue: 0 })
  promptTokens: number;

  @Column({ defaultValue: 0 })
  completionTokens: number;

  @Column({ defaultValue: 0 })
  totalTokens: number;

  @AllowNull(true)
  @Default("texto")
  @Column
  voice: string;

  @AllowNull(true)
  @Column
  voiceKey: string;

  @AllowNull(true)
  @Column
  voiceRegion: string;

  @AllowNull
  @ForeignKey(() => Queue)
  @Column
  queueId: number;

  @BelongsTo(() => Queue)
  queue: Queue;

  @ForeignKey(() => Company)
  @Column
  companyId: number;

  @BelongsTo(() => Company)
  company: Company;

  // New agent fields

  @AllowNull(true)
  @Default("geral")
  @Column
  agentFunction: string;

  @AllowNull(true)
  @Default("amigavel")
  @Column
  voiceTone: string;

  @AllowNull(true)
  @Default("gpt-4o-mini")
  @Column
  aiModel: string;

  @AllowNull(true)
  @Default('["pt-BR"]')
  @Column(DataType.TEXT)
  languages: string;

  @AllowNull(true)
  @Column(DataType.TEXT)
  personality: string;

  @AllowNull(true)
  @Default(true)
  @Column
  active: boolean;

  @AllowNull(true)
  @Column(DataType.TEXT)
  greetingMessage: string;

  @AllowNull(true)
  @Column(DataType.TEXT)
  responseRules: string;

  @AllowNull(true)
  @Default(true)
  @Column
  allowTransfer: boolean;

  @AllowNull(true)
  @Default("atendente, sair, falar com humano, humano")
  @Column(DataType.TEXT)
  transferKeywords: string;

  @AllowNull(true)
  @Default("Desculpe, não tenho informações sobre esse assunto. Vou transferir para um atendente.")
  @Column(DataType.TEXT)
  transferMessage: string;

  @AllowNull(true)
  @Column
  transferQueueId: number;

  @AllowNull(true)
  @Column
  transferUserId: number;

  @AllowNull(true)
  @Default("pending")
  @Column
  transferStatus: string;

  @AllowNull(true)
  @Default(1)
  @Column(DataType.FLOAT)
  responseDelay: number;

  @AllowNull(true)
  @Default(2000)
  @Column
  charLimit: number;

  @AllowNull(true)
  @Default(true)
  @Column
  humanizeConversation: boolean;

  @AllowNull(true)
  @Default(false)
  @Column
  audioEnabled: boolean;

  @AllowNull(true)
  @Default(false)
  @Column
  transcribeAudio: boolean;

  @AllowNull(true)
  @Default("text")
  @Column
  responseMode: string;

  @AllowNull(true)
  @Default("nova")
  @Column
  agentVoice: string;

  @AllowNull(true)
  @Default(true)
  @Column
  sendAsPTT: boolean;

  // ── Tool Switches (AI Agent Tools) ──

  @AllowNull(true)
  @Default(false)
  @Column
  toolOpenTicket: boolean;

  @AllowNull(true)
  @Column(DataType.TEXT)
  toolOpenTicketConfig: string;

  @AllowNull(true)
  @Default(false)
  @Column
  toolNotifyHuman: boolean;

  @AllowNull(true)
  @Column(DataType.TEXT)
  toolNotifyHumanConfig: string;

  @AllowNull(true)
  @Default(false)
  @Column
  toolHttpRequest: boolean;

  @AllowNull(true)
  @Column(DataType.TEXT)
  toolHttpRequestConfig: string;

  @AllowNull(true)
  @Default(false)
  @Column
  toolScheduling: boolean;

  @AllowNull(true)
  @Column(DataType.TEXT)
  toolSchedulingConfig: string;

  @AllowNull(true)
  @Default(false)
  @Column
  toolTags: boolean;

  @AllowNull(true)
  @Column(DataType.TEXT)
  toolTagsConfig: string;

  @AllowNull(true)
  @Default(false)
  @Column
  toolKanban: boolean;

  @AllowNull(true)
  @Column(DataType.TEXT)
  toolKanbanConfig: string;

  // ── Turno / Horário de atendimento ──

  @AllowNull(true)
  @Default(false)
  @Column
  workingHoursEnabled: boolean;

  @AllowNull(true)
  @Default("America/Sao_Paulo")
  @Column
  workingHoursTimezone: string;

  @AllowNull(true)
  @Column(DataType.TEXT)
  workingHoursOutOfMessage: string;

  @AllowNull(true)
  @Column(DataType.TEXT)
  workingHoursSchedule: string;

  @CreatedAt
  createdAt: Date;

  // ── Inatividade (acordar cliente) ──

  @AllowNull(true)
  @Default(false)
  @Column
  inactivityEnabled: boolean;

  @AllowNull(true)
  @Default(10)
  @Column
  inactivityTimeout: number;

  @AllowNull(true)
  @Column(DataType.TEXT)
  inactivityMessage: string;

  @AllowNull(true)
  @Default(1)
  @Column
  inactivityMaxReminders: number;

  /**
   * Cadência: [{ minutes, message }]. Quando preenchida, substitui o trio
   * acima (tempo/mensagem/quantidade), permitindo textos diferentes em
   * tempos diferentes.
   */
  @AllowNull(true)
  @Column(DataType.JSONB)
  inactivitySteps: any;

  @UpdatedAt
  updatedAt: Date;
}

export default Prompt;
