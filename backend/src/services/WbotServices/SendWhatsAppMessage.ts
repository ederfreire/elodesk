import { WAMessage } from "@whiskeysockets/baileys";
import delay from "../../utils/delay";
import * as Sentry from "@sentry/node";
import AppError from "../../errors/AppError";
import GetTicketWbot from "../../helpers/GetTicketWbot";
import Message from "../../models/Message";
import Ticket from "../../models/Ticket";
import Contact from "../../models/Contact";
import Whatsapp from "../../models/Whatsapp";
import { isNil } from "lodash";

import formatBody from "../../helpers/Mustache";
import logger from "../../utils/logger";
import friendlySendError from "../../helpers/FriendlySendError";
import { ENABLE_LID_DEBUG } from "../../config/debug";
import getCachedOnWhatsApp from "../../utils/onWhatsAppCache";
import { normalizeJid } from "../../utils";
import { extrairMencoes } from "../../helpers/GroupMentions";
import CreateMessageService from "../MessageServices/CreateMessageService";
import { sendChatText, buildJid } from "../WacallsServices/WacallsChatMessageService";


interface Request {
  body: string;
  ticket: Ticket;
  quotedMsg?: Message;
  msdelay?: number;
  vCard?: Contact;
  isForwarded?: boolean;
}

