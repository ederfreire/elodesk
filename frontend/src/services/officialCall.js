/**
 * Chamadas de voz pela API Oficial (WhatsApp Business Calling API).
 *
 * O áudio vai direto do navegador do atendente para a Meta, por WebRTC. O
 * servidor só carrega a sinalização (oferta e resposta SDP). Nenhuma mídia
 * passa pela VPS.
 *
 * O ponto delicado é o SDP: o que o Chrome gera NÃO serve à Meta sem ajuste.
 * A documentação lista requisitos obrigatórios, e se qualquer um falhar a
 * chamada é recusada na sinalização ou o áudio sai corrompido:
 *
 *   - somente codec Opus
 *   - taxa de relógio de 48 kHz
 *   - ptime de 20 ms
 *   - DTMF (telephone-event) a 8 kHz
 *   - UM único SSRC (a Meta reescreve o SSRC e o app do cliente só aceita
 *     uma fonte de áudio; mais de uma causa falha total)
 *
 * O navegador oferece Opus mas também PCMU, PCMA, G722, red, CN... e às
 * vezes anuncia múltiplos SSRC. Por isso o `ajustarSdpParaMeta` abaixo
 * reescreve a oferta antes de mandar.
 */

// A Meta é ICE-LITE e assume o papel "controlled". Nosso lado precisa ser
// ICE-FULL e iniciar a checagem — que é o comportamento padrão do navegador
// quando fornecemos servidores STUN.
const ICE_SERVERS = [
  { urls: "stun:stun.l.google.com:19302" },
  { urls: "stun:stun1.l.google.com:19302" }
];

/**
 * Reescreve o SDP para atender às exigências da Meta.
 *
 * Mantém apenas Opus e telephone-event (necessário para DTMF), remove os
 * demais codecs da linha m=audio, e garante ptime de 20ms.
 */
