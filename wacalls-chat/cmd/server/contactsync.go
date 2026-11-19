package main

import (
	"context"
	"crypto/sha1"
	"encoding/hex"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"path/filepath"
	"strings"
	"time"

	"go.mau.fi/whatsmeow"
	"go.mau.fi/whatsmeow/types"
)

// resolveContactNameAndAvatar best-effort enriches a chat's name and profile
// picture using the WhatsApp client. It writes the cached picture under
// media/avatars/ and returns the served URL path (or "" if unavailable).
//
// Safe to call multiple times — picture is re-downloaded only when WhatsApp
// reports a new ID.
func resolveContactNameAndAvatar(ctx context.Context, sess *Session, jidStr string, existingName, existingAvatar string) (name, avatarURL string, err error) {
	if sess == nil || sess.client == nil {
		return existingName, existingAvatar, fmt.Errorf("session not ready")
	}
	jid, parseErr := types.ParseJID(jidStr)
	if parseErr != nil {
		return existingName, existingAvatar, parseErr
	}
	name = existingName
	avatarURL = existingAvatar

	// --- Name resolution --------------------------------------------------
	isGroup := jid.Server == types.GroupServer || strings.HasSuffix(jidStr, "@g.us")
	isNewsletter := jid.Server == types.NewsletterServer || strings.HasSuffix(jidStr, "@newsletter")
	if isGroup {
		if gi, gerr := sess.client.GetGroupInfo(ctx, jid); gerr == nil && gi != nil && gi.Name != "" {
			name = gi.Name
		}
	} else if isNewsletter {
		if nm, nerr := sess.client.GetNewsletterInfo(ctx, jid); nerr == nil && nm != nil {
			if t := strings.TrimSpace(nm.ThreadMeta.Name.Text); t != "" {
				name = t
			}
			// Try to seed avatar from newsletter preview/picture if no
			// profile picture is later returned by GetProfilePictureInfo.
			if nm.ThreadMeta.Picture != nil && nm.ThreadMeta.Picture.URL != "" {
				if saved, derr := downloadAvatar(ctx, jidStr, nm.ThreadMeta.Picture.ID, nm.ThreadMeta.Picture.URL); derr == nil {
					avatarURL = saved
				}
			} else if nm.ThreadMeta.Preview.URL != "" {
				if saved, derr := downloadAvatar(ctx, jidStr, nm.ThreadMeta.Preview.ID, nm.ThreadMeta.Preview.URL); derr == nil {
					avatarURL = saved
				}
			}
		}
	} else {
		// Local contact cache populated by whatsmeow from sync events.
		if sess.client.Store != nil && sess.client.Store.Contacts != nil {
			if ci, cerr := sess.client.Store.Contacts.GetContact(ctx, jid.ToNonAD()); cerr == nil && ci.Found {
				switch {
				case ci.FullName != "":
					name = ci.FullName
				case ci.PushName != "":
					name = ci.PushName
				case ci.BusinessName != "":
					name = ci.BusinessName
				case ci.FirstName != "":
					name = ci.FirstName
				}
			}
		}
	}

	// --- Profile picture --------------------------------------------------
	existingID := ""
	if existingAvatar != "" {
		// We embed the ppId in the filename (avatars/<hash>-<id>.jpg) so we
		// can avoid re-downloading when WhatsApp returns the same id.
		if idx := strings.LastIndex(existingAvatar, "-"); idx > 0 {
			tail := existingAvatar[idx+1:]
			tail = strings.TrimSuffix(tail, ".jpg")
			if tail != "" {
				existingID = tail
			}
		}
	}
	info, perr := sess.client.GetProfilePictureInfo(ctx, jid, &whatsmeow.GetProfilePictureParams{
		Preview:    false,
		ExistingID: existingID,
	})
	// Os quatro casos abaixo devolviam avatar vazio exatamente do mesmo jeito,
	// sem nenhum registro — impossível saber, olhando de fora, se o contato
	// não tem foto, se a conta não tem permissão de ver, ou se o download
	// falhou. Cada um agora diz o que houve.
	if perr != nil {
		// Privacy or "not authorized" — keep existing avatar.
		slog.Debug("avatar indisponível para o contato",
			"jid", jidStr, "motivo", "GetProfilePictureInfo falhou", "err", perr)
		return name, avatarURL, nil
	}
	if info == nil {
		// Nil means picture unchanged.
		slog.Debug("avatar inalterado desde a última sincronização", "jid", jidStr)
		return name, avatarURL, nil
	}
	if info.URL == "" {
		slog.Debug("contato sem foto de perfil", "jid", jidStr)
		return name, avatarURL, nil
	}
	saved, derr := downloadAvatar(ctx, jidStr, info.ID, info.URL)
	if derr != nil {
		slog.Warn("download do avatar falhou",
			"jid", jidStr, "url", info.URL, "err", derr)
		return name, avatarURL, nil
	}
	avatarURL = saved
	return name, avatarURL, nil
}

