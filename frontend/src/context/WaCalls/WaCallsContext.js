import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { AuthContext } from "../Auth/AuthContext";
import { toast } from "react-toastify";
import { i18n } from "../../translate/i18n";
import wacallsApi, { sipApi } from "../../services/wacallsApi";
import { openWacallsAudio, openSipAudio, isVideoCallSupported } from "../../services/wacallsWebRTC";

export const WaCallsContext = createContext({});

const initialCall = null;

// Toque de chamada: se o operador colocar um arquivo customizado em
// public/sounds/ringtone.mp3, usamos ele. Mas a instalação padrão NUNCA
// veio com esse arquivo — o comentário antigo aqui prometia um "beep
// embutido" que não existia de verdade, então toda chamada (recebida ou
// discada) tocava 100% muda: o <audio> tentava carregar um 404, o .play()
// falhava, e o catch(() => {}) engolia o erro silenciosamente. Era
// exatamente o bug "não toca nenhum tom, tum tum tum...". Agora, se o
// arquivo não existir/falhar, cai automaticamente pra um toque sintetizado
// via Web Audio API (ver playSynthRing/stopSynthRing abaixo) — sem depender
// de nenhum asset externo, sempre funciona.
const DEFAULT_RINGTONE = "/sounds/ringtone.mp3";

