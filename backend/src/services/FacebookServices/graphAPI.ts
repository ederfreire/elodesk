import axios from "axios";
import FormData from "form-data";
import { createReadStream } from "fs";
import logger from "../../utils/logger";
import { isNil } from "lodash";
import GetMetaCredentials from "../../helpers/GetMetaCredentials";
const formData: FormData = new FormData();

const apiBase = (token: string) =>
  axios.create({
    baseURL: "https://graph.facebook.com/v20.0/",
    params: {
      access_token: token
    }
  });

const getMetaErrorDetails = (error: any) => {
  const errData = error?.response?.data?.error || {};
  return {
    status: error?.response?.status,
    code: errData?.code || "",
    subcode: errData?.error_subcode || "",
    type: errData?.type || "",
    message: errData?.message || error?.message || String(error),
    fbtrace: errData?.fbtrace_id || ""
  };
};

export const getAccessToken = async (): Promise<string> => {
  const { appId, appSecret } = await GetMetaCredentials();
  const { data } = await axios.get(
    "https://graph.facebook.com/v20.0/oauth/access_token",
    {
      params: {
        client_id: appId,
        client_secret: appSecret,
        grant_type: "client_credentials"
      }
    }
  );

  return data.access_token;
};

export const markSeen = async (id: string, token: string): Promise<void> => {
  await apiBase(token).post(`${id}/messages`, {
    recipient: {
      id
    },
    sender_action: "mark_seen"
  });
};

export const showTypingIndicator = async (
  id: string, 
  token: string,
  action: string
): Promise<void> => {

  try {
    const { data } = await apiBase(token).post("me/messages", {
      recipient: {
        id: id
      },
      sender_action: action
    })

    return data;
  } catch (error) {
  }

}

// ✅ NOVO: Função para obter informações do comentário e extrair PSID do usuário
export const getCommentInfo = async (
  commentId: string,
  token: string
): Promise<any> => {
  try {
    // ✅ CORRIGIDO: Tentar diferentes formatos do commentId
    // O commentId do webhook pode vir como post_id_comment_id
    // Mas a API pode precisar apenas do comment_id ou do formato completo
    
    let finalCommentId = commentId;
    
    // Se o commentId contém underscore, pode ser post_id_comment_id
    // Tentar primeiro com o formato completo
    if (commentId.includes('_')) {
      const parts = commentId.split('_');
      // Se tiver mais de 2 partes, pode ser post_id_comment_id
      // Tentar usar apenas a última parte (comment_id puro)
      if (parts.length >= 2) {
        const alternativeId = parts[parts.length - 1];
        try {
          const { data } = await apiBase(token).get(
            `${alternativeId}?fields=id,from{id,name},message,created_time`
          );
          if (data && data.id) {
            return data;
          }
        } catch (altError: any) {
        }
      }
    }
    
    // Tentar com o formato completo
    const { data } = await apiBase(token).get(
      `${finalCommentId}?fields=id,from{id,name},message,created_time`
    );
    
    
    return data;
  } catch (error: any) {
    const errorData = error?.response?.data || {};
    console.error(`[FACEBOOK] ❌ Erro ao buscar informações do comentário ${commentId}:`);
    console.error(`[FACEBOOK] - Código: ${errorData?.error?.code}`);
    console.error(`[FACEBOOK] - Mensagem: ${errorData?.error?.message || error.message}`);
    return null;
  }
};

