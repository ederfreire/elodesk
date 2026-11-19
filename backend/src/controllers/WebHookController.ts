import { Request, Response } from "express";
import { Op } from "sequelize";
import Whatsapp from "../models/Whatsapp";
import { handleMessage, handleChange } from "../services/FacebookServices/facebookMessageListener";
import GetMetaCredentials from "../helpers/GetMetaCredentials";

export const index = async (req: Request, res: Response): Promise<Response> => {
  const { verifyToken } = await GetMetaCredentials();

  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode && token) {
    if (mode === "subscribe" && token === verifyToken) {
      return res.status(200).send(challenge);
    }
  }

  return res.status(403).json({
    message: "Forbidden"
  });
};

export const webHook = async (
  req: Request,
  res: Response
): Promise<Response> => {
  try {
    const { body } = req;
    
    // ✅ NOVO: Log completo do body recebido para debug
    
    if (body.object === "page" || body.object === "instagram") {
      const defaultChannel = body.object === "instagram" ? "instagram" : "facebook";

      const findConnection = async (entry: any, event?: any) => {
        const recipientId = event?.recipient?.id;
        const candidateIds = [recipientId, entry.id].filter(Boolean);
        const candidateChannels = ["instagram", "facebook"];

        for (const facebookPageUserId of candidateIds) {
          for (const channel of candidateChannels) {
            const connection = await Whatsapp.findOne({
              where: {
                facebookPageUserId,
                channel
              }
            });

            if (connection) return connection;
          }
        }

        const fallbackConnections = await Whatsapp.findAll({
          where: {
            channel: { [Op.in]: candidateChannels },
            status: "CONNECTED"
          }
        });

        const instagramFallbacks = fallbackConnections.filter(connection => connection.channel === "instagram");
        const safeFallbacks = instagramFallbacks.length ? instagramFallbacks : fallbackConnections;

        if (safeFallbacks.length === 1) {
          const [connection] = safeFallbacks;

          console.warn(`[WEBHOOK] ⚠️ Usando fallback da conexão ${connection.id} (${connection.channel}) para ids recebidos: ${candidateIds.join(", ")}`);

          if (connection.channel === "instagram" && entry.id && connection.facebookPageUserId !== entry.id) {
            await connection.update({ facebookPageUserId: entry.id });
            console.warn(`[WEBHOOK] ✅ facebookPageUserId da conexão Instagram ${connection.id} atualizado para entry.id ${entry.id}`);
          }

          return connection;
        }

        if (safeFallbacks.length > 1) {
          console.warn(`[WEBHOOK] ⚠️ Existem ${safeFallbacks.length} conexões possíveis; não foi possível escolher automaticamente. IDs recebidos: ${candidateIds.join(", ")}`);
        }

        return null;
      };

      for (const entry of body.entry || []) {
        
        // ✅ NOVO: Log específico para Instagram - verificar se há outros campos além de messaging e changes
        if (defaultChannel === "instagram") {
          
          // Verificar se há dados em outros campos
        }

        if (entry.messaging?.length) {
          for (const data of entry.messaging) {
            const getTokenPage = await findConnection(entry, data);

            if (!getTokenPage) {
              console.warn(`[WEBHOOK] ⚠️ Conexão não encontrada para entry.id: ${entry.id}, recipient.id: ${data.recipient?.id}`);
              continue;
            }

            try {
              await handleMessage(getTokenPage, data, getTokenPage.channel, getTokenPage.companyId);
            } catch (handleErr: any) {
              console.error(`[WEBHOOK] ❌ Erro em handleMessage para sender=${data.sender?.id}:`, handleErr?.message, handleErr?.stack);
            }
          }
        }

        const getTokenPage = await findConnection(entry);

        if (getTokenPage) {

          entry.changes?.forEach((change: any) => {
            handleChange(getTokenPage, change, getTokenPage.channel, getTokenPage.companyId);
          });
          
          // ✅ NOVO: Para Instagram, verificar se há comentários em outros lugares além de changes
          if (getTokenPage.channel === "instagram" && entry.comments) {
            // Criar um pseudo-change para processar
            const pseudoChange = {
              field: "comments",
              value: entry.comments
            };
            handleChange(getTokenPage, pseudoChange, getTokenPage.channel, getTokenPage.companyId);
          }
          
          if (getTokenPage.channel === "instagram" && entry.comment) {
            // Criar um pseudo-change para processar
            const pseudoChange = {
              field: "comment",
              value: entry.comment
            };
            handleChange(getTokenPage, pseudoChange, getTokenPage.channel, getTokenPage.companyId);
          }
        } else if (!entry.messaging?.length) {
          console.warn(`[WEBHOOK] ⚠️ Conexão não encontrada para entry.id: ${entry.id}, channel padrão: ${defaultChannel}`);
        }
      }

      return res.status(200).json({
        message: "EVENT_RECEIVED"
      });
    }

    return res.status(404).json({
      message: body
    });
  } catch (error) {
    return res.status(500).json({
      message: error
    });
  }
};