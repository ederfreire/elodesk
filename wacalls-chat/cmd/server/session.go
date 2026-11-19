package main

import (
	"context"
	"log/slog"
	"os"
	"strings"
	"sync"
	"time"

	"wacalls/internal/voip/call"
	"wacalls/internal/voip/core"
	"wacalls/internal/voip/signaling"
	"wacalls/internal/voip/wanode"
	"wacalls/internal/wa"

	"github.com/mdp/qrterminal/v3"
	"go.mau.fi/whatsmeow"
	waBinary "go.mau.fi/whatsmeow/binary"
	"go.mau.fi/whatsmeow/types"
	"go.mau.fi/whatsmeow/types/events"
)

type Session struct {
	id      string
	name    string
	ownerID string
	mgr     *SessionManager
	log     *slog.Logger

	client *whatsmeow.Client
	reg    *callRegistry

	mu   sync.Mutex
	auth AuthSnapshot

	color             string
	isDefault         bool
	allowGroups       bool
	integrationToken  string
	queueID           string
	redirectMinutes   int
	flowID            string
	chatFlowID        string
	greetingMessage   string
	completionMessage string
	outOfHoursMessage string
	avatarURL         string
	surveyEnabled     bool
	surveyPrompt      string
	mode              string
	cloudPhoneID      string
	cloudWABAID       string
	cloudConfigured   bool

	// historyImportRequested vira true quando o operador clica "Importar
	// mensagens anteriores" na tela de conexão (ver historyimport.go). Sem
	// esse guard, processaríamos qualquer *events.HistorySync que o
	// WhatsApp mandar (inclusive o automático, único, logo no primeiro
	// pareamento) — o import deve ser sempre sob demanda, nunca automático.
	historyImportRequested bool

	// historyImportStartDate/EndDate: período opcional escolhido pelo
	// operador no modal "Importar mensagens anteriores" (mesma UX do botão
	// equivalente do canal Baileys). O whatsmeow não tem um pedido de
	// histórico "por data" no protocolo — só "os N mais recentes" (ver
	// BuildHistorySyncRequest em RequestHistoryImport) — então pedimos o
	// lote recente normalmente e filtramos por data aqui do lado de cá, em
	// handleHistorySync, antes de persistir. nil em qualquer um dos dois
	// significa "sem filtro" naquela ponta.
	historyImportStartDate *time.Time
	historyImportEndDate   *time.Time

	// historyImportTicketStatus: status ("open"/"pending"/"closed") que o
	// operador escolheu no prompt de import pra todo ticket criado/reaberto a
	// partir das mensagens desse lote — igual a opção que o import do
	// Baileys já tem (ImportMessagesService.ts). Vazio = sem override (deixa
	// o pipeline normal decidir, mesmo comportamento de antes desta opção
	// existir). Propagado pra cada linha de mensagem emitida via SSE
	// (MessageRow.TicketStatus, ver messageapi.go/handleWAMessage) só
	// enquanto handleHistorySync está processando o lote — mensagens ao vivo
	// nunca carregam esse campo.
	historyImportTicketStatus string

	// historyImportQueueID: id da fila (Queue, no Node/Postgres) que o
	// operador escolheu pra atribuir a todo ticket criado/reaberto a partir
	// desse import — mesma técnica do historyImportTicketStatus acima. "" =
	// sem fila forçada (mensagem ao vivo nunca carrega esse campo também).
	historyImportQueueID string

	// historyImportTotalChats/ProcessedChats/TotalMessages: contadores de
	// progresso do import em andamento — usados só pra emitir o percentual
	// via SSE (Broker.emitImportProgress), pro frontend mostrar a mesma
	// barra de progresso que o import do canal Baileys já tinha. Resetados
	// a cada novo RequestHistoryImport (ver historyimport.go).
	historyImportTotalChats     int
	historyImportProcessedChats int
	historyImportTotalMessages  int

	// historyImportDoneTimer: o protocolo do WhatsApp não avisa "acabei de
	// mandar todo o histórico pedido" — cada conversa responde com seu
	// próprio blob HistorySync, em tempos diferentes, e conversas sem
	// mensagem nova desde a âncora simplesmente não respondem nada. Sem
	// alguma forma de "dar por encerrado", o progresso ficava parado pra
	// sempre em menos de 100% quando nem toda conversa pedida respondia.
	// Esse timer fecha o import automaticamente um tempo depois do pedido,
	// emitindo o estágio "done" com o que tiver chegado até lá.
	historyImportDoneTimer *time.Timer
}

func newSession(mgr *SessionManager, id, name string, client *whatsmeow.Client) *Session {
	s := &Session{
		id:     id,
		name:   name,
		mgr:    mgr,
		log:    mgr.log.With("session", id),
		client: client,
		auth:   AuthSnapshot{State: "connecting"},
		reg:    newCallRegistry(),
	}
	client.AddEventHandler(s.handleEvent)
	return s
}

func (s *Session) createCall(callID string) *call.CallManager {
	cm := call.NewCallManager(wa.NewSocket(s.client), s.log)
	s.wireCall(cm, callID)
	s.reg.add(callID, &activeCall{cm: cm})
	return cm
}

