import cache from "../libs/cache";

interface RateLimitConfig {
  maxAttempts: number;
  windowMs: number;
  keyPrefix: string;
}

const rateLimiter = (config: RateLimitConfig) => {
  return async (req: any, res: any, next: any) => {
    const email = req.body.email || req.body.token || req.ip;
    const key = `${config.keyPrefix}:${email}`;

    try {
      const current = await cache.get(key);
      const attempts = current ? parseInt(current, 10) : 0;

      if (attempts >= config.maxAttempts) {
        return res.status(429).json({
          error: "Muitas tentativas. Tente novamente em alguns minutos."
        });
      }

      const windowSeconds = Math.ceil(config.windowMs / 1000);
      await cache.set(key, String(attempts + 1), "EX", windowSeconds);

      return next();
    } catch {
      return next();
    }
  };
};

export const passwordResetLimiter = rateLimiter({
  maxAttempts: 3,
  windowMs: 15 * 60 * 1000,
  keyPrefix: "rl:pwd-reset"
});

export const validateCodeLimiter = rateLimiter({
  maxAttempts: 3,
  windowMs: 15 * 60 * 1000,
  keyPrefix: "rl:validate-code"
});
