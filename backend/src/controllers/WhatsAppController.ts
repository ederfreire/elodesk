import { Request, Response } from "express";
import { getIO } from "../libs/socket";
import cacheLayer from "../libs/cache";
import { removeWbot, restartWbot } from "../libs/wbot";
import Whatsapp from "../models/Whatsapp";
import AppError from "../errors/AppError";
import DeleteBaileysService from "../services/BaileysServices/DeleteBaileysService";
import ShowCompanyService from "../services/CompanyService/ShowCompanyService";
import {
  getAccessTokenFromPage,
  getPageProfile,
  subscribeApp
} from "../services/FacebookServices/graphAPI";
import ShowPlanService from "../services/PlanService/ShowPlanService";
import { StartWhatsAppSession } from "../services/WbotServices/StartWhatsAppSession";
import { deleteWacallsSession } from "../services/WacallsServices/WacallsBridgeService";
import { deleteChatSession } from "../services/WacallsServices/WacallsChatCallService";
import axios from "axios";
import Setting from "../models/Setting";

import CreateWhatsAppService from "../services/WhatsappService/CreateWhatsAppService";
import GetWhatsappQualityService from "../services/WhatsappService/GetWhatsappQualityService";
import DeleteWhatsAppService from "../services/WhatsappService/DeleteWhatsAppService";
import ListWhatsAppsService from "../services/WhatsappService/ListWhatsAppsService";
import ShowWhatsAppService from "../services/WhatsappService/ShowWhatsAppService";
import UpdateWhatsAppService from "../services/WhatsappService/UpdateWhatsAppService";

import ShowWhatsAppServiceAdmin from "../services/WhatsappService/ShowWhatsAppServiceAdmin";
import UpdateWhatsAppServiceAdmin from "../services/WhatsappService/UpdateWhatsAppServiceAdmin";
import ListAllWhatsAppsService from "../services/WhatsappService/ListAllWhatsAppService";
import {
  getWhatsAppOficialHealth,
  getAllWhatsAppOficialHealth
} from "../services/WhatsappService/GetWhatsAppOficialHealthService";
import {
  generateHealthReportPdfForCompany,
  listHealthReports
} from "../services/WhatsappService/GenerateHealthReportPdfService";
import ListFilterWhatsAppsService from "../services/WhatsappService/ListFilterWhatsAppsService";
import User from "../models/User";
import logger from "../utils/logger";
import {
  CreateCompanyConnectionOficial,
  DeleteConnectionWhatsAppOficial,
  getTemplatesWhatsAppOficial,
  createTemplateWhatsAppOficial,
  deleteTemplateWhatsAppOficial,
  UpdateConnectionWhatsAppOficial
} from "../libs/whatsAppOficial/whatsAppOficial.service";
import {
  ICreateConnectionWhatsAppOficialCompany,
  ICreateConnectionWhatsAppOficialWhatsApp,
  IUpdateonnectionWhatsAppOficialWhatsApp
} from "../libs/whatsAppOficial/IWhatsAppOficial.interfaces";
import QuickMessageComponent from "../models/QuickMessageComponent";
import CreateService from "../services/QuickMessageService/CreateService";
import QuickMessage from "../models/QuickMessage";
import ListConnectionStatsService from "../services/WhatsappService/ListConnectionStatsService";

interface WhatsappData {
  name: string;
  queueIds: number[];
  companyId: number;
  greetingMessage?: string;
  complationMessage?: string;
  outOfHoursMessage?: string;
  status?: string;
  isDefault?: boolean;
  token?: string;
  maxUseBotQueues?: string;
  timeUseBotQueues?: string;
  expiresTicket?: number;
  allowGroup?: false;
  allowSignature?: boolean;
  sendIdQueue?: number;
  timeSendQueue?: number;
  timeInactiveMessage?: string;
  inactiveMessage?: string;
  ratingMessage?: string;
  maxUseBotQueuesNPS?: number;
  expiresTicketNPS?: number;
  whenExpiresTicket?: string;
  expiresInactiveMessage?: string;
  importOldMessages?: string;
  importRecentMessages?: string;
  importOldMessagesGroups?: boolean;
  closedTicketsPostImported?: boolean;
  groupAsTicket?: string;
  timeCreateNewTicket?: number;
  schedules?: any[];
  promptId?: number;
  collectiveVacationMessage?: string;
  collectiveVacationStart?: string;
  collectiveVacationEnd?: string;
  queueIdImportMessages?: number;
  phone_number_id?: string;
  waba_id?: string;
  send_token?: string;
  business_id?: string;
  phone_number?: string;
  waba_webhook?: string;
  channel?: string;
  triggerIntegrationOnClose?: boolean;
  color?: string;
  zapiInstanceId?: string;
  zapiToken?: string;
  zapiClientToken?: string;
  wacallsVoiceFlowId?: string;
}

interface QueryParams {
  session?: number | string;
  channel?: string;
}

export const index = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { session } = req.query as QueryParams;
  const whatsapps = await ListWhatsAppsService({ companyId, session });

  return res.status(200).json(whatsapps);
};

export const indexFilter = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId } = req.user;
  const { session, channel } = req.query as QueryParams;

  const whatsapps = await ListFilterWhatsAppsService({
    companyId,
    session,
    channel
  });

  return res.status(200).json(whatsapps);
};