// ✅ NOVO: Função para enviar mensagem privada (Private Reply) para um comentário do Facebook
// Esta é a forma correta de enviar mensagens diretas para usuários que comentaram
// Documentação: https://developers.facebook.com/docs/graph-api/reference/comment/private_replies
export const sendPrivateReplyToComment = async (
  commentId: string,
  message: string,
  token: string
): Promise<any> => {
  try {
    
    // ✅ NOVO: Primeiro, verificar se o comentário existe e obter o ID correto
    // Isso ajuda a identificar se o problema é formato ou permissões
    let commentInfo = null;
    let finalCommentId = commentId;
    
    try {
      commentInfo = await getCommentInfo(commentId, token);
      if (commentInfo && commentInfo.id) {
        // ✅ CORRIGIDO: Usar o ID retornado pela API (formato correto)
        finalCommentId = commentInfo.id;
      } else {
        console.warn(`[FACEBOOK] ⚠️ Não foi possível obter informações do comentário ${commentId}`);
        console.warn(`[FACEBOOK] ⚠️ Tentando usar o ID do webhook diretamente: ${finalCommentId}`);
      }
    } catch (infoError: any) {
      const infoErrorData = infoError?.response?.data || {};
      console.warn(`[FACEBOOK] ⚠️ Erro ao buscar informações do comentário (continuando mesmo assim):`);
      console.warn(`[FACEBOOK] - Código: ${infoErrorData?.error?.code}`);
      console.warn(`[FACEBOOK] - Mensagem: ${infoErrorData?.error?.message || infoError.message}`);
      console.warn(`[FACEBOOK] ⚠️ Tentando usar o ID do webhook diretamente: ${finalCommentId}`);
    }
    
    // ✅ CORRIGIDO: Tentar enviar Private Reply com o ID correto
    
    try {
      const { data } = await apiBase(token).post(`${finalCommentId}/private_replies`, {
        message: message
      });
      
      return data;
    } catch (privateReplyError: any) {
      const privateReplyErrorData = privateReplyError?.response?.data || {};
      console.error(`[FACEBOOK] ❌ Erro ao enviar Private Reply para ${finalCommentId}:`);
      console.error(`[FACEBOOK] - Código: ${privateReplyErrorData?.error?.code}`);
      console.error(`[FACEBOOK] - Subcode: ${privateReplyErrorData?.error?.error_subcode}`);
      console.error(`[FACEBOOK] - Mensagem: ${privateReplyErrorData?.error?.message || privateReplyError.message}`);
      console.error(`[FACEBOOK] - Tipo: ${privateReplyErrorData?.error?.type}`);
      throw privateReplyError; // Re-lançar para ser capturado no catch externo
    }
  } catch (error: any) {
    const errorData = error?.response?.data || {};
    const errorCode = errorData?.error?.code;
    const errorMessage = errorData?.error?.message || error.message;
    const errorSubcode = errorData?.error?.error_subcode;
    
    console.error(`[FACEBOOK] ❌ Erro ao enviar Private Reply para comentário ${commentId}:`);
    console.error(`[FACEBOOK] - Código: ${errorCode}`);
    console.error(`[FACEBOOK] - Subcode: ${errorSubcode}`);
    console.error(`[FACEBOOK] - Mensagem: ${errorMessage}`);
    
    // ✅ NOVO: Se o erro for 100 (objeto não existe), tentar formatos alternativos
    if (errorCode === 100 && commentId.includes('_')) {
      const parts = commentId.split('_');
      
      // Tentar formato alternativo: Apenas a última parte (comment_id puro)
      // O formato do webhook é: post_id_comment_id
      // A API pode precisar apenas do comment_id
      if (parts.length >= 2) {
        const alternativeId = parts[parts.length - 1];
        try {
          const { data } = await apiBase(token).post(`${alternativeId}/private_replies`, {
            message: message
          });
          return data;
        } catch (altError: any) {
          const altErrorData = altError?.response?.data || {};
          console.error(`[FACEBOOK] ❌ Erro também com formato alternativo:`);
          console.error(`[FACEBOOK] - Código: ${altErrorData?.error?.code}`);
          console.error(`[FACEBOOK] - Mensagem: ${altErrorData?.error?.message || altError.message}`);
          console.error(`[FACEBOOK] ⚠️ A Private Reply API pode requerer:`);
          console.error(`[FACEBOOK] - Permissão 'pages_messaging' ou 'pages_manage_metadata'`);
          console.error(`[FACEBOOK] - O comentário deve existir e ser da página`);
          console.error(`[FACEBOOK] - A página deve ter Messenger habilitado`);
          console.error(`[FACEBOOK] - O comentário não pode ter sido removido`);
          console.error(`[FACEBOOK] - A página precisa estar publicada (não em modo rascunho)`);
        }
      }
    }
    
    return null;
  }
};

