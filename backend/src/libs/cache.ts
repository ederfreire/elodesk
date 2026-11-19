import Redis from "ioredis";
import hmacSHA512 from "crypto-js/hmac-sha512";
import Base64 from "crypto-js/enc-base64";
import { REDIS_URI_CONNECTION } from "../config/redis";

class CacheSingleton {
  private redis: Redis;

  private static instance: CacheSingleton;

  private constructor(redisInstance: Redis) {
    this.redis = redisInstance;
  }

  public static getInstance(redisInstance: Redis): CacheSingleton {
    if (!CacheSingleton.instance) {
      CacheSingleton.instance = new CacheSingleton(redisInstance);
    }
    return CacheSingleton.instance;
  }

  private static encryptParams(params: any) {
    const str = JSON.stringify(params);
    const key = Base64.stringify(hmacSHA512(params, str));
    return key;
  }

  /**
   * Grava no Redis, opcionalmente com expiração.
   *
   * A opção é declarada como "EX" | "PX", não como string solta: o ioredis
   * tipa `set` com uma sobrecarga por modificador, e um `string` genérico não
   * casa com nenhuma delas. Como todas as chamadas do sistema usam
   * `set(chave, valor, "EX", segundos)`, restringir aqui reflete o uso real e
   * ainda impede que um modificador inválido chegue ao Redis.
   *
   * O `?? ""` existe porque o Redis devolve null quando a gravação não
   * acontece (por exemplo com NX/XX); quem chama espera texto.
   */
  public async set(
    key: string,
    value: string,
    option?: "EX" | "PX",
    optionValue?: string | number
  ): Promise<string> {
    if (option === "EX" && optionValue !== undefined) {
      return (await this.redis.set(key, value, "EX", Number(optionValue))) ?? "";
    }
    if (option === "PX" && optionValue !== undefined) {
      return (await this.redis.set(key, value, "PX", Number(optionValue))) ?? "";
    }
    return (await this.redis.set(key, value)) ?? "";
  }

  public async get(key: string): Promise<string | null> {
    return this.redis.get(key);
  }

  public async getKeys(pattern: string): Promise<string[]> {
    return this.redis.keys(pattern);
  }

  public async del(key: string): Promise<number> {
    return this.redis.del(key);
  }

  public async delFromPattern(pattern: string): Promise<void> {
    const all = await this.getKeys(pattern);
    await Promise.all(all.map(item => this.del(item)));
  }

  public async setFromParams(
    key: string,
    params: any,
    value: string,
    // Mesmo tipo do set acima: repassar um `string` solto voltaria a quebrar.
    option?: "EX" | "PX",
    optionValue?: string | number
  ): Promise<string> {
    const finalKey = `${key}:${CacheSingleton.encryptParams(params)}`;
    if (option !== undefined && optionValue !== undefined) {
      return this.set(finalKey, value, option, optionValue);
    }
    return this.set(finalKey, value);
  }

  public async getFromParams(key: string, params: any): Promise<string | null> {
    const finalKey = `${key}:${CacheSingleton.encryptParams(params)}`;
    return this.get(finalKey);
  }

  public async delFromParams(key: string, params: any): Promise<number> {
    const finalKey = `${key}:${CacheSingleton.encryptParams(params)}`;
    return this.del(finalKey);
  }

  public getRedisInstance(): Redis {
    return this.redis;
  }
}

const redisInstance = new Redis(REDIS_URI_CONNECTION);

export default CacheSingleton.getInstance(redisInstance);