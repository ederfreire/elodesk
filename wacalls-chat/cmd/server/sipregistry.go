package main

// SipRegistry gerencia UMA troncal SIP (processo baresip próprio, socket
// ctrl_tcp próprio, par de dispositivos de áudio próprio) POR EMPRESA — isso
// substitui o antigo campo único `server.sip *SipCallManager`, que era uma
// troncal só pro servidor inteiro (uma config, um arquivo accounts, um
// processo baresip). Duas empresas habilitando SIP no mesmo servidor
// causava dois bugs com esse design antigo: a config de uma sobrescrevia a
// config da outra (era o MESMO KV settings_kv["sip_trunk"] e o MESMO
// arquivo accounts), e os eventos de chamada eram mandados pra TODAS as
// empresas ao mesmo tempo — vazamento relatado: "empresa B liga e eu, da
// empresa A, vejo a ligação dela".
//
// Cada empresa que salva uma troncal SIP habilitada ganha:
//   - config dir própria:      {baseDir}/company-{id}/  (arquivos config + accounts)
//   - porta ctrl_tcp própria:  ctrlBasePort + companyId
//   - porta SIP própria:       sipBasePort + companyId  (onde ESSA instância do
//     baresip registra/recebe sinalização — se o provedor da troncal dessa
//     empresa exigir apontar pra uma porta fixa em vez de registration-based,
//     é essa porta que deve ser informada a ele)
//   - par de dispositivos de áudio próprio: PulseAudio virtual (backend
//     "pulse", sem limite prático de pares) ou subdispositivo ALSA Loopback
//     dedicado (backend "alsa" — ver aviso de limite abaixo)
//   - processo baresip próprio, filho do wacalls-chat (spawnado via
//     os/exec direto, não depende de gerenciar N serviços systemd)
//
// Ver sipapi.go pros endpoints HTTP (agora com {companyId} no caminho) e
// server.go pra como isso é inicializado/restaurado no boot.
//
// AVISO (backend "alsa"): o ALSA Loopback (snd-aloop) expõe um número FIXO
// e pequeno de pares de subdispositivo por placa virtual (8 por padrão,
// configurável via "options snd-aloop pcm_substreams=N" no carregamento do
// módulo) — cada empresa isolada consome um par a mais. Com o backend
// "alsa" (só é escolhido pelo instalador quando não há PulseAudio de sessão
// disponível), mais de 8 empresas com SIP habilitado ao mesmo tempo vão
// colidir em pares de subdispositivo compartilhados (áudio cruzado entre
// elas é possível nesse cenário) — logamos um aviso quando isso acontece.
// O backend "pulse" (default) não tem esse limite. Nenhum dos dois backends
// foi testado ao vivo contra um baresip real neste ambiente (mesmo aviso já
// feito no restante do código SIP).
import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"os/exec"
	"path/filepath"
	"strconv"
	"strings"
	"sync"
	"time"
)

const sipSettingsKVPrefix = "sip_trunk:"

// legacySipSettingsKV era a ÚNICA chave usada antes da troncal-por-empresa
// (ver comentário grande no topo do arquivo) — instalações atualizadas a
// partir de uma versão anterior têm a config SIP antiga presa nessa chave
// global, órfã depois da migração pra "sip_trunk:<companyId>".
//
// ATENÇÃO — histórico: uma versão anterior deste arquivo migrava essa chave
// automaticamente pra QUALQUER empresa que fizesse a primeira leitura de
// GET /api/sip/{companyId}/settings (ver migrateLegacyConfig, abaixo, hoje
// não é mais chamada a partir de LoadConfig). Isso quebrava servidores
// multi-empresa: bastava um admin de uma empresa que NUNCA usou SIP abrir a
// tela de Configurações uma vez (só olhar, sem configurar nada) pra ela
// "roubar" a troncal de outra empresa que já usava de verdade — GET nunca
// deveria ter efeito colateral nenhum (viola a semântica básica de HTTP: uma
// leitura tem que ser inofensiva), e como a chave antiga era limpa
// imediatamente após a primeira leitura vitoriosa, não sobrava nem rastro
// pra saber que empresa era a dona original. Se isso já aconteceu no seu
// servidor, a config antiga provavelmente já foi "roubada" por alguma
// empresa antes desta correção — vale checar a tela de Troncal SIP de todas
// as empresas cadastradas: se alguma tiver host/usuário preenchidos sem
// nunca ter configurado SIP, é ela. Do contrário, é só reconfigurar a
// troncal da empresa certa uma vez (Configurações → Troncal SIP → preencher
// e Salvar) — depois de salva pela empresa certa, a config fica na chave
// por-empresa e este problema não volta a acontecer pra ela.
const legacySipSettingsKV = "sip_trunk"

