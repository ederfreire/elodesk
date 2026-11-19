import {
  Table,
  Column,
  CreatedAt,
  UpdatedAt,
  Model,
  PrimaryKey,
  ForeignKey,
  BelongsTo,
  AutoIncrement,
  AllowNull,
  Default
} from "sequelize-typescript";

import Company from "./Company";
import Whatsapp from "./Whatsapp";
import Contact from "./Contact";
import Ticket from "./Ticket";
import User from "./User";

/** Uma ligação da API Oficial. O callId é o identificador gerado pela Meta. */
@Table({ tableName: "OfficialCalls" })
class OfficialCall extends Model<OfficialCall> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @AllowNull(false)
  @Column
  callId: string;

  @ForeignKey(() => Company)
  @Column
  companyId: number;

  @BelongsTo(() => Company)
  company: Company;

  @ForeignKey(() => Whatsapp)
  @Column
  whatsappId: number;

  @BelongsTo(() => Whatsapp)
  whatsapp: Whatsapp;

  @ForeignKey(() => Contact)
  @Column
  contactId: number;

  @BelongsTo(() => Contact)
  contact: Contact;

  @ForeignKey(() => Ticket)
  @Column
  ticketId: number;

  @BelongsTo(() => Ticket)
  ticket: Ticket;

  @ForeignKey(() => User)
  @Column
  userId: number;

  @BelongsTo(() => User)
  user: User;

  @Default("inbound")
  @Column
  direction: string;

  @Default("ringing")
  @Column
  status: string;

  @Column
  number: string;

  @Column
  durationSeconds: number;

  @Column
  startedAt: Date;

  @Column
  endedAt: Date;

  @Column
  endReason: string;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default OfficialCall;
