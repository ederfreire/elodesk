package main

import (
	"context"
	"log/slog"
	"os"
	"path/filepath"
	"strconv"
	"strings"
	"time"
)

// ---------------------------------------------------------------------------
// Manutenção periódica (retenção de dados + limpeza de mídia + VACUUM)
//
// Sem isso o SQLite cresce indefinidamente (nenhuma das 30+ tabelas tinha
// política de expurgo) e a pasta media/in acumula tudo que já foi recebido —
// foi exatamente o que encheu 89 GB de disco em produção. Este arquivo roda
// um único goroutine no processo, com defaults conservadores e tudo
// configurável por env:
//
//	WACALLS_RETENTION_DAYS          (default 180) call_records / flow_runs
//	WACALLS_AUDIT_RETENTION_DAYS    (default 90)  role_audit_log / chat_events
//	WACALLS_MESSAGE_RETENTION_DAYS  (default 0 = nunca apaga mensagens)
//	WACALLS_MEDIA_RETENTION_DAYS    (default 7)   media/in e media/out
//	WACALLS_MAINTENANCE_INTERVAL_H  (default 6)   intervalo entre passadas
//	WACALLS_VACUUM=0                desliga o VACUUM semanal
// ---------------------------------------------------------------------------

type maintenanceConfig struct {
	Retention     time.Duration
	Audit         time.Duration
	Messages      time.Duration
	Media         time.Duration
	Interval      time.Duration
	Vacuum        bool
	MediaDirs     []string
	SQLite        bool
	LastVacuumDay int
}

func envDays(name string, def int) time.Duration {
	raw := strings.TrimSpace(os.Getenv(name))
	if raw == "" {
		return time.Duration(def) * 24 * time.Hour
	}
	n, err := strconv.Atoi(raw)
	if err != nil || n < 0 {
		return time.Duration(def) * 24 * time.Hour
	}
	return time.Duration(n) * 24 * time.Hour
}

func maintenanceFromEnv() maintenanceConfig {
	interval := 6 * time.Hour
	if raw := strings.TrimSpace(os.Getenv("WACALLS_MAINTENANCE_INTERVAL_H")); raw != "" {
		if n, err := strconv.Atoi(raw); err == nil && n > 0 {
			interval = time.Duration(n) * time.Hour
		}
	}
	driver := strings.ToLower(strings.TrimSpace(os.Getenv("DB_DRIVER")))
	return maintenanceConfig{
		Retention: envDays("WACALLS_RETENTION_DAYS", 180),
		Audit:     envDays("WACALLS_AUDIT_RETENTION_DAYS", 90),
		Messages:  envDays("WACALLS_MESSAGE_RETENTION_DAYS", 0),
		Media:     envDays("WACALLS_MEDIA_RETENTION_DAYS", 7),
		Interval:  interval,
		Vacuum:    strings.TrimSpace(os.Getenv("WACALLS_VACUUM")) != "0",
		MediaDirs: []string{filepath.Join("media", "in"), filepath.Join("media", "out")},
		SQLite:    driver == "" || driver == "sqlite" || driver == "sqlite3",
	}
}

// startMaintenance dispara o loop de manutenção. Roda uma passada logo no
// boot (com um atraso curto para não competir com o restore das sessões) e
// depois a cada Interval.
func (s *server) startMaintenance(ctx context.Context) {
	cfg := maintenanceFromEnv()
	log := s.log.With("component", "maintenance")
	log.Info("retention policy",
		"records_days", int(cfg.Retention.Hours()/24),
		"audit_days", int(cfg.Audit.Hours()/24),
		"messages_days", int(cfg.Messages.Hours()/24),
		"media_days", int(cfg.Media.Hours()/24),
		"interval_h", int(cfg.Interval.Hours()))

	go func() {
		select {
		case <-ctx.Done():
			return
		case <-time.After(2 * time.Minute):
		}
		ticker := time.NewTicker(cfg.Interval)
		defer ticker.Stop()
		for {
			s.runMaintenance(ctx, &cfg, log)
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
			}
		}
	}()
}

func (s *server) runMaintenance(ctx context.Context, cfg *maintenanceConfig, log *slog.Logger) {
	start := time.Now()
	rows := s.pruneDatabase(ctx, cfg, log)
	files, bytes := s.pruneMedia(cfg, log)

	if cfg.SQLite {
		// WAL cresce sozinho entre checkpoints; TRUNCATE devolve o espaço.
		if _, err := s.db.ExecContext(ctx, `PRAGMA wal_checkpoint(TRUNCATE)`); err != nil {
			log.Warn("wal checkpoint failed", "err", err)
		}
		day := int(time.Now().Unix() / 86400)
		if cfg.Vacuum && rows > 0 && day-cfg.LastVacuumDay >= 7 {
			// VACUUM trava o banco; por isso só roda quando algo foi
			// realmente apagado e no máximo uma vez por semana.
			if _, err := s.db.ExecContext(ctx, `VACUUM`); err != nil {
				log.Warn("vacuum failed", "err", err)
			} else {
				cfg.LastVacuumDay = day
				log.Info("vacuum done")
			}
		}
	}

	log.Info("maintenance pass finished",
		"rows_deleted", rows, "media_files_deleted", files,
		"media_bytes_freed", bytes, "took_ms", time.Since(start).Milliseconds())
}