export const store = async (req: Request, res: Response): Promise<Response> => {
  const {
    name,
    status,
    isDefault,
    greetingMessage,
    complationMessage,
    outOfHoursMessage,
    queueIds,
    token,
    maxUseBotQueues,
    timeUseBotQueues,
    expiresTicket,
    allowGroup,
    allowSignature,
    timeSendQueue,
    sendIdQueue,
    timeInactiveMessage,
    inactiveMessage,
    ratingMessage,
    maxUseBotQueuesNPS,
    expiresTicketNPS,
    whenExpiresTicket,
    expiresInactiveMessage,
    importOldMessages,
    importRecentMessages,
    closedTicketsPostImported,
    importOldMessagesGroups,
    groupAsTicket,
    timeCreateNewTicket,
    schedules,
    promptId,
    collectiveVacationEnd,
    collectiveVacationMessage,
    collectiveVacationStart,
    queueIdImportMessages,
    phone_number_id,
    waba_id,
    send_token,
    business_id,
    phone_number,
    color,
    waba_webhook,
    channel,
    zapiInstanceId,
    zapiToken,
    zapiClientToken,
    wacallsVoiceFlowId
  }: WhatsappData = req.body;
  const { companyId } = req.user;

  const company = await ShowCompanyService(companyId);
  const plan = await ShowPlanService(company.planId);

  if (!plan.useWhatsapp) {
    return res.status(400).json({
      error: "Você não possui permissão para acessar este recurso!"
    });
  }

  // Bloquear criação de conexão Z-API se o plano não permite
  if (zapiInstanceId && !plan.useZapi) {
    return res.status(400).json({
      error: "Seu plano não inclui acesso à Z-API. Faça upgrade para utilizar este recurso."
    });
  }

  // Bloquear criação de conexão WhatsApp Plus - Voz + Msg (wacalls) se o plano não permite
  if (channel === "wacalls" && !plan.useWacalls) {
    return res.status(400).json({
      error: "Seu plano não inclui acesso ao WhatsApp Plus - Voz + Msg. Faça upgrade para utilizar este recurso."
    });
  }

  const { whatsapp, oldDefaultWhatsapp } = await CreateWhatsAppService({
    name,
    status,
    isDefault,
    greetingMessage,
    complationMessage,
    outOfHoursMessage,
    queueIds,
    companyId,
    token,
    maxUseBotQueues,
    timeUseBotQueues,
    expiresTicket,
    allowGroup,
    allowSignature,
    timeSendQueue,
    sendIdQueue,
    timeInactiveMessage,
    inactiveMessage,
    ratingMessage,
    maxUseBotQueuesNPS,
    expiresTicketNPS,
    whenExpiresTicket,
    expiresInactiveMessage,
    importOldMessages,
    importRecentMessages,
    closedTicketsPostImported,
    importOldMessagesGroups,
    groupAsTicket,
    timeCreateNewTicket,
    schedules,
    promptId,
    collectiveVacationEnd,
    collectiveVacationMessage,
    collectiveVacationStart,
    queueIdImportMessages,
    phone_number_id,
    waba_id,
    send_token,
    business_id,
    phone_number,
    waba_webhook,
    channel,
    color,
    zapiInstanceId,
    zapiToken,
    zapiClientToken,
    wacallsVoiceFlowId
  });

  if (["whatsapp_oficial"].includes(whatsapp.channel)) {
    try {
      const company: ICreateConnectionWhatsAppOficialCompany = {
        companyId: String(whatsapp.companyId),
        companyName: whatsapp.company.name
      };
      const whatsappOficial: ICreateConnectionWhatsAppOficialWhatsApp = {
        token_mult100: whatsapp.token,
        phone_number_id: whatsapp.phone_number_id,
        waba_id: whatsapp.waba_id,
        send_token: whatsapp.send_token,
        business_id: whatsapp.business_id,
        phone_number: whatsapp.phone_number,
        idEmpresaMult100: whatsapp.companyId
      };

      const data = {
        email: whatsapp.company.email,
        company,
        whatsApp: whatsappOficial
      };

      const { webhookLink, connectionId } =
        await CreateCompanyConnectionOficial(data);

      if (webhookLink) {
        whatsapp.waba_webhook = webhookLink;
        whatsapp.waba_webhook_id = connectionId;
        whatsapp.status = "CONNECTED";
        await whatsapp.save();
      }
    } catch (error) {
      logger.info("ERROR", error);
    }
  }

  if (["whatsapp"].includes(whatsapp.channel) && !whatsapp.zapiInstanceId) {
    StartWhatsAppSession(whatsapp, companyId);
  }

  // Z-API: mark as connected if credentials are provided
  if (whatsapp.zapiInstanceId && whatsapp.zapiToken && whatsapp.zapiClientToken) {
    await whatsapp.update({ status: "CONNECTED", provider: "z-api" });
  }
  const io = getIO();
  io.of(String(companyId)).emit(`company-${companyId}-whatsapp`, {
    action: "update",
    whatsapp
  });

  if (oldDefaultWhatsapp) {
    io.of(String(companyId)).emit(`company-${companyId}-whatsapp`, {
      action: "update",
      whatsapp: oldDefaultWhatsapp
    });
  }

  return res.status(200).json(whatsapp);
};