func (s *Session) wireCall(cm *call.CallManager, callID string) {
	cm.OnIncoming = func(c *call.CallInfo) {
		s.mgr.broker.upsertCall(CallRecord{
			SessionID: s.id, CallID: c.CallID, Direction: "inbound", Peer: c.PeerJid,
			StartedAt: time.Now().UnixMilli(), Status: StatusRinging,
		})
		// Register lifecycle metadata + log a "Ligação recebida" pill in the
		// peer's chat timeline so operators see the call inside the chat.
		now := time.Now().UnixMilli()
		s.reg.setLifecycleMeta(c.CallID, c.PeerJid, "in", c.MediaType == core.CallMediaTypeVideo, now)
		s.logCallEvent(c.PeerJid, "call_incoming", callDetail(c.MediaType == core.CallMediaTypeVideo, ""), now)
		peerName := s.resolveIncomingPeerName(c.PeerJid)
		// URA auto-accept: if this connection has an inbound flow bound,
		// accept the call automatically so the flow can drive TTS/STT.
		auto, reason := s.inboundFlowDecision()
		s.log.Info("inbound auto-accept check", "call_id", c.CallID,
			"will_auto_accept", auto, "reason", reason, "flow_id", s.flowID, "owner_id", s.ownerID)
		// Quando a URA vai atender automaticamente, NÃO mostramos o modal
		// "Incoming call" para o operador — o atendimento é todo do fluxo.
		if !auto {
			s.mgr.broker.emitIncoming(s.id, c.CallID, c.PeerJid, peerName, c.MediaType == core.CallMediaTypeVideo)
		}
		if auto {
			// Avisa a UI que a URA assumiu (toast com número de origem e hora).
			s.mgr.broker.emitUraAutoAttend(s.id, c.CallID, c.PeerJid, peerName, c.MediaType == core.CallMediaTypeVideo, now)
			cmRef := cm
			cid := c.CallID
			flowSnap := s.flowID
			go func() {
				// Small delay lets WhatsApp deliver the transport stanza so
				// AcceptCall has relay endpoints ready for media.
				time.Sleep(300 * time.Millisecond)
				ctx, cancel := context.WithTimeout(s.mgr.appCtx, 10*time.Second)
				defer cancel()
				if err := cmRef.AcceptCall(ctx, cid); err != nil {
					s.log.Warn("flow auto-accept failed", "call_id", cid, "err", err)
				} else {
					s.log.Info("flow auto-accepted call", "call_id", cid, "flow_id", flowSnap)
					// Trigger the inbound flow immediately after we accept,
					// without waiting for CallStateActive. Media relay can
					// take seconds to establish; the flow should already be
					// driving TTS by then. startInboundFlowOnce guards against
					// duplicate execution.
					s.startInboundFlowOnce(cid, c.PeerJid, "post-accept")
				}
			}()
		}
		// If we couldn't resolve a name synchronously, try the network
		// resolver in the background and re-emit so the modal can update.
		if !auto && peerName == "" {
			go func(callID, peer string, video bool) {
				ctx, cancel := context.WithTimeout(context.Background(), 8*time.Second)
				defer cancel()
				name, _, _ := resolveContactNameAndAvatar(ctx, s, peer, "", "")
				if name == "" {
					return
				}
				if s.mgr.chatMeta != nil {
					_ = s.mgr.chatMeta.SetName(ctx, s.id, peer, name, time.Now().UnixMilli())
				}
				s.mgr.broker.emitIncoming(s.id, callID, peer, name, video)
			}(c.CallID, c.PeerJid, c.MediaType == core.CallMediaTypeVideo)
		}
	}
	cm.OnStateChange = func(c *call.CallInfo) {
		if c.IsEnded() {
			s.noteCallEnded(c.CallID, c.StateData.EndReason)
			s.removeCall(c.CallID)
			s.mgr.broker.endCall(c.CallID, string(c.StateData.EndReason))
			return
		}
		// Inbound URA: as soon as the call enters Connecting (right after
		// our AcceptCall), try to start the bound flow. This avoids waiting
		// for Active, which can take a long time if WhatsApp's media relay
		// is slow. Active is kept as a fallback below.
		if c.StateData.State == core.CallStateConnecting && c.Direction == core.CallDirectionIncoming {
			s.startInboundFlowOnce(c.CallID, c.PeerJid, "connecting")
		}
		if c.StateData.State == core.CallStateActive {
			s.noteCallAnswered(c.CallID, c.PeerJid, c.MediaType == core.CallMediaTypeVideo)
			// Rede de segurança: se o outro lado desligar e o stanza de
			// CallTerminate correspondente nunca chegar (ver comentário em
			// lastAudioAt, callregistry.go), essa chamada ficaria "ativa" na
			// tela do CRM indefinidamente. watchCallSilence encerra sozinha
			// depois de um período longo sem áudio do peer.
			s.watchCallSilence(c.CallID, 180*time.Second)
			// Fallback in case Connecting wasn't observed (e.g. the call
			// went straight to Active or we attached late).
			if c.Direction == core.CallDirectionIncoming {
				s.startInboundFlowOnce(c.CallID, c.PeerJid, "active")
			}
			// Outbound calls (e.g. campaign-dialed URAs) do not go through
			// the inbound auto-accept path, so we have to kick the flow
			// from here as soon as the peer answers. We only do this when
			// the call has a per-call flow override registered — manual
			// dialer calls remain operator-driven.
			if c.Direction == core.CallDirectionOutgoing && s.reg.flowOverride(c.CallID) != "" {
				s.startInboundFlowOnce(c.CallID, c.PeerJid, "outbound-active")
			}
		}
		dir := "outbound"
		if c.Direction == core.CallDirectionIncoming {
			dir = "inbound"
		}
		existing, _ := s.mgr.broker.getCall(c.CallID)
		rec := CallRecord{
			SessionID: s.id, CallID: c.CallID, Direction: dir, Peer: c.PeerJid,
			StartedAt: time.Now().UnixMilli(), Status: mapStatus(c.StateData.State),
		}
		if existing != nil {
			rec.Owner = existing.Owner
			rec.StartedAt = existing.StartedAt
		}
		s.mgr.broker.upsertCall(rec)
	}
	cm.OnEnded = func(c *call.CallInfo) {
		s.noteCallEnded(c.CallID, c.StateData.EndReason)
		s.removeCall(c.CallID)
		s.mgr.broker.endCall(c.CallID, string(c.StateData.EndReason))
	}
	cm.OnPeerAudio = func(pcm16 []float32) {
		// Alimenta o watchdog de silêncio (watchCallSilence, abaixo) — ver
		// comentário em callregistry.go (lastAudioAt) pro porquê disso
		// existir: sinalização de chamada do WhatsApp não é reentregue em
		// reconexão, então se o stanza de encerramento real se perder no
		// exato momento em que o outro lado desliga, sem isso a chamada
		// ficava "ativa" na tela do CRM pra sempre.
		s.reg.touchAudio(callID, time.Now().UnixMilli())
		ac, ok := s.reg.get(callID)
		if !ok {
			return
		}
		if rec := ac.fullRecorder; rec != nil {
			rec.write(pcm16)
		}
		if sink := ac.flowAudioSink; sink != nil {
			// Copy so the flow consumer can buffer without racing the next frame.
			buf := make([]float32, len(pcm16))
			copy(buf, pcm16)
			sink(buf)
		}
		if ac.bridge == nil {
			return
		}
		_ = ac.bridge.WritePCM(pcm16)
	}
	cm.OnPeerVideo = func(au []byte) {
		ac, ok := s.reg.get(callID)
		if !ok || ac.bridge == nil {
			return
		}
		_ = ac.bridge.WriteVideo(au)
	}
}

