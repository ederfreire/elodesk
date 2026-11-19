import React, {
  useState,
  useEffect,
  useContext,
  useRef,
  useCallback,
} from "react";
import "emoji-mart/css/emoji-mart.css";
import { Picker } from "emoji-mart";
import { useMediaQuery, useTheme } from "@material-ui/core";
import { isNil } from "lodash";
import {
  Fade
} from "@material-ui/core";
import { CircularProgress, ClickAwayListener, IconButton, InputBase, makeStyles, Paper, Hidden, Menu, MenuItem, Tooltip, Fab, Chip, Box } from "@material-ui/core";
import green from "@material-ui/core/colors/green";
import grey from "@material-ui/core/colors/grey";

// Ícones da barra de digitação em MUI 5 — antes vários ainda vinham do
// pacote antigo mesmo já existindo import MUI5 pronto ao lado sem uso (ex:
// Mood/MoodOutlinedIcon), sinal de migração que ficou pela metade.
import CheckCircleOutlineIcon from "@mui/icons-material/CheckCircleOutline";
import ClearIcon from "@mui/icons-material/Clear";
import HighlightOffIcon from "@mui/icons-material/HighlightOff";
import MicIcon from "@mui/icons-material/Mic";
import MoreVertIcon from "@mui/icons-material/MoreVert";
import SendIcon from "@mui/icons-material/Send";
import PermMediaIcon from "@mui/icons-material/PermMedia";
import ReplyIcon from "@mui/icons-material/Reply";
import DuoIcon from "@mui/icons-material/Duo";
import TimerIcon from "@mui/icons-material/Timer";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";
import TouchAppIcon from "@mui/icons-material/TouchApp";
import CameraAltIcon from "@mui/icons-material/CameraAlt";
import GroupAddIcon from "@mui/icons-material/GroupAdd";
import FormatBoldIcon from "@mui/icons-material/FormatBold";
import FormatItalicIcon from "@mui/icons-material/FormatItalic";
import FormatStrikethroughIcon from "@mui/icons-material/FormatStrikethrough";
import CodeIcon from "@mui/icons-material/Code";
import FormatListNumberedIcon from "@mui/icons-material/FormatListNumbered";
import FormatListBulletedIcon from "@mui/icons-material/FormatListBulleted";
import FormatQuoteIcon from "@mui/icons-material/FormatQuote";
import FormatClearIcon from "@mui/icons-material/FormatClear";

import AddIcon from "@mui/icons-material/AddRounded";

// Ícones da barra de digitação no estilo MUI 5 (outlined/rounded, mais modernos)
import MoodOutlinedIcon from "@mui/icons-material/MoodOutlined";
import BorderColorOutlinedIcon from "@mui/icons-material/BorderColorOutlined";
import AccountTreeOutlinedIcon from "@mui/icons-material/AccountTreeOutlined";
import ChatBubbleOutlineRoundedIcon from "@mui/icons-material/ChatBubbleOutlineRounded";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import ReportProblemOutlinedIcon from "@mui/icons-material/ReportProblemOutlined";
import BoltOutlinedIcon from "@mui/icons-material/BoltOutlined";
import PersonOutlineOutlinedIcon from "@mui/icons-material/PersonOutlineOutlined";
// MicRecorder (singleton global) removido: agora usamos MediaRecorder nativo.
import clsx from "clsx";
import { ReplyMessageContext } from "../../context/ReplyingMessage/ReplyingMessageContext";
import { AuthContext } from "../../context/Auth/AuthContext";
import { i18n } from "../../translate/i18n";
import toastError from "../../errors/toastError";
import api, { openApi } from "../../services/api";
import RecordingTimer from "./RecordingTimer";

import useQuickMessages from "../../hooks/useQuickMessages";
import { isString, isEmpty } from "lodash";
import ContactSendModal from "../ContactSendModal";
import CameraModal from "../CameraModal";
import axios from "axios";
import { toast } from "react-toastify";

// Limite máximo de tamanho por arquivo enviado no atendimento (em bytes).
// Deve refletir o limite aceito pelo backend (multer fileSize).
const MAX_UPLOAD_SIZE = 100 * 1024 * 1024; // 100MB
const MAX_UPLOAD_SIZE_LABEL = "100MB";

