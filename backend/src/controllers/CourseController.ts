import { Request, Response } from "express";
import { Op } from "sequelize";

import Course from "../models/Course";
import CourseLesson from "../models/CourseLesson";
import CourseComment from "../models/CourseComment";
import CourseCompany from "../models/CourseCompany";
import Company from "../models/Company";
import User from "../models/User";
import Setting from "../models/Setting";
import AppError from "../errors/AppError";

/**
 * Área de membros (Cursos).
 *
 * PERMISSÕES
 *  - Escrita (criar/editar/excluir curso, aula, vínculo de empresa, descrição
 *    da página) é só do admin do SaaS (super) — garantido pelo middleware
 *    isSuper nas rotas.
 *  - Leitura e comentários: qualquer usuário logado, limitado aos cursos que a
 *    empresa dele pode ver.
 *
 * VISIBILIDADE
 *  Um curso é visível para uma empresa se houver vínculo em CourseCompanies.
 *  O super vê todos.
 *
 * DESCRIÇÃO DA PÁGINA
 *  Guardada em Settings, na empresa do super (companyId global), sob a chave
 *  "coursesPageDescription". Assim o admin edita um texto único que todos veem.
 */

const PAGE_DESC_KEY = "coursesPageDescription";
const PAGE_TITLE_KEY = "coursesPageTitle";
const ITEM_LABEL_KEY = "coursesItemLabel";

/**
 * O JWT NÃO carrega o campo `super` (veja CreateTokens.ts: só usarname, profile,
 * id e companyId). Por isso a checagem precisa ir ao banco — era o motivo de o
 * admin ver a lista vazia e levar ERR_COURSE_NOT_ALLOWED ao abrir um curso:
 * req.user.super vinha undefined e ele era tratado como usuário comum.
 */
const isSuper = async (req: Request): Promise<boolean> => {
  try {
    const u = await User.findByPk(req.user.id, { attributes: ["id", "super"] });
    return !!u?.super;
  } catch (e) {
    return false;
  }
};

const lerSetting = async (key: string): Promise<string> => {
  const s = await Setting.findOne({ where: { key } as any });
  return s?.value || "";
};

const gravarSetting = async (key: string, value: string, companyId: number): Promise<void> => {
  const existing = await Setting.findOne({ where: { key } as any });
  if (existing) await existing.update({ value: value || "" });
  else await Setting.create({ key, value: value || "", companyId } as any);
};

// ---------- CONFIGURAÇÃO DA PÁGINA (nome, rótulo do item e descrição) ----------
//
// O nome da página é escrito pelo admin — é DADO, não texto de tela, então não
// muda sozinho com o idioma. Para o cliente que usa o painel em espanhol não
// ver "vendas" em português, cada texto passa a ter uma versão por idioma:
//
//   {"pt":"Vendas","es":"Ventas","en":"Sales"}
//
// Idioma em branco cai no português (idioma nativo do sistema), então a tela
// nunca fica vazia. Valores antigos, gravados como texto simples, continuam
// valendo para todos os idiomas — nada quebra em quem já configurou.

const IDIOMAS = ["pt", "es", "en"];

/** Lê um setting e devolve sempre o formato { pt, es, en }. */
const lerSettingPorIdioma = async (key: string): Promise<any> => {
  const bruto = await lerSetting(key);
  if (!bruto) return {};
  try {
    const obj = JSON.parse(bruto);
    if (obj && typeof obj === "object" && !Array.isArray(obj)) return obj;
  } catch (e) {
    // Não é JSON: é o formato antigo (texto único).
  }
  return { pt: bruto, es: bruto, en: bruto };
};

/** Aceita { pt, es, en } ou texto simples (compatibilidade). */
const gravarSettingPorIdioma = async (
  key: string,
  valor: any,
  companyId: number
): Promise<void> => {
  let objeto: any = {};
  if (valor && typeof valor === "object" && !Array.isArray(valor)) {
    IDIOMAS.forEach(l => {
      objeto[l] = typeof valor[l] === "string" ? valor[l] : "";
    });
  } else {
    const texto = typeof valor === "string" ? valor : "";
    IDIOMAS.forEach(l => {
      objeto[l] = texto;
    });
  }
  await gravarSetting(key, JSON.stringify(objeto), companyId);
};