func (s *Session) startOutgoing(ctx context.Context, peer types.JID, isVideo bool) (string, error) {
	callID := signaling.GenerateCallID()
	cm := s.createCall(callID)
	now := time.Now().UnixMilli()
	s.reg.setLifecycleMeta(callID, peer.String(), "out", isVideo, now)
	if err := cm.StartCall(ctx, callID, peer, isVideo); err != nil {
		s.removeCall(callID)
		return "", err
	}
	s.watchCallSetup(callID, 35*time.Second)
	s.logCallEvent(peer.String(), "call_outgoing", callDetail(isVideo, ""), now)
	return callID, nil
}

func (s *Session) callForEvent(from types.JID, data *waBinary.Node) (*activeCall, bool) {
	callID := callIDFromNode(wrapCall(from, data))
	if callID == "" {
		return nil, false
	}
	return s.reg.get(callID)
}

func (s *Session) onIncomingOffer(ctx context.Context, evt *events.CallOffer) {
	node := wrapCall(evt.From, evt.Data)
	callID := callIDFromNode(node)
	if callID == "" {
		return
	}
	if max := s.mgr.maxCalls; max > 0 && s.reg.count() >= max {
		s.rejectOffer(ctx, node, evt.From)
		return
	}
	cm := s.createCall(callID)
	cm.HandleCallOffer(ctx, node, evt.From)
	// BUG relatado: "a chamada já foi finalizada no celular e continua
	// tocando" no CRM. startOutgoing já tem watchCallSetup pra chamadas DE
	// SAÍDA (linha ~236) — chamadas RECEBIDAS nunca tinham o equivalente.
	// Sinalização de chamada do WhatsApp não é reentregue em reconexão
	// (diferente de mensagem): se o stanza de CallTerminate/timeout real
	// chegar bem no instante em que a sessão perde/retoma conexão, ele se
	// perde de vez, e o card "Chamada recebida" ficava tocando pra sempre
	// no CRM mesmo com a chamada já perdida/encerrada no celular de
	// verdade. 75s: um pouco acima do timeout natural do WhatsApp pra
	// chamada não atendida (~60s), então isso quase nunca dispara pra uma
	// chamada que ainda está genuinamente tocando — só limpa o card
	// quando o evento real se perdeu.
	s.watchCallSetup(callID, 75*time.Second)
}

func (s *Session) rejectOffer(ctx context.Context, node *waBinary.Node, from types.JID) {
	info := signaling.ExtractNodeInfo(node)
	if info == nil {
		return
	}
	creator := wanode.AttrString(info.InnerNode.Attrs, "call-creator")
	if creator == "" {
		creator = from.String()
	}
	reject := signaling.BuildRejectStanza(from, info.CallID, wanode.MustJID(creator))
	_ = wa.NewSocket(s.client).SendNode(ctx, reject)
	s.log.Info("inbound call rejected: session at capacity", "call_id", info.CallID)
}

