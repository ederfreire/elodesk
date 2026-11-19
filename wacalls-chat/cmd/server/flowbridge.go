package main

import (
	"bytes"
	"context"
	"crypto/rand"
	"crypto/sha1"
	"encoding/binary"
	"encoding/hex"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"math"
	"net/http"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"time"

	"go.mau.fi/whatsmeow"
	waBinary "go.mau.fi/whatsmeow/binary"
	"go.mau.fi/whatsmeow/proto/waE2E"
	"go.mau.fi/whatsmeow/types"
	"google.golang.org/protobuf/proto"
	"wacalls/internal/voip/core"
	"wacalls/internal/wa"
)

// FlowBridge is the glue between the FlowExecutor and the active call/session
// state. It implements the side-effects of voice_menu, message and
// whatsapp_send nodes against the running call.
type FlowBridge struct {
	mgr    *SessionManager
	log    *slog.Logger
	broker *Broker
	tracer *flowTracer

	httpClient *http.Client

	// Configurable via environment so deployments can plug their preferred
	// providers without code changes.
	ttsURL   string
	ttsAuth  string
	ttsVoice string
	sttURL   string
	sttAuth  string
	sttLang  string
}

func newFlowBridge(mgr *SessionManager, log *slog.Logger) *FlowBridge {
	ttsURL := strings.TrimSpace(os.Getenv("WACALLS_TTS_URL"))
	if ttsURL == "" {
		// The installer ships Piper locally through piper-bridge. Defaulting here
		// avoids a muted URA when an older service unit is missing the env var.
		ttsURL = "http://127.0.0.1:5005/api/tts"
	}
	return &FlowBridge{
		mgr:        mgr,
		log:        log,
		httpClient: &http.Client{Timeout: 60 * time.Second},
		ttsURL:     ttsURL,
		ttsAuth:    os.Getenv("WACALLS_TTS_AUTH"),
		ttsVoice:   os.Getenv("WACALLS_TTS_VOICE"),
		sttURL:     os.Getenv("WACALLS_STT_URL"),
		sttAuth:    os.Getenv("WACALLS_STT_AUTH"),
		sttLang:    os.Getenv("WACALLS_STT_LANG"),
	}
}

// AttachBroker lets the bridge surface diagnostic events to the user (e.g.
// "TTS não configurado") so the URA failing silently becomes obvious.
func (b *FlowBridge) AttachBroker(br *Broker) {
	if b == nil {
		return
	}
	b.broker = br
}

// AttachTracer wires the per-call correlation tracer so TTS/STT failures
// surface under the same traceId as the executor steps.
func (b *FlowBridge) AttachTracer(t *flowTracer) {
	if b == nil {
		return
	}
	b.tracer = t
}

func (b *FlowBridge) emitFlowSkip(sessionID, callID, reason, detail string) {
	// Também no log do serviço: antes isso ia só para o rastreador interno e
	// para o broker (SSE), então uma falha de TTS não deixava NENHUMA linha em
	// journalctl. Quem ligava ouvia silêncio e não havia como descobrir por
	// quê sem abrir a tela de rastreamento no momento exato da ligação.
	if b != nil && b.log != nil {
		b.log.Warn("flow media issue", "session", sessionID, "call_id", callID,
			"reason", reason, "detail", detail)
	}
	traceID := ""
	if b != nil && b.tracer != nil {
		traceID = b.tracer.TraceIDFor(callID)
		b.tracer.Record(FlowTraceStep{
			CallID: callID, SessionID: sessionID, TraceID: traceID,
			Level: "error", Code: "tts", Message: reason,
			Data: map[string]any{"detail": detail},
		})
	}
	if b == nil || b.broker == nil {
		return
	}
	b.broker.deliverScoped(sessionID, map[string]any{
		"type":      "flow-skip",
		"sessionId": sessionID,
		"callId":    callID,
		"reason":    reason,
		"detail":    detail,
		"traceId":   traceID,
		"ts":        time.Now().UnixMilli(),
	})
}

// TTSConfigured reports whether at least the default Piper-style endpoint is
// configured. Per-flow ElevenLabs voices override this, but a healthy default
// keeps inbound URAs working when the flow doesn't set its own voice.
func (b *FlowBridge) TTSConfigured() bool {
	if b == nil {
		return false
	}
	return strings.TrimSpace(b.ttsURL) != ""
}

// STTConfigured reports whether speech-to-text is wired up. Voice menu nodes
// still work with DTMF when this is false; only free-speech capture breaks.
func (b *FlowBridge) STTConfigured() bool {
	if b == nil {
		return false
	}
	return strings.TrimSpace(b.sttURL) != ""
}

// ---- TTS ---------------------------------------------------------------

// PlayTTS synthesizes `text` via the configured TTS endpoint and injects the
// resulting audio into the active call. It blocks for the duration of the
// audio playback (or until ctx is cancelled / the call ends).
func (b *FlowBridge) PlayTTS(ctx context.Context, sessionID, callID, text string) error {
	return b.PlayTTSVoice(ctx, sessionID, callID, text, "")
}

// PlayTTSVoice is PlayTTS with an explicit voice override. When voice == ""
// the default voice configured via WACALLS_TTS_VOICE is used.
func (b *FlowBridge) PlayTTSVoice(ctx context.Context, sessionID, callID, text, voice string) error {
	return b.PlayTTSConfig(ctx, sessionID, callID, text, voiceConfigForNode(nil, voice))
}

// PlayTTSConfig speaks using the voice saved inside the flow graph. This is
// what makes the FlowBuilder "Voz do fluxo" dialog affect real inbound calls
// on the VPS, instead of always falling back to WACALLS_TTS_* defaults.
func (b *FlowBridge) PlayTTSConfig(ctx context.Context, sessionID, callID, text string, cfg *FlowVoiceConfig) error {
	if b == nil {
		return errors.New("flow bridge not initialised")
	}
	text = strings.TrimSpace(text)
	if text == "" {
		return nil
	}
	sess, ok := b.mgr.Get(sessionID)
	if !ok {
		return fmt.Errorf("session %s not found", sessionID)
	}
	ac, ok := sess.reg.get(callID)
	if !ok {
		return fmt.Errorf("call %s not active", callID)
	}
	ttsCtx := context.Background()
	pcm, err := b.synthTTSConfig(ttsCtx, text, cfg)
	if err != nil {
		// Surface the most common cause (no TTS endpoint) directly to the
		// UI so the operator knows why the caller heard silence.
		reason := "tts_failed"
		if strings.Contains(err.Error(), "WACALLS_TTS_URL not configured") {
			reason = "tts_not_configured"
		}
		b.emitFlowSkip(sessionID, callID, reason, err.Error())
		return fmt.Errorf("tts: %w", err)
	}
	if err := waitForCallMediaReady(ttsCtx, ac, mediaReadyTimeout()); err != nil {
		b.emitFlowSkip(sessionID, callID, "media_not_ready", err.Error())
		return err
	}
	// Entrega o áudio no ritmo do relógio (ver pcmfeeder.go).
	//
	// A versão anterior empurrava a frase INTEIRA de uma vez, confiando que o
	// laço de envio a consumiria quadro a quadro. Só que o buffer de captura
	// guarda ~300 ms e descarta tudo que passa de ~120 ms: a saudação chegava
	// completa e era reduzida ao último décimo de segundo. Era esta a causa da
	// URA atender e o cliente não ouvir nada.
	//
	// Paginar aqui já tinha sido tentado antes e saiu "picotado" porque não
	// havia folga: o codificador ficava sem dados a cada oscilação do
	// agendador. feedPCMRealtime mantém 80 ms adiantados justamente para isso.
	if err := feedPCMRealtime(ctx, sess, callID, pcm, func(bloco []float32) {
		if rec := ac.fullRecorder; rec != nil {
			rec.write(bloco)
		}
	}); err != nil {
		b.emitFlowSkip(sessionID, callID, "audio_interrupted", err.Error())
		return err
	}
	return nil
}

// TransferCallToQueue routes the ongoing URA call to a chat queue (and
// optionally to a specific operator). It:
//  1. Plays the optional spoken prompt ("Transferindo para o suporte…").
//  2. Writes the chat metadata (status = waiting/open, queueId/userId set)
//     so the conversation appears in the queue's panel for an agent.
//  3. Logs a "transferred" lifecycle event on the chat timeline.
//  4. Ends the call so the customer drops cleanly into chat.
//
// dryRun=true skips the side-effects (used by /api/flows/test).
func (b *FlowBridge) TransferCallToQueue(ctx context.Context, sessionID, callID, queueID, userID, prompt string, voiceCfg *FlowVoiceConfig) error {
	if b == nil || b.mgr == nil {
		return errors.New("flow bridge not initialised")
	}
	sess, ok := b.mgr.Get(sessionID)
	if !ok {
		return fmt.Errorf("session %s not found", sessionID)
	}
	ac, ok := sess.reg.get(callID)
	if !ok {
		return fmt.Errorf("call %s not active", callID)
	}
	peer := strings.TrimSpace(ac.peer)
	if peer == "" {
		return fmt.Errorf("call %s has no peer jid", callID)
	}
	// 1. Speak the prompt while still on the call.
	if msg := strings.TrimSpace(prompt); msg != "" {
		if err := b.PlayTTSConfig(ctx, sessionID, callID, msg, voiceCfg); err != nil {
			// Surface the failure but continue with the transfer so the
			// customer isn't stuck on a dead call.
			b.log.Warn("transfer prompt tts failed", "err", err, "call_id", callID)
		}
	}
	// 2. Persist the chat assignment.
	if b.mgr.chatMeta != nil {
		status := ChatStatusWaiting
		if strings.TrimSpace(userID) != "" {
			status = ChatStatusOpen
		}
		now := time.Now().UnixMilli()
		if err := b.mgr.chatMeta.SetAssignment(ctx, sessionID, peer, status, strings.TrimSpace(userID), strings.TrimSpace(queueID), now); err != nil {
			b.log.Error("transfer assignment failed", "err", err, "call_id", callID, "queue", queueID)
			return err
		}
		detail := strings.TrimSpace(userID)
		if q := strings.TrimSpace(queueID); q != "" {
			if detail != "" {
				detail += " · "
			}
			detail += "queue=" + q
		}
		kind := "transferred"
		if strings.TrimSpace(userID) == "" {
			kind = "requeued"
		}
		if b.broker != nil {
			logChatEvent(ctx, b.mgr.chatMeta, b.broker, sessionID, peer, kind, "", "URA", detail, now)
		}
		if m, ok2, _ := b.mgr.chatMeta.Get(ctx, sessionID, peer); ok2 && b.broker != nil {
			b.broker.emitChatMeta(m)
		}
	}
	// 3. End the call so the conversation hands off to the queue chat.
	_ = ac.cm.EndCall(context.Background(), core.EndCallReasonUserEnded)
	return nil
}

