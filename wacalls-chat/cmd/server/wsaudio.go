package main

// Áudio da ligação por WebSocket — alternativa ao WebRTC (bridge.go).
//
// Baseado no transporte WebSocket do ArendCalls (licença MIT,
// github.com/nathanarend/ArendCalls, cmd/server/wsbridge.go e
// httpapi_audio.go). O áudio é o mesmo PCM Int16 LE 16 kHz mono do
// DataChannel "pcm", uma mensagem binária por quadro. Como vai por
// HTTP/WebSocket, passa pelo proxy (nginx → backend → aqui) e NÃO depende de
// nenhuma porta UDP aberta no servidor — é o "plano B" quando o WebRTC não
// conecta (firewall, rede corporativa).
//
// No EquipeChat o navegador não fala direto com este serviço: o backend Node
// recebe os quadros pelo socket do sistema e abre este WebSocket aqui com o
// cookie da conta de serviço.

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"log/slog"
	"net"
	"net/http"
	"sync"
	"sync/atomic"
	"time"

	"wacalls/internal/voip/core"
	"wacalls/internal/voip/media"

	"github.com/coder/websocket"
)

const (
	wsReadLimit      = 64 << 10
	wsSendQueue      = 32 // ~1 s de áudio
	wsWriteTimeout   = 5 * time.Second
	wsPingInterval   = 20 * time.Second
	wsPingTimeout    = 10 * time.Second
	wsReconnectGrace = 15 * time.Second
	wsPrebufferMs    = 60
)

var (
	errWSQueueFull = errors.New("websocket send queue full")
	errWSClosed    = errors.New("websocket closed")
)

// WSBridge é a perna do navegador por WebSocket.
type WSBridge struct {
	conn   *websocket.Conn
	log    *slog.Logger
	out    chan []byte
	ctx    context.Context
	cancel context.CancelFunc
	done   chan struct{}

	mu           sync.Mutex
	OnBrowserPCM func(pcm []float32)
	OnTerminal   func()

	closeOnce    sync.Once
	failOnce     sync.Once
	serverClosed atomic.Bool
}

func newWSBridge(conn *websocket.Conn, log *slog.Logger) *WSBridge {
	conn.SetReadLimit(wsReadLimit)
	ctx, cancel := context.WithCancel(context.Background())
	return &WSBridge{
		conn:   conn,
		log:    log,
		out:    make(chan []byte, wsSendQueue),
		ctx:    ctx,
		cancel: cancel,
		done:   make(chan struct{}),
	}
}

func (b *WSBridge) start() {
	go b.readLoop()
	go b.writeLoop()
	go b.pingLoop()
}

func (b *WSBridge) Done() <-chan struct{} { return b.done }

func (b *WSBridge) readLoop() {
	defer close(b.done)
	for {
		typ, data, err := b.conn.Read(b.ctx)
		if err != nil {
			b.fail(err)
			return
		}
		if typ != websocket.MessageBinary || len(data) == 0 {
			continue
		}
		b.mu.Lock()
		cb := b.OnBrowserPCM
		b.mu.Unlock()
		if cb != nil {
			cb(media.PCMInt16LEToFloat32(data))
		}
	}
}

func (b *WSBridge) writeLoop() {
	for {
		select {
		case <-b.ctx.Done():
			return
		case frame := <-b.out:
			ctx, cancel := context.WithTimeout(b.ctx, wsWriteTimeout)
			err := b.conn.Write(ctx, websocket.MessageBinary, frame)
			cancel()
			if err != nil {
				b.fail(err)
				return
			}
		}
	}
}

func (b *WSBridge) pingLoop() {
	t := time.NewTicker(wsPingInterval)
	defer t.Stop()
	for {
		select {
		case <-b.ctx.Done():
			return
		case <-t.C:
			ctx, cancel := context.WithTimeout(b.ctx, wsPingTimeout)
			err := b.conn.Ping(ctx)
			cancel()
			if err != nil {
				b.fail(err)
				return
			}
		}
	}
}

func (b *WSBridge) fail(err error) {
	b.failOnce.Do(func() {
		b.cancel()
		b.conn.CloseNow()
		if b.serverClosed.Load() {
			return
		}
		b.log.Info("áudio por WebSocket caiu", "err", err)
		b.mu.Lock()
		cb := b.OnTerminal
		b.mu.Unlock()
		if cb != nil {
			cb()
		}
	})
}

