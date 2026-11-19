package main

import (
	"context"
	"log/slog"
	"os"
	"strconv"
	"strings"
	"time"

	"go.mau.fi/whatsmeow"
	"go.mau.fi/whatsmeow/types"
)

// ---------------------------------------------------------------------------
// Presença periódica ("sinal de vida" do aparelho vinculado)
//
// O WhatsApp desconecta aparelhos vinculados (o WhatsApp Plus é um deles)
// que ficam ~14 dias sem atividade — e aí só volta lendo o QR de novo. Esta
// rotina manda "disponível" para cada sessão conectada a cada 24 h (e uma
// vez ao conectar), e logo em seguida "indisponível": conta como atividade
// do aparelho, acerta o nome (pushname) mostrado aos contatos, e não deixa o
// aparelho marcado como "online" (o que pode calar as notificações do
// celular).
//
// Configuração (variáveis de ambiente do serviço wacalls-chat):
//   WA_PRESENCE_INTERVAL=24h        (duração do Go: 12h, 30m…)
//   WA_PRESENCE_INTERVAL_HOURS=24   (alternativa em horas)
//   WA_PRESENCE_INTERVAL=0 ou off   (desliga a rotina)
// Padrão: 24 h.
// ---------------------------------------------------------------------------

func presenceInterval() time.Duration {
	if raw := strings.TrimSpace(strings.ToLower(os.Getenv("WA_PRESENCE_INTERVAL"))); raw != "" {
		if raw == "0" || raw == "off" || raw == "desligado" {
			return 0
		}
		if d, err := time.ParseDuration(raw); err == nil && d > 0 {
			if d < 5*time.Minute {
				d = 5 * time.Minute
			}
			return d
		}
	}
	if raw := strings.TrimSpace(os.Getenv("WA_PRESENCE_INTERVAL_HOURS")); raw != "" {
		if h, err := strconv.ParseFloat(raw, 64); err == nil {
			if h <= 0 {
				return 0
			}
			d := time.Duration(h * float64(time.Hour))
			if d < 5*time.Minute {
				d = 5 * time.Minute
			}
			return d
		}
	}
	return 24 * time.Hour
}

// pulsoDePresenca manda "disponível" e, depois de alguns segundos,
// "indisponível". Falhar não é grave (ex.: sessão sem pushname ainda).
func (s *Session) pulsoDePresenca(motivo string) {
	client := s.clientePresenca()
	if client == nil || client.Store == nil || client.Store.ID == nil || !client.IsConnected() {
		return
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	err := client.SendPresence(ctx, types.PresenceAvailable)
	cancel()
	if err != nil {
		s.log.Debug("presença (disponível) não enviada", "motivo", motivo, "err", err)
		return
	}
	s.log.Info("sinal de presença enviado ao WhatsApp", "motivo", motivo)
	time.Sleep(5 * time.Second)
	if c := s.clientePresenca(); c != nil && c.IsConnected() {
		ctx2, cancel2 := context.WithTimeout(context.Background(), 10*time.Second)
		_ = c.SendPresence(ctx2, types.PresenceUnavailable)
		cancel2()
	}
}

// startPresenceKeepalive roda em background durante todo o processo.
func (m *SessionManager) startPresenceKeepalive(ctx context.Context) {
	interval := presenceInterval()
	log := m.log.With("component", "presenca")
	if interval == 0 {
		log.Info("sinal de presença periódico desligado (WA_PRESENCE_INTERVAL)")
		return
	}
	log.Info("sinal de presença periódico ligado", "intervalo", interval.String())
	go func() {
		ticker := time.NewTicker(interval)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				m.sendPresenceToAll(log)
			}
		}
	}()
}

func (m *SessionManager) sendPresenceToAll(log *slog.Logger) {
	m.mu.RLock()
	sessions := make([]*Session, 0, len(m.sessions))
	for _, s := range m.sessions {
		sessions = append(sessions, s)
	}
	m.mu.RUnlock()
	n := 0
	for _, sess := range sessions {
		if c := sess.clientePresenca(); c != nil && c.IsConnected() && c.Store != nil && c.Store.ID != nil {
			n++
			go sess.pulsoDePresenca("rotina")
		}
	}
	log.Info("rodada do sinal de presença", "sessoes", n)
}

// clientePresenca devolve o client atual da sessão (trocado em replaceClient).
func (s *Session) clientePresenca() *whatsmeow.Client {
	s.mu.Lock()
	defer s.mu.Unlock()
	return s.client
}
