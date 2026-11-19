import {
  Table,
  Column,
  CreatedAt,
  UpdatedAt,
  Model,
  PrimaryKey,
  AutoIncrement,
  AllowNull,
  Default,
  DataType,
  ForeignKey,
  BelongsTo,
  Index
} from "sequelize-typescript";
import Company from "./Company";
import Floup from "./Floup";
import FloupSchedule from "./FloupSchedule";
import Ticket from "./Ticket";
import Contact from "./Contact";

@Table({ tableName: "FloupStepEvents" })
class FloupStepEvent extends Model<FloupStepEvent> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id!: number;

  @ForeignKey(() => Company)
  @Column
  companyId!: number;

  @BelongsTo(() => Company)
  company!: Company;

  @ForeignKey(() => Floup)
  @Column
  floupId!: number;

  @BelongsTo(() => Floup)
  floup!: Floup;

  @ForeignKey(() => FloupSchedule)
  @AllowNull(true)
  @Column
  scheduleId!: number;

  @BelongsTo(() => FloupSchedule)
  schedule!: FloupSchedule;

  @ForeignKey(() => Contact)
  @AllowNull(true)
  @Column
  contactId!: number;

  @BelongsTo(() => Contact)
  contact!: Contact;

  @ForeignKey(() => Ticket)
  @AllowNull(true)
  @Column
  ticketId!: number;

  @BelongsTo(() => Ticket)
  ticket!: Ticket;

  // Index of the step within floup.steps that was executed
  @Column
  stepIndex!: number;

  @AllowNull(true)
  @Column
  stepOrder!: number;

  // Snapshot of the step data at execution time
  @AllowNull(true)
  @Column(DataType.JSON)
  stepData!: any;

  // COMPLETED | ERROR
  @Default("COMPLETED")
  @Column
  status!: string;

  @AllowNull(true)
  @Column(DataType.TEXT)
  errorMessage!: string | null;

  @Column
  executedAt!: Date;

  @CreatedAt
  createdAt!: Date;

  @UpdatedAt
  updatedAt!: Date;
}

export default FloupStepEvent;
