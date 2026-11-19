import express from "express";
import multer from "multer";
import isAuth from "../middleware/isAuth";
import isSuper from "../middleware/isSuper";
import uploadConfig from "../config/upload";

import * as CourseController from "../controllers/CourseController";

const courseRoutes = express.Router();
const upload = multer(uploadConfig);

// Configuração da página (nome, rótulo do item e descrição) — editável pelo admin
courseRoutes.get("/courses/page-config", isAuth, CourseController.getPageConfig);
courseRoutes.put("/courses/page-config", isAuth, isSuper, CourseController.setPageConfig);

// Upload da imagem de capa
courseRoutes.post("/courses/cover-upload", isAuth, isSuper, upload.single("file"), CourseController.uploadCover);

// Feed de comentários do admin (rotas literais antes das paramétricas)
courseRoutes.get("/courses/comments/feed", isAuth, isSuper, CourseController.commentsFeed);
courseRoutes.put("/courses/comments/feed/seen", isAuth, isSuper, CourseController.markCommentsSeen);

// Comentários (thread) — leitura e escrita para usuário logado com acesso
courseRoutes.get("/courses/lessons/:lessonId/comments", isAuth, CourseController.listComments);
courseRoutes.post("/courses/lessons/:lessonId/comments", isAuth, CourseController.storeComment);
courseRoutes.delete("/courses/comments/:commentId", isAuth, CourseController.removeComment);

// Aulas — só super escreve
courseRoutes.post("/courses/:courseId/lessons", isAuth, isSuper, CourseController.storeLesson);
courseRoutes.put("/courses/lessons/:lessonId", isAuth, isSuper, CourseController.updateLesson);
courseRoutes.delete("/courses/lessons/:lessonId", isAuth, isSuper, CourseController.removeLesson);

// Cursos — leitura para logados; escrita só super
courseRoutes.get("/courses", isAuth, CourseController.index);
courseRoutes.get("/courses/:id", isAuth, CourseController.show);
courseRoutes.post("/courses", isAuth, isSuper, CourseController.store);
courseRoutes.put("/courses/:id", isAuth, isSuper, CourseController.update);
courseRoutes.delete("/courses/:id", isAuth, isSuper, CourseController.remove);

export default courseRoutes;
