import { Request, Response } from "express";
import SendPasswordResetCodeService from "../services/PasswordResetServices/SendPasswordResetCodeService";
import ValidatePasswordResetCodeService from "../services/PasswordResetServices/ValidatePasswordResetCodeService";
import ResetPasswordService from "../services/PasswordResetServices/ResetPasswordService";

export const forgotPassword = async (req: Request, res: Response): Promise<Response> => {
  const { email, language } = req.body;

  await SendPasswordResetCodeService(email, language || "pt");

  return res.status(200).json({ message: "Código enviado com sucesso." });
};

export const validateCode = async (req: Request, res: Response): Promise<Response> => {
  const { email, code } = req.body;

  const result = await ValidatePasswordResetCodeService(email, code);

  return res.status(200).json(result);
};

export const resetPassword = async (req: Request, res: Response): Promise<Response> => {
  const { resetToken, newPassword } = req.body;

  await ResetPasswordService(resetToken, newPassword);

  return res.status(200).json({ message: "Senha alterada com sucesso." });
};