func (s *Session) handleEvent(rawEvt any) {
	ctx := context.Background()
	switch evt := rawEvt.(type) {
	case *events.Connected:
		if id := s.client.Store.ID; id != nil {
			_ = s.mgr.store.setJID(s.mgr.appCtx, s.id, id.String())
		}
		s.setAuth(AuthSnapshot{State: "open", Paired: true})
		go s.refreshSelfAvatar()
		// Sinal de vida ao conectar: acerta o nome mostrado aos contatos e
		// conta como atividade do aparelho (ver presencekeepalive.go).
		if presenceInterval() > 0 {
			go func() {
				time.Sleep(3 * time.Second)
				s.pulsoDePresenca("conectou")
			}()
		}
	case *events.LoggedOut:
		// Aqui o WhatsApp DESCONECTOU o aparelho: só volta com QR novo.
		// O motivo vai para o log.
		s.log.Error("WhatsApp desconectou este aparelho (precisa ler o QR de novo)",
			"motivo", evt.Reason.String(), "codigo", int(evt.Reason), "no_connect", evt.OnConnect)
		s.setAuth(AuthSnapshot{State: "logged_out", Paired: false})
	case *events.StreamReplaced:
		// Outra conexão abriu ESTA MESMA sessão (as mesmas chaves): outro
		// processo do wacalls rodando junto, cópia do banco em outro servidor,
		// ou o mesmo número em duas instalações. Uma derruba a outra.
		s.log.Error("outra conexão abriu esta mesma sessão (stream replaced): há outro serviço/servidor usando este número com as mesmas chaves")
	case *events.Disconnected:
		// Só registra: a whatsmeow/watchdog reconecta.
		s.log.Warn("conexão com o WhatsApp caiu; o whatsmeow/watchdog vai reconectar")
	case *events.KeepAliveTimeout:
		// Socket aberto mas o WhatsApp não responde ao ping (conexão
		// "zumbi"). A whatsmeow derruba e reconecta sozinha depois de 3 min.
		s.log.Warn("WhatsApp não respondeu ao ping", "falhas", evt.ErrorCount, "ultimo_ok", evt.LastSuccess.Format(time.RFC3339))
	case *events.KeepAliveRestored:
		s.log.Info("WhatsApp voltou a responder ao ping")
	case *events.TemporaryBan:
		s.log.Error("WhatsApp bloqueou temporariamente este número", "detalhe", evt.String())
	case *events.ConnectFailure:
		s.log.Error("WhatsApp recusou a conexão", "motivo", evt.Reason.String(), "codigo", int(evt.Reason), "mensagem", evt.Message)
	case *events.CATRefreshError:
		s.log.Error("falha ao renovar a credencial da conexão (CAT); o watchdog vai reconectar", "err", evt.Error)
	case *events.CallOffer:
		s.onIncomingOffer(ctx, evt)
	case *events.CallAccept:
		callID := callIDFromNode(wrapCall(evt.From, evt.Data))
		if ac, ok := s.reg.get(callID); ok {
			s.log.Info("call accept event", "call_id", callID, "from", evt.From.String())
			ac.cm.HandleCallAccept(ctx, wrapCall(evt.From, evt.Data), evt.From)
			if s.mgr.flowExec != nil {
				flowID := s.reg.flowOverride(callID)
				if flowID == "" {
					flowID = s.flowID
				}
				s.mgr.flowExec.StartForCall(ctx, s.id, callID, evt.From.String(), s.ownerID, flowID)
			}
		}
	case *events.CallPreAccept:
		callID := callIDFromNode(wrapCall(evt.From, evt.Data))
		if ac, ok := s.reg.get(callID); ok {
			s.log.Info("call preaccept event", "call_id", callID, "from", evt.From.String())
			ac.cm.HandleCallPreAccept(ctx, wrapCall(evt.From, evt.Data), evt.From)
		}
	case *events.CallTransport:
		if ac, ok := s.callForEvent(evt.From, evt.Data); ok {
			s.log.Info("call transport event", "from", evt.From.String())
			ac.cm.HandleCallTransport(ctx, wrapCall(evt.From, evt.Data), evt.From)
		}
	case *events.CallTerminate:
		callID := callIDFromNode(wrapCall(evt.From, evt.Data))
		if ac, ok := s.reg.get(callID); ok {
			s.log.Info("call terminate event", "call_id", callID, "from", evt.From.String())
			ac.cm.HandleCallTerminate(wrapCall(evt.From, evt.Data))
			if s.mgr.flowExec != nil {
				s.mgr.flowExec.Abort(callID)
			}
			// Garantia de encerramento: HandleCallTerminate acima depende da
			// máquina de estados do CallManager disparar OnEnded/OnStateChange
			// pra chamar broker.endCall. Quando esse disparo não acontece (ou
			// demora), NENHUM evento "call-ended" sai — e o card da ligação
			// fica preso na tela do operador pra sempre. Isso só aparecia em
			// chamada RECEBIDA encerrada pelo cliente, porque em chamada
			// discada o operador desliga pelo próprio CRM (o hangup limpa o
			// card localmente, sem depender deste evento) — exatamente o
			// "recebo ligação, cliente desliga e o botão continua" relatado.
			// broker.endCall é idempotente (no-op se o callID já saiu de
			// b.calls), então chamar aqui além do caminho normal é seguro.
			s.mgr.broker.endCall(callID, "terminated")
			_ = ac
		} else if callID != "" {
			// Rede de segurança: se o CallManager não tem esse callID no
			// registro local (ex: chamada terminada pelo lado de quem liga
			// ANTES de qualquer accept/preaccept nosso — algumas variantes do
			// stanza de terminate chegam sem os campos que
			// s.reg.get espera, ou a chamada nunca chegou a ser totalmente
			// registrada por uma corrida de eventos), o card "Chamada
			// recebida" no CRM nunca recebia call-ended e ficava preso na
			// tela até o watchdog de 120s do frontend (ver WaCallsContext.js)
			// limpar sozinho. broker.endCall é idempotente/no-op se o
			// callID não estiver em b.calls, então é seguro chamar aqui sem
			// checar de novo — só garante que, se a chamada FOI anunciada via
			// upsertCall (OnIncoming), ela sempre recebe o encerramento.
			s.log.Info("call terminate event sem registro local — encerrando via broker mesmo assim", "call_id", callID, "from", evt.From.String())
			s.mgr.broker.endCall(callID, "terminated")
		}
	case *events.CallReject:
		callID := callIDFromNode(wrapCall(evt.From, evt.Data))
		if ac, ok := s.reg.get(callID); ok {
			ac.cm.HandleCallTerminate(wrapCall(evt.From, evt.Data))
			if s.mgr.flowExec != nil {
				s.mgr.flowExec.Abort(callID)
			}
			// Mesma garantia de encerramento do CallTerminate acima (ver
			// comentário lá) — endCall é idempotente.
			s.mgr.broker.endCall(callID, "rejected")
			_ = ac
		} else if callID != "" {
			// Mesma rede de segurança do CallTerminate acima, aplicada ao
			// reject (cliente recusou/encerrou sem nunca ter sido "aceito"
			// do nosso lado).
			s.log.Info("call reject event sem registro local — encerrando via broker mesmo assim", "call_id", callID, "from", evt.From.String())
			s.mgr.broker.endCall(callID, "rejected")
		}
	case *events.Message:
		// "" = sem override de status de ticket nem de fila (mensagem ao
		// vivo, não importada). Ver historyImportTicketStatus/
		// historyImportQueueID e handleHistorySync (historyimport.go) pro
		// outro caminho que passa valores reais aqui.
		s.handleWAMessage(evt, "", "")
	case *events.Receipt:
		// Confirmação de entrega/leitura de uma mensagem NOSSA (✓✓ cinza →
		// azul no WhatsApp) — ver receipts.go.
		s.handleReceipt(evt)
	case *events.ChatPresence:
		// "digitando..."/"gravando áudio..." (chat state) de uma conversa
		// específica. O whatsmeow só entrega isso depois que assinamos via
		// client.SubscribePresence (ver handlePresenceSubscribe em
		// contactsync.go, chamado pelo Node quando o atendente abre um
		// ticket — mesmo gatilho que já existia pro Baileys). Media=="audio"
		// junto com State=="composing" é o equivalente a "gravando áudio".
		s.mgr.broker.emitPresence(s.id, evt.Chat.String(), string(evt.State), string(evt.Media), 0)
	case *events.Presence:
		// Presença ampla (online/visto por último) de um contato — só chega
		// depois de SubscribePresence também. Unavailable==false não
		// significa "digitando", só "com o WhatsApp aberto/online".
		state := "available"
		if evt.Unavailable {
			state = "unavailable"
		}
		var lastSeenMs int64
		if !evt.LastSeen.IsZero() {
			lastSeenMs = evt.LastSeen.UnixMilli()
		}
		s.mgr.broker.emitPresence(s.id, evt.From.String(), state, "", lastSeenMs)
	case *events.GroupInfo:
		// Mudanças de participantes do grupo (entrou, saiu, virou admin).
		// O CRM usa "add" para disparar a saudação de novos membros; os
		// outros vão junto porque custam nada e evitam ter que mexer aqui
		// de novo depois.
		jidStrings := func(list []types.JID) []string {
			out := make([]string, 0, len(list))
			for _, j := range list {
				out = append(out, j.ToNonAD().String())
			}
			return out
		}
		group := evt.JID.String()
		if len(evt.Join) > 0 {
			s.mgr.broker.emitGroupParticipants(s.id, group, "add", jidStrings(evt.Join))
		}
		if len(evt.Leave) > 0 {
			s.mgr.broker.emitGroupParticipants(s.id, group, "remove", jidStrings(evt.Leave))
		}
		if len(evt.Promote) > 0 {
			s.mgr.broker.emitGroupParticipants(s.id, group, "promote", jidStrings(evt.Promote))
		}
		if len(evt.Demote) > 0 {
			s.mgr.broker.emitGroupParticipants(s.id, group, "demote", jidStrings(evt.Demote))
		}
	case *events.HistorySync:
		// Processamento pode envolver centenas de mensagens (persistência +
		// broadcast SSE por mensagem) — roda fora do goroutine de eventos do
		// whatsmeow pra não travar o processamento de outros eventos
		// enquanto isso acontece.
		go s.handleHistorySync(evt)
	}
}

