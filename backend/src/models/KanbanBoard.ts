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
  Default
} from "sequelize-typescript";
import Company from "./Company";
import User from "./User";

@Table({ tableName: "KanbanBoards" })
class KanbanBoard extends Model<KanbanBoard> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @Column
  name: string;

  @AllowNull(true)
  @Column
  description: string;

  @AllowNull(true)
  @Column
  icon: string;

  @AllowNull(true)
  @Default("#4E93FF")
  @Column
  color: string;

  @AllowNull(true)
  @Column
  category: string;

  @AllowNull(true)
  @Column
  tagIds: string;

  @AllowNull(true)
  @Column
  laneOrder: string;

  @Default(false)
  @Column
  isShared: boolean;

  @Default(false)
  @Column
  isDefault: boolean;

  @ForeignKey(() => Company)
  @Column
  companyId: number;

  @BelongsTo(() => Company)
  company: Company;

  @ForeignKey(() => User)
  @Column
  userId: number;

  @BelongsTo(() => User)
  user: User;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default KanbanBoard;