func sipSettingsKVKeyFor(companyID string) string {
	return sipSettingsKVPrefix + companyID
}

type sipTrunk struct {
	companyID string
	configDir string
	ctrlAddr  string
	ctrlPort  int
	sipPort   int
	sinkName  string // pulse: sink null "alto-falante" do baresip dessa empresa
	micName   string // pulse: source exposto como "microfone" dessa empresa
	alsaSubA  int    // alsa: subdispositivo pra direção "baresip toca -> nós capturamos"
	alsaSubB  int    // alsa: subdispositivo pra direção "nós tocamos -> baresip captura"

	ctl   *baresipCtl
	audio *sipAudioPump
	mgr   *SipCallManager
	log   *slog.Logger

	mu      sync.Mutex
	cmd     *exec.Cmd
	closing bool
}

// SipRegistry mantém o mapa companyId -> *sipTrunk e sabe criar/restaurar
// troncais sob demanda.
type SipRegistry struct {
	log      *slog.Logger
	settings *settingsStore

	baseDir      string
	binPath      string
	modDir       string
	audioBackend string
	ctrlBasePort int
	sipBasePort  int

	// OnEvent é chamado com o companyId de origem toda vez que uma sipTrunk
	// dispara OnIncoming/OnStateChange/OnEnded — quem liga isso é server.go,
	// responsável por repassar pro broker.broadcast com o companyId embutido
	// no payload (é o que permite o lado Node parar de fazer broadcast pra
	// TODAS as empresas — ver WacallsChatCallService.ts).
	OnEvent func(companyID string, kind string, info SipCallInfo)

	mu           sync.Mutex
	trunks       map[string]*sipTrunk
	alsaNextPair int // ver alsaPairFor: próximo par de subdispositivo snd-aloop a atribuir
}

func newSipRegistry(log *slog.Logger, settings *settingsStore) *SipRegistry {
	baseDir := strings.TrimSpace(os.Getenv("SIP_TRUNKS_DIR"))
	if baseDir == "" {
		baseDir = "/home/deploy/.baresip-trunks"
	}
	binPath := strings.TrimSpace(os.Getenv("BARESIP_BIN"))
	if binPath == "" {
		binPath = "/usr/bin/baresip"
	}
	modDir := strings.TrimSpace(os.Getenv("BARESIP_MOD_DIR"))
	audioBackend := strings.TrimSpace(os.Getenv("SIP_AUDIO_BACKEND"))
	if audioBackend != "alsa" {
		audioBackend = "pulse"
	}
	ctrlBasePort := 44000
	if v := strings.TrimSpace(os.Getenv("SIP_CTRL_BASE_PORT")); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			ctrlBasePort = n
		}
	}
	sipBasePort := 48000
	if v := strings.TrimSpace(os.Getenv("SIP_LISTEN_BASE_PORT")); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			sipBasePort = n
		}
	}
	return &SipRegistry{
		log: log, settings: settings, baseDir: baseDir, binPath: binPath,
		modDir: modDir, audioBackend: audioBackend,
		ctrlBasePort: ctrlBasePort, sipBasePort: sipBasePort,
		trunks: map[string]*sipTrunk{},
	}
}

// Get devolve a troncal já viva dessa empresa, ou nil se ela nunca foi
// iniciada nesse processo (empresa nunca habilitou SIP, ou o servidor acabou
// de subir e ainda não chegou a chamada de RestoreAll/EnsureStarted).
func (r *SipRegistry) Get(companyID string) *sipTrunk {
	r.mu.Lock()
	defer r.mu.Unlock()
	return r.trunks[companyID]
}

