import Contact from "../../models/Contact";
import Whatsapp from "../../models/Whatsapp";
import { getWbot } from "../../libs/wbot";
import logger from "../../utils/logger";
import { Op } from "sequelize";
import path from "path";
import fs from "fs";
import axios from "axios";

/**
 * Força a atualização da foto de perfil de TODOS os contatos.
 * Pode ser chamado via endpoint ou via CLI.
 *
 * @param companyId - ID da empresa
 * @param batchSize - Quantos contatos processar por lote (default 50)
 * @param delayMs - Delay entre cada busca para não sobrecarregar (default 1500ms)
 */
const ForceUpdateContactPhotos = async (
  companyId: number,
  batchSize: number = 50,
  delayMs: number = 1500
): Promise<{ updated: number; failed: number; skipped: number; total: number }> => {
  const stats = { updated: 0, failed: 0, skipped: 0, total: 0 };

  // Buscar conexão WhatsApp ativa
  const whatsapp = await Whatsapp.findOne({
    where: {
      companyId,
      status: "CONNECTED"
    }
  });

  if (!whatsapp) {
    logger.error(`[FORCE-PHOTO] Nenhuma conexão WhatsApp ativa para company ${companyId}`);
    throw new Error("Nenhuma conexão WhatsApp ativa encontrada");
  }

  const wbot = getWbot(whatsapp.id);
  if (!wbot) {
    throw new Error("Instância do WhatsApp bot não encontrada");
  }

  const publicFolder = path.resolve(__dirname, "..", "..", "..", "public");
  const folder = path.resolve(publicFolder, `company${companyId}`, "contacts");

  // Criar pasta se não existir
  if (!fs.existsSync(folder)) {
    fs.mkdirSync(folder, { recursive: true });
  }

  // Buscar todos os contatos da empresa (não grupos)
  let offset = 0;
  let hasMore = true;

  while (hasMore) {
    const contacts = await Contact.findAll({
      where: {
        companyId,
        isGroup: false,
        number: {
          [Op.and]: [
            { [Op.not]: null },
            { [Op.ne]: "" },
            { [Op.notLike]: "LID_%" }
          ]
        }
      },
      limit: batchSize,
      offset,
      order: [["id", "ASC"]]
    });

    if (contacts.length === 0) {
      hasMore = false;
      break;
    }

    stats.total += contacts.length;

    for (const contact of contacts) {
      try {
        const jid = contact.remoteJid || `${contact.number}@s.whatsapp.net`;

        // Buscar foto de perfil do WhatsApp
        let profilePicUrl: string;
        try {
          profilePicUrl = await wbot.profilePictureUrl(jid, "image");
        } catch (e) {
          // Contato pode não ter foto ou ter bloqueado
          stats.skipped++;
          continue;
        }

        if (!profilePicUrl || profilePicUrl.includes("nopicture")) {
          stats.skipped++;
          continue;
        }

        // Baixar e salvar a imagem localmente
        try {
          const response = await axios.get(profilePicUrl, {
            responseType: "arraybuffer",
            timeout: 10000
          });

          const fileName = `${contact.id}.jpeg`;
          const filePath = path.join(folder, fileName);
          fs.writeFileSync(filePath, response.data);

          const localUrl = path.join(
            "public",
            `company${companyId}`,
            "contacts",
            fileName
          );

          await contact.update({
            profilePicUrl,
            urlPicture: localUrl
          });

          stats.updated++;
          logger.info(
            `[FORCE-PHOTO] ✅ Foto atualizada: contato ${contact.id} (${contact.name || contact.number})`
          );
        } catch (downloadErr) {
          // Não conseguiu baixar, salvar apenas a URL
          await contact.update({ profilePicUrl });
          stats.updated++;
          logger.warn(
            `[FORCE-PHOTO] Foto URL salva (sem download local): contato ${contact.id} - ${downloadErr.message}`
          );
        }

        // Delay para não sobrecarregar a API do WhatsApp
        await new Promise(resolve => setTimeout(resolve, delayMs));
      } catch (err) {
        stats.failed++;
        logger.warn(
          `[FORCE-PHOTO] ❌ Erro ao buscar foto do contato ${contact.id} (${contact.number}): ${err.message}`
        );
      }
    }

    offset += batchSize;
    logger.info(
      `[FORCE-PHOTO] Progresso: ${offset} contatos processados (${stats.updated} atualizados, ${stats.skipped} sem foto, ${stats.failed} erros)`
    );
  }

  logger.info(
    `[FORCE-PHOTO] ✅ Concluído! Total: ${stats.total}, Atualizados: ${stats.updated}, Sem foto: ${stats.skipped}, Erros: ${stats.failed}`
  );

  return stats;
};

export default ForceUpdateContactPhotos;
