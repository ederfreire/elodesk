import { HttpStatus, Injectable, Logger } from '@nestjs/common';
import { WhatsappOficialService } from '../whatsapp-oficial/whatsapp-oficial.service';
import { WhatsAppOficial } from 'src/@core/domain/entities/whatsappOficial.model';
import { AppError } from 'src/@core/infra/errors/app.error';
import { RedisService } from 'src/@core/infra/redis/RedisService.service';
import { RabbitMQService } from 'src/@core/infra/rabbitmq/RabbitMq.service';
import {
  IWebhookWhatsApp,
  IWebhookWhatsAppEntryChangesValueMessages,
} from './interfaces/IWebhookWhatsApp.inteface';
import { SocketService } from 'src/@core/infra/socket/socket.service';
import {
  IMessageReceived,
  IReceivedWhatsppOficial,
} from 'src/@core/interfaces/IWebsocket.interface';
import { MetaService } from 'src/@core/infra/meta/meta.service';

@Injectable()
export class WebhookService {
  private logger: Logger = new Logger(`${WebhookService.name}`);
  private messagesPermitidas = [
    'text',
    'image',
    'audio',
    'document',
    'video',
    'location',
    'contacts',
    'order',
    'interactive',
    'referral',
    'sticker',
    // Clique em botão de quick reply de TEMPLATE. Sem estar nesta lista, o
    // filtro logo abaixo (messagesPermitidas.some) descartava o evento em
    // silêncio: o cliente clicava no botão e nada chegava no atendimento.
    'button',
  ];

  constructor(
    private readonly rabbit: RabbitMQService,
    private readonly whatsAppService: WhatsappOficialService,
    private readonly redis: RedisService,
    private readonly socket: SocketService,
    private readonly meta: MetaService,
  ) {}

  /**
   * Função auxiliar para serializar objetos com segurança,
   * evitando referências circulares e stack overflow
   */
  private safeStringify(obj: any, maxDepth: number = 5): string {
    try {
      // Cria uma cópia segura do objeto antes de serializar
      const safeCopy = this.createSafeCopy(obj, maxDepth);
      return JSON.stringify(safeCopy);
    } catch (error: any) {
      this.logger.error(`Erro ao serializar objeto: ${error.message}`);
      return JSON.stringify({ 
        error: 'Failed to stringify object',
        type: typeof obj 
      });
    }
  }

  /**
   * Cria uma cópia segura do objeto, limitando profundidade e removendo circularidade
   */
  private createSafeCopy(
    obj: any,
    maxDepth: number,
    currentDepth: number = 0,
    seen: WeakSet<any> = new WeakSet(),
  ): any {
    // Limite de profundidade alcançado
    if (currentDepth >= maxDepth) {
      return '[Max Depth Reached]';
    }

    // Valores primitivos e null/undefined
    if (obj === null || obj === undefined) {
      return obj;
    }

    if (typeof obj !== 'object') {
      return obj;
    }

    // Detecta referências circulares
    if (seen.has(obj)) {
      return '[Circular Reference]';
    }

    // Adiciona à lista de objetos já vistos
    seen.add(obj);

    try {
      // Arrays
      if (Array.isArray(obj)) {
        // Limita arrays muito grandes
        const maxArrayLength = 100;
        const arraySlice = obj.slice(0, maxArrayLength);
        const result = arraySlice.map((item) =>
          this.createSafeCopy(item, maxDepth, currentDepth + 1, seen),
        );
        
        if (obj.length > maxArrayLength) {
          result.push(`[Array truncated: ${obj.length - maxArrayLength} more items]`);
        }
        
        return result;
      }

      // Objetos
      const result: any = {};
      const keys = Object.keys(obj);

      // Limita número de propriedades para evitar objetos muito grandes
      const maxKeys = 50;
      const keysToProcess = keys.slice(0, maxKeys);

      for (const key of keysToProcess) {
        try {
          const value = obj[key];

          // Pula funções
          if (typeof value === 'function') {
            continue;
          }

          // Pula valores muito grandes (ex: buffers enormes)
          if (typeof value === 'string' && value.length > 10000) {
            result[key] = `[String too large: ${value.length} chars]`;
            continue;
          }

          result[key] = this.createSafeCopy(
            value,
            maxDepth,
            currentDepth + 1,
            seen,
          );
        } catch (error) {
          result[key] = '[Error accessing property]';
        }
      }

      if (keys.length > maxKeys) {
        result['_truncated'] = `${keys.length - maxKeys} more properties`;
      }

      return result;
    } finally {
      // Remove da lista após processar (permite que o mesmo objeto apareça em diferentes ramos)
      seen.delete(obj);
    }
  }