func (s *Session) connect(ctx context.Context) error {
	if s.client.Store.ID != nil {
		return s.client.Connect()
	}
	return s.startPairing(ctx)
}

func (s *Session) startPairing(ctx context.Context) error {
	qrChan, err := s.client.GetQRChannel(ctx)
	if err != nil {
		return err
	}
	if err := s.client.Connect(); err != nil {
		return err
	}
	go func() {
		for evt := range qrChan {
			switch evt.Event {
			case "code":
				s.log.Info("scan the QR code to pair this session")
				qrterminal.GenerateHalfBlock(evt.Code, qrterminal.L, os.Stdout)
				s.setAuth(AuthSnapshot{State: "qr", QR: evt.Code})
				s.mgr.broker.emitSessionQR(s.id, evt.Code)
			case "success":
				if id := s.client.Store.ID; id != nil {
					_ = s.mgr.store.setJID(s.mgr.appCtx, s.id, id.String())
				}
				// QR "success" só confirma que o pareamento em si deu certo —
				// o socket ainda leva um tempo (visto em produção: até ~80s)
				// pra ficar de fato pronto pra trocar mensagem, sinalizado só
				// depois pelo events.Connected do whatsmeow (handleEvent
				// acima). Reportar "open" já aqui fazia o CRM mostrar
				// "Conectado" prematuramente — o operador mandava mensagem
				// de teste e ela demorava bem mais que o esperado pra
				// aparecer, parecendo bug. "syncing" deixa o CRM mostrar um
				// estado intermediário (ex: "Conectando") até o
				// events.Connected real confirmar que já pode receber.
				s.setAuth(AuthSnapshot{State: "syncing", Paired: true})
				go s.refreshSelfAvatar()
			case "timeout":
				s.setAuth(AuthSnapshot{State: "logged_out", Paired: false})
			}
		}
	}()
	return nil
}

func (s *Session) setAuth(a AuthSnapshot) {
	s.mu.Lock()
	s.auth = a
	s.mu.Unlock()
	s.mgr.broker.emitAuthState(s.id, a)
	s.mgr.broker.emitSessionList(s.mgr.infos())
}

func (s *Session) info() SessionInfo {
	s.mu.Lock()
	a := s.auth
	avatar := s.avatarURL
	s.mu.Unlock()
	jid := ""
	if id := s.client.Store.ID; id != nil {
		jid = id.String()
	}
	return SessionInfo{
		ID: s.id, Name: s.name, JID: jid, OwnerID: s.ownerID,
		State: a.State, Paired: a.Paired || jid != "",
		Mode: s.mode, CloudPhoneID: s.cloudPhoneID, CloudWABAID: s.cloudWABAID, CloudConfigured: s.cloudConfigured,
		AvatarURL: avatar,
		Color:     s.color, IsDefault: s.isDefault, AllowGroups: s.allowGroups,
		IntegrationToken: s.integrationToken, QueueID: s.queueID,
		RedirectMinutes: s.redirectMinutes, FlowID: s.flowID, ChatFlowID: s.chatFlowID,
		GreetingMessage: s.greetingMessage, CompletionMessage: s.completionMessage,
		OutOfHoursMessage: s.outOfHoursMessage,
		SurveyEnabled:     s.surveyEnabled, SurveyPrompt: s.surveyPrompt,
	}
}

