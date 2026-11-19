package main

// SipCallManager é o análogo, para chamadas SIP via troncal externa
// (baresip), do call.CallManager usado pelas chamadas WhatsApp — mesmo
// contrato de alto nível ([]float32 PCM, callbacks de estado) pra poder ser
// ligado ao MESMO Bridge (cmd/server/bridge.go) sem nenhuma mudança nele.
//
// Diferente do WhatsApp (uma sessão por número pareado, várias chamadas
// concorrentes possíveis), aqui modelamos UMA troncal SIP global pro
// servidor inteiro, com no máximo UMA chamada ativa por vez — o baresip por
// trás também trabalha nesse conceito de "chamada atual" (accept/hangup sem
// parâmetro operam sobre ela).
import (
	"context"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"log/slog"
	"strings"
	"sync"
	"time"
)

// newSipCallID gera um id local (não depende de nenhuma lib externa nova —
// evita risco de dependência não resolvível sem acesso à rede pra `go mod`).
func newSipCallID() string {
	b := make([]byte, 12)
	_, _ = rand.Read(b)
	return "sip_" + hex.EncodeToString(b)
}

type SipCallState string

const (
	SipCallRinging SipCallState = "ringing"
	SipCallActive  SipCallState = "active"
	SipCallEnded   SipCallState = "ended"
)

type SipCallInfo struct {
	CallID    string       `json:"callId"`
	Direction string       `json:"direction"` // "inbound" | "outbound"
	Peer      string       `json:"peer"`      // número/URI SIP do outro lado
	State     SipCallState `json:"state"`
	StartedAt int64        `json:"startedAt"`
	EndedAt   int64        `json:"endedAt,omitempty"`
	EndReason string       `json:"endReason,omitempty"`
}

// SipTrunkConfig são as credenciais da troncal SIP externa (Asterisk,
// FreePBX, operadora VoIP...). Persistidas via settingsStore (KV "sip_trunk")
// pelo lado da API; usadas aqui só para montar o URI de discagem.
type SipTrunkConfig struct {
	Enabled   bool   `json:"enabled"`
	Host      string `json:"host"`
	Port      int    `json:"port"`
	Username  string `json:"username"`
	Password  string `json:"password"`
	Domain    string `json:"domain"`    // se vazio, usa Host
	Transport string `json:"transport"` // "udp" | "tcp" | "tls" (default udp)
	CallerID  string `json:"callerId"`
}

type SipCallManager struct {
	ctl   *baresipCtl
	audio *sipAudioPump
	log   *slog.Logger

	cfgMu sync.RWMutex
	cfg   SipTrunkConfig

	mu      sync.Mutex
	current *SipCallInfo
	bridge  *Bridge

	OnIncoming    func(SipCallInfo)
	OnStateChange func(SipCallInfo)
	OnEnded       func(SipCallInfo)
}

func newSipCallManager(ctl *baresipCtl, audio *sipAudioPump, log *slog.Logger) *SipCallManager {
	m := &SipCallManager{ctl: ctl, audio: audio, log: log}
	ctl.OnEvent = m.handleBaresipEvent
	audio.OnPeerPCM = m.onPeerPCM
	return m
}

func (m *SipCallManager) SetConfig(cfg SipTrunkConfig) {
	m.cfgMu.Lock()
	m.cfg = cfg
	m.cfgMu.Unlock()
}

func (m *SipCallManager) Config() SipTrunkConfig {
	m.cfgMu.RLock()
	defer m.cfgMu.RUnlock()
	return m.cfg
}

func (m *SipCallManager) Current() *SipCallInfo {
	m.mu.Lock()
	defer m.mu.Unlock()
	if m.current == nil {
		return nil
	}
	cp := *m.current
	return &cp
}

// ---------------- comandos ----------------

func normalizeSipNumber(raw string) string {
	raw = strings.TrimSpace(raw)
	var b strings.Builder
	for _, r := range raw {
		if r >= '0' && r <= '9' || r == '+' || r == '*' || r == '#' {
			b.WriteRune(r)
		}
	}
	return b.String()
}

