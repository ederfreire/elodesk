import User from "../../models/User";
import PasswordResetCode from "../../models/PasswordResetCode";
import { sendMailWithSmtp } from "../../helpers/SendMailWithSmtpSettings";
import AppError from "../../errors/AppError";
import { getEmailTranslation, getDirection } from "../../helpers/EmailTranslations";

const SendPasswordResetCodeService = async (email: string, language: string = "pt"): Promise<void> => {
  const user = await User.findOne({ where: { email } });

  if (!user) {
    throw new AppError("E-mail não encontrado.", 404);
  }

  const dir = getDirection(language);
  const t = (key: string) => getEmailTranslation(language, key);

  // Invalidar códigos anteriores
  await PasswordResetCode.update(
    { used: true },
    { where: { userId: user.id, used: false } }
  );

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min

  await PasswordResetCode.create({
    userId: user.id,
    code,
    expiresAt,
    used: false
  });

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 20px;" dir="${dir}">
      <h2 style="color: #333;">${t("resetTitle")}</h2>
      <p>${t("signupGreeting")} <strong>${user.name}</strong>,</p>
      <p>${t("resetMessage")}</p>
      <div style="background: #f5f5f5; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
        <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #333;">${code}</span>
      </div>
      <p>${t("resetExpiry")}</p>
      <p style="color: #999; font-size: 12px;">${t("resetIgnore")}</p>
    </div>
  `;

  await sendMailWithSmtp(email, t("resetSubject"), html, user.companyId);
};

export default SendPasswordResetCodeService;
