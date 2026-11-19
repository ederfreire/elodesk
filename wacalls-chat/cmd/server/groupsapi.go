package main

// Gestor de Grupos pro canal WhatsApp Plus (wacalls/whatsmeow).
//
// Antes desta mudança, o Gestor de Grupos só funcionava em conexões Baileys:
// GroupManagerService.ts (Node) chamava getWbot()/@whiskeysockets/baileys
// direto, sem nenhum caminho alternativo pro wacalls-chat. Numa conexão
// WhatsApp Plus, getWbot() falhava dentro de um try/catch silencioso em
// ListGroupsService e o resultado era sempre uma lista vazia — daí o toast
// verde de sucesso "0 grupos sincronizados!" mesmo a conexão tendo grupos de
// verdade.
//
// Este arquivo expõe as mesmas operações de grupo via REST, na mesma
// convenção de sessão (/api/sessions/{sid}/...) usada pelo resto do
// wacalls-chat, usando os métodos nativos do whatsmeow (group.go — nomes e
// assinaturas confirmados contra o commit fixado em go.mod,
// go.mau.fi/whatsmeow v0.0.0-20260622185415-5f04eac6dbbb, buscado direto do
// código-fonte antes de escrever isto). O formato de resposta espelha
// propositalmente o shape que o Baileys já devolve (id/subject/owner/
// creation/desc/descId/restrict/announce/size/participants[{id,admin}]) pra
// GroupManagerService.ts (Node) conseguir tratar os dois canais de forma
// uniforme, sem exigir NENHUMA mudança no frontend.
import (
	"context"
	"encoding/json"
	"net/http"
	"strings"
	"time"

	"go.mau.fi/whatsmeow"
	"go.mau.fi/whatsmeow/types"
)

func (s *server) registerGroupRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /api/sessions/{sid}/groups", s.requireAuth(s.handleGroupList))
	mux.HandleFunc("GET /api/sessions/{sid}/groups/{jid}", s.requireAuth(s.handleGroupInfo))
	mux.HandleFunc("PUT /api/sessions/{sid}/groups/{jid}/subject", s.requireAuth(s.handleGroupSubject))
	mux.HandleFunc("PUT /api/sessions/{sid}/groups/{jid}/description", s.requireAuth(s.handleGroupDescription))
	mux.HandleFunc("GET /api/sessions/{sid}/groups/{jid}/invite", s.requireAuth(s.handleGroupInvite))
	mux.HandleFunc("POST /api/sessions/{sid}/groups/{jid}/participants", s.requireAuth(s.handleGroupParticipants))
	mux.HandleFunc("PUT /api/sessions/{sid}/groups/{jid}/settings", s.requireAuth(s.handleGroupSettings))
}

// groupInfoJSON serializa um *types.GroupInfo do whatsmeow no mesmo formato
// que o Baileys (@whiskeysockets/baileys) já usa em GroupManagerService.ts,
// pra não exigir nenhuma mudança no frontend nem no consumidor Node.
func groupInfoJSON(g *types.GroupInfo) map[string]any {
	owner := ""
	if !g.OwnerJID.IsEmpty() {
		owner = g.OwnerJID.String()
	}
	participants := make([]map[string]any, 0, len(g.Participants))
	for _, p := range g.Participants {
		var admin any
		if p.IsSuperAdmin {
			admin = "superadmin"
		} else if p.IsAdmin {
			admin = "admin"
		} else {
			admin = nil
		}
		participants = append(participants, map[string]any{
			"id":    p.JID.String(),
			"admin": admin,
		})
	}
	size := g.ParticipantCount
	if size == 0 {
		size = len(g.Participants)
	}
	var creation int64
	if !g.GroupCreated.IsZero() {
		creation = g.GroupCreated.Unix()
	}
	return map[string]any{
		"id":           g.JID.String(),
		"subject":      g.Name,
		"owner":        owner,
		"creation":     creation,
		"desc":         g.Topic,
		"descId":       g.TopicID,
		"restrict":     g.IsLocked,
		"announce":     g.IsAnnounce,
		"size":         size,
		"participants": participants,
	}
}

func groupJIDFromPath(r *http.Request) (types.JID, error) {
	return parseChatJID(r.PathValue("jid"))
}

// groupProfilePicURL busca a foto do grupo de forma best-effort — grupo sem
// foto ou com foto privada retorna (nil, nil) ou erro no whatsmeow, e nos
// dois casos só deixamos o campo vazio (igual o Baileys já faz em
// GroupManagerService.ts com o try/catch em volta de profilePictureUrl).
func groupProfilePicURL(ctx context.Context, sess *Session, jid types.JID) string {
	info, err := sess.client.GetProfilePictureInfo(ctx, jid, nil)
	if err != nil || info == nil {
		return ""
	}
	return info.URL
}