export const storeFacebook = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const {
      facebookUserId,
      facebookUserToken,
      addInstagram
    }: {
      facebookUserId: string;
      facebookUserToken: string;
      addInstagram: boolean;
    } = req.body;
    const { companyId } = req.user;

    // const company = await ShowCompanyService(companyId)
    // const plan = await ShowPlanService(company.planId);

    // if (!plan.useFacebook) {
    //   return res.status(400).json({
    //     error: "Você não possui permissão para acessar este recurso!"
    //   });
    // }

    let data;
    try {
      const result = await getPageProfile(facebookUserId, facebookUserToken);
      data = result.data;
    } catch (err: any) {
      const details = err?.metaDetails || {};
      console.error("[storeFacebook] getPageProfile falhou:", details, err?.message);
      return res.status(400).json({
        error:
          details.message ||
          err?.message ||
          "Não foi possível obter páginas do Facebook. Verifique se o Meta App ID/Secret estão configurados em Configurações → Meta e se o usuário tem páginas com permissão concedida."
      });
    }

    if (!data || data.length === 0) {
      return res.status(400).json({
        error:
          "Nenhuma página do Facebook foi encontrada para este usuário. Verifique se você concedeu acesso a pelo menos uma página durante o login."
      });
    }
    const io = getIO();

    const pages = [];
    for await (const page of data) {
      const { name, access_token, id, instagram_business_account } = page;

      const acessTokenPage = await getAccessTokenFromPage(access_token);

      if (instagram_business_account && addInstagram) {
        const {
          id: instagramId,
          username,
          name: instagramName
        } = instagram_business_account;

        pages.push({
          companyId,
          name: `Insta ${username || instagramName}`,
          facebookUserId: facebookUserId,
          facebookPageUserId: instagramId,
          facebookUserToken: acessTokenPage,
          tokenMeta: facebookUserToken,
          isDefault: false,
          channel: "instagram",
          status: "CONNECTED",
          greetingMessage: "",
          farewellMessage: "",
          queueIds: [],
          isMultidevice: false
        });

        pages.push({
          companyId,
          name,
          facebookUserId: facebookUserId,
          facebookPageUserId: id,
          facebookUserToken: acessTokenPage,
          tokenMeta: facebookUserToken,
          isDefault: false,
          channel: "facebook",
          status: "CONNECTED",
          greetingMessage: "",
          farewellMessage: "",
          queueIds: [],
          isMultidevice: false
        });

        // ✅ CORRIGIDO: Subscribir na página do Facebook (para receber comentários do Instagram também)
        // Segundo documentação: https://developers.facebook.com/docs/instagram-platform/comment-moderation
        // Os comentários do Instagram chegam via webhook da página do Facebook vinculada ao Instagram
        // O campo "feed" na subscrição da página é responsável por receber comentários do Instagram
        await subscribeApp(id, acessTokenPage, false);
        await subscribeApp(instagramId, acessTokenPage, true);
        
        // ✅ REMOVIDO: Subscrição direta no Instagram Business Account não é suportada
        // Segundo documentação oficial do Facebook:
        // - Comentários do Instagram chegam via página do Facebook vinculada (campo "feed")
        // - Subscrição direta no Instagram Business Account retorna erro (#3) "Application does not have the capability"
        // - A subscrição na página do Facebook já cobre os comentários do Instagram vinculado
      }

      if (!instagram_business_account) {
        pages.push({
          companyId,
          name,
          facebookUserId: facebookUserId,
          facebookPageUserId: id,
          facebookUserToken: acessTokenPage,
          tokenMeta: facebookUserToken,
          isDefault: false,
          channel: "facebook",
          status: "CONNECTED",
          greetingMessage: "",
          farewellMessage: "",
          queueIds: [],
          isMultidevice: false
        });

        await subscribeApp(page.id, acessTokenPage);
      }
    }

    for await (const pageConection of pages) {
      const exist = await Whatsapp.findOne({
        where: {
          facebookPageUserId: pageConection.facebookPageUserId
        }
      });

      if (exist) {
        await exist.update({
          ...pageConection
        });
      }

      if (!exist) {
        const { whatsapp } = await CreateWhatsAppService(pageConection);

        io.of(String(companyId)).emit(`company-${companyId}-whatsapp`, {
          action: "update",
          whatsapp
        });
      }
    }
    return res.status(200);
  } catch (error: any) {
    console.error("[storeFacebook] erro inesperado:", error?.message, error?.stack);
    return res.status(400).json({
      error:
        error?.message ||
        "Falha ao conectar Facebook/Instagram. Verifique as credenciais Meta em Configurações."
    });
  }
};

export const show = async (req: Request, res: Response): Promise<Response> => {
  const { whatsappId } = req.params;
  const { companyId } = req.user;
  const { session } = req.query;

  const whatsapp = await ShowWhatsAppService(whatsappId, companyId, session);

  return res.status(200).json(whatsapp);
};

export const update = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { whatsappId } = req.params;
  const whatsappData = req.body;
  const { companyId } = req.user;

  // DEBUG - Log dos dados recebidos

  // Bloquear atualização com credenciais Z-API se o plano não permite
  if (whatsappData.zapiInstanceId) {
    const company = await ShowCompanyService(companyId);
    const plan = await ShowPlanService(company.planId);
    if (!plan.useZapi) {
      return res.status(400).json({
        error: "Seu plano não inclui acesso à Z-API. Faça upgrade para utilizar este recurso."
      });
    }
  }

  const { whatsapp, oldDefaultWhatsapp } = await UpdateWhatsAppService({
    whatsappData,
    whatsappId,
    companyId
  });

  if (["whatsapp_oficial"].includes(whatsapp.channel)) {
    try {
      const whatsappOficial: IUpdateonnectionWhatsAppOficialWhatsApp = {
        token_mult100: whatsapp.token,
        phone_number_id: whatsapp.phone_number_id,
        waba_id: whatsapp.waba_id,
        send_token: whatsapp.send_token,
        business_id: whatsapp.business_id,
        phone_number: whatsapp.phone_number
      };

      // waba_webhook_id é o id do registro na API Oficial, gravado quando a
      // conexão foi criada lá. Se ele estiver vazio, a conexão NUNCA chegou a
      // ser registrada — e mandar atualizar um id inexistente fazia a API
      // responder "Argument `id` is missing", com o erro engolido logo abaixo.
      //
      // Na prática o usuário salvava a conexão, nada acontecia, e templates e
      // webhook seguiam quebrados sem explicação. Aqui, sem id, criamos.
      if (!whatsapp.waba_webhook_id) {
        logger.info(
          `[API-OFICIAL] conexão ${whatsapp.id} sem registro na API Oficial — criando ao salvar`
        );

        const comEmpresa = await Whatsapp.findByPk(whatsapp.id, {
          include: [{ association: "company" }]
        });
        const empresa: any = (comEmpresa as any)?.company;

        const { webhookLink, connectionId } = await CreateCompanyConnectionOficial({
          email: empresa?.email || "",
          company: {
            companyId: String(whatsapp.companyId),
            companyName: empresa?.name || "Empresa"
          },
          whatsApp: {
            ...whatsappOficial,
            idEmpresaMult100: whatsapp.companyId
          }
        } as any);

        if (connectionId) {
          await whatsapp.update({
            waba_webhook: webhookLink || whatsapp.waba_webhook,
            waba_webhook_id: connectionId
          });
          logger.info(
            `[API-OFICIAL] conexão ${whatsapp.id} registrada (id ${connectionId})`
          );
        }
      } else {
        await UpdateConnectionWhatsAppOficial(
          whatsapp.waba_webhook_id,
          whatsappOficial
        );
      }
    } catch (error: any) {
      // Antes era logger.info("ERROR", error) — o motivo real ficava perdido
      // e a falha passava despercebida.
      logger.error(
        `[API-OFICIAL] falha ao sincronizar a conexão ${whatsapp.id}: ${error?.message}`
      );
    }
  }

  const io = getIO();
  io.of(String(companyId)).emit(`company-${companyId}-whatsapp`, {
    action: "update",
    whatsapp
  });

  if (oldDefaultWhatsapp) {
    io.of(String(companyId)).emit(`company-${companyId}-whatsapp`, {
      action: "update",
      whatsapp: oldDefaultWhatsapp
    });
  }

  return res.status(200).json(whatsapp);
};


