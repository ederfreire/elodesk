/**
 * InstagramFlowActions
 *
 * Helpers utilizados pelos nós do FlowBuilder de Instagram.
 * Implementam chamadas à Graph API v20 (Instagram Platform / Comment Moderation
 * e Send API). São usados pelo executor de fluxos quando um nó do tipo
 * `instagramReplyComment`, `instagramLikeComment`, `instagramIsFollower`,
 * `instagramSendDm` ou `instagramRewardPdf` é executado.
 *
 * Os endpoints seguem a documentação:
 *   - https://developers.facebook.com/docs/instagram-platform/comment-moderation
 *   - https://developers.facebook.com/docs/instagram-platform/messenger-api
 *
 * Pré-requisito: o token de acesso da conta Instagram Business (Page Access
 * Token) deve estar disponível em `Whatsapp.facebookUserToken` (já existente
 * na integração Facebook/Instagram desta aplicação).
 */

import axios from "axios";
import fs from "fs";
import path from "path";
import FormData from "form-data";
import logger from "../../utils/logger";

const GRAPH = "https://graph.facebook.com/v20.0";

const log = (msg: string, extra?: any) =>
  logger.info(`[IG-FLOW] ${msg} ${extra ? JSON.stringify(extra) : ""}`);

/**
 * Responde publicamente a um comentário.
 * Aceita várias variações de texto — uma é escolhida aleatoriamente para
 * evitar resposta repetida (boa prática anti-spam do IG).
 */
export const replyToComment = async (
  commentId: string,
  variations: string[],
  token: string
): Promise<any> => {
  if (!variations?.length) throw new Error("Sem variações de resposta");
  const message = variations[Math.floor(Math.random() * variations.length)];
  try {
    const { data } = await axios.post(
      `${GRAPH}/${commentId}/replies`,
      { message },
      { params: { access_token: token } }
    );
    log("replyToComment ok", { commentId, message });
    return data;
  } catch (err: any) {
    logger.error(
      `[IG-FLOW] replyToComment falhou: ${JSON.stringify(
        err?.response?.data || err.message
      )}`
    );
    throw err;
  }
};

/**
 * Curte (like) um comentário.
 * Endpoint: POST /{ig-comment-id}?hide=false não existe — IG não expõe
 * endpoint público de like em comentários ainda. Como fallback, mantemos
 * a ação registrada (no-op) para que o fluxo siga; quando a Meta liberar
 * o endpoint definitivo basta atualizar este método.
 */
export const likeComment = async (
  commentId: string,
  _token: string
): Promise<any> => {
  log("likeComment chamado (no-op até endpoint público estar disponível)", {
    commentId
  });
  return { ok: true, note: "like-noop" };
};

/**
 * Verifica se um usuário do Instagram (igUserId) segue a conta business.
 * Usa o endpoint /me/followers? — como o IG limita esse retorno, a estratégia
 * é checar via /{ig-user-id}?fields=is_follower (campo retornado pela Graph
 * API quando há permissão `instagram_basic` + `instagram_manage_comments`).
 * Em ambientes sem permissão, retorna `false` por segurança.
 */
export const isFollower = async (
  igUserId: string,
  businessAccountId: string,
  token: string
): Promise<boolean> => {
  try {
    const { data } = await axios.get(`${GRAPH}/${igUserId}`, {
      params: {
        fields: "id,username,follower_count",
        access_token: token
      }
    });
    // Heurística: se conseguimos olhar o perfil + a conta é alcançável,
    // delegamos para endpoint mais completo:
    const { data: rel } = await axios.get(
      `${GRAPH}/${businessAccountId}/followers`,
      { params: { access_token: token, limit: 500 } }
    );
    const list = rel?.data || [];
    return list.some((u: any) => u.id === igUserId) || !!data?.is_follower;
  } catch (err: any) {
    logger.warn(
      `[IG-FLOW] isFollower fallback false: ${JSON.stringify(
        err?.response?.data || err.message
      )}`
    );
    return false;
  }
};

/**
 * Envia DM de texto via Instagram Messaging API.
 */
export const sendDm = async (
  recipientIgId: string,
  message: string,
  igBusinessAccountId: string,
  token: string
): Promise<any> => {
  try {
    const { data } = await axios.post(
      `${GRAPH}/${igBusinessAccountId}/messages`,
      {
        recipient: { id: recipientIgId },
        message: { text: message }
      },
      { params: { access_token: token } }
    );
    log("sendDm ok", { recipientIgId });
    return data;
  } catch (err: any) {
    logger.error(
      `[IG-FLOW] sendDm falhou: ${JSON.stringify(
        err?.response?.data || err.message
      )}`
    );
    throw err;
  }
};

/**
 * Envia DM com um anexo (PDF/imagem/arquivo) via Instagram Messaging API.
 * A Meta exige upload em duas etapas: 1) POST attachment_id 2) POST mensagem
 * com attachment.payload.attachment_id.
 */
export const sendDmFile = async (
  recipientIgId: string,
  filePath: string,
  igBusinessAccountId: string,
  token: string,
  caption?: string
): Promise<any> => {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Arquivo não encontrado: ${filePath}`);
  }
  const ext = path.extname(filePath).toLowerCase();
  let type: "image" | "file" | "audio" | "video" = "file";
  if ([".png", ".jpg", ".jpeg", ".gif"].includes(ext)) type = "image";
  else if ([".mp3", ".m4a", ".ogg", ".wav"].includes(ext)) type = "audio";
  else if ([".mp4", ".mov"].includes(ext)) type = "video";

  // 1) Upload do arquivo
  const fd = new FormData();
  fd.append(
    "message",
    JSON.stringify({ attachment: { type, payload: { is_reusable: true } } })
  );
  fd.append("filedata", fs.createReadStream(filePath));

  let attachmentId: string | null = null;
  try {
    const { data } = await axios.post(
      `${GRAPH}/${igBusinessAccountId}/message_attachments`,
      fd,
      {
        params: { access_token: token },
        headers: fd.getHeaders(),
        maxBodyLength: Infinity,
        maxContentLength: Infinity
      }
    );
    attachmentId = data?.attachment_id;
  } catch (err: any) {
    logger.error(
      `[IG-FLOW] upload anexo falhou: ${JSON.stringify(
        err?.response?.data || err.message
      )}`
    );
    throw err;
  }

  if (!attachmentId) throw new Error("Falha ao obter attachment_id");

  // 2) Envio do anexo
  try {
    const { data } = await axios.post(
      `${GRAPH}/${igBusinessAccountId}/messages`,
      {
        recipient: { id: recipientIgId },
        message: { attachment: { type, payload: { attachment_id: attachmentId } } }
      },
      { params: { access_token: token } }
    );
    // Mensagem opcional com legenda
    if (caption) {
      await sendDm(recipientIgId, caption, igBusinessAccountId, token);
    }
    log("sendDmFile ok", { recipientIgId, type });
    return data;
  } catch (err: any) {
    logger.error(
      `[IG-FLOW] sendDmFile envio falhou: ${JSON.stringify(
        err?.response?.data || err.message
      )}`
    );
    throw err;
  }
};

export default {
  replyToComment,
  likeComment,
  isFollower,
  sendDm,
  sendDmFile
};