func (b *FlowBridge) synthTTSConfig(ctx context.Context, text string, cfg *FlowVoiceConfig) ([]float32, error) {
	provider := "piper"
	if cfg != nil && strings.TrimSpace(cfg.Provider) != "" {
		provider = strings.ToLower(strings.TrimSpace(cfg.Provider))
	}
	switch provider {
	case "elevenlabs", "openai":
		var pcm []float32
		var cerr error
		if provider == "elevenlabs" {
			pcm, cerr = b.synthElevenLabsTTS(ctx, text, cfg)
		} else {
			pcm, cerr = b.synthOpenAITTS(ctx, text, cfg)
		}
		if cerr == nil && len(pcm) > 0 {
			return pcm, nil
		}
		// Chave inválida, cota esgotada ou provedor fora do ar não podem
		// deixar a URA muda: cai para a voz local (espeak-ng) e registra o
		// motivo.
		if alt, ferr := b.synthOfflineFallbackTTS(ctx, text); ferr == nil && len(alt) > 0 {
			if b.log != nil {
				b.log.Warn("TTS na nuvem falhou; usada a voz local", "provider", provider, "err", cerr)
			}
			return alt, nil
		}
		if cerr == nil {
			cerr = errors.New("áudio vazio")
		}
		return nil, cerr
	}
	voice := ""
	if cfg != nil {
		voice = strings.TrimSpace(cfg.VoiceID)
	}
	type ttsResult struct {
		pcm []float32
		err error
	}
	ch := make(chan ttsResult, 1)
	go func() {
		pcm, err := b.synthTTS(ctx, text, voice)
		ch <- ttsResult{pcm: pcm, err: err}
	}()
	var err error
	select {
	case res := <-ch:
		if res.err == nil {
			return res.pcm, nil
		}
		err = res.err
	case <-time.After(piperGraceTimeout()):
		err = fmt.Errorf("Piper TTS não respondeu em %s", piperGraceTimeout())
		if alt, ferr := b.synthOfflineFallbackTTS(ctx, text); ferr == nil && len(alt) > 0 {
			if b.log != nil {
				b.log.Warn("Piper TTS slow; used offline espeak fallback", "err", err)
			}
			return alt, nil
		}
		if alt, ferr := b.synthConfiguredFallbackTTS(ctx, text, cfg); ferr == nil && len(alt) > 0 {
			if b.log != nil {
				b.log.Warn("Piper TTS slow; used cloud fallback", "err", err)
			}
			return alt, nil
		}
		select {
		case res := <-ch:
			if res.err == nil {
				return res.pcm, nil
			}
			err = res.err
		case <-ctx.Done():
			return nil, ctx.Err()
		}
	}
	if alt, ferr := b.synthOfflineFallbackTTS(ctx, text); ferr == nil && len(alt) > 0 {
		if b.log != nil {
			b.log.Warn("Piper TTS failed; used offline espeak fallback", "err", err)
		}
		return alt, nil
	}
	if alt, ferr := b.synthConfiguredFallbackTTS(ctx, text, cfg); ferr == nil && len(alt) > 0 {
		if b.log != nil {
			b.log.Warn("Piper TTS failed; used cloud fallback", "err", err)
		}
		return alt, nil
	}
	return nil, err
}

// synthTTS calls the configured TTS HTTP endpoint and returns mono PCM
// float32 samples at 16 kHz. The endpoint contract is intentionally simple:
//
//	POST {WACALLS_TTS_URL}
//	Authorization: {WACALLS_TTS_AUTH}  (optional)
//	Body: {"text": "...", "voice": "..."}
//	Response: raw 16-bit little-endian PCM, mono, 16 kHz (audio/L16)
//
// This shape matches what a thin wrapper around ElevenLabs / Piper / Coqui
// typically exposes. When no endpoint is configured the call returns an
// error so the executor can record it without crashing the flow.
func (b *FlowBridge) synthTTS(ctx context.Context, text, voice string) ([]float32, error) {
	if b.ttsURL == "" {
		return nil, errors.New("WACALLS_TTS_URL not configured")
	}
	if voice == "" {
		voice = b.ttsVoice
	}
	payload, _ := json.Marshal(map[string]string{
		"text":  text,
		"voice": voice,
	})
	if cached, ok := readTTSCache("piper", voice, text); ok {
		return cached, nil
	}
	// Do not inherit short-lived signaling/request cancellation here. Some
	// WhatsApp call contexts are cancelled right after AcceptCall/answer events;
	// TTS must keep running under its own hard deadline or the URA never speaks.
	ttsCtx, cancel := context.WithTimeout(context.Background(), ttsRequestTimeout())
	defer cancel()
	req, err := http.NewRequestWithContext(ttsCtx, http.MethodPost, b.ttsURL, bytes.NewReader(payload))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Accept", "audio/L16; rate=16000; channels=1")
	if b.ttsAuth != "" {
		req.Header.Set("Authorization", b.ttsAuth)
	}
	client := &http.Client{Timeout: ttsRequestTimeout() + 5*time.Second}
	resp, err := client.Do(req)
	if err != nil {
		if errors.Is(err, context.DeadlineExceeded) || strings.Contains(err.Error(), "Client.Timeout") || strings.Contains(err.Error(), "context deadline exceeded") {
			return nil, fmt.Errorf("Piper TTS demorou mais de %s para responder em %s. O sistema tentará a voz offline/cloud se disponível; rode a atualização para instalar o fallback local: %w", ttsRequestTimeout().String(), b.ttsURL, err)
		}
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return nil, fmt.Errorf("tts http %d: %s", resp.StatusCode, string(body))
	}
	raw, err := io.ReadAll(io.LimitReader(resp.Body, 50*1024*1024))
	if err != nil {
		return nil, err
	}
	pcm := pcm16BytesToFloat32(raw)
	writeTTSCache("piper", voice, text, pcm)
	return pcm, nil
}

func ttsRequestTimeout() time.Duration {
	if raw := strings.TrimSpace(os.Getenv("WACALLS_TTS_TIMEOUT_SECONDS")); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil && n >= 30 && n <= 600 {
			return time.Duration(n) * time.Second
		}
	}
	return 35 * time.Second
}

func piperGraceTimeout() time.Duration {
	if raw := strings.TrimSpace(os.Getenv("WACALLS_TTS_GRACE_SECONDS")); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil && n >= 1 && n <= 30 {
			return time.Duration(n) * time.Second
		}
	}
	return 4 * time.Second
}

func (b *FlowBridge) synthOfflineFallbackTTS(ctx context.Context, text string) ([]float32, error) {
	voice := strings.TrimSpace(os.Getenv("WACALLS_ESPEAK_VOICE"))
	if voice == "" {
		voice = "pt-br"
	}
	speed := strings.TrimSpace(os.Getenv("WACALLS_ESPEAK_SPEED"))
	if speed == "" {
		speed = "145"
	}
	cacheVoice := voice + ":" + speed
	if cached, ok := readTTSCache("espeak", cacheVoice, text); ok {
		return cached, nil
	}
	bin, err := exec.LookPath("espeak-ng")
	if err != nil {
		return nil, errors.New("fallback offline espeak-ng não instalado; rode a atualização do instalador")
	}
	tmp, err := os.CreateTemp("", "wacalls-tts-*.txt")
	if err != nil {
		return nil, err
	}
	tmpName := tmp.Name()
	_, _ = tmp.WriteString(text)
	_ = tmp.Close()
	defer os.Remove(tmpName)

	tctx, cancel := context.WithTimeout(context.Background(), 20*time.Second)
	defer cancel()
	cmd := exec.CommandContext(tctx, bin, "-v", voice, "-s", speed, "--stdout", "-f", tmpName)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	wav, err := cmd.Output()
	if err != nil {
		msg := strings.TrimSpace(stderr.String())
		if msg == "" {
			msg = err.Error()
		}
		return nil, errors.New(msg)
	}
	pcm16, err := decodeAudioToPCM16(tctx, wav, "wav")
	if err != nil {
		return nil, fmt.Errorf("converter espeak-ng para PCM: %w", err)
	}
	pcm := pcm16BytesToFloat32(pcm16)
	writeTTSCache("espeak", cacheVoice, text, pcm)
	return pcm, nil
}

func (b *FlowBridge) synthElevenLabsTTS(ctx context.Context, text string, cfg *FlowVoiceConfig) ([]float32, error) {
	apiKey := strings.TrimSpace(cfg.ElevenLabsAPIKey)
	voiceID := strings.TrimSpace(cfg.VoiceID)
	if apiKey == "" {
		return nil, errors.New("ElevenLabs API key não salva na voz do fluxo")
	}
	if voiceID == "" {
		return nil, errors.New("ElevenLabs voiceId não selecionado na voz do fluxo")
	}
	model := strings.TrimSpace(cfg.Model)
	if model == "" {
		model = "eleven_flash_v2_5"
	}
	body, _ := json.Marshal(map[string]any{
		"text":     text,
		"model_id": model,
	})
	url := fmt.Sprintf("https://api.elevenlabs.io/v1/text-to-speech/%s?output_format=mp3_44100_128", voiceID)
	ttsCtx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ttsCtx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("xi-api-key", apiKey)
	req.Header.Set("Content-Type", "application/json")
	resp, err := b.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		raw, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		return nil, fmt.Errorf("elevenlabs http %d: %s", resp.StatusCode, string(raw))
	}
	mp3, err := io.ReadAll(io.LimitReader(resp.Body, 50*1024*1024))
	if err != nil {
		return nil, err
	}
	pcm, err := decodeAudioToPCM16(ttsCtx, mp3, "mp3")
	if err != nil {
		return nil, fmt.Errorf("converter ElevenLabs para PCM: %w", err)
	}
	return pcm16BytesToFloat32(pcm), nil
}

func (b *FlowBridge) synthConfiguredFallbackTTS(ctx context.Context, text string, cfg *FlowVoiceConfig) ([]float32, error) {
	if strings.TrimSpace(os.Getenv("OPENAI_API_KEY")) != "" {
		return b.synthOpenAITTS(ctx, text, cfg)
	}
	return nil, errors.New("nenhum fallback TTS configurado")
}

func (b *FlowBridge) synthOpenAITTS(ctx context.Context, text string, cfg *FlowVoiceConfig) ([]float32, error) {
	// Prioriza a chave salva no fluxo; sem ela, usa a do ambiente.
	apiKey := ""
	if cfg != nil {
		apiKey = strings.TrimSpace(cfg.OpenAIAPIKey)
	}
	if apiKey == "" {
		apiKey = strings.TrimSpace(os.Getenv("OPENAI_API_KEY"))
	}
	if apiKey == "" {
		return nil, errors.New("chave do OpenAI não configurada (nem na URA, nem em OPENAI_API_KEY)")
	}
	voice := cloudVoice(cfg)
	model := cloudModel(cfg, "gpt-4o-mini-tts")
	return b.synthOpenAICompatibleTTS(ctx, "openai", "https://api.openai.com/v1/audio/speech", apiKey, model, voice, text)
}

