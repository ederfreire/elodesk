import {
  Table,
  Column,
  CreatedAt,
  UpdatedAt,
  Model,
  PrimaryKey,
  AutoIncrement,
  AllowNull,
  BelongsTo,
  ForeignKey,
} from "sequelize-typescript";
import Company from "./Company";
import User from "./User";

@Table
class CompanyKanbanConfig extends Model<CompanyKanbanConfig> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @ForeignKey(() => Company)
  @Column
  companyId: number;

  @ForeignKey(() => User)
  @Column
  userId: number;

  @AllowNull(true)
  @Column
  laneOrder: string;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;

  @BelongsTo(() => Company)
  company: Company;

  @BelongsTo(() => User)
  user: User;
}

export default CompanyKanbanConfig;
