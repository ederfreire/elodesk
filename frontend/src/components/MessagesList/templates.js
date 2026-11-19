import { Divider } from '@material-ui/core';
import FileCopyOutlined from "@material-ui/icons/FileCopyOutlined";
import Language from "@material-ui/icons/Language";
import Phone from "@material-ui/icons/Phone";
import Reply from "@material-ui/icons/Reply";
import { makeStyles } from '@material-ui/core/styles';
import React from 'react';
import MarkdownWrapper from '../MarkdownWrapper';

const useStyles = makeStyles((theme) => ({
  buttonTemplate: {
    backgroundColor: "transparent",
    border: 'none',
    color: '#0CADE3',
    '&:hover': {
      backgroundColor: theme.palette.primary.dark,
    },
  },
}));
// Componente para renderizar os botões dinamicamente 


const Template = ({ message }) => {
  const classes = useStyles();
  const urlRegex = /(https?:\/\/[^\s]+(\.jpg|\.jpeg|\.png|\.gif|\.mp4|\.webm|\.ogg))/g;

  // Separar a parte do texto dos botões usando '||||'
  const [text, buttonsJson] = message.body.split('||||');

  // Encontra a URL de mídia no texto (se existir)
  const mediaUrls = text.match(urlRegex);
  const mediaUrl = mediaUrls ? mediaUrls[0] : null; // Considerando a primeira URL encontrada

  // Remove a URL de mídia do texto para não duplicar
  const textWithoutMediaUrl = text.replace(urlRegex, '').trim();

  // Funções para verificar se é uma imagem ou vídeo
  const isImage = (url) => /\.(jpeg|jpg|gif|png)$/i.test(url);
  const isVideo = (url) => /\.(mp4|webm|ogg)$/i.test(url);

  const ButtonRenderer = ({ buttons }) => {
    return (
      <div style={{ marginTop: '10px', padding: '10px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '10px' }}>
        {buttons.map((button, index) => {
          if (button.type === 'URL') {
            return (
              <button key={index} onClick={() => window.open(button.url, '_blank')} className={classes.buttonTemplate}>
                <span style={{ color: 'blue-light', display: 'flex', alignItems: 'center', textAlign: 'center', gap: '5px' }}><Language /> {button.text}</span>
              </button>
            );
          } else if (button.type === 'PHONE_NUMBER') {
            return (
              <span style={{ color: 'blue', display: 'flex', alignItems: 'center', textAlign: 'center', gap: '5px' }}>
                <button className={classes.buttonTemplate} key={index} onClick={() => window.open(`https://wa.me/${button.phone_number}`, '_blank')}>
                  <Phone /> {button.text}
                </button>
              </span>
            );
          } else if (button.type === 'COPY_CODE') {
            return (
              <button key={index} onClick={() => navigator.clipboard.writeText(button.example[0])} className={classes.buttonTemplate}>
                <span style={{ color: 'blue-light', display: 'flex', alignItems: 'center', textAlign: 'center', gap: '5px' }}><FileCopyOutlined /> {button.text}</span>
              </button>
            );
          } else if (button.type === 'QUICK_REPLY') {
            // QUICK_REPLY é o tipo MAIS COMUM em template e não tinha nenhum
            // ramo aqui: caía no `return null` e o botão simplesmente sumia da
            // conversa. Não é clicável pelo atendente — quem clica é o cliente,
            // no aparelho dele; aqui é só a representação do que foi enviado.
            return (
              <button key={index} className={classes.buttonTemplate} style={{ cursor: 'default' }}>
                <span style={{ display: 'flex', alignItems: 'center', textAlign: 'center', gap: '5px' }}><Reply /> {button.text}</span>
              </button>
            );
          }
          return null;
        })}
      </div>
    );
  };

  // ── Parse dos botões ──────────────────────────────────────────────────────
  //
  // O parser antigo assumia SEMPRE "JSON codificado duas vezes"
  // (JSON.parse(JSON.parse(x))). Na prática o corpo chega com 1, 2 ou 3
  // camadas — inclusive como um array cujo único item é uma string com o JSON
  // dentro, dependendo de quem gravou a mensagem (template pelo painel,
  // campanha, automação). Fora do formato esperado, o parse estourava e o
  // usuário via o JSON cru na tela em vez dos botões.
  //
  // Agora descasca até 4 camadas e para assim que chega num array/objeto.
  let buttons = [];
  if (buttonsJson && buttonsJson !== "[]") {
    try {
      let parsed = buttonsJson;
      for (let attempts = 0; attempts < 4; attempts++) {
        if (typeof parsed === 'string') {
          parsed = JSON.parse(parsed);
          continue;
        }
        if (Array.isArray(parsed) && parsed.length === 1 && typeof parsed[0] === 'string') {
          parsed = JSON.parse(parsed[0]);
          continue;
        }
        break;
      }
      if (Array.isArray(parsed)) {
        buttons = parsed;
      } else if (parsed && typeof parsed === 'object') {
        buttons = Object.values(parsed);
      }
    } catch (e) {
      console.error('Erro ao fazer parse dos botões:', e);
    }
  }

  return (
    <>
      {/* Renderiza a mídia se houver uma URL de imagem ou vídeo */}
      {mediaUrl && (
        <>
          {isImage(mediaUrl) ? (
            <img src={mediaUrl} alt="media content" style={{ maxWidth: '100%', height: 'auto' }} />
          ) : isVideo(mediaUrl) ? (
            <video src={mediaUrl} controls style={{ maxWidth: '100%', height: 'auto' }} />
          ) : (
            <p>Unsupported media type</p>
          )}
        </>
      )}
      <div>

        {/* Renderiza o texto principal */}
        <MarkdownWrapper>{textWithoutMediaUrl}</MarkdownWrapper>

        {/* Renderiza os botões se houver */}
        {buttons.length > 0 && (
          <>
            <Divider />
            <ButtonRenderer buttons={buttons} />
          </>
        )}
      </div>
    </>
  );
};

export default Template;
