import React, { useState, useCallback, useContext, useEffect, useRef } from "react";
import { toast } from "react-toastify";
import format from "date-fns/format";
import parseISO from "date-fns/parseISO";

import Menu from "@material-ui/core/Menu";
import MenuItem from "@material-ui/core/MenuItem";
import PopupState, { bindTrigger, bindMenu } from "material-ui-popup-state";
// import { SocketContext } from "../../context/Socket/SocketContext";
import { makeStyles, useTheme } from "@material-ui/core/styles";
import green from "@material-ui/core/colors/green";
import { Button, IconButton, Paper, Tooltip, Typography, CircularProgress, Box, Card, Dialog, DialogTitle, DialogContent, DialogActions, Select, MenuItem as MuiMenuItem, FormControl, InputLabel, Switch, Chip, Grid, InputAdornment } from "@material-ui/core";
import History from "@material-ui/icons/History";
import Edit from "@material-ui/icons/Edit";
import CheckCircle from "@material-ui/icons/CheckCircle";
import SignalCellularConnectedNoInternet2Bar from "@material-ui/icons/SignalCellularConnectedNoInternet2Bar";
import SignalCellularConnectedNoInternet0Bar from "@material-ui/icons/SignalCellularConnectedNoInternet0Bar";
import SignalCellular4Bar from "@material-ui/icons/SignalCellular4Bar";
import CropFree from "@material-ui/icons/CropFree";
import DeleteOutline from "@material-ui/icons/DeleteOutline";
import Facebook from "@material-ui/icons/Facebook";
import Instagram from "@material-ui/icons/Instagram";
import WhatsApp from "@material-ui/icons/WhatsApp";
import Sync from "@material-ui/icons/Sync";
import Autorenew from "@material-ui/icons/Autorenew";
import CloudDownload from "@material-ui/icons/CloudDownload";
import SendIcon from "@material-ui/icons/Send";
import SearchIcon from "@material-ui/icons/Search";
import ClearIcon from "@material-ui/icons/Clear";
import { TextField } from "@material-ui/core";
import WebhookIcon from '@mui/icons-material/Webhook';
import ChatBubbleIcon from '@material-ui/icons/ChatBubble';
import FacebookLogin from "react-facebook-login/dist/facebook-login-render-props";
import EmbeddedSignupModal from "../../components/EmbeddedSignupModal";

import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import MainHeaderButtonsWrapper from "../../components/MainHeaderButtonsWrapper";
import Title from "../../components/Title";
import TableRowSkeleton from "../../components/TableRowSkeleton";

import api from "../../services/api";
import useSettings from "../../hooks/useSettings";
import WhatsAppModal from "../../components/WhatsAppModal";
import ConfirmationModal from "../../components/ConfirmationModal";
import QrcodeModal from "../../components/QrcodeModal";
import WhatsAppQualityModal from "../../components/WhatsAppQualityModal";
import PairingCodeModal from "../../components/PairingCodeModal";
import { i18n } from "../../translate/i18n";
import { WhatsAppsContext } from "../../context/WhatsApp/WhatsAppsContext";
import toastError from "../../errors/toastError";
import formatSerializedId from '../../utils/formatSerializedId';
import { AuthContext } from "../../context/Auth/AuthContext";
import usePlans from "../../hooks/usePlans";
import { useHistory } from "react-router-dom/cjs/react-router-dom.min";
import ForbiddenPage from "../../components/ForbiddenPage";
import { Can } from "../../components/Can";
import ConnectionStatsChart from "../../components/ConnectionStatsChart";

const useStyles = makeStyles((theme) => ({
  mainPaper: {
    flex: 1,
    padding: theme.padding,
    overflowY: "auto",
    overflowX: "hidden",
    ...theme.scrollbarStyles,
    background: "transparent",
    border: "none",
  },
  customTableCell: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  tooltip: {
    backgroundColor: theme.palette.type === "dark" ? "rgba(30,30,40,0.95)" : "#fff",
    color: theme.palette.text.primary,
    fontSize: theme.typography.pxToRem(13),
    border: `1px solid ${theme.palette.divider}`,
    maxWidth: 450,
    borderRadius: 10,
    boxShadow: "0 8px 32px rgba(0,0,0,0.12)",
    padding: "8px 12px",
  },
  tooltipPopper: {
    textAlign: "center",
  },
  buttonProgress: {
    color: "#25d366",
  },
  shareBox: {
    marginBottom: 10,
  },
  shareLabel: {
    fontSize: 11,
    fontWeight: 600,
    color: "#d97706",
    marginBottom: 4,
    display: "block",
  },
  shareRow: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    border: "1px solid rgba(0,0,0,0.12)",
    borderRadius: 8,
    padding: "6px 10px",
  },
  shareLink: {
    flex: 1,
    fontSize: 12,
    fontFamily: "'Roboto Mono', monospace",
    overflow: "hidden",
    textOverflow: "ellipsis",
    whiteSpace: "nowrap",
  },
  shareCopy: {
    fontSize: 12,
    fontWeight: 700,
    color: "#4338ca",
    cursor: "pointer",
    background: "none",
    border: "none",
    padding: 0,
    "&:hover": { textDecoration: "underline" },
  },
  defaultChip: {
    height: 20,
    fontSize: 10,
    fontWeight: 700,
    borderRadius: 6,
    border: "1px solid rgba(0,0,0,0.2)",
    background: "transparent",
  },
  connectionCard: {
    borderRadius: 12,
    border: `1px solid ${theme.palette.type === "dark" ? "rgba(255,255,255,0.08)" : "#e8e8e8"}`,
    overflow: "hidden",
    transition: "all 0.2s ease",
    background: theme.palette.type === "dark"
      ? "rgba(25,25,40,0.9)"
      : "#fff",
    "&:hover": {
      transform: "translateY(-2px)",
      boxShadow: theme.palette.type === "dark"
        ? "0 8px 24px rgba(0,0,0,0.35)"
        : "0 8px 24px rgba(0,0,0,0.06)",
    },
  },
  cardHeader: {
    padding: "6px 10px 4px",
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  cardHeaderLeft: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    overflow: "hidden",
  },
  channelIconWrapper: {
    width: 26,
    height: 26,
    borderRadius: 6,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: theme.palette.type === "dark" ? "rgba(37,211,102,0.12)" : "rgba(37,211,102,0.06)",
    flexShrink: 0,
  },
  cardName: {
    fontWeight: 700,
    fontSize: 12,
    color: theme.palette.text.primary,
    whiteSpace: "nowrap",
    overflow: "hidden",
    textOverflow: "ellipsis",
    maxWidth: 160,
  },
  cardNumber: {
    fontSize: 10,
    color: theme.palette.text.secondary,
    marginTop: 0,
  },
  statusChip: {
    display: "flex",
    alignItems: "center",
    gap: 3,
    padding: "1px 6px",
    borderRadius: 5,
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: "0.5px",
    textTransform: "uppercase",
    flexShrink: 0,
  },
  statusChipConnected: {
    backgroundColor: "rgba(37,211,102,0.1)",
    color: "#25d366",
    border: "1px solid rgba(37,211,102,0.2)",
  },
  statusChipDisconnected: {
    backgroundColor: "rgba(239,68,68,0.08)",
    color: "#ef4444",
    border: "1px solid rgba(239,68,68,0.15)",
  },
  statusChipOpening: {
    backgroundColor: "rgba(255,152,0,0.08)",
    color: "#ff9800",
    border: "1px solid rgba(255,152,0,0.15)",
  },
  statusChipQrcode: {
    backgroundColor: "rgba(99,102,241,0.08)",
    color: "#6366f1",
    border: "1px solid rgba(99,102,241,0.15)",
  },
  officialBadge: {
    background: "linear-gradient(135deg, #25d366, #128c7e)",
    color: "#fff",
    fontSize: 10,
    fontWeight: 700,
    height: 20,
    borderRadius: 6,
  },
  normalBadge: {
    backgroundColor: theme.palette.type === "dark" ? "rgba(255,255,255,0.08)" : "#f0f0f0",
    color: theme.palette.type === "dark" ? "#aaa" : "#666",
    fontSize: 10,
    fontWeight: 600,
    height: 20,
    borderRadius: 6,
  },
  pairingBadge: {
    background: "linear-gradient(135deg, #7c3aed, #5b21b6)",
    color: "#fff",
    fontSize: 10,
    fontWeight: 700,
    height: 20,
    borderRadius: 6,
  },
  qrBadge: {
    background: "linear-gradient(135deg, #0ea5e9, #0284c7)",
    color: "#fff",
    fontSize: 10,
    fontWeight: 700,
    height: 20,
    borderRadius: 6,
  },
  cardBody: {
    padding: "0 10px 4px",
  },
  integritySection: {
    marginBottom: 4,
  },
  integrityLabel: {
    fontSize: 9,
    color: theme.palette.text.secondary,
    fontWeight: 500,
    marginBottom: 1,
  },
  integrityBadge: {
    display: "inline-block",
    fontSize: 9,
    fontWeight: 600,
    padding: "1px 6px",
    borderRadius: 4,
  },
  integrityStable: {
    backgroundColor: "rgba(37,211,102,0.1)",
    color: "#25d366",
  },
  integrityUnstable: {
    backgroundColor: "rgba(239,68,68,0.08)",
    color: "#ef4444",
  },
  actionButtonsRow: {
    display: "flex",
    alignItems: "center",
    gap: 6,
    marginTop: 4,
    marginBottom: 2,
  },
  actionButton: {
    borderRadius: 6,
    textTransform: "none",
    fontWeight: 600,
    fontSize: 11,
    padding: "3px 12px",
    borderColor: "#7c3aed",
    color: "#7c3aed",
    "&:hover": {
      borderColor: "#6d28d9",
      backgroundColor: "rgba(124,58,237,0.04)",
    },
  },
  actionButtonFilled: {
    borderRadius: 6,
    textTransform: "none",
    fontWeight: 600,
    fontSize: 11,
    padding: "3px 12px",
    borderColor: "#7c3aed",
    color: "#7c3aed",
    border: "1.5px solid #7c3aed",
    "&:hover": {
      borderColor: "#6d28d9",
      backgroundColor: "rgba(124,58,237,0.04)",
    },
  },
  disconnectButton: {
    borderRadius: 6,
    textTransform: "none",
    fontWeight: 600,
    fontSize: 11,
    padding: "3px 12px",
    color: "#ef4444",
    borderColor: "#ef4444",
    "&:hover": {
      backgroundColor: "rgba(239,68,68,0.06)",
      borderColor: "#dc2626",
    },
  },
  lastUpdate: {
    fontSize: 9,
    color: theme.palette.text.secondary,
    fontWeight: 400,
    marginTop: 2,
  },
  cardFooter: {
    padding: "4px 10px",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    borderTop: `1px solid ${theme.palette.type === "dark" ? "rgba(255,255,255,0.06)" : "#f0f0f0"}`,
    background: theme.palette.type === "dark" ? "rgba(255,255,255,0.02)" : "rgba(0,0,0,0.01)",
  },
  footerLeft: {
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  footerToggleLabel: {
    fontSize: 12,
    fontWeight: 500,
    color: theme.palette.text.secondary,
  },
  footerIconButton: {
    borderRadius: 6,
    padding: 5,
    transition: "all 0.2s ease",
    "&:hover": {
      backgroundColor: theme.palette.type === "dark" ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.05)",
    },
  },
  colorDot: {
    width: 10,
    height: 10,
    borderRadius: "50%",
    display: "inline-block",
    marginLeft: 8,
    border: `2px solid ${theme.palette.type === "dark" ? "rgba(255,255,255,0.1)" : "rgba(0,0,0,0.08)"}`,
  },
  statusDot: {
    width: 7,
    height: 7,
    borderRadius: "50%",
    display: "inline-block",
  },
  statBox: {
    flex: 1,
    borderRadius: 10,
    padding: "6px 10px",
    textAlign: "center",
    background: theme.palette.type === "dark"
      ? "rgba(255,255,255,0.04)"
      : "#f8f9fb",
    border: `1px solid ${theme.palette.type === "dark" ? "rgba(255,255,255,0.06)" : "rgba(0,0,0,0.04)"}`,
  },
  statValue: {
    fontWeight: 700,
    fontSize: 18,
    color: theme.palette.text.primary,
    lineHeight: 1.2,
  },
  statLabel: {
    fontSize: 11,
    color: theme.palette.text.secondary,
    textTransform: "uppercase",
    fontWeight: 600,
    letterSpacing: "0.3px",
    marginTop: 1,
  },
  modernDialog: {
    "& .MuiDialog-paper": {
      borderRadius: 16,
      overflow: "hidden",
    },
  },
  modernDialogTitle: {
    fontWeight: 700,
    fontSize: 18,
    padding: "20px 24px 12px",
  },
  modernDialogContent: {
    padding: "8px 24px 20px",
  },
  modernDialogActions: {
    padding: "12px 24px 20px",
    gap: 10,
  },
  modernCancelButton: {
    borderRadius: 10,
    textTransform: "none",
    fontWeight: 600,
    padding: "8px 20px",
  },
  modernConfirmButton: {
    borderRadius: 10,
    textTransform: "none",
    fontWeight: 600,
    padding: "8px 20px",
    background: `linear-gradient(135deg, ${theme.palette.primary.main}, ${theme.palette.primary.dark})`,
    color: "#fff",
    boxShadow: "0 4px 14px rgba(0,0,0,0.15)",
    "&:hover": {
      boxShadow: "0 6px 20px rgba(0,0,0,0.2)",
    },
  },
}));

