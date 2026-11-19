import React, { useState, useEffect, useContext, lazy, Suspense } from "react";
import MainContainer from "../../components/MainContainer";
import { makeStyles, Button } from "@material-ui/core";
import TuneIcon from "@material-ui/icons/Tune";
import SettingsIcon from "@material-ui/icons/SettingsOutlined";
import ScheduleIcon from "@material-ui/icons/ScheduleOutlined";
import TrendingUpIcon from "@material-ui/icons/TrendingUp";
import AssignmentTurnedInIcon from "@material-ui/icons/AssignmentTurnedInOutlined";
import BusinessIcon from "@material-ui/icons/BusinessOutlined";
import LayersIcon from "@material-ui/icons/LayersOutlined";
import HelpOutlineIcon from "@material-ui/icons/HelpOutline";
import PaletteIcon from "@material-ui/icons/PaletteOutlined";
import BackupIcon from "@material-ui/icons/BackupOutlined";
import MailOutlineIcon from "@material-ui/icons/MailOutline";
import InstagramIcon from "@material-ui/icons/Instagram";
import PhoneIcon from "@material-ui/icons/PhoneOutlined";
import EventIcon from "@material-ui/icons/EventOutlined";
import VpnKeyIcon from "@material-ui/icons/VpnKeyOutlined";
import { i18n } from "../../translate/i18n.js";
import { toast } from "react-toastify";
import useCompanies from "../../hooks/useCompanies";
import { AuthContext } from "../../context/Auth/AuthContext";
import useCompanySettings from "../../hooks/useSettings/companySettings";
import useSettings from "../../hooks/useSettings";
import ForbiddenPage from "../../components/ForbiddenPage/index.js";
import ErrorBoundary from "../../components/ErrorBoundary";

const SchedulesForm = lazy(() => import("../../components/SchedulesForm"));
const CompaniesManager = lazy(() => import("../../components/CompaniesManager"));
const PlansManager = lazy(() => import("../../components/PlansManager"));
const HelpsManager = lazy(() => import("../../components/HelpsManager"));
const Options = lazy(() => import("../../components/Settings/Options"));
const Whitelabel = lazy(() => import("../../components/Settings/Whitelabel"));
const BackupRestore = lazy(() => import("../../components/Settings/BackupRestore"));
const SmtpSettings = lazy(() => import("../../components/Settings/SmtpSettings"));
const MetaSettings = lazy(() => import("../../components/Settings/MetaSettings"));
const GoogleSettings = lazy(() => import("../../components/Settings/GoogleSettings"));
const FinalizacaoAtendimento = lazy(() => import("../../components/Settings/FinalizacaoAtendimento"));
const LeadSourceSettings = lazy(() => import("../../components/LeadSourceSettings"));
const GoogleCalendarSettings = lazy(() => import("../GoogleCalendarSettings"));
const SipSettings = lazy(() => import("../../components/Settings/SipSettings"));

