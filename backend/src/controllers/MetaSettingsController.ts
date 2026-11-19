import { Request, Response } from "express";
import Setting from "../models/Setting";
import AppError from "../errors/AppError";

const META_KEYS = [
  "metaAppId",
  "metaAppSecret",
  "metaVerifyToken",
  "metaConfigurationId",
  "metaSystemUserToken",
  "googleClientId",
  "googleClientSecret",
  "googleCalendarClientId",
  "googleCalendarClientSecret"
];

// Permissão de super admin é validada pelo middleware `isSuper` na rota.
// Removido o check redundante baseado em `req.user.super`, pois o payload
// do JWT não inclui esse campo e estava causando ERR_NO_PERMISSION.
const ensureSuper = (_req: Request) => {
  return;
};

export const getMetaSettings = async (
  req: Request,
  res: Response
): Promise<Response> => {
  ensureSuper(req);

  const result: Record<string, string> = {};

  for (const key of META_KEYS) {
    const setting = await Setting.findOne({ where: { key, companyId: 1 } });
    result[key] = setting ? setting.value : "";
  }

  // Env fallbacks só para exibição (placeholder informativo)
  result.envAppId =
    process.env.FACEBOOK_APP_ID || process.env.REACT_APP_FACEBOOK_APP_ID || "";
  result.envVerifyToken = process.env.VERIFY_TOKEN || "";

  return res.json(result);
};

/**
 * GET /meta-settings/public
 *
 * Devolve APENAS os dois valores que o Embedded Signup precisa no navegador:
 * o App ID e o Configuration ID. Nenhum segredo passa por aqui — o App Secret
 * e o System User Token continuam restritos ao endpoint de super admin.
 *
 * POR QUE ESTE ENDPOINT EXISTE
 *
 * O modal de cadastro integrado lia essas credenciais de GET /settings, que
 * lista as configurações DA EMPRESA LOGADA. Só que as credenciais da Meta são
 * gravadas sempre em companyId 1 (ver META_KEYS acima, é uma configuração da
 * plataforma, não de cada empresa). Resultado: qualquer empresa diferente da 1
 * nunca enxergava os valores e o cadastro morria em "ID de configuração do
 * Meta não configurado", mesmo com tudo preenchido na tela.
 *
 * Estes dois valores não são secretos por natureza: ambos são enviados ao SDK
 * do Facebook dentro do próprio navegador do usuário.
 */
export const getPublicMetaSettings = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const buscar = async (key: string): Promise<string> => {
    const setting = await Setting.findOne({ where: { key, companyId: 1 } });
    return setting?.value || "";
  };

  const appId =
    (await buscar("metaAppId")) ||
    process.env.FACEBOOK_APP_ID ||
    process.env.REACT_APP_FACEBOOK_APP_ID ||
    "";

  const configId =
    (await buscar("metaConfigurationId")) ||
    process.env.META_CONFIG_ID ||
    process.env.REACT_APP_META_CONFIG_ID ||
    "";

  return res.json({ appId, configId });
};

export const updateMetaSettings = async (
  req: Request,
  res: Response
): Promise<Response> => {
  ensureSuper(req);

  const data = req.body || {};

  try {
    for (const key of META_KEYS) {
      if (data[key] === undefined) continue;

      const value = String(data[key] ?? "");

      // Não sobrescreve um valor já salvo com string vazia;
      // o usuário pode estar configurando apenas um subconjunto (ex: só Google).
      const existing = await Setting.findOne({ where: { key, companyId: 1 } });

      if (!existing) {
        if (!value) continue;
        await Setting.create({ key, value, companyId: 1 } as any);
      } else {
        if (value === "" && existing.value) continue;
        await existing.update({ value });
      }
    }

    return res.json({ message: "OK" });
  } catch (err: any) {
    console.error("[MetaSettings] update error:", err);
    return res
      .status(500)
      .json({ error: err?.message || "Erro ao salvar configurações da Meta." });
  }
};