export const ajustarSdpParaMeta = sdp => {
  if (!sdp) return sdp;

  const linhas = sdp.split(/\r\n|\n/);

  // 1) Descobre os payload types de Opus e telephone-event.
  const manter = new Set();
  for (const l of linhas) {
    const m = /^a=rtpmap:(\d+)\s+(opus|telephone-event)\//i.exec(l);
    if (m) manter.add(m[1]);
  }

  // Sem Opus não há o que negociar — devolve intacto para o erro aparecer
  // na Meta com mensagem clara, em vez de mandarmos um SDP mutilado.
  const temOpus = linhas.some(l => /^a=rtpmap:\d+\s+opus\//i.test(l));
  if (!temOpus) return sdp;

  const saida = [];
  let dentroDeAudio = false;

  for (const linha of linhas) {
    if (linha.startsWith("m=")) {
      dentroDeAudio = linha.startsWith("m=audio");

      if (dentroDeAudio) {
        // m=audio <porta> <proto> <lista de payloads>
        const partes = linha.split(" ");
        const cabecalho = partes.slice(0, 3);
        const payloads = partes.slice(3).filter(p => manter.has(p));
        saida.push([...cabecalho, ...payloads].join(" "));
        continue;
      }
    }

    // Fora do bloco de áudio, copia sem mexer.
    if (!dentroDeAudio) {
      saida.push(linha);
      continue;
    }

    // Dentro do bloco de áudio: descarta atributos dos codecs removidos.
    const attr = /^a=(rtpmap|fmtp|rtcp-fb):(\d+)/.exec(linha);
    if (attr && !manter.has(attr[2])) continue;

    // Um SSRC só: mantém o primeiro grupo e descarta o restante.
    saida.push(linha);
  }

  // 2) ptime de 20ms — obrigatório.
  //
  // ATENÇÃO À POSIÇÃO. A RFC 4566 fixa a ordem dentro de uma mídia:
  // m=, i=, c=, b=, k= e só então os a=. A versão anterior inseria o
  // "a=ptime:20" logo depois da linha "m=audio", ou seja ANTES do "c=" —
  // SDP malformado. O navegador não reclamava (nunca voltamos a lê-lo), mas
  // a Meta valida e recusava com HTTP 400 "SDP Validation error", em toda
  // ligação, no pre_accept e no accept.
  //
  // O lugar correto é junto dos demais atributos: no fim do bloco de áudio.
  const jaTemPtime = saida.some(l => /^a=ptime:/.test(l));

  if (jaTemPtime) {
    for (let i = 0; i < saida.length; i += 1) {
      if (/^a=ptime:\d+/.test(saida[i])) saida[i] = "a=ptime:20";
    }
  } else {
    const inicioAudio = saida.findIndex(l => l.startsWith("m=audio"));

    if (inicioAudio >= 0) {
      // Fim do bloco: próxima linha "m=" ou fim do SDP.
      let fimAudio = saida.length;
      for (let i = inicioAudio + 1; i < saida.length; i += 1) {
        if (saida[i].startsWith("m=")) {
          fimAudio = i;
          break;
        }
      }

      // Recua sobre linhas vazias do fim, para não separar o atributo do bloco.
      while (fimAudio > inicioAudio + 1 && saida[fimAudio - 1].trim() === "") {
        fimAudio -= 1;
      }

      saida.splice(fimAudio, 0, "a=ptime:20");
    }
  }

  let resultado = saida.join("\r\n");

  // 3) Opus em 48 kHz mono, com DTX desligado. `useinbandfec=1` melhora a
  //    tolerância a perda de pacote, que é comum em rede de celular.
  resultado = resultado.replace(
    /(a=fmtp:(\d+) [^\r\n]*)/g,
    (todo, _linha, pt) => {
      const ehOpus = new RegExp(`a=rtpmap:${pt}\\s+opus/`, "i").test(resultado);
      if (!ehOpus) return todo;
      return `a=fmtp:${pt} minptime=20;useinbandfec=1;stereo=0;sprop-stereo=0`;
    }
  );

  if (!resultado.endsWith("\r\n")) resultado += "\r\n";
  return resultado;
};

/**
 * Confere a ordem exigida pela RFC 4566 dentro de cada bloco de mídia.
 *
 * Existe porque um SDP fora de ordem não dá erro nenhum aqui — o navegador
 * nunca o relê. O erro só aparece do outro lado, como "SDP Validation error",
 * sem dizer qual linha está errada. Melhor descobrir antes de enviar.
 *
 * Devolve a lista de problemas; vazia significa SDP bem formado.
 */
export const conferirOrdemSdp = sdp => {
  const problemas = [];
  if (!sdp) return ["SDP vazio"];

  const linhas = sdp.split(/\r\n|\n/);
  let midiaAtual = null;
  let viuAtributo = false;

  linhas.forEach((linha, indice) => {
    if (linha.startsWith("m=")) {
      midiaAtual = linha;
      viuAtributo = false;
      return;
    }

    if (!midiaAtual) return;

    if (linha.startsWith("a=")) {
      viuAtributo = true;
      return;
    }

    // c=, b= e k= depois de um a= quebram a ordem da RFC.
    if (viuAtributo && /^[cbk]=/.test(linha)) {
      problemas.push(
        `linha ${indice + 1}: "${linha}" veio depois de um atributo a= dentro de "${midiaAtual}"`
      );
    }
  });

  return problemas;
};

/**
 * Espera a coleta de candidatos ICE terminar.
 *
 * A Meta recomenda concluir o processo ICE antes de nomear o candidato, e
 * não trocar de candidato no meio da chamada. Por isso mandamos o SDP
 * completo de uma vez, em vez de negociar candidatos aos poucos.
 */
const esperarIceCompleto = pc =>
  new Promise(resolve => {
    if (pc.iceGatheringState === "complete") return resolve();

    const pronto = () => {
      if (pc.iceGatheringState === "complete") {
        pc.removeEventListener("icegatheringstatechange", pronto);
        clearTimeout(limite);
        resolve();
      }
    };

    // Rede lenta ou STUN fora do ar não podem travar a chamada para sempre.
    // Passados 3 segundos, segue com os candidatos que já tiver.
    const limite = setTimeout(() => {
      pc.removeEventListener("icegatheringstatechange", pronto);
      resolve();
    }, 3000);

    pc.addEventListener("icegatheringstatechange", pronto);
  });

export const capturarMicrofone = async () => {
  try {
    return await navigator.mediaDevices.getUserMedia({
      audio: {
        echoCancellation: true,
        noiseSuppression: true,
        autoGainControl: true,
        // A Meta exige 48 kHz. Pedir explicitamente evita que o navegador
        // escolha 44,1 kHz e o áudio saia com a velocidade errada.
        sampleRate: 48000,
        channelCount: 1
      },
      video: false
    });
  } catch (err) {
    const nome = err?.name || "";
    if (nome === "NotAllowedError" || nome === "SecurityError") {
      throw new Error(
        "Permissão de microfone negada. Clique no cadeado ao lado do endereço e libere o acesso."
      );
    }
    if (nome === "NotFoundError") {
      throw new Error("Nenhum microfone encontrado neste computador.");
    }
    if (nome === "NotReadableError") {
      throw new Error(
        "O microfone está sendo usado por outro programa. Feche Meet, Zoom, Teams ou outra aba desta plataforma."
      );
    }
    throw new Error("Não foi possível acessar o microfone.");
  }
};

const novaConexao = () => new RTCPeerConnection({ iceServers: ICE_SERVERS });

const prepararPeer = (stream, onRemoteStream, onStateChange) => {
  const pc = novaConexao();

  // Uma trilha de áudio só — a Meta não aceita múltiplos SSRC.
  const audio = stream.getAudioTracks()[0];
  if (audio) pc.addTrack(audio, stream);

  pc.ontrack = event => {
    if (onRemoteStream && event.streams && event.streams[0]) {
      onRemoteStream(event.streams[0]);
    }
  };

  pc.onconnectionstatechange = () => {
    if (onStateChange) onStateChange(pc.connectionState);
  };

  return pc;
};

/**
 * Lado de QUEM ATENDE: recebe a oferta do cliente e devolve a resposta.
 * Retorna o SDP já ajustado, pronto para o backend mandar à Meta.
 */
export const atenderChamadaOficial = async ({
  sdpOferta,
  onRemoteStream,
  onStateChange
}) => {
  const stream = await capturarMicrofone();
  const pc = prepararPeer(stream, onRemoteStream, onStateChange);

  try {
    await pc.setRemoteDescription(
      new RTCSessionDescription({ type: "offer", sdp: sdpOferta })
    );

    const resposta = await pc.createAnswer();
    await pc.setLocalDescription(resposta);
    await esperarIceCompleto(pc);

    const sdpFinal = ajustarSdpParaMeta(pc.localDescription.sdp);

    const problemas = conferirOrdemSdp(sdpFinal);
    if (problemas.length) {
      // eslint-disable-next-line no-console
      console.error("[OFFICIAL-CALL] SDP fora de ordem:", problemas);
    }

    return { pc, stream, sdp: sdpFinal };
  } catch (err) {
    encerrarChamadaOficial(pc, stream);
    throw err;
  }
};

/**
 * Lado de QUEM LIGA: monta a oferta para a Meta.
 */
export const iniciarChamadaOficial = async ({
  onRemoteStream,
  onStateChange
}) => {
  const stream = await capturarMicrofone();
  const pc = prepararPeer(stream, onRemoteStream, onStateChange);

  try {
    const oferta = await pc.createOffer({ offerToReceiveAudio: true });
    await pc.setLocalDescription(oferta);
    await esperarIceCompleto(pc);

    const sdpFinal = ajustarSdpParaMeta(pc.localDescription.sdp);
    return { pc, stream, sdp: sdpFinal };
  } catch (err) {
    encerrarChamadaOficial(pc, stream);
    throw err;
  }
};

/** Aplica a resposta da Meta no lado de quem discou. */
export const aplicarRespostaOficial = async (pc, sdp) => {
  if (!pc || !sdp) return;
  if (pc.signalingState !== "have-local-offer") return;
  await pc.setRemoteDescription(new RTCSessionDescription({ type: "answer", sdp }));
};

export const encerrarChamadaOficial = (pc, stream) => {
  try {
    if (stream) stream.getTracks().forEach(t => t.stop());
  } catch { /* nada a fazer */ }
  try {
    if (pc) {
      pc.ontrack = null;
      pc.onconnectionstatechange = null;
      pc.close();
    }
  } catch { /* nada a fazer */ }
};

export default {
  ajustarSdpParaMeta,
  conferirOrdemSdp,
  capturarMicrofone,
  atenderChamadaOficial,
  iniciarChamadaOficial,
  aplicarRespostaOficial,
  encerrarChamadaOficial
};