// companyPort deriva, de forma determinística, as portas ctrl_tcp/SIP dessa
// empresa — sem precisar persistir alocação nenhuma (dado o mesmo
// companyId, sempre calcula as mesmas portas, inclusive depois de reiniciar
// o wacalls-chat).
func (r *SipRegistry) companyPorts(companyID string) (ctrlPort, sipPort int) {
	n := 0
	if v, err := strconv.Atoi(companyID); err == nil {
		n = v
	} else {
		// companyId não numérico (não deveria acontecer — Node sempre manda
		// o Whatsapp.companyId, que é um inteiro) — cai pra um hash simples
		// só pra nunca colidir sempre na mesma porta base.
		for _, c := range companyID {
			n = n*31 + int(c)
		}
		if n < 0 {
			n = -n
		}
	}
	return r.ctrlBasePort + n, r.sipBasePort + n
}

// EnsureStarted cria (se ainda não existir) e garante que o processo baresip
// dessa empresa está rodando. Idempotente — chamar de novo com a troncal já
// viva é um no-op rápido. NÃO aplica config de conta nenhuma (isso é
// SetConfig/writeAccounts, chamados separadamente por sipapi.go) — só garante
// que existe um baresip de pé pronto pra receber a conta.
func (r *SipRegistry) EnsureStarted(ctx context.Context, companyID string) (*sipTrunk, error) {
	r.mu.Lock()
	if t, ok := r.trunks[companyID]; ok {
		r.mu.Unlock()
		return t, nil
	}
	r.mu.Unlock()

	ctrlPort, sipPort := r.companyPorts(companyID)
	configDir := filepath.Join(r.baseDir, "company-"+companyID)
	if err := os.MkdirAll(configDir, 0o755); err != nil {
		return nil, fmt.Errorf("sip: mkdir config dir: %w", err)
	}

	sinkName := "wacalls_sip_out_c" + companyID
	micName := "wacalls_sip_mic_c" + companyID

	trunkLog := r.log.With("component", "sip", "companyId", companyID)

	var alsaSubA, alsaSubB int
	sinkMonitor, micSource := sinkName+".monitor", micName

	if r.audioBackend == "pulse" {
		// No boot (RestoreAll), o wacalls-chat pode ganhar a corrida contra a
		// sessão PulseAudio de usuário (serviços systemd system/user não têm
		// ordem garantida entre si — mesmo problema que o instalador já
		// documentava pro antigo baresip.service único, resolvido lá com um
		// ExecStartPre de espera). Sem esperar aqui, os pactl abaixo falhavam
		// sempre que o wacalls-chat subia mais rápido que o pulseaudio de
		// sessão do usuário 'deploy'.
		waitForPulseSocket(10 * time.Second)
		if err := ensurePulseDevicesRetry(sinkName, micName, trunkLog); err != nil {
			// Não é fatal: loga e segue — o baresip dessa empresa vai subir
			// sem áudio funcional até o problema no PulseAudio ser corrigido,
			// mas discagem/registro/eventos continuam isolados normalmente.
			trunkLog.Warn("sip: falha ao criar dispositivos PulseAudio dedicados — áudio dessa troncal pode não funcionar", "err", err)
		}
	} else {
		// ALSA Loopback: cada empresa consome UM PAR de subdispositivos
		// (0..7 disponíveis por padrão), não um só — ver comentário no topo
		// do arquivo. Atribuição sequencial (0,2,4,6,...), só reciclando com
		// aviso depois da 4ª empresa simultânea.
		r.mu.Lock()
		alsaSubA = r.alsaNextPair % 8
		alsaSubB = (r.alsaNextPair + 1) % 8
		r.alsaNextPair += 2
		pairIndex := r.alsaNextPair / 2
		r.mu.Unlock()
		if pairIndex > 4 {
			trunkLog.Warn("sip: mais de 4 empresas com SIP habilitado usando backend ALSA — pares de subdispositivo snd-aloop reciclados, risco de áudio cruzado entre empresas", "alsaSubA", alsaSubA, "alsaSubB", alsaSubB)
		}
		// Convenção herdada do design original de instância única (ver
		// sipaudio.go): baresip usa o device "0"; nós usamos o device "1"
		// (snd-aloop espelha playback de um device pro capture do outro, na
		// mesma subdevice). subA = direção "baresip toca -> nós capturamos";
		// subB = direção "nós tocamos -> baresip captura".
		sinkMonitor = fmt.Sprintf("hw:Loopback,1,%d", alsaSubA)
		micSource = fmt.Sprintf("hw:Loopback,1,%d", alsaSubB)
	}

	ctrlAddr := fmt.Sprintf("127.0.0.1:%d", ctrlPort)
	ctl := newBaresipCtl(ctrlAddr, trunkLog)
	audio := newSipAudioPump(sinkMonitor, micSource, r.audioBackend, trunkLog)
	mgr := newSipCallManager(ctl, audio, trunkLog)

	t := &sipTrunk{
		companyID: companyID, configDir: configDir, ctrlAddr: ctrlAddr,
		ctrlPort: ctrlPort, sipPort: sipPort, sinkName: sinkName, micName: micName,
		alsaSubA: alsaSubA, alsaSubB: alsaSubB, ctl: ctl, audio: audio, mgr: mgr, log: trunkLog,
	}

	mgr.OnIncoming = func(info SipCallInfo) { r.emit(companyID, "incoming", info) }
	mgr.OnStateChange = func(info SipCallInfo) { r.emit(companyID, "state", info) }
	mgr.OnEnded = func(info SipCallInfo) { r.emit(companyID, "ended", info) }

	if err := t.writeBaseConfig(r.binPath, r.modDir, r.audioBackend); err != nil {
		return nil, fmt.Errorf("sip: gerar config do baresip: %w", err)
	}

	r.mu.Lock()
	// Corrida: outra goroutine pode ter criado enquanto montávamos acima —
	// usa a que já existir em vez de duplicar processo.
	if existing, ok := r.trunks[companyID]; ok {
		r.mu.Unlock()
		return existing, nil
	}
	r.trunks[companyID] = t
	r.mu.Unlock()

	t.spawnSupervised(r.binPath, r.audioBackend, trunkLog)
	go ctl.Run(context.Background())

	return t, nil
}

