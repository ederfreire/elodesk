import React, {
  useState,
  useEffect,
  useReducer,
  useContext,
  useCallback
} from "react";
import SmartToy from "@mui/icons-material/SmartToy";
import ShuffleIcon from "@mui/icons-material/Shuffle";
import ViewKanbanIcon from "@mui/icons-material/ViewKanbanOutlined";
import { toast } from "react-toastify";
import { i18n } from "../../translate/i18n";
import "./mobile-styles.css";
import { makeStyles, useTheme } from "@material-ui/core/styles";
import { Paper, Button, IconButton, Typography, Box, Grid, Collapse, useMediaQuery, Fab, Slide, ClickAwayListener, Tooltip } from "@material-ui/core";
import CloseIcon from "@material-ui/icons/Close";
import AddIcon from "@material-ui/icons/Add";
import ExpandLess from "@material-ui/icons/ExpandLess";
import ExpandMore from "@material-ui/icons/ExpandMore";
import SaveIcon from "@material-ui/icons/Save";
import ZoomInIcon from "@material-ui/icons/ZoomIn";
import ZoomOutIcon from "@material-ui/icons/ZoomOut";
import ChevronLeft from "@material-ui/icons/ChevronLeft";
import PauseIcon from "@material-ui/icons/Pause";
import PlayArrowIcon from "@material-ui/icons/PlayArrow";
import FullscreenIcon from "@material-ui/icons/Fullscreen";
import TestIcon from "@material-ui/icons/PlayCircleOutline";
import WebAssetIcon from '@material-ui/icons/WebAsset';
import MainHeader from "../../components/MainHeader";
import Title from "../../components/Title";
import { AuthContext } from "../../context/Auth/AuthContext";
import FlowExecutionOverlay from "../../components/FlowExecutionOverlay";
import api from "../../services/api";
import toastError from "../../errors/toastError";

import HttpIcon from "@mui/icons-material/Http";
import DataObjectIcon from "@mui/icons-material/DataObject";
import QuestionAnswerIcon from "@mui/icons-material/QuestionAnswer";
import CompareArrows from "@mui/icons-material/CompareArrows";

import ReactFlow, {
  MiniMap,
  Controls,
  Background,
  useNodesState,
  useEdgesState,
  addEdge,
  useReactFlow
} from "react-flow-renderer";

import AccessTime from "@mui/icons-material/AccessTime";
import CallSplit from "@mui/icons-material/CallSplit";
import DynamicFeed from "@mui/icons-material/DynamicFeed";
import LibraryBooks from "@mui/icons-material/LibraryBooks";
import Message from "@mui/icons-material/Message";
import RocketLaunch from "@mui/icons-material/RocketLaunch";
import Tag from "@mui/icons-material/Tag";
import Queue from "@mui/icons-material/Queue";
import Person from "@mui/icons-material/Person";
import SmartButton from "@mui/icons-material/SmartButton";
import ArrowForwardIcon from '@mui/icons-material/ArrowForward';

// Import dos nós (mantendo os mesmos)
import messageNode from "./nodes/messageNode.js";
import startNode from "./nodes/startNode";
//import conditionNode from "./nodes/conditionNode";
import menuNode from "./nodes/menuNode";
import interactiveNode from "./nodes/interactiveNode";
import intervalNode from "./nodes/intervalNode";
import imgNode from "./nodes/imgNode";
import randomizerNode from "./nodes/randomizerNode";
import distributionNode from "./nodes/distributionNode";
import kanbanNode from "./nodes/kanbanNode";
import videoNode from "./nodes/videoNode";
import switchFlowNode from "./nodes/switchFlowNode";
import attendantNode from "./nodes/attendantNode";
import RemoveEdge from "./nodes/removeEdge";
import audioNode from "./nodes/audioNode";
import { useNodeStorage } from "../../stores/useNodeStorage";
import singleBlockNode from "./nodes/singleBlockNode";
import ticketNode from "./nodes/ticketNode";
import tagNode from "./nodes/tagNode";
import conditionCompareNode from "./nodes/conditionCompareNode";
import HttpRequestNode from "./nodes/httpRequestNode";
import removeTagNode from "./nodes/removeTagNode";
import VariableNode, {
  getFlowVariable,
  setFlowVariable,
} from "./nodes/variableNode";
import inputNode from "./nodes/inputNode";
import aiAgentNode from "./nodes/aiAgentNode";
import asaasBoletoNode from "./nodes/asaasBoletoNode";
import integrationNode from "./nodes/integrationNode";
import instagramTriggerNode from "./nodes/instagramTriggerNode";
import instagramReplyCommentNode from "./nodes/instagramReplyCommentNode";
import instagramLikeCommentNode from "./nodes/instagramLikeCommentNode";
import instagramIsFollowerNode from "./nodes/instagramIsFollowerNode";
import instagramSendDmNode from "./nodes/instagramSendDmNode";
import instagramRewardPdfNode from "./nodes/instagramRewardPdfNode";
import googleCalendarNode from "./nodes/googleCalendarNode";
import waitInputNode from "./nodes/waitInputNode";
import exitNode from "./nodes/exitNode";
import FlowBuilderGoogleCalendarModal from "../../components/FlowBuilderGoogleCalendarModal";
import FlowBuilderWaitInputModal from "../../components/FlowBuilderWaitInputModal";
import FlowBuilderExitModal from "../../components/FlowBuilderExitModal";
import N8nLogsDrawer from "./N8nLogsDrawer";
// Imports dos modais (mantendo os mesmos)
import FlowBuilderAddImgModal from "../../components/FlowBuilderAddImgModal";
import FlowBuilderTicketModal from "../../components/FlowBuilderAddTicketModal";
import FlowBuilderAddAudioModal from "../../components/FlowBuilderAddAudioModal";
import FlowBuilderAddTagModal from "../../components/FlowBuilderAddTagModal";
import FlowBuilderRandomizerModal from "../../components/FlowBuilderRandomizerModal";
import FlowBuilderDistributionModal from "../../components/FlowBuilderDistributionModal";
import FlowBuilderKanbanModal from "../../components/FlowBuilderKanbanModal";
import FlowBuilderAddVideoModal from "../../components/FlowBuilderAddVideoModal";
import FlowBuilderSingleBlockModal from "../../components/FlowBuilderSingleBlockModal";
import FlowBuilderAddTextModal from "../../components/FlowBuilderAddTextModal";
import FlowBuilderIntervalModal from "../../components/FlowBuilderIntervalModal";
//import FlowBuilderConditionModal from "../../components/FlowBuilderConditionModal";
import FlowBuilderMenuModal from "../../components/FlowBuilderMenuModal";
import FlowBuilderInteractiveModal from "../../components/FlowBuilderInteractiveModal";
import FlowBuilderAddSwitchFlowModal from "../../components/FlowBuilderAddSwitchFlowModal";
import FlowBuilderAddAttendantModal from "../../components/FlowBuilderAddAttendantModal";
import FlowBuilderInputModal from "../../components/FlowBuilderInputModal";
import FlowBuilderConditionCompareModal from "../../components/FlowBuilderConditionCompareModal";
import FlowBuilderRemoveTagModal from "../../components/FlowBuilderRemoveTagModal";
import FlowBuilderAiAgentModal from "../../components/FlowBuilderAIAgentModal";
import FlowBuilderInstagramTriggerModal from "../../components/FlowBuilderInstagramTriggerModal";
import FlowBuilderInstagramReplyModal from "../../components/FlowBuilderInstagramReplyModal";
import FlowBuilderInstagramDmModal from "../../components/FlowBuilderInstagramDmModal";
import FlowBuilderInstagramRewardModal from "../../components/FlowBuilderInstagramRewardModal";
import FlowBuilderTestModal from "../../components/FlowBuilderTestModal";
import InstagramIcon from "@mui/icons-material/Instagram";

import { useParams, useHistory } from "react-router-dom/cjs/react-router-dom.min";
import { CircularProgress } from "@material-ui/core";

