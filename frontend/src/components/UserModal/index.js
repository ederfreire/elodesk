import React, { useState, useEffect, useContext, useRef } from "react";

import * as Yup from "yup";
import { Formik, Form, Field } from "formik";
import { toast } from "react-toastify";

import { makeStyles } from "@material-ui/core/styles";
import green from "@material-ui/core/colors/green";
import Button from "@material-ui/core/Button";
import TextField from "@material-ui/core/TextField";
import Dialog from "@material-ui/core/Dialog";
import DialogActions from "@material-ui/core/DialogActions";
import DialogContent from "@material-ui/core/DialogContent";
import DialogTitle from "@material-ui/core/DialogTitle";
import CircularProgress from "@material-ui/core/CircularProgress";
import Select from "@material-ui/core/Select";
import InputLabel from "@material-ui/core/InputLabel";
import MenuItem from "@material-ui/core/MenuItem";
import FormControl from "@material-ui/core/FormControl";
import Switch from "@material-ui/core/Switch";
import FormControlLabel from "@material-ui/core/FormControlLabel";
import whatsappIcon from "../../assets/nopicture.png";
import { i18n } from "../../translate/i18n";

import api from "../../services/api";
import toastError from "../../errors/toastError";
import QueueSelect from "../QueueSelect";
import { AuthContext } from "../../context/Auth/AuthContext";
import useWhatsApps from "../../hooks/useWhatsApps";

import { Can } from "../Can";
import { Chip, Grid, Paper, Tab, Tabs, Typography } from "@material-ui/core";
import { getBackendUrl } from "../../config";
import TabPanel from "../TabPanel";
import MessageVariablesPicker from "../MessageVariablesPicker";
import AvatarUploader from "../AvatarUpload";

const backendUrl = getBackendUrl();

const formatDateForInput = (date) => {
  if (!date) return '';

  // Se já está no formato YYYY-MM-DD, retorna como está
  if (typeof date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return date;
  }

  // Se é uma data ISO ou objeto Date, converte para YYYY-MM-DD
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';

  // Usar métodos locais para evitar problemas de timezone
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');

  return `${year}-${month}-${day}`;
};

const parseDateFromInput = (dateString) => {
  if (!dateString) return null;

  // Se já está no formato YYYY-MM-DD, retorna como está
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateString)) {
    return dateString;
  }

  // Se é uma data ISO, extrai apenas a parte da data
  if (dateString.includes('T')) {
    return dateString.split('T')[0];
  }

  return dateString;
};

const useStyles = makeStyles((theme) => ({
  root: {
    display: "flex",
    flexWrap: "wrap",
  },
  multFieldLine: {
    display: "flex",
    "& > *:not(:last-child)": {
      marginRight: theme.spacing(1),
    },
  },
  btnWrapper: {
    position: "relative",
  },
  buttonProgress: {
    color: green[500],
    position: "absolute",
    top: "50%",
    left: "50%",
    marginTop: -12,
    marginLeft: -12,
  },
  formControl: {
    margin: theme.spacing(1),
    minWidth: 120,
  },
  textField: {
    marginRight: theme.spacing(1),
    flex: 1,
  },
  notificationField: {
    marginTop: theme.spacing(1.5),
    "& .MuiOutlinedInput-root": {
      alignItems: "flex-start"
    },
    "& .MuiInputBase-input": {
      paddingTop: 14,
      lineHeight: "20px"
    },
    "& .MuiInputLabel-outlined.MuiInputLabel-shrink": {
      backgroundColor: theme.palette.background.paper,
      padding: "0 4px",
      transform: "translate(14px, -6px) scale(0.75)",
      maxWidth: "calc(133% - 32px)",
      whiteSpace: "nowrap"
    }
  },
  container: {
    display: "flex",
    flexWrap: "wrap",
  },
  avatar: {
    width: theme.spacing(12),
    height: theme.spacing(12),
    margin: theme.spacing(2),
    cursor: "pointer",
    borderRadius: "50%",
    border: "2px solid #ccc",
  },
  updateDiv: {
    display: "flex",
    flexDirection: "column",
    alignItems: "center",
    justifyContent: "center",
  },
  updateInput: {
    display: "none",
  },
  updateLabel: {
    padding: theme.spacing(1),
    margin: theme.spacing(1),
    textTransform: "uppercase",
    textAlign: "center",
    cursor: "pointer",
    border: "2px solid #ccc",
    borderRadius: "5px",
    minWidth: 160,
    fontWeight: "bold",
    color: "#555",
  },
  errorUpdate: {
    border: "2px solid red",
  },
  errorText: {
    color: "red",
    fontSize: "0.8rem",
    fontWeight: "bold",
  },
}));

const UserSchema = Yup.object().shape({
  name: Yup.string()
    .min(2, "Too Short!")
    .max(50, "Too Long!")
    .required("Required"),
  password: Yup.string().min(5, "Too Short!").max(50, "Too Long!"),
  email: Yup.string().email("Invalid email").required("Required"),
  allHistoric: Yup.string().nullable(),
});

