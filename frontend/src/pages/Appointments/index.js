import React, { useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";
import {
  Button,
  Dialog,
  DialogActions,
  DialogContent,
  DialogTitle,
  CircularProgress,
  Checkbox,
  FormGroup,
  FormHelperText,
  Grid,
  IconButton,
  Paper,
  Switch,
  FormControlLabel,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableRow,
  Tabs,
  Tab,
  TextField,
  Typography
} from "@material-ui/core";
import AddIcon from "@material-ui/icons/Add";
import EditIcon from "@material-ui/icons/Edit";
import BlockIcon from "@material-ui/icons/Block";
import CheckCircleIcon from "@material-ui/icons/CheckCircle";
import moment from "moment-timezone";
import { Calendar, momentLocalizer } from "react-big-calendar";
import "react-big-calendar/lib/css/react-big-calendar.css";
import "moment/locale/pt-br";
import "moment/locale/es";
import "moment/locale/ar";
import "moment/locale/tr";
import { toast } from "react-toastify";
import MainContainer from "../../components/MainContainer";
import MainHeader from "../../components/MainHeader";
import Title from "../../components/Title";
import api from "../../services/api";
import toastError from "../../errors/toastError";
import { AuthContext } from "../../context/Auth/AuthContext";
import { i18n } from "../../translate/i18n";
import { formatCurrency, getCurrencySymbol } from "../../helpers/currencyHelper";
import useCompanyCurrency from "../../hooks/useCompanyCurrency";
import "./Appointments.css";

const localizer = momentLocalizer(moment);

const calendarMessages = {
  date: i18n.t("schedules.date", "Data"),
  time: i18n.t("schedules.time", "Hora"),
  event: i18n.t("schedules.event", "Agendamento"),
  allDay: i18n.t("schedules.allDay", "Dia inteiro"),
  week: i18n.t("schedules.week", "Semana"),
  day: i18n.t("schedules.day", "Dia"),
  month: i18n.t("schedules.month", "Mês"),
  previous: i18n.t("schedules.previous", "Anterior"),
  next: i18n.t("schedules.next", "Próximo"),
  today: i18n.t("schedules.today", "Hoje"),
  agenda: i18n.t("schedules.agenda", "Agenda"),
  noEventsInRange: "Nenhum agendamento neste período.",
  showMore: total => `+${total} mais`
};

const toCalendarDisplayDate = (value, timezone) => {
  const date = moment(value).tz(timezone);
  // react-big-calendar formats native dates in the browser's local timezone.
  return new Date(
    date.year(),
    date.month(),
    date.date(),
    date.hour(),
    date.minute(),
    date.second(),
    date.millisecond()
  );
};

const getCalendarRange = (date, view, timezone) => {
  const current = moment.tz(
    [date.getFullYear(), date.getMonth(), date.getDate()],
    timezone
  );
  let start;
  let end;

  if (view === "month") {
    start = current.clone().startOf("month").startOf("week");
    end = current.clone().endOf("month").endOf("week").startOf("day").add(1, "day");
  } else if (view === "day") {
    start = current.clone().startOf("day");
    end = start.clone().add(1, "day");
  } else {
    start = current.clone().startOf("week");
    end = start.clone().add(7, "days");
  }

  return { startDate: start.toISOString(), endDate: end.toISOString() };
};

const EMPTY_FORM = {
  name: "",
  description: "",
  durationMinutes: 30,
  price: "",
  active: true,
  professionalIds: []
};

const statusLabel = {
  confirmed: "Confirmado",
  cancelled: "Cancelado",
  completed: "Concluído",
  no_show: "Não compareceu"
};

const Appointments = () => {
  const { user } = useContext(AuthContext);
  const { currencyReady, currency } = useCompanyCurrency(user?.companyId);
  const [services, setServices] = useState([]);
  const [professionals, setProfessionals] = useState([]);
  const [bookings, setBookings] = useState([]);
  const [calendarBookings, setCalendarBookings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [bookingsLoading, setBookingsLoading] = useState(false);
  const [servicesLoading, setServicesLoading] = useState(true);
  const [professionalsLoading, setProfessionalsLoading] = useState(true);
  const [activeTab, setActiveTab] = useState("calendar");
  const [calendarDate, setCalendarDate] = useState(() =>
    toCalendarDisplayDate(new Date(), user?.company?.timezone || "America/Sao_Paulo")
  );
  const [calendarView, setCalendarView] = useState("week");
  const [selectedBooking, setSelectedBooking] = useState(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [selectedService, setSelectedService] = useState(null);
  const [form, setForm] = useState(EMPTY_FORM);
  const [saving, setSaving] = useState(false);
  const calendarRequest = useRef(0);

  const timezone = user?.company?.timezone || "America/Sao_Paulo";

  const loadServices = useCallback(async () => {
    try {
      const { data } = await api.get("/appointment-services");
      setServices(Array.isArray(data) ? data : []);
    } catch (error) {
      toastError(error);
    } finally {
      setServicesLoading(false);
    }
  }, []);

  const loadProfessionals = useCallback(async () => {
    try {
      const { data } = await api.get("/appointment-professionals");
      setProfessionals(Array.isArray(data) ? data : []);
    } catch (error) {
      toastError(error);
    } finally {
      setProfessionalsLoading(false);
    }
  }, []);

  const loadCalendarBookings = useCallback(async () => {
    const requestId = calendarRequest.current + 1;
    calendarRequest.current = requestId;
    setLoading(true);
    try {
      const { startDate, endDate } = getCalendarRange(calendarDate, calendarView, timezone);
      const { data } = await api.get("/appointments", { params: { startDate, endDate } });
      if (calendarRequest.current === requestId) {
        setCalendarBookings(Array.isArray(data) ? data : []);
      }
    } catch (error) {
      if (calendarRequest.current === requestId) toastError(error);
    } finally {
      if (calendarRequest.current === requestId) setLoading(false);
    }
  }, [calendarDate, calendarView, timezone]);

  const loadBookings = useCallback(async () => {
    setBookingsLoading(true);
    try {
      const { data } = await api.get("/appointments");
      setBookings(Array.isArray(data) ? data : []);
    } catch (error) {
      toastError(error);
    } finally {
      setBookingsLoading(false);
    }
  }, []);

  useEffect(() => {
    moment.locale(({ pt: "pt-br", en: "en", es: "es", ar: "ar", tr: "tr" })[i18n.language] || "pt-br");
    loadServices();
    loadProfessionals();
  }, [loadServices, loadProfessionals]);

  useEffect(() => {
    loadCalendarBookings();
  }, [loadCalendarBookings]);

  useEffect(() => {
    if (activeTab === "bookings") loadBookings();
  }, [activeTab, loadBookings]);

  const calendarEvents = useMemo(() => calendarBookings.map(booking => ({
    id: booking.id,
    title: [
      booking.service?.name || "Serviço",
      booking.contact?.name || booking.contact?.number || "Cliente",
      booking.professional?.name || "Profissional"
    ].join(" · "),
    start: toCalendarDisplayDate(booking.startsAt, timezone),
    end: toCalendarDisplayDate(booking.endsAt, timezone),
    booking
  })), [calendarBookings, timezone]);

  const eventPropGetter = event => {
    const colors = {
      confirmed: { backgroundColor: "#1a73e8", borderColor: "#1a73e8" },
      completed: { backgroundColor: "#188038", borderColor: "#188038" },
      cancelled: { backgroundColor: "#80868b", borderColor: "#80868b" },
      no_show: { backgroundColor: "#e37400", borderColor: "#e37400" }
    };
    return {
      style: {
        ...(colors[event.booking.status] || colors.confirmed),
        borderRadius: 5,
        color: "#fff",
        padding: "2px 5px"
      }
    };
  };

  const openNewService = () => {
    setSelectedService(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEditService = service => {
    setSelectedService(service);
    setForm({
      name: service.name || "",
      description: service.description || "",
      durationMinutes: service.durationMinutes || 30,
      price: service.price ?? "",
      active: service.active !== false,
      professionalIds: Array.isArray(service.professionalIds)
        ? service.professionalIds.map(Number)
        : []
    });
    setDialogOpen(true);
  };

  const saveService = async () => {
    setSaving(true);
    try {
      const payload = {
        ...form,
        durationMinutes: Number(form.durationMinutes),
        price: form.price === "" ? null : Number(form.price),
        active: form.active,
        professionalIds: form.professionalIds
      };
      if (selectedService) {
        await api.put(`/appointment-services/${selectedService.id}`, payload);
      } else {
        await api.post("/appointment-services", payload);
      }
      toast.success("Serviço salvo.");
      setDialogOpen(false);
      await loadServices();
    } catch (error) {
      toastError(error);
    } finally {
      setSaving(false);
    }
  };

  const deactivateService = async service => {
    try {
      await api.delete(`/appointment-services/${service.id}`);
      toast.success("Serviço desativado.");
      await loadServices();
    } catch (error) {
      toastError(error);
    }
  };

  const setBookingStatus = async (booking, status) => {
    try {
      await api.put(`/appointments/${booking.id}/status`, { status });
      toast.success("Status da reserva atualizado.");
      setSelectedBooking(null);
      await loadCalendarBookings();
      if (activeTab === "bookings") await loadBookings();
    } catch (error) {
      toastError(error);
    }
  };

  return (
    <MainContainer>
      <MainHeader>
        <Title>Agendamento de serviços</Title>
      </MainHeader>

      <Paper style={{ marginBottom: 16 }}>
        <Tabs
          value={activeTab}
          onChange={(_event, value) => setActiveTab(value)}
          indicatorColor="primary"
          textColor="primary"
          variant="scrollable"
          scrollButtons="auto"
        >
          <Tab value="calendar" label="Agenda de trabalho" />
          <Tab value="bookings" label="Reservas" />
          <Tab value="services" label="Serviços" />
        </Tabs>
      </Paper>

      {activeTab === "calendar" && (
        <Paper className="appointments-calendar-paper">
          <div className="appointments-calendar-heading">
            <div>
              <Typography variant="h6">Agenda de trabalho</Typography>
              <Typography variant="body2" color="textSecondary">
                Visualize as reservas por dia, semana ou mês. Selecione um evento para ver os detalhes.
              </Typography>
            </div>
            <div className="appointments-calendar-legend">
              <span><i className="confirmed" /> Confirmado</span>
              <span><i className="completed" /> Concluído</span>
              <span><i className="cancelled" /> Cancelado</span>
              <span><i className="no-show" /> Não compareceu</span>
            </div>
          </div>
          {loading ? (
            <div className="appointments-calendar-loading"><CircularProgress size={28} /></div>
          ) : (
            <Calendar
              localizer={localizer}
              date={calendarDate}
              view={calendarView}
              onNavigate={setCalendarDate}
              onView={setCalendarView}
              events={calendarEvents}
              startAccessor="start"
              endAccessor="end"
              titleAccessor="title"
              views={["month", "week", "day"]}
              messages={calendarMessages}
              eventPropGetter={eventPropGetter}
              onSelectEvent={event => setSelectedBooking(event.booking)}
              style={{ height: 660 }}
              className="appointments-calendar"
            />
          )}
        </Paper>
      )}

      {activeTab === "services" && (
        <Paper style={{ padding: 20, marginBottom: 20 }}>
          <Grid container justify="space-between" alignItems="center" spacing={2}>
            <Grid item>
              <Typography variant="h6">Serviços</Typography>
              <Typography variant="body2" color="textSecondary">
                Serviços ativos e associados a pelo menos um profissional aparecem no fluxo do WhatsApp.
              </Typography>
            </Grid>
            <Grid item>
              <Button
                color="primary"
                variant="contained"
                startIcon={<AddIcon />}
                onClick={openNewService}
              >
                Novo serviço
              </Button>
            </Grid>
          </Grid>
          <Table size="small" style={{ marginTop: 16 }}>
            <TableHead>
              <TableRow>
                <TableCell>Serviço</TableCell>
                <TableCell>Profissionais</TableCell>
                <TableCell>Duração</TableCell>
                <TableCell>Preço</TableCell>
                <TableCell>Status</TableCell>
                <TableCell align="right">Ações</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {services.map(service => (
                <TableRow key={service.id}>
                  <TableCell>
                    <strong>{service.name}</strong>
                    {service.description && (
                      <Typography variant="caption" display="block" color="textSecondary">
                        {service.description}
                      </Typography>
                    )}
                  </TableCell>
                  <TableCell>
                    {(service.professionalIds || [])
                      .map(id => professionals.find(professional => professional.id === id)?.name)
                      .filter(Boolean)
                      .join(", ") || "Nenhum associado"}
                  </TableCell>
                  <TableCell>{service.durationMinutes} min</TableCell>
                  <TableCell>
                    {service.price === null || service.price === ""
                      ? "—"
                      : currencyReady
                        ? formatCurrency(Number(service.price), currency || "BRL")
                        : "..."}
                  </TableCell>
                  <TableCell>{service.active ? "Ativo" : "Inativo"}</TableCell>
                  <TableCell align="right">
                    <IconButton size="small" onClick={() => openEditService(service)} title="Editar">
                      <EditIcon fontSize="small" />
                    </IconButton>
                    {service.active && (
                      <IconButton
                        size="small"
                        onClick={() => deactivateService(service)}
                        title="Desativar"
                      >
                        <BlockIcon fontSize="small" />
                      </IconButton>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {!servicesLoading && services.length === 0 && (
                <TableRow>
                  <TableCell colSpan={6} align="center">
                    Cadastre o primeiro serviço para habilitar o agendamento pelo WhatsApp.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Paper>
      )}

      {activeTab === "bookings" && (
        <Paper style={{ padding: 20 }}>
          <Typography variant="h6">Reservas</Typography>
          <Typography variant="body2" color="textSecondary">
            Os horários consideram o expediente configurado para a empresa, o horário de trabalho do profissional e as reservas confirmadas.
          </Typography>
          <Table size="small" style={{ marginTop: 16 }}>
            <TableHead>
              <TableRow>
                <TableCell>Data e hora</TableCell>
                <TableCell>Serviço</TableCell>
                <TableCell>Profissional</TableCell>
                <TableCell>Cliente</TableCell>
                <TableCell>Status</TableCell>
                <TableCell>Google Agenda</TableCell>
                <TableCell align="right">Ações</TableCell>
              </TableRow>
            </TableHead>
            <TableBody>
              {bookings.map(booking => (
                <TableRow key={booking.id}>
                  <TableCell>
                    {moment(booking.startsAt)
                      .tz(timezone)
                      .format("DD/MM/YYYY HH:mm")}
                  </TableCell>
                  <TableCell>{booking.service?.name || "—"}</TableCell>
                  <TableCell>{booking.professional?.name || "—"}</TableCell>
                  <TableCell>{booking.contact?.name || booking.contact?.number || "WhatsApp"}</TableCell>
                  <TableCell>{statusLabel[booking.status] || booking.status}</TableCell>
                  <TableCell>
                    {booking.googleEventLink
                      ? <a href={booking.googleEventLink} target="_blank" rel="noreferrer">Ver evento</a>
                      : "—"}
                  </TableCell>
                  <TableCell align="right">
                    {booking.status === "confirmed" && (
                      <>
                        <IconButton
                          size="small"
                          onClick={() => setBookingStatus(booking, "completed")}
                          title="Concluir"
                        >
                          <CheckCircleIcon fontSize="small" />
                        </IconButton>
                        <IconButton
                          size="small"
                          onClick={() => setBookingStatus(booking, "cancelled")}
                          title="Cancelar"
                        >
                          <BlockIcon fontSize="small" />
                        </IconButton>
                      </>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {!bookingsLoading && bookings.length === 0 && (
                <TableRow>
                  <TableCell colSpan={7} align="center">Nenhuma reserva encontrada.</TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </Paper>
      )}

      <Dialog
        open={Boolean(selectedBooking)}
        onClose={() => setSelectedBooking(null)}
        fullWidth
        maxWidth="xs"
      >
        {selectedBooking && (
          <>
            <DialogTitle>{selectedBooking.service?.name || "Agendamento"}</DialogTitle>
            <DialogContent>
              <Typography><strong>Cliente:</strong> {selectedBooking.contact?.name || selectedBooking.contact?.number || "WhatsApp"}</Typography>
              <Typography><strong>Profissional:</strong> {selectedBooking.professional?.name || "—"}</Typography>
              <Typography>
                <strong>Data:</strong>{" "}
                {moment(selectedBooking.startsAt).tz(timezone).format("dddd, DD/MM/YYYY")}
              </Typography>
              <Typography>
                <strong>Horário:</strong>{" "}
                {moment(selectedBooking.startsAt).tz(timezone).format("HH:mm")} –{" "}
                {moment(selectedBooking.endsAt).tz(timezone).format("HH:mm")}
              </Typography>
              <Typography><strong>Status:</strong> {statusLabel[selectedBooking.status] || selectedBooking.status}</Typography>
              {selectedBooking.googleEventLink && (
                <Typography style={{ marginTop: 8 }}>
                  <a href={selectedBooking.googleEventLink} target="_blank" rel="noreferrer">Abrir no Google Agenda</a>
                </Typography>
              )}
            </DialogContent>
            <DialogActions>
              <Button onClick={() => setSelectedBooking(null)}>Fechar</Button>
              {selectedBooking.status === "confirmed" && (
                <>
                  <Button onClick={() => setBookingStatus(selectedBooking, "cancelled")}>
                    Cancelar reserva
                  </Button>
                  <Button
                    color="primary"
                    variant="contained"
                    onClick={() => setBookingStatus(selectedBooking, "completed")}
                  >
                    Concluir
                  </Button>
                </>
              )}
            </DialogActions>
          </>
        )}
      </Dialog>

      <Dialog open={dialogOpen} onClose={() => setDialogOpen(false)} fullWidth maxWidth="sm">
        <DialogTitle>{selectedService ? "Editar serviço" : "Novo serviço"}</DialogTitle>
        <DialogContent>
          <TextField
            autoFocus
            margin="dense"
            label="Nome"
            fullWidth
            value={form.name}
            onChange={event => setForm(current => ({ ...current, name: event.target.value }))}
          />
          <TextField
            margin="dense"
            label="Descrição"
            fullWidth
            multiline
            rows={2}
            value={form.description}
            onChange={event => setForm(current => ({ ...current, description: event.target.value }))}
          />
          <Typography variant="subtitle1" style={{ marginTop: 16 }}>
            Profissionais que realizam este serviço
          </Typography>
          {professionalsLoading ? (
            <FormHelperText>Carregando usuários...</FormHelperText>
          ) : professionals.length === 0 ? (
            <FormHelperText>
              Nenhum usuário cadastrado. Cadastre usuários para associá-los ao serviço.
            </FormHelperText>
          ) : (
            <>
              <FormGroup>
                {professionals.map(professional => (
                  <FormControlLabel
                    key={professional.id}
                    control={
                      <Checkbox
                        color="primary"
                        checked={form.professionalIds.includes(professional.id)}
                        onChange={event =>
                          setForm(current => ({
                            ...current,
                            professionalIds: event.target.checked
                              ? Array.from(new Set([...current.professionalIds, professional.id]))
                              : current.professionalIds.filter(id => id !== professional.id)
                          }))
                        }
                      />
                    }
                    label={professional.name}
                  />
                ))}
              </FormGroup>
              {form.professionalIds.length === 0 && (
                <FormHelperText error>
                  Sem profissionais associados, este serviço não aparecerá no fluxo do WhatsApp.
                </FormHelperText>
              )}
            </>
          )}
          <Grid container spacing={2}>
            <Grid item xs={6}>
              <TextField
                margin="dense"
                label="Duração (minutos)"
                type="number"
                fullWidth
                inputProps={{ min: 5, max: 480 }}
                value={form.durationMinutes}
                onChange={event => setForm(current => ({ ...current, durationMinutes: event.target.value }))}
              />
            </Grid>
            {selectedService && (
              <Grid item xs={12}>
                <FormControlLabel
                  control={
                    <Switch
                      checked={form.active}
                      onChange={event => setForm(current => ({ ...current, active: event.target.checked }))}
                      color="primary"
                    />
                  }
                  label="Serviço ativo"
                />
              </Grid>
            )}
            <Grid item xs={6}>
              <TextField
                margin="dense"
                label={
                  currencyReady
                    ? `Preço (${getCurrencySymbol(currency || "BRL")})`
                    : "Preço"
                }
                type="number"
                fullWidth
                inputProps={{ min: 0, step: "0.01" }}
                value={form.price}
                onChange={event => setForm(current => ({ ...current, price: event.target.value }))}
              />
            </Grid>
          </Grid>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setDialogOpen(false)}>Cancelar</Button>
          <Button color="primary" variant="contained" disabled={saving} onClick={saveService}>
            Salvar
          </Button>
        </DialogActions>
      </Dialog>
    </MainContainer>
  );
};

export default Appointments;
