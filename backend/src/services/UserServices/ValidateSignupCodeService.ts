import cache from "../../libs/cache";
import AppError from "../../errors/AppError";

const ValidateSignupCodeService = async (email: string, code: string): Promise<boolean> => {
  const storedCode = await cache.get(`signup-verify:${email}`);

  if (!storedCode) {
    throw new AppError("Código expirado. Solicite um novo código.", 400);
  }

  if (storedCode !== code) {
    throw new AppError("Código inválido.", 400);
  }

  // Mark as verified (valid for 30 minutes to complete signup)
  await cache.set(`signup-verified:${email}`, "true", "EX", 1800);
  await cache.del(`signup-verify:${email}`);

  return true;
};

export default ValidateSignupCodeService;
