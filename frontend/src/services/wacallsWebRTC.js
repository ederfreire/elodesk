// Áudio real de chamada wacalls, portado de wacalls-chat (client/src/lib/webrtc.ts).
// Mesmo transporte: WebRTC só pra atravessar NAT/criptografar, o áudio em si
// viaja como PCM cru (Int16) por um DataChannel — não é a via de mídia padrão
// (RTCPeerConnection.addTrack/ontrack). O codec real (mlow) fica no servidor
// wacalls-chat; aqui só empacota/desempacota PCM 16kHz mono.
const SAMPLE_RATE = 16000;
const PCM_CHANNEL_LABEL = "pcm";
const CAPTURE_WORKLET_URL = "/worklets/capture-processor.js";
const PLAYBACK_WORKLET_URL = "/worklets/playback-processor.js";
const CAPTURE_PROCESSOR_NAME = "capture-processor";
const PLAYBACK_PROCESSOR_NAME = "playback-processor";

// Chamada de vídeo (WhatsApp Plus / wacalls-chat only — a troncal SIP não
// tem vídeo). O backend (bridge.go) espera vídeo H.264 cru (Annex-B, um
// access unit por mensagem) num segundo DataChannel rotulado "h264" — igual
// o canal "pcm" já usado pro áudio, só que sem worklet nenhum: quem
// codifica/decodifica o H.264 é o próprio navegador via WebCodecs
// (VideoEncoder/VideoDecoder), o servidor só retransmite os bytes prontos
// pro WhatsApp (ver callmanager_video.go/h264_packet.go no wacalls-chat).
// Baseado no design do meowcaller (github.com/purpshell/meowcaller, branch
// rajeh/thin-media-backend) — mesma ideia: a lib/servidor não mexe em
// pixel nenhum, só carrega o H.264 já pronto de um lado pro outro.
const H264_CHANNEL_LABEL = "h264";
const VIDEO_WIDTH = 640;
const VIDEO_HEIGHT = 480;
const VIDEO_FPS = 15;
const VIDEO_BITRATE = 700000;
// Intervalo de keyframe forçado — sem isso, se um pacote com um frame-chave
// se perder, o vídeo remoto trava/embaralha até o encoder mandar outro por
// conta própria (pode demorar). Força um a cada ~4s como rede de segurança.
const VIDEO_KEYFRAME_INTERVAL_MS = 4000;

// WebCodecs (VideoEncoder/VideoDecoder) + MediaStreamTrackProcessor (parte
// da API "Insertable Streams") — hoje só Chrome/Edge/Opera (base Chromium)
// têm as três. Firefox e Safari ainda não implementam
// MediaStreamTrackProcessor pra vídeo. Chamada de vídeo cai automaticamente
// pra indisponível (UI deve esconder o botão de câmera) nesses navegadores
// — a chamada de ÁUDIO continua funcionando normal em todos, só o vídeo
// depende disso.
export const isVideoCallSupported = () =>
  typeof window !== "undefined" &&
  typeof window.VideoEncoder === "function" &&
  typeof window.VideoDecoder === "function" &&
  typeof window.MediaStreamTrackProcessor === "function";

// Varre um access unit Annex-B (pode ter vários NAL units concatenados,
// cada um com start code 00 00 01 ou 00 00 00 01 na frente) procurando um
// NAL type 5 (IDR/keyframe) — mesma lógica de AUHasIDR no lado Go
// (internal/voip/transport, e rtp/h264.go do meowcaller). Precisamos disso
// aqui porque o VideoDecoder do WebCodecs exige que cada EncodedVideoChunk
// declare seu próprio type ("key"/"delta") — os bytes crus que chegam pelo
// DataChannel não têm essa informação, só o conteúdo do NAL em si.
const annexBHasIDR = (au) => {
  for (let i = 0; i + 3 < au.length; i += 1) {
    const isStart4 = au[i] === 0 && au[i + 1] === 0 && au[i + 2] === 0 && au[i + 3] === 1;
    const isStart3 = !isStart4 && au[i] === 0 && au[i + 1] === 0 && au[i + 2] === 1;
    if (!isStart4 && !isStart3) continue;
    const naluStart = i + (isStart4 ? 4 : 3);
    if (naluStart >= au.length) continue;
    const nalType = au[naluStart] & 0x1f;
    if (nalType === 5) return true;
    i = naluStart;
  }
  return false;
};

