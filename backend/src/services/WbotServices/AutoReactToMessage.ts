import Message from "../../models/Message";
import Ticket from "../../models/Ticket";
import CompaniesSettings from "../../models/CompaniesSettings";
import ReactWhatsAppMessage from "./ReactWhatsAppMessage";
import logger from "../../utils/logger";

/**
 * Reage automaticamente à mensagem recebida do contato.
 *
 * O envio em si reaproveita o ReactWhatsAppMessage, que já existia para a
 * reação manual do atendente — não há protocolo novo aqui, só o gatilho.
 *
 * SÓ BAILEYS. A API Oficial não expõe envio de reação, e Telegram, Instagram
 * e Facebook não têm o recurso. Reagir só onde dá é melhor que tentar em
 * todos e encher o log de erro.
 */
const AutoReactToMessage = async (
  message: Message,
  ticket: Ticket,
  companyId: number
): Promise<void> => {
  try {
    // Mensagem própria, privada ou de grupo não entra: o recurso é para
    // sinalizar ao CLIENTE que a mensagem dele chegou.
    if (message.fromMe || message.isPrivate || ticket.isGroup) return;

    const canal = ticket.whatsapp?.channel || ticket.channel;
    if (canal && canal !== "whatsapp") return;

    // A coluna autoReactionRules é nova. Se a migration ainda não rodou neste
    // servidor, pedir essa coluna faz o banco recusar a consulta INTEIRA — e
    // aí nem a reação antiga (emoji único) funcionaria. Por isso tentamos com
    // a coluna e, se ela não existir, repetimos sem ela.
    let config: any = null;
    let colunaDeRegrasExiste = true;

    try {
      config = await CompaniesSettings.findOne({
        where: { companyId },
        attributes: ["autoReaction", "autoReactionEmoji", "autoReactionRules"]
      });
    } catch (erroDeColuna: any) {
      colunaDeRegrasExiste = false;
      logger.warn(
        `[AutoReaction] Coluna autoReactionRules ausente — usando apenas o emoji único. ` +
        `Rode as migrations para habilitar as regras por palavra-chave. ` +
        `Detalhe: ${erroDeColuna?.message || erroDeColuna}`
      );
      config = await CompaniesSettings.findOne({
        where: { companyId },
        attributes: ["autoReaction", "autoReactionEmoji"]
      });
    }

    if (!config?.autoReaction) return;

    // REGRAS POR PALAVRA-CHAVE
    //
    // Cada regra tem palavras e um conjunto de emojis. Se o texto da mensagem
    // contém alguma das palavras, sorteamos um emoji daquele conjunto — assim
    // a reação não é sempre a mesma. Comparação sem acento e sem diferenciar
    // maiúsculas, senão "Bom dia" não casaria com "bom dia".
    const normalizar = (texto: string) =>
      (texto || "")
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "");

    const corpo = normalizar(message.body || "");

    // Dependendo do driver, o JSONB pode voltar como texto — aceitamos os dois.
    let regrasBrutas: any = colunaDeRegrasExiste ? config.autoReactionRules : null;
    if (typeof regrasBrutas === "string") {
      try {
        regrasBrutas = JSON.parse(regrasBrutas);
      } catch (e) {
        regrasBrutas = null;
      }
    }
    const regras = Array.isArray(regrasBrutas) ? regrasBrutas : [];

    // Regra sem palavra ou sem emoji não conta para nada: se TODAS estiverem
    // assim, o comportamento volta a ser o emoji único, em vez de o contato
    // ficar sem reação nenhuma sem entender o motivo.
    const regrasUteis = regras.filter(
      (r: any) =>
        Array.isArray(r?.keywords) && r.keywords.length > 0 &&
        Array.isArray(r?.emojis) && r.emojis.filter(Boolean).length > 0
    );

    let emoji: string | null = null;

    for (const regra of regrasUteis) {
      const palavras = Array.isArray(regra?.keywords) ? regra.keywords : [];
      const emojis = (Array.isArray(regra?.emojis) ? regra.emojis : []).filter(Boolean);
      if (!palavras.length || !emojis.length) continue;

      const casou = palavras.some((palavra: string) => {
        const alvo = normalizar(palavra).trim();
        return alvo.length > 0 && corpo.includes(alvo);
      });

      if (casou) {
        emoji = emojis[Math.floor(Math.random() * emojis.length)];
        logger.info(
          `[AutoReaction] Regra casou para o ticket ${ticket.id} — emoji sorteado: ${emoji}`
        );
        break;
      }
    }

    // Nenhuma regra casou: mantém o comportamento antigo (emoji único).
    // Se a empresa já tem regras cadastradas, uma mensagem que não casa com
    // nenhuma NÃO recebe reação — senão as regras não teriam serventia.
    if (!emoji) {
      if (regrasUteis.length > 0) {
        logger.info(
          `[AutoReaction] Nenhuma das ${regrasUteis.length} regra(s) casou com "${(message.body || "").slice(0, 40)}" — sem reação.`
        );
        return;
      }
      emoji = config.autoReactionEmoji || "👍";
    }


    await ReactWhatsAppMessage({ message, ticket, emoji });
  } catch (err: any) {
    // Falha na reação não pode afetar o recebimento da mensagem. O contato
    // não ver o emoji é um detalhe; a mensagem não ser salva é um problema.
    logger.warn(`[AutoReaction] ${err?.message || err}`);
  }
};

export default AutoReactToMessage;