function CircularProgressWithLabel(props) {
  return (
    <Box position="relative" display="inline-flex">
      <CircularProgress variant="determinate" {...props} />
      <Box
        top={0}
        left={0}
        bottom={0}
        right={0}
        position="absolute"
        display="flex"
        alignItems="center"
        justifyContent="center"
      >
        <Typography
          variant="caption"
          component="div"
          color="textSecondary"
        >{`${Math.round(props.value)}%`}</Typography>
      </Box>
    </Box>
  );
}

const CustomToolTip = ({ title, content, children }) => {
  const classes = useStyles();

  return (
    <Tooltip
      arrow
      classes={{
        tooltip: classes.tooltip,
        popper: classes.tooltipPopper,
      }}
      title={
        <React.Fragment>
          <Typography gutterBottom color="inherit">
            {title}
          </Typography>
          {content && <Typography>{content}</Typography>}
        </React.Fragment>
      }
    >
      {children}
    </Tooltip>
  );
};

const IconChannel = (channel) => {
  switch (channel) {
    case "facebook":
      return <Facebook style={{ color: "#3b5998" }} />;
    case "instagram":
      return <Instagram style={{ color: "#e1306c" }} />;
    case "telegram":
      return <SendIcon style={{ color: "#0088cc" }} />;
    case "webchat":
      return <ChatBubbleIcon style={{ color: "#4E93FF" }} />;
    case "whatsapp":
      return <WhatsApp style={{ color: "#25d366" }} />;
    case "whatsapp_oficial":
      return <WhatsApp style={{ color: "#25d366" }} />;
    default:
      return <WhatsApp style={{ color: "#25d366" }} />;
  }
};