  /**
   * Cria uma versão simplificada do body para logs
   */
  private createSafeLogObject(body: any): any {
    try {
      return {
        object: body?.object,
        entry: body?.entry?.map((e: any) => ({
          id: e?.id,
          changes: e?.changes?.map((c: any) => ({
            field: c?.field,
            value: {
              messaging_product: c?.value?.messaging_product,
              metadata: c?.value?.metadata,
              messages_count: c?.value?.messages?.length || 0,
              statuses_count: c?.value?.statuses?.length || 0,
            },
          })),
        })),
      };
    } catch (error) {
      return { error: 'Could not create safe log object' };
    }
  }

  async forwardToWebhook(whats: WhatsAppOficial, body: any) {
    try {
      const {
        n8n_webhook_url,
        auth_token_n8n,
        chatwoot_webhook_url,
        auth_token_chatwoot,
        typebot_webhook_url,
        auth_token_typebot,
        crm_webhook_url,
        auth_token_crm,
      } = whats;

      try {
        if (!!n8n_webhook_url) {
          this.sendToWebhook(n8n_webhook_url, auth_token_n8n, body);
        }

        if (!!chatwoot_webhook_url) {
          this.sendToWebhook(chatwoot_webhook_url, auth_token_chatwoot, body);
        }

        if (!!typebot_webhook_url) {
          this.sendToWebhook(typebot_webhook_url, auth_token_typebot, body);
        }

        if (!!crm_webhook_url) {
          this.sendToWebhook(crm_webhook_url, auth_token_crm, body);
        }
      } catch (error: any) {
        this.logger.error(
          `forwardToWebhook - Erro ao enviar webhook - ${error.message}`,
        );
        throw new AppError(error.message, HttpStatus.BAD_REQUEST);
      }
    } catch (error: any) {
      this.logger.error(
        `forwardToWebhook - Erro nos webhook - ${error.message}`,
      );
      throw new AppError(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  async sendToWebhook(webhook_url: string, token: string, body: any) {
    try {
      const headers = {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`,
      };

      const response = await fetch(webhook_url, {
        method: 'POST',
        headers: headers,
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }

      const responseData = await response.json();
      this.logger.log('Resposta do encaminhamento do webhook', {
        webhook_url,
        status: response.status,
        hasData: !!responseData,
      });
    } catch (error: any) {
      this.logger.error('Erro ao encaminhar para o webhook', {
        erro: error.message,
        webhook_url,
      });
      return null;
    }
  }

  async webhookCompanyConexao(companyId: number, conexaoId: number, data: any) {
    try {
      if (
        !Number.isInteger(companyId) ||
        !Number.isInteger(conexaoId) ||
        companyId <= 0 ||
        conexaoId <= 0
      ) {
        throw new Error(
          `Parâmetros inválidos no webhook (companyId=${companyId}, conexaoId=${conexaoId}). ` +
            `Use a rota /v1/webhook/unified/:companyToken para o webhook unificado.`,
        );
      }

      const company = await this.whatsAppService.prisma.company.findUnique({
        where: { id: companyId },
      });

      if (!company) throw new Error('Empresa não encontrada');

      const whats = await this.whatsAppService.prisma.whatsappOficial.findFirst(
        {
          where: { id: conexaoId, companyId, deleted_at: null },
          include: { company: true },
        },
      );

      if (!whats) throw new Error('Configuração não encontrada');

      const body: IWebhookWhatsApp = data?.body || data;

      if (body.object == 'whatsapp_business_account') {
        const { entry } = body;

        for (const e of entry) {
          for (const change of e.changes) {
            // ------------------------------------------------------------
            // CHAMADAS (Calling API)
            //
            // Mesmo webhook das mensagens, campo diferente. A Meta manda
            // aqui o "connect" (cliente ligou, com a oferta SDP dele) e o
            // "terminate" (chamada encerrada, com motivo e duração).
            //
            // Repassa na hora pro backend: a janela pra atender é de 30 a
            // 60 segundos, então qualquer atraso aqui custa a chamada.
            // ------------------------------------------------------------
            if (change.field == 'calls') {
              const { value } = change;
              const chamadas = value?.calls || [];

              for (const chamada of chamadas) {
                this.logger.log('Webhook recebido (chamada):', {
                  companyId,
                  callId: chamada?.id,
                  evento: chamada?.event,
                  de: chamada?.from,
                });

                this.socket.callEvent(company.idEmpresaMult100, {
                  token: whats.token_mult100,
                  phoneNumberId: value?.metadata?.phone_number_id,
                  displayPhoneNumber: value?.metadata?.display_phone_number,
                  callId: chamada?.id,
                  // "connect" = cliente ligando; "terminate" = encerrada
                  event: chamada?.event,
                  direction: chamada?.direction,
                  from: chamada?.from,
                  to: chamada?.to,
                  timestamp: chamada?.timestamp,
                  status: chamada?.status,
                  duration: chamada?.duration,
                  startTime: chamada?.start_time,
                  endTime: chamada?.end_time,
                  // A oferta SDP do cliente vem aqui no evento connect.
                  session: chamada?.session,
                  bizOpaqueCallbackData: chamada?.biz_opaque_callback_data,
                  contactName: value?.contacts?.[0]?.profile?.name,
                });
              }
              continue;
            }

            if (change.field == 'messages') {
              const { value } = change;

              if (value?.statuses != null) {
                this.logger.log('Webhook recebido (status):', {
                  companyId,
                  statuses: value.statuses.map((s) => ({
                    id: s.id,
                    status: s.status,
                  })),
                });
                for (const status of value.statuses) {
                  this.socket.readMessage({
                    companyId: company.idEmpresaMult100,
                    messageId: status.id,
                    token: whats.token_mult100,
                  });
                }
              } else {
                const contact = value.contacts[0];

                for (const message of value.messages) {
                  if (this.messagesPermitidas.some((m) => m == message.type)) {
                    // 🛡️ Dedup: a Meta pode entregar a mesma mensagem duas vezes
                    // (uma vinculada ao wa_id numérico e outra ao novo LID de
                    // contato). O message.id é sempre o mesmo, então usamos
                    // Redis com SET NX para processar apenas a primeira.
                    const dedupKey = `msg:dedup:${companyId}:${conexaoId}:${message.id}`;
                    const firstTime = await this.redis.setNxEx(dedupKey, '1', 60 * 10);
                    if (!firstTime) {
                      this.logger.warn(
                        `[DEDUP] Mensagem duplicada ignorada (id=${message.id}, from=${message.from})`,
                      );
                      continue;
                    }

                    this.logger.log('Webhook recebido (mensagem):', {
                      companyId,
                      messageType: message.type,
                      messageId: message.id,
                      from: message.from,
                    });

                    if (!!whats.use_rabbitmq) {
                      const exchange = companyId;
                      const queue = `${whats.phone_number}`.replace('+', '');
                      const routingKey = whats.rabbitmq_routing_key;

                      await this.rabbit.sendToRabbitMQ(whats, body);
                      this.logger.log(
                        `Enviado para o RabbitMQ com sucesso. Vinculando fila '${queue}' à exchange '${exchange}' ${!!routingKey ? `com routing key '${routingKey}` : ''} '...`,
                      );
                    }

                    const messages = await this.redis.get(
                      `messages:${companyId}:${conexaoId}`,
                    );

                    if (!!messages) {
                      try {
                        const messagesStored: Array<any> = JSON.parse(
                          messages,
                        ) as Array<any>;

                        messagesStored.push(body);

                        await this.redis.set(
                          `messages:${companyId}:${conexaoId}`,
                          this.safeStringify(messagesStored),
                        );
                      } catch (error: any) {
                        this.logger.error(
                          `Erro ao processar mensagens do Redis: ${error.message}`,
                        );
                        // Em caso de erro, substitui com a mensagem atual
                        await this.redis.set(
                          `messages:${companyId}:${conexaoId}`,
                          this.safeStringify([body]),
                        );
                      }
                    } else {
                      await this.redis.set(
                        `messages:${companyId}:${conexaoId}`,
                        this.safeStringify([body]),
                      );
                    }

                    this.logger.log(
                      'Enviando mensagem para o servidor do websocket',
                    );

                    let file;
                    let fileMetadata; // ✅ Para vídeos e documentos: apenas metadados (URL)
                    let idFile;
                    let bodyMessage;

                    // context.id capturado para TODOS os tipos de mensagem.
                    //
                    // Antes isso só acontecia dentro do `default` do switch —
                    // ou seja, apenas em texto puro. Clique em botão, lista e
                    // qualquer mídia chegavam sem o id da mensagem citada, e o
                    // backend perdia a única pista que liga a resposta do
                    // cliente ao template que NÓS enviamos. É esse dado que
                    // permite reencontrar o contato quando o número vem em
                    // formato diferente (LID).
                    const quoteMessageId = message.context?.id;


                    // ✅ CORRIGIDO: Para evitar payloads gigantes no socket, enviamos URL da Meta
                    // em vez de base64 para vídeos e documentos. O backend baixa direto da Meta.
                    
                    switch (message.type) {
                      case 'video':
                        idFile = message.video.id;
                        this.logger.warn(`[VIDEO] Obtendo URL do vídeo ${idFile} - Backend irá baixar diretamente da Meta`);
                        // ✅ Apenas pega os metadados (URL da Meta), não baixa o arquivo
                        fileMetadata = await this.meta.getFileMetadata(
                          idFile,
                          change.value.metadata.phone_number_id,
                          whats.send_token,
                        );
                        this.logger.log(`[VIDEO] URL obtida - Tamanho: ${(fileMetadata.fileSize / 1024 / 1024).toFixed(2)} MB`);
                        break;
                      case 'document':
                        idFile = message.document.id;
                        this.logger.warn(`[DOCUMENT] Obtendo URL do documento ${idFile} - Backend irá baixar diretamente da Meta`);
                        // ✅ Apenas pega os metadados (URL da Meta), não baixa o arquivo
                        fileMetadata = await this.meta.getFileMetadata(
                          idFile,
                          change.value.metadata.phone_number_id,
                          whats.send_token,
                        );
                        this.logger.log(`[DOCUMENT] URL obtida - Tamanho: ${(fileMetadata.fileSize / 1024 / 1024).toFixed(2)} MB`);
                        break;
                      case 'image':
                        idFile = message.image.id;
                        this.logger.log(`[IMAGE] Baixando imagem ${idFile} - base64 será enviado pelo socket`);
                        file = await this.meta.downloadFileMeta(
                          idFile,
                          change.value.metadata.phone_number_id,
                          whats.send_token,
                          company.id,
                          whats.id,
                        );
                        break;
                      case 'audio':
                        idFile = message.audio.id;
                        this.logger.log(`[AUDIO] Baixando áudio ${idFile} - base64 será enviado pelo socket`);
                        file = await this.meta.downloadFileMeta(
                          idFile,
                          change.value.metadata.phone_number_id,
                          whats.send_token,
                          company.id,
                          whats.id,
                        );
                        break;
                      case 'interactive':
                        file = null;
                        bodyMessage =
                          message.interactive.button_reply?.title ||
                          message.interactive.list_reply?.title ||
                          message.interactive.button_reply?.id ||
                          message.interactive.list_reply?.id;
                        break;
                      case 'location':
                        bodyMessage = JSON.stringify(message.location);
                        break;
                      case 'contacts':
                        bodyMessage = {
                          contacts: message.contacts,
                        };
                        break;
                      case 'sticker':
                        idFile = message.sticker.id;
                        this.logger.log(`[STICKER] Baixando sticker ${idFile} - base64 será enviado pelo socket`);
                        file = await this.meta.downloadFileMeta(
                          idFile,
                          change.value.metadata.phone_number_id,
                          whats.send_token,
                          company.id,
                          whats.id,
                        );
                        break;
                      case 'order':
                        bodyMessage = JSON.stringify(message.order);
                        break;
                      // Clique em botão de quick reply de TEMPLATE.
                      // `text` é o rótulo que o cliente viu; `payload` é o
                      // valor configurado no template. Nem sempre os dois vêm,
                      // por isso um serve de reserva do outro.
                      case 'button':
                        file = null;
                        bodyMessage = message.button?.text || message.button?.payload;
                        break;
                      default:
                        file = null;
                        bodyMessage = message.text.body;
                        break;
                    }

                    const msg: IMessageReceived = {
                      timestamp: +message.timestamp,
                      type: message.type,
                      text: bodyMessage,
                      interactive: message.type === 'interactive' && message.interactive ? {
                        type: (message.interactive as any).type,
                        button_reply: (message.interactive as any).button_reply,
                        list_reply: (message.interactive as any).list_reply,
                      } : undefined,
                      file: !!file ? file.base64 : null, // Base64 apenas para imagens, áudios, stickers
                      mimeType: !!file ? file.mimeType : (!!fileMetadata ? fileMetadata.mimeType : null),
                      idFile,
                      idMessage: message.id,
                      quoteMessageId,
                      // ✅ Novos campos para vídeos e documentos
                      fileUrl: !!fileMetadata ? fileMetadata.url : null, // URL da Meta para download direto
                      fileSize: !!fileMetadata ? fileMetadata.fileSize : null, // Tamanho do arquivo
                    };

                    // ✅ Click-to-WhatsApp Ad: referral só vem na 1ª mensagem
                    if (message.referral) {
                      msg.referral = {
                        ctwa_clid: message.referral.ctwa_clid,
                        source_id: message.referral.source_id,
                        source_type: message.referral.source_type,
                        source_url: message.referral.source_url,
                        headline: message.referral.headline,
                        body: message.referral.body,
                        media_type: message.referral.media_type,
                        image_url: message.referral.image_url,
                        video_url: message.referral.video_url,
                        thumbnail_url: message.referral.thumbnail_url,
                      };
                      this.logger.log(
                        `[CTWA] Lead via anúncio capturado: ad_id=${message.referral.source_id} ctwa_clid=${message.referral.ctwa_clid}`,
                      );
                    }

                    if (!!fileMetadata) {
                      this.logger.log(
                        `[SOCKET] Preparando envio - Tipo: ${message.type}, ` +
                        `Método: URL DA META (${(fileMetadata.fileSize / 1024 / 1024).toFixed(2)} MB), ` +
                        `IdFile: ${idFile}`
                      );
                    } else if (!!file) {
                      this.logger.log(
                        `[SOCKET] Preparando envio - Tipo: ${message.type}, ` +
                        `Método: BASE64, IdFile: ${idFile || 'N/A'}`
                      );
                    } else {
                      this.logger.log(`[SOCKET] Preparando envio - Tipo: ${message.type} (sem mídia)`);
                    }

                    const data: IReceivedWhatsppOficial = {
                      companyId: company.idEmpresaMult100,
                      nameContact: contact.profile.name,
                      message: msg,
                      token: whats.token_mult100,
                      fromNumber: message.from,
                    };

                    this.socket.sendMessage(data);

                    await this.forwardToWebhook(whats, body);
                    this.logger.log('Enviado para o Webhook com sucesso.');
                  }
                }
              }
            }
          }
        }

        return true;
      } else {
        this.logger.error(`Evento não tratado: ${JSON.stringify(body)}`);
      }

      return true;
    } catch (error: any) {
      this.logger.error(
        `Erro no POST /webhook/:companyId/:conexaoId - ${error.message}`,
      );
      throw new AppError(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  async webhookCompany(
    companyId: number,
    conexaoId: number,
    mode: string,
    verify_token: string,
    challenge: string,
  ) {
    try {
      if (
        !Number.isInteger(companyId) ||
        !Number.isInteger(conexaoId) ||
        companyId <= 0 ||
        conexaoId <= 0
      ) {
        throw new Error(
          `Parâmetros inválidos no webhook (companyId=${companyId}, conexaoId=${conexaoId}). ` +
            `Use a rota /v1/webhook/unified/:companyToken para o webhook unificado.`,
        );
      }

      const whats = await this.whatsAppService.prisma.whatsappOficial.findFirst(
        { where: { id: conexaoId, companyId, deleted_at: null } },
      );

      if (!whats) throw new Error('Configuração não encontrada');

      if (mode === 'subscribe' && verify_token === whats.token_mult100) {
        this.logger.log('WEBHOOK VERIFICADO para a empresa:', companyId);

        return challenge;
      } else {
        this.logger.error(
          'Falha na verificação do webhook para a empresa:',
          companyId,
        );
        throw new Error(
          `Falha na verificação do webhook para a empresa: ${companyId}`,
        );
      }
    } catch (error: any) {
      this.logger.error(`webhookCompany - ${error.message}`);
      throw new AppError(error.message, HttpStatus.BAD_REQUEST);
    }
  }

  /**
   * Webhook unificado - validação do verify_token via company.token
   */
  async unifiedVerify(
    companyToken: string,
    mode: string,
    verify_token: string,
    challenge: string,
  ) {
    try {
      const company = await this.whatsAppService.prisma.company.findFirst({
        where: { token: companyToken, deleted_at: null },
      });

      if (!company) throw new Error('Empresa não encontrada para esse token');

      if (mode === 'subscribe' && verify_token === companyToken) {
        this.logger.log(
          `[UNIFIED] WEBHOOK VERIFICADO para empresa ${company.id}`,
        );
        return challenge;
      }

      throw new Error('Verify token inválido');
    } catch (error: any) {
      this.logger.error(`unifiedVerify - ${error.message}`);
      throw new AppError(error.message, HttpStatus.FORBIDDEN);
    }
  }

  /**
   * Webhook unificado - recebe evento da Meta para N números do mesmo App.
   * Roteia cada entry pelo phone_number_id encontrado no payload.
   */
  async unifiedReceive(companyToken: string, data: any) {
    try {
      const company = await this.whatsAppService.prisma.company.findFirst({
        where: { token: companyToken, deleted_at: null },
      });

      if (!company) throw new Error('Empresa não encontrada para esse token');

      const body: IWebhookWhatsApp = data?.body || data;

      if (body?.object !== 'whatsapp_business_account') {
        return { received: true, ignored: 'not_whatsapp_business_account' };
      }

      const { entry } = body;
      const results: any[] = [];

      for (const e of entry || []) {
        for (const change of e.changes || []) {
          const phoneNumberId =
            change?.value?.metadata?.phone_number_id || null;

          if (!phoneNumberId) {
            this.logger.warn(
              `[UNIFIED] entry sem phone_number_id - ignorando change`,
            );
            continue;
          }

          const whats =
            await this.whatsAppService.prisma.whatsappOficial.findFirst({
              where: {
                phone_number_id: phoneNumberId,
                companyId: company.id,
                deleted_at: null,
              },
            });

          if (!whats) {
            this.logger.warn(
              `[UNIFIED] Nenhuma conexão para phone_number_id=${phoneNumberId} na empresa ${company.id}`,
            );
            continue;
          }

          // Monta payload somente com este change para o handler existente
          const slicedBody: IWebhookWhatsApp = {
            object: body.object,
            entry: [
              {
                id: e.id,
                changes: [change],
              } as any,
            ],
          } as any;

          try {
            await this.webhookCompanyConexao(
              company.id,
              whats.id,
              slicedBody,
            );
            results.push({
              phone_number_id: phoneNumberId,
              conexaoId: whats.id,
              status: 'ok',
            });
          } catch (err: any) {
            this.logger.error(
              `[UNIFIED] Erro processando conexao ${whats.id}: ${err.message}`,
            );
            results.push({
              phone_number_id: phoneNumberId,
              conexaoId: whats.id,
              status: 'error',
              error: err.message,
            });
          }
        }
      }

      return { received: true, processed: results };
    } catch (error: any) {
      this.logger.error(`unifiedReceive - ${error.message}`);
      throw new AppError(error.message, HttpStatus.BAD_REQUEST);
    }
  }
}

