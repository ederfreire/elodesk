import { Injectable } from '@nestjs/common';
import { CreateSendMessageWhatsappDto } from './dto/create-send-message-whatsapp.dto';
import { BaseService } from 'src/@core/base/base.service';
import { SendMessageWhatsApp } from 'src/@core/domain/entities/sendMessageWhatsApp.entity';
import { AppError } from 'src/@core/infra/errors/app.error';
import { checkPasteFiles, savedFile } from 'src/@core/common/utils/files.utils';
import { MetaService } from 'src/@core/infra/meta/meta.service';
import {
  IBodyReadMessage,
  IMetaMessage,
  IMetaMessageAudio,
  IMetaMessageContacts,
  IMetaMessageDocument,
  IMetaMessageImage,
  IMetaMessageLocation,
  IMetaMessageReaction,
  IMetaMessageSticker,
  IMetaMessageTemplate,
  IMetaMessageText,
  IMetaMessageVideo,
  IMetaMessageinteractive,
} from 'src/@core/infra/meta/interfaces/IMeta.interfaces';
import { WhatsappOficialService } from '../whatsapp-oficial/whatsapp-oficial.service';

@Injectable()
export class SendMessageWhatsappService extends BaseService<SendMessageWhatsApp> {
  constructor(
    private metaService: MetaService,
    private whatsAppService: WhatsappOficialService,
  ) {
    super('sendMessageWhatsApp', SendMessageWhatsappService.name);
  }

  private async createFile(
    file: Express.Multer.File,
    fileName: string,
    empresaId: number,
    conexaoId: number,
  ) {
    try {
      const data = new Date();

      const year = data.getFullYear();
      let month = String(data.getMonth() + 1);
      month = month.length == 1 ? `0${month}` : month;
      const day = data.getDate();
      let path = `${year}-${month}-${day}`;

      checkPasteFiles(path);
      path += `/${empresaId}`;
      checkPasteFiles(path);
      path += `/${conexaoId}`;
      checkPasteFiles(path);

      return await savedFile(file, path, fileName);
    } catch (error: any) {
      this.logger.error(`createMessage - ${error.message}`);
      throw new Error(`Falha ao salvar o arquivo`);
    }
  }

  private async getIdMetaMedia(
    whatsId: number,
    phone_number_id: string,
    token: string,
    idCompany: number,
    file: Express.Multer.File,
    fileName: string,
  ) {
    try {
      if (!file) throw new Error('Necessário informar um arquivo');

      this.logger.log(`getIdMetaMedia - File recebido: originalname=${file.originalname}, mimetype=${file.mimetype}, size=${file.size}, path=${file.path || 'N/A'}, hasBuffer=${!!(file.buffer)}`);

      let pathFile: string;

      // Se o multer usou diskStorage, o arquivo já foi salvo em file.path
      if (file.path) {
        pathFile = file.path;
        this.logger.log(`getIdMetaMedia - Usando arquivo já salvo pelo multer: ${pathFile}`);
      } else if (file.buffer && Buffer.isBuffer(file.buffer) && file.buffer.length > 0) {
        // Se o multer usou memoryStorage, file.buffer está disponível
        pathFile = await this.createFile(
          file,
          fileName,
          idCompany,
          whatsId,
        );
      } else {
        throw new Error('Arquivo recebido sem path nem buffer válido');
      }

      const metaFile = await this.metaService.sendFileToMeta(
        phone_number_id,
        token,
        pathFile,
      );

      return { pathFile, mediaMetaId: metaFile.id, fileName: file.originalname };
    } catch (error: any) {
      this.logger.error(`getIdMetaMedia - ${error.message}`);
      throw new Error(error.message);
    }
  }

  private normalizeTemplateParameters(parameters: any): any[] {
    if (parameters === undefined || parameters === null) return [];

    const list = Array.isArray(parameters) ? parameters : [parameters];

    return list
      .map((parameter) => {
        if (parameter === undefined || parameter === null) return null;

        if (typeof parameter === 'string' || typeof parameter === 'number') {
          return { type: 'text', text: String(parameter) };
        }

        if (parameter.type === 'text') {
          return {
            ...parameter,
            text: String(parameter.text ?? parameter.value ?? parameter.payload ?? '').trim() || '-',
          };
        }

        return parameter;
      })
      .filter(Boolean);
  }

  private extractBodyTemplateParameters(template: any): any[] {
    const source =
      template?.body_parameters ??
      template?.bodyParameters ??
      template?.variables ??
      template?.params ??
      template?.parameters;

    if (!source) return [];

    if (Array.isArray(source)) return this.normalizeTemplateParameters(source);

    if (typeof source === 'object') {
      return Object.keys(source)
        .sort((a, b) => Number(a) - Number(b))
        .map((key) => source[key])
        .filter((value) => value !== undefined && value !== null && String(value).trim() !== '')
        .map((value) => ({ type: 'text', text: String(value).trim() }));
    }

    return this.normalizeTemplateParameters(source);
  }

