import { Logger } from '@nestjs/common';
import {
  IBodyReadMessage,
  IMetaMessage,
  IResultTemplates,
  IReturnAuthMeta,
  IReturnMessageFile,
  IReturnMessageMeta,
} from './interfaces/IMeta.interfaces';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'fs';
import { convertMimeTypeToExtension } from 'src/@core/common/utils/convertMimeTypeToExtension';
import axios from 'axios';
import { lookup } from 'mime-types';
import { deleteFile } from 'src/@core/common/utils/files.utils';

export class MetaService {
  private readonly logger: Logger = new Logger(`${MetaService.name}`);
  urlMeta = `https://graph.facebook.com/v20.0`;

  path = `./public`;

  constructor() {}

  /**
   * Cache do App ID descoberto via debug_token, para evitar chamar a Meta
   * repetidamente quando META_APP_ID não está definido nas envs.
   */
  private appIdCache: Map<string, string> = new Map();

  /**
   * Tenta descobrir o App ID associado ao token via /debug_token.
   * Evita exigir a env META_APP_ID.
   */
  private async resolveAppId(token: string): Promise<string> {
    const envAppId =
      process.env.META_APP_ID ||
      process.env.FACEBOOK_APP_ID ||
      process.env.FB_APP_ID;
    if (envAppId) return envAppId;

    if (this.appIdCache.has(token)) return this.appIdCache.get(token);

    try {
      const res = await axios.get(`${this.urlMeta}/debug_token`, {
        params: { input_token: token, access_token: token },
        timeout: 15000,
      });
      const appId = res.data?.data?.app_id;
      if (!appId) {
        throw new Error('debug_token não retornou app_id');
      }
      const appIdStr = String(appId);
      this.appIdCache.set(token, appIdStr);
      this.logger.log(`[TEMPLATE_MEDIA] App ID descoberto via debug_token: ${appIdStr}`);
      return appIdStr;
    } catch (err: any) {
      const detail = err?.response?.data
        ? JSON.stringify(err.response.data)
        : err?.message;
      throw new Error(
        `Não foi possível descobrir o App ID via /debug_token (${detail}). Defina META_APP_ID nas variáveis de ambiente da API Oficial.`,
      );
    }
  }

  /**
   * Faz upload de uma mídia (a partir de uma URL pública) via Resumable Upload
   * API da Meta e retorna o handle (`h`) que pode ser usado em
   * `components[].example.header_handle`.
   *
   * Se META_APP_ID não estiver definido, tenta descobrir automaticamente o
   * App ID via endpoint /debug_token usando o próprio access token.
   */
  async uploadResumableMediaFromUrl(
    token: string,
    fileUrl: string,
  ): Promise<string> {
    const appId = await this.resolveAppId(token);

    // 1. Baixa o arquivo da URL pública
    const download = await axios.get(fileUrl, {
      responseType: 'arraybuffer',
      timeout: 60000,
    });
    const buffer = Buffer.from(download.data);
    const contentType =
      download.headers['content-type'] ||
      (lookup(fileUrl) as string) ||
      'application/octet-stream';
    const fileLength = buffer.byteLength;

    // 2. Cria a sessão de upload
    const sessionRes = await axios.post(
      `${this.urlMeta}/${appId}/uploads`,
      null,
      {
        params: {
          file_name: fileUrl.split('/').pop() || 'header',
          file_length: fileLength,
          file_type: contentType,
          access_token: token,
        },
        timeout: 30000,
      },
    );
    const rawSessionId: string = sessionRes.data?.id;
    // A API retorna algo como "upload:MTph..." — precisamos do valor cru.
    const sessionId = rawSessionId;
    if (!sessionId) {
      throw new Error('Falha ao iniciar sessão de upload na Meta');
    }

    // 3. Envia o conteúdo e recebe a handle (`h`)
    const uploadRes = await axios.post(
      `${this.urlMeta}/${sessionId}`,
      buffer,
      {
        headers: {
          Authorization: `OAuth ${token}`,
          file_offset: '0',
          'Content-Type': contentType,
        },
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
        timeout: 120000,
      },
    );

    const handle: string = uploadRes.data?.h;
    if (!handle) {
      throw new Error('Meta não retornou o handle do upload (campo "h").');
    }
    return handle;
  }