func (r *SipRegistry) emit(companyID, kind string, info SipCallInfo) {
	if cb := r.OnEvent; cb != nil {
		cb(companyID, kind, info)
	}
}

// SaveConfig persiste a config no KV (chave por empresa) e, se a troncal já
// estiver viva (ou acabou de ser criada por EnsureStarted antes de chamar
// isso), regrava o accounts.conf e pede reload.
func (r *SipRegistry) SaveConfig(ctx context.Context, companyID string, cfg SipTrunkConfig) error {
	raw, err := json.Marshal(cfg)
	if err != nil {
		return err
	}
	if err := r.settings.setKV(ctx, sipSettingsKVKeyFor(companyID), string(raw)); err != nil {
		return err
	}
	t, err := r.EnsureStarted(ctx, companyID)
	if err != nil {
		return err
	}
	t.mgr.SetConfig(cfg)
	if err := t.writeAccounts(cfg); err != nil {
		t.log.Warn("sip: falha ao escrever accounts dessa empresa", "err", err)
	} else {
		go func() {
			c, cancel := context.WithTimeout(context.Background(), 5*time.Second)
			defer cancel()
			if _, err := t.ctl.Send(c, "conf_reload", ""); err != nil {
				t.log.Debug("sip: conf_reload não confirmado (pode exigir restart manual do processo dessa empresa)", "err", err)
			}
		}()
	}
	return nil
}

