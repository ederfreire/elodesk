package main

import (
	"sync"

	"wacalls/internal/voip/call"
)

type activeCall struct {
	cm     *call.CallManager
	bridge *Bridge
	// flowAudioSink, when set, receives a copy of every PCM16 peer-audio
	// frame the call decodes. Used by the flow executor to perform STT.
	flowAudioSink func([]float32)

	// fullRecorder, when non-nil, receives every PCM16 peer-audio frame
	// for the duration of the call. Flushed to disk on removeCall and
	// attached to the call record via callStore.SetRecording so it shows
	// up in /history and BI reports.
	fullRecorder *callRecorderBuf

	// Lifecycle metadata used to emit chat timeline events
	// ("Ligação recebida", "Ligação atendida", "Ligação não atendida",
	// "Ligação recusada", "Chamada encerrada").
	peer        string // peer JID (LID or @s.whatsapp.net)
	direction   string // "in" | "out"
	video       bool
	startedAt   int64 // unix ms, set when the call is created
	answeredAt  int64 // unix ms, set when the remote (or we) accept
	endLogged   bool  // ensures a single end-event per call
	answerNoted bool  // ensures a single answered-event per call
	flowStarted bool  // ensures the inbound flow runs at most once per call
	// flowOverride, when non-empty, forces session-level flow-start hooks
	// (CallAccept, OnStateChange Active/Connecting) to use THIS flowID
	// instead of the session's bound s.flowID. Used by the campaign runner
	// (and other outbound dialers) to make sure the campaign's configured
	// URA executes, even when the connection itself has a different —
	// or no — flow bound.
	flowOverride string

	// lastAudioAt (unix ms) is refreshed on every OnPeerAudio frame while
	// the call is active. Used by watchCallSilence (session.go) as a safety
	// net: WhatsApp call signaling (unlike messages) is never queued/
	// replayed, so a dropped connection at the exact moment the remote
	// party hangs up means the CallTerminate stanza can simply never
	// arrive — without this, the call stays "active" on the CRM screen
	// forever even though the real call ended (reported bug: "quando o
	// cliente desliga no celular mostra na tela como ativo ainda").
	lastAudioAt int64
	// silenceWatchStarted ensures watchCallSilence's goroutine is started at
	// most once per call, even if OnStateChange fires CallStateActive more
	// than once for the same callID.
	silenceWatchStarted bool
}

type callRegistry struct {
	mu    sync.Mutex
	calls map[string]*activeCall
}

func newCallRegistry() *callRegistry {
	return &callRegistry{calls: map[string]*activeCall{}}
}

func (r *callRegistry) add(callID string, ac *activeCall) {
	r.mu.Lock()
	defer r.mu.Unlock()
	r.calls[callID] = ac
}

func (r *callRegistry) get(callID string) (*activeCall, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	ac, ok := r.calls[callID]
	return ac, ok
}

func (r *callRegistry) remove(callID string) (*activeCall, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	ac, ok := r.calls[callID]
	if !ok {
		return nil, false
	}
	delete(r.calls, callID)
	return ac, true
}

func (r *callRegistry) count() int {
	r.mu.Lock()
	defer r.mu.Unlock()
	return len(r.calls)
}

func (r *callRegistry) setBridge(callID string, b *Bridge) (*Bridge, bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	ac, ok := r.calls[callID]
	if !ok {
		return nil, false
	}
	oldB := ac.bridge
	ac.bridge = b
	return oldB, true
}

func (r *callRegistry) setFlowAudioSink(callID string, sink func([]float32)) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if ac, ok := r.calls[callID]; ok {
		ac.flowAudioSink = sink
	}
}

// armRecorder attaches a new fullRecorder to the call (no-op if already set).
// Idempotent so it's safe to call from multiple hook points.
func (r *callRegistry) armRecorder(callID string, sampleRate int) {
	r.mu.Lock()
	defer r.mu.Unlock()
	ac, ok := r.calls[callID]
	if !ok || ac.fullRecorder != nil {
		return
	}
	ac.fullRecorder = newCallRecorderBuf(sampleRate)
}

