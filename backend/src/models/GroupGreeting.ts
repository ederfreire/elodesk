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
  DataType,
  Default,
  AllowNull
} from "sequelize-typescript";

import Company from "./Company";
import Whatsapp from "./Whatsapp";

/**
 * Saudação enviada quando alguém entra num grupo.
 * Uma linha por (empresa, conexão, grupo).
 */
@Table({ tableName: "GroupGreetings" })
class GroupGreeting extends Model<GroupGreeting> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

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

  @AllowNull(false)
  @Column
  groupJid: string;

  @Default(false)
  @Column
  enabled: boolean;

  @Default(true)
  @Column
  sendInGroup: boolean;

  @Default(false)
  @Column
  sendInPrivate: boolean;

  @Column(DataType.TEXT)
  message: string;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default GroupGreeting;
