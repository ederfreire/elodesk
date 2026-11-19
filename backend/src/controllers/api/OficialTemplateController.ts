import { Request, Response } from "express";
import AppError from "../../errors/AppError";
import Whatsapp from "../../models/Whatsapp";
import Ticket from "../../models/Ticket";
import { Mutex } from "async-mutex";
import CreateOrUpdateContactService from "../../services/ContactServices/CreateOrUpdateContactService";
import FindOrCreateTicketService from "../../services/TicketServices/FindOrCreateTicketService";
import CompaniesSettings from "../../models/CompaniesSettings";
import SendWhatsAppOficialMessage from "../../services/WhatsAppOficial/SendWhatsAppOficialMessage";
import {
  IMetaMessageTemplate,
  IMetaMessageTemplateComponents
} from "../../libs/whatsAppOficial/IWhatsAppOficial.interfaces";
import QuickMessage from "../../models/QuickMessage";
import QuickMessageComponent from "../../models/QuickMessageComponent";
import buildTemplateBodyToSave from "../../helpers/BuildTemplateBodyToSave";
import ShowQueueService from "../../services/QueueService/ShowQueueService";
import User from "../../models/User";
import ShowTicketService from "../../services/TicketServices/ShowTicketService";
import { getIO } from "../../libs/socket";

type Body = {
  number?: string;
  numero?: string;
  whatsappId?: number;
  template?: IMetaMessageTemplate | string;
  templateName?: string;
  language?: string;
  components?: IMetaMessageTemplateComponents[];
  campanha?: string;
  bodyToSave?: string;
  variaveis?: any;
  variables?: any;
  params?: any;
  parameters?: any;
  // Fila de destino. Aceita os três nomes para não obrigar ninguém a decorar
  // qual é: queueId (padrão do resto da API), fila e queue.
  queueId?: number | string;
  fila?: number | string;
  queue?: number | string;
  // Por padrão a fila só é aplicada quando a conversa ainda NÃO tem fila.
  // Com forcarFila=true, move mesmo uma conversa já enfileirada.
  forcarFila?: boolean | string;
  forceQueue?: boolean | string;
  // Atendente de destino. Mesma ideia da fila: três nomes aceitos.
  userId?: number | string;
  atendenteId?: number | string;
  agentId?: number | string;
};

/**
 * POST /api/oficial/send-template
 *
 * Aceita dois formatos:
 *
 * 1) Completo:
 * {
 *   "number": "5511999999999",
 *   "whatsappId": 19, // opcional - se omitido usa o whatsapp do token
 *   "template": {
 *     "name": "captacao",
 *     "language": { "code": "pt_BR" },
 *     "components": []
 *   },
 *   "campanha": "01",           // opcional
 *   "queueId": 4                // opcional - fila de destino
 * }
 *
 * 2) Simplificado (compatível com Oficial.php antigo):
 * ?numero=5511...&template=captacao&campanha=01&fila=4
 * ou body:
 * { "numero": "...", "template": "captacao", "campanha": "01", "fila": 4 }
 *
 * FILA DE DESTINO
 *
 * Este endpoint não tinha NENHUM suporte a fila: o ticket era criado sempre
 * com queueId nulo (FindOrCreateTicketService recebia null na posição da
 * fila). Na prática, o template era enviado e a conversa caía em "Aguardando"
 * sem fila — por isso "enviar para determinada fila" não funcionava: o
 * parâmetro simplesmente não existia e era descartado em silêncio.
 *
 * Agora aceita queueId | fila | queue. A fila é validada contra a empresa do
 * token (não dá para jogar conversa na fila de outra empresa). Por padrão só
 * é aplicada quando a conversa ainda não tem fila; use forcarFila=true para
 * mover uma conversa que já está em outra fila.
 */
