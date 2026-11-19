import {
  Table,
  Column,
  CreatedAt,
  UpdatedAt,
  Model,
  PrimaryKey,
  AutoIncrement,
  AllowNull,
  Unique,
  Default
} from "sequelize-typescript";

@Table
class Plan extends Model<Plan> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @AllowNull(false)
  @Unique
  @Column
  name: string;

  @Column
  users: number;

  @Column
  connections: number;

  @Column
  queues: number;

  @Column
  amount: string;   

  @Column
  useWhatsapp: boolean;   

  @Column
  useFacebook: boolean;   

  @Column
  useInstagram: boolean;   
  
  @Column
  useCampaigns: boolean;   

  @Column
  useSchedules: boolean;   

  @Column
  useInternalChat: boolean;   
  
  @Column
  useExternalApi: boolean;   

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;

  @Column
  useKanban: boolean;

  @Column
  trial: boolean;

  @Column
  trialDays: number;

  @Column
  recurrence: string;

  @Column
  useOpenAi: boolean;

  @Column
  useIntegrations: boolean;

  @Default(true)
  @Column
  isPublic: boolean;

  @Default(false)
  @Column
  useWhatsappOfficial: boolean;

  @Default(false)
  @Column
  wavoip: boolean;

  @Default(true)
  @Column
  useFlows: boolean;

  @Default(true)
  @Column
  useContacts: boolean;

  @Default(true)
  @Column
  useDashboard: boolean;

  @Default(true)
  @Column
  useRealTime: boolean;

  @Default(false)
  @Column
  useTelegram: boolean;

  @Default(false)
  @Column
  useN8n: boolean;

  @Default(false)
  @Column
  useZapi: boolean;

  @Default(false)
  @Column
  useWhatsappEmbeddedSignup: boolean;

  @Default(true)
  @Column
  useWebchat: boolean;

  @Default(true)
  @Column
  useWacalls: boolean;

  // Campanha de voz (ligar e tocar áudio). Separado de useCampaigns porque
  // ligação consome chamada simultânea no servidor e tem risco de bloqueio
  // bem maior que mensagem. Padrão desligado: recurso novo, ninguém perde
  // nada por não vir habilitado.
  @Default(false)
  @Column
  useVoiceCampaign: boolean;

  // Links UTM (origem do lead) e Agentes Comerciais (com os Modelos de
  // Agente): opções próprias do plano, independentes de Campanhas.
  @Default(true)
  @Column
  useUtmLinks: boolean;

  @Default(true)
  @Column
  useSalesAgents: boolean;
}

export default Plan;