const float32ToInt16LE = (pcm) => {
  const view = new DataView(new ArrayBuffer(pcm.length * 2));
  for (let i = 0; i < pcm.length; i += 1) {
    let s = pcm[i];
    if (Number.isNaN(s)) s = 0;
    else if (s > 1) s = 1;
    else if (s < -1) s = -1;
    view.setInt16(i * 2, s < 0 ? Math.round(s * 32768) : Math.round(s * 32767), true);
  }
  return view.buffer;
};

const int16LEToFloat32 = (buf) => {
  const view = new DataView(buf);
  const n = Math.floor(buf.byteLength / 2);
  const out = new Float32Array(n);
  for (let i = 0; i < n; i += 1) out[i] = view.getInt16(i * 2, true) / 32768;
  return out;
};

const waitForIceGathering = (pc, timeoutMs = 1000) =>
  new Promise((resolve) => {
    if (pc.iceGatheringState === "complete") {
      resolve();
      return;
    }
    let done = false;
    let timer;
    const finish = () => {
      if (done) return;
      done = true;
      if (timer) clearTimeout(timer);
      pc.removeEventListener("icegatheringstatechange", onChange);
      resolve();
    };
    const onChange = () => {
      if (pc.iceGatheringState === "complete") finish();
    };
    pc.addEventListener("icegatheringstatechange", onChange);
    timer = setTimeout(finish, timeoutMs);
  });

// Envia o vídeo local (câmera) codificado em H.264 pro DataChannel "h264" —
// lado do encoder. `videoTrack` é a track de vídeo já capturada via
// getUserMedia. MediaStreamTrackProcessor entrega os frames crus da câmera
// como um ReadableStream<VideoFrame> (API "Insertable Streams") pro
// VideoEncoder consumir.
const startVideoSender = (dc, videoTrack) => {
  const processor = new MediaStreamTrackProcessor({ track: videoTrack });
  const reader = processor.readable.getReader();
  let stopped = false;
  let lastKeyframeAt = 0;

  const encoder = new VideoEncoder({
    output: (chunk) => {
      if (dc.readyState !== "open") return;
      const buf = new Uint8Array(chunk.byteLength);
      chunk.copyTo(buf);
      try { dc.send(buf); } catch {}
    },
    error: (e) => console.error("[wacalls] erro no encoder de vídeo", e),
  });
  encoder.configure({
    // Baseline profile nível 3.0 — perfil mais compatível/leve do H.264,
    // sem os recursos avançados (B-frames etc.) que aumentam latência.
    codec: "avc1.42E01E",
    width: VIDEO_WIDTH,
    height: VIDEO_HEIGHT,
    bitrate: VIDEO_BITRATE,
    framerate: VIDEO_FPS,
    avc: { format: "annexb" },
    latencyMode: "realtime",
  });

  const pump = async () => {
    while (!stopped) {
      let result;
      try {
        result = await reader.read();
      } catch {
        break;
      }
      if (result.done) break;
      const frame = result.value;
      if (!frame) continue;
      const now = (typeof performance !== "undefined" ? performance.now() : Date.now());
      const forceKey = now - lastKeyframeAt > VIDEO_KEYFRAME_INTERVAL_MS;
      try {
        // encodeQueueSize alto = encoder afogado (CPU fraca/frame muito
        // grande) — pula frames em vez de acumular atraso crescente
        // (prioriza vídeo "ao vivo" a vídeo "completo").
        if (encoder.state === "configured" && encoder.encodeQueueSize < 2) {
          encoder.encode(frame, { keyFrame: forceKey });
          if (forceKey) lastKeyframeAt = now;
        }
      } catch (err) {
        console.error("[wacalls] falha ao codificar frame de vídeo", err);
      } finally {
        frame.close();
      }
    }
  };
  pump();

  return {
    close: () => {
      stopped = true;
      try { reader.cancel(); } catch {}
      try { if (encoder.state !== "closed") encoder.close(); } catch {}
    },
  };
};

