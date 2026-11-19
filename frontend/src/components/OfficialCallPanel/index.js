import React, { useContext, useEffect, useRef, useState, useCallback } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  Typography,
  Box,
  Avatar
} from "@material-ui/core";
import CallIcon from "@material-ui/icons/Call";
import CallEndIcon from "@material-ui/icons/CallEnd";
import MicIcon from "@material-ui/icons/Mic";
import MicOffIcon from "@material-ui/icons/MicOff";
import { toast } from "react-toastify";
import { i18n } from "../../translate/i18n";
import { ouvirDiscagemOficial } from "../../services/telefonia";

import somChamada from "../../assets/chat_notify.mp3";

import { AuthContext } from "../../context/Auth/AuthContext";
import { WhatsAppsContext } from "../../context/WhatsApp/WhatsAppsContext";
import {
  atenderChamadaOficial,
  iniciarChamadaOficial,
  aplicarRespostaOficial,
  encerrarChamadaOficial
} from "../../services/officialCall";

/**
 * Ligações de voz pela API Oficial.
 *
 * Fica montado o tempo todo para poder receber chamada mesmo com o painel
 * fechado — abre sozinho quando o cliente liga.
 *
 * O áudio vai direto do navegador para a Meta. O servidor só leva a oferta
 * e a resposta SDP.
 */
