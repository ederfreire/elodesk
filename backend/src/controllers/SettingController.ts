import { Request, Response } from "express";

import { getIO } from "../libs/socket";
import AppError from "../errors/AppError";

import UpdateSettingService from "../services/SettingServices/UpdateSettingService";
import ListSettingsService from "../services/SettingServices/ListSettingsService";
import ListSettingsServiceOne from "../services/SettingServices/ListSettingsServiceOne";
import GetSettingService from "../services/SettingServices/GetSettingService";
import UpdateOneSettingService from "../services/SettingServices/UpdateOneSettingService";
import GetPublicSettingService from "../services/SettingServices/GetPublicSettingService";
import CleanPublicFolderService, {
  MAX_RETENTION_MONTHS
} from "../services/SettingServices/CleanPublicFolderService";
import DedupePublicFolderService from "../services/SettingServices/DedupePublicFolderService";
import { parseMediaCategories } from "../services/SettingServices/mediaCategories";
import PublicFolderInfoService from "../services/SettingServices/PublicFolderInfoService";


type LogoRequest = {
  mode: string;
};

type PrivateFileRequest = {
  settingKey: string;
};

/**
 * Chaves de whitelabel/branding globais: precisam ser gravadas sempre
 * na empresa mestre (companyId = 1) para que o login, o signup e o
 * restante do sistema (que leem via GetPublicSettingService com
 * companyId padrão = 1) enxerguem os valores — independente da empresa
 * a que o super-admin logado pertence.
 */
const WHITELABEL_MASTER_KEYS = new Set<string>([
  "primaryColorLight",
  "primaryColorDark",
  "appName",
  "appNameMobile",
  "appLogoLight",
  "appLogoDark",
  "appLogoFavicon",
  "appLogoMobile",
  "appLogoBackgroundLight",
  "appLogoBackgroundDark",
  "appLogoSplash",
  "enabledLanguages"
]);

const MASTER_COMPANY_ID = 1;

export const index = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;

  // if (req.user.profile !== "admin") {
  //   throw new AppError("ERR_NO_PERMISSION", 403);
  // }

  const settings = await ListSettingsService({ companyId });

  return res.status(200).json(settings);
};

export const showOne = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId } = req.user;
  const { settingKey: key } = req.params;

  const settingsTransfTicket = await ListSettingsServiceOne({
    companyId: companyId,
    key: key
  });

  return res.status(200).json(settingsTransfTicket);
};

export const update = async (
  req: Request,
  res: Response
): Promise<Response> => {
  if (req.user.profile !== "admin") {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  const { settingKey: key } = req.params;
  const { value } = req.body;
  const { companyId } = req.user;

  // Whitelabel/branding é global — sempre gravar na empresa mestre para que
  // o login/signup/sistema (que leem por companyId=1) consigam ler.
  const targetCompanyId = WHITELABEL_MASTER_KEYS.has(key)
    ? MASTER_COMPANY_ID
    : companyId;

  const setting = await UpdateSettingService({
    key,
    value,
    companyId: targetCompanyId
  });

  const io = getIO();
  io.of(String(companyId)).emit(`company-${companyId}-settings`, {
    action: "update",
    setting
  });

  return res.status(200).json(setting);
};

export const getSetting = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { settingKey: key } = req.params;

  const setting = await GetSettingService({ key });

  return res.status(200).json(setting);
};

export const updateOne = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { settingKey: key } = req.params;
  const { value } = req.body;

  const setting = await UpdateOneSettingService({
    key,
    value
  });

  return res.status(200).json(setting);
};

export const publicShow = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { settingKey: key } = req.params;
  const { companyId } = req.query;

  const targetCompanyId = companyId ? parseInt(companyId as string) : undefined;

  const settingValue = await GetPublicSettingService({
    key,
    companyId: targetCompanyId
  });

  return res.status(200).json(settingValue);
};

export const storeLogo = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const file = req.file as Express.Multer.File;
  const { mode }: LogoRequest = req.body;
  const validModes = [
    "Light",
    "Dark",
    "Favicon",
    "Mobile",
    "BackgroundLight",
    "BackgroundDark",
    "Splash"
  ];

  if (validModes.indexOf(mode) === -1) {
    return res.status(406).json({ error: "Modo de logo inválido." });
  }

  if (file && file.mimetype.startsWith("image/")) {
    // Whitelabel é global — sempre grava na empresa mestre (companyId=1)
    // para que login/signup/sistema (que leem de companyId=1) exibam o logo.
    const setting = await UpdateSettingService({
      key: `appLogo${mode}`,
      value: file.filename,
      companyId: MASTER_COMPANY_ID
    });

    return res.status(200).json(setting.value);
  }

  return res.status(406).json({ error: "Arquivo inválido. Envie uma imagem." });
};

export const storePrivateFile = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const file = req.file as Express.Multer.File;
  const { settingKey }: PrivateFileRequest = req.body;
  const { companyId } = req.user;

  const setting = await UpdateSettingService({
    key: `_${settingKey}`,
    value: file.filename,
    companyId
  });

  return res.status(200).json(setting.value);
};

export const cleanPublicFolder = async (
  req: Request,
  res: Response
): Promise<Response> => {
  if (req.user.profile !== "admin") {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  const { companyId } = req.user;
  const { months, mediaTypes } = req.body;

  const retentionMonths = Math.max(
    1,
    Math.min(MAX_RETENTION_MONTHS, Number(months) || 1)
  );

  const result = await CleanPublicFolderService({
    companyId,
    retentionMonths,
    mediaTypes: parseMediaCategories(mediaTypes)
  });

  return res.status(200).json(result);
};

export const previewCleanPublicFolder = async (
  req: Request,
  res: Response
): Promise<Response> => {
  if (req.user.profile !== "admin") {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  const { companyId } = req.user;
  const months = req.query.months;
  const mediaTypes = req.query.mediaTypes;

  const retentionMonths = Math.max(
    1,
    Math.min(MAX_RETENTION_MONTHS, Number(months) || 1)
  );

  // Mesmo cálculo do cleanPublicFolder, mas com dryRun=true — só CONTA o
  // que seria removido pro período/tipos escolhidos, sem apagar nada.
  const result = await CleanPublicFolderService({
    companyId,
    retentionMonths,
    mediaTypes: parseMediaCategories(mediaTypes),
    dryRun: true
  });

  return res.status(200).json(result);
};

/**
 * Deduplicação da pasta public (não destrutiva): troca cópias idênticas por
 * hardlink. Nenhum arquivo desaparece — só o disco duplicado é liberado.
 */
export const dedupePublicFolder = async (
  req: Request,
  res: Response
): Promise<Response> => {
  if (req.user.profile !== "admin") {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  const { companyId } = req.user;
  const dryRun =
    String(req.query.dryRun ?? req.body?.dryRun ?? "") === "true";

  const result = await DedupePublicFolderService({ companyId, dryRun });

  return res.status(200).json(result);
};


export const publicFolderInfo = async (
  req: Request,
  res: Response
): Promise<Response> => {
  if (req.user.profile !== "admin") {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  const { companyId } = req.user;

  const result = await PublicFolderInfoService({ companyId });

  return res.status(200).json(result);
};
