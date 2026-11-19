import React, { useEffect, useRef, useState, useCallback } from "react";
import { useParams } from "react-router-dom";
import { openApi as api } from "../../services/api";

const STORAGE_PREFIX = "webchat_session_";

const DICT = {
  pt: {
    unavailable: "Indisponível",
    channelNotFound: "Canal não encontrado",
    loading: "Carregando...",
    name: "Nome",
    email: "E-mail",
    phone: "Telefone",
    start: "Iniciar conversa",
    placeholder: "Escreva uma mensagem...",
    send: "Enviar",
    file: "Arquivo",
    micUnavailable: "Microfone indisponível",
    startNew: "Iniciar nova conversa",
    chatClosed: "Atendimento encerrado",
    farewellDefault: "Atendimento encerrado. Obrigado pelo contato! Clique abaixo para iniciar uma nova conversa.",
  },
  es: {
    unavailable: "No disponible",
    channelNotFound: "Canal no encontrado",
    loading: "Cargando...",
    name: "Nombre",
    email: "Correo electrónico",
    phone: "Teléfono",
    start: "Iniciar conversación",
    placeholder: "Escribe un mensaje...",
    send: "Enviar",
    file: "Archivo",
    micUnavailable: "Micrófono no disponible",
    startNew: "Iniciar nueva conversación",
    chatClosed: "Atención finalizada",
    farewellDefault: "Atención finalizada. ¡Gracias por contactarnos! Haz clic abajo para iniciar una nueva conversación.",
  },
  en: {
    unavailable: "Unavailable",
    channelNotFound: "Channel not found",
    loading: "Loading...",
    name: "Name",
    email: "Email",
    phone: "Phone",
    start: "Start conversation",
    placeholder: "Write a message...",
    send: "Send",
    file: "File",
    micUnavailable: "Microphone unavailable",
    startNew: "Start new conversation",
    chatClosed: "Conversation closed",
    farewellDefault: "Conversation closed. Thanks for reaching out! Click below to start a new conversation.",
  },
};
const pickLang = () => {
  const l = (navigator.language || "pt").toLowerCase();
  if (l.startsWith("es")) return DICT.es;
  if (l.startsWith("en")) return DICT.en;
  return DICT.pt;
};
const T = pickLang();