  /**
   * Percorre os componentes do template e, para qualquer HEADER com format
   * IMAGE/VIDEO/DOCUMENT cujo example.header_handle[0] seja uma URL pública,
   * substitui esse valor por um handle de upload resumível obtido na Meta.
   *
   * Se já vier um handle (não começa com http), mantém como está.
   */
  async normalizeTemplateMediaHeaders(
    data: { components?: any[] } & Record<string, any>,
    token: string,
  ): Promise<typeof data> {
    const components = Array.isArray(data?.components) ? data.components : [];
    const mediaFormats = ['IMAGE', 'VIDEO', 'DOCUMENT'];

    const parseExample = (example: any) => {
      if (typeof example !== 'string') return example || {};
      const trimmed = example.trim();
      if (/^https?:\/\//i.test(trimmed)) return { header_handle: [trimmed] };
      try {
        return JSON.parse(trimmed);
      } catch (_) {
        return { header_handle: [trimmed] };
      }
    };

    const extractHeaderExample = (comp: any): string | null => {
      const example = parseExample(comp?.example);
      const candidates = [
        example?.header_handle,
        example?.header_url,
        example?.media_url,
        example?.url,
        comp?.header_handle,
        comp?.media_url,
        comp?.url,
        comp?.link,
      ];

      for (const candidate of candidates) {
        if (Array.isArray(candidate) && candidate[0]) return String(candidate[0]).trim();
        if (typeof candidate === 'string' && candidate.trim()) return candidate.trim();
      }

      return null;
    };

    for (const comp of components) {
      const type = String(comp?.type || '').toUpperCase();
      const format = String(comp?.format || '').toUpperCase();
      if (type !== 'HEADER' || !mediaFormats.includes(format)) continue;

      const first = extractHeaderExample(comp);

      if (!first) {
        throw new Error(
          `Header do tipo ${format} sem URL/handle de exemplo. Informe a URL pública da mídia.`,
        );
      }

      const isUrl = /^https?:\/\//i.test(String(first));
      if (!isUrl) {
        // Já é handle da Meta, mas garante que fique exatamente no formato
        // aceito por /message_templates.
        comp.example = { header_handle: [first] };
        delete comp.header_handle;
        delete comp.media_url;
        delete comp.url;
        delete comp.link;
        continue;
      }

      this.logger.log(
        `[TEMPLATE_MEDIA] Fazendo upload resumível do header ${format} -> ${first}`,
      );
      const handle = await this.uploadResumableMediaFromUrl(token, first);
      comp.example = { header_handle: [handle] };
      delete comp.header_handle;
      delete comp.media_url;
      delete comp.url;
      delete comp.link;
      this.logger.log(`[TEMPLATE_MEDIA] Handle obtido: ${handle}`);
    }

    return data;
  }

  private sanitizeMetaId(value: string): string {
    return String(value || '').trim();
  }

  /**
   * Retry com backoff exponencial para falhas temporárias de rede.
   * Retenta apenas erros de rede/timeout (sem response da Meta = falha de conexão).
   * Erros 4xx da Meta NÃO são retentados (ex: token inválido, payload errado).
   */
  private async withRetry<T>(
    fn: () => Promise<T>,
    label: string,
    maxRetries: number = 3,
    baseDelayMs: number = 1000,
  ): Promise<T> {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error: any) {
        const isNetworkError = !error?.response; // sem response = falha de rede/timeout
        const isRetryableStatus = error?.response?.status >= 500; // 5xx da Meta

        if ((isNetworkError || isRetryableStatus) && attempt < maxRetries) {
          const delay = baseDelayMs * Math.pow(2, attempt - 1); // 1s, 2s, 4s
          this.logger.warn(
            `[RETRY] ${label} - Tentativa ${attempt}/${maxRetries} falhou (${error?.code || error?.message}). Retentando em ${delay}ms...`,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
        } else {
          throw error; // erro não retentável ou última tentativa
        }
      }
    }
    throw new Error(`[RETRY] ${label} - Todas as ${maxRetries} tentativas falharam`);
  }

