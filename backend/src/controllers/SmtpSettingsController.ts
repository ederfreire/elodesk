import { Request, Response } from "express";
import Setting from "../models/Setting";
import { sendMailWithSmtp } from "../helpers/SendMailWithSmtpSettings";
import { getEmailTranslation, getDirection } from "../helpers/EmailTranslations";

const SMTP_KEYS = [
  "smtpHost", "smtpPort", "smtpUser", "smtpPass", "smtpFrom",
  "smtpSecure", "smtpAuthType", "smtpOauth2ClientId",
  "smtpOauth2ClientSecret", "smtpOauth2RefreshToken"
];

export const getSmtpSettings = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const result: Record<string, string> = {};

  for (const key of SMTP_KEYS) {
    const setting = await Setting.findOne({ where: { key, companyId } });
    result[key] = setting ? setting.value : "";
  }

  return res.json(result);
};

export const updateSmtpSettings = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const data = req.body;

  for (const key of SMTP_KEYS) {
    if (data[key] !== undefined) {
      const [setting] = await Setting.findOrCreate({
        where: { key, companyId },
        defaults: { key, value: data[key], companyId }
      });
      await setting.update({ value: data[key] });
    }
  }

  return res.json({ message: "OK" });
};

export const testSmtp = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { email, language } = req.body;

  const lang = language || "pt";
  const dir = getDirection(lang);
  const t = (key: string) => getEmailTranslation(lang, key);

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 20px;" dir="${dir}">
      <h2 style="color: #333;">${t("smtpTestTitle")}</h2>
      <p>${t("smtpTestMessage")}</p>
    </div>
  `;

  await sendMailWithSmtp(email, t("smtpTestSubject"), html, companyId);

  return res.json({ message: "OK" });
};