const useStyles = makeStyles(theme => ({
  root: {
    display: "flex",
    flexDirection: "column",
    height: "100vh",
    overflow: "hidden",
    backgroundColor: theme.palette.background.default
  },
  header: {
    flexShrink: 0,
    backgroundColor: theme.palette.background.paper,
    borderBottom: `1px solid ${theme.palette.divider}`
  },
  content: {
    flex: 1,
    display: "flex",
    position: "relative",
    overflow: "hidden"
  },
  // Sidebar colapsável para desktop
  sidebar: {
    width: 300,
    backgroundColor: theme.palette.background.paper,
    borderRight: `1px solid ${theme.palette.divider}`,
    transition: "width 0.3s ease",
    display: "flex",
    flexDirection: "column",
    zIndex: 1000,
    [theme.breakpoints.down('md')]: {
      display: "none" // Ocultar sidebar em mobile
    }
  },
  sidebarHeader: {
    padding: theme.spacing(1),
    borderBottom: `1px solid ${theme.palette.divider}`,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    minHeight: 56,
    backgroundColor: theme.palette.background.paper
  },
  sidebarContent: {
    flex: 1,
    overflowY: "auto",
    backgroundColor: theme.palette.background.paper,
    ...theme.scrollbarStyles
  },
  flowContainer: {
    flex: 1,
    position: "relative",
    backgroundColor: theme.palette.type === 'dark' ? '#121212' : '#F8F9FA',
    '& .react-flow__controls': {
      zIndex: 1100, // Garantir que fique acima de outros elementos
      bottom: theme.spacing(2),
      left: theme.spacing(2),
      [theme.breakpoints.down('md')]: {
        display: 'none' // Ocultar em mobile já que temos controles customizados
      }
    }
  },
  // Bottom sheet para mobile
  bottomSheet: {
    position: "fixed",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: theme.palette.background.paper,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    boxShadow: theme.shadows[8],
    zIndex: 1500,
    maxHeight: "80vh",
    display: "flex",
    flexDirection: "column",
    border: `1px solid ${theme.palette.divider}`,
    [theme.breakpoints.up('lg')]: {
      display: "none" // Ocultar em desktop
    }
  },
  bottomSheetHandle: {
    width: 40,
    height: 4,
    backgroundColor: theme.palette.divider,
    borderRadius: 2,
    margin: "8px auto",
    cursor: "pointer"
  },
  bottomSheetHeader: {
    padding: theme.spacing(1, 2),
    borderBottom: `1px solid ${theme.palette.divider}`,
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    backgroundColor: theme.palette.background.paper
  },
  bottomSheetContent: {
    flex: 1,
    overflowY: "auto",
    padding: theme.spacing(1),
    backgroundColor: theme.palette.background.paper,
    ...theme.scrollbarStyles
  },
  // Floating Action Button
  fab: {
    position: "fixed",
    top: 60, // Posicionar no topo, acima dos quickActions
    right: theme.spacing(2),
    zIndex: 1400,
    backgroundColor: theme.palette.primary.main,
    color: theme.palette.primary.contrastText,
    '&:hover': {
      backgroundColor: theme.palette.primary.dark,
    },
    [theme.breakpoints.down('md')]: {
      bottom: theme.spacing(9),
      top: 'auto'
    }
  },
  addFab: {
    position: "fixed",
    bottom: theme.spacing(2),
    left: theme.spacing(2),
    zIndex: 1400,
    backgroundColor: theme.palette.secondary.main,
    color: theme.palette.secondary.contrastText,
    '&:hover': {
      backgroundColor: theme.palette.secondary.dark,
    },
    [theme.breakpoints.up('lg')]: {
      display: "none"
    }
  },
  // Categorias de nós
  categoryButton: {
    margin: theme.spacing(0.5),
    textTransform: "none",
    borderRadius: theme.spacing(1),
    minWidth: "auto",
    fontSize: "0.75rem",
    color: theme.palette.text.primary,
    borderColor: theme.palette.divider
  },
  nodeButton: {
    justifyContent: "flex-start",
    textTransform: "none",
    padding: theme.spacing(1),
    marginBottom: theme.spacing(0.5),
    borderRadius: theme.spacing(1),
    transition: "all 0.2s ease",
    color: theme.palette.text.primary,
    "&:hover": {
      backgroundColor: theme.palette.action.hover,
      transform: "translateX(4px)"
    }
  },
  collapsedNodeButton: {
    width: 48,
    height: 48,
    minWidth: 48,
    padding: 0,
    margin: theme.spacing(0.5, 0.5),
    justifyContent: "center",
    color: theme.palette.text.primary,
    '&:hover': {
      backgroundColor: theme.palette.action.hover,
    }
  },
  categoryHeader: {
    padding: theme.spacing(1, 1.5),
    fontWeight: 600,
    color: theme.palette.text.primary,
    cursor: "pointer",
    userSelect: "none",
    borderRadius: 6,
    '&:hover': {
      backgroundColor: theme.palette.action.hover,
    }
  },
  sidebarSectionTitle: {
    fontWeight: 700,
    fontSize: "0.95rem",
    color: theme.palette.text.primary,
    padding: theme.spacing(1.5, 1.5, 0.5),
  },
  sidebarSearchWrap: {
    padding: theme.spacing(0.5, 1.5, 1),
  },
  sidebarSearchInput: {
    width: "100%",
    padding: "8px 12px",
    borderRadius: 8,
    border: `1px solid ${theme.palette.divider}`,
    background: theme.palette.background.default,
    color: theme.palette.text.primary,
    fontSize: 13,
    outline: "none",
    boxSizing: "border-box",
  },
  nodeCard: {
    display: "flex",
    alignItems: "center",
    gap: 10,
    padding: "8px 10px",
    margin: theme.spacing(0.5, 1.5),
    borderRadius: 8,
    border: `1px solid ${theme.palette.divider}`,
    background: theme.palette.background.paper,
    cursor: "pointer",
    transition: "all 0.15s ease",
    '&:hover': {
      borderColor: theme.palette.primary.main,
      boxShadow: "0 2px 6px rgba(0,0,0,0.06)",
    }
  },
  nodeCardIconBox: {
    width: 32,
    height: 32,
    borderRadius: 8,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    background: theme.palette.type === 'dark' ? 'rgba(255,255,255,0.06)' : '#F1F3F5',
    flexShrink: 0,
    '& svg': { fontSize: 18 },
  },
  nodeCardTitle: {
    fontSize: 13,
    fontWeight: 600,
    color: theme.palette.text.primary,
    lineHeight: 1.2,
  },
  nodeCardDesc: {
    fontSize: 11.5,
    color: theme.palette.text.secondary,
    lineHeight: 1.2,
    marginTop: 2,
    display: "-webkit-box",
    WebkitLineClamp: 1,
    WebkitBoxOrient: "vertical",
    overflow: "hidden",
  },

  // Top centered toolbar
  topToolbar: {
    position: "absolute",
    top: theme.spacing(1.5),
    left: "50%",
    transform: "translateX(-50%)",
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(0.75),
    padding: theme.spacing(0.75, 1),
    borderRadius: 12,
    background: theme.palette.background.paper,
    boxShadow: "0 4px 14px rgba(0,0,0,0.08)",
    border: `1px solid ${theme.palette.divider}`,
    zIndex: 1200,
    [theme.breakpoints.down('sm')]: {
      gap: theme.spacing(0.25),
      padding: theme.spacing(0.5),
    }
  },
  topToolbarBtn: {
    textTransform: "none",
    fontWeight: 600,
    fontSize: 13,
    borderRadius: 8,
    padding: "6px 12px",
    minWidth: 0,
    boxShadow: "none",
  },
  topToolbarDivider: {
    width: 1,
    height: 22,
    background: theme.palette.divider,
    margin: theme.spacing(0, 0.5),
  },
  topToolbarIconBtn: {
    padding: 6,
    color: theme.palette.text.primary,
  },
  autoSaveBadge: {
    fontSize: 11,
    color: theme.palette.text.secondary,
    marginLeft: 4,
    minWidth: 60,
    textAlign: "left",
  },
  quickActions: {
    display: "none",
  },
  quickActionButton: {
    backgroundColor: theme.palette.background.paper,
    backdropFilter: "blur(10px)",
    boxShadow: theme.shadows[3],
    color: theme.palette.text.primary,
    border: `1px solid ${theme.palette.divider}`,
    "&:hover": {
      backgroundColor: theme.palette.action.hover,
    }
  },
  // Mobile controls
  mobileControls: {
    position: "fixed",
    bottom: 80,
    left: theme.spacing(2),
    display: "flex",
    flexDirection: "column",
    gap: theme.spacing(1),
    zIndex: 1300,
    [theme.breakpoints.up('lg')]: {
      display: "none"
    }
  },
  controlButton: {
    backgroundColor: theme.palette.background.paper,
    backdropFilter: "blur(10px)",
    boxShadow: theme.shadows[3],
    width: 48,
    height: 48,
    color: theme.palette.text.primary,
    border: `1px solid ${theme.palette.divider}`,
    "&:hover": {
      backgroundColor: theme.palette.action.hover,
      transform: "scale(1.05)"
    }
  },
  categoryCard: {
    backgroundColor: theme.palette.background.paper,
    borderRadius: 8,
    border: `1px solid ${theme.palette.divider}`,
    marginBottom: theme.spacing(1)
  },
  categoryTitle: {
    fontWeight: "bold",
    marginBottom: theme.spacing(1),
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(1),
    color: theme.palette.text.primary
  },
  categoryNodeBtn: {
    width: "100%",
    marginBottom: theme.spacing(0.5),
    justifyContent: "flex-start",
    textTransform: "none",
    fontSize: "0.8rem",
    padding: theme.spacing(1, 1.5),
    color: theme.palette.text.primary,
    '&:hover': {
      backgroundColor: theme.palette.action.hover,
    }
  },
  loadingContainer: {
    display: "flex",
    justifyContent: "center",
    alignItems: "center",
    height: "70vh",
    backgroundColor: theme.palette.background.paper
  }
}));

