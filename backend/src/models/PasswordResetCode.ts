import {
  Table, Column, CreatedAt, UpdatedAt, Model,
  DataType, PrimaryKey, AutoIncrement, Default,
  ForeignKey, BelongsTo
} from "sequelize-typescript";
import User from "./User";

@Table({ tableName: "PasswordResetCodes" })
class PasswordResetCode extends Model<PasswordResetCode> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @ForeignKey(() => User)
  @Column
  userId: number;

  @BelongsTo(() => User)
  user: User;

  @Column
  code: string;

  @Column
  resetToken: string;

  @Column(DataType.DATE)
  expiresAt: Date;

  @Default(false)
  @Column
  used: boolean;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default PasswordResetCode;