export const sendText = async (
  id: string | number,
  text: string,
  token: string,
  tag?: string | null,
  commentId?: string | null // ✅ NOVO: ID do comentário para usar Private Reply se Direct falhar
): Promise<any> => {
  try {
    if (!isNil(tag)) {
      const { data } = await apiBase(token).post("me/messages", {
        recipient: {
          id
        },
        message: {
          text: `${text}`,
        },
        messaging_type: "MESSAGE_TAG",
        tag: tag
      });
      return data;
    } else {
      const { data } = await apiBase(token).post("me/messages", {
        recipient: {
          id
        },
        message: {
          text: `${text}`,
        },
        messaging_type: "RESPONSE"
      });
      return data;
    }
  } catch (error: any) {
    const metaError = getMetaErrorDetails(error);
    logger.error(`ERR_SENDING_MESSAGE_TO_FACEBOOK_TRY_3: status=${metaError.status} code=${metaError.code} subcode=${metaError.subcode} type=${metaError.type} message=${metaError.message} fbtrace_id=${metaError.fbtrace} recipient=${id} tag=${tag || "nenhuma"} token=...${String(token).slice(-8)}`);

    // ✅ Log detalhado para QUALQUER status (400/403/etc.)
    const status = metaError.status;
    const errorMessage = metaError.message;
    const errorCode = metaError.code;
    const errorSubcode = metaError.subcode;
    const errorType = metaError.type;
    const fbtrace = metaError.fbtrace;
    console.error(`[FACEBOOK] ❌ Erro ao enviar mensagem direta (status ${status}):`);
    console.error(`[FACEBOOK] - Código: ${errorCode}  Subcode: ${errorSubcode}  Tipo: ${errorType}`);
    console.error(`[FACEBOOK] - Mensagem: ${errorMessage}`);
    console.error(`[FACEBOOK] - Recipient ID: ${id}`);
    console.error(`[FACEBOOK] - Tag: ${tag || 'nenhuma'}`);
    console.error(`[FACEBOOK] - fbtrace_id: ${fbtrace}`);
    console.error(`[FACEBOOK] - Token (últimos 8): ...${String(token).slice(-8)}`);

    if (status === 400) {
      
      // ✅ NOVO: Se for erro 551 e tiver commentId, usar Private Reply (API correta para comentários)
      if ((errorMessage.includes("551") || errorMessage.includes("não está disponível")) && commentId) {
        
        try {
          const privateReply = await sendPrivateReplyToComment(commentId, text, token);
          
          if (privateReply) {
            // Retornar um objeto similar ao que seria retornado pela API de mensagens
            return {
              message_id: privateReply.id || `private-reply-${Date.now()}`,
              id: privateReply.id,
              recipient_id: id,
              private_reply: true // Flag para indicar que foi enviado via Private Reply
            };
          } else {
            console.error(`[FACEBOOK] ❌ Private Reply retornou null - não foi possível enviar`);
            console.error(`[FACEBOOK] ⚠️ Possíveis causas:`);
            console.error(`[FACEBOOK] - Comment ID pode estar no formato incorreto`);
            console.error(`[FACEBOOK] - Página pode não ter permissões para Private Replies`);
            console.error(`[FACEBOOK] - Comentário pode não existir ou ter sido removido`);
            console.error(`[FACEBOOK] - Usuário pode ter bloqueado mensagens da página`);
          }
        } catch (privateReplyError: any) {
          const privateReplyErrorData = privateReplyError?.response?.data || {};
          console.error(`[FACEBOOK] ❌ Exceção ao enviar Private Reply:`);
          console.error(`[FACEBOOK] - Código: ${privateReplyErrorData?.error?.code}`);
          console.error(`[FACEBOOK] - Subcode: ${privateReplyErrorData?.error?.error_subcode}`);
          console.error(`[FACEBOOK] - Mensagem: ${privateReplyErrorData?.error?.message || privateReplyError.message}`);
          console.error(`[FACEBOOK] - Tipo: ${privateReplyErrorData?.error?.type}`);
          console.error(`[FACEBOOK] ⚠️ Possíveis causas do erro 551:`);
          console.error(`[FACEBOOK] - ID do comentário pode não ser válido`);
          console.error(`[FACEBOOK] - Usuário pode ter bloqueado a página ou ter restrições no Messenger`);
          console.error(`[FACEBOOK] - Tag ACCOUNT_UPDATE pode não estar sendo aceita`);
          console.error(`[FACEBOOK] - Usuário pode não ter permitido mensagens da página`);
          console.error(`[FACEBOOK] - A Private Reply API pode não estar disponível para este tipo de comentário`);
        }
      }
    }
    
    try {
      if (!isNil(tag)) {
        const { data } = await apiBase(token).post("me/messages", {
          recipient: {
          id
        },
        message: {
          text: `${text}`,
        },
        messaging_type: "MESSAGE_TAG",
        tag: tag
        });
        return data;
      } else {
        throw new Error(`ERR_SENDING_MESSAGE_TO_FACEBOOK_TRY_3: ${metaError.message}`);
      }
    } catch (error) {
      throw error; // ✅ CORRIGIDO: Lançar erro para que o fluxo saiba que falhou
    }
  }
};

