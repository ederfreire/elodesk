import React, { useEffect, useRef, useState } from "react";
import { useWaCalls } from "../../context/WaCalls/WaCallsContext";
import { getWacallsBaseUrl } from "../../services/wacallsApi";

/**
 * Softphone flutuante — mostra chamada entrante/em curso do WaCalls.
 *
 * IMPORTANTE: a captura/reprodução de áudio depende do bridge de mídia no
 * microserviço wacalls-voip (ver docs/CALL_MEDIA.md). Enquanto o bridge não
 * estiver ativo, esta UI faz a sinalização (atende/desliga/eventos) mas o
 * áudio não flui. A base WebRTC já está pronta abaixo.
 */
const WaCallsSoftphone = () => {
  const { enabled, call, answer, hangup } = useWaCalls();
  const audioRef = useRef(null);
  const pcRef = useRef(null);
  const wsRef = useRef(null);
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (!call || call.state !== "active") return;
    const t = setInterval(() => setElapsed((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [call]);

  useEffect(() => {
    if (!call || (call.state !== "active" && call.state !== "ringing-out")) return;
    const base = getWacallsBaseUrl();
    if (!base) return;

    const token = (localStorage.getItem("token") || "").replace(/^"|"$/g, "");
    const wsUrl = `${base.replace(/^http/, "ws")}/ws/calls/${call.id}?token=${encodeURIComponent(token)}`;

    const pc = new RTCPeerConnection({
      iceServers: [{ urls: "stun:stun.l.google.com:19302" }],
    });
    pcRef.current = pc;
    pc.addTransceiver("audio", { direction: "sendrecv" });

    pc.ontrack = (e) => {
      if (audioRef.current) audioRef.current.srcObject = e.streams[0];
    };

    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = async () => {
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach((t) => pc.addTrack(t, stream));
        const offer = await pc.createOffer();
        await pc.setLocalDescription(offer);
        ws.send(JSON.stringify({ type: "offer", sdp: offer.sdp }));
      } catch (err) {
        console.error("WaCalls mic:", err);
      }
    };

    ws.onmessage = async (msg) => {
      try {
        const data = JSON.parse(msg.data);
        if (data.type === "answer") {
          await pc.setRemoteDescription({ type: "answer", sdp: data.sdp });
        } else if (data.type === "candidate" && data.candidate) {
          await pc.addIceCandidate(data.candidate);
        }
      } catch (e) {
        console.warn("WaCalls signaling:", e);
      }
    };

    pc.onicecandidate = (e) => {
      if (e.candidate && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "candidate", candidate: e.candidate }));
      }
    };

    return () => {
      try { ws.close(); } catch {}
      try { pc.close(); } catch {}
      pcRef.current = null;
      wsRef.current = null;
      setElapsed(0);
    };
  }, [call && call.id, call && call.state]);

  if (!enabled || !call) return null;

  const label = {
    "ringing-in": "Chamada entrante",
    "ringing-out": "Chamando...",
    active: "Em chamada",
    ended: "Encerrada",
  }[call.state] || call.state;

  const peer = (call.peer || "").split("@")[0];

  const fmt = (s) => `${String(Math.floor(s / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  return (
    <div
      style={{
        position: "fixed",
        bottom: 24,
        right: 24,
        width: 300,
        padding: 16,
        borderRadius: 12,
        background: "#111",
        color: "#fff",
        boxShadow: "0 10px 30px rgba(0,0,0,0.4)",
        zIndex: 2000,
        fontFamily: "system-ui, sans-serif",
      }}
    >
      <div style={{ opacity: 0.7, fontSize: 12, marginBottom: 4 }}>WhatsApp Plus - Voz + Msg</div>
      <div style={{ fontWeight: 600, fontSize: 15 }}>{peer || "—"}</div>
      <div style={{ fontSize: 13, opacity: 0.9, marginTop: 6 }}>
        {label} {call.state === "active" && `· ${fmt(elapsed)}`}
      </div>

      <audio ref={audioRef} autoPlay playsInline />

      <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
        {call.state === "ringing-in" && (
          <button
            onClick={answer}
            style={{
              flex: 1, padding: "10px 12px", border: 0, borderRadius: 8,
              background: "#25D366", color: "#fff", fontWeight: 600, cursor: "pointer",
            }}
          >
            Atender
          </button>
        )}
        {call.state !== "ended" && (
          <button
            onClick={hangup}
            style={{
              flex: 1, padding: "10px 12px", border: 0, borderRadius: 8,
              background: "#e53935", color: "#fff", fontWeight: 600, cursor: "pointer",
            }}
          >
            {call.state === "ringing-in" ? "Recusar" : "Desligar"}
          </button>
        )}
      </div>
    </div>
  );
};

export default WaCallsSoftphone;
