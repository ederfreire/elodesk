package main

// Importação de mensagens antigas ("Importar mensagens anteriores" na tela
// de conexão WhatsApp Plus) — equivalente ao botão "Import Messages" que já
// existe pro canal Baileys, mas usando o protocolo de history sync do
// whatsmeow em vez do in-memory store do Baileys.
//
// Como funciona no WhatsApp multi-device (Baileys e whatsmeow são clientes
// diferentes do MESMO protocolo): logo depois do primeiro pareamento, o
// celular manda automaticamente um ou mais blobs de "history sync"
// (conversas + mensagens recentes) — é assim que o WhatsApp Web te mostra o
// histórico na hora que você escaneia o QR. O whatsmeow já decodifica isso
// sozinho e emite como *events.HistorySync (ManualHistorySyncDownload não
// está habilitado neste projeto) — só que essa sessão nunca tratava esse
// evento, então esse primeiro blob sempre foi silenciosamente descartado.
//
// Pra sessões que já estão pareadas há tempo (o caso comum de quem vai
// clicar nesse botão), esse envio automático já aconteceu há muito e não se
// repete sozinho — por isso o botão precisa ATIVAMENTE pedir mais histórico
// via BuildHistorySyncRequest+SendPeerMessage, que gera um novo
// *events.HistorySync (tipo ON_DEMAND) como resposta.
//
// IMPORTANTE (risco assumido, ver aviso ao usuário): este arquivo nunca foi
// testado contra uma sessão whatsmeow/WhatsApp real neste ambiente de
// desenvolvimento (sem esse acesso disponível). Os nomes de método/campo
// usados abaixo (BuildHistorySyncRequest, SendPeerMessage, GetSyncType,
// GetConversations, Conversation.GetID, HistorySyncMsg.GetMessage,
// ParseWebMessage) foram conferidos um a um na documentação oficial do
// pacote na MESMA versão do whatsmeow pinada no go.mod deste projeto
// (pkg.go.dev/go.mau.fi/whatsmeow, commit 5f04eac6dbbb) — não são
// suposição — mas comportamento real (quantidade de mensagens que volta,
// se aparece mensagem duplicada de algo que já chegou ao vivo antes,
// timing) só se confirma rodando de verdade contra o servidor.
//
// BUG REAL CONFIRMADO EM PRODUÇÃO (25/07/2026, log do usuário: "falha
// interna ao montar pedido de histórico (runtime error: invalid memory
// address or nil pointer dereference)"): a versão anterior desta função
// chamava `s.client.BuildHistorySyncRequest(nil, 50)` — SEM âncora. A
// implementação real dessa função na lib (tulir/whatsmeow, send.go)
// desreferencia o parâmetro direto:
//
//	ChatJID: proto.String(lastKnownMessageInfo.Chat.String())
//	OldestMsgID: proto.String(lastKnownMessageInfo.ID)
//	...
//
// sem nenhum nil-check — ou seja, `nil` sempre panicava, 100% das vezes,
// pra qualquer sessão (não era um problema intermitente nem de estado da
// conexão). O protocolo HISTORY_SYNC_ON_DEMAND do WhatsApp não tem "me
// manda todo o histórico do zero": é sempre "me manda as N mensagens
// ANTERIORES a esta mensagem que eu já conheço", por conversa — não existe
// um pedido "genérico". Por isso agora pedimos, pra CADA conversa que esta
// sessão já tem pelo menos uma mensagem salva localmente (a mensagem mais
// antiga já salva vira a âncora), em vez de um único pedido sem âncora.

import (
	"context"
	"fmt"
	"runtime/debug"
	"time"

	waHistorySync "go.mau.fi/whatsmeow/proto/waHistorySync"
	"go.mau.fi/whatsmeow/types"
	"go.mau.fi/whatsmeow/types/events"
)

