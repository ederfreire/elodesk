package main

// Reprodução de um áudio pronto dentro de uma ligação ativa.
//
// Serve à campanha de voz: o backend liga para o contato, espera atender e
// então manda tocar o áudio gravado/enviado pelo usuário.
//
// Por que um endpoint e não um nó de fluxo: a URA já resolve o caso
// "conversa com menu", mas a campanha é mais simples — uma ligação, um áudio,
// desliga. Um endpoint reaproveita o caminho de áudio que já existe (o mesmo
// da música de espera) sem mexer no executor de fluxo, que é a parte mais
// delicada do serviço.
//
// O trabalho pesado já estava pronto em holdmusicplayer.go: decodeToMono16k
// converte qualquer formato para PCM 16 kHz mono via ffmpeg, e
// FeedCapturedPCM injeta na ligação. A diferença aqui é tocar UMA vez em vez
// de repetir em laço, e não depender do estado de "em espera".

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"path/filepath"
	"sync"
	"time"
)

type campaignAudioPlayer struct {
	cancel context.CancelFunc
	done   chan struct{}
}

var (
	campaignPlayersMu sync.Mutex
	campaignPlayers   = map[string]*campaignAudioPlayer{} // key = sid+"/"+callID
)

// Teto de download: áudio de campanha é curto por natureza. O limite evita
// que uma URL errada (uma página HTML, um vídeo) consuma disco e memória.
const campaignAudioMaxBytes = 25 << 20 // 25 MB

// stopCampaignAudio interrompe a reprodução em andamento, se houver.
func stopCampaignAudio(sessID, callID string) {
	campaignPlayersMu.Lock()
	p := campaignPlayers[holdKey(sessID, callID)]
	if p != nil {
		delete(campaignPlayers, holdKey(sessID, callID))
	}
	campaignPlayersMu.Unlock()
	if p == nil {
		return
	}
	p.cancel()
	select {
	case <-p.done:
	case <-time.After(2 * time.Second):
	}
}

// baixarAudioTemporario traz o arquivo para o disco local.
//
// Recebemos URL em vez de caminho de arquivo de propósito: o áudio vive na
// pasta pública do backend, que é outro processo. Aceitar caminho absoluto
// abriria espaço para ler qualquer arquivo do servidor por engano.
func baixarAudioTemporario(ctx context.Context, url string) (string, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return "", err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return "", fmt.Errorf("áudio inacessível (HTTP %d)", resp.StatusCode)
	}

	f, err := os.CreateTemp("", "campanha-voz-*")
	if err != nil {
		return "", err
	}
	defer f.Close()

	n, err := io.Copy(f, io.LimitReader(resp.Body, campaignAudioMaxBytes))
	if err != nil {
		os.Remove(f.Name())
		return "", err
	}
	if n == 0 {
		os.Remove(f.Name())
		return "", fmt.Errorf("áudio vazio")
	}
	return f.Name(), nil
}

// esperarAtendimento aguarda a ligação sair de "chamando" e entrar em
// "conectada". Devolve false quando o contato não atendeu, recusou ou o prazo
// acabou — todos os casos em que a campanha deve marcar "não atendeu" e tentar
// de novo mais tarde.
func esperarAtendimento(ctx context.Context, s *server, callID string, prazo time.Duration) (bool, string) {
	limite := time.Now().Add(prazo)
	for {
		rec, achou := s.broker.getCall(callID)
		if achou && rec != nil {
			switch rec.Status {
			case StatusConnected:
				return true, ""
			case StatusEnded:
				motivo := rec.EndReason
				if motivo == "" {
					motivo = "encerrada antes de atender"
				}
				return false, motivo
			}
		}

		if time.Now().After(limite) {
			return false, "não atendeu"
		}

		select {
		case <-ctx.Done():
			return false, "cancelada"
		case <-time.After(500 * time.Millisecond):
		}
	}
}

