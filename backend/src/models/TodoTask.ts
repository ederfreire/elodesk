import {
  Table, Column, CreatedAt, UpdatedAt, Model, PrimaryKey,
  AutoIncrement, DataType, HasMany, ForeignKey, BelongsTo, Default
} from "sequelize-typescript";
import Company from "./Company";
import User from "./User";
import TodoSubtask from "./TodoSubtask";

@Table({ tableName: "TodoTasks" })
class TodoTask extends Model<TodoTask> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @Column(DataType.TEXT)
  title: string;

  @Column(DataType.TEXT)
  description: string;

  @Default("medium")
  @Column
  priority: string;

  @Default("Geral")
  @Column
  category: string;

  @Column(DataType.DATEONLY)
  dueDate: string;

  @Default(false)
  @Column
  completed: boolean;

  @Default(0)
  @Column
  sortOrder: number;

  @Default("pending")
  @Column
  status: string;

  @Column(DataType.TEXT)
  notes: string;

  @ForeignKey(() => User)
  @Column
  userId: number;

  @ForeignKey(() => Company)
  @Column
  companyId: number;

  @ForeignKey(() => User)
  @Column
  assignedToId: number;

  @ForeignKey(() => User)
  @Column
  createdById: number;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;

  @BelongsTo(() => User, "userId")
  user: User;

  @BelongsTo(() => Company)
  company: Company;

  @BelongsTo(() => User, "assignedToId")
  assignedTo: User;

  @BelongsTo(() => User, "createdById")
  createdBy: User;

  @HasMany(() => TodoSubtask)
  subtasks: TodoSubtask[];
}

export default TodoTask;
