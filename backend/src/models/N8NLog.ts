import {
  Model, Table, Column, PrimaryKey, AutoIncrement, DataType, CreatedAt, UpdatedAt, BelongsTo, ForeignKey
} from "sequelize-typescript";
import Ticket from "./Ticket";
import Contact from "./Contact";

@Table({ tableName: "N8NLogs" })
export default class N8NLog extends Model<N8NLog> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @Column
  companyId: number;

  @Column
  nodeType: string;

  @Column(DataType.TEXT)
  webhookUrl: string;

  @ForeignKey(() => Ticket)
  @Column
  ticketId: number;

  @BelongsTo(() => Ticket)
  ticket: Ticket;

  @ForeignKey(() => Contact)
  @Column
  contactId: number;

  @BelongsTo(() => Contact)
  contact: Contact;

  @Column({ defaultValue: "pending" })
  status: string;

  @Column(DataType.JSON)
  requestPayload: any;

  @Column(DataType.JSON)
  responseData: any;

  @Column(DataType.TEXT)
  errorMessage: string;

  @Column
  duration: number;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}