export const getPageConfig = async (req: Request, res: Response): Promise<Response> => {
  const [description, title, itemLabel] = await Promise.all([
    lerSettingPorIdioma(PAGE_DESC_KEY),
    lerSettingPorIdioma(PAGE_TITLE_KEY),
    lerSettingPorIdioma(ITEM_LABEL_KEY)
  ]);

  // Devolve o mapa por idioma; quem resolve qual mostrar é a tela, que sabe o
  // idioma do usuário logado.
  return res.status(200).json({ description, title, itemLabel });
};

export const setPageConfig = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { description, title, itemLabel } = req.body || {};

  const tarefas: Promise<void>[] = [];
  if (description !== undefined)
    tarefas.push(gravarSettingPorIdioma(PAGE_DESC_KEY, description, companyId));
  if (title !== undefined)
    tarefas.push(gravarSettingPorIdioma(PAGE_TITLE_KEY, title, companyId));
  if (itemLabel !== undefined)
    tarefas.push(gravarSettingPorIdioma(ITEM_LABEL_KEY, itemLabel, companyId));
  await Promise.all(tarefas);

  const [d, t, il] = await Promise.all([
    lerSettingPorIdioma(PAGE_DESC_KEY),
    lerSettingPorIdioma(PAGE_TITLE_KEY),
    lerSettingPorIdioma(ITEM_LABEL_KEY)
  ]);
  return res.status(200).json({ description: d, title: t, itemLabel: il });
};

// ---------- UPLOAD DA IMAGEM DE CAPA ----------

export const uploadCover = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const file = (req as any).file;
  if (!file) throw new AppError("ERR_NO_FILE_UPLOADED", 400);

  // O multer já salvou em public/company{companyId}/courses/. Devolvemos a URL
  // completa para o front usar direto no <img src>, igual a uma URL externa.
  const base = process.env.BACKEND_URL || "";
  const url = `${base}/public/company${companyId}/courses/${file.filename}`;
  return res.status(200).json({ url, filename: file.filename });
};

// ---------- CURSOS ----------

export const index = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;

  // Super vê todos; empresa vê só os vinculados a ela.
  let where: any = {};
  let courseIdsFilter: number[] | null = null;

  if (!(await isSuper(req))) {
    const vinculos = await CourseCompany.findAll({ where: { companyId } });
    courseIdsFilter = vinculos.map(v => v.courseId);
    if (courseIdsFilter.length === 0) return res.status(200).json([]);
    where = { id: { [Op.in]: courseIdsFilter }, active: true };
  }

  const courses = await Course.findAll({
    where,
    include: [
      { model: CourseLesson, as: "lessons", separate: true, order: [["sortOrder", "ASC"], ["id", "ASC"]] }
    ],
    order: [["sortOrder", "ASC"], ["id", "ASC"]]
  });

  return res.status(200).json(courses);
};

export const show = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { id } = req.params;

  const course = await Course.findByPk(id, {
    include: [
      { model: CourseLesson, as: "lessons", separate: true, order: [["sortOrder", "ASC"], ["id", "ASC"]] },
      { model: Company, as: "companies", attributes: ["id", "name"], through: { attributes: [] } }
    ]
  });
  if (!course) throw new AppError("ERR_COURSE_NOT_FOUND", 404);

  // Empresa comum só acessa se estiver vinculada.
  if (!(await isSuper(req))) {
    const vinculo = await CourseCompany.findOne({ where: { courseId: course.id, companyId } });
    if (!vinculo || !course.active) throw new AppError("ERR_COURSE_NOT_ALLOWED", 403);
  }

  return res.status(200).json(course);
};

