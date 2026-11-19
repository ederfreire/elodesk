import cacheLayer from "../libs/cache";
import logger from "../utils/logger";

type JwtConfig = {
  secret: string | null;
  expiresIn: string;
  refreshSecret: string | null;
  refreshExpiresIn: string;
};

const CACHE_KEY_JWT_SECRET = "EQUIPECHAT_JWT_SECRET";
const CACHE_KEY_JWT_REFRESH_SECRET = "EQUIPECHAT_JWT_REFRESH_SECRET";

function generateSecret(length: number): string {
  const charset =
    "abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*()-_=+";
  let secret = "";
  for (let i = 0; i < length; i += 1) {
    const randomIndex = Math.floor(Math.random() * charset.length);
    secret += charset[randomIndex];
  }
  return secret;
}

async function generateSecretIfNotExists(cacheKey: string, envFallback?: string): Promise<string> {
  // First check env var
  if (envFallback) {
    // Store env value in cache for consistency across restarts
    await cacheLayer.set(cacheKey, envFallback);
    return envFallback;
  }

  // Then check cache (Redis)
  let secret = await cacheLayer.get(cacheKey);
  if (!secret) {
    secret = generateSecret(32);
    await cacheLayer.set(cacheKey, secret);
    logger.info(`[auth.ts] Generated new ${cacheKey}`);
  } else {
    logger.info(`[auth.ts] Loaded ${cacheKey} from cache`);
  }
  return secret;
}

const authConfig: JwtConfig = {
  secret: null,
  expiresIn: "8h",
  refreshSecret: null,
  refreshExpiresIn: "30d"
};

// Initialize secrets asynchronously
const secretPromise = generateSecretIfNotExists(
  CACHE_KEY_JWT_SECRET,
  process.env.JWT_SECRET || undefined
);
const refreshSecretPromise = generateSecretIfNotExists(
  CACHE_KEY_JWT_REFRESH_SECRET,
  process.env.JWT_REFRESH_SECRET || undefined
);

// Middlewares/serviços que dependem de authConfig.secret/refreshSecret
// (isAuth, RefreshTokenService...) rodam logo nos primeiros requests após
// o boot, ANTES do Redis responder essa busca. Sem isso, uma requisição
// que chega nesses ~100-300ms iniciais via `!authConfig.secret` e é
// tratada como sessão inválida — no caso do refresh token, isso chega a
// limpar o cookie "jrt" do usuário, forçando um login manual por causa de
// um simples restart/deploy do backend. `authReady` deixa quem precisa
// dos secrets aguardar essa janela em vez de falhar na hora.
export const authReady: Promise<void> = Promise.all([
  secretPromise,
  refreshSecretPromise
])
  .then(([secret, refreshSecret]) => {
    authConfig.secret = secret;
    authConfig.refreshSecret = refreshSecret;
    logger.info("[auth.ts] JWT secrets initialized successfully");
  })
  .catch(err => {
    logger.error(
      `[auth.ts] Falha ao inicializar JWT secrets: ${err?.message}`
    );
    process.exit(1);
  });

export default authConfig;
