package main

// Endpoints REST da troncal SIP (baresip). Análogos aos endpoints de chamada
// WhatsApp em httpapi.go (/api/sessions/{sid}/calls...): agora com
// {companyId} no caminho em vez de "uma troncal global pro servidor
// inteiro" — ver sipregistry.go pro porquê (cada empresa tem seu próprio
// processo baresip, config e dispositivos de áudio, geridos pelo
// SipRegistry).
//
// AVISO (repassado também ao usuário na entrega): o protocolo de comando do
// baresip (ctrl_tcp) foi verificado direto no código-fonte oficial, mas
// nunca testado contra uma instância real neste ambiente — é esperado picos
// de ajuste fino (principalmente a config de conta SIP / reload) no primeiro
// uso em produção.

import (
	"context"
	"encoding/json"
	"io"
	"net/http"
	"strings"
	"time"

	"wacalls/internal/voip/core"
)

func (s *server) registerSipRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/sip/{companyId}/settings", s.requireAuth(s.handleGetSipSettings))
	mux.HandleFunc("PUT /api/sip/{companyId}/settings", s.requireAuth(s.handleSetSipSettings))
	mux.HandleFunc("GET /api/sip/{companyId}/status", s.requireAuth(s.handleSipStatus))

	mux.HandleFunc("POST /api/sip/{companyId}/calls", s.requireAuth(s.handleSipDial))
	mux.HandleFunc("POST /api/sip/{companyId}/calls/{id}/webrtc", s.requireAuth(s.handleSipWebRTC))
	mux.HandleFunc("POST /api/sip/{companyId}/calls/{id}/accept", s.requireAuth(s.handleSipAccept))
	mux.HandleFunc("POST /api/sip/{companyId}/calls/{id}/reject", s.requireAuth(s.handleSipReject))
	mux.HandleFunc("DELETE /api/sip/{companyId}/calls/{id}", s.requireAuth(s.handleSipHangup))
}

// ---------------- settings (troncal SIP por empresa) ----------------

// sipSettingsResponse nunca devolve a senha em claro pro frontend depois de
// salva (mesmo padrão de qualquer campo de credencial no sistema) — devolve
// hasPassword pra UI saber se já tem senha configurada sem precisar
// retype-ar toda vez que abre a tela. sipPort é informativo: é a porta de
// sinalização SIP dedicada dessa empresa (ver sipregistry.go) — só importa
// se o provedor da troncal exigir apontar pra uma porta fixa em vez de
// registration-based (a maioria não exige).
type sipSettingsResponse struct {
	SipTrunkConfig
	HasPassword bool `json:"hasPassword"`
	SipPort     int  `json:"sipPort,omitempty"`
}

func (s *server) handleGetSipSettings(w http.ResponseWriter, r *http.Request) {
	companyID := r.PathValue("companyId")
	if companyID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "companyId required"})
		return
	}
	cfg, err := s.sipRegistry.LoadConfig(r.Context(), companyID)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	resp := sipSettingsResponse{SipTrunkConfig: cfg, HasPassword: cfg.Password != ""}
	resp.Password = ""
	if t := s.sipRegistry.Get(companyID); t != nil {
		resp.SipPort = t.sipPort
	}
	writeJSON(w, http.StatusOK, resp)
}

func (s *server) handleSetSipSettings(w http.ResponseWriter, r *http.Request) {
	companyID := r.PathValue("companyId")
	if companyID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "companyId required"})
		return
	}
	body, err := io.ReadAll(http.MaxBytesReader(w, r.Body, 16*1024))
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "payload too large"})
		return
	}
	var in SipTrunkConfig
	if err := json.Unmarshal(body, &in); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	in.Host = strings.TrimSpace(in.Host)
	in.Username = strings.TrimSpace(in.Username)
	in.Domain = strings.TrimSpace(in.Domain)
	in.Transport = strings.ToLower(strings.TrimSpace(in.Transport))
	if in.Transport == "" {
		in.Transport = "udp"
	}
	if in.Port == 0 {
		in.Port = 5060
	}
	// Se a senha vier vazia mas já havia uma configurada, mantém a antiga —
	// evita que salvar outros campos (ex.: só o callerId) apague a senha só
	// porque o campo voltou vazio da tela de edição.
	if in.Password == "" {
		if existing, err := s.sipRegistry.LoadConfig(r.Context(), companyID); err == nil {
			in.Password = existing.Password
		}
	}
	if in.Enabled && (in.Host == "" || in.Username == "") {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "host e usuário são obrigatórios pra habilitar a troncal SIP"})
		return
	}

	if err := s.sipRegistry.SaveConfig(r.Context(), companyID, in); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}

	resp := sipSettingsResponse{SipTrunkConfig: in, HasPassword: in.Password != ""}
	resp.Password = ""
	if t := s.sipRegistry.Get(companyID); t != nil {
		resp.SipPort = t.sipPort
	}
	writeJSON(w, http.StatusOK, resp)
}

