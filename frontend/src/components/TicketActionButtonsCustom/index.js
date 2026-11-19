import React, { useContext, useState, useEffect, useRef, useCallback, Suspense } from "react";
import EventIcon from "@material-ui/icons/Event";
import { useHistory } from "react-router-dom";


import { Can } from "../Can";
import { makeStyles } from "@material-ui/core/styles";
import { IconButton, Menu, CircularProgress, useMediaQuery, Dialog, DialogTitle, DialogContent, DialogActions } from "@material-ui/core";

// Ícones do cabeçalho do ticket no estilo MUI 5 (outlined/rounded, mais finos e modernos)
import DeviceHubOutlinedIcon from "@mui/icons-material/DeviceHubOutlined";
import HistoryRoundedIcon from "@mui/icons-material/HistoryRounded";
import MoreVertRoundedIcon from "@mui/icons-material/MoreVertRounded";
import SwapHorizOutlinedIcon from "@mui/icons-material/SwapHorizOutlined";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import AutorenewRoundedIcon from "@mui/icons-material/AutorenewRounded";
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import BoltOutlinedIcon from "@mui/icons-material/BoltOutlined";
import PictureAsPdfOutlinedIcon from "@mui/icons-material/PictureAsPdfOutlined";
import AccountBalanceWalletOutlinedIcon from "@mui/icons-material/AccountBalanceWalletOutlined";
import HighlightOffRoundedIcon from "@mui/icons-material/HighlightOffRounded";
import UndoRoundedIcon from "@mui/icons-material/UndoRounded";
import PhoneRoundedIcon from "@mui/icons-material/PhoneRounded";
import WhatsAppIcon from "@mui/icons-material/WhatsApp";
import DeleteOutlineRoundedIcon from "@mui/icons-material/DeleteOutlineRounded";
import IntegrationInstructionsOutlinedIcon from "@mui/icons-material/IntegrationInstructionsOutlined";
import DescriptionOutlinedIcon from "@mui/icons-material/DescriptionOutlined";
import GetAppRoundedIcon from "@mui/icons-material/GetAppRounded";
import SmartToyOutlinedIcon from "@mui/icons-material/SmartToyOutlined";
import CheckCircleOutlineRoundedIcon from "@mui/icons-material/CheckCircleOutlineRounded";
import { v4 as uuidv4 } from "uuid";

import { i18n } from "../../translate/i18n";
import api from "../../services/api";
// import TicketOptionsMenu from "../TicketOptionsMenu";
import ButtonWithSpinner from "../ButtonWithSpinner";
import toastError from "../../errors/toastError";
import usePlans from "../../hooks/usePlans";
import { AuthContext } from "../../context/Auth/AuthContext";
import { TicketsContext } from "../../context/Tickets/TicketsContext";
import Tooltip from "@material-ui/core/Tooltip";
import ConfirmationModal from "../ConfirmationModal";
import * as Yup from "yup";
import { Formik, Form } from "formik";



import Button from "@material-ui/core/Button";

// ✅ Todos os imports estáticos ANTES dos React.lazy
import ScheduleModal from "../ScheduleModal";
import MenuItem from "@material-ui/core/MenuItem";
import { Switch } from "@material-ui/core";
import ShowTicketOpen from "../ShowTicketOpenModal";
import { toast } from "react-toastify";
import useCompanySettings from "../../hooks/useSettings/companySettings";
import { useTheme } from "@material-ui/styles";
import html2pdf from "../../utils/html2pdf";
import QuickMessageModal from "../QuickMessageModal";
import FloupSelector from "../FloupSelector";
import TemplateModal from "../TemplateMetaModal";
import SalesAgentScheduleModal from "../SalesAgentScheduleModal";
import { CalendarClock } from "lucide-react";




// ✅ React.lazy SEMPRE depois de todos os imports estáticos
const TransferTicketModalCustom = React.lazy(() => import("../TransferTicketModalCustom"));
const AcceptTicketWithouSelectQueue = React.lazy(() => import("../AcceptTicketWithoutQueueModal"));
const NewTicketModal = React.lazy(() => import("../NewTicketModal"));
const ShowTicketLogModal = React.lazy(() => import("../../components/ShowTicketLogModal"));
const TicketMessagesDialog = React.lazy(() => import("../TicketMessagesDialog"));
const FinalizacaoVendaModal = React.lazy(() => import("../FinalizacaoVendaModal"));
const CloseTicketModal = React.lazy(() => import("../CloseTicketModal"));
const TicketReportModal = React.lazy(() => import("../TicketReportModal"));

const useStyles = makeStyles((theme) => ({
  actionButtons: {
    marginRight: 8,
    flex: "none",
    flexShrink: 0,
    alignSelf: "center",
    marginLeft: "auto",
    display: "flex",
    alignItems: "center",
    gap: 2,
    // Cápsula removida a pedido — os ícones ficam soltos, sem nenhum
    // contorno agrupando todos juntos.
    "& > *": {
      margin: 0,
    },
    "& .MuiIconButton-root": {
      padding: "4px !important",
      borderRadius: "8px !important",
      border: "none !important",
      boxShadow: "none !important",
      transition: "all 0.2s ease",
      "&:hover": {
        backgroundColor: theme.mode === "dark" ? "rgba(255,255,255,0.08)" : "rgba(0,0,0,0.04)",
      },
      // Remove o anel de foco redondo que o MUI desenha por padrão (fica
      // sobrando um círculo visível ao redor do ícone, destoando do resto
      // que agora é quadrado arredondado).
      "&:focus, &:focus-visible": {
        outline: "none !important",
        boxShadow: "none !important",
      },
      "& .MuiTouchRipple-root": {
        borderRadius: "8px !important",
      },
    },
    // Padroniza TODOS os ícones dessa fileira em 18px de uma vez — a maioria
    // (alvo, copiar, raio, PDF, telefone) não tinha fontSize definido e caía
    // no padrão nativo do MUI (~24px), maior que o menu de 3 pontos, que era
    // o único ícone já correto. Regra no container pega qualquer ícone
    // colocado aqui, mesmo os que passarem despercebidos.
    "& .MuiSvgIcon-root": {
      fontSize: "18px !important",
    },
    [theme.breakpoints.down("sm")]: {
      marginRight: 2,
      gap: 0,
      "& .MuiIconButton-root": {
        padding: 4,
      },
    },
  },
  bottomButtonVisibilityIcon: {
    padding: 6,
    color: theme.mode === "dark" ? "#94a3b8" : "#64748b",
    transition: "all 0.2s ease",
    "&:hover": {
      color: theme.palette.primary.main,
    },
    "& .MuiSvgIcon-root": {
      fontSize: 20,
    },
    "@media (max-width: 960px)": {
      display: "none",
    },
  },
  botoes: {
    display: "flex",
    padding: "15px",
    justifyContent: "flex-end",
    maxWidth: "100%",
  },
}));

const SessionSchema = Yup.object().shape({
  ratingId: Yup.string().required(i18n.t("ticketActionExtra.ratingRequired")),
});