// handlePlayCampaignAudio: POST /api/sessions/{sid}/calls/{id}/play
//
// Corpo: {"url": "https://.../public/company1/audio.mp3"}
//
// Responde imediatamente com a duração do áudio. Quem chamou usa esse número
// para saber quando desligar — assim o Go não precisa decidir sobre o fim da
// ligação, que continua sendo responsabilidade de quem originou a campanha.
func (s *server) handlePlayCampaignAudio(w http.ResponseWriter, r *http.Request) {
	sess := s.sessionByID(w, r, r.PathValue("sid"))
	if sess == nil {
		return
	}
	callID := r.PathValue("id")

	var body struct {
		URL string `json:"url"`
		// Quanto esperar o contato atender antes de desistir. Zero = não
		// espera, toca já (útil para uma ligação que já está em curso).
		WaitAnswerMs int64 `json:"waitAnswerMs"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || body.URL == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "url required"})
		return
	}

	if sess.reg == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "sessão sem chamadas ativas"})
		return
	}

	// Espera o atendimento aqui dentro em vez de exigir que quem chamou fique
	// consultando status em laço. Assim a campanha faz uma requisição só e já
	// recebe a resposta que interessa: atendeu e tocou, ou não atendeu.
	if body.WaitAnswerMs > 0 {
		atendeu, motivo := esperarAtendimento(r.Context(), s, callID, time.Duration(body.WaitAnswerMs)*time.Millisecond)
		if !atendeu {
			writeJSON(w, http.StatusOK, map[string]any{
				"ok":       true,
				"answered": false,
				"reason":   motivo,
			})
			return
		}
	}

	ac, ok := sess.reg.get(callID)
	if !ok || ac == nil {
		writeJSON(w, http.StatusNotFound, map[string]string{"error": "chamada não encontrada ou já encerrada"})
		return
	}

	// Uma reprodução por vez na mesma ligação.
	stopCampaignAudio(sess.id, callID)

	baixaCtx, cancelBaixa := context.WithTimeout(r.Context(), 60*time.Second)
	arquivo, err := baixarAudioTemporario(baixaCtx, body.URL)
	cancelBaixa()
	if err != nil {
		if s.log != nil {
			s.log.Warn("campaign audio download failed", "call_id", callID, "err", err.Error())
		}
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": err.Error()})
		return
	}

	// A decodificação acontece antes de responder: se o ffmpeg não der conta
	// do arquivo, quem chamou fica sabendo agora e marca a tentativa como
	// falha, em vez de desligar depois achando que o contato ouviu algo.
	decodeCtx, cancelDecode := context.WithTimeout(context.Background(), 120*time.Second)
	pcm, err := decodeToMono16k(decodeCtx, arquivo)
	cancelDecode()
	os.Remove(arquivo)
	if err != nil || len(pcm) == 0 {
		motivo := "não foi possível decodificar o áudio"
		if err != nil {
			motivo = err.Error()
		}
		if s.log != nil {
			s.log.Warn("campaign audio decode failed", "call_id", callID, "err", motivo)
		}
		writeJSON(w, http.StatusUnprocessableEntity, map[string]string{"error": motivo})
		return
	}

	duracaoMs := int64(len(pcm)) * 1000 / int64(pcmSampleRate)

	ctx, cancel := context.WithCancel(context.Background())
	p := &campaignAudioPlayer{cancel: cancel, done: make(chan struct{})}

	campaignPlayersMu.Lock()
	campaignPlayers[holdKey(sess.id, callID)] = p
	campaignPlayersMu.Unlock()

	go func() {
		defer close(p.done)
		defer func() {
			campaignPlayersMu.Lock()
			if cur, ok := campaignPlayers[holdKey(sess.id, callID)]; ok && cur == p {
				delete(campaignPlayers, holdKey(sess.id, callID))
			}
			campaignPlayersMu.Unlock()
		}()

		// Mesma entrega ritmada da URA (ver pcmfeeder.go): em blocos grandes o
		// buffer de captura descartaria quase tudo e o contato ouviria só o
		// finalzinho do áudio.
		_ = feedPCMRealtime(ctx, sess, callID, pcm, nil)
	}()

	if s.log != nil {
		s.log.Info("campaign audio playing", "session", sess.id, "call_id", callID,
			"duration_ms", duracaoMs, "file", filepath.Base(body.URL))
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"ok":         true,
		"answered":   true,
		"durationMs": duracaoMs,
	})
}