// downloadAvatar fetches the profile picture and stores it under
// media/avatars/<sha1(jid)>-<pictureId>.jpg, returning the public path.
func downloadAvatar(ctx context.Context, jidStr, pictureID, url string) (string, error) {
	dir := filepath.Join("media", "avatars")
	if err := os.MkdirAll(dir, 0o755); err != nil {
		return "", err
	}
	h := sha1.Sum([]byte(jidStr))
	hash := hex.EncodeToString(h[:])
	id := pictureID
	if id == "" {
		// Sem ID de foto, o nome do arquivo passava a incluir o timestamp —
		// ou seja, CADA sincronização gerava um avatar novo no disco para o
		// mesmo contato, sem nunca reaproveitar (o os.Stat abaixo nunca
		// encontrava o arquivo anterior, porque o nome mudava toda vez).
		// Em conta com muitos contatos isso vira acúmulo silencioso.
		//
		// Sem ID não há como saber se a foto mudou, então o melhor é não
		// baixar: o avatar que já estiver salvo continua valendo.
		return "", fmt.Errorf("foto de perfil sem ID (jid=%s) — download ignorado para não duplicar arquivo no disco", jidStr)
	}
	// sanitize id
	id = strings.Map(func(r rune) rune {
		switch {
		case r >= '0' && r <= '9', r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r == '_', r == '-':
			return r
		}
		return '_'
	}, id)
	name := hash + "-" + id + ".jpg"
	full := filepath.Join(dir, name)
	if _, err := os.Stat(full); err == nil {
		return "/api/media/avatars/" + name, nil
	}

	reqCtx, cancel := context.WithTimeout(ctx, 20*time.Second)
	defer cancel()
	req, err := http.NewRequestWithContext(reqCtx, http.MethodGet, url, nil)
	if err != nil {
		return "", err
	}
	resp, err := http.DefaultClient.Do(req)
	if err != nil {
		return "", err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return "", fmt.Errorf("avatar download: %s", resp.Status)
	}
	data, err := io.ReadAll(io.LimitReader(resp.Body, 4<<20))
	if err != nil {
		return "", err
	}
	if err := os.WriteFile(full, data, 0o644); err != nil {
		return "", err
	}
	return "/api/media/avatars/" + name, nil
}

// handleChatSync forces a refresh of one conversation (name + avatar) and
// returns the updated ChatMeta. Used by the "Sincronizar contato" button.
func (s *server) handleChatSync(w http.ResponseWriter, r *http.Request) {
	sess := s.sessionByID(w, r, r.PathValue("sid"))
	if sess == nil {
		return
	}
	if sess.client == nil || sess.client.Store == nil || sess.client.Store.ID == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "not paired"})
		return
	}
	jid := r.PathValue("jid")
	cur, _, _ := s.chatMeta.Get(r.Context(), sess.id, jid)
	if cur.SessionID == "" {
		cur.SessionID = sess.id
		cur.ChatJID = jid
		if strings.HasSuffix(jid, "@g.us") {
			cur.IsGroup = true
			cur.Status = ChatStatusGroup
		} else {
			cur.Status = ChatStatusWaiting
		}
	}
	ctx, cancel := context.WithTimeout(r.Context(), 25*time.Second)
	defer cancel()
	name, avatar, err := resolveContactNameAndAvatar(ctx, sess, jid, cur.Name, cur.AvatarURL)
	if err != nil {
		writeJSON(w, http.StatusBadGateway, map[string]string{"error": err.Error()})
		return
	}
	cur.Name = name
	cur.AvatarURL = avatar
	cur.UpdatedAt = time.Now().UnixMilli()
	if err := s.chatMeta.Upsert(r.Context(), cur); err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	s.broker.emitChatMeta(cur)
	writeJSON(w, http.StatusOK, map[string]any{"meta": cur})
}

