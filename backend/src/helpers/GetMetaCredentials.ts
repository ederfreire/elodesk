import Setting from "../models/Setting";

interface MetaCredentials {
  appId: string;
  appSecret: string;
  verifyToken: string;
}

/**
 * Returns Meta (Facebook / Instagram) credentials.
 * Priority: DB Settings (companyId=1, global) → environment variables.
 * Allows the SaaS admin to manage credentials from the UI without redeploying.
 */
const GetMetaCredentials = async (): Promise<MetaCredentials> => {
  const [appIdRow, appSecretRow, verifyTokenRow] = await Promise.all([
    Setting.findOne({ where: { key: "metaAppId", companyId: 1 } }),
    Setting.findOne({ where: { key: "metaAppSecret", companyId: 1 } }),
    Setting.findOne({ where: { key: "metaVerifyToken", companyId: 1 } })
  ]);

  return {
    appId:
      appIdRow?.value ||
      process.env.FACEBOOK_APP_ID ||
      process.env.REACT_APP_FACEBOOK_APP_ID ||
      "",
    appSecret:
      appSecretRow?.value || process.env.FACEBOOK_APP_SECRET || "",
    verifyToken:
      verifyTokenRow?.value || process.env.VERIFY_TOKEN || "whaticket"
  };
};

export default GetMetaCredentials;
