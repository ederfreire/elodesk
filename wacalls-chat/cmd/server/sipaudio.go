package main

// Ponte de áudio entre o baresip (SIP) e o resto do sistema. Dois backends,
// escolhidos via SIP_AUDIO_BACKEND (ver server.go):
//
//   "pulse" (default): dispositivos virtuais PulseAudio criados pelo
//   instalador (module-null-sink/module-remap-source) — baresip toca no
//   sink "wacalls_sip_out" e lê do source "wacalls_sip_mic", nós ligamos
//   via parec/pacat. Depende de uma sessão PulseAudio de usuário viva
//   (systemd --user), que se mostrou instável em alguns ambientes headless
//   (sem sessão gráfica/D-Bus) — daí o backend alternativo abaixo.
//
//   "alsa": módulo de kernel snd-aloop (ALSA Loopback) — não depende de
//   sessão de usuário nenhuma, só do módulo carregado. baresip toca em
//   hw:Loopback,0,0 e captura de hw:Loopback,0,1; nós capturamos o espelho
//   em hw:Loopback,1,0 (via arecord) e tocamos em hw:Loopback,1,1 (via
//   aplay, que o snd-aloop espelha de volta pra dentro de hw:Loopback,0,1).
//   Só é usado quando o instalador confirma que o snd-aloop carregou nesse
//   servidor — nunca testado ao vivo por mim (sem baresip/ALSA disponível
//   no ambiente de desenvolvimento), então se o áudio não fluir com esse
//   backend, o primeiro lugar a olhar é se o pareamento de subdispositivos
//   acima bate com o que o snd-aloop realmente expõe (`aplay -l`/`arecord -l`
//   no servidor mostram os device/subdevice reais).
//
//   controle remoto (SIP) → baresip → dispositivo de saída (sink/hw:Loopback,0,0)
//                                          │ parec ou arecord (este arquivo)
//                                          ▼
//                                     []float32 PCM 16kHz → Bridge.WritePCM (navegador)
//
//   navegador → Bridge.OnBrowserPCM → []float32 PCM 16kHz
//                                          │ pacat ou aplay (este arquivo)
//                                          ▼
//                          dispositivo de entrada (source/hw:Loopback,0,1) → baresip → SIP
//
// Em ambos os casos pedimos 16kHz mono s16le direto na fronteira (PulseAudio
// resample sozinho; pra ALSA loopback não há resample — o baresip.config
// deve casar a mesma taxa) — o mesmo formato que o Bridge (DataChannel PCM)
// já usa, sem precisar reamostrar manualmente em Go.

import (
	"bufio"
	"context"
	"fmt"
	"io"
	"log/slog"
	"os/exec"
	"sync"

	"wacalls/internal/voip/media"
)

const (
	sipAudioSampleRate = 16000
	// ~20ms de áudio por frame (16000 * 0.02 * 2 bytes/amostra).
	sipAudioReadFrameBytes = 640
)

type sipAudioPump struct {
	sinkMonitor string // "pulse": ex. "wacalls_sip_out.monitor" | "alsa": ex. "hw:Loopback,1,0"
	micSource   string // "pulse": ex. "wacalls_sip_mic"        | "alsa": ex. "hw:Loopback,1,1"
	backend     string // "pulse" ou "alsa"
	log         *slog.Logger

	mu        sync.Mutex
	recCmd    *exec.Cmd
	playCmd   *exec.Cmd
	playIn    io.WriteCloser
	cancel    context.CancelFunc
	OnPeerPCM func([]float32) // chamado com áudio vindo do baresip (parec/arecord)
}

func newSipAudioPump(sinkMonitor, micSource, backend string, log *slog.Logger) *sipAudioPump {
	if backend != "alsa" {
		backend = "pulse"
	}
	return &sipAudioPump{sinkMonitor: sinkMonitor, micSource: micSource, backend: backend, log: log}
}

