import React, { useEffect, useState, useContext, Suspense, lazy } from "react";
import { BrowserRouter, Switch } from "react-router-dom";
import { ToastContainer } from "react-toastify";
import moment from "moment";

import LoggedInLayout from "../layout";
import { i18n } from "../translate/i18n";
import Dashboard from "../pages/Dashboard/";
import TicketResponsiveContainer from "../pages/TicketResponsiveContainer";
import Signup from "../pages/Signup";
import Login from "../pages/Login/";
import ForgotPassword from "../pages/ForgotPassword/";
import ValidateCode from "../pages/ValidateCode/";
import ResetPassword from "../pages/ResetPassword/";
import { AuthProvider, AuthContext } from "../context/Auth/AuthContext";
import { TicketsContextProvider } from "../context/Tickets/TicketsContext";
import { WhatsAppsProvider } from "../context/WhatsApp/WhatsAppsContext";
import { WaCallsProvider } from "../context/WaCalls/WaCallsContext";
// WaCallsSoftphone (toast do canto inferior direito) foi removido — duplicava
// a mesma notificação de chamada que o CallModal (central) já mostra. Os dois
// escutavam o mesmo estado `call` do WaCallsContext e apareciam juntos pra
// toda ligação, gerando a UI duplicada reportada.
import CallModal from "../components/CallModal";
import DialerModal from "../components/DialerModal";

import Route from "./Route";
import ErrorBoundary from "../components/ErrorBoundary";

// Lazy-loaded pages (code-splitting) — reduzem o bundle inicial
const Connections = lazy(() => import("../pages/Connections/"));
const Settings = lazy(() => import("../pages/SettingsCustom/"));
const Financeiro = lazy(() => import("../pages/Financeiro/"));
const AdminFinanceiro = lazy(() => import("../pages/AdminFinanceiro/"));
const Users = lazy(() => import("../pages/Users"));
const Contacts = lazy(() => import("../pages/Contacts/"));
const ContactImportPage = lazy(() => import("../pages/Contacts/import"));
const ChatMoments = lazy(() => import("../pages/Moments"));
const Queues = lazy(() => import("../pages/Queues/"));
const Tags = lazy(() => import("../pages/Tags/"));
const MessagesAPI = lazy(() => import("../pages/MessagesAPI/"));
const Helps = lazy(() => import("../pages/Helps/"));
const Companies = lazy(() => import("../pages/Companies/"));
const Wallets = lazy(() => import("../pages/Wallets/"));
const QuickMessages = lazy(() => import("../pages/QuickMessages/"));
const Schedules = lazy(() => import("../pages/Schedules"));
const Campaigns = lazy(() => import("../pages/Campaigns"));
const UtmLinks = lazy(() => import("../pages/UtmLinks"));
const SalesAgents = lazy(() => import("../pages/SalesAgents"));
const AgentTemplates = lazy(() => import("../pages/AgentTemplates"));
const Courses = lazy(() => import("../pages/Courses"));
const CampaignReport = lazy(() => import("../pages/CampaignReport"));
const Annoucements = lazy(() => import("../pages/Annoucements"));
const Chat = lazy(() => import("../pages/Chat"));
const Prompts = lazy(() => import("../pages/Prompts"));
const AllConnections = lazy(() => import("../pages/AllConnections/"));
const Reports = lazy(() => import("../pages/Reports"));
const ClosingReport = lazy(() => import("../pages/ClosingReport"));
const UserPerformanceReport = lazy(() => import("../pages/UserPerformanceReport"));
const RelatorioVendas = lazy(() => import("../pages/RelatorioVendas"));
const AdsReport = lazy(() => import("../pages/AdsReport"));
const QueueIntegration = lazy(() => import("../pages/QueueIntegration"));
const Files = lazy(() => import("../pages/Files/"));
const ToDoList = lazy(() => import("../pages/ToDoList/"));
const Kanban = lazy(() => import("../pages/Kanban"));
const TagsKanban = lazy(() => import("../pages/TagsKanban"));
const KanbanBoards = lazy(() => import("../pages/KanbanBoards"));
const BirthdaySettingsPage = lazy(() => import("../pages/BirthdaySettings"));

const FlowBuilderConfig = lazy(() =>
  import("../pages/FlowBuilderConfig").then(m => ({ default: m.FlowBuilderConfig }))
);
const FlowBuilder = lazy(() => import("../pages/FlowBuilder"));
const Floup = lazy(() => import("../pages/Floup"));
const FloupDashboard = lazy(() => import("../pages/FloupDashboard"));
const TemplateManager = lazy(() => import("../pages/TemplateManager"));
const GroupManager = lazy(() => import("../pages/GroupManager"));
const CallHistoricals = lazy(() => import("../pages/CallHistoricals"));
const ReportsHub = lazy(() => import("../pages/ReportsHub"));
const WaCallsSessions = lazy(() => import("../pages/WaCallsSessions"));
const VoiceIvrLista = lazy(() => import("../pages/VoiceIvrLista"));
const VoiceIvrFlow = lazy(() => import("../pages/VoiceIvrFlow"));
const AccountSwitch = lazy(() => import("../pages/AccountSwitch"));


