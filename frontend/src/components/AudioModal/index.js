import { Button, CircularProgress } from "@material-ui/core";
import GraphicEqIcon from "@material-ui/icons/GraphicEq";
import React, { useRef, useEffect, useState } from "react";
import api from "../../services/api";
import { Typography } from "@material-ui/core";
import { useTheme, makeStyles } from "@material-ui/core/styles";
import { i18n } from "../../translate/i18n";

const LS_NAME = "audioMessageRate";

// ✅ CORREÇÃO: Estilos específicos para controlar tamanho e aparência
const useStyles = makeStyles((theme) => ({
  audioContainer: {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    maxWidth: '380px', // ✅ Limita largura máxima
    minWidth: '300px',  // ✅ Largura mínima
    padding: 0,
    margin: 0,
    backgroundColor: 'transparent',
    border: 'none'
  },
  audioPlayerContainer: {
    position: 'relative',
    width: '100%',
    height: '40px', // ✅ Altura fixa
    marginBottom: theme.spacing(1)
  },
  audioPlayer: {
    width: '100%',
    height: '40px', // ✅ Altura específica
    outline: 'none',
    border: 'none',
    backgroundColor: 'transparent',
    // ✅ Remove aparência padrão problemática
    '&::-webkit-media-controls-panel': {
      backgroundColor: 'transparent',
    },
    '&::-webkit-media-controls-current-time-display, &::-webkit-media-controls-time-remaining-display': {
      fontSize: '12px'
    }
  },
  controlsContainer: {
    display: 'flex',
    flexDirection: 'column',
    width: '100%',
    gap: theme.spacing(1)
  },
  transcriptionContainer: {
    width: '100%',
    marginTop: theme.spacing(1),
    // ✅ CORREÇÃO: Centralizar o botão
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center'
  },
  transcriptionText: {
    fontSize: '0.875rem',
    lineHeight: 1.4,
    wordBreak: 'break-word',
    padding: theme.spacing(1),
    backgroundColor: theme.palette.action.hover,
    borderRadius: theme.shape.borderRadius,
    border: `1px solid ${theme.palette.divider}`,
    width: '100%',
    boxSizing: 'border-box'
  },
  transcribeButton: {
    fontSize: '0.78rem',
    fontWeight: 600,
    letterSpacing: 0.2,
    textTransform: 'none',
    padding: '6px 16px',
    minWidth: 'auto',
    height: 32,
    borderRadius: 999,
    alignSelf: 'center',
    color: '#fff',
    background: 'linear-gradient(135deg, #2563eb 0%, #4f46e5 100%)',
    boxShadow: '0 4px 12px -4px rgba(37, 99, 235, 0.55)',
    transition: 'transform .15s ease, box-shadow .15s ease, filter .15s ease',
    '&:hover': {
      background: 'linear-gradient(135deg, #1d4ed8 0%, #4338ca 100%)',
      boxShadow: '0 6px 16px -4px rgba(37, 99, 235, 0.65)',
      transform: 'translateY(-1px)'
    },
    '&:active': { transform: 'translateY(0)' },
    '&.Mui-disabled': {
      background: 'rgba(100,116,139,0.25)',
      color: 'rgba(255,255,255,0.85)',
      boxShadow: 'none'
    },
    '& .MuiButton-startIcon': { marginRight: 6 }
  },
  rateButton: {
    position: 'absolute',
    top: '2px',
    right: '8px',
    fontSize: '0.7rem',
    minWidth: 'auto',
    padding: '1px 6px',
    height: '18px',
    backgroundColor: 'rgba(0,0,0,0.6)',
    color: 'white',
    borderRadius: '9px',
    zIndex: 10,
    lineHeight: 1,
    '&:hover': {
      backgroundColor: 'rgba(0,0,0,0.8)'
    },
    // ✅ Remover estilos de botão padrão
    border: 'none',
    textTransform: 'none',
    boxShadow: 'none'
  }
}));

