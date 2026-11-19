import { redisClient } from '../libs/redisClient';
import logger from './logger';

/**
 * Lock distribuído usando Redis (SET NX EX pattern).
 * Evita race conditions em operações críticas como criação de tickets.
 */
export async function acquireLock(
  key: string,
  ttlSeconds: number = 10
): Promise<string | null> {
  const lockValue = `${process.pid}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  try {
    const result = await redisClient.set(key, lockValue, "EX", ttlSeconds, "NX");
    if (result === "OK") {
      return lockValue;
    }
    return null;
  } catch (error) {
    logger.error(`[RedisLock] Erro ao adquirir lock ${key}: ${error}`);
    return null;
  }
}

/**
 * Libera o lock somente se o valor ainda pertence a quem adquiriu (evita liberar lock de outro processo).
 * Usa script Lua para atomicidade.
 */
export async function releaseLock(key: string, lockValue: string): Promise<boolean> {
  const luaScript = `
    if redis.call("get", KEYS[1]) == ARGV[1] then
      return redis.call("del", KEYS[1])
    else
      return 0
    end
  `;
  try {
    const result = await redisClient.eval(luaScript, 1, key, lockValue);
    return result === 1;
  } catch (error) {
    logger.error(`[RedisLock] Erro ao liberar lock ${key}: ${error}`);
    return false;
  }
}

/**
 * Executa uma função com lock distribuído. Tenta adquirir o lock com retries.
 * Se não conseguir, executa sem lock (fallback para não bloquear o sistema).
 */
export async function withLock<T>(
  lockKey: string,
  fn: () => Promise<T>,
  options: { ttlSeconds?: number; maxRetries?: number; retryDelayMs?: number } = {}
): Promise<T> {
  const { ttlSeconds = 10, maxRetries = 5, retryDelayMs = 200 } = options;

  let lockValue: string | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    lockValue = await acquireLock(lockKey, ttlSeconds);
    if (lockValue) break;
    logger.debug(`[RedisLock] Tentativa ${attempt + 1}/${maxRetries} para lock ${lockKey}`);
    await new Promise(resolve => setTimeout(resolve, retryDelayMs + Math.random() * retryDelayMs));
  }

  if (!lockValue) {
    // Última tentativa com TTL mais longo
    logger.warn(`[RedisLock] Tentando lock final com TTL estendido para ${lockKey}`);
    await new Promise(resolve => setTimeout(resolve, retryDelayMs * 5));
    lockValue = await acquireLock(lockKey, ttlSeconds * 2);
  }

  if (!lockValue) {
    logger.error(`[RedisLock] FALHA TOTAL ao obter lock ${lockKey} após todas tentativas. Aguardando para evitar duplicação...`);
    // Aguardar o tempo total do TTL para garantir que o outro processo terminou
    await new Promise(resolve => setTimeout(resolve, ttlSeconds * 1000));
  }

  try {
    return await fn();
  } finally {
    if (lockValue) {
      await releaseLock(lockKey, lockValue);
    }
  }
}
