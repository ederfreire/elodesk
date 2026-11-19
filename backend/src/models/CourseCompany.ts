import {
  Table, Column, CreatedAt, UpdatedAt, Model, PrimaryKey, AutoIncrement,
  ForeignKey
} from "sequelize-typescript";

import Course from "./Course";
import Company from "./Company";

/**
 * Junção Curso <-> Empresa: define quais empresas enxergam cada curso.
 * O admin do SaaS gerencia esses vínculos.
 */
@Table({ tableName: "CourseCompanies" })
class CourseCompany extends Model<CourseCompany> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @ForeignKey(() => Course)
  @Column
  courseId: number;

  @ForeignKey(() => Company)
  @Column
  companyId: number;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default CourseCompany;
