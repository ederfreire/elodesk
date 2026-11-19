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
  Default,
  AllowNull
} from "sequelize-typescript";

import Company from "./Company";

/**
 * Origem do lead: de onde o contato veio (Facebook Ads, Indicacao, etc).
 *
 * A lista e por empresa e editavel em Configuracoes, e nao uma constante no
 * codigo: cada operacao anuncia em canais diferentes, e travar a lista
 * obrigaria a mexer no sistema toda vez que uma campanha nova entrasse no ar.
 */
@Table({ tableName: "LeadSources" })
class LeadSource extends Model<LeadSource> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @AllowNull(false)
  @Column
  name: string;

  // Chave do icone (facebook, instagram, google, tiktok, youtube, organic,
  // referral, other). O desenho fica no frontend.
  @Default("other")
  @Column
  icon: string;

  @Default("#64748b")
  @Column
  color: string;

  @Default(0)
  @Column
  order: number;

  @Default(true)
  @Column
  active: boolean;

  @ForeignKey(() => Company)
  @AllowNull(false)
  @Column
  companyId: number;

  @BelongsTo(() => Company)
  company: Company;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default LeadSource;
