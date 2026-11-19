import nodemailer from "nodemailer";
import Setting from "../models/Setting";

interface SmtpConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
  secure: boolean;
  authType: string;
  oauth2ClientId: string;
  oauth2ClientSecret: string;
  oauth2RefreshToken: string;
}

const SMTP_KEYS = [
  "smtpHost",
  "smtpPort",
  "smtpUser",
  "smtpPass",
  "smtpFrom",
  "smtpSecure",
  "smtpAuthType",
  "smtpOauth2ClientId",
  "smtpOauth2ClientSecret",
  "smtpOauth2RefreshToken"
];

const getSettingValue = async (
  key: string,
  companyId?: number
): Promise<string | undefined> => {
  const targets = companyId && companyId !== 1 ? [companyId, 1, undefined] : companyId ? [companyId, undefined] : [1, undefined];

  for (const targetCompanyId of targets) {
    const where = targetCompanyId ? { key, companyId: targetCompanyId } : { key };
    const setting = await Setting.findOne({ where });

    if (setting?.value) {
      return setting.value;
    }
  }

  return undefined;
};

const getSmtpSettings = async (companyId?: number): Promise<SmtpConfig> => {
  const settings: Record<string, string> = {};

  for (const key of SMTP_KEYS) {
    const value = await getSettingValue(key, companyId);
    if (value) settings[key] = value;
  }

  const port = parseInt(settings.smtpPort || process.env.SMTP_PORT || "587", 10);

  return {
    host: (settings.smtpHost || process.env.SMTP_HOST || "").trim(),
    port,
    user: (settings.smtpUser || process.env.SMTP_USER || "").trim(),
    pass: settings.smtpPass || process.env.SMTP_PASS || "",
    from: (settings.smtpFrom || process.env.SMTP_FROM || "").trim(),
    secure: settings.smtpSecure === "true" || port === 465,
    authType: settings.smtpAuthType || "password",
    oauth2ClientId: settings.smtpOauth2ClientId || "",
    oauth2ClientSecret: settings.smtpOauth2ClientSecret || "",
    oauth2RefreshToken: settings.smtpOauth2RefreshToken || ""
  };
};

export const sendMailWithSmtp = async (
  to: string,
  subject: string,
  html: string,
  companyId?: number
): Promise<void> => {
  const smtp = await getSmtpSettings(companyId);

  if (!smtp.host || !smtp.user) {
    throw new Error("SMTP incompleto: configure host e usuário SMTP nas configurações do whitelabel.");
  }

  const transportConfig: any = {
    host: smtp.host,
    port: smtp.port,
    secure: smtp.secure
  };

  if (smtp.authType === "oauth2") {
    transportConfig.auth = {
      type: "OAuth2",
      user: smtp.user,
      clientId: smtp.oauth2ClientId,
      clientSecret: smtp.oauth2ClientSecret,
      refreshToken: smtp.oauth2RefreshToken
    };
  } else {
    transportConfig.auth = {
      user: smtp.user,
      pass: smtp.pass
    };
  }

  const fromAddress = smtp.from
    ? smtp.from.includes("@")
      ? smtp.from
      : `"${smtp.from}" <${smtp.user}>`
    : `"${smtp.user}" <${smtp.user}>`;

  if (!smtp.secure) {
    transportConfig.tls = {
      rejectUnauthorized: false
    };
  }

  const transporter = nodemailer.createTransport(transportConfig);

  await transporter.sendMail({
    from: fromAddress,
    to,
    subject,
    html
  });
};
