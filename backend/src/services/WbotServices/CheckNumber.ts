// WASocket type disponível via Session
import AppError from "../../errors/AppError";
import GetDefaultWhatsApp from "../../helpers/GetDefaultWhatsApp";
import { getWbot } from "../../libs/wbot";
import Whatsapp from "../../models/Whatsapp";
import logger from "../../utils/logger";
import { Session } from "../../libs/wbot";
import WhatsappLidMap from "../../models/WhatsapplidMap";
import Contact from "../../models/Contact";

interface IOnWhatsapp {
  jid: string;
  exists: boolean;
  lid: string;
}

const toJid = (num: string) =>
  num.includes("@") ? num : `${num}@s.whatsapp.net`;

const checker = async (number: string, wbot: Session, companyId?: number): Promise<IOnWhatsapp> => {
  // ✅ v7: Consultar WhatsappLidMap localmente antes de chamar onWhatsApp
  if (companyId) {
    const cleanNumber = number.includes("@") ? number.split("@")[0] : number;
    const contact = await Contact.findOne({ where: { number: cleanNumber, companyId } });
    if (contact) {
      const localMap = await WhatsappLidMap.findOne({
        where: { companyId, contactId: contact.id }
      });
      if (localMap) {
        logger.debug(`[CheckNumber] Contato ${cleanNumber} validado localmente via WhatsappLidMap`);
        return {
          jid: toJid(cleanNumber),
          exists: true,
          lid: localMap.lid
        };
      }
    }
  }

  // Fallback: consultar onWhatsApp
  const result = await wbot.onWhatsApp(toJid(number));

  if (!result) {
    logger.error({ number }, "Failed to check number on whatsapp");
    throw new AppError("ERR_INVALID_NUMBER", 400);
  }

  if (!result?.[0]?.exists) {
    throw new AppError("ERR_CHECK_NUMBER", 404);
  }

  const lid = (result[0] as any)?.lid ?? null;

  return {
    jid: result[0]?.jid,
    exists: true,
    lid
  };
};

const CheckContactNumber = async (
  number: string,
  companyId: number,
  isGroup: boolean = false,
  userId?: number,
  whatsapp?: Whatsapp | null
): Promise<IOnWhatsapp> => {
  const digitsOnly = String(number || "").replace(/\D/g, "");

  // Tenta obter conexão padrão. Se NENHUMA conexão Baileys estiver conectada,
  // permite criar contato/ticket mesmo assim (útil para WhatsApp Oficial,
  // pré-cadastros e quando o usuário ainda está conectando a sessão).
  let whatsappList: Whatsapp | null = whatsapp || null;
  if (!whatsappList) {
    try {
      whatsappList = await GetDefaultWhatsApp(companyId, userId);
    } catch (err) {
      logger.warn(
        `[CheckContactNumber] Nenhuma conexão WhatsApp ativa para companyId=${companyId}. Aceitando número ${digitsOnly} sem validar.`
      );
      return { jid: toJid(digitsOnly), exists: true, lid: null };
    }
  }

  // WhatsApp Oficial (Meta) não valida via onWhatsApp — Meta entrega só dígitos.
  if (whatsappList.channel === "whatsapp_oficial") {
    return { jid: toJid(digitsOnly), exists: true, lid: null };
  }

  // Tenta obter wbot Baileys. Se a sessão não estiver inicializada,
  // segue em frente sem validar (não bloqueia criação de contato/ticket).
  let wbot: Session;
  try {
    wbot = getWbot(whatsappList.id);
  } catch (err) {
    logger.warn(
      `[CheckContactNumber] Sessão Baileys #${whatsappList.id} não inicializada. Aceitando número ${digitsOnly} sem validar.`
    );
    return { jid: toJid(digitsOnly), exists: true, lid: null };
  }

  if (isGroup) {
    try {
      const meta = await wbot.groupMetadata(number);
      return { jid: meta.id, exists: true, lid: null };
    } catch (err) {
      logger.warn(`[CheckContactNumber] Falha groupMetadata: ${err?.message}`);
      return { jid: toJid(digitsOnly), exists: true, lid: null };
    }
  }

  try {
    return await checker(number, wbot, companyId);
  } catch (err) {
    // Se a consulta onWhatsApp falhar por motivo de sessão/rede, ainda
    // aceita o contato em vez de bloquear o usuário.
    if (err?.message === "ERR_CHECK_NUMBER" || err?.message === "ERR_INVALID_NUMBER") {
      throw err; // número claramente inválido — mantém o erro
    }
    logger.warn(
      `[CheckContactNumber] onWhatsApp falhou (${err?.message}). Aceitando ${digitsOnly} sem validar.`
    );
    return { jid: toJid(digitsOnly), exists: true, lid: null };
  }
};

export default CheckContactNumber;
