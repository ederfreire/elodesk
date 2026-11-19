import React, { useContext, useEffect, useRef, useState, useCallback } from "react";
import {
  Dialog,
  DialogTitle,
  DialogContent,
  DialogActions,
  Button,
  IconButton,
  Typography,
  Box,
  Avatar,
  Tooltip,
  TextField
} from "@material-ui/core";
import CallIcon from "@material-ui/icons/Call";
import CallEndIcon from "@material-ui/icons/CallEnd";
import VideocamIcon from "@material-ui/icons/Videocam";
import MicOffIcon from "@material-ui/icons/MicOff";
import MicIcon from "@material-ui/icons/Mic";
import { toast } from "react-toastify";
import { i18n } from "../../translate/i18n";
import { ouvirDiscagemRamal } from "../../services/telefonia";

import somChamada from "../../assets/chat_notify.mp3";

import { AuthContext } from "../../context/Auth/AuthContext";
import {
  gerarCallId,
  iniciarChamada,
  atenderChamada,
  aplicarResposta,
  adicionarCandidato,
  encerrarChamada
} from "../../services/ramalCall";

/**
 * Painel de ramais internos.
 *
 * Mostra os atendentes que têm ramal, a situação de cada um (disponível,
 * em ligação, offline) e permite ligar por voz ou vídeo. A conversa é
 * direta entre os dois navegadores — o servidor só apresenta um ao outro.
 */