// Definição das categorias de nós
const nodeCategories = [
  {
    name: i18n.t("flowBuilderConfigPage.basics"),
    color: theme => theme.palette.primary.main,
    icon: <RocketLaunch />,
    nodes: [
      {
        icon: <RocketLaunch />,
        name: i18n.t("flowBuilderConfigPage.start"),
        type: "start",
        description: i18n.t("flowBuilderConfigPage.startDesc")
      }
    ]
  },
  {
    name: i18n.t("flowBuilderConfigPage.content"),
    color: theme => theme.palette.success.main,
    icon: <LibraryBooks />,
    nodes: [
      {
        icon: <LibraryBooks />,
        name: i18n.t("flowBuilderConfigPage.content"),
        type: "content",
        description: i18n.t("flowBuilderConfigPage.contentDesc")
      },
      {
        icon: <Message />,
        name: i18n.t("flowBuilderConfigPage.textNode"),
        type: "text",
        description: i18n.t("flowBuilderConfigPage.textDesc")
      }
    ]
  },
  {
    name: i18n.t("flowBuilderConfigPage.interaction"),
    color: theme => theme.palette.warning.main,
    icon: <DynamicFeed />,
    nodes: [
      {
        icon: <DynamicFeed />,
        name: i18n.t("flowBuilderConfigPage.menu"),
        type: "menu",
        description: i18n.t("flowBuilderConfigPage.menuDesc")
      },
      {
        icon: <SmartButton />,
        name: i18n.t("flowBuilderConfigPage.interactiveApi"),
        type: "interactiveMenu",
        description: i18n.t("flowBuilderConfigPage.interactiveApiDesc")
      },
      {
        icon: <QuestionAnswerIcon />,
        name: i18n.t("flowBuilderConfigPage.input"),
        type: "input",
        description: i18n.t("flowBuilderConfigPage.inputDesc")
      },
      {
        icon: <AccessTime />,
        name: i18n.t("flowBuilderConfigPage.interval"),
        type: "interval",
        description: i18n.t("flowBuilderConfigPage.intervalDesc")
      }
    ]
  },
  {
    name: i18n.t("flowBuilderConfigPage.logic"),
    color: theme => theme.palette.secondary.main,
    icon: <CallSplit />,
    nodes: [
      {
        icon: <CallSplit />,
        name: i18n.t("flowBuilderConfigPage.randomizer"),
        type: "random",
        description: i18n.t("flowBuilderConfigPage.randomizerDesc")
      },
      {
        icon: <ShuffleIcon />,
        name: i18n.t("flowBuilderConfigPage.distribution"),
        type: "distribution",
        description: i18n.t("flowBuilderConfigPage.distributionDesc")
      },
      {
        icon: <ViewKanbanIcon />,
        name: i18n.t("flowBuilderConfigPage.kanban"),
        type: "kanban",
        description: i18n.t("flowBuilderConfigPage.kanbanDesc")
      },
      {
        icon: <CompareArrows />,
        name: i18n.t("flowBuilderConfigPage.ifElse"),
        type: "conditionCompare",
        description: i18n.t("flowBuilderConfigPage.ifElseDesc")
      }
    ]
  },
  {
    name: i18n.t("flowBuilderConfigPage.system"),
    color: theme => theme.palette.info.main,
    icon: <Queue />,
    nodes: [
      {
        icon: <Queue />,
        name: i18n.t("flowBuilderConfigPage.queues"),
        type: "ticket",
        description: i18n.t("flowBuilderConfigPage.queuesDesc")
      },
      {
        icon: <Tag />,
        name: i18n.t("flowBuilderConfigPage.tags"),
        type: "tag",
        description: i18n.t("flowBuilderConfigPage.tagsDesc")
      },
      {
        icon: <Tag />,
        name: i18n.t("flowBuilderConfigPage.removeTag"),
        type: "removeTag",
        description: i18n.t("flowBuilderConfigPage.removeTagDesc")
      },
      {
        icon: <ArrowForwardIcon />,
        name: i18n.t("flowBuilderConfigPage.switchFlow"),
        type: "switchFlow",
        description: i18n.t("flowBuilderConfigPage.switchFlowDesc")
      },
      {
        icon: <Person />,
        name: i18n.t("flowBuilderConfigPage.attendant"),
        type: "attendant",
        description: i18n.t("flowBuilderConfigPage.attendantDesc")
      },
      {
        icon: <AccessTime />,
        name: i18n.t("flowBuilderConfigPage.waitInput"),
        type: "waitInput",
        description: i18n.t("flowBuilderConfigPage.waitInputDesc")
      },
      {
        icon: <CloseIcon />,
        name: i18n.t("flowBuilderConfigPage.exit"),
        type: "exit",
        description: i18n.t("flowBuilderConfigPage.exitDesc")
      }
    ]
  },
  {
    name: i18n.t("flowBuilderN8N.integrations"),
    color: theme => theme.palette.error.main,
    icon: <HttpIcon />,
    nodes: [
      {
        icon: <HttpIcon />,
        name: i18n.t("flowBuilderConfigPage.httpRequest"),
        type: "httpRequest",
        description: i18n.t("flowBuilderConfigPage.httpRequestDesc")
      },
      {
        icon: <DataObjectIcon />,
        name: i18n.t("flowBuilderConfigPage.variable"),
        type: "variable",
        description: i18n.t("flowBuilderConfigPage.variableDesc")
      },
      {
        icon: <SmartToy />,
        name: i18n.t("flowBuilderConfigPage.aiAgent"),
        type: "aiAgent",
        description: i18n.t("flowBuilderConfigPage.aiAgentDesc")
      },
      {
        icon: <HttpIcon />,
        name: "Typebot",
        type: "typebotIntegration",
        description: i18n.t("flowBuilderConfigPage.typebotDesc", "Dispara uma integração Typebot configurada em Integrações")
      },
      {
        icon: <HttpIcon />,
        name: "n8n",
        type: "n8nIntegration",
        description: i18n.t("flowBuilderConfigPage.n8nDesc", "Dispara uma integração n8n configurada em Integrações")
      },
      // O nó "Google Agenda" foi REMOVIDO desta paleta.
      //
      // A integração com o Google saiu do FlowBuilder e passou para a tela de
      // Agendamentos, onde ela faz sentido: marcar uma reunião é uma ação do
      // operador, não algo que precise de um fluxo montado. No modal de
      // Agendamento há o bloco "Integração Google Agenda & Meet", com
      // sincronização, link do Meet, título e duração — e as preferências
      // padrão ficam em Configurações → Google Agenda.
      //
      // O tipo "googleCalendar" continua registrado em `nodeTypes` mais
      // abaixo de propósito: fluxos JÁ SALVOS que usam o nó precisam
      // continuar carregando e desenhando sem quebrar. Só não dá mais para
      // adicionar um nó novo.
      {
        icon: <HttpIcon />,
        name: i18n.t("flowBuilderConfigPage.asaasBoleto", "Segunda via Boleto (Asaas)"),
        type: "asaasBoleto",
        description: i18n.t("flowBuilderConfigPage.asaasBoletoDesc", "Consulta boletos pendentes do cliente no Asaas via CPF/CNPJ")
      }
    ]
  },
  {
    name: i18n.t("flowBuilderConfigPage.instagramCategory", "Instagram"),
    color: () => "#E1306C",
    icon: <InstagramIcon />,
    nodes: [
      { icon: <InstagramIcon />, name: i18n.t("flowBuilderConfigPage.igTrigger", "Gatilho: Comentário IG"), type: "instagramTrigger", description: i18n.t("flowBuilderConfigPage.igTriggerDesc", "Começa aqui! Inicia o fluxo quando alguém comenta no seu post ou reel.") },
      { icon: <InstagramIcon />, name: i18n.t("flowBuilderConfigPage.igReply", "Responder comentário"), type: "instagramReplyComment", description: i18n.t("flowBuilderConfigPage.igReplyDesc", "Responde publicamente o comentário (todo mundo vê a resposta).") },
      { icon: <InstagramIcon />, name: i18n.t("flowBuilderConfigPage.igLike", "Curtir comentário"), type: "instagramLikeComment", description: i18n.t("flowBuilderConfigPage.igLikeDesc", "Dá like automático no comentário — mostra que você viu.") },
      { icon: <InstagramIcon />, name: i18n.t("flowBuilderConfigPage.igIsFollower", "É seguidor?"), type: "instagramIsFollower", description: i18n.t("flowBuilderConfigPage.igIsFollowerDesc", "Verifica se a pessoa segue você. Cria 2 caminhos: segue / não segue.") },
      { icon: <InstagramIcon />, name: i18n.t("flowBuilderConfigPage.igSendDm", "Enviar DM"), type: "instagramSendDm", description: i18n.t("flowBuilderConfigPage.igSendDmDesc", "Manda mensagem privada (direct) para quem comentou.") },
      { icon: <InstagramIcon />, name: i18n.t("flowBuilderConfigPage.igRewardPdf", "Enviar recompensa (PDF)"), type: "instagramRewardPdf", description: i18n.t("flowBuilderConfigPage.igRewardPdfDesc", "Manda um arquivo (PDF, imagem, vídeo) no privado. Ótimo para iscas.") }
    ]
  }
];

// Função para gerar string aleatória (mantida igual)
function geraStringAleatoria(tamanho) {
  var stringAleatoria = "";
  var caracteres =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  for (var i = 0; i < tamanho; i++) {
    stringAleatoria += caracteres.charAt(
      Math.floor(Math.random() * caracteres.length)
    );
  }
  return stringAleatoria;
}

// Tipos de nós (mantido igual)
const nodeTypes = {
  message: messageNode,
  start: startNode,
  //condition: conditionNode,
  menu: menuNode,
  interactiveMenu: interactiveNode,
  interval: intervalNode,
  img: imgNode,
  
  audio: audioNode,
  randomizer: randomizerNode,
  distribution: distributionNode,
  kanban: kanbanNode,
  video: videoNode,
  singleBlock: singleBlockNode,
  ticket: ticketNode,
  tag: tagNode,
  removeTag: removeTagNode,
  switchFlow: switchFlowNode,
  attendant: attendantNode,
  httpRequest: HttpRequestNode,
  variable: VariableNode,
  
  input: inputNode,
  conditionCompare: conditionCompareNode,
  aiAgent: aiAgentNode,
  integration: integrationNode,
  typebotIntegration: integrationNode,
  n8nIntegration: integrationNode,
  asaasBoleto: asaasBoletoNode,
  instagramTrigger: instagramTriggerNode,
  instagramReplyComment: instagramReplyCommentNode,
  instagramLikeComment: instagramLikeCommentNode,
  instagramIsFollower: instagramIsFollowerNode,
  instagramSendDm: instagramSendDmNode,
  instagramRewardPdf: instagramRewardPdfNode,
  
  googleCalendar: googleCalendarNode,
  waitInput: waitInputNode,
  exit: exitNode,
};

const edgeTypes = {
  buttonedge: RemoveEdge
};

const initialNodes = [
  {
    id: "1",
    position: { x: 250, y: 100 },
    data: { label: "Inicio do fluxo" },
    type: "start"
  }
];

const initialEdges = [];

// Função para detectar se é mobile
const isMobileDevice = () => {
  return (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
      navigator.userAgent
    ) ||
    ('ontouchstart' in window) ||
    (navigator.maxTouchPoints > 0)
  );
};