export const remove = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { whatsappId } = req.params;
  const { companyId, profile } = req.user;
  const io = getIO();

  if (profile !== "admin") {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  const whatsapp = await ShowWhatsAppService(whatsappId, companyId);

  if (whatsapp.channel === "whatsapp") {
    await DeleteBaileysService(whatsappId);
    await DeleteWhatsAppService(whatsappId);
    await cacheLayer.delFromPattern(`sessions:${whatsappId}:*`);
    removeWbot(+whatsappId);

    io.of(String(companyId)).emit(`company-${companyId}-whatsapp`, {
      action: "delete",
      whatsappId: +whatsappId
    });
  }

  if (whatsapp.channel === "wacalls") {
    // Sem isso, a sessão fica órfã no microserviço Go (wacalls-voip) pra
    // sempre — e continua aparecendo em listas como a do discador, mesmo
    // depois de excluída aqui no EquipeChat.
    try {
      await deleteWacallsSession(whatsapp);
    } catch (error: any) {
      logger.warn(`[WACALLS] falha ao remover sessão no microserviço: ${error?.message}`);
    }
    try {
      await deleteChatSession(whatsapp);
    } catch (error: any) {
      logger.warn(`[WACALLS-CHAT] falha ao remover sessão de chamada: ${error?.message}`);
    }
    await Whatsapp.destroy({
      where: {
        id: +whatsappId
      }
    });

    io.of(String(companyId)).emit(`company-${companyId}-whatsapp`, {
      action: "delete",
      whatsappId: +whatsappId
    });
  }

  if (whatsapp.channel === "whatsapp_oficial") {
    await Whatsapp.destroy({
      where: {
        id: +whatsappId
      }
    });

    try {
      await DeleteConnectionWhatsAppOficial(whatsapp.waba_webhook_id);
    } catch (error) {
      logger.info("ERROR", error);
    }

    io.of(String(companyId)).emit(`company-${companyId}-whatsapp`, {
      action: "delete",
      whatsappId: +whatsappId
    });
  }

  if (whatsapp.channel === "telegram") {
    await DeleteWhatsAppService(whatsappId);

    io.of(String(companyId)).emit(`company-${companyId}-whatsapp`, {
      action: "delete",
      whatsappId: +whatsappId
    });
  }

  if (whatsapp.channel === "facebook" || whatsapp.channel === "instagram") {
    const { facebookUserToken } = whatsapp;

    const getAllSameToken = await Whatsapp.findAll({
      where: {
        facebookUserToken
      }
    });

    await Whatsapp.destroy({
      where: {
        facebookUserToken
      }
    });

    for await (const whatsapp of getAllSameToken) {
      io.of(String(companyId)).emit(`company-${companyId}-whatsapp`, {
        action: "delete",
        whatsappId: whatsapp.id
      });
    }
  }

  // ✅ Fallback: qualquer outro canal (webchat, ou channel nulo/desconhecido).
  // Garante que a conexão SEMPRE seja removida do banco, evitando "conexões fantasma".
  const stillExists = await Whatsapp.findByPk(+whatsappId);
  if (stillExists) {
    await stillExists.destroy();
    io.of(String(companyId)).emit(`company-${companyId}-whatsapp`, {
      action: "delete",
      whatsappId: +whatsappId
    });
  }

  return res.status(200).json({ message: "Session disconnected." });
};

export const restart = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId, profile, id } = req.user;

  const user = await User.findByPk(id);
  const { allowConnections } = user;

  if (profile !== "admin" && allowConnections === "disabled") {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  await restartWbot(companyId);

  return res.status(200).json({ message: "Whatsapp restart." });
};

export const listAll = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId } = req.user;
  const { session } = req.query as QueryParams;
  const whatsapps = await ListAllWhatsAppsService({ session });
  return res.status(200).json(whatsapps);
};

export const updateAdmin = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { whatsappId } = req.params;
  const whatsappData = req.body;
  const { companyId } = req.user;

  const { whatsapp, oldDefaultWhatsapp } = await UpdateWhatsAppServiceAdmin({
    whatsappData,
    whatsappId,
    companyId
  });

  const io = getIO();
  io.of(String(companyId)).emit(`admin-whatsapp`, {
    action: "update",
    whatsapp
  });

  if (oldDefaultWhatsapp) {
    io.of(String(companyId)).emit(`admin-whatsapp`, {
      action: "update",
      whatsapp: oldDefaultWhatsapp
    });
  }

  return res.status(200).json(whatsapp);
};

export const removeAdmin = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { whatsappId } = req.params;
  const { companyId } = req.user;
  const io = getIO();
  const whatsapp = await ShowWhatsAppService(whatsappId, companyId);

  if (whatsapp.channel === "whatsapp") {
    await DeleteBaileysService(whatsappId);
    await DeleteWhatsAppService(whatsappId);
    await cacheLayer.delFromPattern(`sessions:${whatsappId}:*`);
    removeWbot(+whatsappId);

    io.of(String(companyId)).emit(`admin-whatsapp`, {
      action: "delete",
      whatsappId: +whatsappId
    });
  }

  if (whatsapp.channel === "telegram") {
    await DeleteWhatsAppService(whatsappId);

    io.of(String(companyId)).emit(`admin-whatsapp`, {
      action: "delete",
      whatsappId: +whatsappId
    });
  }

  if (whatsapp.channel === "facebook" || whatsapp.channel === "instagram") {
    const { facebookUserToken } = whatsapp;

    const getAllSameToken = await Whatsapp.findAll({
      where: {
        facebookUserToken
      }
    });

    await Whatsapp.destroy({
      where: {
        facebookUserToken
      }
    });

    for await (const whatsapp of getAllSameToken) {
      io.of(String(companyId)).emit(`company-${companyId}-whatsapp`, {
        action: "delete",
        whatsappId: whatsapp.id
      });
    }
  }

  return res.status(200).json({ message: "Session disconnected." });
};

export const showAdmin = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { whatsappId } = req.params;
  const { companyId } = req.user;
  const whatsapp = await ShowWhatsAppServiceAdmin(whatsappId);

  return res.status(200).json(whatsapp);
};

