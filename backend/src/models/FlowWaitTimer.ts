import {
  Table, Column, CreatedAt, UpdatedAt, Model, PrimaryKey,
  AutoIncrement, DataType, ForeignKey, Default
} from "sequelize-typescript";
import Company from "./Company";
import Ticket from "./Ticket";
import Whatsapp from "./Whatsapp";

/**
 * Persistência dos timers do nó "Aguardar Resposta do Cliente" (waitInput).
 * Permite que lembretes/timeouts sobrevivam a reinícios do backend.
 */
@Table({ tableName: "FlowWaitTimers" })
class FlowWaitTimer extends Model<FlowWaitTimer> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @ForeignKey(() => Ticket)
  @Column
  ticketId: number;

  @Column
  nodeId: string;

  @ForeignKey(() => Company)
  @Column
  companyId: number;

  @ForeignKey(() => Whatsapp)
  @Column
  whatsappId: number;

  @Column
  flowId: number;

  @Column(DataType.STRING)
  hashFlowId: string;

  @Column(DataType.STRING)
  numberClient: string;

  @Column(DataType.TEXT)
  reminderMessage: string;

  @Column(DataType.DATE)
  reminderAt: Date;

  @Default(false)
  @Column
  reminderSent: boolean;

  @Column(DataType.DATE)
  timeoutAt: Date;

  @Default("continueFlow")
  @Column(DataType.STRING)
  timeoutAction: string;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default FlowWaitTimer;
