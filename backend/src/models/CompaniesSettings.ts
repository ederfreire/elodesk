/**
 * @TercioSantos-0 |
 * model/CompaniesSettings |
 * @descrição:modelo para tratar as configurações das empresas
 */
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
  Default,
  DataType
} from "sequelize-typescript";
import Company from "./Company";

@Table({ tableName: "CompaniesSettings" })
class CompaniesSettings extends Model<CompaniesSettings> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @ForeignKey(() => Company)
  @Column
  companyId: number;

  @BelongsTo(() => Company)
  company: Company;

  @Column
  hoursCloseTicketsAuto: string;

  @Column
  chatBotType: string;

  @Column
  acceptCallWhatsapp: string;

  //inicio de opções: enabled ou disabled
  @Column
  userRandom: string;

  @Column
  sendGreetingMessageOneQueues: string;

  @Column
  sendSignMessage: string;

  @Column
  sendFarewellWaitingTicket: string;

  @Column
  userRating: string;

  @Column
  sendGreetingAccepted: string;

  @Column
  CheckMsgIsGroup: string;

  @Column
  sendQueuePosition: string;

  @Column
  scheduleType: string;

  @Column
  acceptAudioMessageContact: string;

  @Column
  sendMsgTransfTicket: string;

  @Column
  enableLGPD: string;

  @Column
  requiredTag: string;

  @Column
  lgpdDeleteMessage: string;

  @Column
  lgpdHideNumber: string;

  @Column
  lgpdConsent: string;

  @Column
  lgpdLink: string;

  //fim de opções: enabled ou disabled
  @Column
  lgpdMessage: string;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;

  @Default(false)
  @Column
  DirectTicketsToWallets: boolean;

  @Default(false)
  @Column
  closeTicketOnTransfer: boolean;

  @Column
  transferMessage: string;

  @Column
  greetingAcceptedMessage: string;

  @Column
  AcceptCallWhatsappMessage: string;

  @Column
  sendQueuePositionMessage: string;

  @Column
  showNotificationPending: boolean;

  // Reage automaticamente com um emoji a cada mensagem recebida do contato.
  @Default(false)
  @Column
  autoReaction: boolean;

  @Default("\u{1F44D}")
  @Column
  autoReactionEmoji: string;

  /**
   * Regras de reação por palavra-chave:
   * [{ keywords: ["bom dia", "boa tarde"], emojis: ["😀", "👍"] }]
   * Quando a mensagem casa com uma regra, sorteia um emoji dela.
   */
  @Column(DataType.JSONB)
  autoReactionRules: any;

  @Default(false)
  @Column
  informarValorVenda: boolean;

  @Default("BRL")
  @Column
  currency: string;

  @Column
  motivosFinalizacao: string; // JSON string com array de motivos padrão

  @Default(false)
  @Column
  allowUserCrossQueues: boolean;

  @Default(30)
  @Column
  slaGreenMinutes: number;

  @Default(60)
  @Column
  slaYellowMinutes: number;

  @Default(120)
  @Column
  slaRedMinutes: number;

  @Default("#22c55e")
  @Column
  slaGreenColor: string;

  @Default("#eab308")
  @Column
  slaYellowColor: string;

  @Default("#ef4444")
  @Column
  slaRedColor: string;

  @Default(true)
  @Column
  autoAiSummary: boolean;

  @Default(true)
  @Column
  aiSuggestReply: boolean;

  @Default(true)
  @Column
  enableCloseTicketModal: boolean;
}

export default CompaniesSettings;