func (b *FlowBridge) synthOpenAICompatibleTTS(ctx context.Context, provider, url, apiKey, model, voice, text string) ([]float32, error) {
	cacheVoice := voice + ":" + model
	if cached, ok := readTTSCache(provider, cacheVoice, text); ok {
		return cached, nil
	}
	body, _ := json.Marshal(map[string]any{
		"model":           model,
		"input":           text,
		"voice":           voice,
		"response_format": "mp3",
	})
	ttsCtx, cancel := context.WithTimeout(context.Background(), 60*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(ttsCtx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Authorization", "Bearer "+apiKey)
	req.Header.Set("Content-Type", "application/json")
	resp, err := b.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		raw, _ := io.ReadAll(io.LimitReader(resp.Body, 2048))
		return nil, fmt.Errorf("%s tts http %d: %s", provider, resp.StatusCode, string(raw))
	}
	mp3, err := io.ReadAll(io.LimitReader(resp.Body, 50*1024*1024))
	if err != nil {
		return nil, err
	}
	pcm16, err := decodeAudioToPCM16(ttsCtx, mp3, "mp3")
	if err != nil {
		return nil, fmt.Errorf("converter %s para PCM: %w", provider, err)
	}
	pcm := pcm16BytesToFloat32(pcm16)
	writeTTSCache(provider, cacheVoice, text, pcm)
	return pcm, nil
}

func cloudVoice(cfg *FlowVoiceConfig) string {
	if cfg != nil && strings.TrimSpace(cfg.VoiceID) != "" {
		return strings.TrimSpace(cfg.VoiceID)
	}
	if v := strings.TrimSpace(os.Getenv("WACALLS_CLOUD_TTS_VOICE")); v != "" {
		return v
	}
	return "alloy"
}

func cloudModel(cfg *FlowVoiceConfig, def string) string {
	if cfg != nil && strings.TrimSpace(cfg.Model) != "" {
		return strings.TrimSpace(cfg.Model)
	}
	return def
}

func mediaReadyTimeout() time.Duration {
	if raw := strings.TrimSpace(os.Getenv("WACALLS_MEDIA_READY_TIMEOUT_SECONDS")); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil && n >= 1 && n <= 60 {
			return time.Duration(n) * time.Second
		}
	}
	return 20 * time.Second
}

func waitForCallMediaReady(ctx context.Context, ac *activeCall, timeout time.Duration) error {
	if ac == nil || ac.cm == nil {
		return errors.New("chamada não encontrada para áudio")
	}
	if ac.cm.MediaReady() {
		return nil
	}
	deadline := time.NewTimer(timeout)
	defer deadline.Stop()
	tick := time.NewTicker(100 * time.Millisecond)
	defer tick.Stop()
	for {
		select {
		case <-ctx.Done():
			return ctx.Err()
		case <-deadline.C:
			if ac.cm.MediaReady() {
				return nil
			}
			return fmt.Errorf("mídia da chamada não conectou em %s; WhatsApp aceitou, mas o relay de áudio ainda não abriu", timeout)
		case <-tick.C:
			if ac.cm.MediaReady() {
				return nil
			}
		}
	}
}

func ttsCachePath(provider, voice, text string) string {
	h := sha1.Sum([]byte(provider + "\x00" + voice + "\x00" + text))
	return filepath.Join("media", "tts-cache", hex.EncodeToString(h[:])+".pcm")
}

func readTTSCache(provider, voice, text string) ([]float32, bool) {
	if strings.TrimSpace(text) == "" {
		return nil, false
	}
	raw, err := os.ReadFile(ttsCachePath(provider, voice, text))
	if err != nil || len(raw) == 0 {
		return nil, false
	}
	return pcm16BytesToFloat32(raw), true
}

func writeTTSCache(provider, voice, text string, pcm []float32) {
	if len(pcm) == 0 || strings.TrimSpace(text) == "" {
		return
	}
	path := ttsCachePath(provider, voice, text)
	if err := os.MkdirAll(filepath.Dir(path), 0o755); err != nil {
		return
	}
	_ = os.WriteFile(path, encodePCM16Raw(pcm), 0o644)
}

func encodePCM16Raw(pcm []float32) []byte {
	buf := bytes.NewBuffer(make([]byte, 0, len(pcm)*2))
	for _, s := range pcm {
		if s > 1 {
			s = 1
		} else if s < -1 {
			s = -1
		}
		_ = binary.Write(buf, binary.LittleEndian, int16(s*32767))
	}
	return buf.Bytes()
}

func decodeAudioToPCM16(ctx context.Context, raw []byte, inputFormat string) ([]byte, error) {
	bin, err := exec.LookPath("ffmpeg")
	if err != nil {
		return nil, errors.New("ffmpeg não instalado; rode o instalador/atualização na VPS para habilitar ElevenLabs nas chamadas")
	}
	cctx, cancel := context.WithTimeout(ctx, 45*time.Second)
	defer cancel()
	args := []string{"-loglevel", "error"}
	if inputFormat != "" {
		args = append(args, "-f", inputFormat)
	}
	args = append(args, "-i", "pipe:0", "-vn", "-ac", "1", "-ar", "16000", "-f", "s16le", "pipe:1")
	cmd := exec.CommandContext(cctx, bin, args...)
	cmd.Stdin = bytes.NewReader(raw)
	var stderr bytes.Buffer
	cmd.Stderr = &stderr
	out, err := cmd.Output()
	if err != nil {
		msg := strings.TrimSpace(stderr.String())
		if msg == "" {
			msg = err.Error()
		}
		return nil, errors.New(msg)
	}
	return out, nil
}

// ---- STT (record peer audio + transcribe) ------------------------------

// RecordAndTranscribe attaches a flow audio sink to the active call, buffers
// the peer's audio for up to maxSec seconds (cutting earlier on a simple
// energy-based end-of-speech detector), and returns the transcript produced
// by the configured STT endpoint. Returns an empty string when no STT
// endpoint is configured.
func (b *FlowBridge) RecordAndTranscribe(ctx context.Context, sessionID, callID string, maxSec int) (string, error) {
	if b == nil {
		return "", errors.New("flow bridge not initialised")
	}
	if maxSec <= 0 {
		maxSec = 5
	}
	sess, ok := b.mgr.Get(sessionID)
	if !ok {
		return "", fmt.Errorf("session %s not found", sessionID)
	}
	ac, ok := sess.reg.get(callID)
	if !ok {
		return "", fmt.Errorf("call %s not active", callID)
	}

	const sampleRate = 16000
	maxSamples := sampleRate * maxSec
	buf := make([]float32, 0, maxSamples)

	// Simple voice-activity detection: cut after ~800 ms of low energy
	// once we have heard at least ~400 ms of speech.
	const silenceWindow = sampleRate * 800 / 1000
	const minSpeech = sampleRate * 400 / 1000
	// Telephony audio transcoded from G.711 ends up quieter than 0.02
	// RMS in float32, so the old threshold left URAs deaf — the VAD
	// never flipped "heardSpeech" and the buffer was discarded as
	// silence. 0.006 matches typical PSTN levels while still rejecting
	// line noise.
	const speechThresh = 0.006

	done := make(chan string, 1)
	var heardSpeech bool
	var silentRun int

	sink := func(pcm []float32) {
		// Append (bounded)
		room := maxSamples - len(buf)
		if room <= 0 {
			return
		}
		if len(pcm) > room {
			pcm = pcm[:room]
		}
		buf = append(buf, pcm...)

		// Energy check
		var sumSq float64
		for _, s := range pcm {
			sumSq += float64(s) * float64(s)
		}
		rms := math.Sqrt(sumSq / float64(len(pcm)+1))
		if rms >= speechThresh {
			heardSpeech = true
			silentRun = 0
		} else {
			silentRun += len(pcm)
		}

		if (heardSpeech && silentRun >= silenceWindow && len(buf) >= minSpeech) || len(buf) >= maxSamples {
			select {
			case done <- "":
			default:
			}
		}
	}
	sess.reg.setFlowAudioSink(callID, sink)
	_ = ac // keep reference clear

	defer sess.reg.setFlowAudioSink(callID, nil)

	select {
	case <-ctx.Done():
		return "", ctx.Err()
	case <-done:
	case <-time.After(time.Duration(maxSec) * time.Second):
	}

	if b.sttURL == "" {
		return "", nil
	}
	if len(buf) < sampleRate/10 {
		return "", nil
	}
	return b.transcribe(ctx, buf, sampleRate)
}

// ---- Real-time DTMF (RFC2833-equivalent via in-band Goertzel) -----------
//
// Telephony G.711 audio carries DTMF tones in-band as two superimposed sine
// waves (697/770/852/941 Hz × 1209/1336/1477/1633 Hz). We detect them on the
// PCM stream coming out of the call so the URA can react the instant the
// caller presses a key — no STT round-trip, no perceived delay.

var dtmfRowFreqs = [4]float64{697, 770, 852, 941}
var dtmfColFreqs = [4]float64{1209, 1336, 1477, 1633}
var dtmfKeypad = [4][4]byte{
	{'1', '2', '3', 'A'},
	{'4', '5', '6', 'B'},
	{'7', '8', '9', 'C'},
	{'*', '0', '#', 'D'},
}

// goertzelMag returns the magnitude of `freq` in `samples` at sampleRate.
func goertzelMag(samples []float32, sampleRate, freq float64) float64 {
	if len(samples) == 0 {
		return 0
	}
	k := math.Round(float64(len(samples)) * freq / sampleRate)
	w := 2.0 * math.Pi * k / float64(len(samples))
	cosw := math.Cos(w)
	coeff := 2.0 * cosw
	var q0, q1, q2 float64
	for _, s := range samples {
		q0 = coeff*q1 - q2 + float64(s)
		q2 = q1
		q1 = q0
	}
	return math.Sqrt(q1*q1 + q2*q2 - q1*q2*coeff)
}

// detectDTMF returns the keypad character present in the audio frame, or 0.
// Uses a relative threshold: the strongest row & col must be well above the
// other frequencies in their group to count as a valid tone.
func detectDTMF(frame []float32, sampleRate int) byte {
	return detectDTMFWithThreshold(frame, sampleRate, 8.0, 1.8)
}