// Componente de controles customizados para mobile
const MobileControls = () => {
  const classes = useStyles();
  const { zoomIn, zoomOut, fitView } = useReactFlow();

  return (
    <div className={classes.mobileControls}>
      <IconButton
        onClick={() => zoomIn()}
        className={classes.controlButton}
        size="small"
      >
        <ZoomInIcon />
      </IconButton>

      <IconButton
        onClick={() => zoomOut()}
        className={classes.controlButton}
        size="small"
      >
        <ZoomOutIcon />
      </IconButton>

      <IconButton
        onClick={() => fitView({ padding: 0.2 })}
        className={classes.controlButton}
        size="small"
      >
        <WebAssetIcon />
      </IconButton>
    </div>
  );
};

// Componente de ações rápidas para desktop (REMOVIDO - substituído pela TopToolbar)
const QuickActions = () => null;

// Toolbar superior centralizada (dentro do ReactFlow para acesso ao contexto)
const TopToolbar = ({
  isDirty,
  isSaving,
  lastSavedAt,
  onSave,
  isActive,
  onToggleActive,
  onTest,
  onFullscreen,
  onOpenN8nLogs,
}) => {
  const classes = useStyles();
  const { zoomIn, zoomOut } = useReactFlow();

  const formatSaved = () => {
    if (isSaving) return i18n.t("flowBuilderConfigPage.tbSaving", "Salvando...");
    if (!lastSavedAt) return "";
    const diff = Math.floor((Date.now() - lastSavedAt) / 1000);
    if (diff < 5) return i18n.t("flowBuilderConfigPage.tbSaved", "Salvo");
    if (diff < 60) return i18n.t("flowBuilderConfigPage.tbSavedAgoSec", { defaultValue: `Salvo há ${diff}s`, n: diff });
    return i18n.t("flowBuilderConfigPage.tbSavedAgoMin", { defaultValue: `Salvo há ${Math.floor(diff / 60)}m`, n: Math.floor(diff / 60) });
  };

  return (
    <div className={classes.topToolbar}>
      <Button
        variant="contained"
        color="default"
        size="small"
        startIcon={<SaveIcon />}
        onClick={onSave}
        disabled={!isDirty || isSaving}
        className={classes.topToolbarBtn}
      >
        {i18n.t("flowBuilderConfigPage.tbSave", "Salvar")}
      </Button>
      <span className={classes.autoSaveBadge}>{formatSaved()}</span>

      <div className={classes.topToolbarDivider} />

      <Button
        variant="contained"
        size="small"
        startIcon={isActive ? <PauseIcon /> : <PlayArrowIcon />}
        onClick={onToggleActive}
        className={classes.topToolbarBtn}
        style={{
          backgroundColor: isActive ? "#F58A3D" : "#4CAF50",
          color: "#fff",
        }}
      >
        {isActive ? i18n.t("flowBuilderConfigPage.tbPause", "Pausar") : i18n.t("flowBuilderConfigPage.tbActivate", "Ativar")}
      </Button>

      <Button
        variant="contained"
        size="small"
        startIcon={<TestIcon />}
        onClick={onTest}
        className={classes.topToolbarBtn}
        style={{ backgroundColor: "#8B5CF6", color: "#fff" }}
      >
        {i18n.t("flowBuilderConfigPage.tbTest", "Testar")}
      </Button>

      <div className={classes.topToolbarDivider} />

      <Tooltip title={i18n.t("flowBuilderConfigPage.tbZoomIn", "Zoom In")}>
        <IconButton size="small" className={classes.topToolbarIconBtn} onClick={() => zoomIn()}>
          <ZoomInIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title={i18n.t("flowBuilderConfigPage.tbZoomOut", "Zoom Out")}>
        <IconButton size="small" className={classes.topToolbarIconBtn} onClick={() => zoomOut()}>
          <ZoomOutIcon fontSize="small" />
        </IconButton>
      </Tooltip>
      <Tooltip title={i18n.t("flowBuilderConfigPage.tbFullscreen", "Tela cheia")}>
        <IconButton size="small" className={classes.topToolbarIconBtn} onClick={onFullscreen}>
          <FullscreenIcon fontSize="small" />
        </IconButton>
      </Tooltip>
    </div>
  );
};

