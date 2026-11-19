import React, { useEffect, useState } from "react";
import wacallsApi, { getWacallsBaseUrl } from "../../services/wacallsApi";
import { useWaCalls } from "../../context/WaCalls/WaCallsContext";

const WaCallsSessionsPage = () => {
  const { sessions, refreshSessions } = useWaCalls();
  const [creating, setCreating] = useState(false);
  const [qr, setQr] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    refreshSessions();
  }, [refreshSessions]);

  const createSession = async () => {
    setError(null);
    setCreating(true);
    setQr(null);
    try {
      const { data } = await wacallsApi.post("/sessions", { label: "" });
      // Abre stream SSE do QR
      const token = (localStorage.getItem("token") || "").replace(/^"|"$/g, "");
      const url = `${getWacallsBaseUrl()}/sessions/${data.id}/qr?token=${encodeURIComponent(token)}`;
      const es = new EventSource(url, { withCredentials: false });
      es.addEventListener("qr", (e) => setQr(e.data));
      es.addEventListener("paired", () => {
        es.close();
        setQr(null);
        refreshSessions();
      });
      es.addEventListener("error", (e) => {
        setError(e.data || "Erro ao gerar QR");
        es.close();
      });
    } catch (e) {
      setError(e.response?.data?.error || e.message);
    } finally {
      setCreating(false);
    }
  };

  const remove = async (id) => {
    if (!window.confirm("Remover esta sessão do WhatsApp Plus - Voz + Msg?")) return;
    await wacallsApi.delete(`/sessions/${id}`);
    refreshSessions();
  };

  return (
    <div style={{ padding: 24, maxWidth: 800, margin: "0 auto" }}>
      <h2 style={{ marginBottom: 4 }}>WhatsApp Plus - Voz + Msg · Sessões</h2>
      <p style={{ opacity: 0.7, marginTop: 0, marginBottom: 24 }}>
        Números conectados ao microserviço de chamadas. Cada sessão consome uma conexão whatsmeow.
      </p>

      <div style={{ marginBottom: 24 }}>
        <button
          onClick={createSession}
          disabled={creating}
          style={{
            padding: "10px 16px", border: 0, borderRadius: 8,
            background: "#25D366", color: "#fff", fontWeight: 600, cursor: "pointer",
          }}
        >
          {creating ? "Gerando..." : "+ Parear novo número"}
        </button>
      </div>

      {error && (
        <div style={{ padding: 12, background: "#fee", color: "#900", borderRadius: 8, marginBottom: 16 }}>
          {error}
        </div>
      )}

      {qr && (
        <div style={{ textAlign: "center", padding: 24, border: "1px dashed #ccc", borderRadius: 12, marginBottom: 24 }}>
          <p>Escaneie no WhatsApp → Aparelhos conectados</p>
          <img alt="QR" src={`data:image/png;base64,${qr}`} style={{ maxWidth: 260 }} />
        </div>
      )}

      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid #eee" }}>
            <th style={{ padding: 8 }}>ID</th>
            <th style={{ padding: 8 }}>JID</th>
            <th style={{ padding: 8 }}>Label</th>
            <th style={{ padding: 8 }}></th>
          </tr>
        </thead>
        <tbody>
          {sessions.length === 0 && (
            <tr>
              <td colSpan={4} style={{ padding: 24, textAlign: "center", opacity: 0.6 }}>
                Nenhuma sessão. Clique em "Parear novo número".
              </td>
            </tr>
          )}
          {sessions.map((s) => (
            <tr key={s.id} style={{ borderBottom: "1px solid #f2f2f2" }}>
              <td style={{ padding: 8, fontFamily: "monospace", fontSize: 12 }}>{s.id.slice(0, 8)}</td>
              <td style={{ padding: 8 }}>{s.jid || "—"}</td>
              <td style={{ padding: 8 }}>{s.label || "—"}</td>
              <td style={{ padding: 8, textAlign: "right" }}>
                <button
                  onClick={() => remove(s.id)}
                  style={{
                    padding: "6px 10px", border: 0, borderRadius: 6,
                    background: "#e53935", color: "#fff", cursor: "pointer",
                  }}
                >
                  Remover
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

export default WaCallsSessionsPage;