// Start inicia os dois subprocessos (parec de captura, pacat de playback).
// Idempotente: chamar duas vezes sem Stop() no meio é um no-op.
func (p *sipAudioPump) Start(ctx context.Context) error {
	p.mu.Lock()
	defer p.mu.Unlock()
	if p.recCmd != nil || p.playCmd != nil {
		return nil
	}
	runCtx, cancel := context.WithCancel(ctx)
	p.cancel = cancel

	recBin, recArgs, playBin, playArgs := p.buildCommands()

	// Captura: o que o baresip está tocando (voz de quem ligou) vira PCM que
	// mandamos pro navegador via Bridge.WritePCM.
	recCmd := exec.CommandContext(runCtx, recBin, recArgs...)
	recOut, err := recCmd.StdoutPipe()
	if err != nil {
		cancel()
		return fmt.Errorf("sip audio: %s stdout pipe: %w", recBin, err)
	}
	recCmd.Stderr = nil
	if err := recCmd.Start(); err != nil {
		cancel()
		return fmt.Errorf("sip audio: falha ao iniciar %s (device %q existe? backend=%s): %w", recBin, p.sinkMonitor, p.backend, err)
	}
	p.recCmd = recCmd

	// Playback: PCM vindo do navegador (mic do agente) é injetado no
	// dispositivo que o baresip usa como "microfone" pra mandar pro SIP.
	playCmd := exec.CommandContext(runCtx, playBin, playArgs...)
	playIn, err := playCmd.StdinPipe()
	if err != nil {
		p.stopLocked()
		return fmt.Errorf("sip audio: %s stdin pipe: %w", playBin, err)
	}
	if err := playCmd.Start(); err != nil {
		p.stopLocked()
		return fmt.Errorf("sip audio: falha ao iniciar %s (device %q existe? backend=%s): %w", playBin, p.micSource, p.backend, err)
	}
	p.playCmd = playCmd
	p.playIn = playIn

	go p.readLoop(recOut)

	p.log.Info("sip audio: pump iniciado", "backend", p.backend, "sinkMonitor", p.sinkMonitor, "micSource", p.micSource)
	return nil
}

// buildCommands monta os subprocessos de captura/playback conforme o
// backend escolhido (ver comentário no topo do arquivo). Backend "alsa"
// nunca foi testado contra um baresip/ALSA real neste ambiente de
// desenvolvimento (sem esses binários disponíveis pra testar) — se o áudio
// não fluir com ele, comece checando se `arecord`/`aplay -D <device>` abrem
// o dispositivo sem erro direto no terminal do servidor.
func (p *sipAudioPump) buildCommands() (recBin string, recArgs []string, playBin string, playArgs []string) {
	rate := sipItoa(sipAudioSampleRate)
	if p.backend == "alsa" {
		return "arecord",
			[]string{"-D", p.sinkMonitor, "-f", "S16_LE", "-r", rate, "-c", "1", "-t", "raw"},
			"aplay",
			[]string{"-D", p.micSource, "-f", "S16_LE", "-r", rate, "-c", "1", "-t", "raw"}
	}
	return "parec",
		[]string{"--device=" + p.sinkMonitor, "--format=s16le", "--rate=" + rate, "--channels=1", "--raw"},
		"pacat",
		[]string{"--device=" + p.micSource, "--format=s16le", "--rate=" + rate, "--channels=1", "--raw", "--playback"}
}

func (p *sipAudioPump) readLoop(r io.Reader) {
	buf := bufio.NewReaderSize(r, 4096)
	frame := make([]byte, sipAudioReadFrameBytes)
	for {
		n, err := io.ReadFull(buf, frame)
		if n > 0 {
			pcm := media.PCMInt16LEToFloat32(frame[:n-(n%2)])
			if cb := p.OnPeerPCM; cb != nil && len(pcm) > 0 {
				cb(pcm)
			}
		}
		if err != nil {
			if err != io.EOF && err != io.ErrUnexpectedEOF {
				p.log.Debug("sip audio: parec encerrou", "err", err)
			}
			return
		}
	}
}

// WriteBrowserPCM envia áudio capturado do navegador (mic do agente) pro
// baresip, através do source virtual (pacat). No-op se o pump não estiver
// rodando (chamada fora de uma ligação ativa).
func (p *sipAudioPump) WriteBrowserPCM(pcm []float32) {
	p.mu.Lock()
	w := p.playIn
	p.mu.Unlock()
	if w == nil || len(pcm) == 0 {
		return
	}
	_, _ = w.Write(media.PCMFloat32ToInt16LE(pcm))
}

func (p *sipAudioPump) Stop() {
	p.mu.Lock()
	defer p.mu.Unlock()
	p.stopLocked()
}

func (p *sipAudioPump) stopLocked() {
	if p.cancel != nil {
		p.cancel()
		p.cancel = nil
	}
	if p.playIn != nil {
		_ = p.playIn.Close()
		p.playIn = nil
	}
	p.recCmd = nil
	p.playCmd = nil
}

// sipItoa (não "itoa" — já existe uma função itoa(int64) em session.go;
// nome duplicado nesse mesmo pacote quebrava o build inteiro do
// wacalls-chat com "itoa redeclared in this block").
func sipItoa(n int) string {
	return fmt.Sprintf("%d", n)
}
