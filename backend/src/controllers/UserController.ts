import { Request, Response } from "express";
import { getIO } from "../libs/socket";
import cache from "../libs/cache";
import { isEmpty, isNil } from "lodash";
import CheckSettingsHelper from "../helpers/CheckSettings";
import AppError from "../errors/AppError";

import CreateUserService from "../services/UserServices/CreateUserService";
import ListUsersService from "../services/UserServices/ListUsersService";
import UpdateUserService from "../services/UserServices/UpdateUserService";
import ShowUserService from "../services/UserServices/ShowUserService";
import DeleteUserService from "../services/UserServices/DeleteUserService";
import SimpleListService from "../services/UserServices/SimpleListService";
import CreateCompanyService from "../services/CompanyService/CreateCompanyService";
import { SendMail } from "../helpers/SendMail";
import { sendMailWithSmtp } from "../helpers/SendMailWithSmtpSettings";
import { getEmailTranslation, getDirection } from "../helpers/EmailTranslations";
import { useDate } from "../utils/useDate";
import Setting from "../models/Setting";
import ShowCompanyService from "../services/CompanyService/ShowCompanyService";
import { getWbot } from "../libs/wbot";
import FindCompaniesWhatsappService from "../services/CompanyService/FindCompaniesWhatsappService";
import User from "../models/User";

import { head } from "lodash";
import ToggleChangeWidthService from "../services/UserServices/ToggleChangeWidthService";
import APIShowEmailUserService from "../services/UserServices/APIShowEmailUserService";
import UpdateUserOnlineStatusService from "../services/UserServices/UpdateUserOnlineStatusService";
import GetOnlineUsersService from "../services/UserServices/GetOnlineUsersService";
import SendTestNotificationService from "../services/UserServices/SendTestNotificationService";
import Chat from "../models/Chat";
import ChatUser from "../models/ChatUser";
import Plan from "../models/Plan";
import axios from "axios";
import logger from "../utils/logger";

type IndexQuery = {
  searchParam: string;
  pageNumber: string;
};

export const index = async (req: Request, res: Response): Promise<Response> => {
  const { searchParam, pageNumber } = req.query as IndexQuery;
  const { companyId, profile } = req.user;

  const { users, count, hasMore } = await ListUsersService({
    searchParam,
    pageNumber,
    companyId,
    profile
  });

  return res.json({ users, count, hasMore });
};

