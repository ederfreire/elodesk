import { Logger } from '@nestjs/common';
import { Redis } from 'ioredis';

export class RedisService {
  private client: Redis;
  private logger: Logger = new Logger('RedisServer');

  constructor() {
    this.logger.log('🔄 Iniciando conexão com Redis...');
    try {
      const uri = process.env.REDIS_URI || 'redis://127.0.0.1:6379';
      const password =
        process.env.REDIS_PASSWORD || this.extractPassword(uri) || undefined;

      // Sem password explícito o ioredis lançava "NOAUTH Authentication
      // required" como unhandled error event a cada reconexão, o que
      // derrubava o processo no pm2. Aqui a senha é resolvida a partir da
      // URI (ou de REDIS_PASSWORD) e os erros passam a ser tratados.
      this.client = new Redis(uri, {
        password,
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
        retryStrategy: (times) => Math.min(times * 200, 5000),
      });

      this.client.on('error', (error) => {
        this.logger.error(`❌ Erro na conexão Redis: ${error?.message || error}`);
      });
      this.client.on('ready', () => {
        this.logger.log('📡 Conexão com Redis estabelecida com sucesso');
      });
    } catch (error) {
      this.logger.error(`❌ Erro ao conectar com Redis: ${error}`);
    }
  }

  private extractPassword(uri: string): string | undefined {
    try {
      const parsed = new URL(uri);
      return parsed.password ? decodeURIComponent(parsed.password) : undefined;
    } catch {
      return undefined;
    }
  }


  async set(key: string, value: string): Promise<void> {
    await this.client.set(key, value);
  }

  /**
   * SET com TTL (segundos). Retorna true se a chave foi criada agora
   * (NX). Útil para deduplicar eventos idempotentes.
   */
  async setNxEx(key: string, value: string, ttlSeconds: number): Promise<boolean> {
    const res = await this.client.set(key, value, 'EX', ttlSeconds, 'NX');
    return res === 'OK';
  }

  async get(key: string): Promise<string | null> {
    return await this.client.get(key);
  }

  async del(key: string): Promise<number> {
    return await this.client.del(key);
  }

  async keys(pattern: string): Promise<string[]> {
    return await this.client.keys(pattern);
  }

  async quit(): Promise<void> {
    try {
      await this.client.quit();
      this.logger.log('👋 Conexão com Redis encerrada com sucesso');
    } catch (error) {
      this.logger.error(`❌ Erro ao encerrar conexão com Redis: ${error}`);
    }
  }
}
