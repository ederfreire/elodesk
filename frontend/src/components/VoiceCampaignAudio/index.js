import React, { useEffect, useRef, useState } from "react";

import Button from "@material-ui/core/Button";
import IconButton from "@material-ui/core/IconButton";
import Typography from "@material-ui/core/Typography";
import Paper from "@material-ui/core/Paper";
import MicIcon from "@material-ui/icons/Mic";
import StopIcon from "@material-ui/icons/Stop";
import DeleteIcon from "@material-ui/icons/Delete";
import AttachFileIcon from "@material-ui/icons/AttachFile";
import { i18n } from "../../translate/i18n";

/**
 * Áudio da campanha de voz: grava pelo microfone ou aceita um arquivo.
 *
 * O componente não envia nada sozinho — ele só entrega o arquivo pronto pelo
 * `onChange`. Quem salva a campanha decide a hora de subir, porque o upload
 * precisa do id da campanha, que só existe depois de gravar.
 *
 * A gravação usa MediaRecorder, que é o gravador nativo do navegador. O
 * formato que sai varia (webm no Chrome, mp4 no Safari) e isso não é problema:
 * o servidor converte com ffmpeg antes de tocar na ligação.
 */
const VoiceCampaignAudio = ({ audioAtual, onChange, desabilitado }) => {
  const [gravando, setGravando] = useState(false);
  const [segundos, setSegundos] = useState(0);
  const [previa, setPrevia] = useState(null);
  const [nomeArquivo, setNomeArquivo] = useState("");
  const [erro, setErro] = useState("");

  const gravadorRef = useRef(null);
  const pedacosRef = useRef([]);
  const cronometroRef = useRef(null);
  const inputRef = useRef(null);

  // A URL da prévia é criada com createObjectURL e fica presa na memória até
  // ser revogada. Sem esta limpeza, trocar de áudio várias vezes vai
  // acumulando blobs na aba.
  useEffect(() => {
    return () => {
      if (previa) URL.revokeObjectURL(previa);
      if (cronometroRef.current) clearInterval(cronometroRef.current);
      const g = gravadorRef.current;
      if (g && g.state === "recording") {
        try {
          g.stop();
        } catch (e) {
          /* nada a fazer no desmonte */
        }
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const aplicarArquivo = (arquivo) => {
    if (previa) URL.revokeObjectURL(previa);
    const url = URL.createObjectURL(arquivo);
    setPrevia(url);
    setNomeArquivo(arquivo.name || "gravacao.webm");
    setErro("");
    if (onChange) onChange(arquivo);
  };

  const iniciarGravacao = async () => {
    setErro("");

    if (!navigator?.mediaDevices?.getUserMedia || typeof window.MediaRecorder === "undefined") {
      setErro(i18n.t("voiceCampaign.errors.noRecorder", "Este navegador não permite gravar áudio. Envie um arquivo."));
      return;
    }

    let stream;
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (e) {
      // Sem permissão de microfone não há o que fazer além de avisar — o
      // usuário ainda pode enviar um arquivo.
      setErro(i18n.t("voiceCampaign.errors.noMic", "Não foi possível acessar o microfone. Verifique a permissão do navegador."));
      return;
    }

    try {
      const gravador = new window.MediaRecorder(stream);
      pedacosRef.current = [];

      gravador.ondataavailable = (e) => {
        if (e.data && e.data.size > 0) pedacosRef.current.push(e.data);
      };

      gravador.onstop = () => {
        // Liberar o microfone: sem isso o indicador de gravação continua
        // aceso no navegador mesmo depois de parar.
        stream.getTracks().forEach((t) => t.stop());

        const tipo = gravador.mimeType || "audio/webm";
        const blob = new Blob(pedacosRef.current, { type: tipo });
        const extensao = tipo.includes("mp4") ? "m4a" : "webm";
        const arquivo = new File([blob], `gravacao-campanha.${extensao}`, { type: tipo });
        aplicarArquivo(arquivo);
      };

      gravador.start();
      gravadorRef.current = gravador;
      setGravando(true);
      setSegundos(0);
      cronometroRef.current = setInterval(() => setSegundos((s) => s + 1), 1000);
    } catch (e) {
      stream.getTracks().forEach((t) => t.stop());
      setErro(i18n.t("voiceCampaign.errors.recordFailed", "Falha ao iniciar a gravação."));
    }
  };

  const pararGravacao = () => {
    const g = gravadorRef.current;
    if (g && g.state === "recording") g.stop();
    if (cronometroRef.current) clearInterval(cronometroRef.current);
    setGravando(false);
  };

  const limpar = () => {
    if (previa) URL.revokeObjectURL(previa);
    setPrevia(null);
    setNomeArquivo("");
    setErro("");
    if (onChange) onChange(null);
  };

  const tempo = `${String(Math.floor(segundos / 60)).padStart(2, "0")}:${String(
    segundos % 60
  ).padStart(2, "0")}`;

  // Áudio já salvo numa edição anterior, quando ainda não se escolheu um novo.
  const mostrarSalvo = !previa && !!audioAtual;

  return (
    <Paper variant="outlined" style={{ padding: 16 }}>
      <Typography variant="subtitle2" style={{ marginBottom: 8 }}>
        {i18n.t("voiceCampaign.audioTitle", "Áudio da ligação")}
      </Typography>

      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
        {!gravando ? (
          <Button
            variant="outlined"
            size="small"
            startIcon={<MicIcon />}
            onClick={iniciarGravacao}
            disabled={desabilitado}
          >
            {i18n.t("voiceCampaign.record", "Gravar")}
          </Button>
        ) : (
          <Button
            variant="contained"
            color="secondary"
            size="small"
            startIcon={<StopIcon />}
            onClick={pararGravacao}
          >
            {i18n.t("voiceCampaign.stop", "Parar")} ({tempo})
          </Button>
        )}

        <Button
          variant="outlined"
          size="small"
          startIcon={<AttachFileIcon />}
          onClick={() => inputRef.current && inputRef.current.click()}
          disabled={desabilitado || gravando}
        >
          {i18n.t("voiceCampaign.upload", "Enviar arquivo")}
        </Button>

        <input
          ref={inputRef}
          type="file"
          accept="audio/*"
          style={{ display: "none" }}
          onChange={(e) => {
            const arquivo = e.target.files && e.target.files[0];
            if (arquivo) aplicarArquivo(arquivo);
            // Zera o input para permitir escolher o MESMO arquivo de novo
            // depois de remover.
            e.target.value = "";
          }}
        />

        {(previa || mostrarSalvo) && !gravando && (
          <IconButton size="small" onClick={limpar} disabled={desabilitado} title={i18n.t("voiceCampaign.remove", "Remover áudio")}>
            <DeleteIcon fontSize="small" />
          </IconButton>
        )}
      </div>

      {previa && (
        <div style={{ marginTop: 12 }}>
          <audio src={previa} controls style={{ width: "100%" }} />
          <Typography variant="caption" color="textSecondary">
            {nomeArquivo}
          </Typography>
        </div>
      )}

      {mostrarSalvo && (
        <Typography variant="body2" style={{ marginTop: 12 }}>
          {i18n.t("voiceCampaign.savedAudio", "Áudio salvo")}: <strong>{audioAtual}</strong>
        </Typography>
      )}

      {!previa && !mostrarSalvo && !gravando && (
        <Typography variant="caption" color="textSecondary" style={{ display: "block", marginTop: 8 }}>
          {i18n.t("voiceCampaign.hint", "Grave pelo microfone ou envie um arquivo de áudio.")}
        </Typography>
      )}

      {erro && (
        <Typography variant="caption" color="error" style={{ display: "block", marginTop: 8 }}>
          {erro}
        </Typography>
      )}
    </Paper>
  );
};

export default VoiceCampaignAudio;
