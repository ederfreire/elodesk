import { Request, Response } from "express";
import SendSignupVerificationCodeService from "../services/UserServices/SendSignupVerificationCodeService";
import ValidateSignupCodeService from "../services/UserServices/ValidateSignupCodeService";

export const sendSignupCode = async (req: Request, res: Response): Promise<Response> => {
  const { email, name, language } = req.body;

  if (!email || !name) {
    return res.status(400).json({ error: "E-mail e nome são obrigatórios." });
  }

  try {
    const { code, smtpBypass } = await SendSignupVerificationCodeService(
      email,
      name,
      language || "pt"
    );

    if (smtpBypass) {
      // SMTP não configurado: devolve o código para o frontend preencher
      // automaticamente e concluir o cadastro sem depender de e-mail.
      return res.status(200).json({
        message: "SMTP não configurado. Código gerado automaticamente.",
        smtpBypass: true,
        code
      });
    }

    return res.status(200).json({ message: "Código de verificação enviado." });
  } catch (err: any) {
    throw err;
  }
};

export const validateSignupCode = async (req: Request, res: Response): Promise<Response> => {
  const { email, code } = req.body;

  if (!email || !code) {
    return res.status(400).json({ error: "E-mail e código são obrigatórios." });
  }

  await ValidateSignupCodeService(email, code);

  return res.status(200).json({ verified: true });
};