// WritePCM não bloqueia (roda no loop de recepção do WhatsApp): fila cheia
// descarta o quadro.
func (b *WSBridge) WritePCM(pcm []float32) error {
	if len(pcm) == 0 {
		return nil
	}
	if b.ctx.Err() != nil {
		return errWSClosed
	}
	select {
	case b.out <- media.PCMFloat32ToInt16LE(pcm):
		return nil
	default:
		return errWSQueueFull
	}
}

// Close não bloqueia: é chamado com locks do CallManager presos.
func (b *WSBridge) Close() {
	b.closeOnce.Do(func() {
		b.serverClosed.Store(true)
		b.mu.Lock()
		b.OnBrowserPCM = nil
		b.OnTerminal = nil
		b.mu.Unlock()
		go func() {
			_ = b.conn.Close(websocket.StatusNormalClosure, "call_ended")
			b.cancel()
		}()
	})
}

// hijackSemPrazo: o http.Server deste serviço tem ReadTimeout (10 min). Numa
// conexão "sequestrada" pelo WebSocket esse prazo continuaria valendo e
// derrubaria ligações longas. Aqui o prazo é zerado logo após o Hijack.
type hijackSemPrazo struct{ http.ResponseWriter }

func (h hijackSemPrazo) Hijack() (net.Conn, *bufio.ReadWriter, error) {
	hj, ok := h.ResponseWriter.(http.Hijacker)
	if !ok {
		return nil, nil, errors.New("hijack não suportado")
	}
	c, rw, err := hj.Hijack()
	if err == nil {
		_ = c.SetDeadline(time.Time{})
	}
	return c, rw, err
}

// GET /api/sessions/{sid}/calls/{id}/audio?memberId=&userId=&name=&avatar=
func (s *server) handleAudioWS(w http.ResponseWriter, r *http.Request) {
	sess := s.sessionByID(w, r, r.PathValue("sid"))
	if sess == nil {
		return
	}
	callID := r.PathValue("id")
	ac, ok := sess.reg.get(callID)
	if !ok {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "no such call"})
		return
	}
	q := r.URL.Query()
	ident := confIdentity{MemberID: q.Get("memberId"), UserID: q.Get("userId"), Name: q.Get("name"), Avatar: q.Get("avatar")}

	// Este serviço só escuta em 127.0.0.1 e quem conecta é o backend (com o
	// cookie da conta de serviço): não há Origin de navegador para conferir.
	conn, err := websocket.Accept(hijackSemPrazo{w}, r, &websocket.AcceptOptions{
		CompressionMode:    websocket.CompressionDisabled,
		InsecureSkipVerify: true,
	})
	if err != nil {
		s.log.Warn("áudio por WebSocket: falha no aceite", "call", callID, "err", err)
		return
	}
	log := s.log.With("call", callID, "transporte", "websocket")
	wsb := newWSBridge(conn, log)
	br := &Bridge{ws: wsb, log: log}

	// Os callbacks do Bridge são definidos em ligarPernaNavegador; o WSBridge
	// só repassa (lidos a cada quadro).
	wsb.OnBrowserPCM = func(pcm []float32) {
		if cb := br.OnBrowserPCM; cb != nil {
			cb(pcm)
		}
	}
	// Queda do WebSocket: espera um pouco por uma reconexão (que troca o
	// bridge da chamada) antes de encerrar a ligação.
	br.OnTerminalICE = func() {
		go func() {
			time.Sleep(wsReconnectGrace)
			if cur, ok := sess.reg.get(callID); ok && cur.bridge == br {
				log.Info("áudio por WebSocket não voltou; encerrando a ligação")
				sess.terminateCall(callID, core.EndCallReasonUserEnded)
			}
		}()
	}
	wsb.OnTerminal = func() {
		if cb := br.OnTerminalICE; cb != nil {
			cb()
		}
	}

	s.ligarPernaNavegador(sess, ac, callID, br, ident, r)

	cfg, _ := json.Marshal(map[string]any{"type": "config", "prebufferMs": wsPrebufferMs})
	ctx, cancel := context.WithTimeout(context.Background(), wsWriteTimeout)
	_ = conn.Write(ctx, websocket.MessageText, cfg)
	cancel()

	log.Info("áudio da ligação conectado por WebSocket")
	wsb.start()
	<-wsb.Done()
}
