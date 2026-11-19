import { Request, Response, NextFunction } from "express";
import AppError from "../errors/AppError";
import User from "../models/User";

const isSuper = async (req: Request, res: Response, next: NextFunction): Promise<any> => {
  const user = await User.findByPk(req.user.id);
  if (!user || !user.super) {
    // 403 (e NUNCA 401): falta de permissão não é sessão expirada. Com 401 o
    // interceptor do frontend tentava renovar o token, falhava de novo e
    // derrubava o usuário — era o "ao colocar os dados do Google o sistema
    // desloga" relatado pelo atendente/admin da empresa, que só estava
    // abrindo uma tela cujas credenciais são exclusivas do super admin.
    throw new AppError("Acesso não permitido", 403);
  }

  return next();
}

export default isSuper;
