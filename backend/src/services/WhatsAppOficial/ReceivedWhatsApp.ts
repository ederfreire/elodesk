import path from "path";
import Whatsapp from "../../models/Whatsapp";
import logger from "../../utils/logger";
import Contact from "../../models/Contact";
import WhatsappLidMap from "../../models/WhatsapplidMap";
import { withLock } from "../../utils/redisLock";
import { Op } from "sequelize";
import moment from "moment";
import { chmodSync, existsSync, mkdirSync, writeFileSync } from "fs";
import FindOrCreateTicketService from "../TicketServices/FindOrCreateTicketService";
import CompaniesSettings from "../../models/CompaniesSettings";
import FindOrCreateATicketTrakingService from "../TicketServices/FindOrCreateATicketTrakingService";
import { getIO } from "../../libs/socket";
import Message from "../../models/Message";
import verifyMessageOficial from "./VerifyMessageOficial";
import verifyQueueOficial from "./VerifyQueue";
import ShowWhatsAppService from "../WhatsappService/ShowWhatsAppService";
import Queue from "../../models/Queue";
import Ticket from "../../models/Ticket";
import ShowQueueIntegrationService from "../QueueIntegrationServices/ShowQueueIntegrationService";
import { handleMessageIntegration } from "../WbotServices/wbotMessageListener";
import { verifyRating as verifyRatingCompartilhado } from "../WbotServices/wbotMessageListener";
import {
    flowbuilderIntegration,
    executeFlowBuilderKeywordTrigger
} from "../WbotServices/wbotMessageListener";
import HandleFlowExitKeyword from "../FlowBuilderService/HandleFlowExitKeyword";
import {
    resolveTransferTarget,
    applyAiTransfer,
    detectAiTransferIntent,
    getSafeAiTransferFallbackQueueId
} from "../WbotServices/wbotMessageListener";
import ShowContactService from "../ContactServices/ShowContactService";
import ShowPromptService from "../PromptServices/ShowPromptService";
import OpenAI from "openai";
import { WebhookModel } from "../../models/Webhook";
import { FlowBuilderModel } from "../../models/FlowBuilder";
import { FlowCampaignModel } from "../../models/FlowCampaign";
import ContactTag from "../../models/ContactTag";
import { ActionsWebhookService } from "../WebhookService/ActionsWebhookService";
import { resolveFlowEntryNodeId } from "../WebhookService/resolveFlowEntryNodeId";

import cacheLayer from "../../libs/cache";
import { isNil } from "lodash";
import UpdateTicketService from "../TicketServices/UpdateTicketService";
import VerifyCurrentSchedule from "../CompanyService/VerifyCurrentSchedule";
import SendWhatsAppOficialMessage from "./SendWhatsAppOficialMessage";
import typebotListenerOficial from "../TypebotServices/typebotListenerOficial";
import UserRating from "../../models/UserRating";
import CreateLogTicketService from "../TicketServices/CreateLogTicketService";
import { upsertLead } from "../LeadServices/UpsertLeadService";
import { obterClienteIA, janelaDeHistorico, executarComControle } from "../../helpers/ControleDeIA";

const stripInvisibleText = (value?: string | null): string =>
    (value || "").replace(/[\u200B-\u200F\uFEFF]/g, "").trim();

const hasVisibleText = (value?: string | null): boolean =>
    stripInvisibleText(value).length > 0;

const aiTransferRegex = /A[çc][ãa]o:\s*Transferir(?:\s+para\s+(?:o\s+setor\s+de\s+)?(.+?))?(?:\.|!|\n|$)/i;
const aiSameQueueFallbackMessage = "Você já está na fila correta. Como posso te ajudar?";


const mimeToExtension: { [key: string]: string } = {
    'audio/aac': 'aac',
    'audio/mp4': 'm4a',
    'audio/mpeg': 'mp3',
    'audio/ogg': 'oga',
    'audio/opus': 'opus',
    'audio/wav': 'wav',
    'audio/webm': 'weba',
    'audio/3gpp': '3gp',
    'audio/3gpp2': '3g2',
    'audio/x-wav': 'wav',
    'audio/midi': 'midi',
    'application/x-abiword': 'abw',
    'application/octet-stream': 'arc',
    'video/x-msvideo': 'avi',
    'application/vnd.amazon.ebook': 'azw',
    'application/x-bzip': 'bz',
    'application/x-bzip2': 'bz2',
    'application/x-csh': 'csh',
    'text/css': 'css',
    'text/csv': 'csv',
    'text/plain': 'txt',
    'application/msword': 'doc',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
    'application/vnd.ms-fontobject': 'eot',
    'application/epub+zip': 'epub',
    'image/gif': 'gif',
    'text/html': 'html',
    'image/x-icon': 'ico',
    'text/calendar': 'ics',
    'image/jpeg': 'jpg',
    'application/json': 'json',
    'video/mpeg': 'mpeg',
    'application/vnd.apple.installer+xml': 'mpkg',
    'video/ogg': 'ogv',
    'application/ogg': 'ogx',
    'font/otf': 'otf',
    'image/png': 'png',
    'application/pdf': 'pdf',
    'application/vnd.ms-powerpoint': 'ppt',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation': 'pptx',
    'application/x-rar-compressed': 'rar',
    'application/rtf': 'rtf',
    'application/x-sh': 'sh',
    'image/svg+xml': 'svg',
    'application/x-shockwave-flash': 'swf',
    'image/tiff': 'tiff',
    'application/typescript': 'ts',
    'font/ttf': 'ttf',
    'application/vnd.visio': 'vsd',
    'application/xhtml+xml': 'xhtml',
    'application/xml': 'xml',
    'application/zip': 'zip',
    'application/x-7z-compressed': '7z',
    'application/vnd.ms-excel': 'xls',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
    'application/x-msdownload': 'exe',
    'application/x-executable': 'exe',
    'font/woff': 'woff',
    'font/woff2': 'woff2',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
    'video/webm': 'webm',
    'video/3gpp': '3gp',
    'video/3gpp2': '3g2',
};

export interface IReceivedWhatsppOficial {
    token: string;
    fromNumber: string;
    nameContact: string;
    companyId: number;
    message: IMessageReceived;
}

export interface IReceivedReadWhatsppOficialRead {
    messageId: string;
    companyId: number;
    token: string;
}

export interface IMessageReceived {
    // 'button' = clique em botão de quick reply de TEMPLATE (a Meta usa um
    // tipo diferente de 'interactive'). Sem ele aqui, o evento chegava com um
    // tipo que esta interface não conhecia.
    type: 'text' | 'image' | 'audio' | 'document' | 'video' | 'location' | 'contacts' | 'sticker' | 'order' | 'reaction' | 'interactive' | 'button';
    timestamp: number;
    idMessage: string;
    idFile?: string;
    text?: string;
    interactive?: {
        type?: string;
        button_reply?: {
            id?: string;
            title?: string;
        };
        list_reply?: {
            id?: string;
            title?: string;
            description?: string;
        };
    };
    file?: string; // Base64 do arquivo (apenas para imagens, áudios, stickers)
    mimeType?: string;
    quoteMessageId?: string;
    fileUrl?: string; // ✅ URL da Meta para download direto (vídeos e documentos)
    fileSize?: number; // ✅ Tamanho do arquivo em bytes
    // ✅ Click-to-WhatsApp Ad referral
    referral?: {
        ctwa_clid?: string;
        source_id?: string;
        source_type?: string;
        source_url?: string;
        headline?: string;
        body?: string;
        media_type?: string;
        image_url?: string;
        video_url?: string;
        thumbnail_url?: string;
    };
}

const getInteractiveSelectionLabel = (message: IMessageReceived): string => {
    const reply = message?.interactive?.button_reply || message?.interactive?.list_reply;
    return (reply?.title || message?.text || reply?.id || '').trim();
};

const getInteractiveSelectionId = (message: IMessageReceived): string => {
    const reply = message?.interactive?.button_reply || message?.interactive?.list_reply;
    return (reply?.id || message?.text || reply?.title || '').trim();
};

/**
 * ✅ NOVA FUNÇÃO: Baixa arquivo da URL da Meta e retorna o base64
 */
async function downloadFileFromMetaUrl(
    fileUrl: string, 
    whatsappToken: string,
    fileSize?: number
): Promise<string> {
    try {
        const axios = require('axios');
        
        logger.info(`[META DOWNLOAD] Iniciando download - Tamanho: ${fileSize ? (fileSize / 1024 / 1024).toFixed(2) : '?'} MB`);
        
        const response = await axios.get(fileUrl, {
            headers: {
                'Authorization': `Bearer ${whatsappToken}`,
                'User-Agent': 'curl/7.64.1'
            },
            responseType: 'arraybuffer',
            timeout: 60000 // 60 segundos de timeout
        });

        if (response.status !== 200) {
            throw new Error(`Falha ao baixar arquivo da Meta: HTTP ${response.status}`);
        }

        const base64 = Buffer.from(response.data).toString('base64');
        
        logger.info(`[META DOWNLOAD] ✅ Download concluído - Base64 gerado: ${(base64.length / 1024 / 1024).toFixed(2)} MB`);
        
        return base64;
    } catch (error: any) {
        logger.error(`[META DOWNLOAD] ❌ Erro ao baixar arquivo da Meta: ${error.message}`);
        throw new Error(`Erro ao baixar arquivo da Meta: ${error.message}`);
    }
}