// Recebe H.264 do peer pelo DataChannel "h264" e decodifica pra VideoFrame —
// lado do decoder. `onFrame(frame)` é chamado com cada frame decodificado;
// quem recebe é responsável por desenhar (ex.: canvas) e chamar
// `frame.close()` depois (VideoFrame precisa ser liberado manualmente, senão
// vaza memória de vídeo rápido).
const startVideoReceiver = (dc, onFrame) => {
  let decoder = null;
  let gotFirstKey = false;

  const makeDecoder = () => {
    const d = new VideoDecoder({
      output: (frame) => {
        if (onFrame) onFrame(frame);
        else frame.close();
      },
      error: (e) => {
        // Stream corrompido/pacote perdido de um jeito que o decoder não
        // aguenta — em vez de travar pra sempre, descarta o decoder e
        // espera o próximo keyframe pra recriar (o encoder do outro lado
        // manda um a cada ~4s de qualquer forma, ver
        // VIDEO_KEYFRAME_INTERVAL_MS).
        console.warn("[wacalls] decoder de vídeo com erro, aguardando próximo keyframe", e);
        gotFirstKey = false;
        try { decoder && decoder.state !== "closed" && decoder.close(); } catch {}
        decoder = null;
      },
    });
    d.configure({ codec: "avc1.42E01E", avc: { format: "annexb" }, optimizeForLatency: true });
    return d;
  };

  dc.onmessage = (e) => {
    const bytes = new Uint8Array(e.data);
    const isKey = annexBHasIDR(bytes);
    if (isKey) {
      gotFirstKey = true;
      if (!decoder) decoder = makeDecoder();
    }
    // Descarta delta frames até o primeiro keyframe chegar — decodificar
    // sem referência de keyframe corrompe/trava o decoder.
    if (!gotFirstKey || !decoder) return;
    try {
      decoder.decode(new EncodedVideoChunk({
        type: isKey ? "key" : "delta",
        timestamp: (typeof performance !== "undefined" ? performance.now() : Date.now()) * 1000,
        data: bytes,
      }));
    } catch (err) {
      console.error("[wacalls] falha ao decodificar frame de vídeo recebido", err);
    }
  };

  return {
    close: () => {
      dc.onmessage = null;
      try { decoder && decoder.state !== "closed" && decoder.close(); } catch {}
      decoder = null;
    },
  };
};

/**
 * Núcleo agnóstico de origem do áudio (WhatsApp via wacalls-chat OU SIP via
 * baresip — dos dois lados do servidor, o formato na perna do navegador é
 * idêntico: DataChannel "pcm" com PCM Int16 LE 16kHz mono, ver bridge.go no
 * wacalls-chat). `exchangeSdp(offerSdp)` é quem sabe pra qual endpoint HTTP
 * mandar a oferta (chamada WhatsApp vs. chamada SIP) e devolve o SDP de
 * resposta.
 *
 * `opts.video` liga a câmera (só faz sentido pro lado wacalls — a troncal
 * SIP nunca passa isso). `opts.onRemoteVideoFrame(frame)`, se informado, é
 * chamado com cada VideoFrame decodificado do peer — quem chama é
 * responsável por desenhar e fechar o frame.
 *
 * Retorna `{ pc, close, videoStream }`. `videoStream` só existe quando
 * `opts.video` é true — é a MediaStream da câmera local, pra dar bind num
 * `<video>` de auto-preview (não passa pela ponte H.264, é só a prévia
 * local — o que de fato viaja pro peer é o output do encoder).
 */
// ---------------------------------------------------------------------------
// Áudio por WebSocket (plano B do WebRTC) — ideia do ArendCalls (MIT).
// Quando o canal WebRTC não abre em alguns segundos (UDP bloqueado no
// servidor ou na rede do atendente), o áudio passa a ir pelo próprio socket
// do sistema (HTTPS), sem derrubar a ligação. Depois de cair para o
// WebSocket, este navegador começa pelo WebSocket por 30 minutos.
// ---------------------------------------------------------------------------
const WEBRTC_ABRIR_MS = 4000;
const PREF_WS_CHAVE = "wacalls-audio-ws-ate";
const PREF_WS_MS = 30 * 60 * 1000;

const preferirWebSocket = () => {
  try {
    return Number(localStorage.getItem(PREF_WS_CHAVE) || 0) > Date.now();
  } catch {
    return false;
  }
};
const lembrarWebSocket = () => {
  try {
    localStorage.setItem(PREF_WS_CHAVE, String(Date.now() + PREF_WS_MS));
  } catch {}
};

