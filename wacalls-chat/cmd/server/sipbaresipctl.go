package main

// Cliente do módulo ctrl_tcp do baresip (https://github.com/baresip/baresip,
// modules/ctrl_tcp/ctrl_tcp.c). Protocolo confirmado lendo o código-fonte
// oficial (não é suposição): uma única conexão TCP, mensagens JSON com
// framing netstring ("<tamanho>:<payload>,"), comandos no formato
//   {"command":"dial","params":"sip:5511999999999@host","token":"..."}
// respostas
//   {"response":true,"ok":true,"data":"...","token":"..."}
// e eventos assíncronos (não amarrados a nenhum comando)
//   {"event":true,"class":"call","type":"CALL_ESTABLISHED","id":"...", ...}
//
// O nome do comando ("command") é repassado praticamente cru pro long-command
// table do baresip (cmd_process_long), então usamos os nomes documentados em
// https://github.com/baresip/baresip/wiki/Commands-registry: "dial",
// "accept", "hangup", "listcalls", "uastat", "reginfo", "uanew", "uadel".
//
// IMPORTANTE (risco assumido, ver aviso ao usuário): não há como testar este
// cliente contra uma instância real de baresip neste ambiente — o protocolo
// de framing/comando foi verificado direto no código-fonte oficial (alta
// confiança), mas o formato exato dos campos de evento (nomes de "type" como
// CALL_INCOMING/CALL_RINGING/CALL_ESTABLISHED/CALL_CLOSED, e dos campos
// auxiliares como "peeruri"/"accountaor"/"direction") pode variar levemente
// entre versões do baresip — o parser abaixo é tolerante (ignora campos
// desconhecidos, loga eventos não reconhecidos em vez de falhar).

import (
	"bufio"
	"context"
	"crypto/rand"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"net"
	"sync"
	"time"
)

type baresipEvent struct {
	Class      string `json:"class"`
	Type       string `json:"type"`
	Param      string `json:"param"`
	AccountAOR string `json:"accountaor"`
	Direction  string `json:"direction"`
	PeerURI    string `json:"peeruri"`
	ID         string `json:"id"`
}

type baresipResponse struct {
	Response bool   `json:"response"`
	OK       bool   `json:"ok"`
	Data     string `json:"data"`
	Token    string `json:"token"`
}

// baresipCtl mantém uma conexão persistente (com reconexão automática) ao
// ctrl_tcp do baresip. O módulo só aceita UMA conexão por vez (uma nova
// derruba a anterior do lado do baresip), então nunca abrimos mais de uma.
type baresipCtl struct {
	addr string
	log  *slog.Logger

	mu      sync.Mutex
	conn    net.Conn
	writer  *bufio.Writer
	pending map[string]chan baresipResponse

	OnEvent func(baresipEvent)

	closed chan struct{}
}

func newBaresipCtl(addr string, log *slog.Logger) *baresipCtl {
	return &baresipCtl{
		addr:    addr,
		log:     log,
		pending: map[string]chan baresipResponse{},
		closed:  make(chan struct{}),
	}
}

// Run conecta (e reconecta, com backoff) até o contexto ser cancelado.
// Roda em background; chame via `go ctl.Run(ctx)` uma única vez.
func (c *baresipCtl) Run(ctx context.Context) {
	backoff := time.Second
	for {
		select {
		case <-ctx.Done():
			return
		default:
		}
		if err := c.runOnce(ctx); err != nil {
			c.log.Warn("sip ctrl_tcp: conexão com baresip caiu/falhou", "addr", c.addr, "err", err)
		}
		select {
		case <-ctx.Done():
			return
		case <-time.After(backoff):
		}
		if backoff < 15*time.Second {
			backoff *= 2
		}
	}
}

func (c *baresipCtl) runOnce(ctx context.Context) error {
	dialer := net.Dialer{Timeout: 5 * time.Second}
	conn, err := dialer.DialContext(ctx, "tcp", c.addr)
	if err != nil {
		return err
	}
	defer conn.Close()

	c.mu.Lock()
	c.conn = conn
	c.writer = bufio.NewWriter(conn)
	c.mu.Unlock()
	c.log.Info("sip ctrl_tcp: conectado ao baresip", "addr", c.addr)

	reader := bufio.NewReader(conn)
	for {
		payload, err := readNetstring(reader)
		if err != nil {
			c.mu.Lock()
			c.conn = nil
			// Destrava qualquer comando pendente esperando resposta — a
			// conexão caiu, não vai chegar resposta nenhuma.
			for tok, ch := range c.pending {
				close(ch)
				delete(c.pending, tok)
			}
			c.mu.Unlock()
			return err
		}
		c.dispatch(payload)
	}
}

