export interface IReceivedWhatsppOficial {
  token: string;
  fromNumber: string;
  nameContact: string;
  companyId: number;
  message: IMessageReceived;
}

export interface IReceivedWhatsppOficialRead {
  messageId: string;
  companyId: number;
  token: string;
}

export interface IMessageReceived {
  type:
    | 'text'
    | 'image'
    | 'audio'
    | 'document'
    | 'video'
    | 'location'
    | 'contacts'
    | 'order'
    | 'interactive'
    | 'referral'
    | 'sticker'
    // Clique em botão de quick reply de template — ver
    // IWebhookWhatsApp.inteface.ts. Precisa existir aqui também, senão o
    // evento não passa tipado até o backend.
    | 'button';
  timestamp: number;
  idMessage: string;
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
  file?: string; // Base64 do arquivo (apenas para imagens, áudios pequenos)
  mimeType?: string;
  idFile?: string;
  quoteMessageId?: string;
  fileUrl?: string; // ✅ URL da Meta para download direto (para vídeos e documentos)
  fileSize?: number; // ✅ Tamanho do arquivo em bytes
  // ✅ Click-to-WhatsApp Ad referral (vem só na 1ª mensagem após clique no anúncio)
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
