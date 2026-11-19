package main

import (
	"log/slog"
	"os"
	"strconv"
	"strings"
	"sync"

	"github.com/pion/webrtc/v4"
)

// ---------------------------------------------------------------------------
// Portas do áudio entre o NAVEGADOR e o WhatsApp Plus (bridge WebRTC).
//
// O navegador fala com este serviço por WebRTC. Sem configuração, o pion
// escolhe portas UDP ALEATÓRIAS no servidor — e com o firewall (ufw) ligado
// pelo instalador ("deny incoming"), o navegador não alcança essas portas:
// a ligação é atendida, mas fica MUDA nos dois sentidos (o ICE nunca
// conecta). A API Oficial não sofre disso porque o áudio dela vai direto do
// navegador para a Meta.
//
// Agora o bridge usa SEMPRE uma faixa fixa, que o instalador libera:
//   WACALLS_RTC_PORTA_MIN=50000  WACALLS_RTC_PORTA_MAX=50999  (padrão)
// Servidor atrás de NAT (IP público diferente do IP da placa de rede):
//   WACALLS_IP_PUBLICO=203.0.113.10
// Servidor STUN (o servidor descobre o próprio IP público sozinho, útil
// atrás de NAT — mesma ideia do ArendCalls):
//   WACALLS_STUN=stun:stun.l.google.com:19302   (padrão)
//   WACALLS_STUN=off                             (desliga)
// ---------------------------------------------------------------------------

func portaDoEnv(nome string, padrao int) int {
	if v, err := strconv.Atoi(strings.TrimSpace(os.Getenv(nome))); err == nil && v > 0 && v < 65536 {
		return v
	}
	return padrao
}

var bridgeAPI = sync.OnceValue(func() *webrtc.API {
	se := webrtc.SettingEngine{}
	min := portaDoEnv("WACALLS_RTC_PORTA_MIN", 50000)
	max := portaDoEnv("WACALLS_RTC_PORTA_MAX", 50999)
	if max < min {
		min, max = 50000, 50999
	}
	if err := se.SetEphemeralUDPPortRange(uint16(min), uint16(max)); err != nil {
		slog.Warn("bridge WebRTC: faixa de portas inválida, usando portas aleatórias", "min", min, "max", max, "err", err)
	} else {
		slog.Info("bridge WebRTC: áudio do navegador nas portas UDP", "min", min, "max", max)
	}
	if ip := strings.TrimSpace(os.Getenv("WACALLS_IP_PUBLICO")); ip != "" {
		//nolint:staticcheck // SetNAT1To1IPs segue funcionando no pion v4.
		se.SetNAT1To1IPs([]string{ip}, webrtc.ICECandidateTypeHost)
		slog.Info("bridge WebRTC: anunciando o IP público", "ip", ip)
	}
	return webrtc.NewAPI(webrtc.WithSettingEngine(se))
})

func bridgeICEServers() []webrtc.ICEServer {
	v := strings.TrimSpace(os.Getenv("WACALLS_STUN"))
	if strings.EqualFold(v, "off") || v == "0" {
		return nil
	}
	if v == "" {
		v = "stun:stun.l.google.com:19302"
	}
	urls := []string{}
	for _, u := range strings.Split(v, ",") {
		if u = strings.TrimSpace(u); u != "" {
			urls = append(urls, u)
		}
	}
	if len(urls) == 0 {
		return nil
	}
	return []webrtc.ICEServer{{URLs: urls}}
}