export const syncTemplatesOficial = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId, id: userId } = req.user;
  const { whatsappId } = req.params;

  const whatsapp = await Whatsapp.findByPk(whatsappId);

  if (!whatsapp) {
    throw new AppError("Conexão não encontrada", 404);
  }

  // A API auxiliar (api_ofic) busca a conexão por token_mult100 = whatsapp.token (token interno do sistema)
  // send_token é o token da Meta, usado apenas para autenticação direta na Meta (createTemplate/deleteTemplate)
  const multi100Token = whatsapp.token;
  if (!multi100Token) {
    throw new AppError("Token interno não encontrado para esta conexão.", 400);
  }

  /**
   * Garante que a conexão exista no serviço da API Oficial.
   *
   * A conexão é registrada lá quando é criada aqui. Só que instalações onde
   * aquele passo falhou — o serviço fora do ar, build quebrado, versão antiga —
   * ficam com a conexão funcionando no EquipeChat e ausente lá. O sintoma é
   * este: "Nenhuma conexão existente com este token", que chegava na tela como
   * um "Internal server error" sem explicação e sem saída.
   *
   * Registrar aqui é seguro: o serviço consulta antes de criar.
   */
  const registrarConexaoSeFaltar = async (): Promise<boolean> => {
    try {
      const comEmpresa = await Whatsapp.findByPk(whatsappId, {
        include: [{ association: "company" }]
      });
      const empresa: any = (comEmpresa as any)?.company;

      await CreateCompanyConnectionOficial({
        email: empresa?.email || "",
        company: {
          companyId: String(whatsapp.companyId),
          companyName: empresa?.name || "Empresa"
        },
        whatsApp: {
          token_mult100: whatsapp.token,
          phone_number_id: whatsapp.phone_number_id,
          waba_id: whatsapp.waba_id,
          send_token: whatsapp.send_token,
          business_id: whatsapp.business_id,
          phone_number: whatsapp.phone_number,
          idEmpresaMult100: whatsapp.companyId
        }
      } as any);

      logger.info(
        `[TEMPLATES] conexão ${whatsappId} registrada na API Oficial sob demanda`
      );
      return true;
    } catch (err: any) {
      logger.warn(
        `[TEMPLATES] falha ao registrar a conexão ${whatsappId} na API Oficial: ${err?.message}`
      );
      return false;
    }
  };

  let data: any;
  try {
    data = await getTemplatesWhatsAppOficial(multi100Token);
  } catch (err: any) {
    const mensagem = String(err?.message || "");
    // Só tenta registrar quando o motivo é justamente a conexão ausente —
    // outros erros (token inválido, serviço fora) não se resolvem com isso.
    if (/Nenhuma conex/i.test(mensagem)) {
      const registrou = await registrarConexaoSeFaltar();
      if (registrou) {
        data = await getTemplatesWhatsAppOficial(multi100Token);
      } else {
        throw new AppError(
          "Esta conexão ainda não está registrada na API Oficial e o registro " +
            "automático falhou. Abra Conexões, edite esta conexão e salve.",
          502
        );
      }
    } else {
      throw new AppError(
        `Não foi possível listar os templates: ${mensagem}`,
        502
      );
    }
  }
  const io = getIO();
  const statusChanges: Array<{ name: string; oldStatus: string; newStatus: string }> = [];

  // A API Oficial (serviço auxiliar) às vezes responde 200 sem o campo
  // "data" (ex: conexão ainda sendo configurada, sem WABA vinculada ainda,
  // ou nenhum template cadastrado) — antes disso derrubava a rota inteira
  // com "Cannot read properties of undefined (reading 'length')" toda vez
  // que o front pollava essa tela. Trata como "nenhum template" em vez de
  // quebrar.
  const templates = Array.isArray(data?.data) ? data.data : [];
  if (!Array.isArray(data?.data)) {
    logger.warn(
      `[syncTemplatesOficial] resposta da API Oficial sem "data" pra whatsappId=${whatsappId} — tratando como lista vazia.`
    );
  }

  if (templates.length > 0) {
    await Promise.all(
      templates.map(async template => {
        const quickMessage = await QuickMessage.findOne({
          where: {
            metaID: template.id
          },
          include: [
            {
              model: QuickMessageComponent,
              as: "components"
            }
          ]
        });

        if (quickMessage) {
          // Detectar mudança de status
          const oldStatus = quickMessage.status;
          const newStatus = template.status;
          if (oldStatus && newStatus && oldStatus !== newStatus) {
            statusChanges.push({
              name: template.name,
              oldStatus,
              newStatus
            });
          }

          await quickMessage.update({
            message: template.name,
            category: template.category,
            status: template.status,
            language: template.language
          });

          if (template?.components?.length > 0) {
            if (quickMessage?.components?.length > 0) {
              try {
                await QuickMessageComponent.destroy({
                  where: {
                    quickMessageId: quickMessage.id
                  }
                });
              } catch (error) {
                console.error(
                  "Error destroying QuickMessageComponents:",
                  error
                );
              }
            } else {
            }

            await Promise.all(
              template.components.map(async component => {
                await QuickMessageComponent.create({
                  quickMessageId: quickMessage.id,
                  type: component.type,
                  text: component.text,
                  buttons: JSON.stringify(component?.buttons),
                  format: component?.format,
                  example: JSON.stringify(component?.example)
                });
              })
            );
          }
        } else {
          const templateData = {
            shortcode: template.name,
            message: template.name,
            companyId: companyId,
            userId: userId,
            geral: true,
            isMedia: false,
            mediaPath: null,
            visao: true,
            isOficial: true,
            language: template.language,
            status: template.status,
            category: template.category,
            metaID: template.id,
            whatsappId: whatsapp.id
          };
          const qm = await CreateService(templateData);

          await Promise.all(
            template.components.map(async component => {
              await QuickMessageComponent.create({
                quickMessageId: qm.id,
                type: component.type,
                text: component.text,
                buttons: JSON.stringify(component?.buttons),
                format: component?.format,
                example: JSON.stringify(component?.example)
              });
            })
          );
        }
      })
    );
  }

  // Emitir notificações de mudança de status via socket
  if (statusChanges.length > 0) {
    io.of(String(companyId))
      .emit(`company-${companyId}-templateStatus`, {
        action: "statusChange",
        changes: statusChanges,
        whatsappId: parseInt(whatsappId),
        whatsappName: whatsapp.name
      });
  }

  return res.status(200).json({ ...data, statusChanges });
};

