package main

import (
	"context"
	"strings"

	"go.mau.fi/whatsmeow/proto/waE2E"
	"go.mau.fi/whatsmeow/types"
	"google.golang.org/protobuf/proto"
)

// Reply (mensagem citada) no WhatsApp não é um campo solto: o app do celular só
// desenha a "bolha" com a mensagem original quando o ContextInfo traz
// StanzaID (id da mensagem citada), Participant (quem mandou a original) e um
// QuotedMessage mínimo. Antes daqui o EquipeChat marcava a citação apenas no
// banco local — por isso a marcação aparecia na ferramenta e NÃO no celular.

// quotedMessageFromRow monta o "esqueleto" da mensagem citada. Não precisa ser
// idêntico ao original (o celular já tem a mensagem localmente pelo StanzaID),
// só precisa ser do mesmo tipo para o app renderizar o preview certo.
func quotedMessageFromRow(row MessageRow) *waE2E.Message {
	body := row.Body
	mime := row.MediaMime
	switch strings.ToLower(strings.TrimSpace(row.Kind)) {
	case "image":
		return &waE2E.Message{ImageMessage: &waE2E.ImageMessage{
			Mimetype: proto.String(orDefault(mime, "image/jpeg")),
			Caption:  proto.String(body),
		}}
	case "video":
		return &waE2E.Message{VideoMessage: &waE2E.VideoMessage{
			Mimetype: proto.String(orDefault(mime, "video/mp4")),
			Caption:  proto.String(body),
		}}
	case "audio", "ptt":
		return &waE2E.Message{AudioMessage: &waE2E.AudioMessage{
			Mimetype: proto.String(orDefault(mime, "audio/ogg; codecs=opus")),
			PTT:      proto.Bool(true),
		}}
	case "document":
		return &waE2E.Message{DocumentMessage: &waE2E.DocumentMessage{
			Mimetype: proto.String(orDefault(mime, "application/octet-stream")),
			FileName: proto.String(row.FileName),
			Title:    proto.String(orDefault(row.FileName, body)),
		}}
	case "sticker":
		return &waE2E.Message{StickerMessage: &waE2E.StickerMessage{
			Mimetype: proto.String(orDefault(mime, "image/webp")),
		}}
	default:
		return &waE2E.Message{Conversation: proto.String(body)}
	}
}

func orDefault(v, def string) string {
	if strings.TrimSpace(v) == "" {
		return def
	}
	return v
}

// quotedParticipant descobre o JID de quem enviou a mensagem citada.
func (s *server) quotedParticipant(sess *Session, chatJID types.JID, row MessageRow, ok bool) string {
	if ok && row.FromMe {
		if sess.client != nil && sess.client.Store != nil && sess.client.Store.ID != nil {
			return sess.client.Store.ID.ToNonAD().String()
		}
	}
	if ok {
		if p := strings.TrimSpace(row.SenderJID); p != "" {
			// NORMALIZA antes de usar. Este era o único dos três caminhos que
			// devolvia o JID cru do banco — os outros dois já aplicam
			// ToNonAD(). O SenderJID salvo pode vir com sufixo de dispositivo
			// ("5581...:12@s.whatsapp.net") ou como LID. Um Participant nesse
			// formato deixa o ContextInfo inválido, e o servidor do WhatsApp
			// DESCARTA a mensagem inteira em silêncio: a resposta não chega no
			// celular do cliente nem volta como eco pra plataforma — some sem
			// erro nenhum, exatamente o sintoma relatado. Mensagem sem citação
			// não passa por aqui, por isso só quebrava ao responder.
			if parsed, err := types.ParseJID(p); err == nil && parsed.User != "" {
				return parsed.ToNonAD().String()
			}
			// Não deu pra interpretar: cair no fallback abaixo é mais seguro
			// do que mandar um Participant malformado.
		}
	}
	// Fallback: em conversa 1:1 quem mandou a original é o próprio contato.
	return chatJID.ToNonAD().String()
}

// buildQuotedContext devolve o ContextInfo de resposta para o id informado.
// Retorna nil quando não há citação (aí a mensagem sai normal).
func (s *server) buildQuotedContext(ctx context.Context, sess *Session, chatJID types.JID, quotedID string) *waE2E.ContextInfo {
	quotedID = strings.TrimSpace(quotedID)
	if quotedID == "" || sess == nil {
		return nil
	}
	var (
		row MessageRow
		ok  bool
	)
	if s.messages != nil {
		row, ok, _ = s.messages.Get(ctx, sess.id, quotedID)
	}
	quoted := &waE2E.Message{Conversation: proto.String("")}
	if ok {
		quoted = quotedMessageFromRow(row)
	}
	return &waE2E.ContextInfo{
		StanzaID:      proto.String(quotedID),
		Participant:   proto.String(s.quotedParticipant(sess, chatJID, row, ok)),
		QuotedMessage: quoted,
	}
}

// attachContextInfo pendura o ContextInfo na variante correta da mensagem.
// Texto puro (Conversation) não tem campo de contexto, então é promovido para
// ExtendedTextMessage — que é exatamente o que o WhatsApp usa em respostas.
func attachContextInfo(msg *waE2E.Message, ci *waE2E.ContextInfo) *waE2E.Message {
	if msg == nil || ci == nil {
		return msg
	}
	switch {
	case msg.Conversation != nil:
		return &waE2E.Message{ExtendedTextMessage: &waE2E.ExtendedTextMessage{
			Text:        proto.String(msg.GetConversation()),
			ContextInfo: ci,
		}}
	case msg.ExtendedTextMessage != nil:
		msg.ExtendedTextMessage.ContextInfo = ci
	case msg.ImageMessage != nil:
		msg.ImageMessage.ContextInfo = ci
	case msg.VideoMessage != nil:
		msg.VideoMessage.ContextInfo = ci
	case msg.AudioMessage != nil:
		msg.AudioMessage.ContextInfo = ci
	case msg.DocumentMessage != nil:
		msg.DocumentMessage.ContextInfo = ci
	case msg.StickerMessage != nil:
		msg.StickerMessage.ContextInfo = ci
	}
	return msg
}
