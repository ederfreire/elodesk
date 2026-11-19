// src/components/ScheduleModal/index.js

import React, { useState, useEffect, useContext, useRef } from "react";

import * as Yup from "yup";
import { Formik, Form, Field } from "formik";
import { toast } from "react-toastify";
import { useHistory } from "react-router-dom";

import { makeStyles } from "@material-ui/core/styles";
import green from "@material-ui/core/colors/green";
import Button from "@material-ui/core/Button";
import TextField from "@material-ui/core/TextField";
import Dialog from "@material-ui/core/Dialog";
import DialogActions from "@material-ui/core/DialogActions";
import DialogContent from "@material-ui/core/DialogContent";
import DialogTitle from "@material-ui/core/DialogTitle";
import CircularProgress from "@material-ui/core/CircularProgress";

import { i18n } from "../../translate/i18n";

import api from "../../services/api";
import toastError from "../../errors/toastError";
import {
  Chip,
  FormControl,
  FormControlLabel,
  Grid,
  IconButton,
  InputLabel,
  MenuItem,
  Paper,
  Select,
  Switch,
  Typography,
} from "@material-ui/core";
// Ícones do bloco de integração com o Google Agenda & Meet.
import EventIcon from "@material-ui/icons/Event";
import FileCopyIcon from "@material-ui/icons/FileCopy";
import OpenInNewIcon from "@material-ui/icons/OpenInNew";
import Autocomplete, {
  createFilterOptions,
} from "@material-ui/lab/Autocomplete";
import moment from "moment";
import { AuthContext } from "../../context/Auth/AuthContext";
import { isArray, capitalize } from "lodash";
import DeleteOutline from "@material-ui/icons/DeleteOutline";
import AttachFile from "@material-ui/icons/AttachFile";
import { head } from "lodash";
import ConfirmationModal from "../ConfirmationModal";
import MessageVariablesPicker from "../MessageVariablesPicker";
import useQueues from "../../hooks/useQueues";
import UserStatusIcon from "../UserModal/statusIcon";
import Facebook from "@material-ui/icons/Facebook";
import Instagram from "@material-ui/icons/Instagram";
import WhatsApp from "@material-ui/icons/WhatsApp";
import FlashOn from "@material-ui/icons/FlashOn";

