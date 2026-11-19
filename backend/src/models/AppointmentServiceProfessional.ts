import {
  AllowNull,
  Column,
  ForeignKey,
  Model,
  PrimaryKey,
  Table
} from "sequelize-typescript";
import AppointmentService from "./AppointmentService";
import User from "./User";

@Table({ tableName: "AppointmentServiceProfessionals", timestamps: false })
class AppointmentServiceProfessional extends Model<AppointmentServiceProfessional> {
  @ForeignKey(() => AppointmentService)
  @PrimaryKey
  @AllowNull(false)
  @Column
  serviceId: number;

  @ForeignKey(() => User)
  @PrimaryKey
  @AllowNull(false)
  @Column
  professionalId: number;
}

export default AppointmentServiceProfessional;