export const store = async (req: Request, res: Response): Promise<Response> => {
  const { title, description, coverUrl, active, sortOrder, companyIds, videoUrl } = req.body || {};
  if (!title || !String(title).trim()) throw new AppError("ERR_COURSE_TITLE_REQUIRED", 400);

  const course = await Course.create({
    title: String(title).trim(),
    description: description || null,
    coverUrl: coverUrl || null,
    active: active !== undefined ? !!active : true,
    sortOrder: sortOrder || 0
  } as any);

  if (Array.isArray(companyIds)) {
    await CourseCompany.bulkCreate(
      companyIds.map((cid: number) => ({ courseId: course.id, companyId: cid }))
    );
  }

  // Se o admin já informou um vídeo na criação, cria a primeira aula junto.
  // Evita o passo extra de "criar curso -> abrir -> nova aula" para o caso
  // simples de um curso que começa com um vídeo.
  if (videoUrl && String(videoUrl).trim()) {
    await CourseLesson.create({
      courseId: course.id,
      title: String(title).trim(),
      kind: "video",
      contentUrl: String(videoUrl).trim(),
      sortOrder: 0,
      active: true
    } as any);
  }

  return res.status(201).json(course);
};

export const update = async (req: Request, res: Response): Promise<Response> => {
  const { id } = req.params;
  const { title, description, coverUrl, active, sortOrder, companyIds } = req.body || {};

  const course = await Course.findByPk(id);
  if (!course) throw new AppError("ERR_COURSE_NOT_FOUND", 404);

  await course.update({
    ...(title !== undefined ? { title: String(title).trim() } : {}),
    ...(description !== undefined ? { description } : {}),
    ...(coverUrl !== undefined ? { coverUrl } : {}),
    ...(active !== undefined ? { active: !!active } : {}),
    ...(sortOrder !== undefined ? { sortOrder } : {})
  });

  // Se veio a lista de empresas, substitui os vínculos por inteiro.
  if (Array.isArray(companyIds)) {
    await CourseCompany.destroy({ where: { courseId: course.id } });
    await CourseCompany.bulkCreate(
      companyIds.map((cid: number) => ({ courseId: course.id, companyId: cid }))
    );
  }

  return res.status(200).json(course);
};

export const remove = async (req: Request, res: Response): Promise<Response> => {
  const { id } = req.params;
  const course = await Course.findByPk(id);
  if (!course) throw new AppError("ERR_COURSE_NOT_FOUND", 404);
  await course.destroy();
  return res.status(200).json({ message: "Course deleted" });
};

// ---------- AULAS ----------

export const storeLesson = async (req: Request, res: Response): Promise<Response> => {
  const { courseId } = req.params;
  const { title, kind, contentUrl, body, sortOrder, active } = req.body || {};

  const course = await Course.findByPk(courseId);
  if (!course) throw new AppError("ERR_COURSE_NOT_FOUND", 404);
  if (!title || !String(title).trim()) throw new AppError("ERR_LESSON_TITLE_REQUIRED", 400);

  const lesson = await CourseLesson.create({
    courseId: course.id,
    title: String(title).trim(),
    kind: kind || "video",
    contentUrl: contentUrl || null,
    body: body || null,
    sortOrder: sortOrder || 0,
    active: active !== undefined ? !!active : true
  } as any);

  return res.status(201).json(lesson);
};

export const updateLesson = async (req: Request, res: Response): Promise<Response> => {
  const { lessonId } = req.params;
  const { title, kind, contentUrl, body, sortOrder, active } = req.body || {};

  const lesson = await CourseLesson.findByPk(lessonId);
  if (!lesson) throw new AppError("ERR_LESSON_NOT_FOUND", 404);

  await lesson.update({
    ...(title !== undefined ? { title: String(title).trim() } : {}),
    ...(kind !== undefined ? { kind } : {}),
    ...(contentUrl !== undefined ? { contentUrl } : {}),
    ...(body !== undefined ? { body } : {}),
    ...(sortOrder !== undefined ? { sortOrder } : {}),
    ...(active !== undefined ? { active: !!active } : {})
  });

  return res.status(200).json(lesson);
};

export const removeLesson = async (req: Request, res: Response): Promise<Response> => {
  const { lessonId } = req.params;
  const lesson = await CourseLesson.findByPk(lessonId);
  if (!lesson) throw new AppError("ERR_LESSON_NOT_FOUND", 404);
  await lesson.destroy();
  return res.status(200).json({ message: "Lesson deleted" });
};

// ---------- COMENTÁRIOS (thread) ----------

