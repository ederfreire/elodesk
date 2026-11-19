import { Sequelize } from "sequelize-typescript";
import User from "../models/User";
import Setting from "../models/Setting";
import Contact from "../models/Contact";
import Ticket from "../models/Ticket";
import Whatsapp from "../models/Whatsapp";
import ContactCustomField from "../models/ContactCustomField";
import Message from "../models/Message";
import Queue from "../models/Queue";
import WhatsappQueue from "../models/WhatsappQueue";
import UserQueue from "../models/UserQueue";
import UserWhatsapp from "../models/UserWhatsapp";
import Company from "../models/Company";
import Plan from "../models/Plan";
import TicketNote from "../models/TicketNote";
import QuickMessage from "../models/QuickMessage";
import GroupGreeting from "../models/GroupGreeting";
import OfficialCall from "../models/OfficialCall";
import Help from "../models/Help";
import TicketTraking from "../models/TicketTraking";
import UserRating from "../models/UserRating";
import Schedule from "../models/Schedule";
import Tag from "../models/Tag";
import TicketTag from "../models/TicketTag";
import ContactList from "../models/ContactList";
import ContactListItem from "../models/ContactListItem";
import Campaign from "../models/Campaign";
import CampaignSetting from "../models/CampaignSetting";
import Baileys from "../models/Baileys";
import CampaignShipping from "../models/CampaignShipping";
import Announcement from "../models/Announcement";
import Chat from "../models/Chat";
import ChatUser from "../models/ChatUser";
import ChatMessage from "../models/ChatMessage";
import Chatbot from "../models/Chatbot";
import DialogChatBots from "../models/DialogChatBots";
import QueueIntegrations from "../models/QueueIntegrations";
import Invoices from "../models/Invoices";
import Subscriptions from "../models/Subscriptions";
import ApiUsages from "../models/ApiUsages";
import PasswordResetCode from "../models/PasswordResetCode";
import Files from "../models/Files";
import FilesOptions from "../models/FilesOptions";
import ContactTag from "../models/ContactTag";
import CompaniesSettings from "../models/CompaniesSettings";
import LogTicket from "../models/LogTicket";
import Prompt from "../models/Prompt";
import Partner from "../models/Partner";
import ContactWallet from "../models/ContactWallet";
import ScheduledMessages from "../models/ScheduledMessages";
import ScheduledMessagesEnvio from "../models/ScheduledMessagesEnvio";
import Versions from "../models/Versions";
import QuickMessageComponent from "../models/QuickMessageComponent";
import BirthdaySettings from "../models/BirthdaySettings";
import PushSubscription from "../models/PushSubscription";
import InteractiveMessageTemplate from "../models/InteractiveMessageTemplate";
import { FlowDefaultModel } from "../models/FlowDefault";
import { FlowBuilderModel } from "../models/FlowBuilder";
import { FlowAudioModel } from "../models/FlowAudio";
import { FlowDocModel } from "../models/FlowDoc";
import { FlowCampaignModel } from "../models/FlowCampaign";
import { FlowImgModel } from "../models/FlowImg";
import { WebhookModel } from "../models/Webhook";
import QueueState from "../models/QueueStates";
import TicketFinalizationReason from "../models/TicketFinalizationReason";
import PresetWebhookModel from "../models/PresetWebhook";
import WhatsappLidMap from "../models/WhatsapplidMap";
import CallHistory from "../models/CallHistory";
import CompanyKanbanConfig from "../models/CompanyKanbanConfig";
import KanbanBoard from "../models/KanbanBoard";
import Floup from "../models/Floup";
import FloupSchedule from "../models/FloupSchedule";
import FloupStepEvent from "../models/FloupStepEvent";
import PromptKnowledgeBase from "../models/PromptKnowledgeBase";
import N8NLog from "../models/N8NLog";
import TodoTask from "../models/TodoTask";
import TodoSubtask from "../models/TodoSubtask";
import Lead from "../models/Lead";
import FlowWaitTimer from "../models/FlowWaitTimer";
import LeadSource from "../models/LeadSource";
import UtmLink from "../models/UtmLink";
import SalesAgent from "../models/SalesAgent";
import SalesAgentLead from "../models/SalesAgentLead";
import AgentTemplate from "../models/AgentTemplate";
import Course from "../models/Course";
import CourseLesson from "../models/CourseLesson";
import CourseCompany from "../models/CourseCompany";
import CourseComment from "../models/CourseComment";
import AppointmentService from "../models/AppointmentService";
import AppointmentBooking from "../models/AppointmentBooking";


// eslint-disable-next-line
const dbConfig = require("../config/database");

const sequelize = new Sequelize(dbConfig);

const models = [
  Company,
  LeadSource,
  UtmLink,
  SalesAgent,
  SalesAgentLead,
  AgentTemplate,
  Course,
  CourseLesson,
  CourseCompany,
  CourseComment,
  AppointmentService,
  AppointmentBooking,
  User,
  Contact,
  ContactTag,
  Ticket,
  Message,
  Whatsapp,
  ContactCustomField,
  Setting,
  Queue,
  WhatsappQueue,
  UserQueue,
  UserWhatsapp,
  Plan,
  TicketNote,
  QuickMessage,
  GroupGreeting,
  OfficialCall,
  Help,
  TicketTraking,
  UserRating,
  Schedule,
  Tag,
  TicketTag,
  ContactList,
  ContactListItem,
  Campaign,
  CampaignSetting,
  Baileys,
  CampaignShipping,
  Announcement,
  Chat,
  ChatUser,
  ChatMessage,
  Chatbot,
  DialogChatBots,
  QueueIntegrations,
  Invoices,
  Subscriptions,
  ApiUsages,
  Files,
  FilesOptions,
  CompaniesSettings,
  LogTicket,
  Prompt,
  Partner,
  ContactWallet,
  ScheduledMessages,
  ScheduledMessagesEnvio,
  Versions,
  QuickMessageComponent,
  FlowDefaultModel,
  FlowBuilderModel,
  FlowAudioModel,
  FlowCampaignModel,
  FlowImgModel,
  FlowDocModel,
  WebhookModel,
  QueueState,
  TicketFinalizationReason,
  PresetWebhookModel,
  BirthdaySettings,
  WhatsappLidMap,
  CallHistory,
  CompanyKanbanConfig
  , Floup
  , FloupSchedule
  , FloupStepEvent

  , PushSubscription
  , InteractiveMessageTemplate
  , PasswordResetCode
  , PromptKnowledgeBase
  , N8NLog
  , TodoTask
  , TodoSubtask
  , Lead
  , FlowWaitTimer
];

// Append KanbanBoard via mutation to avoid touching original models array order
(models as any[]).push(KanbanBoard);

// Google Calendar Integration
// eslint-disable-next-line @typescript-eslint/no-var-requires
const GoogleCalendarIntegration = require("../models/GoogleCalendarIntegration").default;
(models as any[]).push(GoogleCalendarIntegration);


sequelize.addModels(models);


export default sequelize;