func (m *SipCallManager) dialURI(number string) (string, error) {
	cfg := m.Config()
	if !cfg.Enabled || cfg.Host == "" {
		return "", fmt.Errorf("troncal SIP não configurada — configure host/usuário/senha antes de discar")
	}
	domain := cfg.Domain
	if domain == "" {
		domain = cfg.Host
	}
	digits := normalizeSipNumber(number)
	if digits == "" {
		return "", fmt.Errorf("número inválido")
	}
	// sip:<numero>@<host>:<porta>
	host := domain
	if cfg.Port > 0 && cfg.Port != 5060 {
		host = fmt.Sprintf("%s:%d", domain, cfg.Port)
	}
	uri := fmt.Sprintf("sip:%s@%s", digits, host)
	// Alguns provedores só aceitam INVITE no transporte em que a UA está
	// registrada (TCP/TLS). Sem esse parâmetro o baresip pode escolher UDP
	// por default e a operadora descarta silenciosamente o INVITE — a
	// plataforma mostra "chamando" mas o celular nunca toca.
	transport := strings.ToLower(strings.TrimSpace(cfg.Transport))
	if transport != "" && transport != "udp" {
		uri = fmt.Sprintf("%s;transport=%s", uri, transport)
	}
	return uri, nil
}

// Dial inicia uma chamada de saída. Retorna o callID interno (gerado por
// nós — o "id" que o baresip usa é interno dele e não é necessário pra
// accept/hangup, que operam sobre a "chamada atual").
func (m *SipCallManager) Dial(ctx context.Context, number string) (string, error) {
	m.mu.Lock()
	if m.current != nil && m.current.State != SipCallEnded {
		m.mu.Unlock()
		return "", fmt.Errorf("já existe uma chamada SIP em andamento")
	}
	m.mu.Unlock()

	uri, err := m.dialURI(number)
	if err != nil {
		return "", err
	}
	if !m.ctl.Connected() {
		return "", fmt.Errorf("sem conexão com o baresip (serviço rodando? ctrl_tcp habilitado?)")
	}

	callID := newSipCallID()
	info := &SipCallInfo{
		CallID: callID, Direction: "outbound", Peer: number,
		State: SipCallRinging, StartedAt: time.Now().UnixMilli(),
	}
	m.mu.Lock()
	m.current = info
	m.mu.Unlock()

	m.log.Info("sip: discando", "callId", callID, "uri", uri, "number", number)
	if _, err := m.ctl.Send(ctx, "dial", uri); err != nil {
		m.mu.Lock()
		m.current = nil
		m.mu.Unlock()
		m.log.Error("sip: falha ao enviar dial ao baresip", "err", err, "uri", uri)
		return "", err
	}
	return callID, nil
}

func (m *SipCallManager) Accept(ctx context.Context, callID string) error {
	if !m.sameCurrentCall(callID) {
		return fmt.Errorf("chamada não encontrada")
	}
	if _, err := m.ctl.Send(ctx, "accept", ""); err != nil {
		return err
	}
	return nil
}

func (m *SipCallManager) Reject(ctx context.Context, callID string) error {
	// baresip não distingue "rejeitar" de "desligar" via ctrl_tcp — hangup
	// serve pros dois (o efeito do lado da troncal é o SIP CANCEL/BYE certo
	// dependendo do estado interno da chamada).
	return m.Hangup(ctx, callID)
}

func (m *SipCallManager) Hangup(ctx context.Context, callID string) error {
	if !m.sameCurrentCall(callID) {
		return nil // já encerrada / não é a chamada atual: no-op
	}
	_, err := m.ctl.Send(ctx, "hangup", "")
	return err
}

func (m *SipCallManager) sameCurrentCall(callID string) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	return m.current != nil && m.current.CallID == callID
}

// ---------------- ponte de áudio com o Bridge (navegador) ----------------

// AttachBridge liga a chamada atual ao Bridge WebRTC (mesma peça usada pelas
// chamadas WhatsApp) — chamado pelo handler HTTP /webrtc quando o navegador
// manda a oferta SDP.
func (m *SipCallManager) AttachBridge(callID string, b *Bridge) error {
	if !m.sameCurrentCall(callID) {
		m.mu.Lock()
		curID := ""
		if m.current != nil {
			curID = m.current.CallID
		}
		m.mu.Unlock()
		// Log com os dois IDs: ajuda a distinguir "a chamada já tinha
		// encerrado antes do navegador terminar de negociar áudio" (curID
		// vazio) de um bug de fato no ID usado pelo navegador (curID
		// preenchido mas diferente do pedido).
		m.log.Warn("sip: tentativa de anexar bridge WebRTC numa chamada que não é a atual", "callIdPedido", callID, "callIdAtual", curID)
		return fmt.Errorf("chamada não encontrada")
	}
	m.mu.Lock()
	old := m.bridge
	m.bridge = b
	m.mu.Unlock()
	if old != nil {
		old.Close()
	}
	return nil
}

func (m *SipCallManager) FeedCapturedPCM(pcm []float32) {
	m.audio.WriteBrowserPCM(pcm)
}

