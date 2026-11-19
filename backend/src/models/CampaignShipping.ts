import {
  Table,
  Column,
  CreatedAt,
  UpdatedAt,
  Model,
  PrimaryKey,
  AutoIncrement,
  ForeignKey,
  BelongsTo
} from "sequelize-typescript";
import Campaign from "./Campaign";
import ContactListItem from "./ContactListItem";

@Table({ tableName: "CampaignShipping" })
class CampaignShipping extends Model<CampaignShipping> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @Column
  jobId: string;

  @Column
  number: string;

  @Column
  message: string;

  @Column
  confirmationMessage: string;

  @Column
  confirmation: boolean;

  @ForeignKey(() => ContactListItem)
  @Column
  contactId: number;

  @ForeignKey(() => Campaign)
  @Column
  campaignId: number;

  // Conexão WhatsApp pré-atribuída por rotação de blocos (opcional).
  // Quando preenchido, sobrepõe campaign.whatsappId no momento do dispatch.
  @Column
  whatsappId: number;

  @Column
  confirmationRequestedAt: Date;

  @Column
  confirmedAt: Date;

  @Column
  deliveredAt: Date;

  // ---- Campanha de voz ----
  // Quantas ligações já foram feitas para este contato nesta campanha, e como
  // terminou a última. Sem isso não há como parar de insistir com quem não
  // atende nem mostrar o resultado no relatório.
  @Column({ defaultValue: 0 })
  voiceAttempts: number;

  @Column
  voiceLastResult: string;

  // Janela de espera pela resposta do cliente ao template (API Oficial)
  @Column
  awaitingResponseSince: Date;

  // Mídia escolhida especificamente para este shipping (vinculada ao slot
  // de mensagem sorteado). Sobrepõe campaign.mediaPath quando preenchido.
  @Column
  mediaPath: string;

  @Column
  mediaName: string;

  // Marca quando os follow-ups (mensagens 2-5) foram efetivamente enviados
  @Column
  followUpSentAt: Date;

  // Marca quando a janela de 24h da Meta expirou sem resposta do cliente
  // (preenchido por job agendado; impede envio tardio de follow-ups)
  @Column
  followUpExpiredAt: Date;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;

  @BelongsTo(() => ContactListItem)
  contact: ContactListItem;

  @BelongsTo(() => Campaign)
  campaign: Campaign;
}

export default CampaignShipping;
