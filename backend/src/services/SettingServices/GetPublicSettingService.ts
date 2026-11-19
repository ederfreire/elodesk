import Setting from "../../models/Setting";
import CompaniesSettings from "../../models/CompaniesSettings";

interface Request {
  key: string;
  companyId?: number;
}

const publicSettingsKeys = [
  "userCreation",
  "requireDocument",
  "currency",
  "primaryColorLight",
  "primaryColorDark",
  "appLogoLight",
  "appLogoDark",
  "appLogoFavicon",
  "appName",
  "appNameMobile",
  "enabledLanguages",
  "appLogoBackgroundLight",
  "appLogoBackgroundDark",
  "appLogoSplash",
  "appLogoMobile",
  "googleLogin",
  "metaAppId",
  "metaConfigurationId",
  "googleClientId",
  "googleCalendarClientId",
  "showLogoInChat"
];

const GetPublicSettingService = async ({
  key,
  companyId
}: Request): Promise<string | undefined> => {
  if (!publicSettingsKeys.includes(key)) {
    return null;
  }

  const targetCompanyId = companyId || 1;

  if (key === "currency") {
    const companySettings = await CompaniesSettings.findOne({
      where: { companyId: targetCompanyId }
    });

    return companySettings?.currency || "BRL";
  }

  const setting = await Setting.findOne({
    where: {
      companyId: targetCompanyId,
      key
    }
  });

  return setting?.value;
};

export default GetPublicSettingService;