// pruneDatabase apaga registros vencidos. Cada entrada precisa declarar se a
// coluna está em segundos ou milissegundos — o schema usa as duas convenções.
func (s *server) pruneDatabase(ctx context.Context, cfg *maintenanceConfig, log *slog.Logger) int64 {
	now := time.Now()
	nowS := now.Unix()

	type rule struct {
		sql    string
		arg    any
		enable bool
	}

	cut := func(d time.Duration, millis bool) int64 {
		t := now.Add(-d)
		if millis {
			return t.UnixMilli()
		}
		return t.Unix()
	}

	rules := []rule{
		// Tokens e códigos já vencidos não têm nenhuma utilidade.
		{`DELETE FROM auth_tokens WHERE expires_at < ?`, nowS, true},
		{`DELETE FROM password_resets WHERE expires_at < ?`, nowS - 86400, true},
		{`DELETE FROM email_verifications WHERE expires_at < ?`, nowS - 86400, true},

		// Histórico operacional.
		{`DELETE FROM call_records WHERE started_at < ?`, cut(cfg.Retention, true), cfg.Retention > 0},
		{`DELETE FROM flow_runs WHERE started_at < ?`, cut(cfg.Retention, false), cfg.Retention > 0},
		{`DELETE FROM free_tier_notifications WHERE created_at < ?`, cut(cfg.Retention, false), cfg.Retention > 0},

		// Auditoria e eventos de chat (volume alto, valor curto).
		{`DELETE FROM role_audit_log WHERE created_at < ?`, cut(cfg.Audit, false), cfg.Audit > 0},
		{`DELETE FROM chat_events WHERE ts < ?`, cut(cfg.Audit, true), cfg.Audit > 0},

		// Mensagens: desligado por padrão (0 = guarda para sempre).
		{`DELETE FROM messages WHERE ts < ?`, cut(cfg.Messages, true), cfg.Messages > 0},
	}

	var total int64
	for _, r := range rules {
		if !r.enable {
			continue
		}
		res, err := s.db.ExecContext(ctx, r.sql, r.arg)
		if err != nil {
			log.Warn("retention query failed", "sql", r.sql, "err", err)
			continue
		}
		if n, err := res.RowsAffected(); err == nil {
			total += n
		}
	}

	// flow_run_events não tem timestamp confiável em segundos; expurgamos os
	// órfãos deixados pelo DELETE de flow_runs acima.
	if res, err := s.db.ExecContext(ctx,
		`DELETE FROM flow_run_events WHERE run_id NOT IN (SELECT id FROM flow_runs)`); err == nil {
		if n, err := res.RowsAffected(); err == nil {
			total += n
		}
	} else {
		log.Warn("retention query failed", "sql", "flow_run_events orphans", "err", err)
	}

	return total
}

// pruneMedia remove arquivos de media/in e media/out mais antigos que a
// janela configurada. A deleção reativa (após o backend Node consumir o
// arquivo) continua existindo; isto é a rede de segurança para tudo que
// nunca foi consumido.
func (s *server) pruneMedia(cfg *maintenanceConfig, log *slog.Logger) (int, int64) {
	if cfg.Media <= 0 {
		return 0, 0
	}
	cutoff := time.Now().Add(-cfg.Media)
	files := 0
	var freed int64
	for _, dir := range cfg.MediaDirs {
		entries, err := os.ReadDir(dir)
		if err != nil {
			continue
		}
		for _, e := range entries {
			if e.IsDir() {
				continue
			}
			info, err := e.Info()
			if err != nil || info.ModTime().After(cutoff) {
				continue
			}
			path := filepath.Join(dir, e.Name())
			size := info.Size()
			if err := os.Remove(path); err != nil {
				log.Warn("media cleanup failed", "path", path, "err", err)
				continue
			}
			files++
			freed += size
		}
	}
	return files, freed
}

// mediaUsage devolve arquivos/bytes acumulados nas pastas de mídia (usado
// pelo endpoint /api/stats).
func mediaUsage() (int, int64) {
	files := 0
	var total int64
	for _, dir := range []string{filepath.Join("media", "in"), filepath.Join("media", "out")} {
		entries, err := os.ReadDir(dir)
		if err != nil {
			continue
		}
		for _, e := range entries {
			if e.IsDir() {
				continue
			}
			if info, err := e.Info(); err == nil {
				files++
				total += info.Size()
			}
		}
	}
	return files, total
}
