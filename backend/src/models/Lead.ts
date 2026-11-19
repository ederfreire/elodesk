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
  DataType,
  AllowNull,
  Default
} from "sequelize-typescript";
import Company from "./Company";
import Contact from "./Contact";
import Ticket from "./Ticket";

@Table({ tableName: "Leads" })
class Lead extends Model<Lead> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @AllowNull(false)
  @Column
  phone: string;

  @ForeignKey(() => Company)
  @AllowNull(false)
  @Column
  companyId: number;

  @BelongsTo(() => Company)
  company: Company;

  @ForeignKey(() => Contact)
  @Column
  contactId: number;

  @BelongsTo(() => Contact)
  contact: Contact;

  @ForeignKey(() => Ticket)
  @Column
  firstTicketId: number;

  @BelongsTo(() => Ticket)
  firstTicket: Ticket;

  // canal de origem: "whatsapp_oficial" (Cloud API) | "baileys"
  @Default("whatsapp_oficial")
  @Column
  channel: string;

  @Column(DataType.TEXT)
  firstMessage: string;

  // Identificador da Meta para click-to-WhatsApp (essencial p/ CAPI)
  @Column
  ctwa_clid: string;

  @Column
  adId: string;

  @Column
  adTitle: string;

  @Column(DataType.TEXT)
  adBody: string;

  @Column
  sourceType: string; // ad | post

  @Column
  sourceUrl: string;

  @Column
  mediaType: string;

  @Column(DataType.TEXT)
  thumbnailUrl: string;

  // status da atribuição: "new" | "contact" | "qualified" | "purchase" | "lost"
  @Default("new")
  @Column
  status: string;

  // último evento enviado para CAPI
  @Column
  lastCapiEvent: string;

  @Column
  lastCapiAt: Date;

  @Column(DataType.TEXT)
  lastCapiError: string;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default Lead;