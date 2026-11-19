import React, { useEffect, useState, useContext, useCallback, useRef } from "react";
import { i18n } from "../../translate/i18n";
import { subscribeToPush, unsubscribeFromPush, isPushSubscribed } from "../../services/pushNotification";
import { areNotificationsDisabled, setNotificationsDisabled } from "../../helpers/notificationPrefs";

import Grid from "@material-ui/core/Grid";
import MenuItem from "@material-ui/core/MenuItem";
import FormControl from "@material-ui/core/FormControl";
import InputLabel from "@material-ui/core/InputLabel";
import Select from "@material-ui/core/Select";
import FormHelperText from "@material-ui/core/FormHelperText";
import { Tab, Tabs, TextField, Button, Checkbox, ListItemText, Chip, InputBase } from "@material-ui/core";
import { makeStyles, useTheme } from "@material-ui/core/styles";
import grey from "@material-ui/core/colors/grey";
import blue from "@material-ui/core/colors/blue";

import useSettings from "../../hooks/useSettings";
import useCompanySettings from "../../hooks/useSettings/companySettings";
import OnlyForSuperUser from "../OnlyForSuperUser";
import { toast } from "react-toastify";
import { getAvailableCurrencies, setCompanyCurrency } from "../../helpers/currencyHelper";
import api from "../../services/api";

// Categorias de mídia da limpeza (espelham o backend em
// SettingServices/mediaCategories.ts).
const MEDIA_TYPE_LABELS = {
  video: "Vídeos (mp4, mov, webm...)",
  image: "Imagens (jpg, jfif, png, webp...)",
  audio: "Áudios (mp3, ogg, opus...)",
  document: "Documentos (pdf, docx, xlsx, zip...)",
  other: "Outros arquivos",
};

// Dark-mode aware inline style helpers
// Emojis oferecidos para a auto-reacao. Lista fixa e curta de proposito: um
// seletor completo de emoji abriria espaco para simbolos que o WhatsApp nao
// aceita como reacao, e o erro so apareceria na hora do envio.
const EMOJIS_REACAO = [
  "\u{1F44D}", "\u2764\uFE0F", "\u{1F602}", "\u{1F62E}", "\u{1F622}",
  "\u{1F64F}", "\u{1F525}", "\u{1F44F}", "\u{1F389}", "\u2705",
  "\u{1F91D}", "\u{1F4AF}", "\u{1F44C}", "\u{1F680}", "\u{1F4A1}"
];

const useDarkStyles = () => {
  const theme = useTheme();
  const isDark = theme.mode === "dark" || theme.palette?.type === "dark";
  return {
    isDark,
    sectionBg: isDark ? "#141620" : "#f5f5f5",
    sectionBorder: isDark ? "1px solid rgba(255,255,255,0.08)" : "1px solid #e0e0e0",
    cardBg: isDark ? "#1a1c2e" : "#ffffff",
    cardBorder: isDark ? "1px solid rgba(255,255,255,0.1)" : "1px solid #cccccc",
    titleColor: isDark ? "#e8eaed" : "#333333",
    labelColor: isDark ? "#9aa0a6" : "#444444",
    textColor: isDark ? "#e8eaed" : "#333333",
    subtextColor: isDark ? "#9aa0a6" : "#555555",
    mutedColor: isDark ? "#6b7280" : "#666",
    accentBar: isDark ? "#7c6db0" : "#555555",
  };
};

// Formata bytes em unidade legível (KB, MB, GB...)
const formatBytes = (bytes) => {
  if (bytes === null || bytes === undefined || Number.isNaN(Number(bytes))) return "—";
  const value = Number(bytes);
  if (value <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.min(units.length - 1, Math.floor(Math.log(value) / Math.log(1024)));
  return `${(value / Math.pow(1024, i)).toFixed(i === 0 ? 0 : 2)} ${units[i]}`;
};

// ─── Toggle Switch Component ─────────────────────────────────────────────────
function ToggleSetting({ label, value, onChange, loading, trueValue = "enabled", falseValue = "disabled" }) {
  const isOn = value === trueValue || value === true;
  const ds = useDarkStyles();
  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 6,
        padding: "10px 14px",
        borderRadius: 10,
        background: "transparent",
        border: isOn ? (ds.isDark ? "1px solid rgba(255,255,255,0.1)" : "1px solid rgba(0,0,0,0.1)") : (ds.isDark ? "1px solid rgba(255,255,255,0.05)" : "1px solid rgba(0,0,0,0.05)"),
        boxShadow: "none",
        transition: "all 0.3s ease",
        cursor: loading ? "not-allowed" : "pointer",
        opacity: loading ? 0.7 : 1,
        minHeight: 74,
        justifyContent: "space-between",
        userSelect: "none",
      }}
      onClick={() => !loading && onChange(isOn ? falseValue : trueValue)}
    >
      <span style={{
        fontSize: 11,
        fontWeight: 600,
        color: ds.labelColor,
        letterSpacing: "0.5px",
        textTransform: "uppercase",
        lineHeight: 1.3,
      }}>
        {label}
      </span>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <span style={{
          fontSize: 11,
          fontWeight: 700,
          color: ds.subtextColor,
          letterSpacing: "1px",
        }}>
          {loading ? "..." : (isOn ? i18n.t("settingsOptions.enabled") : i18n.t("settingsOptions.disabledLabel"))}
        </span>
        <div style={{
          position: "relative",
          width: 42,
          height: 22,
          borderRadius: 11,
          background: isOn ? "linear-gradient(90deg, #444, #666)" : "#2d3748",
          border: isOn ? "1px solid #888" : "1px solid #4a5568",
          transition: "all 0.3s ease",
          boxShadow: "none",
          flexShrink: 0,
        }}>
          <div style={{
            position: "absolute",
            top: 2,
            left: isOn ? 22 : 2,
            width: 16,
            height: 16,
            borderRadius: "50%",
            background: isOn ? "#fff" : "#718096",
            transition: "left 0.25s cubic-bezier(.4,0,.2,1)",
            boxShadow: isOn ? "0 0 4px rgba(255,255,255,0.3)" : "none",
          }} />
        </div>
      </div>
    </div>
  );
}

const useStyles = makeStyles((theme) => ({
  container: {
    paddingTop: theme.spacing(4),
    paddingBottom: theme.spacing(4),
  },
  fixedHeightPaper: {
    padding: theme.spacing(2),
    display: "flex",
    overflow: "auto",
    flexDirection: "column",
    height: 240,
  },
  cardAvatar: {
    fontSize: "55px",
    color: grey[500],
    backgroundColor: "#ffffff",
    width: theme.spacing(7),
    height: theme.spacing(7),
  },
  cardTitle: {
    fontSize: "18px",
    color: blue[700],
  },
  cardSubtitle: {
    color: grey[600],
    fontSize: "14px",
  },
  alignRight: {
    textAlign: "right",
  },
  fullWidth: {
    width: "100%",
  },
  selectContainer: {
    width: "100%",
    textAlign: "left",
  },
  tab: {
    backgroundColor: theme.mode === 'light' ? "#f2f2f2" : "#1a1c2e",
    borderRadius: 4,
    width: "100%",
    "& .MuiTabs-flexContainer": {
      justifyContent: "center"
    }
  },
}));

