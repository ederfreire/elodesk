import {
  Table, Column, CreatedAt, UpdatedAt, Model, PrimaryKey,
  AutoIncrement, ForeignKey, BelongsTo, Default, AllowNull, Unique
} from "sequelize-typescript";

import Company from "./Company";

/**
 * Link de campanha com parametros UTM.
 *
 * COMO A ATRIBUICAO FUNCIONA
 * UTM na URL funciona quando o destino e um site, que le a query string. Mas
 * aqui o destino e o WhatsApp: o wa.me descarta qualquer parametro que nao
 * seja `text`, e o app nao repassa nada disso para a conversa. Entao o unico
 * canal de informacao que sobrevive do anuncio ate o atendimento e o TEXTO da
 * primeira mensagem.
 *
 * Por isso cada link ganha um `code` curto, embutido na mensagem
 * pre-preenchida. Quando a primeira mensagem do lead chega com esse codigo, o
 * contato e ligado ao link — e com ele a todos os UTMs.
 */
@Table({ tableName: "UtmLinks" })
class UtmLink extends Model<UtmLink> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @AllowNull(false)
  @Column
  name: string;

  @AllowNull(false)
  @Column
  source: string;

  @Column
  medium: string;

  @Column
  campaign: string;

  @Column
  content: string;

  @Column
  term: string;

  @Column
  whatsappNumber: string;

  @Column
  message: string;

  @Unique
  @AllowNull(false)
  @Column
  code: string;

  @Default(0)
  @Column
  clicks: number;

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

export default UtmLink;