func detectDTMFWithThreshold(frame []float32, sampleRate int, minMag, dominance float64) byte {
	if len(frame) < sampleRate/100 { // need ~10ms
		return 0
	}
	sr := float64(sampleRate)
	var rowMag [4]float64
	var colMag [4]float64
	for i, f := range dtmfRowFreqs {
		rowMag[i] = goertzelMag(frame, sr, f)
	}
	for i, f := range dtmfColFreqs {
		colMag[i] = goertzelMag(frame, sr, f)
	}
	rIdx, rMax := 0, rowMag[0]
	for i, m := range rowMag {
		if m > rMax {
			rIdx, rMax = i, m
		}
	}
	cIdx, cMax := 0, colMag[0]
	for i, m := range colMag {
		if m > cMax {
			cIdx, cMax = i, m
		}
	}
	// Energy must be meaningful and the winners must dominate the others
	// by a clear margin to avoid false positives on voice.
	var rOther, cOther float64
	for i, m := range rowMag {
		if i != rIdx && m > rOther {
			rOther = m
		}
	}
	for i, m := range colMag {
		if i != cIdx && m > cOther {
			cOther = m
		}
	}
	if minMag <= 0 {
		minMag = 8.0
	}
	if dominance <= 0 {
		dominance = 1.8
	}
	if rMax < minMag || cMax < minMag {
		return 0
	}
	if rMax < rOther*dominance || cMax < cOther*dominance {
		return 0
	}
	return dtmfKeypad[rIdx][cIdx]
}

type AudioDetectConfig struct {
	SilenceMs         int
	MinSpeechMs       int
	SpeechThreshold   float64
	DisableDTMF       bool
	DTMFWindowMs      int
	DTMFStableWindows int
	DTMFMinMagnitude  float64
	DTMFDominance     float64
}

// RecordDTMFOrTranscribe attaches a single audio sink that simultaneously
// detects in-band DTMF digits AND buffers PCM for STT. The instant a DTMF
// digit is detected (confirmed across ~2 consecutive 40ms windows), the
// function returns (digit, "", nil) without waiting for STT — that is what
// makes "DTMF na hora" responsive. Otherwise, it behaves like
// RecordAndTranscribe and returns ("", transcript, err) once speech ends.
// matchSet, when non-empty, restricts which characters trigger early exit.
func (b *FlowBridge) RecordDTMFOrTranscribe(ctx context.Context, sessionID, callID string, maxSec int, matchSet string) (digit string, transcript string, err error) {
	return b.RecordDTMFOrTranscribeConfig(ctx, sessionID, callID, maxSec, matchSet, AudioDetectConfig{})
}

func (b *FlowBridge) RecordDTMFOrTranscribeConfig(ctx context.Context, sessionID, callID string, maxSec int, matchSet string, cfg AudioDetectConfig) (digit string, transcript string, err error) {
	if b == nil {
		return "", "", errors.New("flow bridge not initialised")
	}
	if maxSec <= 0 {
		maxSec = 6
	}
	sess, ok := b.mgr.Get(sessionID)
	if !ok {
		return "", "", fmt.Errorf("session %s not found", sessionID)
	}
	const sampleRate = 16000
	if cfg.DTMFWindowMs <= 0 {
		cfg.DTMFWindowMs = 40
	}
	if cfg.DTMFWindowMs < 20 {
		cfg.DTMFWindowMs = 20
	}
	if cfg.DTMFWindowMs > 80 {
		cfg.DTMFWindowMs = 80
	}
	if cfg.DTMFStableWindows <= 0 {
		cfg.DTMFStableWindows = 2
	}
	if cfg.SilenceMs <= 0 {
		cfg.SilenceMs = 800
	}
	if cfg.SilenceMs < 300 {
		cfg.SilenceMs = 300
	}
	if cfg.MinSpeechMs <= 0 {
		cfg.MinSpeechMs = 300
	}
	if cfg.SpeechThreshold <= 0 {
		cfg.SpeechThreshold = 0.006
	}
	windowSamples := sampleRate * cfg.DTMFWindowMs / 1000
	silenceWindow := sampleRate * cfg.SilenceMs / 1000
	minSpeech := sampleRate * cfg.MinSpeechMs / 1000
	maxSamples := sampleRate * maxSec
	buf := make([]float32, 0, maxSamples)
	window := make([]float32, 0, windowSamples)
	type result struct {
		digit byte
	}
	done := make(chan result, 1)
	var heardSpeech bool
	var silentRun int
	var lastDigit byte
	var stableCount int
	sink := func(pcm []float32) {
		// Append to speech buffer (bounded)
		room := maxSamples - len(buf)
		if room > 0 {
			take := pcm
			if len(take) > room {
				take = take[:room]
			}
			buf = append(buf, take...)
		}
		// VAD energy on this packet
		var sumSq float64
		for _, s := range pcm {
			sumSq += float64(s) * float64(s)
		}
		rms := math.Sqrt(sumSq / float64(len(pcm)+1))
		if rms >= cfg.SpeechThreshold {
			heardSpeech = true
			silentRun = 0
		} else {
			silentRun += len(pcm)
		}
		if !cfg.DisableDTMF {
			// DTMF detection in configurable Goertzel windows
			for _, s := range pcm {
				window = append(window, s)
				if len(window) < windowSamples {
					continue
				}
				d := detectDTMFWithThreshold(window, sampleRate, cfg.DTMFMinMagnitude, cfg.DTMFDominance)
				window = window[:0]
				if d == 0 {
					lastDigit = 0
					stableCount = 0
					continue
				}
				if matchSet != "" && !strings.ContainsRune(matchSet, rune(d)) {
					continue
				}
				if d == lastDigit {
					stableCount++
				} else {
					lastDigit = d
					stableCount = 1
				}
				if stableCount >= cfg.DTMFStableWindows {
					select {
					case done <- result{digit: d}:
					default:
					}
					return
				}
			}
		}
		if (heardSpeech && silentRun >= silenceWindow && len(buf) >= minSpeech) || len(buf) >= maxSamples {
			select {
			case done <- result{}:
			default:
			}
		}
	}
	sess.reg.setFlowAudioSink(callID, sink)
	defer sess.reg.setFlowAudioSink(callID, nil)
	var res result
	select {
	case <-ctx.Done():
		return "", "", ctx.Err()
	case res = <-done:
	case <-time.After(time.Duration(maxSec) * time.Second):
	}
	if res.digit != 0 {
		return string(res.digit), "", nil
	}
	if b.sttURL == "" {
		return "", "", nil
	}
	if len(buf) < sampleRate/10 {
		return "", "", nil
	}
	t, e := b.transcribe(ctx, buf, sampleRate)
	return "", t, e
}

// transcribe POSTs a WAV-encoded clip to the configured STT endpoint and
// returns the recognised text. Expected response: {"text": "..."}.
func (b *FlowBridge) transcribe(ctx context.Context, pcm []float32, rate int) (string, error) {
	wav := encodeWavMonoPCM16(pcm, rate)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, b.sttURL, bytes.NewReader(wav))
	if err != nil {
		return "", err
	}
	req.Header.Set("Content-Type", "audio/wav")
	if b.sttAuth != "" {
		req.Header.Set("Authorization", b.sttAuth)
	}
	if b.sttLang != "" {
		req.Header.Set("X-Language", b.sttLang)
	}
	resp, err := b.httpClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		body, _ := io.ReadAll(io.LimitReader(resp.Body, 512))
		return "", fmt.Errorf("stt http %d: %s", resp.StatusCode, string(body))
	}
	var out struct {
		Text string `json:"text"`
	}
	if err := json.NewDecoder(resp.Body).Decode(&out); err != nil {
		return "", err
	}
	return strings.TrimSpace(out.Text), nil
}

// ---- WhatsApp ----------------------------------------------------------

// SendWhatsAppText delivers a plain text WhatsApp message via the session's
// whatsmeow client. `to` may be a bare phone number (digits) or a full JID.
func (b *FlowBridge) SendWhatsAppText(ctx context.Context, sessionID, to, text string) error {
	if b == nil {
		return errors.New("flow bridge not initialised")
	}
	if to == "" || text == "" {
		return errors.New("whatsapp_send: missing destination or message")
	}
	sess, ok := b.mgr.Get(sessionID)
	if !ok {
		return fmt.Errorf("session %s not found", sessionID)
	}
	jid, err := parseRecipientJID(to)
	if err != nil {
		return err
	}
	msg := &waE2E.Message{Conversation: proto.String(text)}
	resp, err := sess.client.SendMessage(ctx, jid, msg)
	if err != nil {
		return err
	}
	b.recordOutgoingChatMessage(ctx, sess, jid, string(resp.ID), resp.Timestamp.UnixMilli(), "text", text)
	return nil
}

func whatsappInteractiveBizNodes() []waBinary.Node {
	// Nó de acompanhamento confirmado contra o Evolution API/Go (mesma lib
	// whatsmeow, projeto real em produção): listas de seleção única usam o
	// proto clássico ListMessage (ver SendWhatsAppList), não
	// InteractiveMessage — só isso já renderiza em mobile, mas Web/Desktop
	// só desenha a lista com este nó <biz><list .../></biz> ao lado.
	return []waBinary.Node{{
		Tag: "biz",
		Content: []waBinary.Node{{
			Tag:   "list",
			Attrs: waBinary.Attrs{"type": "product_list", "v": "2"},
		}},
	}}
}

// nosDeBotao monta os nós XMPP extras que o WhatsApp exige para desenhar
// botões de fluxo nativo (InteractiveMessage/NativeFlowMessage) — achado de
// engenharia reversa, não vem da documentação oficial da Meta. Sem eles a
// mensagem chega no aparelho, mas o app não desenha nenhum botão.
//
// Estrutura confirmada contra o changelog do Evolution API/Go (mesma lib
// whatsmeow, projeto real em produção que precisou resolver exatamente este
// mesmo problema): <biz><interactive type=native_flow v=1>
// <native_flow v=9 name=mixed/></interactive></biz>.
//
// name deve ser "quick_reply" (só botões de resposta rápida dentro do fluxo
// nativo) ou "mixed" (qualquer combinação com botão de ação — link, ligar,
// copiar). isGroup indica se o destino é um grupo: fora de grupo o WhatsApp
// também espera o nó <bot biz_bot="1"/> ao lado de <biz>.
// fallbackUsedError sinaliza que o envio nativo (botão/lista interativa)
// falhou mas a mensagem foi entregue com sucesso como texto numerado — não
// é uma falha total, é um aviso. Antes esse detalhe se perdia por completo:
// SendWhatsAppButtons/SendWhatsAppList devolviam nil tanto pro sucesso
// nativo quanto pro fallback, então nem o log do backend Node (que já tinha
// um aviso pronto pra isso em SendWhatsAppInteractive.ts, só nunca disparava)
// nem ninguém enxergava o motivo real da falha.
type fallbackUsedError struct{ cause error }

