import {
  Table, Column, CreatedAt, UpdatedAt, Model, PrimaryKey, AutoIncrement,
  Default, AllowNull, DataType, HasMany, BelongsToMany
} from "sequelize-typescript";

import Company from "./Company";
import CourseLesson from "./CourseLesson";
import CourseCompany from "./CourseCompany";

/**
 * Área de membros — Curso.
 *
 * Criado e gerenciado pelo admin do SaaS (super). A visibilidade é por empresa:
 * o admin escolhe quais empresas veem cada curso, pela tabela de junção
 * CourseCompany. Um curso sem nenhuma empresa vinculada fica visível só para o
 * admin (rascunho, na prática).
 */
@Table({ tableName: "Courses" })
class Course extends Model<Course> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @AllowNull(false)
  @Column
  title: string;

  @AllowNull(true)
  @Column(DataType.TEXT)
  description: string;

  /** Imagem de capa (URL). Opcional. */
  @AllowNull(true)
  @Column(DataType.TEXT)
  coverUrl: string;

  @Default(true)
  @Column
  active: boolean;

  @Default(0)
  @Column
  sortOrder: number;

  @HasMany(() => CourseLesson)
  lessons: CourseLesson[];

  @BelongsToMany(() => Company, () => CourseCompany)
  companies: Company[];

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default Course;