func (s *server) handleGroupList(w http.ResponseWriter, r *http.Request) {
	sess := s.sessionByID(w, r, r.PathValue("sid"))
	if sess == nil {
		return
	}
	if sess.client.Store.ID == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "not paired"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 25*time.Second)
	defer cancel()
	groups, err := sess.client.GetJoinedGroups(ctx)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	out := make([]map[string]any, 0, len(groups))
	for _, g := range groups {
		gj := groupInfoJSON(g)
		gj["profilePicUrl"] = groupProfilePicURL(ctx, sess, g.JID)
		out = append(out, gj)
	}
	writeJSON(w, http.StatusOK, map[string]any{"groups": out})
}

func (s *server) handleGroupInfo(w http.ResponseWriter, r *http.Request) {
	sess := s.sessionByID(w, r, r.PathValue("sid"))
	if sess == nil {
		return
	}
	jid, err := groupJIDFromPath(r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
	defer cancel()
	info, err := sess.client.GetGroupInfo(ctx, jid)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	out := groupInfoJSON(info)
	out["profilePicUrl"] = groupProfilePicURL(ctx, sess, jid)
	writeJSON(w, http.StatusOK, out)
}

func (s *server) handleGroupSubject(w http.ResponseWriter, r *http.Request) {
	sess := s.sessionByID(w, r, r.PathValue("sid"))
	if sess == nil {
		return
	}
	jid, err := groupJIDFromPath(r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	var body struct {
		Subject string `json:"subject"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || strings.TrimSpace(body.Subject) == "" {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "subject required"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
	defer cancel()
	if err := sess.client.SetGroupName(ctx, jid, body.Subject); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

func (s *server) handleGroupDescription(w http.ResponseWriter, r *http.Request) {
	sess := s.sessionByID(w, r, r.PathValue("sid"))
	if sess == nil {
		return
	}
	jid, err := groupJIDFromPath(r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	var body struct {
		Description string `json:"description"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid body"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
	defer cancel()
	// SetGroupDescription (sem exigir previousID/newID, diferente de
	// SetGroupTopic) já cuida de gerar o id da nova descrição sozinho.
	if err := sess.client.SetGroupDescription(ctx, jid, body.Description); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}

func (s *server) handleGroupInvite(w http.ResponseWriter, r *http.Request) {
	sess := s.sessionByID(w, r, r.PathValue("sid"))
	if sess == nil {
		return
	}
	jid, err := groupJIDFromPath(r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	reset := r.URL.Query().Get("reset") == "true" || r.URL.Query().Get("reset") == "1"
	ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
	defer cancel()
	link, err := sess.client.GetGroupInviteLink(ctx, jid, reset)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]string{"inviteLink": link})
}

func (s *server) handleGroupParticipants(w http.ResponseWriter, r *http.Request) {
	sess := s.sessionByID(w, r, r.PathValue("sid"))
	if sess == nil {
		return
	}
	jid, err := groupJIDFromPath(r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	var body struct {
		Jids   []string `json:"jids"`
		Action string   `json:"action"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil || len(body.Jids) == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "jids required"})
		return
	}
	var action whatsmeow.ParticipantChange
	switch body.Action {
	case "add":
		action = whatsmeow.ParticipantChangeAdd
	case "remove":
		action = whatsmeow.ParticipantChangeRemove
	case "promote":
		action = whatsmeow.ParticipantChangePromote
	case "demote":
		action = whatsmeow.ParticipantChangeDemote
	default:
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid action"})
		return
	}
	jids := make([]types.JID, 0, len(body.Jids))
	for _, raw := range body.Jids {
		pj, err := parseChatJID(raw)
		if err != nil {
			continue
		}
		jids = append(jids, pj)
	}
	if len(jids) == 0 {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "no valid jids"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 25*time.Second)
	defer cancel()
	participants, err := sess.client.UpdateGroupParticipants(ctx, jid, jids, action)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	out := make([]map[string]any, 0, len(participants))
	for _, p := range participants {
		out = append(out, map[string]any{"id": p.JID.String(), "error": p.Error})
	}
	writeJSON(w, http.StatusOK, map[string]any{"participants": out})
}

func (s *server) handleGroupSettings(w http.ResponseWriter, r *http.Request) {
	sess := s.sessionByID(w, r, r.PathValue("sid"))
	if sess == nil {
		return
	}
	jid, err := groupJIDFromPath(r)
	if err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": err.Error()})
		return
	}
	var body struct {
		Setting string `json:"setting"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid body"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 20*time.Second)
	defer cancel()
	switch body.Setting {
	case "announcement":
		err = sess.client.SetGroupAnnounce(ctx, jid, true)
	case "not_announcement":
		err = sess.client.SetGroupAnnounce(ctx, jid, false)
	case "locked":
		err = sess.client.SetGroupLocked(ctx, jid, true)
	case "unlocked":
		err = sess.client.SetGroupLocked(ctx, jid, false)
	default:
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid setting"})
		return
	}
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}