export const sendTemplate = async (
  req: Request,
  res: Response
): Promise<Response> => {
  // Permite GET (querystring) e POST (json)
  const src: Body = { ...(req.query as any), ...(req.body || {}) };

  // Token -> Whatsapp
  const authHeader = req.headers.authorization;
  const [, token] = (authHeader || "").split(" ");
  if (!token) throw new AppError("Token ausente.", 401);
  const cleanToken = token.replace(/^["']|["']$/g, "").trim();

  let whatsapp: Whatsapp | null = null;
  if (src.whatsappId) {
    whatsapp = await Whatsapp.findByPk(src.whatsappId);
    if (!whatsapp) throw new AppError(`Whatsapp #${src.whatsappId} não encontrado.`, 404);
    // garante que o token bate com a empresa do whatsapp
    const tokenOwner = await Whatsapp.findOne({ where: { token: cleanToken } });
    if (!tokenOwner || tokenOwner.companyId !== whatsapp.companyId) {
      throw new AppError("Token inválido para a conexão informada.", 401);
    }
  } else {
    whatsapp = await Whatsapp.findOne({ where: { token: cleanToken } });
    if (!whatsapp) throw new AppError("Token inválido.", 401);
  }

  if (whatsapp.channel !== "whatsapp_oficial") {
    throw new AppError(
      `Conexão #${whatsapp.id} não é WhatsApp Oficial (channel=${whatsapp.channel}).`,
      400
    );
  }

  // Número
  const rawNumber = (src.number || src.numero || "").toString().replace(/\D/g, "");
  if (!rawNumber) throw new AppError("Número (number/numero) é obrigatório.", 400);

  // Monta template
  let template: IMetaMessageTemplate;
  if (src.template && typeof src.template === "object") {
    template = src.template as IMetaMessageTemplate;
  } else {
    const name = (typeof src.template === "string" ? src.template : src.templateName) || "";
    if (!name) throw new AppError("Nome do template é obrigatório.", 400);
    template = {
      name,
      language: { code: src.language || "pt_BR" },
      components: src.components || []
    };
  }

  const companyId = whatsapp.companyId;

  // Auto-preenche components do body se ausentes, consultando o template salvo localmente.
  try {
    const hasBody = Array.isArray(template.components)
      && template.components.some(c => String((c as any)?.type || "").toLowerCase() === "body");
    if (!hasBody) {
      const qm = await QuickMessage.findOne({
        where: { shortcode: template.name, companyId },
        include: [{ model: QuickMessageComponent, as: "components" }] as any
      });
      const comps: any[] = (qm as any)?.components || (qm as any)?.QuickMessageComponents || [];
      const bodyComp = comps.find((c: any) => String(c.type || "").toUpperCase() === "BODY");
      const bodyText: string = bodyComp?.text || "";
      const placeholders = (bodyText.match(/{{\s*\d+\s*}}/g) || []);
      const expected = placeholders.length;
      if (expected > 0) {
        const provided =
          src.variaveis ?? src.variables ?? src.params ?? src.parameters ?? [];
        let values: string[] = [];
        if (Array.isArray(provided)) {
          values = provided.map(v => String(v ?? "").trim());
        } else if (provided && typeof provided === "object") {
          values = Object.keys(provided)
            .sort((a, b) => Number(a) - Number(b))
            .map(k => String((provided as any)[k] ?? "").trim());
        } else if (typeof provided === "string" && provided.length > 0) {
          values = provided.split(/[|,;]/).map(v => v.trim());
        }
        while (values.length < expected) values.push("-");
        const parameters = values
          .slice(0, expected)
          .map(text => ({ type: "text", text: text || "-" }));
        template.components = [
          ...(Array.isArray(template.components) ? template.components : []),
          { type: "body", parameters } as any
        ];
      }
    }
  } catch (e: any) {
    console.warn(
      `[OficialTemplateController] não foi possível inferir variáveis do template "${template.name}": ${e?.message}`
    );
  }

  // Cria/acha contato (whatsapp_oficial não precisa validar via Baileys)
  const jid = `${rawNumber}@s.whatsapp.net`;
  const contactData = {
    name: rawNumber,
    number: rawNumber,
    profilePicUrl: "",
    isGroup: false,
    companyId,
    whatsappId: whatsapp.id,
    remoteJid: jid
  };
  const contact = await CreateOrUpdateContactService(contactData);

  const settings = await CompaniesSettings.findOne({ where: { companyId } });

  // ── Fila de destino ────────────────────────────────────────────────────────
  // Validada contra a empresa do token: ShowQueueService busca por
  // { id, companyId }, então uma fila de outra empresa devolve erro em vez de
  // ser aceita silenciosamente.
  const filaInformada = src.queueId ?? src.fila ?? src.queue;
  let queueIdDestino: number | null = null;

  if (filaInformada !== undefined && filaInformada !== null && String(filaInformada).trim() !== "") {
    const numeroDaFila = Number(filaInformada);
    if (!Number.isInteger(numeroDaFila) || numeroDaFila <= 0) {
      throw new AppError(
        `Fila inválida: "${filaInformada}". Informe o ID numérico da fila (queueId, fila ou queue).`,
        400
      );
    }
    // ShowQueueService lança AppError quando a fila não existe na empresa.
    const fila = await ShowQueueService(numeroDaFila, companyId);
    queueIdDestino = fila.id;
  }

  const forcarFila =
    String(src.forcarFila ?? src.forceQueue ?? "").toLowerCase() === "true" ||
    src.forcarFila === true ||
    src.forceQueue === true;

  // ── Atendente de destino (opcional) ────────────────────────────────────────
  // Também validado contra a empresa do token. Informando o atendente, o
  // atendimento já nasce reservado para ele em vez de cair solto na fila.
  const atendenteInformado = src.userId ?? src.atendenteId ?? src.agentId;
  let userIdDestino: number | null = null;

  if (atendenteInformado !== undefined && atendenteInformado !== null && String(atendenteInformado).trim() !== "") {
    const numeroDoUsuario = Number(atendenteInformado);
    if (!Number.isInteger(numeroDoUsuario) || numeroDoUsuario <= 0) {
      throw new AppError(
        `Atendente inválido: "${atendenteInformado}". Informe o ID numérico do usuário (userId, atendenteId ou agentId).`,
        400
      );
    }
    const atendente = await User.findOne({ where: { id: numeroDoUsuario, companyId } });
    if (!atendente) {
      throw new AppError(`Usuário #${numeroDoUsuario} não encontrado nesta empresa.`, 404);
    }
    userIdDestino = atendente.id;
  }

  // Cria/acha ticket
  const mutex = new Mutex();
  let ticket = await mutex.runExclusive(async () => {
    return FindOrCreateTicketService(
      contact,
      whatsapp,
      0,
      companyId,
      queueIdDestino,
      userIdDestino,
      null,
      whatsapp.channel,
      null,
      false,
      settings,
      false,
      false
    );
  });

  // FindOrCreateTicketService pode devolver uma conversa que JÁ existia — nesse
  // caso a fila passada acima não é aplicada. Ajustamos aqui.
  let avisoFila: string | null = null;
  if (queueIdDestino) {
    const filaAtual = ticket.queueId ? Number(ticket.queueId) : null;

    if (filaAtual === queueIdDestino) {
      // já está onde deveria
    } else if (filaAtual === null || forcarFila) {
      await ticket.update({ queueId: queueIdDestino });
      await ticket.reload();
      if (filaAtual !== null) {
        avisoFila = `Conversa movida da fila ${filaAtual} para a fila ${queueIdDestino} (forcarFila=true).`;
      }
    } else {
      // Não muda de fila por conta própria: a conversa já está em andamento em
      // outro lugar e mover sem pedir bagunçaria o atendimento de quem está
      // com ela. Quem quiser mover manda forcarFila=true.
      avisoFila =
        `A conversa já estava na fila ${filaAtual} e foi mantida lá. ` +
        `Envie "forcarFila": true se quiser movê-la para a fila ${queueIdDestino}.`;
    }
  }

  // Atendente informado: abre o atendimento já reservado, em vez de deixá-lo
  // em "pending" para qualquer um pegar. Emite o evento de socket porque um
  // update direto no model não avisa as telas abertas.
  if (userIdDestino && Number(ticket.userId) === userIdDestino && ticket.status === "pending") {
    await ticket.update({ status: "open" });
    ticket = await ShowTicketService(ticket.id, companyId);
    try {
      getIO().of(String(companyId)).emit(`company-${companyId}-ticket`, {
        action: "update",
        ticket
      });
    } catch (ioErr: any) {
      console.warn(`[OficialTemplateController] falha ao emitir socket de reserva: ${ioErr?.message}`);
    }
  }

  // Garante whatsapp carregado no ticket (necessário p/ SendWhatsAppOficialMessage)
  if (!ticket.whatsapp) {
    (ticket as any).whatsapp = whatsapp;
  }

  // bodyToSave: o que aparece no chat.
  // Monta no formato esperado por frontend/src/components/MessagesList/templates.js:
  //   "<URL imagem opcional>\n<texto renderizado>||||<JSON botões>"
  let bodyToSave = src.bodyToSave || "";
  try {
    const qm = await QuickMessage.findOne({
      where: { shortcode: template.name, companyId },
      include: [{ model: QuickMessageComponent, as: "components" }] as any
    });
    const tplComponents: any[] =
      (qm as any)?.components || (qm as any)?.QuickMessageComponents || [];
    const rendered = buildTemplateBodyToSave(
      tplComponents,
      (template as any).components,
      bodyToSave
    );
    if (rendered && rendered !== "||||[]") {
      bodyToSave = rendered;
    }
  } catch (e: any) {
    console.warn(
      `[OficialTemplateController] falha ao montar bodyToSave: ${e?.message}`
    );
  }
  if (!bodyToSave) {
    bodyToSave =
      `📋 Template: ${template.name}${src.campanha ? ` | Campanha: ${src.campanha}` : ""}`;
  }

  try {
    const sent = await SendWhatsAppOficialMessage({
      body: bodyToSave,
      ticket,
      type: "template",
      template,
      bodyToSave
    });

    return res.status(200).json({
      status: "SUCCESS",
      ticketId: ticket.id,
      contactId: contact.id,
      whatsappId: whatsapp.id,
      // Devolve a fila REAL em que a conversa ficou, não a que foi pedida.
      // Sem isso, quem integra não tem como saber se o pedido foi atendido.
      queueId: ticket.queueId ?? null,
      userId: ticket.userId ?? null,
      // "status" já é usado acima para o resultado da chamada ("SUCCESS").
      // O status do ATENDIMENTO (pending/open) vai em campo próprio — usar o
      // mesmo nome para as duas coisas era o erro TS1117 e, pior, sobrescrevia
      // silenciosamente o resultado que o integrador espera ler.
      ticketStatus: ticket.status,
      ...(avisoFila ? { aviso_fila: avisoFila } : {}),
      campanha: src.campanha || null,
      meta: sent
    });
  } catch (err: any) {
    // Devolve o motivo REAL da Meta para facilitar diagnóstico
    const detalhe = err?.message || "Falha desconhecida";
    console.error(`[OficialTemplateController] Falha envio template`, {
      template: template.name,
      numero: rawNumber,
      whatsappId: whatsapp.id,
      detalhe
    });
    return res.status(400).json({
      status: "ERROR",
      whatsappId: whatsapp.id,
      template: template.name,
      numero: rawNumber,
      detalhe_meta: detalhe,
      dica:
        "Verifique: 1) nome do template exato e aprovado, 2) idioma (pt_BR x pt), " +
        "3) variáveis obrigatórias ({{1}}, {{2}}...) sendo enviadas em 'components', " +
        "4) número com DDI sem '+', 5) token da Meta válido na conexão."
    });
  }
};

/**
 * GET /api/oficial/templates
 *
 * Lista templates oficiais disponíveis para a empresa do token informado.
 * Header: Authorization: Bearer <EMPRESA_TOKEN>
 */
export const listTemplates = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const authHeader = req.headers.authorization;
  const [, token] = (authHeader || "").split(" ");
  if (!token) throw new AppError("Token ausente.", 401);
  const cleanToken = token.replace(/^["']|["']$/g, "").trim();

  const whatsapp = await Whatsapp.findOne({ where: { token: cleanToken } });
  if (!whatsapp) throw new AppError("Token inválido.", 401);

  const companyId = whatsapp.companyId;

  const where: any = { companyId, isOficial: true };
  const templates = await QuickMessage.findAll({
    where,
    include: [{ model: QuickMessageComponent, as: "components" }] as any,
    order: [["shortcode", "ASC"]]
  });

  const data = templates.map((t: any) => {
    const comps: any[] = t.components || t.QuickMessageComponents || [];
    const bodyComp = comps.find(
      (c: any) => String(c.type || "").toUpperCase() === "BODY"
    );
    const bodyText: string = bodyComp?.text || t.message || "";
    const placeholders = bodyText.match(/{{\s*\d+\s*}}/g) || [];
    return {
      id: t.id,
      name: t.shortcode,
      language: t.language,
      status: t.status,
      category: t.category,
      whatsappId: t.whatsappId,
      body: bodyText,
      variaveis: placeholders.length,
      components: comps.map((c: any) => ({
        type: c.type,
        text: c.text,
        format: c.format
      }))
    };
  });

  return res.status(200).json({
    status: "OK",
    whatsappId: whatsapp.id,
    total: data.length,
    templates: data
  });
};