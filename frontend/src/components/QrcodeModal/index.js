import React, { useEffect, useState, useContext } from "react";
import QRCode from "qrcode.react";
import toastError from "../../errors/toastError";
import { makeStyles } from "@material-ui/core/styles";
import {
  Dialog,
  DialogContent,
  Typography,
  Box,
  CircularProgress,
  IconButton,
} from "@material-ui/core";
import CloseIcon from "@material-ui/icons/Close";
import { i18n } from "../../translate/i18n";
import api from "../../services/api";
import { AuthContext } from "../../context/Auth/AuthContext";

const useStyles = makeStyles((theme) => ({
  dialogPaper: {
    borderRadius: 16,
    overflow: "hidden",
    maxWidth: 460,
    width: "100%",
    margin: 16,
    background: "#fff",
  },
  header: {
    background: "linear-gradient(135deg, #00a884 0%, #00d4aa 100%)",
    padding: "32px 24px 28px",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    position: "relative",
  },
  closeButton: {
    position: "absolute",
    top: 8,
    right: 8,
    color: "rgba(255,255,255,0.8)",
    "&:hover": {
      color: "#fff",
      backgroundColor: "rgba(255,255,255,0.15)",
    },
  },
  whatsappIcon: {
    width: 48,
    height: 48,
    marginBottom: 12,
    filter: "drop-shadow(0 2px 8px rgba(0,0,0,0.15))",
  },
  headerTitle: {
    color: "#fff",
    fontWeight: 700,
    fontSize: "1.15rem",
    textAlign: "center",
    textShadow: "0 1px 3px rgba(0,0,0,0.1)",
  },
  headerSubtitle: {
    color: "rgba(255,255,255,0.85)",
    fontSize: "0.82rem",
    textAlign: "center",
    marginTop: 6,
    lineHeight: 1.4,
  },
  content: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    padding: "28px 24px 32px",
    background: "#fff",
  },
  qrWrapper: {
    position: "relative",
    padding: 16,
    borderRadius: 12,
    border: "2px solid #e8e8e8",
    background: "#fff",
    boxShadow: "0 4px 20px rgba(0,0,0,0.06)",
    transition: "all 0.3s ease",
    "&:hover": {
      borderColor: "#00a884",
      boxShadow: "0 4px 24px rgba(0,168,132,0.12)",
    },
  },
  qrOverlay: {
    position: "absolute",
    top: "50%",
    left: "50%",
    transform: "translate(-50%, -50%)",
    width: 44,
    height: 44,
    borderRadius: "50%",
    background: "#00a884",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    boxShadow: "0 2px 8px rgba(0,168,132,0.3)",
    zIndex: 2,
  },
  qrOverlayIcon: {
    color: "#fff",
    fontSize: 24,
    fontWeight: 700,
  },
  loadingContainer: {
    width: 256,
    height: 256,
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 12,
    border: "2px dashed #d0d0d0",
    background: "#fafafa",
  },
  loadingSpinner: {
    color: "#00a884",
    marginBottom: 16,
  },
  loadingText: {
    color: "#667781",
    fontSize: "0.85rem",
    textAlign: "center",
  },
  steps: {
    marginTop: 24,
    width: "100%",
    padding: "0 8px",
  },
  stepItem: {
    display: "flex",
    alignItems: "flex-start",
    gap: 12,
    marginBottom: 12,
    "&:last-child": {
      marginBottom: 0,
    },
  },
  stepNumber: {
    minWidth: 24,
    height: 24,
    borderRadius: "50%",
    background: "#00a884",
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    fontSize: "0.75rem",
    fontWeight: 700,
    flexShrink: 0,
    marginTop: 1,
  },
  stepText: {
    color: "#41525d",
    fontSize: "0.82rem",
    lineHeight: 1.5,
    "& strong": {
      color: "#111b21",
    },
  },
  refreshHint: {
    marginTop: 20,
    color: "#8696a0",
    fontSize: "0.75rem",
    textAlign: "center",
    display: "flex",
    alignItems: "center",
    gap: 4,
  },
}));