// handlePresenceSubscribe marks this session as "available" (required by the
// WhatsApp protocol before it will send ANY chat-state/presence updates —
// see whatsmeow's own doc comment on events.Presence/events.ChatPresence)
// and subscribes to presence updates for one specific chat JID. Called by
// the Node backend whenever an attendant opens a ticket for this channel
// (same trigger the Baileys side already uses via wbot.presenceSubscribe),
// and again periodically by Node's keepalive — the subscription is
// short-lived on WhatsApp's side, same as it is for Baileys.
//
// Best-effort/idempotent: SendPresence/SubscribePresence failing here just
// means the typing indicator won't show up for this chat, it never blocks
// or breaks anything else, so errors are only logged, never surfaced as a
// hard failure to the caller beyond a generic 200.
func (s *server) handlePresenceSubscribe(w http.ResponseWriter, r *http.Request) {
	sess := s.sessionByID(w, r, r.PathValue("sid"))
	if sess == nil {
		return
	}
	if sess.client == nil || sess.client.Store == nil || sess.client.Store.ID == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "not paired"})
		return
	}
	raw := r.PathValue("jid")
	jid, perr := types.ParseJID(raw)
	if perr != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid jid"})
		return
	}

	if err := sess.client.SendPresence(r.Context(), types.PresenceAvailable); err != nil {
		sess.log.Debug("SendPresence(available) falhou", "err", err)
	}
	if err := sess.client.SubscribePresence(r.Context(), jid); err != nil {
		sess.log.Debug("SubscribePresence falhou", "jid", jid.String(), "err", err)
	}

	writeJSON(w, http.StatusOK, map[string]bool{"ok": true})
}

// handleLidToPN resolves a WhatsApp LID (e.g. "199347350294740@lid") to the
// real phone-number JID, using whatsmeow's local LID↔PN store. Triggers a
// best-effort USync when the mapping is missing so the next call hits the
// cache. Returns {"phone": "<digits>", "jid": "<pn@s.whatsapp.net>"} or 404.
func (s *server) handleLidToPN(w http.ResponseWriter, r *http.Request) {
	sess := s.sessionByID(w, r, r.PathValue("sid"))
	if sess == nil {
		return
	}
	if sess.client == nil || sess.client.Store == nil || sess.client.Store.LIDs == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "not paired"})
		return
	}
	raw := r.PathValue("jid")
	parsed, perr := types.ParseJID(raw)
	if perr != nil {
		writeJSON(w, http.StatusBadRequest, map[string]string{"error": "invalid jid"})
		return
	}
	ctx, cancel := context.WithTimeout(r.Context(), 8*time.Second)
	defer cancel()
	// Already a phone-number JID — short-circuit.
	if parsed.Server != types.HiddenUserServer {
		writeJSON(w, http.StatusOK, map[string]any{"phone": parsed.User, "jid": parsed.String()})
		return
	}
	if pn, err := sess.client.Store.LIDs.GetPNForLID(ctx, parsed); err == nil && !pn.IsEmpty() {
		writeJSON(w, http.StatusOK, map[string]any{"phone": pn.User, "jid": pn.String()})
		return
	}
	// USync warm-up: asking for devices populates Store.LIDs as a side-effect.
	_, _ = sess.client.GetUserDevices(ctx, []types.JID{parsed})
	if pn, err := sess.client.Store.LIDs.GetPNForLID(ctx, parsed); err == nil && !pn.IsEmpty() {
		writeJSON(w, http.StatusOK, map[string]any{"phone": pn.User, "jid": pn.String()})
		return
	}
	writeJSON(w, http.StatusNotFound, map[string]string{"error": "lid not mapped"})
}

// handleChatSyncAll iterates all known chats for a session and refreshes
// missing names / pictures in the background. Returns immediately.
func (s *server) handleChatSyncAll(w http.ResponseWriter, r *http.Request) {
	sess := s.sessionByID(w, r, r.PathValue("sid"))
	if sess == nil {
		return
	}
	if sess.client == nil || sess.client.Store == nil || sess.client.Store.ID == nil {
		writeJSON(w, http.StatusServiceUnavailable, map[string]string{"error": "not paired"})
		return
	}
	metas, err := s.chatMeta.ListBySession(r.Context(), sess.id)
	if err != nil {
		writeJSON(w, http.StatusInternalServerError, map[string]string{"error": err.Error()})
		return
	}
	go func(items map[string]ChatMeta) {
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Minute)
		defer cancel()
		for _, m := range items {
			select {
			case <-ctx.Done():
				return
			default:
			}
			name, avatar, err := resolveContactNameAndAvatar(ctx, sess, m.ChatJID, m.Name, m.AvatarURL)
			if err != nil {
				continue
			}
			if name == m.Name && avatar == m.AvatarURL {
				continue
			}
			m.Name = name
			m.AvatarURL = avatar
			m.UpdatedAt = time.Now().UnixMilli()
			if err := s.chatMeta.Upsert(ctx, m); err == nil {
				s.broker.emitChatMeta(m)
			}
			// throttle to avoid hammering WhatsApp servers
			time.Sleep(150 * time.Millisecond)
		}
	}(metas)
	writeJSON(w, http.StatusAccepted, map[string]any{"queued": len(metas)})
}