const TicketActionButtonsCustom = ({
  ticket,
  contact,
  onQuickMessageSelect,
  // , showSelectMessageCheckbox,
  // selectedMessages,
  // forwardMessageModalOpen,
  // setForwardMessageModalOpen
}) => {
  const classes = useStyles();
  const theme = useTheme();
  const isMobile = useMediaQuery("(max-width: 960px)");
  const history = useHistory();
  const isMounted = useRef(true);
  const [loading, setLoading] = useState(false);
  const { user } = useContext(AuthContext);
  const { setCurrentTicket, setTabOpen } = useContext(TicketsContext);
  const [open, setOpen] = React.useState(false);
  const formRef = React.useRef(null);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const [transferTicketModalOpen, setTransferTicketModalOpen] = useState(false);
  const [newTicketModalOpen, setNewTicketModalOpen] = useState(false);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [agendaAgenteAberta, setAgendaAgenteAberta] = useState(false);
  const [contactId, setContactId] = useState(null);
  const [
    acceptTicketWithouSelectQueueOpen,
    setAcceptTicketWithouSelectQueueOpen,
  ] = useState(false);
  const [showTicketLogOpen, setShowTicketLogOpen] = useState(false);
  const [openTicketMessageDialog, setOpenTicketMessageDialog] = useState(false);
  const [disableBot, setDisableBot] = useState(ticket.contact.disableBot);

  const [showSchedules, setShowSchedules] = useState(false);
  const [enableIntegration, setEnableIntegration] = useState(
    ticket.useIntegration
  );

  const [openAlert, setOpenAlert] = useState(false);
  const [userTicketOpen, setUserTicketOpen] = useState("");
  const [queueTicketOpen, setQueueTicketOpen] = useState("");
  const [logTicket, setLogTicket] = useState([]);

  const [showWavoipCall, setShowWavoipCall] = useState(false);

  const { get: getSetting, update: updateSetting } = useCompanySettings();
  const { getPlanCompany } = usePlans();

  const [anchorEl, setAnchorEl] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);

  const [showTestButton, setShowTestButton] = useState(false);
  const [exportedToPDF, setExportedToPDF] = useState(false);
  const [linkingWallet, setLinkingWallet] = useState(false);

  const [openFinalizacaoVenda, setOpenFinalizacaoVenda] = useState(false);
  const [ticketDataToFinalize, setTicketDataToFinalize] = useState(null);
  const [showFinalizacaoOptions, setShowFinalizacaoOptions] = useState(false);
  const [finalizacaoTipo, setFinalizacaoTipo] = useState(null); // 'semDespedida' ou 'comDespedida'
  const [directTicketsToWallets, setDirectTicketsToWallets] = useState(false);
  const [closeTicketModalOpen, setCloseTicketModalOpen] = useState(false);
  const [enableCloseTicketModal, setEnableCloseTicketModal] = useState(true);
  const [closingTicket, setClosingTicket] = useState(false);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  
  

  // Estados para copiar telefone e respostas rápidas
  const [quickMessageModalOpen, setQuickMessageModalOpen] = useState(false);

  // Estados para template da API Oficial
  const [templateModalOpen, setTemplateModalOpen] = useState(false);
  const [templates, setTemplates] = useState([]);
  const [useWhatsappOfficial, setUseWhatsappOfficial] = useState(false);
  const [needsTemplate, setNeedsTemplate] = useState(false);
  const [aiSummarizing, setAiSummarizing] = useState(false);
  const [aiSummaryOpen, setAiSummaryOpen] = useState(false);
  const [aiSummaryText, setAiSummaryText] = useState("");
  const [autoAiSummaryEnabled, setAutoAiSummaryEnabled] = useState(true);
  const [autoAiSummaryLoaded, setAutoAiSummaryLoaded] = useState(false);

  // Carregar configuração de auto-resumo IA da empresa
  useEffect(() => {
    const loadAutoAiSummarySetting = async () => {
      try {
        const setting = await getSetting({ column: "autoAiSummary" });
        if (setting !== undefined && setting !== null) {
          setAutoAiSummaryEnabled(
            setting === true || setting === "true" || setting === "enabled"
          );
        }
        setAutoAiSummaryLoaded(true);
      } catch (err) {
        setAutoAiSummaryLoaded(true);
      }
    };
    loadAutoAiSummarySetting();
  }, []);

  // Carregar configuração do modal de fechamento de chamado
  useEffect(() => {
    const loadEnableCloseTicketModal = async () => {
      try {
        const setting = await getSetting({ column: "enableCloseTicketModal" });
        const value = setting?.enableCloseTicketModal;
        if (value !== undefined && value !== null) {
          setEnableCloseTicketModal(
            value === true || value === "true" || value === "enabled"
          );
        }
      } catch (err) {
        // mantém o padrão habilitado em caso de erro
      }
    };
    loadEnableCloseTicketModal();
  }, []);


  useEffect(() => {
    fetchData();
    checkWhatsAppTriggerIntegration();
    fetchDirectTicketsToWalletsSetting();
    fetchPlanConfig();

    // Cleanup function to set isMounted to false when the component unmounts
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
  }, [openFinalizacaoVenda]);

  useEffect(() => {
  }, [open]);

  const fetchData = async () => {
    const companyId = user.companyId;
    const planConfigs = await getPlanCompany(undefined, companyId);


    if (isMounted.current) {
      setShowSchedules(planConfigs.plan.useSchedules);
      setShowWavoipCall(planConfigs.plan.wavoip);
      setOpenTicketMessageDialog(false);
      setDisableBot(ticket.contact.disableBot);
      setShowTicketLogOpen(false);
    }
  };

  const checkWhatsAppTriggerIntegration = async () => {
    try {
      const { data } = await api.get(`/whatsapp/${ticket.whatsappId}`);
      if (isMounted.current) {
        setShowTestButton(data.triggerIntegrationOnClose === true);
      }
    } catch (err) {
      console.error(err);
      if (isMounted.current) {
        setShowTestButton(false);
      }
    }
  };

  const fetchDirectTicketsToWalletsSetting = async () => {
    try {
      const setting = await getSetting({
        column: "DirectTicketsToWallets"
      });
      if (isMounted.current) {
        setDirectTicketsToWallets(setting.DirectTicketsToWallets);
      }
    } catch (err) {
      console.error(err);
      if (isMounted.current) {
        setDirectTicketsToWallets(false);
      }
    }
  };

  const fetchPlanConfig = async () => {
    try {
      const companyId = user.companyId;
      const planConfigs = await getPlanCompany(undefined, companyId);
      if (isMounted.current) {
        setUseWhatsappOfficial(planConfigs.plan.useWhatsappOfficial);
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Fetch templates da API Oficial
  useEffect(() => {
    const fetchTemplates = async () => {
      try {
        const { data } = await api.get("/quick-messages/list", {
          params: {
            isOficial: "true",
            userId: user.id,
            companyId: user.companyId,
            status: "APPROVED",
          },
        });
        setTemplates(data || []);
      } catch (err) {
        console.error("Erro ao buscar templates:", err);
      }
    };
    if (useWhatsappOfficial && ticket.channel === "whatsapp_oficial") {
      fetchTemplates();
    }
  }, [useWhatsappOfficial, ticket.channel]);

  // Verificar janela de 24h do WhatsApp Oficial
  const checkWhatsAppWindow = useCallback(async () => {
    if (!ticket.id || ticket.channel !== "whatsapp_oficial") {
      setNeedsTemplate(false);
      return;
    }
    try {
      const { data } = await api.get(`/tickets/${ticket.id}/check-whatsapp-window`);
      setNeedsTemplate(data.needsTemplate);
    } catch (err) {
      console.error("Erro ao verificar janela de 24h:", err);
      setNeedsTemplate(false);
    }
  }, [ticket.id, ticket.channel]);

  useEffect(() => {
    if (useWhatsappOfficial && ticket.channel === "whatsapp_oficial") {
      checkWhatsAppWindow();
    }
  }, [useWhatsappOfficial, checkWhatsAppWindow]);

  const handleOpenTemplateModal = () => {
    setTemplateModalOpen(true);
  };

  const handleSendMessageTemplate = async (e) => {
    if (e.id === "") return;
    setLoading(true);
    const message = {
      templateId: e.id,
      variables: e.variables,
      bodyToSave: e.bodyToSave,
      mediaUrl: "",
    };
    try {
      await api.post(`/messages-template/${ticket.id}`, message);
      toast.success(i18n.t("ticketActionExtra.templateSent"));
    } catch (err) {
      toastError(err);
    }
    setLoading(false);
    setTemplateModalOpen(false);
  };


  const handleCopyPhone = async () => {
    try {
      if (!contact?.number) {
        toast.error(i18n.t("ticketInfo.noPhone"));
        return;
      }

      // Remove todos os caracteres não numéricos e copia o número puro
      const phoneNumber = contact.number.replace(/\D/g, '');

      // Verifica se tem pelo menos 8 dígitos (número mínimo válido)
      if (phoneNumber.length >= 8) {
        await navigator.clipboard.writeText(phoneNumber);
        toast.success(i18n.t("ticketInfo.phonecopied"));
      } else {
        toast.error(i18n.t("ticketInfo.invalidPhoneFormat"));
      }
    } catch (err) {
      console.error('Erro ao copiar telefone:', err);
      toast.error(i18n.t("ticketInfo.copyError"));
    }
  };

  // Funções para respostas rápidas
  const handleOpenQuickMessageModal = () => {
    setQuickMessageModalOpen(true);
  };

  const handleCloseQuickMessageModal = () => {
    setQuickMessageModalOpen(false);
  };

  const handleQuickMessageSelect = useCallback((selectedMessage) => {
    handleCloseQuickMessageModal();

    // Formato unificado - mesmo fluxo para texto e mídia
    const event = new CustomEvent('insertQuickMessage', {
      detail: {
        quickMessage: {
          id: selectedMessage.id,
          message: selectedMessage.message || "",
          shortcode: selectedMessage.shortcode || "",
          mediaPath: selectedMessage.mediaPath || null,
          mediaType: selectedMessage.mediaType || null,
        }
      },
      bubbles: false
    });

    window.dispatchEvent(event);
  }, []);

  const handleClickOpen = async (e) => {
    const setting = await getSetting({
      column: "requiredTag",
    });

    if (setting?.requiredTag === "enabled") {
      //verificar se tem uma tag
      try {
        const contactTags = await api.get(`/contactTags/${ticket.contact.id}`);
        if (!contactTags.data.tags) {
          toast.warning(i18n.t("messagesList.header.buttons.requiredTag"));
        } else {
          setOpen(true);
          // handleUpdateTicketStatus(e, "closed", user?.id);
        }
      } catch (err) {
        toastError(err);
      }
    } else {
      setOpen(true);
      // handleUpdateTicketStatus(e, "closed", user?.id);
    }
  };

  const handleClose = () => {
    formRef.current.resetForm();
    setOpen(false);
  };

  const handleCloseAlert = () => {
    setOpenAlert(false);
    setLoading(false);
  };
  const handleOpenAcceptTicketWithouSelectQueue = async () => {
    setAcceptTicketWithouSelectQueueOpen(true);
  };

  const handleMenu = (event) => {
    setAnchorEl(event.currentTarget);
    setMenuOpen(true);
  };

  const handleCloseMenu = () => {
    setAnchorEl(null);
    setMenuOpen(false);
  };

  const handleOpenTransferModal = (e) => {
    setTransferTicketModalOpen(true);
    if (typeof handleClose == "function") handleClose();
  };

  const handleOpenConfirmationModal = (e) => {
    setConfirmationOpen(true);
    if (typeof handleClose == "function") handleClose();
  };

  const handleCloseTicketWithoutFarewellMsg = async () => {
    setLoading(true);
    try {
      // Auto-resumo IA antes de fechar
      autoSaveAiSummary();

      await api.put(`/tickets/${ticket.id}`, {
        status: "closed",
        userId: user?.id || null,
        sendFarewellMessage: false,
        amountUsedBotQueues: 0,
      });

      setLoading(false);
      history.push("/tickets");
    } catch (err) {
      setLoading(false);
      toastError(err);
    }
  };

  const handleExportPDF = async () => {
    setOpenTicketMessageDialog(true);
    handleCloseMenu();
  };

  const handleAiSummarize = async () => {
    handleCloseMenu();
    setAiSummarizing(true);
    try {
      const { data } = await api.post(`/messages/${ticket.id}/ai-summarize`);
      if (data.summary) {
        setAiSummaryText(data.summary);
        setAiSummaryOpen(true);
      }
    } catch (err) {
      toastError(err);
    } finally {
      setAiSummarizing(false);
    }
  };

  // Auto-gerar resumo IA e salvar como nota ao finalizar ticket
  const autoSaveAiSummary = async () => {
    if (!autoAiSummaryEnabled) return;
    try {
      const { data } = await api.post(`/messages/${ticket.id}/ai-summarize`);
      if (data.summary) {
        const cId = ticket.contact?.id || ticket.contactId || contact?.id;
        if (!cId) return;
        await api.post("/ticket-notes", {
          note: `📋 [Resumo IA - Auto]\n${data.summary}`,
          ticketId: ticket.id,
          contactId: Number(cId),
        });
      }
    } catch (err) {
      console.error("[autoSaveAiSummary] Erro ao gerar resumo:", err);
      // Silencioso - não bloqueia a finalização do ticket
    }
  };

  const handleEnableIntegration = async () => {
    setLoading(true);
    try {
      await api.put(`/tickets/${ticket.id}`, {
        useIntegration: !enableIntegration,
      });
      setEnableIntegration(!enableIntegration);

      setLoading(false);
    } catch (err) {
      setLoading(false);
      toastError(err);
    }
  };

  const handleShowLogTicket = async () => {
    setShowTicketLogOpen(true);
  };

  const handleContactToggleDisableBot = async () => {
    const { id } = ticket.contact;

    try {
      const { data } = await api.put(`/contacts/toggleDisableBot/${id}`);
      ticket.contact.disableBot = data.disableBot;
      setDisableBot(data.disableBot);
    } catch (err) {
      toastError(err);
    }
  };

  const handleCloseTransferTicketModal = () => {
    setTransferTicketModalOpen(false);
  };

  const handleOpenNewTicketModal = () => {
    setNewTicketModalOpen(true);
  };

  const handleCloseNewTicketModal = (newTicket) => {
    setNewTicketModalOpen(false);
    if (newTicket) {
      // Se um novo ticket foi criado, redirecionar para ele
      setCurrentTicket({ id: newTicket.id, uuid: newTicket.uuid, code: uuidv4() });
      history.push(`/tickets/${newTicket.uuid}`);
    }
  };

  const handleDeleteTicket = async () => {
    try {
      await api.delete(`/tickets/${ticket.id}`);
      history.push("/tickets");
    } catch (err) {
      toastError(err);
    }
  };

  const handleSendMessage = async (id) => {
    let setting;

    try {
      setting = await getSetting({
        column: "greetingAcceptedMessage",
      });
    } catch (err) {
      toastError(err);
    }
    if (!setting.greetingAcceptedMessage) {
      toast.warning(
        i18n.t("messagesList.header.buttons.greetingAcceptedMessage")
      );
      return;
    }
    const msg = `${setting.greetingAcceptedMessage}`; //`{{ms}} *{{name}}*, ${i18n.t("mainDrawer.appBar.user.myName")} *${user?.name}* ${i18n.t("mainDrawer.appBar.user.continuity")}.`;
    const message = {
      read: 1,
      fromMe: true,
      mediaUrl: "",
      body: `${msg.trim()}`,
    };
    try {
      await api.post(`/messages/${id}`, message);
    } catch (err) {
      toastError(err);
    }
  };

  const handleUpdateTicketStatus = async (e, status, userId) => {
    setLoading(true);
    try {
      // Auto-resumo IA ao fechar ticket
      if (status === "closed") {
        autoSaveAiSummary();
      }

      await api.put(`/tickets/${ticket.id}`, {
        status: status,
        userId: userId || null,
      });

      let setting;

      try {
        setting = await getSetting({
          column: "sendGreetingAccepted",
        });
      } catch (err) {
        toastError(err);
      }

      if (
        setting?.sendGreetingAccepted === "enabled" &&
        (!ticket.isGroup || ticket.whatsapp?.groupAsTicket === "enabled") &&
        ticket.status === "pending"
      ) {
        handleSendMessage(ticket.id);
      }

      if (isMounted.current) {
        setLoading(false);
      }

      if (status === "open" || status === "group") {
        setCurrentTicket({ ...ticket, code: "#" + status });
        setTimeout(() => {
          history.push("/tickets");
        }, 0);

        setTimeout(() => {
          history.push(`/tickets/${ticket.uuid}`);
          setTabOpen(status);
        }, 10);
      } else {
        setCurrentTicket({ id: null, code: null });
        history.push("/tickets");
      }
    } catch (err) {
      if (isMounted.current) {
        setLoading(false);
      }
      toastError(err);
    }
  };

  const handleAcepptTicket = async (id) => {
    setLoading(true);
    try {
      const otherTicket = await api.put(`/tickets/${id}`, {
        status: ticket.isGroup ? "group" : "open",
        userId: user?.id,
      });
      if (otherTicket.data.id !== ticket.id) {
        if (otherTicket.data.userId !== user?.id) {
          if (isMounted.current) {
            setOpenAlert(true);
            setUserTicketOpen(otherTicket.data.user.name);
            setQueueTicketOpen(otherTicket.data.queue.name);
            setTabOpen(otherTicket.isGroup ? "group" : "open");
          }
        } else {
          if (isMounted.current) {
            setLoading(false);
            setTabOpen(otherTicket.isGroup ? "group" : "open");
          }
          history.push(`/tickets/${otherTicket.data.uuid}`);
        }
      } else {
        if (isMounted.current) {
          setLoading(false);
        }
        history.push("/tickets");
        setTimeout(() => {
          history.push(`/tickets/${ticket.uuid}`);
          setTabOpen(ticket.isGroup ? "group" : "open");
        }, 1000);
      }
    } catch (err) {
      if (isMounted.current) {
        setLoading(false);
      }
      toastError(err);
    }
  };

  //Wavoip historic
  const saveHistoricalLink = async (payload) => {
    const callHistorical = await api.post(`/call/historical/wavoip`, payload);
  }
  //Wavoip conect
  const handleOpenWavoipCall = async () => {
    if (!ticket?.whatsapp?.wavoip || !ticket?.contact?.number) {
      toastError(i18n.t("ticketActionExtra.tokenError"));
      return;
    }

    const token = ticket.whatsapp.wavoip;
    
    // ✅ FIX LID: Detectar LIDs e usar número real do contato
    // LIDs podem ter diferentes formatos: >= 15 dígitos, começar com 0, ou conter padrões não-telefônicos
    const isLidNumber = (num) => {
      if (!num) return true;
      const digits = num.replace(/\D/g, "");
      // LID: >= 15 dígitos, começa com 0, ou não parece um telefone válido (muito curto ou padrão estranho)
      if (digits.length >= 15) return true;
      if (digits.startsWith("0") && digits.length > 10) return true;
      // LIDs típicos: 0101620904079, números que não começam com código de país válido
      if (digits.length >= 12 && digits.startsWith("010")) return true;
      return false;
    };

    let phone = (ticket.contact.number || "").replace(/\D/g, "");
    
    if (isLidNumber(phone)) {
      // Tentar extrair do remoteJid (formato: 5511999998888@s.whatsapp.net)
      const remoteJid = ticket.contact.remoteJid || "";
      const fromJid = remoteJid.split("@")[0].replace(/\D/g, "");
      if (fromJid && !isLidNumber(fromJid)) {
        phone = fromJid;
      } else {
        console.warn(`[WaVoIP-Fix] Número LID detectado e remoteJid também é LID ou vazio. number=${ticket.contact.number}, remoteJid=${remoteJid}`);
      }
    }
    const name = ticket.contact.name;
    const url = `https://app.wavoip.com/call?token=${token}&phone=${phone}&name=${name}&start_if_ready=true&close_after_call=true`;

    try {
      await saveHistoricalLink({
        "user_id": ticket?.user?.id || null,
        "token_wavoip": token,
        "whatsapp_id": ticket?.whatsapp?.id || null,
        "contact_id": ticket?.contact?.id || null,
        "company_id": ticket?.company?.id || null,
        "phone_to": phone,
        "name": name,
        "url": url,
        "createdAt": new Date()
      });

    } catch (e) {
    }

    window.open(url, "wavoip", "toolbar=no,scrollbars=no,resizable=no,top=500,left=500,width=500,height=700");
  };

  const handleExportToPDF = () => {
    const messagesListElement = document.getElementById("messagesList");
    const headerElement = document.getElementById("TicketHeader");

    const pdfOptions = {
      margin: 1,
      filename: `${i18n.t("whatsappModalRel.form.reportFilename")}${ticket.id
        }.pdf`,
      image: { type: "jpeg", quality: 0.98 },
      html2canvas: { scale: 2 },
      jsPDF: { unit: "mm", format: "a4", orientation: "portrait" },
    };

    if (messagesListElement && headerElement) {
      const headerClone = headerElement.cloneNode(true);
      const messagesListClone = messagesListElement.cloneNode(true);

      const containerElement = document.createElement("div");
      containerElement.appendChild(headerClone);
      containerElement.appendChild(messagesListClone);

      return html2pdf().from(containerElement).set(pdfOptions).output("blob");
    } else {
      toast.error(i18n.t("whatsappModalRel.form.elementNotFoundForExport"));
      return null;
    }
  };

  const handleTestButton = async () => {
    try {
      if (ticket?.whatsapp?.integrationTypeId) {
        const { data: integration } = await api.get(
          `/queueIntegration/${ticket.whatsapp.integrationTypeId}`
        );

        if (integration) {
          await api.post(`/queueIntegration/testsession`, {
            integrationId: ticket.whatsapp.integrationTypeId,
            ticketId: ticket.id,
            contactId: ticket.contactId,
            body: ticket.lastMessage?.body || "",
            status: "closed",
          });

          if (isMounted.current) {
            toast.success(i18n.t("ticketList.success.integrationTriggered"));
          }
        }
      }

      await handleUpdateTicketStatus(
        null,
        "closed",
        user?.id,
        ticket?.queue?.id
      );

      if (isMounted.current) {
        handleClose();
      }
    } catch (err) {
      toastError(err);
    }
  };

  const handleLinkToWallet = async () => {
    if (!ticket.contactId) {
      toast.error(i18n.t("contactModal.saveFirst"));
      return;
    }

    setLinkingWallet(true);
    try {
      if (!user.queues || user.queues.length === 0) {
        toast.error(i18n.t("contactModal.walletError"));
        return;
      }

      // Usa a primeira fila do usuário
      const userQueue = user.queues[0];

      await api.put(`/contacts/wallet/${ticket.contactId}`, {
        wallets: {
          userId: user.id,
          queueId: ticket.queueId || userQueue.id,
        },
      });

      toast.success(i18n.t("contactModal.walletLinked"));
    } catch (err) {
      toastError(err);
    } finally {
      setLinkingWallet(false);
    }
  };

  const handleFinalizarTicket = async (tipo) => {
    if (
      user.finalizacaoComValorVendaAtiva === true ||
      user.finalizacaoComValorVendaAtiva === "true"
    ) {
      setFinalizacaoTipo(tipo);
      setOpenFinalizacaoVenda(true);
    } else {
      if (tipo === "semDespedida") {
        handleCloseTicketWithoutFarewellMsg();
      } else {
        handleUpdateTicketStatus(null, "closed", user?.id, ticket?.queue?.id);
      }
    }
  };

  const handleClickResolver = () => {
    if (
      user.finalizacaoComValorVendaAtiva === true ||
      user.finalizacaoComValorVendaAtiva === "true"
    ) {
      setFinalizacaoTipo("comDespedida");
      setOpenFinalizacaoVenda(true);
    } else {
      setCloseTicketModalOpen(true);
    }
  };

  const handleConfirmCloseTicket = async ({ closingSubject, closingSummary, sendRatingMessage, sendFarewellMessage }) => {
    setClosingTicket(true);
    try {
      // Auto-resumo IA ao fechar ticket
      if (autoAiSummaryEnabled) {
        autoSaveAiSummary();
      }

      await api.put(`/tickets/${ticket.id}`, {
        status: "closed",
        userId: user?.id,
        closingSubject,
        closingSummary,
        ...(sendRatingMessage !== undefined ? { sendRatingMessage } : {}),
        ...(sendFarewellMessage !== undefined ? { sendFarewellMessage } : {}),
      });

      toast.success(i18n.t("ticketActionExtra.ticketFinished"));
      setCloseTicketModalOpen(false);
      setCurrentTicket({ id: null, code: null });
      history.push("/tickets");
    } catch (err) {
      toastError(err);
    } finally {
      if (isMounted.current) {
        setClosingTicket(false);
      }
    }
  };



  const handleUpdateTicketStatusWithData = async (
    ticketData,
    sendFarewellMessage,
    finalizacaoMessage
  ) => {
    try {
      // Auto-resumo IA ao finalizar
      autoSaveAiSummary();

      await api.put(`/tickets/${ticket.id}`, {
        ...ticketData,
        sendFarewellMessage,
        finalizacaoMessage,
      });
      toast.success(i18n.t("ticketActionExtra.ticketFinished"));
      // Atualize o estado conforme necessário
    } catch (err) {
      toastError(err);
    }
  };

  // Tooltip dinâmico para copiar telefone
  const getCopyPhoneTooltip = () => {
    const usePrefixWhenCopy = localStorage.getItem('usePrefixWhenCopy') === 'true';
    const prefix = localStorage.getItem('contactCopyPrefix') || '';

    let copyTooltip = i18n.t("ticketInfo.copyPhone");
    if (usePrefixWhenCopy && prefix) {
      copyTooltip = `Copiar telefone com prefixo (${prefix})`;
    }
    return copyTooltip;
  };

  return (
    <>
      {openAlert && (
        <ShowTicketOpen
          isOpen={openAlert}
          handleClose={handleCloseAlert}
          user={userTicketOpen}
          queue={queueTicketOpen}
        />
      )}
      <Suspense fallback={null}>
      {acceptTicketWithouSelectQueueOpen && (
        <AcceptTicketWithouSelectQueue
          modalOpen={acceptTicketWithouSelectQueueOpen}
          onClose={(e) => setAcceptTicketWithouSelectQueueOpen(false)}
          ticketId={ticket.id}
          ticket={ticket}
        />
      )}
      {showTicketLogOpen && (
        <ShowTicketLogModal
          isOpen={showTicketLogOpen}
          handleClose={(e) => setShowTicketLogOpen(false)}
          ticketId={ticket.id}
        />
      )}
      {openTicketMessageDialog && (
        <TicketMessagesDialog
          open={openTicketMessageDialog}
          handleClose={() => setOpenTicketMessageDialog(false)}
          ticketId={ticket.id}
        />
      )}
      {closeTicketModalOpen && (
        <CloseTicketModal
          open={closeTicketModalOpen}
          onClose={() => setCloseTicketModalOpen(false)}
          onConfirm={handleConfirmCloseTicket}
          loading={closingTicket}
          compact={!enableCloseTicketModal}
        />
      )}
      {reportModalOpen && (
        <TicketReportModal
          open={reportModalOpen}
          onClose={() => setReportModalOpen(false)}
          ticketId={ticket.id}
        />
      )}
      </Suspense>


      {quickMessageModalOpen && (
        <QuickMessageModal
          open={quickMessageModalOpen}
          onClose={handleCloseQuickMessageModal}
          onSelect={handleQuickMessageSelect}
          companyId={user?.companyId}
          userId={user?.id}
        />
      )}

      {templateModalOpen && (
        <TemplateModal
          open={templateModalOpen}
          handleClose={() => setTemplateModalOpen(false)}
          onSelectTemplate={handleSendMessageTemplate}
          templates={templates}
        />
      )}

      <Suspense fallback={null}>
      {newTicketModalOpen && (
        <NewTicketModal
          modalOpen={newTicketModalOpen}
          onClose={handleCloseNewTicketModal}
          initialContact={contact}
        />
      )}
      </Suspense>

      <div className={classes.actionButtons}>
        <FloupSelector contact={contact} ticket={ticket} />
        {showWavoipCall && (
          <IconButton className={classes.bottomButtonVisibilityIcon} onClick={handleOpenWavoipCall}>
            <Tooltip title={i18n.t("ticketActionExtra.call") || "Ligar"}>
              <PhoneRoundedIcon style={{ color: "#22C55E" }} />
            </Tooltip>
          </IconButton>
        )}
        {ticket.status === "closed" && (
          <ButtonWithSpinner
            loading={loading}
            startIcon={<AddRoundedIcon />}
            size="small"
            onClick={handleOpenNewTicketModal}
          >
            {i18n.t("ticketListExtra.createNewTicket")}
          </ButtonWithSpinner>
        )}
        {/* <IconButton
                    className={classes.bottomButtonVisibilityIcon}
                    onClick={handleShowLogTicket}
                >
                    <Tooltip title={i18n.t("messagesList.header.buttons.logTicket")}>
                        <HistoryRoundedIcon />

                    </Tooltip>
                </IconButton> */}
        {(ticket.status === "open" || ticket.status === "group") && (
          <>
            {/* {!showSelectMessageCheckbox ? ( */}
            <>
              {/* <IconButton
                                className={classes.bottomButtonVisibilityIcon}
                                onClick={handleEnableIntegration}
                            >
                                <Tooltip title={i18n.t("messagesList.header.buttons.enableIntegration")}>
                                    {enableIntegration === true ? <DeviceHubOutlinedIcon style={{ color: "green" }} /> : <DeviceHubOutlinedIcon />}

                                </Tooltip>
                            </IconButton> */}

              {/* Ícone para copiar telefone */}
              <IconButton
                className={classes.bottomButtonVisibilityIcon}
                onClick={handleCopyPhone}
                disabled={!contact?.number}
              >
                <Tooltip title={getCopyPhoneTooltip()}>
                  <ContentCopyRoundedIcon style={{ color: "#6B7280" }} />
                </Tooltip>
              </IconButton>

              {/* Ícone para respostas rápidas */}
              <IconButton
                className={classes.bottomButtonVisibilityIcon}
                onClick={handleOpenQuickMessageModal}
              >
                <Tooltip title={i18n.t("ticketInfo.quickMessages")}>
                  <BoltOutlinedIcon style={{ color: "#F59E0B" }} />
                </Tooltip>
              </IconButton>

              {/* Ícone para enviar template da API Oficial */}
              {useWhatsappOfficial && ticket.channel === "whatsapp_oficial" && (
                <IconButton
                  className={classes.bottomButtonVisibilityIcon}
                  onClick={handleOpenTemplateModal}
                  style={needsTemplate ? {
                    position: 'relative',
                    animation: 'pulse 2s infinite',
                  } : {}}
                >
                  <Tooltip title={needsTemplate 
                    ? i18n.t("ticketActionExtra.sendTemplateExpired")
                    : i18n.t("ticketActionExtra.sendTemplate")
                  }>
                    <span style={{ position: 'relative', display: 'inline-flex' }}>
                      <WhatsAppIcon style={{ color: needsTemplate ? "#FF9800" : "#25d366" }} />
                      {needsTemplate && (
                        <span style={{
                          position: 'absolute',
                          top: -4,
                          right: -4,
                          width: 10,
                          height: 10,
                          borderRadius: '50%',
                          backgroundColor: '#f44336',
                          border: '2px solid white',
                          animation: 'pulse 1.5s infinite',
                        }} />
                      )}
                    </span>
                  </Tooltip>
                </IconButton>
              )}


              {/* Botão de vincular à carteira só aparece se NÃO houver carteira vinculada E se a configuração DirectTicketsToWallets estiver ativa */}
              {directTicketsToWallets && !(
                ticket.contact?.contactWallets &&
                ticket.contact.contactWallets.length > 0
              ) && (
                  <IconButton
                    className={classes.bottomButtonVisibilityIcon}
                    onClick={handleLinkToWallet}
                    disabled={linkingWallet}
                  >
                    <Tooltip title={i18n.t("ticketActionExtra.linkToWallet")}>
                      {linkingWallet ? (
                        <CircularProgress size={20} />
                      ) : (
                        <AccountBalanceWalletOutlinedIcon />
                      )}
                    </Tooltip>
                  </IconButton>
                )}
            </>

            {/* {showSchedules && (
                            <>
                                <IconButton className={classes.bottomButtonVisibilityIcon}>
                                    <Tooltip title={i18n.t("tickets.buttons.scredule")}>
                                        <EventIcon
                                            // color="primary"
                                            onClick={handleOpenScheduleModal}
                                        />
                                    </Tooltip>
                                </IconButton>
                            </>
                        )} */}

            {/* Bot ativo/pausado — ícone colorido com "bolinha" de status em vez
                de um toggle simples, igual à referência: roxo + ponto verde
                quando o bot está ativo, cinza/apagado quando pausado. */}
            <IconButton
              className={classes.bottomButtonVisibilityIcon}
              onClick={() => handleContactToggleDisableBot()}
              style={{ position: "relative" }}
            >
              <Tooltip
                title={
                  disableBot
                    ? (i18n.t("ticketActionExtra.botPaused") || "Bot pausado (Clique para ativar)")
                    : (i18n.t("ticketActionExtra.botActive") || "Bot ativo (Clique para pausar)")
                }
              >
                <span style={{ position: "relative", display: "inline-flex" }}>
                  <SmartToyOutlinedIcon
                    style={{
                      color: disableBot ? "#9CA3AF" : "#7C3AED",
                      backgroundColor: disableBot ? "transparent" : "#EDE9FE",
                      borderRadius: 8,
                      padding: disableBot ? 0 : 2,
                    }}
                  />
                  {!disableBot && (
                    <span
                      style={{
                        position: "absolute",
                        top: -1,
                        right: -1,
                        width: 8,
                        height: 8,
                        borderRadius: "50%",
                        backgroundColor: "#22C55E",
                        border: "1.5px solid #fff",
                      }}
                    />
                  )}
                </span>
              </Tooltip>
            </IconButton>

            {confirmationOpen && (
              <ConfirmationModal
                title={`${i18n.t(
                  "ticketOptionsMenu.confirmationModal.title"
                )} #${ticket.id}?`}
                open={confirmationOpen}
                onClose={setConfirmationOpen}
                onConfirm={handleDeleteTicket}
              >
                {i18n.t("ticketOptionsMenu.confirmationModal.message")}
              </ConfirmationModal>
            )}
            {transferTicketModalOpen && (
              <TransferTicketModalCustom
                modalOpen={transferTicketModalOpen}
                onClose={handleCloseTransferTicketModal}
                ticketid={ticket.id}
                ticket={ticket}
              />
            )}
          </>
        )}
        {ticket.status === "pending" &&
          (ticket.queueId === null || ticket.queueId === undefined) && (
            <ButtonWithSpinner
              loading={loading}
              size="small"
              variant="contained"
              color="primary"
              startIcon={<CheckCircleOutlineRoundedIcon />}
              onClick={(e) => handleOpenAcceptTicketWithouSelectQueue()}
            >
              {i18n.t("messagesList.header.buttons.accept")}
            </ButtonWithSpinner>
          )}
        {ticket.status === "pending" && ticket.queueId !== null && (
          <ButtonWithSpinner
            loading={loading}
            size="small"
            variant="contained"
            color="primary"
            startIcon={<CheckCircleOutlineRoundedIcon />}
            onClick={(e) => handleUpdateTicketStatus(e, "open", user?.id)}
          >
            {i18n.t("messagesList.header.buttons.accept")}
          </ButtonWithSpinner>
        )}
        {/* Botão de relatório visível no desktop (no mobile fica no menu) */}
        <IconButton
          className={classes.bottomButtonVisibilityIcon}
          onClick={() => setReportModalOpen(true)}
        >
          <Tooltip title={i18n.t("ticketReport.menuItem")}>
            <PictureAsPdfOutlinedIcon style={{ color: "#3B82F6" }} />
          </Tooltip>
        </IconButton>
        <IconButton
          aria-label="more options"
          aria-controls="menu-appbar"
          aria-haspopup="true"
          onClick={handleMenu}
          style={{ 
            padding: 6,
            borderRadius: 8,
          }}
        >
          <MoreVertRoundedIcon style={{ fontSize: 18, color: theme.mode === "dark" ? "#94a3b8" : "#64748b" }} />
        </IconButton>
        <Menu
          id="menu-appbar"
          anchorEl={anchorEl}
          getContentAnchorEl={null}
          anchorOrigin={{
            vertical: "bottom",
            horizontal: "right",
          }}
          keepMounted
          transformOrigin={{
            vertical: "top",
            horizontal: "right",
          }}
          open={menuOpen}
          onClose={handleCloseMenu}
        >
          {(ticket.status === "open" || ticket.status === "group" || ticket.status === "pending") && (
            <>
              <MenuItem onClick={handleClickResolver}>
                <HighlightOffRoundedIcon style={{ marginRight: 8, fontSize: 20, color: "#22C55E" }} />
                {i18n.t("messagesList.header.buttons.resolve")}
              </MenuItem>
              {user?.showReturnQueueButton === "enabled" && (
                <MenuItem onClick={(e) => handleUpdateTicketStatus(e, "pending", null)}>
                  <UndoRoundedIcon style={{ marginRight: 8, fontSize: 20, color: "#F59E0B" }} />
                  {i18n.t("tickets.buttons.returnQueue")}
                </MenuItem>
              )}
              {/* Agendar com o cliente: consulta a agenda de verdade e cria o
                  evento (com Meet, se configurado no agente).
                  Fica FORA do condicional de transferencia — colocar dentro
                  quebrava o `&& (`, que so aceita um elemento. */}
              <MenuItem
                onClick={() => {
                  handleCloseMenu();
                  setAgendaAgenteAberta(true);
                }}
              >
                <CalendarClock
                  size={18}
                  strokeWidth={2}
                  style={{ marginRight: 8, color: "#2563EB" }}
                />
                {i18n.t("salesAgentSchedule.menu", "Agendar com o cliente")}
              </MenuItem>

              {user?.showTransferTicketButton === "enabled" && (
              <MenuItem onClick={handleOpenTransferModal}>
                  <SwapHorizOutlinedIcon style={{ marginRight: 8, fontSize: 20, color: "#3B82F6" }} />
                  Transferir Ticket
                </MenuItem>
              )}
            </>
          )}
          <MenuItem onClick={handleOpenConfirmationModal}>
            <DeleteOutlineRoundedIcon style={{ marginRight: 8, fontSize: 20, color: "#EF4444" }} />
            <Can
              role={user.profile}
              perform="ticket-options:deleteTicket"
              yes={() => i18n.t("tickets.buttons.deleteTicket")}
            />
          </MenuItem>
          <MenuItem onClick={handleEnableIntegration}>
            <IntegrationInstructionsOutlinedIcon style={{ marginRight: 8, fontSize: 20, color: "#7C3AED" }} />
            {enableIntegration === true
              ? i18n.t("messagesList.header.buttons.disableIntegration")
              : i18n.t("messagesList.header.buttons.enableIntegration")}
          </MenuItem>
          <MenuItem onClick={handleShowLogTicket}>
            <DescriptionOutlinedIcon style={{ marginRight: 8, fontSize: 20, color: "#6B7280" }} />
            {i18n.t("messagesList.header.buttons.logTicket")}
          </MenuItem>
          {isMobile && (
            <MenuItem
              onClick={() => {
                setReportModalOpen(true);
                handleCloseMenu();
              }}
            >
              <PictureAsPdfOutlinedIcon style={{ marginRight: 8, fontSize: 20 }} />
              {i18n.t("ticketReport.menuItem")}
            </MenuItem>
          )}

          <MenuItem onClick={handleExportPDF}>
            <GetAppRoundedIcon style={{ marginRight: 8, fontSize: 20, color: "#3B82F6" }} />
            {i18n.t("ticketsList.buttons.exportAsPDF")}
          </MenuItem>
          <MenuItem onClick={handleAiSummarize} disabled={aiSummarizing}>
            {aiSummarizing ? (
              <CircularProgress size={16} style={{ marginRight: 8 }} />
            ) : (
              <AutorenewRoundedIcon style={{ marginRight: 8, fontSize: 20, color: "#7C3AED" }} />
            )}
            {i18n.t("ticketOptionsMenu.aiSummarize") || "Resumo IA do Atendimento"}
          </MenuItem>
          <MenuItem onClick={async () => {
            const newValue = !autoAiSummaryEnabled;
            setAutoAiSummaryEnabled(newValue);
            try {
              await updateSetting({ column: "autoAiSummary", data: newValue ? "true" : "false" });
            } catch (err) {
              setAutoAiSummaryEnabled(!newValue); // rollback
              toastError(err);
            }
          }}>
            <Switch
              size="small"
              checked={autoAiSummaryEnabled}
              color="primary"
              style={{ marginRight: 4 }}
            />
            {i18n.t("ticketOptionsMenu.autoAiSummary") || "Auto-resumo IA ao finalizar"}
          </MenuItem>

          {/* Itens extras no mobile (escondidos como IconButton no mobile) */}
          {isMobile && (ticket.status === "open" || ticket.status === "group") && (
            <>
              <MenuItem onClick={() => { handleCopyPhone(); handleCloseMenu(); }} disabled={!contact?.number}>
                <ContentCopyRoundedIcon style={{ marginRight: 8, fontSize: 20 }} />
                {getCopyPhoneTooltip()}
              </MenuItem>
              <MenuItem onClick={() => { handleOpenQuickMessageModal(); handleCloseMenu(); }}>
                <BoltOutlinedIcon style={{ marginRight: 8, fontSize: 20 }} />
                {i18n.t("ticketInfo.quickMessages")}
              </MenuItem>
              {useWhatsappOfficial && ticket.channel === "whatsapp_oficial" && (
                <MenuItem onClick={() => { handleOpenTemplateModal(); handleCloseMenu(); }}>
                  <WhatsAppIcon style={{ marginRight: 8, fontSize: 20, color: needsTemplate ? "#FF9800" : "#25d366" }} />
                  {needsTemplate ? i18n.t("ticketActionExtra.sendTemplateExpired") : i18n.t("ticketActionExtra.sendTemplateBtn")}
                </MenuItem>
              )}
              {directTicketsToWallets && !(
                ticket.contact?.contactWallets &&
                ticket.contact.contactWallets.length > 0
              ) && (
                <MenuItem onClick={() => { handleLinkToWallet(); handleCloseMenu(); }} disabled={linkingWallet}>
                  <AccountBalanceWalletOutlinedIcon style={{ marginRight: 8, fontSize: 20 }} />
                  Vincular à carteira
                </MenuItem>
              )}
              <MenuItem onClick={() => { handleContactToggleDisableBot(); handleCloseMenu(); }}>
                <DeviceHubOutlinedIcon style={{ marginRight: 8, fontSize: 20 }} />
                {disableBot ? i18n.t("ticketActionExtra.disableBot") : i18n.t("ticketActionExtra.enableBot")}
              </MenuItem>
              <MenuItem onClick={() => { window.dispatchEvent(new CustomEvent("aiSuggestReply")); handleCloseMenu(); }}>
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="#7C3AED" width="20" height="20" style={{ marginRight: 8 }}>
                  <path d="M19.31 2.9L18.2 5.01l-2.11 1.11 2.11 1.11 1.11 2.11 1.11-2.11 2.11-1.11-2.11-1.11zM11.39 4.22L10 7l-2.78 1.39L10 9.78l1.39 2.78L12.78 9.78 15.56 8.39 12.78 7zM19.31 15.9l-1.11 2.11-2.11 1.11 2.11 1.11 1.11 2.11 1.11-2.11 2.11-1.11-2.11-1.11zM9 13c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm0 6c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2z"/>
                </svg>
                {i18n.t("messagesInput.tooltips.aiSuggest") || "IA: Sugerir Resposta"}
              </MenuItem>
            </>
          )}
        </Menu>
      </div>
      <>
        {(!user.finalizacaoComValorVendaAtiva ||
          user.finalizacaoComValorVendaAtiva === false ||
          user.finalizacaoComValorVendaAtiva === "false") && (
            <Formik
              enableReinitialize={true}
              validationSchema={SessionSchema}
              innerRef={formRef}
              onSubmit={(values, actions) => {
                setTimeout(() => {
                  actions.setSubmitting(false);
                  actions.resetForm();
                }, 400);
              }}
            >
              {({
                values,
                touched,
                errors,
                isSubmitting,
                setFieldValue,
                resetForm,
              }) => (
                <Dialog
                  open={open}
                  onClose={handleClose}
                  aria-labelledby="alert-dialog-title"
                  aria-describedby="alert-dialog-description"
                >
                  <Form>
                    <DialogActions className={classes.botoes}>
                      <Button
                        onClick={() => handleFinalizarTicket("semDespedida")}
                        style={{
                          background: theme.palette.primary.main,
                          color: "white",
                        }}
                      >
                        {i18n.t(
                          "messagesList.header.dialogRatingWithoutFarewellMsg"
                        )}
                      </Button>

                      <Button
                        onClick={() => handleFinalizarTicket("comDespedida")}
                        style={{
                          background: theme.palette.primary.main,
                          color: "white",
                        }}
                      >
                        {i18n.t("messagesList.header.dialogRatingCancel")}
                      </Button>

                      {showTestButton && (
                        <Button
                          onClick={handleTestButton}
                          style={{
                            background: theme.palette.primary.main,
                            color: "white",
                          }}
                        >
                          {i18n.t(
                            "whatsappModalRel.form.resolveAndTriggerIntegration"
                          )}
                        </Button>
                      )}
                    </DialogActions>
                  </Form>
                </Dialog>
              )}
            </Formik>
          )}
      </>
      <Suspense fallback={null}>
      <SalesAgentScheduleModal
        open={agendaAgenteAberta}
        onClose={() => setAgendaAgenteAberta(false)}
        ticketId={ticket?.id}
      />

      {openFinalizacaoVenda &&
        (
          (
            <FinalizacaoVendaModal
              open={openFinalizacaoVenda}
              onClose={() => setOpenFinalizacaoVenda(false)}
              ticket={ticket}
              onFinalizar={(ticketData) => {
                setOpenFinalizacaoVenda(false);
                setTicketDataToFinalize(ticketData);
                setShowFinalizacaoOptions(true);
              }}
            />
          ))}
      </Suspense>
      {showFinalizacaoOptions && (
        <Dialog
          open={showFinalizacaoOptions}
          onClose={() => setShowFinalizacaoOptions(false)}
          aria-labelledby="finalizacao-options-title"
        >
          <DialogTitle id="finalizacao-options-title">
            Como deseja finalizar?
          </DialogTitle>
          <DialogActions className={classes.botoes}>
            <Button
              onClick={async () => {
                setShowFinalizacaoOptions(false);
                await handleUpdateTicketStatusWithData(
                  ticketDataToFinalize,
                  false,
                  null
                );
              }}
              style={{ background: theme.palette.primary.main, color: "white" }}
            >
              {i18n.t("messagesList.header.dialogRatingWithoutFarewellMsg")}
            </Button>
            <Button
              onClick={async () => {
                setShowFinalizacaoOptions(false);
                await handleUpdateTicketStatusWithData(
                  ticketDataToFinalize,
                  true,
                  null
                );
              }}
              style={{ background: theme.palette.primary.main, color: "white" }}
            >
              {i18n.t("messagesList.header.dialogRatingCancel")}
            </Button>
          </DialogActions>
        </Dialog>
      )}
      {/* MODAL DE RESUMO IA */}
      <Dialog
        open={aiSummaryOpen}
        onClose={() => setAiSummaryOpen(false)}
        maxWidth="md"
        fullWidth
      >
        <DialogTitle style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <AutorenewRoundedIcon style={{ color: "#7C3AED" }} />
          {i18n.t("ticketOptionsMenu.aiSummarizeTitle") || "Resumo IA do Atendimento"}
        </DialogTitle>
        <DialogContent dividers>
          <div style={{ whiteSpace: "pre-wrap", lineHeight: 1.7, fontSize: "0.95rem" }}>
            {aiSummaryText}
          </div>
        </DialogContent>
        <DialogActions>
          <Button
            onClick={async () => {
              const cId = ticket.contact?.id || ticket.contactId || contact?.id;
              if (!cId) {
                toastError({ message: "Contato não encontrado para salvar a nota." });
                return;
              }
              try {
                await api.post("/ticket-notes", {
                  note: `📋 [Resumo IA]\n${aiSummaryText}`,
                  ticketId: ticket.id,
                  contactId: Number(cId),
                });
                toast.success(i18n.t("ticketOptionsMenu.aiSummarySaved") || "Resumo salvo como nota do contato!");
              } catch (err) {
                toastError(err);
              }
            }}
            style={{ color: "#7C3AED" }}
          >
            {i18n.t("ticketOptionsMenu.aiSummarySaveNote") || "Salvar como Nota"}
          </Button>
          <Button
            onClick={() => {
              navigator.clipboard.writeText(aiSummaryText);
              toast.success(i18n.t("ticketOptionsMenu.aiSummaryCopied") || "Resumo copiado!");
            }}
            color="primary"
          >
            {i18n.t("ticketOptionsMenu.aiSummaryCopy") || "Copiar"}
          </Button>
          <Button onClick={() => setAiSummaryOpen(false)} color="default">
            {i18n.t("ticketOptionsMenu.aiSummaryClose") || "Fechar"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
};

export default TicketActionButtonsCustom;