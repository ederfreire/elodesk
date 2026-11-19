// src/services/ContactServices/CreateOrUpdateContactService.ts - CORRIGIDO
import { getIO } from "../../libs/socket";
import CompaniesSettings from "../../models/CompaniesSettings";
import Contact from "../../models/Contact";
import ContactCustomField from "../../models/ContactCustomField";
import fs from "fs";
import path, { join } from "path";
import logger from "../../utils/logger";
import { isNil } from "lodash";
import Whatsapp from "../../models/Whatsapp";
import * as Sentry from "@sentry/node";
import { ENABLE_LID_DEBUG } from "../../config/debug";
import { normalizeJid } from "../../utils";
import WhatsappLidMap from "../../models/WhatsapplidMap";
import { getWacallsProfilePicture } from "../WacallsServices/WacallsBridgeService";
import { withLock } from "../../utils/redisLock";
import { nomeDeContatoInvalido } from "../../helpers/NomeDeContato";
const axios = require("axios");

interface ExtraInfo extends ContactCustomField {
  name: string;
  value: string;
}

interface Request {
  name: string;
  number?: string;
  isGroup?: boolean;
  email?: string;
  birthDate?: Date | string; // 🎂 NOVO CAMPO ADICIONADO
  profilePicUrl?: string;
  companyId: number;
  channel?: string;
  extraInfo?: ExtraInfo[];
  remoteJid?: string;
  lid?: string;
  whatsappId?: number;
  wbot?: any;
  fromMe?: boolean;
}

interface ContactData {
  name?: string;
  number?: string;
  isGroup?: boolean;
  email?: string;
  profilePicUrl?: string;
  companyId?: number;
  extraInfo?: ExtraInfo[];
  channel?: string;
  disableBot?: boolean;
  language?: string;
  lid?: string;
}

const sanitizeContactName = (value?: string | null) => {
  const normalized = String(value || "").replace(/\s+/g, " ").trim();
  if (!normalized) return "";
  if (/^(undefined|null)(\s+(undefined|null))*$/i.test(normalized)) return "";
  return normalized;
};

const socialFallbackName = (channel: string, number: string) => {
  if (channel === "instagram") return `Instagram ${number}`;
  if (channel === "facebook") return `Facebook ${number}`;
  if (channel === "wacalls") return `WaCalls ${number}`;
  return number;
};

const normalizeChannel = (value?: string) => {
  const channel = String(value || "whatsapp").trim().toLowerCase();
  if (["wacall", "wa-calls", "wacalls-voip", "whatsapp-call", "whatsapp-calls"].includes(channel)) {
    return "wacalls";
  }
  return channel;
};

const numberFromJid = (jid?: string) =>
  String(jid || "").split("@")[0].split(":")[0].replace(/\D/g, "");

export const updateContact = async (
  contact: Contact,
  contactData: ContactData
) => {
  await contact.update(contactData);

  const io = getIO();
  io.to(`company-${contact.companyId}-mainchannel`).emit(
    `company-${contact.companyId}-contact`,
    {
      action: "update",
      contact
    }
  );
  return contact;
};