// RequestHistoryImport pede ao WhatsApp (via celular principal, dono da
// sessão) que reenvie um lote de histórico recente. A resposta chega
// assíncrona via handleHistorySync (case *events.HistorySync no
// Session.handleEvent) — esta função só dispara o pedido, não espera a
// resposta. startDate/endDate (opcionais, nil = sem filtro) restringem quais
// mensagens do lote acabam sendo importadas — ver comentário em
// handleHistorySync sobre por que o filtro é feito aqui e não no pedido em
// si (o protocolo do WhatsApp não aceita "histórico de tal período").
func (s *Session) RequestHistoryImport(ctx context.Context, startDate, endDate *time.Time, ticketStatus string, queueID string) (err error) {
	// recover() aqui além do que já existe em handleImportHistory (httpapi.go):
	// aquele só loga o valor cru do panic, sem saber ONDE ele aconteceu. Este
	// código (BuildHistorySyncRequest/SendPeerMessage) nunca foi testado
	// contra uma sessão whatsmeow real neste ambiente de dev (ver aviso no
	// topo do arquivo) — foi exatamente um panic aqui dentro (nil pointer
	// dereference) que gerou o "Erro interno ao pedir importação de
	// histórico" relatado em produção. Com o stack trace no log dá pra achar
	// a linha exata da próxima vez, em vez de só saber que panicou.
	defer func() {
		if rec := recover(); rec != nil {
			s.log.Error("panic dentro de RequestHistoryImport — recuperado", "panic", rec, "stack", string(debug.Stack()))
			err = fmt.Errorf("falha interna ao montar pedido de histórico (%v) — verifique se a sessão está totalmente conectada e tente de novo em alguns minutos", rec)
		}
	}()

	if s.client == nil || s.client.Store == nil || s.client.Store.ID == nil {
		return fmt.Errorf("sessão não pareada")
	}
	// IsLoggedIn cobre o caso da sessão aparecer "CONECTADO" na tela mas
	// ainda não ter terminado o handshake completo do whatsmeow por dentro —
	// um estado intermediário em que BuildHistorySyncRequest/SendPeerMessage
	// mexem em estruturas internas ainda não totalmente inicializadas.
	if !s.client.IsLoggedIn() {
		return fmt.Errorf("sessão ainda não está totalmente conectada — aguarde um pouco e tente de novo")
	}

	// Conversas que esta sessão já conhece (tem pelo menos uma mensagem
	// salva localmente na tabela `messages`) — cada uma vira um pedido de
	// histórico SEPARADO, usando a mensagem mais antiga já salva como
	// âncora (é a única coisa que BuildHistorySyncRequest aceita: "o que
	// veio antes de X"). ListChats já vem ordenado por recência; limitamos
	// às N conversas mais recentes pra não disparar uma rajada enorme de
	// pedidos peer-to-device de uma vez em contas com muitas conversas.
	const maxChatsPerRequest = 40
	chats, chatsErr := s.mgr.messages.ListChats(ctx, s.id)
	if chatsErr != nil {
		return fmt.Errorf("falha ao listar conversas conhecidas: %w", chatsErr)
	}
	if len(chats) == 0 {
		return fmt.Errorf("nenhuma conversa conhecida ainda nesta conexão — mande ou receba pelo menos uma mensagem antes de importar histórico (o WhatsApp só permite estender uma conversa que este dispositivo já viu, não puxar tudo do zero)")
	}
	if len(chats) > maxChatsPerRequest {
		chats = chats[:maxChatsPerRequest]
	}

	s.mu.Lock()
	s.historyImportRequested = true
	s.historyImportStartDate = startDate
	s.historyImportEndDate = endDate
	s.historyImportTicketStatus = ticketStatus
	s.historyImportQueueID = queueID
	s.mu.Unlock()

	// count=50 por conversa: valor recomendado pela própria doc do
	// whatsmeow pra esse pedido.
	requested := 0
	var lastErr error
	for _, chat := range chats {
		// recover POR CONVERSA (além do recover geral da função, no topo):
		// BuildHistorySyncRequest/SendPeerMessage nunca foi testado contra
		// sessão real (ver aviso grande no topo do arquivo) — se UMA conversa
		// específica tiver algum dado que derruba essas chamadas (ex.: JID
		// com formato inesperado vindo de um import/merge anterior), um
		// panic aqui não deve abortar o pedido de histórico das OUTRAS
		// dezenas de conversas que processariam normalmente. Antes, um
		// panic em uma única conversa cancelava a importação inteira — era
		// exatamente o "falha interna ao montar pedido de histórico"
		// relatado, mesmo em conexões novas e saudáveis com várias outras
		// conversas perfeitamente importáveis.
		func() {
			defer func() {
				if rec := recover(); rec != nil {
					s.log.Error("panic ao pedir histórico de uma conversa — pulando só essa", "chat", chat.ChatJID, "panic", rec, "stack", string(debug.Stack()))
				}
			}()

			chatJID, parseErr := types.ParseJID(chat.ChatJID)
			if parseErr != nil || chatJID.User == "" {
				return
			}
			oldest, found, oldestErr := s.mgr.messages.OldestMessage(ctx, s.id, chat.ChatJID)
			if oldestErr != nil || !found || oldest.ID == "" {
				return
			}

			anchor := &types.MessageInfo{
				MessageSource: types.MessageSource{
					Chat:     chatJID,
					IsFromMe: oldest.FromMe,
				},
				ID:        types.MessageID(oldest.ID),
				Timestamp: time.UnixMilli(oldest.Ts),
			}

			msg := s.client.BuildHistorySyncRequest(anchor, 50)
			if msg == nil {
				return
			}
			if _, sendErr := s.client.SendPeerMessage(ctx, msg); sendErr != nil {
				lastErr = sendErr
				s.log.Warn("falha ao pedir histórico de uma conversa", "chat", chat.ChatJID, "err", sendErr)
				return
			}
			requested++
		}()
	}

	if requested == 0 {
		if lastErr != nil {
			return fmt.Errorf("falha ao enviar pedido de histórico: %w", lastErr)
		}
		return fmt.Errorf("não foi possível montar pedido de histórico pra nenhuma conversa conhecida (tente novamente em alguns minutos)")
	}

	// Progresso pro frontend (percentual no botão "Importar mensagens
	// anteriores", igual o canal Baileys já mostra) — ver
	// Broker.emitImportProgress e finishHistoryImport logo abaixo.
	s.mu.Lock()
	s.historyImportTotalChats = requested
	s.historyImportProcessedChats = 0
	s.historyImportTotalMessages = 0
	if s.historyImportDoneTimer != nil {
		s.historyImportDoneTimer.Stop()
	}
	// Nem toda conversa pedida necessariamente responde (ver comentário no
	// campo historyImportDoneTimer, em session.go) — esse timer garante que
	// o progresso não fique parado pra sempre em menos de 100%.
	s.historyImportDoneTimer = time.AfterFunc(90*time.Second, s.finishHistoryImport)
	s.mu.Unlock()
	s.mgr.broker.emitImportProgress(s.id, "starting", 0, requested, 0)

	s.log.Info("pedido de importação de histórico enviado", "conversas", requested, "startDate", startDate, "endDate", endDate)
	return nil
}