func (m *SipCallManager) onPeerPCM(pcm []float32) {
	m.mu.Lock()
	b := m.bridge
	m.mu.Unlock()
	if b == nil {
		return
	}
	_ = b.WritePCM(pcm)
}

// ---------------- eventos do baresip ----------------

func (m *SipCallManager) handleBaresipEvent(ev baresipEvent) {
	if ev.Class != "call" {
		return
	}
	switch ev.Type {
	case "CALL_INCOMING":
		m.mu.Lock()
		busy := m.current != nil && m.current.State != SipCallEnded
		var info *SipCallInfo
		if !busy {
			info = &SipCallInfo{
				CallID: ev.ID, Direction: "inbound", Peer: peerNumberFromURI(ev.PeerURI),
				State: SipCallRinging, StartedAt: time.Now().UnixMilli(),
			}
			m.current = info
		}
		m.mu.Unlock()
		if busy {
			// Já em outra chamada — recusa educadamente em vez de deixar
			// tocando pra sempre sem UI nenhuma pra atender.
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			_, _ = m.ctl.Send(ctx, "hangup", "")
			cancel()
			return
		}
		if cb := m.OnIncoming; cb != nil && info != nil {
			cb(*info)
		}

	case "CALL_RINGING", "CALL_PROGRESS":
		m.updateCurrent(ev.ID, func(i *SipCallInfo) { i.State = SipCallRinging })

	case "CALL_ESTABLISHED":
		var started *SipCallInfo
		m.updateCurrent(ev.ID, func(i *SipCallInfo) { i.State = SipCallActive })
		m.mu.Lock()
		if m.current != nil {
			cp := *m.current
			started = &cp
		}
		m.mu.Unlock()
		if started != nil {
			m.log.Info("sip: chamada estabelecida", "callId", started.CallID, "direction", started.Direction)
			if err := m.audio.Start(context.Background()); err != nil {
				m.log.Error("sip audio: falha ao iniciar pump", "err", err)
			}
		}

	case "CALL_CLOSED":
		var ended *SipCallInfo
		m.mu.Lock()
		if m.current != nil {
			m.current.State = SipCallEnded
			m.current.EndedAt = time.Now().UnixMilli()
			m.current.EndReason = ev.Param
			cp := *m.current
			ended = &cp
			m.current = nil
		}
		b := m.bridge
		m.bridge = nil
		m.mu.Unlock()
		m.audio.Stop()
		if b != nil {
			b.Close()
		}
		if ended != nil {
			// Log explícito do motivo de encerramento — importante pra
			// diagnosticar relatos de "atendi e caiu na hora": se aparecer
			// aqui muito rápido depois de um CALL_ESTABLISHED (poucos
			// ms/segundos de durationMs), o encerramento veio do lado do
			// baresip/provedor SIP (ex.: sem RTP a tempo, rejeição da
			// operadora) — não da ponte WebRTC com o navegador. ev.Param
			// (aqui em "reason") costuma trazer o motivo relatado pelo
			// baresip.
			m.log.Info("sip: chamada encerrada", "callId", ended.CallID, "direction", ended.Direction, "reason", ended.EndReason, "durationMs", ended.EndedAt-ended.StartedAt)
		}
		if ended != nil && m.OnEnded != nil {
			m.OnEnded(*ended)
		}

	default:
		// Sobe pra Info: tipos como CALL_DIALING, CALL_FAILED,
		// CALL_TRANSFER_FAILED, CALL_REDIRECT explicam por que o celular
		// nunca tocou (ex.: "486 Busy Here", "603 Decline", "408 Request
		// Timeout" da operadora). Sem isso o diagnóstico fica cego.
		m.log.Info("sip: evento de chamada", "type", ev.Type, "param", ev.Param, "peer", ev.PeerURI)
	}

}

func (m *SipCallManager) updateCurrent(baresipID string, fn func(*SipCallInfo)) {
	m.mu.Lock()
	if m.current == nil {
		m.mu.Unlock()
		return
	}
	fn(m.current)
	cp := *m.current
	m.mu.Unlock()
	if cb := m.OnStateChange; cb != nil {
		cb(cp)
	}
}

// peerNumberFromURI extrai o "user" de um SIP URI (sip:5511999999999@host) —
// best-effort, cai pro texto cru se não reconhecer o formato.
func peerNumberFromURI(uri string) string {
	u := strings.TrimPrefix(uri, "sip:")
	u = strings.TrimPrefix(u, "sips:")
	if at := strings.Index(u, "@"); at >= 0 {
		return u[:at]
	}
	return u
}