const useStyles = makeStyles((theme) => ({
  root: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
    backgroundColor: theme.mode === "light" ? "#f6f8fb" : theme.palette.background.default,
    padding: theme.spacing(3),
    gap: theme.spacing(2),
    overflow: "hidden",
  },
  header: {
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(2),
    backgroundColor: theme.mode === "light" ? "#fff" : theme.palette.background.paper,
    border: `1px solid ${theme.mode === "light" ? "#eef0f4" : "rgba(255,255,255,0.08)"}`,
    borderRadius: 12,
    padding: theme.spacing(2.5, 3),
  },
  headerIcon: {
    width: 44,
    height: 44,
    borderRadius: 10,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.mode === "light" ? "#f1f5ff" : "rgba(78,147,255,0.15)",
    color: "#4E93FF",
  },
  headerTitle: {
    fontSize: 20,
    fontWeight: 600,
    color: theme.mode === "light" ? "#0f172a" : "#fff",
    lineHeight: 1.2,
  },
  headerSubtitle: {
    fontSize: 13,
    color: theme.mode === "light" ? "#64748b" : "rgba(255,255,255,0.6)",
    marginTop: 2,
  },
  body: {
    flex: 1,
    display: "flex",
    gap: theme.spacing(2),
    overflow: "hidden",
  },
  sidebar: {
    width: 260,
    flexShrink: 0,
    backgroundColor: theme.mode === "light" ? "#fff" : theme.palette.background.paper,
    border: `1px solid ${theme.mode === "light" ? "#eef0f4" : "rgba(255,255,255,0.08)"}`,
    borderRadius: 12,
    padding: theme.spacing(1.5),
    overflowY: "auto",
    ...theme.scrollbarStyles,
  },
  navItem: {
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(1.5),
    padding: theme.spacing(1.25, 1.5),
    borderRadius: 10,
    cursor: "pointer",
    marginBottom: 4,
    transition: "background-color .15s ease",
    "&:hover": {
      backgroundColor: theme.mode === "light" ? "#f3f6fb" : "rgba(255,255,255,0.04)",
    },
  },
  navItemActive: {
    backgroundColor: theme.mode === "light" ? "#eef4ff" : "rgba(78,147,255,0.15)",
  },
  navIcon: {
    width: 32,
    height: 32,
    borderRadius: 8,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    color: theme.mode === "light" ? "#64748b" : "rgba(255,255,255,0.7)",
    flexShrink: 0,
  },
  navIconActive: {
    color: "#4E93FF",
    backgroundColor: theme.mode === "light" ? "#fff" : "rgba(255,255,255,0.06)",
  },
  navText: {
    display: "flex",
    flexDirection: "column",
    minWidth: 0,
  },
  navTitle: {
    fontSize: 14,
    fontWeight: 600,
    color: theme.mode === "light" ? "#0f172a" : "#fff",
    lineHeight: 1.2,
  },
  navTitleActive: {
    color: "#4E93FF",
  },
  navSubtitle: {
    fontSize: 12,
    color: theme.mode === "light" ? "#94a3b8" : "rgba(255,255,255,0.5)",
    marginTop: 2,
  },
  content: {
    flex: 1,
    backgroundColor: theme.mode === "light" ? "#fff" : theme.palette.background.paper,
    border: `1px solid ${theme.mode === "light" ? "#eef0f4" : "rgba(255,255,255,0.08)"}`,
    borderRadius: 12,
    padding: theme.spacing(3),
    overflowY: "auto",
    ...theme.scrollbarStyles,
  },
  contentHeader: {
    marginBottom: theme.spacing(2.5),
  },
  contentTitle: {
    fontSize: 18,
    fontWeight: 600,
    color: theme.mode === "light" ? "#0f172a" : "#fff",
  },
  contentSubtitle: {
    fontSize: 13,
    color: theme.mode === "light" ? "#64748b" : "rgba(255,255,255,0.6)",
    marginTop: 4,
  },
  container: {
    width: "100%",
  },
}));