export const store = async (req: Request, res: Response): Promise<Response> => {
  const {
    email,
    password,
    name,
    phone,
    profile,
    companyId: bodyCompanyId,
    queueIds,
    companyName,
    planId,
    startWork,
    endWork,
    acceptanceMessage,
    whatsappId,
    whatsappIds,
    allTicket,
    defaultTheme,
    defaultMenu,
    internalExtension,
    allowGroup,
    allHistoric,
    allUserChat,
    userClosePendingTicket,
    showDashboard,
    defaultTicketsManagerWidth = 550,
    allowRealTime,
    allowConnections,
    showContacts,
    showCampaign,
    showFlow,
    showSchedules,
    showKanban,
    showInternalChat,
    showOpenAi,
    showIntegrations,
    finalizacaoComValorVendaAtiva,
    timezone,
    birthDate,
    allowSeeMessagesInPendingTickets = "enabled",
    showReturnQueueButton = "enabled",
    showTransferTicketButton = "enabled",
    document, // CNPJ da empresa
    language,
    notifyPendingTicketWhatsapp = "disabled",
    whatsappNumber = null,
    pendingTicketNotificationMessage = null,
    notifyOpenTicketWhatsapp = "disabled",
    notifyKanbanTicketWhatsapp = "disabled",
    notificationMaxCount = 1,
    notificationIntervalMinutes = 0,
    notificationWhatsappId = null

  } = req.body;
  let userCompanyId: number | null = null;

  const { dateToClient } = useDate();

  if (req.user !== undefined) {
    const { companyId: cId } = req.user;
    userCompanyId = cId;
  }

  if (
    req.url === "/signup" &&
    (await CheckSettingsHelper("userCreation")) === "disabled"
  ) {
    throw new AppError("ERR_USER_CREATION_DISABLED", 403);
  } else if (req.url !== "/signup" && req.user.profile !== "admin") {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  if (process.env.DEMO === "ON") {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  // Validar se CPF/CNPJ foi fornecido no signup — somente se a configuração estiver habilitada
  if (req.url === "/signup") {
    const { googleSignupCode } = req.body as { googleSignupCode?: string };

    // Se veio do Google OAuth, o e-mail já foi verificado pelo provedor.
    // Caso contrário, exigir o código de verificação por e-mail.
    let emailVerifiedViaGoogle = false;
    if (googleSignupCode) {
      // Lazy require to avoid circular import at module load time
      // eslint-disable-next-line @typescript-eslint/no-var-requires
      const { consumeGoogleSignupCode } = require("./GoogleAuthController");
      emailVerifiedViaGoogle = consumeGoogleSignupCode(googleSignupCode, email);
      if (!emailVerifiedViaGoogle) {
        throw new AppError("Código do Google inválido ou expirado. Tente novamente.", 400);
      }
    }

    if (!emailVerifiedViaGoogle) {
      // Verificar se o e-mail foi validado por código
      const emailVerified = await cache.get(`signup-verified:${email}`);
      if (!emailVerified) {
        throw new AppError("E-mail não verificado. Por favor, valide seu e-mail antes de cadastrar.", 400);
      }
      // Limpar flag de verificação
      await cache.del(`signup-verified:${email}`);
    }

    // No signup público, a configuração é da empresa 1 (empresa administradora)
    const requireDocument = await CheckSettingsHelper("requireDocument", 1);
    if (requireDocument === "enabled" && (!document || document.trim() === "")) {
      throw new AppError("CNPJ é obrigatório para o cadastro", 400);
    }
  }

  const companyUser = bodyCompanyId || userCompanyId;

  let plan = null;
  if (planId) {
    plan = await Plan.findByPk(planId, {
      attributes: ["id", "name", "trial", "trialDays"]
    });
  }

  // CADASTRO SEM ESCOLHER PLANO
  // O primeiro cadastro nao pede plano: a empresa entra em periodo de teste e
  // so contrata depois, no Financeiro ou quando o teste vencer.
  //
  // Em vez de criar um conceito novo de "trial", reaproveita o que ja existe:
  // o proprio modelo Plan tem as colunas `trial` e `trialDays`. Quando nenhum
  // planId chega, pegamos o plano marcado como de teste — dai o calculo de
  // dueDate abaixo continua sendo exatamente o mesmo, sem caminho paralelo.
  //
  // (Antes, sem planId, a linha `plan.trial === true` estourava em `plan`
  // null, e por isso o plano era obrigatorio na pratica.)
  if (!companyUser && !plan) {
    plan = await Plan.findOne({
      where: { trial: true },
      order: [["id", "ASC"]],
      attributes: ["id", "name", "trial", "trialDays"]
    });

    // Sem nenhum plano de teste cadastrado, cai no plano mais barato para a
    // empresa nao nascer sem limite nenhum (usuarios, conexoes e filas saem
    // do plano). O periodo de teste vem do `else` do calculo de data.
    if (!plan) {
      plan = await Plan.findOne({
        order: [["id", "ASC"]],
        attributes: ["id", "name", "trial", "trialDays"]
      });
    }

    if (!plan) {
      throw new AppError("ERR_NO_PLAN_AVAILABLE", 400);
    }
  }

  if (!companyUser) {
    let date = "";
    if (plan?.trial === true) {
      const dataNowMoreTwoDays = new Date();
      dataNowMoreTwoDays.setDate(dataNowMoreTwoDays.getDate() + Number(plan?.trialDays || 3));

      date = dataNowMoreTwoDays.toISOString().split("T")[0];
    } else {
      const dataNowMoreTwoDays = new Date();
      dataNowMoreTwoDays.setDate(dataNowMoreTwoDays.getDate() + 3);

      date = dataNowMoreTwoDays.toISOString().split("T")[0];
    }

    const companyData = {
      name: companyName,
      email: email,
      phone: phone,
      // Usa o plano resolvido acima (o escolhido pelo cliente OU o de
      // teste), nunca o planId cru do corpo, que pode vir vazio.
      planId: plan?.id || planId,
      status: true,
      dueDate: date,
      recurrence: "",
      document: document ? document.replace(/\D/g, '') : "",
      paymentMethod: "",
      password: password,
      companyUserName: name,
      startWork: startWork,
      endWork: endWork,
      defaultTheme: "light",
      defaultMenu: "closed",
      allowGroup: false,
      allHistoric: false,
      userClosePendingTicket: "enabled",
      allowSeeMessagesInPendingTickets: "enabled",
      showDashboard: "enabled",
      defaultTicketsManagerWidth: 550,
      allowRealTime: "enabled",
      allowConnections: "enabled"
    };

    const user = await CreateCompanyService(companyData);

    try {
      // Buscar configurações de whitelabel
      const appNameSetting = await Setting.findOne({ where: { key: "appName", companyId: 1 } });
      const appLogoSetting = await Setting.findOne({ where: { key: "appLogoLight", companyId: 1 } });
      const primaryColorSetting = await Setting.findOne({ where: { key: "primaryColorLight", companyId: 1 } });

      const systemName = appNameSetting?.value || "Sistema";
      const logoUrl = appLogoSetting?.value || "";
      const primaryColor = primaryColorSetting?.value || "#333333";
      const backendUrl = process.env.BACKEND_URL || process.env.FRONTEND_URL || "";
      const frontendUrl = process.env.FRONTEND_URL || "";
      const loginUrl = `${frontendUrl}/login`;

      // Construir URL absoluta da logo
      let logoFullUrl = "";
      if (logoUrl) {
        if (logoUrl.startsWith('http')) {
          logoFullUrl = logoUrl;
        } else {
          // Remove barra inicial duplicada e monta URL completa usando backend
          const cleanPath = logoUrl.startsWith('/') ? logoUrl : `/${logoUrl}`;
          logoFullUrl = `${backendUrl}${cleanPath}`;
        }
      }

      const logoHtml = logoFullUrl
        ? `<div style="text-align: center; margin-bottom: 24px;">
            <img src="${logoFullUrl}" alt="${systemName}" style="max-width: 200px; max-height: 80px;" />
          </div>`
        : `<div style="text-align: center; margin-bottom: 24px;">
            <h1 style="font-size: 28px; font-weight: bold; color: ${primaryColor}; margin: 0;">${systemName}</h1>
          </div>`;

      const lang = language || "pt";
      const dir = getDirection(lang);
      const tw = (key: string, replacements?: Record<string, string>) => getEmailTranslation(lang, key, replacements);

      const welcomeHtml = `
        <div style="font-family: 'Segoe UI', Arial, sans-serif; max-width: 520px; margin: 0 auto; padding: 0; background: #ffffff;" dir="${dir}">
          <!-- Header com Logo -->
          <div style="padding: 32px 24px 0; text-align: center;">
            ${logoHtml}
          </div>

          <!-- Conteúdo -->
          <div style="padding: 24px 32px;">
            <h2 style="color: #333; font-size: 22px; margin: 0 0 8px;">
              ${tw("welcomeGreeting", { name, systemName })}
            </h2>
            <p style="color: #555; font-size: 15px; line-height: 1.5; margin: 0 0 24px;">
              ${tw("welcomeInstruction")}
            </p>

            <!-- Botão -->
            <div style="text-align: center; margin: 24px 0;">
              <a href="${loginUrl}" style="display: inline-block; background: ${primaryColor}; color: #ffffff; text-decoration: none; padding: 14px 32px; border-radius: 6px; font-size: 16px; font-weight: bold;">
                ${tw("welcomeButton")}
              </a>
            </div>

            <!-- Dados de acesso -->
            <div style="background: #f8f9fa; border-radius: 8px; padding: 20px; margin: 24px 0;">
              <p style="margin: 0 0 8px; font-size: 14px; color: #333; font-weight: bold;">${tw("welcomeAccessTitle")}</p>
              <table style="width: 100%; border-collapse: collapse;">
                <tr>
                  <td style="padding: 6px 0; color: #666; font-size: 14px; width: 120px;">${tw("welcomeCompany")}</td>
                  <td style="padding: 6px 0; color: #333; font-size: 14px; font-weight: bold;">${companyName}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #666; font-size: 14px;">${tw("welcomeEmail")}</td>
                  <td style="padding: 6px 0; color: #333; font-size: 14px; font-weight: bold;">${email}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #666; font-size: 14px;">${tw("welcomePassword")}</td>
                  <td style="padding: 6px 0; color: #333; font-size: 14px; font-weight: bold;">${password}</td>
                </tr>
                <tr>
                  <td style="padding: 6px 0; color: #666; font-size: 14px;">${tw("welcomeExpiry")}</td>
                  <td style="padding: 6px 0; color: #333; font-size: 14px; font-weight: bold;">${dateToClient(date)}</td>
                </tr>
              </table>
            </div>

            <!-- Link alternativo -->
            <p style="color: #333; font-size: 13px; margin: 16px 0 4px;">
              ${tw("welcomeLinkExpiry")}
            </p>
            <p style="margin: 4px 0 24px;">
              <a href="${loginUrl}?email=${encodeURIComponent(email)}" style="color: ${primaryColor}; font-size: 13px; word-break: break-all;">
                ${loginUrl}/?email=${email}
              </a>
            </p>
          </div>

          <!-- Footer -->
          <div style="padding: 16px 32px; border-top: 1px solid #eee; text-align: center;">
            <p style="color: #999; font-size: 11px; margin: 0;">
              ${tw("welcomeFooter", { systemName })}
            </p>
          </div>
        </div>
      `;

      await sendMailWithSmtp(email, tw("welcomeSubject", { systemName }), welcomeHtml);
    } catch (error) {
      logger.warn("[USER] Não consegui enviar o email de cadastro");
    }

    try {
      const company = await ShowCompanyService(1);
      const whatsappCompany = await FindCompaniesWhatsappService(company.id);

      if (
        whatsappCompany.whatsapps[0].status === "CONNECTED" &&
        (phone !== undefined || !isNil(phone) || !isEmpty(phone))
      ) {
        const whatsappId = whatsappCompany.whatsapps[0].id;
        const wbot = getWbot(whatsappId);

        const body = `Olá ${name}, este é uma mensagem sobre o cadastro da ${companyName}!\n\nSegue os dados da sua empresa:\n\nNome: ${companyName}\nEmail: ${email}\nSenha: ${password}\nData Vencimento Trial: ${dateToClient(
          date
        )}`;

        const phoneJid = phone.includes("@") ? phone : `${phone}@s.whatsapp.net`;
        await wbot.sendMessage(phoneJid, { text: body });
      }
    } catch (error) {
      logger.warn("[USER] Não consegui enviar a mensagem de cadastro via WhatsApp");
    }

    return res.status(200).json(user);
  }

  if (companyUser) {
    const user = await CreateUserService({
      email,
      password,
      name,
      profile,
      companyId: companyUser,
      queueIds,
      startWork,
      endWork,
      acceptanceMessage,
      whatsappId,
      whatsappIds,
      allTicket,
      defaultTheme,
      defaultMenu,
      internalExtension,
      allowGroup,
      allHistoric,
      allUserChat,
      userClosePendingTicket,
      showDashboard,
      defaultTicketsManagerWidth,
      allowRealTime,
      allowConnections,
      showContacts,
      showCampaign,
      showFlow,
      // Estes ficavam de fora: o usuário novo nascia com o padrão do banco
      // em vez do que o admin marcou na aba Permissões.
      showSchedules,
      showKanban,
      showInternalChat,
      showOpenAi,
      showIntegrations,
      finalizacaoComValorVendaAtiva,
      timezone,
      language,
      birthDate,
      allowSeeMessagesInPendingTickets,
      showReturnQueueButton,
      showTransferTicketButton,
      notifyPendingTicketWhatsapp,
      whatsappNumber,
      pendingTicketNotificationMessage,
      notifyOpenTicketWhatsapp,
      notifyKanbanTicketWhatsapp,
      notificationMaxCount,
      notificationIntervalMinutes,
      notificationWhatsappId
    });

    const userData = await User.findByPk(user.id);

    await User.createInitialChat(userData);

    const chats = await Chat.findAll({
      include: [
        {
          model: ChatUser,
          where: { userId: user.id }
        }
      ]
    });

    const io = getIO();
    io.of(userCompanyId.toString()).emit(`company-${userCompanyId}-user`, {
      action: "create",
      user
    });

    return res.status(200).json({ user, chats });
  }
};

export const show = async (req: Request, res: Response): Promise<Response> => {
  const { userId } = req.params;
  const { companyId } = req.user;

  const user = await ShowUserService(userId, companyId);

  return res.status(200).json(user);
};

export const showEmail = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { email } = req.params;

  const user = await APIShowEmailUserService(email);

  return res.status(200).json(user);
};

export const update = async (
  req: Request,
  res: Response
): Promise<Response> => {
  // if (req.user.profile !== "admin") {
  //   throw new AppError("ERR_NO_PERMISSION", 403);
  // }

  if (process.env.DEMO === "ON") {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  const { id: requestUserId, companyId, profile: perfilDeQuemPede } = req.user;
  const { userId } = req.params;
  let userData = req.body;

  // PERMISSÕES: quem não é admin só altera o PRÓPRIO cadastro, e só os dados
  // pessoais. Antes, qualquer atendente conseguia, pela API, mudar o próprio
  // perfil para admin, ligar todas as permissões ou editar outro usuário.
  const quemPede = await User.findByPk(requestUserId, { attributes: ["id", "super", "profile"] });
  const ehAdmin = !!quemPede?.super || perfilDeQuemPede === "admin";
  if (!ehAdmin) {
    if (Number(userId) !== Number(requestUserId)) {
      throw new AppError("ERR_NO_PERMISSION", 403);
    }
    const CAMPOS_PESSOAIS = [
      "name", "email", "password", "language", "timezone", "defaultTheme", "defaultMenu",
      "profileImage", "birthDate", "defaultTicketsManagerWidth", "farewellMessage",
      "acceptanceMessage", "notifyPendingTicketWhatsapp", "notifyOpenTicketWhatsapp",
      "notifyKanbanTicketWhatsapp", "whatsappNumber", "pendingTicketNotificationMessage",
      "notificationMaxCount", "notificationIntervalMinutes", "notificationWhatsappId"
    ];
    const limpo: any = { companyId };
    for (const k of CAMPOS_PESSOAIS) if (userData[k] !== undefined) limpo[k] = userData[k];
    userData = limpo;
  } else if (userData.companyId === undefined || userData.companyId === null || userData.companyId === "") {
    // Atualização parcial (ex.: só o idioma) sem companyId: o serviço recusava
    // com "O usuário não pertence à esta empresa".
    userData = { ...userData, companyId };
  } else {
    userData = { ...userData, companyId: Number(userData.companyId) };
  }

  const user = await UpdateUserService({
    userData,
    userId,
    companyId,
    requestUserId: +requestUserId
  });

  const io = getIO();
  io.of(String(companyId)).emit(`company-${companyId}-user`, {
    action: "update",
    user
  });

  return res.status(200).json(user);
};

export const remove = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { userId } = req.params;
  const { companyId, id, profile } = req.user;

  if (profile !== "admin") {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  if (process.env.DEMO === "ON") {
    throw new AppError("ERR_NO_PERMISSION", 403);
  }

  const user = await User.findOne({
    where: { id: userId }
  });

  if (!user) {
    return res.status(404).json({ error: "Usuário não encontrado" });
  }

  if (companyId !== user.companyId) {
    return res
      .status(400)
      .json({ error: "Você não possui permissão para acessar este recurso!" });
  } else {
    await DeleteUserService(userId, companyId);

    const io = getIO();
    io.of(String(companyId)).emit(`company-${companyId}-user`, {
      action: "delete",
      userId
    });

    return res.status(200).json({ message: "User deleted" });
  }
};

export const list = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.query;
  const { companyId: userCompanyId } = req.user;

  const users = await SimpleListService({
    companyId: companyId ? +companyId : userCompanyId
  });

  return res.status(200).json(users);
};

export const mediaUpload = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { userId } = req.params;
  const { companyId } = req.user;
  const files = req.files as Express.Multer.File[];
  const file = head(files);

  if (!file) {
    throw new AppError("Nenhum arquivo foi enviado", 400);
  }

  try {
    let user = await User.findByPk(userId);

    if (!user) {
      throw new AppError("Usuário não encontrado", 404);
    }

    if (user.companyId !== companyId) {
      throw new AppError("Usuário não pertence a esta empresa", 403);
    }

    // Salvar apenas o nome do arquivo (sem caminho)
    user.profileImage = file.filename;
    await user.save();

    // Buscar usuário atualizado com todas as relações
    user = await ShowUserService(userId, companyId);

    // Emitir evento socket para atualizar em tempo real
    const io = getIO();
    io.of(String(companyId)).emit(`company-${companyId}-user`, {
      action: "update",
      user
    });

    return res.status(200).json({
      user,
      message: "Imagem atualizada com sucesso"
    });
  } catch (err: any) {
    console.error("Erro no upload da imagem:", err);
    throw new AppError(err.message || "Erro interno do servidor");
  }
};

