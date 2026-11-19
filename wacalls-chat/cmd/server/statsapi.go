package main

import (
	"context"
	"net/http"
	"runtime"
	"time"
)

// processStart é usado para reportar uptime no /api/healthz e /api/stats.
var processStart = time.Now()

// registerStatsRoutes publica dois endpoints de observabilidade:
//
//	GET /api/healthz — público e barato (usado por monitoramento/systemd).
//	GET /api/stats   — autenticado, com números de sessões, chamadas,
//	                   assinantes SSE, memória e uso de disco em media/.
//
// Antes não existia nenhum health-check global: só dava para saber se o
// serviço estava vivo tentando uma rota autenticada.
func (s *server) registerStatsRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/healthz", s.handleHealthz)
	mux.HandleFunc("GET /api/stats", s.requireAuth(s.handleStats))
}

type healthzResponse struct {
	Status   string `json:"status"`
	Uptime   int64  `json:"uptimeSeconds"`
	DB       string `json:"db"`
	Sessions int    `json:"sessions"`
	Now      int64  `json:"now"`
}

func (s *server) handleHealthz(w http.ResponseWriter, r *http.Request) {
	out := healthzResponse{
		Status:   "ok",
		Uptime:   int64(time.Since(processStart).Seconds()),
		DB:       "ok",
		Sessions: len(s.sessions.infos()),
		Now:      time.Now().UnixMilli(),
	}
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	if err := s.db.PingContext(ctx); err != nil {
		out.Status = "degraded"
		out.DB = "error"
		writeJSON(w, http.StatusServiceUnavailable, out)
		return
	}
	writeJSON(w, http.StatusOK, out)
}

type statsResponse struct {
	Uptime          int64 `json:"uptimeSeconds"`
	Goroutines      int   `json:"goroutines"`
	HeapMB          int64 `json:"heapMB"`
	SysMB           int64 `json:"sysMB"`
	Sessions        int   `json:"sessions"`
	SessionsOnline  int   `json:"sessionsOnline"`
	SessionsPaired  int   `json:"sessionsPaired"`
	ActiveCalls     int   `json:"activeCalls"`
	SSESubscribers  int   `json:"sseSubscribers"`
	SSEDropped      int64 `json:"sseDroppedEvents"`
	SSEHidden       int64 `json:"sseHiddenEvents"`
	MediaFiles      int   `json:"mediaFiles"`
	MediaBytes      int64 `json:"mediaBytes"`
	DBOpenConns     int   `json:"dbOpenConnections"`
	DBWaitCount     int64 `json:"dbWaitCount"`
	ReconnectsTotal int64 `json:"reconnectsTotal"`

	// ── Contenção no banco ────────────────────────────────────────────────
	//
	// O pool do SQLite fica em 1 conexão por padrão (ver internal/storage),
	// o que serializa TODAS as goroutines do processo. Estes campos existem
	// para provar — ou descartar — que isso é gargalo antes de alguém mexer
	// no tamanho do pool.
	//
	// Como ler:
	//   dbWaitCount        quantas vezes alguém teve de ESPERAR por conexão
	//   dbWaitDurationMs   tempo TOTAL acumulado de espera desde o boot
	//
	// Se depois de algumas horas de uso normal o dbWaitDurationMs estiver na
	// casa de dezenas de segundos ou mais, a contenção está provada e vale
	// subir WACALLS_DB_MAX_CONNS para 4–8. Se estiver perto de zero, o
	// gargalo é outro e mexer no pool só traria risco de SQLITE_BUSY.
	DBMaxOpenConns  int   `json:"dbMaxOpenConnections"`
	DBInUse         int   `json:"dbInUse"`
	DBIdle          int   `json:"dbIdle"`
	DBWaitDurationM int64 `json:"dbWaitDurationMs"`
}

func (s *server) handleStats(w http.ResponseWriter, r *http.Request) {
	var mem runtime.MemStats
	runtime.ReadMemStats(&mem)

	infos := s.sessions.infos()
	online, paired := 0, 0
	for _, i := range infos {
		if i.Paired {
			paired++
		}
		if i.State == "open" || i.State == "connected" {
			online++
		}
	}
	files, bytes := mediaUsage()
	dbStats := s.db.Stats()

	writeJSON(w, http.StatusOK, statsResponse{
		Uptime:          int64(time.Since(processStart).Seconds()),
		Goroutines:      runtime.NumGoroutine(),
		HeapMB:          int64(mem.HeapAlloc / (1024 * 1024)),
		SysMB:           int64(mem.Sys / (1024 * 1024)),
		Sessions:        len(infos),
		SessionsOnline:  online,
		SessionsPaired:  paired,
		ActiveCalls:     s.broker.activeCallCount(),
		SSESubscribers:  s.broker.subscriberCount(),
		SSEDropped:      s.broker.droppedCount(),
		SSEHidden:       s.broker.hiddenCount(),
		MediaFiles:      files,
		MediaBytes:      bytes,
		DBOpenConns:     dbStats.OpenConnections,
		DBWaitCount:     dbStats.WaitCount,
		ReconnectsTotal: s.sessions.reconnectCount(),
		DBMaxOpenConns:  dbStats.MaxOpenConnections,
		DBInUse:         dbStats.InUse,
		DBIdle:          dbStats.Idle,
		DBWaitDurationM: dbStats.WaitDuration.Milliseconds(),
	})
}
