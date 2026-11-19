import { sendMailWithSmtp } from "../../helpers/SendMailWithSmtpSettings";
import cache from "../../libs/cache";
import logger from "../../utils/logger";
import { getEmailTranslation, getDirection } from "../../helpers/EmailTranslations";

export interface SendSignupVerificationResult {
  /** Código gerado e armazenado no Redis. */
  code: string;
  /**
   * true quando o SMTP não está configurado — nesse caso o código é
   * devolvido para o frontend preencher automaticamente e permitir a
   * conclusão do cadastro sem envio de e-mail.
   */
  smtpBypass: boolean;
}

const SendSignupVerificationCodeService = async (
  email: string,
  name: string,
  language: string = "pt"
): Promise<SendSignupVerificationResult> => {
  const code = String(Math.floor(100000 + Math.random() * 900000));
  const dir = getDirection(language);
  const t = (key: string) => getEmailTranslation(language, key);

  // Store code in Redis for 10 minutes
  await cache.set(`signup-verify:${email}`, code, "EX", 600);

  const html = `
    <div style="font-family: Arial, sans-serif; max-width: 480px; margin: 0 auto; padding: 20px;" dir="${dir}">
      <h2 style="color: #333;">${t("signupTitle")}</h2>
      <p>${t("signupGreeting")} <strong>${name}</strong>,</p>
      <p>${t("signupMessage")}</p>
      <div style="background: #f5f5f5; padding: 20px; text-align: center; border-radius: 8px; margin: 20px 0;">
        <span style="font-size: 32px; font-weight: bold; letter-spacing: 8px; color: #333;">${code}</span>
      </div>
      <p>${t("signupExpiry")}</p>
      <p style="color: #999; font-size: 12px;">${t("signupIgnore")}</p>
    </div>
  `;

  try {
    await sendMailWithSmtp(email, t("signupSubject"), html);
    return { code, smtpBypass: false };
  } catch (err: any) {
    // Se o SMTP não está configurado, seguimos com o cadastro devolvendo
    // o código para o frontend preencher automaticamente.
    if (err?.message && String(err.message).includes("SMTP incompleto")) {
      logger.warn(
        `[SIGNUP] SMTP não configurado — liberando código de verificação para ${email}: ${code}`
      );
      return { code, smtpBypass: true };
    }
    throw err;
  }
};

export default SendSignupVerificationCodeService;