/** Transporte de áudio pelo socket do sistema (backend → wacalls-chat). */
const abrirAudioPorSocket = (socket, sessionId, callId, onPcm) =>
  new Promise((resolve, reject) => {
    if (!socket) {
      reject(new Error("sem conexão com o servidor"));
      return;
    }
    let aberto = false;
    const meu = (d) => d && String(d.callId) === String(callId);
    const aoPcm = (d) => {
      if (meu(d) && d.pcm) onPcm(d.pcm);
    };
    const aoAbrir = (d) => {
      if (!meu(d)) return;
      aberto = true;
      clearTimeout(limite);
      resolve({
        send: (buf) => socket.emit("wacalls-audio:pcm", { callId, pcm: buf }),
        close: () => {
          socket.emit("wacalls-audio:close", { callId });
          limpar();
        },
      });
    };
    const aoErro = (d) => {
      if (!meu(d)) return;
      if (!aberto) {
        clearTimeout(limite);
        limpar();
        reject(new Error(d.error || "falha no áudio"));
      } else {
        console.warn("[wacalls] áudio por WebSocket:", d.error);
      }
    };
    const aoFechar = (d) => {
      if (!meu(d)) return;
      limpar();
    };
    const limpar = () => {
      socket.off("wacalls-audio:pcm", aoPcm);
      socket.off("wacalls-audio:opened", aoAbrir);
      socket.off("wacalls-audio:error", aoErro);
      socket.off("wacalls-audio:closed", aoFechar);
    };
    const limite = setTimeout(() => {
      limpar();
      reject(new Error("o áudio por WebSocket não abriu"));
    }, 10000);
    socket.on("wacalls-audio:pcm", aoPcm);
    socket.on("wacalls-audio:opened", aoAbrir);
    socket.on("wacalls-audio:error", aoErro);
    socket.on("wacalls-audio:closed", aoFechar);
    socket.emit("wacalls-audio:open", { sessionId, callId });
  });

const esperarCanalAbrir = (dc, ms) =>
  new Promise((resolve) => {
    if (dc.readyState === "open") return resolve(true);
    const t = setTimeout(() => resolve(false), ms);
    dc.addEventListener("open", () => {
      clearTimeout(t);
      resolve(true);
    });
  });

const openPcmAudio = async (exchangeSdp, opts = {}) => {
  const { micDeviceId = null, video = false, cameraDeviceId = null, onRemoteVideoFrame = null } = opts;
  // abrirPorSocket(onPcm) → Promise<{send, close}>: plano B por WebSocket
  // (só existe para as ligações do WhatsApp Plus; SIP segue só no WebRTC).
  const abrirPorSocket = typeof opts.abrirPorSocket === "function" ? opts.abrirPorSocket : null;
  const comecarPeloSocket = !!abrirPorSocket && preferirWebSocket() && !video;
  const wantVideo = (!!video && isVideoCallSupported()) && !comecarPeloSocket;
  if (video && !wantVideo) {
    console.warn("[wacalls] chamada de vídeo pedida mas o navegador não suporta WebCodecs/MediaStreamTrackProcessor — seguindo só com áudio");
  }

  const localStream = await navigator.mediaDevices.getUserMedia({
    audio: micDeviceId ? { deviceId: { exact: micDeviceId } } : true,
    video: wantVideo
      ? {
          deviceId: cameraDeviceId ? { exact: cameraDeviceId } : undefined,
          width: VIDEO_WIDTH,
          height: VIDEO_HEIGHT,
          frameRate: VIDEO_FPS,
        }
      : false,
  });

  const pc = new RTCPeerConnection({ iceServers: [] });
  const dc = pc.createDataChannel(PCM_CHANNEL_LABEL, { ordered: true });
  dc.binaryType = "arraybuffer";
  const videoDc = wantVideo ? pc.createDataChannel(H264_CHANNEL_LABEL, { ordered: false, maxRetransmits: 0 }) : null;
  if (videoDc) videoDc.binaryType = "arraybuffer";

  const ctx = new AudioContext({ sampleRate: SAMPLE_RATE });
  await ctx.audioWorklet.addModule(CAPTURE_WORKLET_URL);
  await ctx.audioWorklet.addModule(PLAYBACK_WORKLET_URL);
  await ctx.resume();

  const micSource = ctx.createMediaStreamSource(localStream);
  const captureNode = new AudioWorkletNode(ctx, CAPTURE_PROCESSOR_NAME);
  // Para onde vai o microfone: canal WebRTC ou, no plano B, o socket.
  let enviar = (buf) => {
    if (dc.readyState === "open") dc.send(buf);
  };
  let viaSocket = null;
  captureNode.port.onmessage = (e) => {
    enviar(float32ToInt16LE(e.data));
  };
  micSource.connect(captureNode);
  const captureSink = ctx.createGain();
  captureSink.gain.value = 0;
  captureNode.connect(captureSink).connect(ctx.destination);

  const playbackNode = new AudioWorkletNode(ctx, PLAYBACK_PROCESSOR_NAME);
  const streamDest = ctx.createMediaStreamDestination();
  playbackNode.connect(streamDest);
  const silentSink = ctx.createGain();
  silentSink.gain.value = 0;
  playbackNode.connect(silentSink).connect(ctx.destination);
  const fallbackSpeaker = ctx.createGain();
  fallbackSpeaker.gain.value = 0;
  playbackNode.connect(fallbackSpeaker).connect(ctx.destination);

  const remoteAudio = new Audio();
  remoteAudio.autoplay = true;
  remoteAudio.playsInline = true;
  remoteAudio.srcObject = streamDest.stream;
  await remoteAudio.play().catch(() => {
    // Alguns navegadores bloqueiam play() automático fora de um gesto do
    // usuário — cai pro fallback via WebAudio, que já está tocando no
    // clique de "Atender"/"Ligar".
    fallbackSpeaker.gain.value = 1;
  });

  dc.onmessage = (e) => playbackNode.port.postMessage(int16LEToFloat32(e.data));

  let videoSender = null;
  let videoReceiver = null;
  if (videoDc) {
    const videoTrack = localStream.getVideoTracks()[0];
    videoDc.onopen = () => {
      if (videoTrack && !videoSender) videoSender = startVideoSender(videoDc, videoTrack);
    };
    videoReceiver = startVideoReceiver(videoDc, onRemoteVideoFrame);
  }

  const close = () => {
    try { videoSender?.close(); } catch {}
    try { videoReceiver?.close(); } catch {}
    try { localStream.getTracks().forEach((t) => t.stop()); } catch {}
    try { remoteAudio.pause(); remoteAudio.srcObject = null; } catch {}
    try { ctx.close(); } catch {}
    try { pc.close(); } catch {}
    try { viaSocket?.close(); } catch {}
  };

  const tocarRecebido = (buf) => playbackNode.port.postMessage(int16LEToFloat32(buf));

  const passarParaSocket = async () => {
    try { pc.close(); } catch {}
    viaSocket = await abrirPorSocket(tocarRecebido);
    enviar = (buf) => viaSocket.send(buf);
  };

  if (comecarPeloSocket) {
    // Este navegador já precisou do WebSocket há pouco: começa por ele.
    try {
      await passarParaSocket();
    } catch (err) {
      close();
      throw err;
    }
  } else {
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await waitForIceGathering(pc);

    try {
      const sdpAnswer = await exchangeSdp(pc.localDescription.sdp);
      await pc.setRemoteDescription({ type: "answer", sdp: sdpAnswer });
    } catch (err) {
      close();
      throw err;
    }

    if (abrirPorSocket) {
      // Automático: se o canal WebRTC não abrir em 4 s, segue pelo
      // WebSocket sem encerrar a ligação.
      const abriu = await esperarCanalAbrir(dc, WEBRTC_ABRIR_MS);
      if (!abriu) {
        console.warn("[wacalls] canal WebRTC não abriu; usando o áudio por WebSocket");
        try {
          await passarParaSocket();
          lembrarWebSocket();
        } catch (err) {
          console.warn("[wacalls] áudio por WebSocket também falhou:", err?.message);
        }
      }
    }
  }


  const videoStream = wantVideo && localStream.getVideoTracks().length
    ? new MediaStream(localStream.getVideoTracks())
    : null;

  return { pc, close, videoStream };
};