func (s *server) handleSipStatus(w http.ResponseWriter, r *http.Request) {
	companyID := r.PathValue("companyId")
	t := s.sipRegistry.Get(companyID)
	if t == nil {
		// Empresa nunca salvou/habilitou uma troncal nesse boot do
		// wacalls-chat — status "vazio" em vez de spawnar um processo só
		// pra responder um GET de status.
		writeJSON(w, http.StatusOK, map[string]any{
			"baresipConnected": false, "trunkEnabled": false, "current": nil,
		})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{
		"baresipConnected": t.ctl.Connected(),
		"trunkEnabled":     t.mgr.Config().Enabled,
		"current":          t.mgr.Current(),
	})
}

// ---------------- chamadas ----------------

// trunkFor resolve a troncal já viva dessa empresa (nunca spawna uma nova
// aqui — se a empresa nunca salvou configurações habilitadas, não existe
// troncal pra discar/atender/desligar nada, e a resposta é um erro claro em
// vez de silenciosamente criar um processo baresip sem conta nenhuma).
func (s *server) trunkFor(w http.ResponseWriter, r *http.Request) (*sipTrunk, string, bool) {
	companyID := r.PathValue("companyId")
	if companyID == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "companyId required"})
		return nil, "", false
	}
	t := s.sipRegistry.Get(companyID)
	if t == nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "troncal SIP não configurada pra essa empresa — salve host/usuário/senha antes de discar"})
		return nil, companyID, false
	}
	return t, companyID, true
}

func (s *server) handleSipDial(w http.ResponseWriter, r *http.Request) {
	t, companyID, ok := s.trunkFor(w, r)
	if !ok {
		return
	}
	var body struct {
		Number string `json:"number"`
		Phone  string `json:"phone"` // alias, mesmo nome de campo usado pelo /calls do WhatsApp
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid json"})
		return
	}
	number := body.Number
	if number == "" {
		number = body.Phone
	}
	if strings.TrimSpace(number) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "number required"})
		return
	}
	callID, err := t.mgr.Dial(r.Context(), number)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	s.broker.broadcast(map[string]any{
		"type": "sip-call", "event": "outgoing", "callId": callID, "peer": number,
		"companyId": companyID, "ts": time.Now().UnixMilli(),
	})
	writeJSON(w, http.StatusOK, map[string]any{"call": map[string]string{"callId": callID}})
}

func (s *server) handleSipWebRTC(w http.ResponseWriter, r *http.Request) {
	t, _, ok := s.trunkFor(w, r)
	if !ok {
		return
	}
	callID := r.PathValue("id")
	var body struct {
		SDPOffer string `json:"sdp_offer"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.SDPOffer == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "sdp_offer required"})
		return
	}
	bridge, answer, err := NewBridge(body.SDPOffer, s.log)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	bridge.OnBrowserPCM = func(pcm []float32) { t.mgr.FeedCapturedPCM(pcm) }
	bridge.OnTerminalICE = func() {
		go func() {
			ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			_ = t.mgr.Hangup(ctx, callID)
		}()
	}
	if err := t.mgr.AttachBridge(callID, bridge); err != nil {
		bridge.Close()
		writeJSON(w, http.StatusNotFound, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"sdp_answer": answer})
}

func (s *server) handleSipAccept(w http.ResponseWriter, r *http.Request) {
	t, _, ok := s.trunkFor(w, r)
	if !ok {
		return
	}
	callID := r.PathValue("id")
	if err := t.mgr.Accept(r.Context(), callID); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]any{"call": map[string]string{"callId": callID}})
}

func (s *server) handleSipReject(w http.ResponseWriter, r *http.Request) {
	t, companyID, ok := s.trunkFor(w, r)
	if !ok {
		return
	}
	callID := r.PathValue("id")
	_ = t.mgr.Reject(r.Context(), callID)
	s.broker.broadcast(map[string]any{
		"type": "sip-call", "event": "ended", "callId": callID,
		"reason": string(core.EndCallReasonDeclined), "companyId": companyID, "ts": time.Now().UnixMilli(),
	})
	writeJSON(w, http.StatusOK, map[string]string{"status": "ok"})
}

func (s *server) handleSipHangup(w http.ResponseWriter, r *http.Request) {
	t, _, ok := s.trunkFor(w, r)
	if !ok {
		return
	}
	callID := r.PathValue("id")
	_ = t.mgr.Hangup(r.Context(), callID)
	w.WriteHeader(http.StatusNoContent)
}