func (e *fallbackUsedError) Error() string { return e.cause.Error() }
func (e *fallbackUsedError) Unwrap() error { return e.cause }

// IsFallbackUsedError reports whether err indicates a successful text
// fallback after a failed native interactive send (as opposed to a total
// failure where nothing was delivered).
func IsFallbackUsedError(err error) bool {
	var f *fallbackUsedError
	return errors.As(err, &f)
}

func nosDeBotao(name string, isGroup bool) []waBinary.Node {
	nos := []waBinary.Node{{
		Tag: "biz",
		Content: []waBinary.Node{{
			Tag:   "interactive",
			Attrs: waBinary.Attrs{"type": "native_flow", "v": "1"},
			Content: []waBinary.Node{{
				Tag:   "native_flow",
				Attrs: waBinary.Attrs{"name": name},
			}},
		}},
	}}
	if !isGroup {
		nos = append(nos, waBinary.Node{
			Tag:   "bot",
			Attrs: waBinary.Attrs{"biz_bot": "1"},
		})
	}
	return nos
}

// textoDeBotoes converte botões de resposta rápida em opções numeradas de
// texto. É a rede de segurança usada quando um envio mistura botão de
// resposta com botão de ação (link/ligar/copiar): o WhatsApp não deixa os
// dois tipos convivenrem no mesmo NativeFlowMessage, então os de ação viram
// botões de verdade e os de resposta "descem" para dentro do texto.
func textoDeBotoes(body string, botoesResposta []FlowButton) string {
	if len(botoesResposta) == 0 {
		return body
	}
	linhas := []string{body, ""}
	for i, bt := range botoesResposta {
		titulo := strings.TrimSpace(bt.Title)
		if titulo == "" {
			titulo = fmt.Sprintf("Opção %d", i+1)
		}
		linhas = append(linhas, fmt.Sprintf("[ %d ] %s", i+1, titulo))
	}
	return strings.Join(linhas, "\n")
}

// randomMessageSecret gera os 32 bytes aleatórios exigidos em
// MessageContextInfo.MessageSecret. Sem isso o iOS recebe a mensagem mas não
// desenha os botões — o mesmo requisito que o whatsmeow já atende sozinho ao
// enviar enquetes (PollCreationMessage), aqui replicado à mão porque
// InteractiveMessage não passa por aquele caminho automático.
func randomMessageSecret() ([]byte, error) {
	secret := make([]byte, 32)
	if _, err := rand.Read(secret); err != nil {
		return nil, fmt.Errorf("gerar message secret: %w", err)
	}
	return secret, nil
}

func (b *FlowBridge) recordOutgoingChatMessage(ctx context.Context, sess *Session, jid types.JID, id string, ts int64, kind, body string) {
	if b == nil || b.mgr == nil || b.mgr.messages == nil || sess == nil || id == "" {
		return
	}
	if ts <= 0 {
		ts = time.Now().UnixMilli()
	}
	row := MessageRow{
		ID: id, SessionID: sess.id, ChatJID: jid.String(), SenderJID: jidOrEmpty(sess),
		FromMe: true, Ts: ts, Kind: kind, Body: body,
	}
	_ = b.mgr.messages.Insert(ctx, row)
}

func interactiveButtonsBody(body, footer string, buttons []FlowButton) string {
	p := map[string]interface{}{"__type": "wa_interactive", "variant": "buttons", "body": body, "footer": footer, "buttons": buttons}
	b, _ := json.Marshal(p)
	return string(b)
}

func interactiveListBody(body, footer, buttonText string, sections []FlowListSection) string {
	p := map[string]interface{}{"__type": "wa_interactive", "variant": "list", "body": body, "footer": footer, "buttonText": buttonText, "sections": sections}
	b, _ := json.Marshal(p)
	return string(b)
}

// FlowButtonType identifica o "sabor" do botão. O WhatsApp não deixa
// misturar os dois grupos dentro do mesmo NativeFlowMessage: resposta rápida
// de um lado, botões de ação (link/ligar/copiar) do outro — ver
// textoDeBotoes e o split feito em SendWhatsAppButtons.
type FlowButtonType string

const (
	// FlowButtonReply é o padrão (Type == "" cai aqui também). Único tipo
	// que gera webhook de entrada quando o contato toca — é o que "acorda"
	// o bot/IA. Enviado como waE2E.ButtonsMessage (struct antiga).
	FlowButtonReply FlowButtonType = "quick_reply"
	// FlowButtonURL abre um link. Não gera webhook: o contato sai do
	// WhatsApp e o servidor não fica sabendo.
	FlowButtonURL FlowButtonType = "cta_url"
	// FlowButtonCall disca um número. Mesma observação: sem webhook.
	FlowButtonCall FlowButtonType = "cta_call"
	// FlowButtonCopy copia um código/texto para a área de transferência.
	// Mesma observação: sem webhook.
	FlowButtonCopy FlowButtonType = "cta_copy"
)

// FlowButton is a single button rendered natively by WhatsApp.
type FlowButton struct {
	ID    string
	Title string

	// Type decide o proto usado no envio. Vazio equivale a FlowButtonReply.
	Type FlowButtonType

	// Campos usados apenas pelos tipos de ação (cta_url/cta_call/cta_copy).
	URL         string // cta_url: link aberto ao tocar
	PhoneNumber string // cta_call: número discado ao tocar (E.164, ex: 5511999998888)
	CopyCode    string // cta_copy: texto copiado ao tocar
}

func (bt FlowButton) isAction() bool {
	switch bt.Type {
	case FlowButtonURL, FlowButtonCall, FlowButtonCopy:
		return true
	default:
		return false
	}
}

// nativeFlowButtonParamsJSON monta o ButtonParamsJSON esperado por cada
// nome de native flow button. Formato reconstruído por engenharia reversa
// (comparado com o tráfego gerado pelo fork @itsliaaa/baileys que já
// funciona nesta plataforma) — não vem da documentação oficial da Meta. Se
// um tipo específico não renderizar em campo, este é o primeiro lugar a
// conferir contra uma captura de pacote real.
// nativeFlowButtonParamsJSON monta o ButtonParamsJSON esperado por cada
// nome de native flow button. Formato reconstruído por engenharia reversa
// (comparado com o tráfego gerado pelo fork @itsliaaa/baileys que já
// funciona nesta plataforma) — não vem da documentação oficial da Meta. Se
// um tipo específico não renderizar em campo, este é o primeiro lugar a
// conferir contra uma captura de pacote real.
func nativeFlowButtonParamsJSON(bt FlowButton, id string) string {
	// Confirmado contra uma implementação real já funcionando (outro sistema
	// do usuário, mesma lib whatsmeow): título cortado em 20 caracteres — o
	// WhatsApp corta/rejeita silenciosamente títulos maiores — e cta_call usa
	// a chave "phone_number", não "id" (esse era o bug: "id" em vez de
	// "phone_number" faz o WhatsApp não reconhecer o botão).
	titulo := strings.TrimSpace(bt.Title)
	if len(titulo) > 20 {
		titulo = titulo[:20]
	}
	switch bt.Type {
	case FlowButtonURL:
		if titulo == "" {
			titulo = "Abrir link"
		}
		p := map[string]string{"display_text": titulo, "url": bt.URL, "merchant_url": bt.URL}
		b, _ := json.Marshal(p)
		return string(b)
	case FlowButtonCall:
		if titulo == "" {
			titulo = "Ligar"
		}
		p := map[string]string{"display_text": titulo, "phone_number": bt.PhoneNumber}
		b, _ := json.Marshal(p)
		return string(b)
	case FlowButtonCopy:
		if titulo == "" {
			titulo = "Copiar código"
		}
		p := map[string]string{"display_text": titulo, "id": bt.CopyCode, "copy_code": bt.CopyCode}
		b, _ := json.Marshal(p)
		return string(b)
	default: // FlowButtonReply (quick_reply)
		if titulo == "" {
			titulo = "Opção"
		}
		p := map[string]string{"display_text": titulo, "id": id}
		b, _ := json.Marshal(p)
		return string(b)
	}
}

// FlowListRow is one selectable row inside a list section.
type FlowListRow struct {
	ID          string
	Title       string
	Description string
}

// FlowListSection groups list rows under a header.
type FlowListSection struct {
	Title string
	Rows  []FlowListRow
}

// SendWhatsAppButtons envia botões nativos do WhatsApp. Botões de resposta
// rápida (Type vazio ou FlowButtonReply) usam o proto clássico
// waE2E.ButtonsMessage — é o único tipo que gera webhook de entrada quando
// o contato toca, por isso é o único que "acorda" o bot/IA. Botões de ação
// (cta_url/cta_call/cta_copy) usam waE2E.InteractiveMessage com
// NativeFlowMessage; esses não geram webhook (o contato sai do WhatsApp ou
// copia algo, e o servidor não fica sabendo).
//
// O WhatsApp não deixa misturar os dois grupos numa mensagem só: quando a
// chamada mistura os dois, os de ação viram botões de verdade e os de
// resposta descem para opções numeradas dentro do texto (textoDeBotoes),
// como rede de segurança.
// SendWhatsAppButtons envia botões nativos do WhatsApp via
// InteractiveMessage/NativeFlowMessage. Resposta rápida (Type vazio ou
// FlowButtonReply) e botões de ação (cta_url/cta_call/cta_copy) vão TODOS
// no mesmo NativeFlowMessage — o WhatsApp atual suporta misturar os dois
// tipos numa única mensagem (é o que o nó <biz native_flow name="mixed"/>
// sinaliza); só o nome de cada botão dentro do array muda por tipo.
//
// ── Por que não usar mais o waE2E.ButtonsMessage clássico ──────────────────
// A primeira versão disso usava o proto antigo (ButtonsMessage) para botão
// de resposta rápida pura, com base num relato de que era assim que um
// fork Baileys fazia. Só que continuou sem renderizar em campo mesmo depois
// de corrigido o restante do pipeline (envelope, oneof do proto,
// AdditionalNodes) — o que sobrou de suspeito é o próprio proto: o WhatsApp
// atual parece já não desenhar mais ButtonsMessage clássico em nenhum
// canal, só o formato mais novo. Por isso agora TUDO passa por
// InteractiveMessage, resposta rápida inclusive.
func (b *FlowBridge) SendWhatsAppButtons(ctx context.Context, sessionID, to, body, footer string, buttons []FlowButton) error {
	if b == nil {
		return errors.New("flow bridge not initialised")
	}
	if to == "" || body == "" || len(buttons) == 0 {
		return errors.New("whatsapp_buttons: missing destination/body/buttons")
	}
	sess, ok := b.mgr.Get(sessionID)
	if !ok {
		return fmt.Errorf("session %s not found", sessionID)
	}
	jid, err := parseRecipientJID(to)
	if err != nil {
		return err
	}

	fallback := func(nativeErr error) error {
		lines := []string{body}
		for i, bt := range buttons {
			line := fmt.Sprintf("[ %d ] %s", i+1, bt.Title)
			switch bt.Type {
			case FlowButtonURL:
				if bt.URL != "" {
					line += " — " + bt.URL
				}
			case FlowButtonCall:
				if bt.PhoneNumber != "" {
					line += " — " + bt.PhoneNumber
				}
			}
			lines = append(lines, line)
		}
		if footer != "" {
			lines = append(lines, "", footer)
		}
		if err := b.SendWhatsAppText(ctx, sessionID, to, strings.Join(lines, "\n")); err != nil {
			return err // falha total: nem o texto foi — isso sim é erro de verdade.
		}
		return &fallbackUsedError{cause: nativeErr}
	}

	return b.sendNativeFlowButtons(ctx, sess, jid, body, footer, buttons, fallback)
}