export const createTemplate = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId } = req.user;
  const { whatsappId } = req.params;
  const { name, language, category, components } = req.body;

  const whatsapp = await Whatsapp.findByPk(whatsappId);

  if (!whatsapp || whatsapp.companyId !== companyId) {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  if (whatsapp.channel !== "whatsapp_oficial") {
    throw new AppError("ERR_ONLY_OFICIAL_API", 400);
  }

  const multi100Token = whatsapp.token;
  if (!multi100Token) {
    throw new AppError("Token interno não encontrado para esta conexão.", 400);
  }

  try {
    const result = await createTemplateWhatsAppOficial(multi100Token, {
      name,
      language,
      category,
      components
    });

    return res.status(200).json(result);
  } catch (err: any) {
    throw new AppError(err.message || "ERR_CREATING_TEMPLATE", 500);
  }
};

export const deleteTemplate = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId } = req.user;
  const { whatsappId, templateName } = req.params;

  const whatsapp = await Whatsapp.findByPk(whatsappId);

  if (!whatsapp || whatsapp.companyId !== companyId) {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  if (whatsapp.channel !== "whatsapp_oficial") {
    throw new AppError("ERR_ONLY_OFICIAL_API", 400);
  }

  const multi100Token = whatsapp.token;
  if (!multi100Token) {
    throw new AppError("Token interno não encontrado para esta conexão.", 400);
  }

  try {
    const result = await deleteTemplateWhatsAppOficial(multi100Token, templateName);

    // Remove from QuickMessage too
    await QuickMessage.destroy({
      where: {
        whatsappId: parseInt(whatsappId),
        shortcode: templateName,
        isOficial: true,
        companyId
      }
    });

    return res.status(200).json(result);
  } catch (err: any) {
    throw new AppError(err.message || "ERR_DELETING_TEMPLATE", 500);
  }
};

export const importMessages = async (req: Request, res: Response): Promise<Response> => {
  const { companyId, id: userId } = req.user;
  const { whatsappId, startDate, endDate, messageType, ticketStatus, queueId } = req.body;

  if (!whatsappId || !startDate || !endDate) {
    throw new AppError("ERR_MISSING_PARAMS", 400);
  }

  const ImportMessagesService = (await import("../services/ZApiServices/ImportMessagesService")).default;

  // Roda em segundo plano — NÃO espera o import inteiro terminar antes de
  // responder. Um import Baileys real pode levar minutos (centenas de
  // chats, cada um com um pedido de histórico sob-demanda + espera de
  // ~3.5s), e esperar o request HTTP inteiro até o fim estourava o timeout
  // do axios/proxy no meio do processo — aparecia como um erro vermelho na
  // tela de Conexões mesmo com o import continuando normalmente no backend
  // logo em seguida. Progresso e resultado final agora chegam só via socket
  // (company-{companyId}-importMessages), igual o import automático nativo
  // já fazia.
  ImportMessagesService({
    whatsappId: parseInt(whatsappId),
    companyId,
    userId: Number(userId),
    startDate,
    endDate,
    messageType: messageType || "all",
    ticketStatus: ticketStatus || "open",
    queueId: queueId ? Number(queueId) : undefined,
  }).catch((err: any) => {
    logger.error(`[ImportMessages] Falha ao importar (conexão ${whatsappId}): ${err?.message}`);
  });

  return res.status(202).json({ started: true });
};

export const cancelImportMessages = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { cancelImport } = await import("../services/ZApiServices/ImportMessagesService");
  const { cancelNativeImport } = await import("../services/WhatsappService/ImportWhatsAppMessageService");
  cancelImport(companyId);
  cancelNativeImport(companyId);
  return res.status(200).json({ message: "Cancelamento solicitado" });
};

// ==================== EMBEDDED SIGNUP ====================