const SendWhatsAppMessage = async ({
  body,
  ticket,
  quotedMsg,
  msdelay,
  vCard,
  isForwarded = false
}: Request): Promise<WAMessage> => {

  const contactNumber = await Contact.findByPk(ticket.contactId);
  if (!contactNumber) {
    throw new AppError("Contato do ticket não encontrado");
  }

  // Roteamento wacalls: quando o canal do WhatsApp é o wacalls-chat, envio
  // ocorre via HTTP no bridge (sessão pareada por QR), não pelo Baileys.
  // Usava WacallsBridgeService (wacalls-voip, descontinuado) e
  // whatsapp.wacallsSessionId — nenhuma conexão nova tem esse campo
  // preenchido desde a migração pro wacalls-chat, então esse branch nunca
  // disparava de verdade (o bot/flowbuilder/saudação simplesmente não
  // enviava nada em conexões wacalls). Trocado pro bridge atual
  // (WacallsChatMessageService + whatsapp.wacallsChatSessionId).
  const whatsapp = await Whatsapp.findByPk(ticket.whatsappId);
  if (whatsapp?.channel === "wacalls") {
    if (!whatsapp.wacallsChatSessionId) {
      throw new AppError(
        "A conexão WhatsApp Plus não está pareada. Abra Conexões, leia o QR Code novamente e tente enviar de novo."
      );
    }
    // Prefere o remoteJid salvo no contato (preserva @lid quando o WhatsApp
    // só expõe LID pra esse contato) — .number sozinho é só dígitos crus e,
    // reconstruído com @s.whatsapp.net, disca/manda pra um JID que não
    // existe quando o contato é LID-only (mesma classe de bug já corrigida
    // pro discador/chamadas em WacallsController.resolveDialTarget).
    const jidWa = contactNumber.remoteJid || buildJid(contactNumber.number, !!ticket.isGroup);

    // ── CONTATO (vCard) NO WHATSAPP PLUS ────────────────────────────────────
    //
    // Este ramo do wacalls fica ANTES do bloco que monta o vCard de verdade
    // (mais abaixo, `if (!isNil(vCard))`) e retorna aqui mesmo. Resultado: ao
    // encaminhar um contato por esta conexão, o texto CRU do cartão era
    // enviado — o cliente recebia "BEGIN:VCARD / VERSION:3.0 / N:;;;; ..." na
    // conversa, como na captura do usuário.
    //
    // O endpoint de texto do wacalls-chat não envia cartão de contato. Já que
    // não dá para mandar o cartão, ao menos mandamos algo legível: nome e
    // telefone. Melhor um contato em texto limpo do que protocolo na tela.
    let corpoParaEnviar = body;
    if (typeof body === "string" && body.includes("BEGIN:VCARD")) {
      // Vários contatos vêm como vários blocos BEGIN:VCARD...END:VCARD
      // concatenados. A versão anterior usava match() simples, que só pega a
      // PRIMEIRA ocorrência — ao encaminhar 2+ contatos, os demais sumiam ou
      // o texto saía quebrado. Agora cada cartão é lido separadamente.
      const cartoes = body.match(/BEGIN:VCARD[\s\S]*?END:VCARD/g) || [body];
      const linhas = cartoes
        .map(cartao => {
          const nome = (cartao.match(/^FN:(.*)$/m)?.[1] || "").trim();
          const telefone = (
            cartao.match(/waid=(\d+)/)?.[1] ||
            // Linhas vêm prefixadas no vCard 3.0 do WhatsApp
            // ("item1.TEL;waid=..."), por isso o prefixo opcional aqui.
            cartao.match(/^(?:[\w-]+\.)?TEL[^:\n]*:([^\n\r]+)/m)?.[1] ||
            ""
          ).trim();
          const partes = [nome, telefone].filter(Boolean);
          return partes.length ? `📇 ${partes.join(" — ")}` : "";
        })
        .filter(Boolean);

      if (linhas.length) {
        corpoParaEnviar = linhas.join("\n");
        logger.info(
          `[wacalls] ${linhas.length} vCard(s) convertido(s) em texto legível para o ticket ${ticket.id} (o canal não envia cartão de contato)`
        );
      }
    }

    const formatted = formatBody(corpoParaEnviar, ticket);
    // sendChatText não aceita resposta citada (quotedId) — o wacalls-chat
    // ainda não expõe isso na rota de texto; a mensagem é enviada normal.
    const result = await sendChatText(whatsapp.wacallsChatSessionId, jidWa, formatted);
    await CreateMessageService({
      messageData: {
        wid: result?.id || `wa-${Date.now()}`,
        ticketId: ticket.id,
        contactId: contactNumber.id,
        body: formatted,
        fromMe: true,
        read: true,
        mediaType: "chat",
        ack: 1,
        channel: "wacalls",
        isForwarded
      },
      companyId: ticket.companyId
    });
    await ticket.update({ lastMessage: formatted });
    // Retornamos um objeto compatível para não quebrar callers que esperam WAMessage
    return { key: { id: result?.id, remoteJid: jidWa, fromMe: true } } as any;
  }



  let options = {};

  // Números escritos como "@numero" no texto. Só faz sentido em grupo — no
  // privado o WhatsApp ignora mentionedJid. Fora de grupo a lista fica vazia
  // e o envio segue idêntico ao de antes.
  const mentions: string[] = ticket.isGroup ? extrairMencoes(body) : [];

  const wbot = await GetTicketWbot(ticket);

  // ✅ FIX: Resolver JID correto para garantir entrega
  let jid = `${contactNumber.number}@${ticket.isGroup ? "g.us" : "s.whatsapp.net"}`;
  jid = normalizeJid(jid);

  if (!ticket.isGroup) {
    let resolved = false;

    // 1) Tentar validar via onWhatsApp (com cache)
    try {
      const validationResult = await getCachedOnWhatsApp(wbot, jid);
      if (validationResult?.exists && validationResult.jid) {
        jid = validationResult.jid;
        resolved = true;
        logger.info(`[RDS-BAILEYS] JID resolvido via onWhatsApp: ${jid}`);
      }
    } catch (e) {
      logger.warn(`[RDS-BAILEYS] onWhatsApp falhou para ${jid}: ${e.message}`);
    }

    // 2) Fallback: buscar o remoteJid da última mensagem RECEBIDA (fromMe=false) deste ticket
    if (!resolved) {
      try {
        const lastIncoming = await Message.findOne({
          where: {
            ticketId: ticket.id,
            fromMe: false
          },
          order: [["createdAt", "DESC"]],
          attributes: ["dataJson"]
        });

        if (lastIncoming?.dataJson) {
          const parsed = JSON.parse(lastIncoming.dataJson);
          const incomingJid = parsed?.key?.remoteJid;
          if (incomingJid && !incomingJid.includes("@lid")) {
            jid = incomingJid;
            resolved = true;
            logger.info(`[RDS-BAILEYS] JID resolvido via última mensagem recebida: ${jid}`);

            // Corrigir o contato no banco para futuras mensagens
            const correctNumber = incomingJid.split("@")[0];
            if (correctNumber !== contactNumber.number) {
              await contactNumber.update({ number: correctNumber, remoteJid: incomingJid });
              logger.info(`[RDS-BAILEYS] Contato ${contactNumber.id} corrigido: number=${correctNumber}`);
            }
          }
        }
      } catch (e) {
        logger.warn(`[RDS-BAILEYS] Erro ao buscar JID da última mensagem: ${e.message}`);
      }
    }

    // 3) Fallback: usar contact.lid se disponível
    if (!resolved && contactNumber.lid) {
      jid = contactNumber.lid.includes("@") ? contactNumber.lid : `${contactNumber.lid}@s.whatsapp.net`;
      logger.info(`[RDS-BAILEYS] Usando LID como último fallback: ${jid}`);
    }
  }

  if (ENABLE_LID_DEBUG) {
    logger.info(
      `[RDS-LID] SendMessage - Enviando para JID tradicional: ${jid}`
    );
    logger.info(`[RDS-LID] SendMessage - Contact lid: ${contactNumber.lid}`);
    logger.info(
      `[RDS-LID] SendMessage - Contact remoteJid: ${contactNumber.remoteJid}`
    );
    logger.info(
      `[RDS-LID] SendMessage - QuotedMsg: ${quotedMsg ? "SIM" : "NÃO"}`
    );
  }

  if (quotedMsg) {
    // quotedMsg pode vir como objeto ou apenas um id/string
    const quotedId: any = (quotedMsg as any)?.id ?? quotedMsg;
    let chatMessages: Message | null = null;
    if (quotedId !== undefined && quotedId !== null && String(quotedId).trim() !== "") {
      chatMessages = await Message.findOne({
        where: {
          id: quotedId
        }
      });
    }

    if (chatMessages) {
      const msgFound = JSON.parse(chatMessages.dataJson);

      if (msgFound.message.extendedTextMessage !== undefined) {
        options = {
          quoted: {
            key: msgFound.key,
            message: {
              extendedTextMessage: msgFound.message.extendedTextMessage
            }
          }
        };
      } else {
        options = {
          quoted: {
            key: msgFound.key,
            message: {
              conversation: msgFound.message.conversation
            }
          }
        };
      }

      if (ENABLE_LID_DEBUG) {
        logger.info(
          `[RDS-LID] SendMessage - ContextInfo configurado para resposta`
        );
      }
    }
  }

  // GHOST MENTIONS - Mencionar todos os participantes do grupo
  const hasAllMention = body ? body.indexOf("@all") !== -1 : false;
  if (ticket.isGroup && hasAllMention) {
    try {
      // Usar o JID do grupo que já foi montado acima
      const groupMetadata = await wbot.groupMetadata(jid);
      const botNumber = wbot.user.id.split(":")[0];
      const botJid = `${botNumber}@s.whatsapp.net`;
      
      // Obter todos os participantes exceto o bot
      const participants = groupMetadata.participants
        .filter((participant) => participant.id !== botJid)
        .map(({ id }) => id);

      // Remover todas as ocorrências de @all do texto
      const bodyMessage = body.replace(/@all\s?/g, '').trim();
      const finalBody = bodyMessage || '\u200e'; // Enviar caractere invisível se ficou vazio

      // Enviar mensagem com ghost mentions (menciona sem mostrar @nome)
      const sentMessage = await wbot.sendMessage(jid, { 
        text: formatBody(finalBody, ticket), 
        mentions: participants 
      });

      await ticket.update({ lastMessage: formatBody(body, ticket) });
      
      if (sentMessage) {
        try {
          wbot.store(sentMessage);
        } catch (storeErr) {
          logger.warn(`[RDS-BAILEYS] Erro ao armazenar mensagem ghost mention: ${storeErr.message}`);
        }
      }
      
      logger.info(`[RDS-BAILEYS] Ghost mention enviado com sucesso para ${jid} - ${participants.length} participantes mencionados`);
      return sentMessage;
    } catch (ghostErr) {
      logger.error(`[RDS-BAILEYS] Erro ao enviar ghost mention para ${jid}: ${ghostErr.message}`);
      // Em caso de erro, continuar com envio normal (sem mentions)
    }
  }

  if (!isNil(vCard)) {
    const numberContact = vCard.number;
    const firstName = vCard.name.split(" ")[0];
    const lastName = String(vCard.name).replace(vCard.name.split(" ")[0], "");

    const vcard =
      `BEGIN:VCARD\n` +
      `VERSION:3.0\n` +
      `N:${lastName};${firstName};;;\n` +
      `FN:${vCard.name}\n` +
      `TEL;type=CELL;waid=${numberContact}:+${numberContact}\n` +
      `END:VCARD`;

    try {
      await delay(msdelay);
      const sentMessage = await wbot.sendMessage(jid, {
        contacts: {
          displayName: `${vCard.name}`,
          contacts: [{ vcard }]
        }
      });

      wbot.store(sentMessage);

      await ticket.update({
        lastMessage: formatBody(vcard, ticket),
        imported: null
      });

      // Log detalhado de vCard enviado com sucesso
      logger.info(
        `[RDS-BAILEYS] vCard enviado com sucesso para contato ID=${contactNumber.id}, number=${contactNumber.number}, jid=${jid}`
      );

      return sentMessage;
    } catch (err) {
      // Log detalhado do erro de envio de vCard
      logger.error(
        `[RDS-BAILEYS] ERRO ao enviar vCard para contato ID=${contactNumber.id}, number=${contactNumber.number}, jid=${jid}: ${err.message}`
      );

      Sentry.captureException(err);
      throw new AppError(friendlySendError(err));
    }
  };
  
  try {
    await delay(msdelay);
    // A ordem aqui importa por causa do Baileys: em Utils/messages.js ele
    // aplica `mentions` primeiro (grava contextInfo.mentionedJid) e só depois
    // mescla o `contextInfo` que a gente passa. Como o nosso contextInfo só
    // tem forwardingScore/isForwarded, a mescla preserva o mentionedJid.
    // Sem menção a chave nem é enviada, então o payload fica igual ao de antes.
    const sentMessage = await wbot.sendMessage(
      jid,
      {
        text: formatBody(body, ticket),
        contextInfo: {
          forwardingScore: isForwarded ? 2 : 0,
          isForwarded: isForwarded ? true : false
        },
        ...(mentions.length > 0 ? { mentions } : {})
      },
      {
        ...options,

      }
    );

    if (mentions.length > 0) {
      logger.info(
        `[RDS-BAILEYS] Mensagem com ${mentions.length} menção(ões) enviada para ${jid}`
      );
    }
    wbot.store(sentMessage);

    await ticket.update({
      lastMessage: formatBody(body, ticket),
      imported: null
    });

    // Log detalhado de mensagem enviada com sucesso
    logger.info(
      `[RDS-BAILEYS] Mensagem enviada com sucesso para contato ID=${contactNumber.id}, number=${contactNumber.number}, jid=${jid}`
    );

    return sentMessage;
  } catch (err) {
    // Log detalhado do erro de envio para facilitar diagnóstico
    logger.error(
      `[RDS-BAILEYS] ERRO ao enviar mensagem para contato ID=${contactNumber.id}, number=${contactNumber.number}, jid=${jid}: ${err.message}`
    );


    if (ENABLE_LID_DEBUG) {
      logger.error(`[RDS-LID] Erro ao enviar mensagem para ${jid}: ${err.message}`);

      if (contactNumber.number?.includes("@lid")) {
        logger.error(`[RDS-LID] Contato com formato @lid detectado: ${contactNumber.number}`);

        try {
          const parts = contactNumber.number.split('@');
          if (parts.length > 0 && /^\d+$/.test(parts[0])) {
            const correctNumber = parts[0];
            logger.info(`[RDS-LID] Tentando corrigir número: ${contactNumber.number} -> ${correctNumber}`);

            await contactNumber.update({
              number: correctNumber,
              remoteJid: `${correctNumber}@s.whatsapp.net`
            });

            logger.info(`[RDS-LID] Contato atualizado com sucesso: ${correctNumber}`);
          }
        } catch (updateError) {
          logger.error(`[RDS-LID] Erro ao atualizar contato: ${updateError.message}`);
        }
      }
    }

    if (err.message && err.message.includes("senderMessageKeys")) {
      if (ENABLE_LID_DEBUG) {
        logger.error(
          `[RDS-LID] SendMessage - Erro de criptografia de grupo detectado: ${err.message}`
        );
      }

      try {
        if (ENABLE_LID_DEBUG) {
          logger.info(
            `[RDS-LID] SendMessage - Tentando envio sem criptografia para grupo ${jid}`
          );
        }

        const sentMessage = await wbot.sendMessage(jid, {
          text: formatBody(body, ticket)
        });

        if (ENABLE_LID_DEBUG) {
          logger.info(
            `[RDS-LID] SendMessage - Sucesso no envio sem criptografia para grupo ${jid}`
          );
        }
        wbot.store(sentMessage);
        await ticket.update({
          lastMessage: formatBody(body, ticket),
          imported: null
        });

        // Log detalhado de mensagem enviada com sucesso após retry (problema de criptografia)
        logger.info(
          `[RDS-BAILEYS] Mensagem enviada com sucesso após retry para contato ID=${contactNumber.id}, number=${contactNumber.number}, jid=${jid} (problema de criptografia resolvido)`
        );

        return sentMessage;
      } catch (finalErr) {
        if (ENABLE_LID_DEBUG) {
          logger.error(
            `[RDS-LID] SendMessage - Falha no envio sem criptografia: ${finalErr.message}`
          );
        }
        Sentry.captureException(finalErr);
        throw new AppError(
          "Falha de criptografia com este grupo. Peça para alguém enviar uma mensagem no grupo e tente responder em seguida."
        );
      }
    }

    Sentry.captureException(err);
    throw new AppError(friendlySendError(err));
  }
};

export default SendWhatsAppMessage;
