import {
  Table,
  Column,
  CreatedAt,
  UpdatedAt,
  Model,
  PrimaryKey,
  AutoIncrement,
  DataType,
  BelongsTo,
  ForeignKey,
  Default
} from "sequelize-typescript";
import Company from "./Company";
import Contact from "./Contact";
import Ticket from "./Ticket";
import User from "./User";
import Whatsapp from "./Whatsapp";
import Queue from "./Queue";

@Table
class Schedule extends Model<Schedule> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @Column(DataType.TEXT)
  body: string;

  @Column
  sendAt: Date;

  @Column
  sentAt: Date;

  @ForeignKey(() => Contact)
  @Column
  contactId: number;

  @ForeignKey(() => Ticket)
  @Column
  ticketId: number;

  @ForeignKey(() => User)
  @Column
  userId: number;

  @ForeignKey(() => Company)
  @Column
  companyId: number;

  @Column(DataType.STRING)
  status: string;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;

  @BelongsTo(() => Contact, "contactId")
  contact: Contact;

  @BelongsTo(() => Ticket)
  ticket: Ticket;

  @BelongsTo(() => User)
  user: User;

  @BelongsTo(() => Company)
  company: Company;

  @ForeignKey(() => User)
  @Column
  ticketUserId: number;

  @BelongsTo(() => User, "ticketUserId")
  ticketUser: User;

  @ForeignKey(() => Queue)
  @Column
  queueId: number;

  @BelongsTo(() => Queue)
  queue: Queue;

  @Column({ defaultValue: "closed" })
  statusTicket: string;

  @Column({ defaultValue: "disabled" })
  openTicket: string;

  @Column
  mediaPath: string;

  @Column
  mediaName: string;

  @ForeignKey(() => Whatsapp)
  @Column
  whatsappId: number;

  @BelongsTo(() => Whatsapp)
  whatsapp: Whatsapp;

  @Column
  intervalo: number;

  @Column
  valorIntervalo: number;

  @Column
  enviarQuantasVezes: number;

  @Column
  tipoDias: number;

  @Column
  contadorEnvio: number;

  @Default(false)
  @Column
  assinar: boolean;

  // ✅ Campos para lembrete
  @Column
  reminderDate: Date;

  @Column(DataType.TEXT)
  reminderMessage: string;

  @Column
  reminderSentAt: Date;

  @Column
  reminderStatus: string;

  // ── Integração com o Google Agenda & Meet ────────────────────────────────
  //
  // Escolha do operador no modal de agendamento. O padrão vem das
  // preferências da empresa (GoogleCalendarIntegration), mas pode ser
  // desligado caso a caso.
  @Default(false)
  @Column
  googleSync: boolean;

  @Default(false)
  @Column
  googleMeet: boolean;

  // Título do evento na agenda. Separado do `body` de propósito: o texto que
  // vai pro WhatsApp e o que aparece na agenda do profissional raramente são
  // o mesmo.
  @Column
  googleEventTitle: string;

  // Minutos. Nulo = usa a duração padrão da empresa.
  @Column
  googleEventDuration: number;

  // Devolvidos pelo Google. O `googleEventId` é o que permite ATUALIZAR e
  // APAGAR o evento depois — sem ele, mudar ou excluir o agendamento
  // deixaria um evento órfão na agenda do cliente.
  @Column
  googleEventId: string;

  @Column
  googleMeetLink: string;

  @Column
  googleEventLink: string;
}

export default Schedule;