func (c *baresipCtl) dispatch(payload []byte) {
	// Tenta primeiro como resposta de comando (tem "response":true e um
	// "token" que bate com algum comando pendente); senão trata como evento.
	var probe struct {
		Response bool `json:"response"`
		Event    any  `json:"event"`
	}
	if err := json.Unmarshal(payload, &probe); err != nil {
		c.log.Warn("sip ctrl_tcp: payload JSON inválido", "err", err, "raw", string(payload))
		return
	}
	if probe.Response {
		var resp baresipResponse
		if err := json.Unmarshal(payload, &resp); err != nil {
			c.log.Warn("sip ctrl_tcp: resposta JSON inválida", "err", err)
			return
		}
		c.mu.Lock()
		ch, ok := c.pending[resp.Token]
		if ok {
			delete(c.pending, resp.Token)
		}
		c.mu.Unlock()
		if ok {
			ch <- resp
			close(ch)
		}
		return
	}
	if probe.Event != nil {
		var ev baresipEvent
		if err := json.Unmarshal(payload, &ev); err != nil {
			c.log.Warn("sip ctrl_tcp: evento JSON inválido", "err", err)
			return
		}
		if cb := c.OnEvent; cb != nil {
			cb(ev)
		}
		return
	}
	// Nem resposta nem evento reconhecido — pode ser uma mensagem SIP
	// (message_handler do baresip, "message":true) que não usamos. Ignora.
}

var errBaresipNotConnected = errors.New("baresip ctrl_tcp: não conectado (verifique se o serviço baresip está rodando e ctrl_tcp_listen está configurado)")

// Send envia um comando e aguarda a resposta síncrona (ou o timeout do
// contexto). params vai vazio quando o comando não precisa de argumento
// (ex.: "accept", "hangup" — operam sobre a chamada "atual" do baresip).
func (c *baresipCtl) Send(ctx context.Context, command, params string) (string, error) {
	c.mu.Lock()
	conn := c.conn
	writer := c.writer
	c.mu.Unlock()
	if conn == nil || writer == nil {
		return "", errBaresipNotConnected
	}

	token := randomToken()
	msg := struct {
		Command string `json:"command"`
		Params  string `json:"params,omitempty"`
		Token   string `json:"token"`
	}{Command: command, Params: params, Token: token}
	body, err := json.Marshal(msg)
	if err != nil {
		return "", err
	}

	ch := make(chan baresipResponse, 1)
	c.mu.Lock()
	c.pending[token] = ch
	c.mu.Unlock()

	c.mu.Lock()
	writeErr := writeNetstring(c.writer, body)
	if writeErr == nil {
		writeErr = c.writer.Flush()
	}
	c.mu.Unlock()
	if writeErr != nil {
		c.mu.Lock()
		delete(c.pending, token)
		c.mu.Unlock()
		return "", writeErr
	}

	select {
	case resp, ok := <-ch:
		if !ok {
			return "", fmt.Errorf("sip ctrl_tcp: conexão perdida aguardando resposta de %q", command)
		}
		if !resp.OK {
			return "", fmt.Errorf("sip ctrl_tcp: comando %q falhou: %s", command, resp.Data)
		}
		return resp.Data, nil
	case <-ctx.Done():
		c.mu.Lock()
		delete(c.pending, token)
		c.mu.Unlock()
		return "", ctx.Err()
	case <-time.After(10 * time.Second):
		c.mu.Lock()
		delete(c.pending, token)
		c.mu.Unlock()
		return "", fmt.Errorf("sip ctrl_tcp: timeout aguardando resposta de %q", command)
	}
}

func (c *baresipCtl) Connected() bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.conn != nil
}

func randomToken() string {
	b := make([]byte, 8)
	_, _ = rand.Read(b)
	return hex.EncodeToString(b)
}