  private normalizeTemplatePayload(template: any): IMetaMessageTemplate {
    if (!template?.name) throw new Error('Necessário informar o nome do template');

    const normalized: any = {
      ...template,
      name: String(template.name).trim(),
      language: template.language || { code: 'pt_BR' },
    };

    if (typeof normalized.language === 'string') {
      normalized.language = { code: normalized.language };
    }

    const bodyParameters = this.extractBodyTemplateParameters(template);
    const rawComponents = template.components
      ? Array.isArray(template.components)
        ? template.components
        : [template.components]
      : [];

    const components = rawComponents
      .map((component) => {
        if (!component?.type) return null;

        const type = String(component.type).toLowerCase().replace('buttons', 'button');
        const parameters = this.normalizeTemplateParameters(component.parameters);
        const componentData: any = { ...component, type };

        if (type === 'body' && parameters.length === 0 && bodyParameters.length > 0) {
          componentData.parameters = bodyParameters;
        } else if (parameters.length > 0) {
          componentData.parameters = parameters;
        } else {
          delete componentData.parameters;
        }

        return componentData;
      })
      .filter(Boolean);

    if (!components.some((component) => component.type === 'body') && bodyParameters.length > 0) {
      components.push({ type: 'body', parameters: bodyParameters });
    }

    if (components.length > 0) normalized.components = components;
    else delete normalized.components;

    return normalized as IMetaMessageTemplate;
  }

