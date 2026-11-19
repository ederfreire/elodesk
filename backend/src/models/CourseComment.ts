import {
  Table, Column, CreatedAt, UpdatedAt, Model, PrimaryKey, AutoIncrement,
  ForeignKey, BelongsTo, AllowNull, DataType, HasMany
} from "sequelize-typescript";

import CourseLesson from "./CourseLesson";
import User from "./User";
import Company from "./Company";

/**
 * Comentário de uma aula, em thread.
 *
 * parentId nulo = comentário raiz. parentId preenchido = resposta a outro
 * comentário. Guardamos userId (quem escreveu) e companyId (de qual empresa),
 * para exibir autor e para o admin do SaaS ver de qual empresa veio.
 */
@Table({ tableName: "CourseComments" })
class CourseComment extends Model<CourseComment> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @AllowNull(false)
  @Column(DataType.TEXT)
  body: string;

  @ForeignKey(() => CourseLesson)
  @AllowNull(false)
  @Column
  lessonId: number;

  @BelongsTo(() => CourseLesson)
  lesson: CourseLesson;

  /** Comentário pai (para respostas). Nulo = comentário raiz. */
  @ForeignKey(() => CourseComment)
  @AllowNull(true)
  @Column
  parentId: number;

  @BelongsTo(() => CourseComment, { foreignKey: "parentId", as: "parent" })
  parent: CourseComment;

  @HasMany(() => CourseComment, { foreignKey: "parentId", as: "replies" })
  replies: CourseComment[];

  @ForeignKey(() => User)
  @AllowNull(false)
  @Column
  userId: number;

  @BelongsTo(() => User)
  user: User;

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

export default CourseComment;