// sendNativeFlowButtons monta e envia um waE2E.InteractiveMessage com
// NativeFlowMessage contendo TODOS os botões pedidos, resposta rápida e
// ação misturados livremente na mesma mensagem.
func (b *FlowBridge) sendNativeFlowButtons(ctx context.Context, sess *Session, jid types.JID, body, footer string, botoes []FlowButton, fallback func(error) error) error {
	temAcao := false
	nfBotoes := make([]*waE2E.InteractiveMessage_NativeFlowMessage_NativeFlowButton, 0, len(botoes))
	for i, bt := range botoes {
		id := bt.ID
		if id == "" {
			id = fmt.Sprintf("%d", i+1)
		}
		nome := string(bt.Type)
		if nome == "" {
			nome = string(FlowButtonReply)
		}
		if bt.isAction() {
			temAcao = true
		}
		nfBotoes = append(nfBotoes, &waE2E.InteractiveMessage_NativeFlowMessage_NativeFlowButton{
			Name:             proto.String(nome),
			ButtonParamsJSON: proto.String(nativeFlowButtonParamsJSON(bt, id)),
		})
	}

	const messageVersionButtons = 1
	mv := int32(messageVersionButtons)

	// MessageParamsJSON no NativeFlowMessage (não só por botão) — confirmado
	// contra uma implementação real já funcionando. Faltava por completo
	// aqui; sem ele o WhatsApp aceita a mensagem (sem erro) mas não desenha
	// nada — exatamente o sintoma relatado (texto puro chega, botão não).
	nativeFlowParams := fmt.Sprintf(`{"from":"api","templateId":%d}`, time.Now().UnixMilli())

	// ── NativeFlowMessage é um "oneof", não um campo direto ────────────────────
	// Confirmado contra o pkg.go.dev do whatsmeow e contra exemplos reais
	// (discussão tulir/whatsmeow#650/#711): `InteractiveMessage.NativeFlowMessage`
	// não existe como campo direto. O que existe é o campo oneof
	// `InteractiveMessage.InteractiveMessage`, do tipo
	// `*InteractiveMessage_NativeFlowMessage_` (com underscore no final — é o
	// wrapper do oneof gerado pelo protoc), que por sua vez tem o campo
	// `NativeFlowMessage`.
	interactive := &waE2E.InteractiveMessage{
		Body: &waE2E.InteractiveMessage_Body{Text: proto.String(body)},
		InteractiveMessage: &waE2E.InteractiveMessage_NativeFlowMessage_{
			NativeFlowMessage: &waE2E.InteractiveMessage_NativeFlowMessage{
				Buttons:           nfBotoes,
				MessageParamsJSON: proto.String(nativeFlowParams),
				MessageVersion:    &mv,
			},
		},
	}
	if footer != "" {
		interactive.Footer = &waE2E.InteractiveMessage_Footer{Text: proto.String(footer)}
	}

	secret, err := randomMessageSecret()
	if err != nil {
		b.log.Error("gerar message secret falhou, caindo para texto", "err", err, "session", sess.id, "jid", jid.String())
		return fallback(err)
	}

	// ── Envelope: DocumentWithCaptionMessage ────────────────────────────────────
	// Confirmado contra uma implementação real já funcionando (outro sistema
	// do usuário, mesma lib whatsmeow) — ela SEMPRE embrulha InteractiveMessage
	// de botão em DocumentWithCaptionMessage. Uma tentativa anterior aqui tinha
	// removido esse embrulho de vez, com base só no changelog de outro projeto
	// (Evolution Go) — mas essa referência agora comprovadamente funcionando
	// mostra que embrulhar É o correto; a versão sem embrulho estava errada.
	msg := &waE2E.Message{
		DocumentWithCaptionMessage: &waE2E.FutureProofMessage{
			Message: &waE2E.Message{InteractiveMessage: interactive},
		},
		MessageContextInfo: &waE2E.MessageContextInfo{MessageSecret: secret},
	}

	// Nome do fluxo nativo para o nó <biz>: "quick_reply" quando só há botão
	// de resposta, "mixed" quando há pelo menos um botão de ação misturado.
	//
	// AdditionalNodes é o parâmetro OFICIAL do whatsmeow para isso — existe
	// em whatsmeow.SendRequestExtra (campo `AdditionalNodes *[]waBinary.Node`,
	// confirmado no send.go do projeto).
	nomeFluxo := "quick_reply"
	if temAcao {
		nomeFluxo = "mixed"
	}

	// ── Resolver LID antes de enviar ────────────────────────────────────────────
	// Diferença encontrada contra a implementação de referência: ela SEMPRE
	// resolve o JID de destino (telefone -> LID do WhatsApp multi-device,
	// mesmo mecanismo já usado nas chamadas de voz em internal/wa/socket.go)
	// antes de mandar a mensagem interativa. Mensagem de texto simples
	// tolera JID de telefone puro; a versão anterior deste código mandava
	// pro `jid` de telefone direto — o servidor aceita sem erro, mas o
	// cliente pode não linkar o conteúdo interativo ao dispositivo certo.
	destino := wa.NewSocket(sess.client).ResolveLIDForPN(ctx, jid)
	extraNodes := nosDeBotao(nomeFluxo, destino.Server == types.GroupServer)

	resp, err := sess.client.SendMessage(ctx, destino, msg, whatsmeow.SendRequestExtra{
		AdditionalNodes: &extraNodes,
	})
	if err != nil {
		// Esse erro estava sendo engolido em silêncio — o contato recebia
		// texto puro (o fallback abaixo) e ninguém via o motivo real em
		// lugar nenhum, nem no log do wacalls-chat.
		b.log.Error("envio de botão interativo falhou, caindo para texto", "err", err, "session", sess.id, "jid", jid.String())
		return fallback(err)
	}
	b.recordOutgoingChatMessage(ctx, sess, jid, string(resp.ID), resp.Timestamp.UnixMilli(), "text", interactiveButtonsBody(body, footer, botoes))
	return nil
}

// SendWhatsAppList sends a native single-select list via InteractiveMessage
// (NativeFlowMessage com o botão nativo "single_select"). ButtonParamsJSON
// carrega {title, sections:[{title, rows:[{header,title,description,id}]}]}.
func (b *FlowBridge) SendWhatsAppList(ctx context.Context, sessionID, to, body, footer, buttonText string, sections []FlowListSection) error {
	if b == nil {
		return errors.New("flow bridge not initialised")
	}
	if to == "" || body == "" || len(sections) == 0 {
		return errors.New("whatsapp_list: missing destination/body/sections")
	}
	sess, ok := b.mgr.Get(sessionID)
	if !ok {
		return fmt.Errorf("session %s not found", sessionID)
	}
	jid, err := parseRecipientJID(to)
	if err != nil {
		return err
	}
	if buttonText == "" {
		buttonText = "Selecionar"
	}

	fallback := func(nativeErr error) error {
		if err := b.sendListTextFallback(ctx, sessionID, to, body, footer, sections); err != nil {
			return err
		}
		return &fallbackUsedError{cause: nativeErr}
	}

	// ── InteractiveMessage + single_select, confirmado contra referência real ──
	// Uma tentativa anterior aqui tinha revertido pro ListMessage clássico,
	// baseada no changelog de outro projeto (Evolution Go) que dizia o
	// formato moderno "não renderiza no Web/Desktop". Uma implementação real
	// já funcionando (outro sistema do usuário, mesma lib whatsmeow) usa
	// exatamente InteractiveMessage + native flow "single_select" pra lista
	// — sem embrulho nenhum, com DeviceListMetadataVersion em vez de
	// MessageSecret. Voltando pra essa forma.
	type lRow struct {
		Header      string `json:"header,omitempty"`
		Title       string `json:"title"`
		Description string `json:"description,omitempty"`
		ID          string `json:"id"`
	}
	type lSec struct {
		Title string `json:"title"`
		Rows  []lRow `json:"rows"`
	}
	paramsOut := struct {
		Title    string `json:"title"`
		Sections []lSec `json:"sections"`
	}{Title: buttonText}

	idx := 0
	for _, sec := range sections {
		ls := lSec{Title: sec.Title}
		for _, r := range sec.Rows {
			idx++
			id := r.ID
			if id == "" {
				id = fmt.Sprintf("%d", idx)
			}
			titulo := strings.TrimSpace(r.Title)
			if titulo == "" {
				titulo = fmt.Sprintf("Opção %d", idx)
			}
			ls.Rows = append(ls.Rows, lRow{Title: titulo, Description: r.Description, ID: id})
		}
		paramsOut.Sections = append(paramsOut.Sections, ls)
	}
	paramsJSON, jerr := json.Marshal(paramsOut)
	if jerr != nil {
		return fallback(jerr)
	}

	const messageVersionList = 3
	mv := int32(messageVersionList)

	interactive := &waE2E.InteractiveMessage{
		Body: &waE2E.InteractiveMessage_Body{Text: proto.String(body)},
		InteractiveMessage: &waE2E.InteractiveMessage_NativeFlowMessage_{
			NativeFlowMessage: &waE2E.InteractiveMessage_NativeFlowMessage{
				Buttons: []*waE2E.InteractiveMessage_NativeFlowMessage_NativeFlowButton{{
					Name:             proto.String("single_select"),
					ButtonParamsJSON: proto.String(string(paramsJSON)),
				}},
				MessageVersion: &mv,
			},
		},
	}
	if footer != "" {
		interactive.Footer = &waE2E.InteractiveMessage_Footer{Text: proto.String(footer)}
	}

	msg := &waE2E.Message{
		MessageContextInfo: &waE2E.MessageContextInfo{
			DeviceListMetadataVersion: proto.Int32(2),
		},
		InteractiveMessage: interactive,
	}

	// Mesma resolução de LID aplicada aos botões — ver comentário em
	// sendNativeFlowButtons.
	destino := wa.NewSocket(sess.client).ResolveLIDForPN(ctx, jid)

	// Nó de acompanhamento confirmado no changelog do Evolution API/Go:
	// <biz><list type=product_list v=2/></biz>. AdditionalNodes é o campo
	// oficial de whatsmeow.SendRequestExtra para isso.
	extraNodes := whatsappInteractiveBizNodes()

	resp, err := sess.client.SendMessage(ctx, destino, msg, whatsmeow.SendRequestExtra{
		AdditionalNodes: &extraNodes,
	})
	if err != nil {
		b.log.Error("envio de lista interativa falhou, caindo para texto", "err", err, "session", sess.id, "jid", jid.String())
		return fallback(err)
	}
	b.recordOutgoingChatMessage(ctx, sess, jid, string(resp.ID), resp.Timestamp.UnixMilli(), "text", interactiveListBody(body, footer, buttonText, sections))
	return nil
}

