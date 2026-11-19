import React, {
  useState,
  useEffect,
  useReducer,
  useCallback,
  useContext,
  useMemo,
} from "react";
import { toast } from "react-toastify";
import { useHistory } from "react-router-dom";
import { makeStyles } from "@material-ui/core/styles";
import Paper from "@material-ui/core/Paper";
import Button from "@material-ui/core/Button";
import TextField from "@material-ui/core/TextField";
import InputAdornment from "@material-ui/core/InputAdornment";
import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import Title from "../../components/Title";
import api from "../../services/api";
import { i18n } from "../../translate/i18n";
import MainHeaderButtonsWrapper from "../../components/MainHeaderButtonsWrapper";
// import MessageModal from "../../components/MessageModal"
import ScheduleModal from "../../components/ScheduleModal";
import ConfirmationModal from "../../components/ConfirmationModal";
import toastError from "../../errors/toastError";
import moment from "moment";
import "moment/locale/pt-br";
import "moment/locale/es";
import "moment/locale/ar";
import "moment/locale/tr";
// import { SocketContext } from "../../context/Socket/SocketContext";
import { AuthContext } from "../../context/Auth/AuthContext";
import usePlans from "../../hooks/usePlans";
import { Calendar, momentLocalizer } from "react-big-calendar";
import "react-big-calendar/lib/css/react-big-calendar.css";
import SearchIcon from "@material-ui/icons/Search";
import DeleteOutlineIcon from "@material-ui/icons/DeleteOutline";
import EditIcon from "@material-ui/icons/Edit";
// Cabeçalho novo da tela (banner + cartões de resumo + barra de ações).
import { Grid, Typography } from "@material-ui/core";
import EventIcon from "@material-ui/icons/Event";
import ScheduleIcon from "@material-ui/icons/Schedule";
import SendIcon from "@material-ui/icons/Send";
import DraftsIcon from "@material-ui/icons/Drafts";
import CalendarTodayIcon from "@material-ui/icons/CalendarToday";
import AddIcon from "@material-ui/icons/Add";

import "./Schedules.css"; // Importe o arquivo CSS

// Defina a função getUrlParam antes de usá-la
function getUrlParam(paramName) {
  const searchParams = new URLSearchParams(window.location.search);
  return searchParams.get(paramName);
}

const eventTitleStyle = {
  fontSize: "14px", // Defina um tamanho de fonte menor
  overflow: "hidden", // Oculte qualquer conteúdo excedente
  whiteSpace: "nowrap", // Evite a quebra de linha do texto
  textOverflow: "ellipsis", // Exiba "..." se o texto for muito longo
};

// Map i18n language to moment locale
const langToMomentLocale = {
  pt: "pt-br",
  en: "en",
  es: "es",
  ar: "ar",
  tr: "tr",
};

function getCalendarLocale() {
  const lang = i18n.language || "pt";
  const loc = langToMomentLocale[lang] || "pt-br";
  moment.locale(loc);
  return momentLocalizer(moment);
}

function getDefaultMessages() {
  return {
    date: i18n.t("schedules.date"),
    time: i18n.t("schedules.time"),
    event: i18n.t("schedules.event"),
    allDay: i18n.t("schedules.allDay"),
    week: i18n.t("schedules.week"),
    work_week: i18n.t("schedules.work_week"),
    day: i18n.t("schedules.day"),
    month: i18n.t("schedules.month"),
    previous: i18n.t("schedules.previous"),
    next: i18n.t("schedules.next"),
    yesterday: i18n.t("schedules.yesterday"),
    tomorrow: i18n.t("schedules.tomorrow"),
    today: i18n.t("schedules.today"),
    agenda: i18n.t("schedules.agenda"),
    noEventsInRange: i18n.t("schedules.noEventsInRange"),
    showMore: function showMore(total) {
      return "+" + total + ` ${i18n.t("schedules.more") || "mais"}`;
    },
  };
}