const OfficialCallPanel = ({ open, onClose }) => {
  const { user, socket } = useContext(AuthContext);
  const { whatsApps } = useContext(WhatsAppsContext);

  const [chamada, setChamada] = useState(null);
  const [mudo, setMudo] = useState(false);
  const [discando, setDiscando] = useState(false);
  const [conexaoId, setConexaoId] = useState("");
  // Alvo da última discagem: se a Meta recusar por falta de autorização,
  // precisamos saber para quem pedir permissão.
  const [pedirPara, setPedirPara] = useState(null);
  const ultimoAlvo = useRef(null);

  const pcRef = useRef(null);
  const streamRef = useRef(null);
  // callId da ligação que ESTE navegador discou (vem no "dialing"). A
  // resposta SDP do cliente chega para a empresa toda; só quem tem este
  // callId aplica.
  const callIdDiscadoRef = useRef(null);
  const audioRef = useRef(null);
  const toqueRef = useRef(null);
  // Ponte para o discador unificado. O ouvinte é registrado uma vez só, então
  // não pode fechar sobre a `discar` de um render antigo — a ref é atualizada
  // a cada render e sempre aponta pra versão atual.
  const discarRef = useRef(() => {});

  // Só conexões oficiais podem fazer chamada pela Calling API.
  const conexoesOficiais = (whatsApps || []).filter(
    w => w.channel === "whatsapp_oficial" && w.status === "CONNECTED"
  );

  useEffect(() => {
    if (!conexaoId && conexoesOficiais.length > 0) {
      setConexaoId(conexoesOficiais[0].id);
    }
  }, [conexoesOficiais, conexaoId]);

  // Discagem vinda do discador unificado. Este painel continua dono do WebRTC
  // e se mostra sozinho quando entra em chamada.
  useEffect(() => {
    return ouvirDiscagemOficial(({ numero: n, conexaoId: c }) => {
      const alvo = String(n || "").trim();
      if (!alvo) return;
      discarRef.current(alvo, c || null);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const limpar = useCallback(() => {
    encerrarChamadaOficial(pcRef.current, streamRef.current);
    pcRef.current = null;
    streamRef.current = null;
    callIdDiscadoRef.current = null;
    setChamada(null);
    setMudo(false);
    setDiscando(false);
  }, []);

  const mostrarRemoto = useCallback(stream => {
    if (audioRef.current) {
      audioRef.current.srcObject = stream;
      audioRef.current.play?.().catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (!user?.companyId) return undefined;
    if (!socket || typeof socket.on !== "function") return undefined;

    const eventoChamada = `company-${user.companyId}-official-call`;

    const aoEventoChamada = data => {
      if (data?.action === "incoming") {
        // Já em ligação: ignora. Recusar aqui derrubaria a chamada para o
        // atendente que estiver com ela.
        if (pcRef.current) return;
        setChamada({
          callId: data.callId,
          whatsappId: data.whatsappId,
          nome: data.name || data.number,
          numero: data.number,
          foto: data.profilePicUrl,
          sdpOferta: data.sdp,
          estado: "tocando"
        });
        return;
      }

      // Ligação feita por nós: o cliente atendeu e a Meta mandou a resposta
      // SDP. Sem aplicar isto no RTCPeerConnection a chamada fica
      // "conectada" mas muda dos dois lados.
      if (data?.action === "answer") {
        const pc = pcRef.current;
        if (!pc || pc.signalingState !== "have-local-offer") return;
        const meuCallId = callIdDiscadoRef.current;
        const meuNumero = String(ultimoAlvo.current?.numero || "").replace(/\D/g, "");
        const ehMinha = meuCallId
          ? meuCallId === data.callId
          : !!meuNumero && meuNumero === String(data.number || "").replace(/\D/g, "");
        if (!ehMinha) return;
        if (!data.sdp) {
          toast.error(i18n.t("officialCall.toasts.callFailed"));
          return;
        }
        callIdDiscadoRef.current = data.callId;
        aplicarRespostaOficial(pc, data.sdp)
          .then(() => {
            setChamada(c => (c ? { ...c, callId: data.callId, estado: "em-ligacao" } : c));
          })
          .catch(err => {
            // eslint-disable-next-line no-console
            console.error("[OFFICIAL-CALL] falha ao aplicar a resposta SDP", err);
            toast.error(err?.message || i18n.t("officialCall.toasts.callFailed"));
          });
        return;
      }

      // Outro atendente atendeu: para de tocar aqui. Quem atendeu já tem o
      // RTCPeerConnection (pcRef) e ignora o aviso.
      if (data?.action === "taken") {
        if (pcRef.current) return;
        setChamada(c => {
          if (!c || c.callId !== data.callId || c.estado !== "tocando") return c;
          toast.info(i18n.t("officialCall.toasts.takenByOther"));
          return null;
        });
        return;
      }

      if (data?.action === "ended") {
        setChamada(c => {
          if (!c || c.callId !== data.callId) return c;
          const motivo =
            data.status === "rejected"
              ? i18n.t("officialCall.toasts.rejected")
              : data.status === "missed"
                ? i18n.t("officialCall.toasts.missed")
                : data.status === "failed"
                  ? i18n.t("officialCall.toasts.callFailed")
                  : null;
          if (motivo) toast.info(motivo);
          return null;
        });
        limpar();
      }
    };

    const aoDiscando = data => {
      if (data?.callId) callIdDiscadoRef.current = data.callId;
      setChamada(c => (c ? { ...c, callId: data.callId, estado: "chamando" } : c));
      setDiscando(false);
    };

    const aoAceito = () => {
      setChamada(c => (c ? { ...c, estado: "em-ligacao" } : c));
    };

    const aoFalhar = data => {
      const erro = data?.error || i18n.t("officialCall.toasts.failed");
      toast.error(erro);
      setDiscando(false);

      // Ligação iniciada pela empresa exige autorização do contato — receber
      // uma ligação dele não vale como autorização. Em vez de deixar o
      // atendente sem saída, oferecemos o pedido na hora.
      if (/autoriz|permiss/i.test(String(erro)) && ultimoAlvo.current) {
        setPedirPara(ultimoAlvo.current);
      }

      limpar();
    };

    const aoResultadoPermissao = data => {
      if (data?.success) {
        toast.success(i18n.t("officialCall.toasts.permissionSent"));
      } else {
        toast.error(data?.error || i18n.t("officialCall.toasts.permissionFailed"));
      }
    };

    socket.on(eventoChamada, aoEventoChamada);
    socket.on("official-call:dialing", aoDiscando);
    socket.on("official-call:accepted", aoAceito);
    socket.on("official-call:failed", aoFalhar);
    socket.on("official-call:permission-result", aoResultadoPermissao);

    return () => {
      socket.off(eventoChamada, aoEventoChamada);
      socket.off("official-call:dialing", aoDiscando);
      socket.off("official-call:accepted", aoAceito);
      socket.off("official-call:failed", aoFalhar);
      socket.off("official-call:permission-result", aoResultadoPermissao);
    };
  }, [user, socket, limpar]);

  // Toque da chamada recebida.
  useEffect(() => {
    const tocando = chamada?.estado === "tocando";
    if (!tocando) {
      if (toqueRef.current) {
        try {
          toqueRef.current.pause();
          toqueRef.current.currentTime = 0;
        } catch { /* nada a fazer */ }
      }
      return undefined;
    }
    if (!toqueRef.current) {
      toqueRef.current = new Audio(somChamada);
      toqueRef.current.loop = true;
    }
    toqueRef.current.play?.().catch(() => {});
    return () => {
      try {
        toqueRef.current?.pause();
      } catch { /* nada a fazer */ }
    };
  }, [chamada]);

  const atender = async () => {
    if (!chamada?.sdpOferta) {
      toast.error(i18n.t("officialCall.toasts.noSdp"));
      return;
    }
    try {
      const { pc, stream, sdp } = await atenderChamadaOficial({
        sdpOferta: chamada.sdpOferta,
        onRemoteStream: mostrarRemoto,
        onStateChange: st => {
          if (st === "failed" || st === "disconnected") {
            toast.info(i18n.t("officialCall.toasts.lost"));
            limpar();
          }
        }
      });
      pcRef.current = pc;
      streamRef.current = stream;

      socket.emit("official-call:accept", {
        whatsappId: chamada.whatsappId,
        callId: chamada.callId,
        sdp
      });

      setChamada(c => (c ? { ...c, estado: "conectando" } : c));
    } catch (err) {
      toast.error(err.message || i18n.t("officialCall.toasts.answerFailed"));
      limpar();
    }
  };

  const recusar = () => {
    if (chamada?.callId) {
      socket.emit("official-call:reject", {
        whatsappId: chamada.whatsappId,
        callId: chamada.callId
      });
    }
    limpar();
  };

  useEffect(() => {
    discarRef.current = discar;
  });

  const desligar = () => {
    if (chamada?.callId) {
      socket.emit("official-call:hangup", {
        whatsappId: chamada.whatsappId,
        callId: chamada.callId
      });
    }
    limpar();
  };

  const discar = async (numeroDireto = null, conexaoDireta = null) => {
    // O número vem sempre do discador unificado — este painel não tem mais
    // campo próprio de digitação.
    const limpo = String(numeroDireto || "").replace(/\D/g, "");
    const conexaoAlvo = conexaoDireta || conexaoId;
    if (!limpo) {
      toast.info(i18n.t("officialCall.toasts.typeNumber"));
      return;
    }
    if (!conexaoAlvo) {
      toast.info(i18n.t("officialCall.toasts.chooseConnection"));
      return;
    }
    if (pcRef.current) {
      toast.info(i18n.t("officialCall.toasts.alreadyInCall"));
      return;
    }

    setDiscando(true);
    ultimoAlvo.current = { numero: limpo, whatsappId: conexaoAlvo };
    try {
      const { pc, stream, sdp } = await iniciarChamadaOficial({
        onRemoteStream: mostrarRemoto,
        onStateChange: st => {
          if (st === "failed" || st === "disconnected") limpar();
        }
      });
      pcRef.current = pc;
      streamRef.current = stream;

      setChamada({
        whatsappId: conexaoAlvo,
        nome: limpo,
        numero: limpo,
        estado: "chamando"
      });

      socket.emit("official-call:dial", {
        whatsappId: conexaoAlvo,
        number: limpo,
        sdp
      });
    } catch (err) {
      toast.error(err.message || i18n.t("officialCall.toasts.startFailed"));
      setDiscando(false);
      limpar();
    }
  };

  const alternarMudo = () => {
    if (!streamRef.current) return;
    const novo = !mudo;
    streamRef.current.getAudioTracks().forEach(t => {
      t.enabled = !novo;
    });
    setMudo(novo);
  };

  const emChamada = !!chamada;
  const tocando = chamada?.estado === "tocando";
  const visivel = open || emChamada;

  const rotuloEstado = () => {
    switch (chamada?.estado) {
      case "tocando":
        return i18n.t("officialCall.incoming");
      case "chamando":
        return i18n.t("officialCall.calling");
      case "conectando":
        return i18n.t("officialCall.connecting");
      case "em-ligacao":
        return i18n.t("officialCall.inCall");
      default:
        return "";
    }
  };

  const pedirPermissao = () => {
    if (!pedirPara) return;
    socket.emit("official-call:request-permission", {
      whatsappId: pedirPara.whatsappId,
      number: pedirPara.numero
    });
    setPedirPara(null);
  };

  return (
    <>
    <Dialog
      open={!!pedirPara}
      onClose={() => setPedirPara(null)}
      maxWidth="xs"
      fullWidth
      PaperProps={{ style: { borderRadius: 16 } }}
    >
      <DialogTitle>{i18n.t("officialCall.permissionTitle")}</DialogTitle>
      <DialogContent dividers>
        <Typography variant="body2">
          {i18n.t("officialCall.permissionBody")}
        </Typography>
      </DialogContent>
      <DialogActions>
        <Button onClick={() => setPedirPara(null)}>
          {i18n.t("officialCall.permissionLater")}
        </Button>
        <Button onClick={pedirPermissao} color="primary" variant="contained">
          {i18n.t("officialCall.permissionAsk")}
        </Button>
      </DialogActions>
    </Dialog>

    <Dialog
      open={visivel}
      onClose={emChamada ? undefined : onClose}
      maxWidth="xs"
      fullWidth
      PaperProps={{ style: { borderRadius: 16 } }}
    >
      <DialogTitle style={{ paddingBottom: 4 }}>
        {i18n.t("officialCall.title")}
      </DialogTitle>

      <DialogContent dividers style={{ paddingTop: 24, paddingBottom: 24 }}>
        <audio ref={audioRef} autoPlay style={{ display: "none" }} />

        {/* O painel só aparece quando há chamada. O formulário de discagem
            ficava aqui e, ao desligar, piscava na tela durante a animação de
            saída do diálogo — era o "campo para digitar número" que aparecia
            sozinho. Quem disca é o discador unificado, que chama este painel
            pela ponte de telefonia. */}
        {emChamada && (
          <Box display="flex" flexDirection="column" alignItems="center">
            <Box
              style={{
                position: "relative",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                marginBottom: 16
              }}
            >
              {/* Anel pulsante enquanto toca — só enfeite, nenhuma informação
                  nova. */}
              {tocando && (
                <span
                  style={{
                    position: "absolute",
                    width: 96,
                    height: 96,
                    borderRadius: "50%",
                    border: "2px solid #25D366",
                    animation: "chamadaPulso 1.4s ease-out infinite"
                  }}
                />
              )}
              <Avatar
                src={chamada.foto || undefined}
                style={{
                  width: 72,
                  height: 72,
                  fontSize: 28,
                  background: tocando ? "#25D366" : "#64748b",
                  color: "#fff"
                }}
              >
                {(chamada.nome || "?").charAt(0).toUpperCase()}
              </Avatar>
            </Box>

            <Typography
              variant="h6"
              align="center"
              style={{ fontWeight: 600, lineHeight: 1.2, wordBreak: "break-word" }}
            >
              {chamada.nome}
            </Typography>

            <Typography
              variant="body2"
              align="center"
              style={{ color: tocando ? "#16a34a" : "#64748b", marginTop: 4 }}
            >
              {rotuloEstado()}
            </Typography>

            <Box
              mt={3}
              width="100%"
              display="flex"
              style={{ gap: 12 }}
            >
              {tocando ? (
                <>
                  <Button
                    fullWidth
                    size="large"
                    variant="contained"
                    style={{ background: "#25D366", color: "#fff", borderRadius: 10 }}
                    startIcon={<CallIcon />}
                    onClick={atender}
                  >
                    {i18n.t("officialCall.answer")}
                  </Button>
                  <Button
                    fullWidth
                    size="large"
                    variant="outlined"
                    style={{ borderColor: "#ef4444", color: "#ef4444", borderRadius: 10 }}
                    startIcon={<CallEndIcon />}
                    onClick={recusar}
                  >
                    {i18n.t("officialCall.reject")}
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    fullWidth
                    size="large"
                    variant="contained"
                    style={{ background: "#ef4444", color: "#fff", borderRadius: 10 }}
                    startIcon={<CallEndIcon />}
                    onClick={desligar}
                  >
                    {i18n.t("officialCall.hangup")}
                  </Button>
                  <Button
                    fullWidth
                    size="large"
                    variant="outlined"
                    style={{ borderRadius: 10 }}
                    startIcon={mudo ? <MicOffIcon /> : <MicIcon />}
                    onClick={alternarMudo}
                  >
                    {mudo ? i18n.t("officialCall.unmute") : i18n.t("officialCall.mute")}
                  </Button>
                </>
              )}
            </Box>
          </Box>
        )}

        <style>{`
          @keyframes chamadaPulso {
            0%   { transform: scale(0.85); opacity: 0.9; }
            100% { transform: scale(1.35); opacity: 0; }
          }
        `}</style>
      </DialogContent>

      <DialogActions>
        <Button onClick={onClose} disabled={emChamada}>
          {i18n.t("officialCall.close")}
        </Button>
      </DialogActions>
    </Dialog>
    </>
  );
};

export default OfficialCallPanel;
