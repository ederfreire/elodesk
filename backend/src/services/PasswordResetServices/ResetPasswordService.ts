import PasswordResetCode from "../../models/PasswordResetCode";
import User from "../../models/User";
import AppError from "../../errors/AppError";

const ResetPasswordService = async (
  resetToken: string,
  newPassword: string
): Promise<void> => {
  const resetCode = await PasswordResetCode.findOne({
    where: { resetToken }
  });

  if (!resetCode) {
    throw new AppError("Token inválido.", 400);
  }

  const user = await User.findByPk(resetCode.userId);

  if (!user) {
    throw new AppError("Usuário não encontrado.", 404);
  }

  user.password = newPassword;
  await user.save();

  // Invalidar token
  await resetCode.update({ resetToken: null });
};

export default ResetPasswordService;