const SettingsCustom = () => {
  const classes = useStyles();
  const [tab, setTab] = useState("options");
  const [schedules, setSchedules] = useState([]);
  const [company, setCompany] = useState({});
  const [loading, setLoading] = useState(false);
  const [currentUser, setCurrentUser] = useState({});
  const [settings, setSettings] = useState({});
  const [oldSettings, setOldSettings] = useState({});
  const [schedulesEnabled, setSchedulesEnabled] = useState(false);

  const { find, updateSchedules } = useCompanies();

  const { getAll: getAllSettings } = useCompanySettings();
  const { getAll: getAllSettingsOld } = useSettings();
  const { user, socket } = useContext(AuthContext);

  useEffect(() => {
    async function findData() {
      if (!user || !user.companyId) return;
      setLoading(true);
      try {
        const companyId = user.companyId;
        const [company, settingList, settingListOld] = await Promise.all([
          find(companyId),
          getAllSettings(companyId),
          getAllSettingsOld(),
        ]);
        setCompany(company);
        setSchedules(company.schedules);
        setSettings(settingList);
        setOldSettings(settingListOld);
        setSchedulesEnabled(settingList.scheduleType === "company");
        setCurrentUser(user);
      } catch (e) {
        toast.error(e);
      }
      setLoading(false);
    }
    findData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!socket || !user || !user.companyId) return;
    const onSettingsEvent = () => {
      getAllSettingsOld().then(setOldSettings);
    };
    socket.on(`company-${user.companyId}-settings`, onSettingsEvent);
    return () => {
      socket.off(`company-${user.companyId}-settings`, onSettingsEvent);
    };
  }, [socket, user]);

  const handleSubmitSchedules = async (data) => {
    setLoading(true);
    try {
      setSchedules(data);
      await updateSchedules({ id: company.id, schedules: data });
      toast.success(i18n.t("hardcoded.schedulesUpdated"));
    } catch (e) {
      toast.error(e);
    }
    setLoading(false);
  };

  const isSuper = () => Boolean((currentUser && currentUser.super) || (user && user.super));
  const canManageCompanyIntegrations = user?.profile === "admin" || isSuper();

  const navItems = [
    {
      key: "options",
      title: i18n.t("settings.tabs.options"),
      subtitle: i18n.t("settings.nav.optionsDesc", "Configurações gerais"),
      icon: <SettingsIcon fontSize="small" />,
      show: true,
    },
    {
      key: "schedules",
      title: i18n.t("settings.tabs.schedules", "Horários"),
      subtitle: i18n.t("settings.nav.schedulesDesc", "Horários de atendimento"),
      icon: <ScheduleIcon fontSize="small" />,
      show: schedulesEnabled,
    },
    {
      key: "leadSources",
      // Valor padrao no i18n.t, como as outras abas ja fazem: os arquivos de
      // traducao tem estruturas diferentes entre si (em en.js o bloco
      // `settings` fica fora de `translations`), e sem o padrao uma chave que
      // nao resolva apareceria crua na tela.
      title: i18n.t("settings.tabs.leadSources", "Origem dos leads"),
      subtitle: i18n.t("settings.nav.leadSourcesDesc", "Origem dos contatos"),
      icon: <TrendingUpIcon fontSize="small" />,
      show: user.profile === "admin",
    },
    {
      key: "finalizacao",
      title: i18n.t("settings.tabs.finalizacao"),
      subtitle: i18n.t("settings.nav.finalizacaoDesc", "Finalização do atendimento"),
      icon: <AssignmentTurnedInIcon fontSize="small" />,
      show: user.profile === "admin" && user.finalizacaoComValorVendaAtiva,
    },
    {
      key: "companies",
      title: i18n.t("settings.tabs.companies"),
      subtitle: i18n.t("settings.nav.companiesDesc", "Gerenciar empresas"),
      icon: <BusinessIcon fontSize="small" />,
      show: isSuper(),
    },
    {
      key: "plans",
      title: i18n.t("settings.tabs.plans"),
      subtitle: i18n.t("settings.nav.plansDesc", "Planos e preços"),
      icon: <LayersIcon fontSize="small" />,
      show: isSuper(),
    },
    {
      key: "helps",
      title: i18n.t("settings.tabs.helps"),
      subtitle: i18n.t("settings.nav.helpsDesc", "Central de ajuda"),
      icon: <HelpOutlineIcon fontSize="small" />,
      show: isSuper(),
    },
    {
      key: "whitelabel",
      title: "Whitelabel",
      subtitle: i18n.t("settings.nav.whitelabelDesc", "Aparência e marca"),
      icon: <PaletteIcon fontSize="small" />,
      show: isSuper(),
    },
    {
      key: "backup",
      title: "Backup",
      subtitle: i18n.t("settings.nav.backupDesc", "Backup e restauração"),
      icon: <BackupIcon fontSize="small" />,
      show: isSuper(),
    },
    {
      key: "smtp",
      title: "SMTP",
      subtitle: i18n.t("settings.nav.smtpDesc", "Servidor de e-mail"),
      icon: <MailOutlineIcon fontSize="small" />,
      show: isSuper(),
    },
    {
      key: "meta",
      title: "Instagram / Facebook",
      subtitle: "Credenciais do App Meta",
      icon: <InstagramIcon fontSize="small" />,
      show: isSuper(),
    },
    {
      // Credenciais OAuth do Google. Ficavam dentro da aba do Meta
      // (Instagram / Facebook), onde ninguém procuraria por elas.
      key: "google",
      title: i18n.t("googleSettings.navTitle", "Google"),
      subtitle: i18n.t("googleSettings.navSubtitle", "Login e credenciais"),
      icon: <VpnKeyIcon fontSize="small" />,
      show: isSuper(),
    },
    {
      key: "googleCalendar",
      title: i18n.t("googleCalendar.menu", "Google Agenda"),
      subtitle: i18n.t("settings.nav.googleCalendarDesc", "Integração de agenda"),
      icon: <EventIcon fontSize="small" />,
      show: canManageCompanyIntegrations,
    },
    {
      key: "sipTrunk",
      title: i18n.t("sipSettings.title", "Troncal SIP"),
      subtitle: i18n.t("sipSettings.navSubtitle", "Ligação via SIP"),
      icon: <PhoneIcon fontSize="small" />,
      show: canManageCompanyIntegrations,
    },
  ];

  const visibleItems = navItems.filter((i) => i.show);
  const activeItem = visibleItems.find((i) => i.key === tab) || visibleItems[0];

  return (
    <MainContainer>
      {user.profile === "user" && !isSuper() ? (
        <ForbiddenPage />
      ) : (
        <div className={classes.root}>
          <div className={classes.header}>
            <div className={classes.headerIcon}>
              <TuneIcon />
            </div>
            <div>
              <div className={classes.headerTitle}>{i18n.t("settings.title")}</div>
              <div className={classes.headerSubtitle}>
                {i18n.t("settings.subtitle", "Gerencie suas preferências e integrações")}
              </div>
            </div>
          </div>

          <div className={classes.body}>
            <div className={classes.sidebar}>
              {visibleItems.map((item) => {
                const active = activeItem && activeItem.key === item.key;
                return (
                  <div
                    key={item.key}
                    className={`${classes.navItem} ${active ? classes.navItemActive : ""}`}
                    onClick={() => setTab(item.key)}
                  >
                    <div className={`${classes.navIcon} ${active ? classes.navIconActive : ""}`}>
                      {item.icon}
                    </div>
                    <div className={classes.navText}>
                      <span className={`${classes.navTitle} ${active ? classes.navTitleActive : ""}`}>
                        {item.title}
                      </span>
                      <span className={classes.navSubtitle}>{item.subtitle}</span>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className={classes.content}>
              {activeItem && (
                <div className={classes.contentHeader}>
                  <div className={classes.contentTitle}>{activeItem.title}</div>
                  <div className={classes.contentSubtitle}>{activeItem.subtitle}</div>
                </div>
              )}

              <ErrorBoundary
                fallback={(reset) => (
                  <div style={{ padding: 24, textAlign: "center", width: "100%" }}>
                    <p>{i18n.t("common.loadError", "Não foi possível carregar esta seção.")}</p>
                    <Button
                      variant="contained"
                      color="primary"
                      onClick={() => {
                        reset();
                        window.location.reload();
                      }}
                    >
                      {i18n.t("common.reload", "Recarregar")}
                    </Button>
                  </div>
                )}
              >
                <Suspense fallback={<div style={{ padding: 20, textAlign: "center" }}>{i18n.t("common.loading", "Carregando...")}</div>}>
                  {tab === "schedules" && (
                    <div className={classes.container}>
                      <SchedulesForm
                        loading={loading}
                        onSubmit={handleSubmitSchedules}
                        initialValues={schedules}
                      />
                    </div>
                  )}
                  {tab === "companies" && isSuper() && (
                    <div className={classes.container}><CompaniesManager /></div>
                  )}
                  {tab === "plans" && isSuper() && (
                    <div className={classes.container}><PlansManager /></div>
                  )}
                  {tab === "helps" && isSuper() && (
                    <div className={classes.container}><HelpsManager /></div>
                  )}
                  {tab === "whitelabel" && isSuper() && (
                    <div className={classes.container}><Whitelabel settings={oldSettings} /></div>
                  )}
                  {tab === "backup" && isSuper() && (
                    <div className={classes.container}><BackupRestore /></div>
                  )}
                  {tab === "smtp" && isSuper() && (
                    <div className={classes.container}><SmtpSettings /></div>
                  )}
                  {tab === "meta" && isSuper() && (
                    <div className={classes.container}><MetaSettings /></div>
                  )}
                  {tab === "google" && isSuper() && (
                    <div className={classes.container}><GoogleSettings /></div>
                  )}
                  {tab === "googleCalendar" && canManageCompanyIntegrations && (
                    <div className={classes.container}><GoogleCalendarSettings /></div>
                  )}
                  {tab === "sipTrunk" && canManageCompanyIntegrations && (
                    <div className={classes.container}><SipSettings /></div>
                  )}
                  {tab === "leadSources" && (
                    <div className={classes.container}><LeadSourceSettings /></div>
                  )}
                  {tab === "finalizacao" && (
                    <div className={classes.container}>
                      <FinalizacaoAtendimento
                        settings={settings}
                        onSettingsChange={(newSettings) => setSettings(newSettings)}
                      />
                    </div>
                  )}
                  {tab === "options" && (
                    <div className={classes.container}>
                      <Options
                        settings={settings}
                        oldSettings={oldSettings}
                        user={currentUser}
                        scheduleTypeChanged={(value) =>
                          setSchedulesEnabled(value === "company")
                        }
                      />
                    </div>
                  )}
                </Suspense>
              </ErrorBoundary>
            </div>
          </div>
        </div>
      )}
    </MainContainer>
  );
};

export default SettingsCustom;
