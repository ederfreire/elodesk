package main

import (
	"context"
	"log/slog"
	"os"
	"strconv"
	"strings"
	"sync/atomic"
	"time"
)

// ---------------------------------------------------------------------------
// Watchdog de reconexão
//
// O whatsmeow tenta reconectar sozinho, mas quando o socket morre de um jeito
// que ele considera terminal (rede caindo por muito tempo, DNS falhando no
// boot da VPS) a sessão fica parada em "disconnected" até alguém reiniciar o
// serviço. Este watchdog varre as sessões pareadas a cada 30s e faz um
// Connect() com backoff exponencial por sessão (30s -> 5min), zerando o
// backoff assim que a conexão volta.
// ---------------------------------------------------------------------------

type reconnectState struct {
	attempts int
	nextAt   time.Time
}

var reconnectTotal atomic.Int64

func (m *SessionManager) reconnectCount() int64 { return reconnectTotal.Load() }

func reconnectInterval() time.Duration {
	if raw := strings.TrimSpace(os.Getenv("WACALLS_RECONNECT_INTERVAL_S")); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil && n > 0 {
			return time.Duration(n) * time.Second
		}
	}
	return 30 * time.Second
}

// startReconnectWatchdog roda em background durante todo o processo.
func (m *SessionManager) startReconnectWatchdog(ctx context.Context) {
	if strings.TrimSpace(os.Getenv("WACALLS_RECONNECT")) == "0" {
		return
	}
	log := m.log.With("component", "reconnect")
	interval := reconnectInterval()
	state := map[string]*reconnectState{}

	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				m.reconnectPass(state, log)
			}
		}
	}()
}

func (m *SessionManager) reconnectPass(state map[string]*reconnectState, log *slog.Logger) {
	m.mu.RLock()
	sessions := make([]*Session, 0, len(m.sessions))
	for _, s := range m.sessions {
		sessions = append(sessions, s)
	}
	m.mu.RUnlock()

	live := map[string]bool{}
	now := time.Now()

	for _, sess := range sessions {
		live[sess.id] = true
		client := sess.clientRef()
		// Sessões Cloud API não têm client whatsmeow; sessões nunca pareadas
		// precisam do QR e não podem ser "reconectadas" às cegas.
		if client == nil || client.Store == nil || client.Store.ID == nil {
			continue
		}
		if client.IsConnected() {
			delete(state, sess.id)
			continue
		}
		st := state[sess.id]
		if st == nil {
			st = &reconnectState{}
			state[sess.id] = st
		}
		if now.Before(st.nextAt) {
			continue
		}
		st.attempts++
		backoff := time.Duration(st.attempts) * 30 * time.Second
		if backoff > 5*time.Minute {
			backoff = 5 * time.Minute
		}
		st.nextAt = now.Add(backoff)

		reconnectTotal.Add(1)
		log.Info("reconnecting session", "session", sess.id, "attempt", st.attempts)
		if err := client.Connect(); err != nil {
			log.Warn("reconnect failed", "session", sess.id, "err", err, "retry_in_s", int(backoff.Seconds()))
			continue
		}
		// NÃO limpar o estado aqui.
		//
		// `client.Connect()` devolve nil assim que o WEBSOCKET ABRE — isso
		// não quer dizer que a sessão autenticou. Uma sessão deslogada no
		// celular abre o websocket normalmente e é derrubada logo depois.
		//
		// Com o `delete(state, sess.id)` que existia neste ponto, o contador
		// era zerado toda vez, então `attempts` voltava a 1 na passada
		// seguinte e o backoff NUNCA passava de 30 segundos — justamente no
		// caso em que ele seria útil. Na prática: uma sessão morta reabria um
		// websocket a cada 30s, para sempre, gastando CPU, rede e handshake
		// com o WhatsApp sem nenhum trabalho útil.
		//
		// A limpeza correta já acontece no topo deste mesmo laço, via
		// `client.IsConnected()`, que só é verdade quando a conexão está de
		// fato estabelecida. O custo de esperar por ela é no máximo um tick.
	}

	// Não deixa o mapa crescer com sessões já apagadas.
	for id := range state {
		if !live[id] {
			delete(state, id)
		}
	}
}
