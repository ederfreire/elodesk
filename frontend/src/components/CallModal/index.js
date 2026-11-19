import React, { useEffect, useRef, useState } from "react";
import { Dialog, Box, Avatar, Typography, IconButton, Fade, CircularProgress } from "@material-ui/core";
import CallIcon from "@material-ui/icons/Call";
import CallEndIcon from "@material-ui/icons/CallEnd";
import { useWaCalls } from "../../context/WaCalls/WaCallsContext";
import { i18n } from "../../translate/i18n";

/**
 * Modal global de chamada — aparece sobre qualquer tela quando há chamada
 * entrante ou ativa via wacalls.
 *
 * O áudio de verdade (microfone + WebRTC) é feito pelo backend wacalls-chat
 * (github.com/raphaelbat/wacalls-chat), pareado como um segundo aparelho no
 * mesmo número — separado do wacalls-voip, que continua só cuidando de
 * mensagem. Ver WacallsChatCallService.ts no backend e wacallsWebRTC.js aqui
 * no front pra sinalização/áudio.
 */
const CallModal = () => {
  const {
    call, answer, reject, hangup, callAudioError,
    localVideoStream, registerRemoteVideoCanvas,
  } = useWaCalls();
  const [elapsed, setElapsed] = useState(0);
  const [answering, setAnswering] = useState(false);
  const localVideoRef = useRef(null);
  const remoteCanvasRef = useRef(null);

  useEffect(() => {
    if (!call || call.state !== "active") { setElapsed(0); return; }
    const start = Date.now();
    const t = setInterval(() => setElapsed(Math.floor((Date.now() - start) / 1000)), 500);
    return () => clearInterval(t);
  }, [call]);

  useEffect(() => {
    setAnswering(false);
  }, [call?.id, call?.state]);

  // Auto-preview: liga a webcam local no <video> assim que o navegador
  // entrega o stream (ver dial()/answer() em WaCallsContext.js). O
  // <canvas> remoto é registrado direto no context — é ele quem recebe
  // os frames decodificados vindos do H.264 do WhatsApp (ver
  // onRemoteVideoFrame/startVideoReceiver em wacallsWebRTC.js).
  useEffect(() => {
    if (localVideoRef.current) {
      localVideoRef.current.srcObject = localVideoStream || null;
    }
  }, [localVideoStream]);

  useEffect(() => {
    registerRemoteVideoCanvas && registerRemoteVideoCanvas(remoteCanvasRef.current);
    return () => registerRemoteVideoCanvas && registerRemoteVideoCanvas(null);
  }, [registerRemoteVideoCanvas, call?.id]);

  if (!call) return null;

  const peerName = call.peerName || call.peer || i18n.t("callModal.contact");
  const peerNumber = call.peerNumber || (call.peer || "").split("@")[0];
  const initial = (peerName || "?").slice(0, 1).toUpperCase();

  const isIncoming = call.state === "ringing-in";
  const isActive = call.state === "active";
  const timer = `${String(Math.floor(elapsed / 60)).padStart(2, "0")}:${String(elapsed % 60).padStart(2, "0")}`;
  const statusText =
    call.state === "ringing-in" ? i18n.t("callModal.incoming")
    : call.state === "ringing-out" ? i18n.t("callModal.calling")
    : call.state === "active" ? i18n.t("callModal.inProgress")
    : call.state === "ended" ? i18n.t("callModal.finished")
    : i18n.t("callModal.ended");

  const handleAnswer = async () => {
    setAnswering(true);
    try {
      await answer();
    } finally {
      setAnswering(false);
    }
  };

  // Chamada de vídeo (canal WhatsApp Plus — SIP nunca tem vídeo, ver
  // openSipAudio em wacallsWebRTC.js). Enquanto o remoto não manda o
  // primeiro keyframe H.264, o <canvas> fica vazio e o avatar continua
  // visível por baixo, então não há tela preta esquisita.
  const isVideoCall = !!call.video;
  const showVideoArea = isVideoCall && (isActive || call.state === "ringing-out");

  return (
    <Dialog
      open
      TransitionComponent={Fade}
      PaperProps={{
        style: {
          borderRadius: 16,
          minWidth: showVideoArea ? 420 : 320,
          width: showVideoArea ? 420 : undefined,
          background: "linear-gradient(160deg,#111827 0%,#1f2937 100%)",
          color: "#fff",
          overflow: "hidden",
        },
      }}
      hideBackdrop={false}
    >
      <Box p={4} display="flex" flexDirection="column" alignItems="center">
        {showVideoArea ? (
          <Box
            position="relative"
            width="100%"
            style={{ borderRadius: 12, overflow: "hidden", background: "#0b0f19" }}
          >
            <Box
              display="flex"
              alignItems="center"
              justifyContent="center"
              style={{ width: "100%", height: 280, background: "#0b0f19" }}
            >
              <Avatar
                src={call.peerAvatar || undefined}
                style={{ width: 80, height: 80, fontSize: 34, background: "#4E93FF", position: "absolute" }}
              >
                {initial}
              </Avatar>
              <canvas
                ref={remoteCanvasRef}
                style={{ width: "100%", height: "100%", objectFit: "contain", position: "relative" }}
              />
            </Box>
            <video
              ref={localVideoRef}
              autoPlay
              muted
              playsInline
              style={{
                position: "absolute",
                bottom: 10,
                right: 10,
                width: 96,
                height: 128,
                objectFit: "cover",
                borderRadius: 8,
                border: "2px solid rgba(255,255,255,0.35)",
                background: "#000",
              }}
            />
          </Box>
        ) : (
          <Avatar
            src={call.peerAvatar || undefined}
            style={{ width: 96, height: 96, fontSize: 40, background: "#4E93FF" }}
          >
            {initial}
          </Avatar>
        )}
        <Typography variant="h6" style={{ marginTop: 16, color: "#fff" }}>{peerName}</Typography>
        {peerNumber && peerNumber !== peerName && (
          <Typography variant="body2" style={{ color: "#94a3b8" }}>{peerNumber}</Typography>
        )}
        <Typography variant="body2" style={{ color: "#94a3b8", marginTop: 4 }}>
          {statusText}{isActive ? ` · ${timer}` : ""}
        </Typography>
        {callAudioError && (
          <Typography variant="caption" style={{ color: "#f87171", marginTop: 4, textAlign: "center", maxWidth: 260 }}>
            {callAudioError}
          </Typography>
        )}
        <Box mt={4} display="flex" gap={24} style={{ gap: 24 }}>
          {isIncoming && (
            <>
              <IconButton onClick={reject} disabled={answering} style={{ background: "#ef4444", color: "#fff", width: 64, height: 64 }}>
                <CallEndIcon fontSize="large" />
              </IconButton>
              <IconButton onClick={handleAnswer} disabled={answering} style={{ background: "#22c55e", color: "#fff", width: 64, height: 64 }}>
                {answering ? <CircularProgress size={28} style={{ color: "#fff" }} /> : <CallIcon fontSize="large" />}
              </IconButton>
            </>
          )}
          {(isActive || call.state === "ringing-out") && (
            <IconButton onClick={hangup} style={{ background: "#ef4444", color: "#fff", width: 64, height: 64 }}>
              <CallEndIcon fontSize="large" />
            </IconButton>
          )}
        </Box>
      </Box>
    </Dialog>
  );
};

export default CallModal;
