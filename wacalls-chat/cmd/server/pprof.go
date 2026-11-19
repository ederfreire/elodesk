package main

import (
	"log/slog"
	"net/http"
	"net/http/pprof"
	"os"
	"strings"
	"time"
)

// startPprof sobe o servidor de profiling em um listener separado, apenas
// quando WACALLS_PPROF_ADDR está definido (ex.: "127.0.0.1:6060"). Fica
// desligado por padrão e nunca deve ser exposto publicamente — é a forma de
// diagnosticar vazamento de memória/goroutine em produção sem adivinhação:
//
//	go tool pprof http://127.0.0.1:6060/debug/pprof/heap
//	curl http://127.0.0.1:6060/debug/pprof/goroutine?debug=1
func startPprof(log *slog.Logger) {
	addr := strings.TrimSpace(os.Getenv("WACALLS_PPROF_ADDR"))
	if addr == "" {
		return
	}
	mux := http.NewServeMux()
	mux.HandleFunc("/debug/pprof/", pprof.Index)
	mux.HandleFunc("/debug/pprof/cmdline", pprof.Cmdline)
	mux.HandleFunc("/debug/pprof/profile", pprof.Profile)
	mux.HandleFunc("/debug/pprof/symbol", pprof.Symbol)
	mux.HandleFunc("/debug/pprof/trace", pprof.Trace)

	srv := &http.Server{Addr: addr, Handler: mux, ReadHeaderTimeout: 10 * time.Second}
	go func() {
		log.Warn("pprof enabled — do not expose this port publicly", "addr", addr)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Error("pprof server error", "err", err)
		}
	}()
}