const UserModal = ({ open, onClose, userId }) => {
  const classes = useStyles();
  const t = (key, opts) => i18n.t(key, opts);

  const initialState = {
    name: "",
    email: "",
    password: "",
    birthDate: "",
    profile: "user",
    startWork: "00:00",
    endWork: "23:59",
    acceptanceMessage: "",
    farewellMessage: "",
    internalExtension: "",
    allTicket: "enable",
    allowGroup: false,
    defaultTheme: "light",
    defaultMenu: "open",
    allHistoric: "enabled",
    allUserChat: "enabled",
    userClosePendingTicket: "enabled",
    showDashboard: "enabled",
    allowRealTime: "enabled",
    allowConnections: "enabled",
    showContacts: "enabled",
    showCampaign: "enabled",
    showFlow: "enabled",
    showSchedules: "enabled",
    showKanban: "enabled",
    showInternalChat: "enabled",
    showOpenAi: "enabled",
    showIntegrations: "enabled",
    finalizacaoComValorVendaAtiva: "false",
    allowSeeMessagesInPendingTickets: "enabled",
    showReturnQueueButton: "enabled",
    showTransferTicketButton: "enabled",
    language: "pt",
    timezone: "America/Sao_Paulo",
    notifyPendingTicketWhatsapp: "disabled",
    whatsappNumber: "",
    pendingTicketNotificationMessage: "",
    notifyOpenTicketWhatsapp: "disabled",
    notifyKanbanTicketWhatsapp: "disabled",
    notificationMaxCount: 1,
    notificationIntervalMinutes: 0,
    notificationWhatsappId: ""
  };

  const { user: loggedInUser } = useContext(AuthContext);

  const [user, setUser] = useState(initialState);
  const [selectedQueueIds, setSelectedQueueIds] = useState([]);
  const [selectedWhatsappIds, setSelectedWhatsappIds] = useState([]);
  // const [allTicket, setAllTicket] = useState("disable");
  const { loading, whatsApps } = useWhatsApps();
  const [profileUrl, setProfileUrl] = useState(null);
  const [tab, setTab] = useState("general");
  const [avatar, setAvatar] = useState(null);
  const startWorkRef = useRef();
  const endWorkRef = useRef();

  useEffect(() => {
    const fetchUser = async () => {
      if (!userId) return;
      try {
        const { data } = await api.get(`/users/${userId}`);
        // Normalizar language do backend (pt-BR -> pt, en-US -> en, etc.)
        const normalizeLanguage = (lang) => {
          if (!lang) return "pt";
          const map = { "pt-BR": "pt", "en-US": "en", "es-ES": "es", "ar-SA": "ar", "tr-TR": "tr" };
          return map[lang] || lang.split("-")[0] || "pt";
        };
        setUser((prevState) => ({
          ...prevState,
          ...data,
          language: normalizeLanguage(data.language),
          allTicket:
            data.allTicket === "enable" || data.allTicket === "enabled"
              ? "enable"
              : "disable",
          finalizacaoComValorVendaAtiva: data.finalizacaoComValorVendaAtiva
            ? "true"
            : "false",
          allowGroup: data.allowGroup === true || data.allowGroup === "true",
          // Sem valor no banco (usuário antigo) = padrão "Habilitado", igual ao
          // que a migration de 18/11/2026 grava.
          ...Object.fromEntries(
            ["allHistoric", "allUserChat", "userClosePendingTicket", "allowConnections", "showDashboard",
             "allowRealTime", "showContacts", "showCampaign", "showFlow", "showSchedules", "showKanban",
             "showInternalChat", "showOpenAi", "showIntegrations"].map((c) => [c, data[c] === "disabled" ? "disabled" : "enabled"])
          ),
          allowSeeMessagesInPendingTickets: data.allowSeeMessagesInPendingTickets === "enabled" ? "enabled" : "disabled",
          showReturnQueueButton: data.showReturnQueueButton === "enabled" ? "enabled" : "disabled",
          showTransferTicketButton: data.showTransferTicketButton === "enabled" ? "enabled" : "disabled",
          notifyPendingTicketWhatsapp: data.notifyPendingTicketWhatsapp === "enabled" ? "enabled" : "disabled",
          whatsappNumber: data.whatsappNumber || "",
          pendingTicketNotificationMessage: data.pendingTicketNotificationMessage || "",
          notifyOpenTicketWhatsapp: data.notifyOpenTicketWhatsapp === "enabled" ? "enabled" : "disabled",
          notifyKanbanTicketWhatsapp: data.notifyKanbanTicketWhatsapp === "enabled" ? "enabled" : "disabled",
          notificationMaxCount: Number.isFinite(Number(data.notificationMaxCount)) ? Number(data.notificationMaxCount) : 1,
          notificationIntervalMinutes: Number.isFinite(Number(data.notificationIntervalMinutes)) ? Number(data.notificationIntervalMinutes) : 0,
          notificationWhatsappId: data.notificationWhatsappId ?? "",
          acceptanceMessage: data.acceptanceMessage || "",
          farewellMessage: data.farewellMessage || "",
          internalExtension: data.internalExtension || "",
          // Formatar a data corretamente
          birthDate: formatDateForInput(data.birthDate)
        }));

        const { profileImage } = data;
        setProfileUrl(
          `${backendUrl}/public/company${data.companyId}/user/${profileImage}`
        );

        const userQueueIds = data.queues?.map((queue) => queue.id);
        setSelectedQueueIds(userQueueIds);
        // Carregar múltiplas conexões vinculadas
        const userWhatsappIds = data.whatsapps?.map((w) => w.id) || [];
        if (userWhatsappIds.length > 0) {
          setSelectedWhatsappIds(userWhatsappIds);
        } else if (data.whatsappId) {
          // Fallback para campo legado
          setSelectedWhatsappIds([data.whatsappId]);
        } else {
          setSelectedWhatsappIds([]);
        }
      } catch (err) {
        toastError(err);
      }
    };

    fetchUser();
  }, [userId, open]);

  const handleClose = () => {
    onClose();
    setUser(initialState);
  };

  const handleTabChange = (event, newValue) => {
    setTab(newValue);
  };

  const handleSendTestNotification = async (whatsappNumber) => {
    if (!userId) {
      toast.warn(i18n.t("userModal.notifyTest.saveFirst"));
      return;
    }
    const list = String(whatsappNumber || "")
      .split(/[,;\s\n]+/)
      .map(n => n.replace(/\D/g, ""))
      .filter(n => n.length >= 8 && n.length <= 15);
    if (list.length === 0) {
      toast.warn(i18n.t("userModal.notifyTest.invalidNumber"));
      return;
    }
    try {
      const { data } = await api.post(`/users/${userId}/notify-test`, {
        whatsappNumber: list.join(",")
      });
      if (data?.ok) {
        toast.success(i18n.t("userModal.notifyTest.success"));
      } else {
        const code = data?.reasonCode;
        const params = data?.reasonParams || {};
        const translated = code
          ? i18n.t(`userModal.notifyTest.reasons.${code}`, { ...params, defaultValue: data?.reason })
          : data?.reason;
        toast.error(translated || i18n.t("userModal.notifyTest.fail"));
      }
    } catch (err) {
      toastError(err);
    }
  };

  const getBasename = (filepath) => {
    if (!filepath) return '';
    // Remove query strings e hashes
    const cleanPath = filepath.split('?')[0].split('#')[0];
    // Pega o último segmento após /
    const segments = cleanPath.split('/');
    return segments[segments.length - 1];
  };

  // UserModal/index.js - Função handleSaveUser corrigida
  const handleSaveUser = async (values) => {
    const uploadAvatar = async (userId) => {
      if (!avatar || typeof avatar !== 'object') return null;

      const formData = new FormData();
      formData.append("userId", userId);
      formData.append("typeArch", "user");
      formData.append("profileImage", avatar);

      try {
        const { data } = await api.post(
          `/users/${userId}/media-upload`,
          formData,
          {
            headers: {
              'Content-Type': 'multipart/form-data',
            },
          }
        );

        return data.user.profileImage;
      } catch (error) {
        console.error("Erro no upload da imagem:", error);
        throw error;
      }
    };

    const userData = {
      ...values,
      language: values.language || (userId ? user.language : null) || localStorage.getItem("language") || "pt",
      timezone: values.timezone || user.timezone || "America/Sao_Paulo",
      whatsappId: selectedWhatsappIds.length > 0 ? selectedWhatsappIds[0] : null,
      whatsappIds: selectedWhatsappIds,
      queueIds: selectedQueueIds,
      finalizacaoComValorVendaAtiva: values.finalizacaoComValorVendaAtiva === "true",
      birthDate: parseDateFromInput(values.birthDate),
      allowSeeMessagesInPendingTickets: values.allowSeeMessagesInPendingTickets === "enabled" ? "enabled" : "disabled",
      showReturnQueueButton: values.showReturnQueueButton,
      showTransferTicketButton: values.showTransferTicketButton,
      notifyPendingTicketWhatsapp: values.notifyPendingTicketWhatsapp === "enabled" ? "enabled" : "disabled",
      whatsappNumber: String(values.whatsappNumber || "")
        .split(/[,;\s\n]+/)
        .map(n => n.replace(/\D/g, ""))
        .filter(n => n.length >= 8 && n.length <= 15)
        .join(","),
      pendingTicketNotificationMessage: values.pendingTicketNotificationMessage || "",
      notifyOpenTicketWhatsapp: values.notifyOpenTicketWhatsapp === "enabled" ? "enabled" : "disabled",
      notifyKanbanTicketWhatsapp: values.notifyKanbanTicketWhatsapp === "enabled" ? "enabled" : "disabled",
      notificationMaxCount: Math.max(1, parseInt(values.notificationMaxCount, 10) || 1),
      notificationIntervalMinutes: Math.max(0, parseInt(values.notificationIntervalMinutes, 10) || 0),
      notificationWhatsappId: values.notificationWhatsappId ? Number(values.notificationWhatsappId) : null
    };

    try {
      let responseData;

      if (userId) {
        // Atualizar usuário existente
        const { data } = await api.put(`/users/${userId}`, userData);
        responseData = data;

        // Upload da imagem se houver uma nova
        if (avatar && typeof avatar === 'object') {
          const newProfileImage = await uploadAvatar(userId);
          if (newProfileImage) {
            responseData.profileImage = newProfileImage;

            // Atualizar localStorage se for o usuário logado
            if (userId === loggedInUser.id) {
              localStorage.setItem("profileImage", newProfileImage);
            }
          }
        }
      } else {
        // Criar novo usuário
        const { data } = await api.post("/users", userData);
        responseData = data.user;

        // Upload da imagem se houver
        if (avatar && typeof avatar === 'object' && responseData.id) {
          const newProfileImage = await uploadAvatar(responseData.id);
          if (newProfileImage) {
            responseData.profileImage = newProfileImage;
          }
        }
      }

      handleClose();
      toast.success(t("userModal.success"));

      // Aplicar idioma e recarregar se for o usuário logado
      if (userId === loggedInUser.id) {
        if (values.language) {
          localStorage.setItem("language", values.language);
          localStorage.setItem("i18nextLng", values.language);
        }
        setTimeout(() => {
          window.location.reload();
        }, 1000);
      }
    } catch (err) {
      toastError(err);
    }
  };

  return (
    <div className={classes.root}>
      <Dialog
        open={open}
        onClose={handleClose}
        maxWidth="md"
        fullWidth
        scroll="paper"
        PaperProps={{
          style: {
            maxHeight: "calc(100dvh - 32px)",
            borderRadius: 16,
          }
        }}
      >
        <DialogTitle id="form-dialog-title">
          {userId
            ? `${t("userModal.title.edit")}`
            : `${t("userModal.title.add")}`}
        </DialogTitle>
        <Formik
          initialValues={user}
          enableReinitialize={true}
          validationSchema={UserSchema}
          onSubmit={(values, actions) => {
            setTimeout(() => {
              handleSaveUser(values);
              actions.setSubmitting(false);
            }, 400);
          }}
        >
          {({ values, touched, errors, isSubmitting, setFieldValue }) => (
            <Form>
              <Tabs
                  value={tab}
                  indicatorColor="primary"
                  textColor="primary"
                  scrollButtons="on"
                  variant="scrollable"
                  onChange={handleTabChange}
                  className={classes.tab}
                >
                  <Tab
                    label={t("userModal.tabs.general")}
                    value={"general"}
                  />
                  <Tab
                    label={t("userModal.tabs.notifications")}
                    value={"notifications"}
                  />
                  <Tab
                    label={t("userModal.tabs.permissions")}
                    value={"permissions"}
                  />
                </Tabs>
              <DialogContent dividers style={{ paddingBottom: 24 }}>
                  <TabPanel
                    className={classes.container}
                    value={tab}
                    name={"general"}
                  >
                    <Grid
                      container
                      spacing={1}
                      alignContent="center"
                      alignItems="center"
                      justifyContent="center"
                    >
                      <FormControl className={classes.updateDiv}>
                        <AvatarUploader
                          setAvatar={setAvatar}
                          avatar={user.profileImage}
                          companyId={user.companyId || loggedInUser.companyId}
                        />
                        {user.profileImage && (
                          <Button
                            variant="outlined"
                            color="secondary"
                            onClick={() => {
                              user.profileImage = null;
                              setFieldValue("profileImage", null);
                              setAvatar(null);
                            }}
                          >
                            {t("userModal.title.removeImage")}
                          </Button>
                        )}
                      </FormControl>
                    </Grid>
                    <Grid container spacing={1}>
                      <Grid item xs={12} md={6} xl={6}>
                        <Field
                          as={TextField}
                          label={t("userModal.form.name")}
                          autoFocus
                          name="name"
                          error={touched.name && Boolean(errors.name)}
                          helperText={touched.name && errors.name}
                          variant="outlined"
                          margin="dense"
                          fullWidth
                        />
                      </Grid>
                      <Grid item xs={12} md={6} xl={6}>
                        <Field
                          as={TextField}
                          label={t("userModal.form.password")}
                          type="password"
                          name="password"
                          error={touched.password && Boolean(errors.password)}
                          helperText={touched.password && errors.password}
                          variant="outlined"
                          margin="dense"
                          fullWidth
                        />
                      </Grid>
                    </Grid>
                    <Grid container spacing={1}>
                      <Grid item xs={12} md={8} xl={8}>
                        <Field
                          as={TextField}
                          label={t("userModal.form.email")}
                          name="email"
                          error={touched.email && Boolean(errors.email)}
                          helperText={touched.email && errors.email}
                          variant="outlined"
                          margin="dense"
                          fullWidth
                        />
                      </Grid>
                      <Grid item xs={12} md={4} xl={4}>
                        <FormControl
                          variant="outlined"
                          //className={classes.formControl}
                          margin="dense"
                          fullWidth
                        >
                          <Can
                            role={loggedInUser.profile}
                            perform="user-modal:editProfile"
                            yes={() => (
                              <>
                                <InputLabel id="profile-selection-input-label">
                                  {t("userModal.form.profile")}
                                </InputLabel>

                                <Field
                                  as={Select}
                                  label={t("userModal.form.profile")}
                                  name="profile"
                                  labelId="profile-selection-label"
                                  id="profile-selection"
                                  required
                                >
                                  <MenuItem value="admin">Admin</MenuItem>
                                  <MenuItem value="user">User</MenuItem>
                                </Field>
                              </>
                            )}
                          />
                        </FormControl>
                      </Grid>
                    </Grid>
                    <Grid container spacing={1}>
                      <Grid item xs={12} md={12} xl={12}>
                        <Can
                          role={loggedInUser.profile}
                          perform="user-modal:editQueues"
                          yes={() => (
                            <QueueSelect
                              selectedQueueIds={selectedQueueIds}
                              onChange={(values) => setSelectedQueueIds(values)}
                              fullWidth
                            />
                          )}
                        />
                      </Grid>
                    </Grid>
                    <Grid container spacing={1}>
                      <Grid item xs={12} md={12} xl={12}>
                        <Can
                          role={loggedInUser.profile}
                          perform="user-modal:editProfile"
                          yes={() => (
                             <FormControl
                              variant="outlined"
                              margin="dense"
                              className={classes.maxWidth}
                              fullWidth
                            >
                              <InputLabel>
                                {t("userModal.form.connections")}
                              </InputLabel>
                              <Select
                                multiple
                                value={selectedWhatsappIds}
                                onChange={(e) => setSelectedWhatsappIds(e.target.value)}
                                label={t("userModal.form.connections")}
                                renderValue={(selected) => (
                                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                                    {selected.map((id) => {
                                      const w = whatsApps.find(w => w.id === id);
                                      return (
                                        <Chip
                                          key={id}
                                          label={w ? w.name : id}
                                          size="small"
                                          style={{ margin: 2 }}
                                        />
                                      );
                                    })}
                                  </div>
                                )}
                              >
                                {whatsApps.map((whatsapp) => (
                                  <MenuItem
                                    key={whatsapp.id}
                                    value={whatsapp.id}
                                  >
                                    {whatsapp.name}
                                  </MenuItem>
                                ))}
                              </Select>
                            </FormControl>
                          )}
                        />
                      </Grid>
                    </Grid>
                    <Can
                      role={loggedInUser.profile}
                      perform="user-modal:editProfile"
                      yes={() => (
                        <Grid container spacing={1}>
                          <Grid item xs={12} md={6} xl={6}>
                            <Field
                              as={TextField}
                              label={t("userModal.form.startWork")}
                              type="time"
                              ampm={"false"}
                              inputRef={startWorkRef}
                              InputLabelProps={{
                                shrink: true,
                              }}
                              inputProps={{
                                step: 600, // 5 min
                              }}
                              fullWidth
                              name="startWork"
                              error={
                                touched.startWork && Boolean(errors.startWork)
                              }
                              helperText={touched.startWork && errors.startWork}
                              variant="outlined"
                              margin="dense"
                              className={classes.textField}
                            />
                          </Grid>
                          <Grid item xs={12} md={6} xl={6}>
                            <Field
                              as={TextField}
                              label={t("userModal.form.endWork")}
                              type="time"
                              ampm={"false"}
                              inputRef={endWorkRef}
                              InputLabelProps={{
                                shrink: true,
                              }}
                              inputProps={{
                                step: 600, // 5 min
                              }}
                              fullWidth
                              name="endWork"
                              error={touched.endWork && Boolean(errors.endWork)}
                              helperText={touched.endWork && errors.endWork}
                              variant="outlined"
                              margin="dense"
                              className={classes.textField}
                            />
                          </Grid>
                          {/* Ramal interno: número curto usado para ligar de
                              um atendente para outro dentro da plataforma.
                              Deixar em branco significa "sem ramal" — o
                              usuário não aparece na lista e não recebe
                              ligação interna. */}
                          <Grid item xs={12} md={6} xl={6}>
                            <Field
                              as={TextField}
                              label={t("userModal.form.internalExtension")}
                              type="text"
                              fullWidth
                              name="internalExtension"
                              placeholder={t("userModal.form.internalExtensionPlaceholder")}
                              inputProps={{ maxLength: 10 }}
                              helperText={
                                (touched.internalExtension && errors.internalExtension) ||
                                t("userModal.form.internalExtensionHelper")
                              }
                              error={
                                touched.internalExtension &&
                                Boolean(errors.internalExtension)
                              }
                              variant="outlined"
                              margin="dense"
                              className={classes.textField}
                            />
                          </Grid>
                        </Grid>
                      )}
                    />

                    <Grid container spacing={1}>
                      <Grid item xs={12} md={6} xl={6}>
                        <Field
                          as={TextField}
                          label={t("userModal.form.birthDate")}
                          type="date"
                          name="birthDate"
                          InputLabelProps={{
                            shrink: true,
                          }}
                          fullWidth
                          variant="outlined"
                          margin="dense"
                          className={classes.textField}
                          helperText={t("userModal.form.birthDateHelper")}
                          onChange={(e) => {
                            const formattedDate = parseDateFromInput(e.target.value);
                            setFieldValue('birthDate', formattedDate);
                          }}
                        />
                      </Grid>
                      <Grid item xs={12} md={6} xl={6}>
                        <FormControl
                          variant="outlined"
                          margin="dense"
                          fullWidth
                        >
                          <InputLabel>
                            {t("userModal.form.language")}
                          </InputLabel>
                          <Field
                            as={Select}
                            label={t("userModal.form.language")}
                            name="language"
                          >
                            <MenuItem value="pt">🇧🇷 Português</MenuItem>
                            <MenuItem value="en">🇺🇸 English</MenuItem>
                            <MenuItem value="es">🇪🇸 Español</MenuItem>
                          </Field>
                        </FormControl>
                      </Grid>
                    </Grid>

                    <Grid container spacing={1}>
                      <Grid item xs={12}>
                        <FormControl
                          variant="outlined"
                          margin="dense"
                          fullWidth
                        >
                          <InputLabel>
                            {t("userModal.form.timezone") !== "userModal.form.timezone"
                              ? t("userModal.form.timezone")
                              : "Fuso horário (campanhas)"}
                          </InputLabel>
                          <Field
                            as={Select}
                            label={t("userModal.form.timezone") !== "userModal.form.timezone"
                              ? t("userModal.form.timezone")
                              : "Fuso horário (campanhas)"}
                            name="timezone"
                          >
                            <MenuItem value="America/Sao_Paulo">🇧🇷 (GMT-3) Brasília — São Paulo</MenuItem>
                            <MenuItem value="America/Manaus">🇧🇷 (GMT-4) Manaus</MenuItem>
                            <MenuItem value="America/Rio_Branco">🇧🇷 (GMT-5) Rio Branco</MenuItem>
                            <MenuItem value="America/Noronha">🇧🇷 (GMT-2) Fernando de Noronha</MenuItem>
                            <MenuItem value="America/Argentina/Buenos_Aires">🇦🇷 (GMT-3) Buenos Aires</MenuItem>
                            <MenuItem value="America/Santiago">🇨🇱 (GMT-3) Santiago</MenuItem>
                            <MenuItem value="America/Bogota">🇨🇴 (GMT-5) Bogotá</MenuItem>
                            <MenuItem value="America/Lima">🇵🇪 (GMT-5) Lima</MenuItem>
                            <MenuItem value="America/Mexico_City">🇲🇽 (GMT-6) México DF</MenuItem>
                            <MenuItem value="America/New_York">🇺🇸 (GMT-5) Nova York</MenuItem>
                            <MenuItem value="America/Los_Angeles">🇺🇸 (GMT-8) Los Angeles</MenuItem>
                            <MenuItem value="Europe/Lisbon">🇵🇹 (GMT+0) Lisboa</MenuItem>
                            <MenuItem value="Europe/London">🇬🇧 (GMT+0) Londres</MenuItem>
                            <MenuItem value="Europe/Madrid">🇪🇸 (GMT+1) Madrid</MenuItem>
                            <MenuItem value="Europe/Paris">🇫🇷 (GMT+1) Paris</MenuItem>
                            <MenuItem value="Europe/Berlin">🇩🇪 (GMT+1) Berlim</MenuItem>
                            <MenuItem value="Africa/Luanda">🇦🇴 (GMT+1) Luanda</MenuItem>
                            <MenuItem value="Africa/Maputo">🇲🇿 (GMT+2) Maputo</MenuItem>
                            <MenuItem value="Asia/Dubai">🇦🇪 (GMT+4) Dubai</MenuItem>
                            <MenuItem value="Asia/Riyadh">🇸🇦 (GMT+3) Riade</MenuItem>
                            <MenuItem value="Asia/Istanbul">🇹🇷 (GMT+3) Istambul</MenuItem>
                            <MenuItem value="Asia/Tokyo">🇯🇵 (GMT+9) Tóquio</MenuItem>
                          </Field>
                        </FormControl>
                      </Grid>
                    </Grid>

                    <Field
                      as={TextField}
                      label={t("userModal.form.acceptanceMessage")}
                      type="acceptanceMessage"
                      multiline
                      rows={4}
                      fullWidth
                      name="acceptanceMessage"
                      error={
                        touched.acceptanceMessage &&
                        Boolean(errors.acceptanceMessage)
                      }
                      helperText={
                        touched.acceptanceMessage && errors.acceptanceMessage
                      }
                      variant="outlined"
                      margin="dense"
                    />
                    <MessageVariablesPicker
                      onClick={(value) =>
                        setFieldValue(
                          "acceptanceMessage",
                          (values.acceptanceMessage || "") + value
                        )
                      }
                    />

                    <Field
                      as={TextField}
                      label={t("userModal.form.farewellMessage")}
                      type="farewellMessage"
                      multiline
                      rows={4}
                      fullWidth
                      name="farewellMessage"
                      error={
                        touched.farewellMessage &&
                        Boolean(errors.farewellMessage)
                      }
                      helperText={
                        touched.farewellMessage && errors.farewellMessage
                      }
                      variant="outlined"
                      margin="dense"
                    />
                    <MessageVariablesPicker
                      onClick={(value) =>
                        setFieldValue(
                          "farewellMessage",
                          (values.farewellMessage || "") + value
                        )
                      }
                    />

                  </TabPanel>
                  <TabPanel
                    className={classes.container}
                    value={tab}
                    name={"notifications"}
                  >
                    <Grid container spacing={2}>
                      {/* ===== Seção 1: Ativação ===== */}
                      <Grid item xs={12}>
                        <Paper
                          variant="outlined"
                          style={{
                            padding: 16,
                            borderRadius: 12,
                            background: values.notifyPendingTicketWhatsapp === "enabled" ||
                              values.notifyOpenTicketWhatsapp === "enabled" ||
                              values.notifyKanbanTicketWhatsapp === "enabled"
                                ? "rgba(78,147,255,0.06)"
                                : "transparent",
                            borderColor: "rgba(0,0,0,0.08)",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 16, flexWrap: "wrap" }}>
                            <div style={{ flex: 1, minWidth: 240 }}>
                              <Typography variant="subtitle2" style={{ fontWeight: 700 }}>
                                {t("userModal.form.notificationsSectionTitle")}
                              </Typography>
                              <Typography variant="caption" color="textSecondary" style={{ display: "block", marginTop: 2 }}>
                                {t("userModal.form.enableNotificationsHelper")}
                              </Typography>
                            </div>
                            <Switch
                              color="primary"
                              checked={
                                values.notifyPendingTicketWhatsapp === "enabled" ||
                                values.notifyOpenTicketWhatsapp === "enabled" ||
                                values.notifyKanbanTicketWhatsapp === "enabled"
                              }
                              onChange={(e) => {
                                const v = e.target.checked ? "enabled" : "disabled";
                                setFieldValue("notifyPendingTicketWhatsapp", v);
                                setFieldValue("notifyOpenTicketWhatsapp", v);
                                setFieldValue("notifyKanbanTicketWhatsapp", v);
                              }}
                            />
                          </div>
                        </Paper>
                      </Grid>

                      {/* ===== Seção 2: Tipos de notificação ===== */}
                      <Grid item xs={12}>
                        <Paper variant="outlined" style={{ padding: 16, borderRadius: 12, borderColor: "rgba(0,0,0,0.08)" }}>
                          <Typography
                            variant="overline"
                            color="textSecondary"
                            style={{ fontWeight: 700, letterSpacing: 0.6, display: "block", marginBottom: 8 }}
                          >
                            {t("userModal.tabs.sectionNotificationTypes", "Tipos de notificação")}
                          </Typography>
                          <Grid container spacing={2}>
                            <Grid item xs={12} md={4}>
                              <Field
                                as={TextField}
                                select
                                fullWidth
                                variant="outlined"
                                margin="dense"
                                label={t("userModal.form.notifyPendingTicketWhatsapp")}
                                name="notifyPendingTicketWhatsapp"
                                className={classes.notificationField}
                                InputLabelProps={{ shrink: true }}
                              >
                                <MenuItem value="disabled">{t("userModal.form.allHistoricDisabled")}</MenuItem>
                                <MenuItem value="enabled">{t("userModal.form.allHistoricEnabled")}</MenuItem>
                              </Field>
                            </Grid>
                            <Grid item xs={12} md={4}>
                              <Field
                                as={TextField}
                                select
                                fullWidth
                                variant="outlined"
                                margin="dense"
                                label={t("userModal.form.notifyOpenTicketWhatsapp")}
                                name="notifyOpenTicketWhatsapp"
                                className={classes.notificationField}
                                InputLabelProps={{ shrink: true }}
                              >
                                <MenuItem value="disabled">{t("userModal.form.allHistoricDisabled")}</MenuItem>
                                <MenuItem value="enabled">{t("userModal.form.allHistoricEnabled")}</MenuItem>
                              </Field>
                            </Grid>
                            <Grid item xs={12} md={4}>
                              <Field
                                as={TextField}
                                select
                                fullWidth
                                variant="outlined"
                                margin="dense"
                                label={t("userModal.form.notifyKanbanTicketWhatsapp")}
                                name="notifyKanbanTicketWhatsapp"
                                className={classes.notificationField}
                                InputLabelProps={{ shrink: true }}
                              >
                                <MenuItem value="disabled">{t("userModal.form.allHistoricDisabled")}</MenuItem>
                                <MenuItem value="enabled">{t("userModal.form.allHistoricEnabled")}</MenuItem>
                              </Field>
                            </Grid>
                          </Grid>
                        </Paper>
                      </Grid>

                      {/* ===== Seção 3: Canal de envio ===== */}
                      <Grid item xs={12}>
                        <Paper variant="outlined" style={{ padding: 16, borderRadius: 12, borderColor: "rgba(0,0,0,0.08)" }}>
                          <Typography
                            variant="overline"
                            color="textSecondary"
                            style={{ fontWeight: 700, letterSpacing: 0.6, display: "block", marginBottom: 8 }}
                          >
                            {t("userModal.tabs.sectionSendChannel", "Canal de envio")}
                          </Typography>
                          <Grid container spacing={2}>
                            <Grid item xs={12} md={6}>
                              <Field
                                as={TextField}
                                select
                                fullWidth
                                variant="outlined"
                                margin="dense"
                                label={t("userModal.form.notificationWhatsappId")}
                                name="notificationWhatsappId"
                                className={classes.notificationField}
                                helperText={t("userModal.form.notificationWhatsappIdHelper")}
                                InputLabelProps={{ shrink: true }}
                              >
                                <MenuItem value="">{t("userModal.form.notificationWhatsappAuto")}</MenuItem>
                                {whatsApps?.map((w) => (
                                  <MenuItem key={w.id} value={w.id}>
                                    {w.name} {w.status !== "CONNECTED" ? `(${w.status})` : ""}
                                  </MenuItem>
                                ))}
                              </Field>
                            </Grid>
                            <Grid item xs={12} md={6}>
                              <Field
                                as={TextField}
                                label={t("userModal.form.whatsappNumber")}
                                name="whatsappNumber"
                                placeholder="5511999999999, 5511888888888"
                                helperText={t("userModal.form.whatsappNumberHelper")}
                                multiline
                                minRows={2}
                                variant="outlined"
                                margin="dense"
                                fullWidth
                                className={classes.notificationField}
                                InputLabelProps={{ shrink: true }}
                              />
                              <div style={{ marginTop: 8, display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                                <Button
                                  variant="outlined"
                                  color="primary"
                                  size="small"
                                  disabled={!userId || !values.whatsappNumber}
                                  onClick={() => handleSendTestNotification(values.whatsappNumber)}
                                >
                                  {i18n.t("userModal.notifyTest.button")}
                                </Button>
                                <Typography variant="caption" color="textSecondary">
                                  {i18n.t("userModal.notifyTest.helper")}
                                </Typography>
                              </div>
                            </Grid>
                          </Grid>
                        </Paper>
                      </Grid>

                      {/* ===== Seção 4: Limites e mensagem ===== */}
                      <Grid item xs={12}>
                        <Paper variant="outlined" style={{ padding: 16, borderRadius: 12, borderColor: "rgba(0,0,0,0.08)" }}>
                          <Typography
                            variant="overline"
                            color="textSecondary"
                            style={{ fontWeight: 700, letterSpacing: 0.6, display: "block", marginBottom: 8 }}
                          >
                            {t("userModal.tabs.sectionLimitsAndMessage", "Limites e mensagem")}
                          </Typography>
                          <Grid container spacing={2}>
                            <Grid item xs={6} md={3}>
                              <Field
                                as={TextField}
                                label={t("userModal.form.notificationMaxCount")}
                                name="notificationMaxCount"
                                type="number"
                                inputProps={{ min: 1, max: 50 }}
                                helperText={t("userModal.form.notificationMaxCountHelper")}
                                variant="outlined"
                                margin="dense"
                                fullWidth
                                className={classes.notificationField}
                                InputLabelProps={{ shrink: true }}
                              />
                            </Grid>
                            <Grid item xs={6} md={3}>
                              <Field
                                as={TextField}
                                label={t("userModal.form.notificationIntervalMinutes")}
                                name="notificationIntervalMinutes"
                                type="number"
                                inputProps={{ min: 0, max: 1440 }}
                                helperText={t("userModal.form.notificationIntervalMinutesHelper")}
                                variant="outlined"
                                margin="dense"
                                fullWidth
                                className={classes.notificationField}
                                InputLabelProps={{ shrink: true }}
                              />
                            </Grid>
                            <Grid item xs={12}>
                              <Field
                                as={TextField}
                                label={t("userModal.form.pendingTicketNotificationMessage")}
                                name="pendingTicketNotificationMessage"
                                placeholder={t("userModal.form.pendingTicketNotificationMessagePlaceholder")}
                                helperText={t("userModal.form.pendingTicketNotificationMessageHelper")}
                                multiline
                                minRows={3}
                                variant="outlined"
                                margin="dense"
                                fullWidth
                                className={classes.notificationField}
                                InputLabelProps={{ shrink: true }}
                              />
                            </Grid>
                          </Grid>
                        </Paper>
                      </Grid>
                    </Grid>
                  </TabPanel>
                  <TabPanel
                    className={classes.container}
                    value={tab}
                    name={"permissions"}
                  >
                    <Can
                      role={loggedInUser.profile}
                      perform="user-modal:editProfile"
                      yes={() => {
                        const SIM_NAO = [
                          ["enabled", t("userModal.form.allHistoricEnabled")],
                          ["disabled", t("userModal.form.allHistoricDisabled")],
                        ];
                        // Cada permissão com os valores que o banco guarda.
                        const grupos = [
                          {
                            titulo: t("userModal.form.permGroupTickets"),
                            campos: [
                              ["allTicket", [["enable", t("userModal.form.allTicketEnable")], ["disable", t("userModal.form.allTicketDisable")]]],
                              ["allowGroup", [[true, t("userModal.form.allTicketEnable")], [false, t("userModal.form.allTicketDisable")]]],
                              ["allHistoric", SIM_NAO],
                              ["allUserChat", SIM_NAO],
                              ["allowSeeMessagesInPendingTickets", SIM_NAO],
                              ["userClosePendingTicket", SIM_NAO],
                              ["showReturnQueueButton", SIM_NAO],
                              ["showTransferTicketButton", SIM_NAO],
                              ["allowConnections", SIM_NAO],
                            ],
                          },
                          {
                            titulo: t("userModal.form.permGroupMenus"),
                            campos: [
                              ["showDashboard", SIM_NAO],
                              ["allowRealTime", SIM_NAO],
                              ["showContacts", SIM_NAO],
                              ["showSchedules", SIM_NAO],
                              ["showKanban", SIM_NAO],
                              ["showInternalChat", SIM_NAO],
                              ["showCampaign", SIM_NAO],
                              ["showFlow", SIM_NAO],
                              ["showOpenAi", SIM_NAO],
                              ["showIntegrations", SIM_NAO],
                            ],
                          },
                          {
                            titulo: t("userModal.form.permGroupSales"),
                            campos: [
                              ["finalizacaoComValorVendaAtiva", [["true", t("userModal.form.allHistoricEnabled")], ["false", t("userModal.form.allHistoricDisabled")]], "finalizacaoComValorVenda"],
                            ],
                          },
                        ];
                        return (
                          <>
                            <Typography variant="body2" color="textSecondary" style={{ marginBottom: 4, fontSize: 12 }}>
                              {t("userModal.form.permHint")}
                            </Typography>
                            {grupos.map((g) => (
                              <div key={g.titulo} style={{ marginBottom: 6, width: "100%" }}>
                                <Typography variant="subtitle2" style={{ fontWeight: 600, margin: "8px 0 2px", fontSize: 13 }}>
                                  {g.titulo}
                                </Typography>
                                {/* Uma linha por permissão: nome inteiro à esquerda e
                                    um seletor pequeno, sempre do mesmo tamanho, à
                                    direita. Duas colunas no computador, uma no celular. */}
                                <Grid container spacing={0} style={{ width: "100%" }}>
                                  {g.campos.map(([nome, opcoes, chaveDoRotulo]) => {
                                    const rotulo = t(`userModal.form.${chaveDoRotulo || nome}`);
                                    return (
                                      <Grid item xs={12} md={6} key={nome} style={{ minWidth: 0, paddingRight: 12 }}>
                                        <div
                                          style={{
                                            display: "flex",
                                            alignItems: "center",
                                            justifyContent: "space-between",
                                            gap: 8,
                                            padding: "3px 0",
                                            borderBottom: "1px solid rgba(0,0,0,0.06)",
                                          }}
                                        >
                                          <label
                                            htmlFor={`perm-${nome}`}
                                            style={{ fontSize: 13, lineHeight: 1.25, flex: 1, minWidth: 0 }}
                                          >
                                            {rotulo}
                                          </label>
                                          <Field
                                            as={Select}
                                            id={`perm-${nome}`}
                                            name={nome}
                                            variant="outlined"
                                            margin="none"
                                            style={{ width: 132, flexShrink: 0, fontSize: 13 }}
                                            SelectDisplayProps={{ style: { paddingTop: 6, paddingBottom: 6, fontSize: 13 } }}
                                          >
                                            {opcoes.map(([valor, texto]) => (
                                              <MenuItem key={String(valor)} value={valor} style={{ fontSize: 13 }}>
                                                {texto}
                                              </MenuItem>
                                            ))}
                                          </Field>
                                        </div>
                                      </Grid>
                                    );
                                  })}
                                </Grid>
                              </div>
                            ))}
                          </>
                        );
                      }}
                    />
                  </TabPanel>
                </DialogContent>
              <DialogActions>
                <Button
                  onClick={handleClose}
                  color="secondary"
                  disabled={isSubmitting}
                  variant="outlined"
                >
                  {t("userModal.buttons.cancel")}
                </Button>
                <Button
                  type="submit"
                  color="primary"
                  disabled={isSubmitting}
                  variant="contained"
                  className={classes.btnWrapper}
                >
                  {userId
                    ? `${t("userModal.buttons.okEdit")}`
                    : `${t("userModal.buttons.okAdd")}`}
                  {isSubmitting && (
                    <CircularProgress
                      size={24}
                      className={classes.buttonProgress}
                    />
                  )}
                </Button>
              </DialogActions>
            </Form>
          )}
        </Formik>
      </Dialog>
    </div>
  );
};

export default UserModal;