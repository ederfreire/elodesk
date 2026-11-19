import { Request, Response, NextFunction } from "express";
import AppError from "../errors/AppError";
import User from "../models/User";

/**
 * Confere, no servidor, a permissão marcada na aba "Permissões" do usuário.
 * Até aqui ela só escondia o item do menu: quem soubesse o endereço da API
 * criava campanha, editava fluxo ou conexão mesmo com a permissão desligada.
 *
 * Admin e super passam sempre (o plano continua valendo pelos outros checks).
 * Usuário comum é barrado só quando o campo está "disabled"; vazio (usuário
 * antigo) segue o padrão da coluna, que é liberado.
 */
type CampoDePermissao =
  | "showCampaign"
  | "showFlow"
  | "showOpenAi"
  | "showIntegrations"
  | "allowConnections"
  | "showContacts"
  | "showSchedules"
  | "showKanban"
  | "showDashboard";

const permissaoDoUsuario = (campo: CampoDePermissao) => {
  return async (req: Request, _res: Response, next: NextFunction): Promise<void> => {
    if (req.user?.profile === "admin") return next();
    const usuario = await User.findByPk(req.user?.id, { attributes: ["id", "super", "profile", campo] });
    if (!usuario) throw new AppError("ERR_SESSION_EXPIRED", 401);
    if (usuario.super || usuario.profile === "admin") return next();
    if (String((usuario as any)[campo] || "") === "disabled") {
      throw new AppError("ERR_NO_PERMISSION", 403);
    }
    return next();
  };
};

export default permissaoDoUsuario;
