import {
  Model,
  Table,
  Column,
  PrimaryKey,
  AutoIncrement,
  ForeignKey,
  BelongsTo,
  DataType,
  CreatedAt,
  UpdatedAt,
  Default,
  AllowNull
} from "sequelize-typescript";
import Company from "./Company";

@Table({ tableName: "GoogleCalendarIntegrations" })
class GoogleCalendarIntegration extends Model<GoogleCalendarIntegration> {
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

  @Column
  googleEmail: string;

  @Column(DataType.TEXT)
  accessToken: string;

  @Column(DataType.TEXT)
  refreshToken: string;

  @Column
  tokenExpiresAt: Date;

  @Default("primary")
  @Column
  calendarId: string;

  @Default(30)
  @Column
  defaultDuration: number;

  @Default("America/Sao_Paulo")
  @Column
  timezone: string;

  @Default(true)
  @Column
  isActive: boolean;

  // ── Preferências do Meet e dos agendamentos ──────────────────────────────
  //
  // Padrões que a tela de Agendamento herda ao abrir um agendamento novo.

  /** Cria um link de videoconferência exclusivo em cada agendamento. */
  @Default(true)
  @Column
  autoMeet: boolean;

  /** Insere os agendamentos marcados no calendário do Google. */
  @Default(true)
  @Column
  syncEvents: boolean;

  /**
   * Convite automático por e-mail ao contato, quando ele tiver e-mail.
   * Desligado por padrão: mandar convite de Google sem o cliente esperar
   * gera reclamação, e ainda expõe o e-mail da conta conectada.
   */
  @Default(false)
  @Column
  sendInvite: boolean;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default GoogleCalendarIntegration;