// refreshSelfAvatar fetches the connected number's WhatsApp profile picture
// (best-effort) and exposes it via SessionInfo so the Connections list can
// render the real photo of the linked phone instead of a generic icon.
func (s *Session) refreshSelfAvatar() {
	id := s.client.Store.ID
	if id == nil {
		return
	}
	ctx, cancel := context.WithTimeout(s.mgr.appCtx, 20*time.Second)
	defer cancel()
	info, err := s.client.GetProfilePictureInfo(ctx, id.ToNonAD(), &whatsmeow.GetProfilePictureParams{Preview: false})
	if err != nil || info == nil || info.URL == "" {
		return
	}
	saved, derr := downloadAvatar(ctx, id.String(), info.ID, info.URL)
	if derr != nil || saved == "" {
		return
	}
	s.mu.Lock()
	changed := s.avatarURL != saved
	s.avatarURL = saved
	s.mu.Unlock()
	if changed {
		s.mgr.broker.emitSessionList(s.mgr.infos())
	}
}

func (s *Session) setBridge(callID string, b *Bridge) {
	oldB, found := s.reg.setBridge(callID, b)
	if !found {
		b.Close()
		return
	}
	if oldB != nil {
		oldB.Close()
	}
}

func (s *Session) removeCall(callID string) {
	ac, ok := s.reg.remove(callID)
	if !ok {
		return
	}
	if ac.fullRecorder != nil && s.mgr != nil && s.mgr.calls != nil {
		go func(sid, cid string, buf *callRecorderBuf) {
			ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
			defer cancel()
			if _, err := persistCallRecording(ctx, s.mgr.calls, sid, cid, buf); err != nil {
				s.log.Warn("server-side call recording persist failed", "call_id", cid, "err", err)
			} else {
				s.log.Info("server-side call recording saved", "call_id", cid)
			}
		}(s.id, callID, ac.fullRecorder)
	}
	if ac.bridge != nil {
		ac.bridge.Close()
	}
}

func (s *Session) terminateCall(callID string, reason core.EndCallReason) {
	ac, ok := s.reg.get(callID)
	if !ok {
		return
	}
	_ = ac.cm.EndCall(context.Background(), reason)
}

func (s *Session) watchCallSetup(callID string, timeout time.Duration) {
	go func() {
		timer := time.NewTimer(timeout)
		defer timer.Stop()
		select {
		case <-timer.C:
		case <-s.mgr.appCtx.Done():
			return
		}
		ac, ok := s.reg.get(callID)
		if !ok || ac == nil || ac.cm == nil {
			return
		}
		ci := ac.cm.CurrentCall()
		if ci == nil || ci.IsEnded() || ci.IsActive() {
			return
		}
		s.log.Warn("call setup timeout; terminating stuck call", "call_id", callID, "state", string(ci.StateData.State), "peer", ci.PeerJid)
		_ = ac.cm.EndCall(context.Background(), core.EndCallReasonTimeout)
	}()
}

// watchCallSilence is the "active call" counterpart to watchCallSetup: once
// a call reaches CallStateActive, it polls periodically and force-ends the
// call if no peer-audio frame has arrived for `threshold` — the only sign,
// short of the (possibly lost) CallTerminate stanza, that the other side
// really hung up. Started once per call (see markSilenceWatchStarted) from
// OnStateChange's CallStateActive branch. threshold is intentionally
// generous (minutes, not seconds) to avoid ending a call that's simply
// quiet — this is a last-resort safety net, not a VAD/silence detector.
func (s *Session) watchCallSilence(callID string, threshold time.Duration) {
	if !s.reg.markSilenceWatchStarted(callID) {
		return
	}
	go func() {
		ticker := time.NewTicker(20 * time.Second)
		defer ticker.Stop()
		for {
			select {
			case <-ticker.C:
			case <-s.mgr.appCtx.Done():
				return
			}
			ac, ok := s.reg.get(callID)
			if !ok || ac == nil || ac.cm == nil {
				return
			}
			ci := ac.cm.CurrentCall()
			if ci == nil || ci.IsEnded() {
				return
			}
			if !ci.IsActive() {
				continue
			}
			last := s.reg.lastAudioAt(callID)
			if last == 0 {
				// Ainda não chegou nenhum frame de áudio do peer desde que
				// ficou ativa — usa ConnectedAt como referência inicial em
				// vez de disparar na primeira checagem.
				if ci.StateData.ConnectedAt != nil {
					last = ci.StateData.ConnectedAt.UnixMilli()
				}
			}
			if last > 0 && time.Now().UnixMilli()-last > threshold.Milliseconds() {
				s.log.Warn("call silence timeout; terminating stuck call", "call_id", callID, "peer", ci.PeerJid, "silent_for_ms", time.Now().UnixMilli()-last)
				_ = ac.cm.EndCall(context.Background(), core.EndCallReasonTimeout)
				return
			}
		}
	}()
}

func (s *Session) teardownAllCalls() {
	for _, ac := range s.reg.drain() {
		_ = ac.cm.EndCall(context.Background(), core.EndCallReasonUserEnded)
		if ac.bridge != nil {
			ac.bridge.Close()
		}
	}
}

func (s *Session) replaceClient(client *whatsmeow.Client) {
	s.teardownAllCalls()
	s.mu.Lock()
	old := s.client
	s.client = client
	s.mu.Unlock()
	if old != nil {
		old.Disconnect()
	}
	client.AddEventHandler(s.handleEvent)
}

// clientRef devolve o *whatsmeow.Client atual sob o mutex da sessão. O campo
// é trocado em runtime por replaceClient (relogin), então lê-lo direto de
// outra goroutine (health, watchdog de reconexão) era um data race.
func (s *Session) clientRef() *whatsmeow.Client {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.client
}