export async function generateVCard(contact: any): Promise<string> {
    const firstName = contact?.name?.first_name || contact?.name?.formatted_name?.split(' ')[0];
    const lastName = String(contact?.name?.formatted_name).replace(firstName, '')
    const formattedName = contact?.name?.formatted_name || '';
    const phoneEntries = contact?.phones?.map((phone: any) => {
        const phoneNumber = phone?.phone || '';
        const waId = phone?.wa_id || '';
        const phoneType = phone?.type || 'CELL';
        return `TEL;type=${phoneType};waid=${waId}:+${phoneNumber}\n`;
    });

    const vcard = `BEGIN:VCARD\n`
        + `VERSION:3.0\n`
        + `N:${lastName};${firstName};;;\n`
        + `FN:${formattedName}\n`
        + `${phoneEntries}`
        + `END:VCARD`;
    return vcard;
}

/**
 * Verifica se o ticket está em estado de avaliação pendente.
 *
 * ISTO ERA UMA CÓPIA, E A CÓPIA FICOU PARA TRÁS.
 *
 * Existiam DUAS implementações de verifyRating: esta e a de
 * WbotServices/wbotMessageListener.ts. Baileys, WhatsApp Plus, Facebook e
 * Telegram usam a de lá; só a API Oficial usava esta.
 *
 * Quando a de lá foi corrigida (a exigência de `userId !== null` impedia
 * avaliar atendimento resolvido só pelo bot), esta aqui não foi junto. O
 * resultado na API Oficial era o defeito relatado: o cliente respondia a nota,
 * esta função devolvia false, o bloco que consome a avaliação era pulado e a
 * mensagem seguia adiante como se fosse conversa nova — REABRINDO o ticket.
 *
 * Agora aponta para a implementação única. Os dois canais não podem mais
 * divergir.
 *
 * Feito com import + const (e não `export { x } from "..."`) de propósito: o
 * re-export puro NÃO cria um nome local, e o uso interno mais abaixo neste
 * mesmo arquivo deixaria de compilar.
 */
export const verifyRating = verifyRatingCompartilhado;

/**
 * Processa a avaliação do atendimento (NPS)
 */
export const handleRating = async (
    rate: number,
    ticket: Ticket,
    ticketTraking: any
) => {
    const io = getIO();
    const companyId = ticket.companyId;

    const { complationMessage } = await ShowWhatsAppService(
        ticket.whatsappId,
        companyId
    );

    let finalRate = rate;

    if (rate < 0) {
        finalRate = 0;
    }
    if (rate > 10) {
        finalRate = 10;
    }

    await UserRating.create({
        ticketId: ticketTraking.ticketId,
        companyId: ticketTraking.companyId,
        userId: ticketTraking.userId,
        rate: finalRate
    });

    if (
        !isNil(complationMessage) &&
        complationMessage !== "" &&
        !ticket.isGroup
    ) {
        const body = complationMessage
            .replace("{{nome}}", ticket.contact.name || "")
            .replace("{{ticket}}", ticket.id.toString());

        await SendWhatsAppOficialMessage({
            body: body,
            ticket: ticket,
            quotedMsg: null,
            type: 'text',
            media: null,
            vCard: null
        });
    }

    await ticket.update({
        isBot: false,
        status: "closed",
        amountUsedBotQueuesNPS: 0
    });

    // Loga fim de atendimento
    await CreateLogTicketService({
        userId: ticket.userId,
        queueId: ticket.queueId,
        ticketId: ticket.id,
        type: "closed"
    });

    io.of(String(companyId))
        .emit(`company-${companyId}-ticket`, {
            action: "delete",
            ticket,
            ticketId: ticket.id
        });

    io.of(String(companyId))
        .emit(`company-${companyId}-ticket`, {
            action: "update",
            ticket,
            ticketId: ticket.id
        });
};

// ✅ IMPORTAÇÃO DO CHATBOT LISTENER OFICIAL
import { sayChatbotOficial } from "./ChatBotListenerOficial";
import { nomeDeContatoInvalido } from "../../helpers/NomeDeContato";

const processAiAgentOficial = async (
    ticket: Ticket,
    contact: Contact,
    companyId: number,
    userText: string,
    options?: { isInitialGreeting?: boolean }
): Promise<boolean> => {
    if (ticket.imported || ticket.isGroup || ticket.userId || isNil(ticket.promptId)) {
        return false;
    }

    try {
        const promptRecord = await ShowPromptService({ promptId: ticket.promptId, companyId });
        if (!promptRecord) return false;

        const openai = obterClienteIA(promptRecord.apiKey);
        // DESC + reverse: ver comentário longo em OpenAiService.ts.
        // `ASC + limit` devolvia as mensagens mais ANTIGAS do atendimento.
        const messages = (await Message.findAll({
            where: { ticketId: ticket.id },
            order: [["createdAt", "DESC"]],
            limit: janelaDeHistorico(promptRecord.maxMessages)
        })).reverse();

        const freshContact = await ShowContactService(ticket.contactId, companyId);
        const contactName = freshContact.name || "Amigo(a)";
        const companyQueues = await Queue.findAll({ where: { companyId }, attributes: ["id", "name"] });
        const queueNames = companyQueues.map(q => q.name).join(", ");

        const promptSystem = `REGRA DE USO DO NOME: O nome do cliente é "${contactName}". Use o nome APENAS na primeira saudação da conversa. Nas mensagens seguintes, NÃO repita o nome — converse de forma natural e humanizada, como uma pessoa real. Só volte a citar o nome em momentos pontuais (encerramento, confirmação importante). NUNCA comece toda mensagem com "Olá, [nome]" — soa robótico.\nSua resposta deve usar no máximo ${promptRecord.maxTokens} tokens e cuide para não truncar o final.\nQuando a resposta requer uma transferência para atendimento humano, comece sua resposta com 'Ação: Transferir para [nome do setor]'.\nOs setores disponíveis são: ${queueNames}.\nSe o cliente não especificar o setor, use 'Ação: Transferir para o setor de atendimento' para transferir para o setor padrão.\n${promptRecord.prompt}\n`;

        const messagesOpenAi: any[] = [{ role: "system", content: promptSystem }];
        if (!options?.isInitialGreeting) {
            for (let i = 0; i < Math.min(promptRecord.maxMessages, messages.length); i++) {
                const msg = messages[i];
                if ((msg.mediaType === "conversation" || msg.mediaType === "extendedTextMessage") && hasVisibleText(msg.body)) {
                    messagesOpenAi.push({
                        role: msg.fromMe ? "assistant" : "user",
                        content: stripInvisibleText(msg.body)
                    });
                }
            }
            messagesOpenAi.push({ role: "user", content: stripInvisibleText(userText) || "Olá" });
        } else {
            // Primeira invocação logo após seleção do menu: pedir uma saudação,
            // sem tratar a palavra do menu como pedido de transferência.
            messagesOpenAi.push({
                role: "user",
                content: `Apresente-se brevemente para ${contactName}, dê as boas-vindas e pergunte como pode ajudar. NÃO inicie sua resposta com 'Ação: Transferir'.`
            });
        }

        const chat = await openai.chat.completions.create({
            model: ticket.aiModel || promptRecord.aiModel || "gpt-4.1-mini",
            messages: messagesOpenAi,
            max_tokens: promptRecord.maxTokens,
            temperature: promptRecord.temperature
        });

        let response = chat.choices[0].message?.content || "";
        const transferMatch = response ? response.match(aiTransferRegex) : null;
        // Em saudação inicial, NÃO transferir mesmo se a IA pedir
        const aiSays = !options?.isInitialGreeting && hasVisibleText(response) && (transferMatch || detectAiTransferIntent(response));
        const userAsks = !options?.isInitialGreeting && detectAiTransferIntent(userText || "");

        if (aiSays || userAsks) {
            const requested = transferMatch?.[1]?.trim() || "";
            const combined = `${requested} ${userText || ""} ${response || ""}`;
            const { queue: tQueue, user: tUser } = await resolveTransferTarget(
                ticket.companyId,
                combined,
                getSafeAiTransferFallbackQueueId(promptRecord.queueId, ticket.queueId)
            );

            if (tQueue) {
                const isSameQueueTransfer = Number(tQueue.id) === Number(ticket.queueId) && (!tUser?.id || Number(tUser.id) === Number(ticket.userId));
                if (response && transferMatch) response = response.replace(aiTransferRegex, "").trim();

                const transferred = isSameQueueTransfer ? false : await applyAiTransfer(ticket, freshContact, tQueue, tUser);
                const responseBody = stripInvisibleText(response) || (transferred ? "" : aiSameQueueFallbackMessage);

                if (hasVisibleText(responseBody)) {
                    await SendWhatsAppOficialMessage({ body: `\u200e ${responseBody}`, ticket, type: null } as any);
                }

                if (transferred || isSameQueueTransfer) return true;
            }
            logger.warn(`[AI AGENT OFICIAL] Transferência solicitada sem fila válida - ticket ${ticket.id}`);
        }

        if (hasVisibleText(response)) {
            await SendWhatsAppOficialMessage({ body: `\u200e ${stripInvisibleText(response)}`, ticket, type: null } as any);
            return true;
        }

        logger.warn(`[AI AGENT OFICIAL] Resposta vazia ignorada - ticket ${ticket.id}`);
        return false;
    } catch (error) {
        logger.error(`[AI AGENT OFICIAL] Erro ao processar agente de IA para ticket ${ticket.id}:`, error);
        return false;
    }
};

