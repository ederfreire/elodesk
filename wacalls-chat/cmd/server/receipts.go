package main

// Confirmação de entrega/leitura ("ack") de mensagens enviadas por nós no
// canal wacalls (WhatsApp Plus - Voz + Msg) — é o que faz os dois tiquezinhos
// virarem azuis (✓✓) na tela do CRM quando o cliente lê a mensagem, igual já
// acontece no canal Baileys via handleMsgAck (wbotMessageListener.ts).
//
// Antes desta mudança, *events.Receipt do whatsmeow nunca era tratado em
// handleEvent (session.go) — o pacote entrega o evento normalmente (é assim
// que o próprio app do WhatsApp no celular mostra ✓✓ azul), mas
// Session.handleEvent não tinha nenhum `case` pra ele, então caía no default
// implícito (nada) e a confirmação era descartada silenciosamente. O lado
// Node já tinha (e ainda tem) uma função pronta pra aplicar isso no banco —
// HandleWacallsAck em backend/src/services/WacallsServices/HandleWacallsIncoming.ts
// — só que ela só era chamada a partir do webhook HTTP do wacalls-voip (o
// microserviço antigo, substituído por completo pelo wacalls-chat, que fala
// com o Node via SSE, não via webhook). Essa função ficou órfã: existia,
// funcionava, mas nada no wacalls-chat a acionava. A mudança aqui fecha essa
// lacuna nos dois lados: emite um novo evento SSE "receipt" aqui, e um novo
// `case "receipt"` no consumidor SSE do Node (WacallsChatCallService.ts)
// chama HandleWacallsAck com o ack mapeado abaixo.
import (
	"go.mau.fi/whatsmeow/types"
	"go.mau.fi/whatsmeow/types/events"
)

// waAckFor mapeia o types.ReceiptType do whatsmeow pra escala de ack usada
// no resto do sistema (ver comentário em HandleWacallsAck, TS):
//
//	0=pending, 1=sent, 2=received (entregue), 3=read (lido), 4=played (áudio ouvido)
//
// Só os quatro tipos "de progresso" (entregue/lido/lido-self/ouvido) mapeiam
// pra um ack — ReceiptTypeSender (confirmação de que o PRÓPRIO servidor
// recebeu, non-user-facing) e ReceiptTypeRetry (pedido de reenvio por falha
// de decriptação) não representam avanço de leitura pro destinatário, então
// são ignorados (segundo valor do retorno = false).
func waAckFor(t types.ReceiptType) (int, bool) {
	switch t {
	case types.ReceiptTypeDelivered:
		return 2, true
	case types.ReceiptTypeRead, types.ReceiptTypeReadSelf:
		return 3, true
	case types.ReceiptTypePlayed:
		return 4, true
	default:
		return 0, false
	}
}

// handleReceipt processa um *events.Receipt e, se for um tipo que representa
// avanço de leitura, emite um evento SSE "receipt" pro Node persistir via
// HandleWacallsAck. Não filtra por IsFromMe aqui: o evento pode remeter tanto
// a mensagens que nós mandamos quanto (mais raramente) a mensagens que outro
// dos NOSSOS dispositivos leu — não dá pra distinguir só pelo Receipt, mas
// isso já é resolvido do lado Node (HandleWacallsAck só aplica a UPDATE em
// mensagens com fromMe=true; wids que não batem com nenhuma mensagem nossa
// simplesmente não afetam nada).
func (s *Session) handleReceipt(evt *events.Receipt) {
	ack, ok := waAckFor(evt.Type)
	if !ok || len(evt.MessageIDs) == 0 {
		return
	}
	ids := make([]string, 0, len(evt.MessageIDs))
	for _, id := range evt.MessageIDs {
		ids = append(ids, string(id))
	}
	s.mgr.broker.emitReceipt(s.id, ids, ack)
}
