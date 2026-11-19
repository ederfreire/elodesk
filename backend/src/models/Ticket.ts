import {
  Table,
  Column,
  CreatedAt,
  UpdatedAt,
  Model,
  PrimaryKey,
  ForeignKey,
  BelongsTo,
  HasMany,
  AutoIncrement,
  Default,
  BeforeCreate,
  BeforeUpdate,
  AfterUpdate,
  BelongsToMany,
  AllowNull,
  DataType
} from "sequelize-typescript";
import { v4 as uuidv4 } from "uuid";

import Contact from "./Contact";
import Message from "./Message";
import Queue from "./Queue";
import User from "./User";
import Whatsapp from "./Whatsapp";
import Company from "./Company";
import Tag from "./Tag";
import TicketTag from "./TicketTag";
import QueueIntegrations from "./QueueIntegrations";
import Prompt from "./Prompt";
import { format } from "date-fns";

@Table
class Ticket extends Model<Ticket> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @Column({ defaultValue: "pending" })
  status: string;

  @Column
  unreadMessages: number;

  @Column
  lastMessage: string;

  @Default(false)
  @Column
  isGroup: boolean;

  @Column
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;

  @ForeignKey(() => User)
  @Column
  userId: number;

  @BelongsTo(() => User)
  user: User;

  @ForeignKey(() => Contact)
  @Column
  contactId: number;

  @BelongsTo(() => Contact)
  contact: Contact;

  @ForeignKey(() => Whatsapp)
  @Column
  whatsappId: number;

  @BelongsTo(() => Whatsapp)
  whatsapp: Whatsapp;

  @ForeignKey(() => Queue)
  @Column
  queueId: number;

  @BelongsTo(() => Queue)
  queue: Queue;

  @Default(false)
  @Column
  isBot: boolean;

  @HasMany(() => Message)
  messages: Message[];

  @HasMany(() => TicketTag)
  ticketTags: TicketTag[];

  @BelongsToMany(() => Tag, () => TicketTag)
  tags: Tag[];

  @ForeignKey(() => Company)
  @Column
  companyId: number;

  @BelongsTo(() => Company)
  company: Company;

  @Default(uuidv4())
  @Column
  uuid: string;

  @Default("whatsapp")
  @Column
  channel: string;

  @AllowNull(false)
  @Default(0)
  @Column
  amountUsedBotQueues: number;

  @AllowNull(false)
  @Default(0)
  @Column
  amountUsedBotQueuesNPS: number;

  @BeforeCreate
  static setUUID(ticket: Ticket) {
    ticket.uuid = uuidv4();
  }

  /**
   * ASSUNTO DO ENCERRAMENTO — preenchido aqui, e não em cada rotina.
   *
   * Mais de vinte pontos do sistema fecham ticket direto (fluxo, bot,
   * Typebot, webhook, importação, chamadas). Nenhum gravava assunto, e o
   * relatório de fechamento ficava quase todo com "-". Editar cada um seria
   * arriscado e ainda deixaria de fora os que viessem depois — por isso a
   * regra mora no modelo: qualquer caminho que feche um ticket passa por aqui.
   *
   * Só preenche quando está vazio, então um assunto escrito pelo atendente
   * nunca é sobrescrito. A distinção usa o userId: encerramento com atendente
   * é manual; sem atendente é rotina automática.
   */
  @BeforeUpdate
  static registrarAssuntoDeFechamento(ticket: Ticket) {
    try {
      if (!ticket.changed("status") || ticket.status !== "closed") return;

      const assuntoAtual = String((ticket as any).closingSubject || "").trim();
      if (assuntoAtual) return;

      const motivo = String((ticket as any).motivoFinalizacao || "").trim();
      if (motivo) {
        (ticket as any).closingSubject = motivo;
        return;
      }

      (ticket as any).closingSubject = ticket.userId
        ? "Encerrado pelo atendente"
        : "Encerrado automaticamente";
    } catch (e) {
      // Nunca impedir o encerramento por causa do assunto.
    }
  }

  /**
   * DATA DE FECHAMENTO — a coluna do relatório vem de TicketTraking.finishedAt,
   * que as rotinas automáticas também não preenchiam. Sem isso, a duração do
   * atendimento era contada até "agora", e aparecia "14d" num ticket fechado
   * há semanas.
   */
  @AfterUpdate
  static async registrarDataDeFechamento(ticket: Ticket) {
    try {
      if (ticket.status !== "closed") return;

      // Só na TRANSIÇÃO para fechado. Depender de changed() aqui seria frágil
      // (o estado já foi salvo) e, sem este corte, toda atualização em um
      // ticket já fechado faria uma consulta extra à toa.
      const anterior =
        typeof (ticket as any).previous === "function"
          ? (ticket as any).previous("status")
          : undefined;
      if (anterior === "closed") return;

      // Import local: no topo criaria dependência circular entre os modelos.
      // eslint-disable-next-line @typescript-eslint/no-var-requires, global-require
      const TicketTraking = require("./TicketTraking").default;

      const traking = await TicketTraking.findOne({
        where: { ticketId: ticket.id },
        order: [["createdAt", "DESC"]]
      });

      if (traking && !traking.finishedAt) {
        await traking.update({ finishedAt: new Date() });
      }
    } catch (e) {
      // Idem: relatório incompleto é menos grave que travar o encerramento.
    }
  }

  @Default(false)
  @Column
  fromMe: boolean;

  @Default(false)
  @Column
  sendInactiveMessage: boolean;

  @Column
  lgpdSendMessageAt: Date;

  @Column
  lgpdAcceptedAt: Date;

  @Column
  imported: Date;

  @Default(false)
  @Column
  isOutOfHour: boolean;

  @Default(false)
  @Column
  useIntegration: boolean;

  @ForeignKey(() => QueueIntegrations)
  @Column
  integrationId: number;

  @BelongsTo(() => QueueIntegrations)
  queueIntegration: QueueIntegrations;

  @Column
  isActiveDemand: boolean;

  @Column
  typebotSessionId: string;

  @Default(false)
  @Column
  typebotStatus: boolean;

  @Column
  typebotSessionTime: Date;

  @Column
  flowWebhook: boolean;

  @Column
  lastFlowId: string;

  @Column
  hashFlowId: string;

  @Column
  flowStopped: string;

  @Column(DataType.JSON)
  dataWebhook: {} | null;

  @AllowNull(false)
  @Default(0)
  @Column
  maxUseInactiveTime: number;

  @Column({ type: DataType.FLOAT, allowNull: true })
  valorVenda: number | null;

  @Column({ type: DataType.STRING, allowNull: true })
  motivoNaoVenda: string | null;

  @Column({ type: DataType.STRING, allowNull: true })
  motivoFinalizacao: string | null;

  @Default(false)
  @Column
  finalizadoComVenda: boolean;

  @Column({ type: DataType.STRING, allowNull: true })
  closingSubject: string | null;

  @Column({ type: DataType.TEXT, allowNull: true })
  closingSummary: string | null;

  @ForeignKey(() => Prompt)
  @Column
  promptId: number;

  @BelongsTo(() => Prompt)
  prompt: Prompt;

  @Column
  aiModel: string;
}

export default Ticket;
