import React from 'react';
import { Button, Divider, Typography, Box } from "@material-ui/core";
import Facebook from "@material-ui/icons/Facebook";
import toastError from "../../errors/toastError";
import { i18n } from "../../translate/i18n";

const FacebookPostPreview = ({ image, sourceUrl, title, body, comment }) => {
  const [imageError, setImageError] = React.useState(false);

  const handlePostClick = async () => {
    try {
      if (sourceUrl && sourceUrl.trim() !== "") {
        window.open(sourceUrl, '_blank');
      }
    } catch (err) {
      toastError(err);
    }
  };

  // Verificar se há imagem válida (pode ser URL ou data URI)
  const hasValidImage = image && image.trim() !== "" && !imageError;

  return (
    <div style={{ minWidth: "250px", maxWidth: "400px", border: "1px solid #e0e0e0", borderRadius: "8px", overflow: "hidden" }}>
      {/* Imagem do post */}
      {hasValidImage && (
        <div 
          style={{ 
            width: "100%", 
            maxHeight: "300px", 
            overflow: "hidden",
            cursor: sourceUrl ? "pointer" : "default",
            backgroundColor: "#f5f5f5",
            display: "flex",
            alignItems: "center",
            justifyContent: "center"
          }}
          onClick={handlePostClick}
        >
          <img 
            src={image} 
            alt="Post preview" 
            referrerPolicy="no-referrer"
            crossOrigin="anonymous"
            style={{ 
              width: "100%", 
              height: "auto", 
              maxHeight: "300px",
              objectFit: "cover" 
            }} 
            onError={() => setImageError(true)}
          />
        </div>
      )}
      
      {/* Conteúdo do post */}
      <div style={{ padding: "12px" }}>
        {/* Ícone e título */}
        <Box display="flex" alignItems="center" marginBottom="8px">
          <Facebook style={{ color: "#1877f2", marginRight: "8px" }} />
          <Typography 
            variant="subtitle2" 
            color="textSecondary"
            style={{ fontSize: "0.75rem" }}
          >
            {title || i18n.t("facebookPostPreview.fbPost")}
          </Typography>
        </Box>
        
        {/* Texto do post - limitado a 150 caracteres */}
        {body && body.trim() !== "" && (
          <Typography 
            variant="body2" 
            color="textPrimary"
            style={{ 
              marginBottom: comment ? "12px" : "0px",
              whiteSpace: "pre-wrap",
              wordBreak: "break-word",
              fontSize: "0.875rem"
            }}
          >
            {body.length > 150 ? `${body.substring(0, 150)}...` : body}
          </Typography>
        )}
        
        {/* Comentário do usuário */}
        {comment && comment.trim() !== "" && (
          <Box 
            style={{ 
              marginTop: "12px", 
              padding: "8px", 
              backgroundColor: "#f0f2f5", 
              borderRadius: "4px",
              borderLeft: "3px solid #1877f2"
            }}
          >
            <Typography 
              variant="caption" 
              color="textSecondary"
              style={{ display: "block", marginBottom: "4px", fontWeight: "bold", fontSize: "0.7rem" }}
            >
              💭 {i18n.t("facebookPostPreview.yourComment")}
            </Typography>
            <Typography 
              variant="body2" 
              color="textPrimary"
              style={{ whiteSpace: "pre-wrap", wordBreak: "break-word", fontSize: "0.875rem" }}
            >
              {comment}
            </Typography>
          </Box>
        )}
        
        {/* Botão para ver publicação */}
        {sourceUrl && sourceUrl.trim() !== "" && (
          <>
            <Divider style={{ margin: "12px 0" }} />
            <Button
              fullWidth
              variant="outlined"
              color="primary"
              onClick={handlePostClick}
              startIcon={<Facebook />}
              size="small"
              style={{ textTransform: "none" }}
            >
              {i18n.t("facebookPostPreview.viewPost")}
            </Button>
          </>
        )}
      </div>
    </div>
  );
};

export default FacebookPostPreview;

