import {
  Table, Column, CreatedAt, UpdatedAt, Model, PrimaryKey, AutoIncrement,
  ForeignKey, BelongsTo, Default, AllowNull, DataType
} from "sequelize-typescript";

import Company from "./Company";
import Ticket from "./Ticket";
import Contact from "./Contact";
import SalesAgent from "./SalesAgent";

/** O que o agente apurou de cada atendimento. Base dos relatórios. */
@Table({ tableName: "SalesAgentLeads" })
class SalesAgentLead extends Model<SalesAgentLead> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @ForeignKey(() => SalesAgent)
  @AllowNull(false)
  @Column
  salesAgentId: number;

  @BelongsTo(() => SalesAgent)
  salesAgent: SalesAgent;

  @ForeignKey(() => Ticket)
  @AllowNull(false)
  @Column
  ticketId: number;

  @BelongsTo(() => Ticket)
  ticket: Ticket;

  @ForeignKey(() => Contact)
  @AllowNull(false)
  @Column
  contactId: number;

  @BelongsTo(() => Contact)
  contact: Contact;

  @Column
  product: string;

  @Column(DataType.DECIMAL(12, 2))
  value: number;

  @Column
  paymentMethod: string;

  @Column
  purchaseTerm: string;

  @Column
  city: string;

  @Column
  intent: string;

  @Column
  temperature: string;

  @Default("pendente")
  @Column
  status: string;

  @Column(DataType.JSONB)
  objections: any;

  @Column(DataType.JSONB)
  extraData: any;

  @Column
  qualifiedAt: Date;

  @Column
  transferredAt: Date;

  @Column
  scheduledAt: Date;

  @Column
  meetLink: string;

  @ForeignKey(() => Company)
  @AllowNull(false)
  @Column
  companyId: number;

  @BelongsTo(() => Company)
  company: Company;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default SalesAgentLead;
