import {
  Table,
  Column,
  CreatedAt,
  UpdatedAt,
  Model,
  PrimaryKey,
  AutoIncrement,
  ForeignKey,
  BelongsTo,
  DataType,
  Default,
  AllowNull
} from "sequelize-typescript";
import Company from "./Company";
import AppointmentService from "./AppointmentService";
import User from "./User";
import Contact from "./Contact";
import Ticket from "./Ticket";

@Table({ tableName: "AppointmentBookings" })
class AppointmentBooking extends Model<AppointmentBooking> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @ForeignKey(() => Company)
  @AllowNull(false)
  @Column
  companyId: number;

  @BelongsTo(() => Company)
  company: Company;

  @ForeignKey(() => AppointmentService)
  @AllowNull(false)
  @Column
  serviceId: number;

  @BelongsTo(() => AppointmentService)
  service: AppointmentService;

  @ForeignKey(() => User)
  @AllowNull(false)
  @Column
  professionalId: number;

  @BelongsTo(() => User, "professionalId")
  professional: User;

  @ForeignKey(() => Contact)
  @Column
  contactId: number;

  @BelongsTo(() => Contact)
  contact: Contact;

  @ForeignKey(() => Ticket)
  @Column
  ticketId: number;

  @BelongsTo(() => Ticket)
  ticket: Ticket;

  @AllowNull(false)
  @Column(DataType.DATE)
  startsAt: Date;

  @AllowNull(false)
  @Column(DataType.DATE)
  endsAt: Date;

  @AllowNull(false)
  @Default("confirmed")
  @Column
  status: string;

  @Column
  googleEventId: string;

  @Column
  googleEventLink: string;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default AppointmentBooking;
