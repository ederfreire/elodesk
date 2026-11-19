import logger from "./logger";

interface CacheEntry {
  jid: string;
  exists: boolean;
  timestamp: number;
}

const cache = new Map<string, CacheEntry>();
const CACHE_TTL_MS = 10 * 60 * 1000; // 10 minutos

/**
 * Cache para resultados de wbot.onWhatsApp()
 * Evita chamadas repetidas à API do WhatsApp para o mesmo número
 */
export const getCachedOnWhatsApp = async (
  wbot: any,
  jid: string
): Promise<{ exists: boolean; jid: string } | null> => {
  const normalizedKey = jid.split("@")[0]; // usar apenas o número como chave

  // Verificar cache
  const cached = cache.get(normalizedKey);
  if (cached && Date.now() - cached.timestamp < CACHE_TTL_MS) {
    logger.debug(`[onWhatsApp-cache] HIT: ${normalizedKey} → ${cached.jid}`);
    return { exists: cached.exists, jid: cached.jid };
  }

  // Cache miss — chamar API
  try {
    const result = await wbot.onWhatsApp(jid);
    if (result?.[0]) {
      const entry: CacheEntry = {
        jid: result[0].jid || jid,
        exists: !!result[0].exists,
        timestamp: Date.now()
      };
      cache.set(normalizedKey, entry);
      logger.debug(`[onWhatsApp-cache] MISS → cached: ${normalizedKey} → ${entry.jid}`);
      return { exists: entry.exists, jid: entry.jid };
    }
    return null;
  } catch (err) {
    logger.warn(`[onWhatsApp-cache] Erro ao consultar onWhatsApp para ${jid}: ${err.message}`);
    return null;
  }
};

/**
 * Limpar entradas expiradas periodicamente
 */
export const cleanOnWhatsAppCache = (): void => {
  const now = Date.now();
  let cleaned = 0;
  for (const [key, entry] of cache.entries()) {
    if (now - entry.timestamp > CACHE_TTL_MS) {
      cache.delete(key);
      cleaned++;
    }
  }
  if (cleaned > 0) {
    logger.debug(`[onWhatsApp-cache] Limpadas ${cleaned} entradas expiradas`);
  }
};

// Limpar cache a cada 5 minutos
setInterval(cleanOnWhatsAppCache, 5 * 60 * 1000);

export default getCachedOnWhatsApp;