export class ReceibedWhatsAppService {

    constructor() { }

    async getMessage(data: IReceivedWhatsppOficial) {
        try {
            const { message, fromNumber, token } = data;
            let { nameContact } = data;

            // O nome que vem da Meta nem sempre é nome.
            //
            // O teste anterior era /^\d{10,}$/ — só pegava dígito puro. Passava
            // batido o caso mais comum hoje: NÚMERO MASCARADO, "+34•••••31",
            // que o WhatsApp envia quando o remetente está com privacidade do
            // número ligada. Esse texto era gravado como nome do contato e a
            // pessoa ficava impossível de identificar na lista.
            if (nomeDeContatoInvalido(nameContact)) {
                nameContact = fromNumber;
                logger.info(`[OFICIAL-NOME] nameContact inválido (${data.nameContact}), usando fromNumber como nome temporário: ${fromNumber}`);
            }


            // ✅ DEDUPLICAÇÃO: Verificar se a mensagem já foi processada (Meta pode enviar webhooks duplicados)
            const existingMessage = await Message.findOne({
                where: { wid: message.idMessage }
            });

            if (existingMessage) {
                logger.info(`[DEDUP] Mensagem ${message.idMessage} já existe, ignorando webhook duplicado`);
                return;
            }

            const conexao = await Whatsapp.findOne({ where: { token } });

            if (!conexao) {
                logger.error('getMessage - Nenhum whatsApp encontrado para token: ' + token);
                return;
            }

            const { companyId } = conexao;

            const whatsapp = await ShowWhatsAppService(conexao.id, companyId);

            // ✅ Detectar se fromNumber é um LID (identificador interno do WhatsApp)
            // LIDs reais têm 15+ dígitos. Números de telefone internacionais têm no máximo 15 dígitos
            // mas números com DDI (ex: 55 + DDD + número) chegam no máximo a 13-14 dígitos.
            // LIDs do WhatsApp são identificadores numéricos muito longos (16+ dígitos normalmente).
            // Usar threshold de 15 para evitar falsos positivos com números reais de 14 dígitos.
            const isLidFormat = fromNumber.length >= 15 && /^\d+$/.test(fromNumber);

            // ── RESOLUÇÃO DO CONTATO ────────────────────────────────────────
            //
            // Duas mensagens do mesmo cliente chegando quase juntas (o caso
            // clássico: cliente clica no botão do template e já manda um texto)
            // eram processadas em paralelo. As duas não encontravam contato, as
            // duas criavam — e a pessoa aparecia duplicada, com dois
            // atendimentos. Por isso todo o bloco roda dentro de um lock
            // distribuído por empresa+remetente.
            //
            // A ordem das buscas importa e vai da pista mais forte para a mais
            // fraca. Trocar a ordem reintroduz a duplicação:
            //
            //   1. mapeamento LID já conhecido (WhatsappLidMap)
            //   2. campo lid direto no contato
            //   3. número exato
            //   4. context.id — a mensagem responde algo que NÓS enviamos, e o
            //      contato dessa mensagem original é a resposta certa. Resolve
            //      tanto LID desconhecido quanto número em formato diferente.
            //   5. sufixo de dígitos — cobre número salvo sem DDI
            //   6. só então cria um contato novo
            const quoteMessageIdParaResolverContato = message.quoteMessageId;

            const contact: Contact = await withLock(
                `contact:lock:oficial:${companyId}:${fromNumber}`,
                async () => {
                    let found: Contact | null = null;

                    if (isLidFormat) {
                        const mapping = await WhatsappLidMap.findOne({
                            where: { companyId, lid: fromNumber },
                            include: [{ model: Contact, as: "contact" }]
                        });
                        if ((mapping as any)?.contact) {
                            found = (mapping as any).contact;
                            logger.info(`[OFICIAL-LID] Contato ${found.id} encontrado pelo mapeamento de LID ${fromNumber}`);
                        }

                        if (!found) {
                            found = await Contact.findOne({ where: { lid: fromNumber, companyId } });
                        }
                    }

                    if (!found) {
                        found = await Contact.findOne({ where: { number: fromNumber, companyId } });
                    }

                    if (!found && quoteMessageIdParaResolverContato) {
                        // A Meta manda em context.id o id da NOSSA mensagem que
                        // o cliente respondeu. Como ela foi gravada com o
                        // contato certo, isso reencontra a pessoa mesmo quando
                        // o remetente chega com outro identificador.
                        const originalMessage = await Message.findOne({
                            where: {
                                wid: quoteMessageIdParaResolverContato,
                                companyId,
                                fromMe: true
                            },
                            include: [{ model: Contact, as: "contact" }]
                        });
                        if ((originalMessage as any)?.contact) {
                            found = (originalMessage as any).contact;
                            logger.info(`[OFICIAL-LID] Contato ${found.id} recuperado pela mensagem citada ${quoteMessageIdParaResolverContato}`);
                        }
                    }

                    if (!found && !isLidFormat && fromNumber && fromNumber.length >= 8) {
                        // Número salvo sem DDI (ex.: "11915711990" no cadastro
                        // contra "5511915711990" que a Meta envia). Compara pelo
                        // fim do número, que é a parte estável.
                        const last8 = fromNumber.slice(-8);
                        const last9 = fromNumber.slice(-9);
                        const partialMatches = await Contact.findAll({
                            where: {
                                companyId,
                                isGroup: false,
                                [Op.or]: [
                                    { number: { [Op.like]: `%${last9}` } },
                                    { number: { [Op.like]: `%${last8}` } }
                                ]
                            }
                        });
                        if (partialMatches.length === 1) {
                            found = partialMatches[0];
                        } else if (partialMatches.length > 1) {
                            // Com mais de um candidato, só aceita o que tem cara
                            // de número real — nunca "escolhe qualquer um".
                            const realContact = partialMatches.find(
                                c => c.number && c.number.length >= 10 && c.number.length <= 13
                            );
                            if (realContact) found = realContact;
                        }
                        if (found && found.number !== fromNumber) {
                            await found.update({ number: fromNumber });
                            logger.info(`[OFICIAL-LID] Número do contato ${found.id} normalizado para ${fromNumber}`);
                        }
                    }

                    if (!found) {
                        if (isLidFormat) {
                            found = await Contact.create({
                                name: nameContact,
                                number: fromNumber,
                                lid: fromNumber,
                                companyId,
                                whatsappId: whatsapp.id
                            });
                            logger.info(`[OFICIAL-LID] Novo contato criado com LID como número temporário: id=${found.id}, lid=${fromNumber}`);
                        } else {
                            found = await Contact.create({
                                name: nameContact,
                                number: fromNumber,
                                companyId,
                                whatsappId: whatsapp.id
                            });
                        }
                    } else if (isLidFormat && !found.lid) {
                        await found.update({ lid: fromNumber });
                        logger.info(`[OFICIAL-LID] LID atualizado no contato existente: id=${found.id}, lid=${fromNumber}`);
                    }

                    if (isLidFormat) {
                        // Grava o vínculo para a próxima mensagem cair no passo 1.
                        await WhatsappLidMap.findOrCreate({
                            where: { companyId, lid: fromNumber, contactId: found.id },
                            defaults: { companyId, lid: fromNumber, contactId: found.id } as any
                        });
                    }

                    return found;
                },
                { ttlSeconds: 15, maxRetries: 8, retryDelayMs: 300 }
            );

            // O NOME DO CADASTRO NÃO É MAIS SOBRESCRITO.
            //
            // Antes, cada mensagem recebida gravava por cima do nome do
            // contato o nome do perfil enviado pela Meta. Quem tinha editado o
            // cadastro — por exemplo "Rodrigo Lima - EMPRESA TESTE" — perdia a
            // edição assim que o cliente respondia, voltando para "Rodrigo
            // Lima". A única proteção existente era recusar nome puramente
            // numérico (LID disfarçado); nada protegia o nome escrito por uma
            // pessoa.
            //
            // Os demais canais nunca fizeram isso: o CreateOrUpdateContactService
            // define o nome APENAS na criação do contato e, em contato já
            // existente, atualiza só foto e situação. Este trecho era exclusivo
            // da API Oficial, e agora segue a mesma regra.
            //
            // Consequência aceita: se o cliente trocar o nome no perfil do
            // WhatsApp, o cadastro não acompanha — exatamente como já acontece
            // no Baileys e no WhatsApp Plus. O nome continua sendo definido na
            // criação do contato e pela edição manual na tela.

            let fileName;

            const { file, mimeType, idFile, type, quoteMessageId, fileUrl, fileSize } = message;

            // ✅ NOVO: Processar arquivo da URL da Meta (para vídeos e documentos grandes)
            if (!!fileUrl && !file) {
                logger.info(`[RECEIVED WHATSAPP] Arquivo recebido via URL da Meta - Tipo: ${type}, Tamanho: ${fileSize ? (fileSize / 1024 / 1024).toFixed(2) : '?'} MB`);
                
                try {
                    // Baixar o arquivo da URL da Meta
                    const downloadedBase64 = await downloadFileFromMetaUrl(fileUrl, conexao.send_token, fileSize);
                    
                    // Processar o arquivo baixado
                    const buffer = Buffer.from(downloadedBase64, 'base64');
                    
                    fileName = `${idFile}.${mimeToExtension[mimeType]}`;
                    
                    const folder = path.resolve(__dirname, "..", "..", "..", "public", `company${companyId}`);
                    
                    if (!existsSync(folder)) {
                        mkdirSync(folder, { recursive: true });
                        chmodSync(folder, 0o777)
                    }
                    
                    writeFileSync(`${folder}/${fileName}`, new Uint8Array(buffer));
                    
                    logger.info(`[RECEIVED WHATSAPP] ✅ Arquivo salvo localmente: ${fileName}`);
                } catch (error: any) {
                    logger.error(`[RECEIVED WHATSAPP] ❌ Erro ao processar arquivo da URL: ${error.message}`);
                    // Continua o fluxo mesmo com erro no download
                }
            }
            // ✅ ORIGINAL: Processar arquivo base64 (para imagens, áudios, stickers)
            else if (!!file) {
                logger.info(`[RECEIVED WHATSAPP] Arquivo recebido via Base64 - Tipo: ${type}`);

                const base64Data = file.replace(/^data:image\/\w+;base64,/, '');


                const buffer = Buffer.from(base64Data, 'base64');

                fileName = `${idFile}.${mimeToExtension[mimeType]}`;


                const folder = path.resolve(__dirname, "..", "..", "..", "public", `company${companyId}`);


                // const folder = `public/company${companyId}`; // Correção adicionada por Altemir 16-08-2023
                if (!existsSync(folder)) {
                    mkdirSync(folder, { recursive: true }); // Correção adicionada por Altemir 16-08-2023
                    chmodSync(folder, 0o777)
                }

                writeFileSync(`${folder}/${fileName}`, new Uint8Array(buffer));
                
                logger.info(`[RECEIVED WHATSAPP] ✅ Arquivo salvo localmente: ${fileName}`);
            }
            const settings = await CompaniesSettings.findOne({
                where: { companyId }
            });

            const ticket = await FindOrCreateTicketService(
                contact,
                whatsapp,
                0,
                companyId,
                null,
                null,
                null,
                'whatsapp_oficial',
                false,
                false,
                settings
            );

            const ticketTraking = await FindOrCreateATicketTrakingService({
                ticketId: ticket.id,
                companyId,
                userId: null,
                whatsappId: whatsapp.id
            });

            // ✅ Captura/atualiza Lead se mensagem veio de anúncio CTWA
            try {
                if (message?.referral?.ctwa_clid || message?.referral?.source_id) {
                    await upsertLead({
                        phone: fromNumber,
                        companyId,
                        channel: "whatsapp_oficial",
                        contactId: contact.id,
                        firstTicketId: ticket.id,
                        firstMessage: message?.text || null,
                        ctwa_clid: message.referral.ctwa_clid,
                        adId: message.referral.source_id,
                        adTitle: message.referral.headline,
                        adBody: message.referral.body,
                        sourceType: message.referral.source_type,
                        sourceUrl: message.referral.source_url,
                        mediaType: message.referral.media_type,
                        thumbnailUrl: message.referral.thumbnail_url
                    });
                    logger.info(
                        `[CTWA] Lead salvo - phone=${fromNumber} ad=${message.referral.source_id} ctwa_clid=${message.referral.ctwa_clid}`
                    );
                }
            } catch (e: any) {
                logger.error(`[CTWA] erro ao salvar lead: ${e?.message}`);
            }

            // ✅ Descrição amigável para mídias no card do atendimento
            const mediaDescriptions: Record<string, string> = {
                image: "📷 Imagem",
                video: "🎥 Vídeo",
                audio: "🎵 Áudio",
                document: "📄 Documento",
                sticker: "🏷️ Figurinha",
                location: "📍 Localização",
                contacts: "👤 Contato",
                order: "🛒 Pedido",
            };

            let lastMessageText = message.type === "interactive" ? getInteractiveSelectionLabel(message) : message?.text || '';
            if (!lastMessageText && message.type in mediaDescriptions) {
                lastMessageText = mediaDescriptions[message.type];
            }

            await ticket.update({ 
                lastMessage: lastMessageText, 
                unreadMessages: ticket.unreadMessages + 1,
                fromMe: false
            })

            // ✅ Atualizar última interação do cliente para janela de 24h (WhatsApp Oficial)
            await contact.update({
                lastInteractionClient: new Date()
            });

            // ❌ Follow-up de campanha foi DESABILITADO no fluxo da API Oficial.
            // O recurso de follow-up (mensagens 2-5 após resposta) está disponível
            // apenas para campanhas enviadas via Baileys. Em canais Oficial, somente
            // o template é disparado e nada mais.

            // Reload do ticket com associações necessárias
            await ticket.reload({
                include: [
                    { model: Contact, as: "contact" },
                    { model: Queue, as: "queue" }
                ]
            });

            /**
             * ✅ TRATAMENTO PARA AVALIAÇÃO DO ATENDENTE (NPS)
             * Deve vir ANTES de salvar a mensagem para evitar processar duas vezes
             */
            if (
                ticket.status === "nps" &&
                ticketTraking !== null &&
                verifyRating(ticketTraking)
            ) {
                // Salvar a mensagem do usuário
                await verifyMessageOficial(message, ticket, contact, companyId, fileName, fromNumber, data, quoteMessageId);

                const bodyMessage = message.text || "";

                if (!isNaN(parseFloat(bodyMessage))) {
                    await handleRating(parseFloat(bodyMessage), ticket, ticketTraking);

                    await ticketTraking.update({
                        ratingAt: moment().toDate(),
                        finishedAt: moment().toDate(),
                        rated: true
                    });

                    return;
                } else {
                    if (ticket.amountUsedBotQueuesNPS < whatsapp.maxUseBotQueuesNPS) {
                        const bodyErrorRating = `\u200eOpção inválida, tente novamente.\n`;
                        
                        await SendWhatsAppOficialMessage({
                            body: bodyErrorRating,
                            ticket: ticket,
                            quotedMsg: null,
                            type: 'text',
                            media: null,
                            vCard: null
                        });

                        await new Promise(resolve => setTimeout(resolve, 1000));

                        const bodyRatingMessage = `\u200e${whatsapp.ratingMessage}\n`;

                        await SendWhatsAppOficialMessage({
                            body: bodyRatingMessage,
                            ticket: ticket,
                            quotedMsg: null,
                            type: 'text',
                            media: null,
                            vCard: null
                        });

                        await ticket.update({
                            amountUsedBotQueuesNPS: ticket.amountUsedBotQueuesNPS + 1
                        });
                    }

                    return;
                }
            }

            await verifyMessageOficial(message, ticket, contact, companyId, fileName, fromNumber, data, quoteMessageId);

            // ✅ RESUME DE NÓ INPUT — precisa vir antes de campanha, horário,
            // fila ou recuperação genérica. Se vier depois, a resposta do
            // cliente pode reiniciar outro fluxo e o Input parece ser pulado.
            try {
                const dw: any = ticket.dataWebhook || {};
                const waitingInputResume =
                    (dw.waitingInput === true && dw.inputVariableName) ||
                    (dw.nextNodeId && dw.inputVariableName);
                if (waitingInputResume) {
                    const inputBody =
                        message.type === "interactive"
                            ? getInteractiveSelectionId(message)
                            : (message.text || "");
                    const { tryResumeFlowInput } = await import("../WebhookService/ResumeFlowInput");
                    const resumed = await tryResumeFlowInput(whatsapp.id, ticket, contact, inputBody);
                    if (resumed) return;
                }
            } catch (err) {
                console.error("[WHATSAPP OFICIAL][INPUT RESUME] ❌", err);
            }

            // ✅ FOLLOW-UP DE CAMPANHA (API Oficial): se este contato recebeu um template
            // de campanha com sendFollowUpMessage=true e ainda não respondeu, dispara
            // as mensagens 1..5 dentro da janela de 24h aberta pela resposta.
            try {
                const CampaignShippingModel = require("../../models/CampaignShipping").default;
                const CampaignModel = require("../../models/Campaign").default;
                const ContactListItemModel = require("../../models/ContactListItem").default;
                const SendCampaignFollowUps = require("../CampaignService/SendCampaignFollowUps").default;
                const { Op } = require("sequelize");

                const digits = String(fromNumber || "").replace(/\D/g, "");
                if (digits) {
                    const pendingShipping = await CampaignShippingModel.findOne({
                        where: {
                            number: { [Op.like]: `%${digits}%` },
                            awaitingResponseSince: { [Op.ne]: null },
                            followUpSentAt: { [Op.is]: null },
                            followUpExpiredAt: { [Op.is]: null },
                            deliveredAt: { [Op.ne]: null }
                        },
                        order: [["awaitingResponseSince", "DESC"]],
                        include: [{ model: ContactListItemModel, as: "contact" }]
                    });

                    if (pendingShipping) {
                        const campaignForFollowUp = await CampaignModel.findByPk(pendingShipping.campaignId);
                        if (campaignForFollowUp && campaignForFollowUp.companyId === companyId && campaignForFollowUp.sendFollowUpMessage) {
                            logger.info(`[CAMPAIGN-FOLLOWUP] Resposta detectada de ${digits} - disparando follow-up da campanha ${campaignForFollowUp.id}`);
                            // marca imediatamente para evitar disparo duplicado em concorrência
                            await pendingShipping.update({ followUpSentAt: new Date() });
                            // dispara em background (não bloqueia o webhook)
                            setImmediate(() => {
                                SendCampaignFollowUps({
                                    campaign: campaignForFollowUp,
                                    campaignShipping: pendingShipping,
                                    ticket
                                }).catch((err: any) => {
                                    logger.error(`[CAMPAIGN-FOLLOWUP] Erro: ${err?.message || err}`);
                                });
                            });
                        }
                    }
                }
            } catch (fuErr: any) {
                logger.error(`[CAMPAIGN-FOLLOWUP] check falhou: ${fuErr?.message || fuErr}`);
            }

            // ✅ VERIFICAÇÃO DE HORÁRIO DE ATENDIMENTO (mesma lógica do wbotMessageListener)
            let currentSchedule;

            if (settings.scheduleType === "company") {
                currentSchedule = await VerifyCurrentSchedule(companyId, 0, 0);
            } else if (settings.scheduleType === "connection") {
                currentSchedule = await VerifyCurrentSchedule(companyId, 0, whatsapp.id);
            }

            try {
                if (
                    settings.scheduleType &&
                    (!ticket.isGroup || whatsapp.groupAsTicket === "enabled") &&
                    !["open", "group"].includes(ticket.status)
                ) {
                    /**
                     * Tratamento para envio de mensagem quando a empresa está fora do expediente
                     */
                    if (
                        (settings.scheduleType === "company" ||
                            settings.scheduleType === "connection") &&
                        !isNil(currentSchedule) &&
                        (!currentSchedule || currentSchedule.inActivity === false)
                    ) {
                        if (
                            whatsapp.maxUseBotQueues &&
                            whatsapp.maxUseBotQueues !== 0 &&
                            ticket.amountUsedBotQueues >= whatsapp.maxUseBotQueues
                        ) {
                            return;
                        }

                        if (whatsapp.timeUseBotQueues !== "0") {
                            if (
                                ticket.isOutOfHour === false &&
                                ticketTraking.chatbotAt !== null
                            ) {
                                await ticketTraking.update({
                                    chatbotAt: null
                                });
                                await ticket.update({
                                    amountUsedBotQueues: 0
                                });
                            }

                            //Regra para desabilitar o chatbot por x minutos/horas após o primeiro envio
                            let dataLimite = new Date();
                            let Agora = new Date();

                            if (ticketTraking.chatbotAt !== null) {
                                dataLimite.setMinutes(
                                    ticketTraking.chatbotAt.getMinutes() +
                                    Number(whatsapp.timeUseBotQueues)
                                );
                                if (
                                    ticketTraking.chatbotAt !== null &&
                                    Agora < dataLimite &&
                                    whatsapp.timeUseBotQueues !== "0" &&
                                    ticket.amountUsedBotQueues !== 0
                                ) {
                                    return;
                                }
                            }

                            await ticketTraking.update({
                                chatbotAt: null
                            });
                        }

                        if (whatsapp.outOfHoursMessage !== "" && !ticket.imported) {
                            const body = whatsapp.outOfHoursMessage
                                .replace("{{nome}}", contact.name || "")
                                .replace("{{ticket}}", ticket.id.toString());
                                
                            await SendWhatsAppOficialMessage({
                                body: body,
                                ticket: ticket,
                                quotedMsg: null,
                                type: 'text',
                                media: null,
                                vCard: null
                              });
                        }

                        //atualiza o contador de vezes que enviou o bot e que foi enviado fora de hora
                        await ticket.update({
                            isOutOfHour: true,
                            amountUsedBotQueues: ticket.amountUsedBotQueues + 1
                        });

                        return;
                    }
                }
            } catch (e) {
                logger.error(`[WHATSAPP OFICIAL] Erro ao verificar horário de atendimento: ${e}`);
            }

            const hasActiveFlowBuilder = !!(ticket.flowWebhook && ticket.lastFlowId && (ticket.hashFlowId || ticket.flowStopped));

            // ✅ SAÍDA DE FLUXO POR PALAVRA-CHAVE (paridade com Baileys / WhatsApp Plus)
            //
            // Este era o canal mais afetado: quando o ticket entra em fluxo,
            // todo o resto deste arquivo desvia direto pro ActionsWebhookService
            // (bloco "CONTINUAÇÃO DE FLOWBUILDER EXISTENTE"), que nunca chama o
            // flowbuilderIntegration — que era o único lugar com a checagem de
            // palavra de saída. Na prática, "sair" só funcionava aqui se o
            // cliente estivesse parado exatamente num nó de MENU, e mesmo assim
            // só com as 4 palavras fixas do ActionsWebhookService, ignorando as
            // palavras configuradas no nó de saída do fluxo.
            //
            // Roda antes de qualquer desvio para valer em qualquer nó.
            try {
                const textoDoCliente =
                    message.type === "interactive"
                        ? getInteractiveSelectionId(message) || message.text || ""
                        : message.text || "";

                if (textoDoCliente) {
                    const encerrouFluxo = await HandleFlowExitKeyword({
                        ticket,
                        contact,
                        companyId,
                        body: String(textoDoCliente),
                        canal: "OFICIAL"
                    });
                    if (encerrouFluxo) return;
                }
            } catch (e: any) {
                logger.warn(`[WHATSAPP OFICIAL] Falha no check de saída de fluxo: ${e?.message}`);
            }

            // ✅ AGENTE DE IA VINCULADO À CONEXÃO (paridade com Baileys)
            // Quando o Prompt está configurado diretamente na conexão oficial
            // (whatsapp.promptId) e o ticket ainda não tem promptId/fila/atendente,
            // herda o promptId da conexão para que o agente de IA seja acionado.
            if (
                !isNil(whatsapp.promptId) &&
                isNil(ticket.promptId) &&
                !ticket.queueId &&
                !ticket.userId &&
                !ticket.imported &&
                !ticket.isGroup &&
                ticket.status !== "open" &&
                !hasActiveFlowBuilder
            ) {
                try {
                    await ticket.update({ promptId: whatsapp.promptId });
                    await ticket.reload();
                    logger.info(`[WHATSAPP OFICIAL][AI AGENT] promptId herdado da conexão (whatsapp.promptId=${whatsapp.promptId}) - ticket ${ticket.id}`);
                } catch (e) {
                    logger.error(`[WHATSAPP OFICIAL][AI AGENT] Falha ao herdar promptId da conexão para ticket ${ticket.id}: ${e}`);
                }
            }

            // ✅ FLUXO PADRÃO VINCULADO À CONEXÃO (paridade com Baileys, antes de verifyQueueOficial)
            // Dispara o flow selecionado em "Editar Conexão → Fluxo Padrão"
            // (campos flowIdWelcome / flowIdNotPhrase) quando não há integração
            // externa nem flow em andamento. Precisa rodar ANTES de
            // verifyQueueOficial — caso contrário, conexões com fila teriam
            // ticket.queue atribuído e o flow nunca dispararia.
            logger.info(
                `[WHATSAPP OFICIAL][WELCOME FLOW][DEBUG] ticket=${ticket.id} status=${ticket.status} imported=${!!ticket.imported} isGroup=${!!ticket.isGroup} queueId=${ticket.queueId || "null"} userId=${ticket.userId || "null"} useIntegration=${!!ticket.useIntegration} whatsappIntegrationId=${whatsapp.integrationId ?? "null"} hasActiveFlowBuilder=${hasActiveFlowBuilder} flowIdWelcome=${whatsapp.flowIdWelcome ?? "null"} flowIdNotPhrase=${whatsapp.flowIdNotPhrase ?? "null"}`
            );

            if (
                ticket.status !== "open" &&
                !ticket.imported &&
                !ticket.isGroup &&
                !ticket.queue &&
                !ticket.userId &&
                !ticket.useIntegration &&
                isNil(whatsapp.integrationId) &&
                !hasActiveFlowBuilder &&
                (whatsapp.flowIdWelcome || whatsapp.flowIdNotPhrase)
            ) {
                try {
                    // Detectar se contato é "novo" (sem mensagens anteriores)
                    const existingMsgs = await Message.count({
                        where: { ticketId: ticket.id }
                    });
                    const isNewContact = existingMsgs <= 1;

                    const flowIdToUse: number | null =
                        (!isNewContact && whatsapp.flowIdWelcome)
                            ? whatsapp.flowIdWelcome
                            : (isNewContact && whatsapp.flowIdNotPhrase)
                                ? whatsapp.flowIdNotPhrase
                                : (whatsapp.flowIdWelcome || whatsapp.flowIdNotPhrase || null);

                    if (flowIdToUse) {
                        const flow = await FlowBuilderModel.findOne({
                            where: { id: flowIdToUse, company_id: companyId }
                        });

                        if (flow && flow.flow?.["nodes"]?.length) {
                            const nodes: any[] = flow.flow["nodes"];
                            const connections: any[] = flow.flow["connections"];
                            const hashFlowId = `oficial_welcome_${flowIdToUse}_${ticket.id}`;

                            await ticket.update({
                                flowWebhook: true,
                                lastFlowId: null,
                                hashFlowId,
                                flowStopped: String(flowIdToUse),
                                dataWebhook: null,
                                useIntegration: null,
                                integrationId: null,
                                amountUsedBotQueues: 0
                            });

                            const numberPhrase = {
                                number: contact.number,
                                name: contact.name,
                                email: contact.email || ""
                            };

                            logger.info(
                                `[WHATSAPP OFICIAL][WELCOME FLOW] Disparando fluxo ${flowIdToUse} para ticket ${ticket.id}`
                            );

                            await ActionsWebhookService(
                                whatsapp.id,
                                flowIdToUse,
                                companyId,
                                nodes,
                                connections,
                                resolveFlowEntryNodeId(nodes, connections),
                                "",
                                "",
                                "",
                                null,
                                ticket.id,
                                numberPhrase
                            );

                            return;
                        } else {
                            logger.warn(
                                `[WHATSAPP OFICIAL][WELCOME FLOW] Fluxo ${flowIdToUse} não encontrado ou sem nós`
                            );
                        }
                    }
                } catch (error) {
                    console.error("[WHATSAPP OFICIAL][WELCOME FLOW] Erro:", error);
                }
            }

            if (
                !ticket.imported &&
                !ticket.queue &&
                (!ticket.isGroup || whatsapp.groupAsTicket === "enabled") &&
                !ticket.userId &&
                whatsapp?.queues?.length >= 1 &&
                !ticket.useIntegration &&
                !hasActiveFlowBuilder
            ) {
                await verifyQueueOficial(message, ticket, settings, ticketTraking);

                if (ticketTraking.chatbotAt === null) {
                    await ticketTraking.update({
                        chatbotAt: moment().toDate(),
                    })
                }
            }

            // ✅ IMPLEMENTAÇÃO DO SAYCHATBOT PARA API OFICIAL
            if (
                ticket.queue &&
                ticket.queueId &&
                !ticket.useIntegration &&
                !ticket.integrationId &&
                ticket.queue?.chatbots?.length > 0 &&
                !hasActiveFlowBuilder
            ) {
                // ✅ CORRIGIDO: Executar ChatBot apenas se ticket não estiver "open" (aceito por atendente)
                if (ticket.status !== "open") {                                    
                    const simulatedMsg = {
                        key: {
                            fromMe: false,
                            remoteJid: `${fromNumber}@s.whatsapp.net`,
                            id: message.idMessage
                        },
                        message: {
                            buttonsResponseMessage: message.type === "interactive" ? { selectedButtonId: getInteractiveSelectionId(message) } : undefined,
                            listResponseMessage: message.type === "interactive" ? { singleSelectReply: { selectedRowId: getInteractiveSelectionId(message) } } : undefined,
                            conversation: message.text || "",
                            timestamp: message.timestamp
                        }
                    };

                    try {
                    await sayChatbotOficial(
                            ticket.queueId,
                            ticket,
                            contact,
                            simulatedMsg,
                            ticketTraking
                        );
                    } catch (error) {
                        console.error("[WHATSAPP OFICIAL] Erro ao executar sayChatbotOficial:", error);
                        logger.error(`[WHATSAPP OFICIAL] Erro sayChatbotOficial: ${error}`);
                    }

                    await ticket.reload();
                    if (!isNil(ticket.promptId)) {
                    const aiAnswered = await processAiAgentOficial(ticket, contact, companyId, message.text || "", { isInitialGreeting: true });
                        if (aiAnswered) return;
                    }
                }

                // Atualiza mensagem para indicar que houve atividade e aí contar o tempo novamente para enviar mensagem de inatividade
                await ticket.update({
                    sendInactiveMessage: false
                });
            }

            // ✅ VERIFICAÇÃO DE PALAVRAS-CHAVE (CAMPANHAS DE FLUXO) - API Oficial
            // Verifica se a mensagem faz match com alguma campanha/palavra-chave configurada
            // Isso funciona independente do estado do ticket (sem integrationId)
            if (!ticket.imported && !ticket.isGroup && !ticket.userId && message.text && !hasActiveFlowBuilder) {
                try {
                    const activeCampaigns = await FlowCampaignModel.findAll({
                        where: {
                            companyId,
                            status: true
                        }
                    });

                    const campaignsForThisWhatsapp = activeCampaigns.filter(campaign => {
                        try {
                            const whatsappIds = campaign.whatsappIds || [];
                            return whatsappIds.includes(whatsapp.id);
                        } catch {
                            return false;
                        }
                    });

                    // Buscar tags do contato para filtragem
                    let contactTagIds: number[] = [];
                    try {
                        const contactTags = await ContactTag.findAll({
                            where: { contactId: contact.id }
                        });
                        contactTagIds = contactTags.map(ct => ct.tagId);
                    } catch (err) {
                        console.error("[PALAVRA-CHAVE OFICIAL] Erro ao buscar tags do contato:", err);
                    }

                    const matchingCampaign = campaignsForThisWhatsapp.find(campaign => {
                        try {
                            if (!campaign.status) return false;
                            // Verificar filtro de tags
                            if (!campaign.matchesContactTags(contactTagIds)) return false;
                            return campaign.matchesMessage(message.text, whatsapp.id);
                        } catch {
                            return false;
                        }
                    });

                    if (matchingCampaign) {

                        const flow = await FlowBuilderModel.findOne({
                            where: {
                                id: matchingCampaign.flowId,
                                company_id: companyId
                            }
                        });

                        if (flow) {
                            const nodes: any[] = flow.flow["nodes"];
                            const connections: any[] = flow.flow["connections"];

                            // Resetar estado do fluxo anterior se existir
                            await ticket.update({
                                flowWebhook: true,
                                lastFlowId: null,
                                hashFlowId: `flow_campaign_${matchingCampaign.id}`,
                                flowStopped: matchingCampaign.flowId.toString(),
                                dataWebhook: null,
                                useIntegration: null,
                                integrationId: null,
                                amountUsedBotQueues: 0 // Reset para permitir execução
                            });

                            const numberPhrase = {
                                number: contact.number,
                                name: contact.name,
                                email: contact.email || ""
                            };

                            await ActionsWebhookService(
                                whatsapp.id,
                                matchingCampaign.flowId,
                                companyId,
                                nodes,
                                connections,
                                null,
                                `flow_campaign_${matchingCampaign.id}`,
                                undefined,
                                undefined,
                                undefined,
                                ticket.id,
                                numberPhrase
                            );

                            return;
                        } else {
                            console.warn(`[PALAVRA-CHAVE OFICIAL] ⚠️ Fluxo ${matchingCampaign.flowId} não encontrado para campanha ${matchingCampaign.id}`);
                        }
                    }
                } catch (error) {
                    console.error("[PALAVRA-CHAVE OFICIAL] Erro ao verificar campanhas por palavra-chave:", error);
                }
            }

            // GATILHO PRÓPRIO DO FLUXO (Automações → Flows)
            //
            // O bloco acima cobre "campanhas de fluxo" — outro recurso, com
            // cadastro separado. O gatilho que fica na tela do fluxo
            // (Palavra-chave, Qualquer mensagem, Expressão regular) é avaliado
            // por executeFlowBuilderKeywordTrigger, e aqui ele nunca era
            // chamado: no canal oficial o fluxo só era alcançado por dentro do
            // flowbuilderIntegration, que exige integração configurada na
            // conexão ou no ticket. Sem integração — o caso normal — a palavra
            // -chave simplesmente não disparava, enquanto no Baileys e no
            // WhatsApp Plus funcionava. Daí a impressão de que "nenhum fluxo
            // dispara" só nesta API.
            if (!ticket.imported && !ticket.isGroup && !hasActiveFlowBuilder) {
                try {
                    const contatoDoGatilho = await ShowContactService(
                        ticket.contactId,
                        ticket.companyId
                    );

                    const msgDoGatilho = {
                        key: {
                            fromMe: false,
                            remoteJid: `${fromNumber}@s.whatsapp.net`,
                            id: message.idMessage || `ofc-${Date.now()}`
                        },
                        message: {
                            conversation: message.text || "",
                            timestamp: message.timestamp || Math.floor(Date.now() / 1000)
                        }
                    } as any;

                    const disparou = await executeFlowBuilderKeywordTrigger({
                        msg: msgDoGatilho,
                        wbot: null,
                        companyId,
                        ticket,
                        contact: contatoDoGatilho,
                        messageBody: message.text || ""
                    });

                    if (disparou) {
                        logger.info(
                            `[WHATSAPP OFICIAL] Fluxo disparado pelo gatilho próprio no ticket ${ticket.id}`
                        );
                        return;
                    }
                } catch (erro: any) {
                    logger.error(
                        `[WHATSAPP OFICIAL] Falha ao avaliar o gatilho do fluxo: ${erro?.message}`
                    );
                }
            }

            // ✅ VERIFICAÇÃO DE CAMPANHAS E FLUXOS - executa se ticket tem integrationId ativa
            if (!ticket.imported && !ticket.isGroup && ticket.integrationId && ticket.useIntegration && !hasActiveFlowBuilder) {

                const contactForCampaign = await ShowContactService(
                    ticket.contactId,
                    ticket.companyId
                );

                try {
                    const queueIntegrations = await ShowQueueIntegrationService(
                        ticket.integrationId,
                        companyId
                    );

                    const simulatedMsgForFlow = {
                        key: {
                            fromMe: false,
                            remoteJid: `${fromNumber}@s.whatsapp.net`,
                            id: message.idMessage || `ofc-${Date.now()}`
                        },
                        message: {
                            conversation: message.text || ticket.lastMessage || "",
                            timestamp: message.timestamp || Math.floor(Date.now() / 1000)
                        }
                    } as any;

                    const campaignExecuted = await flowbuilderIntegration(
                        simulatedMsgForFlow,
                        null,
                        companyId,
                        queueIntegrations,
                        ticket,
                        contactForCampaign,
                        null,
                        null
                    );

                    if (campaignExecuted) {
                        return;
                    }
                } catch (error) {
                    console.error("[WHATSAPP OFICIAL] Erro ao verificar campanhas:", error);
                }
            }

            // ✅ VERIFICAÇÃO DE INTEGRAÇÕES EXISTENTES
            // ✅ CONTINUAÇÃO DE FLOWBUILDER EXISTENTE (sem campanha)
            // O flowIdWelcome/flowIdNotPhrase pode gerar hashFlowId sem registro em WebhookModel.
            // Nesses casos, continuar pelo flowStopped evita reiniciar o menu após resposta interativa.
            if (ticket.flowWebhook && ticket.lastFlowId && (ticket.hashFlowId || ticket.flowStopped)) {
                try {
                    let recoveredFlowId: number | null = null;
                    let recoveredDetails: any = { idFlow: null, inputs: [], keysFull: [] };

                    if (ticket.hashFlowId) {
                        const webhook = await WebhookModel.findOne({
                            where: {
                                company_id: ticket.companyId,
                                hash_id: ticket.hashFlowId
                            }
                        });

                        if (webhook && webhook.config["details"]?.idFlow) {
                            recoveredFlowId = Number(webhook.config["details"].idFlow);
                            recoveredDetails = webhook.config["details"];
                        } else if (ticket.flowStopped) {
                            console.warn(`[FLOW WEBHOOK - OFICIAL][RECOVERY] Hash ${ticket.hashFlowId} sem webhook válido; usando flowStopped=${ticket.flowStopped}`);
                        }
                    }

                    if (!recoveredFlowId && ticket.flowStopped) {
                        recoveredFlowId = parseInt(String(ticket.flowStopped));
                        recoveredDetails = { idFlow: recoveredFlowId, inputs: [], keysFull: [] };
                    }

                    if (recoveredFlowId !== null && !isNaN(recoveredFlowId)) {
                        const flow = await FlowBuilderModel.findOne({
                            where: { id: recoveredFlowId, company_id: companyId }
                        });

                        if (flow) {
                            console.warn(`[FLOW WEBHOOK - OFICIAL][RECOVERY] Continuando fluxo ${recoveredFlowId} a partir de ${ticket.lastFlowId} para ticket ${ticket.id}`);

                            const nodes: any[] = flow.flow["nodes"];
                            const connections: any[] = flow.flow["connections"];
                            const recoveryHash = ticket.hashFlowId || `recovery-${ticket.id}`;
                            const numberPhrase = { number: contact.number, name: contact.name, email: contact.email || "" };

                            await ActionsWebhookService(
                                whatsapp.id,
                                recoveredFlowId,
                                ticket.companyId,
                                nodes,
                                connections,
                                ticket.lastFlowId,
                                ticket.dataWebhook,
                                recoveredDetails,
                                recoveryHash,
                                message.type === "interactive" ? getInteractiveSelectionId(message) : (message.text || ""),
                                ticket.id,
                                numberPhrase
                            );

                            return;
                        }
                    }
                } catch (error) {
                    console.error("[FLOW WEBHOOK - OFICIAL][RECOVERY] ❌ Erro ao continuar fluxo:", error);
                }
            }

            if (
                !ticket.imported &&
                !ticket.queue &&
                !ticket.isGroup &&
                !ticket.user &&
                !isNil(whatsapp.integrationId)
            ) {
                const integrations = await ShowQueueIntegrationService(
                    whatsapp.integrationId,
                    companyId
                );

                // Criar um objeto msg simulado para compatibilidade
                const simulatedMsg = {
                    key: {
                        fromMe: false,
                        remoteJid: `${fromNumber}@s.whatsapp.net`,
                        id: message.idMessage
                    },
                    message: {
                        conversation: message.text || "",
                        timestamp: message.timestamp,
                        text: message.text || ""
                    }
                };

                // ✅ VERIFICAR SE É TYPEBOT
                if (integrations.type === "typebot") {
                    await typebotListenerOficial({ 
                        ticket, 
                        msg: simulatedMsg, 
                        typebot: integrations 
                    });
                    
                    await ticket.update({
                        useIntegration: true,
                        integrationId: integrations.id,
                        typebotSessionTime: moment().toDate()
                    });
                } else {
                    // ✅ OUTRAS INTEGRAÇÕES (n8n, dialogflow, flowbuilder, webhook)
                    await handleMessageIntegration(
                        simulatedMsg as any,
                        null, // wbot é null
                        companyId,
                        integrations,
                        ticket
                    );

                    await ticket.update({
                        useIntegration: true,
                        integrationId: integrations.id
                    });
                }

                return;
            }

            // ✅ VERIFICAÇÃO DE INTEGRAÇÕES NO TICKET
            if (
                !ticket.imported &&
                !ticket.isGroup &&
                !ticket.userId &&
                ticket.integrationId &&
                ticket.useIntegration
            ) {
                const integrations = await ShowQueueIntegrationService(
                    ticket.integrationId,
                    companyId
                );

                // Criar um objeto msg simulado para compatibilidade
                const simulatedMsg = {
                    key: {
                        fromMe: false,
                        remoteJid: `${fromNumber}@s.whatsapp.net`,
                        id: message.idMessage
                    },
                    message: {
                        conversation: message.text || "",
                        timestamp: message.timestamp,
                        text: message.text || ""
                    }
                };

                // ✅ VERIFICAR SE É TYPEBOT
                if (integrations.type === "typebot") {
                    await typebotListenerOficial({ 
                        ticket, 
                        msg: simulatedMsg, 
                        typebot: integrations 
                    });
                } else {
                    // ✅ OUTRAS INTEGRAÇÕES (n8n, dialogflow, flowbuilder, webhook)
                    await handleMessageIntegration(
                        simulatedMsg as any,
                        null, // wbot é null
                        companyId,
                        integrations,
                        ticket
                    );
                }
            }

            // ✅ AGENTE DE IA - Processar mensagens via promptId do ticket (queueType: aiAgent)
            if (
                !ticket.imported &&
                !ticket.isGroup &&
                !ticket.userId &&
                !isNil(ticket.promptId)
            ) {
                try {
                    const promptRecord = await ShowPromptService({
                        promptId: ticket.promptId,
                        companyId
                    });

                    if (promptRecord) {
                        const openai = obterClienteIA(promptRecord.apiKey);

                        const messages = await Message.findAll({
                            where: { ticketId: ticket.id },
                            order: [["createdAt", "ASC"]],
                            limit: promptRecord.maxMessages
                        });

                        const contact = await ShowContactService(ticket.contactId, companyId);
                        const contactName = contact.name || "Amigo(a)";

                        // Buscar filas disponíveis para incluir no prompt
                        const companyQueues = await Queue.findAll({
                            where: { companyId },
                            attributes: ["id", "name"]
                        });
                        const queueNames = companyQueues.map(q => q.name).join(", ");

                        const promptSystem = `REGRA DE USO DO NOME: O nome do cliente é "${contactName}". Use o nome APENAS na primeira saudação da conversa. Nas mensagens seguintes, NÃO repita o nome — converse de forma natural e humanizada, como uma pessoa real. Só volte a citar o nome em momentos pontuais (encerramento, confirmação importante). NUNCA comece toda mensagem com "Olá, [nome]" — soa robótico.\nSua resposta deve usar no máximo ${promptRecord.maxTokens} tokens e cuide para não truncar o final.\nQuando a resposta requer uma transferência para atendimento humano, comece sua resposta com 'Ação: Transferir para [nome do setor]'.\nOs setores disponíveis são: ${queueNames}.\nSe o cliente não especificar o setor, use 'Ação: Transferir para o setor de atendimento' para transferir para o setor padrão.\n${promptRecord.prompt}\n`;

                        let messagesOpenAi: any[] = [{ role: "system", content: promptSystem }];

                        for (let i = 0; i < Math.min(promptRecord.maxMessages, messages.length); i++) {
                            const msg = messages[i];
                            if (msg.mediaType === "conversation" || msg.mediaType === "extendedTextMessage") {
                                messagesOpenAi.push({
                                    role: msg.fromMe ? "assistant" : "user",
                                    content: msg.body
                                });
                            }
                        }

                        messagesOpenAi.push({ role: "user", content: message.text || "" });

                        const aiModelOficial = ticket.aiModel || "gpt-4.1-mini";
                        const chat = await openai.chat.completions.create({
                            model: aiModelOficial,
                            messages: messagesOpenAi,
                            max_tokens: promptRecord.maxTokens,
                            temperature: promptRecord.temperature
                        });

                        let response = chat.choices[0].message?.content;

                        // Detectar "Ação: Transferir para [nome da fila]"
                        const transferMatch = response ? response.match(aiTransferRegex) : null;
                        const userText = message.text || "";
                        const aiSays = !!response && (transferMatch || detectAiTransferIntent(response));
                        const userAsks = detectAiTransferIntent(userText);

                        if (aiSays || userAsks) {
                            const requested = transferMatch?.[1]?.trim() || "";
                            const combined = `${requested} ${userText} ${response || ""}`;
                            const { queue: tQueue, user: tUser } = await resolveTransferTarget(
                                ticket.companyId,
                                combined,
                                getSafeAiTransferFallbackQueueId(promptRecord.queueId, ticket.queueId)
                            );

                            if (tQueue) {
                                const isSameQueueTransfer = Number(tQueue.id) === Number(ticket.queueId) && (!tUser?.id || Number(tUser.id) === Number(ticket.userId));
                                if (response && transferMatch) {
                                    response = response.replace(aiTransferRegex, "").trim();
                                }
                                const transferred = isSameQueueTransfer ? false : await applyAiTransfer(ticket, contact, tQueue, tUser);
                                const responseBody = stripInvisibleText(response) || (transferred ? "" : aiSameQueueFallbackMessage);

                                if (hasVisibleText(responseBody)) {
                                    await SendWhatsAppOficialMessage({
                                        body: `\u200e ${responseBody}`,
                                        ticket,
                                        type: null
                                    } as any);
                                }

                                if (transferred || isSameQueueTransfer) return;
                            }
                            logger.warn(`[AI AGENT OFICIAL] Transferência solicitada sem fila válida - ticket ${ticket.id}`);
                        }

                        // ✅ Sanitiza rótulos de ação ("Ação: Transferir para X")
                        // que a IA às vezes vaza no texto do cliente.
                        if (response) {
                            response = response
                                .replace(/^\s*(?:[-*•]\s*)?(?:a[cç][aã]o|action|acao)\s*[:：]\s*.*$/gim, "")
                                .replace(/\n{3,}/g, "\n\n")
                                .trim();
                        }

                        if (hasVisibleText(response)) {
                            await SendWhatsAppOficialMessage({
                                body: `\u200e ${stripInvisibleText(response)}`,
                                ticket,
                                type: null
                            } as any);
                        }
                    }
                } catch (error) {
                    logger.error(`[AI AGENT OFICIAL] Erro ao processar agente de IA para ticket ${ticket.id}:`, error);
                }
            }

            // ✅ VERIFICAÇÃO: Iniciar FlowBuilder pela integração da conexão WhatsApp (sem fila)
            if (
                !ticket.imported &&
                !ticket.queue &&
                !ticket.isGroup &&
                !ticket.userId &&
                !ticket.useIntegration &&
                !ticket.integrationId &&
                !ticket.flowWebhook &&
                // ✅ CORREÇÃO ANTI-DUPLICAÇÃO: Só iniciar o fluxo se ainda não foi executado neste ticket
                // amountUsedBotQueues é incrementado ao finalizar o fluxo automaticamente
                (isNil(ticket.amountUsedBotQueues) || ticket.amountUsedBotQueues === 0) &&
                !isNil(whatsapp.integrationId)
            ) {
                try {
                    const queueIntegrations = await ShowQueueIntegrationService(
                        whatsapp.integrationId,
                        companyId
                    );

                    logger.info(`[WHATSAPP OFICIAL] Iniciando flowbuilder pela conexão para ticket ${ticket.id}, tipo: ${queueIntegrations?.type || 'indefinido'}`);

                    const simulatedMsgForFlow2 = {
                        key: {
                            fromMe: false,
                            remoteJid: `${fromNumber}@s.whatsapp.net`,
                            id: message.idMessage || `ofc-${Date.now()}`
                        },
                        message: {
                            conversation: message.text || ticket.lastMessage || "",
                            timestamp: message.timestamp || Math.floor(Date.now() / 1000)
                        }
                    } as any;

                    await flowbuilderIntegration(
                        simulatedMsgForFlow2,
                        null,
                        companyId,
                        queueIntegrations,
                        ticket,
                        contact,
                        null,
                        null
                    );

                    logger.info(`[WHATSAPP OFICIAL] flowbuilderIntegration executado para ticket ${ticket.id}`);
                } catch (error) {
                    console.error("[WHATSAPP OFICIAL] Erro ao iniciar flowbuilder pela conexão:", error);
                }
            }

            // ℹ️ Bloco do "Fluxo Padrão" (flowIdWelcome / flowIdNotPhrase) foi movido
            // para ANTES de verifyQueueOficial (paridade com Baileys), porque
            // quando a conexão tem fila o verifyQueueOficial setava ticket.queue
            // e a condição !ticket.queue impedia o disparo do fluxo.

        } catch (error) {
            console.error("[WHATSAPP OFICIAL] Erro em getMessage:", error);
            logger.error(`[WHATSAPP OFICIAL] Erro getMessage: ${error}`);
        }
    }

    async readMessage(data: IReceivedReadWhatsppOficialRead) {
        const { messageId, token, companyId } = data;

        try {
            const conexao = await Whatsapp.findOne({ where: { token, companyId } });

            if (!conexao) {
                logger.error('readMessage - Nenhum whatsApp encontrado');
                return;
            }

            const message = await Message.findOne({ where: { wid: messageId, companyId } });

            if (!message) {
                logger.error(`readMessage - Mensagem não encontrada - ${messageId}`);
                return;
            }
            message.update({ read: true, ack: 2 });
        } catch (error) {
            logger.error(`Erro ao atualizar ack da mensagem ${messageId} - ${error}`);
        }
    }
}