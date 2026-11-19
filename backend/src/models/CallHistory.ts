import {
  Table,
  Column,
  Model,
  PrimaryKey,
  AutoIncrement,
  ForeignKey,
  CreatedAt,
  Default,
  BelongsTo
} from "sequelize-typescript";
import User from "./User";
import Whatsapp from "./Whatsapp";
import Contact from "./Contact";
import Company from "./Company";

@Table({
  tableName: "CallHistory",
  timestamps: false 
})
class CallHistory extends Model<CallHistory> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @ForeignKey(() => User)
  @Column
  user_id: number;

  @BelongsTo(() => User)
  user: User;

  @BelongsTo(() => Company)
  company: Company;

  @Column
  token_wavoip: string;

  @ForeignKey(() => Whatsapp)
  @Column
  whatsapp_id: number;

  @BelongsTo(() => Whatsapp)
  whatsapp: Whatsapp;

  @ForeignKey(() => Contact)
  @Column
  contact_id: number;

  @BelongsTo(() => Contact)
  contact: Contact;

  @ForeignKey(() => Company)
  @Column
  company_id: number;

  @Column
  phone_to: string;

  @Column
  name: string;

  @Column
  url: string;

  @Default("PENDING")
  @Column
  status: string;

  @Default("OUTGOING")
  @Column
  direction: string;

  @Default(0)
  @Column
  duration: number;

  @CreatedAt
  @Default(new Date())
  @Column
  createdAt: Date;

  @CreatedAt
  @Default(new Date())
  @Column
  updatedAt: Date;
}

export default CallHistory;
