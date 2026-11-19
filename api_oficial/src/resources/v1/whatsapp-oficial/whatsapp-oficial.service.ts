import { Injectable, Logger } from '@nestjs/common';
import { CreateWhatsappOficialDto } from './dto/create-whatsapp-oficial.dto';
import { UpdateWhatsappOficialDto } from './dto/update-whatsapp-oficial.dto';
import { BaseService } from 'src/@core/base/base.service';
import { WhatsAppOficial } from 'src/@core/domain/entities/whatsappOficial.model';
import { AppError } from 'src/@core/infra/errors/app.error';

@Injectable()
export class WhatsappOficialService extends BaseService<WhatsAppOficial> {
  logger: Logger = new Logger(`${WhatsappOficialService.name}`);

  constructor() {
    super('whatsappOficial', WhatsappOficialService.name);
  }

  async oneWhatAppOficial(id: number) {
    try {
      const whats = await this.prisma.whatsappOficial.findUnique({
        where: { id, deleted_at: null },
      });

      if (!whats) throw new Error('Configuração do whats não encontrada');

      return whats;
    } catch (error: any) {
      this.logger.error(`createWhatsAppOficial - ${error.message}`);
      throw new AppError(error.message);
    }
  }

  async allWhatsAppOficial() {
    try {
      const company = await this.prisma.company.findFirst({
        where: { deleted_at: null },
      });

      if (!company) throw new Error('Empresa não encontrada');

      return await this.prisma.whatsappOficial.findMany({
        where: { companyId: company.id, deleted_at: null },
      });
    } catch (error: any) {
      this.logger.error(`createWhatsAppOficial - ${error.message}`);
      throw new AppError(error.message);
    }
  }

  async createWhatsAppOficial(
    data: CreateWhatsappOficialDto,
  ): Promise<WhatsAppOficial> {
    try {
      const company = await this.prisma.company.findFirst({
        where: {
          idEmpresaMult100: data.idEmpresaMult100,
          deleted_at: null,
        },
      });

      if (!company) throw new Error('Empresa não encontrada');

      const exist = await this.prisma.whatsappOficial.findUnique({
        where: { token_mult100: data.token_mult100 },
      });

      // Antes: erro seco "Já existe esse token cadastrado".
      //
      // Só que registrar de novo é exatamente o que o sistema faz quando o
      // EquipeChat perdeu a referência do registro daqui (waba_webhook_id
      // vazio). Recusar deixava a conexão presa nos dados ANTIGOS: o usuário
      // trocava o token vencido da Meta na tela, salvava, e o token novo nunca
      // chegava aqui — que é justamente quem envia. Recebia mensagem (a Meta
      // entrega sem token) e falhava ao enviar, com erro 190 eterno.
      //
      // Sendo a mesma empresa e o mesmo token de identificação, é a mesma
      // conexão se reapresentando: atualizamos e devolvemos o registro.
      if (exist) {
        if (exist.companyId !== company.id) {
          throw new Error(
            'Este token já está cadastrado para outra empresa.',
          );
        }

        delete data.idEmpresaMult100;

        const atualizado = await this.prisma.whatsappOficial.update({
          where: { id: exist.id },
          data: { ...data, deleted_at: null } as any,
        });

        this.logger.log(
          `createWhatsAppOficial - conexão ${exist.id} já existia e foi atualizada (token de envio renovado)`,
        );

        return atualizado;
      }

      delete data.idEmpresaMult100;

      const whats: WhatsAppOficial = {
        ...data,
        companyId: company.id,
        token_mult100: data.token_mult100,
      };

      return await this.prisma.whatsappOficial.create({ data: whats });
    } catch (error: any) {
      this.logger.error(`createWhatsAppOficial - ${error.message}`);
      throw new AppError(error.message);
    }
  }

  async updateWhatsAppOficial(
    id: number,
    data: UpdateWhatsappOficialDto,
  ): Promise<WhatsAppOficial> {
    try {
      // Sem um id válido o Prisma responde "Argument `id` is missing", um
      // erro interno que não diz nada a quem chamou. Acontecia sempre que o
      // sistema tentava atualizar uma conexão que nunca foi criada aqui.
      const idNumerico = Number(id);
      if (!Number.isInteger(idNumerico) || idNumerico <= 0) {
        throw new Error(
          'Id da conexão ausente ou inválido. Esta conexão ainda não foi registrada na API Oficial.',
        );
      }

      const whats = await this.prisma.whatsappOficial.findUnique({
        where: { id: idNumerico, deleted_at: null },
      });

      if (!whats) throw new Error('Configuração do whats não encontrada');

      const company = await this.prisma.company.findFirst({
        where: { deleted_at: null },
      });

      if (!company) throw new Error('Empresa não encontrada');

      return await this.prisma.whatsappOficial.update({
        where: { id: idNumerico },
        data: data,
      });
    } catch (error: any) {
      this.logger.error(`updateWhatsAppOficial - ${error.message}`);
      throw new AppError(error.message);
    }
  }

  async deleteWhatsAppOficial(id: number): Promise<WhatsAppOficial> {
    try {
      const whats = await this.prisma.whatsappOficial.findUnique({
        where: { id, deleted_at: null },
      });

      if (!whats) throw new Error('Configuração do whats não encontrada');

      const company = await this.prisma.company.findFirst({
        where: { deleted_at: null },
      });

      if (!company) throw new Error('Empresa não encontrada');

      return await this.prisma.whatsappOficial.update({
        where: { id },
        data: { deleted_at: new Date() },
      });
    } catch (error: any) {
      this.logger.error(`deleteWhatsAppOficial - ${error.message}`);
      throw new AppError(error.message);
    }
  }
}
