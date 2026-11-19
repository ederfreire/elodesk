import {
  Table, Column, CreatedAt, UpdatedAt, Model, PrimaryKey,
  AutoIncrement, DataType, ForeignKey, BelongsTo, Default
} from "sequelize-typescript";
import TodoTask from "./TodoTask";

@Table({ tableName: "TodoSubtasks" })
class TodoSubtask extends Model<TodoSubtask> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @Column(DataType.TEXT)
  text: string;

  @Default(false)
  @Column
  completed: boolean;

  @Default(0)
  @Column
  sortOrder: number;

  @ForeignKey(() => TodoTask)
  @Column
  todoTaskId: number;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;

  @BelongsTo(() => TodoTask)
  todoTask: TodoTask;
}

export default TodoSubtask;