// resolveIncomingPeerName returns a friendly display name for an inbound
// caller using cached chat metadata first and the in-memory whatsmeow
// contact cache as a fallback. Returns "" when nothing is known yet — the
// caller may then trigger a network lookup.
func (s *Session) resolveIncomingPeerName(peerJid string) string {
	if peerJid == "" {
		return ""
	}
	ctx, cancel := context.WithTimeout(context.Background(), 1500*time.Millisecond)
	defer cancel()
	if s.mgr != nil && s.mgr.chatMeta != nil {
		if m, ok, _ := s.mgr.chatMeta.Get(ctx, s.id, peerJid); ok && m.Name != "" {
			return m.Name
		}
	}
	if s.client != nil && s.client.Store != nil && s.client.Store.Contacts != nil {
		if jid, err := types.ParseJID(peerJid); err == nil {
			if ci, cerr := s.client.Store.Contacts.GetContact(ctx, jid.ToNonAD()); cerr == nil && ci.Found {
				switch {
				case ci.FullName != "":
					return ci.FullName
				case ci.PushName != "":
					return ci.PushName
				case ci.BusinessName != "":
					return ci.BusinessName
				case ci.FirstName != "":
					return ci.FirstName
				}
			}
		}
	}
	return ""
}

func (s *Session) shutdown() {
	s.teardownAllCalls()
	s.client.Disconnect()
}

// inboundFlowDecision reports whether this connection should auto-accept
// inbound calls (because a flow is bound) and a short reason string for
// observability. The reason is logged so operators can diagnose why an
// inbound call did not auto-answer when they expected it to.
//
// Rules:
//   - If the connection has a flow explicitly bound (flowID != ""), trust
//     the operator intent and auto-accept. We do NOT require the flow to be
//     marked Enabled or to have trigger=inbound, because the user already
//     expressed intent by linking it on the connection.
//   - Otherwise, never auto-accept. The call must ring until a system user
//     clicks Atender.
func (s *Session) inboundFlowDecision() (bool, string) {
	if s == nil || s.mgr == nil || s.mgr.flowExec == nil || s.mgr.flowExec.store == nil {
		return false, "flow executor unavailable"
	}
	ctx, cancel := context.WithTimeout(s.mgr.appCtx, 3*time.Second)
	defer cancel()
	s.mu.Lock()
	voiceFlowID := strings.TrimSpace(s.flowID)
	chatFlowID := strings.TrimSpace(s.chatFlowID)
	s.mu.Unlock()
	if voiceFlowID != "" && chatFlowID != "" {
		return false, "chat flow selected; voice flow ignored so call rings for attendant"
	}
	if voiceFlowID != "" {
		f, err := s.mgr.flowExec.store.Get(ctx, voiceFlowID)
		if err != nil {
			return false, "bound flow lookup failed: " + err.Error()
		}
		if f == nil {
			return false, "bound flow id not found in store"
		}
		if flowKind(f) == "chat" {
			return false, "bound flow is chat-only"
		}
		return true, "bound voice flow on connection"
	}
	// No voice flow bound on this connection → do NOT auto-answer with URA.
	// The call stays ringing so a human attendant can pick it up.
	return false, "no voice flow bound on connection; ring for attendant"
}

// startInboundFlowOnce starts the bound inbound flow for a call exactly
// once. Safe to call from multiple state transitions (Connecting, Active)
// and from the auto-accept goroutine; subsequent calls are no-ops.
func (s *Session) startInboundFlowOnce(callID, peer, reason string) {
	if s == nil || s.mgr == nil || s.mgr.flowExec == nil {
		return
	}
	if !s.reg.markFlowStarted(callID) {
		return
	}
	// Arm server-side recording for this URA/flow-driven call so the
	// recording shows up in /history and BI reports. Safe to call
	// multiple times (idempotent).
	s.reg.armRecorder(callID, 16000)
	flowID := s.reg.flowOverride(callID)
	if flowID == "" {
		flowID = strings.TrimSpace(s.flowID)
		if flowID == "" {
			if fid, ok := s.resolveLegacyVoiceFlowID(s.mgr.appCtx); ok {
				flowID = fid
			}
		}
	}
	if strings.TrimSpace(flowID) == "" {
		s.log.Info("inbound flow start skipped: no flow bound", "call_id", callID, "peer", peer)
		return
	}
	traceID := ""
	if s.mgr.flowExec != nil && s.mgr.flowExec.tracer != nil {
		traceID = s.mgr.flowExec.tracer.TraceIDFor(callID)
		s.mgr.flowExec.tracer.Record(FlowTraceStep{
			CallID: callID, SessionID: s.id, OwnerID: s.ownerID, TraceID: traceID,
			Level: "info", Code: "accept", Message: reason,
			Data: map[string]any{"peer": peer, "flowIdBound": flowID},
		})
	}
	s.log.Info("inbound flow start", "call_id", callID, "trace_id", traceID, "reason", reason, "flow_id", flowID, "peer", peer)
	s.mgr.flowExec.StartForCall(s.mgr.appCtx, s.id, callID, peer, s.ownerID, flowID)
}

// boundChatFlowID returns the chatbot flow linked to this connection. New
// versions persist chat_flow_id separately from flow_id. For rows saved before
// that migration, a legacy flow_id that points to a chat graph is still treated
// as the chat flow so existing customer setups keep working after upgrade.
func (s *Session) boundChatFlowID(ctx context.Context) string {
	if s == nil {
		return ""
	}
	s.mu.Lock()
	chatFlowID := strings.TrimSpace(s.chatFlowID)
	legacyFlowID := strings.TrimSpace(s.flowID)
	s.mu.Unlock()
	if chatFlowID != "" {
		return chatFlowID
	}
	if legacyFlowID == "" || s.mgr == nil || s.mgr.flowExec == nil || s.mgr.flowExec.store == nil {
		return ""
	}
	f, err := s.mgr.flowExec.store.Get(ctx, legacyFlowID)
	if err == nil && f != nil && flowKind(f) == "chat" {
		return legacyFlowID
	}
	return ""
}