export const embeddedSignup = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { code, name } = req.body;
  const { companyId } = req.user;

  if (!code) {
    throw new AppError("Código de autorização não fornecido.", 400);
  }

  // Try env vars first, then DB settings
  let appId = process.env.FACEBOOK_APP_ID || process.env.REACT_APP_FACEBOOK_APP_ID;
  let appSecret = process.env.FACEBOOK_APP_SECRET;

  if (!appId) {
    const dbAppId = await Setting.findOne({ where: { key: "metaAppId", companyId: 1 } });
    if (dbAppId?.value) appId = dbAppId.value;
  }
  if (!appSecret) {
    const dbAppSecret = await Setting.findOne({ where: { key: "metaAppSecret", companyId: 1 } });
    if (dbAppSecret?.value) appSecret = dbAppSecret.value;
  }

  if (!appId || !appSecret) {
    throw new AppError(
      "Meta App ID e/ou App Secret não configurados. Configure em Configurações → Meta / WhatsApp Embedded Signup.",
      500
    );
  }

  try {
    // Step 1: Exchange code for access token
    const tokenResponse = await axios.get(
      `https://graph.facebook.com/v21.0/oauth/access_token`,
      {
        params: {
          client_id: appId,
          client_secret: appSecret,
          code,
        },
      }
    );

    const accessToken = tokenResponse.data.access_token;
    if (!accessToken) {
      throw new AppError("Não foi possível obter o access token da Meta.", 400);
    }

    // Step 2: Debug token to get granular scopes and shared WABA info
    const debugResponse = await axios.get(
      `https://graph.facebook.com/v21.0/debug_token`,
      {
        params: {
          input_token: accessToken,
          access_token: `${appId}|${appSecret}`,
        },
      }
    );

    const debugData = debugResponse.data?.data;
    const granularScopes = debugData?.granular_scopes || [];

    // Extract WABA ID from granular scopes
    let wabaId = "";
    let businessId = "";
    let phoneNumberId = "";
    let phoneNumber = "";

    const wabaScope = granularScopes.find(
      (s: any) => s.scope === "whatsapp_business_management"
    );
    if (wabaScope?.target_ids?.length > 0) {
      wabaId = wabaScope.target_ids[0];
    }

    const bizScope = granularScopes.find(
      (s: any) => s.scope === "business_management"
    );
    if (bizScope?.target_ids?.length > 0) {
      businessId = bizScope.target_ids[0];
    }

    // Step 3: If we have WABA ID, get phone numbers
    if (wabaId) {
      try {
        const phonesResponse = await axios.get(
          `https://graph.facebook.com/v21.0/${wabaId}/phone_numbers`,
          {
            params: { access_token: accessToken },
          }
        );
        const phones = phonesResponse.data?.data || [];
        if (phones.length > 0) {
          phoneNumberId = phones[0].id;
          phoneNumber = phones[0].display_phone_number || phones[0].verified_name || "";
        }
      } catch (phoneErr) {
        logger.warn(
          `[EmbeddedSignup] Could not fetch phone numbers for WABA ${wabaId}: ${phoneErr.message}`
        );
      }
    }

    // Step 4: Subscribe WABA to our app for webhooks
    if (wabaId) {
      try {
        await axios.post(
          `https://graph.facebook.com/v21.0/${wabaId}/subscribed_apps`,
          null,
          { params: { access_token: accessToken } }
        );
      } catch (subErr) {
        logger.warn(
          `[EmbeddedSignup] Could not subscribe app to WABA ${wabaId}: ${subErr.message}`
        );
      }
    }

    // Step 5: Create the WhatsApp connection in the CRM
    const connectionName = name || `WhatsApp Oficial ${phoneNumber || wabaId}`;

    const { whatsapp, oldDefaultWhatsapp } = await CreateWhatsAppService({
      name: connectionName,
      status: "CONNECTED",
      isDefault: false,
      greetingMessage: "",
      complationMessage: "",
      outOfHoursMessage: "",
      queueIds: [],
      companyId,
      token: `emb_${Date.now()}`,
      channel: "whatsapp_oficial",
      phone_number_id: phoneNumberId,
      waba_id: wabaId,
      send_token: accessToken,
      business_id: businessId,
      phone_number: phoneNumber,
    });

    // Update tokenMeta
    await whatsapp.update({ tokenMeta: accessToken });

    // Step 6: Register in API Oficial
    if (whatsapp.channel === "whatsapp_oficial" && phoneNumberId && wabaId) {
      try {
        const company: ICreateConnectionWhatsAppOficialCompany = {
          companyId: String(whatsapp.companyId),
          companyName: whatsapp.company?.name || "Company",
        };
        const whatsappOficial: ICreateConnectionWhatsAppOficialWhatsApp = {
          token_mult100: whatsapp.token,
          phone_number_id: phoneNumberId,
          waba_id: wabaId,
          send_token: accessToken,
          business_id: businessId,
          phone_number: phoneNumber,
          idEmpresaMult100: whatsapp.companyId,
        };

        const data = {
          email: whatsapp.company?.email || "",
          company,
          whatsApp: whatsappOficial,
        };

        const { webhookLink, connectionId } =
          await CreateCompanyConnectionOficial(data);

        if (webhookLink) {
          await whatsapp.update({
            waba_webhook: webhookLink,
            waba_webhook_id: connectionId,
          });
        }
      } catch (oficialErr) {
        logger.warn(
          `[EmbeddedSignup] Could not register in API Oficial: ${oficialErr.message}`
        );
      }
    }

    // Emit socket event
    const io = getIO();
    io.of(String(companyId)).emit(`company-${companyId}-whatsapp`, {
      action: "update",
      whatsapp,
    });

    if (oldDefaultWhatsapp) {
      io.of(String(companyId)).emit(`company-${companyId}-whatsapp`, {
        action: "update",
        whatsapp: oldDefaultWhatsapp,
      });
    }

    return res.status(200).json({
      id: whatsapp.id,
      name: whatsapp.name,
      phone_number: phoneNumber,
      waba_id: wabaId,
      phone_number_id: phoneNumberId,
      status: "CONNECTED",
    });
  } catch (error: any) {
    logger.error(
      `[EmbeddedSignup] Error: ${error?.response?.data ? JSON.stringify(error.response.data) : error.message}`
    );

    if (error instanceof AppError) throw error;

    throw new AppError(
      error?.response?.data?.error?.message ||
        error.message ||
        "Erro ao processar Embedded Signup",
      500
    );
  }
};

export const healthOne = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { whatsappId } = req.params;
  const { companyId } = req.user;
  const data = await getWhatsAppOficialHealth(whatsappId, companyId);
  return res.status(200).json(data);
};

export const healthAll = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId } = req.user;
  const data = await getAllWhatsAppOficialHealth(companyId);
  return res.status(200).json(data);
};

// Qualidade/saúde de um número, para qualquer tipo de conexão (Baileys ou Oficial).
export const quality = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { whatsappId } = req.params;
  const { companyId } = req.user;
  const data = await GetWhatsappQualityService(Number(whatsappId), companyId);
  return res.status(200).json(data);
};

export const healthReportPdf = async (
  req: Request,
  res: Response
): Promise<void> => {
  const { companyId } = req.user;
  const lang = String(
    (req.query.lang as string) ||
      (req.headers["x-language"] as string) ||
      (req.headers["accept-language"] as string) ||
      "pt"
  );
  const { buffer } = await generateHealthReportPdfForCompany(companyId, lang);
  const date = new Date().toISOString().slice(0, 10);
  res.setHeader("Content-Type", "application/pdf");
  res.setHeader(
    "Content-Disposition",
    `attachment; filename="saude-numeros-${date}.pdf"`
  );
  res.setHeader("Content-Length", String(buffer.length));
  res.end(buffer);
};


export const healthReportList = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId } = req.user;
  const items = listHealthReports(companyId);
  return res.status(200).json(items);
};

/**
 * Retorna a URL única do webhook unificado da Meta (para a empresa atual)
 * e o verify token. Esse webhook pode ser usado para N números do mesmo App Meta.
 */
