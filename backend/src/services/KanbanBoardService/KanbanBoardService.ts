import { Op } from "sequelize";
import KanbanBoard from "../../models/KanbanBoard";
import Tag from "../../models/Tag";
import User from "../../models/User";
import AppError from "../../errors/AppError";
import { BOARD_TEMPLATES, findTemplate } from "./templates";

interface BaseParams {
  companyId: number;
  userId: number;
}

interface CreateParams extends BaseParams {
  name: string;
  description?: string;
  icon?: string;
  color?: string;
  category?: string;
  tagIds?: number[];
  laneOrder?: string[];
  isShared?: boolean;
  templateKey?: string;
}

const serialize = (board: KanbanBoard) => {
  const data: any = board.toJSON();
  try { data.tagIds = data.tagIds ? JSON.parse(data.tagIds) : []; } catch { data.tagIds = []; }
  try { data.laneOrder = data.laneOrder ? JSON.parse(data.laneOrder) : []; } catch { data.laneOrder = []; }
  return data;
};

export const listBoards = async (
  { companyId, userId }: BaseParams,
  options: { all?: boolean } = {}
) => {
  const where: any = { companyId };
  if (!options.all) {
    where[Op.or as any] = [{ userId }, { isShared: true }];
  }
  const boards = await KanbanBoard.findAll({
    where,
    include: [{ model: User, attributes: ["id", "name"] }],
    order: [["isDefault", "DESC"], ["name", "ASC"]]
  });
  return boards.map(serialize);
};

export const getTemplates = () => BOARD_TEMPLATES;

const ensureTagsForTemplate = async (
  companyId: number,
  templateKey: string
): Promise<number[]> => {
  const template = findTemplate(templateKey);
  if (!template) throw new AppError("Template não encontrado", 404);

  const tagIds: number[] = [];
  for (const col of template.columns) {
    const tagName = `${col.name}`;
    let tag = await Tag.findOne({
      where: { companyId, name: tagName, kanban: 1 }
    });
    if (!tag) {
      tag = await Tag.create({
        name: tagName,
        color: col.color,
        kanban: 1,
        companyId
      } as any);
    }
    tagIds.push(tag.id);
  }
  return tagIds;
};

export const createBoard = async (params: CreateParams) => {
  let tagIds = params.tagIds || [];
  let laneOrder = params.laneOrder || [];
  let category = params.category;
  let icon = params.icon;
  let color = params.color;
  let description = params.description;

  if (params.templateKey) {
    const template = findTemplate(params.templateKey);
    if (!template) throw new AppError("Template não encontrado", 404);
    tagIds = await ensureTagsForTemplate(params.companyId, params.templateKey);
    laneOrder = ["lane0", ...tagIds.map(id => String(id))];
    category = category || template.category;
    icon = icon || template.icon;
    color = color || template.color;
    description = description || template.description;
  }

  const board = await KanbanBoard.create({
    name: params.name,
    description,
    icon,
    color: color || "#4E93FF",
    category,
    tagIds: JSON.stringify(tagIds),
    laneOrder: JSON.stringify(laneOrder),
    isShared: !!params.isShared,
    companyId: params.companyId,
    userId: params.userId
  } as any);

  return serialize(board);
};

export const updateBoard = async (
  id: number,
  data: Partial<CreateParams> & BaseParams
) => {
  const board = await KanbanBoard.findByPk(id);
  if (!board) throw new AppError("Board não encontrado", 404);
  if (board.companyId !== data.companyId) throw new AppError("Sem permissão", 403);
  if (board.userId !== data.userId && !board.isShared) {
    throw new AppError("Sem permissão para editar", 403);
  }

  const patch: any = {};
  if (data.name !== undefined) patch.name = data.name;
  if (data.description !== undefined) patch.description = data.description;
  if (data.icon !== undefined) patch.icon = data.icon;
  if (data.color !== undefined) patch.color = data.color;
  if (data.category !== undefined) patch.category = data.category;
  if (data.isShared !== undefined) patch.isShared = data.isShared;
  if (data.tagIds !== undefined) patch.tagIds = JSON.stringify(data.tagIds);
  if (data.laneOrder !== undefined) patch.laneOrder = JSON.stringify(data.laneOrder);

  await board.update(patch);
  return serialize(board);
};

