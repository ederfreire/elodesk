import {
  Table,
  Column,
  CreatedAt,
  UpdatedAt,
  Model,
  PrimaryKey,
  AutoIncrement,
  ForeignKey,
  BelongsTo,
  HasMany,
  DataType
} from "sequelize-typescript";
import CampaignShipping from "./CampaignShipping";
import Company from "./Company";
import ContactList from "./ContactList";
import Whatsapp from "./Whatsapp";
import User from "./User";
import Queue from "./Queue";

@Table({ tableName: "Campaigns" })
class Campaign extends Model<Campaign> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @Column
  name: string;

  @Column({ defaultValue: "" })
  message1: string;

  @Column({ defaultValue: "" })
  message2: string;

  @Column({ defaultValue: "" })
  message3: string;

  @Column({ defaultValue: "" })
  message4: string;

  @Column({ defaultValue: "" })
  message5: string;

  @Column({ defaultValue: "" })
  confirmationMessage1: string;

  @Column({ defaultValue: "" })
  confirmationMessage2: string;

  @Column({ defaultValue: "" })
  confirmationMessage3: string;

  @Column({ defaultValue: "" })
  confirmationMessage4: string;

  @Column({ defaultValue: "" })
  confirmationMessage5: string;

  @Column({ defaultValue: "INATIVA" })
  status: string; // INATIVA, PROGRAMADA, EM_ANDAMENTO, CANCELADA, FINALIZADA

  @Column
  confirmation: boolean;

  @Column
  mediaPath: string;

  @Column
  mediaName: string;

  // ---- Campanha de voz ----
  // "message" (padrão, comportamento de sempre) ou "voice" (liga e toca áudio).
  @Column({ defaultValue: "message" })
  campaignType: string;

  @Column
  voiceAudioPath: string;

  @Column
  voiceAudioName: string;

  @Column({ defaultValue: 2 })
  voiceMaxAttempts: number;

  @Column({ defaultValue: 60 })
  voiceRetryMinutes: number;

  @Column({ defaultValue: 30 })
  voiceRingSeconds: number;

  // Enviar a mensagem de texto da campanha depois da ligação.
  @Column({ defaultValue: true })
  voiceSendText: boolean;

  @Column
  scheduledAt: Date;

  @Column
  completedAt: Date;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;

  @ForeignKey(() => Company)
  @Column
  companyId: number;

  @BelongsTo(() => Company)
  company: Company;

  @ForeignKey(() => ContactList)
  @Column
  contactListId: number;

  @BelongsTo(() => ContactList)
  contactList: ContactList;

  @ForeignKey(() => Whatsapp)
  @Column
  whatsappId: number;

  @BelongsTo(() => Whatsapp)
  whatsapp: Whatsapp;

  @HasMany(() => CampaignShipping)
  shipping: CampaignShipping[];

  @ForeignKey(() => User)
  @Column
  userId: number;

  @BelongsTo(() => User)
  user: User;

  @ForeignKey(() => Queue)
  @Column
  queueId: number;

  @BelongsTo(() => Queue)
  queue: Queue;

  @Column({ defaultValue: "closed" })
  statusTicket: string;

  @Column({ defaultValue: "disabled" })
  openTicket: string;

  @Column({ defaultValue: false })
  isRecurring: boolean;

  @Column
  recurrenceType: string; // 'daily', 'weekly', 'biweekly', 'monthly', 'yearly'

  @Column
  recurrenceInterval: number; // Intervalo personalizado (ex: a cada 2 semanas)

  @Column
  recurrenceDaysOfWeek: string; // JSON array para dias da semana [0,1,2,3,4,5,6]

  @Column
  recurrenceDayOfMonth: number; // Dia específico do mês (1-31)

  @Column
  recurrenceEndDate: Date; // Data limite para recorrência

  @Column
  maxExecutions: number; // Número máximo de execuções

  @Column({ defaultValue: 0 })
  executionCount: number; // Contador de execuções

  @Column
  nextScheduledAt: Date; // Próxima execução programada

  @Column
  lastExecutedAt: Date; // Última execução realizada

  @Column
  tagListId: string; // ID da tag para seleção de contatos

  @Column
  templateId: number; // ID do template para campanhas via API Oficial

  @Column(DataType.TEXT)
  templateVariables: string; // JSON com variáveis preenchidas do template

  @Column({ defaultValue: false })
  sendFollowUpMessage: boolean;

  // Quando true, ignora contatos que já receberam mensagem (deliveredAt) em
  // QUALQUER campanha anterior usando a mesma contactList. Útil para
  // recriar a campanha após pausa para ajuste sem reenviar aos mesmos contatos.
  @Column({ defaultValue: false })
  skipAlreadySent: boolean;

  @Column({ defaultValue: 3 })
  followUpDelay: number; // Delay padrão em segundos entre template e follow-up

  @Column(DataType.TEXT)
  messageDelays: string; // JSON com delays individuais por mensagem ex: {"message1":3,"message2":5,...}

  @Column(DataType.TEXT)
  messageMedias: string; // JSON com mídias individuais por mensagem ex: {"message1":{"path":"...","name":"..."},...}

  @Column(DataType.TEXT)
  // JSON com templates oficiais (API Oficial) por slot, quando o usuário escolhe
  // enviar um template aprovado em vez de texto livre.
  // Ex: {"message2":{"templateId":42,"name":"agradecimento"}, "message4":{...}}
  messageTemplates: string;

  @Column(DataType.TEXT)
  // JSON com config de rotação de conexões por blocos.
  // Ex: {"blockSize":250,"whatsappIds":[1,2,3],"sequential":true}
  // Quando definido, cada CampaignShipping recebe um whatsappId pré-calculado
  // (1º bloco -> whatsappIds[0], 2º bloco -> whatsappIds[1], etc.).
  whatsappRotation: string;
}

export default Campaign;