  async send<T>(
    url: string,
    token: string,
    existFile: boolean = false,
  ): Promise<T | any> {
    const headers = {
      'Content-Type': !!existFile ? 'arraybuffer' : 'application/json',
      Authorization: `Bearer ${token}`,
      'User-Agent': 'curl/7.64.1',
    };

    const result = await axios.get(url, {
      headers,
      timeout: 30000,
    });

    return result.data as T;
  }

  async authFileMeta(
    idMessage: string,
    phone_number_id: string,
    token: string,
  ): Promise<IReturnAuthMeta> {
    try {
      const url = `https://graph.facebook.com/v20.0/${idMessage}?phone_number_id=${phone_number_id}`;

      return await this.send<IReturnAuthMeta>(url, token);
    } catch (error: any) {
      this.logger.error(`authDownloadFile - ${error.message}`);
      throw Error('Erro ao converter o arquivo');
    }
  }

  /**
   * ✅ NOVO: Retorna apenas os metadados do arquivo (URL, mimeType, tamanho)
   * sem baixar o arquivo completo. Útil para vídeos e documentos grandes.
   */
  async getFileMetadata(
    idMessage: string,
    phone_number_id: string,
    token: string,
  ): Promise<{ url: string; mimeType: string; fileSize: number }> {
    try {
      const auth = await this.authFileMeta(idMessage, phone_number_id, token);
      
      this.logger.log(`[GET METADATA] Arquivo ${idMessage} - URL obtida, tamanho: ${auth.file_size} bytes`);
      
      return {
        url: auth.url,
        mimeType: auth.mime_type,
        fileSize: auth.file_size,
      };
    } catch (error: any) {
      this.logger.error(`getFileMetadata - ${error.message}`);
      throw Error('Erro ao obter metadados do arquivo');
    }
  }