const useStyles = makeStyles((theme) => ({
  root: {
    display: "flex",
    flexWrap: "wrap",
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
}));

const ScheduleSchema = Yup.object().shape({
  body: Yup.string().min(5, i18n.t("validation.messageTooShort")).required(i18n.t("validation.required")),
  contactId: Yup.number().required(i18n.t("validation.required")),
  sendAt: Yup.string().required(i18n.t("validation.required")),
  reminderDate: Yup.string().nullable()
});

const ScheduleModal = ({
  open,
  onClose,
  scheduleId,
  contactId,
  cleanContact,
  reload,
  message, // ✅ Nova prop para pre-popular mensagem
  fromMessageInput = false, // ✅ Nova prop para identificar origem
  user
}) => {
  const classes = useStyles();
  const history = useHistory();
  const isMounted = useRef(true);
  const { companyId } = user;
  const isAdmin = user.profile === 'admin';

  const initialState = {
    body: message || "", // ✅ Pre-popular com mensagem se fornecida
    contactId: contactId || "", // ✅ Pre-popular com contactId se fornecido
    sendAt: moment().add(1, "hour").format("YYYY-MM-DDTHH:mm"),
    sentAt: "",
    openTicket: "enabled",
    ticketUserId: user.id,
    queueId: "",
    statusTicket: "open", // ✅ Status baseado na origem
    intervalo: 1,
    valorIntervalo: 0,
    enviarQuantasVezes: 1,
    tipoDias: 4,
    assinar: false,
    // ✅ Novos campos para lembrete
    reminderDate: "",
    // Integração Google Agenda & Meet. Os valores reais vêm das preferências
    // da empresa quando o modal abre (ver useEffect de googleConfig) — aqui
    // ficam desligados para o caso de não haver conta conectada.
    googleSync: false,
    googleMeet: false,
    googleEventTitle: "",
    googleEventDuration: 30,
  };

  const initialContact = {
    id: "",
    name: "",
    number: "",
    channel: "",
  };

  const [schedule, setSchedule] = useState(initialState);
  // Configuração do Google da empresa: null enquanto carrega, {} quando não
  // há conta conectada. É o que decide se o bloco aparece e com que padrões.
  const [googleConfig, setGoogleConfig] = useState(null);
  const [meetLinkCopiado, setMeetLinkCopiado] = useState(false);

  // Busca a configuração do Google da empresa ao abrir o modal.
  //
  // Sem conta conectada a API devolve null — e aí o bloco simplesmente não
  // aparece, em vez de mostrar controles que não fariam nada. Falha de rede
  // cai no mesmo caminho: melhor esconder a integração do que exibir um
  // bloco quebrado no meio do formulário de agendamento.
  useEffect(() => {
    if (!open) return;
    let ativo = true;

    (async () => {
      try {
        const { data } = await api.get("/google-calendar/config");
        if (ativo) setGoogleConfig(data || {});
      } catch (err) {
        if (ativo) setGoogleConfig({});
      }
    })();

    return () => {
      ativo = false;
    };
  }, [open]);
  const [currentContact, setCurrentContact] = useState(initialContact);
  const [contacts, setContacts] = useState([initialContact]);
  const [intervalo, setIntervalo] = useState(1);
  const [tipoDias, setTipoDias] = useState(4);
  const [attachment, setAttachment] = useState(null);
  const attachmentFile = useRef(null);
  const [confirmationOpen, setConfirmationOpen] = useState(false);
  const messageInputRef = useRef();
  // Começa SEM filtro de canal. Antes começava em "whatsapp", que é só o
  // Baileys: quem usa WhatsApp Plus (wacalls) ou API Oficial abria a tela e
  // encontrava a lista de conexões vazia, sem nada pra escolher. Sem contato
  // escolhido não há por que restringir — o filtro entra depois, quando o
  // contato indica o canal dele.
  const [channelFilter, setChannelFilter] = useState("");
  const [whatsapps, setWhatsapps] = useState([]);
  const [selectedWhatsapps, setSelectedWhatsapps] = useState([]);
  const [loading, setLoading] = useState(false);
  const [queues, setQueues] = useState([]);
  const [allQueues, setAllQueues] = useState([]);
  const [selectedUser, setSelectedUser] = useState(null);
  const [selectedQueue, setSelectedQueue] = useState(null);
  const { findAll: findAllQueues } = useQueues();
  const [options, setOptions] = useState([]);
  const [searchParam, setSearchParam] = useState("");

  // Estados para quickMessages
  const [quickMessages, setQuickMessages] = useState([]);
  const [filteredQuickMessages, setFilteredQuickMessages] = useState([]);
  const [loadingQuickMessages, setLoadingQuickMessages] = useState(false);
  const [selectedQuickMessage, setSelectedQuickMessage] = useState("");
  const [quickMessageSearch, setQuickMessageSearch] = useState("");
  const [showAllQuickMessages, setShowAllQuickMessages] = useState(false);
  const [quickMessageMedia, setQuickMessageMedia] = useState(null);

  useEffect(() => {
    return () => {
      isMounted.current = false;
    };
  }, []);

  useEffect(() => {
    if (isMounted.current) {
      const loadQueues = async () => {
        const list = await findAllQueues();
        setAllQueues(list);
        setQueues(list);
      };
      loadQueues();
    }
  }, []);

  // Buscar quickMessages quando o modal abrir
  useEffect(() => {
    if (open && user?.companyId) {
      fetchQuickMessages();
    }
  }, [open, user?.companyId, user?.id]);

  // Filtrar respostas rápidas baseado na busca
  useEffect(() => {
    if (quickMessageSearch.trim() === "" && !showAllQuickMessages) {
      setFilteredQuickMessages([]);
    } else if (quickMessageSearch.trim() === "" && showAllQuickMessages) {
      setFilteredQuickMessages(quickMessages);
    } else {
      const filtered = quickMessages.filter(qm => 
        qm.message.toLowerCase().includes(quickMessageSearch.toLowerCase()) ||
        qm.shortcode.toLowerCase().includes(quickMessageSearch.toLowerCase())
      );
      setFilteredQuickMessages(filtered);
    }
  }, [quickMessageSearch, quickMessages, showAllQuickMessages]);

  const fetchQuickMessages = async () => {
    setLoadingQuickMessages(true);
    try {

      const { data } = await api.get("/quick-messages/list", {
        params: {
          companyId: user?.companyId,
          userId: user?.id,
          isOficial: "false"
        }
      });

      setQuickMessages(data || []);
      setFilteredQuickMessages(data || []);
    } catch (err) {
      console.error("❌ Erro ao buscar respostas rápidas:", err);
      toastError(err);
      setQuickMessages([]);
      setFilteredQuickMessages([]);
    } finally {
      setLoadingQuickMessages(false);
    }
  };

  // Função para baixar mídia da quickMessage
  const downloadQuickMessageMedia = async (mediaPath, mediaName, mediaType) => {
    try {

      // Construir URL correta usando a URL base do backend
      const backendUrl = process.env.REACT_APP_BACKEND_URL || 'http://localhost:8080';
      const downloadUrl = `${backendUrl}/public/company${user?.companyId}/quickMessage/${mediaName}`;


      const response = await fetch(downloadUrl, {
        method: 'GET',
        headers: {
          'Authorization': `Bearer ${localStorage.getItem('token')}`
        }
      });

      if (!response.ok) {
        throw new Error(`Erro ao baixar mídia: ${response.status}`);
      }

      const blob = await response.blob();
      const file = new File([blob], mediaName, {
        type: blob.type || getMediaTypeFromExtension(mediaName, mediaType)
      });

      return file;
    } catch (err) {
      console.error("❌ Erro ao baixar mídia da quickMessage:", err);
      toastError(err);
      return null;
    }
  };

  // Função auxiliar para determinar o tipo MIME baseado na extensão
  const getMediaTypeFromExtension = (fileName, mediaType) => {
    const extension = fileName.split('.').pop().toLowerCase();

    switch (mediaType) {
      case 'image':
        return `image/${extension === 'jpg' ? 'jpeg' : extension}`;
      case 'audio':
        return `audio/${extension}`;
      case 'video':
        return `video/${extension}`;
      default:
        return 'application/octet-stream';
    }
  };

  useEffect(() => {
    if (searchParam.length < 3) {
      setLoading(false);
      setSelectedQueue("");
      return;
    }
    const delayDebounceFn = setTimeout(() => {
      setLoading(true);
      const fetchUsers = async () => {
        try {
          const { data } = await api.get("/users/");
          setOptions(data.users);
          setLoading(false);
        } catch (err) {
          setLoading(false);
          toastError(err);
        }
      };

      fetchUsers();
    }, 500);
    return () => clearTimeout(delayDebounceFn);
  }, [searchParam]);

  useEffect(() => {
    api
      .get(`/whatsapp/filter`, {
        // Sem contato escolhido ainda, channelFilter vem vazio e o backend
        // devolvia lista vazia — por isso a Conexão só aparecia DEPOIS do
        // contato. Sem contato, traz todas as conexões.
        params: channelFilter
          ? { session: 0, channel: channelFilter }
          : { session: 0 },
      })
      .then(({ data }) => {
        const mappedWhatsapps = data.map((whatsapp) => ({
          ...whatsapp,
          selected: false,
        }));

        setWhatsapps(mappedWhatsapps);
        if (mappedWhatsapps.length && mappedWhatsapps?.length === 1) {
          setSelectedWhatsapps(mappedWhatsapps[0].id);
        }
      });
  }, [currentContact, channelFilter]);

  useEffect(() => {
    if (contactId && contacts.length) {
      const contact = contacts.find((c) => c.id === contactId);
      if (contact) {
        setCurrentContact(contact);
      }
    }
  }, [contactId, contacts]);

  // ✅ MELHORIA: UseEffect otimizado com melhor lógica de inicialização
  useEffect(() => {
    const { companyId } = user;
    if (open) {
      try {
        (async () => {
          // Carregar lista de contatos
          const { data: contactList } = await api.get("/contacts/list", {
            params: { companyId: companyId },
          });

          // O número precisa vir junto: a lista mostrava só o nome, e como
          // muito contato importado fica salvo com o próprio número no lugar
          // do nome, o resultado era uma lista de números soltos sem como
          // saber de quem é. Com o número separado dá pra mostrar os dois e
          // buscar por qualquer um deles.
          let customList = contactList
            .filter((c) => !c.isGroup)
            .map((c) => ({
              id: c.id,
              name: c.name,
              number: c.number,
              channel: c.channel,
            }));

          if (isArray(customList)) {
            setContacts([{ id: "", name: "", number: "", channel: "" }, ...customList]);
          }

          // ✅ MELHORIA: Lógica de inicialização aprimorada
          if (!scheduleId) {
            // Modal sendo aberto para criar novo agendamento
            const newScheduleState = {
              ...initialState,
              body: message || "", // ✅ Pre-popular mensagem
              contactId: contactId || "", // ✅ Pre-popular contato
              // Herda as preferências da empresa. Se não houver conta
              // conectada, googleConfig fica {} e tudo continua desligado.
              googleSync: !!googleConfig?.connected && !!googleConfig?.syncEvents,
              googleMeet: !!googleConfig?.connected && !!googleConfig?.autoMeet,
              googleEventDuration: googleConfig?.defaultDuration || 30,
            };

            setSchedule(newScheduleState);

            // ✅ MELHORIA: Se contactId foi fornecido, definir contato atual
            if (contactId && customList.length > 0) {
              const foundContact = customList.find((c) => c.id.toString() === contactId.toString());
              if (foundContact) {
                setCurrentContact(foundContact);
                // Não filtra a lista de conexões pelo canal do contato.
                // Filtrar por "whatsapp" escondia WhatsApp Plus (wacalls),
                // WhatsApp Oficial e demais conexões quando o agendamento
                // era aberto de dentro do atendimento.
                setChannelFilter("");
              }

            }

            return;
          }

          // ✅ Carregamento de agendamento existente (lógica original)
          const { data } = await api.get(`/schedules/${scheduleId}`);
          setSchedule((prevState) => {
            return {
              ...prevState,
              ...data,
              sendAt: moment(data.sendAt).format("YYYY-MM-DDTHH:mm"),
              // ✅ Incluir campos de lembrete no carregamento
              reminderDate: data.reminderDate ? moment(data.reminderDate).format("YYYY-MM-DDTHH:mm") : "",
              googleSync: !!data.googleSync,
              googleMeet: !!data.googleMeet,
              googleEventTitle: data.googleEventTitle || "",
              googleEventDuration:
                data.googleEventDuration || googleConfig?.defaultDuration || 30,
            };
          });


          if (data.whatsapp) {
            setSelectedWhatsapps(data.whatsapp.id);
          }

          if (!isAdmin && data.ticketUser) {
            setSelectedUser(data.ticketUser);
          }

          if (data.queueId) {
            setSelectedQueue(data.queueId);
          }

          if (data.intervalo) {
            setIntervalo(data.intervalo);
          }

          if (data.tipoDias) {
            setTipoDias(data.tipoDias);
          }

          setCurrentContact(data.contact);
        })();
      } catch (err) {
        toastError(err);
      }
    }
  }, [scheduleId, contactId, open, user, message, fromMessageInput]);

  const filterOptions = createFilterOptions({
    trim: true,
  });

  const handleClose = () => {
    onClose();
    setAttachment(null);
    setSchedule(initialState);
    // ✅ MELHORIA: Reset do contato atual ao fechar
    setCurrentContact(initialContact);
    // Reset do dropdown de quickMessages
    setSelectedQuickMessage("");
    setQuickMessageSearch("");
    setShowAllQuickMessages(false);
    setFilteredQuickMessages([]);
    setQuickMessageMedia(null);
    // ✅ Reset dos campos de lembrete
    setSchedule(prevState => ({
      ...prevState,
      reminderDate: "",
    }));
  };

  const handleAttachmentFile = (e) => {
    const file = head(e.target.files);
    if (file) {
      setAttachment(file);
    }
  };

  const IconChannel = (channel) => {
    switch (channel) {
      case "facebook":
        return (
          <Facebook style={{ color: "#3b5998", verticalAlign: "middle" }} />
        );
      case "instagram":
        return (
          <Instagram style={{ color: "#e1306c", verticalAlign: "middle" }} />
        );
      case "whatsapp":
      case "wacalls":
      case "whatsapp_oficial":
      default:
        return (
          <WhatsApp style={{ color: "#25d366", verticalAlign: "middle" }} />
        );
    }
  };

  // Muito contato fica salvo com o próprio número no campo de nome (é o que
  // acontece quando ele chega pela importação e nunca foi renomeado). Repetir
  // o número duas vezes na mesma linha só polui, então nesse caso mostramos
  // uma coisa só.
  const nomeEhONumero = (option) => {
    const nome = String(option?.name || "").replace(/\D/g, "");
    const numero = String(option?.number || "").replace(/\D/g, "");
    return !!numero && nome === numero;
  };

  /**
   * Texto usado pelo campo e pela busca do Autocomplete.
   *
   * Inclui o número de propósito: é ele que permite achar o contato digitando
   * o telefone, e não só o nome.
   */
  const rotuloDoContato = (option) => {
    if (!option) return "";
    const nome = String(option.name || "").trim();
    const numero = String(option.number || "").trim();
    if (!nome) return numero;
    if (!numero || nomeEhONumero(option)) return nome;
    return `${nome} - ${numero}`;
  };

  // Agora a lista mostra conexões de todos os canais juntas, então o nome
  // sozinho pode não bastar pra saber por onde a mensagem vai sair.
  const NOMES_DE_CANAL = {
    whatsapp: "WhatsApp",
    wacalls: "WhatsApp Plus",
    whatsapp_oficial: "WhatsApp Oficial",
    facebook: "Facebook",
    instagram: "Instagram",
    telegram: "Telegram",
    webchat: "Webchat",
    zapi: "Z-API",
  };

  const rotuloDaConexao = (whatsapp) => {
    const canal = NOMES_DE_CANAL[whatsapp?.channel];
    return canal ? `${whatsapp.name} (${canal})` : whatsapp?.name || "";
  };

  const renderOption = (option) => {
    if (!option?.name && !option?.number) return "";

    const nome = String(option.name || "").trim();
    const numero = String(option.number || "").trim();
    const mostrarNumero = !!numero && !nomeEhONumero(option);

    return (
      <>
        {IconChannel(option.channel)}
        <div
          style={{
            marginLeft: "10px",
            display: "inline-flex",
            flexDirection: "column",
            justifyContent: "center",
            minWidth: 0,
          }}
        >
          <Typography component="span" style={{ fontSize: 14, lineHeight: 1.3 }}>
            {nome || numero}
          </Typography>
          {mostrarNumero && (
            <Typography
              component="span"
              style={{ fontSize: 12, lineHeight: 1.3, opacity: 0.7 }}
            >
              {numero}
            </Typography>
          )}
        </div>
      </>
    );
  };

  /**
   * Ao ligar a sincronização com a agenda (ou o Meet), a data/hora do
   * agendamento já vem sugerida — a próxima hora cheia — e o título do evento
   * vem do nome do contato. O evento no Google e o link do Meet usam
   * exatamente essa data/hora do agendamento, então não há nada a preencher
   * duas vezes. Valores já digitados nunca são sobrescritos.
   */
  const preencherDadosDoEvento = (values, setFieldValue) => {
    if (!values?.sendAt) {
      setFieldValue(
        "sendAt",
        moment().add(1, "hour").startOf("hour").format("YYYY-MM-DDTHH:mm")
      );
    }

    if (!values?.googleEventTitle) {
      const nome = currentContact?.name || "";
      if (nome) setFieldValue("googleEventTitle", nome);
    }

    if (!values?.googleEventDuration && googleConfig?.defaultDuration) {
      setFieldValue("googleEventDuration", googleConfig.defaultDuration);
    }
  };

  const handleSaveSchedule = async (values) => {

    const scheduleData = {
      ...values,
      userId: user.id,
      whatsappId: selectedWhatsapps,
      ticketUserId: selectedUser?.id || null,
      queueId: selectedQueue || null,
      intervalo: intervalo || 1,
      tipoDias: tipoDias || 4,
      // ✅ Incluir dados do lembrete
      reminderDate: values.reminderDate || null,
      // Google Agenda & Meet. Só manda ligado se houver conta conectada —
      // evita gravar googleSync=true numa empresa que desconectou o Google
      // depois, o que faria o backend tentar criar evento a cada save.
      googleSync: !!googleConfig?.connected && !!values.googleSync,
      googleMeet: !!googleConfig?.connected && !!values.googleMeet,
      googleEventTitle: values.googleEventTitle || null,
      googleEventDuration: Number(values.googleEventDuration) || null,
    };

    try {
      if (scheduleId) {
        await api.put(`/schedules/${scheduleId}`, scheduleData);
        if (attachment != null) {
          const formData = new FormData();
          formData.append("file", attachment);
          await api.post(`/schedules/${scheduleId}/media-upload`, formData);
        }
      } else {
        const { data } = await api.post("/schedules", scheduleData);
        if (attachment != null) {
          const formData = new FormData();
          formData.append("file", attachment);
          await api.post(`/schedules/${data.id}/media-upload`, formData);
        }
      }

      toast.success(i18n.t("scheduleModal.success"));

      if (typeof reload == "function") {
        reload();
      }

      if (contactId) {
        if (typeof cleanContact === "function") {
          cleanContact();
          history.push("/schedules");
        }
      }
    } catch (err) {
      toastError(err);
    }

    setCurrentContact(initialContact);
    setSchedule(initialState);
    // ✅ Reset dos campos de lembrete após salvar
    setSchedule(prevState => ({
      ...prevState,
      reminderDate: "",
    }));
    handleClose();
  };

  const handleClickMsgVar = async (msgVar, setValueFunc) => {
    const el = messageInputRef.current;
    const firstHalfText = el.value.substring(0, el.selectionStart);
    const secondHalfText = el.value.substring(el.selectionEnd);
    const newCursorPos = el.selectionStart + msgVar.length;

    setValueFunc("body", `${firstHalfText}${msgVar}${secondHalfText}`);

    await new Promise((r) => setTimeout(r, 100));
    messageInputRef.current.setSelectionRange(newCursorPos, newCursorPos);
  };

  // Função para lidar com seleção de resposta rápida
  const handleQuickMessageSelect = async (selectedMessage, setFieldValue) => {
    
    if (selectedMessage) {
      setFieldValue("body", selectedMessage.message || "");
      setQuickMessageSearch(selectedMessage.message || "");

      // Se a mensagem tem mídia, baixar e definir como attachment
      if (selectedMessage.mediaPath) {

        try {
          const mediaFile = await downloadQuickMessageMedia(
            selectedMessage.mediaPath,
            selectedMessage.mediaName,
            selectedMessage.mediaType
          );

          if (mediaFile) {
            setAttachment(mediaFile);
            setQuickMessageMedia({
              path: selectedMessage.mediaPath,
              name: selectedMessage.mediaName,
              type: selectedMessage.mediaType
            });
          }
        } catch (err) {
          console.error("❌ Erro ao processar mídia da quickMessage:", err);
        }
      } else {
        // Limpar mídia anterior se não há mídia na nova seleção
        setQuickMessageMedia(null);
        setAttachment(null);
        if (attachmentFile.current) {
          attachmentFile.current.value = null;
        }
      }
    }
  };

  const deleteMedia = async () => {
    if (attachment) {
      setAttachment(null);
      attachmentFile.current.value = null;
    }

    // Limpar mídia da quickMessage se existir
    if (quickMessageMedia) {
      setQuickMessageMedia(null);
    }

    if (schedule.mediaPath) {
      await api.delete(`/schedules/${schedule.id}/media-upload`);
      setSchedule((prev) => ({
        ...prev,
        mediaPath: null,
      }));
      toast.success(i18n.t("scheduleModal.toasts.deleted"));
      if (typeof reload == "function") {
        reload();
      }
    }
  };

  return (
    <div className={classes.root}>
      <ConfirmationModal
        title={i18n.t("scheduleModal.confirmationModal.deleteTitle")}
        open={confirmationOpen}
        onClose={() => setConfirmationOpen(false)}
        onConfirm={deleteMedia}
      >
        {i18n.t("scheduleModal.confirmationModal.deleteMessage")}
      </ConfirmationModal>
      <Dialog
        open={open}
        onClose={handleClose}
        maxWidth="md"
        fullWidth
        scroll="paper"
      >
        <DialogTitle id="form-dialog-title">
          {schedule.status === "ERRO"
            ? i18n.t("scheduleModalExtra.sendError")
            : i18n.t("scheduleModalExtra.messageStatus", { status: capitalize(schedule.status) })}
        </DialogTitle>
        <div style={{ display: "none" }}>
          <input
            type="file"
            accept=".png,.jpg,.jpeg"
            ref={attachmentFile}
            onChange={(e) => handleAttachmentFile(e)}
          />
        </div>
        <Formik
          initialValues={schedule}
          enableReinitialize={true}
          validationSchema={ScheduleSchema}
          onSubmit={(values, actions) => {
            setTimeout(() => {
              handleSaveSchedule(values);
              actions.setSubmitting(false);
            }, 400);
          }}
        >
          {({ touched, errors, isSubmitting, values, setFieldValue }) => (
            <Form>
              <DialogContent dividers>
                <Grid container spacing={1} alignItems="center">
                  <Grid item xs={12} md={4} xl={4}>
                    <div className={classes.multFieldLine}>
                      <FormControl variant="outlined" fullWidth>
                        <Autocomplete
                          fullWidth
                          size="small"
                          value={currentContact}
                          options={contacts}
                          onChange={(e, contact) => {
                            const contactId = contact ? contact.id : "";
                            setSchedule({ ...schedule, contactId });
                            setCurrentContact(contact ? contact : initialContact);
                            // Canais da família WhatsApp (Baileys, WhatsApp
                            // Plus/wacalls, Oficial) são intercambiáveis no
                            // agendamento, então não filtram a lista de
                            // conexões. Só Facebook/Instagram restringem.
                            const exclusiveChannels = ["facebook", "instagram"];
                            const nextChannel = contact && exclusiveChannels.includes(contact.channel)
                              ? contact.channel
                              : "";
                            setChannelFilter(nextChannel);

                          }}
                          getOptionLabel={rotuloDoContato}
                          renderOption={renderOption}
                          getOptionSelected={(option, value) => {
                            return value.id === option.id;
                          }}
                          renderInput={(params) => (
                            <TextField
                              {...params}
                              variant="outlined"
                              size="small"
                              placeholder={i18n.t("scheduleModalExtra.contactPlaceholder")}
                            />
                          )}
                        />
                      </FormControl>
                    </div>
                  </Grid>
                  <Grid item xs={12} md={4} xl={4}>
                    <FormControl
                      variant="outlined"
                      fullWidth
                      className={classes.formControl}
                    >
                      <InputLabel id="whatsapp-selection-label-top" shrink>
                        {i18n.t("campaigns.dialog.form.whatsapp")}
                      </InputLabel>
                      <Field
                        as={Select}
                        label={i18n.t("campaigns.dialog.form.whatsapp")}
                        labelId="whatsapp-selection-label-top"
                        id="whatsappIds"
                        name="whatsappIds"
                        required
                        error={touched.whatsappId && Boolean(errors.whatsappId)}
                        value={selectedWhatsapps}
                        onChange={(event) =>
                          setSelectedWhatsapps(event.target.value)
                        }
                      >
                        {whatsapps &&
                          whatsapps.map((whatsapp) => (
                            <MenuItem key={whatsapp.id} value={whatsapp.id}>
                              {rotuloDaConexao(whatsapp)}
                            </MenuItem>
                          ))}
                      </Field>
                    </FormControl>
                  </Grid>
                  <Grid item xs={12} md={4} xl={4}>
                    <Field
                      as={TextField}
                      label={i18n.t("scheduleModal.form.sendAt")}
                      type="datetime-local"
                      name="sendAt"
                      error={touched.sendAt && Boolean(errors.sendAt)}
                      helperText={touched.sendAt && errors.sendAt}
                      variant="outlined"
                      fullWidth
                      size="small"
                      InputLabelProps={{ shrink: true }}
                    />
                  </Grid>
                </Grid>
                <div className={classes.multFieldLine}>
                  <Field
                    as={TextField}
                    rows={9}
                    multiline={true}
                    label={i18n.t("scheduleModal.form.body")}
                    name="body"
                    inputRef={messageInputRef}
                    error={touched.body && Boolean(errors.body)}
                    helperText={touched.body && errors.body}
                    variant="outlined"
                    margin="dense"
                    fullWidth
                  />
                </div>

                {/* Campo de Busca de Respostas Rápidas */}
                <div className={classes.multFieldLine}>
                  <TextField
                    variant="outlined"
                    fullWidth
                    margin="dense"
                    label={i18n.t("ticketInfo.quickMessages")}
                    placeholder={i18n.t("scheduleModalExtra.quickMessageSearch")}
                    value={quickMessageSearch}
                    onChange={(e) => {
                      setQuickMessageSearch(e.target.value);
                      if (e.target.value.trim() === "") {
                        setShowAllQuickMessages(false);
                      }
                    }}
                    onFocus={() => {
                      if (quickMessageSearch.trim() === "" && !showAllQuickMessages) {
                        setShowAllQuickMessages(true);
                      }
                    }}
                    onClick={() => {
                      if (quickMessageSearch.trim() === "" && !showAllQuickMessages) {
                        setShowAllQuickMessages(true);
                      }
                    }}
                    disabled={loadingQuickMessages}
                    InputProps={{
                      startAdornment: <FlashOn style={{ marginRight: '8px', color: '#1976d2' }} />,
                    }}
                  />
                  
                  {/* Lista de sugestões */}
                  {((quickMessageSearch && filteredQuickMessages.length > 0) || (showAllQuickMessages && filteredQuickMessages.length > 0)) && (
                    <div style={{ 
                      maxHeight: '200px', 
                      overflowY: 'auto', 
                      border: '1px solid #e0e0e0', 
                      borderRadius: '4px', 
                      marginTop: '4px',
                      backgroundColor: 'white',
                      zIndex: 1000,
                      position: 'relative'
                    }}>
                      {filteredQuickMessages.map((quickMessage) => (
                        <div
                          key={quickMessage.id}
                          onClick={() => handleQuickMessageSelect(quickMessage, setFieldValue)}
                          style={{
                            padding: '12px',
                            cursor: 'pointer',
                            borderBottom: '1px solid #f0f0f0',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px'
                          }}
                          onMouseEnter={(e) => e.target.style.backgroundColor = '#f5f5f5'}
                          onMouseLeave={(e) => e.target.style.backgroundColor = 'white'}
                        >
                          <FlashOn style={{ fontSize: '16px', color: '#1976d2' }} />
                          <div style={{ flex: 1 }}>
                            <div style={{ fontWeight: 'bold', fontSize: '14px' }}>
                              {quickMessage.shortcode}
                            </div>
                            <div style={{ 
                              fontSize: '12px', 
                              color: '#666', 
                              maxWidth: '300px', 
                              overflow: 'hidden', 
                              textOverflow: 'ellipsis', 
                              whiteSpace: 'nowrap' 
                            }}>
                              {quickMessage.message}
                            </div>
                          </div>
                          {quickMessage.mediaPath && (
                            <AttachFile style={{ fontSize: '14px', color: '#666' }} />
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                  
                  {/* Mensagem quando não há resultados */}
                  {quickMessageSearch && filteredQuickMessages.length === 0 && !loadingQuickMessages && (
                    <div style={{ 
                      padding: '12px', 
                      textAlign: 'center', 
                      color: '#666', 
                      fontStyle: 'italic',
                      border: '1px solid #e0e0e0', 
                      borderRadius: '4px', 
                      marginTop: '4px'
                    }}>
                      {i18n.t("scheduleModalExtra.noQuickMessages")}
                    </div>
                  )}
                </div>

                <Grid item xs={12} md={12} xl={12}>
                  <MessageVariablesPicker
                    disabled={isSubmitting}
                    showSchedulingVars={true}
                    onClick={(value) => handleClickMsgVar(value, setFieldValue)}
                  />
                </Grid>
                <Grid container spacing={1} alignItems="center">
                  <Grid item xs={12} sm={6} md={3}>
                    <FormControl
                      variant="outlined"
                      margin="dense"
                      fullWidth
                      className={classes.formControl}
                    >
                      <InputLabel id="openTicket-selection-label">
                        {i18n.t("campaigns.dialog.form.openTicket")}
                      </InputLabel>
                      <Field
                        as={Select}
                        label={i18n.t("campaigns.dialog.form.openTicket")}
                        labelId="openTicket-selection-label"
                        id="openTicket"
                        name="openTicket"
                        error={touched.openTicket && Boolean(errors.openTicket)}
                      >
                        <MenuItem value={"enabled"}>
                          {i18n.t("campaigns.dialog.form.enabledOpenTicket")}
                        </MenuItem>
                        <MenuItem value={"disabled"}>
                          {i18n.t("campaigns.dialog.form.disabledOpenTicket")}
                        </MenuItem>
                      </Field>
                    </FormControl>
                  </Grid>

                  <Grid item xs={12} sm={6} md={3}>
                    <Autocomplete
                      variant="outlined"
                      margin="dense"
                      className={classes.formControl}
                      getOptionLabel={(option) => `${option.name}`}
                      value={isAdmin ? selectedUser : user}
                      size="small"
                      onChange={(e, newValue) => {
                        if (isAdmin) {
                          setSelectedUser(newValue);
                          if (newValue != null && Array.isArray(newValue.queues)) {
                            if (newValue.queues.length === 1) {
                              setSelectedQueue(newValue.queues[0].id);
                            }
                            setQueues(newValue.queues);
                          } else {
                            setQueues(allQueues);
                            setSelectedQueue("");
                          }
                        }
                      }}
                      options={isAdmin ? options : [user]}
                      filterOptions={filterOptions}
                      freeSolo={isAdmin}
                      fullWidth
                      disabled={values.openTicket === "disabled" || !isAdmin}
                      autoHighlight
                      noOptionsText={i18n.t("transferTicketModal.noOptions")}
                      loading={loading}
                      renderOption={(option) => (
                        <span>
                          {" "}
                          <UserStatusIcon user={option} /> {option.name}
                        </span>
                      )}
                      renderInput={(params) => (
                        <TextField
                          {...params}
                          label={i18n.t("transferTicketModal.fieldLabel")}
                          variant="outlined"
                          margin="dense"
                          size="small"
                          onChange={isAdmin ? (e) => setSearchParam(e.target.value) : undefined}
                          InputProps={{
                            ...params.InputProps,
                            endAdornment: (
                              <React.Fragment>
                                {loading ? (
                                  <CircularProgress color="inherit" size={20} />
                                ) : null}
                                {params.InputProps.endAdornment}
                              </React.Fragment>
                            ),
                            readOnly: !isAdmin,
                          }}
                        />
                      )}
                    />
                  </Grid>

                  <Grid item xs={12} sm={6} md={3}>
                    <FormControl
                      variant="outlined"
                      margin="dense"
                      fullWidth
                      className={classes.formControl}
                    >
                      <InputLabel>
                        {i18n.t("transferTicketModal.fieldQueueLabel")}
                      </InputLabel>
                      <Select
                        value={selectedQueue}
                        onChange={(e) => setSelectedQueue(e.target.value)}
                        label={i18n.t("transferTicketModal.fieldQueuePlaceholder")}
                        disabled={values.openTicket === "disabled"}
                      >
                        {queues.map((queue) => (
                          <MenuItem key={queue.id} value={queue.id}>
                            {queue.name}
                          </MenuItem>
                        ))}
                      </Select>
                    </FormControl>
                  </Grid>

                  <Grid item xs={12} sm={6} md={3}>
                    <FormControl
                      variant="outlined"
                      margin="dense"
                      fullWidth
                      className={classes.formControl}
                    >
                      <InputLabel id="statusTicket-selection-label">
                        {i18n.t("campaigns.dialog.form.statusTicket")}
                      </InputLabel>
                      <Field
                        as={Select}
                        disabled={values.openTicket === "disabled"}
                        label={i18n.t("campaigns.dialog.form.statusTicket")}
                        labelId="statusTicket-selection-label"
                        id="statusTicket"
                        name="statusTicket"
                        error={touched.statusTicket && Boolean(errors.statusTicket)}
                      >
                        <MenuItem value={"closed"}>
                          {i18n.t("campaigns.dialog.form.closedTicketStatus")}
                        </MenuItem>
                        <MenuItem value={"open"}>
                          {i18n.t("campaigns.dialog.form.openTicketStatus")}
                        </MenuItem>
                      </Field>
                    </FormControl>
                  </Grid>

                  <Grid item xs={12}>
                    <FormControlLabel
                      control={
                        <Field
                          as={Switch}
                          color="primary"
                          name="assinar"
                          checked={values.assinar}
                          disabled={values.openTicket === "disabled"}
                        />
                      }
                      label={i18n.t("scheduleModal.form.assinar")}
                    />
                  </Grid>
                </Grid>
                <br />
                <Grid container spacing={1}>
                  {/* Seção de Lembrete */}
                  <h3>{i18n.t("scheduleModalExtra.reminder")}</h3>
                  <p>{i18n.t("scheduleModalExtra.reminderDescription")}</p>
                  <br />
                  <Grid container spacing={1}>
                    <Grid item xs={12} md={6} xl={6}>
                      <Field
                        as={TextField}
                        label={i18n.t("scheduleModalExtra.reminderDate")}
                        type="datetime-local"
                        name="reminderDate"
                        error={touched.reminderDate && Boolean(errors.reminderDate)}
                        helperText={touched.reminderDate && errors.reminderDate}
                        variant="outlined"
                        fullWidth
                        size="small"
                        InputLabelProps={{ shrink: true }}
                      />
                    </Grid>
                    <Grid item xs={12} md={6} xl={6}>
                      <Typography variant="body2" color="textSecondary" style={{ padding: '16px', backgroundColor: '#f5f5f5', borderRadius: '4px', marginTop: '8px' }}>
                        {i18n.t("scheduleModalExtra.reminderNote")}
                      </Typography>
                    </Grid>
                  </Grid>
                </Grid>
                <br />

                {/* ── Integração Google Agenda & Meet ──────────────────────
                    O bloco aparece SEMPRE.
                    
                    Antes ele só era renderizado quando havia conta conectada,
                    e o efeito prático foi ruim: quem ainda não tinha ligado o
                    Google não via nada e não tinha como descobrir que a
                    funcionalidade existia. Agora, sem conta, o bloco aparece
                    com os controles desabilitados e um atalho direto para a
                    tela de conexão. */}
                {(
                  <>
                    <Paper
                      variant="outlined"
                      style={{ padding: 16, marginBottom: 16, borderRadius: 8 }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "space-between",
                          flexWrap: "wrap",
                          gap: 8,
                          marginBottom: 12,
                        }}
                      >
                        <Typography
                          variant="subtitle1"
                          style={{ display: "flex", alignItems: "center", gap: 8, fontWeight: 600 }}
                        >
                          <EventIcon fontSize="small" color="primary" />
                          {i18n.t("scheduleGoogle.title")}
                        </Typography>
                        {googleConfig?.connected ? (
                          <Typography variant="body2" style={{ color: "#2e7d32" }}>
                            ✓ {i18n.t("scheduleGoogle.connectedAs")} {googleConfig.googleEmail}
                          </Typography>
                        ) : (
                          <Button
                            size="small"
                            variant="outlined"
                            color="primary"
                            onClick={() => window.open("/google-calendar", "_blank", "noopener")}
                          >
                            {i18n.t("scheduleGoogle.connectAccount")}
                          </Button>
                        )}
                      </div>

                      {!googleConfig?.connected && (
                        <Typography
                          variant="body2"
                          color="textSecondary"
                          style={{ marginBottom: 8 }}
                        >
                          {i18n.t("scheduleGoogle.notConnectedHint")}
                        </Typography>
                      )}

                      <Grid container spacing={1}>
                        <Grid item xs={12} md={6}>
                          <FormControlLabel
                            control={
                              <Switch
                                checked={!!values.googleSync}
                                onChange={(e) => {
                                  setFieldValue("googleSync", e.target.checked);
                                  if (e.target.checked)
                                    preencherDadosDoEvento(values, setFieldValue);
                                }}
                                color="primary"
                                disabled={!googleConfig?.connected}
                              />
                            }
                            label={i18n.t("scheduleGoogle.syncCalendar")}
                          />
                        </Grid>
                        <Grid item xs={12} md={6}>
                          <FormControlLabel
                            control={
                              <Switch
                                checked={!!values.googleMeet}
                                onChange={(e) => {
                                  setFieldValue("googleMeet", e.target.checked);
                                  if (e.target.checked)
                                    preencherDadosDoEvento(values, setFieldValue);
                                }}
                                color="primary"
                                /* Meet sem evento na agenda não existe: o link
                                   é criado junto do evento. Por isso o toggle
                                   fica travado enquanto a sincronização
                                   estiver desligada. */
                                disabled={!googleConfig?.connected || !values.googleSync}
                              />
                            }
                            label={i18n.t("scheduleGoogle.generateMeet")}
                          />
                        </Grid>
                      </Grid>

                      {values.googleSync && (
                        <Grid container spacing={1} style={{ marginTop: 4 }}>
                          <Grid item xs={12} md={8}>
                            <Field
                              as={TextField}
                              label={i18n.t("scheduleGoogle.eventTitle")}
                              name="googleEventTitle"
                              variant="outlined"
                              fullWidth
                              size="small"
                              placeholder={i18n.t("scheduleGoogle.eventTitlePlaceholder")}
                            />
                          </Grid>
                          <Grid item xs={12} md={4}>
                            <FormControl size="small" fullWidth variant="outlined">
                              <InputLabel>{i18n.t("scheduleGoogle.duration")}</InputLabel>
                              <Select
                                value={values.googleEventDuration || 30}
                                onChange={(e) =>
                                  setFieldValue("googleEventDuration", e.target.value)
                                }
                                label={i18n.t("scheduleGoogle.duration")}
                              >
                                <MenuItem value={15}>15 {i18n.t("scheduleGoogle.minutes")}</MenuItem>
                                <MenuItem value={30}>30 {i18n.t("scheduleGoogle.minutes")}</MenuItem>
                                <MenuItem value={45}>45 {i18n.t("scheduleGoogle.minutes")}</MenuItem>
                                <MenuItem value={60}>1 {i18n.t("scheduleGoogle.hour")}</MenuItem>
                                <MenuItem value={90}>1h30 {i18n.t("scheduleGoogle.minutes")}</MenuItem>
                                <MenuItem value={120}>2 {i18n.t("scheduleGoogle.hours")}</MenuItem>
                              </Select>
                            </FormControl>
                          </Grid>
                        </Grid>
                      )}

                      {/* O link só existe DEPOIS de salvar: quem cria a sala
                          é o Google, na criação do evento. Antes disso não há
                          o que mostrar. */}
                      {schedule.googleMeetLink && (
                        <div
                          style={{
                            marginTop: 12,
                            padding: 12,
                            borderRadius: 6,
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            flexWrap: "wrap",
                            gap: 8,
                          }}
                        >
                          <Typography
                            variant="body2"
                            component="a"
                            href={schedule.googleMeetLink}
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{ wordBreak: "break-all" }}
                          >
                            📹 {schedule.googleMeetLink}
                          </Typography>
                          <div style={{ display: "flex", gap: 8 }}>
                            <Button
                              size="small"
                              variant="outlined"
                              startIcon={<FileCopyIcon fontSize="small" />}
                              onClick={() => {
                                navigator.clipboard
                                  ?.writeText(schedule.googleMeetLink)
                                  .then(() => {
                                    setMeetLinkCopiado(true);
                                    setTimeout(() => setMeetLinkCopiado(false), 2000);
                                  })
                                  .catch(() => {});
                              }}
                            >
                              {meetLinkCopiado
                                ? i18n.t("scheduleGoogle.copied")
                                : i18n.t("scheduleGoogle.copyLink")}
                            </Button>
                            <Button
                              size="small"
                              variant="outlined"
                              color="primary"
                              startIcon={<OpenInNewIcon fontSize="small" />}
                              onClick={() =>
                                window.open(schedule.googleMeetLink, "_blank", "noopener")
                              }
                            >
                              {i18n.t("scheduleGoogle.openMeet")}
                            </Button>
                          </div>
                        </div>
                      )}
                    </Paper>
                  </>
                )}

                <h3>{i18n.t("recurrenceSection.title")}</h3>
                <p>{i18n.t("recurrenceSection.description")}</p>
                <br />
                <Grid container spacing={1}>
                  <Grid item xs={12} md={4} xl={4}>
                    <FormControl size="small" fullWidth variant="outlined">
                      <InputLabel id="demo-simple-select-label">
                        {i18n.t("recurrenceSection.labelInterval")}
                      </InputLabel>
                      <Select
                        labelId="demo-simple-select-label"
                        id="demo-simple-select"
                        value={intervalo}
                        onChange={(e) => setIntervalo(e.target.value || 1)}
                        label={i18n.t("recurrenceSection.labelInterval")}
                      >
                        <MenuItem value={1}>
                          {i18n.t("recurrenceSection.options.days")}
                        </MenuItem>
                        <MenuItem value={2}>
                          {i18n.t("recurrenceSection.options.weeks")}
                        </MenuItem>
                        <MenuItem value={3}>
                          {i18n.t("recurrenceSection.options.months")}
                        </MenuItem>
                        <MenuItem value={4}>
                          {i18n.t("recurrenceSection.options.minutes")}
                        </MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>

                  <Grid item xs={12} md={4} xl={4}>
                    <Field
                      as={TextField}
                      label={i18n.t("recurrenceSection.intervalFilterValue")}
                      name="valorIntervalo"
                      size="small"
                      error={
                        touched.valorIntervalo && Boolean(errors.valorIntervalo)
                      }
                      InputLabelProps={{ shrink: true }}
                      variant="outlined"
                      fullWidth
                    />
                  </Grid>
                  <Grid item xs={12} md={4} xl={4}>
                    <Field
                      as={TextField}
                      label={i18n.t("recurrenceSection.sendAsManyTimes")}
                      name="enviarQuantasVezes"
                      size="small"
                      error={
                        touched.enviarQuantasVezes &&
                        Boolean(errors.enviarQuantasVezes)
                      }
                      variant="outlined"
                      fullWidth
                    />
                  </Grid>
                  <Grid item xs={12} md={12} xl={12}>
                    <FormControl size="small" fullWidth variant="outlined">
                      <InputLabel id="demo-simple-select-label">
                        {i18n.t("recurrenceSection.sendAsManyTimes")}
                      </InputLabel>
                      <Select
                        labelId="demo-simple-select-label"
                        id="demo-simple-select"
                        value={tipoDias}
                        onChange={(e) => setTipoDias(e.target.value || 4)}
                        label="Enviar quantas vezes"
                      >
                        <MenuItem value={4}>
                          {i18n.t(
                            "recurrenceSection.shipNormallyOnNonbusinessDays"
                          )}
                        </MenuItem>
                        <MenuItem value={5}>
                          {i18n.t("recurrenceSection.sendOneBusinessDayBefore")}
                        </MenuItem>
                        <MenuItem value={6}>
                          {" "}
                          {i18n.t("recurrenceSection.sendOneBusinessDayLater")}
                        </MenuItem>
                      </Select>
                    </FormControl>
                  </Grid>
                </Grid>
                {(schedule.mediaPath || attachment || quickMessageMedia) && (
                  <Grid xs={12} item>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <Button startIcon={<AttachFile />}>
                        {attachment ? attachment.name :
                          quickMessageMedia ? quickMessageMedia.name :
                            schedule.mediaName}
                      </Button>
                      {quickMessageMedia && (
                        <Chip
                          label={i18n.t("scheduleModalExtra.fromQuickReply")}
                          size="small"
                          color="primary"
                          variant="outlined"
                        />
                      )}
                      <IconButton
                        onClick={() => setConfirmationOpen(true)}
                        color="secondary"
                      >
                        <DeleteOutline color="secondary" />
                      </IconButton>
                    </div>
                  </Grid>
                )}
              </DialogContent>
              <DialogActions>
                {!attachment && !schedule.mediaPath && !quickMessageMedia && (
                  <Button
                    color="primary"
                    onClick={() => attachmentFile.current.click()}
                    disabled={isSubmitting}
                    variant="outlined"
                  >
                    {i18n.t("quickMessages.buttons.attach")}
                  </Button>
                )}
                <Button
                  onClick={handleClose}
                  color="secondary"
                  disabled={isSubmitting}
                  variant="outlined"
                >
                  {i18n.t("scheduleModal.buttons.cancel")}
                </Button>
                {(schedule.sentAt === null || schedule.sentAt === "") && (
                  <Button
                    type="submit"
                    color="primary"
                    disabled={isSubmitting}
                    variant="contained"
                    className={classes.btnWrapper}
                  >
                    {scheduleId
                      ? `${i18n.t("scheduleModal.buttons.okEdit")}`
                      : `${i18n.t("scheduleModal.buttons.okAdd")}`}
                    {isSubmitting && (
                      <CircularProgress
                        size={24}
                        className={classes.buttonProgress}
                      />
                    )}
                  </Button>
                )}
              </DialogActions>
            </Form>
          )}
        </Formik>
      </Dialog>
    </div>
  );
};

export default ScheduleModal;