export const sendAttachmentFromUrl = async (
  id: string,
  url: string,
  type: string,
  token: string
): Promise<any> => {
  try {
    const { data } = await apiBase(token).post("me/messages", {
      recipient: {
        id
      },
      message: {
        attachment: {
          type,
          payload: {
            url
          }
        }
      }
    });

    return data;
  } catch (error) {
    console.error(`[FACEBOOK] Erro ao enviar attachment (${type}):`, error);
    // ✅ CORRIGIDO: Retornar null em caso de erro para que o código possa tratar
    return null;
  }
};

export const sendAttachment = async (
  id: string,
  file: Express.Multer.File,
  type: string,
  token: string
): Promise<void> => {
  formData.append(
    "recipient",
    JSON.stringify({
      id
    })
  );

  formData.append(
    "message",
    JSON.stringify({
      attachment: {
        type,
        payload: {
          is_reusable: true
        }
      }
    })
  );

  const fileReaderStream = createReadStream(file.path);

  formData.append("filedata", fileReaderStream);

  try {
    await apiBase(token).post("me/messages", formData, {
      headers: {
        ...formData.getHeaders()
      }
    });
  } catch (error) {
    throw new Error(error);
  }
};

export const genText = (text: string): any => {
  const response = {
    text
  };

  return response;
};

export const getProfile = async (id: string, token: string): Promise<any> => {
  // Tenta com campos completos; se faltar permissão (insights), faz fallback para campos básicos.
  const fullFields = "name,username,profile_pic,follower_count,is_user_follow_business,is_business_follow_user";
  const basicFields = "name,username,profile_pic";
  try {
    const { data } = await axios.get(
      `https://graph.facebook.com/v20.0/${id}?fields=${fullFields}&access_token=${token}`
    );
    return data;
  } catch (error: any) {
    const errData = error?.response?.data?.error;
    console.warn(`[INSTAGRAM/FB] getProfile fullFields falhou para ${id}: code=${errData?.code} subcode=${errData?.error_subcode} msg=${errData?.message}`);
    try {
      const { data } = await axios.get(
        `https://graph.facebook.com/v20.0/${id}?fields=${basicFields}&access_token=${token}`
      );
      return data;
    } catch (err2: any) {
      const e2 = err2?.response?.data?.error;
      console.error(`[INSTAGRAM/FB] getProfile basicFields também falhou para ${id}: code=${e2?.code} subcode=${e2?.error_subcode} msg=${e2?.message}`);
      throw new Error("ERR_FETCHING_FB_USER_PROFILE_2");
    }
  }
};

export const getPageProfile = async (
  id: string,
  token: string
): Promise<any> => {
  try {
    const { data } = await apiBase(token).get(
      `${id}/accounts?fields=name,access_token,instagram_business_account{id,username,profile_picture_url,name}`
    );
    return data;
  } catch (error: any) {
    const details = getMetaErrorDetails(error);
    logger.error(
      `[FACEBOOK] getPageProfile falhou userId=${id} status=${details.status} code=${details.code} subcode=${details.subcode} type=${details.type} msg=${details.message} fbtrace=${details.fbtrace}`
    );
    const err: any = new Error(
      details.message || "ERR_FETCHING_FB_PAGES"
    );
    err.metaDetails = details;
    throw err;
  }
};

export const profilePsid = async (id: string, token: string): Promise<any> => {
  // Para Instagram/Messenger PSIDs, busca direta com campos básicos costuma funcionar.
  const basicFields = "name,username,profile_pic";
  try {
    const { data } = await axios.get(
      `https://graph.facebook.com/v20.0/${id}?fields=${basicFields}&access_token=${token}`
    );
    return data;
  } catch (error: any) {
    const e = error?.response?.data?.error;
    console.warn(`[INSTAGRAM/FB] profilePsid falhou para ${id}: code=${e?.code} subcode=${e?.error_subcode} msg=${e?.message}`);
    return getProfile(id, token);
  }
};

