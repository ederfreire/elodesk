import React from "react";
import Facebook from "@material-ui/icons/Facebook";
import Instagram from "@material-ui/icons/Instagram";
import WhatsApp from "@material-ui/icons/WhatsApp";
import SendIcon from "@material-ui/icons/Send";
import ChatBubbleIcon from "@material-ui/icons/ChatBubble";
import MailOutlineIcon from "@material-ui/icons/MailOutline";
import YouTubeIcon from "@material-ui/icons/YouTube";
import LinkedInIcon from "@material-ui/icons/LinkedIn";
import MusicNoteOutlined from "@material-ui/icons/MusicNoteOutlined";
import LocalOfferOutlined from "@material-ui/icons/LocalOfferOutlined";
import ShoppingCartOutlined from "@material-ui/icons/ShoppingCartOutlined";
import PhoneInTalkOutlined from "@material-ui/icons/PhoneInTalkOutlined";

/**
 * Ícone do canal de uma conexão — o MESMO em todas as telas.
 * Antes cada tela tinha o seu "switch" com só Facebook/Instagram/WhatsApp e,
 * para os outros canais (WhatsApp Plus, Webchat, LinkedIn, TikTok, YouTube…),
 * mostrava a palavra "error" no lugar do ícone.
 */
const IconeDoCanal = ({ canal, alinhar = false, colorido = true }) => {
  const st = (cor) => ({
    ...(colorido ? { color: cor } : {}),
    ...(alinhar ? { verticalAlign: "middle" } : {}),
  });
  switch (canal) {
    case "facebook":
      return <Facebook style={st("#3b5998")} />;
    case "instagram":
      return <Instagram style={st("#e1306c")} />;
    case "telegram":
      return <SendIcon style={st("#0088cc")} />;
    case "webchat":
      return <ChatBubbleIcon style={st("#4E93FF")} />;
    case "email":
      return <MailOutlineIcon style={st("#EA4335")} />;
    case "tiktok":
      return <MusicNoteOutlined style={st("#111111")} />;
    case "youtube":
      return <YouTubeIcon style={st("#FF0000")} />;
    case "linkedin":
      return <LinkedInIcon style={st("#0A66C2")} />;
    case "olx":
      return <LocalOfferOutlined style={st("#6E0AD6")} />;
    case "mercadolivre":
      return <ShoppingCartOutlined style={st("#2D3277")} />;
    case "sip":
      return <PhoneInTalkOutlined style={st("#5C6BC0")} />;
    default:
      // whatsapp, whatsapp_oficial, wacalls (WhatsApp Plus), zapi,
      // whatsappapi e qualquer canal novo: ícone do WhatsApp — nunca "error".
      return <WhatsApp style={st("#25d366")} />;
  }
};

export const iconeDoCanal = (canal, opcoes = {}) => <IconeDoCanal canal={canal} {...opcoes} />;

export default IconeDoCanal;