const RamaisPanel = ({ open, onClose }) => {
  const { user, socket } = useContext(AuthContext);

  const [ramais, setRamais] = useState([]);
  // Espelho da lista em ref: o ouvinte do discador é registrado uma vez só
  // (deps []), então ler `ramais` direto lá pegaria sempre o array vazio
  // inicial. A ref sempre tem o valor atual.
  const ramaisRef = useRef([]);
  useEffect(() => {
    ramaisRef.current = ramais;
  }, [ramais]);
  const [discado, setDiscado] = useState("");
  const [chamada, setChamada] = useState(null);
  const [mudo, setMudo] = useState(false);
  const [transferencia, setTransferencia] = useState(null);
  // Vídeo é assimétrico de propósito: cada lado manda o que tem. Quem está
  // sem câmera continua VENDO a outra pessoa e mandando só voz.
  const [temVideoLocal, setTemVideoLocal] = useState(false);
  const [temVideoRemoto, setTemVideoRemoto] = useState(false);

  const pcRef = useRef(null);
  const streamRef = useRef(null);
  const videoLocalRef = useRef(null);
  const videoRemotoRef = useRef(null);
  const socketRef = useRef(null);
  const toqueRef = useRef(null);
  // Candidatos de rede que chegam antes da conexão existir precisam
  // esperar, senão são descartados e a ligação não conecta fora da rede
  // local.
  const candidatosPendentes = useRef([]);

  const limpar = useCallback(() => {
    encerrarChamada(pcRef.current, streamRef.current);
    pcRef.current = null;
    streamRef.current = null;
    candidatosPendentes.current = [];
    setChamada(null);
    setMudo(false);
    setTemVideoLocal(false);
    setTemVideoRemoto(false);
  }, []);

  const desligar = useCallback(
    (motivo = "ended") => {
      const s = socketRef.current;
      if (s && chamada) {
        s.emit("ramais:hangup", {
          toUserId: chamada.peerId,
          callId: chamada.callId,
          reason: motivo
        });
      }
      limpar();
    },
    [chamada, limpar]
  );

  const mostrarRemoto = useCallback(stream => {
    // O <video> remoto fica SEMPRE montado (só escondido quando não há
    // imagem). Ele também toca o áudio, então uma única ligação do
    // srcObject serve pros dois casos — e evita o bug de anexar a um
    // elemento que ainda não existe no DOM.
    setTemVideoRemoto(stream.getVideoTracks().length > 0);
    if (videoRemotoRef.current) {
      videoRemotoRef.current.srcObject = stream;
      videoRemotoRef.current.play?.().catch(() => {});
    }
  }, []);

  useEffect(() => {
    if (!user?.companyId) return undefined;
    if (!socket || typeof socket.on !== "function") return undefined;
    socketRef.current = socket;

    const aoListar = data => setRamais(Array.isArray(data) ? data : []);

    const aoReceberChamada = data => {
      // Já em ligação: recusa sozinho, sem incomodar o atendente.
      if (pcRef.current) {
        socket.emit("ramais:hangup", {
          toUserId: data.fromUserId,
          callId: data.callId,
          reason: "busy"
        });
        return;
      }
      setChamada({
        callId: data.callId,
        peerId: data.fromUserId,
        nome: data.fromName,
        ramal: data.fromExtension,
        estado: "tocando-entrada",
        video: !!data.video,
        sdpPendente: data.sdp
      });
    };

    const aoAtender = async data => {
      if (!pcRef.current) return;
      try {
        await aplicarResposta(pcRef.current, data.sdp);
        for (const c of candidatosPendentes.current) {
          await adicionarCandidato(pcRef.current, c);
        }
        candidatosPendentes.current = [];
        setChamada(c => (c ? { ...c, estado: "em-ligacao" } : c));
      } catch {
        toast.error(i18n.t("ramais.toasts.connectFailed"));
        limpar();
      }
    };

    const aoIce = async data => {
      if (!pcRef.current || !pcRef.current.remoteDescription) {
        candidatosPendentes.current.push(data.candidate);
        return;
      }
      await adicionarCandidato(pcRef.current, data.candidate);
    };

    const aoDesligar = () => limpar();

    const aoTransferencia = data => {
      // Sou o terceiro atendente: alguém quer me passar a ligação.
      if (pcRef.current) {
        return;
      }
      setTransferencia({
        deQuem: data.fromName,
        peerId: data.originalPeerId
      });
    };

    const aoFalhar = data => {
      const motivos = {
        busy: i18n.t("ramais.toasts.busy"),
        "not-found": i18n.t("ramais.toasts.notFound"),
        self: i18n.t("ramais.toasts.self")
      };
      toast.info(motivos[data?.reason] || i18n.t("ramais.toasts.failed"));
      limpar();
    };

    socket.on("ramais:list", aoListar);
    socket.on("ramais:incoming", aoReceberChamada);
    socket.on("ramais:answered", aoAtender);
    socket.on("ramais:ice", aoIce);
    socket.on("ramais:hangup", aoDesligar);
    socket.on("ramais:transferRequest", aoTransferencia);
    socket.on("ramais:failed", aoFalhar);

    // A cada 20s, o dia todo: sem checar a conexao, cada disparo com o socket
    // fora do ar vira um aviso no console.
    if (socket.connected) socket.emit("ramais:list");
    const timer = setInterval(() => {
      if (socket?.connected) socket.emit("ramais:list");
    }, 20000);

    return () => {
      clearInterval(timer);
      socket.off("ramais:list", aoListar);
      socket.off("ramais:incoming", aoReceberChamada);
      socket.off("ramais:answered", aoAtender);
      socket.off("ramais:ice", aoIce);
      socket.off("ramais:hangup", aoDesligar);
      socket.off("ramais:transferRequest", aoTransferencia);
      socket.off("ramais:failed", aoFalhar);
    };
  }, [user, socket, limpar]);

  // Toque da chamada recebida. Fica em loop enquanto está tocando e para
  // sozinho ao atender, recusar ou o outro lado desistir.
  useEffect(() => {
    const tocando = chamada?.estado === "tocando-entrada" || !!transferencia;
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
    // Navegador pode bloquear áudio automático antes de qualquer clique na
    // página; nesse caso o aviso visual continua valendo.
    toqueRef.current.play?.().catch(() => {});
    return () => {
      try {
        toqueRef.current?.pause();
      } catch { /* nada a fazer */ }
    };
  }, [chamada, transferencia]);

  const ligar = async (destino, comVideo = false, numeroDireto = null) => {
    if (pcRef.current) {
      toast.info(i18n.t("ramais.toasts.alreadyInCall"));
      return;
    }
    // Quando a chamada vem do discador unificado o numero chega por
    // parametro; o estado `discado` so vale pro teclado deste painel.
    const numeroAlvo = numeroDireto || discado;
    const callId = gerarCallId();
    setChamada({
      callId,
      peerId: destino?.userId || null,
      nome: destino?.name || `Ramal ${numeroAlvo}`,
      ramal: destino?.extension || numeroAlvo,
      estado: "chamando",
      video: comVideo
    });

    try {
      const { pc, stream } = await iniciarChamada({
        socket: socketRef.current,
        callId,
        toUserId: destino?.userId,
        extension: destino ? undefined : numeroAlvo,
        video: comVideo,
        onRemoteStream: mostrarRemoto,
        onStateChange: st => {
          if (st === "failed" || st === "disconnected") {
            toast.info(i18n.t("ramais.toasts.lost"));
            limpar();
          }
        }
      });
      pcRef.current = pc;
      streamRef.current = stream;

      // A captura pode ter caído pra só áudio (câmera ocupada por outro
      // programa). A ligação segue normalmente — só avisa e esconde a área
      // de vídeo, em vez de mostrar dois retângulos pretos.
      const temVideo = stream.getVideoTracks().length > 0;
      setTemVideoLocal(temVideo);
      if (comVideo && !temVideo) {
        // Sem câmera aqui, mas a ligação continua sendo de vídeo: eu mando
        // só voz e continuo VENDO a outra pessoa.
        toast.info(i18n.t("ramais.noCameraLocal"));
      } else if (temVideo && videoLocalRef.current) {
        videoLocalRef.current.srcObject = stream;
        videoLocalRef.current.play?.().catch(() => {});
      }
    } catch (err) {
      toast.error(err.message || i18n.t("ramais.toasts.startFailed"));
      limpar();
    }
  };

  const atender = async () => {
    if (!chamada?.sdpPendente) return;
    try {
      const { pc, stream } = await atenderChamada({
        socket: socketRef.current,
        callId: chamada.callId,
        fromUserId: chamada.peerId,
        sdp: chamada.sdpPendente,
        video: chamada.video,
        onRemoteStream: mostrarRemoto,
        onStateChange: st => {
          if (st === "failed" || st === "disconnected") limpar();
        }
      });
      pcRef.current = pc;
      streamRef.current = stream;
      for (const c of candidatosPendentes.current) {
        await adicionarCandidato(pc, c);
      }
      candidatosPendentes.current = [];
      const temVideo = stream.getVideoTracks().length > 0;
      setTemVideoLocal(temVideo);
      if (chamada.video && !temVideo) {
        toast.info(i18n.t("ramais.noCameraAnswer"));
      } else if (temVideo && videoLocalRef.current) {
        videoLocalRef.current.srcObject = stream;
        videoLocalRef.current.play?.().catch(() => {});
      }
      setChamada(c => (c ? { ...c, estado: "em-ligacao", sdpPendente: null } : c));
    } catch (err) {
      toast.error(err.message || i18n.t("ramais.toasts.answerFailed"));
      desligar("failed");
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

  const transferir = alvo => {
    if (!chamada || !socketRef.current) return;
    socketRef.current.emit("ramais:transfer", {
      toUserId: chamada.peerId,
      targetUserId: alvo.userId,
      callId: chamada.callId
    });
    toast.info(i18n.t("ramais.toasts.transferOffered", { name: alvo.name }));
    // Saio da ligação para liberar o outro lado — senão o terceiro atendente
    // encontraria a linha ocupada ao ligar de volta.
    desligar("transferred");
  };

  // Aceitei receber uma ligação transferida: ligo para o interlocutor original.
  const aceitarTransferencia = () => {
    const alvo = transferencia;
    setTransferencia(null);
    if (!alvo?.peerId) return;
    // Pequena espera para o outro lado terminar de encerrar com quem transferiu.
    setTimeout(() => {
      ligar({ userId: alvo.peerId, name: i18n.t("ramais.transferredCall") }, false);
    }, 1200);
  };

  // Discagem vinda do discador unificado. O painel continua sendo o dono do
  // WebRTC — o discador só pede a ligação. Como `ligar` já se mostra sozinho
  // ao entrar em chamada, não precisamos abrir a janela manualmente.
  useEffect(() => {
    return ouvirDiscagemRamal(({ ramal, comVideo }) => {
      const alvo = String(ramal || "").trim();
      if (!alvo) return;
      // Procura na lista pra exibir o nome de quem está sendo chamado; se não
      // achar, liga pelo número mesmo — pode ser ramal recém-cadastrado.
      const destino = ramaisRef.current.find(
        r => String(r.extension) === alvo
      );
      ligar(destino || null, !!comVideo, alvo);
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const situacao = r => {
    if (r.emLigacao) return { texto: i18n.t("ramais.onCall"), cor: "#f59e0b" };
    if (r.online) return { texto: i18n.t("ramais.available"), cor: "#10b981" };
    return { texto: i18n.t("ramais.offline"), cor: "#9ca3af" };
  };

  const emChamada = !!chamada;
  const tocandoEntrada = chamada?.estado === "tocando-entrada";

  // O painel fica montado o tempo todo para poder receber ligações, mas só
  // aparece quando o atendente abre ou quando alguém liga para ele.
  const visivel = open || emChamada || !!transferencia;

  return (
    <Dialog open={visivel} onClose={emChamada ? undefined : onClose} maxWidth="sm" fullWidth>
      <DialogTitle>{i18n.t("ramais.title")}</DialogTitle>
      <DialogContent dividers>
        {emChamada && (
          <Box mb={2} p={2} style={{ background: "rgba(78,147,255,0.08)", borderRadius: 10 }}>
            <Typography variant="subtitle1" style={{ fontWeight: 600 }}>
              {tocandoEntrada ? i18n.t("ramais.incoming") : chamada.nome}
            </Typography>
            <Typography variant="body2" color="textSecondary">
              {tocandoEntrada
                ? `${chamada.nome}${chamada.ramal ? ` · ramal ${chamada.ramal}` : ""}`
                : chamada.estado === "chamando"
                ? i18n.t("ramais.calling")
                : i18n.t("ramais.inCall")}
            </Typography>

            {/*
              O <video> remoto NUNCA é desmontado: além da imagem, é ele que
              toca a voz da outra pessoa. Se estivesse dentro de um
              condicional, numa ligação sem imagem o elemento não existiria
              no DOM e o srcObject não teria onde ser anexado. Fica com
              tamanho zero quando não há imagem — o áudio continua tocando.
            */}
            <Box
              mt={temVideoRemoto || temVideoLocal ? 1 : 0}
              display="flex"
              style={{ gap: 8 }}
            >
              <video
                ref={videoRemotoRef}
                autoPlay
                playsInline
                style={
                  temVideoRemoto
                    ? {
                        width: temVideoLocal ? "70%" : "100%",
                        borderRadius: 8,
                        background: "#000"
                      }
                    : { width: 0, height: 0 }
                }
              />
              {temVideoLocal && (
                <video
                  ref={videoLocalRef}
                  autoPlay
                  playsInline
                  muted
                  style={{
                    width: temVideoRemoto ? "30%" : "50%",
                    borderRadius: 8,
                    background: "#000"
                  }}
                />
              )}
            </Box>

            {chamada.video && !temVideoRemoto && chamada.estado === "em-ligacao" && (
              <Typography variant="caption" color="textSecondary">
                {i18n.t("ramais.noCameraRemote")}
              </Typography>
            )}

            <Box mt={2} display="flex" style={{ gap: 8 }}>
              {tocandoEntrada ? (
                <>
                  <Button
                    variant="contained"
                    style={{ background: "#10b981", color: "#fff" }}
                    startIcon={<CallIcon />}
                    onClick={atender}
                  >
                    {i18n.t("ramais.answer")}
                  </Button>
                  <Button
                    variant="outlined"
                    style={{ borderColor: "#ef4444", color: "#ef4444" }}
                    startIcon={<CallEndIcon />}
                    onClick={() => desligar("rejected")}
                  >
                    {i18n.t("ramais.reject")}
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant="contained"
                    style={{ background: "#ef4444", color: "#fff" }}
                    startIcon={<CallEndIcon />}
                    onClick={() => desligar("ended")}
                  >
                    {i18n.t("ramais.hangup")}
                  </Button>
                  <Button
                    variant="outlined"
                    startIcon={mudo ? <MicOffIcon /> : <MicIcon />}
                    onClick={alternarMudo}
                  >
                    {mudo ? i18n.t("ramais.unmute") : i18n.t("ramais.mute")}
                  </Button>
                </>
              )}
            </Box>
          </Box>
        )}

        {transferencia && !emChamada && (
          <Box mb={2} p={2} style={{ background: "rgba(245,158,11,0.12)", borderRadius: 10 }}>
            <Typography variant="subtitle1" style={{ fontWeight: 600 }}>
              {i18n.t("ramais.transferTitle")}
            </Typography>
            <Typography variant="body2" color="textSecondary">
              {i18n.t("ramais.transferFrom", { name: transferencia.deQuem })}
            </Typography>
            <Box mt={2} display="flex" style={{ gap: 8 }}>
              <Button
                variant="contained"
                style={{ background: "#10b981", color: "#fff" }}
                startIcon={<CallIcon />}
                onClick={aceitarTransferencia}
              >
                {i18n.t("ramais.accept")}
              </Button>
              <Button variant="outlined" onClick={() => setTransferencia(null)}>
                {i18n.t("ramais.reject")}
              </Button>
            </Box>
          </Box>
        )}

        <Box display="flex" style={{ gap: 8 }} mb={2}>
          <TextField
            label={i18n.t("ramais.dial")}
            value={discado}
            onChange={e => setDiscado(e.target.value.replace(/\D/g, "").slice(0, 10))}
            size="small"
            variant="outlined"
            style={{ flex: 1 }}
            disabled={emChamada}
          />
          <Button
            variant="contained"
            color="primary"
            startIcon={<CallIcon />}
            disabled={!discado || emChamada}
            onClick={() => ligar(null, false)}
          >
            {i18n.t("ramais.call")}
          </Button>
        </Box>

        {ramais.length === 0 ? (
          <Typography variant="body2" color="textSecondary">
            {i18n.t("ramais.empty")}
          </Typography>
        ) : (
          ramais.map(r => {
            const st = situacao(r);
            const indisponivel = !r.online || r.emLigacao;
            return (
              <Box
                key={r.userId}
                display="flex"
                alignItems="center"
                py={1}
                style={{ borderBottom: "1px solid rgba(0,0,0,0.06)", gap: 10 }}
              >
                <Avatar src={r.profileImage || undefined} style={{ width: 34, height: 34 }}>
                  {(r.name || "?").charAt(0).toUpperCase()}
                </Avatar>
                <Box flex={1} minWidth={0}>
                  <Typography variant="body2" style={{ fontWeight: 600 }} noWrap>
                    {r.name}
                  </Typography>
                  <Typography variant="caption" style={{ color: st.cor }}>
                    {i18n.t("ramais.extension")} {r.extension} · {st.texto}
                  </Typography>
                </Box>

                {emChamada && !tocandoEntrada ? (
                  <Tooltip title={i18n.t("ramais.transferTooltip")}>
                    <span>
                      <Button size="small" disabled={indisponivel} onClick={() => transferir(r)}>
                        {i18n.t("ramais.transfer")}
                      </Button>
                    </span>
                  </Tooltip>
                ) : (
                  <>
                    <Tooltip title={indisponivel ? st.texto : i18n.t("ramais.callVoice")}>
                      <span>
                        <IconButton
                          size="small"
                          disabled={indisponivel || emChamada}
                          onClick={() => ligar(r, false)}
                        >
                          <CallIcon
                            fontSize="small"
                            style={{ color: indisponivel ? "#c0c0c0" : "#10b981" }}
                          />
                        </IconButton>
                      </span>
                    </Tooltip>
                    <Tooltip title={indisponivel ? st.texto : i18n.t("ramais.callVideo")}>
                      <span>
                        <IconButton
                          size="small"
                          disabled={indisponivel || emChamada}
                          onClick={() => ligar(r, true)}
                        >
                          <VideocamIcon
                            fontSize="small"
                            style={{ color: indisponivel ? "#c0c0c0" : "#4E93FF" }}
                          />
                        </IconButton>
                      </span>
                    </Tooltip>
                  </>
                )}
              </Box>
            );
          })
        )}
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose} disabled={emChamada}>
          {i18n.t("ramais.close")}
        </Button>
      </DialogActions>
    </Dialog>
  );
};

export default RamaisPanel;