// setLifecycleMeta initialises the peer/direction/video fields on the first
// time we see a call. Subsequent calls are no-ops so the original direction
// is preserved (e.g. an inbound OnIncoming callback fired after the offer
// event).
func (r *callRegistry) setLifecycleMeta(callID, peer, direction string, video bool, startedAt int64) {
	r.mu.Lock()
	defer r.mu.Unlock()
	ac, ok := r.calls[callID]
	if !ok {
		return
	}
	if ac.peer == "" && peer != "" {
		ac.peer = peer
	}
	if ac.direction == "" && direction != "" {
		ac.direction = direction
	}
	if !ac.video && video {
		ac.video = true
	}
	if ac.startedAt == 0 {
		ac.startedAt = startedAt
	}
}

// markAnswered atomically flips the answered flag so the chat timeline
// records the "Ligação atendida" pill exactly once.
func (r *callRegistry) markAnswered(callID string, ts int64) (peer, direction string, first bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	ac, ok := r.calls[callID]
	if !ok || ac.answerNoted {
		return "", "", false
	}
	ac.answerNoted = true
	ac.answeredAt = ts
	return ac.peer, ac.direction, true
}

// markEnded atomically flips the endLogged flag. Returns the snapshot needed
// to emit a chat timeline pill, plus whether this is the first end signal.
func (r *callRegistry) markEnded(callID string) (snap activeCallSnapshot, first bool) {
	r.mu.Lock()
	defer r.mu.Unlock()
	ac, ok := r.calls[callID]
	if !ok || ac.endLogged {
		return activeCallSnapshot{}, false
	}
	ac.endLogged = true
	return activeCallSnapshot{
		peer:       ac.peer,
		direction:  ac.direction,
		video:      ac.video,
		startedAt:  ac.startedAt,
		answeredAt: ac.answeredAt,
	}, true
}

// activeCallSnapshot is the read-only view returned to event emitters so
// they can decide which lifecycle pill to log without holding the registry
// lock.
type activeCallSnapshot struct {
	peer       string
	direction  string
	video      bool
	startedAt  int64
	answeredAt int64
}

func (r *callRegistry) drain() []*activeCall {
	r.mu.Lock()
	defer r.mu.Unlock()
	out := make([]*activeCall, 0, len(r.calls))
	for _, ac := range r.calls {
		out = append(out, ac)
	}
	r.calls = map[string]*activeCall{}
	return out
}

// markFlowStarted returns true the first time it's called for a given
// callID, and false thereafter. Used by session.go to guarantee the inbound
// FlowBuilder execution starts at most once per call even when multiple
// state transitions (Connecting, Active) try to trigger it.
func (r *callRegistry) markFlowStarted(callID string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	ac, ok := r.calls[callID]
	if !ok || ac.flowStarted {
		return false
	}
	ac.flowStarted = true
	return true
}

// setFlowOverride binds a specific flowID to the given callID so that the
// session's flow-start hooks pick it up instead of the connection-wide
// s.flowID. Campaign-dialed calls call this right after startOutgoing.
func (r *callRegistry) setFlowOverride(callID, flowID string) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if ac, ok := r.calls[callID]; ok {
		ac.flowOverride = flowID
	}
}

// flowOverride returns the per-call override (or "" when none).
func (r *callRegistry) flowOverride(callID string) string {
	r.mu.Lock()
	defer r.mu.Unlock()
	if ac, ok := r.calls[callID]; ok {
		return ac.flowOverride
	}
	return ""
}

// touchAudio records that a peer-audio frame was just processed for this
// call — called from OnPeerAudio (session.go) so watchCallSilence can tell
// a genuinely-active call apart from one whose real end never reached us.
func (r *callRegistry) touchAudio(callID string, ts int64) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if ac, ok := r.calls[callID]; ok {
		ac.lastAudioAt = ts
	}
}

// lastAudioAt returns the unix-ms timestamp of the last peer-audio frame
// seen for this call, or 0 if none has arrived yet (or the call is gone).
func (r *callRegistry) lastAudioAt(callID string) int64 {
	r.mu.Lock()
	defer r.mu.Unlock()
	if ac, ok := r.calls[callID]; ok {
		return ac.lastAudioAt
	}
	return 0
}

// markSilenceWatchStarted returns true the first time it's called for a
// given callID, and false thereafter — guards watchCallSilence against
// starting more than one goroutine per call.
func (r *callRegistry) markSilenceWatchStarted(callID string) bool {
	r.mu.Lock()
	defer r.mu.Unlock()
	ac, ok := r.calls[callID]
	if !ok || ac.silenceWatchStarted {
		return false
	}
	ac.silenceWatchStarted = true
	return true
}
