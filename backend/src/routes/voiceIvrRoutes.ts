import { Router } from "express";
import multer from "multer";
import isAuth from "../middleware/isAuth";
import * as VoiceIvrController from "../controllers/VoiceIvrController";

const voiceIvrRoutes = Router();

// URA de voz — os fluxos vivem no wacalls-chat; aqui é só o proxy.
voiceIvrRoutes.get("/voice-ivr", isAuth, VoiceIvrController.index);
// Antes de "/voice-ivr/:id": a primeira rota que casa vence, e "vozes-gratis"
// seria lido como o id de uma URA.
voiceIvrRoutes.get("/voice-ivr/vozes-gratis", isAuth, VoiceIvrController.vozesGratis);
// Construtor visual: rotas fixas ANTES de "/voice-ivr/:id".
const arquivoDaUra = multer({ storage: multer.memoryStorage(), limits: { fileSize: 50 * 1024 * 1024 } });
const arquivoImportado = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 } });
voiceIvrRoutes.get("/voice-ivr/estatisticas", isAuth, VoiceIvrController.estatisticas);
voiceIvrRoutes.post("/voice-ivr/upload", isAuth, arquivoDaUra.single("file"), VoiceIvrController.enviarArquivo);
voiceIvrRoutes.post("/voice-ivr/import", isAuth, arquivoImportado.single("file"), VoiceIvrController.importar);
voiceIvrRoutes.post("/voice-ivr/ouvir", isAuth, VoiceIvrController.ouvir);
voiceIvrRoutes.get("/voice-ivr/:id/export", isAuth, VoiceIvrController.exportar);
voiceIvrRoutes.get("/voice-ivr/:id", isAuth, VoiceIvrController.show);
voiceIvrRoutes.post("/voice-ivr", isAuth, VoiceIvrController.store);
// Antes de /voice-ivr/:id não faz diferença aqui (métodos diferentes), mas
// mantém as rotas de catálogo agrupadas.
voiceIvrRoutes.post("/voice-ivr/vozes", isAuth, VoiceIvrController.vozes);
voiceIvrRoutes.put("/voice-ivr/:id", isAuth, VoiceIvrController.update);
voiceIvrRoutes.delete("/voice-ivr/:id", isAuth, VoiceIvrController.remove);

export default voiceIvrRoutes;