// LoadConfig lê a config persistida sem precisar ligar a troncal — usado por
// GET /api/sip/{companyId}/settings pra não gastar recursos spawnando
// processo baresip só porque alguém abriu a tela de configuração.
func (r *SipRegistry) LoadConfig(ctx context.Context, companyID string) (SipTrunkConfig, error) {
	raw, err := r.settings.getKV(ctx, sipSettingsKVKeyFor(companyID))
	if err != nil {
		return SipTrunkConfig{}, err
	}
	// NÃO tenta migrar a chave legada antiga (legacySipSettingsKV) aqui —
	// isso é um GET, e um GET nunca pode ter efeito colateral que "consome"
	// um dado global compartilhado (ver comentário grande em
	// legacySipSettingsKV, acima, sobre o bug que isso causava em servidores
	// multi-empresa). Se essa empresa não tem config própria ainda, retorna
	// vazio mesmo — quem precisar recuperar uma config antiga deve
	// reconfigurar a troncal manualmente (Configurações → Troncal SIP).
	if raw == "" {
		return SipTrunkConfig{}, nil
	}
	var cfg SipTrunkConfig
	if err := json.Unmarshal([]byte(raw), &cfg); err != nil {
		return SipTrunkConfig{}, err
	}
	return cfg, nil
}

// warnIfLegacyConfigOrphaned é chamado uma vez no boot (ver RestoreAll) só
// pra logar um aviso — nunca migra nem apaga nada sozinho. Antes, essa
// migração acontecia automaticamente e sem aviso dentro de LoadConfig; foi
// removida de lá por ter efeito colateral num GET (ver comentário grande em
// legacySipSettingsKV). Se essa chave ainda tiver dado, é sinal de uma
// instalação que nunca chegou a ser migrada (ou já foi criada antes da
// versão que corrigiu isso) — precisa de intervenção manual: reconfigurar a
// troncal SIP da empresa certa direto pela tela (Configurações → Troncal
// SIP), que grava na chave por-empresa e não depende mais dessa legada.
func (r *SipRegistry) warnIfLegacyConfigOrphaned(ctx context.Context) {
	legacyRaw, err := r.settings.getKV(ctx, legacySipSettingsKV)
	if err != nil || legacyRaw == "" {
		return
	}
	r.log.Warn("sip: existe uma config SIP antiga (pré-troncal-por-empresa) órfã na chave global — não é migrada automaticamente (evita roubar a config de outra empresa); reconfigure a troncal SIP da empresa correta manualmente pela tela de Configurações")
}

// RestoreAll é chamado uma vez no boot do wacalls-chat: procura toda empresa
// que já tinha uma troncal SIP habilitada (persistida antes de um restart do
// processo) e sobe o baresip dela de novo. Sem isso, depois de qualquer
// reinício do wacalls-chat (deploy, atualização, crash) TODAS as empresas
// ficariam sem SIP até salvar as configurações de novo manualmente.
func (r *SipRegistry) RestoreAll(ctx context.Context) {
	r.warnIfLegacyConfigOrphaned(ctx)
	kv, err := r.settings.listKVByPrefix(ctx, sipSettingsKVPrefix)
	if err != nil {
		r.log.Warn("sip: falha ao listar troncais salvas pra restaurar no boot", "err", err)
		return
	}
	for key, raw := range kv {
		companyID := strings.TrimPrefix(key, sipSettingsKVPrefix)
		if companyID == "" || raw == "" {
			continue
		}
		var cfg SipTrunkConfig
		if err := json.Unmarshal([]byte(raw), &cfg); err != nil {
			r.log.Warn("sip: config salva inválida, pulando restauração", "companyId", companyID, "err", err)
			continue
		}
		if !cfg.Enabled {
			continue
		}
		if err := r.SaveConfig(ctx, companyID, cfg); err != nil {
			r.log.Warn("sip: falha ao restaurar troncal no boot", "companyId", companyID, "err", err)
			continue
		}
		r.log.Info("sip: troncal restaurada no boot", "companyId", companyID)
	}
}

// ---------------- sipTrunk: processo baresip + config ----------------