export const FlowBuilderConfig = () => {
  const theme = useTheme();
  const isMobile = useMediaQuery(theme.breakpoints.down('md'));
  const { id } = useParams();
  const history = useHistory();

  // Estados para interface
  const [sidebarOpen, setSidebarOpen] = useState(!isMobile);
  const [bottomSheetOpen, setBottomSheetOpen] = useState(false);
  const [expandedCategories, setExpandedCategories] = useState(['Básicos']);
  const [nodeSearch, setNodeSearch] = useState("");

  const classes = useStyles({ sidebarOpen });

  // Estados existentes (mantidos)
  const { user, socket } = useContext(AuthContext);

  // 🔴 Estado de execução em tempo real (por nó)
  // { [nodeId]: { status: 'running'|'success'|'error', errorMessage?, ts, nodeType } }
  const [executionState, setExecutionState] = useState({});
  const [executionEvents, setExecutionEvents] = useState([]);
  const [loading, setLoading] = useState(false);
  const [pageNumber, setPageNumber] = useState(1);
  const [dataNode, setDataNode] = useState(null);
  const [hasMore, setHasMore] = useState(false);
  // Estados do auto-save e toolbar
  const [isDirty, setIsDirty] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [lastSavedAt, setLastSavedAt] = useState(null);
  const [flowActive, setFlowActive] = useState(true);
  const [initialLoaded, setInitialLoaded] = useState(false);
  const flowWrapperRef = React.useRef(null);

  // Estados dos modais (mantidos)
  const [modalAddText, setModalAddText] = useState(null);
  const [modalAddInterval, setModalAddInterval] = useState(false);
  //const [modalAddCondition, setModalAddCondition] = useState(null);
  const [modalAddMenu, setModalAddMenu] = useState(null);
  const [modalAddInteractive, setModalAddInteractive] = useState(null);
  const [modalAddImg, setModalAddImg] = useState(null);
  const [modalAddAudio, setModalAddAudio] = useState(null);
  const [modalAddRandomizer, setModalAddRandomizer] = useState(null);
  const [modalAddDistribution, setModalAddDistribution] = useState(null);
  const [modalAddKanban, setModalAddKanban] = useState(null);
  const [modalAddVideo, setModalAddVideo] = useState(null);
  const [modalAddSingleBlock, setModalAddSingleBlock] = useState(null);
  const [modalAddTicket, setModalAddTicket] = useState(null);
  const [modalAddTag, setModalAddTag] = useState(null);
  const [modalAddRemoveTag, setModalAddRemoveTag] = useState(null);
  const [modalAddSwitchFlow, setModalAddSwitchFlow] = useState(null);
  const [modalAddAttendant, setModalAddAttendant] = useState(null);
  const [modalAddInput, setModalAddInput] = useState(null);
  const [modalAddConditionCompare, setModalAddConditionCompare] = useState(null);
  const [modalAddAiAgent, setModalAddAiAgent] = useState(null);
  const [modalAddIgTrigger, setModalAddIgTrigger] = useState(null);
  const [modalAddIgReply, setModalAddIgReply] = useState(null);
  const [modalAddIgDm, setModalAddIgDm] = useState(null);
  const [modalAddIgReward, setModalAddIgReward] = useState(null);
  
  const [modalAddGoogleCalendar, setModalAddGoogleCalendar] = useState(null);
  const [modalAddWaitInput, setModalAddWaitInput] = useState(null);
  const [modalAddExit, setModalAddExit] = useState(null);
  const [n8nLogsDrawerOpen, setN8nLogsDrawerOpen] = useState(false);

  // Estados ReactFlow (mantidos)
  const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
  const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);
  const storageItems = useNodeStorage();

  const connectionLineStyle = {
    stroke: theme.palette.primary.main,
    strokeWidth: isMobileDevice() ? "8px" : "6px"
  };

  // Inicializar sistema de variáveis globais
  useEffect(() => {
    if (!window.flowVariables) {
      window.flowVariables = {};
    }
    window.getFlowVariable = getFlowVariable;
    window.setFlowVariable = setFlowVariable;
  }, []);

  // Função addNode COMPLETA (mantida igual - muito longa para reproduzir aqui)
  const addNode = (type, data) => {
    const posY = nodes[nodes.length - 1].position.y;
    const posX = nodes[nodes.length - 1].position.x + (nodes[nodes.length - 1].width || 200) + 40;

    if (type === "start") {
      return setNodes(old => {
        return [
          ...old.filter(item => item.id !== "1"),
          {
            id: "1",
            position: { x: posX, y: posY },
            data: { label: "Inicio do fluxo" },
            type: "start"
          }
        ];
      });
    }

    if (type === "text") {
      return setNodes(old => {
        return [
          ...old,
          {
            id: geraStringAleatoria(30),
            position: { x: posX, y: posY },
            data: { label: data.text },
            type: "message"
          }
        ];
      });
    }

    if (type === "interval") {
      return setNodes(old => {
        return [
          ...old,
          {
            id: geraStringAleatoria(30),
            position: { x: posX, y: posY },
            data: { label: `Intervalo ${data.sec} seg.`, sec: data.sec },
            type: "interval"
          }
        ];
      });
    }

    if (type === "menu") {
      return setNodes(old => {
        return [
          ...old,
          {
            id: geraStringAleatoria(30),
            position: { x: posX, y: posY },
            data: {
              message: data.message,
              arrayOption: data.arrayOption
            },
            type: "menu"
          }
        ];
      });
    }

    if (type === "interactiveMenu") {
      return setNodes(old => {
        return [
          ...old,
          {
            id: geraStringAleatoria(30),
            position: { x: posX, y: posY },
            data: {
              message: data.message,
              footer: data.footer,
              headerImage: data.headerImage,
              interactiveType: data.interactiveType,
              listButtonText: data.listButtonText,
              arrayOption: data.arrayOption
            },
            type: "interactiveMenu"
          }
        ];
      });
    }

    if (type === "img") {
      return setNodes(old => {
        return [
          ...old,
          {
            id: geraStringAleatoria(30),
            position: { x: posX, y: posY },
            data: { url: data.url, caption: data.caption || "" },
            type: "img"
          }
        ];
      });
    }

    if (type === "audio") {
      return setNodes(old => {
        return [
          ...old,
          {
            id: geraStringAleatoria(30),
            position: { x: posX, y: posY },
            data: { url: data.url, record: data.record, caption: data.caption || "" },
            type: "audio"
          }
        ];
      });
    }

    if (type === "randomizer") {
      return setNodes(old => {
        return [
          ...old,
          {
            id: geraStringAleatoria(30),
            position: { x: posX, y: posY },
            data: { percent: data.percent },
            type: "randomizer"
          }
        ];
      });
    }

    if (type === "distribution") {
      return setNodes(old => {
        return [
          ...old,
          {
            id: geraStringAleatoria(30),
            position: { x: posX, y: posY },
            data: {
              distributionType: data.distributionType,
              memberType: data.memberType,
              members: data.members,
              lastAssignedIndex: -1
            },
            type: "distribution"
          }
        ];
      });
    }

    if (type === "kanban") {
      return setNodes(old => {
        return [
          ...old,
          {
            id: geraStringAleatoria(30),
            position: { x: posX, y: posY },
            data: {
              tagId: data.tagId,
              tagName: data.tagName
            },
            type: "kanban"
          }
        ];
      });
    }

    if (type === "video") {
      return setNodes(old => {
        return [
          ...old,
          {
            id: geraStringAleatoria(30),
            position: { x: posX, y: posY },
            data: { url: data.url, caption: data.caption || "" },
            type: "video"
          }
        ];
      });
    }

    if (type === "singleBlock") {
      return setNodes(old => {
        return [
          ...old,
          {
            id: geraStringAleatoria(30),
            position: { x: posX, y: posY },
            data: { ...data },
            type: "singleBlock"
          }
        ];
      });
    }

    if (type === "ticket") {
      return setNodes(old => {
        return [
          ...old,
          {
            id: geraStringAleatoria(30),
            position: { x: posX, y: posY },
            data: { ...data },
            type: "ticket"
          }
        ];
      });
    }

    if (type === "tag") {
      return setNodes(old => {
        return [
          ...old,
          {
            id: geraStringAleatoria(30),
            position: { x: posX, y: posY },
            data: { ...data },
            type: "tag"
          }
        ];
      });
    }

    if (type === "removeTag") {
      return setNodes((old) => {
        return [
          ...old,
          {
            id: geraStringAleatoria(30),
            position: { x: posX, y: posY },
            data: {
              tag: data?.tag || "",
              ...data,
            },
            type: "removeTag",
          },
        ];
      });
    }

    if (type === "switchFlow") {
      return setNodes(old => {
        return [
          ...old,
          {
            id: geraStringAleatoria(30),
            position: { x: posX, y: posY },
            data: { ...data },
            type: "switchFlow"
          }
        ];
      });
    }

    if (type === "attendant") {
      return setNodes(old => {
        return [
          ...old,
          {
            id: geraStringAleatoria(30),
            position: { x: posX, y: posY },
            data: { ...data },
            type: "attendant"
          }
        ]
      })
    }

    if (type === "waitInput") {
      return setNodes(old => [
        ...old,
        {
          id: geraStringAleatoria(30),
          position: { x: posX, y: posY },
          data: { variableName: "lastResponse", ...data },
          type: "waitInput"
        }
      ]);
    }

    if (type === "exit") {
      return setNodes(old => [
        ...old,
        {
          id: geraStringAleatoria(30),
          position: { x: posX, y: posY },
          data: {
            farewellMessage: "Atendimento encerrado. Obrigado pelo contato!",
            ...data
          },
          type: "exit"
        }
      ]);
    }

    if (type === "httpRequest") {
      return setNodes((old) => [
        ...old,
        {
          id: geraStringAleatoria(30),
          position: { x: posX, y: posY },
          data: {
            url: "",
            method: data?.method || "POST",
            requestBody: data?.requestBody || "{}",
            headersString: data?.headersString || "",
            queryParams: data?.queryParams || [],
            saveVariables: data?.saveVariables || [],
            ...data,
          },
          type: "httpRequest",
        },
      ]);
    }

    if (type === "variable") {
      return setNodes((old) => {
        return [
          ...old,
          {
            id: geraStringAleatoria(30),
            position: { x: posX, y: posY },
            data: {
              variableName: data?.variableName || "",
              variableValue: data?.variableValue || "",
              variableType: data?.variableType || "text",
              variableExpression: data?.variableExpression || "",
              isExpression: data?.isExpression || false,
              ...data,
            },
            type: "variable",
          },
        ];
      });
    }

    if (type === "input") {
      return setNodes((old) => {
        return [
          ...old,
          {
            id: geraStringAleatoria(30),
            position: { x: posX, y: posY },
            data: {
              question: data?.question || "",
              variableName: data?.variableName || "",
              ...data,
            },
              type: "input",
          },
        ];
      });
    }

    if (type === "conditionCompare") {
      return setNodes((old) => [
        ...old,
        {
          id: geraStringAleatoria(30),
          position: { x: posX, y: posY },
          data: {
            leftValue: data?.leftValue || "",
            operator: data?.operator || "equals",
            rightValue: data?.rightValue || "",
            ...data,
          },
          type: "conditionCompare",
        },
      ]);
    }

    if (type === "aiAgent") {
      return setNodes(old => [
        ...old,
        {
          id: geraStringAleatoria(30),
          position: { x: posX, y: posY },
          data: { ...data },
          type: "aiAgent",
        },
      ]);
    }

    if (type === "integration") {
      return setNodes(old => [
        ...old,
        {
          id: geraStringAleatoria(30),
          position: { x: posX, y: posY },
          data: {
            queueIntegrationId: data?.queueIntegrationId || "",
            ...data,
          },
          type: "integration",
        },
      ]);
    }

    if (type === "typebotIntegration") {
      return setNodes(old => [
        ...old,
        {
          id: geraStringAleatoria(30),
          position: { x: posX, y: posY },
          data: {
            queueIntegrationId: data?.queueIntegrationId || "",
            filterType: "typebot",
            ...data,
          },
          type: "typebotIntegration",
        },
      ]);
    }

    if (type === "n8nIntegration") {
      return setNodes(old => [
        ...old,
        {
          id: geraStringAleatoria(30),
          position: { x: posX, y: posY },
          data: {
            queueIntegrationId: data?.queueIntegrationId || "",
            filterType: "n8n",
            ...data,
          },
          type: "n8nIntegration",
        },
      ]);
    }

    if (type === "asaasBoleto") {
      return setNodes(old => [
        ...old,
        {
          id: geraStringAleatoria(30),
          position: { x: posX, y: posY },
          data: {
            variableName: data?.variableName || "cpfCnpj",
            notFoundMessage: data?.notFoundMessage || "Não localizei boletos pendentes para este CPF/CNPJ.",
            ...data,
          },
          type: "asaasBoleto",
        },
      ]);
    }

    const igTypes = ["instagramTrigger", "instagramReplyComment", "instagramLikeComment", "instagramIsFollower", "instagramSendDm", "instagramRewardPdf"];
    if (igTypes.includes(type)) {
      return setNodes(old => [
        ...old,
        { id: geraStringAleatoria(30), position: { x: posX, y: posY }, data: { ...(data || {}) }, type }
      ]);
    }

    if (type === "googleCalendar") {
      return setNodes(old => [
        ...old,
        {
          id: geraStringAleatoria(30),
          position: { x: posX, y: posY },
          data: { label: "Google Agenda", ...(data || {}) },
          type: "googleCalendar",
        },
      ]);
    }

  };

  // Funções de adição (mantidas)
  const textAdd = data => addNode("text", data);
  const intervalAdd = data => addNode("interval", data);
  //const conditionAdd = data => addNode("condition", data);
  const menuAdd = data => addNode("menu", data);
  const interactiveMenuAdd = data => addNode("interactiveMenu", data);
  const imgAdd = data => addNode("img", data);
  const audioAdd = data => addNode("audio", data);
  const randomizerAdd = data => addNode("randomizer", data);
  const distributionAdd = data => addNode("distribution", data);
  const kanbanAdd = data => addNode("kanban", data);
  const videoAdd = data => addNode("video", data);
  const singleBlockAdd = data => addNode("singleBlock", data);
  const ticketAdd = data => addNode("ticket", data);
  const tagAdd = data => addNode("tag", data);
  const removeTagAdd = data => addNode("removeTag", data);
  const switchFlowAdd = data => addNode("switchFlow", data);
  const attendantAdd = data => addNode("attendant", data);
  const waitInputAdd = data => addNode("waitInput", data);
  const exitAdd = data => addNode("exit", data);
  const variableAdd = data => addNode("variable", data);
  const inputAdd = data => addNode("input", data);
  const conditionCompareAdd = data => addNode("conditionCompare", data);
  const aiAgentAdd = data => addNode("aiAgent", data);
  const igTriggerAdd = data => addNode("instagramTrigger", data);
  const igReplyAdd = data => addNode("instagramReplyComment", data);
  const igLikeAdd = data => addNode("instagramLikeComment", data);
  const igIsFollowerAdd = data => addNode("instagramIsFollower", data);
  const igDmAdd = data => addNode("instagramSendDm", data);
  const igRewardAdd = data => addNode("instagramRewardPdf", data);

  // useEffect para carregar fluxo COMPLETO (mantido)
  useEffect(() => {
    setLoading(true);
    const delayDebounceFn = setTimeout(() => {
      const fetchContacts = async () => {
        try {
          const { data } = await api.get(`/flowbuilder/flow/${id}`);
          if (data.flow.flow !== null) {
            const preparedNodes = data.flow.flow.nodes.map((node) => {
              if (node.type === "httpRequest") {

                if (node.data.saveVariables && node.data.saveVariables.length > 0) {

                  if (
                    !node.data.responseVariables ||
                    !Array.isArray(node.data.responseVariables)
                  ) {
                    node.data.responseVariables = node.data.saveVariables.map(
                      (item) => ({
                        path: item.path,
                        variableName: item.variable,
                      })
                    );
                  }
                } else {
                  node.data.saveVariables = node.data.saveVariables || [];
                  node.data.responseVariables = node.data.responseVariables || [];
                }

              }
              return node;
            });

            setNodes(preparedNodes);
            setEdges(data.flow.flow.connections);
          }
          if (typeof data?.flow?.active !== "undefined") {
            setFlowActive(!!data.flow.active);
          }
          setLoading(false);
          // marcar carregamento inicial concluído após estabilizar estado
          setTimeout(() => {
            setIsDirty(false);
            setInitialLoaded(true);
          }, 100);
        } catch (err) {
          toastError(err);
        }
      };
      fetchContacts();
    }, 500);
    return () => clearTimeout(delayDebounceFn);
  }, [id]);

  // 🔴 Realtime: escuta execução dos nós do fluxo (emitido pelo backend em ActionsWebhookService)
  useEffect(() => {
    if (!socket || !user?.companyId || !id) return;
    const companyId = user.companyId;
    const eventName = `company-${companyId}-flow-node`;

    const handler = (payload) => {
      if (!payload || String(payload.flowId) !== String(id)) return;
      const { nodeId, status, errorMessage, nodeType, timestamp, ticketId } = payload;
      if (!nodeId) return;

      setExecutionState((old) => ({
        ...old,
        [nodeId]: { status, errorMessage, nodeType, ts: timestamp }
      }));

      setExecutionEvents((old) => {
        const next = [
          { nodeId, nodeType, status, errorMessage, ticketId, ts: timestamp },
          ...old
        ];
        return next.slice(0, 50);
      });

      // Auto-limpa o estado "running/success" após alguns segundos para não ficar preso
      if (status === "success") {
        setTimeout(() => {
          setExecutionState((old) => {
            const cur = old[nodeId];
            if (!cur || cur.ts !== timestamp) return old;
            const { [nodeId]: _, ...rest } = old;
            return rest;
          });
        }, 4000);
      }
    };

    socket.on(eventName, handler);
    return () => socket.off(eventName, handler);
  }, [socket, user?.companyId, id]);

  // Aplica estilo (borda colorida) nos nós conforme status de execução
  useEffect(() => {
    setNodes((old) =>
      old.map((n) => {
        const st = executionState[n.id];
        const baseStyle = { ...(n.style || {}) };
        // Remove marcadores anteriores
        delete baseStyle.boxShadow;
        delete baseStyle.outline;
        delete baseStyle.outlineOffset;
        if (st) {
          const color =
            st.status === "error"
              ? "#e53935"
              : st.status === "success"
              ? "#43a047"
              : "#fb8c00"; // running
          baseStyle.outline = `3px solid ${color}`;
          baseStyle.outlineOffset = "2px";
          baseStyle.boxShadow = `0 0 0 6px ${color}33`;
        }
        return { ...n, style: baseStyle };
      })
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [executionState]);

  // useEffect para storage COMPLETO (mantido)
  useEffect(() => {
    if (storageItems.action === "delete") {
      setNodes(old => old.filter(item => item.id !== storageItems.node));
      setEdges(old => {
        const newData = old.filter(item => item.source !== storageItems.node);
        const newClearTarget = newData.filter(
          item => item.target !== storageItems.node
        );
        return newClearTarget;
      });
      storageItems.setNodesStorage("");
      storageItems.setAct("idle");
    }
    if (storageItems.action === "disconnect") {
      setEdges(old => old.filter(
        item => item.source !== storageItems.node && item.target !== storageItems.node
      ));
      storageItems.setNodesStorage("");
      storageItems.setAct("idle");
    }
    if (storageItems.action === "duplicate") {
      const nodeDuplicate = nodes.filter(
        item => item.id === storageItems.node
      )[0];
      const maioresX = nodes.map(node => node.position.x);
      const maiorX = Math.max(...maioresX);
      const finalY = nodes[nodes.length - 1].position.y;
      const nodeNew = {
        ...nodeDuplicate,
        id: geraStringAleatoria(30),
        position: {
          x: maiorX + 240,
          y: finalY
        },
        selected: false,
        style: {
          backgroundColor: theme.palette.grey[800],
          padding: 0,
          borderRadius: 8,
          border: `1px solid ${theme.palette.divider}`
        }
      };
      setNodes(old => [...old, nodeNew]);
      storageItems.setNodesStorage("");
      storageItems.setAct("idle");
    }
    // Ação "edit": reaproveita o MESMO dispatcher por tipo já usado no duplo
    // clique (função doubleClick, mais abaixo). Criada pro ícone de editar
    // do nó Randomizador — antes ele só tinha duplicar/desconectar/excluir,
    // sem nenhum jeito visível de abrir a configuração (só funcionava com
    // duplo clique, o que não é óbvio pra quem está usando o FlowBuilder).
    if (storageItems.action === "edit") {
      const nodeToEdit = nodes.find(item => item.id === storageItems.node);
      if (nodeToEdit) doubleClick(null, nodeToEdit);
      storageItems.setNodesStorage("");
      storageItems.setAct("idle");
    }
  }, [storageItems.action, nodes, theme]);

  const onConnect = useCallback(
    params => setEdges(eds => addEdge(params, eds)),
    [setEdges]
  );

  // Função de salvar COMPLETA (mantida) - silent=true para auto-save
  const saveFlow = async (silent = false) => {
    if (isSaving) return;
    setIsSaving(true);
    try {
      const processedNodes = nodes.map((node) => {
        if (node.type === "httpRequest") {
          if (node.data.saveVariables && node.data.saveVariables.length > 0) {
            if (
              !node.data.responseVariables ||
              !Array.isArray(node.data.responseVariables)
            ) {
              node.data.responseVariables = node.data.saveVariables.map(
                (item) => ({
                  path: item.path,
                  variableName: item.variable,
                })
              );
            }
          } else {
            node.data.saveVariables = node.data.saveVariables || [];
            node.data.responseVariables = node.data.responseVariables || [];
          }
        }
        return node;
      });

      await api.post("/flowbuilder/flow", {
        idFlow: id,
        nodes: processedNodes,
        connections: edges,
      });
      if (!silent) {
        toast.success(i18n.t("hardcoded.flowSavedSuccess"));
      }
      setNodes(processedNodes);
      setIsDirty(false);
      setLastSavedAt(Date.now());
    } catch (error) {
      if (!silent) {
        toast.error(i18n.t("hardcoded.flowSaveError"));
      }
      console.error("Erro ao salvar o fluxo:", error);
    } finally {
      setIsSaving(false);
    }
  };

  // Marcar dirty sempre que nodes/edges mudarem após o load inicial
  useEffect(() => {
    if (!initialLoaded) return;
    setIsDirty(true);
  }, [nodes, edges, initialLoaded]);

  // Auto-save com debounce
  useEffect(() => {
    if (!initialLoaded || !isDirty) return;
    const t = setTimeout(() => {
      saveFlow(true);
    }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [nodes, edges, initialLoaded, isDirty]);

  // Toggle ativo/pausado
  const handleToggleActive = async () => {
    try {
      const newActive = !flowActive;
      await api.put(`/flowbuilder/${id}/toggle-active`, { active: newActive });
      setFlowActive(newActive);
      toast.success(newActive ? "Fluxo ativado" : "Fluxo pausado");
    } catch (err) {
      toastError(err);
    }
  };

  // Testar fluxo - abre modal de simulação
  const [testModalOpen, setTestModalOpen] = useState(false);
  const handleTestFlow = () => {
    setTestModalOpen(true);
  };

  // Fullscreen
  const handleFullscreen = () => {
    const el = flowWrapperRef.current;
    if (!el) return;
    if (document.fullscreenElement) {
      document.exitFullscreen();
    } else if (el.requestFullscreen) {
      el.requestFullscreen();
    }
  };

  // Event handlers COMPLETOS (mantidos mas adaptados para tema)
  const doubleClick = (event, node) => {
    setDataNode(node);
    if (node.type === "message") setModalAddText("edit");
    if (node.type === "interval") setModalAddInterval("edit");
    if (node.type === "menu") setModalAddMenu("edit");
    if (node.type === "img") setModalAddImg("edit");
    if (node.type === "audio") setModalAddAudio("edit");
    if (node.type === "randomizer") setModalAddRandomizer("edit");
    if (node.type === "distribution") setModalAddDistribution("edit");
    if (node.type === "kanban") setModalAddKanban("edit");
    if (node.type === "video") setModalAddVideo("edit");
    if (node.type === "singleBlock") setModalAddSingleBlock("edit");
    if (node.type === "ticket") setModalAddTicket("edit");
    if (node.type === "tag") setModalAddTag("edit");
    if (node.type === "removeTag") setModalAddRemoveTag("edit");
    if (node.type === "switchFlow") setModalAddSwitchFlow("edit");
    if (node.type === "openai" || node.type === "gemini") setModalAddAiAgent("edit");
    if (node.type === "interactiveMenu") setModalAddInteractive("edit");
    if (node.type === "attendant") setModalAddAttendant("edit");
    if (node.type === "waitInput") setModalAddWaitInput("edit");
    if (node.type === "exit") setModalAddExit("edit");
    if (node.type === "httpRequest") {
      if (node.data.saveVariables && node.data.saveVariables.length > 0) {
        if (
          !node.data.responseVariables ||
          !Array.isArray(node.data.responseVariables)
        ) {
          node.data.responseVariables = node.data.saveVariables.map((item) => ({
            path: item.path,
            variableName: item.variable,
          }));

          setNodes((old) =>
            old.map((itemNode) => {
              if (itemNode.id === node.id) {
                return node;
              }
              return itemNode;
            })
          );

        }
      }
    }
    if (node.type === "input") setModalAddInput("edit");
    if (node.type === "conditionCompare") setModalAddConditionCompare("edit");
    if (node.type === "aiAgent") setModalAddAiAgent("edit");
    if (node.type === "instagramTrigger") setModalAddIgTrigger("edit");
    if (node.type === "instagramReplyComment") setModalAddIgReply("edit");
    if (node.type === "instagramSendDm") setModalAddIgDm("edit");
    if (node.type === "instagramRewardPdf") setModalAddIgReward("edit");
    
    if (node.type === "googleCalendar") setModalAddGoogleCalendar("edit");
  };

  const clickNode = (event, node) => {
    setNodes(old =>
      old.map(item => {
        if (item.id === node.id) {
          return {
            ...item,
            style: {
              backgroundColor: theme.palette.primary.main,
              padding: 1,
              borderRadius: 8,
              border: `2px solid ${theme.palette.primary.dark}`
            }
          };
        }
        return {
          ...item,
          style: {
            backgroundColor: theme.palette.grey[800],
            padding: 0,
            borderRadius: 8,
            border: `1px solid ${theme.palette.divider}`
          }
        };
      })
    );
  };

  const clickEdge = (event, node) => {
    setNodes(old =>
      old.map(item => {
        return {
          ...item,
          style: {
            backgroundColor: theme.palette.grey[800],
            padding: 0,
            borderRadius: 8,
            border: `1px solid ${theme.palette.divider}`
          }
        };
      })
    );
  };

  const doubleClickEdge = useCallback((event, edge) => {
    event.stopPropagation();
    setEdges(eds => eds.filter(e => e.id !== edge.id));
  }, [setEdges]);

  const updateNode = dataAlter => {
    setNodes(old =>
      old.map(itemNode => {
        if (itemNode.id === dataAlter.id) {
          return dataAlter;
        }
        return itemNode;
      })
    );
    // Fechar todos os modais
    setModalAddText(null);
    setModalAddInterval(null);
    setModalAddMenu(null);
    setModalAddInteractive(null);
    setModalAddImg(null);
    
    setModalAddAudio(null);
    setModalAddRandomizer(null);
    setModalAddVideo(null);
    
    setModalAddSingleBlock(null);
    setModalAddTicket(null);
    setModalAddRemoveTag(null);
    setModalAddTag(null);
    setModalAddSwitchFlow(null);
    setModalAddAttendant(null);
    setModalAddWaitInput(null);
    setModalAddExit(null);
    setModalAddInput(null);
    setModalAddConditionCompare(null);
    setModalAddAiAgent(null);
    setModalAddIgTrigger(null);
    setModalAddIgReply(null);
    setModalAddIgDm(null);
    setModalAddIgReward(null);
    
    
  };

  // Handler para categoria expand/collapse
  const handleCategoryToggle = (categoryName) => {
    setExpandedCategories(prev =>
      prev.includes(categoryName)
        ? prev.filter(name => name !== categoryName)
        : [...prev, categoryName]
    );
  };

  // Handler para ações de nós
  const clickActions = type => {
    setBottomSheetOpen(false);

    switch (type) {
      case "start":
        addNode("start");
        break;
      case "menu":
        setModalAddMenu("create");
        break;
      case "content":
        setModalAddSingleBlock("create");
        break;
      case "interactiveMenu":
        setModalAddInteractive("create");
        break;
      case "text":
        setModalAddText("create");
        break;
      case "random":
        setModalAddRandomizer("create");
        break;
      case "distribution":
        setModalAddDistribution("create");
        break;
      case "kanban":
        setModalAddKanban("create");
        break;
      case "interval":
        setModalAddInterval("create");
        break;
      case "ticket":
        setModalAddTicket("create");
        break;
      case "tag":
        setModalAddTag("create");
        break;
      case "removeTag":
        setModalAddRemoveTag("create");
        break;
      case "switchFlow":
        setModalAddSwitchFlow("create");
        break;
      case "attendant":
        setModalAddAttendant("create");
        break;
      case "waitInput":
        setModalAddWaitInput("create");
        break;
      case "exit":
        setModalAddExit("create");
        break;
      case "httpRequest":
        addNode("httpRequest");
        break;
      case "variable":
        addNode("variable");
        break;
      case "input":
        setModalAddInput("create");
        break;
      case "conditionCompare":
        setModalAddConditionCompare("create");
        break;
      case "openai":
      case "gemini":
        setModalAddAiAgent("create");
        break;
      case "aiAgent":
        setModalAddAiAgent("create");
        break;
      case "integration":
        addNode("integration");
        break;
      case "typebotIntegration":
        addNode("typebotIntegration");
        break;
      case "n8nIntegration":
        addNode("n8nIntegration");
        break;
      case "asaasBoleto":
        addNode("asaasBoleto");
        break;
      case "img":
        setModalAddImg("create");
        break;
      case "audio":
        setModalAddAudio("create");
        break;
      case "video":
        setModalAddVideo("create");
        break;
      case "instagramTrigger":
        setModalAddIgTrigger("create");
        break;
      case "instagramReplyComment":
        setModalAddIgReply("create");
        break;
      case "instagramLikeComment":
        addNode("instagramLikeComment");
        break;
      case "instagramIsFollower":
        addNode("instagramIsFollower");
        break;
      case "instagramSendDm":
        setModalAddIgDm("create");
        break;
      case "instagramRewardPdf":
        setModalAddIgReward("create");
        break;
      case "googleCalendar":
        setModalAddGoogleCalendar("create");
        break;
      default:
    }
  };

  // Componente do Sidebar
  const SidebarContent = () => {
    const search = (nodeSearch || "").trim().toLowerCase();
    const filterNodes = (nodes) => {
      if (!search) return nodes;
      return nodes.filter((n) =>
        (n.name || "").toLowerCase().includes(search) ||
        (n.description || "").toLowerCase().includes(search)
      );
    };
    return (
      <div className={classes.sidebarContent}>
        {sidebarOpen && (
          <>
            <div className={classes.sidebarSectionTitle}>
              {i18n.t("flowBuilderConfigPage.components", "Componentes")}
            </div>
            <div className={classes.sidebarSearchWrap}>
              <input
                type="text"
                placeholder={i18n.t("flowBuilderConfigPage.searchPlaceholder", "Buscar...")}
                value={nodeSearch}
                onChange={(e) => setNodeSearch(e.target.value)}
                className={classes.sidebarSearchInput}
              />
            </div>
          </>
        )}

        {nodeCategories.map((category) => {
          const visibleNodes = filterNodes(category.nodes);
          if (sidebarOpen && search && visibleNodes.length === 0) return null;
          const catColor = typeof category.color === 'function' ? category.color(theme) : category.color;
          const isOpen = expandedCategories.includes(category.name) || !!search;
          return (
            <div key={category.name}>
              {sidebarOpen ? (
                <>
                  <div
                    className={classes.categoryHeader}
                    onClick={() => handleCategoryToggle(category.name)}
                  >
                    <Box display="flex" alignItems="center" justifyContent="space-between">
                      <Typography variant="body2" style={{ fontWeight: 600 }}>
                        {category.name}
                      </Typography>
                      {isOpen ? <ExpandLess fontSize="small" /> : <ExpandMore fontSize="small" />}
                    </Box>
                  </div>

                  <Collapse in={isOpen}>
                    <div style={{ paddingBottom: 4 }}>
                      {visibleNodes.map((node) => (
                        <div
                          key={node.type}
                          className={classes.nodeCard}
                          onClick={() => clickActions(node.type)}
                        >
                          <div className={classes.nodeCardIconBox} style={{ color: catColor }}>
                            {node.icon}
                          </div>
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div className={classes.nodeCardTitle}>{node.name}</div>
                            {node.description && (
                              <div className={classes.nodeCardDesc}>{node.description}</div>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  </Collapse>
                </>
              ) : (
                <div>
                  {category.nodes.map((node) => (
                    <Tooltip key={node.type} title={node.name} placement="right">
                      <IconButton
                        className={classes.collapsedNodeButton}
                        onClick={() => clickActions(node.type)}
                        style={{ color: catColor }}
                      >
                        {node.icon}
                      </IconButton>
                    </Tooltip>
                  ))}
                </div>
              )}
            </div>
          );
        })}
      </div>
    );
  };

  // Componente do Bottom Sheet
  const BottomSheetContent = () => (
    <Slide direction="up" in={bottomSheetOpen} mountOnEnter unmountOnExit>
      <div className={classes.bottomSheet}>
        <div
          className={classes.bottomSheetHandle}
          onClick={() => setBottomSheetOpen(false)}
        />

        <div className={classes.bottomSheetHeader}>
          <Typography variant="h6">{i18n.t("flowBuilderConfigPage.addNodes")}</Typography>
          <IconButton onClick={() => setBottomSheetOpen(false)} size="small">
            <CloseIcon />
          </IconButton>
        </div>

        <div className={classes.bottomSheetContent}>
          <Grid container spacing={2}>
            {nodeCategories.map((category) => (
              <Grid item xs={6} key={category.name}>
                <Paper elevation={1} className={classes.categoryCard} style={{ padding: 8 }}>
                  <Typography
                    variant="subtitle2"
                    className={classes.categoryTitle}
                    style={{ color: typeof category.color === 'function' ? category.color(theme) : category.color, marginBottom: 8 }}
                  >
                    {category.name}
                  </Typography>
                  {category.nodes.map((node) => (
                    <Button
                      key={node.type}
                      fullWidth
                      variant="outlined"
                      onClick={() => clickActions(node.type)}
                      startIcon={
                        <Box sx={{ color: typeof category.color === 'function' ? category.color(theme) : category.color }}>
                          {node.icon}
                        </Box>
                      }
                      className={classes.categoryNodeBtn}
                      size="small"
                    >
                      {node.name}
                    </Button>
                  ))}
                </Paper>
              </Grid>
            ))}
          </Grid>
        </div>
      </div>
    </Slide>
  );

  if (loading) {
    return (
      <div className={classes.root}>
        <div className={classes.header}>
          <MainHeader>
            <Title>{i18n.t("flowBuilderConfigPage.flowEditor")}</Title>
          </MainHeader>
        </div>
        <div className={classes.loadingContainer}>
          <CircularProgress style={{ color: theme.palette.primary.main }} />
        </div>
      </div>
    );
  }

  return (
    <div className={classes.root}>
      {/* Header */}
      <div className={classes.header}>
        <MainHeader>
          <Title>{i18n.t("flowBuilderConfigPage.flowEditor")}</Title>
        </MainHeader>
      </div>

      {/* Content */}
      <div className={classes.content}>
        {/* Sidebar Desktop */}
        {!isMobile && (
          <div className={classes.sidebar}>
            <div className={classes.sidebarHeader} style={{ justifyContent: "flex-end" }}>
              <Tooltip title="Sair do FlowBuilder">
                <IconButton
                  onClick={() => history.push("/flowbuilders")}
                  size="small"
                >
                  <ChevronLeft />
                </IconButton>
              </Tooltip>
            </div>

            <SidebarContent />
          </div>
        )}

        {/* Flow Container */}
        <div className={classes.flowContainer} ref={flowWrapperRef}>
          <ReactFlow
            nodes={nodes}
            edges={edges}
            deleteKeyCode={["Backspace", "Delete"]}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            onNodeDoubleClick={doubleClick}
            onNodeClick={clickNode}
            onEdgeClick={clickEdge}
            onEdgeDoubleClick={doubleClickEdge}
            onConnect={onConnect}
            nodeTypes={nodeTypes}
            fitView
            connectionLineStyle={connectionLineStyle}
            style={{
              backgroundColor: "#F8F9FA"
            }}
            edgeTypes={edgeTypes}
            variant={"cross"}
            defaultEdgeOptions={{
              style: { color: "#ff0000", strokeWidth: "6px" },
              animated: false
            }}
          >
            <Controls />
            <MiniMap />
            <Background variant="dots" gap={12} size={-1} />
            {!isMobile && (
              <TopToolbar
                isDirty={isDirty}
                isSaving={isSaving}
                lastSavedAt={lastSavedAt}
                onSave={() => saveFlow(false)}
                isActive={flowActive}
                onToggleActive={handleToggleActive}
                onTest={handleTestFlow}
                onFullscreen={handleFullscreen}
                onOpenN8nLogs={() => setN8nLogsDrawerOpen(true)}
              />
            )}
          </ReactFlow>

        </div>
      </div>

      {/* Mobile Controls */}
      {isMobile && <MobileControls />}

      {/* Bottom Sheet Mobile */}
      {isMobile && <BottomSheetContent />}

      {/* FAB Adicionar - só em mobile */}
      {isMobile && (
        <Fab
          color="secondary"
          className={classes.addFab}
          onClick={() => setBottomSheetOpen(true)}
        >
          <AddIcon />
        </Fab>
      )}

      {/* Click Away Listener para Bottom Sheet */}
      {isMobile && bottomSheetOpen && (
        <ClickAwayListener onClickAway={() => setBottomSheetOpen(false)}>
          <div />
        </ClickAwayListener>
      )}

      {/* TODOS OS MODAIS COMPLETOS - mantidos iguais */}
      <FlowBuilderAddTextModal
        open={modalAddText}
        onSave={textAdd}
        data={dataNode}
        onUpdate={updateNode}
        close={setModalAddText}
      />
      <FlowBuilderIntervalModal
        open={modalAddInterval}
        onSave={intervalAdd}
        data={dataNode}
        onUpdate={updateNode}
        close={setModalAddInterval}
      />
      <FlowBuilderMenuModal
        open={modalAddMenu}
        onSave={menuAdd}
        data={dataNode}
        onUpdate={updateNode}
        close={setModalAddMenu}
      />
      <FlowBuilderInteractiveModal
        open={modalAddInteractive}
        onSave={interactiveMenuAdd}
        data={dataNode}
        onUpdate={updateNode}
        close={setModalAddInteractive}
      />
      <FlowBuilderAddImgModal
        open={modalAddImg}
        onSave={imgAdd}
        data={dataNode}
        onUpdate={updateNode}
        close={setModalAddImg}
      />
      <FlowBuilderAddAudioModal
        open={modalAddAudio}
        onSave={audioAdd}
        data={dataNode}
        onUpdate={updateNode}
        close={setModalAddAudio}
      />
      <FlowBuilderRandomizerModal
        open={modalAddRandomizer}
        onSave={randomizerAdd}
        data={dataNode}
        onUpdate={updateNode}
        close={setModalAddRandomizer}
      />
      <FlowBuilderDistributionModal
        open={modalAddDistribution}
        onSave={distributionAdd}
        data={dataNode}
        onUpdate={updateNode}
        close={setModalAddDistribution}
      />
      <FlowBuilderKanbanModal
        open={modalAddKanban}
        onSave={kanbanAdd}
        data={dataNode}
        onUpdate={updateNode}
        close={setModalAddKanban}
      />
      <FlowBuilderAddVideoModal
        open={modalAddVideo}
        onSave={videoAdd}
        data={dataNode}
        onUpdate={updateNode}
        close={setModalAddVideo}
      />
      <FlowBuilderSingleBlockModal
        open={modalAddSingleBlock}
        onSave={singleBlockAdd}
        data={dataNode}
        onUpdate={updateNode}
        close={setModalAddSingleBlock}
      />
      <FlowBuilderTicketModal
        open={modalAddTicket}
        onSave={ticketAdd}
        data={dataNode}
        onUpdate={updateNode}
        close={setModalAddTicket}
      />
      <FlowBuilderAddTagModal
        open={modalAddTag}
        onSave={tagAdd}
        data={dataNode}
        onUpdate={updateNode}
        close={setModalAddTag}
      />
      <FlowBuilderRemoveTagModal
        open={modalAddRemoveTag}
        onSave={removeTagAdd}
        data={dataNode}
        onUpdate={updateNode}
        close={() => setModalAddRemoveTag(null)}
      />
      <FlowBuilderAddSwitchFlowModal
        open={modalAddSwitchFlow}
        onSave={switchFlowAdd}
        data={dataNode}
        onUpdate={updateNode}
        close={setModalAddSwitchFlow}
      />
      <FlowBuilderAddAttendantModal
        open={modalAddAttendant}
        onSave={attendantAdd}
        data={dataNode}
        onUpdate={updateNode}
        close={setModalAddAttendant}
      />
      <FlowBuilderWaitInputModal
        open={modalAddWaitInput}
        onSave={waitInputAdd}
        data={dataNode}
        onUpdate={updateNode}
        close={setModalAddWaitInput}
      />
      <FlowBuilderExitModal
        open={modalAddExit}
        onSave={exitAdd}
        data={dataNode}
        onUpdate={updateNode}
        close={setModalAddExit}
      />
      <FlowBuilderInputModal
        open={modalAddInput}
        onSave={inputAdd}
        data={dataNode}
        onUpdate={updateNode}
        close={setModalAddInput}
      />
      <FlowBuilderConditionCompareModal
        open={modalAddConditionCompare}
        onSave={conditionCompareAdd}
        data={dataNode?.type === "conditionCompare" ? dataNode : null}
        onUpdate={updateNode}
        close={() => setModalAddConditionCompare(null)}
        nodes={nodes}
      />
      <FlowBuilderAiAgentModal
        open={modalAddAiAgent}
        onSave={aiAgentAdd}
        data={dataNode}
        onUpdate={updateNode}
        close={setModalAddAiAgent}
      />
      <FlowBuilderInstagramTriggerModal
        open={modalAddIgTrigger}
        onSave={igTriggerAdd}
        data={dataNode}
        onUpdate={updateNode}
        close={setModalAddIgTrigger}
      />
      <FlowBuilderInstagramReplyModal
        open={modalAddIgReply}
        onSave={igReplyAdd}
        data={dataNode}
        onUpdate={updateNode}
        close={setModalAddIgReply}
      />
      <FlowBuilderInstagramDmModal
        open={modalAddIgDm}
        onSave={igDmAdd}
        data={dataNode}
        onUpdate={updateNode}
        close={setModalAddIgDm}
      />
      <FlowBuilderInstagramRewardModal
        open={modalAddIgReward}
        onSave={igRewardAdd}
        data={dataNode}
        onUpdate={updateNode}
        close={setModalAddIgReward}
      />
      <FlowBuilderGoogleCalendarModal
        open={modalAddGoogleCalendar}
        onSave={(d) => addNode("googleCalendar", d)}
        data={dataNode}
        onUpdate={updateNode}
        close={setModalAddGoogleCalendar}
      />
      <N8nLogsDrawer
        open={n8nLogsDrawerOpen}
        onClose={() => setN8nLogsDrawerOpen(false)}
        flowId={id}
      />
      <FlowBuilderTestModal
        open={testModalOpen}
        onClose={() => setTestModalOpen(false)}
        nodes={nodes}
        edges={edges}
      />
      <FlowExecutionOverlay
        events={executionEvents}
        state={executionState}
        onClear={() => { setExecutionEvents([]); setExecutionState({}); }}
      />
    </div>
  );
};