func (b *FlowBridge) sendListTextFallback(ctx context.Context, sessionID, to, body, footer string, sections []FlowListSection) error {
	lines := []string{body}
	n := 0
	for _, sec := range sections {
		if sec.Title != "" {
			lines = append(lines, "", "*"+sec.Title+"*")
		}
		for _, r := range sec.Rows {
			n++
			line := fmt.Sprintf("[ %d ] %s", n, r.Title)
			if r.Description != "" {
				line += " — " + r.Description
			}
			lines = append(lines, line)
		}
	}
	if footer != "" {
		lines = append(lines, "", footer)
	}
	return b.SendWhatsAppText(ctx, sessionID, to, strings.Join(lines, "\n"))
}


// RecordPeerAudio captures up to `seconds` of the peer's audio and writes it
// to disk as a 16 kHz mono WAV file. Returns a path (relative URL) under
// /api/media/recordings/... that the static media handler serves.
func (b *FlowBridge) RecordPeerAudio(ctx context.Context, sessionID, callID string, seconds int) (string, error) {
	if b == nil {
		return "", errors.New("flow bridge not initialised")
	}
	if seconds <= 0 {
		seconds = 5
	}
	sess, ok := b.mgr.Get(sessionID)
	if !ok {
		return "", fmt.Errorf("session %s not found", sessionID)
	}
	if _, ok := sess.reg.get(callID); !ok {
		return "", fmt.Errorf("call %s not active", callID)
	}
	const sampleRate = 16000
	maxSamples := sampleRate * seconds
	buf := make([]float32, 0, maxSamples)
	done := make(chan struct{}, 1)
	sess.reg.setFlowAudioSink(callID, func(pcm []float32) {
		room := maxSamples - len(buf)
		if room <= 0 {
			select {
			case done <- struct{}{}:
			default:
			}
			return
		}
		if len(pcm) > room {
			pcm = pcm[:room]
		}
		buf = append(buf, pcm...)
		if len(buf) >= maxSamples {
			select {
			case done <- struct{}{}:
			default:
			}
		}
	})
	defer sess.reg.setFlowAudioSink(callID, nil)
	select {
	case <-ctx.Done():
		return "", ctx.Err()
	case <-done:
	case <-time.After(time.Duration(seconds) * time.Second):
	}
	if len(buf) < sampleRate/10 {
		return "", errors.New("recording too short")
	}
	dir := filepath.Join("media", "recordings")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	name := fmt.Sprintf("%s_%s_%d.wav", sessionID, callID, time.Now().UnixMilli())
	full := filepath.Join(dir, name)
	if err := os.WriteFile(full, encodeWavMonoPCM16(buf, sampleRate), 0o644); err != nil {
		return "", err
	}
	return "/api/media/recordings/" + name, nil
}

// SendWhatsAppMedia fetches `mediaURL` over HTTP and sends it as an image,
// audio, video, or document to `to`. `caption` is used for image/video,
// `filename` is used for document.
func (b *FlowBridge) SendWhatsAppMedia(ctx context.Context, sessionID, to, kind, mediaURL, caption, filename string) error {
	if b == nil {
		return errors.New("flow bridge not initialised")
	}
	if to == "" || mediaURL == "" {
		return errors.New("whatsapp_media: missing destination or URL")
	}
	sess, ok := b.mgr.Get(sessionID)
	if !ok {
		return fmt.Errorf("session %s not found", sessionID)
	}
	jid, err := parseRecipientJID(to)
	if err != nil {
		return err
	}
	// Resolve same-origin /api/media/... URLs locally to avoid a self HTTP fetch.
	var data []byte
	var mime string
	if strings.HasPrefix(mediaURL, "/api/media/") {
		rel := strings.TrimPrefix(mediaURL, "/api/media/")
		full := filepath.Join("media", filepath.FromSlash(rel))
		data, err = os.ReadFile(full)
		if err != nil {
			return fmt.Errorf("read local media: %w", err)
		}
	} else {
		req, err := http.NewRequestWithContext(ctx, http.MethodGet, mediaURL, nil)
		if err != nil {
			return err
		}
		resp, err := b.httpClient.Do(req)
		if err != nil {
			return err
		}
		defer resp.Body.Close()
		if resp.StatusCode >= 300 {
			return fmt.Errorf("fetch media http %d", resp.StatusCode)
		}
		mime = resp.Header.Get("Content-Type")
		data, err = io.ReadAll(io.LimitReader(resp.Body, 64*1024*1024))
		if err != nil {
			return err
		}
	}
	if mime == "" {
		mime = guessMimeForKind(kind)
	}
	// Normaliza antes do upload: o hash/tamanho enviado no protobuf tem que ser
	// do arquivo realmente convertido.
	data, mime, filename = prepareOutgoingMedia(ctx, kind, data, mime, filename)
	var appInfo whatsmeow.MediaType
	switch strings.ToLower(kind) {
	case "audio":
		appInfo = whatsmeow.MediaAudio
	case "video":
		appInfo = whatsmeow.MediaVideo
	case "document":
		appInfo = whatsmeow.MediaDocument
	default:
		appInfo = whatsmeow.MediaImage
	}
	up, err := sess.client.Upload(ctx, data, appInfo)
	if err != nil {
		return fmt.Errorf("upload: %w", err)
	}
	if strings.ToLower(kind) == "audio" {
		msg := buildMediaMessageWithData(kind, up, mime, caption, filename, uint64(len(data)), audioDurationSeconds(data), data)
		if _, err := sess.client.SendMessage(ctx, jid, msg); err != nil {
			return err
		}
		return nil
	}
	msg := buildMediaMessageWithData(kind, up, mime, caption, filename, uint64(len(data)), 0, data)
	if _, err := sess.client.SendMessage(ctx, jid, msg); err != nil {
		return err
	}
	return nil
}

func buildMediaMessage(kind string, up whatsmeow.UploadResponse, mime, caption, filename string, size uint64, audioSeconds uint32) *waE2E.Message {
	return buildMediaMessageWithData(kind, up, mime, caption, filename, size, audioSeconds, nil)
}

// buildMediaMessageWithData é como buildMediaMessage, mas quando kind=="audio"
// e audioData é fornecido, calcula o Waveform (64 bytes 0..100) que o
// WhatsApp iOS exige para renderizar corretamente a duração — sem esse
// campo o iPhone mostra "0:00" mesmo com Seconds preenchido.
func buildMediaMessageWithData(kind string, up whatsmeow.UploadResponse, mime, caption, filename string, size uint64, audioSeconds uint32, audioData []byte) *waE2E.Message {
	switch strings.ToLower(kind) {
	case "audio":
		if audioSeconds == 0 {
			audioSeconds = 1
		}
		mime = normalizeWhatsAppAudioMime(mime)
		waveform := computeOpusWaveform(audioData)
		if len(waveform) != 64 {
			waveform = defaultVoiceWaveform()
		}
		mediaKeyTimestamp := time.Now().Unix()
		am := &waE2E.AudioMessage{
			URL:               proto.String(up.URL),
			DirectPath:        proto.String(up.DirectPath),
			MediaKey:          up.MediaKey,
			FileEncSHA256:     up.FileEncSHA256,
			FileSHA256:        up.FileSHA256,
			FileLength:        proto.Uint64(size),
			Mimetype:          proto.String(mime),
			PTT:               proto.Bool(true),
			Seconds:           proto.Uint32(audioSeconds),
			MediaKeyTimestamp: proto.Int64(mediaKeyTimestamp),
			Waveform:          waveform,
		}
		return &waE2E.Message{AudioMessage: am}
	case "video":
		mime = normalizeOutgoingMediaMime("video", mime, audioData)
		vp := probeVideo(audioData)
		vm := &waE2E.VideoMessage{
			URL:               proto.String(up.URL),
			DirectPath:        proto.String(up.DirectPath),
			MediaKey:          up.MediaKey,
			FileEncSHA256:     up.FileEncSHA256,
			FileSHA256:        up.FileSHA256,
			FileLength:        proto.Uint64(size),
			Mimetype:          proto.String(mime),
			MediaKeyTimestamp: proto.Int64(time.Now().Unix()),
		}
		if caption != "" {
			vm.Caption = proto.String(caption)
		}
		if vp.Width > 0 && vp.Height > 0 {
			vm.Width = proto.Uint32(vp.Width)
			vm.Height = proto.Uint32(vp.Height)
		}
		// Vídeo sem Seconds aparece como "0:00" no aparelho do contato. Igual
		// ao Baileys, a duração informada pelo backend (ffprobe no Node) tem
		// prioridade sobre o probe local, que pode não ter ffprobe instalado.
		secs := audioSeconds
		if secs == 0 {
			secs = vp.Seconds
		}
		if secs == 0 {
			secs = 1
		}
		vm.Seconds = proto.Uint32(secs)
		if thumb := videoThumbnail(audioData); len(thumb) > 0 {
			vm.JPEGThumbnail = thumb
		}
		return &waE2E.Message{VideoMessage: vm}
	case "document":
		if filename == "" {
			filename = "arquivo"
		}
		mime = normalizeOutgoingMediaMime("document", mime, audioData)
		dm := &waE2E.DocumentMessage{
			URL:               proto.String(up.URL),
			DirectPath:        proto.String(up.DirectPath),
			MediaKey:          up.MediaKey,
			FileEncSHA256:     up.FileEncSHA256,
			FileSHA256:        up.FileSHA256,
			FileLength:        proto.Uint64(size),
			Mimetype:          proto.String(mime),
			FileName:          proto.String(filename),
			MediaKeyTimestamp: proto.Int64(time.Now().Unix()),
		}
		if caption != "" {
			dm.Caption = proto.String(caption)
		}
		return &waE2E.Message{DocumentMessage: dm}
	case "sticker":
		// Figurinha precisa ser StickerMessage: mandar webp dentro de um
		// ImageMessage faz o cliente exibir "não é possível abrir aqui".
		sm := &waE2E.StickerMessage{
			URL:               proto.String(up.URL),
			DirectPath:        proto.String(up.DirectPath),
			MediaKey:          up.MediaKey,
			FileEncSHA256:     up.FileEncSHA256,
			FileSHA256:        up.FileSHA256,
			FileLength:        proto.Uint64(size),
			Mimetype:          proto.String("image/webp"),
			MediaKeyTimestamp: proto.Int64(time.Now().Unix()),
		}
		if w, h := imageDimensions(audioData); w > 0 && h > 0 {
			sm.Width = proto.Uint32(w)
			sm.Height = proto.Uint32(h)
		}
		return &waE2E.Message{StickerMessage: sm}
	default:
		mime = normalizeOutgoingMediaMime("image", mime, audioData)
		im := &waE2E.ImageMessage{
			URL:               proto.String(up.URL),
			DirectPath:        proto.String(up.DirectPath),
			MediaKey:          up.MediaKey,
			FileEncSHA256:     up.FileEncSHA256,
			FileSHA256:        up.FileSHA256,
			FileLength:        proto.Uint64(size),
			Mimetype:          proto.String(mime),
			MediaKeyTimestamp: proto.Int64(time.Now().Unix()),
		}
		if caption != "" {
			im.Caption = proto.String(caption)
		}
		if w, h := imageDimensions(audioData); w > 0 && h > 0 {
			im.Width = proto.Uint32(w)
			im.Height = proto.Uint32(h)
		}
		if thumb := jpegThumbnail(audioData, 72); len(thumb) > 0 {
			im.JPEGThumbnail = thumb
		}
		return &waE2E.Message{ImageMessage: im}
	}
}

