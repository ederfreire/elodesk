import React from "react";

import WhatsAppIcon from "@material-ui/icons/WhatsApp";
import InstagramIcon from "@material-ui/icons/Instagram";
import FacebookIcon from "@material-ui/icons/Facebook";
import webchatIcon from "../../assets/webchat.png";

const ConnectionIcon = ({ connectionType }) => {

    return (
        <React.Fragment>
            {/* wacalls = canal "WhatsApp Plus - Voz + Msg": mesmo selo verde do
                WhatsApp normal (era o badge vazio reportado — este componente
                não tinha nenhuma condição pra "wacalls", então nada renderizava
                dentro do círculo branco). */}
            {(connectionType === 'whatsapp' || connectionType === 'wacalls') && <WhatsAppIcon fontSize="small" style={{ marginBottom: '-5px', color: "#25D366" }} />}
            {(connectionType === 'whatsapp_oficial' || connectionType === 'whatsappOficial' || connectionType === 'official') && (
                <WhatsAppIcon fontSize="small" style={{ marginBottom: '-5px', color: "#1877F2" }} />
            )}
            {connectionType === 'instagram' && <InstagramIcon fontSize="small" style={{ marginBottom: '-5px', color: "#e1306c" }} />}
            {connectionType === 'facebook' && <FacebookIcon fontSize="small" style={{ marginBottom: '-5px', color: "#3b5998" }} />}
            {(connectionType === 'webchat' || connectionType === 'web_chat' || connectionType === 'web') && (
                <img
                    src={webchatIcon}
                    alt="WebChat"
                    style={{ width: 16, height: 16, marginBottom: '-3px', objectFit: 'contain', background: 'transparent' }}
                />
            )}
        </React.Fragment>
    );
};

export default ConnectionIcon;