func (t *sipTrunk) writeBaseConfig(binPath, modDir, audioBackend string) error {
	if _, err := os.Stat(t.configDir + "/accounts"); os.IsNotExist(err) {
		_ = os.WriteFile(t.configDir+"/accounts", []byte("# nenhuma troncal SIP configurada ainda\n"), 0o600)
	}

	var audioBlock string
	if audioBackend == "alsa" {
		// Mesma convenção de EnsureStarted: baresip fica no device "0";
		// subA/subB são os subdispositivos reservados pra essa empresa.
		audioBlock = fmt.Sprintf(`module                  alsa.so
audio_player            alsa,hw:Loopback,0,%d
audio_source            alsa,hw:Loopback,0,%d
audio_alert             alsa,hw:Loopback,0,%d`, t.alsaSubA, t.alsaSubB, t.alsaSubA)
	} else {
		audioBlock = fmt.Sprintf(`module                  pulse.so
audio_player            pulse,%s
audio_source            pulse,%s
audio_alert             pulse,%s`, t.sinkName, t.micName, t.sinkName)
	}

	modulePathLine := ""
	if modDir != "" {
		modulePathLine = "module_path             " + modDir
	}

	cfg := fmt.Sprintf(`# Gerado por sipregistry.go — troncal SIP isolada da empresa %s. Não editar
# manualmente: é regenerado a cada início do wacalls-chat.

poll_method             epoll
sip_listen              0.0.0.0:%d
sip_certificate

%s

ctrl_tcp_listen         127.0.0.1:%d
module                  ctrl_tcp.so

%s

module                  g711.so

module_app              account.so
module_app              contact.so
module_app              menu.so
`, t.companyID, t.sipPort, modulePathLine, t.ctrlPort, audioBlock)

	return os.WriteFile(t.configDir+"/config", []byte(cfg), 0o600)
}

// writeAccounts regrava só o arquivo accounts (a conta de fato) — o resto do
// config (portas, módulos, áudio) já foi escrito uma vez por writeBaseConfig
// e não muda depois.
func (t *sipTrunk) writeAccounts(cfg SipTrunkConfig) error {
	path := t.configDir + "/accounts"
	if !cfg.Enabled || cfg.Host == "" || cfg.Username == "" {
		return os.WriteFile(path, []byte("# troncal SIP desabilitada (ou incompleta) pra essa empresa\n"), 0o600)
	}
	domain := cfg.Domain
	if domain == "" {
		domain = cfg.Host
	}
	transport := cfg.Transport
	if transport == "" {
		transport = "udp"
	}
	outboundHost := cfg.Host
	if cfg.Port > 0 {
		outboundHost = cfg.Host + ":" + strconv.Itoa(cfg.Port)
	}
	line := "<sip:" + cfg.Username + "@" + domain + ">" +
		";auth_user=" + cfg.Username +
		";auth_pass=" + cfg.Password +
		";outbound=\"sip:" + outboundHost + ";transport=" + transport + "\""
	if cfg.CallerID != "" {
		line = "\"" + cfg.CallerID + "\" " + line
	}
	return os.WriteFile(path, []byte(line+"\n"), 0o600)
}

// spawnSupervised inicia o processo baresip dessa empresa e o mantém vivo
// (respawn com backoff se cair/crashar), até Close() ser chamado. Roda em
// background — não bloqueia quem chamou.
func (t *sipTrunk) spawnSupervised(binPath, audioBackend string, log *slog.Logger) {
	go func() {
		backoff := time.Second
		for {
			t.mu.Lock()
			if t.closing {
				t.mu.Unlock()
				return
			}
			if audioBackend == "pulse" {
				// Mesma corrida system/user do comentário em EnsureStarted —
				// vale tanto pro primeiro start quanto pra qualquer respawn
				// depois de um crash (a sessão do usuário pode ter caído
				// junto, se foi um reboot completo do servidor).
				waitForPulseSocket(10 * time.Second)
			}
			cmd := exec.Command(binPath, "-f", t.configDir)
			cmd.Dir = t.configDir
			t.cmd = cmd
			t.mu.Unlock()

			log.Info("sip: iniciando processo baresip dedicado", "bin", binPath, "configDir", t.configDir, "ctrlPort", t.ctrlPort, "sipPort", t.sipPort)
			startErr := cmd.Start()
			if startErr != nil {
				log.Error("sip: falha ao iniciar processo baresip dessa empresa", "err", startErr)
			} else {
				waitErr := cmd.Wait()
				t.mu.Lock()
				closing := t.closing
				t.mu.Unlock()
				if closing {
					return
				}
				log.Warn("sip: processo baresip dessa empresa encerrou, reiniciando", "err", waitErr)
			}

			time.Sleep(backoff)
			if backoff < 30*time.Second {
				backoff *= 2
			}
		}
	}()
}

