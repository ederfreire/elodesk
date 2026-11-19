import { verify } from "jsonwebtoken";
import { Response as Res } from "express";

import User from "../../models/User";
import AppError from "../../errors/AppError";
import ShowUserService from "../UserServices/ShowUserService";
import authConfig, { authReady } from "../../config/auth";
import {
  createAccessToken,
  createRefreshToken
} from "../../helpers/CreateTokens";
import logger from "../../utils/logger";

interface RefreshTokenPayload {
  id: string;
  tokenVersion: number;
  companyId: number;
}

interface Response {
  user: User;
  newToken: string;
  refreshToken: string;
}

// Erros que significam "essa sessão realmente não vale mais" — nesses
// casos é correto limpar o cookie jrt e forçar o usuário a logar de novo.
const isGenuineSessionInvalid = (err: any): boolean => {
  if (!err) return false;
  // jsonwebtoken: token expirado, assinatura inválida, malformado etc.
  if (
    err.name === "TokenExpiredError" ||
    err.name === "JsonWebTokenError" ||
    err.name === "NotBeforeError"
  ) {
    return true;
  }
  // AppError que nós mesmos lançamos de propósito (usuário não existe
  // mais, tokenVersion divergente por troca de senha/logout forçado etc.)
  if (err instanceof AppError) return true;
  return false;
};

export const RefreshTokenService = async (
  res: Res,
  token: string
): Promise<Response> => {
  // Espera os secrets carregarem (Redis) em vez de já bater como sessão
  // inválida — sem isso, todo restart/deploy do backend tinha uma janela
  // de ~1s em que QUALQUER refresh caía aqui, limpava o cookie jrt do
  // usuário e forçava login manual, mesmo com a sessão perfeitamente
  // válida (visto em produção logo após um restart do pm2).
  try {
    await Promise.race([
      authReady,
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("AUTH_NOT_READY_TIMEOUT")), 8000)
      )
    ]);
  } catch (e) {
    // Secrets ainda não carregaram depois de 8s — algo está mesmo errado
    // (Redis fora do ar), mas isso não é "token inválido": não derruba a
    // sessão do usuário, só pede pra tentar de novo em breve.
    logger.error("[RefreshTokenService] authReady não resolveu a tempo");
    throw new AppError("ERR_AUTH_TEMPORARILY_UNAVAILABLE", 503);
  }

  try {
    const decoded = verify(token, authConfig.refreshSecret as string);
    const { id, tokenVersion, companyId } = decoded as RefreshTokenPayload;

    const user = await ShowUserService(id, companyId);

    if (user.tokenVersion !== tokenVersion) {
      res.clearCookie("jrt");
      throw new AppError("ERR_SESSION_EXPIRED", 401);
    }

    const newToken = createAccessToken(user);
    const refreshToken = createRefreshToken(user);

    return { user, newToken, refreshToken };
  } catch (err) {
    if (isGenuineSessionInvalid(err)) {
      res.clearCookie("jrt");
      throw new AppError("ERR_SESSION_EXPIRED", 401);
    }
    // Erro inesperado (ex.: blip de conexão com o banco durante um
    // restart) — não é prova de que o token é inválido. Não limpa o
    // cookie: deixa o front tentar de novo em vez de deslogar o usuário
    // à toa.
    logger.error(
      `[RefreshTokenService] Erro inesperado ao renovar sessão (cookie mantido): ${
        (err as any)?.message || err
      }`
    );
    throw new AppError("ERR_AUTH_TEMPORARILY_UNAVAILABLE", 503);
  }
};