func audioDurationSeconds(data []byte) uint32 {
	if seconds := audioDurationSecondsFromFFProbe(data); seconds > 0 {
		return seconds
	}
	if seconds := audioDurationSecondsFromPCM(data); seconds > 0 {
		return seconds
	}

	const opusClockHz = uint64(48000)
	var maxGranule uint64
	for off := 0; off+27 <= len(data); {
		if string(data[off:off+4]) != "OggS" {
			off++
			continue
		}
		segments := int(data[off+26])
		if off+27+segments > len(data) {
			break
		}
		granule := uint64(data[off+6]) |
			uint64(data[off+7])<<8 |
			uint64(data[off+8])<<16 |
			uint64(data[off+9])<<24 |
			uint64(data[off+10])<<32 |
			uint64(data[off+11])<<40 |
			uint64(data[off+12])<<48 |
			uint64(data[off+13])<<56
		if granule != ^uint64(0) && granule > maxGranule {
			maxGranule = granule
		}
		payload := 0
		for i := 0; i < segments; i++ {
			payload += int(data[off+27+i])
		}
		off += 27 + segments + payload
	}
	if maxGranule == 0 {
		return 0
	}
	seconds := (maxGranule + opusClockHz - 1) / opusClockHz
	if seconds == 0 {
		return 1
	}
	if seconds > uint64(^uint32(0)) {
		return ^uint32(0)
	}
	return uint32(seconds)
}

func audioDurationSecondsFromFFProbe(data []byte) uint32 {
	if len(data) == 0 {
		return 0
	}
	bin, err := exec.LookPath("ffprobe")
	if err != nil || bin == "" {
		return 0
	}
	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, bin,
		"-v", "error",
		"-show_entries", "format=duration:stream=duration",
		"-of", "default=nw=1:nk=1",
		"pipe:0",
	)
	cmd.Stdin = bytes.NewReader(data)
	var out bytes.Buffer
	cmd.Stdout = &out
	if err := cmd.Run(); err != nil {
		return 0
	}
	var best float64
	for _, field := range strings.Fields(out.String()) {
		duration, err := strconv.ParseFloat(strings.TrimSpace(field), 64)
		if err == nil && duration > best {
			best = duration
		}
	}
	if best <= 0 {
		return 0
	}
	seconds := math.Ceil(best)
	if seconds < 1 {
		return 1
	}
	if seconds > float64(^uint32(0)) {
		return ^uint32(0)
	}
	return uint32(seconds)
}

func audioDurationSecondsFromPCM(data []byte) uint32 {
	if len(data) == 0 {
		return 0
	}
	bin, err := exec.LookPath("ffmpeg")
	if err != nil || bin == "" {
		return 0
	}
	const sampleRate = 16000
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, bin,
		"-hide_banner", "-loglevel", "error",
		"-i", "pipe:0",
		"-vn", "-ac", "1", "-ar", strconv.Itoa(sampleRate),
		"-f", "s16le", "pipe:1",
	)
	cmd.Stdin = bytes.NewReader(data)
	var out bytes.Buffer
	cmd.Stdout = &out
	if err := cmd.Run(); err != nil {
		return 0
	}
	samples := out.Len() / 2
	if samples <= 0 {
		return 0
	}
	seconds := math.Ceil(float64(samples) / float64(sampleRate))
	if seconds < 1 {
		return 1
	}
	if seconds > float64(^uint32(0)) {
		return ^uint32(0)
	}
	return uint32(seconds)
}

func guessMimeForKind(kind string) string {
	switch strings.ToLower(kind) {
	case "audio":
		return "audio/ogg; codecs=opus"
	case "video":
		return "video/mp4"
	case "document":
		return "application/octet-stream"
	default:
		return "image/jpeg"
	}
}

func normalizeWhatsAppAudioMime(mime string) string {
	if strings.Contains(strings.ToLower(mime), "ogg") {
		return "audio/ogg; codecs=opus"
	}
	return "audio/ogg; codecs=opus"
}

func parseRecipientJID(to string) (types.JID, error) {
	to = strings.TrimSpace(to)
	if strings.Contains(to, "@") {
		return types.ParseJID(to)
	}
	// Strip +, spaces, hyphens.
	clean := strings.Map(func(r rune) rune {
		if r >= '0' && r <= '9' {
			return r
		}
		return -1
	}, to)
	if clean == "" {
		return types.JID{}, errors.New("invalid recipient")
	}
	return types.NewJID(clean, types.DefaultUserServer), nil
}

// ---- audio helpers -----------------------------------------------------

func pcm16BytesToFloat32(b []byte) []float32 {
	n := len(b) / 2
	out := make([]float32, n)
	for i := 0; i < n; i++ {
		s := int16(binary.LittleEndian.Uint16(b[i*2:]))
		out[i] = float32(s) / 32768.0
	}
	return out
}

func encodeWavMonoPCM16(pcm []float32, rate int) []byte {
	dataLen := len(pcm) * 2
	buf := bytes.NewBuffer(make([]byte, 0, 44+dataLen))
	// RIFF header
	buf.WriteString("RIFF")
	_ = binary.Write(buf, binary.LittleEndian, uint32(36+dataLen))
	buf.WriteString("WAVE")
	// fmt chunk
	buf.WriteString("fmt ")
	_ = binary.Write(buf, binary.LittleEndian, uint32(16))
	_ = binary.Write(buf, binary.LittleEndian, uint16(1))      // PCM
	_ = binary.Write(buf, binary.LittleEndian, uint16(1))      // channels
	_ = binary.Write(buf, binary.LittleEndian, uint32(rate))   // sample rate
	_ = binary.Write(buf, binary.LittleEndian, uint32(rate*2)) // byte rate
	_ = binary.Write(buf, binary.LittleEndian, uint16(2))      // block align
	_ = binary.Write(buf, binary.LittleEndian, uint16(16))     // bits/sample
	// data chunk
	buf.WriteString("data")
	_ = binary.Write(buf, binary.LittleEndian, uint32(dataLen))
	for _, s := range pcm {
		if s > 1 {
			s = 1
		} else if s < -1 {
			s = -1
		}
		_ = binary.Write(buf, binary.LittleEndian, int16(s*32767))
	}
	return buf.Bytes()
}

// computeOpusWaveform decodifica o áudio (qualquer formato aceito pelo
// ffmpeg) para PCM mono 8kHz s16le e retorna 64 amplitudes 0..100 (RMS
// por bin). O WhatsApp iOS usa esse array para renderizar as barrinhas
// da mensagem de voz — sem ele, o player mostra "0:00" mesmo quando
// Seconds está preenchido. Retorna nil se ffmpeg não estiver disponível
// ou a decodificação falhar (fallback: manda sem waveform).
func computeOpusWaveform(audioData []byte) []byte {
	if len(audioData) == 0 {
		return nil
	}
	bin, err := exec.LookPath("ffmpeg")
	if err != nil || bin == "" {
		return nil
	}
	ctx, cancel := context.WithTimeout(context.Background(), 15*time.Second)
	defer cancel()
	cmd := exec.CommandContext(ctx, bin,
		"-hide_banner", "-loglevel", "error",
		"-i", "pipe:0",
		"-vn", "-ac", "1", "-ar", "8000",
		"-f", "s16le", "pipe:1",
	)
	cmd.Stdin = bytes.NewReader(audioData)
	var out bytes.Buffer
	cmd.Stdout = &out
	if err := cmd.Run(); err != nil {
		return nil
	}
	pcm := out.Bytes()
	samples := len(pcm) / 2
	if samples < 64 {
		return nil
	}
	const bars = 64
	binSize := samples / bars
	if binSize < 1 {
		binSize = 1
	}
	wf := make([]byte, bars)
	var peak float64
	rms := make([]float64, bars)
	for b := 0; b < bars; b++ {
		start := b * binSize
		end := start + binSize
		if end > samples {
			end = samples
		}
		var sumSq float64
		var count float64
		for i := start; i < end; i++ {
			v := float64(int16(binary.LittleEndian.Uint16(pcm[i*2:]))) / 32768.0
			sumSq += v * v
			count++
		}
		if count == 0 {
			continue
		}
		r := math.Sqrt(sumSq / count)
		rms[b] = r
		if r > peak {
			peak = r
		}
	}
	if peak == 0 {
		peak = 1
	}
	for b := 0; b < bars; b++ {
		v := math.Round((rms[b] / peak) * 100)
		if v < 0 {
			v = 0
		} else if v > 100 {
			v = 100
		}
		wf[b] = byte(v)
	}
	return wf
}

func defaultVoiceWaveform() []byte {
	return []byte{8, 12, 18, 24, 31, 36, 43, 49, 56, 62, 68, 73, 77, 82, 85, 88, 90, 91, 92, 91, 89, 86, 82, 77, 71, 66, 59, 53, 46, 39, 32, 26, 20, 15, 12, 10, 12, 16, 22, 29, 37, 45, 53, 61, 68, 75, 81, 86, 90, 93, 95, 94, 91, 87, 81, 74, 66, 57, 48, 39, 30, 22, 15, 10}
}
