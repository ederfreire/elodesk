import "./bootstrap";
import "reflect-metadata";
import "express-async-errors";
import express, { Request, Response, NextFunction } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import helmet from "helmet";
import compression from "compression";
import * as Sentry from "@sentry/node";
import { config as dotenvConfig } from "dotenv";
import bodyParser from 'body-parser';
import path from "path";

import "./database";
import uploadConfig from "./config/upload";
import AppError from "./errors/AppError";
import routes from "./routes";
import * as WebHooksController from "./controllers/WebHookController";
import WacallsController from "./controllers/WacallsController";
import validateSession from "./utils/sessionManager";
import logger from "./utils/logger";
import { messageQueue, sendScheduledMessages } from "./queues";
import BullQueue from "./libs/queue"
import BullBoard from 'bull-board';
import basicAuth from 'basic-auth';

// Função de middleware para autenticação básica
export const isBullAuth = (req, res, next) => {
  const user = basicAuth(req);

  if (!user || user.name !== process.env.BULL_USER || user.pass !== process.env.BULL_PASS) {
    res.set('WWW-Authenticate', 'Basic realm="example"');
    return res.status(401).send('Authentication required.');
  }
  next();
};

// Carregar variáveis de ambiente
dotenvConfig();

// Inicializar Sentry
Sentry.init({ dsn: process.env.SENTRY_DSN });

const app = express();

// Configuração de filas
app.set("queues", {
  messageQueue,
  sendScheduledMessages
});

const allowedOrigins = [process.env.FRONTEND_URL];

// Configuração do BullBoard
if (String(process.env.BULL_BOARD).toLocaleLowerCase() === 'true' && process.env.REDIS_URI_ACK !== '') {
  BullBoard.setQueues(BullQueue.queues.map(queue => queue && queue.bull));
  app.use('/admin/queues', isBullAuth, BullBoard.UI);
}

// Middlewares
app.use(compression());
app.use(bodyParser.json({ limit: '5mb' })); // Aumentar o limite de carga para 5 MB
app.use(bodyParser.urlencoded({ limit: '5mb', extended: true }));

// ============================================================
// CORS ABERTO — DEVE vir ANTES do cors global restrito.
// O middleware `cors()` global do express finaliza o preflight
// OPTIONS para qualquer rota, então se o cors restrito rodar
// primeiro a resposta sai sem Access-Control-Allow-Origin para
// origens externas (ex.: site do cliente embutindo o widget).
// ============================================================

// credentials: true (não false) é proposital — este mesmo "/public" também
// serve os arquivos enviados por empresa (company{id}/...), buscados pelo
// front autenticado com axios `withCredentials: true` (ex.: mídia de
// mensagens rápidas, avatares). Com credentials: false o pacote `cors` nunca
// manda o header Access-Control-Allow-Credentials, e o navegador BLOQUEIA
// qualquer requisição credenciada pra essa rota (erro "the value of the
// Access-Control-Allow-Credentials header is '' which must be 'true'") —
// isso quebrava a mídia de resposta rápida (e qualquer outro fetch
// credenciado de /public) mesmo o arquivo existindo e sendo servido com
// sucesso. Não há perda de segurança aqui: `express.static` nesta rota não
// checa sessão/cookie pra decidir servir o arquivo (ele já é público pra
// quem tiver a URL), então permitir o header de credenciais não libera nada
// que já não estivesse acessível sem credenciais.
const openCors = cors({ origin: true, credentials: true });

// Widget JS público (backend/public/webchat.js) — mesma rota também atende
// os uploads por empresa (mesma pasta física, ver uploadConfig.directory
// abaixo), por isso NÃO fixamos Access-Control-Allow-Origin como "*" aqui:
// "*" é incompatível com Access-Control-Allow-Credentials: true (o
// navegador rejeita a combinação) — o próprio middleware `cors()` acima já
// reflete a origem certa da requisição, então só falta o Cache-Control.
app.use(
  "/public",
  openCors,
  express.static(path.resolve(__dirname, "..", "public"), {
    setHeaders: (res) => {
      res.setHeader("Cache-Control", "public, max-age=300");
    }
  })
);

// Rotas públicas do Webchat — SEM autenticação, CORS aberto
import webchatPublicRoutes from "./routes/webchatRoutes";
app.use("/public/webchat/*", openCors);
app.options("/public/webchat/*", openCors);
app.use(webchatPublicRoutes);

// ============================================================
// CORS global restrito (frontend autenticado)
// ============================================================
app.use(
  cors({
    credentials: true,
    origin: allowedOrigins
  })
);
app.use(cookieParser());
app.use(express.json());
app.use(Sentry.Handlers.requestHandler());
app.use("/public", express.static(uploadConfig.directory));

// ✅ Rota Z-API webhook ANTES do blockCheck
import zapiRoutes from "./routes/zapiRoutes";
app.use(zapiRoutes);

// ✅ Rota WaCalls webhook ANTES das rotas autenticadas.
// O microserviço Go chama sem JWT/cookie do usuário e valida por X-WaCalls-Secret.
import wacallsRoutes from "./routes/wacallsRoutes";
app.post("/wacalls/webhook", WacallsController.webhook);
app.use(wacallsRoutes);

// ✅ Rota Telegram webhook ANTES do blockCheck
import telegramRoutes from "./routes/telegramRoutes";
app.use(telegramRoutes);

// ✅ Alias público para o callback configurado no Meta/Instagram.
// O Facebook envia webhook sem Authorization/cookie, então precisa ficar antes das rotas autenticadas.
app.get("/instagram/webhook", WebHooksController.index);
app.post("/instagram/webhook", WebHooksController.webHook);

// Instagram DMs agora chegam pelo webhook unificado /webhook (WebhookFacebookController)
// via Facebook Login + Instagram Graph API. Rota antiga instagramRoutes removida.


// Session validation middleware
app.use(validateSession);

// Rotas
app.use(routes);

// Manipulador de erros do Sentry
app.use(Sentry.Handlers.errorHandler());

// Middleware de tratamento de erros
app.use(async (err: Error, req: Request, res: Response, _: NextFunction) => {
  if (err instanceof AppError) {
    logger.warn({
      message: err.message,
      statusCode: err.statusCode,
      method: req.method,
      path: req.path,
      originalUrl: req.originalUrl,
      ip: req.ip,
      userAgent: req.headers["user-agent"],
      hasAuthorization: Boolean(req.headers.authorization),
      hasRefreshCookie: Boolean(req.cookies?.jrt)
    });
    return res.status(err.statusCode).json({ error: err.message });
  }

  logger.error(err);
  return res.status(500).json({ error: "Internal server error" });
});

export default app;
