import {
  Table, Column, CreatedAt, UpdatedAt, Model, PrimaryKey, AutoIncrement,
  ForeignKey, BelongsTo, Default, AllowNull, DataType, HasMany
} from "sequelize-typescript";

import Course from "./Course";
import CourseComment from "./CourseComment";

/**
 * Aula de um curso.
 *
 * kind define o tipo de conteúdo:
 *  - "video": vídeo do YouTube (contentUrl = link/ID do YouTube)
 *  - "pdf":   documento (contentUrl = URL do PDF)
 *  - "text":  conteúdo em texto (body = markdown/HTML simples)
 *
 * Uma aula pode ter texto de apoio (body) além do vídeo/pdf.
 */
@Table({ tableName: "CourseLessons" })
class CourseLesson extends Model<CourseLesson> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @AllowNull(false)
  @Column
  title: string;

  /** "video" | "pdf" | "text" */
  @AllowNull(false)
  @Default("video")
  @Column
  kind: string;

  /** Link do YouTube (video) ou URL do PDF (pdf). Vazio para "text". */
  @AllowNull(true)
  @Column(DataType.TEXT)
  contentUrl: string;

  /** Texto de apoio da aula (descrição/conteúdo). */
  @AllowNull(true)
  @Column(DataType.TEXT)
  body: string;

  @Default(0)
  @Column
  sortOrder: number;

  @Default(true)
  @Column
  active: boolean;

  @ForeignKey(() => Course)
  @AllowNull(false)
  @Column
  courseId: number;

  @BelongsTo(() => Course)
  course: Course;

  @HasMany(() => CourseComment)
  comments: CourseComment[];

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default CourseLesson;