  async downloadFileMeta(
    idMessage: string,
    phone_number_id: string,
    token: string,
    companyId: number,
    conexao: number,
  ): Promise<{ base64: string; mimeType: string }> {
    try {
      const auth = await this.authFileMeta(idMessage, phone_number_id, token);

      if (!existsSync(this.path)) mkdirSync(this.path);
      if (!existsSync(`${this.path}/${companyId}`))
        mkdirSync(`${this.path}/${companyId}`);
      if (!existsSync(`${this.path}/${companyId}/${conexao}`))
        mkdirSync(`${this.path}/${companyId}/${conexao}`);

      const pathFile = `${this.path}/${companyId}/${conexao}`;

      const mimeType = convertMimeTypeToExtension(auth.mime_type);

      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
        'User-Agent': 'curl/7.64.1',
      };

      const result = await axios.get(auth.url, {
        headers,
        responseType: 'arraybuffer',
      });

      if (result.status != 200)
        throw new Error('Falha em baixar o arquivo da meta');

      const base64 = result.data.toString('base64');

      writeFileSync(`${pathFile}/${idMessage}.${mimeType}`, result.data);

      return {
        base64,
        mimeType: auth.mime_type,
      };
    } catch (error: any) {
      console.log(error);
      this.logger.error(`authDownloadFile - ${error.message}`);
      throw Error('Erro ao converter o arquivo');
    }
  }

  async sendFileToMeta(
    numberId: string,
    token: string,
    pathFile: string,
  ): Promise<IReturnMessageFile | null> {
    try {
      const sanitizedNumberId = this.sanitizeMetaId(numberId);

      // Verificar se o arquivo existe antes de tentar ler
      const { existsSync, statSync } = require('fs');
      if (!existsSync(pathFile)) {
        throw new Error(`Arquivo não encontrado no caminho: ${pathFile}`);
      }

      const fileStats = statSync(pathFile);
      this.logger.log(`sendFileToMeta - Arquivo: ${pathFile}, Tamanho: ${fileStats.size} bytes`);

      if (fileStats.size === 0) {
        throw new Error(`Arquivo está vazio: ${pathFile}`);
      }

      const file = readFileSync(pathFile);

      const mimeType = lookup(pathFile);
      if (!mimeType) {
        // Tentar detectar pelo nome original ou usar fallback
        this.logger.warn(`sendFileToMeta - Não foi possível detectar MIME type para: ${pathFile}, usando application/octet-stream`);
      }

      const normalizedPath = String(pathFile || '').toLowerCase();
      const finalMimeType =
        normalizedPath.endsWith('.ogg') || normalizedPath.endsWith('.opus')
          ? 'audio/ogg'
          : normalizedPath.endsWith('.mp3')
            ? 'audio/mpeg'
            : normalizedPath.endsWith('.m4a')
              ? 'audio/mp4'
              : String(mimeType || '').startsWith('audio/')
                ? String(mimeType)
                : mimeType || 'application/octet-stream';
      this.logger.log(`sendFileToMeta - MIME type: ${finalMimeType}, numberId: ${sanitizedNumberId}`);

      const FormData = require('form-data');
      const formData = new FormData();
      formData.append('messaging_product', 'whatsapp');
      formData.append('type', finalMimeType);
      formData.append('file', file, {
        filename: pathFile.split('/').pop(),
        contentType: finalMimeType,
      });

      const result = await this.withRetry(
        () =>
          axios.post(`${this.urlMeta}/${sanitizedNumberId}/media`, formData, {
            headers: {
              Authorization: `Bearer ${token}`,
              ...formData.getHeaders(),
            },
            timeout: 120000,
            maxContentLength: Infinity,
            maxBodyLength: Infinity,
          }),
        `sendFileToMeta(${sanitizedNumberId})`,
        3,
        2000,
      );

      return result.data as IReturnMessageFile;
    } catch (error: any) {
      try { deleteFile(pathFile); } catch (e) { /* ignore cleanup error */ }
      const detail = error?.response?.data
        ? JSON.stringify(error.response.data)
        : error?.message || String(error);
      this.logger.error(`sendFileToMeta - ERRO DETALHADO: ${detail}`);
      this.logger.error(`sendFileToMeta - Status HTTP: ${error?.response?.status || 'N/A'}`);
      this.logger.error(`sendFileToMeta - Path arquivo: ${pathFile}`);
      throw Error(`Erro ao enviar o arquivo para a meta: ${detail}`);
    }
  }

  async sendMessage(numberId: string, token: string, message: IMetaMessage) {
    try {
      const sanitizedNumberId = this.sanitizeMetaId(numberId);

      const result = await this.withRetry(
        () =>
          axios.post(`${this.urlMeta}/${sanitizedNumberId}/messages`, message, {
            headers: {
              'Content-Type': 'application/json',
              Authorization: `Bearer ${token}`,
            },
            timeout: 60000,
          }),
        `sendMessage(${sanitizedNumberId})`,
      );

      return result.data as IReturnMessageMeta;
    } catch (error: any) {
      const detail = error?.response?.data
        ? JSON.stringify(error.response.data)
        : error?.message || String(error);
      this.logger.error(`sendMessage - ${detail}`);
      const metaError = error?.response?.data?.error;

      // Código 190 é sempre a mesma coisa: o token de acesso da Meta venceu ou
      // foi revogado. "Authentication Error (code: 190)" na tela não diz ao
      // atendente o que fazer — e recebimento continua funcionando (a Meta nos
      // entrega as mensagens sem token), então parece defeito do sistema.
      if (
        metaError?.code === 190 ||
        (!metaError && error?.response?.status === 401)
      ) {
        throw Error(
          'O token de acesso da Meta venceu. Gere um novo token no painel da Meta e salve-o na conexão (Conexões → editar → Token de envio).',
        );
      }

      const metaMsg = metaError?.message || 'Erro ao enviar a mensagem';
      throw Error(`Erro Meta: ${metaMsg} (code: ${metaError?.code || 'N/A'})`);
    }
  }

  async getListTemplates(wabaId: string, token: string) {
    try {
      const result = await axios.get(
        `${this.urlMeta}/${wabaId}/message_templates`,
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          timeout: 30000,
        },
      );

      return result.data as IResultTemplates;
    } catch (error: any) {
      const detail = error?.response?.data
        ? JSON.stringify(error.response.data)
        : error?.message || String(error);
      this.logger.error(`getListTemplates - ${detail}`);

      // Detectar token expirado/inválido (Meta retorna código 190 para OAuthException)
      const metaError = error?.response?.data?.error;
      if (metaError?.code === 190 || (!metaError && error?.response?.status === 401)) {
        throw Error('TOKEN_EXPIRED: O token de acesso da Meta expirou ou é inválido. Atualize o token na configuração da conexão.');
      }

      throw Error('Erro ao listar templates');
    }
  }

  async createTemplate(
    wabaId: string,
    token: string,
    data: { name: string; language: string; category: string; components: any[] },
  ) {
    try {
      // ✅ Se houver HEADER com format IMAGE/VIDEO/DOCUMENT e o example.header_handle
      //    estiver com uma URL pública (e não um handle da Meta), faz upload via
      //    Resumable Upload API e substitui pela handle (`h`) retornada.
      data = (await this.normalizeTemplateMediaHeaders(data, token)) as any;

      const result = await axios.post(
        `${this.urlMeta}/${wabaId}/message_templates`,
        data,
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          timeout: 30000,
        },
      );

      return result.data;
    } catch (error: any) {
      const detail = error?.response?.data
        ? JSON.stringify(error.response.data)
        : error?.message || String(error);
      this.logger.error(`createTemplate - ${detail}`);

      const metaError = error?.response?.data?.error;
      // ✅ Somente code 190 (e 401) realmente indica token expirado.
      //    OAuthException com outros códigos (ex: 100 = parâmetro inválido)
      //    NÃO é problema de token e precisa exibir a mensagem real da Meta.
      if (metaError?.code === 190 || (!metaError && error?.response?.status === 401)) {
        throw Error('TOKEN_EXPIRED: O token de acesso da Meta expirou ou é inválido. Atualize o token na configuração da conexão.');
      }

      const friendly =
        metaError?.error_user_msg ||
        metaError?.error_user_title ||
        metaError?.message ||
        error?.message ||
        'Erro ao criar o template';
      throw Error(friendly);
    }
  }

  async deleteTemplate(wabaId: string, token: string, templateName: string) {
    try {
      const result = await axios.delete(
        `${this.urlMeta}/${wabaId}/message_templates?name=${templateName}`,
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          timeout: 30000,
        },
      );

      return result.data;
    } catch (error: any) {
      const detail = error?.response?.data
        ? JSON.stringify(error.response.data)
        : error?.message || String(error);
      this.logger.error(`deleteTemplate - ${detail}`);

      const metaError = error?.response?.data?.error;
      if (metaError?.code === 190 || (!metaError && error?.response?.status === 401)) {
        throw Error('TOKEN_EXPIRED: O token de acesso da Meta expirou ou é inválido. Atualize o token na configuração da conexão.');
      }

      throw Error(
        metaError?.error_user_msg || metaError?.message || 'Erro ao deletar o template',
      );
    }
  }

  async sendReadMessage(
    numberId: string,
    token: string,
    data: IBodyReadMessage,
  ) {
    try {
      this.logger.log(`sendReadMessage - ${JSON.stringify(data)}`);

      const result = await axios.post(
        `${this.urlMeta}/${numberId}/messages`,
        data,
        {
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${token}`,
          },
          timeout: 30000,
        },
      );

      return result.data as IResultTemplates;
    } catch (error: any) {
      const detail = error?.response?.data
        ? JSON.stringify(error.response.data)
        : error?.message || String(error);
      this.logger.error(`sendReadMessage - ${detail}`);
      throw Error('Erro ao marcar a mensagem como lida');
    }
  }
}
