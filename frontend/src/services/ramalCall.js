/**
 * Ligação interna entre atendentes (ramal a ramal).
 *
 * WebRTC padrão: o áudio/vídeo vai DIRETO de um navegador pro outro. O
 * servidor só carrega a sinalização (oferta, resposta e candidatos de rede)
 * pelo socket que já existe. Nenhuma mídia passa pelo servidor.
 *
 * Este arquivo é propositalmente separado de wacallsWebRTC.js: aquele fala
 * com o microserviço por canal de dados com PCM/H.264 crus (a ponte para o
 * WhatsApp). Aqui é navegador-para-navegador, onde o WebRTC comum resolve
 * com muito menos código.
 */

// Servidores STUN públicos: descobrem o IP externo de cada ponta para que
// consigam se achar fora da rede local. Sem isso, a ligação só funciona
// entre máquinas na mesma rede.
const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" }
];

const novaConexao = () => new RTCPeerConnection({ iceServers: ICE_SERVERS });

export const gerarCallId = () =>
  `ramal-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

/**
 * Captura microfone (e câmera, se vídeo).
 *
 * Tenta em cascata, do melhor pro mínimo aceitável. Motivo: no Windows a
 * câmera costuma aceitar UM programa por vez — se o Meet, o OBS, o WhatsApp
 * Desktop, ou até OUTRA ABA da própria plataforma já estiverem com ela
 * aberta, o navegador devolve NotReadableError e antes disso derrubava a
 * ligação inteira. Perder o vídeo é chato; perder a ligação é pior. Então:
 *
 *   1. câmera + microfone na resolução preferida
 *   2. câmera + microfone sem exigir resolução (driver teimoso aceita)
 *   3. só microfone — a ligação acontece, sem imagem
 *
 * Quem chamou descobre o que conseguiu com stream.getVideoTracks().length.
 */
export const capturarMidia = async (comVideo = false) => {
  const audioBom = { echoCancellation: true, noiseSuppression: true };

  const tentativas = comVideo
    ? [
        { audio: audioBom, video: { width: { ideal: 640 }, height: { ideal: 480 } } },
        { audio: audioBom, video: true },
        { audio: audioBom, video: false }
      ]
    : [{ audio: audioBom }, { audio: true }];

  let ultimoErro = null;

  for (const restricao of tentativas) {
    try {
      return await navigator.mediaDevices.getUserMedia(restricao);
    } catch (err) {
      ultimoErro = err;
      const nome = err?.name || "";
      // Permissão negada não melhora tentando de novo — para na hora.
      if (nome === "NotAllowedError" || nome === "SecurityError") break;
    }
  }

  const nome = ultimoErro?.name || "";

  if (nome === "NotAllowedError" || nome === "SecurityError") {
    throw new Error(
      comVideo
        ? "Permissão de câmera/microfone negada. Clique no cadeado ao lado do endereço e libere o acesso."
        : "Permissão de microfone negada. Clique no cadeado ao lado do endereço e libere o acesso."
    );
  }
  if (nome === "NotFoundError" || nome === "DevicesNotFoundError") {
    throw new Error("Nenhum microfone encontrado neste computador.");
  }
  if (nome === "NotReadableError" || nome === "TrackStartError") {
    throw new Error(
      "O microfone está sendo usado por outro programa. Feche Meet, Zoom, Teams, " +
        "WhatsApp Desktop ou outra aba desta plataforma e tente de novo."
    );
  }
  throw new Error("Não foi possível acessar o microfone.");
};

/**
 * Monta o lado de QUEM LIGA. Devolve a oferta pra ser enviada ao destino e
 * um objeto de controle da ligação.
 */
export const iniciarChamada = async ({
  socket,
  callId,
  toUserId,
  extension,
  video = false,
  onRemoteStream,
  onStateChange
}) => {
  const stream = await capturarMidia(video);
  const pc = novaConexao();

  // A partir daqui o dispositivo está aberto. Qualquer erro tem que liberar
  // ele antes de subir, senão a câmera/microfone ficam presos e a próxima
  // tentativa falha com "em uso por outro programa" — causada por nós mesmos.
  try {
  stream.getTracks().forEach(track => pc.addTrack(track, stream));

  // Ligação de vídeo mas sem câmera aqui (ocupada, ausente ou negada):
  // pede uma via só de RECEBIMENTO. Sem isso a oferta sairia sem trilha de
  // vídeo nenhuma e o outro lado não teria por onde mandar a imagem dele —
  // quem está sem câmera ficaria cego, o que não faz sentido. Assim a
  // ligação fica assimétrica: eu mando só voz, mas vejo você.
  if (video && stream.getVideoTracks().length === 0) {
    try {
      pc.addTransceiver("video", { direction: "recvonly" });
    } catch {
      // Navegador antigo sem addTransceiver: segue como ligação de voz.
    }
  }

  pc.ontrack = event => {
    if (onRemoteStream && event.streams && event.streams[0]) {
      onRemoteStream(event.streams[0]);
    }
  };

  pc.onicecandidate = event => {
    if (event.candidate && toUserId) {
      socket.emit("ramais:ice", {
        toUserId,
        callId,
        candidate: event.candidate.toJSON ? event.candidate.toJSON() : event.candidate
      });
    }
  };

  pc.onconnectionstatechange = () => {
    if (onStateChange) onStateChange(pc.connectionState);
  };

  const offer = await pc.createOffer();
  await pc.setLocalDescription(offer);

  socket.emit("ramais:call", {
    toUserId: toUserId || undefined,
    extension: extension || undefined,
    callId,
    video,
    sdp: pc.localDescription
  });

  return { pc, stream };
  } catch (err) {
    encerrarChamada(pc, stream);
    throw err;
  }
};

/**
 * Monta o lado de QUEM ATENDE, a partir da oferta recebida.
 */
export const atenderChamada = async ({
  socket,
  callId,
  fromUserId,
  sdp,
  video = false,
  onRemoteStream,
  onStateChange
}) => {
  const stream = await capturarMidia(video);
  const pc = novaConexao();

  try {
  stream.getTracks().forEach(track => pc.addTrack(track, stream));

  pc.ontrack = event => {
    if (onRemoteStream && event.streams && event.streams[0]) {
      onRemoteStream(event.streams[0]);
    }
  };

  pc.onicecandidate = event => {
    if (event.candidate) {
      socket.emit("ramais:ice", {
        toUserId: fromUserId,
        callId,
        candidate: event.candidate.toJSON ? event.candidate.toJSON() : event.candidate
      });
    }
  };

  pc.onconnectionstatechange = () => {
    if (onStateChange) onStateChange(pc.connectionState);
  };

  await pc.setRemoteDescription(new RTCSessionDescription(sdp));
  const answer = await pc.createAnswer();
  await pc.setLocalDescription(answer);

  socket.emit("ramais:answer", {
    toUserId: fromUserId,
    callId,
    sdp: pc.localDescription
  });

  return { pc, stream };
  } catch (err) {
    encerrarChamada(pc, stream);
    throw err;
  }
};

/** Aplica a resposta recebida no lado de quem ligou. */
export const aplicarResposta = async (pc, sdp) => {
  if (!pc || !sdp) return;
  // Só aceita a resposta se ainda estivermos esperando por ela — aplicar
  // duas vezes (evento repetido) derruba a conexão com erro de estado.
  if (pc.signalingState !== "have-local-offer") return;
  await pc.setRemoteDescription(new RTCSessionDescription(sdp));
};

/** Adiciona um candidato de rede recebido do outro lado. */
export const adicionarCandidato = async (pc, candidate) => {
  if (!pc || !candidate) return;
  try {
    await pc.addIceCandidate(new RTCIceCandidate(candidate));
  } catch {
    // Candidato que chega antes da descrição remota é descartado pelo
    // navegador — não é erro fatal, a conexão segue com os demais.
  }
};

/** Encerra tudo: para microfone/câmera e fecha a conexão. */
export const encerrarChamada = (pc, stream) => {
  try {
    if (stream) stream.getTracks().forEach(t => t.stop());
  } catch { /* nada a fazer */ }
  try {
    if (pc) {
      pc.ontrack = null;
      pc.onicecandidate = null;
      pc.onconnectionstatechange = null;
      pc.close();
    }
  } catch { /* nada a fazer */ }
};

export default {
  gerarCallId,
  capturarMidia,
  iniciarChamada,
  atenderChamada,
  aplicarResposta,
  adicionarCandidato,
  encerrarChamada
};