export default function Options(props) {
  const { oldSettings, settings, scheduleTypeChanged, user } = props;

  const classes = useStyles();
  const ds = useDarkStyles();
  const [userRating, setUserRating] = useState("disabled");
  const [scheduleType, setScheduleType] = useState("disabled");
  const [chatBotType, setChatBotType] = useState("text");

  const [loadingUserRating, setLoadingUserRating] = useState(false);
  const [loadingScheduleType, setLoadingScheduleType] = useState(false);

  const [userCreation, setUserCreation] = useState("disabled");
  const [loadingUserCreation, setLoadingUserCreation] = useState(false);
  const [googleLogin, setGoogleLogin] = useState("disabled");
  const [loadingGoogleLogin, setLoadingGoogleLogin] = useState(false);

  const [requireDocument, setRequireDocument] = useState("disabled");
  const [loadingRequireDocument, setLoadingRequireDocument] = useState(false);

  const [SendGreetingAccepted, setSendGreetingAccepted] = useState("enabled");
  const [loadingSendGreetingAccepted, setLoadingSendGreetingAccepted] = useState(false);

  const [UserRandom, setUserRandom] = useState("enabled");
  const [loadingUserRandom, setLoadingUserRandom] = useState(false);

  const [SettingsTransfTicket, setSettingsTransfTicket] = useState("enabled");
  const [loadingSettingsTransfTicket, setLoadingSettingsTransfTicket] = useState(false);

  const [AcceptCallWhatsapp, setAcceptCallWhatsapp] = useState("enabled");
  const [loadingAcceptCallWhatsapp, setLoadingAcceptCallWhatsapp] = useState(false);

  const [sendSignMessage, setSendSignMessage] = useState("enabled");
  const [loadingSendSignMessage, setLoadingSendSignMessage] = useState(false);

  const [sendGreetingMessageOneQueues, setSendGreetingMessageOneQueues] = useState("enabled");
  const [loadingSendGreetingMessageOneQueues, setLoadingSendGreetingMessageOneQueues] = useState(false);

  const [sendQueuePosition, setSendQueuePosition] = useState("enabled");
  const [loadingSendQueuePosition, setLoadingSendQueuePosition] = useState(false);

  const [sendFarewellWaitingTicket, setSendFarewellWaitingTicket] = useState("enabled");
  const [loadingSendFarewellWaitingTicket, setLoadingSendFarewellWaitingTicket] = useState(false);

  const [acceptAudioMessageContact, setAcceptAudioMessageContact] = useState("enabled");
  const [loadingAcceptAudioMessageContact, setLoadingAcceptAudioMessageContact] = useState(false);

  //PAYMENT METHODS
  const [eficlientidType, setEfiClientidType] = useState('');
  const [loadingEfiClientidType, setLoadingEfiClientidType] = useState(false);

  const [eficlientsecretType, setEfiClientsecretType] = useState('');
  const [loadingEfiClientsecretType, setLoadingEfiClientsecretType] =
    useState(false);

  const [efichavepixType, setEfiChavepixType] = useState('');
  const [loadingEfiChavepixType, setLoadingEfiChavepixType] = useState(false);

  const [mpaccesstokenType, setmpaccesstokenType] = useState('');
  const [loadingmpaccesstokenType, setLoadingmpaccesstokenType] =
    useState(false);

  const [stripeprivatekeyType, setstripeprivatekeyType] = useState('');
  const [loadingstripeprivatekeyType, setLoadingstripeprivatekeyType] =
    useState(false);

  const [asaastokenType, setasaastokenType] = useState('');
  const [loadingasaastokenType, setLoadingasaastokenType] = useState(false);

  //OPENAI API KEY TRANSCRIÇÃO DE ÁUDIO
  const [openaitokenType, setopenaitokenType] = useState('');
  const [loadingopenaitokenType, setLoadingopenaitokenType] = useState(false);

  //LGPD
  const [enableLGPD, setEnableLGPD] = useState("disabled");
  const [loadingEnableLGPD, setLoadingEnableLGPD] = useState(false);

  const [lgpdMessage, setLGPDMessage] = useState("");
  const [loadinglgpdMessage, setLoadingLGPDMessage] = useState(false);

  const [lgpdLink, setLGPDLink] = useState("");
  const [loadingLGPDLink, setLoadingLGPDLink] = useState(false);

  const [lgpdDeleteMessage, setLGPDDeleteMessage] = useState("disabled");
  const [loadingLGPDDeleteMessage, setLoadingLGPDDeleteMessage] = useState(false);

  //LIMITAR DOWNLOAD
  // const [downloadLimit, setdownloadLimit] = useState("64");
  // const [loadingDownloadLimit, setLoadingdownloadLimit] = useState(false);

  const [lgpdConsent, setLGPDConsent] = useState("disabled");
  const [loadingLGPDConsent, setLoadingLGPDConsent] = useState(false);

  const [lgpdHideNumber, setLGPDHideNumber] = useState("disabled");
  const [loadingLGPDHideNumber, setLoadingLGPDHideNumber] = useState(false);

  // Tag obrigatoria
  const [requiredTag, setRequiredTag] = useState("enabled")
  const [loadingRequiredTag, setLoadingRequiredTag] = useState(false)

  // Fechar ticket ao transferir para outro setor
  const [closeTicketOnTransfer, setCloseTicketOnTransfer] = useState(false)
  const [loadingCloseTicketOnTransfer, setLoadingCloseTicketOnTransfer] = useState(false)
  const [enableCloseTicketModal, setEnableCloseTicketModal] = useState(true)
  const [loadingEnableCloseTicketModal, setLoadingEnableCloseTicketModal] = useState(false)

  // Limpeza automática das pastas public
  const [publicFolderRetention, setPublicFolderRetention] = useState("disabled")
  const [loadingPublicFolderRetention, setLoadingPublicFolderRetention] = useState(false)
  // Tipos de mídia que a limpeza por idade pode apagar. Vazio = nenhuma
  // mídia é apagada (só a deduplicação, que é não destrutiva, continua).
  const [publicFolderCleanTypes, setPublicFolderCleanTypes] = useState([])
  const [loadingPublicFolderCleanTypes, setLoadingPublicFolderCleanTypes] = useState(false)
  const [dedupingPublicFolder, setDedupingPublicFolder] = useState(false)
  const [lastDedupeResult, setLastDedupeResult] = useState(null)

  const [cleaningPublicFolder, setCleaningPublicFolder] = useState(false)
  const [folderInfo, setFolderInfo] = useState({ totalBytes: null, fileCount: null })
  const [loadingFolderInfo, setLoadingFolderInfo] = useState(false)
  const [lastCleanResult, setLastCleanResult] = useState(null)
  // Prévia (dryRun) do que a limpeza removeria com o período de retenção
  // selecionado — antes o card "Tamanho após limpeza" só era preenchido
  // depois de rodar uma limpeza DE VERDADE, então "Atualizar tamanho"
  // parecia não fazer nada com esse card.
  const [folderPreview, setFolderPreview] = useState(null)
  const [loadingFolderPreview, setLoadingFolderPreview] = useState(false)

  // Status do ticket ao transferir com usuário
  const [transferredTicketStatus, setTransferredTicketStatus] = useState("open")
  const [loadingTransferredTicketStatus, setLoadingTransferredTicketStatus] = useState(false)

  // Usar carteira de clientes
  const [directTicketsToWallets, setDirectTicketsToWallets] = useState(false)
  const [loadingDirectTicketsToWallets, setLoadingDirectTicketsToWallets] = useState(false)

  // Permitir usuário abrir ticket em qualquer fila/conexão
  const [allowUserCrossQueues, setAllowUserCrossQueues] = useState(false)
  const [loadingAllowUserCrossQueues, setLoadingAllowUserCrossQueues] = useState(false)

  // Sigla para inserir no copiar contatos
  const [copyContactPrefix, setCopyContactPrefix] = useState("");
const [loadingCopyContactPrefix, setLoadingCopyContactPrefix] = useState(false);

  //MENSAGENS CUSTOMIZADAS
  const [transferMessage, setTransferMessage] = useState("");
  const [loadingTransferMessage, setLoadingTransferMessage] = useState(false);

  const [greetingAcceptedMessage, setGreetingAcceptedMessage] = useState("");
  const [loadingGreetingAcceptedMessage, setLoadingGreetingAcceptedMessage] = useState(false);

  const [AcceptCallWhatsappMessage, setAcceptCallWhatsappMessage] = useState("");
  const [loadingAcceptCallWhatsappMessage, setLoadingAcceptCallWhatsappMessage] = useState(false);

  const [sendQueuePositionMessage, setSendQueuePositionMessage] = useState("");
  const [loadingSendQueuePositionMessage, setLoadingSendQueuePositionMessage] = useState(false);

  const [showNotificationPending, setShowNotificationPending] = useState(false);
  const [autoReaction, setAutoReaction] = useState(false);
  const [loadingAutoReaction, setLoadingAutoReaction] = useState(false);
  const [autoReactionEmoji, setAutoReactionEmoji] = useState("\u{1F44D}");
  // Regras de reação: [{ keywords: [], emojis: [] }]
  const [autoReactionRules, setAutoReactionRules] = useState([]);
  const [loadingAutoReactionRules, setLoadingAutoReactionRules] = useState(false);
  // Texto sendo digitado em cada regra (antes de virar etiqueta no Enter).
  const [novaPalavra, setNovaPalavra] = useState({});
  const [loadingAutoReactionEmoji, setLoadingAutoReactionEmoji] = useState(false);
  const [loadingShowNotificationPending, setLoadingShowNotificationPending] = useState(false);

  // Per-user: desabilitar notificações do sistema (som + desktop)
  const [disableSystemNotifications, setDisableSystemNotifications] = useState(areNotificationsDisabled());

  // IA - Auto-resumo e Sugestão de resposta
  const [autoAiSummary, setAutoAiSummary] = useState("enabled");
  const [loadingAutoAiSummary, setLoadingAutoAiSummary] = useState(false);
  const [aiSuggestReply, setAiSuggestReply] = useState("enabled");
  const [loadingAiSuggestReply, setLoadingAiSuggestReply] = useState(false);

  const [pushEnabled, setPushEnabled] = useState(false);
  const [loadingPush, setLoadingPush] = useState(false);

  // Moeda do sistema (super admin)
  const [companyCurrency, setCompanyCurrencyState] = useState("BRL");
  const [loadingCurrency, setLoadingCurrency] = useState(false);
  const availableCurrencies = getAvailableCurrencies();

  const handleChangeCurrency = async (value) => {
    setLoadingCurrency(true);
    try {
      // Lê o user logado para descobrir se é super (admin master) ou admin de empresa
      let me = {};
      try { me = JSON.parse(localStorage.getItem("cshow") || localStorage.getItem("user") || "{}"); } catch {}
      const isSuper = !!me?.super;
      const payload = { column: "currency", data: value };
      // Super sem companyId => atualiza moeda central e propaga para TODAS empresas
      // Admin comum => atualiza apenas para a própria empresa
      if (!isSuper && me?.companyId) {
        payload.companyId = me.companyId;
      }
      await api.put("/companySettings/", payload);
      setCompanyCurrencyState(value);
      setCompanyCurrency(value);
      toast.success(i18n.t("settingsOptions.currencyUpdated"));
    } catch (err) {
      toast.error(i18n.t("settingsOptions.currencyUpdateError"));
    } finally {
      setLoadingCurrency(false);
    }
  };

  // Número de suporte
  const [supportNumber, setSupportNumber] = useState("");
  const [loadingSupportNumber, setLoadingSupportNumber] = useState(false);

  // Meta Embedded Signup
  const [metaAppId, setMetaAppId] = useState("");
  const [loadingMetaAppId, setLoadingMetaAppId] = useState(false);
  const [metaAppSecret, setMetaAppSecret] = useState("");
  const [loadingMetaAppSecret, setLoadingMetaAppSecret] = useState(false);
  const [metaConfigId, setMetaConfigId] = useState("");
  const [loadingMetaConfigId, setLoadingMetaConfigId] = useState(false);
  const [metaSystemToken, setMetaSystemToken] = useState("");
  const [loadingMetaSystemToken, setLoadingMetaSystemToken] = useState(false);
  const metaSavedRef = useRef({ metaAppId: "", metaAppSecret: "", metaConfigId: "", metaSystemToken: "" });
  // Controla o auto-preenchimento dos textos padrão (transferMessage,
  // greetingAcceptedMessage, AcceptCallWhatsappMessage,
  // sendQueuePositionMessage) pra rodar só UMA vez por carregamento da tela
  // — sem isso, toda vez que `settings` mudasse de referência o efeito
  // rodaria de novo e ficaria salvando repetido.
  const defaultsAppliedRef = useRef(false);

  const { update: updateOldSetting, getAll } = useSettings();
  const { update } = useCompanySettings();

  const isSuper = () => {
    return user.super;
  };

  useEffect(() => {
    isPushSubscribed().then(setPushEnabled);
  }, []);

  const handleTogglePush = useCallback(async () => {
    setLoadingPush(true);
    try {
      if (pushEnabled) {
        const ok = await unsubscribeFromPush();
        if (ok) {
          setPushEnabled(false);
          toast.success(i18n.t("settingsOptions.pushDeactivated"));
        } else {
          toast.error(i18n.t("hardcoded.pushDeactivateError"));
        }
      } else {
        const ok = await subscribeToPush();
        if (ok) {
          setPushEnabled(true);
          toast.success(i18n.t("settingsOptions.pushActivated"));
        } else {
          toast.error(i18n.t("settingsOptions.pushActivateError"));
        }
      }
    } catch (err) {
      if (err?.message === "VAPID_NOT_CONFIGURED") {
        toast.error(i18n.t("settingsOptions.pushVapidError"));
      } else if (err?.userMessage) {
        toast.error(err.userMessage);
      } else if (err?.response?.data?.error) {
        toast.error(err.response.data.error);
      } else {
        toast.error(i18n.t("settingsOptions.pushChangeError"));
      }
    } finally {
      setLoadingPush(false);
    }
  }, [pushEnabled]);

  useEffect(() => {

    if (Array.isArray(oldSettings) && oldSettings.length) {

      const userPar = oldSettings.find((s) => s.key === "userCreation");
      if (userPar) setUserCreation(userPar.value);

      const googleLoginPar = oldSettings.find((s) => s.key === "googleLogin");
      if (googleLoginPar) setGoogleLogin(googleLoginPar.value);

      const requireDocPar = oldSettings.find((s) => s.key === "requireDocument");
      if (requireDocPar) setRequireDocument(requireDocPar.value);

      // const downloadLimit = oldSettings.find((s) => s.key === "downloadLimit");

      // if (downloadLimit) {
      //  setdownloadLimit(downloadLimit.value);
      // }

      const copyContactPrefix = oldSettings.find((s) => s.key === 'copyContactPrefix');
      if (copyContactPrefix) {
        setCopyContactPrefix(copyContactPrefix.value);
      }

      const eficlientidType = oldSettings.find((s) => s.key === 'eficlientid');
      if (eficlientidType) {
        setEfiClientidType(eficlientidType.value);
      }

      const eficlientsecretType = oldSettings.find((s) => s.key === 'eficlientsecret');
      if (eficlientsecretType) {
        setEfiClientsecretType(eficlientsecretType.value);
      }

      const efichavepixType = oldSettings.find((s) => s.key === 'efichavepix');
      if (efichavepixType) {
        setEfiChavepixType(efichavepixType.value);
      }

      const mpaccesstokenType = oldSettings.find((s) => s.key === 'mpaccesstoken');
      if (mpaccesstokenType) {
        setmpaccesstokenType(mpaccesstokenType.value);
      }

      const asaastokenType = oldSettings.find((s) => s.key === 'asaastoken');
      if (asaastokenType) {
        setasaastokenType(asaastokenType.value);
      }

      const supportNumberPar = oldSettings.find((s) => s.key === "supportNumber");
      if (supportNumberPar) setSupportNumber(supportNumberPar.value);

      const publicFolderRetentionPar = oldSettings.find((s) => s.key === "publicFolderRetentionMonths");
      if (publicFolderRetentionPar) setPublicFolderRetention(publicFolderRetentionPar.value || "disabled");

      const publicFolderCleanTypesPar = oldSettings.find((s) => s.key === "publicFolderCleanTypes");
      if (publicFolderCleanTypesPar) {
        setPublicFolderCleanTypes(
          String(publicFolderCleanTypesPar.value || "")
            .split(",")
            .map((v) => v.trim())
            .filter(Boolean)
        );
      }

      const metaAppIdPar = oldSettings.find((s) => s.key === "metaAppId");
      if (metaAppIdPar) { setMetaAppId(metaAppIdPar.value); metaSavedRef.current.metaAppId = metaAppIdPar.value || ""; }

      const metaAppSecretPar = oldSettings.find((s) => s.key === "metaAppSecret");
      if (metaAppSecretPar) { setMetaAppSecret(metaAppSecretPar.value); metaSavedRef.current.metaAppSecret = metaAppSecretPar.value || ""; }

      const metaConfigIdPar = oldSettings.find((s) => s.key === "metaConfigId");
      if (metaConfigIdPar) { setMetaConfigId(metaConfigIdPar.value); metaSavedRef.current.metaConfigId = metaConfigIdPar.value || ""; }

      const metaSystemTokenPar = oldSettings.find((s) => s.key === "metaSystemToken");
      if (metaSystemTokenPar) { setMetaSystemToken(metaSystemTokenPar.value); metaSavedRef.current.metaSystemToken = metaSystemTokenPar.value || ""; }
    }
  }, [oldSettings])

  // Mensagens padrão — usadas quando a empresa nunca configurou esse campo
  // (chega vazio do backend). Antes o campo simplesmente ficava em branco,
  // obrigando a digitar do zero; agora vem com um texto pronto, usando as
  // variáveis REAIS do sistema (estilo {{chave}}, motor Mustache — ver
  // backend/src/helpers/Mustache.ts). O rótulo antigo sugeria "${queue.name}",
  // que nunca funcionou: esse motor só substitui {{...}}, não ${...}.
  const DEFAULT_TRANSFER_MESSAGE =
    "Você está sendo transferido para o setor *{{queue}}*, aguarde um momento.";
  const DEFAULT_GREETING_ACCEPTED_MESSAGE =
    "{{ms}} {{firstName}}! Meu nome é {{userName}} e vou continuar seu atendimento.";
  const DEFAULT_ACCEPT_CALL_MESSAGE =
    "No momento não realizamos atendimento por chamada de voz ou vídeo neste WhatsApp. Por favor, envie sua dúvida por texto.";
  const DEFAULT_QUEUE_POSITION_MESSAGE =
    "Sua posição de fila é:";

  useEffect(() => {
    for (const [key, value] of Object.entries(settings)) {
      if (key === "userRating") setUserRating(value);
      if (key === "scheduleType") setScheduleType(value);
      if (key === "chatBotType") setChatBotType(value);
      if (key === "acceptCallWhatsapp") setAcceptCallWhatsapp(value);
      if (key === "userRandom") setUserRandom(value);
      if (key === "sendGreetingMessageOneQueues") setSendGreetingMessageOneQueues(value);
      if (key === "sendSignMessage") setSendSignMessage(value);
      if (key === "sendFarewellWaitingTicket") setSendFarewellWaitingTicket(value);
      if (key === "sendGreetingAccepted") setSendGreetingAccepted(value);
      if (key === "sendQueuePosition") setSendQueuePosition(value);
      if (key === "acceptAudioMessageContact") setAcceptAudioMessageContact(value);
      if (key === "enableLGPD") setEnableLGPD(value);
      if (key === "requiredTag") setRequiredTag(value);
      if (key === "lgpdDeleteMessage") setLGPDDeleteMessage(value)
      if (key === "lgpdHideNumber") setLGPDHideNumber(value);
      if (key === "lgpdConsent") setLGPDConsent(value);
      if (key === "lgpdMessage") setLGPDMessage(value);
      if (key === "sendMsgTransfTicket") setSettingsTransfTicket(value);
      if (key === "lgpdLink") setLGPDLink(value);
      if (key === "DirectTicketsToWallets") setDirectTicketsToWallets(value);
      if (key === "closeTicketOnTransfer") setCloseTicketOnTransfer(value);
      if (key === "enableCloseTicketModal") setEnableCloseTicketModal(value === true || value === "true" || value === "enabled");
      if (key === "transferredTicketStatus") setTransferredTicketStatus(value);
      if (key === "transferMessage") setTransferMessage(value || DEFAULT_TRANSFER_MESSAGE);
      if (key === "greetingAcceptedMessage") setGreetingAcceptedMessage(value || DEFAULT_GREETING_ACCEPTED_MESSAGE);
      if (key === "AcceptCallWhatsappMessage") setAcceptCallWhatsappMessage(value || DEFAULT_ACCEPT_CALL_MESSAGE);
      if (key === "sendQueuePositionMessage") setSendQueuePositionMessage(value || DEFAULT_QUEUE_POSITION_MESSAGE);
      if (key === "showNotificationPending") setShowNotificationPending(value);
      if (key === "autoReaction") setAutoReaction(value === true || value === "true");
      if (key === "autoReactionEmoji" && value) setAutoReactionEmoji(value);
      if (key === "autoReactionRules") {
        // Vem do banco como JSONB (array) ou como texto, dependendo do driver.
        try {
          const lista = typeof value === "string" ? JSON.parse(value) : value;
          setAutoReactionRules(Array.isArray(lista) ? lista : []);
        } catch (e) {
          setAutoReactionRules([]);
        }
      }
      if (key === "allowUserCrossQueues") setAllowUserCrossQueues(value);
      if (key === "autoAiSummary") setAutoAiSummary(value === true || value === "true" || value === "enabled" ? "enabled" : "disabled");
      if (key === "aiSuggestReply") setAiSuggestReply(value === true || value === "true" || value === "enabled" ? "enabled" : "disabled");
      if (key === "copyContactPrefix") setCopyContactPrefix(value);
      if (key === "currency") {
        setCompanyCurrencyState(value || "BRL");
        setCompanyCurrency(value || "BRL");
      }
    }

    // Auto-preenche E JÁ SALVA os 4 textos padrão (transferência, saudação
    // ao aceitar, chamada não aceita, posição na fila) na primeira vez que a
    // tela carrega com algum deles vazio — assim o campo não fica só
    // "bonito na tela": a mensagem padrão passa a valer de verdade a partir
    // daqui, sem precisar o usuário clicar em cada campo pra salvar.
    if (!defaultsAppliedRef.current && Object.keys(settings || {}).length > 0) {
      defaultsAppliedRef.current = true;
      if (!settings.transferMessage) handletransferMessage(DEFAULT_TRANSFER_MESSAGE);
      if (!settings.greetingAcceptedMessage) handleGreetingAcceptedMessage(DEFAULT_GREETING_ACCEPTED_MESSAGE);
      if (!settings.AcceptCallWhatsappMessage) handleAcceptCallWhatsappMessage(DEFAULT_ACCEPT_CALL_MESSAGE);
      if (!settings.sendQueuePositionMessage) handlesendQueuePositionMessage(DEFAULT_QUEUE_POSITION_MESSAGE);
    }
  }, [settings]);

  async function handleChangeUserCreation(value) {
    setUserCreation(value);
    setLoadingUserCreation(true);
    await updateOldSetting({ key: "userCreation", value });
    setLoadingUserCreation(false);
  }

  async function handleChangeGoogleLogin(value) {
    setGoogleLogin(value);
    setLoadingGoogleLogin(true);
    await updateOldSetting({ key: "googleLogin", value });
    setLoadingGoogleLogin(false);
  }

  async function handleChangeRequireDocument(value) {
    setRequireDocument(value);
    setLoadingRequireDocument(true);
    await updateOldSetting({ key: "requireDocument", value });
    setLoadingRequireDocument(false);
  }

  async function handleChangeEfiClientid(value) {
    setEfiClientidType(value);
    setLoadingEfiClientidType(true);
    await updateOldSetting({ key: 'eficlientid', value });
    toast.success(i18n.t("settingsOptions.operationUpdated"));
    setLoadingEfiClientidType(false);
  }

  async function handleCopyContactPrefix(value) {
    setCopyContactPrefix(value);
    setLoadingCopyContactPrefix(true);
    await update({ column: "copyContactPrefix", data: value });
    setLoadingCopyContactPrefix(false);
  }

  async function handleChangeEfiClientsecret(value) {
    setEfiClientsecretType(value);
    setLoadingEfiClientsecretType(true);
    await updateOldSetting({ key: 'eficlientsecret', value });
    toast.success(i18n.t("settingsOptions.operationUpdated"));
    setLoadingEfiClientsecretType(false);
  }

  async function handleChangeEfiChavepix(value) {
    setEfiChavepixType(value);
    setLoadingEfiChavepixType(true);
    await updateOldSetting({ key: 'efichavepix', value });
    toast.success(i18n.t("settingsOptions.operationUpdated"));
    setLoadingEfiChavepixType(false);
  }

  async function handleChangempaccesstoken(value) {
    setmpaccesstokenType(value);
    setLoadingmpaccesstokenType(true);
    await updateOldSetting({ key: 'mpaccesstoken', value });
    toast.success(i18n.t("settingsOptions.operationUpdated"));
    setLoadingmpaccesstokenType(false);
  }

  async function handleChangestripeprivatekey(value) {
    setstripeprivatekeyType(value);
    setLoadingstripeprivatekeyType(true);
    await updateOldSetting({ key: 'stripeprivatekey', value });
    toast.success(i18n.t("settingsOptions.operationUpdated"));
    setLoadingstripeprivatekeyType(false);
  }

  async function handleChangeasaastoken(value) {
    setasaastokenType(value);
    setLoadingasaastokenType(true);
    await updateOldSetting({ key: 'asaastoken', value });
    toast.success(i18n.t("settingsOptions.operationUpdated"));
    setLoadingasaastokenType(false);
  }

  async function handleChangeUserRating(value) {
    setUserRating(value);
    setLoadingUserRating(true);
    await update({
      column: "userRating",
      data: value
    });
    setLoadingUserRating(false);
  }

  async function handleScheduleType(value) {
    setScheduleType(value);
    setLoadingScheduleType(true);
    await update({
      column: "scheduleType",
      data: value
    });
    setLoadingScheduleType(false);
    if (typeof scheduleTypeChanged === "function") {
      scheduleTypeChanged(value);
    }
  }

  async function handleCopyContactPrefix(value) {
    setCopyContactPrefix(value);
    setLoadingCopyContactPrefix(true);
    await update({
      column: "copyContactPrefix",
      data: value
    });
    setLoadingCopyContactPrefix(false);
  }

  async function handleChatBotType(value) {
    setChatBotType(value);
    await update({
      column: "chatBotType",
      data: value
    });
    if (typeof scheduleTypeChanged === "function") {
      setChatBotType(value);
    }
  }

  async function handleLGPDMessage(value) {
    setLGPDMessage(value);
    setLoadingLGPDMessage(true);
    await update({
      column: "lgpdMessage",
      data: value
    });
    setLoadingLGPDMessage(false);
  }

  async function handletransferMessage(value) {
    setTransferMessage(value);
    setLoadingTransferMessage(true);
    await update({
      column: "transferMessage",
      data: value
    });
    setLoadingTransferMessage(false);
  }

  async function handleGreetingAcceptedMessage(value) {
    setGreetingAcceptedMessage(value);
    setLoadingGreetingAcceptedMessage(true);
    await update({
      column: "greetingAcceptedMessage",
      data: value
    });
    setLoadingGreetingAcceptedMessage(false);
  }

  async function handleAcceptCallWhatsappMessage(value) {
    setAcceptCallWhatsappMessage(value);
    setLoadingAcceptCallWhatsappMessage(true);
    await update({
      column: "AcceptCallWhatsappMessage",
      data: value
    });
    setLoadingAcceptCallWhatsappMessage(false);
  }

  async function handlesendQueuePositionMessage(value) {
    setSendQueuePositionMessage(value);
    setLoadingSendQueuePositionMessage(true);
    await update({
      column: "sendQueuePositionMessage",
      data: value
    });
    setLoadingSendQueuePositionMessage(false);
  }

  async function handleShowNotificationPending(value) {
    setShowNotificationPending(value);
    setLoadingShowNotificationPending(true);
    await update({
      column: "showNotificationPending",
      data: value
    });
    setLoadingShowNotificationPending(false);
  }

  async function handleAutoReaction(value) {
    setAutoReaction(value);
    setLoadingAutoReaction(true);
    await update({ column: "autoReaction", data: value });
    setLoadingAutoReaction(false);
  }

  async function handleAutoReactionEmoji(value) {
    setAutoReactionEmoji(value);
    setLoadingAutoReactionEmoji(true);
    await update({ column: "autoReactionEmoji", data: value });
    setLoadingAutoReactionEmoji(false);
  }

  // Salva a lista inteira de regras de uma vez.
  async function salvarRegrasReacao(novasRegras) {
    const anteriores = autoReactionRules;
    setAutoReactionRules(novasRegras);
    setLoadingAutoReactionRules(true);
    try {
      await update({ column: "autoReactionRules", data: novasRegras });
    } catch (err) {
      // Antes o erro sumia em silêncio: a regra parecia salva na tela e não
      // estava no banco. O caso típico é a coluna ainda não existir porque as
      // migrations não foram rodadas.
      setAutoReactionRules(anteriores);
      toast.error(
        i18n.t(
          "settings.settings.options.reactionRulesSaveError",
          "Não foi possível salvar as regras. Se o sistema foi atualizado agora, rode as migrations do banco."
        )
      );
    } finally {
      setLoadingAutoReactionRules(false);
    }
  }

  async function handleLGPDLink(value) {
    setLGPDLink(value);
    setLoadingLGPDLink(true);
    await update({
      column: "lgpdLink",
      data: value
    });
    setLoadingLGPDLink(false);
  }

  async function handleLGPDDeleteMessage(value) {
    setLGPDDeleteMessage(value);
    setLoadingLGPDDeleteMessage(true);
    await update({
      column: "lgpdDeleteMessage",
      data: value
    });
    setLoadingLGPDDeleteMessage(false);
  }

  async function handleLGPDConsent(value) {
    setLGPDConsent(value);
    setLoadingLGPDConsent(true);
    await update({
      column: "lgpdConsent",
      data: value
    });
    setLoadingLGPDConsent(false);
  }

  async function handleLGPDHideNumber(value) {
    setLGPDHideNumber(value);
    setLoadingLGPDHideNumber(true);
    await update({
      column: "lgpdHideNumber",
      data: value
    });
    setLoadingLGPDHideNumber(false);
  }

  async function handleSendGreetingAccepted(value) {
    setSendGreetingAccepted(value);
    setLoadingSendGreetingAccepted(true);
    await update({
      column: "sendGreetingAccepted",
      data: value
    });
    setLoadingSendGreetingAccepted(false);
  }

  async function handleUserRandom(value) {
    setUserRandom(value);
    setLoadingUserRandom(true);
    await update({
      column: "userRandom",
      data: value
    });
    setLoadingUserRandom(false);
  }

  async function handleSettingsTransfTicket(value) {
    setSettingsTransfTicket(value);
    setLoadingSettingsTransfTicket(true);
    await update({
      column: "sendMsgTransfTicket",
      data: value
    });
    setLoadingSettingsTransfTicket(false);
  }

  async function handleAcceptCallWhatsapp(value) {
    setAcceptCallWhatsapp(value);
    setLoadingAcceptCallWhatsapp(true);
    await update({
      column: "acceptCallWhatsapp",
      data: value
    });
    setLoadingAcceptCallWhatsapp(false);
  }

  async function handleSendSignMessage(value) {
    setSendSignMessage(value);
    setLoadingSendSignMessage(true);
    await update({
      column: "sendSignMessage",
      data: value
    });
    localStorage.setItem("sendSignMessage", value === "enabled" ? true : false); //atualiza localstorage para sessão
    setLoadingSendSignMessage(false);
  }

  async function handleSendGreetingMessageOneQueues(value) {
    setSendGreetingMessageOneQueues(value);
    setLoadingSendGreetingMessageOneQueues(true);
    await update({
      column: "sendGreetingMessageOneQueues",
      data: value
    });
    setLoadingSendGreetingMessageOneQueues(false);
  }

  async function handleSendQueuePosition(value) {
    setSendQueuePosition(value);
    setLoadingSendQueuePosition(true);
    await update({
      column: "sendQueuePosition",
      data: value
    });
    setLoadingSendQueuePosition(false);
  }

  async function handleSendFarewellWaitingTicket(value) {
    setSendFarewellWaitingTicket(value);
    setLoadingSendFarewellWaitingTicket(true);
    await update({
      column: "sendFarewellWaitingTicket",
      data: value
    });
    setLoadingSendFarewellWaitingTicket(false);
  }

  async function handleAcceptAudioMessageContact(value) {
    setAcceptAudioMessageContact(value);
    setLoadingAcceptAudioMessageContact(true);
    await update({
      column: "acceptAudioMessageContact",
      data: value
    });
    setLoadingAcceptAudioMessageContact(false);
  }

  async function handleEnableLGPD(value) {
    setEnableLGPD(value);
    setLoadingEnableLGPD(true);
    await update({
      column: "enableLGPD",
      data: value
    });
    setLoadingEnableLGPD(false);
  }

  async function handleRequiredTag(value) {
    setRequiredTag(value);
    setLoadingRequiredTag(true);
    await update({
      column: "requiredTag",
      data: value,
    });
    setLoadingRequiredTag(false);
  }

  async function handleCloseTicketOnTransfer(value) {
    setCloseTicketOnTransfer(value);
    setLoadingCloseTicketOnTransfer(true);
    await update({
      column: "closeTicketOnTransfer",
      data: value,
    });
    setLoadingCloseTicketOnTransfer(false);
  }

  async function handleEnableCloseTicketModal(value) {
    setEnableCloseTicketModal(value);
    setLoadingEnableCloseTicketModal(true);
    await update({
      column: "enableCloseTicketModal",
      data: value,
    });
    setLoadingEnableCloseTicketModal(false);
  }

  async function handlePublicFolderRetention(value) {
    setPublicFolderRetention(value);
    setLoadingPublicFolderRetention(true);
    try {
      await updateOldSetting({ key: "publicFolderRetentionMonths", value });
      toast.success(i18n.t("settingsOptions.operationUpdated"));
    } catch (err) {
      toast.error(i18n.t("settingsOptions.operationError") || "Erro ao salvar");
    }
    setLoadingPublicFolderRetention(false);
    // A prévia é recalculada sozinha pelo useEffect que observa
    // publicFolderRetention (mais abaixo) assim que o state atualizar.
  }

  async function handlePublicFolderCleanTypes(values) {
    const list = Array.isArray(values) ? values : [];
    setPublicFolderCleanTypes(list);
    setLoadingPublicFolderCleanTypes(true);
    try {
      await updateOldSetting({
        key: "publicFolderCleanTypes",
        value: list.join(","),
      });
      toast.success(i18n.t("settingsOptions.operationUpdated"));
    } catch (err) {
      toast.error(i18n.t("settingsOptions.operationError") || "Erro ao salvar");
    }
    setLoadingPublicFolderCleanTypes(false);
  }

  async function fetchFolderInfo() {
    if (!user?.super) return;
    setLoadingFolderInfo(true);
    try {
      const { data } = await api.get("/settings/public-folder-info");
      setFolderInfo({
        totalBytes: data?.totalBytes ?? 0,
        fileCount: data?.fileCount ?? 0,
      });
    } catch (err) {
      setFolderInfo({ totalBytes: null, fileCount: null });
    }
    setLoadingFolderInfo(false);
  }

  // Calcula (sem apagar nada) o que a limpeza removeria com o período de
  // retenção e os TIPOS selecionados — é isso que preenche o card
  // "Tamanho após limpeza".
  async function fetchFolderPreview() {
    if (!user?.super) return;
    if (
      publicFolderRetention === "disabled" ||
      !Number(publicFolderRetention) ||
      publicFolderCleanTypes.length === 0
    ) {
      setFolderPreview(null);
      return;
    }
    setLoadingFolderPreview(true);
    try {
      const { data } = await api.get("/settings/public-folder-preview", {
        params: {
          months: Number(publicFolderRetention),
          mediaTypes: publicFolderCleanTypes.join(","),
        },
      });
      setFolderPreview(data || null);
    } catch (err) {
      setFolderPreview(null);
    }
    setLoadingFolderPreview(false);
  }

  async function handleRefreshFolderSizes() {
    await Promise.all([fetchFolderInfo(), fetchFolderPreview()]);
  }

  useEffect(() => {
    if (!user?.super) return;
    fetchFolderInfo();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user]);

  // Recalcula a prévia sempre que o período ou os tipos mudarem.
  useEffect(() => {
    if (!user?.super) return;
    fetchFolderPreview();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, publicFolderRetention, publicFolderCleanTypes]);

  // Remove apenas duplicados (hardlink): nenhuma mídia desaparece.
  async function handleDedupePublicFolder() {
    setDedupingPublicFolder(true);
    try {
      const { data } = await api.post("/settings/dedupe-public-folder", {});
      setLastDedupeResult(data || null);
      toast.success(
        `${data?.duplicates ?? 0} ${i18n.t("settingsOptions.publicFolderDuplicatesRemoved") || "duplicado(s) liberado(s)"}`
      );
      fetchFolderInfo();
    } catch (err) {
      toast.error(i18n.t("settingsOptions.operationError") || "Erro na deduplicação");
    }
    setDedupingPublicFolder(false);
  }

  async function handleCleanPublicFolderNow() {
    if (publicFolderCleanTypes.length === 0) {
      toast.error(
        i18n.t("settingsOptions.publicFolderNoTypesSelected") ||
          "Selecione ao menos um tipo de mídia para a limpeza."
      );
      return;
    }
    const months =
      publicFolderRetention !== "disabled" && Number(publicFolderRetention) >= 1
        ? Number(publicFolderRetention)
        : 1;
    const confirmed = window.confirm(
      i18n.t("settingsOptions.publicFolderCleanConfirm", { months }) ||
        `Deseja realmente limpar as mídias (${publicFolderCleanTypes.join(", ")}) com mais de ${months} ${months === 1 ? 'mês' : 'meses'}? Esta ação não pode ser desfeita.`
    );
    if (!confirmed) return;
    setCleaningPublicFolder(true);
    try {
      const { data } = await api.post("/settings/clean-public-folder", {
        months,
        mediaTypes: publicFolderCleanTypes.join(","),
      });

      setLastCleanResult(data || null);
      if (data && (data.remainingBytes !== undefined || data.totalBeforeBytes !== undefined)) {
        setFolderInfo((prev) => ({
          totalBytes:
            data.remainingBytes !== undefined ? data.remainingBytes : prev.totalBytes,
          fileCount: prev.fileCount,
        }));
      }
      toast.success(
        i18n.t("settingsOptions.publicFolderCleaned", {
          count: data?.deletedFiles ?? 0,
        }) ||
          `${data?.deletedFiles ?? 0} arquivo(s) removido(s)`
      );
      fetchFolderInfo();
      setFolderPreview(null); // já não há mais nada além do período mantido — prévia zera até o usuário atualizar de novo
    } catch (err) {
      toast.error(i18n.t("settingsOptions.operationError") || "Erro na limpeza");
    }
    setCleaningPublicFolder(false);
  }

  async function handleTransferredTicketStatus(value) {
    setTransferredTicketStatus(value);
    setLoadingTransferredTicketStatus(true);
    await update({
      column: "transferredTicketStatus",
      data: value,
    });
    setLoadingTransferredTicketStatus(false);
  }

  async function handleSupportNumber(value) {
    setSupportNumber(value);
    setLoadingSupportNumber(true);
    await updateOldSetting({
      key: "supportNumber",
      value,
    });
    toast.success(i18n.t("settingsOptions.supportNumberUpdated"));
    setLoadingSupportNumber(false);
  }

  async function handleDirectTicketsToWallets(value) {
    setDirectTicketsToWallets(value);
    setLoadingDirectTicketsToWallets(true);
    await update({
      column: "DirectTicketsToWallets",
      data: value,
    });
    setLoadingDirectTicketsToWallets(false);
  }

  async function handleAllowUserCrossQueues(value) {
    setAllowUserCrossQueues(value);
    setLoadingAllowUserCrossQueues(true);
    await update({
      column: "allowUserCrossQueues",
      data: value,
    });
    setLoadingAllowUserCrossQueues(false);
  }

  async function handleAutoAiSummary(value) {
    setAutoAiSummary(value);
    setLoadingAutoAiSummary(true);
    await update({
      column: "autoAiSummary",
      data: value === "enabled" ? "true" : "false",
    });
    setLoadingAutoAiSummary(false);
  }

  async function handleAiSuggestReply(value) {
    setAiSuggestReply(value);
    setLoadingAiSuggestReply(true);
    await update({
      column: "aiSuggestReply",
      data: value === "enabled" ? "true" : "false",
    });
    setLoadingAiSuggestReply(false);
  }

  // Meta Embedded Signup handlers
  async function handleMetaAppId(value) {
    if ((value || "") === metaSavedRef.current.metaAppId) return;
    setMetaAppId(value);
    setLoadingMetaAppId(true);
    await updateOldSetting({ key: "metaAppId", value });
    metaSavedRef.current.metaAppId = value || "";
    toast.success(i18n.t("hardcoded.metaUpdated", { field: "Meta App ID" }));
    setLoadingMetaAppId(false);
  }

  async function handleMetaAppSecret(value) {
    if ((value || "") === metaSavedRef.current.metaAppSecret) return;
    setMetaAppSecret(value);
    setLoadingMetaAppSecret(true);
    await updateOldSetting({ key: "metaAppSecret", value });
    metaSavedRef.current.metaAppSecret = value || "";
    toast.success(i18n.t("hardcoded.metaUpdated", { field: "Meta App Secret" }));
    setLoadingMetaAppSecret(false);
  }

  async function handleMetaConfigId(value) {
    if ((value || "") === metaSavedRef.current.metaConfigId) return;
    setMetaConfigId(value);
    setLoadingMetaConfigId(true);
    await updateOldSetting({ key: "metaConfigId", value });
    metaSavedRef.current.metaConfigId = value || "";
    toast.success(i18n.t("hardcoded.metaUpdated", { field: "Meta Config ID" }));
    setLoadingMetaConfigId(false);
  }

  async function handleMetaSystemToken(value) {
    if ((value || "") === metaSavedRef.current.metaSystemToken) return;
    setMetaSystemToken(value);
    setLoadingMetaSystemToken(true);
    await updateOldSetting({ key: "metaSystemToken", value });
    metaSavedRef.current.metaSystemToken = value || "";
    toast.success(i18n.t("hardcoded.metaUpdated", { field: "Meta System Token" }));
    setLoadingMetaSystemToken(false);
  }

  return (
    <>
      {/* ── Seção: Configurações Gerais ── */}
      <div style={{
        background: ds.sectionBg,
        borderRadius: 10,
        padding: "20px 20px 16px",
        marginBottom: 20,
        border: ds.sectionBorder,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
          <div style={{ width: 4, height: 20, background: ds.accentBar, borderRadius: 2 }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: ds.titleColor, letterSpacing: "1px", textTransform: "uppercase" }}>
            {i18n.t("settingsOptions.generalSettings")}
          </span>
        </div>

        <Grid spacing={2} container>

          {/* CRIAÇÃO DE COMPANY/USERS */}
          {isSuper() ? (
            <Grid xs={12} sm={6} md={4} item>
              <ToggleSetting
                label={i18n.t("settings.settings.options.creationCompanyUser")}
                value={userCreation}
                onChange={handleChangeUserCreation}
                loading={loadingUserCreation}
              />
            </Grid>
          ) : null}

          {/* LOGIN COM GOOGLE */}
          {isSuper() ? (
            <Grid xs={12} sm={6} md={4} item>
              <ToggleSetting
                label={i18n.t("settings.settings.options.googleLogin")}
                value={googleLogin}
                onChange={handleChangeGoogleLogin}
                loading={loadingGoogleLogin}
              />
            </Grid>
          ) : null}

          {/* AVALIAÇÕES */}
          <Grid xs={12} sm={6} md={4} item>
            <ToggleSetting
              label={i18n.t("settings.settings.options.evaluations")}
              value={userRating}
              onChange={handleChangeUserRating}
              loading={loadingUserRating}
            />
          </Grid>

          {/* ENVIAR SAUDAÇÃO AO ACEITAR O TICKET */}
          <Grid xs={12} sm={6} md={4} item>
            <ToggleSetting
              label={i18n.t("settings.settings.options.sendGreetingAccepted")}
              value={SendGreetingAccepted}
              onChange={handleSendGreetingAccepted}
              loading={loadingSendGreetingAccepted}
            />
          </Grid>

          {/* ESCOLHER OPERADOR ALEATORIO */}
          <Grid xs={12} sm={6} md={4} item>
            <ToggleSetting
              label={i18n.t("settings.settings.options.userRandom")}
              value={UserRandom}
              onChange={handleUserRandom}
              loading={loadingUserRandom}
            />
          </Grid>

          {/* ENVIAR MENSAGEM DE TRANSFERENCIA */}
          <Grid xs={12} sm={6} md={4} item>
            <ToggleSetting
              label={i18n.t("settings.settings.options.sendMsgTransfTicket")}
              value={SettingsTransfTicket}
              onChange={handleSettingsTransfTicket}
              loading={loadingSettingsTransfTicket}
            />
          </Grid>

          {/* AVISO SOBRE LIGAÇÃO DO WHATSAPP */}
          <Grid xs={12} sm={6} md={4} item>
            <ToggleSetting
              label={i18n.t("settings.settings.options.acceptCallWhatsapp")}
              value={AcceptCallWhatsapp}
              onChange={handleAcceptCallWhatsapp}
              loading={loadingAcceptCallWhatsapp}
            />
          </Grid>

          {/* PERMITE ATENDENTE USAR ASSINATURA */}
          <Grid xs={12} sm={6} md={4} item>
            <ToggleSetting
              label={i18n.t("settings.settings.options.sendSignMessage")}
              value={sendSignMessage}
              onChange={handleSendSignMessage}
              loading={loadingSendSignMessage}
            />
          </Grid>

          {/* ENVIAR SAUDAÇÃO QUANDO HOUVER 1 FILA */}
          <Grid xs={12} sm={6} md={4} item>
            <ToggleSetting
              label={i18n.t("settings.settings.options.sendGreetingMessageOneQueues")}
              value={sendGreetingMessageOneQueues}
              onChange={handleSendGreetingMessageOneQueues}
              loading={loadingSendGreetingMessageOneQueues}
            />
          </Grid>

          {/* ENVIAR MENSAGEM COM POSIÇÃO DA FILA */}
          <Grid xs={12} sm={6} md={4} item>
            <ToggleSetting
              label={i18n.t("settings.settings.options.sendQueuePosition")}
              value={sendQueuePosition}
              onChange={handleSendQueuePosition}
              loading={loadingSendQueuePosition}
            />
          </Grid>

          {/* ENVIAR DESPEDIDA NO AGUARDANDO */}
          <Grid xs={12} sm={6} md={4} item>
            <ToggleSetting
              label={i18n.t("settings.settings.options.sendFarewellWaitingTicket")}
              value={sendFarewellWaitingTicket}
              onChange={handleSendFarewellWaitingTicket}
              loading={loadingSendFarewellWaitingTicket}
            />
          </Grid>

          {/* ACEITAR ÁUDIO DE CONTATOS */}
          <Grid xs={12} sm={6} md={4} item>
            <ToggleSetting
              label={i18n.t("settings.settings.options.acceptAudioMessageContact")}
              value={acceptAudioMessageContact}
              onChange={handleAcceptAudioMessageContact}
              loading={loadingAcceptAudioMessageContact}
            />
          </Grid>

          {/* HABILITAR LGPD */}
          <Grid xs={12} sm={6} md={4} item>
            <ToggleSetting
              label={i18n.t("settings.settings.options.enableLGPD")}
              value={enableLGPD}
              onChange={handleEnableLGPD}
              loading={loadingEnableLGPD}
            />
          </Grid>

          {/* TAG OBRIGATÓRIA */}
          <Grid xs={12} sm={6} md={4} item>
            <ToggleSetting
              label={i18n.t("settings.settings.options.requiredTag")}
              value={requiredTag}
              onChange={handleRequiredTag}
              loading={loadingRequiredTag}
            />
          </Grid>

          {/* FECHAR TICKET AO TRANSFERIR */}
          <Grid xs={12} sm={6} md={4} item>
            <ToggleSetting
              label={i18n.t("settings.settings.options.closeTicketOnTransfer")}
              value={closeTicketOnTransfer}
              onChange={handleCloseTicketOnTransfer}
              loading={loadingCloseTicketOnTransfer}
              trueValue={true}
              falseValue={false}
            />
          </Grid>

          {/* HABILITAR MODAL DE FECHAMENTO DE CHAMADO */}
          <Grid xs={12} sm={6} md={4} item>
            <ToggleSetting
              label={i18n.t("settings.settings.options.enableCloseTicketModal")}
              value={enableCloseTicketModal}
              onChange={handleEnableCloseTicketModal}
              loading={loadingEnableCloseTicketModal}
              trueValue={true}
              falseValue={false}
            />
          </Grid>

          {/* AUTO-REAÇÃO ÀS MENSAGENS DO CLIENTE */}
          <Grid xs={12} sm={6} md={4} item>
            <ToggleSetting
              label={i18n.t("settings.settings.options.autoReaction")}
              value={autoReaction}
              onChange={handleAutoReaction}
              loading={loadingAutoReaction}
              trueValue={true}
              falseValue={false}
            />
          </Grid>

          {/* Seletor de emoji: só aparece com a auto-reação ligada. Um campo
              inerte no meio das opções confunde mais do que informa. */}
          {autoReaction && (
            <Grid xs={12} item>
              <div style={{ padding: "4px 2px 12px" }}>
                <div
                  style={{
                    fontSize: 13,
                    fontWeight: 600,
                    marginBottom: 10,
                  }}
                >
                  {i18n.t("settings.settings.options.autoReactionEmoji")}
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {EMOJIS_REACAO.map((emoji) => {
                    const selecionado = autoReactionEmoji === emoji;
                    return (
                      <button
                        key={emoji}
                        type="button"
                        disabled={loadingAutoReactionEmoji}
                        onClick={() => handleAutoReactionEmoji(emoji)}
                        style={{
                          width: 46,
                          height: 46,
                          fontSize: 22,
                          lineHeight: 1,
                          cursor: "pointer",
                          borderRadius: 10,
                          background: "transparent",
                          border: selecionado
                            ? "2px solid #2563eb"
                            : "1px solid rgba(15,23,42,0.12)",
                        }}
                        aria-label={emoji}
                      >
                        {emoji}
                      </button>
                    );
                  })}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    opacity: 0.7,
                    marginTop: 10,
                  }}
                >
                  {i18n.t("settings.settings.options.autoReactionHelp")}
                </div>

                {/* REGRAS POR PALAVRA-CHAVE
                    Cada regra tem palavras e um conjunto de emojis; quando a
                    mensagem contém uma das palavras, o sistema sorteia um
                    emoji do conjunto. Sem nenhuma regra cadastrada, vale o
                    emoji único acima (comportamento de antes). */}
                <div style={{ marginTop: 20 }}>
                  <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 4 }}>
                    {i18n.t("settings.settings.options.reactionRules", "Regras de Reação Automática")}
                  </div>
                  <div style={{ fontSize: 12, opacity: 0.7, marginBottom: 12 }}>
                    {i18n.t(
                      "settings.settings.options.reactionRulesHelp",
                      "Quando a mensagem contém uma das palavras, o sistema sorteia um dos emojis marcados. Sem regras, vale o emoji acima."
                    )}
                  </div>

                  {autoReactionRules.map((regra, indice) => (
                    <div
                      key={indice}
                      style={{
                        border: "1px solid rgba(15,23,42,0.12)",
                        borderRadius: 10,
                        padding: 12,
                        marginBottom: 12,
                      }}
                    >
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                        <span style={{ fontSize: 12, opacity: 0.75 }}>
                          {i18n.t("settings.settings.options.reactionKeywords", "Palavras-chave")}
                        </span>
                        <Button
                          size="small"
                          disabled={loadingAutoReactionRules}
                          onClick={() =>
                            salvarRegrasReacao(autoReactionRules.filter((_, i) => i !== indice))
                          }
                          style={{ color: "#ef4444", textTransform: "none", minWidth: 0 }}
                        >
                          {i18n.t("settings.settings.options.reactionRemoveRule", "Remover regra")}
                        </Button>
                      </div>

                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, alignItems: "center", marginBottom: 10 }}>
                        {(regra.keywords || []).map((palavra) => (
                          <Chip
                            key={palavra}
                            size="small"
                            label={palavra}
                            onDelete={() => {
                              const copia = [...autoReactionRules];
                              copia[indice] = {
                                ...regra,
                                keywords: (regra.keywords || []).filter((k) => k !== palavra),
                              };
                              salvarRegrasReacao(copia);
                            }}
                          />
                        ))}
                        <InputBase
                          placeholder={i18n.t("settings.settings.options.reactionKeywordPlaceholder", "Digite e aperte Enter...")}
                          value={novaPalavra[indice] || ""}
                          onChange={(e) => {
                            const texto = e.target.value;
                            setNovaPalavra((prev) => ({ ...prev, [indice]: texto }));
                          }}
                          onKeyDown={(e) => {
                            if (e.key !== "Enter") return;
                            e.preventDefault();
                            const texto = (novaPalavra[indice] || "").trim();
                            if (!texto) return;
                            const atuais = regra.keywords || [];
                            if (atuais.includes(texto)) {
                              setNovaPalavra((prev) => ({ ...prev, [indice]: "" }));
                              return;
                            }
                            const copia = [...autoReactionRules];
                            copia[indice] = { ...regra, keywords: [...atuais, texto] };
                            setNovaPalavra((prev) => ({ ...prev, [indice]: "" }));
                            salvarRegrasReacao(copia);
                          }}
                          style={{ fontSize: 13, minWidth: 160, flex: 1 }}
                        />
                      </div>

                      <div style={{ fontSize: 12, opacity: 0.75, marginBottom: 6 }}>
                        {i18n.t("settings.settings.options.reactionEmojis", "Emojis para sorteio")}
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
                        {EMOJIS_REACAO.map((emoji) => {
                          const marcado = (regra.emojis || []).includes(emoji);
                          return (
                            <button
                              key={emoji}
                              type="button"
                              disabled={loadingAutoReactionRules}
                              onClick={() => {
                                const atuais = regra.emojis || [];
                                const copia = [...autoReactionRules];
                                copia[indice] = {
                                  ...regra,
                                  emojis: marcado
                                    ? atuais.filter((x) => x !== emoji)
                                    : [...atuais, emoji],
                                };
                                salvarRegrasReacao(copia);
                              }}
                              style={{
                                width: 40,
                                height: 40,
                                fontSize: 19,
                                lineHeight: 1,
                                cursor: "pointer",
                                borderRadius: 8,
                                background: "transparent",
                                border: marcado ? "2px solid #2563eb" : "1px solid rgba(15,23,42,0.12)",
                              }}
                              aria-label={emoji}
                            >
                              {emoji}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}

                  <Button
                    size="small"
                    variant="outlined"
                    disabled={loadingAutoReactionRules}
                    onClick={() =>
                      salvarRegrasReacao([...autoReactionRules, { keywords: [], emojis: [] }])
                    }
                    style={{ textTransform: "none" }}
                  >
                    {i18n.t("settings.settings.options.reactionAddRule", "+ Adicionar regra")}
                  </Button>
                </div>
              </div>
            </Grid>
          )}

          {/* MOSTRAR NOTIFICAÇÃO PENDENTES */}
          <Grid xs={12} sm={6} md={4} item>
            <ToggleSetting
              label={i18n.t("settings.settings.options.showNotificationPending")}
              value={showNotificationPending}
              onChange={handleShowNotificationPending}
              loading={loadingShowNotificationPending}
              trueValue={true}
              falseValue={false}
            />
          </Grid>

          {/* MOVER PARA CARTEIRA */}
          <Grid xs={12} sm={6} md={4} item>
            <ToggleSetting
              label={i18n.t("settings.settings.options.DirectTicketsToWallets")}
              value={directTicketsToWallets}
              onChange={handleDirectTicketsToWallets}
              loading={loadingDirectTicketsToWallets}
              trueValue={true}
              falseValue={false}
            />
          </Grid>

          {/* PERMITIR ABRIR TICKET EM OUTRO SETOR/CONEXÃO */}
          <Grid xs={12} sm={6} md={4} item>
            <ToggleSetting
              label={i18n.t("hardcoded.allowCrossQueueTicket")}
              value={allowUserCrossQueues}
              onChange={handleAllowUserCrossQueues}
              loading={loadingAllowUserCrossQueues}
              trueValue={true}
              falseValue={false}
            />
          </Grid>

          {/* NÚMERO DE SUPORTE - apenas super */}
          {isSuper() ? (
            <Grid xs={12} sm={6} md={4} item>
              <div style={{
                padding: "10px 14px",
                borderRadius: 10,
                background: ds.cardBg,
                border: ds.cardBorder,
              }}>
                <span style={{
                  fontSize: 11,
                  fontWeight: 600,
                  color: ds.labelColor,
                  letterSpacing: "0.5px",
                  textTransform: "uppercase",
                  lineHeight: 1.3,
                  display: "block",
                  marginBottom: 8,
                }}>
                  📞 Número de Suporte
                </span>
                <TextField
                  size="small"
                  variant="outlined"
                  fullWidth
                  placeholder={i18n.t("settingsOptions.supportNumberPlaceholder")}
                  value={supportNumber}
                  onChange={(e) => setSupportNumber(e.target.value.replace(/\D/g, ""))}
                  onBlur={() => handleSupportNumber(supportNumber)}
                  disabled={loadingSupportNumber}
                  helperText={i18n.t("settingsOptions.supportNumberHelper")}
                  inputProps={{ maxLength: 15 }}
                />
              </div>
            </Grid>
          ) : null}
        </Grid>
      </div>

      {/* ── Seção: Inteligência Artificial ── */}
      <div style={{
        background: ds.sectionBg,
        borderRadius: 10,
        padding: "20px 20px 16px",
        marginBottom: 20,
        border: ds.sectionBorder,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
          <div style={{ width: 4, height: 20, background: "#7C3AED", borderRadius: 2 }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: ds.titleColor, letterSpacing: "1px", textTransform: "uppercase" }}>
            {i18n.t("settingsOptions.aiSection")}
          </span>
        </div>
        <Grid spacing={2} container>

          {/* IA - AUTO-RESUMO AO FINALIZAR */}
          <Grid xs={12} sm={6} md={4} item>
            <ToggleSetting
              label={i18n.t("settingsOptions.autoAiSummary")}
              value={autoAiSummary}
              onChange={handleAutoAiSummary}
              loading={loadingAutoAiSummary}
            />
          </Grid>

          {/* IA - SUGESTÃO DE RESPOSTA */}
          <Grid xs={12} sm={6} md={4} item>
            <ToggleSetting
              label={i18n.t("settingsOptions.aiSuggestReply")}
              value={aiSuggestReply}
              onChange={handleAiSuggestReply}
              loading={loadingAiSuggestReply}
            />
          </Grid>

        </Grid>
      </div>

      {/* ── Seção: Agendamento e Bot ── */}
      <div style={{
        background: ds.sectionBg,
        borderRadius: 10,
        padding: "20px 20px 16px",
        marginBottom: 20,
        border: ds.sectionBorder,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
          <div style={{ width: 4, height: 20, background: ds.accentBar, borderRadius: 2 }} />
          <span style={{ fontSize: 13, fontWeight: 700, color: ds.titleColor, letterSpacing: "1px", textTransform: "uppercase" }}>
            Agendamento & Bot
          </span>
        </div>
        <Grid spacing={2} container>
          {/* AGENDAMENTO DE EXPEDIENTE */}
          <Grid xs={12} sm={6} md={4} item>
            <FormControl className={classes.selectContainer} style={{ background: ds.cardBg, borderRadius: 8, padding: "10px 14px", border: ds.cardBorder }}>
              <InputLabel id="schedule-type-label" style={{ color: ds.labelColor, fontSize: 11, fontWeight: 600, letterSpacing: "0.5px", textTransform: "uppercase", top: 10, left: 14 }}>
                {i18n.t("settings.settings.options.officeScheduling")}
              </InputLabel>
              <Select
                labelId="schedule-type-label"
                value={scheduleType}
                onChange={async (e) => { handleScheduleType(e.target.value); }}
                style={{ color: ds.textColor, marginTop: 24 }}
                disableUnderline
              >
                <MenuItem value={"disabled"}>{i18n.t("settings.settings.options.disabled")}</MenuItem>
                <MenuItem value={"queue"}>{i18n.t("settings.settings.options.queueManagement")}</MenuItem>
                <MenuItem value={"company"}>{i18n.t("settings.settings.options.companyManagement")}</MenuItem>
                <MenuItem value={"connection"}>{i18n.t("settings.settings.options.connectionManagement")}</MenuItem>
              </Select>
              <FormHelperText style={{ color: ds.subtextColor, fontSize: 10 }}>
                {loadingScheduleType && i18n.t("settings.settings.options.updating")}
              </FormHelperText>
            </FormControl>
          </Grid>

          {/* TIPO DO BOT */}
          <Grid xs={12} sm={6} md={4} item>
            <FormControl className={classes.selectContainer} style={{ background: ds.cardBg, borderRadius: 8, padding: "10px 14px", border: ds.cardBorder }}>
              <InputLabel id="chatbot-type-label" style={{ color: ds.labelColor, fontSize: 11, fontWeight: 600, letterSpacing: "0.5px", textTransform: "uppercase", top: 10, left: 14 }}>
                {i18n.t("settings.settings.options.chatBotType")}
              </InputLabel>
              <Select
                labelId="chatbot-type-label"
                value={chatBotType}
                onChange={async (e) => { handleChatBotType(e.target.value); }}
                style={{ color: ds.textColor, marginTop: 24 }}
                disableUnderline
              >
                <MenuItem value={"text"}>{i18n.t("settingsOptions.text")}</MenuItem>
              </Select>
              <FormHelperText style={{ color: ds.subtextColor, fontSize: 10 }}>
                {loadingScheduleType && i18n.t("settings.settings.options.updating")}
              </FormHelperText>
            </FormControl>
          </Grid>

          {/* STATUS AO TRANSFERIR COM USUÁRIO */}
          <Grid xs={12} sm={6} md={4} item>
            <FormControl className={classes.selectContainer} style={{ background: ds.cardBg, borderRadius: 8, padding: "10px 14px", border: ds.cardBorder }}>
              <InputLabel id="transferredTicketStatus-label" style={{ color: ds.labelColor, fontSize: 11, fontWeight: 600, letterSpacing: "0.5px", textTransform: "uppercase", top: 10, left: 14 }}>
                {i18n.t("settings.settings.options.transferredTicketStatus")}
              </InputLabel>
              <Select
                labelId="transferredTicketStatus-label"
                value={transferredTicketStatus}
                onChange={async (e) => { handleTransferredTicketStatus(e.target.value); }}
                style={{ color: ds.textColor, marginTop: 24 }}
                disableUnderline
              >
                <MenuItem value={"open"}>{i18n.t("settings.settings.options.open")}</MenuItem>
                <MenuItem value={"pending"}>{i18n.t("settings.settings.options.pending")}</MenuItem>
              </Select>
              <FormHelperText style={{ color: ds.subtextColor, fontSize: 10 }}>
                {loadingTransferredTicketStatus && i18n.t("settings.settings.options.updating")}
              </FormHelperText>
            </FormControl>
          </Grid>
        </Grid>
      </div>

      {/* ── Seção: Notificações Push (apenas super admin) ── */}
      <OnlyForSuperUser
        user={user}
        yes={() => (
          <div style={{
            background: ds.sectionBg,
            borderRadius: 10,
            padding: "20px 20px 16px",
            marginBottom: 20,
            border: ds.sectionBorder,
          }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
              <div style={{ width: 4, height: 20, background: ds.accentBar, borderRadius: 2 }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: ds.titleColor, letterSpacing: "1px", textTransform: "uppercase" }}>
                Notificações Push
              </span>
            </div>
            <Grid spacing={2} container alignItems="center">
              <Grid xs={12} sm={6} md={4} item>
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 6,
                    padding: "10px 14px",
                    borderRadius: 10,
                    background: "transparent",
                    border: pushEnabled ? "1px solid rgba(76,175,80,0.3)" : "1px solid rgba(255,255,255,0.05)",
                    minHeight: 74,
                    justifyContent: "space-between",
                    userSelect: "none",
                    cursor: loadingPush ? "not-allowed" : "pointer",
                    opacity: loadingPush ? 0.7 : 1,
                    transition: "all 0.3s ease",
                  }}
                  onClick={handleTogglePush}
                >
                  <span style={{
                    fontSize: 11,
                    fontWeight: 600,
                    color: ds.labelColor,
                    letterSpacing: "0.5px",
                    textTransform: "uppercase",
                    lineHeight: 1.3,
                  }}>
                    {loadingPush ? i18n.t("settingsOptions.pushProcessing") : pushEnabled ? i18n.t("settingsOptions.pushEnabled") : i18n.t("settingsOptions.pushDisabled")}
                  </span>
                  <div style={{
                    width: 40,
                    height: 22,
                    borderRadius: 11,
                    background: pushEnabled ? "#4caf50" : "#ccc",
                    position: "relative",
                    transition: "background 0.3s ease",
                  }}>
                    <div style={{
                      width: 18,
                      height: 18,
                      borderRadius: "50%",
                      background: "#fff",
                      position: "absolute",
                      top: 2,
                      left: pushEnabled ? 20 : 2,
                      transition: "left 0.3s ease",
                      boxShadow: "0 1px 3px rgba(0,0,0,0.2)",
                    }} />
                  </div>
                </div>
              </Grid>
              <Grid xs={12} sm={6} md={4} item>
                <ToggleSetting
                  label={i18n.t("settings.settings.options.disableSystemNotifications")}
                  value={disableSystemNotifications}
                  onChange={(val) => {
                    setDisableSystemNotifications(val);
                    setNotificationsDisabled(val);
                  }}
                  trueValue={true}
                  falseValue={false}
                />
              </Grid>
              <Grid xs={12} sm={12} md={4} item>
                <span style={{ fontSize: 12, color: ds.mutedColor }}>
                  {i18n.t("settingsOptions.pushDescription")}
                </span>
              </Grid>
            </Grid>
          </div>
        )}
      />

      {/* Moeda Central (somente admin master) */}
      <OnlyForSuperUser
        user={user}
        yes={() => (
          <div style={{
            background: ds.sectionBg,
            border: ds.sectionBorder,
            borderRadius: 8,
            padding: 16,
            margin: "16px 0",
          }}>
            <Grid spacing={3} container>
              <Grid xs={12} sm={6} md={4} item>
                <FormControl variant="outlined" fullWidth>
                  <InputLabel id="currency-label">
                    {i18n.t("settingsOptions.systemCurrency")}
                  </InputLabel>
                  <Select
                    labelId="currency-label"
                    value={companyCurrency}
                    onChange={(e) => handleChangeCurrency(e.target.value)}
                    label={i18n.t("settingsOptions.systemCurrency")}
                    disabled={loadingCurrency}
                  >
                    {availableCurrencies.map((c) => (
                      <MenuItem key={c.code} value={c.code}>
                        {c.symbol} — {c.name} ({c.code})
                      </MenuItem>
                    ))}
                  </Select>
                  <FormHelperText>
                    {i18n.t("settingsOptions.currencyDescription")}
                  </FormHelperText>
                </FormControl>
              </Grid>
            </Grid>
          </div>
        )}
      />

      <br />

      
      {/*-----------------LGPD-----------------*/}
      {enableLGPD === "enabled" && (
        <>
          <Grid spacing={3} container
            style={{ marginBottom: 10 }}>
            <Tabs
              value={0}
              indicatorColor="primary"
              textColor="primary"
              scrollButtons="on"
              variant="scrollable"
              className={classes.tab}
            >
              <Tab

                label={i18n.t("settings.settings.LGPD.title")} />

            </Tabs>
          </Grid>
          <Grid spacing={1} container>
            <Grid xs={12} sm={6} md={12} item>
              <FormControl className={classes.selectContainer}>
                <TextField
                  id="lgpdMessage"
                  name="lgpdMessage"
                  margin="dense"
                  multiline
                  rows={3}
                  label={i18n.t("settings.settings.LGPD.welcome")}
                  variant="outlined"
                  value={lgpdMessage}
                  onChange={async (e) => {
                    handleLGPDMessage(e.target.value);
                  }}
                >
                </TextField>
                <FormHelperText>
                  {loadinglgpdMessage && i18n.t("settings.settings.options.updating")}
                </FormHelperText>
              </FormControl>
            </Grid>
            <Grid xs={12} sm={6} md={12} item>
              <FormControl className={classes.selectContainer}>
                <TextField
                  id="lgpdLink"
                  name="lgpdLink"
                  margin="dense"
                  label={i18n.t("settings.settings.LGPD.linkLGPD")}
                  variant="outlined"
                  value={lgpdLink}
                  onChange={async (e) => {
                    handleLGPDLink(e.target.value);
                  }}
                >
                </TextField>
                <FormHelperText>
                  {loadingLGPDLink && i18n.t("settings.settings.options.updating")}
                </FormHelperText>
              </FormControl>
            </Grid>
            {/* LGPD Manter ou nao mensagem deletada pelo contato */}
            <Grid xs={12} sm={6} md={4} item>
              <FormControl className={classes.selectContainer}>
                <InputLabel id="lgpdDeleteMessage-label">{i18n.t("settings.settings.LGPD.obfuscateMessageDelete")}</InputLabel>
                <Select
                  labelId="lgpdDeleteMessage-label"
                  value={lgpdDeleteMessage}
                  onChange={async (e) => {
                    handleLGPDDeleteMessage(e.target.value);
                  }}
                >
                  <MenuItem value={"disabled"}>{i18n.t("settings.settings.LGPD.disabled")}</MenuItem>
                  <MenuItem value={"enabled"}>{i18n.t("settings.settings.LGPD.enabled")}</MenuItem>
                </Select>
                <FormHelperText>
                  {loadingLGPDDeleteMessage && i18n.t("settings.settings.options.updating")}
                </FormHelperText>
              </FormControl>
            </Grid>
            {/* LGPD Sempre solicitar confirmaçao / conscentimento dos dados */}
            <Grid xs={12} sm={6} md={4} item>
              <FormControl className={classes.selectContainer}>
                <InputLabel id="lgpdConsent-label">
                  {i18n.t("settings.settings.LGPD.alwaysConsent")}
                </InputLabel>
                <Select
                  labelId="lgpdConsent-label"
                  value={lgpdConsent}
                  onChange={async (e) => {
                    handleLGPDConsent(e.target.value);
                  }}
                >
                  <MenuItem value={"disabled"}>{i18n.t("settings.settings.LGPD.disabled")}</MenuItem>
                  <MenuItem value={"enabled"}>{i18n.t("settings.settings.LGPD.enabled")}</MenuItem>
                </Select>
                <FormHelperText>
                  {loadingLGPDConsent && i18n.t("settings.settings.options.updating")}
                </FormHelperText>
              </FormControl>
            </Grid>
            {/* LGPD Ofuscar número telefone para usuários */}
            <Grid xs={12} sm={6} md={4} item>
              <FormControl className={classes.selectContainer}>
                <InputLabel id="lgpdHideNumber-label">
                  {i18n.t("settings.settings.LGPD.obfuscatePhoneUser")}
                </InputLabel>
                <Select
                  labelId="lgpdHideNumber-label"
                  value={lgpdHideNumber}
                  onChange={async (e) => {
                    handleLGPDHideNumber(e.target.value);
                  }}
                >
                  <MenuItem value={"disabled"}>{i18n.t("settings.settings.LGPD.disabled")}</MenuItem>
                  <MenuItem value={"enabled"}>{i18n.t("settings.settings.LGPD.enabled")}</MenuItem>
                </Select>
                <FormHelperText>
                  {loadingLGPDHideNumber && i18n.t("settings.settings.options.updating")}
                </FormHelperText>
              </FormControl>
            </Grid>
          </Grid>
        </>
      )}

      <Grid spacing={3} container>
        {isSuper() ?
          <Tabs
            indicatorColor='primary'
            textColor='primary'
            scrollButtons='on'
            variant='scrollable'
            className={classes.tab}
            style={{
              marginBottom: 20,
              marginTop: 20,
            }}
          >
            <Tab label={i18n.t("settingsOptions.pixEfiConfig")} />
          </Tabs>
          : null}
      </Grid>

      <Grid spacing={3} container style={{ marginBottom: 10 }}>
        <Grid xs={12} sm={6} md={6} item>
          {isSuper() ?
            <FormControl className={classes.selectContainer}>
              <TextField
                id='eficlientid'
                name='eficlientid'
                margin='dense'
                label='Client ID'
                variant='outlined'
                value={eficlientidType}
                onChange={async (e) => {
                  handleChangeEfiClientid(e.target.value);
                }}
              ></TextField>
              <FormHelperText>
                {loadingEfiClientidType && i18n.t("settings.settings.options.updating")}
              </FormHelperText>
            </FormControl>
            : null}
        </Grid>
        <Grid xs={12} sm={6} md={6} item>
          {isSuper() ?
            <FormControl className={classes.selectContainer}>
              <TextField
                id='eficlientsecret'
                name='eficlientsecret'
                margin='dense'
                label='Client Secret'
                variant='outlined'
                value={eficlientsecretType}
                onChange={async (e) => {
                  handleChangeEfiClientsecret(e.target.value);
                }}
              ></TextField>
              <FormHelperText>
                {loadingEfiClientsecretType && i18n.t("settings.settings.options.updating")}
              </FormHelperText>
            </FormControl>
            : null}
        </Grid>
        <Grid xs={12} sm={12} md={12} item>
          {isSuper() ?
            <FormControl className={classes.selectContainer}>
              <TextField
                id='efichavepix'
                name='efichavepix'
                margin='dense'
                label={i18n.t("settingsOptions.pixKey")}
                variant='outlined'
                value={efichavepixType}
                onChange={async (e) => {
                  handleChangeEfiChavepix(e.target.value);
                }}
              ></TextField>
              <FormHelperText>
                {loadingEfiChavepixType && i18n.t("settings.settings.options.updating")}
              </FormHelperText>
            </FormControl>
            : null}
        </Grid>
      </Grid>

      <Grid spacing={3} container>
        {isSuper() ?
          <Tabs
            indicatorColor='primary'
            textColor='primary'
            scrollButtons='on'
            variant='scrollable'
            className={classes.tab}
            style={{
              marginBottom: 20,
              marginTop: 20,
            }}
          >
            <Tab label='Mercado Pago' />
          </Tabs>
          : null}
      </Grid>

      <Grid spacing={3} container style={{ marginBottom: 10 }}>
        <Grid xs={12} sm={12} md={12} item>
          {isSuper() ?
            <FormControl className={classes.selectContainer}>
              <TextField
                id='mpaccesstoken'
                name='mpaccesstoken'
                margin='dense'
                label='Access Token'
                variant='outlined'
                value={mpaccesstokenType}
                onChange={async (e) => {
                  handleChangempaccesstoken(e.target.value);
                }}
              ></TextField>
              <FormHelperText>
                {loadingmpaccesstokenType && i18n.t("settings.settings.options.updating")}
              </FormHelperText>
            </FormControl>
            : null}
        </Grid>
      </Grid>

      <Grid spacing={3} container>
        {isSuper() ?
          <Tabs
            indicatorColor='primary'
            textColor='primary'
            scrollButtons='on'
            variant='scrollable'
            className={classes.tab}
            style={{
              marginBottom: 20,
              marginTop: 20,
            }}
          >
            <Tab label='Stripe' />
          </Tabs>
          : null}
      </Grid>

      <Grid spacing={3} container style={{ marginBottom: 10 }}>
        <Grid xs={12} sm={12} md={12} item>
          {isSuper() ?
            <FormControl className={classes.selectContainer}>
              <TextField
                id='stripeprivatekey'
                name='stripeprivatekey'
                margin='dense'
                label='Stripe Private Key'
                variant='outlined'
                value={stripeprivatekeyType}
                onChange={async (e) => {
                  handleChangestripeprivatekey(e.target.value);
                }}
              ></TextField>
              <FormHelperText>
                {loadingstripeprivatekeyType && i18n.t("settings.settings.options.updating")}
              </FormHelperText>
            </FormControl>
            : null}
        </Grid>
      </Grid>

      <Grid spacing={3} container>
        {isSuper() ?
          <Tabs
            indicatorColor='primary'
            textColor='primary'
            scrollButtons='on'
            variant='scrollable'
            className={classes.tab}
            style={{
              marginBottom: 20,
              marginTop: 20,
            }}
          >
            <Tab label='Asaas' />
          </Tabs>
          : null}
      </Grid>

      <Grid spacing={3} container style={{ marginBottom: 10 }}>
        <Grid xs={12} sm={12} md={12} item>
          {isSuper() ?
            <FormControl className={classes.selectContainer}>
              <TextField
                id='asaastoken'
                name='asaastoken'
                margin='dense'
                label='Asaas API Key'
                variant='outlined'
                value={asaastokenType}
                onChange={async (e) => {
                  handleChangeasaastoken(e.target.value);
                }}
              ></TextField>
              <FormHelperText>
                {loadingasaastokenType && i18n.t("settings.settings.options.updating")}
              </FormHelperText>
            </FormControl>
            : null}
        </Grid>
      </Grid>

      <Grid spacing={3} container style={{ marginBottom: 10 }}>
        <Grid xs={12} sm={6} md={6} item>
          <FormControl className={classes.selectContainer}>
            <TextField
              id="transferMessage"
              name="transferMessage"
              margin="dense"
              multiline
              rows={3}
              label={i18n.t("settings.settings.customMessages.transferMessage")}
              variant="outlined"
              value={transferMessage}
              required={SettingsTransfTicket === "enabled"}
              onChange={async (e) => {
                handletransferMessage(e.target.value);
              }}
            >
            </TextField>
            <FormHelperText>
              {loadingTransferMessage && i18n.t("settings.settings.options.updating")}
            </FormHelperText>
          </FormControl>
        </Grid>

        <Grid xs={12} sm={6} md={6} item>
          <FormControl className={classes.selectContainer}>
            <TextField
              id="greetingAcceptedMessage"
              name="greetingAcceptedMessage"
              margin="dense"
              multiline
              rows={3}
              label={i18n.t("settings.settings.customMessages.greetingAcceptedMessage")}
              variant="outlined"
              value={greetingAcceptedMessage}
              required={SendGreetingAccepted === "enabled"}
              onChange={async (e) => {
                handleGreetingAcceptedMessage(e.target.value);
              }}
            >
            </TextField>
            <FormHelperText>
              {loadingGreetingAcceptedMessage && i18n.t("settings.settings.options.updating")}
            </FormHelperText>
          </FormControl>
        </Grid>

        <Grid xs={12} sm={6} md={6} item>
          <FormControl className={classes.selectContainer}>
            <TextField
              id="AcceptCallWhatsappMessage"
              name="AcceptCallWhatsappMessage"
              margin="dense"
              multiline
              rows={3}
              label={i18n.t("settings.settings.customMessages.AcceptCallWhatsappMessage")}
              variant="outlined"
              required={AcceptCallWhatsapp === "disabled"}
              value={AcceptCallWhatsappMessage}
              onChange={async (e) => {
                handleAcceptCallWhatsappMessage(e.target.value);
              }}
            >
            </TextField>
            <FormHelperText>
              {loadingAcceptCallWhatsappMessage && i18n.t("settings.settings.options.updating")}
            </FormHelperText>
          </FormControl>
        </Grid>

        <Grid xs={12} sm={6} md={6} item>
          <FormControl className={classes.selectContainer}>
            <TextField
              id="sendQueuePositionMessage"
              name="sendQueuePositionMessage"
              margin="dense"
              multiline
              required={sendQueuePosition === "enabled"}
              rows={3}
              label={i18n.t("settings.settings.customMessages.sendQueuePositionMessage")}
              variant="outlined"
              value={sendQueuePositionMessage}
              onChange={async (e) => {
                handlesendQueuePositionMessage(e.target.value);
              }}
            >
            </TextField>
            <FormHelperText>
              {loadingSendQueuePositionMessage && i18n.t("settings.settings.options.updating")}
            </FormHelperText>
          </FormControl>
        </Grid>
      </Grid>

      {/* Seção Meta / WhatsApp Embedded Signup removida: configure na aba Instagram/Facebook */}

      {/* ── Seção: Limpeza das pastas (mídias) — apenas Super Admin ── */}
      {isSuper() && (
      <div style={{
        background: ds.sectionBg,
        border: ds.sectionBorder,
        borderRadius: 14,
        padding: "28px 28px 22px 28px",
        marginTop: 28,
      }}>
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 18 }}>
          <div style={{
            width: 4,
            height: 28,
            borderRadius: 4,
            background: "#4E93FF",
          }} />
          <span style={{
            fontWeight: 700,
            fontSize: 17,
            color: ds.titleColor,
            letterSpacing: "-0.01em",
          }}>
            {i18n.t("settingsOptions.publicFolderRetention") || "Limpeza das pastas (mídias)"}
          </span>
        </div>
        <p style={{ fontSize: 13, color: ds.subtextColor, marginBottom: 20 }}>
          {i18n.t("settingsOptions.publicFolderHelp") ||
            "A remoção de duplicados roda sempre e é segura (nenhuma mídia desaparece). A limpeza por idade apaga apenas os tipos de mídia que você selecionar abaixo."}
        </p>

        <Grid container spacing={2} alignItems="flex-start">
          {/* Período de retenção */}
          <Grid xs={12} sm={6} md={4} item>
            <FormControl className={classes.selectContainer} fullWidth>
              <InputLabel id="publicFolderRetention-label">
                {i18n.t("settingsOptions.publicFolderPeriodLabel") || "Período de retenção"}
              </InputLabel>
              <Select
                labelId="publicFolderRetention-label"
                value={publicFolderRetention}
                onChange={(e) => handlePublicFolderRetention(e.target.value)}
                disabled={loadingPublicFolderRetention}
              >
                <MenuItem value={"disabled"}>
                  {i18n.t("settingsOptions.publicFolderDisabled") || "Desativada"}
                </MenuItem>
                <MenuItem value={"1"}>
                  {i18n.t("settingsOptions.publicFolder1Month") || "Manter 1 mês"}
                </MenuItem>
                <MenuItem value={"2"}>
                  {i18n.t("settingsOptions.publicFolder2Months") || "Manter 2 meses"}
                </MenuItem>
                <MenuItem value={"3"}>
                  {i18n.t("settingsOptions.publicFolder3Months") || "Manter 3 meses"}
                </MenuItem>
                <MenuItem value={"6"}>
                  {i18n.t("settingsOptions.publicFolder6Months") || "Manter 6 meses"}
                </MenuItem>
                <MenuItem value={"12"}>
                  {i18n.t("settingsOptions.publicFolder12Months") || "Manter 12 meses"}
                </MenuItem>
              </Select>
              <FormHelperText>
                {i18n.t("settingsOptions.publicFolderPeriodHelp") ||
                  "Define por quanto tempo as mídias são mantidas antes da limpeza."}
              </FormHelperText>
            </FormControl>
          </Grid>

          {/* Tipos de mídia que podem ser apagados pela limpeza */}
          <Grid xs={12} sm={6} md={4} item>
            <FormControl className={classes.selectContainer} fullWidth>
              <InputLabel id="publicFolderCleanTypes-label">
                {i18n.t("settingsOptions.publicFolderTypesLabel") || "Tipos de mídia da limpeza"}
              </InputLabel>
              <Select
                labelId="publicFolderCleanTypes-label"
                multiple
                value={publicFolderCleanTypes}
                onChange={(e) => handlePublicFolderCleanTypes(e.target.value)}
                disabled={loadingPublicFolderCleanTypes}
                renderValue={(selected) =>
                  selected.length === 0
                    ? (i18n.t("settingsOptions.publicFolderTypesNone") || "Nenhum (não apaga nada)")
                    : selected
                        .map((v) => MEDIA_TYPE_LABELS[v] || v)
                        .join(", ")
                }
              >
                {Object.keys(MEDIA_TYPE_LABELS).map((key) => (
                  <MenuItem key={key} value={key}>
                    <Checkbox
                      color="primary"
                      checked={publicFolderCleanTypes.indexOf(key) > -1}
                    />
                    <ListItemText primary={MEDIA_TYPE_LABELS[key]} />
                  </MenuItem>
                ))}
              </Select>
              <FormHelperText>
                {i18n.t("settingsOptions.publicFolderTypesHelp") ||
                  "Só os tipos marcados são apagados por idade. Áudio e documentos ficam preservados se não forem marcados."}
              </FormHelperText>
            </FormControl>
          </Grid>

          {/* Tamanho atual */}
          <Grid xs={12} sm={6} md={4} item>
            <div style={{
              border: ds.cardBorder,
              background: ds.cardBg,
              borderRadius: 10,
              padding: "14px 16px",
            }}>
              <div style={{ fontSize: 12, color: ds.labelColor, marginBottom: 6 }}>
                {i18n.t("settingsOptions.publicFolderCurrentSize") || "Tamanho atual"}
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: ds.titleColor }}>
                {loadingFolderInfo
                  ? (i18n.t("settingsOptions.publicFolderLoading") || "Calculando...")
                  : formatBytes(folderInfo.totalBytes)}
              </div>
              <div style={{ fontSize: 12, color: ds.mutedColor, marginTop: 4 }}>
                {folderInfo.fileCount !== null && folderInfo.fileCount !== undefined
                  ? `${folderInfo.fileCount} ${i18n.t("settingsOptions.publicFolderFiles") || "arquivo(s)"}`
                  : "—"}
              </div>
              {/* Este número é o que está no disco HOJE — não reage ao período
                  de retenção, e não deveria mesmo. Quem trocava "Manter 1 mês"
                  por "Manter 6 meses" e via os mesmos 86 MB achava que a tela
                  estava travada. Quem responde ao período é o card ao lado. */}
              <div style={{ fontSize: 11, color: ds.mutedColor, marginTop: 6, lineHeight: 1.3 }}>
                {i18n.t("settingsOptions.publicFolderCurrentSizeHelp") ||
                  "Total no disco hoje. Não muda ao trocar o período — veja a prévia ao lado."}
              </div>
            </div>
          </Grid>

          {/* Tamanho após limpeza */}
          <Grid xs={12} sm={6} md={4} item>
            <div style={{
              border: ds.cardBorder,
              background: ds.cardBg,
              borderRadius: 10,
              padding: "14px 16px",
            }}>
              <div style={{ fontSize: 12, color: ds.labelColor, marginBottom: 6 }}>
                {i18n.t("settingsOptions.publicFolderSizeAfter") || "Tamanho após limpeza"}
              </div>
              <div style={{ fontSize: 22, fontWeight: 700, color: ds.titleColor }}>
                {loadingFolderPreview
                  ? (i18n.t("settingsOptions.publicFolderLoading") || "Calculando...")
                  : lastCleanResult
                  ? formatBytes(lastCleanResult.remainingBytes)
                  : folderPreview
                  ? formatBytes(folderPreview.remainingBytes)
                  : "—"}
              </div>
              <div style={{ fontSize: 12, color: ds.mutedColor, marginTop: 4 }}>
                {lastCleanResult
                  ? `${i18n.t("settingsOptions.publicFolderFreed") || "Liberado"}: ${formatBytes(lastCleanResult.freedBytes)} · ${lastCleanResult.deletedFiles ?? 0} ${i18n.t("settingsOptions.publicFolderFiles") || "arquivo(s)"}`
                  : folderPreview
                  ? `${i18n.t("settingsOptions.publicFolderWouldFree")}: ${formatBytes(folderPreview.freedBytes)} · ${folderPreview.deletedFiles ?? 0} ${i18n.t("settingsOptions.publicFolderFiles")}`
                  : publicFolderRetention === "disabled"
                  ? (i18n.t("settingsOptions.publicFolderRetentionDisabledHint") || "Selecione um período de retenção pra ver a prévia")
                  /* Faltava este caso. Sem NENHUM tipo de mídia marcado, a
                     prévia nunca é calculada (fetchFolderPreview sai antes de
                     chamar a API) e o card ficava eternamente em "Nenhuma
                     limpeza executada ainda" — mesmo trocando o período. Sem
                     essa frase não havia como o usuário descobrir que o que
                     faltava era marcar os tipos ali em cima. */
                  : publicFolderCleanTypes.length === 0
                  ? (i18n.t("settingsOptions.publicFolderNoTypesHint") || "Marque os tipos de mídia acima para ver a prévia")
                  : (i18n.t("settingsOptions.publicFolderNoCleanYet") || "Nenhuma limpeza executada ainda")}
              </div>
              {/* Quanto os tipos escolhidos ocupam no total (qualquer idade).
                  Sem isso, um "Seria liberado: 0 B" não dizia se é porque não
                  existe aquele tipo de arquivo ou porque nenhum é antigo o
                  bastante — a comparação era com o tamanho da pasta INTEIRA,
                  que mede outra coisa. */}
              {(() => {
                // Usa o resultado da limpeza quando acabou de limpar, senão o
                // preview. Antes olhava só o preview, então logo depois de
                // clicar em "Limpar agora" esta linha sumia — justo no momento
                // em que o usuário mais precisa entender por que nada foi
                // liberado.
                const info = lastCleanResult || folderPreview;
                if (!info || info.selectedFiles === undefined) return null;
                const nada = !info.deletedFiles;
                return (
                  <div style={{ fontSize: 12, color: ds.mutedColor, marginTop: 2 }}>
                    {i18n.t("settingsOptions.publicFolderSelectedTotal")}:{" "}
                    {formatBytes(info.selectedBytes || 0)} ·{" "}
                    {info.selectedFiles || 0}{" "}
                    {i18n.t("settingsOptions.publicFolderFiles")}
                    {info.selectedFiles > 0 && nada &&
                      ` — ${i18n.t("settingsOptions.publicFolderAllRecent")}`}
                    {/* Data de corte explícita: só some do disco o que for
                        ANTERIOR a ela. Sem mostrar isso, "limpei e não
                        diminuiu" parece defeito, quando na verdade é a
                        retenção escolhida sendo maior que a idade das
                        mídias. */}
                    {info.cutoff && (
                      <div style={{ marginTop: 2 }}>
                        {i18n.t("settingsOptions.publicFolderCutoff")}:{" "}
                        {new Date(info.cutoff).toLocaleDateString()}
                      </div>
                    )}
                  </div>
                );
              })()}
            </div>
          </Grid>
        </Grid>

        <div style={{ display: "flex", gap: 10, marginTop: 18, flexWrap: "wrap" }}>
          <Button
            variant="contained"
            color="primary"
            size="small"
            onClick={handleDedupePublicFolder}
            disabled={dedupingPublicFolder}
          >
            {dedupingPublicFolder
              ? i18n.t("settingsOptions.publicFolderDeduping") || "Removendo duplicados..."
              : i18n.t("settingsOptions.publicFolderDedupeNow") || "Remover duplicados"}
          </Button>
          <Button
            variant="outlined"
            color="secondary"
            size="small"
            onClick={handleCleanPublicFolderNow}
            disabled={cleaningPublicFolder || publicFolderCleanTypes.length === 0}
          >
            {cleaningPublicFolder
              ? i18n.t("settingsOptions.cleaning") || "Limpando..."
              : i18n.t("settingsOptions.publicFolderCleanNow") || "Limpar por idade"}
          </Button>
          <Button
            variant="outlined"
            color="primary"
            size="small"
            onClick={handleRefreshFolderSizes}
            disabled={loadingFolderInfo || loadingFolderPreview}
          >
            {i18n.t("settingsOptions.publicFolderRefresh") || "Atualizar tamanho"}
          </Button>
        </div>

        {lastDedupeResult && (
          <div style={{ fontSize: 12, color: ds.mutedColor, marginTop: 10 }}>
            {`${lastDedupeResult.duplicates ?? 0} duplicado(s) · ${formatBytes(lastDedupeResult.freedBytes ?? 0)} liberados`}
          </div>
        )}

      </div>
      )}
    </>

  );
}