export const listComments = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { lessonId } = req.params;

  const lesson = await CourseLesson.findByPk(lessonId);
  if (!lesson) throw new AppError("ERR_LESSON_NOT_FOUND", 404);

  // Empresa comum precisa ter acesso ao curso da aula.
  if (!(await isSuper(req))) {
    const vinculo = await CourseCompany.findOne({ where: { courseId: lesson.courseId, companyId } });
    if (!vinculo) throw new AppError("ERR_COURSE_NOT_ALLOWED", 403);
  }

  const comments = await CourseComment.findAll({
    where: { lessonId },
    include: [
      { model: User, as: "user", attributes: ["id", "name"] },
      { model: Company, as: "company", attributes: ["id", "name"] }
    ],
    order: [["createdAt", "ASC"]]
  });

  return res.status(200).json(comments);
};

export const storeComment = async (req: Request, res: Response): Promise<Response> => {
  const { companyId, id: userId } = req.user;
  const { lessonId } = req.params;
  const { body, parentId } = req.body || {};

  if (!body || !String(body).trim()) throw new AppError("ERR_COMMENT_EMPTY", 400);

  const lesson = await CourseLesson.findByPk(lessonId);
  if (!lesson) throw new AppError("ERR_LESSON_NOT_FOUND", 404);

  if (!(await isSuper(req))) {
    const vinculo = await CourseCompany.findOne({ where: { courseId: lesson.courseId, companyId } });
    if (!vinculo) throw new AppError("ERR_COURSE_NOT_ALLOWED", 403);
  }

  const comment = await CourseComment.create({
    body: String(body).trim(),
    lessonId: Number(lessonId),
    parentId: parentId || null,
    userId: Number(userId),
    companyId
  } as any);

  const full = await CourseComment.findByPk(comment.id, {
    include: [
      { model: User, as: "user", attributes: ["id", "name"] },
      { model: Company, as: "company", attributes: ["id", "name"] }
    ]
  });

  return res.status(201).json(full);
};

// ---------- FEED DE COMENTÁRIOS (painel do admin) ----------

const COMMENTS_SEEN_KEY = "coursesCommentsLastSeen";

/**
 * Lista os comentários mais recentes de TODOS os cursos, para o admin do SaaS
 * acompanhar num lugar só: de qual aula/curso veio, empresa, usuário e hora.
 *
 * `unseen` conta os comentários criados depois da última vez que o admin abriu
 * o painel — é o número da bolinha de notificação. Respostas do próprio admin
 * não contam como novidade.
 */
export const commentsFeed = async (req: Request, res: Response): Promise<Response> => {
  const { id: userId } = req.user;

  const comments = await CourseComment.findAll({
    include: [
      {
        model: CourseLesson,
        as: "lesson",
        attributes: ["id", "title", "courseId"],
        include: [{ model: Course, as: "course", attributes: ["id", "title"] }]
      },
      { model: User, as: "user", attributes: ["id", "name"] },
      { model: Company, as: "company", attributes: ["id", "name"] }
    ],
    order: [["createdAt", "DESC"]],
    limit: 100
  });

  const lastSeenRaw = await lerSetting(COMMENTS_SEEN_KEY);
  const lastSeen = lastSeenRaw ? new Date(lastSeenRaw) : null;

  const unseen = comments.filter(
    c =>
      String(c.userId) !== String(userId) &&
      (!lastSeen || new Date(c.createdAt) > lastSeen)
  ).length;

  return res.status(200).json({ comments, unseen, lastSeen: lastSeenRaw || null });
};

/** Marca o feed como visto (zera a bolinha). */
export const markCommentsSeen = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const agora = new Date().toISOString();
  await gravarSetting(COMMENTS_SEEN_KEY, agora, companyId);
  return res.status(200).json({ lastSeen: agora });
};

export const removeComment = async (req: Request, res: Response): Promise<Response> => {
  const { companyId, id: userId } = req.user;
  const { commentId } = req.params;

  const comment = await CourseComment.findByPk(commentId);
  if (!comment) throw new AppError("ERR_COMMENT_NOT_FOUND", 404);

  // Autor pode apagar o próprio; super pode apagar qualquer um.
  if (!(await isSuper(req)) && (comment.userId !== Number(userId) || comment.companyId !== companyId)) {
    throw new AppError("ERR_COMMENT_NOT_ALLOWED", 403);
  }

  await comment.destroy();
  return res.status(200).json({ message: "Comment deleted" });
};