const QrcodeModal = ({ open, onClose, whatsAppId }) => {
  const classes = useStyles();
  const [qrCode, setQrCode] = useState("");
  const [countdown, setCountdown] = useState(0);
  const [connected, setConnected] = useState(false);
  // QR já foi escaneado (status "OPENING"), mas o WhatsApp ainda está
  // terminando de sincronizar a sessão do lado dele — pode levar até ~80s.
  // Sem esse estado o modal ficava mostrando o QR já escaneado (obsoleto)
  // até status virar CONNECTED, o que parecia travado/com bug.
  const [syncing, setSyncing] = useState(false);
  const [channel, setChannel] = useState("");
  const { user, socket } = useContext(AuthContext);

  const requestNewQr = async () => {
    if (!whatsAppId) return;
    try {
      await api.put(`/whatsappsession/${whatsAppId}`);
    } catch (err) {
      console.warn("Erro ao solicitar novo QR:", err);
    }
  };

  useEffect(() => {
    if (!open || !whatsAppId) return;
    setConnected(false);
    setSyncing(false);
    setQrCode("");
    setChannel("");
    const fetchSession = async () => {
      try {
        const { data } = await api.get(`/whatsapp/${whatsAppId}`);
        setChannel(data.channel || "");

        if (data.channel === "wacalls") {
          if (data.qrcode) {
            setQrCode(data.qrcode);
            setCountdown(45);
          } else {
            requestNewQr();
          }
          return;
        }

        // ⚠️ Não confiar em CONNECTED vindo do DB ao abrir o modal.
        // O usuário clicou para (re)parear — se o iPhone caiu do nada,
        // o backend pode ainda estar com status CONNECTED por alguns
        // segundos (socket órfão / evento connection.close atrasado).
        // Forçamos um restart limpo para gerar um QR novo. O sucesso
        // real só será exibido quando o socket emitir CONNECTED
        // (handler `onWhatsappData` mais abaixo).
        if (data.status === "CONNECTED") {
          await requestNewQr();
          return;
        }

        if (data.qrcode) {
          setQrCode(data.qrcode);
          setCountdown(45);
        } else {
          requestNewQr();
        }
      } catch (err) {
        toastError(err);
      }
    };
    fetchSession();
  }, [whatsAppId, open]);

  useEffect(() => {
    if (!open || !whatsAppId || channel !== "wacalls" || connected || syncing || qrCode) return;

    let active = true;
    let timer = null;
    let running = false;

    const pollLatestQr = async () => {
      if (!active || running) return;
      running = true;
      try {
        const { data } = await api.get(`/wacalls/qr/${whatsAppId}/latest`);
        if (!active) return;
        if (data?.qrcode) {
          setQrCode(data.qrcode);
          setCountdown(45);
          return;
        }
      } catch (err) {
        const status = err?.response?.status;
        if (status !== 202 && status !== 404) {
          console.warn("Erro ao buscar QR WaCalls:", err);
        }
      } finally {
        running = false;
      }
      if (active) timer = setTimeout(pollLatestQr, 3000);
    };

    pollLatestQr();

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [open, whatsAppId, channel, connected, syncing, qrCode]);

  // Rede de segurança: o wacalls-chat avisa "conectou" via socket (evento
  // em tempo real), mas isso depende do WebSocket entregar certinho — se
  // cair um pacote, ficar preso atrás de proxy, etc., o modal fica preso
  // mostrando QR mesmo com o celular já pareado. Enquanto o modal estiver
  // aberto numa conexão wacalls não conectada, consulta o status direto
  // (mesma rota que a tela de Conexões já usa) e fecha sozinho se detectar
  // CONNECTED — independe do socket funcionar.
  useEffect(() => {
    if (!open || !whatsAppId || channel !== "wacalls" || connected) return;
    let active = true;
    let timer = null;

    const pollStatus = async () => {
      if (!active) return;
      try {
        const { data } = await api.get(`/whatsapp/${whatsAppId}`);
        if (!active) return;
        const status = String(data?.status || "").toUpperCase();
        if (status === "CONNECTED" || status === "OPEN") {
          setConnected(true);
          setSyncing(false);
          setQrCode("");
          setTimeout(() => onClose(), 1500);
          return;
        }
        if (status === "OPENING") {
          setSyncing(true);
          setQrCode("");
        }
      } catch (err) {
        // silencioso — é só um reforço, o fluxo principal é o socket
      }
      if (active) timer = setTimeout(pollStatus, 4000);
    };

    timer = setTimeout(pollStatus, 4000);

    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [open, whatsAppId, channel, connected, onClose]);

  // Countdown: ao expirar, descarta o QR atual e solicita UM novo ao backend.
  // Guard com ref-like flag para garantir disparo único por ciclo (evita loop).
  useEffect(() => {
    if (!open || !qrCode || connected || channel === "wacalls") return;
    setCountdown(45);
    let requested = false;
    const interval = setInterval(() => {
      setCountdown((prev) => {
        if (prev <= 1) {
          clearInterval(interval);
          if (!requested) {
            requested = true;
            setQrCode(""); // destrói o QR anterior
            requestNewQr(); // pede um novo em tempo real
          }
          return 0;
        }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(interval);
  }, [qrCode, open, connected]);

  useEffect(() => {
    if (!whatsAppId || !open) return;
    const companyId = user.companyId;

    const onWhatsappData = (data) => {
      if (data.action === "update" && data.session.id === whatsAppId) {
        const sessionStatus = String(data.session.status || "").toLowerCase();
        // Conectou com sucesso
        if (sessionStatus === "connected" || sessionStatus === "open") {
          setConnected(true);
          setSyncing(false);
          setQrCode("");
          setTimeout(() => onClose(), 1500);
          return;
        }
        // QR já escaneado, sessão ainda sincronizando do lado do WhatsApp
        // (ver comentário no useState de `syncing`) — limpa o QR obsoleto e
        // mostra um estado de espera em vez de deixar o QR já usado na tela.
        if (sessionStatus === "opening") {
          setSyncing(true);
          setQrCode("");
          return;
        }
        // Novo QR recebido
        if (data.session.qrcode) {
          setSyncing(false);
          setQrCode(data.session.qrcode);
        }
        // Se vier update sem qrcode e não conectado (estados intermediários
        // como OPENING/DISCONNECTED), apenas mantemos o QR atual exibido
        // até o backend emitir um novo. NÃO solicitar restart aqui — isso
        // causa loop de abre/fecha da sessão.
      }
    };
    socket.on(`company-${companyId}-whatsappSession`, onWhatsappData);

    return () => {
      socket.off(`company-${companyId}-whatsappSession`, onWhatsappData);
    };
  }, [whatsAppId, onClose, user.companyId, open]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      classes={{ paper: classes.dialogPaper }}
      aria-labelledby="qr-code-dialog"
    >
      {/* Header verde WhatsApp */}
      <Box className={classes.header}>
        <IconButton className={classes.closeButton} onClick={onClose} size="small">
          <CloseIcon fontSize="small" />
        </IconButton>
        <svg
          className={classes.whatsappIcon}
          viewBox="0 0 48 48"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <path
            d="M24 4C12.954 4 4 12.954 4 24c0 3.535.922 6.855 2.535 9.738L4 44l10.524-2.76A19.91 19.91 0 0024 44c11.046 0 20-8.954 20-20S35.046 4 24 4z"
            fill="#fff"
          />
          <path
            d="M24 7C14.611 7 7 14.611 7 24c0 3.258.932 6.296 2.543 8.875L7.2 40.8l8.136-2.133A16.91 16.91 0 0024 41c9.389 0 17-7.611 17-17S33.389 7 24 7zm-3.5 9.5c.32 0 .66.007.95.018.35.01.82-.13 1.28.98.48 1.16 1.63 3.98 1.77 4.27.14.29.24.63.05.98-.19.35-.29.57-.57.87-.29.31-.6.69-.86.92-.29.26-.59.54-.25 1.07.34.52 1.49 2.46 3.2 3.99 2.2 1.96 4.05 2.57 4.62 2.86.57.29.9.24 1.23-.15.34-.38 1.43-1.67 1.81-2.24.38-.57.76-.48 1.28-.29.52.19 3.32 1.57 3.89 1.85.57.29.94.43 1.08.66.14.24.14 1.36-.33 2.67-.47 1.31-2.74 2.57-3.78 2.67-3.27.32-5.91-.66-8.82-2.63-4.24-2.88-6.66-7.43-6.86-7.77-.2-.34-2.08-2.77-2.08-5.28 0-2.52 1.31-3.75 1.78-4.26.47-.52 1.02-.64 1.37-.64z"
            fill="#00a884"
          />
        </svg>
        <Typography className={classes.headerTitle}>
          {i18n.t("qrcodeModal.title")}
        </Typography>
        <Typography className={classes.headerSubtitle}>
          {i18n.t("qrcodeModal.subtitle")}
        </Typography>
      </Box>

      <DialogContent className={classes.content}>
        {connected ? (
          <Box className={classes.loadingContainer} style={{ borderColor: "#00a884", borderStyle: "solid" }}>
            <Typography style={{ color: "#00a884", fontWeight: 700, fontSize: "1.1rem" }}>
              ✅ {i18n.t("qrcodeModal.connected")}
            </Typography>
          </Box>
        ) : syncing ? (
          <Box className={classes.loadingContainer}>
            <CircularProgress size={40} className={classes.loadingSpinner} />
            <Typography className={classes.loadingText}>
              {i18n.t(
                "qrcodeModal.syncing",
                "QR code confirmado! Sincronizando com o WhatsApp, isso pode levar até um minuto..."
              )}
            </Typography>
          </Box>
        ) : qrCode ? (
          <Box className={classes.qrWrapper}>
            {qrCode.startsWith("data:image") ? (
              <img
                src={qrCode}
                alt="QR Code"
                style={{ width: 256, height: 256, display: "block" }}
              />
            ) : (
              <QRCode
                value={qrCode}
                size={256}
                level="M"
                style={{ display: "block" }}
                fgColor="#111b21"
              />
            )}
          </Box>
        ) : (
          <Box className={classes.loadingContainer}>
            <CircularProgress size={40} className={classes.loadingSpinner} />
            <Typography className={classes.loadingText}>
              {i18n.t("qrcodeModal.generating")}
            </Typography>
          </Box>
        )}

        {!connected && !syncing && (
          <>
            {/* Passos */}
            <Box className={classes.steps}>
              <Box className={classes.stepItem}>
                <Box className={classes.stepNumber}>1</Box>
                <Typography className={classes.stepText} dangerouslySetInnerHTML={{ __html: i18n.t("qrcodeModal.step1") }} />
              </Box>
              <Box className={classes.stepItem}>
                <Box className={classes.stepNumber}>2</Box>
                <Typography className={classes.stepText} dangerouslySetInnerHTML={{ __html: i18n.t("qrcodeModal.step2Options") }} />
              </Box>
              <Box className={classes.stepItem}>
                <Box className={classes.stepNumber}>3</Box>
                <Typography className={classes.stepText} dangerouslySetInnerHTML={{ __html: i18n.t("qrcodeModal.step3") }} />
              </Box>
            </Box>

            <Typography className={classes.refreshHint}>
              {channel === "wacalls"
                ? "🔄 Este QR Code é atualizado automaticamente pelo servidor."
                : (qrCode && countdown > 0
                    ? `🔄 ${i18n.t("qrcodeModal.refreshCountdown", { seconds: countdown })}`
                    : `🔄 ${i18n.t("qrcodeModal.refreshing")}`)}
            </Typography>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default React.memo(QrcodeModal);
