import {
  Table,
  Column,
  CreatedAt,
  UpdatedAt,
  Model,
  PrimaryKey,
  AutoIncrement,
  AllowNull,
  ForeignKey,
  BelongsTo,
  Default,
  DataType
} from "sequelize-typescript";
import Prompt from "./Prompt";
import Company from "./Company";

@Table({ tableName: "PromptKnowledgeBases" })
class PromptKnowledgeBase extends Model<PromptKnowledgeBase> {
  @PrimaryKey
  @AutoIncrement
  @Column
  id: number;

  @AllowNull(false)
  @Column
  name: string;

  @AllowNull(false)
  @Column
  type: string; // "text" | "url" | "pdf" | "doc" | "audio" | "video"

  @AllowNull(true)
  @Column(DataType.TEXT)
  content: string; // texto direto ou URL

  @AllowNull(true)
  @Column
  mediaUrl: string; // caminho do arquivo uploaded

  @AllowNull(true)
  @Column
  mediaType: string; // mimetype

  @AllowNull(true)
  @Column
  originalName: string; // nome original do arquivo

  @Default(true)
  @Column
  active: boolean;

  @ForeignKey(() => Prompt)
  @Column
  promptId: number;

  @BelongsTo(() => Prompt)
  prompt: Prompt;

  @ForeignKey(() => Company)
  @Column
  companyId: number;

  @BelongsTo(() => Company)
  company: Company;

  @CreatedAt
  createdAt: Date;

  @UpdatedAt
  updatedAt: Date;
}

export default PromptKnowledgeBase;