const Connections = () => {
  const classes = useStyles();
  const theme = useTheme();

  const { whatsApps, loading, refetch } = useContext(WhatsAppsContext);
  const [pairingConnections, setPairingConnections] = useState(() => {
    try {
      return JSON.parse(localStorage.getItem("pairingCodeConnections") || "[]");
    } catch (_) { return []; }
  });
  const [whatsAppModalOpen, setWhatsAppModalOpen] = useState(false);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [qualityModalOpen, setQualityModalOpen] = useState(false);
  const [qualityWhatsApp, setQualityWhatsApp] = useState(null);
  const [pairingCodeModalOpen, setPairingCodeModalOpen] = useState(false);
  const [selectedWhatsApp, setSelectedWhatsApp] = useState(null);
  const [channel, setChannel] = useState("whatsapp");
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [embeddedSignupModalOpen, setEmbeddedSignupModalOpen] = useState(false);
  const history = useHistory();
  const confirmationModalInitialState = {
    action: "",
    title: "",
    message: "",
    whatsAppId: "",
    open: false,
  };
  const [confirmModalInfo, setConfirmModalInfo] = useState(confirmationModalInitialState);
  const [disconnectingIds, setDisconnectingIds] = useState([]);
  const [importingHistoryIds, setImportingHistoryIds] = useState([]);
  // Espelha importingHistoryIds num ref pro listener de socket abaixo (que
  // só é re-registrado quando socket/companyId mudam) sempre ler o valor
  // ATUAL — sem isso, o closure do handler ficava preso no array vazio do
  // primeiro render e nunca reconhecia qual import (se algum) pertencia a
  // um card específico.
  const importingHistoryIdsRef = useRef([]);
  useEffect(() => {
    importingHistoryIdsRef.current = importingHistoryIds;
  }, [importingHistoryIds]);
  // Progresso (processedChats/totalChats) do import Baileys disparado pelo
  // botão "Importar mensagens anteriores" de um card específico — chaveado
  // por whatsappId pra mostrar o percentual certo em cada card.
  const [cardImportProgress, setCardImportProgress] = useState({});
  // Estatisticas de 7 dias de TODAS as conexoes numa chamada so. Um endpoint
  // por card viraria dezenas de requisicoes a cada carregamento desta tela.
  const [connectionStats, setConnectionStats] = useState({});

  useEffect(() => {
    let ativo = true;

    const carregarEstatisticas = async () => {
      try {
        const { data } = await api.get("/whatsapp-stats/last7days");
        if (!ativo || !Array.isArray(data)) return;

        const porId = {};
        data.forEach((item) => {
          porId[item.whatsappId] = item;
        });
        setConnectionStats(porId);
      } catch (err) {
        // Estatistica e enfeite: se falhar, o card continua funcionando sem o
        // grafico. Um toast de erro aqui so atrapalharia quem veio conectar.
      }
    };

    carregarEstatisticas();

    // O setInterval de 5 minutos que estava aqui foi removido. Era escolha
    // minha e nao tinha motivo: a tela ja se atualiza por socket, e o
    // grafico cobre 7 dias — um numero que nao muda de forma perceptivel em
    // cinco minutos. Com a aba aberta o dia todo, aquilo batia no servidor
    // umas 100 vezes por dia, cada uma agregando 7 dias de mensagens, sem
    // ninguem olhando.
    return () => {
      ativo = false;
    };
  }, []);
  // Prompt leve de período (só data início/fim) que abre ao clicar em
  // "Importar mensagens anteriores" no card de QUALQUER conexão (WhatsApp
  // Plus e Baileys) — antes disparava na hora, sem escolher período. Datas
  // em branco = sem filtro (WhatsApp Plus pega o lote recente inteiro;
  // Baileys usa o intervalo bem amplo de sempre, 2015 até hoje).
  const [historyImportPrompt, setHistoryImportPrompt] = useState(null); // { whatsAppId, channel } | null
  const [historyImportDates, setHistoryImportDates] = useState({ startDate: "", endDate: "" });
  // Status que os tickets criados/reabertos por esse import vão receber —
  // "open" (Atendendo) mantém o comportamento de sempre; "pending"
  // (Aguardando) e "closed" (Resolvidos) são as opções novas pedidas.
  const [historyImportStatus, setHistoryImportStatus] = useState("open");
  // Fila a atribuir aos tickets criados/reabertos por esse import — "" =
  // sem fila (comportamento de antes dessa opção existir).
  const [historyImportQueueId, setHistoryImportQueueId] = useState("");
  const [importQueues, setImportQueues] = useState([]);
  const [planConfig, setPlanConfig] = useState(false);
  const [transferModalOpen, setTransferModalOpen] = useState(false);
  const [sourceConnection, setSourceConnection] = useState("");
  const [targetConnection, setTargetConnection] = useState("");
  const [preDeleteModalOpen, setPreDeleteModalOpen] = useState(false);
  const [whatsAppToDelete, setWhatsAppToDelete] = useState(null);
  const [transferProgressModalOpen, setTransferProgressModalOpen] = useState(false);
  const [transferProgress, setTransferProgress] = useState({ current: 0, total: 0, percentage: 0 });
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [importLoading, setImportLoading] = useState(false);
  const [importProgress, setImportProgress] = useState(null);
  const [importLogs, setImportLogs] = useState([]);
  const [nativeImportProgress, setNativeImportProgress] = useState(null);
  const [importForm, setImportForm] = useState({
    whatsappId: "",
    startDate: "",
    endDate: "",
    messageType: "all",
    ticketStatus: "open",
    queueId: "",
  });
  const { user, socket } = useContext(AuthContext);

  const companyId = user.companyId;

  const { getPlanCompany } = usePlans();
  const { getAll: getAllSettings, get: getSetting, getPublicSetting } = useSettings();
  const [supportNumber, setSupportNumber] = useState(process.env.REACT_APP_NUMBER_SUPPORT || "");
  const [metaAppId, setMetaAppId] = useState(process.env.REACT_APP_FACEBOOK_APP_ID || "");
  const [searchParam, setSearchParam] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");

  useEffect(() => {
    async function fetchData() {
      const planConfigs = await getPlanCompany(undefined, companyId);
      setPlanConfig(planConfigs);

      // Buscar número de suporte das configurações
      const settings = await getAllSettings();
      let resolvedAppId = "";
      if (Array.isArray(settings)) {
        const supportSetting = settings.find((s) => s.key === "supportNumber");
        if (supportSetting?.value) {
          setSupportNumber(supportSetting.value);
        }
        // Fallback: usa metaAppId salvo nas configurações Meta quando a env var não estiver definida
        const metaAppIdSetting = settings.find((s) => s.key === "metaAppId");
        if (metaAppIdSetting?.value) {
          resolvedAppId = metaAppIdSetting.value;
          setMetaAppId(metaAppIdSetting.value);
        }
      }

      // Fallback final via endpoint público (caso o usuário não veja a setting privada)
      if (!resolvedAppId) {
        try {
          const publicAppId = await getPublicSetting("metaAppId");
          if (publicAppId) setMetaAppId(publicAppId);
        } catch (e) {
          console.warn("[Connections] não foi possível obter metaAppId público", e?.message);
        }
      }

      // Filas pra oferecer no seletor de import de mensagens (opção "coloca
      // os tickets numa fila" no prompt de período e no modal completo).
      try {
        const { data: queuesData } = await api.get("/queue");
        setImportQueues(Array.isArray(queuesData) ? queuesData : []);
      } catch (e) {
        console.warn("[Connections] não foi possível carregar filas para o import", e?.message);
      }
    }
    fetchData();
  }, []);

  const responseFacebook = (response) => {
    if (response.status !== "unknown") {
      const { accessToken, id } = response;

      api
        .post("/facebook", {
          facebookUserId: id,
          facebookUserToken: accessToken,
        })
        .then((response) => {
          toast.success(i18n.t("connections.facebook.success"));
        })
        .catch((error) => {
          toastError(error);
        });
    }
  };

  const responseInstagram = (response) => {
    if (response.status !== "unknown") {
      const { accessToken, id } = response;

      api
        .post("/facebook", {
          addInstagram: true,
          facebookUserId: id,
          facebookUserToken: accessToken,
        })
        .then((response) => {
          toast.success(i18n.t("connections.facebook.success"));
        })
        .catch((error) => {
          toastError(error);
        });
    }
  };

  useEffect(() => {
  }, [whatsApps]);

  const handleStartWhatsAppSession = async (whatsAppId, openQrModal = false) => {
    try {
      await api.post(`/whatsappsession/${whatsAppId}`);

      // Sem o modal, "Tentar novamente" nao dava retorno nenhum na tela: a
      // reconexao acontece no servidor e leva alguns segundos ate o socket
      // avisar. Sem aviso, a impressao e de que o botao nao funciona.
      if (!openQrModal) {
        toast.info(
          i18n.t(
            "connections.toasts.reconnecting",
            "Reconectando... aguarde alguns segundos."
          )
        );
      }

      if (openQrModal) {
        const whatsApp = whatsApps.find(w => w.id === whatsAppId);
        if (whatsApp) {
          setSelectedWhatsApp(whatsApp);
          setQrModalOpen(true);
        }
      }
    } catch (err) {
      toastError(err);
    }
  };

  const handleRequestNewQrCode = async (whatsAppId) => {
    try {
      await api.put(`/whatsappsession/${whatsAppId}`);

      // ABRIR O MODAL — era isso que faltava.
      //
      // O backend gera o QR normalmente, mas este handler so fazia o PUT e
      // parava por aqui. Quem clicava em "Novo QR CODE" nao via nada
      // acontecer, porque o QR fica DENTRO do modal e ninguem o abria. O
      // "Ler QR Code" funcionava so porque chama
      // handleStartWhatsAppSession(id, true), e esse `true` abre o modal.
      const whatsApp = whatsApps.find((w) => w.id === whatsAppId);
      if (whatsApp) {
        setSelectedWhatsApp(whatsApp);
        setQrModalOpen(true);
      }
    } catch (err) {
      toastError(err);
    }
  };

  // Importar mensagens antigas do WhatsApp Plus (wacalls-chat). Dispara o
  // history sync sob demanda no microserviço, que vai puxando as conversas
  // aos poucos e alimentando o mesmo pipeline de mensagem ao vivo (mesma
  // lógica do import do Baileys: cria/atualiza contato, ticket e mensagens).
  // É assíncrono no backend — aqui só confirmamos que o pedido foi aceito.
  // startDate/endDate opcionais (formato "yyyy-mm-dd", vem do prompt de
  // período). O microserviço (wacalls-chat) não pede histórico "de tal
  // período" ao WhatsApp — pede o lote recente e filtra pelas datas do lado
  // de cá (ver historyimport.go) — por isso em branco = sem filtro, não erro.
  const handleImportWacallsHistory = async (whatsAppId, startDate, endDate, ticketStatus, queueId) => {
    if (importingHistoryIds.includes(whatsAppId)) return;
    setImportingHistoryIds(prev => [...prev, whatsAppId]);
    try {
      await api.post(`/wacalls/chat-session/${whatsAppId}/import-history`, {
        startDate: startDate || undefined,
        endDate: endDate || undefined,
        ticketStatus: ticketStatus || undefined,
        queueId: queueId || undefined,
      });
      // Não limpa importingHistoryIds nem mostra o toast de sucesso aqui —
      // esse POST só confirma que o pedido de histórico foi ENVIADO ao
      // WhatsApp (que responde de forma assíncrona, conversa por conversa).
      // O percentual no botão, o toast final e a liberação do card chegam
      // pelo mesmo socket company-{companyId}-importMessages que o import
      // do Baileys já usa (ver useEffect "handleProgress" acima e
      // Broker.emitImportProgress no wacalls-chat).
    } catch (err) {
      toastError(err);
      setImportingHistoryIds(prev => prev.filter(id => id !== whatsAppId));
    }
  };

  // Importar mensagens antigas do WhatsApp (Baileys) — reaproveita o
  // endpoint /whatsapp/import-messages já existente (lê o histórico já
  // sincronizado localmente pelo Baileys via ImportMessagesService). Datas
  // em branco (usuário não escolheu período no prompt) caem no mesmo
  // intervalo bem amplo de antes (2015 até hoje), pra não mudar o
  // comportamento de quem só quer clicar e importar tudo.
  const handleImportBaileysHistory = async (whatsAppId, startDate, endDate, ticketStatus, queueId) => {
    if (importingHistoryIds.includes(whatsAppId)) return;
    setImportingHistoryIds(prev => [...prev, whatsAppId]);
    try {
      await api.post("/whatsapp/import-messages", {
        whatsappId: whatsAppId,
        startDate: startDate || "2015-01-01",
        endDate: endDate || new Date().toISOString().slice(0, 10),
        messageType: "all",
        ticketStatus: ticketStatus || "open",
        queueId: queueId || undefined,
      });
      // Não limpa importingHistoryIds aqui nem mostra o toast de sucesso —
      // o backend agora só confirma que o import COMEÇOU (roda em segundo
      // plano, pode levar minutos pra centenas de chats). O progresso, o
      // percentual no botão, o toast final e a liberação do card chegam
      // pelo socket company-{companyId}-importMessages (ver useEffect
      // "handleProgress" acima). Antes esse await esperava a importação
      // INTEIRA terminar, o que estourava o timeout do axios/proxy no meio
      // do processo — aparecia como um erro vermelho na tela mesmo com o
      // import continuando normalmente no backend logo depois.
    } catch (err) {
      toastError(err);
      setImportingHistoryIds(prev => prev.filter(id => id !== whatsAppId));
    }
  };

  // Abre o prompt de período pro card de UMA conexão específica (chamado
  // pelos dois botões "Importar mensagens anteriores", WhatsApp Plus e
  // Baileys). channel decide qual handler o confirm vai chamar.
  const handleOpenHistoryImportPrompt = (whatsAppId, channel) => {
    setHistoryImportDates({ startDate: "", endDate: "" });
    setHistoryImportStatus("open");
    setHistoryImportQueueId("");
    setHistoryImportPrompt({ whatsAppId, channel });
  };

  const handleCloseHistoryImportPrompt = () => {
    setHistoryImportPrompt(null);
  };

  const handleConfirmHistoryImportPrompt = () => {
    if (!historyImportPrompt) return;
    const { whatsAppId, channel } = historyImportPrompt;
    const { startDate, endDate } = historyImportDates;
    const ticketStatus = historyImportStatus;
    const queueId = historyImportQueueId;
    setHistoryImportPrompt(null);
    if (channel === "wacalls") {
      handleImportWacallsHistory(whatsAppId, startDate, endDate, ticketStatus, queueId);
    } else {
      handleImportBaileysHistory(whatsAppId, startDate, endDate, ticketStatus, queueId);
    }
  };

  const handleOpenWhatsAppModal = (channel) => {
    setChannel(channel)
    setSelectedWhatsApp(null);
    setWhatsAppModalOpen(true);
  };

  const handleCloseWhatsAppModal = useCallback(() => {
    setWhatsAppModalOpen(false);
    setSelectedWhatsApp(null);
    if (refetch) {
      refetch();
    }
  }, [setSelectedWhatsApp, setWhatsAppModalOpen, refetch]);

  const handleOpenQualityModal = (whatsApp) => {
    setQualityWhatsApp(whatsApp);
    setQualityModalOpen(true);
  };

  const handleOpenQrModal = async (whatsApp) => {
    setSelectedWhatsApp(whatsApp);
    setQrModalOpen(true);
  };

  const handleCloseQrModal = useCallback(() => {
    setSelectedWhatsApp(null);
    setQrModalOpen(false);
  }, [setQrModalOpen, setSelectedWhatsApp]);

  const handleOpenPairingCodeModal = (whatsApp) => {
    setSelectedWhatsApp(whatsApp);
    setPairingCodeModalOpen(true);
  };

  const handleClosePairingCodeModal = useCallback(() => {
    setSelectedWhatsApp(null);
    setPairingCodeModalOpen(false);
  }, []);

  const handleEditWhatsApp = (whatsApp) => {
    setChannel(whatsApp.channel)
    setSelectedWhatsApp(whatsApp);
    setWhatsAppModalOpen(true);
  };

  const handleSyncTemplates = async (whatsAppId) => {
    await api.get(`/whatsapp/sync-templates/${whatsAppId}`);
  };

  const handleToggleReceiveComments = async (whatsApp) => {
    try {
      const newValue = !whatsApp.receiveComments;
      await api.put(`/whatsapp/${whatsApp.id}`, {
        receiveComments: newValue
      });
      toast.success(
        newValue 
          ? i18n.t("connections.receiveComments.enabled") 
          : i18n.t("connections.receiveComments.disabled")
      );
    } catch (err) {
      toastError(err);
    }
  };

  const handleToggleActive = async (whatsApp) => {
    const newValue = !(whatsApp.isActive !== false);
    try {
      await api.put(`/whatsapp/${whatsApp.id}`, { isActive: newValue });
      if (!newValue) {
        // Desativando: desconectar sessão se aplicável
        try {
          await api.delete(`/whatsappsession/${whatsApp.id}`);
        } catch (e) { /* ignore */ }
      } else {
        // Ativando: iniciar sessão para canais baileys
        if (whatsApp.channel === "whatsapp") {
          try {
            await api.post(`/whatsappsession/${whatsApp.id}`);
          } catch (e) { /* ignore */ }
        }
      }
      toast.success(newValue
        ? i18n.t("connections.toasts.activated") || "Conexão ativada"
        : i18n.t("connections.toasts.deactivated") || "Conexão desativada");
    } catch (err) {
      toastError(err);
    }
  };

  const handleCopyShareLink = (link) => {
    if (!link) return;

    // navigator.clipboard so existe em contexto seguro (https ou localhost).
    // Em instalacao acessada por IP puro ele e undefined, e sem o fallback o
    // botao simplesmente nao faria nada.
    if (navigator.clipboard?.writeText) {
      navigator.clipboard.writeText(link);
    } else {
      const campo = document.createElement("textarea");
      campo.value = link;
      campo.style.position = "fixed";
      campo.style.opacity = "0";
      document.body.appendChild(campo);
      campo.select();
      document.execCommand("copy");
      document.body.removeChild(campo);
    }

    toast.success(i18n.t("connections.linkCopied"));
  };

  const handleCopyWebhook = (url) => {
    // Sem isso, uma conexão ainda "CONECTANDO" (que ainda não terminou de
    // inscrever o webhook na Meta e por isso não tem waba_webhook salvo)
    // copiava literalmente o texto "null" pra área de transferência sem
    // avisar nada — o usuário só via "null" colado onde quer que fosse.
    if (!url) {
      toast.error(
        i18n.t(
          "connections.toasts.webhookNotReady",
          "Webhook ainda não disponível — aguarde a conexão terminar de configurar (ou use a tela de Webhook Unificado)."
        )
      );
      return;
    }
    navigator.clipboard.writeText(url);
    toast.success(i18n.t("connections.toasts.webhookCopied", "Webhook copiado!"));
  };

  const openInNewTab = url => {
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const handleOpenConfirmationModal = (action, whatsAppId) => {
    if (action === "disconnect") {
      setConfirmModalInfo({
        action: action,
        title: i18n.t("connections.confirmationModal.disconnectTitle"),
        message: i18n.t("connections.confirmationModal.disconnectMessage"),
        whatsAppId: whatsAppId,
      });
    }

    if (action === "delete") {
      setConfirmModalInfo({
        action: action,
        title: i18n.t("connections.confirmationModal.deleteTitle"),
        message: i18n.t("connections.confirmationModal.deleteMessage"),
        whatsAppId: whatsAppId,
      });
    }

    setConfirmModalOpen(true);
  };

  const handleSubmitConfirmationModal = async () => {
    if (confirmModalInfo.action === "disconnect") {
      const targetId = confirmModalInfo.whatsAppId;
      // Atualização otimista: marcar como desconectado imediatamente
      setDisconnectingIds(prev => [...prev, targetId]);
      try {
        await api.delete(`/whatsappsession/${targetId}`);
      } catch (err) {
        toastError(err);
      }
      // Remover da lista após socket atualizar (ou timeout)
      setTimeout(() => {
        setDisconnectingIds(prev => prev.filter(id => id !== targetId));
      }, 5000);
    }

    if (confirmModalInfo.action === "delete") {
      try {
        await api.delete(`/whatsapp/${confirmModalInfo.whatsAppId}`);
        toast.success(i18n.t("connections.toasts.deleted"));
      } catch (err) {
        toastError(err);
      }
    }

    setConfirmModalInfo(confirmationModalInitialState);
  };

  // Desconecta automaticamente uma conexão assim que o import de mensagens
  // anteriores (botão do card, qualquer canal) termina — pedido explícito:
  // a conexão só ficou ativa pra puxar o histórico, não deve continuar
  // conectada depois disso. Mesma chamada que o modal de confirmação de
  // "Desconectar" usa (handleSubmitConfirmationModal), só que sem esperar
  // clique nenhum.
  const handleAutoDisconnectAfterImport = async (whatsAppId) => {
    setDisconnectingIds(prev => (prev.includes(whatsAppId) ? prev : [...prev, whatsAppId]));
    try {
      await api.delete(`/whatsappsession/${whatsAppId}`);
    } catch (err) {
      toastError(err);
    }
    setTimeout(() => {
      setDisconnectingIds(prev => prev.filter(id => id !== whatsAppId));
    }, 5000);
  };

  const renderActionButtons = (whatsApp) => {
    // Override otimista: se está na lista de desconectando, forçar status DISCONNECTED
    const effectiveWhatsApp = disconnectingIds.includes(whatsApp.id)
      ? { ...whatsApp, status: "DISCONNECTED" }
      : whatsApp;
    const wp = effectiveWhatsApp;
    const supportsQrSession = wp.channel === "whatsapp" || wp.channel === "wacalls";
    const status = (wp.status || "").toString();
    const normalizedStatus = status.toLowerCase();
    const hasQrCode = !!wp.qrcode;
    const canOpenQr = supportsQrSession && (
      normalizedStatus === "qrcode" ||
      (wp.channel === "wacalls" && hasQrCode)
    );
    const canStartQr = supportsQrSession && (
      normalizedStatus === "disconnected" ||
      normalizedStatus === "pending" ||
      (wp.channel === "wacalls" && !normalizedStatus)
    );
    return (
      <Box className={classes.actionButtonsRow}>
        <Tooltip title={i18n.t("connections.buttons.quality", "Verificar qualidade do número")}>
          <Button
            size="small"
            variant="outlined"
            className={classes.actionButton}
            onClick={() => handleOpenQualityModal(whatsApp)}
          >
            {i18n.t("connections.buttons.quality", "Qualidade")}
          </Button>
        </Tooltip>
        {canOpenQr && (
          <Can
            role={user.allowConnections === "enabled" || user.super ? "admin" : "user"}
            perform="connections-page:addConnection"
            yes={() => (
              <Button
                size="small"
                variant="outlined"
                className={classes.actionButtonFilled}
                onClick={() => handleOpenQrModal(whatsApp)}
              >
                {i18n.t("connections.buttons.qrcode")}
              </Button>
            )}
          />
        )}
        {canStartQr && (
          <Can
            role={user.allowConnections === "enabled" || user.super ? "admin" : "user"}
            perform="connections-page:addConnection"
            yes={() => (
              <>
                {whatsApp.zapiInstanceId || wp.channel === "wacalls" ? (
                  <Button
                    size="small"
                    variant="outlined"
                    className={classes.actionButtonFilled}
                    onClick={() => handleStartWhatsAppSession(whatsApp.id, true)}
                  >
                    {i18n.t("connections.buttons.qrcode")}
                  </Button>
                ) : (
                  <>
                    <Button
                      size="small"
                      variant="outlined"
                      className={classes.actionButton}
                      onClick={() => handleStartWhatsAppSession(whatsApp.id)}
                    >
                      {i18n.t("connections.buttons.tryAgain")}
                    </Button>
                    <Button
                      size="small"
                      variant="outlined"
                      className={classes.actionButtonFilled}
                      onClick={() => handleRequestNewQrCode(whatsApp.id)}
                    >
                      {i18n.t("connections.buttons.newQr")}
                    </Button>
                  </>
                )}
              </>
            )}
          />
        )}
        {(supportsQrSession && (normalizedStatus === "connected" ||
          normalizedStatus === "pairing" ||
          normalizedStatus === "timeout")) && (
            <Can
              role={user.allowConnections === "enabled" || user.super ? "admin" : "user"}
              perform="connections-page:addConnection"
              yes={() => (
                <Button
                  size="small"
                  variant="outlined"
                  className={classes.disconnectButton}
                  onClick={() => {
                    handleOpenConfirmationModal("disconnect", whatsApp.id);
                  }}
                >
                  {i18n.t("connections.buttons.disconnect")}
                </Button>
              )}
            />
          )}
        {(supportsQrSession && normalizedStatus === "opening") && (
          <Button size="small" variant="outlined" disabled className={classes.actionButton}>
            {i18n.t("connections.buttons.connecting")}
          </Button>
        )}
        {/* TELEGRAM */}
        {wp.channel === "telegram" && (wp.status === "DISCONNECTED" || wp.status === "PENDING" || !wp.status) && (
          <Can
            role={user.allowConnections === "enabled" || user.super ? "admin" : "user"}
            perform="connections-page:addConnection"
            yes={() => (
              <Button
                size="small"
                variant="outlined"
                className={classes.actionButtonFilled}
                onClick={() => handleStartWhatsAppSession(whatsApp.id)}
              >
                {i18n.t("telegram.connectBot")}
              </Button>
            )}
          />
        )}
        {wp.channel === "telegram" && wp.status === "CONNECTED" && (
          <Can
            role={user.allowConnections === "enabled" || user.super ? "admin" : "user"}
            perform="connections-page:addConnection"
            yes={() => (
              <Button
                size="small"
                variant="outlined"
                className={classes.disconnectButton}
                onClick={() => {
                  handleOpenConfirmationModal("disconnect", whatsApp.id);
                }}
              >
                {i18n.t("connections.buttons.disconnect")}
              </Button>
            )}
          />
        )}
      </Box>
    );
  };

  const renderStatusToolTips = (whatsApp) => {
    const effectiveStatus = disconnectingIds.includes(whatsApp.id) ? "DISCONNECTED" : whatsApp.status;
    return (
      <div className={classes.customTableCell}>
        {(effectiveStatus === "DISCONNECTED" || effectiveStatus === "PENDING") && (
          <CustomToolTip
            title={i18n.t("connections.toolTips.disconnected.title")}
            content={i18n.t("connections.toolTips.disconnected.content")}
          >
            <SignalCellularConnectedNoInternet0Bar color="secondary" />
          </CustomToolTip>
        )}
        {effectiveStatus === "OPENING" && (
          <CircularProgress size={24} className={classes.buttonProgress} />
        )}
        {effectiveStatus === "qrcode" && (
          <CustomToolTip
            title={i18n.t("connections.toolTips.qrcode.title")}
            content={i18n.t("connections.toolTips.qrcode.content")}
          >
            <CropFree />
          </CustomToolTip>
        )}
        {effectiveStatus === "CONNECTED" && (
          <CustomToolTip title={i18n.t("connections.toolTips.connected.title")}>
            <SignalCellular4Bar style={{ color: green[500] }} />
          </CustomToolTip>
        )}
        {(effectiveStatus === "TIMEOUT" || effectiveStatus === "PAIRING") && (
          <CustomToolTip
            title={i18n.t("connections.toolTips.timeout.title")}
            content={i18n.t("connections.toolTips.timeout.content")}
          >
            <SignalCellularConnectedNoInternet2Bar color="secondary" />
          </CustomToolTip>
        )}
      </div>
    );
  };

  const restartWhatsapps = async () => {
    try {
      await api.post(`/whatsapp-restart/`);
      toast.success(i18n.t("connections.waitConnection"));
    } catch (err) {
      toastError(err);
    }
  }

  const handleOpenTransferModal = () => {
    setTransferModalOpen(true);
  };

  const handleCloseTransferModal = () => {
    setTransferModalOpen(false);
    setSourceConnection("");
    setTargetConnection("");
  };

  const handleCloseTransferProgressModal = () => {
    setTransferProgressModalOpen(false);
    setTransferProgress({ current: 0, total: 0, percentage: 0 });
  };

  const handleTransferTickets = async () => {
    if (!sourceConnection || !targetConnection) {
      toast.error(i18n.t("connections.transfer.selectConnections"));
      return;
    }

    if (sourceConnection === targetConnection) {
      toast.error(i18n.t("connections.transfer.differentConnections"));
      return;
    }

    try {
      const response = await api.post(`/transfer-tickets`, {
        sourceConnectionId: sourceConnection,
        targetConnectionId: targetConnection
      });

      if (response.data.requiresProgress) {
        setTransferModalOpen(false);
        setTransferProgressModalOpen(true);
        setTransferProgress({ current: 0, total: response.data.totalTickets, percentage: 0 });
      } else {
        toast.success(i18n.t("connections.transfer.success", { count: response.data.transferred || 0 }));
        handleCloseTransferModal();
      }
    } catch (err) {
      toastError(err);
    }
  };

  const handleOpenPreDeleteModal = (whatsAppId) => {
    setWhatsAppToDelete(whatsAppId);
    setPreDeleteModalOpen(true);
  };

  const handleClosePreDeleteModal = () => {
    setPreDeleteModalOpen(false);
    setWhatsAppToDelete(null);
  };

  const handleConfirmTransferDone = () => {
    setPreDeleteModalOpen(false);
    handleOpenConfirmationModal("delete", whatsAppToDelete);
    setWhatsAppToDelete(null);
  };

  const connectedConnections = whatsApps?.filter(w => w.status === "CONNECTED" && w.channel === "whatsapp") || [];

  const filteredWhatsApps = (whatsApps || []).filter((w) => {
    const term = (searchParam || "").trim().toLowerCase();
    if (term) {
      const name = (w.name || "").toLowerCase();
      const id = String(w.id || "");
      const number = (w.number || "").toLowerCase();
      if (!name.includes(term) && !id.includes(term) && !number.includes(term)) {
        return false;
      }
    }
    if (statusFilter !== "all") {
      const s = w.status || "";
      if (statusFilter === "CONNECTED" && s !== "CONNECTED") return false;
      if (statusFilter === "DISCONNECTED" && !(s === "DISCONNECTED" || s === "" || s === null)) return false;
      if (statusFilter === "OPENING" && s !== "OPENING") return false;
      if (statusFilter === "qrcode" && s !== "qrcode") return false;
      if (statusFilter === "PAIRING" && s !== "PAIRING") return false;
    }
    return true;
  });

  const handleOpenImportModal = () => {
    if (connectedConnections.length === 0) {
      toast.error(i18n.t("connections.importMessages.noConnections"));
      return;
    }
    setImportForm({
      whatsappId: connectedConnections[0]?.id || "",
      startDate: "",
      endDate: "",
      messageType: "all",
      ticketStatus: "open",
      queueId: "",
    });
    setImportModalOpen(true);
  };

  const handleCloseImportModal = () => {
    setImportModalOpen(false);
    setImportLoading(false);
    setImportProgress(null);
    setImportLogs([]);
  };

  // Socket listener for import progress (API-based import)
  useEffect(() => {
    if (!socket || !companyId) return;
    const eventName = `company-${companyId}-importMessages`;
    const handleProgress = (data) => {
      if (data.action === "progress") {
        setImportProgress(data);
        if (data.stage === "cancelled") {
          setImportLoading(false);
        }
        setImportLogs(prev => {
          const newLog = `[${new Date().toLocaleTimeString()}] ${data.detail}`;
          const updated = [...prev, newLog];
          return updated.slice(-50);
        });

        // Import disparado pelo botão "Importar mensagens anteriores" de um
        // card específico (não pelo modal de período) — o card fica preso
        // em "Importando mensagens..." até chegar aqui via socket, já que o
        // POST que o disparou agora só confirma o início (ver
        // handleImportBaileysHistory) em vez de esperar tudo terminar.
        if (data.whatsappId && importingHistoryIdsRef.current.includes(data.whatsappId)) {
          if (data.stage === "done" || data.stage === "cancelled" || data.stage === "error") {
            setImportingHistoryIds(prev => prev.filter(id => id !== data.whatsappId));
            setCardImportProgress(prev => {
              const next = { ...prev };
              delete next[data.whatsappId];
              return next;
            });
            if (data.stage === "done") {
              toast.success(
                i18n.t("connections.importMessages.success", {
                  messages: data.totalMessages || 0,
                  tickets: data.totalTickets || 0,
                  contacts: data.totalContacts || 0,
                })
              );
              toast.info(i18n.t("hardcoded.importReadyToDisconnect"), { autoClose: 8000 });
              // Pedido explícito: a conexão só foi usada pra puxar o
              // histórico, então desconecta sozinha assim que o import
              // termina — sem precisar do usuário clicar em "Desconectar".
              handleAutoDisconnectAfterImport(data.whatsappId);
            } else if (data.stage === "error") {
              toast.error(data.detail || i18n.t("hardcoded.importErrorGeneric"));
            }
          } else {
            setCardImportProgress(prev => ({ ...prev, [data.whatsappId]: data }));
          }
        }
      }
    };
    socket.on(eventName, handleProgress);
    return () => socket.off(eventName, handleProgress);
  }, [socket, companyId]);

  // Socket listener for native Baileys import progress
  useEffect(() => {
    if (!socket || !companyId) return;
    const eventName = `importMessages-${companyId}`;
    const handleNativeProgress = (data) => {
      if (data.action === "update" && data.status) {
        const { status } = data;
        if (status.this === -1 && status.all === -1) {
          // Import finished (pre-processing done)
          setNativeImportProgress(prev => prev ? { ...prev, stage: "finishing" } : null);
        } else if (status.cancelled) {
          setNativeImportProgress(prev => ({
            ...prev,
            stage: "cancelled",
            current: status.this,
            total: status.all,
            errors: status.errors || 0,
          }));
        } else {
          const percentage = status.all > 0 ? Math.round((status.this / status.all) * 100) : 0;
          setNativeImportProgress({
            stage: "importing",
            current: status.this,
            total: status.all,
            percentage,
            date: status.date,
            errors: status.errors || 0,
          });
        }
      } else if (data.action === "refresh") {
        setNativeImportProgress(null);
      }
    };
    socket.on(eventName, handleNativeProgress);
    return () => socket.off(eventName, handleNativeProgress);
  }, [socket, companyId]);

  const handleImportMessages = async () => {
    if (!importForm.whatsappId || !importForm.startDate || !importForm.endDate) {
      toast.error(i18n.t("connections.importMessages.errorMissingFields"));
      return;
    }
    setImportLoading(true);
    setImportProgress(null);
    setImportLogs([]);
    try {
      await api.post("/whatsapp/import-messages", importForm);
      // O backend só confirma que o import começou — ele roda em segundo
      // plano e pode levar minutos. O progresso ao vivo, os totais finais e
      // o botão "Fechar" (que só aparece quando stage é "done"/"cancelled",
      // logo abaixo no JSX) já são tratados pelo useEffect "handleProgress"
      // via socket, então não fechamos o modal aqui nem mostramos um toast
      // de sucesso prematuro — antes esse await esperava a importação
      // INTEIRA terminar antes de responder, o que podia estourar o
      // timeout do axios/proxy no meio do processo.
    } catch (err) {
      toastError(err);
      setImportLoading(false);
    }
  };

  const handleCancelImport = async () => {
    try {
      await api.post("/whatsapp/import-messages/cancel");
      toast.info(i18n.t("hardcoded.cancelRequested"));
    } catch (err) {
      toastError(err);
    }
  };

  return (
    <MainContainer>
      <ConfirmationModal
        title={confirmModalInfo.title}
        open={confirmModalOpen}
        onClose={setConfirmModalOpen}
        onConfirm={handleSubmitConfirmationModal}
      >
        {confirmModalInfo.message}
      </ConfirmationModal>
      {qrModalOpen && (
        <QrcodeModal
          open={qrModalOpen}
          onClose={handleCloseQrModal}
          whatsAppId={!whatsAppModalOpen && selectedWhatsApp?.id}
        />
      )}
      {qualityModalOpen && (
        <WhatsAppQualityModal
          open={qualityModalOpen}
          onClose={() => setQualityModalOpen(false)}
          whatsAppId={qualityWhatsApp?.id}
          whatsAppName={qualityWhatsApp?.name}
        />
      )}
      {pairingCodeModalOpen && (
        <PairingCodeModal
          open={pairingCodeModalOpen}
          onClose={handleClosePairingCodeModal}
          whatsAppId={selectedWhatsApp?.id}
        />
      )}
      <WhatsAppModal
        open={whatsAppModalOpen}
        onClose={handleCloseWhatsAppModal}
        whatsAppId={!qrModalOpen && selectedWhatsApp?.id}
        channel={channel}
        onOpenQr={(whatsApp) => {
          setWhatsAppModalOpen(false);
          setSelectedWhatsApp(whatsApp);
          setQrModalOpen(true);
          if (refetch) refetch();
        }}
      />
      <EmbeddedSignupModal
        open={embeddedSignupModalOpen}
        onClose={() => {
          setEmbeddedSignupModalOpen(false);
          if (refetch) refetch();
        }}
      />
      <Dialog
        open={transferModalOpen}
        onClose={handleCloseTransferModal}
        maxWidth="sm"
        fullWidth
        className={classes.modernDialog}
      >
        <DialogTitle className={classes.modernDialogTitle}>{i18n.t("connections.transfer.title")}</DialogTitle>
        <DialogContent className={classes.modernDialogContent}>
          <Typography variant="body2" style={{ marginBottom: 24, lineHeight: 1.7, color: "inherit", opacity: 0.8 }}>
            {i18n.t("connections.transfer.description")}
          </Typography>
          
          <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 8 }}>
            <FormControl fullWidth variant="outlined" size="small">
              <InputLabel>{i18n.t("connections.transfer.source")}</InputLabel>
              <Select
                value={sourceConnection}
                onChange={(e) => setSourceConnection(e.target.value)}
                label={i18n.t("connections.transfer.source")}
                style={{ borderRadius: 10 }}
              >
                {whatsApps.map((whatsApp) => (
                  <MuiMenuItem key={whatsApp.id} value={whatsApp.id}>
                    {whatsApp.name}
                  </MuiMenuItem>
                ))}
              </Select>
            </FormControl>

            <div style={{ fontSize: 20, color: '#25d366', fontWeight: 'bold', flexShrink: 0 }}>
              →
            </div>

            <FormControl fullWidth variant="outlined" size="small">
              <InputLabel>{i18n.t("connections.transfer.target")}</InputLabel>
              <Select
                value={targetConnection}
                onChange={(e) => setTargetConnection(e.target.value)}
                label={i18n.t("connections.transfer.target")}
                style={{ borderRadius: 10 }}
              >
                {whatsApps.map((whatsApp) => (
                  <MuiMenuItem key={whatsApp.id} value={whatsApp.id}>
                    {whatsApp.name}
                  </MuiMenuItem>
                ))}
              </Select>
            </FormControl>
          </div>
        </DialogContent>
        <DialogActions className={classes.modernDialogActions}>
          <Button onClick={handleCloseTransferModal} className={classes.modernCancelButton}>
            {i18n.t("connections.transfer.cancel")}
          </Button>
          <Button onClick={handleTransferTickets} className={classes.modernConfirmButton}>
            {i18n.t("connections.transfer.transfer")}
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={transferProgressModalOpen}
        onClose={handleCloseTransferProgressModal}
        maxWidth="sm"
        fullWidth
        className={classes.modernDialog}
        disableBackdropClick
        disableEscapeKeyDown
      >
        <DialogTitle className={classes.modernDialogTitle}>{i18n.t("connections.transfer.transferring")}</DialogTitle>
        <DialogContent className={classes.modernDialogContent}>
          <div style={{ textAlign: 'center', padding: '24px 0' }}>
            <Box position="relative" display="inline-flex" marginBottom={3}>
              <CircularProgress 
                variant="determinate" 
                value={transferProgress.percentage} 
                size={90}
                thickness={3}
                style={{ color: '#25d366' }}
              />
              <Box
                top={0} left={0} bottom={0} right={0}
                position="absolute"
                display="flex"
                alignItems="center"
                justifyContent="center"
              >
                <Typography variant="h6" component="div" style={{ fontWeight: 800 }}>
                  {transferProgress.percentage}%
                </Typography>
              </Box>
            </Box>

            <Typography variant="body1" style={{ fontWeight: 600 }}>
              {transferProgress.current} {i18n.t("connections.transfer.of")} {transferProgress.total} tickets
            </Typography>
            
            <Typography variant="body2" color="textSecondary" style={{ marginTop: 8 }}>
              {i18n.t("connections.transfer.waitMessage")}
            </Typography>
          </div>
        </DialogContent>
      </Dialog>
      <Dialog
        open={!!historyImportPrompt}
        onClose={handleCloseHistoryImportPrompt}
        maxWidth="sm"
        fullWidth
        className={classes.modernDialog}
      >
        <DialogTitle className={classes.modernDialogTitle}>
          {i18n.t("connections.buttons.importHistoryPeriodTitle")}
        </DialogTitle>
        <DialogContent className={classes.modernDialogContent}>
          <Typography variant="body2" color="textSecondary" style={{ marginBottom: 16 }}>
            {i18n.t("connections.buttons.importHistoryPeriodHint")}
          </Typography>
          <TextField
            fullWidth
            type="date"
            label={i18n.t("connections.importMessages.startDate")}
            value={historyImportDates.startDate}
            onChange={(e) => setHistoryImportDates(prev => ({ ...prev, startDate: e.target.value }))}
            InputLabelProps={{ shrink: true }}
            variant="outlined"
            size="small"
            style={{ marginBottom: 16 }}
          />
          <TextField
            fullWidth
            type="date"
            label={i18n.t("connections.importMessages.endDate")}
            value={historyImportDates.endDate}
            onChange={(e) => setHistoryImportDates(prev => ({ ...prev, endDate: e.target.value }))}
            InputLabelProps={{ shrink: true }}
            variant="outlined"
            size="small"
            style={{ marginBottom: 16 }}
          />
          <FormControl fullWidth variant="outlined" size="small" style={{ marginBottom: 16 }}>
            <InputLabel>{i18n.t("connections.importMessages.ticketStatus")}</InputLabel>
            <Select
              value={historyImportStatus}
              onChange={(e) => setHistoryImportStatus(e.target.value)}
              label={i18n.t("connections.importMessages.ticketStatus")}
              style={{ borderRadius: 10 }}
            >
              <MuiMenuItem value="open">{i18n.t("connections.importMessages.open")}</MuiMenuItem>
              <MuiMenuItem value="pending">{i18n.t("connections.importMessages.pending")}</MuiMenuItem>
              <MuiMenuItem value="closed">{i18n.t("connections.importMessages.closed")}</MuiMenuItem>
            </Select>
          </FormControl>
          <FormControl fullWidth variant="outlined" size="small">
            <InputLabel>{i18n.t("connections.importMessages.queue")}</InputLabel>
            <Select
              value={historyImportQueueId}
              onChange={(e) => setHistoryImportQueueId(e.target.value)}
              label={i18n.t("connections.importMessages.queue")}
              style={{ borderRadius: 10 }}
            >
              <MuiMenuItem value=""><em>{i18n.t("connections.importMessages.noQueue")}</em></MuiMenuItem>
              {importQueues.map((q) => (
                <MuiMenuItem key={q.id} value={q.id}>{q.name}</MuiMenuItem>
              ))}
            </Select>
          </FormControl>
        </DialogContent>
        <DialogActions className={classes.modernDialogActions}>
          <Button onClick={handleCloseHistoryImportPrompt} className={classes.modernCancelButton}>
            {i18n.t("connections.importMessages.cancel")}
          </Button>
          <Button onClick={handleConfirmHistoryImportPrompt} className={classes.modernConfirmButton}>
            {i18n.t("connections.buttons.importHistory")}
          </Button>
        </DialogActions>
      </Dialog>
      <Dialog
        open={preDeleteModalOpen}
        onClose={handleClosePreDeleteModal}
        maxWidth="sm"
        fullWidth
        className={classes.modernDialog}
      >
        <DialogTitle className={classes.modernDialogTitle}>{i18n.t("connections.preDelete.title")}</DialogTitle>
        <DialogContent className={classes.modernDialogContent}>
          <Typography variant="body2" style={{ lineHeight: 1.7 }}>
            {i18n.t("connections.preDelete.message")}
          </Typography>
        </DialogContent>
        <DialogActions className={classes.modernDialogActions}>
          <Button onClick={handleClosePreDeleteModal} className={classes.modernCancelButton}>
            {i18n.t("connections.preDelete.notYet")}
          </Button>
          <Button onClick={handleConfirmTransferDone} className={classes.modernConfirmButton}>
            {i18n.t("connections.preDelete.yesTransferred")}
          </Button>
        </DialogActions>
      </Dialog>
      {/* Import Messages Dialog */}
      <Dialog
        open={importModalOpen}
        onClose={handleCloseImportModal}
        maxWidth="sm"
        fullWidth
        className={classes.modernDialog}
      >
        <DialogTitle className={classes.modernDialogTitle}>
          <Box display="flex" alignItems="center" style={{ gap: 8 }}>
            <CloudDownload style={{ color: "#6366f1" }} />
            {i18n.t("connections.importMessages.title")}
          </Box>
        </DialogTitle>
        <DialogContent className={classes.modernDialogContent}>
          {importLoading ? (
            <Box py={2}>
              {/* Progress header */}
              <Box display="flex" alignItems="center" justifyContent="center" style={{ gap: 12, marginBottom: 16 }}>
                {importProgress?.stage === "done" ? (
                  <Box style={{ width: 40, height: 40, borderRadius: "50%", backgroundColor: "#10b981", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Typography style={{ color: "#fff", fontWeight: "bold", fontSize: 18 }}>✓</Typography>
                  </Box>
                ) : importProgress?.stage === "cancelled" ? (
                  <Box style={{ width: 40, height: 40, borderRadius: "50%", backgroundColor: "#f59e0b", display: "flex", alignItems: "center", justifyContent: "center" }}>
                    <Typography style={{ color: "#fff", fontWeight: "bold", fontSize: 18 }}>✕</Typography>
                  </Box>
                ) : (
                  <CircularProgress size={40} style={{ color: "#6366f1" }} />
                )}
                <div>
                  <Typography variant="subtitle1" style={{ fontWeight: 600 }}>
                    {importProgress?.stage === "done" && i18n.t("connections.importProgress.done")}
                    {importProgress?.stage === "cancelled" && i18n.t("connections.importProgress.cancelled")}
                    {importProgress?.stage !== "done" && importProgress?.stage !== "cancelled" && i18n.t("connections.importProgress.importing")}
                  </Typography>
                  <Typography variant="caption" color="textSecondary">
                    {importProgress?.stage === "starting" && i18n.t("connections.importProgress.starting")}
                    {importProgress?.stage === "scanning" && i18n.t("connections.importProgress.scanning")}
                    {importProgress?.stage === "importing" && i18n.t("connections.importProgress.processingChat", { current: importProgress.processedChats || 0, total: importProgress.totalChats || 0 })}
                    {importProgress?.stage === "done" && i18n.t("connections.importProgress.allProcessed")}
                    {importProgress?.stage === "cancelled" && i18n.t("connections.importProgress.cancelledAt", { current: importProgress.processedChats || 0, total: importProgress.totalChats || 0 })}
                    {!importProgress && i18n.t("connections.importProgress.initializing")}
                  </Typography>
                </div>
              </Box>

              {/* Progress bar */}
              {importProgress?.totalChats > 0 && (
                <Box style={{ marginBottom: 16 }}>
                  <Box display="flex" justifyContent="space-between" style={{ marginBottom: 4 }}>
                    <Typography variant="caption" color="textSecondary">{i18n.t("connections.importProgress.progress")}</Typography>
                    <Typography variant="caption" style={{ fontWeight: 600 }}>
                      {importProgress.processedChats || 0}/{importProgress.totalChats} {i18n.t("connections.importProgress.chats")}
                    </Typography>
                  </Box>
                  <Box style={{ width: "100%", height: 8, borderRadius: 6, backgroundColor: "#e5e7eb", overflow: "hidden" }}>
                    <Box style={{
                      width: `${Math.round(((importProgress.processedChats || 0) / importProgress.totalChats) * 100)}%`,
                      height: "100%",
                      borderRadius: 6,
                      backgroundColor: importProgress.stage === "done" ? "#10b981" : importProgress.stage === "cancelled" ? "#f59e0b" : "#6366f1",
                      transition: "width 0.3s ease",
                    }} />
                  </Box>
                </Box>
              )}

              {/* Stats cards */}
              {importProgress && (importProgress.totalMessages > 0 || importProgress.totalTickets > 0) && (
                <Box display="flex" style={{ gap: 10, marginBottom: 16 }}>
                  <Box style={{ flex: 1, backgroundColor: "#f0f4ff", borderRadius: 10, padding: "8px 12px", textAlign: "center" }}>
                    <Typography variant="h6" style={{ fontWeight: 700, color: "#6366f1" }}>{importProgress.totalMessages || 0}</Typography>
                    <Typography variant="caption" color="textSecondary">{i18n.t("connections.importProgress.messagesLabel")}</Typography>
                  </Box>
                  <Box style={{ flex: 1, backgroundColor: "#f0fdf4", borderRadius: 10, padding: "8px 12px", textAlign: "center" }}>
                    <Typography variant="h6" style={{ fontWeight: 700, color: "#10b981" }}>{importProgress.totalTickets || 0}</Typography>
                    <Typography variant="caption" color="textSecondary">{i18n.t("connections.importProgress.tickets")}</Typography>
                  </Box>
                  <Box style={{ flex: 1, backgroundColor: "#fef3c7", borderRadius: 10, padding: "8px 12px", textAlign: "center" }}>
                    <Typography variant="h6" style={{ fontWeight: 700, color: "#f59e0b" }}>{importProgress.totalContacts || 0}</Typography>
                    <Typography variant="caption" color="textSecondary">{i18n.t("connections.importProgress.contacts")}</Typography>
                  </Box>
                  {importProgress.errors > 0 && (
                    <Box style={{ flex: 1, backgroundColor: "#fef2f2", borderRadius: 10, padding: "8px 12px", textAlign: "center" }}>
                      <Typography variant="h6" style={{ fontWeight: 700, color: "#ef4444" }}>{importProgress.errors}</Typography>
                      <Typography variant="caption" color="textSecondary">{i18n.t("connections.importProgress.errorsLabel")}</Typography>
                    </Box>
                  )}
                </Box>
              )}

              {/* Live log */}
              {importLogs.length > 0 && (
                <Box style={{
                  maxHeight: 180,
                  overflowY: "auto",
                  backgroundColor: "#1e1e2e",
                  borderRadius: 10,
                  padding: "10px 12px",
                  fontFamily: "'Fira Code', 'Consolas', monospace",
                  fontSize: 12,
                }}>
                  {importLogs.map((log, idx) => (
                    <div key={idx} style={{
                      color: log.includes("Erro") || log.includes("Error") ? "#f87171" : log.includes("concluída") || log.includes("complete") ? "#34d399" : "#a5b4fc",
                      lineHeight: 1.6,
                      wordBreak: "break-all",
                    }}>
                      {log}
                    </div>
                  ))}
                </Box>
              )}

              {/* Cancel button during import */}
              {importProgress && importProgress.stage !== "done" && importProgress.stage !== "cancelled" && (
                <Box textAlign="center" style={{ marginTop: 16 }}>
                  <Button
                    onClick={handleCancelImport}
                    variant="outlined"
                    style={{ borderColor: "#ef4444", color: "#ef4444", borderRadius: 8 }}
                  >
                    {i18n.t("connections.importProgress.cancelImport")}
                  </Button>
                </Box>
              )}

              {/* Close button when done or cancelled */}
              {(importProgress?.stage === "done" || importProgress?.stage === "cancelled") && (
                <Box textAlign="center" style={{ marginTop: 16 }}>
                  <Button onClick={handleCloseImportModal} variant="contained" style={{ backgroundColor: "#6366f1", color: "#fff", borderRadius: 8 }}>
                    {i18n.t("connections.importProgress.close")}
                  </Button>
                </Box>
              )}
            </Box>
          ) : (
            <>
              <FormControl fullWidth variant="outlined" size="small" style={{ marginBottom: 16, marginTop: 8 }}>
                <InputLabel>{i18n.t("connections.importMessages.connection")}</InputLabel>
                <Select
                  value={importForm.whatsappId}
                  onChange={(e) => setImportForm({ ...importForm, whatsappId: e.target.value })}
                  label={i18n.t("connections.importMessages.connection")}
                  style={{ borderRadius: 10 }}
                >
                  {connectedConnections.map((w) => {
                    const isZApi = !!(w.zapiInstanceId && w.zapiToken && w.zapiClientToken);
                    return (
                      <MuiMenuItem key={w.id} value={w.id}>
                        {isZApi ? "⚡" : "📱"} {w.name} {isZApi ? "(Z-API)" : "(Baileys)"}
                      </MuiMenuItem>
                    );
                  })}
                </Select>
              </FormControl>

              <Box display="flex" style={{ gap: 12, marginBottom: 16 }}>
                <TextField
                  fullWidth
                  type="date"
                  label={i18n.t("connections.importMessages.startDate")}
                  value={importForm.startDate}
                  onChange={(e) => setImportForm({ ...importForm, startDate: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                  variant="outlined"
                  size="small"
                  style={{ borderRadius: 10 }}
                />
                <TextField
                  fullWidth
                  type="date"
                  label={i18n.t("connections.importMessages.endDate")}
                  value={importForm.endDate}
                  onChange={(e) => setImportForm({ ...importForm, endDate: e.target.value })}
                  InputLabelProps={{ shrink: true }}
                  variant="outlined"
                  size="small"
                />
              </Box>

              <FormControl fullWidth variant="outlined" size="small" style={{ marginBottom: 16 }}>
                <InputLabel>{i18n.t("connections.importMessages.messageType")}</InputLabel>
                <Select
                  value={importForm.messageType}
                  onChange={(e) => setImportForm({ ...importForm, messageType: e.target.value })}
                  label={i18n.t("connections.importMessages.messageType")}
                  style={{ borderRadius: 10 }}
                >
                  <MuiMenuItem value="all">{i18n.t("connections.importMessages.all")}</MuiMenuItem>
                  <MuiMenuItem value="individual">{i18n.t("connections.importMessages.individual")}</MuiMenuItem>
                  <MuiMenuItem value="group">{i18n.t("connections.importMessages.group")}</MuiMenuItem>
                </Select>
              </FormControl>

              <FormControl fullWidth variant="outlined" size="small" style={{ marginBottom: 16 }}>
                <InputLabel>{i18n.t("connections.importMessages.ticketStatus")}</InputLabel>
                <Select
                  value={importForm.ticketStatus}
                  onChange={(e) => setImportForm({ ...importForm, ticketStatus: e.target.value })}
                  label={i18n.t("connections.importMessages.ticketStatus")}
                  style={{ borderRadius: 10 }}
                >
                  <MuiMenuItem value="open">{i18n.t("connections.importMessages.open")}</MuiMenuItem>
                  <MuiMenuItem value="pending">{i18n.t("connections.importMessages.pending")}</MuiMenuItem>
                  <MuiMenuItem value="closed">{i18n.t("connections.importMessages.closed")}</MuiMenuItem>
                </Select>
              </FormControl>

              <FormControl fullWidth variant="outlined" size="small" style={{ marginBottom: 8 }}>
                <InputLabel>{i18n.t("connections.importMessages.queue")}</InputLabel>
                <Select
                  value={importForm.queueId}
                  onChange={(e) => setImportForm({ ...importForm, queueId: e.target.value })}
                  label={i18n.t("connections.importMessages.queue")}
                  style={{ borderRadius: 10 }}
                >
                  <MuiMenuItem value=""><em>{i18n.t("connections.importMessages.noQueue")}</em></MuiMenuItem>
                  {importQueues.map((q) => (
                    <MuiMenuItem key={q.id} value={q.id}>{q.name}</MuiMenuItem>
                  ))}
                </Select>
              </FormControl>
            </>
          )}
        </DialogContent>
        {!importLoading && (
          <DialogActions className={classes.modernDialogActions}>
            <Button onClick={handleCloseImportModal} className={classes.modernCancelButton}>
              {i18n.t("connections.importMessages.cancel")}
            </Button>
            <Button onClick={handleImportMessages} className={classes.modernConfirmButton}>
              {i18n.t("connections.importMessages.import")}
            </Button>
          </DialogActions>
        )}
      </Dialog>
      {user.allowConnections !== "enabled" && !user.super ?
        <ForbiddenPage />
        :
        <>
          <MainHeader>
            <Title>{i18n.t("connections.title")} ({filteredWhatsApps.length}/{whatsApps.length})</Title>
            <MainHeaderButtonsWrapper>
              <Button
                variant="contained"
                color="primary"
                onClick={handleOpenTransferModal}
              >
                {i18n.t("connections.transfer.transferTickets")}
              </Button>

              <Button
                variant="contained"
                color="primary"
                onClick={restartWhatsapps}
              >
                {i18n.t("connections.restartConnections")}
              </Button>

              <Button
                variant="contained"
                color="primary"
                onClick={() => openInNewTab(`https://wa.me/${supportNumber}`)}
              >
                {i18n.t("connections.callSupport")}
              </Button>
              <PopupState variant="popover" popupId="demo-popup-menu">
                {(popupState) => (
                  <React.Fragment>
                    <Can
                      role={user.allowConnections === "enabled" || user.super ? "admin" : "user"}
                      perform="connections-page:addConnection"
                      yes={() => (
                        <>
                          <Button
                            variant="contained"
                            color="primary"
                            {...bindTrigger(popupState)}
                          >
                            {i18n.t("connections.newConnection")}
                          </Button>
                          <Menu {...bindMenu(popupState)}>
                            {planConfig?.plan?.useWhatsapp && (
                            <MenuItem
                              onClick={() => {
                                handleOpenWhatsAppModal("whatsapp");
                                popupState.close();
                              }}
                            >
                              <WhatsApp
                                fontSize="small"
                                style={{
                                  marginRight: "10px",
                                  color: "#25D366",
                                }}
                              />
                              WhatsApp
                            </MenuItem>
                            )}
                            {planConfig?.plan?.useWhatsappOfficial && (
                            <MenuItem
                              onClick={() => {
                                handleOpenWhatsAppModal("whatsapp_oficial");
                                popupState.close();
                              }}
                            >
                              <WhatsApp
                                fontSize="small"
                                style={{
                                  marginRight: "10px",
                                  color: "#25D366",
                                }}
                              />
                              WhatsApp {i18n.t("connections.officialLabel")}
                            </MenuItem>
                            )}
                            {planConfig?.plan?.useWhatsappEmbeddedSignup && (
                            <MenuItem
                              onClick={() => {
                                setEmbeddedSignupModalOpen(true);
                                popupState.close();
                              }}
                            >
                              <WhatsApp
                                fontSize="small"
                                style={{
                                  marginRight: "10px",
                                  color: "#1877F2",
                                }}
                              />
                              {i18n.t("embeddedSignup.menuItem")}
                            </MenuItem>
                            )}
                            {planConfig?.plan?.useZapi && (
                            <MenuItem
                              onClick={() => {
                                handleOpenWhatsAppModal("zapi");
                                popupState.close();
                              }}
                            >
                              <WhatsApp
                                fontSize="small"
                                style={{
                                  marginRight: "10px",
                                  color: "#0088cc",
                                }}
                              />
                              Z-API
                            </MenuItem>
                            )}
                            {planConfig?.plan?.useTelegram && (
                            <MenuItem
                              onClick={() => {
                                handleOpenWhatsAppModal("telegram");
                                popupState.close();
                              }}
                            >
                              <SendIcon
                                fontSize="small"
                                style={{
                                  marginRight: "10px",
                                  color: "#0088cc",
                                }}
                              />
                              Telegram
                            </MenuItem>
                            )}
                            <MenuItem
                              onClick={() => {
                                handleOpenWhatsAppModal("wacalls");
                                popupState.close();
                              }}
                              style={{ display: planConfig?.plan?.useWacalls === false ? "none" : undefined }}
                            >
                              <WhatsApp
                                fontSize="small"
                                style={{
                                  marginRight: "10px",
                                  color: "#25D366",
                                }}
                              />
                              WhatsApp Plus - Voz + Msg
                            </MenuItem>

                            <MenuItem
                              onClick={() => {
                                handleOpenWhatsAppModal("webchat");
                                popupState.close();
                              }}
                              style={{ display: planConfig?.plan?.useWebchat === false ? "none" : undefined }}
                            >
                              <ChatBubbleIcon
                                fontSize="small"
                                style={{
                                  marginRight: "10px",
                                  color: "#4E93FF",
                                }}
                              />
                              Webchat
                            </MenuItem>
                            {planConfig?.plan?.useFacebook && (
                            <FacebookLogin
                              key={`fb-${metaAppId}`}
                              appId={metaAppId}
                              autoLoad={false}
                              fields="name,email,picture"
                              version="9.0"
                              scope={process.env.REACT_APP_REQUIRE_BUSINESS_MANAGEMENT?.toUpperCase() === "TRUE" ?
                                "public_profile,pages_messaging,pages_show_list,pages_manage_metadata,pages_read_engagement,business_management"
                                : "public_profile,pages_messaging,pages_show_list,pages_manage_metadata,pages_read_engagement"}
                              callback={responseFacebook}
                              render={(renderProps) => (
                                <MenuItem
                                  onClick={renderProps.onClick}
                                >
                                  <Facebook
                                    fontSize="small"
                                    style={{
                                      marginRight: "10px",
                                      color: "#3b5998",
                                    }}
                                  />
                                  Facebook
                                </MenuItem>
                              )}
                            />
                            )}
                            {planConfig?.plan?.useInstagram && (
                            <FacebookLogin
                              key={`ig-${metaAppId}`}
                              appId={metaAppId}
                              autoLoad={false}
                              fields="name,email,picture"
                              version="9.0"
                              scope={process.env.REACT_APP_REQUIRE_BUSINESS_MANAGEMENT?.toUpperCase() === "TRUE" ?
                                "public_profile,instagram_basic,instagram_manage_messages,pages_messaging,pages_show_list,pages_manage_metadata,pages_read_engagement,business_management"
                                : "public_profile,instagram_basic,instagram_manage_messages,pages_messaging,pages_show_list,pages_manage_metadata,pages_read_engagement"}
                              callback={responseInstagram}
                              render={(renderProps) => (
                                <MenuItem
                                  onClick={renderProps.onClick}
                                >
                                  <Instagram
                                    fontSize="small"
                                    style={{
                                      marginRight: "10px",
                                      color: "#e1306c",
                                    }}
                                  />
                                  Instagram
                                </MenuItem>
                              )}
                            />
                            )}
                          </Menu>
                        </>
                      )}
                    />
                  </React.Fragment>
                )}
              </PopupState>
            </MainHeaderButtonsWrapper>
          </MainHeader>

          {/* Native Import Progress Banner */}
          {nativeImportProgress && (
            <Box style={{
              margin: "0 0 16px 0",
              padding: "16px 20px",
              borderRadius: 14,
              background: theme.palette.type === "dark"
                ? "linear-gradient(135deg, rgba(99,102,241,0.15), rgba(139,92,246,0.1))"
                : "linear-gradient(135deg, #eef2ff, #f5f3ff)",
              border: `1px solid ${theme.palette.type === "dark" ? "rgba(99,102,241,0.3)" : "rgba(99,102,241,0.2)"}`,
            }}>
              <Box display="flex" alignItems="center" justifyContent="space-between" style={{ marginBottom: 10 }}>
                <Box display="flex" alignItems="center" style={{ gap: 10 }}>
                  {nativeImportProgress.stage === "finishing" ? (
                    <Box style={{ width: 32, height: 32, borderRadius: "50%", backgroundColor: "#10b981", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Typography style={{ color: "#fff", fontWeight: "bold", fontSize: 16 }}>✓</Typography>
                    </Box>
                  ) : nativeImportProgress.stage === "cancelled" ? (
                    <Box style={{ width: 32, height: 32, borderRadius: "50%", backgroundColor: "#f59e0b", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <Typography style={{ color: "#fff", fontWeight: "bold", fontSize: 16 }}>✕</Typography>
                    </Box>
                  ) : (
                    <CircularProgress size={28} style={{ color: "#6366f1" }} />
                  )}
                  <div>
                    <Typography variant="subtitle2" style={{ fontWeight: 700, color: theme.palette.text.primary }}>
                      {nativeImportProgress.stage === "finishing"
                        ? i18n.t("connections.nativeImport.finishing")
                        : nativeImportProgress.stage === "cancelled"
                          ? i18n.t("connections.nativeImport.cancelled")
                          : i18n.t("connections.nativeImport.importing")}
                    </Typography>
                    <Typography variant="caption" style={{ color: theme.palette.text.secondary }}>
                      {nativeImportProgress.date && `${i18n.t("connections.nativeImport.currentDate")}: ${nativeImportProgress.date}`}
                    </Typography>
                  </div>
                </Box>
                <Box display="flex" alignItems="center" style={{ gap: 12 }}>
                  <Typography variant="subtitle2" style={{ fontWeight: 700, color: nativeImportProgress.stage === "cancelled" ? "#f59e0b" : "#6366f1" }}>
                    {nativeImportProgress.percentage || 0}%
                  </Typography>
                  {nativeImportProgress.stage === "importing" && (
                    <Button
                      size="small"
                      variant="outlined"
                      onClick={handleCancelImport}
                      style={{
                        borderColor: "#ef4444",
                        color: "#ef4444",
                        borderRadius: 8,
                        textTransform: "none",
                        fontWeight: 600,
                        fontSize: 12,
                        padding: "3px 12px",
                      }}
                    >
                      {i18n.t("connections.nativeImport.cancel")}
                    </Button>
                  )}
                </Box>
              </Box>

              {/* Progress bar */}
              <Box style={{ width: "100%", height: 8, borderRadius: 6, backgroundColor: theme.palette.type === "dark" ? "rgba(255,255,255,0.1)" : "#e5e7eb", overflow: "hidden", marginBottom: 8 }}>
                <Box style={{
                  width: `${nativeImportProgress.percentage || 0}%`,
                  height: "100%",
                  borderRadius: 6,
                  backgroundColor: nativeImportProgress.stage === "finishing" ? "#10b981" : nativeImportProgress.stage === "cancelled" ? "#f59e0b" : "#6366f1",
                  transition: "width 0.5s ease",
                }} />
              </Box>

              <Box display="flex" justifyContent="space-between" alignItems="center">
                <Typography variant="caption" style={{ color: theme.palette.text.secondary }}>
                  {i18n.t("connections.nativeImport.processed")}: {nativeImportProgress.current || 0} / {nativeImportProgress.total || 0} {i18n.t("connections.nativeImport.messages")}
                </Typography>
                {nativeImportProgress.errors > 0 && (
                  <Typography variant="caption" style={{ color: "#ef4444", fontWeight: 600 }}>
                    ⚠ {nativeImportProgress.errors} {i18n.t("connections.nativeImport.errors")}
                  </Typography>
                )}
              </Box>

              {/* Esse banner é a sincronização automática nativa (roda
                  sozinha em segundo plano assim que a conexão fica
                  CONECTADA — ver wbot.ts) — ela NÃO usa o período que o
                  operador escolhe no botão "Importar mensagens anteriores"
                  (esse é um recurso separado, ImportMessagesService.ts).
                  Sem esse aviso, quem via aqui "111/5706 mensagens" logo
                  depois de pedir a importação de só 1 dia achava que o
                  período escolhido tinha sido ignorado. */}
              <Typography variant="caption" style={{ display: "block", marginTop: 8, color: theme.palette.text.secondary, fontStyle: "italic" }}>
                ℹ {i18n.t("hardcoded.nativeImportAutoSyncNote")}
              </Typography>
            </Box>
          )}

          <Paper className={classes.mainPaper} variant="outlined">
            <Box
              style={{
                display: "flex",
                alignItems: "center",
                gap: 12,
                padding: "10px 12px",
                borderBottom: `1px solid ${theme.palette.type === "dark" ? "rgba(255,255,255,0.06)" : "#eee"}`,
                flexWrap: "wrap",
              }}
            >
              <TextField
                size="small"
                variant="outlined"
                placeholder={i18n.t("connections.searchPlaceholder") || "Buscar por nome, ID ou número..."}
                value={searchParam}
                onChange={(e) => setSearchParam(e.target.value)}
                style={{ minWidth: 280, flex: 1 }}
                InputProps={{
                  startAdornment: (
                    <InputAdornment position="start">
                      <SearchIcon fontSize="small" style={{ color: theme.palette.text.secondary }} />
                    </InputAdornment>
                  ),
                  endAdornment: searchParam ? (
                    <InputAdornment position="end">
                      <IconButton size="small" onClick={() => setSearchParam("")}>
                        <ClearIcon fontSize="small" />
                      </IconButton>
                    </InputAdornment>
                  ) : null,
                }}
              />
              <FormControl size="small" variant="outlined" style={{ minWidth: 180 }}>
                <InputLabel>{i18n.t("connections.status") || "Status"}</InputLabel>
                <Select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  label={i18n.t("connections.status") || "Status"}
                >
                  <MuiMenuItem value="all">{i18n.t("connections.statusAll") || "Todos"}</MuiMenuItem>
                  <MuiMenuItem value="CONNECTED">{i18n.t("connections.statusConnected") || "Conectado"}</MuiMenuItem>
                  <MuiMenuItem value="DISCONNECTED">{i18n.t("connections.statusDisconnected") || "Desconectado"}</MuiMenuItem>
                  <MuiMenuItem value="OPENING">{i18n.t("connections.statusOpening") || "Conectando"}</MuiMenuItem>
                  <MuiMenuItem value="qrcode">QR Code</MuiMenuItem>
                  <MuiMenuItem value="PAIRING">{i18n.t("connections.statusPairing") || "Pareamento"}</MuiMenuItem>
                </Select>
              </FormControl>
              {(searchParam || statusFilter !== "all") && (
                <Button
                  size="small"
                  variant="outlined"
                  onClick={() => { setSearchParam(""); setStatusFilter("all"); }}
                  style={{ textTransform: "none", borderRadius: 6 }}
                >
                  {i18n.t("connections.clearFilters") || "Limpar filtros"}
                </Button>
              )}
            </Box>
            {loading ? (
              <Box display="flex" justifyContent="center" p={4}>
                <CircularProgress />
              </Box>
            ) : (
              <Grid container spacing={3} style={{ padding: 8 }}>
                {filteredWhatsApps.length === 0 && (
                  <Box
                    style={{
                      width: "100%",
                      textAlign: "center",
                      padding: "40px 16px",
                      color: theme.palette.text.secondary,
                      fontSize: 13,
                    }}
                  >
                    {i18n.t("connections.noResults") || "Nenhuma conexão encontrada."}
                  </Box>
                )}
                {filteredWhatsApps.length > 0 &&
                  filteredWhatsApps.map((whatsApp) => {
                    const isOficial = whatsApp.channel === "whatsapp_oficial";
                    const isZApi = !!(whatsApp.zapiInstanceId && whatsApp.zapiToken && whatsApp.zapiClientToken);
                    const isWebchat = whatsApp.channel === "webchat";
                    const webchatActive = isWebchat && !!whatsApp.webchatToken;
                    let effectiveStatus = disconnectingIds.includes(whatsApp.id) ? "DISCONNECTED" : whatsApp.status;
                    if (isWebchat) {
                      effectiveStatus = webchatActive ? "CONNECTED" : "DISCONNECTED";
                    }
                    const displayConnected = effectiveStatus === "CONNECTED";
                    const statusLabels = {
                      CONNECTED: i18n.t("connections.statusConnected"),
                      DISCONNECTED: i18n.t("connections.statusDisconnected"),
                      OPENING: i18n.t("connections.statusOpening"),
                      qrcode: i18n.t("connections.statusQrcode"),
                      PAIRING: i18n.t("connections.statusPairing"),
                    };
                    let displayStatus = statusLabels[effectiveStatus] || effectiveStatus;
                    if (isWebchat) {
                      displayStatus = webchatActive ? "Ativo" : "Desativado";
                    }
                    const statusColor = displayConnected ? "#25d366" : displayStatus === i18n.t("connections.statusOpening") ? "#ff9800" : "#f44336";
                    // wacalls = canal "WhatsApp Plus - Voz + Msg": mesma regra do
                    // "whatsapp" comum — só faltava a condição aqui (o backend já
                    // grava whatsApp.number pra essa conexão, ver reconcileSessions
                    // em WacallsChatCallService.ts).
                    const number = (whatsApp.channel === "whatsapp" || whatsApp.channel === "wacalls") && whatsApp.number
                      ? formatSerializedId(whatsApp.number)
                      : isOficial && whatsApp.phone_number
                        ? formatSerializedId(whatsApp.phone_number)
                        : whatsApp.channel === "telegram" && whatsApp.number
                          ? `Bot ID: ${whatsApp.number}`
                          : "-";
                    // wa.me exige o numero so com digitos, com DDI e sem
                    // formatacao. `number` acima ja passou pelo
                    // formatSerializedId (com parenteses e traco) e por isso
                    // nao serve aqui — o link precisa do valor cru.
                    const numeroCru = String(
                      (whatsApp.channel === "whatsapp" || whatsApp.channel === "wacalls")
                        ? whatsApp.number || ""
                        : isOficial
                          ? whatsApp.phone_number || ""
                          : ""
                    ).replace(/\D/g, "");
                    const shareLink =
                      numeroCru.length >= 10 ? `https://wa.me/${numeroCru}` : "";

                    const usedPairingCode = pairingConnections.includes(whatsApp.id);

                    const getStatusChipClass = () => {
                      if (displayConnected) return classes.statusChipConnected;
                      if (displayStatus === "OPENING") return classes.statusChipOpening;
                      if (displayStatus === "qrcode") return classes.statusChipQrcode;
                      return classes.statusChipDisconnected;
                    };

                    const getIntegrityInfo = () => {
                      if (effectiveStatus === "CONNECTED" && (!whatsApp.retries || whatsApp.retries <= 3)) {
                        return { label: i18n.t("connections.stable"), stable: true };
                      }
                      if (effectiveStatus === "CONNECTED" && whatsApp.retries > 3) {
                        return { label: i18n.t("connections.unstable"), stable: false };
                      }
                      return { label: i18n.t("connections.unstable"), stable: false };
                    };
                    const integrity = getIntegrityInfo();

                    // Card mais largo: era ate 6 por linha no xl (xl={2}), o
                    // que espremia o grafico de 7 dias e quebrava o link
                    // wa.me em duas linhas. Agora vai de 1 a 4 por linha.
                    return (
                      <Grid item xs={12} sm={12} md={6} lg={4} xl={3} key={whatsApp.id}>
                        <Card className={classes.connectionCard} elevation={0}>
                          {/* Header: Icon + Name + Status Badge */}
                          <Box className={classes.cardHeader}>
                            <Box className={classes.cardHeaderLeft}>
                              <Box className={classes.channelIconWrapper} style={{
                                background: whatsApp.channel === "telegram"
                                  ? "rgba(0,136,204,0.08)"
                                  : whatsApp.channel === "instagram"
                                    ? "rgba(225,48,108,0.08)"
                                    : whatsApp.channel === "facebook"
                                      ? "rgba(59,89,152,0.08)"
                                      : whatsApp.channel === "webchat"
                                        ? "rgba(78,147,255,0.08)"
                                        : undefined,
                              }}>
                                {IconChannel(whatsApp.channel)}
                              </Box>
                              <Box>
                                <Box display="flex" alignItems="center" style={{ gap: 6 }}>
                                  <Typography className={classes.cardName}>{whatsApp.name}</Typography>
                                  <Chip
                                    size="small"
                                    label={`ID: ${whatsApp.id}`}
                                    style={{
                                      height: 18,
                                      fontSize: 10,
                                      fontWeight: 700,
                                      background: "#eef2ff",
                                      color: "#4338ca",
                                      borderRadius: 6,
                                    }}
                                  />
                                </Box>
                                <Typography className={classes.cardNumber}>{number}</Typography>
                              </Box>
                            </Box>
                            <Box display="flex" alignItems="center" style={{ gap: 6 }}>
                              <Box className={`${classes.statusChip} ${getStatusChipClass()}`}>
                                {displayConnected ? (
                                  <CheckCircle style={{ fontSize: 14 }} />
                                ) : (
                                  <SignalCellularConnectedNoInternet0Bar style={{ fontSize: 14 }} />
                                )}
                                {displayStatus}
                              </Box>
                              <span className={classes.colorDot} style={{ backgroundColor: whatsApp.color }} />
                            </Box>
                          </Box>

                          <Box className={classes.cardBody}>
                            {/* Ultimos 7 dias */}
                            <ConnectionStatsChart
                              stats={connectionStats[whatsApp.id]}
                            />

                            {/* Link de compartilhamento: so faz sentido para
                                numeros reais de WhatsApp. Telegram, webchat e
                                afins nao tem wa.me. */}
                            {shareLink && (
                              <Box className={classes.shareBox}>
                                <span className={classes.shareLabel}>
                                  {i18n.t("connections.shareLink")}
                                </span>
                                <Box className={classes.shareRow}>
                                  <span className={classes.shareLink} title={shareLink}>
                                    {shareLink}
                                  </span>
                                  <button
                                    type="button"
                                    className={classes.shareCopy}
                                    onClick={() => handleCopyShareLink(shareLink)}
                                  >
                                    {i18n.t("connections.copy")}
                                  </button>
                                </Box>
                              </Box>
                            )}

                            {/* Integrity */}
                            <Box className={classes.integritySection}>
                              <Typography className={classes.integrityLabel}>{i18n.t("connections.integrity")}</Typography>
                              <span className={`${classes.integrityBadge} ${integrity.stable ? classes.integrityStable : classes.integrityUnstable}`}>
                                {integrity.label}
                              </span>
                            </Box>

                            {/* Badges */}
                            <Box display="flex" alignItems="center" flexWrap="wrap" style={{ gap: 4, marginBottom: 8 }}>
                              {isOficial ? (
                                <Chip className={classes.officialBadge} size="small" label="API OFICIAL" />
                              ) : isZApi ? (
                                <Chip size="small" label="⚡ Z-API" style={{ background: "linear-gradient(135deg, #6366f1, #8b5cf6)", color: "#fff", fontSize: 10, fontWeight: 700, height: 20, borderRadius: 6 }} />
                              ) : whatsApp.channel === "telegram" ? (
                                <Chip size="small" label={`🤖 ${i18n.t("telegram.chip")}`} style={{ background: "linear-gradient(135deg, #0088cc, #229ED9)", color: "#fff", fontSize: 10, fontWeight: 700, height: 20, borderRadius: 6 }} />
                              ) : (
                                whatsApp.channel === "whatsapp" && (
                                  <>
                                    <Chip className={classes.normalBadge} size="small" label="BAILEYS" />
                                    {displayConnected && (
                                      <Tooltip title={usedPairingCode ? i18n.t("connections.badges.pairingCode") : i18n.t("connections.badges.qrCode")}>
                                        <Chip
                                          className={usedPairingCode ? classes.pairingBadge : classes.qrBadge}
                                          size="small"
                                          label={usedPairingCode ? "🔑 Código" : "⬛ QR Code"}
                                        />
                                      </Tooltip>
                                    )}
                                  </>
                                )
                              )}
                              {whatsApp.isDefault && (
                                <Chip
                                  size="small"
                                  variant="outlined"
                                  className={classes.defaultChip}
                                  label={i18n.t("connections.default")}
                                />
                              )}
                            </Box>

                            {/* Action buttons */}
                            {renderActionButtons(whatsApp)}

                            {(whatsApp.channel === "facebook" || whatsApp.channel === "instagram") && (
                              <Box display="flex" alignItems="center" justifyContent="space-between" style={{ marginTop: 4 }}>
                                <Typography style={{ fontSize: 12, fontWeight: 500 }}>{i18n.t("connections.receiveComments.label")}</Typography>
                                <Switch
                                  checked={whatsApp.receiveComments !== false}
                                  onChange={() => handleToggleReceiveComments(whatsApp)}
                                  color="primary"
                                  size="small"
                                />
                              </Box>
                            )}

                            {/* Last update */}
                            <Typography className={classes.lastUpdate}>
                              {i18n.t("connections.updatedAt")}: {format(parseISO(whatsApp.updatedAt), "dd/MM/yy HH:mm")}
                            </Typography>
                          </Box>

                          {/* Footer */}
                          <Can
                            role={user.allowConnections === "enabled" || user.super ? "admin" : "user"}
                            perform="connections-page:addConnection"
                            yes={() => (
                              <Box className={classes.cardFooter}>
                                <Box className={classes.footerLeft}>
                                  <Switch
                                    size="small"
                                    checked={whatsApp.isActive !== false}
                                    onChange={() => handleToggleActive(whatsApp)}
                                    color="primary"
                                  />
                                  <Typography className={classes.footerToggleLabel}>
                                    {whatsApp.isActive !== false ? i18n.t("connections.active") : i18n.t("connections.inactive")}
                                  </Typography>
                                </Box>
                                <Box display="flex" style={{ gap: 2 }}>
                                  {/* Importar mensagens anteriores: era um
                                      botao de texto largo dentro do card, que
                                      empurrava o rodape para baixo e deixava
                                      os cards de alturas diferentes. Como
                                      icone, entra na mesma fileira das outras
                                      acoes. Vale so para os canais que
                                      suportam o recurso (WhatsApp e wacalls) e
                                      com a conexao conectada. */}
                                  {(whatsApp.channel === "whatsapp" || whatsApp.channel === "wacalls") &&
                                    String(whatsApp.status || "").toLowerCase() === "connected" && (
                                      <Can
                                        role={user.allowConnections === "enabled" || user.super ? "admin" : "user"}
                                        perform="connections-page:addConnection"
                                        yes={() => (
                                          <Tooltip
                                            title={
                                              importingHistoryIds.includes(whatsApp.id)
                                                ? i18n.t("connections.buttons.importingHistory")
                                                : i18n.t("connections.buttons.importHistory")
                                            }
                                          >
                                            {/* span envolvendo o IconButton: o
                                                Tooltip do MUI nao mostra titulo
                                                em filho desabilitado, porque o
                                                elemento nao dispara eventos de
                                                mouse. */}
                                            <span>
                                              <IconButton
                                                className={classes.footerIconButton}
                                                size="small"
                                                disabled={importingHistoryIds.includes(whatsApp.id)}
                                                onClick={() =>
                                                  handleOpenHistoryImportPrompt(whatsApp.id, whatsApp.channel)
                                                }
                                                style={{ color: "#8b5cf6" }}
                                              >
                                                <History fontSize="small" />
                                              </IconButton>
                                            </span>
                                          </Tooltip>
                                        )}
                                      />
                                    )}
                                  <Tooltip title={i18n.t("connections.transfer.transferTickets")}>
                                    <IconButton className={classes.footerIconButton} size="small" onClick={handleOpenTransferModal}>
                                      <Autorenew fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                  <Tooltip title={i18n.t("tooltips.edit")}>
                                    <IconButton className={classes.footerIconButton} size="small" onClick={() => handleEditWhatsApp(whatsApp)} style={{ color: "#f59e0b" }}>
                                      <Edit fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                  <Tooltip title={i18n.t("tooltips.delete")}>
                                    <IconButton className={classes.footerIconButton} size="small" onClick={() => handleOpenPreDeleteModal(whatsApp.id)} style={{ color: "#ef4444" }}>
                                      <DeleteOutline fontSize="small" />
                                    </IconButton>
                                  </Tooltip>
                                  {isOficial && (
                                    <>
                                      <Tooltip title={i18n.t("tooltips.syncTemplates")}>
                                        <IconButton className={classes.footerIconButton} size="small" onClick={() => handleSyncTemplates(whatsApp.id)}>
                                          <Sync fontSize="small" />
                                        </IconButton>
                                      </Tooltip>
                                      <Tooltip title={i18n.t("tooltips.copyWebhook")}>
                                        <IconButton className={classes.footerIconButton} size="small" onClick={() => handleCopyWebhook(whatsApp.waba_webhook)}>
                                          <WebhookIcon fontSize="small" />
                                        </IconButton>
                                      </Tooltip>
                                    </>
                                  )}
                                </Box>
                              </Box>
                            )}
                          />
                        </Card>
                      </Grid>
                    );
                  })}
              </Grid>
            )}
          </Paper>
        </>
      }
    </MainContainer>
  );
};

export default Connections;