/**
 * Lista as mídias (posts/reels/carrosséis) de uma conta IG Business.
 * Suporta paginação via cursor `after`.
 * Retorna { items, nextCursor }.
 */
export const listInstagramMedia = async (
  igBusinessAccountId: string,
  token: string,
  limit = 25,
  after?: string
): Promise<{
  items: Array<{
    id: string;
    caption: string;
    media_type: string;
    media_url?: string;
    thumbnail_url?: string;
    permalink?: string;
    timestamp?: string;
  }>;
  nextCursor: string | null;
}> => {
  const fields =
    "id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp";
  try {
    const params: any = {
      fields,
      limit,
      access_token: token
    };
    if (after) params.after = after;
    const { data } = await axios.get(
      `https://graph.facebook.com/v20.0/${igBusinessAccountId}/media`,
      { params }
    );
    return {
      items: data?.data || [],
      nextCursor: data?.paging?.cursors?.after || null
    };
  } catch (error: any) {
    const e = getMetaErrorDetails(error);
    console.error(
      `[INSTAGRAM] listInstagramMedia falhou para ${igBusinessAccountId}: code=${e.code} subcode=${e.subcode} msg=${e.message}`
    );
    throw new Error(`ERR_LISTING_INSTAGRAM_MEDIA: ${e.message}`);
  }
};


// ✅ NOVO: Buscar informações do post do Facebook
export const getPostData = async (postId: string, token: string): Promise<any> => {
  try {
    const { data } = await apiBase(token).get(
      `${postId}?fields=message,story,created_time,permalink_url,full_picture,picture,attachments{media{image{src}},subattachments{media{image{src}}}}`
    );
    return data;
  } catch (error) {
    console.error(`[FACEBOOK] Erro ao buscar dados do post ${postId}:`, error);
    return null;
  }
};

// ✅ NOVO: Buscar informações da mídia do Instagram
// Documentação: https://developers.facebook.com/docs/instagram-platform/comment-moderation
export const getInstagramMediaData = async (mediaId: string, token: string): Promise<any> => {
  try {
    // Instagram Graph API usa graph.instagram.com ou graph.facebook.com dependendo do tipo de login
    // Tentar primeiro com graph.facebook.com (Facebook Login for Business)
    const { data } = await apiBase(token).get(
      `${mediaId}?fields=id,caption,media_type,media_url,permalink,timestamp,username`
    );
    return data;
  } catch (error) {
    console.error(`[INSTAGRAM] Erro ao buscar dados da mídia ${mediaId}:`, error);
    // Tentar formato alternativo se o primeiro falhar
    try {
      const { data } = await axios.get(
        `https://graph.instagram.com/v20.0/${mediaId}?fields=id,caption,media_type,media_url,permalink,timestamp,username&access_token=${token}`
      );
      return data;
    } catch (error2) {
      console.error(`[INSTAGRAM] Erro ao buscar dados da mídia ${mediaId} (tentativa 2):`, error2);
      return null;
    }
  }
};

const DEFAULT_SUBSCRIBED_FIELDS = [
  "messages",
  "messaging_postbacks",
  "message_deliveries",
  "message_reads",
  "message_echoes",
  "message_reactions",
  "messaging_referrals",
  "messaging_optins",
  "message_mention",
  "mention",
  "feed"
  // ❌ REMOVIDO: "comments" não é um campo válido para subscrição de webhooks do Facebook
  // Os comentários do Instagram chegam através do campo "feed" quando item === "comment"
];

// ✅ NOVO: Campos válidos para Instagram Business Account
// Documentação: https://developers.facebook.com/docs/instagram-platform/webhooks
const INSTAGRAM_SUBSCRIBED_FIELDS = [
  "messages",
  "comments", // ✅ CORRIGIDO: Para Instagram, "comments" é válido (não "feed")
  "mentions",
  "live_comments",
  "message_reactions",
  "messaging_postbacks",
  "messaging_optins",
  "messaging_referrals"
];