// finishHistoryImport encerra um import de histórico em andamento e emite
// o estágio final "done" pro frontend — chamado tanto pelo timer de
// segurança em RequestHistoryImport (nem toda conversa pedida
// necessariamente responde) quanto assim que o progresso bate 100% antes
// do timer estourar (ver handleHistorySync). Idempotente: chamar mais de
// uma vez (ex.: o timer dispara depois do 100% já ter fechado tudo) não
// reemite "done" de novo.
func (s *Session) finishHistoryImport() {
	s.mu.Lock()
	if !s.historyImportRequested {
		s.mu.Unlock()
		return
	}
	s.historyImportRequested = false
	processed := s.historyImportProcessedChats
	total := s.historyImportTotalChats
	messages := s.historyImportTotalMessages
	if s.historyImportDoneTimer != nil {
		s.historyImportDoneTimer.Stop()
		s.historyImportDoneTimer = nil
	}
	s.mu.Unlock()
	s.mgr.broker.emitImportProgress(s.id, "done", processed, total, messages)
}

// handleHistorySync processa um lote de histórico recebido do WhatsApp.
// Só importa (persiste mensagem, cria/atualiza ticket) se
// RequestHistoryImport já foi chamado nessa sessão — sem esse guard, o
// blob automático do primeiro pareamento importaria histórico sozinho,
// sem o operador pedir, o que não é o comportamento desejado (import
// sempre sob demanda, via botão "Importar mensagens anteriores").
func (s *Session) handleHistorySync(evt *events.HistorySync) {
	// recover() aqui é importante de verdade, não só defensivo: esta função
	// roda dentro do próprio despachante de eventos do whatsmeow
	// (Session.handleEvent, chamado a partir do client.AddEventHandler) —
	// diferente de handleImportHistory (requisição HTTP isolada), um panic
	// aqui não fica contido numa conexão só; se o whatsmeow não recuperar
	// panics de handler internamente, um panic não tratado em QUALQUER
	// goroutine derruba o processo wacalls-chat inteiro (todas as sessões de
	// TODAS as empresas, não só esta). Este código nunca foi testado contra
	// um blob de history sync real (ver aviso grande no topo do arquivo),
	// então esse recover é a rede de segurança mínima até isso ser validado
	// ao vivo.
	defer func() {
		if r := recover(); r != nil {
			s.log.Error("panic ao processar history sync — recuperado, sessão continua ativa", "panic", r)
		}
	}()
	s.mu.Lock()
	enabled := s.historyImportRequested
	startDate := s.historyImportStartDate
	endDate := s.historyImportEndDate
	ticketStatus := s.historyImportTicketStatus
	queueID := s.historyImportQueueID
	s.mu.Unlock()
	if !enabled || evt == nil || evt.Data == nil {
		return
	}
	data := evt.Data

	switch data.GetSyncType() {
	case waHistorySync.HistorySync_INITIAL_STATUS_V3,
		waHistorySync.HistorySync_PUSH_NAME,
		waHistorySync.HistorySync_NON_BLOCKING_DATA:
		// Só nomes/status, sem mensagem de chat de verdade — nada a
		// importar nesse blob específico (outro blob da mesma leva deve
		// trazer as conversas).
		s.log.Debug("history sync sem mensagens (metadados)", "sync_type", data.GetSyncType().String())
		return
	}

	imported := 0
	convCount := 0
	for _, conv := range data.GetConversations() {
		jid, err := types.ParseJID(conv.GetID())
		if err != nil || jid.User == "" {
			continue
		}
		convCount++
		// Grupos/canais/broadcast passam pelo mesmo filtro de
		// allowGroups que mensagens ao vivo já respeitam dentro de
		// handleWAMessage — não precisa duplicar aqui.
		for _, rawMsg := range conv.GetMessages() {
			webMsg := rawMsg.GetMessage()
			if webMsg == nil {
				continue
			}
			parsed, err := s.client.ParseWebMessage(jid, webMsg)
			if err != nil {
				s.log.Debug("history sync: falha ao decodificar mensagem", "chat", jid.String(), "err", err)
				continue
			}
			// Filtro de período (opcional): o WhatsApp não permite pedir
			// histórico "de tal data até tal data" — o pedido em
			// RequestHistoryImport só controla QUANTAS mensagens recentes
			// voltam. Pra dar a mesma UX de período do import do Baileys,
			// descartamos aqui o que ficar fora da janela escolhida pelo
			// operador em vez de importar tudo que o whatsmeow devolveu.
			ts := parsed.Info.Timestamp
			if startDate != nil && ts.Before(*startDate) {
				continue
			}
			if endDate != nil && ts.After(*endDate) {
				continue
			}
			// Reaproveita o MESMO caminho de uma mensagem ao vivo — persiste
			// no SQLite local, emite SSE "message" pro Node consumir
			// (WacallsChatMessageService.ts), que por sua vez cria/acha o
			// contato e o ticket exatamente como uma mensagem nova faria
			// (mesma lógica pedida: "igual a conexão Baileys", que também
			// roteia mensagem importada pelo pipeline normal de ticket).
			s.handleWAMessage(parsed, ticketStatus, queueID)
			imported++
		}
	}
	s.log.Info("history sync processado",
		"sync_type", data.GetSyncType().String(),
		"conversations", len(data.GetConversations()),
		"messages_imported", imported,
		"progress", data.GetProgress(),
	)

	// Progresso pro frontend (ver RequestHistoryImport/finishHistoryImport
	// acima) — cada blob ON_DEMAND que chega corresponde a uma das
	// conversas que pedimos, então soma no contador em vez de sobrescrever.
	s.mu.Lock()
	s.historyImportProcessedChats += convCount
	s.historyImportTotalMessages += imported
	processed := s.historyImportProcessedChats
	total := s.historyImportTotalChats
	totalMessages := s.historyImportTotalMessages
	s.mu.Unlock()
	if total > 0 {
		s.mgr.broker.emitImportProgress(s.id, "importing", processed, total, totalMessages)
		if processed >= total {
			s.finishHistoryImport()
		}
	}
}
