import { v4 as uuidv4 } from "uuid";
import User from "../../models/User";
import PasswordResetCode from "../../models/PasswordResetCode";
import AppError from "../../errors/AppError";
import { Op } from "sequelize";

interface Response {
  resetToken: string;
}

const ValidatePasswordResetCodeService = async (
  email: string,
  code: string
): Promise<Response> => {
  const user = await User.findOne({ where: { email } });

  if (!user) {
    throw new AppError("E-mail não encontrado.", 404);
  }

  const resetCode = await PasswordResetCode.findOne({
    where: {
      userId: user.id,
      code,
      used: false,
      expiresAt: { [Op.gt]: new Date() }
    }
  });

  if (!resetCode) {
    throw new AppError("Código inválido ou expirado.", 400);
  }

  const resetToken = uuidv4();

  await resetCode.update({
    used: true,
    resetToken
  });

  return { resetToken };
};

export default ValidatePasswordResetCodeService;