const AudioModal = ({ url, message, disableTranscription = false }) => {
  const theme = useTheme();
  const classes = useStyles();
  const audioRef = useRef(null);
  const [audioRate, setAudioRate] = useState(
    parseFloat(localStorage.getItem(LS_NAME) || "1")
  );
  const [showButtonRate, setShowButtonRate] = useState(false);
  const isIOS = /iPad|iPhone|iPod/.test(navigator.userAgent) && !window.MSStream;
  const [transcription, setTranscription] = useState(null);
  const [isTranscribing, setIsTranscribing] = useState(false);

  const body = message?.body ?? "";
  const transcrito = message?.transcrito ?? false;

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = audioRate;
      localStorage.setItem(LS_NAME, audioRate);
    }
  }, [audioRate]);

  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.onplaying = () => {
        setShowButtonRate(true);
      };
      audioRef.current.onpause = () => {
        setShowButtonRate(false);
      };
      audioRef.current.onended = () => {
        setShowButtonRate(false);
      };
    }
  }, []);

  // ✅ Correção: duração "0:00" no player nativo (Chrome/Edge/Firefox), só
  // na plataforma web — no app do WhatsApp (iPhone/Android) a duração vem
  // dos METADADOS da mensagem, então sempre aparece certa. Aqui o player usa
  // o elemento <audio> nativo, que calcula a duração lendo o próprio
  // arquivo — e .ogg/opus gravado pelo WhatsApp costuma vir em modo
  // "stream" (sem a duração total escrita no cabeçalho do container), então
  // o Chromium não consegue calcular e trava em "0:00" (às vezes
  // `duration === Infinity`) até o usuário arrastar a barra até o fim na
  // mão. Esse é um bug conhecido do Chromium com Ogg/WebM "sem duração" —
  // o workaround padrão é forçar um seek pra um tempo bem distante (o que
  // obriga o navegador a escanear o arquivo até o fim de verdade pra
  // calcular a duração real) e voltar pro início logo em seguida, sem
  // reproduzir nada nem o usuário perceber.
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return undefined;

    const fixInfiniteDuration = () => {
      if (!Number.isFinite(audio.duration)) {
        try {
          audio.currentTime = 1e101;
          const onTimeUpdate = () => {
            audio.currentTime = 0;
            audio.removeEventListener("timeupdate", onTimeUpdate);
          };
          audio.addEventListener("timeupdate", onTimeUpdate);
        } catch {
          /* alguns navegadores lançam erro ao buscar tempo inválido antes
             dos metadados carregarem — inofensivo, tenta de novo no
             próximo evento (durationchange costuma disparar mais de uma
             vez até estabilizar). */
        }
      }
    };

    audio.addEventListener("loadedmetadata", fixInfiniteDuration);
    audio.addEventListener("durationchange", fixInfiniteDuration);
    // Cobre o caso do navegador já ter carregado os metadados (ex: cache)
    // antes desse efeito rodar.
    fixInfiniteDuration();

    return () => {
      audio.removeEventListener("loadedmetadata", fixInfiniteDuration);
      audio.removeEventListener("durationchange", fixInfiniteDuration);
    };
  }, [url]);

  const toggleRate = () => {
    let newRate = null;

    switch (audioRate) {
      case 0.5:
        newRate = 1;
        break;
      case 1:
        newRate = 1.5;
        break;
      case 1.5:
        newRate = 2;
        break;
      case 2:
        newRate = 0.5;
        break;
      default:
        newRate = 1;
        break;
    }

    setAudioRate(newRate);
  };

  const getAudioSource = () => {
    // ✅ Sempre oferecer mp3 + ogg. O navegador escolhe o primeiro suportado.
    // No iPhone/Safari o .mp3 (gerado no backend ao lado do .ogg) é o que toca.
    // No Chrome/Firefox/Android o .ogg/opus continua sendo usado normalmente.
    const ogg = url;
    const mp3 = url.replace(/\.ogg($|\?)/i, ".mp3$1");
    const isSafari = /^((?!chrome|android).)*safari/i.test(navigator.userAgent);
    if (isIOS || isSafari) {
      return (
        <>
          <source src={mp3} type="audio/mpeg" />
          <source src={ogg} type="audio/ogg" />
        </>
      );
    }
    return (
      <>
        <source src={ogg} type="audio/ogg" />
        <source src={mp3} type="audio/mpeg" />
      </>
    );
  };

  const handleTranscribe = async () => {
    setIsTranscribing(true);
    try {
      let audioData = {
        wid: message.wid,
      };

      const { data } = await api.post(`/message/transcribeAudio`, audioData);

      if (data) {
        setTranscription(data);
      } else {
        console.error("Invalid response data:", data);
      }
    } catch (error) {
      console.error("Erro ao transcrever áudio:", error);
    } finally {
      setIsTranscribing(false);
    }
  };

  return (
    <div className={classes.audioContainer}>
      {/* ✅ Container do player igual ao original */}
      <div className={classes.audioPlayerContainer}>
        <audio 
          ref={audioRef} 
          controls 
          className={classes.audioPlayer}
          preload="metadata"
        >
          {getAudioSource()}
        </audio>
        
        {/* ✅ Botão de velocidade igual ao original */}
        {showButtonRate && (
          <Button
            className={classes.rateButton}
            onClick={toggleRate}
            size="small"
            disableRipple
          >
            {audioRate}x
          </Button>
        )}
      </div>

      {/* ✅ ÚNICA MUDANÇA: Container de controles com botão centralizado */}
      <div className={classes.controlsContainer}>
        {!disableTranscription && (
          <div className={classes.transcriptionContainer}>
            {!transcrito ? (
              transcription ? (
                <Typography className={classes.transcriptionText} variant="body2">
                  <strong>{i18n.t("audioTranscription.transcription")}</strong> {transcription === "__TRANSCRIPTION_FAILED__" ? i18n.t("audioTranscription.failed") : transcription}
                </Typography>
              ) : (
                <Button
                  onClick={handleTranscribe}
                  className={classes.transcribeButton}
                  disabled={isTranscribing}
                  disableElevation
                  startIcon={
                    isTranscribing ? (
                      <CircularProgress size={14} style={{ color: "#fff" }} />
                    ) : (
                      <GraphicEqIcon style={{ fontSize: 16 }} />
                    )
                  }
                >
                  {isTranscribing ? i18n.t("audioTranscription.transcribing") : i18n.t("audioTranscription.transcribe")}
                </Button>
              )
            ) : (
              <Typography className={classes.transcriptionText} variant="body2">
                <strong>{i18n.t("audioTranscription.transcription")}</strong> {body === "__TRANSCRIPTION_FAILED__" ? i18n.t("audioTranscription.failed") : body}
              </Typography>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default AudioModal;