const formatFileSize = (bytes) => {
  if (!bytes && bytes !== 0) return "";
  if (bytes >= 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)}MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(1)}KB`;
  return `${bytes}B`;
};

// Filtra arquivos acima do limite e exibe aviso para cada um.
// Retorna a lista de arquivos válidos (ou [] se todos forem rejeitados).
const filterOversized = (files) => {
  const valid = [];
  const oversized = [];
  files.forEach((f) => {
    if (f && typeof f.size === "number" && f.size > MAX_UPLOAD_SIZE) {
      oversized.push(f);
    } else {
      valid.push(f);
    }
  });
  oversized.forEach((f) => {
    toast.warning(
      `O arquivo "${f.name}" (${formatFileSize(f.size)}) excede o limite de ${MAX_UPLOAD_SIZE_LABEL} permitido para envio e não será enviado.`,
      { autoClose: 6000 }
    );
  });
  return valid;
};

import useCompanySettings from "../../hooks/useSettings/companySettings";
import { ForwardMessageContext } from "../../context/ForwarMessage/ForwardMessageContext";
import MessageUploadMedias from "../MessageUploadMedias";
import { EditMessageContext } from "../../context/EditingMessage/EditingMessageContext";
import ScheduleModal from "../ScheduleModal";
import usePlans from "../../hooks/usePlans";
import TemplateModal from "../TemplateMetaModal";
import TriggerFlowModal from "../TriggerFlowModal";
import InteractiveMessageModal from "../InteractiveMessageModal";
// Mesma imagem de papel de parede usada em MessagesList — antes eu tentava
// aproximar com uma cor sólida (#ECE5DD), mas isso nunca bate 100% com o
// tom real da imagem, sempre sobra uma fresta de cor visivelmente diferente.
// Usando a imagem de verdade, fica idêntico por definição.
import whatsBackground from "../../assets/wa-background.png";
import whatsBackgroundDark from "../../assets/wa-background-dark.png";

// Mp3Recorder singleton removido — substituído por MediaRecorder nativo
// instanciado por gravação dentro do componente (ver handleStartRecording).

const isMobileDevice = () => {
  return /Android|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent);
};

const useStyles = makeStyles((theme) => ({
  mainWrapper: {
    // Valores EXATOS copiados de MessagesList/index.js (classes.messagesList)
    // — até agora eu vinha aproximando com #ECE5DD (bege genérico do
    // WhatsApp), que nunca foi a cor real usada neste projeto. A cor de
    // base de verdade é #ebebeb, e o tamanho do tile também importa pra o
    // padrão emendar sem costura visível.
    backgroundColor: theme.mode === "dark" ? "#0b0b0d" : "#ebebeb",
    backgroundImage: theme.mode === "dark" ? `url(${whatsBackgroundDark})` : `url(${whatsBackground})`,
    backgroundSize: theme.mode === "dark" ? "cover" : "412.5px 749.25px",
    backgroundRepeat: "repeat",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    borderTop: "none",
    boxShadow: "none",
    flexShrink: 0,
    padding: "10px 16px 14px",
    "@media (max-width: 960px)": {
      padding: "6px 8px 10px",
      marginBottom: 0,
      flexShrink: 0,
      zIndex: 10,
    },
  },
  "@keyframes pulse": {
    "0%": {
      boxShadow: "0 0 0 0 rgba(25, 118, 210, 0.7)",
    },
    "70%": {
      boxShadow: "0 0 0 10px rgba(25, 118, 210, 0)",
    },
    "100%": {
      boxShadow: "0 0 0 0 rgba(25, 118, 210, 0)",
    },
  },
  avatar: {
    width: "50px",
    height: "50px",
    borderRadius: "25%",
  },
  dropInfo: {
    background: theme.mode === "dark" ? "#1a1c2e" : "#eee",
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    width: "100%",
    padding: 15,
    left: 0,
    right: 0,
  },
  dropInfoOut: {
    display: "none",
  },
  gridFiles: {
    maxHeight: "100%",
    overflow: "scroll",
  },
  newMessageBox: {
    background: theme.mode === "dark" ? "#242640" : "#ffffff",
    width: "100%",
    display: "flex",
    padding: "8px 14px",
    alignItems: "center",
    gap: 4,
    borderRadius: 24,
    boxShadow: theme.mode === "dark"
      ? "0 4px 16px rgba(0,0,0,0.35)"
      : "0 4px 16px rgba(15,23,42,0.10)",
    border: theme.mode === "dark" ? "1px solid rgba(255,255,255,0.10)" : "1px solid rgba(15,23,42,0.09)",
    // Padroniza os ícones MUI da barra em 18px de uma vez, sobrescrevendo
    // qualquer um que tenha escapado do ajuste individual. Só o seletor
    // .MuiSvgIcon-root (não "svg" genérico) pra não afetar o emoji picker
    // nem outros elementos que abrem como filhos deste container.
    "& .MuiSvgIcon-root": {
      fontSize: "18px !important",
    },
    "@media (max-width: 960px)": {
      padding: "6px 10px",
      gap: 0,
      borderRadius: 20,
    },
  },
  // Linha vertical separando os ícones de ferramenta do campo de texto —
  // detalhe da referência que faltava.
  toolbarDivider: {
    width: 1,
    alignSelf: "stretch",
    margin: "4px 6px",
    backgroundColor: theme.mode === "dark" ? "rgba(255,255,255,0.12)" : "rgba(15,23,42,0.10)",
    flexShrink: 0,
    "@media (max-width: 960px)": {
      display: "none",
    },
  },
  messageInputWrapper: {
    padding: "8px 14px",
    marginRight: 0,
    background: theme.mode === "dark" ? "rgba(255,255,255,0.04)" : "rgba(15,23,42,0.03)",
    display: "flex",
    borderRadius: 20,
    flex: 1,
    position: "relative",
    zIndex: 10,
    boxShadow: "none",
    border: "1px solid transparent",
    transition: "box-shadow 0.2s ease, border-color 0.2s ease",
    "&:focus-within": {
      borderColor: theme.palette.primary.main + "60",
      boxShadow: theme.mode === "dark"
        ? `0 0 0 2px ${theme.palette.primary.main}20`
        : `0 0 0 2px ${theme.palette.primary.main}15`,
    },

    "@media (max-width: 960px)": {
      padding: "2px 6px",
      borderRadius: 20,
    },
  },

  messageInputWrapperPrivate: {
    padding: "8px 14px",
    marginRight: 0,
    background: theme.mode === "dark" ? "#3a3520" : "#FFF9E6",
    display: "flex",
    borderRadius: 24,
    flex: 1,
    position: "relative",
    zIndex: 10,
    border: "1px solid #F0E68C80",
    boxShadow: "0 1px 4px rgba(0,0,0,0.06)",
    "@media (max-width: 960px)": {
      padding: "2px 6px",
      borderRadius: 20,
    },
  },

  messageInputWrapperPending: {
    padding: "8px 14px",
    marginRight: 0,
    background: theme.mode === "dark" ? "#3d2e10" : "#FFF3E0",
    display: "flex",
    borderRadius: 24,
    flex: 1,
    position: "relative",
    border: "2px solid #FF9800",
    zIndex: 10,
    boxShadow: "0 1px 4px rgba(255,152,0,0.15)",
    "@media (max-width: 960px)": {
      padding: "2px 6px",
      borderRadius: 20,
    },
  },
  messageInput: {
    paddingLeft: 10,
    flex: 1,
    border: "none",
    fontSize: "0.95rem",
    "@media (max-width: 960px)": {
      paddingLeft: 8,
    },
  },
  messageInputPrivate: {
    paddingLeft: 10,
    flex: 1,
    border: "none",
    color: grey[800],
    fontSize: "0.95rem",
    "@media (max-width: 960px)": {
      paddingLeft: 8,
    },
  },
  messageInputPending: {
    paddingLeft: 10,
    flex: 1,
    border: "none",
    color: "#E65100",
    fontWeight: 500,
    fontSize: "0.95rem",
    "@media (max-width: 960px)": {
      paddingLeft: 8,
    },
  },
  sendMessageIcons: {
    color: theme.mode === "dark" ? "#94a3b8" : "#64748b",
    fontSize: 18,
    transition: "color 0.2s ease",
  },
  sendActionButton: {},
  barIconButton: {
    padding: "6px !important",
  },

  ForwardMessageIcons: {
    color: grey[700],
    transform: "scaleX(-1)",
  },
  uploadInput: {
    display: "none",
  },
  viewMediaInputWrapper: {
    maxHeight: "100%",
    display: "flex",
    padding: "10px 13px",
    position: "relative",
    justifyContent: "space-between",
    alignItems: "center",
    backgroundColor: theme.mode === "light" ? "#ffffff" : "#202c33",
    borderTop: "1px solid rgba(0, 0, 0, 0.12)",
  },
  emojiBox: {
    position: "absolute",
    bottom: 63,
    width: 40,
    borderTop: "1px solid #e8e8e8",
  },
  circleLoading: {
    color: green[500],
    opacity: "70%",
    position: "absolute",
    top: "20%",
    left: "50%",
    marginLeft: -12,
  },
  audioLoading: {
    color: green[500],
    opacity: "70%",
  },
  recorderWrapper: {
    display: "flex",
    alignItems: "center",
    alignContent: "middle",
  },
  cancelAudioIcon: {
    color: "red",
  },
  sendAudioIcon: {
    color: "green",
  },
  replyginMsgWrapper: {
    display: "flex",
    width: "100%",
    alignItems: "center",
    justifyContent: "center",
    paddingTop: 8,
    paddingLeft: 73,
    paddingRight: 7,
    backgroundColor: theme.palette.optionsBackground,
    "@media (max-width: 960px)": {
      paddingLeft: 10,
      paddingRight: 4,
      paddingTop: 4,
    },
  },
  replyginMsgContainer: {
    flex: 1,
    marginRight: 5,
    overflowY: "hidden",
    backgroundColor: theme.mode === "light" ? "#f0f0f0" : "#1d282f",
    borderRadius: "7.5px",
    display: "flex",
    position: "relative",
  },
  replyginMsgBody: {
    padding: 10,
    height: "auto",
    display: "block",
    whiteSpace: "pre-wrap",
    overflow: "hidden",
  },
  replyginContactMsgSideColor: {
    flex: "none",
    width: "4px",
    backgroundColor: "#35cd96",
  },
  replyginSelfMsgSideColor: {
    flex: "none",
    width: "4px",
    backgroundColor: "#6bcbef",
  },
  floatingFormatMenu: {
    position: 'fixed',
    backgroundColor: theme.palette.background.paper,
    borderRadius: theme.shape.borderRadius,
    boxShadow: theme.shadows[8],
    zIndex: 9999,
    display: 'flex',
    flexDirection: 'row',
    alignItems: 'center',
    padding: '4px',
    border: `1px solid ${theme.palette.divider}`,
  },

  formatIconButton: {
    padding: '6px',
    borderRadius: '4px',
    minWidth: '32px',
    height: '32px',
  },
  messageContactName: {
    display: "flex",
    color: "#6bcbef",
    fontWeight: 500,
  },
  messageQuickAnswersWrapper: {
    margin: 0,
    position: "absolute",
    bottom: "100%", // ✅ Posicionar acima do input
    background: theme.palette.background.default,
    padding: 0,
    border: "none",
    left: 0,
    right: 0, // ✅ Usar right: 0 em vez de width: 100%
    maxHeight: "200px",
    overflowY: "auto",
    overflowX: "hidden",
    boxShadow: "0 -4px 16px rgba(0, 0, 0, 0.15)",
    borderRadius: "8px 8px 0 0",
    zIndex: 1000, // ✅ Z-index menor para evitar conflitos
    "&::-webkit-scrollbar": {
      width: "6px",
    },
    "&::-webkit-scrollbar-track": {
      background: "transparent",
    },
    "&::-webkit-scrollbar-thumb": {
      backgroundColor: theme.palette.action.disabled,
      borderRadius: "3px",
      "&:hover": {
        backgroundColor: theme.palette.action.hover,
      },
    },
    "& li": {
      listStyle: "none",
      "& a": {
        display: "block",
        padding: "8px",
        textOverflow: "ellipsis",
        overflow: "hidden",
        maxHeight: "auto",
        "&:hover": {
          background: theme.palette.background.paper,
          cursor: "pointer",
        },
      },
    },
  },
  quickAnswerItem: {
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(1),
    padding: theme.spacing(1.5),
    minHeight: "48px",
    cursor: "pointer", // ✅ Adicionar cursor pointer
    borderRadius: "4px", // ✅ Bordas arredondadas
    margin: "2px 4px", // ✅ Pequena margem
    "&:hover": {
      backgroundColor: theme.palette.action.hover,
    },
    transition: "all 0.2s ease-in-out",
  },

  // ✅ NOVO: Estilo para item selecionado via teclado
  quickAnswerItemSelected: {
    backgroundColor: theme.palette.primary.light + "30", // ✅ Cor semi-transparente
    borderLeft: `4px solid ${theme.palette.primary.main}`,
    fontWeight: 500,
  },

  // ✅ NOVO: Indicador de scroll
  quickAnswersScrollIndicator: {
    textAlign: "center",
    padding: theme.spacing(1),
    fontSize: "0.75rem",
    color: theme.palette.text.secondary,
    fontStyle: "italic",
    borderTop: `1px solid ${theme.palette.divider}`,
    backgroundColor: theme.palette.background.paper,
  },
  quickAnswerText: {
    flex: 1,
    textOverflow: "ellipsis",
    overflow: "hidden",
  },
  mediaTypeChip: {
    height: 20,
    fontSize: "0.7rem",
  },
  invertedFabMenu: {
    border: "none",
    borderRadius: 10,
    boxShadow: "none",
    padding: theme.spacing(1),
    backgroundColor: "transparent",
    color: theme.mode === "dark" ? "#94a3b8" : "#64748b",
    transition: "all 0.2s ease",
    "&:hover": {
      backgroundColor: theme.mode === "dark" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)",
      color: theme.palette.primary.main,
    },
    "&:disabled": {
      backgroundColor: "transparent !important",
    },
  },
  invertedFabMenuMP: {
    border: "none",
    borderRadius: 8,
    boxShadow: "none",
    width: theme.spacing(4),
    height: theme.spacing(4),
    backgroundColor: "#3b82f510",
    color: "#3b82f5",
    "&:hover": {
      backgroundColor: "#3b82f520",
    },
  },
  invertedFabMenuCont: {
    border: "none",
    borderRadius: 8,
    boxShadow: "none",
    minHeight: "auto",
    width: theme.spacing(4),
    height: theme.spacing(4),
    backgroundColor: "#06b6d410",
    color: "#06b6d4",
    "&:hover": {
      backgroundColor: "#06b6d420",
    },
  },
  invertedFabMenuMeet: {
    border: "none",
    borderRadius: 8,
    boxShadow: "none",
    minHeight: "auto",
    width: theme.spacing(4),
    height: theme.spacing(4),
    backgroundColor: "#22c55e10",
    color: "#22c55e",
    "&:hover": {
      backgroundColor: "#22c55e20",
    },
  },
  invertedFabMenuDoc: {
    border: "none",
    borderRadius: 8,
    boxShadow: "none",
    width: theme.spacing(4),
    height: theme.spacing(4),
    backgroundColor: "#8b5cf610",
    color: "#8b5cf6",
    "&:hover": {
      backgroundColor: "#8b5cf620",
    },
  },
  invertedFabMenuCamera: {
    border: "none",
    borderRadius: 8,
    boxShadow: "none",
    width: theme.spacing(4),
    height: theme.spacing(4),
    backgroundColor: "#ec489910",
    color: "#ec4899",
    "&:hover": {
      backgroundColor: "#ec489920",
    },
  },
  flexContainer: {
    display: "flex",
    flex: 1,
    flexDirection: "column",
    minWidth: 0,
  },
  flexItem: {
    flex: 1,
    minWidth: 0,
  },
  pendingAlert: {
    marginBottom: theme.spacing(1),
    padding: theme.spacing(1, 2),
    backgroundColor: theme.mode === "dark" ? `${theme.palette.primary?.main || '#2196F3'}15` : `${theme.palette.primary?.main || '#2196F3'}15`,
    border: `1px solid ${theme.palette.primary?.main || '#2196F3'}80`,
    borderRadius: 4,
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(1),
    color: theme.palette.primary?.main || '#1976D2',
    fontSize: "0.875rem",
  },
}));

const MessageInput = ({
  ticketId,
  ticketStatus,
  droppedFiles,
  contactId,
  ticketChannel,
  whatsappId,
  isGroup,
}) => {
  const classes = useStyles();
  const theme = useTheme();
  const [mediasUpload, setMediasUpload] = useState([]);
  const isMounted = useRef(true);
  // Trava síncrona contra envio duplicado. `loading` (useState) só bloqueia
  // o botão DEPOIS que o React re-renderiza — clique duplo, Enter+clique
  // quase juntos, ou uma renderização atrasada sob carga passam por essa
  // janela e disparam handleSendMessage() duas vezes, cada uma virando um
  // envio de verdade pro WhatsApp (mensagens diferentes na origem, então a
  // proteção de duplicidade por ID no banco não pega). Ref é síncrona —
  // não tem essa janela de corrida.
  const isSendingRef = useRef(false);

  const [inputMessage, setInputMessage] = useState("");
  const [showEmoji, setShowEmoji] = useState(false);
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [loading, setLoading] = useState(false);
  const [recording, setRecording] = useState(false);
  const [quickAnswers, setQuickAnswer] = useState([]);
  const [typeBar, setTypeBar] = useState(false);
  const inputRef = useRef();
  // 🎙️ Gravação de áudio com MediaRecorder NATIVO (sem singleton global).
  // Cada gravação cria uma instância nova, evitando travar para sempre se o
  // MediaRecorder cair em estado inconsistente.
  const mediaRecorderRef = useRef(null);
  const audioStreamRef = useRef(null);
  const audioChunksRef = useRef([]);
  const audioMimeRef = useRef("audio/webm");
  const [onDragEnter, setOnDragEnter] = useState(false);
  const [anchorEl, setAnchorEl] = useState(null);
  const { setReplyingMessage, replyingMessage } =
    useContext(ReplyMessageContext);
  const { setEditingMessage, editingMessage } = useContext(EditMessageContext);
  const { user, socket } = useContext(AuthContext);
  const [appointmentModalOpen, setAppointmentModalOpen] = useState(false);
  const { getPlanCompany } = usePlans();

  const [signMessagePar, setSignMessagePar] = useState(false);
  const { get: getSetting } = useCompanySettings();
  const [signMessage, setSignMessage] = useState(true);
  const [privateMessage, setPrivateMessage] = useState(false);
  const [privateMessageInputVisible, setPrivateMessageInputVisible] =
    useState(false);
  const [senVcardModalOpen, setSenVcardModalOpen] = useState(false);
  const [showModalMedias, setShowModalMedias] = useState(false);
  const [showSchedules, setShowSchedules] = useState(false);
  const [useWhatsappOfficial, setUseWhatsappOfficial] = useState(false);
  const { list: listQuickMessages } = useQuickMessages();

  const isMobile = useMediaQuery("(max-width: 767px)");
  const [placeholderText, setPlaceHolderText] = useState("");

  const [selectedQuickAnswerIndex, setSelectedQuickAnswerIndex] = useState(-1);
  const [isNavigatingQuickAnswers, setIsNavigatingQuickAnswers] = useState(false);

  const [triggerFlowModalOpen, setTriggerFlowModalOpen] = useState(false);
  const [interactiveModalOpen, setInteractiveModalOpen] = useState(false);
  const [interactiveInitialType, setInteractiveInitialType] = useState(null);

  const handleOpenInteractive = (type = null) => {
    setInteractiveInitialType(type);
    setInteractiveModalOpen(true);
    handleMenuItemClick();
  };
  const [flowProcessing, setFlowProcessing] = useState(false);
  const flowProcessingRef = useRef(false);
  const [aiSuggesting, setAiSuggesting] = useState(false);
  const [aiSuggestEnabled, setAiSuggestEnabled] = useState(true);

  const [formatMenuAnchorPosition, setFormatMenuAnchorPosition] = useState(null);
  const [selectedText, setSelectedText] = useState({ text: '', start: 0, end: 0 });
  const currentPresenceRef = useRef(null);
  const presenceTimeoutRef = useRef(null);

  // Estado para janela de 24h do WhatsApp Oficial
  const [needsTemplate, setNeedsTemplate] = useState(false);
  const [hoursElapsed, setHoursElapsed] = useState(null);
  const [isWhatsAppOfficial, setIsWhatsAppOfficial] = useState(false);
  const [windowCheckLoading, setWindowCheckLoading] = useState(false);

  const isTicketPending = () => {
    return ticketStatus === "pending";
  };

  useEffect(() => {
    if (isTicketPending()) {
      setPrivateMessage(true);
      setPrivateMessageInputVisible(true);
    }
  }, [ticketStatus]);

  // Carregar configuração de IA sugerir resposta
  useEffect(() => {
    const loadAiSuggestSetting = async () => {
      try {
        const setting = await getSetting({ column: "aiSuggestReply" });
        if (setting !== undefined && setting !== null) {
          const value = typeof setting === "object" ? setting.aiSuggestReply : setting;
          setAiSuggestEnabled(
            value === true || value === "true" || value === "enabled"
          );
        }
      } catch (err) {
      }
    };
    loadAiSuggestSetting();
  }, []);

  // ✅ Abrir modal de template automaticamente se veio do NewTicketModal com API Oficial
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("openTemplate") === "true" && ticketChannel === "whatsapp_oficial") {
      // Aguardar templates carregarem
      const timer = setTimeout(() => {
        setTemplateModalOpen(true);
        // Limpar o parâmetro da URL
        const url = new URL(window.location.href);
        url.searchParams.delete("openTemplate");
        window.history.replaceState({}, "", url.toString());
      }, 1000);
      return () => clearTimeout(timer);
    }
  }, [ticketChannel]);

  useEffect(() => {
    async function fetchTemplates() {
      const templates = await api.request({
        url: `/quick-messages/list`,
        method: "GET",
        params: {
          isOficial: "true",
          userId: user.id,
          companyId: user.companyId,
          status: "APPROVED",
          // whatsappId,
        },
      });
      setTemplates(templates.data);
    }
    if (useWhatsappOfficial) {
      fetchTemplates();
    }
  }, [useWhatsappOfficial]);

  useEffect(() => {
    async function fetchData() {
      const companyId = user.companyId;
      const planConfigs = await getPlanCompany(undefined, companyId);
      setShowSchedules(planConfigs.plan.useSchedules);
      setUseWhatsappOfficial(planConfigs.plan.useWhatsappOfficial);
    }
    fetchData();
  }, []);

  // Função para verificar janela de 24h (reutilizável)
  const checkWhatsAppWindow = useCallback(async () => {
    if (!ticketId || ticketChannel !== "whatsapp_oficial") {
      setNeedsTemplate(false);
      setIsWhatsAppOfficial(false);
      return;
    }

    try {
      setWindowCheckLoading(true);
      const { data } = await api.get(`/tickets/${ticketId}/check-whatsapp-window`);
      
      setIsWhatsAppOfficial(data.isWhatsAppOfficial);
      setNeedsTemplate(data.needsTemplate);
      setHoursElapsed(typeof data.hoursElapsed === "number" ? data.hoursElapsed : null);
      
    } catch (err) {
      console.error("Erro ao verificar janela de 24h:", err);
      setNeedsTemplate(false);
    } finally {
      setWindowCheckLoading(false);
    }
  }, [ticketId, ticketChannel]);

  // Verificar janela de 24h do WhatsApp Oficial
  useEffect(() => {
    checkWhatsAppWindow();
  }, [checkWhatsAppWindow]);

  // ✅ Re-verificar janela de 24h quando uma nova mensagem do contato chegar
  useEffect(() => {
    if (!ticketId || ticketChannel !== "whatsapp_oficial" || !socket || !user?.companyId) {
      return;
    }

    const companyId = user.companyId;
    

    const onAppMessage = (data) => {

      // ✅ Quando uma nova mensagem é criada E não é do usuário (é do contato)
      // Verificar tanto por UUID quanto por ID numérico para garantir compatibilidade
      const isThisTicket = data.message?.ticket?.uuid === ticketId || 
                           data.message?.ticket?.id === ticketId ||
                           data.ticket?.uuid === ticketId ||
                           data.ticket?.id === ticketId;

      if (data.action === "create" && isThisTicket && !data.message?.fromMe) {
        // Aguardar um pouco para garantir que o backend atualizou lastInteractionClient
        setTimeout(() => {
          checkWhatsAppWindow();
        }, 1000);
      }
    };

    socket.on(`company-${companyId}-appMessage`, onAppMessage);

    return () => {
      socket.off(`company-${companyId}-appMessage`, onAppMessage);
    };
  }, [ticketId, ticketChannel, socket, user?.companyId, checkWhatsAppWindow]);

  useEffect(() => {
    if (needsTemplate && isWhatsAppOfficial) {
      setPlaceHolderText(i18n.t("messagesInputExtra.placeholderTemplateOnly"));
    } else if (ticketStatus === "open" || ticketStatus === "group") {
      setPlaceHolderText(i18n.t("messagesInput.placeholderOpen"));
    } else if (ticketStatus === "pending") {
      setPlaceHolderText(i18n.t("messagesInputExtra.placeholderPending"));
    } else {
      setPlaceHolderText(i18n.t("messagesInput.placeholderClosed"));
    }

    const maxLength = isMobile ? 20 : Infinity;

    if (isMobile && placeholderText.length > maxLength) {
      setPlaceHolderText(placeholderText.substring(0, maxLength) + "...");
    }
  }, [ticketStatus, needsTemplate, isWhatsAppOfficial]);

  const {
    selectedMessages,
    setForwardMessageModalOpen,
    showSelectMessageCheckbox,
  } = useContext(ForwardMessageContext);

  useEffect(() => {
    if (droppedFiles && droppedFiles.length > 0) {
      const selectedMedias = filterOversized(Array.from(droppedFiles));
      if (!selectedMedias.length) return;
      setMediasUpload(selectedMedias);
      setShowModalMedias(true);
    }
  }, [droppedFiles]);

  // ✅ Ciclo de vida do isMounted: SOMENTE no mount/unmount real do componente.
  // Antes isso estava no mesmo effect de [socket, ticketId] e o cleanup zerava
  // isMounted.current a cada troca de socket/ticket, deixando-o "false" para
  // sempre — o que impedia o POST do áudio de ser enviado.
  useEffect(() => {
    isMounted.current = true;
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    return () => {
      clearTimeout(presenceTimeoutRef.current);
      if (socket && ticketId && currentPresenceRef.current) {
        socket.emit("presenceUpdate", { ticketId, presence: "paused" });
      }
    };
  }, [socket, ticketId]);

  useEffect(() => {
    inputRef.current.focus();
    if (editingMessage) {
      setInputMessage(editingMessage.body);
    }
  }, [replyingMessage, editingMessage]);

  useEffect(() => {
    inputRef.current.focus();
    return () => {
      setInputMessage("");
      setShowEmoji(false);
      setMediasUpload([]);
      setReplyingMessage(null);
      if (!isTicketPending()) {
        setPrivateMessage(false);
        setPrivateMessageInputVisible(false);
      }
      setEditingMessage(null);
    };
  }, [ticketId, setReplyingMessage, setEditingMessage]);

  useEffect(() => {
    let isProcessing = false;

    const handleInsertQuickMessage = (event) => {
      if (isProcessing) {
        return;
      }

      isProcessing = true;
      const { quickMessage } = event.detail;

      if (!quickMessage) {
        console.error("❌ quickMessage não encontrado no evento");
        isProcessing = false;
        return;
      }

      // Usar o MESMO fluxo da barra "/" para garantir consistência
      const quickAnswerValue = {
        value: quickMessage.message || "",
        mediaPath: quickMessage.mediaPath || null,
        mediaType: quickMessage.mediaType || null,
        shortcode: quickMessage.shortcode || "",
        label: `/${quickMessage.shortcode || ""} - ${quickMessage.message || ""}`
      };

      if (quickMessage.mediaPath) {
        // Com mídia: usar handleQuickAnswersClick via ref (evita stale closure)
        handleQuickAnswersClickRef.current(quickAnswerValue).finally(() => {
          isProcessing = false;
        });
      } else {
        // Texto puro: inserir no campo e focar
        setInputMessage(quickMessage.message || "");
        setTypeBar(false);

        setTimeout(() => {
          if (inputRef.current) {
            inputRef.current.focus();
          }
          isProcessing = false;
        }, 100);
      }
    };

    window.addEventListener('insertQuickMessage', handleInsertQuickMessage);

    return () => {
      window.removeEventListener('insertQuickMessage', handleInsertQuickMessage);
      isProcessing = false;
    };
  }, [ticketId]); // Dependência mínima - handleQuickAnswersClick acessado via ref

  useEffect(() => {
    setTimeout(() => {
      if (isMounted.current) setOnDragEnter(false);
    }, 1000);
  }, [onDragEnter === true]);

  useEffect(() => {
    const fetchSettings = async () => {
      const setting = await getSetting({
        column: "sendSignMessage",
      });

      if (isMounted.current) {
        if (setting.sendSignMessage === "enabled") {
          setSignMessagePar(true);
          const signMessageStorage = JSON.parse(
            localStorage.getItem("persistentSignMessage")
          );
          if (isNil(signMessageStorage)) {
            setSignMessage(true);
          } else {
            setSignMessage(signMessageStorage);
          }
        } else if (setting.sendSignMessage === "dontSend") {
          localStorage.setItem("persistentSignMessage", false);
          setSignMessage(false);
          setSignMessagePar(false);
        } else {
          setSignMessagePar(false);
        }
      }
    };
    fetchSettings();
  }, []);

  // CORREÇÃO DO ERRO charAt - Função mais robusta
  const safeCapitalizeFirstLetter = (string) => {
    if (!string || typeof string !== 'string') return "";
    return string.charAt(0).toUpperCase() + string.slice(1);
  };

  // FUNÇÃO PARA IA SUGERIR RESPOSTA
  const handleAiSuggestReply = useCallback(async () => {
    if (aiSuggesting) return;
    setAiSuggesting(true);
    try {
      const { data } = await api.post(`/messages/${ticketId}/ai-suggest`, {
        userMessage: inputMessage || undefined
      });
      if (data.suggestion) {
        setInputMessage(data.suggestion);
        if (inputRef.current) {
          inputRef.current.focus();
        }
      }
    } catch (err) {
      toastError(err);
    } finally {
      setAiSuggesting(false);
    }
  }, [ticketId, inputMessage, aiSuggesting]);

  // Escutar evento de sugerir resposta IA disparado pelo menu dos 3 pontinhos
  useEffect(() => {
    const handler = () => handleAiSuggestReply();
    window.addEventListener("aiSuggestReply", handler);
    return () => window.removeEventListener("aiSuggestReply", handler);
  }, [handleAiSuggestReply]);

  // FUNÇÕES PARA TRIGGER FLOW MODAL
  const handleTriggerFlowClick = useCallback(() => {

    // 🛡️ RESET PREVENTIVO
    setFlowProcessing(false);
    flowProcessingRef.current = false;

    setTriggerFlowModalOpen(true);
  }, []);

  const handleTriggerFlowClose = useCallback(() => {

    setFlowProcessing(false);
    flowProcessingRef.current = false;
    setTriggerFlowModalOpen(false);
  }, []);

  const handleFlowProcessing = useCallback((isProcessing) => {
    setFlowProcessing(isProcessing);
    flowProcessingRef.current = isProcessing;

    // 🔥 TIMEOUT SIMPLES: 8 segundos e libera SEM PERGUNTAR
    if (isProcessing) {
      setTimeout(() => {
        setFlowProcessing(false);
        flowProcessingRef.current = false;
      }, 8000);
    }
  }, []);

  const handleFlowTriggered = useCallback((data) => {

    // 🔥 RESET IMEDIATO - SEM TIMEOUT
    setFlowProcessing(false);
    flowProcessingRef.current = false;
  }, []);

  // NAVEGAÇÃO POR TECLADO CORRIGIDA
  const handleKeyDown = useCallback((e) => {
    if (!typeBar || !Array.isArray(typeBar) || typeBar.length === 0) {
      setSelectedQuickAnswerIndex(-1);
      setIsNavigatingQuickAnswers(false);
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setIsNavigatingQuickAnswers(true);
        setSelectedQuickAnswerIndex(prev => {
          const nextIndex = prev < typeBar.length - 1 ? prev + 1 : 0;

          // SCROLL AUTOMÁTICO CORRIGIDO
          setTimeout(() => {
            const container = document.querySelector('.MuiBox-root ul');
            if (container) {
              const selectedElement = container.children[nextIndex];
              if (selectedElement) {
                selectedElement.scrollIntoView({
                  behavior: 'smooth',
                  block: 'nearest'
                });
              }
            }
          }, 0);

          return nextIndex;
        });
        break;

      case 'ArrowUp':
        e.preventDefault();
        setIsNavigatingQuickAnswers(true);
        setSelectedQuickAnswerIndex(prev => {
          const nextIndex = prev > 0 ? prev - 1 : typeBar.length - 1;

          // SCROLL AUTOMÁTICO CORRIGIDO
          setTimeout(() => {
            const container = document.querySelector('.MuiBox-root ul');
            if (container) {
              const selectedElement = container.children[nextIndex];
              if (selectedElement) {
                selectedElement.scrollIntoView({
                  behavior: 'smooth',
                  block: 'nearest'
                });
              }
            }
          }, 0);

          return nextIndex;
        });
        break;

      case 'Enter':
        if (isNavigatingQuickAnswers && selectedQuickAnswerIndex >= 0) {
          e.preventDefault();
          const selectedAnswer = typeBar[selectedQuickAnswerIndex];
          handleQuickAnswersClick(selectedAnswer);
          setSelectedQuickAnswerIndex(-1);
          setIsNavigatingQuickAnswers(false);
        }
        break;

      case 'Escape':
        if (isNavigatingQuickAnswers) {
          e.preventDefault();
          setSelectedQuickAnswerIndex(-1);
          setIsNavigatingQuickAnswers(false);
          setTypeBar(false);
        }
        break;

      case 'Tab':
        if (isNavigatingQuickAnswers) {
          e.preventDefault();
          setSelectedQuickAnswerIndex(prev => {
            const nextIndex = prev < typeBar.length - 1 ? prev + 1 : 0;
            return nextIndex;
          });
        }
        break;

      default:
        if (isNavigatingQuickAnswers && e.key.length === 1) {
          setSelectedQuickAnswerIndex(-1);
          setIsNavigatingQuickAnswers(false);
        }
        break;
    }
  }, [typeBar, selectedQuickAnswerIndex, isNavigatingQuickAnswers]);

  useEffect(() => {
    if (!typeBar || !Array.isArray(typeBar) || typeBar.length === 0) {
      setSelectedQuickAnswerIndex(-1);
      setIsNavigatingQuickAnswers(false);
    }
  }, [typeBar]);

  const getQuickAnswerItemStyle = (index) => ({
    backgroundColor: selectedQuickAnswerIndex === index
      ? (theme.mode === 'light' ? '#e3f2fd' : '#1e3a5f')
      : 'transparent',
    borderLeft: selectedQuickAnswerIndex === index
      ? `4px solid ${theme.palette.primary.main}`
      : '4px solid transparent',
  });

  const handleSendLinkVideo = async () => {
    const link = `https://meet.jit.si/${ticketId}`;
    setInputMessage(link);
  };

  const handleSendTemplate = async () => {
    setTemplateModalOpen(true);
  };

  const handlePresenceUpdate = useCallback((presence) => {
    if (!socket || !ticketId || isTicketPending() || privateMessage || ticketChannel !== "whatsapp") return;
    if (currentPresenceRef.current === presence) return;

    clearTimeout(presenceTimeoutRef.current);

    const nextPresence = presence || "paused";
    currentPresenceRef.current = presence || null;
    socket.emit("presenceUpdate", { ticketId, presence: nextPresence });

    if (presence === "composing") {
      presenceTimeoutRef.current = setTimeout(() => {
        currentPresenceRef.current = null;
        socket.emit("presenceUpdate", { ticketId, presence: "paused" });
      }, 5000);
    }
  }, [socket, ticketId, ticketChannel, privateMessage, ticketStatus]);

  const handleChangeInput = useCallback((e) => {
    setInputMessage(e.target.value);
    handlePresenceUpdate(e.target.value ? "composing" : null);
  }, [handlePresenceUpdate]);

  const handlePrivateMessage = (e) => {
    if (isTicketPending()) {
      return;
    }
    setPrivateMessage(!privateMessage);
    setPrivateMessageInputVisible(!privateMessageInputVisible);
  };

  const getMediaTypeIcon = (mediaType) => {
    switch (mediaType) {
      case 'audio': return '🎵';
      case 'image': return '🖼️';
      case 'video': return '🎥';
      case 'document': return '📎';
      default: return '📎';
    }
  };

  const getMediaTypeColor = (mediaType) => {
    switch (mediaType) {
      case 'audio': return 'secondary';
      case 'image': return 'primary';
      case 'video': return 'default';
      case 'document': return 'default';
      default: return 'default';
    }
  };

  const handleQuickAnswersClick = useCallback(async (value) => {
    // ✅ IMPORTANTE: Evitar múltiplas execuções simultâneas
    if (loading) {
      return;
    }


    if (!ticketId) {
      console.error("❌ ticketId não encontrado");
      toastError(i18n.t("messagesInput.errors.ticketIdNotFound"));
      return;
    }

    // ✅ Guard: aceitar value nulo / sem campos
    if (!value || typeof value !== "object") {
      setTypeBar(false);
      return;
    }

    const mediaPath = typeof value.mediaPath === "string" ? value.mediaPath.trim() : "";

    if (mediaPath) {
      try {
        setLoading(true);

        const response = await api.get(mediaPath, {
          responseType: "blob",
        });


        const messageBody =
          typeof value.value === "string" && value.value.trim() !== ""
            ? value.value
            : "";

        await handleUploadQuickMessageMedia(response.data, messageBody, value.mediaType);


        setInputMessage("");
        setTypeBar(false);
        return;
      } catch (err) {
        console.error("❌ Erro ao processar mídia da resposta rápida:", err);
        // ✅ Fallback: se a mídia falhar, ainda permite enviar o texto
        const fallbackText =
          typeof value.value === "string" ? value.value : "";
        setInputMessage(fallbackText);
        setTypeBar(false);
        toastError(
          i18n.t("messagesInput.errors.quickMessageMediaFailed") ||
            "Não foi possível carregar a mídia da resposta rápida. Texto inserido."
        );
      } finally {
        setLoading(false);
      }
    } else {
      // Apenas texto: envia diretamente (sem precisar clicar em enviar)
      const text = typeof value.value === "string" ? value.value.trim() : "";
      if (!text) {
        setTypeBar(false);
        return;
      }
      try {
        setLoading(true);
        const userName = (privateMessage || isTicketPending())
          ? `${user.name} - ${i18n.t("messagesInputExtra.internalMessage")}`
          : user.name;
        const body =
          ((signMessage && !isTicketPending()) || privateMessage || isTicketPending())
            ? `*${userName}:*\n${text}`
            : text;
        const message = {
          read: 1,
          fromMe: true,
          mediaUrl: "",
          body,
          quotedMsg: replyingMessage,
          isPrivate: (privateMessage || isTicketPending()) ? "true" : "false",
        };
        await api.post(`/messages/${ticketId}`, message);
        setInputMessage("");
        setTypeBar(false);
        setReplyingMessage(null);
      } catch (err) {
        const errorMessage = err?.response?.data?.error || err?.message || "";
        if (!errorMessage.includes("Janela de 24h")) {
          toastError(err);
        }
        // Fallback: deixa o texto no input para o usuário poder reenviar
        setInputMessage(text);
        setTypeBar(false);
      } finally {
        setLoading(false);
      }
    }
  }, [loading, ticketId, privateMessage, signMessage, user, replyingMessage]);

  // Ref para handleQuickAnswersClick para evitar stale closures no event listener
  const handleQuickAnswersClickRef = useRef(handleQuickAnswersClick);
  useEffect(() => {
    handleQuickAnswersClickRef.current = handleQuickAnswersClick;
  }, [handleQuickAnswersClick]);

  const handleUploadQuickMessageMedia = useCallback(async (blob, message, mediaType = null) => {

    if (!ticketId) {
      throw new Error(i18n.t("messagesInput.errors.ticketIdNotFound"));
    }

    // ✅ IMPORTANTE: Verificar se já está enviando
    if (loading) {
      return;
    }

    try {
      let extension = 'bin';

      if (blob.type) {
        const mimeType = blob.type.split("/")[1];
        extension = mimeType;

        if (blob.type.includes('webm') || blob.type.includes('audio')) {
          extension = blob.type.includes('webm') ? 'webm' : 'mp3';
        }
      } else if (mediaType) {
        const typeExtensionMap = {
          'audio': 'webm',
          'image': 'jpg',
          'video': 'mp4',
          'document': 'pdf'
        };
        extension = typeExtensionMap[mediaType] || 'bin';
      }

      const formData = new FormData();
      const filename = `${new Date().getTime()}.${extension}`;
      // BUG CORRIGIDO: aqui SEMPRE forçava type "audio/mpeg", não importa a
      // mídia de verdade (foto, vídeo, documento ou áudio) — o backend decide
      // como processar/enviar a mídia (imagem vs áudio vs documento) com base
      // nesse mimetype, então toda resposta rápida com mídia que não fosse
      // áudio (foto, por exemplo) ia pro backend disfarçada de áudio e o
      // envio falhava. O mimetype real já tinha sido detectado logo acima
      // (usado pra calcular `extension`) — só não estava sendo reaproveitado
      // aqui. Mesmo padrão já usado (corretamente) no upload de áudio gravado
      // pelo microfone (handleUploadAudio, mais abaixo neste arquivo): usa o
      // blob.type de verdade, com um fallback coerente por mediaType só pra
      // quando o blob realmente não informa nenhum type.
      const mimeTypeFallbackByMediaType = {
        audio: "audio/mpeg",
        image: "image/jpeg",
        video: "video/mp4",
        document: "application/pdf"
      };
      const resolvedMimeType =
        blob.type || mimeTypeFallbackByMediaType[mediaType] || "application/octet-stream";
      const mediaFile = new File([blob], filename, { type: resolvedMimeType });
      formData.append("medias", mediaFile, filename);
      formData.append("typeArch", "quickMessage");

      const body = message && message.trim() !== ""
        ? ((privateMessage || isTicketPending()) ? `\u200d${message}` : message)
        : ((privateMessage || isTicketPending()) ? `\u200d` : "");

      formData.append("body", body);
      formData.append("fromMe", true);
      formData.append("isPrivate", (privateMessage || isTicketPending()) ? "true" : "false");


      if (isMounted.current) {
        // ✅ Timeout para o botão nunca ficar "girando" para sempre caso o
        // backend demore/trave ao converter ou enviar o áudio.
        const response = await api.post(`/messages/${ticketId}`, formData, { timeout: 90000 });
      }
    } catch (err) {
      console.error("❌ Erro no upload:", err);
      // ✅ Não mostrar toastError se for erro de janela de 24h
      const errorMessage = err?.response?.data?.error || err?.message || "";
      if (!errorMessage.includes("Janela de 24h")) {
        toastError(err);
      }
      throw err;
    }
  }, [ticketId, privateMessage, loading]);

  const handleAddEmoji = (e) => {
    let emoji = e.native;
    setInputMessage((prevState) => prevState + emoji);
  };

  const [modalCameraOpen, setModalCameraOpen] = useState(false);

  const handleCapture = (imageData) => {
    if (imageData) {
      handleUploadCamera(imageData);
    }
  };

  const handleChangeMedias = (e) => {
    if (!e.target.files) {
      return;
    }
    const selectedMedias = filterOversized(Array.from(e.target.files));
    // Limpa o input para permitir re-seleção do mesmo arquivo após aviso
    try { e.target.value = ""; } catch (_) {}
    if (!selectedMedias.length) return;
    setMediasUpload(selectedMedias);
    setShowModalMedias(true);
  };

  const handleChangeSign = (e) => {
    getStatusSingMessageLocalstogare();
  };

  const handleOpenModalForward = () => {
    if (selectedMessages.length === 0) {
      setForwardMessageModalOpen(false);
      toastError(i18n.t("messagesList.header.notMessage"));
      return;
    }
    setForwardMessageModalOpen(true);
  };

  const getStatusSingMessageLocalstogare = () => {
    const signMessageStorage = JSON.parse(
      localStorage.getItem("persistentSignMessage")
    );
    if (signMessageStorage !== null) {
      if (signMessageStorage) {
        localStorage.setItem("persistentSignMessage", false);
        setSignMessage(false);
      } else {
        localStorage.setItem("persistentSignMessage", true);
        setSignMessage(true);
      }
    } else {
      localStorage.setItem("persistentSignMessage", false);
      setSignMessage(false);
    }
  };

  const handleInputPaste = (e) => {
    if (e.clipboardData.files[0]) {
      const selectedMedias = filterOversized(Array.from(e.clipboardData.files));
      if (!selectedMedias.length) return;
      setMediasUpload(selectedMedias);
      setShowModalMedias(true);
    }
  };

  const handleInputDrop = (e) => {
    e.preventDefault();
    if (e.dataTransfer.files[0]) {
      const selectedMedias = filterOversized(Array.from(e.dataTransfer.files));
      if (!selectedMedias.length) return;
      setMediasUpload(selectedMedias);
      setShowModalMedias(true);
    }
  };

  const handleUploadMedia = async (mediasUpload) => {
    setLoading(true);

    if (!mediasUpload.length) {
      setLoading(false);
      return;
    }

    const formData = new FormData();
    formData.append("fromMe", true);
    formData.append("isPrivate", (privateMessage || isTicketPending()) ? "true" : "false");
    mediasUpload.forEach((media) => {
      formData.append("body", media.caption);
      formData.append("medias", media.file);
    });

    try {
      await api.post(`/messages/${ticketId}`, formData);
      
      // ✅ Limpar campos apenas se envio foi bem sucedido
      setLoading(false);
      setMediasUpload([]);
      setShowModalMedias(false);
      if (!isTicketPending()) {
        setPrivateMessage(false);
        setPrivateMessageInputVisible(false);
      }
    } catch (err) {
      // ✅ Não mostrar toastError se for erro de janela de 24h
      const errorMessage = err?.response?.data?.error || err?.message || "";
      if (!errorMessage.includes("Janela de 24h")) {
        toastError(err);
      }
      setLoading(false);
    }
  };

  const handleSendContatcMessage = async (vcard) => {
    setSenVcardModalOpen(false);
    setLoading(true);

    if (isNil(vcard)) {
      setLoading(false);
      return;
    }

    const message = {
      read: 1,
      fromMe: true,
      mediaUrl: "",
      body: null,
      quotedMsg: replyingMessage,
      isPrivate: (privateMessage || isTicketPending()) ? "true" : "false",
      vCard: vcard,
    };
    try {
      await api.post(`/messages/${ticketId}`, message);
      
      // ✅ Limpar campos apenas se envio foi bem sucedido
      setInputMessage("");
      setShowEmoji(false);
      setLoading(false);
      setReplyingMessage(null);
      setEditingMessage(null);
      if (!isTicketPending()) {
        setPrivateMessage(false);
        setPrivateMessageInputVisible(false);
      }
    } catch (err) {
      // ✅ Não mostrar toastError se for erro de janela de 24h
      const errorMessage = err?.response?.data?.error || err?.message || "";
      if (!errorMessage.includes("Janela de 24h")) {
        toastError(err);
      }
      setLoading(false);
    }
  };

  // Envia ghost mention (@all) direto sem colocar texto no input
  const handleGhostMention = async () => {
    if (loading) return;
    setLoading(true);
    try {
      await api.post(`/messages/${ticketId}`, {
        read: 1,
        fromMe: true,
        mediaUrl: "",
        body: "@all",
        quotedMsg: null,
        isPrivate: "false",
      });
    } catch (err) {
      toastError(err);
    } finally {
      setLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!inputMessage || inputMessage.trim() === "") return;
    if (isSendingRef.current) return; // trava síncrona — ver comentário no useRef acima
    isSendingRef.current = true;
    
    // ✅ Aviso se janela expirou, mas permite envio
    if (needsTemplate && isWhatsAppOfficial && !isTicketPending()) {
      console.warn("⚠️ Janela de 24h expirada - Enviando mensagem mesmo assim");
    }

    setLoading(true);
    handlePresenceUpdate(null);

    const userName = (privateMessage || isTicketPending())
      ? `${user.name} - ${i18n.t("messagesInputExtra.internalMessage")}`
      : user.name;

    const sendMessage = inputMessage.trim();

    const message = {
      read: 1,
      fromMe: true,
      mediaUrl: "",
      body:
        ((signMessage && !isTicketPending()) || privateMessage || isTicketPending()) && !editingMessage
          ? `*${userName}:*\n${sendMessage}`
          : sendMessage,
      quotedMsg: replyingMessage,
      isPrivate: (privateMessage || isTicketPending()) ? "true" : "false",
    };

    try {
      if (editingMessage !== null) {
        await api.post(`/messages/edit/${editingMessage.id}`, message);
      } else {
        await api.post(`/messages/${ticketId}`, message);
      }
      
      // ✅ Limpar campos apenas se envio foi bem sucedido
      setInputMessage("");
      setShowEmoji(false);
      setLoading(false);
      setReplyingMessage(null);
      if (!isTicketPending()) {
        setPrivateMessage(false);
      }
      setEditingMessage(null);
      if (!isTicketPending()) {
        setPrivateMessageInputVisible(false);
      }
      handleMenuItemClick();
    } catch (err) {
      // ✅ Não mostrar toastError se for erro de janela de 24h
      // O usuário já vê o alerta visual
      const errorMessage = err?.response?.data?.error || err?.message || "";
      if (!errorMessage.includes("Janela de 24h")) {
        toastError(err);
      }
      setLoading(false);
    } finally {
      isSendingRef.current = false;
    }
  };

  const handleSendMessageTemplate = async (e) => {
    if (e.id === "") return;
    if (isSendingRef.current) return;
    isSendingRef.current = true;
    setLoading(true);

    const message = {
      templateId: e.id,
      variables: e.variables,
      bodyToSave: e.bodyToSave,
      mediaUrl: "",
      quotedMsg: replyingMessage,
    };

    try {
      await api.post(`/messages-template/${ticketId}`, message);
      
      // ✅ Após enviar template, a janela de 24h é aberta no backend (lastInteractionClient atualizado)
      // Re-verificar janela para liberar digitação de texto livre
      setNeedsTemplate(false);
      await checkWhatsAppWindow();
      
      setLoading(false);
    } catch (err) {
      toastError(err);
      setLoading(false);
    }
    isSendingRef.current = false;
    setTemplateModalOpen(false);
    setInputMessage("");
    setShowEmoji(false);
    setReplyingMessage(null);
    if (!isTicketPending()) {
      setPrivateMessage(false);
    }
    setEditingMessage(null);
    if (!isTicketPending()) {
      setPrivateMessageInputVisible(false);
    }
    handleMenuItemClick();
  };

  // 🎙️ Para e libera completamente o MediaRecorder e o microfone.
  const stopMediaRecorder = () => {
    try {
      const rec = mediaRecorderRef.current;
      if (rec && rec.state !== "inactive") {
        rec.stop();
      }
    } catch (e) {
      // ignora
    }
    try {
      const stream = audioStreamRef.current;
      if (stream) {
        stream.getTracks().forEach((t) => t.stop());
      }
    } catch (e) {
      // ignora
    }
    mediaRecorderRef.current = null;
    audioStreamRef.current = null;
  };

  const handleStartRecording = async () => {
    setLoading(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });

      // Escolhe o melhor formato suportado pelo navegador.
      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : MediaRecorder.isTypeSupported("audio/webm")
          ? "audio/webm"
          : MediaRecorder.isTypeSupported("audio/mp4")
            ? "audio/mp4"
            : "";

      const recorder = new MediaRecorder(
        stream,
        mimeType ? { mimeType } : undefined
      );

      audioChunksRef.current = [];
      audioMimeRef.current = mimeType || recorder.mimeType || "audio/webm";

      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) {
          audioChunksRef.current.push(event.data);
        }
      };

      audioStreamRef.current = stream;
      mediaRecorderRef.current = recorder;

      // timeslice de 1s: garante que os chunks sejam entregues durante a
      // gravação, evitando depender só do evento final de stop.
      recorder.start(1000);
      setRecording(true);
      setLoading(false);
    } catch (err) {
      // Garante limpeza caso algo falhe no meio.
      stopMediaRecorder();
      toastError(err);
      setLoading(false);
    }
  };

  useEffect(() => {
    async function fetchData() {
      try {
        const companyId = user.companyId;
        const messages = await listQuickMessages({
          companyId,
          userId: user.id,
          // Sempre buscar apenas respostas rápidas (não templates da Meta).
          // Templates são acessados pelo botão/modal de Template.
          isOficial: "false",
        });
        const options = (Array.isArray(messages) ? messages : [])
          .filter((m) => m && isString(m.message) && isString(m.shortcode))
          .map((m) => {
            let truncatedMessage = m.message;
            if (truncatedMessage.length > 90) {
              truncatedMessage = m.message.substring(0, 90) + "...";
            }
            return {
              value: m.message,
              label: `/${m.shortcode} - ${truncatedMessage}`,
              mediaPath: m.mediaPath || "",
              mediaType: m.mediaType || null,
              shortcode: m.shortcode,
            };
          });
        if (isMounted.current) {
          setQuickAnswer(options);
        }
      } catch (err) {
        console.error("❌ Erro ao carregar respostas rápidas:", err);
        if (isMounted.current) {
          setQuickAnswer([]);
        }
      }
    }
    fetchData();
  }, []);

  useEffect(() => {
    if (
      isString(inputMessage) &&
      !isEmpty(inputMessage) &&
      inputMessage.length >= 1
    ) {
      const firstWord = inputMessage.charAt(0);

      if (firstWord === "/") {
        setTypeBar(firstWord.indexOf("/") > -1);

        const filteredOptions = quickAnswers.filter(
          (m) => m.label.toLowerCase().indexOf(inputMessage.toLowerCase()) > -1
        );
        setTypeBar(filteredOptions);
      } else {
        setTypeBar(false);
      }
    } else {
      setTypeBar(false);
    }
  }, [inputMessage]);

  useEffect(() => {

    // 🔥 RESET SIMPLES: Se modal fecha, libera campo
    if (!triggerFlowModalOpen && flowProcessing) {
      setFlowProcessing(false);
      flowProcessingRef.current = false;
    }
  }, [triggerFlowModalOpen, flowProcessing]);

  const disableOption = useCallback(() => {
    const isFlowProcessing = flowProcessingRef.current || flowProcessing;

    return (
      loading ||
      recording ||
      isFlowProcessing ||
      (!isTicketPending() && ticketStatus !== "open" && ticketStatus !== "group")
    );
  }, [loading, recording, flowProcessing, ticketStatus, needsTemplate]);

  const disableOptionForPending = useCallback(() => {
    const isFlowProcessing = flowProcessingRef.current || flowProcessing;

    return (
      loading ||
      recording ||
      isFlowProcessing || // 🛡️ Usar tanto ref quanto estado
      ticketStatus === "closed"
    );
  }, [loading, recording, flowProcessing, ticketStatus]);

  const handleUploadCamera = async (blob) => {
    setLoading(true);
    try {
      const formData = new FormData();
      const filename = `${new Date().getTime()}.png`;
      formData.append("medias", blob, filename);
      formData.append("body", (privateMessage || isTicketPending()) ? `\u200d` : "");
      formData.append("fromMe", true);

      await api.post(`/messages/${ticketId}`, formData);
      
      // ✅ Limpar loading apenas se envio foi bem sucedido
      setLoading(false);
    } catch (err) {
      // ✅ Não mostrar toastError se for erro de janela de 24h
      const errorMessage = err?.response?.data?.error || err?.message || "";
      if (!errorMessage.includes("Janela de 24h")) {
        toastError(err);
      }
      setLoading(false);
    }
  };

  // Para o gravador e devolve o blob gravado (espera o último chunk).
  // ✅ Blindado: a Promise SEMPRE resolve, mesmo que o evento `onstop` do
  // MediaRecorder nunca dispare (acontecia em alguns navegadores e deixava o
  // botão de enviar girando para sempre, sem nunca chegar a fazer o POST).
  const stopAndGetAudioBlob = () =>
    new Promise((resolve) => {
      const recorder = mediaRecorderRef.current;

      const buildBlob = () =>
        new Blob(audioChunksRef.current, { type: audioMimeRef.current });

      const finish = (origem) => {
        if (settled) return;
        settled = true;
        clearTimeout(safety);
        const blob = buildBlob();
        // eslint-disable-next-line no-console
        stopMediaRecorder();
        resolve(blob);
      };

      let settled = false;

      if (!recorder || recorder.state === "inactive") {
        finish("recorder-inativo");
        return;
      }

      // Rede de segurança: se onstop não disparar em 4s, resolve mesmo assim.
      const safety = setTimeout(() => finish("timeout"), 4000);

      recorder.onstop = () => finish("onstop");

      try {
        // Força a entrega do último chunk antes de parar.
        if (typeof recorder.requestData === "function") {
          recorder.requestData();
        }
        recorder.stop();
      } catch (e) {
        finish("erro-stop");
      }
    });

  const handleUploadAudio = async () => {
    setLoading(true);
    try {
      const blob = await stopAndGetAudioBlob();
      // eslint-disable-next-line no-console
      if (!blob || blob.size < 1500) {
        // eslint-disable-next-line no-console
        console.warn("[AUDIO][FRONT] áudio vazio/curto, cancelando", {
          size: blob ? blob.size : 0,
        });
        setLoading(false);
        setRecording(false);
        return;
      }

      const formData = new FormData();

      // O MediaRecorder nativo gera webm/opus (ou mp4 em alguns navegadores).
      // O backend converte para ogg/opus via ffmpeg antes de enviar ao WhatsApp.
      const mime = blob.type || audioMimeRef.current || "audio/webm";
      const extension = mime.includes("mp4")
        ? "m4a"
        : mime.includes("ogg")
          ? "ogg"
          : "webm";
      const filename = `audio_${new Date().getTime()}.${extension}`;

      const audioFile = new File([blob], filename, { type: mime });
      formData.append("medias", audioFile, filename);
      // Áudio gravado não precisa enviar texto junto.
      formData.append("body", (privateMessage || isTicketPending()) ? "\u200d" : "");
      formData.append("fromMe", true);
      formData.append("isPrivate", (privateMessage || isTicketPending()) ? "true" : "false");

      if (isMounted.current) {
        // eslint-disable-next-line no-console
        // ✅ Timeout para o botão nunca ficar "girando" para sempre caso o
        // backend demore/trave ao converter ou enviar o áudio.
        await api.post(`/messages/${ticketId}`, formData, { timeout: 45000 });
        // eslint-disable-next-line no-console
      }
    } catch (err) {
      // ✅ Não mostrar toastError se for erro de janela de 24h
      const errorMessage = err?.response?.data?.error || err?.message || "";
      if (!errorMessage.includes("Janela de 24h")) {
        toastError(err);
      }
    } finally {
      if (isMounted.current) {
        setLoading(false);
        setRecording(false);
      }
    }
  };

  const handleCloseModalMedias = () => {
    setShowModalMedias(false);
  };

  const handleCancelAudio = async () => {
    try {
      stopMediaRecorder();
      audioChunksRef.current = [];
      setRecording(false);
    } catch (err) {
      toastError(err);
    }
  };

  const handleOpenMenuClick = (event) => {
    setAnchorEl(event.currentTarget);
  };

  const handleMenuItemClick = (event) => {
    setAnchorEl(null);
  };

  const handleSendContactModalOpen = async () => {
    handleMenuItemClick();
    setSenVcardModalOpen(true);
  };

  const handleCameraModalOpen = async () => {
    handleMenuItemClick();
    setModalCameraOpen(true);
  };

  const handleCancelSelection = () => {
    setMediasUpload([]);
    setShowModalMedias(false);
  };

  const checkForSelectedText = useCallback(() => {
    if (inputRef.current) {
      const start = inputRef.current.selectionStart;
      const end = inputRef.current.selectionEnd;

      if (start !== end && start !== null && end !== null) {
        const selectedText = inputMessage.substring(start, end);
        if (selectedText.trim() !== '') {
          // Para InputBase, calcular posição baseada no elemento
          const inputRect = inputRef.current.getBoundingClientRect();
          const scrollTop = window.pageYOffset || document.documentElement.scrollTop;

          setSelectedText({
            text: selectedText,
            start: start,
            end: end
          });

          setFormatMenuAnchorPosition({
            x: inputRect.left + inputRect.width / 2,
            y: inputRect.top + scrollTop - 10 // Posicionar acima do input
          });

          return true;
        }
      }
    }

    setFormatMenuAnchorPosition(null);
    return false;
  }, [inputMessage]);

  const handleCloseFormatMenu = useCallback(() => {
    setFormatMenuAnchorPosition(null);
  }, []);

  // Aplica a formatação ao texto selecionado
  const handleFormatText = useCallback((formatType) => {
    const { text, start, end } = selectedText;
    let formattedText = '';

    switch (formatType) {
      case 'bold':
        formattedText = `*${text}*`;
        break;
      case 'italic':
        formattedText = `_${text}_`;
        break;
      case 'strikethrough':
        formattedText = `~${text}~`;
        break;
      case 'code':
        formattedText = `\`${text}\``;
        break;
      case 'numberedList':
        formattedText = text.split('\n')
          .map((line, index) => `${index + 1}. ${line}`)
          .join('\n');
        break;
      case 'bulletList':
        formattedText = text.split('\n')
          .map(line => `• ${line}`)
          .join('\n');
        break;
      case 'quote':
        formattedText = text.split('\n')
          .map(line => `> ${line}`)
          .join('\n');
        break;
      case 'clear':
        formattedText = text
          .replace(/\*([^*]+)\*/g, '$1')  // remove negrito
          .replace(/_([^_]+)_/g, '$1')    // remove itálico
          .replace(/~([^~]+)~/g, '$1')    // remove tachado
          .replace(/`([^`]+)`/g, '$1')    // remove código
          .replace(/^\d+\.\s/gm, '')      // remove numeração de lista
          .replace(/^•\s/gm, '')          // remove marcadores de lista
          .replace(/^>\s/gm, '');         // remove citação
        break;
      default:
        formattedText = text;
    }

    // Substitui o texto selecionado pelo texto formatado
    const newInputMessage =
      inputMessage.substring(0, start) +
      formattedText +
      inputMessage.substring(end);

    setInputMessage(newInputMessage);

    // Fecha o menu após a formatação
    handleCloseFormatMenu();

    // Define o foco e a posição do cursor após a operação
    setTimeout(() => {
      if (inputRef.current) {
        inputRef.current.focus();
        const newCursorPosition = start + formattedText.length;
        inputRef.current.selectionStart = newCursorPosition;
        inputRef.current.selectionEnd = newCursorPosition;
      }
    }, 100);
  }, [selectedText, inputMessage, handleCloseFormatMenu]);

  // Handlers para detectar seleção de texto
  const handleSelectText = useCallback(() => {
    checkForSelectedText();
  }, [checkForSelectedText]);

  const handleMouseUp = useCallback(() => {
    checkForSelectedText();
  }, [checkForSelectedText]);

  const handleKeyUp = useCallback((e) => {
    // Teclas que podem alterar a seleção
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight' || e.key === 'Shift') {
      checkForSelectedText();
    }
  }, [checkForSelectedText]);

  const renderReplyingMessage = (message) => {
    return (
      <div className={classes.replyginMsgWrapper}>
        <div className={classes.replyginMsgContainer}>
          <span
            className={clsx(classes.replyginContactMsgSideColor, {
              [classes.replyginSelfMsgSideColor]: !message.fromMe,
            })}
          ></span>
          {replyingMessage && (
            <div className={classes.replyginMsgBody}>
              {!message.fromMe && (
                <span className={classes.messageContactName}>
                  {message.contact?.name}
                </span>
              )}
              {message.body}
            </div>
          )}
        </div>
        <IconButton
          aria-label="showRecorder"
          component="span"
          disabled={disableOptionForPending()}
          onClick={() => {
            setReplyingMessage(null);
            setEditingMessage(null);
            setInputMessage("");
          }}
        >
          <ClearIcon className={classes.sendMessageIcons} />
        </IconButton>
      </div>
    );
  };

  const renderFlowProcessingAlert = () => {
    if (!flowProcessing) return null;

    return (
      <Box className={classes.pendingAlert} style={{ backgroundColor: theme.mode === "dark" ? "#1a2e1a" : "#E8F5E8", borderColor: "#4CAF50" }}>
        <CircularProgress size={16} style={{ marginRight: 8 }} />
        <span>
          <strong>{i18n.t("messagesInputExtra.flowProcessingTitle")}</strong> {i18n.t("messagesInputExtra.flowProcessingMessage")}
        </span>
      </Box>
    );
  };

  const renderTemplateRequiredAlert = () => {
    if (!needsTemplate || !isWhatsAppOfficial) return null;

    const hours = typeof hoursElapsed === "number" ? hoursElapsed : null;
    let elapsedLabel = "";
    if (hours !== null) {
      const totalH = Math.floor(hours);
      const d = Math.floor(totalH / 24);
      const h = totalH % 24;
      if (d > 0) {
        elapsedLabel = `${d}d ${h}h`;
      } else {
        elapsedLabel = `${h}h`;
      }
    }

    const isDark = theme.mode === "dark";

    return (
      <Box
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          padding: "6px 10px",
          margin: "6px 12px",
          borderRadius: 8,
          backgroundColor: isDark ? "rgba(211,47,47,0.12)" : "#FDECEA",
          border: `1px solid ${isDark ? "rgba(239,154,154,0.35)" : "#F5C2C0"}`,
        }}
      >
        <div style={{ display: "flex", alignItems: "flex-start", gap: 8, flex: 1, minWidth: 0 }}>
          <ReportProblemOutlinedIcon
            style={{ color: "#D32F2F", fontSize: 16, marginTop: 1, flexShrink: 0 }}
          />
          <div style={{ display: "flex", flexDirection: "column", minWidth: 0 }}>
            <span style={{ fontWeight: 600, color: isDark ? "#ffb4b4" : "#B71C1C", fontSize: 12.5 }}>
              {i18n.t("messagesInputExtra.windowExpiredTitle")}
            </span>
            <span style={{ color: isDark ? "#ffb4b4" : "#C53030", fontSize: 11.5, marginTop: 1 }}>
              {elapsedLabel
                ? i18n.t("messagesInputExtra.windowExpiredSubtitle", { elapsed: elapsedLabel })
                : i18n.t("messagesInputExtra.windowExpiredSubtitleNoTime")}
            </span>
          </div>
        </div>
        {/* Botão "Escolher Template" removido a pedido: na API Oficial o envio
            de template passa a sair exclusivamente pelo ícone do WhatsApp no
            cabeçalho do atendimento. A tarja continua aqui apenas para
            explicar por que o campo de digitação está bloqueado. */}
      </Box>

    );
  };

  const TextFormatMenu = () => {
    const isMenuOpen = Boolean(formatMenuAnchorPosition);
    const isMobile = useMediaQuery(theme.breakpoints.down('sm'));

    if (!isMenuOpen) return null;

    return (
      <ClickAwayListener onClickAway={handleCloseFormatMenu}>
        <Fade in={isMenuOpen}>
          <div
            className={classes.floatingFormatMenu}
            style={{
              top: formatMenuAnchorPosition ? formatMenuAnchorPosition.y - 50 : 0,
              left: formatMenuAnchorPosition ? formatMenuAnchorPosition.x : 0,
            }}
          >
            <Tooltip title={i18n.t("messagesInput.tooltips.bold")}>
              <IconButton
                className={classes.formatIconButton}
                disabled={disableOptionForPending()}
                onClick={() => handleFormatText('bold')}
                size="small"
              >
                <FormatBoldIcon fontSize={isMobile ? "small" : "medium"} />
              </IconButton>
            </Tooltip>

            <Tooltip title={i18n.t("messagesInput.tooltips.italic")}>
              <IconButton
                className={classes.formatIconButton}
                disabled={disableOptionForPending()}
                onClick={() => handleFormatText('italic')}
                size="small"
              >
                <FormatItalicIcon fontSize={isMobile ? "small" : "medium"} />
              </IconButton>
            </Tooltip>

            <Tooltip title={i18n.t("messagesInput.tooltips.strikethrough")}>
              <IconButton
                className={classes.formatIconButton}
                disabled={disableOptionForPending()}
                onClick={() => handleFormatText('strikethrough')}
                size="small"
              >
                <FormatStrikethroughIcon fontSize={isMobile ? "small" : "medium"} />
              </IconButton>
            </Tooltip>

            <Tooltip title={i18n.t("messagesInput.tooltips.code")}>
              <IconButton
                className={classes.formatIconButton}
                disabled={disableOptionForPending()}
                onClick={() => handleFormatText('code')}
                size="small"
              >
                <CodeIcon fontSize={isMobile ? "small" : "medium"} />
              </IconButton>
            </Tooltip>

            <Tooltip title={i18n.t("messagesInput.tooltips.numberedList")}>
              <IconButton
                className={classes.formatIconButton}
                disabled={disableOptionForPending()}
                onClick={() => handleFormatText('numberedList')}
                size="small"
              >
                <FormatListNumberedIcon fontSize={isMobile ? "small" : "medium"} />
              </IconButton>
            </Tooltip>

            <Tooltip title={i18n.t("messagesInput.tooltips.bulletList")}>
              <IconButton
                className={classes.formatIconButton}
                disabled={disableOptionForPending()}
                onClick={() => handleFormatText('bulletList')}
                size="small"
              >
                <FormatListBulletedIcon fontSize={isMobile ? "small" : "medium"} />
              </IconButton>
            </Tooltip>

            <Tooltip title={i18n.t("messagesInput.tooltips.quote")}>
              <IconButton
                className={classes.formatIconButton}
                disabled={disableOptionForPending()}
                onClick={() => handleFormatText('quote')}
                size="small"
              >
                <FormatQuoteIcon fontSize={isMobile ? "small" : "medium"} />
              </IconButton>
            </Tooltip>

            <Tooltip title={i18n.t("messagesInput.tooltips.clearFormat")}>
              <IconButton
                className={classes.formatIconButton}
                disabled={disableOptionForPending()}
                onClick={() => handleFormatText('clear')}
                size="small"
              >
                <FormatClearIcon fontSize={isMobile ? "small" : "medium"} />
              </IconButton>
            </Tooltip>

            {/* Botão Marcação Fantasma - visível apenas em grupos Baileys */}
            {isGroup && ticketChannel !== "whatsapp_oficial" && (
              <Tooltip title={i18n.t("messagesInput.tooltips.ghostMention")}>
                <IconButton
                  className={classes.formatIconButton}
                  style={{ color: "#9c27b0" }}
                  onClick={handleGhostMention}
                  disabled={loading}
                >
                  <GroupAddIcon fontSize={isMobile ? "small" : "medium"} />
                </IconButton>
              </Tooltip>
            )}
          </div>
        </Fade>
      </ClickAwayListener>
    );
  };

  // Removido a pedido: já existe a mesma informação (placeholder "Aceite ou
  // reabra este ticket para enviar uma mensagem") desabilitando o campo de
  // digitação logo abaixo — esse banner só duplicava o aviso.

  if (mediasUpload.length > 0) {
    return (
      <Paper
        elevation={0}
        square
        className={classes.viewMediaInputWrapper}
        onDragEnter={() => setOnDragEnter(true)}
        onDrop={(e) => handleInputDrop(e)}
      >
        {showModalMedias && (
          <MessageUploadMedias
            isOpen={showModalMedias}
            files={mediasUpload}
            onClose={handleCloseModalMedias}
            onSend={handleUploadMedia}
            onCancelSelection={handleCancelSelection}
          />
        )}
      </Paper>
    );
  } else {
    return (
      <>
        {templateModalOpen && (
          <TemplateModal
            open={templateModalOpen}
            handleClose={() => setTemplateModalOpen(false)}
            onSelectTemplate={(e) => handleSendMessageTemplate(e)}
            templates={templates}
          />
        )}
        {modalCameraOpen && (
          <CameraModal
            isOpen={modalCameraOpen}
            onRequestClose={() => setModalCameraOpen(false)}
            onCapture={handleCapture}
          />
        )}
        {senVcardModalOpen && (
          <ContactSendModal
            modalOpen={senVcardModalOpen}
            onClose={(c) => {
              handleSendContatcMessage(c);
            }}
          />
        )}

        {/* MODAL DE MENSAGEM INTERATIVA */}
        {interactiveModalOpen && (
          <InteractiveMessageModal
            open={interactiveModalOpen}
            onClose={() => {
              setInteractiveModalOpen(false);
              setInteractiveInitialType(null);
            }}
            ticketId={ticketId}
            ticketChannel={ticketChannel}
            initialType={interactiveInitialType}
          />
        )}

        {/* NOVO MODAL DE TRIGGER FLOW */}
        {triggerFlowModalOpen && (
          <TriggerFlowModal
            open={triggerFlowModalOpen}
            onClose={handleTriggerFlowClose}
            ticketId={ticketId}
            ticketStatus={ticketStatus}
            onFlowTriggered={handleFlowTriggered}
            onFlowProcessing={handleFlowProcessing}
          />
        )}

        <Paper
          square
          elevation={0}
          className={classes.mainWrapper}
          onDragEnter={() => setOnDragEnter(true)}
          onDrop={(e) => handleInputDrop(e)}
        >
          {/* renderPendingAlert() removido — informação já aparece no
              placeholder do campo de digitação desabilitado. */}
          {renderFlowProcessingAlert()}
          {renderTemplateRequiredAlert()}

          {(replyingMessage && renderReplyingMessage(replyingMessage)) ||
            (editingMessage && renderReplyingMessage(editingMessage))}
          <div className={classes.newMessageBox}>
            {/* Template button removido - mantido apenas no menu + */}

            {!isTicketPending() && isWhatsAppOfficial && (
              <Hidden only={["sm", "xs"]}>
                <Tooltip title={i18n.t("messageInput.tooltip.attach") || "Anexar"}>
                  <span>
                    <IconButton
                      aria-label="attach-oficial"
                      component="span"
                      className={classes.barIconButton}
                      disabled={disableOption() || needsTemplate}
                      onClick={handleOpenMenuClick}
                    >
                      <AddIcon className={classes.sendMessageIcons} />
                    </IconButton>
                  </span>
                </Tooltip>

                <Tooltip title="Emoji">
                  <span>
                    <IconButton
                      aria-label="emojiPickerOficial"
                      component="span"
                      className={classes.barIconButton}
                      disabled={disableOption()}
                      onClick={() => setShowEmoji((prev) => !prev)}
                    >
                      <MoodOutlinedIcon className={classes.sendMessageIcons} />
                    </IconButton>
                  </span>
                </Tooltip>
                {showEmoji ? (
                  <div className={classes.emojiBox}>
                    <ClickAwayListener onClickAway={() => setShowEmoji(true)}>
                      <Picker
                        perLine={16}
                        theme={"dark"}
                        i18n={i18n}
                        showPreview={true}
                        showSkinTones={false}
                        onSelect={handleAddEmoji}
                      />
                    </ClickAwayListener>
                  </div>
                ) : null}

                {ticketChannel === "whatsapp_oficial" && (
                <Menu
                  anchorEl={anchorEl}
                  keepMounted
                  open={Boolean(anchorEl)}
                  onClose={handleMenuItemClick}
                  id="simple-menu-oficial"
                >
                  <MenuItem onClick={handleMenuItemClick}>
                    <input
                      multiple
                      type="file"
                      id="upload-img-button-of"
                      accept="image/*, video/*, audio/* "
                      className={classes.uploadInput}
                      onChange={handleChangeMedias}
                    />
                    <label htmlFor="upload-img-button-of">
                      <Fab aria-label="upload-img" component="span" className={classes.invertedFabMenuMP}>
                        <PermMediaIcon />
                      </Fab>
                      {i18n.t("messageInput.type.imageVideo")}
                    </label>
                  </MenuItem>
                  <MenuItem onClick={handleCameraModalOpen}>
                    <Fab className={classes.invertedFabMenuCamera}>
                      <CameraAltIcon />
                    </Fab>
                    {i18n.t("messageInput.type.cam")}
                  </MenuItem>
                  <MenuItem onClick={handleMenuItemClick}>
                    <input
                      multiple
                      type="file"
                      id="upload-doc-button-of"
                      accept="application/*, text/*, .odt, .ods, .odp, .odg, .xml, .ofx, .zip, .rar, .7z, .tar, .gz, .bz2, .msg, .key, .numbers, .pages"
                      className={classes.uploadInput}
                      onChange={handleChangeMedias}
                    />
                    <label htmlFor="upload-doc-button-of">
                      <Fab aria-label="upload-img" component="span" className={classes.invertedFabMenuDoc}>
                        <DescriptionOutlinedIcon />
                      </Fab>
                      Documento
                    </label>
                  </MenuItem>
                  <MenuItem onClick={handleSendContactModalOpen}>
                    <Fab className={classes.invertedFabMenuCont}>
                      <PersonOutlineOutlinedIcon />
                    </Fab>
                    {i18n.t("messageInput.type.contact")}
                  </MenuItem>
                </Menu>
                )}

                <Tooltip title={i18n.t("messageInput.type.template") || "Template"}>
                  <span>
                    <IconButton
                      aria-label="template-oficial"
                      component="span"
                      className={classes.barIconButton}
                      onClick={() => setTemplateModalOpen(true)}
                      disabled={disableOption()}
                    >
                      <DescriptionOutlinedIcon style={{ color: "#2E7D32" }} />
                    </IconButton>
                  </span>
                </Tooltip>

                <Tooltip title={i18n.t("messagesInput.tooltips.quickAnswers") || "Respostas rápidas"}>
                  <span>
                    <IconButton
                      aria-label="quick-answers-oficial"
                      component="span"
                      className={classes.barIconButton}
                      onClick={() => setInputMessage((prev) => (prev?.startsWith("/") ? prev : "/" + (prev || "")))}
                      disabled={disableOption()}
                    >
                      <BoltOutlinedIcon className={classes.sendMessageIcons} />
                    </IconButton>
                  </span>
                </Tooltip>

                {/* O ícone vermelho de bloqueio foi removido a pedido: na API
                    Oficial o envio de template fica concentrado no ícone do
                    cabeçalho do atendimento. Manter dois pontos de entrada para
                    a mesma ação, um deles com aparência de erro, só confundia
                    quem atende. O aviso da janela de 24h continua aparecendo
                    acima do campo de digitação. */}
              </Hidden>
            )}

            {!isTicketPending() && !isWhatsAppOfficial && (
              <Hidden only={["sm", "xs"]}>
                <Tooltip title={i18n.t("messageInput.tooltip.attach") || "Anexar"}>
                  <span>
                    <IconButton
                      aria-label="attach"
                      component="span"
                      className={classes.barIconButton}
                      disabled={disableOption()}
                      onClick={handleOpenMenuClick}
                    >
                      <AddIcon className={classes.sendMessageIcons} />
                    </IconButton>
                  </span>
                </Tooltip>

                <Tooltip title="Emoji">
                  <span>
                    <IconButton
                      aria-label="emojiPicker"
                      component="span"
                      className={classes.barIconButton}
                      disabled={disableOption()}
                      onClick={(e) => setShowEmoji((prevState) => !prevState)}
                    >
                      <MoodOutlinedIcon className={classes.sendMessageIcons} />
                    </IconButton>
                  </span>
                </Tooltip>
                {showEmoji ? (
                  <div className={classes.emojiBox}>
                    <ClickAwayListener onClickAway={(e) => setShowEmoji(true)}>
                      <Picker
                        perLine={16}
                        theme={"dark"}
                        i18n={i18n}
                        showPreview={true}
                        showSkinTones={false}
                        onSelect={handleAddEmoji}
                      />
                    </ClickAwayListener>
                  </div>
                ) : null}

                <Tooltip title={i18n.t("messagesInput.tooltips.quickAnswers") || "Respostas rápidas"}>
                  <span>
                    <IconButton
                      aria-label="quick-answers"
                      component="span"
                      className={classes.barIconButton}
                      onClick={() => setInputMessage((prev) => (prev?.startsWith("/") ? prev : "/" + (prev || "")))}
                      disabled={disableOption()}
                    >
                      <BoltOutlinedIcon className={classes.sendMessageIcons} />
                    </IconButton>
                  </span>
                </Tooltip>

                {ticketChannel !== "whatsapp_oficial" && (
                <Menu
                  anchorEl={anchorEl}
                  keepMounted
                  open={Boolean(anchorEl)}
                  onClose={handleMenuItemClick}
                  id="simple-menu"
                >
                  <MenuItem onClick={handleMenuItemClick}>
                    <input
                      multiple
                      type="file"
                      id="upload-img-button"
                      accept="image/*, video/*, audio/* "
                      className={classes.uploadInput}
                      onChange={handleChangeMedias}
                    />
                    <label htmlFor="upload-img-button">
                      <Fab
                        aria-label="upload-img"
                        component="span"
                        className={classes.invertedFabMenuMP}
                      >
                        <PermMediaIcon />
                      </Fab>
                      {i18n.t("messageInput.type.imageVideo")}
                    </label>
                  </MenuItem>
                  <MenuItem onClick={handleCameraModalOpen}>
                    <Fab className={classes.invertedFabMenuCamera}>
                      <CameraAltIcon />
                    </Fab>
                    {i18n.t("messageInput.type.cam")}
                  </MenuItem>
                  <MenuItem onClick={handleMenuItemClick}>
                    <input
                      multiple
                      type="file"
                      id="upload-doc-button"
                      accept="application/*, text/*, .odt, .ods, .odp, .odg, .xml, .ofx, .zip, .rar, .7z, .tar, .gz, .bz2, .msg, .key, .numbers, .pages"
                      className={classes.uploadInput}
                      onChange={handleChangeMedias}
                    />
                    <label htmlFor="upload-doc-button">
                      <Fab
                        aria-label="upload-img"
                        component="span"
                        className={classes.invertedFabMenuDoc}
                      >
                        <DescriptionOutlinedIcon />
                      </Fab>
                      Documento
                    </label>
                  </MenuItem>
                  <MenuItem onClick={handleSendContactModalOpen}>
                    <Fab className={classes.invertedFabMenuCont}>
                      <PersonOutlineOutlinedIcon />
                    </Fab>
                    {i18n.t("messageInput.type.contact")}
                  </MenuItem>
                  <MenuItem onClick={handleSendLinkVideo}>
                    <Fab className={classes.invertedFabMenuMeet}>
                      <DuoIcon />
                    </Fab>
                    {i18n.t("messageInput.type.meet")}
                  </MenuItem>
                  {ticketChannel !== "whatsapp_oficial" && (
                    <MenuItem onClick={() => handleOpenInteractive()}>
                      <Fab className={classes.invertedFabMenuMeet}>
                        <TouchAppIcon />
                      </Fab>
                      {i18n.t("messageInput.type.interactive") || "Interativa"}
                    </MenuItem>
                  )}
                </Menu>
                )}

                {signMessagePar && (
                  <Tooltip title={i18n.t("messageInput.tooltip.signature")}>
                    <IconButton
                      aria-label="send-upload"
                      component="span"
                      className={classes.barIconButton}
                      onClick={handleChangeSign}
                    >
                      {signMessage === true ? (
                        <BorderColorOutlinedIcon
                          style={{
                            color:
                              theme.mode === "light"
                                ? theme.palette.primary.main
                                : "#EEE",
                          }}
                        />
                      ) : (
                        <BorderColorOutlinedIcon className={classes.sendMessageIcons} />
                      )}
                    </IconButton>
                  </Tooltip>
                )}

                {/* BOTÃO IA AUXILIAR - SUGERIR RESPOSTA */}
                {ticketStatus === "open" && aiSuggestEnabled && (
                  <Tooltip title={i18n.t("messagesInput.tooltips.aiSuggest") || "IA: Sugerir resposta"}>
                    <IconButton
                      aria-label="ai-suggest"
                      component="span"
                      className={classes.barIconButton}
                      onClick={handleAiSuggestReply}
                      disabled={disableOption() || aiSuggesting}
                    >
                      {aiSuggesting ? (
                        <CircularProgress size={20} />
                      ) : (
                        <svg
                          xmlns="http://www.w3.org/2000/svg"
                          viewBox="0 0 24 24"
                          fill={theme.mode === "light" ? "#7C3AED" : "#A78BFA"}
                          width="18"
                          height="18"
                        >
                          <path d="M19.31 2.9L18.2 5.01l-2.11 1.11 2.11 1.11 1.11 2.11 1.11-2.11 2.11-1.11-2.11-1.11zM11.39 4.22L10 7l-2.78 1.39L10 9.78l1.39 2.78L12.78 9.78 15.56 8.39 12.78 7zM19.31 15.9l-1.11 2.11-2.11 1.11 2.11 1.11 1.11 2.11 1.11-2.11 2.11-1.11-2.11-1.11zM9 13c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm0 6c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/>
                        </svg>
                      )}
                    </IconButton>
                  </Tooltip>
                )}

                {/* NOVO ÍCONE DE TRIGGER FLOW - APENAS EM TICKETS OPEN */}
                {ticketStatus === "open" && (
                  <Tooltip title={i18n.t("messagesInput.tooltips.triggerFlow")}>
                    <IconButton
                      aria-label="trigger-flow"
                      component="span"
                      className={classes.barIconButton}
                      onClick={handleTriggerFlowClick}
                      disabled={disableOption()}
                    >
                      <AccountTreeOutlinedIcon className={classes.sendMessageIcons} />
                    </IconButton>
                  </Tooltip>
                )}

                {/* BOTÃO MENSAGEM INTERATIVA - REMOVIDO */}
                {/* BOTÃO MENCIONAR TODOS - APENAS EM GRUPOS BAILEYS */}
                {isGroup && ticketChannel !== "whatsapp_oficial" && (
                  <Tooltip title={i18n.t("messagesInput.tooltips.ghostMention")}>
                    <IconButton
                      aria-label="mention-all"
                      component="span"
                      className={classes.barIconButton}
                      onClick={handleGhostMention}
                      disabled={disableOption() || loading}
                    >
                      <GroupAddIcon className={classes.sendMessageIcons} />
                    </IconButton>
                  </Tooltip>
                )}

                {!isTicketPending() && (
                  <Tooltip title={i18n.t("messageInput.tooltip.privateMessage")}>
                    <IconButton
                      aria-label="send-upload"
                      component="span"
                      className={classes.barIconButton}
                      onClick={handlePrivateMessage}
                    >
                      {privateMessage === true ? (
                        <ChatBubbleOutlineRoundedIcon
                          style={{
                            fontSize: 18,
                            color:
                              theme.mode === "light"
                                ? theme.palette.primary.main
                                : "#EEE",
                          }}
                        />
                      ) : (
                        <ChatBubbleOutlineRoundedIcon className={classes.sendMessageIcons} />
                      )}
                    </IconButton>
                  </Tooltip>
                )}
              </Hidden>
            )}

            {isTicketPending() && (
              <Hidden only={["md", "lg", "xl"]}>
                <IconButton
                  aria-controls="simple-menu"
                  aria-haspopup="true"
                  onClick={handleOpenMenuClick}
                >
                  <MoreVertIcon></MoreVertIcon>
                </IconButton>
                <Menu
                  id="simple-menu"
                  keepMounted
                  anchorEl={anchorEl}
                  open={Boolean(anchorEl)}
                  onClose={handleMenuItemClick}
                >
                  <MenuItem onClick={(e) => {
                    e.stopPropagation();
                    setShowEmoji((prevState) => !prevState);
                    handleMenuItemClick();
                  }}>
                    <IconButton
                      aria-label="emojiPicker"
                      component="span"
                      disabled={disableOptionForPending()}
                    >
                      <MoodOutlinedIcon className={classes.sendMessageIcons} />
                    </IconButton>
                    Emoji
                  </MenuItem>
                </Menu>
              </Hidden>
            )}

            {!isTicketPending() && (
              <Hidden only={["md", "lg", "xl"]}>
                <IconButton
                  aria-controls="simple-menu"
                  aria-haspopup="true"
                  onClick={handleOpenMenuClick}
                >
                  <MoreVertIcon></MoreVertIcon>
                </IconButton>
                <Menu
                  id="simple-menu"
                  keepMounted
                  anchorEl={anchorEl}
                  open={Boolean(anchorEl)}
                  onClose={handleMenuItemClick}
                >
                  <MenuItem onClick={(e) => {
                    e.stopPropagation();
                    setShowEmoji((prevState) => !prevState);
                    handleMenuItemClick();
                  }}>
                    <IconButton
                      aria-label="emojiPicker"
                      component="span"
                      disabled={disableOption()}
                    >
                      <MoodOutlinedIcon className={classes.sendMessageIcons} />
                    </IconButton>
                    Emoji
                  </MenuItem>
                  <MenuItem>
                    <input
                      multiple
                      type="file"
                      id="upload-img-button-mobile"
                      accept="image/*, video/*, audio/* "
                      disabled={disableOption()}
                      className={classes.uploadInput}
                      onChange={(e) => {
                        handleChangeMedias(e);
                        handleMenuItemClick();
                      }}
                    />
                    <label htmlFor="upload-img-button-mobile" style={{ display: 'flex', alignItems: 'center', width: '100%', cursor: 'pointer' }}>
                      <Fab
                        aria-label="upload-img"
                        component="span"
                        className={classes.invertedFabMenuMP}
                        disabled={disableOption()}
                      >
                        <PermMediaIcon />
                      </Fab>
                      <span style={{ marginLeft: 8 }}>{i18n.t("messageInput.type.imageVideo")}</span>
                    </label>
                  </MenuItem>
                  <MenuItem onClick={() => {
                    handleCameraModalOpen();
                    handleMenuItemClick();
                  }}>
                    <Fab className={classes.invertedFabMenuCamera} disabled={disableOption()}>
                      <CameraAltIcon />
                    </Fab>
                    {i18n.t("messageInput.type.cam")}
                  </MenuItem>
                  <MenuItem>
                    <input
                      multiple
                      type="file"
                      id="upload-doc-button-mobile"
                      accept="application/*, text/*, .odt, .ods, .odp, .odg, .xml, .ofx, .zip, .rar, .7z, .tar, .gz, .bz2, .msg, .key, .numbers, .pages"
                      disabled={disableOption()}
                      className={classes.uploadInput}
                      onChange={(e) => {
                        handleChangeMedias(e);
                        handleMenuItemClick();
                      }}
                    />
                    <label htmlFor="upload-doc-button-mobile" style={{ display: 'flex', alignItems: 'center', width: '100%', cursor: 'pointer' }}>
                      <Fab
                        aria-label="upload-img"
                        component="span"
                        className={classes.invertedFabMenuDoc}
                        disabled={disableOption()}
                      >
                        <DescriptionOutlinedIcon />
                      </Fab>
                      <span style={{ marginLeft: 8 }}>Documento</span>
                    </label>
                  </MenuItem>
                  <MenuItem onClick={() => {
                    handleSendContactModalOpen();
                    handleMenuItemClick();
                  }}>
                    <Fab className={classes.invertedFabMenuCont} disabled={disableOption()}>
                      <PersonOutlineOutlinedIcon />
                    </Fab>
                    {i18n.t("messageInput.type.contact")}
                  </MenuItem>
                  <MenuItem onClick={() => {
                    handleSendLinkVideo();
                    handleMenuItemClick();
                  }}>
                    <Fab className={classes.invertedFabMenuMeet} disabled={disableOption()}>
                      <DuoIcon />
                    </Fab>
                    {i18n.t("messageInput.type.meet")}
                  </MenuItem>
                  {ticketChannel !== "whatsapp_oficial" && (
                    <MenuItem onClick={() => handleOpenInteractive()}>
                      <Fab className={classes.invertedFabMenuMeet} disabled={disableOption()}>
                        <TouchAppIcon />
                      </Fab>
                      <span style={{ marginLeft: 8 }}>{i18n.t("messageInput.type.interactive") || "Interativa"}</span>
                    </MenuItem>
                  )}
                  {useWhatsappOfficial &&
                    ticketChannel === "whatsapp_oficial" && (
                      <MenuItem onClick={() => {
                        handleSendTemplate();
                        handleMenuItemClick();
                      }}>
                        <Fab 
                          className={classes.invertedFabMenuMeet} 
                          style={needsTemplate ? { 
                            backgroundColor: theme.palette.primary.main,
                            color: '#fff'
                          } : {}}
                        >
                          <WhatsAppIcon />
                        </Fab>
                        {i18n.t("messageInput.type.template")}
                        {needsTemplate && <span style={{ marginLeft: 8, color: '#FF9800' }}>⚠️</span>}
                      </MenuItem>
                    )}
                  {isGroup && ticketChannel !== "whatsapp_oficial" && (
                    <MenuItem onClick={() => {
                      handleGhostMention();
                      handleMenuItemClick();
                    }}>
                      <Fab className={classes.invertedFabMenuCont} disabled={disableOption() || loading}>
                        <GroupAddIcon />
                      </Fab>
                    {i18n.t("messagesInput.menuItems.ghostMention")}
                    </MenuItem>
                  )}
                  {signMessagePar && (
                    <MenuItem onClick={() => {
                      handleChangeSign();
                      handleMenuItemClick();
                    }}>
                      <Tooltip title={i18n.t("messagesInput.tooltips.enableSignature")}>
                        <IconButton
                          aria-label="send-upload"
                          component="span"
                        >
                          {signMessage === true ? (
                            <BorderColorOutlinedIcon
                              style={{
                                color:
                                  theme.mode === "light"
                                    ? theme.palette.primary.main
                                    : "#EEE",
                              }}
                            />
                          ) : (
                            <BorderColorOutlinedIcon style={{ color: "grey" }} />
                          )}
                        </IconButton>
                      </Tooltip>
                      {i18n.t("messagesInput.menuItems.signature")}
                    </MenuItem>
                  )}

                  {/* NOVO ITEM DE MENU MOBILE PARA TRIGGER FLOW */}
                  {ticketStatus === "open" && (
                    <MenuItem onClick={() => {
                      handleMenuItemClick();
                      handleTriggerFlowClick();
                    }}>
                      <IconButton
                        aria-label="trigger-flow"
                        component="span"
                      >
                        <AccountTreeOutlinedIcon
                          style={{
                            color: theme.mode === "light"
                              ? theme.palette.secondary.main
                              : "#EEE"
                          }}
                        />
                      </IconButton>
                      {i18n.t("messagesInput.menuItems.triggerFlow")}
                    </MenuItem>
                  )}

                  {/* ITEM DE MENU MOBILE PARA MENSAGEM INTERATIVA - REMOVIDO */}
                  <MenuItem onClick={() => {
                    handlePrivateMessage();
                    handleMenuItemClick();
                  }}>
                    <Tooltip title={i18n.t("messagesInput.tooltips.enableComments")}>
                      <IconButton
                        aria-label="send-upload"
                        component="span"
                      >
                        {privateMessage === true ? (
                          <ChatBubbleOutlineRoundedIcon
                            style={{
                              fontSize: 18,
                              color:
                                theme.mode === "light"
                                  ? theme.palette.primary.main
                                  : "#EEE",
                            }}
                          />
                        ) : (
                          <ChatBubbleOutlineRoundedIcon style={{ fontSize: 18, color: "grey" }} />
                        )}
                      </IconButton>
                    </Tooltip>
                    {i18n.t("messagesInput.menuItems.comments")}
                  </MenuItem>
                </Menu>
              </Hidden>
            )}

            {/* Emoji Picker para Mobile */}
            <Hidden only={["md", "lg", "xl"]}>
              {showEmoji && (
                <div className={classes.emojiBox} style={{ 
                  bottom: 63, 
                  left: 0, 
                  right: 0, 
                  width: '100%',
                  zIndex: 9999 
                }}>
                  <ClickAwayListener onClickAway={(e) => setShowEmoji(false)}>
                    <Picker
                      perLine={7}
                      theme={"dark"}
                      i18n={i18n}
                      showPreview={false}
                      showSkinTones={false}
                      onSelect={(emoji) => {
                        handleAddEmoji(emoji);
                        setShowEmoji(false);
                      }}
                      style={{ width: '100%' }}
                    />
                  </ClickAwayListener>
                </div>
              )}
            </Hidden>

            <div className={classes.flexContainer}>
              {(privateMessageInputVisible || isTicketPending()) && (
                <div className={classes.flexItem}>
                  <div className={isTicketPending() ? classes.messageInputWrapperPending : classes.messageInputWrapperPrivate}>
                    <InputBase
                      inputRef={(input) => {
                        input && input.focus();
                        input && (inputRef.current = input);
                      }}
                      className={isTicketPending() ? classes.messageInputPending : classes.messageInputPrivate}
                      placeholder={
                        isTicketPending()
                          ? i18n.t("messagesInputExtra.placeholderPendingAccept")
                          : ticketStatus === "open" || ticketStatus === "group"
                            ? i18n.t("messagesInput.placeholderPrivateMessage")
                            : i18n.t("messagesInput.placeholderClosed")
                      }
                      multiline
                      maxRows={5}
                      value={inputMessage}
                      onChange={handleChangeInput}
                      disabled={disableOptionForPending()}
                      onPaste={(e) => {
                        (ticketStatus === "open" || ticketStatus === "group" || isTicketPending()) &&
                          handleInputPaste(e);
                      }}
                      onKeyDown={handleKeyDown}
                      onKeyUp={handleKeyUp}
                      onMouseUp={handleMouseUp}
                      onSelect={handleSelectText}
                      onKeyPress={(e) => {
                        if (loading || e.shiftKey) return;
                        else if (e.key === "Enter" && !isNavigatingQuickAnswers) {
                          handleSendMessage();
                        }
                      }}
                      spellCheck={true}
                    />
                    {typeBar ? (
                      <Box
                        component="ul"
                        className={classes.messageQuickAnswersWrapper}
                        style={{
                          marginBottom: "8px" // ✅ Pequeno espaço entre input e lista
                        }}
                      >
                        {typeBar.map((value, index) => {
                          const isSelected = selectedQuickAnswerIndex === index;
                          return (
                            <li
                              className={classes.messageQuickAnswersWrapperItem}
                              key={index}
                              style={{ listStyle: "none" }}
                            >
                              <div
                                className={clsx(
                                  classes.quickAnswerItem,
                                  isSelected && classes.quickAnswerItemSelected
                                )}
                                style={{
                                  ...getQuickAnswerItemStyle(index),
                                  // ✅ Estilo adicional para item selecionado
                                  ...(isSelected && {
                                    backgroundColor: theme.palette.primary.light + "20",
                                    borderLeft: `4px solid ${theme.palette.primary.main}`,
                                    transform: "translateX(2px)" // ✅ Leve deslocamento visual
                                  })
                                }}
                                onClick={() => handleQuickAnswersClick(value)}
                              >
                                <Box className={classes.quickAnswerText}>
                                  {value.label}
                                </Box>
                                {value.mediaType && (
                                  <Chip
                                    size="small"
                                    label={`${getMediaTypeIcon(value.mediaType)} ${value.mediaType}`}
                                    color={getMediaTypeColor(value.mediaType)}
                                    className={classes.mediaTypeChip}
                                  />
                                )}
                              </div>
                            </li>
                          );
                        })}

                        {/* ✅ Indicador de scroll apenas se necessário */}
                        {typeBar.length > 4 && (
                          <li style={{ listStyle: "none" }}>
                            <div className={classes.quickAnswersScrollIndicator}>
                              📋 {typeBar.length} respostas • use ↑↓ para navegar
                            </div>
                          </li>
                        )}
                      </Box>
                    ) : null}
                  </div>
                </div>
              )}
              {!privateMessageInputVisible && !isTicketPending() && (
                <>
                  <div className={classes.toolbarDivider} />
                  <div className={classes.flexItem}>
                    <div className={classes.messageInputWrapper}>
                      <InputBase
                        inputRef={(input) => {
                          input && input.focus();
                          input && (inputRef.current = input);
                        }}
                        className={classes.messageInput}
                        placeholder={placeholderText}
                        multiline
                        maxRows={5}
                        value={inputMessage}
                        onChange={handleChangeInput}
                        disabled={disableOption()}
                        onPaste={(e) => {
                          (ticketStatus === "open" || ticketStatus === "group") &&
                            handleInputPaste(e);
                        }}
                        onKeyDown={handleKeyDown}
                        onKeyUp={handleKeyUp}
                        onMouseUp={handleMouseUp}
                        onSelect={handleSelectText}
                        onKeyPress={(e) => {
                          if (loading || e.shiftKey) return;
                          else if (e.key === "Enter" && !isNavigatingQuickAnswers) {
                            handleSendMessage();
                          }
                        }}
                        spellCheck={true}
                      />
                      {typeBar ? (
                        <ul className={classes.messageQuickAnswersWrapper}>
                          {typeBar.map((value, index) => {
                            const isSelected = selectedQuickAnswerIndex === index;
                            return (
                              <li
                                className={classes.messageQuickAnswersWrapperItem}
                                key={index}
                              >
                                <div
                                  className={`${classes.quickAnswerItem} ${isSelected ? 'selected' : ''}`}
                                  style={getQuickAnswerItemStyle(index)}
                                  onClick={() => handleQuickAnswersClick(value)}
                                >
                                  <Box className={classes.quickAnswerText}>
                                    {value.label}
                                  </Box>
                                  {value.mediaType && (
                                    <Chip
                                      size="small"
                                      label={`${getMediaTypeIcon(value.mediaType)} ${value.mediaType}`}
                                      color={getMediaTypeColor(value.mediaType)}
                                      className={classes.mediaTypeChip}
                                    />
                                  )}
                                </div>
                              </li>
                            );
                          })}

                          {typeBar.length > 5 && (
                            <div className={classes.quickAnswersScrollIndicator}>
                              {typeBar.length} respostas • role para ver mais
                            </div>
                          )}
                        </ul>
                      ) : (
                        <div></div>
                      )}
                    </div>
                  </div>
                </>
              )}
            </div>

            {(!privateMessageInputVisible || isTicketPending()) && (
              <>
                {showSchedules && !isTicketPending() && (
                  <Tooltip title={i18n.t("tickets.buttons.scredule")}>
                    <IconButton
                      aria-label="scheduleMessage"
                      component="span"
                      className={classes.barIconButton}
                      onClick={() => setAppointmentModalOpen(true)}
                      disabled={loading}
                    >
                      <TimerIcon className={classes.sendMessageIcons} />
                    </IconButton>
                  </Tooltip>
                )}
                {inputMessage || showSelectMessageCheckbox ? (
                  <>
                    <IconButton
                      aria-label="sendMessage"
                      component="span"
                      className={classes.sendActionButton}
                      onClick={
                        showSelectMessageCheckbox
                          ? handleOpenModalForward
                          : handleSendMessage
                      }
                      disabled={loading}
                    >
                      {showSelectMessageCheckbox ? (
                        <ReplyIcon className={classes.ForwardMessageIcons} />
                      ) : (
                        <SendIcon className={classes.sendMessageIcons} />
                      )}
                    </IconButton>
                  </>
                ) : recording ? (
                  <div className={classes.recorderWrapper}>
                    <IconButton
                      aria-label="cancelRecording"
                      component="span"
                      fontSize="large"
                      disabled={loading}
                      onClick={handleCancelAudio}
                    >
                      <HighlightOffIcon className={classes.cancelAudioIcon} />
                    </IconButton>
                    {loading ? (
                      <div>
                        <CircularProgress className={classes.audioLoading} />
                      </div>
                    ) : (
                      <RecordingTimer />
                    )}

                    <IconButton
                      aria-label="sendRecordedAudio"
                      component="span"
                      onClick={handleUploadAudio}
                      disabled={loading}
                    >
                      <CheckCircleOutlineIcon className={classes.sendAudioIcon} />
                    </IconButton>
                  </div>
                ) : (
                  <IconButton
                    aria-label="showRecorder"
                    component="span"
                    className={classes.sendActionButton}
                    disabled={disableOptionForPending()}
                    onClick={handleStartRecording}
                  >
                    <MicIcon className={classes.sendMessageIcons} />
                  </IconButton>
                )}
              </>
            )}

            {privateMessageInputVisible && !isTicketPending() && (
              <>
                <IconButton
                  aria-label="sendMessage"
                  component="span"
                  onClick={
                    showSelectMessageCheckbox
                      ? handleOpenModalForward
                      : handleSendMessage
                  }
                  disabled={loading}
                >
                  {showSelectMessageCheckbox ? (
                    <ReplyIcon className={classes.ForwardMessageIcons} />
                  ) : (
                    <SendIcon className={classes.sendMessageIcons} />
                  )}
                </IconButton>
              </>
            )}

            {appointmentModalOpen && (
              <ScheduleModal
                open={appointmentModalOpen}
                onClose={() => setAppointmentModalOpen(false)}
                message={inputMessage}
                contactId={contactId}
                fromMessageInput={true}
                user={user}
              />
            )}

            {/* Menu de formatação que aparece quando texto é selecionado */}
            <TextFormatMenu />

          </div>
        </Paper>
      </>
    );
  }
};

export default MessageInput;