  async createMessage(
    token: string,
    dados_mensagem: string,
    file: Express.Multer.File,
  ) {
    try {
      const data: CreateSendMessageWhatsappDto = JSON.parse(dados_mensagem);
      const regex = /^\+\d{1,3}\d{4,14}$/;

      if (!data.to)
        throw new Error('Necessário informar o número do destinatario');
      if (!regex.test(data.to))
        throw new Error('o número não está no padrão do whatsapp (use formato internacional: +DDI + número)');

      const whats = await this.prisma.whatsappOficial.findFirst({
        where: { token_mult100: token },
      });

      if (!whats) throw new Error('Conexão não encontrada');

      const company = await this.prisma.company.findFirst({
        where: { id: whats.companyId },
      });

      if (!company)
        throw new Error('Nenhuma empresa cadastrada para este usuário');

      const entity: SendMessageWhatsApp = {
        type: data.type,
        whatsappOficialId: whats.id,
        to: data.to,
      };

      const {
        body_text,
        body_video,
        body_document,
        body_image,
        body_location,
        body_reaction,
        body_contacts,
        body_interactive,
        body_sticket,
        body_template,
      } = data;

      let resMedia: { pathFile: string; mediaMetaId: string; fileName: string };
      let dataMessage: any;

      switch (data.type) {
        case 'text':
          if (!body_text.body)
            throw new Error(
              'Necessário informar um texto para enviar a mensagem',
            );

          entity.text = {
            body: body_text.body,
            preview_url: body_text?.preview_url,
          };
          dataMessage = body_text;
          break;
        case 'audio':
          resMedia = await this.getIdMetaMedia(
            whats.id,
            whats.phone_number_id,
            whats.send_token,
            company.id,
            file,
            data.fileName,
          );
          if (!resMedia) throw new Error('Erro ao gravar a mensagem');

          entity.idFileMeta = resMedia.mediaMetaId;
          entity.pathFile = resMedia.pathFile;

          entity.audio = { id: resMedia.mediaMetaId };
          dataMessage = { id: resMedia.mediaMetaId } as IMetaMessageAudio;
          break;
        case 'video':
          resMedia = await this.getIdMetaMedia(
            whats.id,
            whats.phone_number_id,
            whats.send_token,
            company.id,
            file,
            data.fileName,
          );
          if (!resMedia) throw new Error('Erro ao gravar a mensagem');

          entity.idFileMeta = resMedia.mediaMetaId;
          entity.pathFile = resMedia.pathFile;

          entity.video = {
            id: resMedia.mediaMetaId,
            caption: !!body_video?.caption ? body_video.caption : null,
          };

          dataMessage = {
            id: resMedia.mediaMetaId,
            caption: !!body_video?.caption ? body_video.caption : null,
          } as IMetaMessageVideo;
          break;
        case 'document':
          resMedia = await this.getIdMetaMedia(
            whats.id,
            whats.phone_number_id,
            whats.send_token,
            company.id,
            file,
            data.fileName,
          );
          if (!resMedia) throw new Error('Erro ao gravar a mensagem');

          entity.idFileMeta = resMedia.mediaMetaId;
          entity.pathFile = resMedia.pathFile;

          entity.document = {
            filename: resMedia.fileName,
            id: resMedia.mediaMetaId,
            caption: !!body_document.caption ? body_document.caption : null,
          };

          dataMessage = {
            filename: resMedia.fileName,
            id: resMedia.mediaMetaId,
            caption: !!body_document.caption ? body_document.caption : null,
          } as IMetaMessageDocument;
          break;
        case 'image':
          resMedia = await this.getIdMetaMedia(
            whats.id,
            whats.phone_number_id,
            whats.send_token,
            company.id,
            file,
            data.fileName,
          );
          if (!resMedia) throw new Error('Erro ao gravar a mensagem');

          entity.idFileMeta = resMedia.mediaMetaId;
          entity.pathFile = resMedia.pathFile;

          entity.image = {
            id: resMedia.mediaMetaId,
            caption: !!body_image?.caption ? body_image.caption : null,
          };

          dataMessage = {
            id: resMedia.mediaMetaId,
            caption: !!body_image?.caption ? body_image.caption : null,
          } as IMetaMessageImage;
          break;
        case 'location':
          if (!body_location.latitude && !body_location.longitude)
            throw new Error('Necessário informar a latitude e longitude');

          entity.location = {
            latitude: body_location.latitude,
            longitude: body_location.longitude,
            name: !!body_location?.name ? body_location.name : null,
            address: !!body_location?.address ? body_location.address : null,
          };

          dataMessage = {
            latitude: body_location.latitude,
            longitude: body_location.longitude,
            name: !!body_location?.name ? body_location.name : null,
            address: !!body_location?.address ? body_location.address : null,
          } as IMetaMessageLocation;
          break;
        case 'reaction':
          if (!body_reaction.message_id || !body_reaction.emoji)
            throw new Error('Necessário informar o id da mensagem e o emoji');

          entity.reaction = {
            message_id: body_reaction.message_id,
            emoji: body_reaction.emoji,
          };

          dataMessage = {
            message_id: body_reaction.message_id,
            emoji: body_reaction.emoji,
          };
          break;
        case 'contacts':
          entity.contacts = [body_contacts] as any;

          dataMessage = [body_contacts];
          break;
        case 'interactive':
          console.log(JSON.stringify(body_interactive, null, 2));
          {
            const allowed = [
              'button',           // Quick Reply
              'list',             // Listas
              'cta_url',          // CTA - Abrir link
              'flow',             // WhatsApp Flows
              'product',          // Produto único
              'product_list',     // Carrossel de produtos
              'catalog_message',  // Catálogo completo
              'location_request_message',
              'address_message',
            ];
            if (!allowed.includes(body_interactive?.type)) {
              throw new Error(
                `Tipo interactive inválido. Permitidos: ${allowed.join(', ')}`,
              );
            }
            entity.interactive = body_interactive as any;
            dataMessage = body_interactive;
          }
          break;
        case 'sticker':
          if (!body_sticket.id)
            throw new Error('Necessário informar o id do sticker');

          entity.sticker = { id: body_sticket.id };

          dataMessage = { id: body_sticket.id } as IMetaMessageSticker;
          break;
        case 'template':
          const templatePayload = this.normalizeTemplatePayload(body_template);
          entity.template = templatePayload as any;

          dataMessage = templatePayload;
          break;
        default:
          throw new Error('Este tipo não é suportado pela meta');
      }

      const message: IMetaMessage = {
        to: data.to,
        type: data.type,
        messaging_product: 'whatsapp',
        recipient_type: 'individual',
        ...(data.quotedId && { context: { message_id: data.quotedId } }),
      };

      message[data.type] = dataMessage;

      const res = await this.metaService.sendMessage(
        whats.phone_number_id,
        whats.send_token,
        message,
      );

      entity.idMessageWhatsApp = res.messages.map((m) => m.id);

      const saved = await this.prisma.sendMessageWhatsApp.create({ data: entity });

      // wa_id: o identificador que a Meta considera CANÔNICO para esse número.
      //
      // Ao enviar, a Meta devolve em `contacts[0].wa_id` o id com que ela vai
      // identificar esse contato nos webhooks seguintes. Esse valor era
      // descartado aqui. Quando ele difere do número que enviamos (o caso do
      // LID), a resposta do cliente chegava com um identificador que o backend
      // nunca tinha visto — e um contato novo era criado, duplicando a pessoa.
      //
      // Repassando o wa_id, o backend consegue gravar o vínculo no momento do
      // ENVIO, antes de a resposta chegar. É a causa raiz da duplicação.
      return {
        ...saved,
        wa_id: res.contacts?.[0]?.wa_id ?? null,
      };
    } catch (error: any) {
      this.logger.error(`createMessage - ${error.message}`);
      throw new AppError(error.message);
    }
  }

  async readMessage(token: string, messageId: string) {
    try {
      const body = {
        message_id: messageId,
        messaging_product: 'whatsapp',
        status: 'read',
      } as IBodyReadMessage;

      const whats =
        await this.whatsAppService.prisma.whatsappOficial.findUnique({
          where: { token_mult100: token },
        });

      if (!whats) throw new Error('Nenhum número configurado para este token');

      return await this.metaService.sendReadMessage(
        whats.phone_number_id,
        whats.send_token,
        body,
      );
    } catch (error: any) {
      this.logger.error(`readMessage - ${error.message}`);
      throw new AppError(error.message);
    }
  }
}