const CreateOrUpdateContactService = async ({
  name,
  number,
  // number: rawNumber,
  profilePicUrl,
  isGroup = false,
  email = "",
  birthDate = null, // 🎂 INCLUIR NO DESTRUCTURING
  channel = "whatsapp",
  companyId,
  extraInfo = [],
  remoteJid = "",
  lid = "",
  whatsappId,
  wbot,
  fromMe = false
}: Request): Promise<Contact> => {

  try {
    channel = normalizeChannel(channel);
    number = String(number || numberFromJid(remoteJid) || numberFromJid(lid) || "").trim();
    name = sanitizeContactName(name);

    // ✅ FIX NOME: Nunca usar número como nome do contato
    const nameIsNumericOrLid = !name || /^\d{10,}$/.test(name.trim());
    const nameEqualsNumber = name === number || name === number?.replace(/\D/g, "");
    if (nameIsNumericOrLid || nameEqualsNumber) {
      name = "";
    }

    // Garantir que o número esteja no formato correto (sem @lid, @s.whatsapp.net, sem sufixo de device)
    let cleanNumber = number;
    if (!isGroup) {
      // Remover @domain e sufixo :device (ex: 5521964238808:0@s.whatsapp.net → 5521964238808)
      if (cleanNumber.includes('@')) {
        cleanNumber = cleanNumber.substring(0, cleanNumber.indexOf('@'));
      }
      if (cleanNumber.includes(':')) {
        cleanNumber = cleanNumber.substring(0, cleanNumber.indexOf(':'));
        logger.info(`[CONTACT] Número com sufixo de device corrigido: ${number} -> ${cleanNumber}`);
      }
    }

    // Monta um remoteJid padrão quando não for informado
    const fallbackRemoteJid = normalizeJid(
      remoteJid || (isGroup ? `${cleanNumber}@g.us` : `${cleanNumber}@s.whatsapp.net`)
    );

    let createContact = false;
    const publicFolder = path.resolve(__dirname, "..", "..", "..", "public");
    const io = getIO();
    let contact: Contact | null;
    // Precisa existir ANTES do withLock: é usado depois que o bloco fecha.
    let updateImage = false;
    // ── Trava contra criação duplicada ──────────────────────────────────────
    //
    // Este serviço é usado pelos fluxos de SAÍDA (envio de template pela API,
    // painel, campanhas). Ele fazia "procura o contato → se não achar, cria"
    // sem nenhuma trava: dois envios quase simultâneos para o mesmo número
    // passavam os dois pela busca sem encontrar nada e criavam DOIS contatos.
    //
    // O fluxo de ENTRADA (ReceivedWhatsApp) já roda sob lock; aqui faltava.
    // Mesmo lock distribuído, chaveado por empresa + identificador.
    //
    // Atenção para quem for mexer: `updateImage` é declarado ACIMA de
    // propósito. Dentro deste bloco ele só é reatribuído — declarar de novo
    // com `let` criaria outra variável e a foto nunca seria baixada.
    const contactLockKey = `contact:lock:api:${companyId}:${(lid || cleanNumber || number || "").toString()}`;

    await withLock(
      contactLockKey,
      async () => {
    // Buscar contato: primeiro por LID, depois por número, depois parcial
    if (lid) {
      contact = await Contact.findOne({ where: { lid, companyId } });
    }
    if (!contact) {
      contact = await Contact.findOne({ where: { number: cleanNumber, companyId } });
    }
    // Fallback: busca parcial por últimos 8-9 dígitos (evita duplicatas de formato/device suffix)
    if (!contact && !isGroup && cleanNumber && cleanNumber.length >= 8) {
      const last8 = cleanNumber.slice(-8);
      const last9 = cleanNumber.slice(-9);
      const { Op } = require("sequelize");
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
        contact = partialMatches[0];
        logger.debug(`[CONTACT] Contato encontrado via busca parcial: ${contact.id} (${contact.number}) para número ${cleanNumber}`);
      } else if (partialMatches.length > 1) {
        // Preferir contato com número real (10-13 dígitos)
        const realContact = partialMatches.find(c => c.number && c.number.length >= 10 && c.number.length <= 13);
        if (realContact) {
          contact = realContact;
          logger.info(`[CONTACT] Contato real encontrado via busca parcial: ${contact.id} (${contact.number}) para número ${cleanNumber}`);
        }
      }
    }

    updateImage =
      ((!contact ||
        (contact?.profilePicUrl !== profilePicUrl && profilePicUrl !== "")) &&
        (wbot || ["instagram", "facebook", "telegram"].includes(channel))) ||
      false;

    if (contact) {
      // Atualizar remoteJid (não sobrescrever JID real com LID) — mas só
      // conta como "real" se os dígitos parecem mesmo um telefone (8-13
      // dígitos, faixa E.164 comum). Contatos que só existem como LID (sem
      // telefone exposto) podem ter ficado salvos com um remoteJid
      // "@s.whatsapp.net" fabricado a partir dos dígitos do LID (bug antigo
      // do normalizeJid, já corrigido) — LIDs normalmente têm 15+ dígitos,
      // então esse valor não passa no teste de "telefone real" e é
      // corrigido pro @lid verdadeiro assim que uma nova mensagem chega.
      const existingDigits = String(contact.remoteJid || "").split("@")[0].replace(/\D/g, "");
      const existingJidIsReal =
        !!contact.remoteJid?.includes("@s.whatsapp.net") &&
        existingDigits.length >= 8 &&
        existingDigits.length <= 13;
      const newJidIsLid = fallbackRemoteJid?.includes("@lid");
      if (!newJidIsLid || !existingJidIsReal) {
        contact.remoteJid = fallbackRemoteJid;
      }

      // Atualizar LID
      if (lid && lid !== "" && contact.lid !== lid) {
        contact.lid = lid;
      }

      if (profilePicUrl && profilePicUrl !== "" && !profilePicUrl.includes("nopicture")) {
        contact.profilePicUrl = profilePicUrl;
      } else if ((!contact.profilePicUrl || contact.profilePicUrl === "") && channel !== "telegram") {
        contact.profilePicUrl = profilePicUrl || `${process.env.FRONTEND_URL}/nopicture.png`;
      }
      contact.isGroup = isGroup;

      // 🎂 ATUALIZAR DATA DE NASCIMENTO SE FORNECIDA
      if (birthDate !== null && birthDate !== undefined) {
        let processedBirthDate: Date | null = null;
        if (typeof birthDate === "string") {
          processedBirthDate = new Date(birthDate);
          if (!isNaN(processedBirthDate.getTime())) {
            contact.birthDate = processedBirthDate;
          }
        } else {
          contact.birthDate = birthDate;
        }
      }

      if (isNil(contact.whatsappId) && !isNil(whatsappId)) {
        const whatsapp = await Whatsapp.findOne({
          where: { id: whatsappId, companyId }
        });
        if (whatsapp) {
          contact.whatsappId = whatsappId;
        }
      }

      const folder = path.resolve(publicFolder, `company${companyId}`, "contacts");
      let fileName, oldPath = "";
      if (contact.urlPicture) {
        oldPath = path.resolve(contact.urlPicture.replace(/\\/g, "/"));
        fileName = path.join(folder, oldPath.split("\\").pop());
      }

      // Forçar busca de foto quando necessário
      const currentPicIsEmpty = !contact.profilePicUrl || contact.profilePicUrl === "" || contact.profilePicUrl.includes("nopicture");
      const needsImageUpdate =
        currentPicIsEmpty ||
        !fileName ||
        !fs.existsSync(fileName) ||
        (profilePicUrl && profilePicUrl !== "" && contact.profilePicUrl !== profilePicUrl && !profilePicUrl.includes("nopicture"));

      if (needsImageUpdate && wbot) {
        try {
          const targetJid = contact.remoteJid || fallbackRemoteJid;
          const fetchedPic = await wbot.profilePictureUrl(targetJid, "image");
          if (fetchedPic) profilePicUrl = fetchedPic;
        } catch (e) {
          if (!currentPicIsEmpty) {
            profilePicUrl = contact.profilePicUrl;
          } else {
            profilePicUrl = `${process.env.FRONTEND_URL}/nopicture.png`;
          }
        }
        contact.profilePicUrl = profilePicUrl;
        updateImage = true;
      } else if (needsImageUpdate && !wbot && channel === "wacalls" && whatsappId) {
        // wacalls não tem `wbot` (Baileys) — esse branch só existia pro fluxo
        // de CRIAÇÃO de contato (linha ~325 abaixo), não pra atualização de
        // um contato JÁ existente. Resultado: todo contato wacalls que já
        // tinha ticket/mensagem antes (o caso comum de uma ligação chegando)
        // nunca buscava foto nova aqui — ficava preso pra sempre com
        // "nopicture"/iniciais, mesmo o WhatsApp tendo uma foto real (era
        // exatamente o card de chamada mostrando só a inicial "R"). Busca via
        // a mesma ponte HTTP (wacalls-chat/whatsmeow) usada na criação.
        //
        // BUG CRÍTICO já corrigido aqui: getWacallsProfilePicture é da ponte
        // ANTIGA (wacalls-voip, campo whatsapp.wacallsSessionId) — em toda
        // conexão wacalls-chat atual esse campo nunca é preenchido, então
        // fetchedPic é SEMPRE null. O código antigo, nesse caso, reusava
        // contact.profilePicUrl (que o wacalls-chat grava como um caminho
        // RELATIVO tipo "/api/media/avatars/x.jpg" — ver ensureContactAvatar
        // em WacallsChatMessageService.ts) e marcava updateImage=true, o que
        // fazia o bloco de download mais abaixo tentar `axios.get()` nesse
        // caminho relativo sem baseURL — sempre estourava "Invalid URL". Essa
        // função não tem try/catch ao redor daquele axios.get(), então a
        // exceção subia sem tratamento até HandleWacallsIncoming e abortava
        // TODA a mensagem antes dela virar ticket — o sintoma era "conectei
        // mas não chega nenhuma mensagem" pra qualquer contato que já
        // tivesse tido a foto sincronizada uma vez. Correção: só marca
        // updateImage=true quando realmente achou uma foto nova pra baixar;
        // se não achou nada novo, não mexe em nada (a foto que já está
        // salva localmente continua valendo, sem re-tentar baixar o caminho
        // relativo do wacalls-chat como se fosse URL externa).
        try {
          const targetJid = contact.remoteJid || fallbackRemoteJid;
          const waConn = await Whatsapp.findByPk(whatsappId);
          const fetchedPic = waConn ? await getWacallsProfilePicture(waConn, targetJid) : null;
          if (fetchedPic) {
            profilePicUrl = fetchedPic;
            contact.profilePicUrl = profilePicUrl;
            updateImage = true;
          } else if (currentPicIsEmpty) {
            profilePicUrl = `${process.env.FRONTEND_URL}/nopicture.png`;
            contact.profilePicUrl = profilePicUrl;
          }
          // else: já tem foto salva e não achou nada novo — não mexe.
        } catch (e) {
          if (currentPicIsEmpty) {
            profilePicUrl = `${process.env.FRONTEND_URL}/nopicture.png`;
            contact.profilePicUrl = profilePicUrl;
          }
        }
      } else if (needsImageUpdate && profilePicUrl && profilePicUrl !== "" && !profilePicUrl.includes("nopicture")) {
        contact.profilePicUrl = profilePicUrl;
        updateImage = true;
      }

      // FIX NOME: Atualizar nome somente se o atual é ruim e o novo é real
      // Antes o teste era /^\d{10,}$/ — só pegava dígito puro com 10+ casas.
      // Deixava passar número mascarado ("+34•••••31") e número curto, que
      // então eram tratados como "nome de verdade" e bloqueavam a atualização
      // pelo nome real que viesse depois. Passou a usar o mesmo teste dos
      // pontos de entrada (helpers/NomeDeContato).
      const currentNameIsNumericLid = nomeDeContatoInvalido(contact.name);
      const newNameIsNumericLid = nomeDeContatoInvalido(name);
      const currentNameIsNumber = contact.name === number || contact.name === cleanNumber;
      const currentNameIsEmpty = !contact.name || contact.name.trim() === "";
      const currentNameIsBadPlaceholder = !sanitizeContactName(contact.name);
      const newNameIsReal = name && !newNameIsNumericLid && name !== number && name !== cleanNumber;
      const fallbackNameIsAllowed = ["facebook", "instagram", "wacalls"].includes(channel);

      if ((currentNameIsNumber || currentNameIsNumericLid || currentNameIsEmpty || currentNameIsBadPlaceholder) && newNameIsReal) {
        logger.info(`[CONTACT-NAME-FIX] Atualizando nome: '${contact.name}' -> '${name}'`);
        contact.name = name;
      } else if ((currentNameIsEmpty || currentNameIsBadPlaceholder) && fallbackNameIsAllowed) {
        const fallbackName = socialFallbackName(channel, cleanNumber);
        logger.info(`[CONTACT-NAME-FIX] Atualizando nome placeholder: '${contact.name}' -> '${fallbackName}'`);
        contact.name = fallbackName;
      }

      await contact.save(); // Ensure save() is called to trigger updatedAt
      await contact.reload();
      // if (ENABLE_LID_DEBUG) {
      //   logger.info(
      //     `[RDS-LID] Contato atualizado: id=${contact.id}, number=${contact.number}, jid=${contact.remoteJid}, lid=${contact.lid}`
      //   );
      // }
    } else if (["whatsapp", "wacalls"].includes(channel)) {
      const settings = await CompaniesSettings.findOne({
        where: { companyId }
      });
      const acceptAudioMessageContact = settings?.acceptAudioMessageContact;
      const newRemoteJid = fallbackRemoteJid;

      // if (!remoteJid && remoteJid !== "") {
      //   newRemoteJid = isGroup
      //     ? `${rawNumber}@g.us`
      //     : `${rawNumber}@s.whatsapp.net`;
      // }

      if (ENABLE_LID_DEBUG) {
        logger.info(
          `[RDS-LID] Criando novo contato: number=${number}, jid=${newRemoteJid}, lid=${lid}`
        );
      }
      if (channel === "wacalls" && whatsappId) {
        // wacalls não tem `wbot` (Baileys) — a foto vem do microserviço
        // Go/whatsmeow via bridge HTTP.
        try {
          const waConn = await Whatsapp.findByPk(whatsappId);
          const pic = waConn ? await getWacallsProfilePicture(waConn, newRemoteJid) : null;
          profilePicUrl = pic || `${process.env.FRONTEND_URL}/nopicture.png`;
        } catch (e) {
          profilePicUrl = `${process.env.FRONTEND_URL}/nopicture.png`;
        }
      } else if (wbot) {
        try {
          profilePicUrl = await wbot.profilePictureUrl(newRemoteJid, "image");
        } catch (e) {
          profilePicUrl = `${process.env.FRONTEND_URL}/nopicture.png`;
        }
      } else {
        profilePicUrl = `${process.env.FRONTEND_URL}/nopicture.png`;
      }

      // 🎂 PROCESSAR DATA DE NASCIMENTO PARA NOVO CONTATO
      let processedBirthDate: Date | null = null;
      if (birthDate) {
        if (typeof birthDate === "string") {
          processedBirthDate = new Date(birthDate);
          // Validar se a data é válida
          if (isNaN(processedBirthDate.getTime())) {
            processedBirthDate = null;
          }
        } else {
          processedBirthDate = birthDate;
        }
      }

      try {
        // Verificar se conseguimos obter o LID via API do WhatsApp
        let lidToUse = lid || null;

        // ✅ v7: Consultar WhatsappLidMap localmente antes de chamar onWhatsApp
        if (!lidToUse) {
          const localMap = await WhatsappLidMap.findOne({
            where: { companyId },
            include: [{
              model: Contact,
              as: "contact",
              where: { number: cleanNumber }
            }]
          });

          if (localMap) {
            lidToUse = localMap.lid;
            if (ENABLE_LID_DEBUG) {
              logger.info(
                `[RDS-LID] LID resolvido localmente para novo contato: ${lidToUse}`
              );
            }
          }
        }

        // Fallback: Se não temos LID e temos wbot, tenta consultar via onWhatsApp
        if (!lidToUse && wbot && newRemoteJid) {
          try {
            const ow = await wbot.onWhatsApp(newRemoteJid);
            if (ow?.[0]?.exists && ow?.[0]?.lid) {
              lidToUse = ow[0].lid as string;
              if (ENABLE_LID_DEBUG) {
                logger.info(
                  `[RDS-LID] LID obtido via onWhatsApp fallback para novo contato: ${lidToUse}`
                );
              }
            }
          } catch (error) {
            if (ENABLE_LID_DEBUG) {
              logger.error(`[RDS-LID] Erro ao consultar LID via onWhatsApp para novo contato: ${error.message}`);
            }
          }
        }

        // Criando contato com LID quando disponível
        contact = await Contact.create({
          name: name || cleanNumber, // Usar número como fallback APENAS na criação inicial
          number: cleanNumber, // Usar o número limpo aqui
          email,
          birthDate: processedBirthDate, // 🎂 INCLUIR NO CREATE
          isGroup,
          companyId,
          channel,
          acceptAudioMessage:
            acceptAudioMessageContact === "enabled" ? true : false,
          remoteJid: normalizeJid(newRemoteJid),
          lid: lidToUse, // Usa o LID obtido da API ou o passado no parâmetro
          profilePicUrl,
          urlPicture: "",
          whatsappId
        });
        if (ENABLE_LID_DEBUG) {
          logger.info(
            `[RDS-LID] Novo contato criado: id=${contact.id}, number=${contact.number}, jid=${contact.remoteJid}, lid=${contact.lid}`
          );
        }
        createContact = true;
      } catch (err) {
        // Verificar se é erro de unicidade (contato já existe)
        if (err.name === 'SequelizeUniqueConstraintError') {
          logger.info(`[RDS-CONTACT] Contato já existe, buscando e reativando: number=${number}, companyId=${companyId}`);

          // Buscar o contato existente que pode estar inativo
          contact = await Contact.findOne({
            where: {
              number,
              companyId
            }
          });

          if (contact) {
            // Reativar o contato se estiver inativo
            if (!contact.active) {
              await contact.update({
                active: true,
                profilePicUrl,
                remoteJid: normalizeJid(newRemoteJid),
                lid: lid || null
              });

              logger.info(`[RDS-CONTACT] Contato reativado: id=${contact.id}, number=${contact.number}`);
            }
          } else {
            // Caso muito improvável - erro de unicidade, mas contato não encontrado
            logger.error(`[RDS-CONTACT] Erro de unicidade, mas contato não encontrado: ${err.message}`);
            throw err;
          }
        } else {
          // Outros erros são repassados
          logger.error(`[RDS-CONTACT] Erro ao criar contato: ${err.message}`);
          throw err;
        }
      }
    } else if (["telegram"].includes(channel)) {
      // Telegram: contato novo
      try {
        contact = await Contact.create({
          name: name || cleanNumber,
          number: cleanNumber,
          email,
          isGroup,
          companyId,
          channel,
          profilePicUrl: profilePicUrl || `${process.env.FRONTEND_URL}/nopicture.png`,
          urlPicture: "",
          whatsappId
        });
        createContact = true;
      } catch (err) {
        if (err.name === 'SequelizeUniqueConstraintError') {
          logger.info(`[RDS-CONTACT] Contato telegram já existe, buscando: number=${number}, companyId=${companyId}`);
          contact = await Contact.findOne({
            where: { number: cleanNumber, companyId, channel }
          });
          if (contact && !contact.active) {
            await contact.update({ active: true, profilePicUrl });
            logger.info(`[RDS-CONTACT] Contato telegram reativado: id=${contact.id}`);
          }
          if (!contact) {
            logger.error(`[RDS-CONTACT] Erro de unicidade telegram, mas contato não encontrado: ${err.message}`);
            throw err;
          }
        } else {
          logger.error(`[RDS-CONTACT] Erro ao criar contato telegram: ${err.message}`);
          throw err;
        }
      }
    } else if (["facebook", "instagram"].includes(channel)) {
      // 🎂 PROCESSAR DATA DE NASCIMENTO PARA REDES SOCIAIS - CORREÇÃO DE TIMEZONE
      let processedBirthDate: Date | null = null;
      if (birthDate) {
        if (typeof birthDate === "string") {
          // Se vier no formato ISO, extrair apenas a parte da data
          const dateOnly = birthDate.split('T')[0];
          // Criar data local com meio-dia para evitar problemas de timezone
          const [year, month, day] = dateOnly.split('-').map(Number);
          processedBirthDate = new Date(year, month - 1, day, 12, 0, 0);
        } else if (birthDate instanceof Date) {
          // Se for objeto Date, criar nova data local com meio-dia
          const year = birthDate.getFullYear();
          const month = birthDate.getMonth();
          const day = birthDate.getDate();
          processedBirthDate = new Date(year, month, day, 12, 0, 0);
        }
      }

      try {
        contact = await Contact.create({
          name: name || socialFallbackName(channel, cleanNumber),
          number: cleanNumber, // Usar o número limpo aqui
          email,
          birthDate: processedBirthDate, // 🎂 INCLUIR NO CREATE
          isGroup,
          companyId,
          channel,
          profilePicUrl,
          urlPicture: "",
          whatsappId
        });
        createContact = true;
      } catch (err) {
        // Verificar se é erro de unicidade (contato já existe)
        if (err.name === 'SequelizeUniqueConstraintError') {
          logger.info(`[RDS-CONTACT] Contato social já existe, buscando e reativando: number=${number}, companyId=${companyId}, canal=${channel}`);

          // Buscar o contato existente que pode estar inativo
          contact = await Contact.findOne({
            where: {
              number: cleanNumber, // Usar o número limpo aqui
              companyId,
              channel
            }
          });

          if (contact) {
            // Reativar o contato se estiver inativo
            if (!contact.active) {
              await contact.update({
                active: true,
                profilePicUrl
              });

              logger.info(`[RDS-CONTACT] Contato social reativado: id=${contact.id}, number=${contact.number}, canal=${channel}`);
            }
          } else {
            // Caso muito improvável - erro de unicidade, mas contato não encontrado
            logger.error(`[RDS-CONTACT] Erro de unicidade no contato social, mas contato não encontrado: ${err.message}`);
            throw err;
          }
        } else {
          // Outros erros são repassados
          logger.error(`[RDS-CONTACT] Erro ao criar contato social: ${err.message}`);
          throw err;
        }
      }
    }
      },
      { ttlSeconds: 15, maxRetries: 8, retryDelayMs: 300 }
    );

    // Se ainda não temos contato aqui, não prossiga para evitar null reference
    if (!contact) {
      throw new Error(
        "Não foi possível criar ou localizar o contato. Informe o número/canal corretamente."
      );
    }

    if (updateImage) {
      const folder = path.resolve(
        publicFolder,
        `company${companyId}`,
        "contacts"
      );

      if (!fs.existsSync(folder)) {
        fs.mkdirSync(folder, { recursive: true });
        fs.chmodSync(folder, 0o777);
      }

      let filename;
      // Blindagem: só tenta baixar quando profilePicUrl é mesmo uma URL
      // http(s) absoluta (o formato que Baileys/Instagram/Facebook sempre
      // passam aqui). Qualquer outra coisa (caminho relativo tipo
      // "/api/media/avatars/x.jpg", que é como o wacalls-chat referencia
      // seus próprios assets — ver ensureContactAvatar em
      // WacallsChatMessageService.ts) faz `axios.get()` estourar
      // "Invalid URL" (sem baseURL configurado neste client). Antes disso
      // não existia esse guard nem try/catch ao redor do axios.get: a
      // exceção subia sem tratamento até HandleWacallsIncoming e abortava a
      // mensagem inteira ANTES dela virar ticket — sintoma reportado como
      // "conectei mas não chega nenhuma mensagem" pra contatos que já
      // tinham foto sincronizada.
      const isAbsoluteHttpUrl = !isNil(profilePicUrl) && /^https?:\/\//i.test(profilePicUrl);
      if (isNil(profilePicUrl) || profilePicUrl.includes("nopicture") || !isAbsoluteHttpUrl) {
        filename = "nopicture.png";
      } else {
        filename = `${contact.id}.jpeg`;
        const filePath = join(folder, filename);

        // Verifica se o arquivo já existe e se o profilePicUrl não mudou
        if (fs.existsSync(filePath) && contact.urlPicture === filename) {
          // Arquivo já existe e é o mesmo, não precisa baixar novamente
          updateImage = false;
        } else {
          try {
            // Remove arquivo antigo se existir
            if (!isNil(contact.urlPicture) && contact.urlPicture !== filename) {
              const oldPath = path.resolve(
                contact.urlPicture.replace(/\\/g, "/")
              );
              const oldFileName = path.join(folder, oldPath.split("\\").pop());

              if (fs.existsSync(oldFileName)) {
                fs.unlinkSync(oldFileName);
              }
            }

            const response = await axios.get(profilePicUrl, {
              responseType: "arraybuffer"
            });

            // Save the image to the directory
            fs.writeFileSync(filePath, response.data);
          } catch (err: any) {
            // Falha de rede/download não pode derrubar a criação do
            // contato/ticket/mensagem — só loga e segue sem atualizar a foto.
            logger.warn(`[CONTACT] falha ao baixar foto de perfil (${profilePicUrl}): ${err?.message}`);
            updateImage = false;
          }
        }
      }

      // Atualiza o contato apenas se a imagem mudou ou se não tinha urlPicture
      if (updateImage || isNil(contact.urlPicture)) {
        await contact.update({
          urlPicture: filename,
          pictureUpdated: true
        });

        await contact.reload();
      }
    }

    if (createContact) {
      io.of(String(companyId)).emit(`company-${companyId}-contact`, {
        action: "create",
        contact
      });
    } else {
      io.of(String(companyId)).emit(`company-${companyId}-contact`, {
        action: "update",
        contact
      });
    }

    if (ENABLE_LID_DEBUG) {
      logger.info(
        `[RDS-LID] Retornando contato: { jid: '${contact.remoteJid}', exists: true, lid: '${contact.lid}' }`
      );
    }
    return contact;
  } catch (err) {
    logger.error(
      `Error to find or create a contact: channel=${channel} number=${number} isGroup=${isGroup} remoteJid=${remoteJid} companyId=${companyId} msg=${err?.message || err}`
    );
    throw err;
  }
};

export default CreateOrUpdateContactService;