const StackStatus = lazy(() => import("../pages/StackStatus"));
const WhatsappHealth = lazy(() => import("../pages/WhatsappHealth"));
const MetaUnifiedWebhook = lazy(() => import("../pages/MetaUnifiedWebhook"));
const GoogleCalendarSettings = lazy(() => import("../pages/GoogleCalendarSettings"));

const PublicWebchat = lazy(() => import("../pages/PublicWebchat"));





const RoutesContent = () => {
  const [showCampaigns, setShowCampaigns] = useState(false);
  const { user } = useContext(AuthContext);

  useEffect(() => {
    const cshow = localStorage.getItem("cshow");
    if (cshow !== undefined) {
      setShowCampaigns(true);
    }
  }, []);

  // Verificar se a empresa está vencida
  const isCompanyExpired = () => {
    if (!user || !user.company || user.company.id === 1) {
      return false; // Empresa ID 1 nunca expira
    }

    const dueDate = user.company.dueDate;
    if (!dueDate) return false;

    // Comparar apenas as datas (sem horas) para permitir acesso até 23h59 do dia do vencimento
    const hojeInicio = moment().startOf('day');
    const vencimentoInicio = moment(dueDate).startOf('day');
    
    // Empresa está vencida apenas após o dia do vencimento
    return hojeInicio.isAfter(vencimentoInicio, 'day');
  };

  return (
    <TicketsContextProvider>
      <ErrorBoundary
        fallback={(reset) => (
          <div style={{ padding: 24, textAlign: "center" }}>
            <p>{i18n.t("common.loadError", "Não foi possível carregar a página. Atualize para tentar novamente.")}</p>
            <button
              onClick={() => {
                reset();
                window.location.reload();
              }}
              style={{ padding: "8px 16px", cursor: "pointer" }}
            >
              {i18n.t("common.reload", "Recarregar")}
            </button>
          </div>
        )}
      >
      <Suspense fallback={<div style={{ padding: 24, textAlign: "center" }}>{i18n.t("common.loading", "Carregando...")}</div>}>
      <Switch>
        <Route exact path="/login" component={Login} />
        <Route exact path="/signup" component={Signup} />
        <Route exact path="/forgot-password" component={ForgotPassword} />
        <Route exact path="/validate-code" component={ValidateCode} />
        <Route exact path="/reset-password" component={ResetPassword} />
        <Route exact path="/webchat/:token" component={PublicWebchat} />
        <WhatsAppsProvider>
          <WaCallsProvider>
          <LoggedInLayout hideMenu={isCompanyExpired()}>
          <CallModal />
          <DialerModal />

                <Route
                  exact
                  path="/financeiro"
                  component={Financeiro}
                  isPrivate
                />

                <Route
                  exact
                  path="/financeiro-aberto"
                  component={Financeiro}
                  isPrivate
                />

                <Route
                  exact
                  path="/admin-financeiro"
                  component={AdminFinanceiro}
                  isPrivate
                />

                <Route
                  exact
                  path="/companies"
                  component={Companies}
                  isPrivate
                />
                <Route
                  exact
                  path="/stack-status"
                  component={StackStatus}
                  isPrivate
                />
                <Route
                  exact
                  path="/birthday-settings"
                  component={BirthdaySettingsPage}
                  isPrivate
                />
                <Route
                  exact
                  path="/google-calendar"
                  component={GoogleCalendarSettings}
                  isPrivate
                />
                <Route exact path="/" component={Dashboard} isPrivate />
                
                <Route
                  exact
                  path="/tickets/:ticketId?"
                  component={TicketResponsiveContainer}
                  isPrivate
                />
                <Route
                  exact
                  path="/connections"
                  component={Connections}
                  isPrivate
                />
                <Route
                  exact
                  path="/whatsapp-health"
                  component={WhatsappHealth}
                  isPrivate
                />
                <Route
                  exact
                  path="/meta-unified-webhook"
                  component={MetaUnifiedWebhook}
                  isPrivate
                />

                <Route
                  exact
                  path="/quick-messages"
                  component={QuickMessages}
                  isPrivate
                />
                <Route
                  exact
                  path="/template-manager"
                  component={TemplateManager}
                  isPrivate
                />
                <Route exact path="/todolist" component={ToDoList} isPrivate />
                <Route
                  exact
                  path="/schedules"
                  component={Schedules}
                  isPrivate
                />
                <Route exact path="/tags" component={Tags} isPrivate />
                <Route exact path="/contacts" component={Contacts} isPrivate />
                <Route
                  exact
                  path="/contacts/import"
                  component={ContactImportPage}
                  isPrivate
                />
                <Route exact path="/wallets" component={Wallets} isPrivate />
                <Route exact path="/helps" component={Helps} isPrivate />
                <Route exact path="/users" component={Users} isPrivate />
                
                <Route
                  exact
                  path="/messages-api"
                  component={MessagesAPI}
                  isPrivate
                />
                <Route
                  exact
                  path="/settings"
                  component={Settings}
                  isPrivate
                />
                <Route exact path="/queues" component={Queues} isPrivate />
                <Route exact path="/account-switch" component={AccountSwitch} isPrivate />
                

                {/* /reports agora e a central com abas. As rotas antigas de
                    cada relatorio continuam logo abaixo: links salvos e
                    history.push espalhados pelo sistema seguem funcionando,
                    so nao aparecem mais no menu. */}
                <Route exact path="/reports" component={ReportsHub} isPrivate />
                <Route exact path="/reports-only" component={Reports} isPrivate />
                <Route exact path="/closing-report" component={ClosingReport} isPrivate />
                <Route exact path="/user-performance" component={UserPerformanceReport} isPrivate />
                <Route exact path="/ads-report" component={AdsReport} isPrivate />
                <Route
                  exact
                  path="/relatorio-vendas"
                  component={RelatorioVendas}
                  isPrivate
                />
                <Route
                  exact
                  path="/queue-integration"
                  component={QueueIntegration}
                  isPrivate
                />
                <Route
                  exact
                  path="/announcements"
                  component={Annoucements}
                  isPrivate
                />
                <Route exact path="/chats/:id?" component={Chat} isPrivate />
                <Route exact path="/files" component={Files} isPrivate />
                <Route
                  exact
                  path="/moments"
                  component={ChatMoments}
                  isPrivate
                />
                <Route exact path="/Kanban" component={Kanban} isPrivate />
                <Route
                  exact
                  path="/TagsKanban"
                  component={TagsKanban}
                  isPrivate
                />
                <Route
                  exact
                  path="/kanban-boards"
                  component={KanbanBoards}
                  isPrivate
                />
                <Route exact path="/prompts" component={Prompts} isPrivate />
                <Route exact path="/group-manager" component={GroupManager} isPrivate />
                <Route exact path="/call-report" component={CallHistoricals} isPrivate />
                <Route exact path="/wacalls/sessions" component={WaCallsSessions} isPrivate />
                <Route exact path="/voice-ivr" component={VoiceIvrLista} isPrivate />
                <Route exact path="/voice-ivr/novo" component={VoiceIvrFlow} isPrivate />
                <Route exact path="/voice-ivr/:id" component={VoiceIvrFlow} isPrivate />
                

                
                <Route
                  exact
                  path="/allConnections"
                  component={AllConnections}
                  isPrivate
                />

                <Route
                  exact
                  path="/plugins/floup"
                  component={Floup}
                  isPrivate
                />
                <Route
                  exact
                  path="/plugins/floup/dashboard"
                  component={FloupDashboard}
                  isPrivate
                />

                <Route
                  exact
                  path="/flowbuilders"
                  component={FlowBuilder}
                  isPrivate
                />
                <Route
                  exact
                  path="/flowbuilder/:id?"
                  component={FlowBuilderConfig}
                  isPrivate
                />

                {/* Links UTM, Agentes Comerciais, Modelos de Agente e Cursos
                    não dependem de Campanhas: cada um tem a sua opção (no
                    plano ou no menu) e o servidor confere o plano. Antes
                    ficavam dentro do bloco de Campanhas e sumiam sem ele. */}
                <Route exact path="/utm-links" component={UtmLinks} isPrivate />
                <Route exact path="/sales-agents" component={SalesAgents} isPrivate />
                <Route exact path="/agent-templates" component={AgentTemplates} isPrivate />
                <Route exact path="/courses" component={Courses} isPrivate />
                {showCampaigns && (
                  <>
                    <Route
                      exact
                      path="/campaigns"
                      component={Campaigns}
                      isPrivate
                    />
                    <Route
                      exact
                      path="/campaign/:campaignId/report"
                      component={CampaignReport}
                      isPrivate
                    />
                  </>
                )}
              </LoggedInLayout>
              </WaCallsProvider>
            </WhatsAppsProvider>
          </Switch>
      </Suspense>
      </ErrorBoundary>
          <ToastContainer
            position="bottom-right"
            autoClose={5000}
            hideProgressBar={false}
            newestOnTop
            limit={1}
            pauseOnFocusLoss={false}
            draggable={false}
            closeOnClick
            pauseOnHover
            theme="light"
            style={{ width: 340 }}
          />
        </TicketsContextProvider>
  );
};

const Routes = () => {
  return (
    <BrowserRouter>
      <AuthProvider>
        <RoutesContent />
      </AuthProvider>
    </BrowserRouter>
  );
};

export default Routes;
