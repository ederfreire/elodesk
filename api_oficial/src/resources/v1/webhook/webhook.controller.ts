import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  Query,
  Res,
  HttpStatus,
} from '@nestjs/common';
import { Response } from 'express';
import { WebhookService } from './webhook.service';
import { ApiOperation, ApiResponse, ApiTags } from '@nestjs/swagger';
import { Public } from '../../../@core/guard/auth.decorator';
import { IWebhookWhatsApp } from './interfaces/IWebhookWhatsApp.inteface';

@Controller('v1/webhook')
@ApiTags('Webhook')
export class WebhookController {
  constructor(private readonly webhookService: WebhookService) {}

  /**
   * Webhook UNIFICADO por empresa.
   *
   * IMPORTANTE: estas rotas precisam ficar ANTES das rotas genéricas
   * `:companyId/:conexaoId`, caso contrário o Nest captura
   * `unified/<token>` como se `companyId="unified"` (-> NaN no Prisma).
   *
   * Regras do handshake da Meta (GET):
   *  - Não requer autenticação (Public).
   *  - Não toca no banco antes de validar o challenge.
   *  - Se `hub.mode=subscribe` e `hub.verify_token === :verifyToken`,
   *    responde 200 com **text/plain** contendo APENAS o `hub.challenge`.
   *  - Caso contrário responde 403 em text/plain.
   */
  @Public()
  @Get('unified/:verifyToken')
  @ApiOperation({ summary: 'Webhook unificado - validação (verify token)' })
  unifiedVerify(
    @Param('verifyToken') verifyToken: string,
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') verifyTokenQuery: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ) {
    const tokenOk =
      typeof verifyToken === 'string' &&
      typeof verifyTokenQuery === 'string' &&
      verifyToken.length > 0 &&
      verifyToken === verifyTokenQuery;

    if (mode === 'subscribe' && tokenOk) {
      return res
        .status(HttpStatus.OK)
        .type('text/plain')
        .send(String(challenge ?? ''));
    }

    return res
      .status(HttpStatus.FORBIDDEN)
      .type('text/plain')
      .send('Forbidden');
  }

  @Public()
  @Post('unified/:verifyToken')
  @ApiOperation({
    summary: 'Webhook unificado - recebe eventos de N números do mesmo App Meta',
  })
  async unifiedReceive(
    @Param('verifyToken') verifyToken: string,
    @Body() data: IWebhookWhatsApp,
  ) {
    return await this.webhookService.unifiedReceive(verifyToken, data);
  }

  @Public()
  @Post(':companyId/:conexaoId')
  @ApiOperation({ summary: 'Webhook para evento de empresa e conexão' })
  @ApiResponse({
    status: 400,
    description: 'Retorna o erro para quem esta chamando',
  })
  @ApiResponse({
    status: 200,
    description: 'Retorna somente um true caso tenha sucesso',
  })
  async webhookCompanyConexao(
    @Param('companyId') companyId: string,
    @Param('conexaoId') conexaoId: string,
    @Body() data: IWebhookWhatsApp,
  ) {
    // Fallback: se por qualquer motivo cair aqui com "unified/<token>",
    // delega para o handler unificado em vez de quebrar com NaN no Prisma.
    if (companyId === 'unified') {
      return await this.webhookService.unifiedReceive(conexaoId, data);
    }

    const companyIdNum = Number(companyId);
    const conexaoIdNum = Number(conexaoId);

    // Se params não são numéricos válidos, ignora graciosamente
    // (Meta pode estar retentando um webhook antigo com URL inválida).
    if (
      !Number.isInteger(companyIdNum) ||
      !Number.isInteger(conexaoIdNum) ||
      companyIdNum <= 0 ||
      conexaoIdNum <= 0
    ) {
      return {
        received: true,
        ignored: 'invalid_params',
        detail: `companyId=${companyId}, conexaoId=${conexaoId} — use /v1/webhook/unified/:companyToken`,
      };
    }

    return await this.webhookService.webhookCompanyConexao(
      companyIdNum,
      conexaoIdNum,
      data,
    );
  }

  @Public()
  @Get(':companyId/:conexaoId')
  @ApiOperation({ summary: 'Webhook para evento de empresa' })
  @ApiResponse({
    status: 400,
    description: 'Retorna o erro para quem esta chamando',
  })
  @ApiResponse({
    status: 200,
    description: 'Retorna somente um true caso tenha sucesso',
  })
  webhookCompany(
    @Param('companyId') companyId: string,
    @Param('conexaoId') conexaoId: string,
    @Query('hub.mode') mode: string,
    @Query('hub.verify_token') verify_token: string,
    @Query('hub.challenge') challenge: string,
    @Res() res: Response,
  ) {
    // Fallback: se a rota genérica capturar "unified/<token>", trata como
    // o handshake unificado — sem tocar em Prisma.
    if (companyId === 'unified') {
      const tokenOk =
        typeof conexaoId === 'string' &&
        typeof verify_token === 'string' &&
        conexaoId.length > 0 &&
        conexaoId === verify_token;

      if (mode === 'subscribe' && tokenOk) {
        return res
          .status(HttpStatus.OK)
          .type('text/plain')
          .send(String(challenge ?? ''));
      }
      return res
        .status(HttpStatus.FORBIDDEN)
        .type('text/plain')
        .send('Forbidden');
    }

    // Validação por conexão (fluxo antigo). Também respondemos text/plain
    // com o challenge quando bater, como a Meta espera.
    const companyIdNum = Number(companyId);
    const conexaoIdNum = Number(conexaoId);

    // Bloqueio ANTES de qualquer chamada Prisma — evita "companyId: NaN".
    if (
      !Number.isInteger(companyIdNum) ||
      !Number.isInteger(conexaoIdNum) ||
      companyIdNum <= 0 ||
      conexaoIdNum <= 0
    ) {
      return res
        .status(HttpStatus.FORBIDDEN)
        .type('text/plain')
        .send('Forbidden');
    }

    return this.webhookService
      .webhookCompany(
        companyIdNum,
        conexaoIdNum,
        mode,
        verify_token,
        challenge,
      )
      .then((value) =>
        res
          .status(HttpStatus.OK)
          .type('text/plain')
          .send(String(value ?? challenge ?? '')),
      )
      .catch(() =>
        res
          .status(HttpStatus.FORBIDDEN)
          .type('text/plain')
          .send('Forbidden'),
      );
  }
}