const reducer = (state, action) => {
  if (action.type === "LOAD_SCHEDULES") {
    const schedules = action.payload;
    const newSchedules = [];

    schedules.forEach((schedule) => {
      const scheduleIndex = state.findIndex((s) => s.id === schedule.id);
      if (scheduleIndex !== -1) {
        state[scheduleIndex] = schedule;
      } else {
        newSchedules.push(schedule);
      }
    });

    return [...state, ...newSchedules];
  }

  if (action.type === "UPDATE_SCHEDULES") {
    const schedule = action.payload;
    const scheduleIndex = state.findIndex((s) => s.id === schedule.id);

    if (scheduleIndex !== -1) {
      state[scheduleIndex] = schedule;
      return [...state];
    } else {
      return [schedule, ...state];
    }
  }

  if (action.type === "DELETE_SCHEDULE") {
    const scheduleId = action.payload;

    const scheduleIndex = state.findIndex((s) => s.id === scheduleId);
    if (scheduleIndex !== -1) {
      state.splice(scheduleIndex, 1);
    }
    return [...state];
  }

  if (action.type === "RESET") {
    return [];
  }
};

const useStyles = makeStyles((theme) => ({
  // ── Cabeçalho da tela de Agendamentos ────────────────────────────────
  banner: {
    background: "linear-gradient(90deg, #1a2fe0 0%, #3b45f5 100%)",
    borderRadius: 12,
    padding: theme.spacing(2.5),
    color: "#fff",
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: theme.spacing(2),
    marginBottom: theme.spacing(2),
  },
  bannerIcon: {
    background: "rgba(255,255,255,0.18)",
    borderRadius: 10,
    width: 46,
    height: 46,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  bannerChip: {
    background: "rgba(255,255,255,0.16)",
    borderRadius: 10,
    padding: theme.spacing(1, 2),
    display: "flex",
    alignItems: "center",
    gap: 8,
  },
  statCard: {
    padding: theme.spacing(2),
    borderRadius: 12,
    height: "100%",
  },
  statHeader: {
    display: "flex",
    alignItems: "flex-start",
    justifyContent: "space-between",
  },
  statLabel: {
    fontSize: 11,
    letterSpacing: 0.6,
    fontWeight: 700,
    color: theme.palette.text.secondary,
    textTransform: "uppercase",
  },
  statValue: {
    fontSize: 30,
    fontWeight: 700,
    lineHeight: 1.1,
    marginTop: theme.spacing(1),
  },
  statHint: {
    fontSize: 12,
    color: theme.palette.text.secondary,
  },
  statIcon: {
    borderRadius: 8,
    width: 34,
    height: 34,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
  },
  actionBar: {
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(1),
    flexWrap: "wrap",
    marginBottom: theme.spacing(2),
  },
  mainPaper: {
    flex: 1,
    padding: theme.spacing(1),
    overflowY: "scroll",
    ...theme.scrollbarStyles,
  },
  calendarToolbar: {
    "& .rbc-toolbar-label": {
      color: theme.mode === "light" ? theme.palette.light : "white",
    },
    "& .rbc-btn-group button": {
      color: theme.mode === "light" ? theme.palette.light : "white",
      "&:hover": {
        color: theme.palette.mode === "dark" ? "#fff" : "#000",
      },
      "&:active": {
        color: theme.palette.mode === "dark" ? "#fff" : "#000",
      },
      "&:focus": {
        color: theme.palette.mode === "dark" ? "#fff" : "#000",
      },
      "&.rbc-active": {
        color: theme.palette.mode === "dark" ? "#fff" : "#000",
      },
    },
  },
}));

const Schedules = () => {
  const classes = useStyles();
  const history = useHistory();

  //   const socketManager = useContext(SocketContext);
  const { user, socket } = useContext(AuthContext);

  const [loading, setLoading] = useState(false);
  const [pageNumber, setPageNumber] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [selectedSchedule, setSelectedSchedule] = useState(null);
  const [deletingSchedule, setDeletingSchedule] = useState(null);
  const [confirmModalOpen, setConfirmModalOpen] = useState(false);
  const [searchParam, setSearchParam] = useState("");
  const [schedules, dispatch] = useReducer(reducer, []);
  const [scheduleModalOpen, setScheduleModalOpen] = useState(false);
  const [contactId, setContactId] = useState(+getUrlParam("contactId"));

  const { getPlanCompany } = usePlans();

  useEffect(() => {
    async function fetchData() {
      const companyId = user.companyId;
      const planConfigs = await getPlanCompany(undefined, companyId);
      if (!planConfigs.plan.useSchedules) {
        toast.error(
          "Esta empresa não possui permissão para acessar essa página! Estamos lhe redirecionando."
        );
        setTimeout(() => {
          history.push(`/`);
        }, 1000);
      }
    }
    fetchData();
  }, [user, history, getPlanCompany]);

  const fetchSchedules = useCallback(async () => {
    try {
      const { data } = await api.get("/schedules", {
        params: { searchParam, pageNumber },
      });

      dispatch({ type: "LOAD_SCHEDULES", payload: data.schedules });
      setHasMore(data.hasMore);
      setLoading(false);
    } catch (err) {
      toastError(err);
    }
  }, [searchParam, pageNumber]);

  const handleOpenScheduleModalFromContactId = useCallback(() => {
    if (contactId) {
      handleOpenScheduleModal();
    }
  }, [contactId]);

  useEffect(() => {
    dispatch({ type: "RESET" });
    setPageNumber(1);
  }, [searchParam]);

  useEffect(() => {
    setLoading(true);
    const delayDebounceFn = setTimeout(() => {
      fetchSchedules();
    }, 500);
    return () => clearTimeout(delayDebounceFn);
  }, [
    searchParam,
    pageNumber,
    contactId,
    fetchSchedules,
    handleOpenScheduleModalFromContactId,
  ]);

  useEffect(() => {
    // handleOpenScheduleModalFromContactId();
    // const socket = socketManager.GetSocket(user.companyId, user.id);

    const onCompanySchedule = (data) => {
      if (data.action === "update" || data.action === "create") {
        dispatch({ type: "UPDATE_SCHEDULES", payload: data.schedule });
      }

      if (data.action === "delete") {
        dispatch({ type: "DELETE_SCHEDULE", payload: +data.scheduleId });
      }
    };

    socket.on(`company${user.companyId}-schedule`, onCompanySchedule);

    return () => {
      socket.off(`company${user.companyId}-schedule`, onCompanySchedule);
    };
  }, [socket]);

  const cleanContact = () => {
    setContactId("");
  };

  const handleOpenScheduleModal = () => {
    setSelectedSchedule(null);
    setScheduleModalOpen(true);
  };

  const handleCloseScheduleModal = () => {
    setSelectedSchedule(null);
    setScheduleModalOpen(false);
  };

  const handleSearch = (event) => {
    setSearchParam(event.target.value.toLowerCase());
  };

  const handleEditSchedule = (schedule) => {
    setSelectedSchedule(schedule);
    setScheduleModalOpen(true);
  };

  const handleDeleteSchedule = async (scheduleId) => {
    try {
      await api.delete(`/schedules/${scheduleId}`);
      toast.success(i18n.t("schedules.toasts.deleted"));
    } catch (err) {
      toastError(err);
    }
    setDeletingSchedule(null);
    setSearchParam("");
    setPageNumber(1);

    dispatch({ type: "RESET" });
    setPageNumber(1);
    await fetchSchedules();
  };

  const loadMore = () => {
    setPageNumber((prevState) => prevState + 1);
  };

  const handleScroll = (e) => {
    if (!hasMore || loading) return;
    const { scrollTop, scrollHeight, clientHeight } = e.currentTarget;
    if (scrollHeight - (scrollTop + 100) < clientHeight) {
      loadMore();
    }
  };

  // Números dos cartões de resumo. Derivados da lista já carregada — não
  // faz consulta nova, então não custa nada e acompanha o filtro de busca.
  const resumo = useMemo(() => {
    const agora = moment();
    const fimDoDia = moment().endOf("day");
    const fimDaSemana = moment().add(7, "days").endOf("day");

    let hoje = 0;
    let semana = 0;
    let pendentes = 0;

    (schedules || []).forEach((s) => {
      const quando = moment(s.sendAt);
      if (!quando.isValid()) return;

      if (quando.isSame(agora, "day")) hoje += 1;

      // "Próximos 7 dias" exclui hoje de propósito: hoje já tem cartão
      // próprio, e somar os dois confundiria a leitura.
      if (quando.isAfter(fimDoDia) && quando.isSameOrBefore(fimDaSemana)) {
        semana += 1;
      }

      // Pendente = ainda não foi enviado. Cobre tanto PENDENTE quanto
      // AGUARDANDO_LEMBRETE, que também está esperando um horário chegar.
      if (!s.sentAt && s.status !== "ENVIADO") pendentes += 1;
    });

    return { total: (schedules || []).length, hoje, semana, pendentes };
  }, [schedules]);

  const truncate = (str, len) => {
    if (str.length > len) {
      return str.substring(0, len) + "...";
    }
    return str;
  };

  return (
    <MainContainer>
      <ConfirmationModal
        title={
          deletingSchedule &&
          `${i18n.t("schedules.confirmationModal.deleteTitle")}`
        }
        open={confirmModalOpen}
        onClose={() => setConfirmModalOpen(false)}
        onConfirm={() => handleDeleteSchedule(deletingSchedule.id)}
      >
        {i18n.t("schedules.confirmationModal.deleteMessage")}
      </ConfirmationModal>
      {scheduleModalOpen && (
        <ScheduleModal
          open={scheduleModalOpen}
          onClose={handleCloseScheduleModal}
          reload={fetchSchedules}
          // aria-labelledby="form-dialog-title"
          scheduleId={selectedSchedule ? selectedSchedule.id : null}
          contactId={contactId}
          cleanContact={cleanContact}
          user={user}
        />
      )}
      {/* ── Banner ────────────────────────────────────────────────────── */}
      <div className={classes.banner}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div className={classes.bannerIcon}>
            <EventIcon style={{ color: "#fff" }} />
          </div>
          <div>
            <Typography style={{ fontSize: 20, fontWeight: 700, lineHeight: 1.2 }}>
              {i18n.t("schedulesHeader.title", "Agendamento de Mensagens")}
            </Typography>
            <Typography style={{ fontSize: 13, opacity: 0.85 }}>
              {i18n.t(
                "schedulesHeader.subtitle",
                "Programe e visualize disparos automáticos e lembretes em calendário interativo"
              )}
            </Typography>
          </div>
        </div>

        <div className={classes.bannerChip}>
          <span
            style={{
              width: 8,
              height: 8,
              borderRadius: "50%",
              background: "#4ade80",
              display: "inline-block",
            }}
          />
          <div style={{ lineHeight: 1.2 }}>
            <div style={{ fontSize: 11, opacity: 0.85 }}>
              {i18n.t("schedulesHeader.programmed", "Disparos Programados")}
            </div>
            <div style={{ fontSize: 14, fontWeight: 700 }}>
              {resumo.total} {i18n.t("schedulesHeader.schedulesWord", "agendamentos")}
            </div>
          </div>
        </div>
      </div>

      {/* ── Cartões de resumo ─────────────────────────────────────────── */}
      <Grid container spacing={2} style={{ marginBottom: 8 }}>
        {[
          {
            label: i18n.t("schedulesHeader.cardTotal", "Total agendados"),
            value: resumo.total,
            hint: i18n.t("schedulesHeader.cardTotalHint", "Disparos registrados no sistema"),
            icon: <EventIcon fontSize="small" style={{ color: "#2563eb" }} />,
            bg: "rgba(37,99,235,0.12)",
            color: "#2563eb",
          },
          {
            label: i18n.t("schedulesHeader.cardToday", "Agendados para hoje"),
            value: resumo.hoje,
            hint: i18n.t("schedulesHeader.cardTodayHint", "Envios programados para o dia"),
            icon: <ScheduleIcon fontSize="small" style={{ color: "#16a34a" }} />,
            bg: "rgba(22,163,74,0.12)",
            color: "#16a34a",
          },
          {
            label: i18n.t("schedulesHeader.cardWeek", "Próximos 7 dias"),
            value: resumo.semana,
            hint: i18n.t("schedulesHeader.cardWeekHint", "Previsão da semana"),
            icon: <SendIcon fontSize="small" style={{ color: "#7c3aed" }} />,
            bg: "rgba(124,58,237,0.12)",
            color: "#7c3aed",
          },
          {
            label: i18n.t("schedulesHeader.cardPending", "Pendentes de envio"),
            value: resumo.pendentes,
            hint: i18n.t("schedulesHeader.cardPendingHint", "Aguardando horário de disparo"),
            icon: <DraftsIcon fontSize="small" style={{ color: "#ea580c" }} />,
            bg: "rgba(234,88,12,0.12)",
            color: "#ea580c",
          },
        ].map((c) => (
          <Grid item xs={12} sm={6} md={3} key={c.label}>
            <Paper variant="outlined" className={classes.statCard}>
              <div className={classes.statHeader}>
                <span className={classes.statLabel}>{c.label}</span>
                <div className={classes.statIcon} style={{ background: c.bg }}>
                  {c.icon}
                </div>
              </div>
              <div className={classes.statValue} style={{ color: c.color }}>
                {c.value}
              </div>
              <div className={classes.statHint}>{c.hint}</div>
            </Paper>
          </Grid>
        ))}
      </Grid>

      {/* ── Barra de ações ────────────────────────────────────────────── */}
      <div className={classes.actionBar}>
        <TextField
          placeholder={i18n.t("contacts.searchPlaceholder")}
          type="search"
          value={searchParam}
          onChange={handleSearch}
          variant="outlined"
          size="small"
          style={{ flex: 1, minWidth: 220 }}
          InputProps={{
            startAdornment: (
              <InputAdornment position="start">
                <SearchIcon style={{ color: "gray" }} />
              </InputAdornment>
            ),
          }}
        />
        <Button
          variant="outlined"
          startIcon={<CalendarTodayIcon />}
          onClick={() => history.push("/google-calendar")}
        >
          {i18n.t("schedulesHeader.googleCalendar", "Google Agenda")}
        </Button>
        <Button
          variant="contained"
          color="primary"
          startIcon={<AddIcon />}
          onClick={handleOpenScheduleModal}
        >
          {i18n.t("schedulesHeader.newSchedule", "Novo Agendamento")}
        </Button>
      </div>

      <Paper
        className={classes.mainPaper}
        variant="outlined"
        onScroll={handleScroll}
      >
        <Calendar
          messages={getDefaultMessages()}
          formats={{
            agendaDateFormat: "DD/MM ddd",
            weekdayFormat: "dddd",
          }}
          localizer={getCalendarLocale()}
          events={schedules.map((schedule) => ({
            title: (
              <div key={schedule.id} className="event-container">
                <div style={eventTitleStyle}>{schedule?.contact?.name}</div>
                <DeleteOutlineIcon
                  onClick={() => handleDeleteSchedule(schedule.id)}
                  className="delete-icon"
                />
                <EditIcon
                  onClick={() => {
                    handleEditSchedule(schedule);
                    setScheduleModalOpen(true);
                  }}
                  className="edit-icon"
                />
              </div>
            ),
            start: new Date(schedule.sendAt),
            end: new Date(schedule.sendAt),
          }))}
          startAccessor="start"
          endAccessor="end"
          style={{ height: 500 }}
          className={classes.calendarToolbar}
        />
      </Paper>
    </MainContainer>
  );
};

export default Schedules;