export const metaUnifiedWebhookInfo = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { companyId } = req.user;
    const company = await ShowCompanyService(companyId);

    const urlApi = process.env.URL_API_OFICIAL;
    const apiToken = process.env.TOKEN_API_OFICIAL;

    if (!urlApi || !apiToken) {
      return res.status(400).json({
        error:
          "API Oficial não configurada. Defina URL_API_OFICIAL e TOKEN_API_OFICIAL."
      });
    }

    // Busca o token da company no api_oficial (já existente no banco do api_oficial)
    //
    // validateStatus liberado: um 401/500 do api_oficial vinha como exceção
    // genérica e a tela dizia "verifique se a API está configurada", mandando
    // o usuário procurar no lugar errado. Agora o motivo real sobe.
    const resp = await axios.get(`${urlApi}/v1/companies`, {
      headers: { Authorization: `Bearer ${apiToken}` },
      timeout: 15000,
      validateStatus: () => true
    });

    if (resp.status >= 400) {
      logger.warn(
        `[META-WEBHOOK] ${urlApi}/v1/companies respondeu ${resp.status}`
      );
      return res.status(502).json({
        error:
          `A API Oficial respondeu ${resp.status} ao listar empresas. ` +
          `Verifique se URL_API_OFICIAL aponta para o serviço certo e se o ` +
          `TOKEN_API_OFICIAL é válido.`
      });
    }

    // Array.isArray em vez de só "|| []": um objeto de erro disfarçado de
    // sucesso (ex: {message:"..."} com status 200) passaria pelo "|| []"
    // sem cair no fallback, e ".find" quebraria a rota.
    const companies = Array.isArray(resp.data)
      ? (resp.data as Array<{
          id: number;
          idEmpresaMult100: number;
          token: string;
        }>)
      : [];

    const oficialCompany = companies.find(
      c => String(c.idEmpresaMult100) === String(company.id)
    );

    if (!oficialCompany) {
      // Em vez de mandar o usuário recriar a conexão, registra a empresa aqui
      // mesmo. O registro é idempotente (consulta antes de criar) e é
      // exatamente o que a criação da conexão já faz — só que instalações que
      // vieram de versões antigas, ou onde aquele passo falhou, ficavam
      // travadas num beco sem saída: a conexão existe, funciona, e o webhook
      // acusava "empresa não registrada" sem oferecer solução.
      logger.warn(
        `[META-WEBHOOK] empresa ${company.id} não encontrada na API Oficial ` +
          `(${companies.length} empresa(s) retornada(s)) — registrando agora`
      );

      // O registro é feito AQUI, com o mesmo axios que acabou de funcionar no
      // GET logo acima. A tentativa anterior usava uma biblioteca que refaz a
      // própria consulta sem tratar status, e um 404 dela chegava mascarado
      // como "falha ao registrar" — sem dizer de qual chamada veio.
      const respCriar = await axios.post(
        `${urlApi.replace(/\/$/, "")}/v1/companies`,
        { idEmpresaMult100: Number(company.id), name: company.name },
        {
          headers: { Authorization: `Bearer ${apiToken}` },
          timeout: 15000,
          validateStatus: () => true
        }
      );

      logger.info(
        `[META-WEBHOOK] POST /v1/companies para empresa ${company.id} respondeu ${respCriar.status}`
      );

      let tokenDaEmpresa = (respCriar.data as any)?.token;

      // 409/400 costuma significar "já existe" — nesse caso o registro está
      // lá e basta reler a lista para pegar o token.
      if (!tokenDaEmpresa && respCriar.status !== 404) {
        const respRelendo = await axios.get(`${urlApi.replace(/\/$/, "")}/v1/companies`, {
          headers: { Authorization: `Bearer ${apiToken}` },
          timeout: 15000,
          validateStatus: () => true
        });
        const lista = Array.isArray(respRelendo.data) ? respRelendo.data : [];
        const achada = lista.find(
          (c: any) => String(c.idEmpresaMult100) === String(company.id)
        );
        tokenDaEmpresa = achada?.token;
      }

      if (tokenDaEmpresa) {
        logger.info(`[META-WEBHOOK] empresa ${company.id} registrada na API Oficial`);
        return res.status(200).json({
          webhookUrl: `${urlApi.replace(/\/$/, "")}/v1/webhook/unified/${tokenDaEmpresa}`,
          verifyToken: tokenDaEmpresa,
          companyToken: tokenDaEmpresa
        });
      }

      // Sem token, devolve o status e o corpo da resposta: é o que permite
      // distinguir rota inexistente (404) de validação recusada (400).
      const corpo =
        typeof respCriar.data === "string"
          ? respCriar.data.slice(0, 200)
          : JSON.stringify(respCriar.data || {}).slice(0, 200);

      return res.status(502).json({
        error:
          `Não foi possível registrar a empresa ${company.id} na API Oficial. ` +
          `POST ${urlApi.replace(/\/$/, "")}/v1/companies respondeu ` +
          `${respCriar.status}. Resposta: ${corpo}`
      });
    }

    // Sem token, a URL abaixo ficava com "null" literal colado nela (ex:
    // ".../v1/webhook/unified/null", porque JS converte null pra string
    // "null" dentro de um template literal) — o usuário via um webhook
    // quebrado sem nenhuma mensagem de erro explicando o motivo.
    if (!oficialCompany.token) {
      return res.status(409).json({
        error:
          "A empresa está registrada na API Oficial, mas sem token gerado ainda. Tente recriar a conexão WhatsApp Oficial ou contate o suporte."
      });
    }

    const webhookUrl = `${urlApi.replace(/\/$/, "")}/v1/webhook/unified/${oficialCompany.token}`;

    return res.status(200).json({
      webhookUrl,
      verifyToken: oficialCompany.token,
      companyToken: oficialCompany.token,
      info:
        "Cole esta URL e Verify Token no App da Meta (WhatsApp > Configuração > Webhook). Todos os números da empresa serão roteados automaticamente pelo phone_number_id."
    });
  } catch (err: any) {
    return res.status(500).json({
      error: err?.response?.data?.message || err.message || "Erro inesperado"
    });
  }
};

/**
 * Inscreve a WABA da conexão oficial no App Meta vinculado.
 * Equivalente a POST https://graph.facebook.com/v20.0/{waba_id}/subscribed_apps
 * Usa o send_token (System User Token) salvo na própria conexão.
 */
export const subscribeWaba = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { whatsappId } = req.params;
    const { companyId } = req.user;

    const whatsapp = await Whatsapp.findOne({
      where: { id: whatsappId, companyId }
    });

    if (!whatsapp) {
      return res.status(404).json({ error: "Conexão não encontrada" });
    }

    const wabaId = whatsapp.waba_id;
    const token = whatsapp.send_token || whatsapp.tokenMeta;

    if (!wabaId || !token) {
      return res.status(400).json({
        error:
          "Conexão sem waba_id ou send_token. Preencha esses campos antes de inscrever a WABA."
      });
    }

    const url = `https://graph.facebook.com/v20.0/${wabaId}/subscribed_apps`;

    const response = await axios.post(
      url,
      {},
      { headers: { Authorization: `Bearer ${token}` } }
    );

    return res.status(200).json({
      success: true,
      waba_id: wabaId,
      meta: response.data
    });
  } catch (err: any) {
    const metaErr =
      err?.response?.data?.error?.message ||
      err?.response?.data?.message ||
      err?.message ||
      "Falha ao inscrever WABA";
    return res.status(400).json({ error: metaErr });
  }
};


export const connectionStats = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId } = req.user;

  const estatisticas = await ListConnectionStatsService(companyId);

  return res.status(200).json(estatisticas);
};