/**
 * Abre a captura de microfone (+ câmera, se `opts.video`) e o canal de
 * áudio/vídeo real com o wacalls-chat pra uma chamada WhatsApp já
 * aceita/discada. `wacallsApi` é o cliente axios já apontado pro backend do
 * EquipeChat (services/wacallsApi.js) — ele injeta o JWT do usuário; o
 * backend troca isso pelo cookie de sessão do wacalls-chat.
 */
export const openWacallsAudio = async (wacallsApi, sessionId, callId, opts = {}) =>
  openPcmAudio(async (sdpOffer) => {
    const { data } = await wacallsApi.post(`/calls/${callId}/webrtc`, { sessionId, sdpOffer });
    return data.sdpAnswer;
  }, {
    ...opts,
    // opts.socket = socket do sistema (AuthContext): habilita o plano B.
    abrirPorSocket: opts.socket ? (onPcm) => abrirAudioPorSocket(opts.socket, sessionId, callId, onPcm) : null,
  });

/**
 * Mesma ponte de áudio, só que pra uma chamada da troncal SIP (baresip) —
 * sem sessionId (a troncal é única/global pro servidor, ver
 * WacallsChatCallService.ts). `sipApi` aponta pra /wacalls/sip/... . SIP
 * nunca tem vídeo (baresip é só voz) — `opts.video` é ignorado aqui de
 * propósito, nem é repassado.
 */
export const openSipAudio = async (sipApi, callId, micDeviceId = null) =>
  openPcmAudio(async (sdpOffer) => {
    const { data } = await sipApi.post(`/calls/${callId}/webrtc`, { sdpOffer });
    return data.sdpAnswer;
  }, { micDeviceId });

export default { openWacallsAudio, openSipAudio, isVideoCallSupported };