export const subscribeApp = async (id: string, token: string, isInstagramAccount: boolean = false): Promise<any> => {
  try {
    // ✅ CORRIGIDO: Para Instagram Business Account, usar campos específicos do Instagram
    // Segundo documentação: https://developers.facebook.com/docs/instagram-platform/webhooks
    // Instagram Business Account tem campos diferentes do Facebook Page
    const fieldsToSubscribe = isInstagramAccount 
      ? INSTAGRAM_SUBSCRIBED_FIELDS // ✅ CORRIGIDO: Usar campos válidos para Instagram
      : DEFAULT_SUBSCRIBED_FIELDS;
    
    
    const { data } = await axios.post(
      `https://graph.facebook.com/v20.0/${id}/subscribed_apps?access_token=${token}`,
      null,
      {
        params: {
          subscribed_fields: fieldsToSubscribe.join(",")
        }
      }
    );
    
    return data;
  } catch (error: any) {
    const errorData = error?.response?.data || {};
    console.error(`[SUBSCRIBE] ❌ Erro ao subscrever:`, errorData);
    
    // ✅ CORRIGIDO: Para Instagram, comentários podem chegar via página vinculada
    // Mas tentar usar os campos corretos primeiro
    if (isInstagramAccount) {
      return null; // Não lançar erro, pois comentários podem chegar via página vinculada
    }
    throw new Error("ERR_SUBSCRIBING_PAGE_TO_MESSAGE_WEBHOOKS");
  }
};

export const unsubscribeApp = async (
  id: string,
  token: string
): Promise<any> => {
  try {
    const { data } = await axios.delete(
      `https://graph.facebook.com/v20.0/${id}/subscribed_apps?access_token=${token}`
    );
    return data;
  } catch (error) {
    throw new Error("ERR_UNSUBSCRIBING_PAGE_TO_MESSAGE_WEBHOOKS");
  }
};

export const getSubscribedApps = async (
  id: string,
  token: string
): Promise<any> => {
  try {
    const { data } = await apiBase(token).get(`${id}/subscribed_apps`);
    return data;
  } catch (error) {
    throw new Error("ERR_GETTING_SUBSCRIBED_APPS");
  }
};

export const getAccessTokenFromPage = async (
  token: string
): Promise<string> => {
  if (!token) {
    logger.error("[FB] getAccessTokenFromPage: token vazio recebido do frontend");
    throw new Error(
      "ERR_FETCHING_FB_USER_TOKEN: nenhum token retornado pelo login do Facebook. Refaça o login e autorize a página/conta Instagram."
    );
  }

  const { appId, appSecret } = await GetMetaCredentials();

  if (!appId || !appSecret) {
    logger.error(
      `[FB] Credenciais Meta ausentes. appId=${appId ? "ok" : "VAZIO"} appSecret=${appSecret ? "ok" : "VAZIO"}`
    );
    throw new Error(
      "ERR_FETCHING_FB_USER_TOKEN: App ID ou App Secret da Meta não configurados. Acesse Configurações → Meta/Facebook e preencha os campos."
    );
  }

  try {
    const data = await axios.get(
      "https://graph.facebook.com/v20.0/oauth/access_token",
      {
        params: {
          client_id: appId,
          client_secret: appSecret,
          grant_type: "fb_exchange_token",
          fb_exchange_token: token
        }
      }
    );

    return data.data.access_token;
  } catch (error: any) {
    const fbErr = error?.response?.data?.error;
    logger.error(
      `[FB] Falha ao trocar token. status=${error?.response?.status} fbErr=${JSON.stringify(
        fbErr || error?.message
      )} appIdUsado=${appId?.slice(0, 4)}...`
    );

    const detail =
      fbErr?.message ||
      "Verifique se o App ID/Secret no painel de configurações corresponde ao app usado no login do Facebook (mesmo app, mesmo ambiente).";

    throw new Error(`ERR_FETCHING_FB_USER_TOKEN: ${detail}`);
  }
};

export const removeApplcation = async (
  id: string,
  token: string
): Promise<void> => {
  try {
    await axios.delete(`https://graph.facebook.com/v20.0/${id}/permissions`, {
      params: {
        access_token: token
      }
    });
  } catch (error) {
    logger.error("ERR_REMOVING_APP_FROM_PAGE");
  }
};