const PublicWebchat = () => {
  const { token } = useParams();
  const [cfg, setCfg] = useState(null);
  const [sessionId, setSessionId] = useState(null);
  const [needForm, setNeedForm] = useState(false);
  const [form, setForm] = useState({ name: "", email: "", phone: "" });
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [closed, setClosed] = useState(false);
  const [farewell, setFarewell] = useState("");
  const listRef = useRef(null);
  const recorderRef = useRef(null);
  const [recording, setRecording] = useState(false);

  // Load config
  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get(`/public/webchat/${token}/config`);
        setCfg(data.config);
        const stored = localStorage.getItem(STORAGE_PREFIX + token);
        if (data.config.requireForm && !stored) {
          setNeedForm(true);
        } else {
          await openSession(stored || null, {});
        }
      } catch (e) {
        setCfg({ title: T.unavailable, subtitle: T.channelNotFound });
      }
    })();
    // eslint-disable-next-line
  }, [token]);

  const openSession = useCallback(
    async (existing, data) => {
      const { data: res } = await api.post(`/public/webchat/${token}/session`, {
        sessionId: existing,
        ...data
      });
      setSessionId(res.sessionId);
      localStorage.setItem(STORAGE_PREFIX + token, res.sessionId);
      setNeedForm(false);
      setClosed(false);
      setFarewell("");
      await refreshHistory(res.sessionId);
    },
    [token]
  );

  const startNewConversation = useCallback(async () => {
    // Limpa sessão local e abre uma nova
    localStorage.removeItem(STORAGE_PREFIX + token);
    setMessages([]);
    setClosed(false);
    setFarewell("");
    if (cfg?.requireForm) {
      setSessionId(null);
      setNeedForm(true);
    } else {
      await openSession(null, {});
    }
  }, [token, cfg, openSession]);

  const refreshHistory = useCallback(
    async (sid) => {
      try {
        const { data } = await api.get(`/public/webchat/${token}/history`, {
          params: { sessionId: sid }
        });
        setMessages(data.messages || []);
        setClosed(!!data.closed);
        setFarewell(data.farewellMessage || "");
        setTimeout(() => {
          if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
        }, 50);
      } catch (e) {}
    },
    [token]
  );

  // Poll for new messages (pausa quando o atendimento está encerrado)
  useEffect(() => {
    if (!sessionId || closed) return;
    const id = setInterval(() => refreshHistory(sessionId), 2000);
    return () => clearInterval(id);
  }, [sessionId, closed, refreshHistory]);

  // Auto-ack on focus
  useEffect(() => {
    if (!sessionId) return;
    const onFocus = () => {
      api.post(`/public/webchat/${token}/ack`, { sessionId }).catch(() => {});
    };
    window.addEventListener("focus", onFocus);
    onFocus();
    return () => window.removeEventListener("focus", onFocus);
  }, [sessionId, token]);

  const sendText = async () => {
    if (!input.trim() || !sessionId) return;
    setSending(true);
    try {
      await api.post(`/public/webchat/${token}/message`, {
        sessionId,
        body: input
      });
      setInput("");
      await refreshHistory(sessionId);
    } finally {
      setSending(false);
    }
  };

  const sendFile = async (file) => {
    if (!file || !sessionId) return;
    const fd = new FormData();
    fd.append("sessionId", sessionId);
    fd.append("file", file);
    fd.append("body", "");
    await api.post(`/public/webchat/${token}/media`, fd, {
      headers: { "Content-Type": "multipart/form-data" }
    });
    await refreshHistory(sessionId);
  };

  const toggleRecord = async () => {
    if (recording) {
      recorderRef.current?.stop();
      setRecording(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const mr = new MediaRecorder(stream);
      const chunks = [];
      mr.ondataavailable = (e) => chunks.push(e.data);
      mr.onstop = async () => {
        const blob = new Blob(chunks, { type: "audio/webm" });
        const file = new File([blob], `audio_${Date.now()}.webm`, {
          type: "audio/webm"
        });
        await sendFile(file);
        stream.getTracks().forEach((t) => t.stop());
      };
      recorderRef.current = mr;
      mr.start();
      setRecording(true);
    } catch (e) {
      alert(T.micUnavailable);
    }
  };

  if (!cfg) return <div style={{ padding: 20 }}>{T.loading}</div>;

  const primary = cfg.primaryColor || "#4E93FF";

  if (needForm) {
    return (
      <div style={wrap}>
        <div style={{ ...header, background: primary }}>
          <strong>{cfg.title}</strong>
          <div style={{ fontSize: 12, opacity: 0.9 }}>{cfg.subtitle}</div>
        </div>
        <div style={{ padding: 16 }}>
          <input
            style={inp}
            placeholder={T.name}
            value={form.name}
            onChange={(e) => setForm({ ...form, name: e.target.value })}
          />
          <input
            style={inp}
            placeholder={T.email}
            value={form.email}
            onChange={(e) => setForm({ ...form, email: e.target.value })}
          />
          <input
            style={inp}
            placeholder={T.phone}
            value={form.phone}
            onChange={(e) => setForm({ ...form, phone: e.target.value })}
          />
          <button
            style={{ ...btn, background: primary }}
            onClick={() => openSession(null, form)}
            disabled={!form.name}
          >
            {T.start}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div style={wrap}>
      <div style={{ ...header, background: primary }}>
        <strong>{cfg.title}</strong>
        <div style={{ fontSize: 12, opacity: 0.9 }}>{cfg.subtitle}</div>
      </div>
      <div ref={listRef} style={list}>
        {cfg.welcomeMessage && (
          <div style={{ ...bubble, background: "#eee" }}>{cfg.welcomeMessage}</div>
        )}
        {messages.map((m) => (
          <div
            key={m.id}
            style={{
              ...bubble,
              alignSelf: m.fromMe ? "flex-start" : "flex-end",
              background: m.fromMe ? "#eee" : primary,
              color: m.fromMe ? "#111" : "#fff"
            }}
          >
            {m.mediaUrl && m.mediaType === "image" && (
              <img src={m.mediaUrl} alt="" style={{ maxWidth: 220, borderRadius: 6 }} />
            )}
            {m.mediaUrl && m.mediaType === "audio" && (
              <audio controls src={m.mediaUrl} />
            )}
            {m.mediaUrl && !["image", "audio"].includes(m.mediaType) && (
              <a href={m.mediaUrl} target="_blank" rel="noreferrer" style={{ color: "inherit" }}>
                {T.file}
              </a>
            )}
            {m.body && <div>{m.body}</div>}
          </div>
        ))}
        {closed && (
          <div
            style={{
              ...bubble,
              alignSelf: "center",
              background: "#fff7e6",
              color: "#7a4a00",
              border: "1px solid #f0c674",
              maxWidth: "90%",
              textAlign: "center"
            }}
          >
            <div style={{ fontWeight: 600, marginBottom: 4 }}>{T.chatClosed}</div>
            <div style={{ marginBottom: 8 }}>{farewell || T.farewellDefault}</div>
            <button
              style={{ ...btn, background: primary, margin: 0, width: "auto", padding: "8px 14px" }}
              onClick={startNewConversation}
            >
              {T.startNew}
            </button>
          </div>
        )}
      </div>
      {!closed && (
        <div style={composer}>
          <input
            style={{ ...inp, margin: 0, flex: 1 }}
            placeholder={T.placeholder}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && sendText()}
          />
          <label style={iconBtn}>
            📎
            <input
              type="file"
              style={{ display: "none" }}
              onChange={(e) => e.target.files?.[0] && sendFile(e.target.files[0])}
            />
          </label>
          <button style={iconBtn} onClick={toggleRecord}>
            {recording ? "■" : "🎙"}
          </button>
          <button
            style={{ ...btn, background: primary, margin: 0, width: "auto", padding: "8px 14px" }}
            onClick={sendText}
            disabled={sending}
          >
            {T.send}
          </button>
        </div>
      )}
    </div>
  );
};

const wrap = {
  display: "flex",
  flexDirection: "column",
  height: "100vh",
  fontFamily: "system-ui, sans-serif",
  background: "#f7f7f7"
};
const header = { padding: 14, color: "#fff" };
const list = {
  flex: 1,
  overflowY: "auto",
  padding: 12,
  display: "flex",
  flexDirection: "column",
  gap: 8
};
const bubble = {
  maxWidth: "75%",
  padding: "8px 12px",
  borderRadius: 12,
  whiteSpace: "pre-wrap"
};
const composer = {
  display: "flex",
  gap: 6,
  padding: 8,
  borderTop: "1px solid #ddd",
  background: "#fff",
  alignItems: "center"
};
const inp = {
  width: "100%",
  padding: 10,
  margin: "6px 0",
  border: "1px solid #ddd",
  borderRadius: 6,
  fontSize: 14,
  boxSizing: "border-box"
};
const btn = {
  width: "100%",
  padding: 10,
  border: 0,
  color: "#fff",
  borderRadius: 6,
  cursor: "pointer",
  fontWeight: 600
};
const iconBtn = {
  border: "1px solid #ddd",
  background: "#fff",
  borderRadius: 6,
  padding: "6px 10px",
  cursor: "pointer"
};

export default PublicWebchat;