export const toggleChangeWidht = async (
  req: Request,
  res: Response
): Promise<Response> => {
  var { userId } = req.params;
  const { defaultTicketsManagerWidth } = req.body;

  const { companyId } = req.user;
  const user = await ToggleChangeWidthService({
    userId,
    defaultTicketsManagerWidth
  });

  const io = getIO();
  io.of(String(companyId)).emit(`company-${companyId}-user`, {
    action: "update",
    user
  });

  return res.status(200).json(user);
};

export const updateOnlineStatus = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { userId } = req.params;
  const { online } = req.body;

  await UpdateUserOnlineStatusService({
    userId: +userId,
    online
  });

  return res.status(200).json({ message: "Status updated" });
};

export const getOnlineUsers = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { companyId } = req.user;

  const users = await GetOnlineUsersService({
    companyId
  });

  return res.status(200).json(users);
};

export const validateCnpj = async (req: Request, res: Response): Promise<Response> => {
  const { cnpj } = req.body;

  if (!cnpj) {
    throw new AppError("CPF ou CNPJ é obrigatório", 400);
  }

  // Limpar o documento (remover formatação)
  const cleanDocument = cnpj.replace(/\D/g, '');

  // Detectar se é CPF ou CNPJ
  const isCpf = cleanDocument.length === 11;
  const isCnpj = cleanDocument.length === 14;

  if (!isCpf && !isCnpj) {
    throw new AppError("CPF deve ter 11 dígitos ou CNPJ deve ter 14 dígitos", 400);
  }

  if (isCpf) {
    // Validação local do CPF
    if (!validateCpf(cleanDocument)) {
      throw new AppError("CPF inválido", 400);
    }

    return res.status(200).json({
      valid: true,
      data: {
        nome: "Pessoa Física",
        cpf: cleanDocument,
        tipo: "cpf"
      }
    });
  }

  // Validação do CNPJ na Receita Federal
  try {
    const response = await axios.get(`https://receitaws.com.br/v1/cnpj/${cleanDocument}`);
    const data = response.data;

    if (data.status === "ERROR") {
      throw new AppError("CNPJ inválido ou não encontrado na Receita Federal", 400);
    }

    return res.status(200).json({
      valid: true,
      data: {
        nome: data.nome,
        cnpj: cleanDocument,
        email: data.email,
        telefone: data.telefone,
        logradouro: data.logradouro,
        numero: data.numero,
        complemento: data.complemento,
        bairro: data.bairro,
        municipio: data.municipio,
        uf: data.uf,
        cep: data.cep,
        situacao: data.situacao,
        tipo: "cnpj"
      }
    });

  } catch (error: any) {
    console.error("Erro ao validar CNPJ:", error);

    if (error.response?.status === 404) {
      throw new AppError("CNPJ não encontrado na Receita Federal", 404);
    }

    throw new AppError("Erro ao validar CNPJ. Tente novamente.", 500);
  }
};

export const testNotification = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { userId } = req.params;
  const { companyId } = req.user;
  const { whatsappNumber } = req.body || {};

  const result = await SendTestNotificationService(
    Number(userId),
    Number(companyId),
    whatsappNumber
  );

  return res.json(result);
};

// Função para validar CPF
const validateCpf = (cpf: string): boolean => {
  // Verifica se todos os dígitos são iguais
  if (/^(\d)\1{10}$/.test(cpf)) return false;

  // Validação do primeiro dígito verificador
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(cpf.charAt(i)) * (10 - i);
  }
  let remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(cpf.charAt(9))) return false;

  // Validação do segundo dígito verificador
  sum = 0;
  for (let i = 0; i < 10; i++) {
    sum += parseInt(cpf.charAt(i)) * (11 - i);
  }
  remainder = (sum * 10) % 11;
  if (remainder === 10 || remainder === 11) remainder = 0;
  if (remainder !== parseInt(cpf.charAt(10))) return false;

  return true;
};

export default {
  index,
  store,
  show,
  showEmail,
  update,
  remove,
  list,
  mediaUpload,
  toggleChangeWidht,
  updateOnlineStatus,
  getOnlineUsers,
  validateCnpj,
  testNotification
};