export const deleteBoard = async (id: number, { companyId, userId }: BaseParams) => {
  const board = await KanbanBoard.findByPk(id);
  if (!board) throw new AppError("Board não encontrado", 404);
  if (board.companyId !== companyId) throw new AppError("Sem permissão", 403);
  if (board.userId !== userId) throw new AppError("Apenas o dono pode excluir", 403);
  await board.destroy();
};

// addColumnToBoard / removeColumnFromBoard — corrigem o bug de "crio um
// board novo e não consigo adicionar coluna pra ele": colunas (Tag com
// kanban=1) são um recurso global da empresa, e cada KanbanBoard só mostra
// as que estiverem no seu próprio `tagIds`. Antes desta mudança, criar uma
// Tag nova em /tagsKanban nunca atualizava o `tagIds` de nenhum board — a
// Tag era criada normalmente no banco, mas ficava invisível em qualquer
// board com um board ativo selecionado (o "board padrão" só parecia
// funcionar porque, sem nenhum board criado ainda, a tela não aplica esse
// filtro e mostra todas as tags da empresa). Estas funções fazem o
// carregamento+patch do array `tagIds` no próprio backend (em vez de round-
// trip get→merge→put no frontend) pra evitar perder uma coluna adicionada
// por outra aba/usuário entre a leitura e a gravação.
export const addColumnToBoard = async (
  boardId: number,
  tagId: number,
  { companyId, userId }: BaseParams
) => {
  const board = await KanbanBoard.findByPk(boardId);
  if (!board) throw new AppError("Board não encontrado", 404);
  if (board.companyId !== companyId) throw new AppError("Sem permissão", 403);
  if (board.userId !== userId && !board.isShared) {
    throw new AppError("Sem permissão para editar", 403);
  }
  const tag = await Tag.findOne({ where: { id: tagId, companyId } });
  if (!tag) throw new AppError("Coluna (tag) não encontrada", 404);

  let tagIds: number[] = [];
  try { tagIds = board.tagIds ? JSON.parse(board.tagIds as any) : []; } catch { tagIds = []; }
  if (!tagIds.includes(tagId)) {
    tagIds = [...tagIds, tagId];
    let laneOrder: string[] = [];
    try { laneOrder = board.laneOrder ? JSON.parse(board.laneOrder as any) : []; } catch { laneOrder = []; }
    if (!laneOrder.includes(String(tagId))) laneOrder = [...laneOrder, String(tagId)];
    await board.update({ tagIds: JSON.stringify(tagIds), laneOrder: JSON.stringify(laneOrder) });
  }
  return serialize(board);
};

export const removeColumnFromBoard = async (
  boardId: number,
  tagId: number,
  { companyId, userId }: BaseParams
) => {
  const board = await KanbanBoard.findByPk(boardId);
  if (!board) throw new AppError("Board não encontrado", 404);
  if (board.companyId !== companyId) throw new AppError("Sem permissão", 403);
  if (board.userId !== userId && !board.isShared) {
    throw new AppError("Sem permissão para editar", 403);
  }

  let tagIds: number[] = [];
  try { tagIds = board.tagIds ? JSON.parse(board.tagIds as any) : []; } catch { tagIds = []; }
  let laneOrder: string[] = [];
  try { laneOrder = board.laneOrder ? JSON.parse(board.laneOrder as any) : []; } catch { laneOrder = []; }
  tagIds = tagIds.filter(id => id !== tagId);
  laneOrder = laneOrder.filter(l => l !== String(tagId));
  await board.update({ tagIds: JSON.stringify(tagIds), laneOrder: JSON.stringify(laneOrder) });
  return serialize(board);
};

export const setDefaultBoard = async (id: number, { companyId, userId }: BaseParams) => {
  const board = await KanbanBoard.findByPk(id);
  if (!board) throw new AppError("Board não encontrado", 404);
  if (board.companyId !== companyId) throw new AppError("Sem permissão", 403);

  if (board.isDefault) {
    await board.update({ isDefault: false });
    return serialize(board);
  }

  await KanbanBoard.update(
    { isDefault: false },
    { where: { companyId, userId } }
  );
  await board.update({ isDefault: true });
  return serialize(board);
};