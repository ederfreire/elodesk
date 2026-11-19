import { verify } from "jsonwebtoken";
import { Request, Response, NextFunction } from "express";

import AppError from "../errors/AppError";
import authConfig, { authReady } from "../config/auth";

import { getIO } from "../libs/socket";
import ShowUserService from "../services/UserServices/ShowUserService";
import { updateUser } from "../helpers/updateUser";
import logger from "../utils/logger";

interface TokenPayload {
  id: string;
  username: string;
  profile: string;
  companyId: number;
  iat: number;
  exp: number;
}

// Caminhos que NUNCA podem exigir JWT/cookie de usuário, porque quem chama é
// um serviço externo (ou o próprio Google), que não tem sessão nenhuma.
//
// Isto é uma rede de segurança, não o lugar "oficial" de declarar rota
// pública — as rotas já são registradas sem `isAuth`. Mas basta uma delas
// cair em algum router autenticado (duplicado, antigo ou registrado numa
// ordem infeliz) para o chamador receber 401 e a integração quebrar sem
// explicação. Foi o que aconteceu com o callback do Google Agenda: o
// navegador voltava do consentimento e recebia {"error":"ERR_SESSION_EXPIRED"}
// numa tela branca, sem nenhuma pista do motivo.
const CAMINHOS_SEM_SESSAO = [
  "/wacalls/webhook",
  // Retorno do consentimento OAuth do Google. O Google redireciona o
  // NAVEGADOR para cá; não existe Authorization header nesse pedido, e a
  // identificação da empresa vai dentro do parâmetro `state`.
  "/google-calendar/oauth/callback"
];

const isAuth = async (req: Request, res: Response, next: NextFunction): Promise<void> => {
  const caminho = (req.path || "").replace(/\/+$/, "");
  const caminhoOriginal = (req.originalUrl || "").split("?")[0].replace(/\/+$/, "");

  if (
    CAMINHOS_SEM_SESSAO.includes(caminho) ||
    CAMINHOS_SEM_SESSAO.includes(caminhoOriginal)
  ) {
    return next();
  }

  // Downloads abertos em nova aba (ex.: o ZIP do projeto) não conseguem
  // mandar cabeçalho Authorization — nesses casos o token vem na query.
  const tokenQuery = req.query.token as string;
  const authHeader =
    req.headers.authorization || (tokenQuery ? `Bearer ${tokenQuery}` : undefined);

  if (!authHeader) {
    throw new AppError("ERR_SESSION_EXPIRED", 401);
  }


  // Janela de boot: authConfig.secret só é preenchido depois que o Redis
  // responde (ver config/auth.ts). Sem esperar aqui, os primeiros
  // requests logo após um restart do backend caem direto em "sessão
  // expirada" mesmo com um token perfeitamente válido.
  if (!authConfig.secret) {
    try {
      await Promise.race([
        authReady,
        new Promise((_, reject) =>
          setTimeout(() => reject(new Error("AUTH_NOT_READY_TIMEOUT")), 8000)
        )
      ]);
    } catch (e) {
      throw new AppError("ERR_AUTH_TEMPORARILY_UNAVAILABLE", 503);
    }
  }

  if (!authConfig.secret) {
    throw new AppError("ERR_AUTH_TEMPORARILY_UNAVAILABLE", 503);
  }

  const [, token] = authHeader.split(" ");

  try {
    const decoded = verify(token, authConfig.secret);
    const { id, profile, companyId } = decoded as TokenPayload;

    // updateUser só marca "usuário online"/atualiza updatedAt — um efeito
    // colateral best-effort que não deve travar nem derrubar o request.
    // ANTES essa chamada não era esperada (nem tinha .catch nenhum): a
    // promise ficava "solta", e quando ShowUserService lá dentro dava
    // ERR_NO_USER_FOUND (token antigo de um usuário já deletado, por
    // exemplo), a rejeição não tratada sobrava pro módulo `domain` do Node
    // reinjetar o erro na resposta de OUTRA requisição qualquer que já
    // tivesse terminado antes dela nesse meio-tempo — exatamente o
    // "Cannot set headers after they are sent" batendo em controllers sem
    // relação nenhuma entre si (UserController, CompanySettingsController,
    // FlowBuilderController...). Await + catch aqui garante que o erro é
    // tratado dentro do request que realmente o causou, sem vazar pra
    // nenhum outro.
    // Fica fora do caminho crítico de propósito (sem await): é só um
    // "marcar online/atualizar updatedAt", e esperar uma query de banco em
    // TODA requisição autenticada só adiciona latência e consumo do pool de
    // conexões sem necessidade. O .catch() é o que importa aqui — antes não
    // existia, e a rejeição solta vazava pelo módulo `domain` do Node pra
    // resposta de OUTRA requisição já finalizada, gerando o
    // "Cannot set headers after they are sent" em controllers sem relação.
    updateUser(id, companyId).catch((err: any) => {
      logger.warn(`[isAuth] updateUser falhou pra userId=${id}: ${err?.message}`);
    });

    req.user = {
      id,
      profile,
      companyId
    };
  } catch (err: any) {
    if (err.message === "ERR_SESSION_EXPIRED" && err.statusCode === 401) {
      throw new AppError(err.message, 401);
    } else {
      throw new AppError(
        "Invalid token. We'll try to assign a new one on next request",
        401
      );
    }
  }

  return next();
};

export default isAuth;