export const WaCallsProvider = ({ children }) => {
  const { user, isAuth, socket } = useContext(AuthContext);
  // Socket do sistema para o áudio por WebSocket (plano B do WebRTC). Em ref
  // para os callbacks memorizados sempre pegarem o atual.
  const socketAudioRef = useRef(socket);
  // callId que ESTA aba está atendendo (WhatsApp Plus): o aviso "call.taken"
  // chega também aqui e não pode fechar a ligação de quem atendeu.
  const wacallsAtendendoRef = useRef(null);
  useEffect(() => {
    socketAudioRef.current = socket;
  }, [socket]);
  const [enabled, setEnabled] = useState(true);
  const [sessions, setSessions] = useState([]);
  const [call, setCall] = useState(initialCall);
  const [dialerOpen, setDialerOpen] = useState(false);
  // Só true quando o toggle "Habilitar troncal SIP" está ligado nas
  // Configurações do SIP (GET /wacalls/sip/settings → enabled) — usado pelo
  // DialerModal pra esconder a opção "Via SIP" quando a empresa nunca
  // configurou/habilitou SIP (era mostrada sempre, mesmo sem nenhuma
  // troncal configurada, aí "Nenhum WhatsApp conectado" aparecia junto com
  // um "Via SIP" que também não ia funcionar).
  const [sipTrunkEnabled, setSipTrunkEnabled] = useState(false);
  const [missedCount, setMissedCount] = useState(0);
  const [history, setHistory] = useState([]);
  const [callAudioError, setCallAudioError] = useState(null);
  const audioRef = useRef(null);
  // Conexão de áudio real (microfone + WebRTC) da chamada em andamento.
  // Separado do estado `call` porque não precisa re-renderizar nada.
  const callAudioRef = useRef(null);

  // Chamada de vídeo (só canal wacalls — troncal SIP é sempre voz). A
  // prévia local (self-view) é um MediaStream normal, dá pra dar bind num
  // <video> direto. O vídeo REMOTO chega frame a frame via WebCodecs (ver
  // wacallsWebRTC.js) — em vez de guardar frame em estado do React (re-render
  // a 15fps seria pesado à toa), o CallModal registra um <canvas> aqui e a
  // gente desenha direto nele a cada frame decodificado.
  const [localVideoStream, setLocalVideoStream] = useState(null);
  const remoteVideoCanvasRef = useRef(null);
  const registerRemoteVideoCanvas = useCallback((el) => {
    remoteVideoCanvasRef.current = el || null;
  }, []);
  const onRemoteVideoFrame = useCallback((frame) => {
    const canvas = remoteVideoCanvasRef.current;
    if (!canvas) {
      // Nenhum <canvas> montado ainda (ex.: frame chegou antes do CallModal
      // trocar pro layout de vídeo) — só libera o frame pra não vazar
      // memória, sem desenhar.
      try { frame.close(); } catch {}
      return;
    }
    try {
      if (canvas.width !== frame.displayWidth) canvas.width = frame.displayWidth;
      if (canvas.height !== frame.displayHeight) canvas.height = frame.displayHeight;
      const ctx2d = canvas.getContext("2d");
      if (ctx2d) ctx2d.drawImage(frame, 0, 0, canvas.width, canvas.height);
    } catch {
      // Desenho pode falhar em frames isolados (canvas trocado no meio,
      // etc.) — não deve derrubar o resto da chamada.
    } finally {
      try { frame.close(); } catch {}
    }
  }, []);
  // Guarda o callId de uma discagem feita COM vídeo — o evento
  // "call.outgoing" que de fato cria o `call` no estado vem depois, de
  // forma assíncrona (socket), e não carrega a flag de vídeo (só
  // "call.incoming" carrega, ver WacallsChatCallService.ts). Sem isso, uma
  // chamada de vídeo discada pela plataforma cairia no layout de áudio
  // (sem tela de vídeo) mesmo com a câmera e o encoder já rodando.
  const pendingVideoCallIdRef = useRef(null);

  const closeCallAudio = useCallback(() => {
    try { callAudioRef.current?.close(); } catch {}
    callAudioRef.current = null;
    setLocalVideoStream(null);
  }, []);

  const refreshSessions = useCallback(async () => {
    try {
      const { data } = await wacallsApi.get("/sessions");
      setSessions(Array.isArray(data) ? data : []);
      setEnabled(true);
    } catch (e) {
      setSessions([]);
    }
  }, []);

  // Toque sintetizado (Web Audio API) — fallback automático quando
  // /sounds/ringtone.mp3 não existe ou falha ao tocar. Gera o clássico
  // padrão de toque de ligação (dois tons simultâneos, "tum... tum...",
  // 1s tocando / 3s em silêncio, repetindo) sem depender de nenhum arquivo.
  const synthRingRef = useRef(null);

  const stopSynthRing = useCallback(() => {
    const s = synthRingRef.current;
    if (!s) return;
    synthRingRef.current = null;
    try { s.stop(); } catch {}
  }, []);

  const playSynthRing = useCallback(() => {
    if (synthRingRef.current) return; // já tocando
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      const ctx = new Ctx();
      let stopped = false;
      let timer = null;

      const gain = ctx.createGain();
      gain.gain.value = 0;
      gain.connect(ctx.destination);

      const osc1 = ctx.createOscillator();
      osc1.type = "sine";
      osc1.frequency.value = 440;
      osc1.connect(gain);
      const osc2 = ctx.createOscillator();
      osc2.type = "sine";
      osc2.frequency.value = 480;
      osc2.connect(gain);
      osc1.start();
      osc2.start();

      const CYCLE_MS = 4000; // 1s tocando + 3s de silêncio, igual ligação normal
      const RING_ON_S = 1;
      const schedule = () => {
        if (stopped) return;
        const now = ctx.currentTime;
        gain.gain.setValueAtTime(0.15, now);
        gain.gain.setValueAtTime(0, now + RING_ON_S);
        timer = setTimeout(schedule, CYCLE_MS);
      };
      schedule();

      synthRingRef.current = {
        stop: () => {
          stopped = true;
          if (timer) clearTimeout(timer);
          try { osc1.stop(); } catch {}
          try { osc2.stop(); } catch {}
          try { ctx.close(); } catch {}
        }
      };
    } catch {
      // Web Audio indisponível (navegador muito antigo, política de
      // autoplay bloqueando, etc.) — sem toque nesse caso, mas não quebra
      // o resto do fluxo de chamada.
    }
  }, []);

  const stopRingtone = useCallback(() => {
    try { audioRef.current?.pause(); if (audioRef.current) audioRef.current.currentTime = 0; } catch {}
    stopSynthRing();
  }, [stopSynthRing]);

  const playRingtone = useCallback(() => {
    if (!audioRef.current) {
      const a = new Audio(DEFAULT_RINGTONE);
      a.loop = true;
      // Arquivo customizado ausente/inválido — cai pro toque sintetizado
      // em vez de tocar mudo.
      a.addEventListener("error", () => playSynthRing());
      audioRef.current = a;
    }
    try {
      const p = audioRef.current.play();
      if (p && typeof p.catch === "function") {
        p.catch(() => playSynthRing());
      }
    } catch {
      playSynthRing();
    }
  }, [playSynthRing]);

  // Sem `icon`, o navegador usa o favicon da aba como ícone da notificação
  // nativa do SO — e como o favicon padrão não é uma foto de contato, a
  // notificação de chamada recebida aparecia com um ícone genérico/quebrado
  // em vez da foto de quem está ligando. `avatarUrl` já vem resolvido pelo
  // wacalls-chat (mesmo campo usado no modal de chamada), então repassamos
  // direto pro `icon` — cai pro favicon só quando o contato realmente não
  // tem foto (LID sem foto sincronizada ainda, por exemplo).
  const notifyIncoming = useCallback((peerName, avatarUrl) => {
    try {
      if (typeof window === "undefined" || !("Notification" in window)) return;
      if (Notification.permission === "granted") {
        new Notification("Chamada recebida", {
          body: peerName || "",
          ...(avatarUrl ? { icon: avatarUrl } : {}),
        });
      }
    } catch {}
  }, []);

  // Só existe UM slot de chamada por vez nessa UI (não suporta chamadas
  // simultâneas), então pra decidir se um evento call.answered/call.ended é
  // "sobre a chamada atual" não precisamos de um match exato de callId — às
  // vezes o wacalls-chat manda um id em formato/campo levemente diferente
  // entre as etapas da mesma ligação. Bastava isso divergir uma vez pra
  // "desligar" nunca bater e a tela ficar presa mostrando "chamando..."
  // pra sempre mesmo depois do cliente encerrar do lado dele. Casar por
  // sessionId (a conexão wacalls, sempre estável) como alternativa resolve.
  const matchesCurrentCall = useCallback(
    (c, ev) => !!c && !!ev && (c.id === ev.callId || (ev.sessionId && c.sessionId === ev.sessionId)),
    []
  );

  const handleEvent = useCallback(
    (ev) => {
      if (!ev || !ev.event) return;
      switch (ev.event) {
        case "call.incoming":
          setCall({
            id: ev.callId,
            channel: "wacalls",
            sessionId: ev.sessionId,
            peer: ev.from,
            peerName: ev.pushName || ev.from,
            peerNumber: ev.number || null,
            peerAvatar: ev.avatarUrl || null,
            direction: "in",
            state: "ringing-in",
            video: !!ev.video,
            startedAt: Date.now(),
          });
          playRingtone();
          notifyIncoming(ev.pushName || ev.from, ev.avatarUrl);
          break;
        case "call.outgoing":
          setCall({
            id: ev.callId,
            channel: "wacalls",
            sessionId: ev.sessionId,
            peer: ev.from,
            peerName: ev.pushName || ev.from,
            peerNumber: ev.number || null,
            peerAvatar: ev.avatarUrl || null,
            direction: "out",
            state: "ringing-out",
            // Ver comentário em pendingVideoCallIdRef: o evento em si não
            // carrega vídeo, então recuperamos do que dial() marcou antes
            // de discar.
            video: pendingVideoCallIdRef.current === ev.callId,
            startedAt: Date.now(),
          });
          pendingVideoCallIdRef.current = null;
          playRingtone();
          break;
        case "call.claimed": {
          // Outro operador atendeu esta chamada. Fecha o card aqui — sem
          // contar como perdida (ela foi atendida, só não por mim) e sem
          // deixar botões que agiriam sobre a ligação alheia: era isso que
          // fazia um operador desligar sem querer a chamada de quem estava
          // falando.
          const claimedByMe =
            ev.owner && user?.id && String(ev.owner) === String(user.id);
          if (claimedByMe) break;
          stopRingtone();
          setCall((c) => (matchesCurrentCall(c, ev) ? null : c));
          break;
        }
        case "call.taken":
          // Outro atendente atendeu esta ligação: para de tocar aqui.
          if (wacallsAtendendoRef.current && wacallsAtendendoRef.current === ev.callId) break;
          setCall((c) => {
            if (!matchesCurrentCall(c, ev) || c.state !== "ringing-in") return c;
            stopRingtone();
            toast.info(i18n.t("officialCall.toasts.takenByOther"), { toastId: `wacalls-taken-${ev.callId}` });
            return null;
          });
          break;
        case "call.answered":
          stopRingtone();
          setCall((c) => {
            if (matchesCurrentCall(c, ev)) return { ...c, state: "active" };
            // A rede de segurança de 75s (abaixo) já pode ter limpado o card
            // antes do "call.answered" chegar — cliente atendeu perto do
            // limite do timeout, ou o evento chegou atrasado pela rede. Sem
            // isso, o agente ficava sem NENHUM controle (nem botão de
            // desligar) numa chamada que continuava tocando/ativa de
            // verdade nos bastidores ("cliente atende e some o botão de
            // desligar" — bug reportado). Reconstrói o mínimo pra devolver
            // o controle em vez de descartar o evento silenciosamente.
            if (!c && ev.callId) {
              return {
                id: ev.callId,
                channel: "wacalls",
                sessionId: ev.sessionId,
                peer: ev.from,
                peerName: ev.from,
                peerNumber: null,
                peerAvatar: null,
                direction: "out",
                state: "active",
                startedAt: Date.now()
              };
            }
            return c;
          });
          break;
        case "call.ended":
          stopRingtone();
          closeCallAudio();
          setCall((c) => {
            if (matchesCurrentCall(c, ev) && c.state === "ringing-in") {
              setMissedCount((n) => n + 1);
            }
            return matchesCurrentCall(c, ev) ? { ...c, state: "ended" } : c;
          });
          setTimeout(() => setCall(null), 1500);
          break;

        // Troncal SIP (baresip) — mesma máquina de estados do WhatsApp acima,
        // só que sem sessionId (a troncal é única/global pro servidor) e com
        // channel:"sip" pra answer/hangup/reject saberem qual API chamar (ver
        // handleWacallsSipCallService.ts no backend).
        case "sip.incoming":
          setCall({
            id: ev.callId,
            channel: "sip",
            peer: ev.peer,
            peerName: ev.peerName || ev.peer,
            peerNumber: ev.peer || null,
            peerAvatar: null,
            direction: "in",
            state: "ringing-in",
            startedAt: Date.now(),
          });
          playRingtone();
          notifyIncoming(ev.peerName || ev.peer, null);
          break;
        case "sip.outgoing":
          setCall((c) =>
            c && c.id === ev.callId
              ? c
              : {
                  id: ev.callId,
                  channel: "sip",
                  peer: ev.peer,
                  peerName: ev.peerName || ev.peer,
                  peerNumber: ev.peer || null,
                  peerAvatar: null,
                  direction: "out",
                  state: "ringing-out",
                  startedAt: Date.now(),
                }
          );
          playRingtone();
          break;
        case "sip.answered":
          stopRingtone();
          setCall((c) => (c && c.id === ev.callId ? { ...c, state: "active" } : c));
          break;
        case "sip.ended":
          stopRingtone();
          closeCallAudio();
          setCall((c) => {
            if (c && c.id === ev.callId && c.state === "ringing-in") {
              setMissedCount((n) => n + 1);
            }
            return c && c.id === ev.callId ? { ...c, state: "ended" } : c;
          });
          setTimeout(() => setCall(null), 1500);
          break;
        default:
          break;
      }
    },
    // user entra aqui por causa do case "call.claimed", que compara o dono
    // da chamada com o operador logado pra decidir se fecha o card.
    [playRingtone, notifyIncoming, stopRingtone, closeCallAudio, matchesCurrentCall, user]
  );

  // Rede de segurança: se por algum motivo o evento call.ended nunca chegar
  // (perda de pacote, bug do lado do wacalls-chat, etc.), a tela de chamada
  // não pode ficar presa pra sempre parecendo que ainda está tocando/em
  // andamento. WhatsApp encerra chamadas não atendidas sozinho por volta
  // de 45-60s; damos uma margem e limpamos do nosso lado como último
  // recurso.
  //
  // Depende só de `call.id`/`call.state` (não do objeto `call` inteiro):
  // o WhatsApp reenvia o offer de chamada periodicamente enquanto o
  // telefone continua tocando, e cada reenvio recriava um novo objeto
  // `call` (mesmo id, mesmo estado) em handleEvent — como esse efeito
  // dependia do objeto inteiro, cada reenvio reiniciava a contagem de 75s
  // do zero, e o card de chamada nunca chegava a ser limpo enquanto os
  // reenvios continuassem (era o bug "fica preso pra sempre"). Fixado
  // também do lado do backend (WacallsChatCallService.ts, case
  // "incoming"), mas mantemos essa rede de segurança mais robusta aqui.
  //
  // 75s -> 120s: um cliente que demora perto de 75s pra atender colidia
  // direto com esse timeout — o watchdog limpava o card no MESMO instante
  // (ou um pouco antes) do "call.answered" chegar, e como o handler acima
  // só atualiza uma chamada que ainda existe no estado, o card sumia com a
  // ligação de verdade continuando ativa nos bastidores (era o bug "cliente
  // atende e some o botão de desligar"). 120s dá bem mais margem: como o
  // WhatsApp já encerra sozinho uma chamada não atendida por volta de
  // 45-60s (mandando "call-ended", tratado separadamente), esse timeout só
  // deveria disparar mesmo em caso de evento perdido, não em uso normal.
  useEffect(() => {
    if (!call || (call.state !== "ringing-in" && call.state !== "ringing-out")) return;
    const callId = call.id;
    const callState = call.state;
    const timeout = setTimeout(() => {
      setCall((c) => (c && c.id === callId && c.state === callState ? null : c));
      stopRingtone();
    }, 120000);
    return () => clearTimeout(timeout);
  }, [call?.id, call?.state, stopRingtone]);

  // getUserMedia devolve DOMException com texto sempre em inglês,
  // independente do idioma do navegador (ex: "Requested device not found") —
  // sem isso, o card de chamada mostrava esse texto cru colado direto antes
  // do aviso em português do CallModal, sem nem pontuação entre os dois
  // ("Requested device not found Verifique a permissão..."), confuso pro
  // agente. Traduz os casos mais comuns pelo `name` da exceção (estável
  // entre navegadores/idiomas, ao contrário do `message`).
  const micErrorMessage = (err) => {
    switch (err?.name) {
      case "NotFoundError":
      case "DevicesNotFoundError":
        return "Nenhum microfone foi encontrado pelo navegador. Verifique se há um microfone conectado e ativado no computador.";
      case "NotAllowedError":
      case "PermissionDeniedError":
      case "SecurityError":
        return "O navegador bloqueou o acesso ao microfone. Autorize o microfone pra este site nas configurações do navegador.";
      case "NotReadableError":
      case "TrackStartError":
        return "Não foi possível acessar o microfone — ele pode estar em uso por outro programa.";
      case "OverconstrainedError":
        return "O microfone selecionado não está mais disponível.";
      default:
        return err?.message || "Não foi possível acessar o microfone.";
    }
  };

  const buildJid = (number) => {
    const clean = String(number || "").replace(/\D/g, "");
    if (!clean) return "";
    return clean.includes("@") ? clean : `${clean}@s.whatsapp.net`;
  };

  const dial = useCallback(
    async (numberOrJid, sessionId, opts = {}) => {
      const sid = sessionId || (sessions[0] && sessions[0].id);
      if (!sid) throw new Error("Nenhuma sessão de chamada conectada");
      const toJid = String(numberOrJid).includes("@")
        ? String(numberOrJid)
        : buildJid(numberOrJid);
      const wantVideo = !!opts?.video;
      const { data } = await wacallsApi.post("/calls/dial", { sessionId: sid, toJid, video: wantVideo });
      const callId = data?.call?.callId || data?.callId;
      // Abre microfone/áudio (+ câmera, se wantVideo) já no disque, igual ao
      // wacalls-chat original — o áudio/vídeo só flui de verdade quando o
      // outro lado atender, mas o cano já fica pronto.
      if (callId) {
        if (wantVideo) pendingVideoCallIdRef.current = callId;
        try {
          setCallAudioError(null);
          closeCallAudio();
          const opened = await openWacallsAudio(wacallsApi, sid, callId, { video: wantVideo, onRemoteVideoFrame, socket: socketAudioRef.current });
          callAudioRef.current = opened;
          setLocalVideoStream(opened.videoStream || null);
        } catch (err) {
          setCallAudioError(micErrorMessage(err));
        }
      }
      return data;
    },
    [sessions, closeCallAudio, onRemoteVideoFrame]
  );

  // Chamada SIP (troncal via baresip) — número puro, sem sessão/JID. Ver
  // openDialer/DialerModal pro toggle WhatsApp/SIP na UI.
  const dialSip = useCallback(
    async (number) => {
      const { data } = await sipApi.post("/calls/dial", { number: String(number || "") });
      const callId = data?.call?.callId || data?.callId;
      if (callId) {
        try {
          setCallAudioError(null);
          closeCallAudio();
          callAudioRef.current = await openSipAudio(sipApi, callId);
        } catch (err) {
          setCallAudioError(micErrorMessage(err));
        }
      }
      return data;
    },
    [closeCallAudio]
  );

  const answer = useCallback(async () => {
    if (!call) return;
    const isSip = call.channel === "sip";
    if (isSip) {
      await sipApi.post(`/calls/${call.id}/answer`, {});
    } else {
      wacallsAtendendoRef.current = call.id;
      try {
        await wacallsApi.post(`/calls/${call.id}/answer`, { sessionId: call.sessionId });
      } catch (err) {
        wacallsAtendendoRef.current = null;
        throw err;
      }
    }
    stopRingtone();
    const openAudio = () =>
      isSip
        ? openSipAudio(sipApi, call.id)
        : openWacallsAudio(wacallsApi, call.sessionId, call.id, { video: !!call.video, onRemoteVideoFrame, socket: socketAudioRef.current });
    try {
      setCallAudioError(null);
      closeCallAudio();
      const opened = await openAudio();
      callAudioRef.current = opened;
      setLocalVideoStream(opened.videoStream || null);
    } catch (err) {
      // Bug relatado (SIP): a ligação era desligada de imediato assim que o
      // operador atendia. Causa provável: /answer (accept no baresip) já
      // deixa a chamada "estabelecida" do lado da troncal quase na hora,
      // enquanto abrir a ponte de áudio no navegador (permissão de
      // microfone + AudioWorklet + negociação ICE + POST /webrtc) leva um
      // tempinho — se nesse meio tempo a chamada mudar de estado (ex.: o
      // ID deixou de ser "a chamada atual" por uma fração de segundo), a
      // primeira tentativa de abrir áudio falha mesmo com a ligação real
      // ainda de pé. Antes, QUALQUER falha aqui desligava a ligação de
      // verdade na hora — inclusive esse caso passageiro. Agora tenta mais
      // uma vez antes de desistir.
      console.error("[wacalls] falha ao abrir áudio da chamada, tentando de novo em 800ms", err);
      await new Promise((resolve) => setTimeout(resolve, 800));
      try {
        setCallAudioError(null);
        closeCallAudio();
        const opened2 = await openAudio();
        callAudioRef.current = opened2;
        setLocalVideoStream(opened2.videoStream || null);
      } catch (err2) {
        // Persistiu mesmo na segunda tentativa — aí sim provavelmente é
        // microfone bloqueado/indisponível de verdade. Sem áudio não
        // adianta manter a ligação "atendida" travada — desliga dos dois
        // lados e avisa o operador.
        console.error("[wacalls] falha ao abrir áudio da chamada (2ª tentativa)", err2);
        setCallAudioError(err2?.message || "Não foi possível acessar o microfone.");
        try {
          if (isSip) await sipApi.post(`/calls/${call.id}/hangup`, {});
          else await wacallsApi.post(`/calls/${call.id}/hangup`, { sessionId: call.sessionId });
        } catch {}
        setCall(null);
      }
    }
  }, [call, stopRingtone, closeCallAudio, onRemoteVideoFrame]);

  const hangup = useCallback(async () => {
    if (!call) return;
    closeCallAudio();
    if (call.channel === "sip") {
      await sipApi.post(`/calls/${call.id}/hangup`, {});
    } else {
      await wacallsApi.post(`/calls/${call.id}/hangup`, { sessionId: call.sessionId });
    }
    stopRingtone();
    setCall(null);
  }, [call, stopRingtone, closeCallAudio]);

  const reject = useCallback(async () => {
    if (!call) return;
    closeCallAudio();
    if (call.channel === "sip") {
      await sipApi.post(`/calls/${call.id}/hangup`, { reject: true });
    } else {
      await wacallsApi.post(`/calls/${call.id}/hangup`, { sessionId: call.sessionId, reject: true });
    }
    stopRingtone();
    setCall(null);
  }, [call, stopRingtone, closeCallAudio]);

  const openDialer = useCallback(() => {
    setMissedCount(0);
    setDialerOpen(true);
    // As sessões só eram buscadas uma vez, no login — se a conexão pareava
    // DEPOIS que a página já estava aberta (muito comum, o QR demora um
    // pouco), o discador ficava pra sempre achando que "nenhuma sessão
    // conectada" mesmo com a conexão realmente ativa. Busca de novo toda
    // vez que abre.
    refreshSessions();
    // Mesma lógica pro SIP: busca o estado atual do toggle "Habilitar
    // troncal SIP" toda vez que o discador abre (não só uma vez no login),
    // pra refletir na hora se o admin ligou/desligou SIP nas Configurações
    // enquanto o atendente já estava com a página aberta. Falha (troncal
    // nunca configurada, wacalls-chat fora do ar, etc.) = trata como
    // desabilitado, não deixa a opção "Via SIP" aparecer sem funcionar.
    sipApi
      .get("/settings")
      .then(({ data }) => setSipTrunkEnabled(!!data?.enabled))
      .catch(() => setSipTrunkEnabled(false));
  }, [refreshSessions]);
  const closeDialer = useCallback(() => setDialerOpen(false), []);

  const loadHistory = useCallback(async () => {
    try {
      const { data } = await wacallsApi.get("/calls/history").catch(() => ({ data: [] }));
      setHistory(Array.isArray(data) ? data : []);
    } catch { setHistory([]); }
  }, []);

  useEffect(() => {
    if (!user || !isAuth) return;
    refreshSessions();
    if (typeof window !== "undefined" && "Notification" in window && Notification.permission === "default") {
      try { Notification.requestPermission(); } catch {}
    }
  }, [user, isAuth, refreshSessions]);

  useEffect(() => {
    if (!user || !isAuth || !socket) return;
    const companyId = user.companyId;
    const eventName = `company-${companyId}-wacalls`;
    socket.on(eventName, handleEvent);
    return () => { socket.off(eventName, handleEvent); };
  }, [user, isAuth, socket, handleEvent]);

  // Reforço: sempre que qualquer conexão mudar de status (ex: terminou de
  // parear e virou CONNECTED), busca a lista de sessões de novo — sem isso,
  // uma conexão que pareia com a página já aberta só aparece pro discador
  // depois de um F5.
  useEffect(() => {
    if (!user || !isAuth || !socket) return;
    const companyId = user.companyId;
    const eventName = `company-${companyId}-whatsappSession`;
    const onSessionUpdate = (data) => {
      if (data?.action === "update" && data?.session?.channel === "wacalls") {
        refreshSessions();
      }
    };
    socket.on(eventName, onSessionUpdate);
    return () => { socket.off(eventName, onSessionUpdate); };
  }, [user, isAuth, socket, refreshSessions]);

  const value = useMemo(
    () => ({
      enabled,
      sessions,
      call,
      dialerOpen,
      missedCount,
      history,
      callAudioError,
      sipTrunkEnabled,
      refreshSessions,
      dial,
      dialSip,
      answer,
      reject,
      hangup,
      openDialer,
      closeDialer,
      loadHistory,
      // Chamada de vídeo (canal wacalls) — ver wacallsWebRTC.js.
      // videoCallSupported: false esconde o botão de câmera em
      // navegadores sem WebCodecs/MediaStreamTrackProcessor (Firefox/
      // Safari hoje) — áudio continua funcionando normal neles.
      videoCallSupported: isVideoCallSupported(),
      localVideoStream,
      registerRemoteVideoCanvas,
    }),
    [
      enabled, sessions, call, dialerOpen, missedCount, history, callAudioError, sipTrunkEnabled,
      refreshSessions, dial, dialSip, answer, reject, hangup, openDialer, closeDialer,
      loadHistory, localVideoStream, registerRemoteVideoCanvas,
    ]
  );

  return <WaCallsContext.Provider value={value}>{children}</WaCallsContext.Provider>;
};

export const useWaCalls = () => useContext(WaCallsContext);