// resolveLegacyVoiceFlowID mirrors boundChatFlowID for old rows that only had
// flow_id. It returns a value only when the stored flow_id is a voice/URA flow.
func (s *Session) resolveLegacyVoiceFlowID(ctx context.Context) (string, bool) {
	if s == nil || s.mgr == nil || s.mgr.flowExec == nil || s.mgr.flowExec.store == nil {
		return "", false
	}
	s.mu.Lock()
	flowID := strings.TrimSpace(s.flowID)
	s.mu.Unlock()
	if flowID == "" {
		return "", false
	}
	f, err := s.mgr.flowExec.store.Get(ctx, flowID)
	if err == nil && f != nil && flowKind(f) != "chat" {
		return flowID, true
	}
	return "", false
}

func mapStatus(state core.CallState) CallStatus {
	switch state {
	case core.CallStateActive:
		return StatusConnected
	case core.CallStateEnded:
		return StatusEnded
	case core.CallStateInitiating:
		return StatusStarting
	default:
		return StatusRinging
	}
}

// noteCallAnswered emits a single "Ligação atendida" pill the first time a
// call transitions to the Active state (works for both inbound accepts and
// outbound dialer pickups).
func (s *Session) noteCallAnswered(callID, peerJid string, video bool) {
	ts := time.Now().UnixMilli()
	peer, _, first := s.reg.markAnswered(callID, ts)
	if !first {
		return
	}
	if peer == "" {
		peer = peerJid
	}
	s.logCallEvent(peer, "call_answered", callDetail(video, ""), ts)
}

// noteCallEnded inspects the lifecycle snapshot to decide which terminal
// chat pill to emit: missed, rejected, no-answer, cancelled or ended.
func (s *Session) noteCallEnded(callID string, reason core.EndCallReason) {
	snap, first := s.reg.markEnded(callID)
	if !first || snap.peer == "" {
		return
	}
	ts := time.Now().UnixMilli()
	kind := "call_ended"
	detail := ""
	if snap.answeredAt > 0 {
		secs := (ts - snap.answeredAt) / 1000
		if secs < 0 {
			secs = 0
		}
		detail = formatCallDuration(secs)
	} else {
		switch reason {
		case core.EndCallReasonDeclined:
			kind = "call_rejected"
		case core.EndCallReasonCancelled:
			if snap.direction == "out" {
				kind = "call_canceled"
			} else {
				kind = "call_missed"
			}
		case core.EndCallReasonTimeout, core.EndCallReasonBusy, core.EndCallReasonDoNotDisturb:
			if snap.direction == "out" {
				kind = "call_no_answer"
			} else {
				kind = "call_missed"
			}
		default:
			if snap.direction == "in" {
				kind = "call_missed"
			} else {
				kind = "call_no_answer"
			}
		}
	}
	if snap.video {
		if detail == "" {
			detail = "vídeo"
		} else {
			detail = "vídeo · " + detail
		}
	}
	s.logCallEvent(snap.peer, kind, detail, ts)
}

// logCallEvent ensures the chat row exists for the peer, then writes a
// lifecycle pill of the given kind so the conversation timeline displays it
// inline. Best-effort, swallows errors.
func (s *Session) logCallEvent(peer, kind, detail string, ts int64) {
	if s == nil || s.mgr == nil || s.mgr.chatMeta == nil || peer == "" {
		return
	}
	ctx, cancel := context.WithTimeout(s.mgr.appCtx, 4*time.Second)
	defer cancel()
	existing, _, _ := s.mgr.chatMeta.Get(ctx, s.id, peer)
	if existing.Status == "" {
		// First contact via a call (no prior message). Seed the chat row so
		// the conversation surfaces in "Aguardando" with the call pill.
		name := s.resolveIncomingPeerName(peer)
		m := ChatMeta{
			SessionID: s.id, ChatJID: peer, Name: name,
			IsGroup: false, Status: ChatStatusWaiting,
			UpdatedAt: ts,
		}
		if err := s.mgr.chatMeta.Upsert(ctx, m); err == nil {
			s.mgr.broker.emitChatMeta(m)
			if name == "" {
				go s.fetchAvatarAsync(peer)
			}
		}
	} else {
		// Bump updated_at so the chat resurfaces at the top of the list.
		existing.UpdatedAt = ts
		_ = s.mgr.chatMeta.Upsert(ctx, existing)
		s.mgr.broker.emitChatMeta(existing)
	}
	s.mgr.logChatEvent(ctx, s.id, peer, kind, "", "", detail, ts)
}

func callDetail(video bool, extra string) string {
	if video {
		if extra != "" {
			return "vídeo · " + extra
		}
		return "vídeo"
	}
	return extra
}

func formatCallDuration(secs int64) string {
	if secs < 0 {
		secs = 0
	}
	h := secs / 3600
	m := (secs % 3600) / 60
	s := secs % 60
	if h > 0 {
		return fmtTwo(h) + ":" + fmtTwo(m) + ":" + fmtTwo(s)
	}
	return fmtTwo(m) + ":" + fmtTwo(s)
}

func fmtTwo(n int64) string {
	if n < 10 {
		return "0" + itoa(n)
	}
	return itoa(n)
}

func itoa(n int64) string {
	if n == 0 {
		return "0"
	}
	neg := n < 0
	if neg {
		n = -n
	}
	buf := make([]byte, 0, 8)
	for n > 0 {
		buf = append([]byte{byte('0' + n%10)}, buf...)
		n /= 10
	}
	if neg {
		buf = append([]byte{'-'}, buf...)
	}
	return string(buf)
}