func (t *sipTrunk) Close() {
	t.mu.Lock()
	t.closing = true
	cmd := t.cmd
	t.mu.Unlock()
	if cmd != nil && cmd.Process != nil {
		_ = cmd.Process.Kill()
	}
	t.audio.Stop()
}

// ---------------- PulseAudio: dispositivos virtuais por empresa ----------------

// waitForPulseSocket espera (até timeout) o socket do PulseAudio de sessão
// do usuário 'deploy' aparecer — mesmo problema de corrida system/user que o
// instalador já documentava pro antigo baresip.service único (serviços
// systemd de sistema e de usuário não têm ordem garantida entre si no boot).
// PULSE_SERVER/XDG_RUNTIME_DIR já chegam no processo via a unit systemd do
// wacalls-chat (ver instalador) — aqui só deriva o caminho do socket a
// partir de XDG_RUNTIME_DIR pra checar se ele já existe.
func waitForPulseSocket(timeout time.Duration) {
	dir := strings.TrimSpace(os.Getenv("XDG_RUNTIME_DIR"))
	if dir == "" {
		return // sem XDG_RUNTIME_DIR não tem como checar — segue sem esperar
	}
	sock := dir + "/pulse/native"
	deadline := time.Now().Add(timeout)
	for time.Now().Before(deadline) {
		if fi, err := os.Stat(sock); err == nil && (fi.Mode()&os.ModeSocket) != 0 {
			return
		}
		time.Sleep(500 * time.Millisecond)
	}
}

// ensurePulseDevicesRetry tenta ensurePulseDevices algumas vezes com um
// pequeno intervalo — cobre falhas transitórias logo após a sessão
// PulseAudio subir (socket existe mas o daemon ainda não terminou de
// inicializar internamente).
func ensurePulseDevicesRetry(sinkName, micName string, log *slog.Logger) error {
	var lastErr error
	for attempt := 1; attempt <= 3; attempt++ {
		if err := ensurePulseDevices(sinkName, micName, log); err == nil {
			return nil
		} else {
			lastErr = err
			if attempt < 3 {
				time.Sleep(2 * time.Second)
			}
		}
	}
	return lastErr
}

// ensurePulseDevices cria (se ainda não existirem) o par sink-null +
// remap-source dedicado dessa empresa via `pactl`, no MESMO padrão que o
// instalador já usava pro par único/global antigo (module-null-sink +
// module-remap-source) — só que agora um par por empresa, carregado sob
// demanda em vez de estático no default.pa. Idempotente: verifica antes de
// carregar de novo (evita acumular módulos duplicados a cada restart do
// wacalls-chat).
func ensurePulseDevices(sinkName, micName string, log *slog.Logger) error {
	if pactlHasSink(sinkName) {
		return nil
	}
	if out, err := exec.Command("pactl", "load-module", "module-null-sink",
		"sink_name="+sinkName, "sink_properties=device.description="+sinkName).CombinedOutput(); err != nil {
		return fmt.Errorf("pactl load-module module-null-sink: %w (%s)", err, strings.TrimSpace(string(out)))
	}
	if out, err := exec.Command("pactl", "load-module", "module-remap-source",
		"master="+sinkName+".monitor", "source_name="+micName,
		"source_properties=device.description="+micName).CombinedOutput(); err != nil {
		return fmt.Errorf("pactl load-module module-remap-source: %w (%s)", err, strings.TrimSpace(string(out)))
	}
	log.Info("sip: dispositivos PulseAudio dedicados criados", "sink", sinkName, "mic", micName)
	return nil
}

func pactlHasSink(sinkName string) bool {
	out, err := exec.Command("pactl", "list", "short", "sinks").Output()
	if err != nil {
		return false
	}
	for _, line := range strings.Split(string(out), "\n") {
		fields := strings.Fields(line)
		if len(fields) >= 2 && fields[1] == sinkName {
			return true
		}
	}
	return false
}
