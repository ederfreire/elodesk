import React, { useContext, useEffect, useMemo, useRef, useState } from "react";
import { makeStyles, useTheme } from "@material-ui/core/styles";
import {
  Dialog, DialogContent, Box, IconButton, List, ListItem,
  ListItemText, ListItemAvatar, Avatar, Typography, MenuItem, Select,
  CircularProgress, Menu
} from "@material-ui/core";
import CallIcon from "@material-ui/icons/Call";
import CallMadeIcon from "@material-ui/icons/CallMade";
import CallReceivedIcon from "@material-ui/icons/CallReceived";
import CallMissedIcon from "@material-ui/icons/CallMissed";
import BackspaceOutlinedIcon from "@material-ui/icons/BackspaceOutlined";
import HistoryIcon from "@material-ui/icons/History";
import DialpadIcon from "@material-ui/icons/Dialpad";
import CloseIcon from "@material-ui/icons/Close";
import RemoveIcon from "@material-ui/icons/Remove";
import DragIndicatorIcon from "@material-ui/icons/DragIndicator";
import ReportProblemOutlinedIcon from "@material-ui/icons/ReportProblemOutlined";
import ExpandMoreIcon from "@material-ui/icons/ExpandMore";
import VideocamOffOutlinedIcon from "@material-ui/icons/VideocamOffOutlined";
import VideocamOutlinedIcon from "@material-ui/icons/VideocamOutlined";
import { useWaCalls } from "../../context/WaCalls/WaCallsContext";
import { i18n } from "../../translate/i18n";
import { AuthContext } from "../../context/Auth/AuthContext";
import { WhatsAppsContext } from "../../context/WhatsApp/WhatsAppsContext";
import {
  CANAL,
  canaisDisponiveis,
  canalInicial,
  canalTemVideo,
  discarRamal,
  discarOficial
} from "../../services/telefonia";

const KEYS = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "*", "0", "#"];

// Lista curta — cobre os países mais comuns pra base de clientes BR. O
// usuário sempre pode digitar o número já com o DDI se precisar de outro
// país fora da lista (o código só é um prefixo aplicado no disque).
const COUNTRIES = [
  { code: "55", flag: "🇧🇷", label: "Brasil" },
  { code: "1", flag: "🇺🇸", label: "EUA/Canadá" },
  { code: "351", flag: "🇵🇹", label: "Portugal" },
  { code: "54", flag: "🇦🇷", label: "Argentina" },
  { code: "34", flag: "🇪🇸", label: "Espanha" },
];

// Laranja/terracota — cor de destaque do app, igual os ícones da barra
// superior. Fica igual nos dois temas, só o "fundo/superfície" muda.
const ORANGE = "#e2793d";
const ORANGE_DARK = "#c05621";
const DANGER = "#f15c6d";

// O discador antes era sempre escuro, mesmo com o app no tema claro —
// ficava destoando. Agora segue o mesmo `theme.mode` usado no resto do app
// (ver TicketHeader), com uma paleta própria pra cada modo.
const getColors = (isDark) =>
  isDark
    ? {
        BG: "#141414",
        CARD: "#161616",
        SURFACE: "#232323",
        SURFACE_HOVER: "#2c2c2c",
        SURFACE_ACTIVE: "#333333",
        TEXT: "#f2f0ed",
        TEXT_MUTED: "#8a8a86",
        BORDER: "rgba(255,255,255,0.08)",
        SHADOW: "0 24px 60px rgba(0,0,0,0.6)",
      }
    : {
        BG: "#f2f2f0",
        CARD: "#ffffff",
        SURFACE: "#f0f0ee",
        SURFACE_HOVER: "#e6e6e3",
        SURFACE_ACTIVE: "#dcdcd8",
        TEXT: "#1c1c1a",
        TEXT_MUTED: "#6f6f6a",
        BORDER: "rgba(0,0,0,0.08)",
        SHADOW: "0 24px 60px rgba(0,0,0,0.16)",
      };

const useStyles = makeStyles((theme) => {
  const c = getColors(theme.mode === "dark");
  return {
    dialogPaper: {
      borderRadius: 20,
      overflow: "hidden",
      maxWidth: 340,
      width: "100%",
      margin: 16,
      background: c.CARD,
      border: `1px solid ${c.BORDER}`,
      boxShadow: c.SHADOW,
    },
    header: {
      background: c.BG,
      padding: "12px 10px 12px 14px",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      borderBottom: `1px solid ${c.BORDER}`,
    },
    headerLeft: {
      display: "flex",
      alignItems: "center",
      gap: 8,
    },
    dragDots: {
      color: c.TEXT_MUTED,
      fontSize: 18,
    },
    headerTitle: {
      color: c.TEXT,
      fontWeight: 600,
      fontSize: "0.95rem",
    },
    headerActions: {
      display: "flex",
      alignItems: "center",
      gap: 2,
    },
    headerIconBtn: {
      color: c.TEXT_MUTED,
      padding: 6,
      "&:hover": { color: c.TEXT, backgroundColor: c.SURFACE },
    },
    content: {
      padding: "14px 16px 20px",
      background: c.CARD,
    },
    tabsWrapper: {
      display: "flex",
      background: c.BG,
      borderRadius: 12,
      padding: 3,
      marginBottom: 14,
      border: `1px solid ${c.BORDER}`,
    },
    tabButton: {
      flex: 1,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 6,
      padding: "8px 0",
      borderRadius: 9,
      fontSize: "0.8rem",
      fontWeight: 600,
      cursor: "pointer",
      border: "none",
      transition: "all 0.18s ease",
      color: c.TEXT_MUTED,
      background: "transparent",
    },
    tabButtonActive: {
      background: c.SURFACE,
      color: c.TEXT,
    },
    warningBanner: {
      display: "flex",
      alignItems: "center",
      gap: 8,
      padding: "9px 12px",
      borderRadius: 10,
      marginBottom: 14,
      background: "rgba(226,121,61,0.10)",
      border: "1px solid rgba(226,121,61,0.35)",
      color: ORANGE,
    },
    sessionSelect: {
      width: "100%",
      marginBottom: 12,
      color: c.TEXT,
      "& .MuiSelect-root": {
        padding: "8px 12px",
        fontSize: "0.82rem",
        borderRadius: 10,
        background: c.SURFACE,
      },
      "& .MuiSelect-icon": { color: c.TEXT_MUTED },
      "& .MuiOutlinedInput-notchedOutline": { borderColor: c.BORDER },
      "&:hover .MuiOutlinedInput-notchedOutline": { borderColor: ORANGE },
    },
    numberRow: {
      display: "flex",
      gap: 8,
      marginBottom: 16,
    },
    countryBtn: {
      display: "flex",
      alignItems: "center",
      gap: 2,
      padding: "0 10px",
      borderRadius: 12,
      background: c.SURFACE,
      border: `1px solid ${c.BORDER}`,
      cursor: "pointer",
      color: c.TEXT,
      fontSize: "1.1rem",
      minWidth: 58,
      justifyContent: "center",
    },
    numberBox: {
      flex: 1,
      display: "flex",
      alignItems: "center",
      padding: "0 6px 0 14px",
      borderRadius: 12,
      background: c.SURFACE,
      border: `1px solid ${c.BORDER}`,
      minHeight: 46,
    },
    numberInput: {
      flex: 1,
      fontSize: "1.05rem",
      fontWeight: 500,
      color: c.TEXT,
      letterSpacing: 0.5,
      border: "none",
      outline: "none",
      background: "transparent",
      fontFamily: "inherit",
      minWidth: 0,
      "&::placeholder": {
        color: c.TEXT_MUTED,
        fontSize: "0.85rem",
        fontWeight: 400,
        letterSpacing: "normal",
      },
    },
    backspaceBtn: {
      color: c.TEXT_MUTED,
      "&:hover": { color: c.TEXT, backgroundColor: c.SURFACE_HOVER },
    },
    keypad: {
      display: "grid",
      gridTemplateColumns: "repeat(3, 1fr)",
      gap: 10,
      marginBottom: 16,
    },
    keyBtn: {
      width: "100%",
      height: 54,
      borderRadius: 16,
      border: `1px solid ${c.BORDER}`,
      background: c.SURFACE,
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      cursor: "pointer",
      transition: "background 0.12s ease, transform 0.08s ease",
      "&:hover": { background: c.SURFACE_HOVER },
      "&:active": { background: c.SURFACE_ACTIVE, transform: "scale(0.96)" },
    },
    keyNumber: {
      fontSize: "1.15rem",
      fontWeight: 600,
      color: c.TEXT,
      lineHeight: 1,
    },
    audioOnlyRow: {
      display: "flex",
      justifyContent: "center",
      marginBottom: 16,
    },
    audioOnlyPill: {
      display: "flex",
      alignItems: "center",
      gap: 6,
      padding: "6px 14px",
      borderRadius: 20,
      border: `1px solid ${c.BORDER}`,
      background: c.SURFACE,
      color: c.TEXT_MUTED,
      fontSize: "0.75rem",
      fontWeight: 600,
      cursor: "default",
    },
    // Mesmo pill, mas clicável — vira o toggle de vídeo quando o canal é
    // WhatsApp e o navegador suporta WebCodecs (ver isVideoCallSupported em
    // wacallsWebRTC.js). Estado "ativo" pega a cor laranja do app.
    videoTogglePill: {
      display: "flex",
      alignItems: "center",
      gap: 6,
      padding: "6px 14px",
      borderRadius: 20,
      border: `1px solid ${c.BORDER}`,
      background: c.SURFACE,
      color: c.TEXT_MUTED,
      fontSize: "0.75rem",
      fontWeight: 600,
      cursor: "pointer",
      transition: "all 0.15s ease",
      "&:hover": { background: c.SURFACE_HOVER },
    },
    videoTogglePillActive: {
      background: "rgba(226,121,61,0.14)",
      border: `1px solid ${ORANGE}`,
      color: ORANGE,
    },
    callBtn: {
      width: "100%",
      height: 50,
      borderRadius: 25,
      border: "none",
      background: `linear-gradient(135deg, ${ORANGE} 0%, ${ORANGE_DARK} 100%)`,
      color: "#fff",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      gap: 8,
      fontSize: "0.95rem",
      fontWeight: 700,
      cursor: "pointer",
      boxShadow: "0 6px 18px rgba(226,121,61,0.35)",
      transition: "transform 0.08s ease, opacity 0.15s ease",
      "&:hover": { transform: "translateY(-1px)" },
      "&:active": { transform: "scale(0.98)" },
      "&:disabled": {
        background: c.SURFACE,
        boxShadow: "none",
        cursor: "default",
        color: c.TEXT_MUTED,
      },
    },
    historyList: {
      maxHeight: 340,
      overflowY: "auto",
    },
    historyItem: {
      borderRadius: 12,
      marginBottom: 4,
      "&:hover": { background: c.SURFACE },
    },
    historyAvatar: {
      background: c.SURFACE,
      color: c.TEXT,
      fontWeight: 600,
    },
    emptyState: {
      display: "flex",
      flexDirection: "column",
      alignItems: "center",
      padding: "40px 0",
      color: c.TEXT_MUTED,
    },
  };
});

const directionMeta = (status, direction) => {
  const s = String(status || "").toLowerCase();
  if (s === "missed" || s === "no-answer" || s === "no_answer") {
    return { icon: <CallMissedIcon style={{ fontSize: 16 }} />, color: DANGER };
  }
  if (direction === "out" || direction === "outgoing") {
    return { icon: <CallMadeIcon style={{ fontSize: 16 }} />, color: ORANGE };
  }
  return { icon: <CallReceivedIcon style={{ fontSize: 16 }} />, color: ORANGE };
};

const DialerModal = () => {
  const classes = useStyles();
  const theme = useTheme();
  const c = getColors(theme.mode === "dark");
  const { dialerOpen, closeDialer, sessions, dial, dialSip, history, loadHistory, videoCallSupported, sipTrunkEnabled } = useWaCalls();
  const [tab, setTab] = useState(0);
  // "whatsapp" (padrão, via sessão pareada) ou "sip" (troncal SIP/baresip —
  // ver WacallsSipManager no wacalls-chat). SIP não usa sessão nem prefixo de
  // DDI automático: disca exatamente os dígitos informados, igual um
  // telefone/ramal PABX normal.
  const { socket } = useContext(AuthContext);
  const { whatsApps } = useContext(WhatsAppsContext);
  // Ramais da empresa. Chegam pelo mesmo evento que alimenta o painel de
  // ramais; aqui servem só pra decidir se o canal aparece e pra listar os
  // colegas disponíveis.
  const [ramais, setRamais] = useState([]);
  const [callChannel, setCallChannel] = useState(null);
  // Só existe pra canal "whatsapp" — troncal SIP não carrega vídeo (ver
  // comentário em openSipAudio, wacallsWebRTC.js). Reseta pra false sempre
  // que o discador abre ou o canal muda, pra não "vazar" o estado de uma
  // ligação anterior.
  const [videoEnabled, setVideoEnabled] = useState(false);
  const [number, setNumber] = useState("");
  const [sessionId, setSessionId] = useState("");
  const [dialing, setDialing] = useState(false);
  const [dialError, setDialError] = useState("");
  const [country, setCountry] = useState(COUNTRIES[0]);
  const [countryAnchor, setCountryAnchor] = useState(null);
  const numberInputRef = useRef(null);
  // Preenchido ao selecionar um contato em "Recentes" — guarda o remoteJid
  // real (com @lid quando o contato só existe assim no WhatsApp) pra discar
  // direto por ele, sem passar pelo prefixo de DDI (que só faz sentido pra
  // telefone normal — grudar "+55" na frente de um LID de 15 dígitos disca
  // pra um número que não existe e a ligação nem toca). Também mostra
  // nome/foto reais em vez do JID cru.
  const [pickedContact, setPickedContact] = useState(null);

  // Arrastar o discador pelo header — antes ele ficava fixo sempre no
  // centro da tela (comportamento padrão do Dialog do MUI), atrapalhando
  // quem quer ver a conversa por trás enquanto liga. `dragOffset` é
  // aplicado como transform no Paper do Dialog; o Dialog continua
  // centralizado por padrão (offset 0,0) e só se desloca depois que o
  // usuário arrasta pelo cabeçalho.
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const dragStateRef = useRef({ dragging: false, startX: 0, startY: 0, baseX: 0, baseY: 0 });

  useEffect(() => {
    if (dialerOpen) return;
    setDragOffset({ x: 0, y: 0 });
  }, [dialerOpen]);

  const handleDragMove = (e) => {
    if (!dragStateRef.current.dragging) return;
    if (e.cancelable) e.preventDefault();
    const point = e.touches ? e.touches[0] : e;
    setDragOffset({
      x: dragStateRef.current.baseX + (point.clientX - dragStateRef.current.startX),
      y: dragStateRef.current.baseY + (point.clientY - dragStateRef.current.startY),
    });
  };

  const handleDragEnd = () => {
    dragStateRef.current.dragging = false;
    window.removeEventListener("mousemove", handleDragMove);
    window.removeEventListener("mouseup", handleDragEnd);
    window.removeEventListener("touchmove", handleDragMove);
    window.removeEventListener("touchend", handleDragEnd);
  };

  const handleDragStart = (e) => {
    // Clique nos botões de minimizar/fechar não deve iniciar o arrasto.
    if (e.target.closest && e.target.closest("button")) return;
    const point = e.touches ? e.touches[0] : e;
    dragStateRef.current = {
      dragging: true,
      startX: point.clientX,
      startY: point.clientY,
      baseX: dragOffset.x,
      baseY: dragOffset.y,
    };
    window.addEventListener("mousemove", handleDragMove);
    window.addEventListener("mouseup", handleDragEnd);
    window.addEventListener("touchmove", handleDragMove, { passive: false });
    window.addEventListener("touchend", handleDragEnd);
  };

  useEffect(() => {

    if (!dialerOpen) return;
    setTab(0);
    setVideoEnabled(false);
    setDialError("");
    if (!sessionId && sessions?.[0]?.id) setSessionId(sessions[0].id);
    loadHistory && loadHistory();
  }, [dialerOpen, sessions, sessionId, loadHistory]);

  // Lista de ramais, pelo mesmo evento que o painel de ramais usa. Só pede
  // enquanto o discador está aberto — não faz sentido consultar de fundo.
  useEffect(() => {
    if (!dialerOpen || !socket || typeof socket.on !== "function") return undefined;
    const aoListar = lista => setRamais(Array.isArray(lista) ? lista : []);
    socket.on("ramais:list", aoListar);
    socket.emit("ramais:list");
    const timer = setInterval(() => socket.emit("ramais:list"), 20000);
    return () => {
      clearInterval(timer);
      socket.off && socket.off("ramais:list", aoListar);
    };
  }, [dialerOpen, socket]);

  // Canais que o operador realmente pode usar agora.
  const canais = useMemo(
    () =>
      canaisDisponiveis({
        ramais,
        sessoesPlus: sessions,
        conexoes: whatsApps,
        sipHabilitado: sipTrunkEnabled
      }),
    [ramais, sessions, whatsApps, sipTrunkEnabled]
  );

  // Rede de segurança: se o canal selecionado sumir (conexão caiu, SIP
  // desligado, ramal removido), troca em vez de deixar o operador preso numa
  // opção que não existe mais.
  useEffect(() => {
    const escolhido = canalInicial(canais, callChannel);
    if (escolhido !== callChannel) setCallChannel(escolhido);
  }, [canais, callChannel]);

  // Conexões oficiais conectadas, para o seletor do canal API Oficial.
  const conexoesOficiais = useMemo(
    () =>
      (whatsApps || []).filter(
        w => w && w.channel === "whatsapp_oficial" && w.status === "CONNECTED"
      ),
    [whatsApps]
  );
  const [conexaoOficialId, setConexaoOficialId] = useState("");
  useEffect(() => {
    if (!conexaoOficialId && conexoesOficiais.length) {
      setConexaoOficialId(conexoesOficiais[0].id);
    }
  }, [conexoesOficiais, conexaoOficialId]);

  // Foca o campo assim que o discador abre (ou volta pra aba "Discador") pra
  // o teclado físico já funcionar sem precisar clicar no campo antes.
  useEffect(() => {
    if (dialerOpen && tab === 0) {
      const t = setTimeout(() => numberInputRef.current?.focus(), 50);
      return () => clearTimeout(t);
    }
  }, [dialerOpen, tab]);

  // Só dígitos e os símbolos que o teclado numérico do WhatsApp aceita (* e
  // #) — filtra tudo mais (letras, espaços, colar texto com pontuação etc).
  const sanitize = (raw) => String(raw || "").replace(/[^\d*#]/g, "");

  const append = (k) => {
    setDialError("");
    setPickedContact(null);
    setNumber((n) => n + k);
    numberInputRef.current?.focus();
  };
  const backspace = () => {
    setPickedContact(null);
    setNumber((n) => n.slice(0, -1));
    numberInputRef.current?.focus();
  };
  const handleNumberChange = (e) => {
    setDialError("");
    setPickedContact(null);
    setNumber(sanitize(e.target.value));
  };

  const handleDial = async () => {
    if (!number) return;
    setDialError("");
    setDialing(true);
    try {
      if (callChannel === CANAL.RAMAL) {
        // Ramal interno: o painel de ramais é quem tem o WebRTC e a lista de
        // colegas. O discador só pede a ligação; o painel se mostra sozinho.
        discarRamal(number, videoEnabled && canalTemVideo(CANAL.RAMAL, videoCallSupported));
      } else if (callChannel === CANAL.OFICIAL) {
        // Mesma ideia para a API Oficial: quem conduz é o painel oficial.
        discarOficial(number, conexaoOficialId);
      } else if (callChannel === CANAL.SIP) {
        // Troncal SIP: disca os dígitos exatamente como digitados (sem DDI
        // automático — pode ser ramal de PABX, número local do provedor
        // etc., quem decide o formato é o próprio trunk/PABX do usuário).
        await dialSip(number);
      } else {
        // Contato vindo de "Recentes": disca pelo remoteJid real (preserva
        // @lid). Número digitado na mão: telefone normal, prefixa com o DDI
        // selecionado, igual antes.
        const target = pickedContact?.remoteJid || `${country.code}${number}`;
        await dial(target, sessionId, { video: videoEnabled && videoCallSupported });
      }
      closeDialer();
    } catch (e) {
      setDialError(e?.response?.data?.error || e.message || i18n.t("dialer.dialFailed"));
    } finally {
      setDialing(false);
    }
  };

  const pickHistoryNumber = (h) => {
    const contact = h.contact || null;
    const digits = String(contact?.number || h.phone_to || h.number || "").replace(/\D/g, "");
    setNumber(digits);
    if (contact?.remoteJid) {
      setPickedContact({
        remoteJid: contact.remoteJid,
        name: contact.name || h.name || digits,
        avatar: contact.urlPicture || null,
        number: digits,
      });
    } else {
      setPickedContact(null);
    }
    setTab(0);
  };

  return (
    <Dialog
      open={!!dialerOpen}
      onClose={closeDialer}
      classes={{ paper: classes.dialogPaper }}
      PaperProps={{
        style: {
          backgroundColor: c.CARD,
          transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)`,
        },
      }}
    >
      <Box
        className={classes.header}
        onMouseDown={handleDragStart}
        onTouchStart={handleDragStart}
        style={{ cursor: "move", touchAction: "none" }}
      >
        <Box className={classes.headerLeft}>
          <DragIndicatorIcon className={classes.dragDots} fontSize="small" />
          <CallIcon style={{ color: ORANGE, fontSize: 18 }} />
          <Typography className={classes.headerTitle}>{i18n.t("dialer.title")}</Typography>
        </Box>
        <Box className={classes.headerActions}>
          <IconButton className={classes.headerIconBtn} size="small" onClick={closeDialer}>
            <RemoveIcon fontSize="small" />
          </IconButton>
          <IconButton className={classes.headerIconBtn} size="small" onClick={closeDialer}>
            <CloseIcon fontSize="small" />
          </IconButton>
        </Box>
      </Box>

      <DialogContent className={classes.content}>
        <Box className={classes.tabsWrapper}>
          <button
            type="button"
            className={`${classes.tabButton} ${tab === 0 ? classes.tabButtonActive : ""}`}
            onClick={() => setTab(0)}
          >
            <DialpadIcon style={{ fontSize: 16 }} /> {i18n.t("dialer.title")}
          </button>
          <button
            type="button"
            className={`${classes.tabButton} ${tab === 1 ? classes.tabButtonActive : ""}`}
            onClick={() => setTab(1)}
          >
            <HistoryIcon style={{ fontSize: 16 }} /> {i18n.t("dialer.recent")}
          </button>
        </Box>

        {/* Seletor de canal. Só entram aqui os canais habilitados E
            configurados (ver canaisDisponiveis em services/telefonia.js):
            ramal precisa de alguém cadastrado, WhatsApp Plus precisa de
            sessão ativa, API Oficial precisa de conexão conectada e SIP
            precisa da troncal ligada. Oferecer uma opção que só leva a erro
            é pior do que não oferecer.

            Com um canal só, o seletor some — não há escolha a fazer. */}
        {tab === 0 && canais.length > 1 && (
          <Box className={classes.tabsWrapper} style={{ marginBottom: 12 }}>
            {canais.map(canal => (
              <button
                key={canal.id}
                type="button"
                className={`${classes.tabButton} ${callChannel === canal.id ? classes.tabButtonActive : ""}`}
                onClick={() => {
                  setCallChannel(canal.id);
                  setDialError("");
                  setPickedContact(null);
                  // Só WhatsApp Plus e ramal carregam vídeo.
                  if (canal.id === CANAL.SIP || canal.id === CANAL.OFICIAL) {
                    setVideoEnabled(false);
                  }
                }}
              >
                {i18n.t(canal.chave)}
              </button>
            ))}
          </Box>
        )}

        {/* Nenhum canal disponível: em vez de um discador que não disca,
            explica o que falta configurar. */}
        {tab === 0 && canais.length === 0 && (
          <Box className={classes.warningBanner}>
            <ReportProblemOutlinedIcon style={{ fontSize: 18 }} />
            <Typography style={{ fontSize: "0.78rem", fontWeight: 500 }}>
              {i18n.t("dialer.semCanais")}
            </Typography>
          </Box>
        )}

        {callChannel === CANAL.SIP && tab === 0 && (
          <Box className={classes.warningBanner}>
            <ReportProblemOutlinedIcon style={{ fontSize: 18 }} />
            <Typography style={{ fontSize: "0.78rem", fontWeight: 500 }}>
              {i18n.t("dialer.sipWarning")}
            </Typography>
          </Box>
        )}

        {/* Conexão de saída da API Oficial, quando há mais de uma. */}
        {callChannel === CANAL.OFICIAL && tab === 0 && conexoesOficiais.length > 1 && (
          <Select
            variant="outlined"
            fullWidth
            className={classes.sessionSelect}
            value={conexaoOficialId}
            onChange={e => setConexaoOficialId(e.target.value)}
          >
            {conexoesOficiais.map(w => (
              <MenuItem key={w.id} value={w.id}>{w.name}</MenuItem>
            ))}
          </Select>
        )}

        {/* Colegas disponíveis, para não precisar decorar o ramal. */}
        {callChannel === CANAL.RAMAL && tab === 0 && (
          <Box style={{ marginBottom: 10, maxHeight: 132, overflowY: "auto" }}>
            {ramais.map(r => (
              <Box
                key={r.userId || r.extension}
                onClick={() => { setNumber(String(r.extension || "")); setDialError(""); }}
                style={{
                  display: "flex", alignItems: "center", gap: 8, padding: "6px 8px",
                  cursor: "pointer", borderRadius: 6
                }}
              >
                <span style={{
                  width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                  background: r.emLigacao ? "#f59e0b" : r.online ? "#10b981" : "#9ca3af"
                }} />
                <Typography style={{ fontSize: "0.8rem", fontWeight: 600 }}>
                  {r.extension}
                </Typography>
                <Typography style={{ fontSize: "0.78rem", opacity: 0.75 }} noWrap>
                  {r.name}
                </Typography>
              </Box>
            ))}
          </Box>
        )}

        {callChannel === CANAL.WHATSAPP && sessions && sessions.length > 1 && (
          <Select
            variant="outlined"
            fullWidth
            className={classes.sessionSelect}
            value={sessionId}
            onChange={(e) => setSessionId(e.target.value)}
            MenuProps={{ PaperProps: { style: { backgroundColor: c.SURFACE, color: c.TEXT } } }}
          >
            {sessions.map((s) => (
              <MenuItem key={s.id} value={s.id}>{s.label || s.jid || s.id}</MenuItem>
            ))}
          </Select>
        )}

        {tab === 0 && (
          <>
            {callChannel === CANAL.WHATSAPP && pickedContact && (
              <Box
                display="flex"
                alignItems="center"
                style={{ gap: 10, marginBottom: 10, padding: "6px 10px", borderRadius: 12, background: c.SURFACE }}
              >
                <Avatar src={pickedContact.avatar || undefined} className={classes.historyAvatar} style={{ width: 34, height: 34 }}>
                  {(pickedContact.name || "?").slice(0, 1).toUpperCase()}
                </Avatar>
                <Box flex={1} minWidth={0}>
                  <Typography style={{ color: c.TEXT, fontSize: "0.85rem", fontWeight: 600, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {pickedContact.name}
                  </Typography>
                  <Typography style={{ color: c.TEXT_MUTED, fontSize: "0.72rem" }}>
                    {pickedContact.number}
                  </Typography>
                </Box>
                <IconButton size="small" onClick={() => { setPickedContact(null); setNumber(""); }}>
                  <CloseIcon style={{ fontSize: 15, color: c.TEXT_MUTED }} />
                </IconButton>
              </Box>
            )}

            <Box className={classes.numberRow}>
              {(callChannel === CANAL.WHATSAPP || callChannel === CANAL.OFICIAL) && (
                <Box
                  className={classes.countryBtn}
                  onClick={(e) => setCountryAnchor(e.currentTarget)}
                >
                  <span>{country.flag}</span>
                  <ExpandMoreIcon style={{ fontSize: 16, color: c.TEXT_MUTED }} />
                </Box>
              )}
              <Menu
                anchorEl={countryAnchor}
                open={Boolean(countryAnchor)}
                onClose={() => setCountryAnchor(null)}
                PaperProps={{ style: { backgroundColor: c.SURFACE, color: c.TEXT } }}
              >
                {COUNTRIES.map((ctry) => (
                  <MenuItem
                    key={ctry.code}
                    onClick={() => { setCountry(ctry); setCountryAnchor(null); }}
                  >
                    {ctry.flag} &nbsp;+{ctry.code} &nbsp;{ctry.label}
                  </MenuItem>
                ))}
              </Menu>

              <Box className={classes.numberBox}>
                <input
                  ref={numberInputRef}
                  className={classes.numberInput}
                  type="tel"
                  inputMode="tel"
                  placeholder={
                    callChannel === CANAL.SIP
                      ? i18n.t("dialer.sipNumberPlaceholder")
                      : callChannel === CANAL.RAMAL
                        ? i18n.t("dialer.ramalPlaceholder")
                        : i18n.t("dialer.numberPlaceholder")
                  }
                  value={number}
                  onChange={handleNumberChange}
                  onKeyDown={(e) => { if (e.key === "Enter" && number && !dialing) handleDial(); }}
                />
                {number && (
                  <IconButton className={classes.backspaceBtn} size="small" onClick={backspace}>
                    <BackspaceOutlinedIcon fontSize="small" />
                  </IconButton>
                )}
              </Box>
            </Box>

            <Box className={classes.keypad}>
              {KEYS.map((k) => (
                <button
                  type="button"
                  key={k}
                  className={classes.keyBtn}
                  onClick={() => append(k)}
                >
                  <span className={classes.keyNumber}>{k}</span>
                </button>
              ))}
            </Box>

            <Box className={classes.audioOnlyRow}>
              {canalTemVideo(callChannel, videoCallSupported) ? (
                <Box
                  className={`${classes.videoTogglePill} ${videoEnabled ? classes.videoTogglePillActive : ""}`}
                  onClick={() => setVideoEnabled((v) => !v)}
                >
                  {videoEnabled ? (
                    <VideocamOutlinedIcon style={{ fontSize: 15 }} />
                  ) : (
                    <VideocamOffOutlinedIcon style={{ fontSize: 15 }} />
                  )}
                  {videoEnabled ? i18n.t("dialer.videoCall") : i18n.t("dialer.audioOnly")}
                </Box>
              ) : (
                <Box className={classes.audioOnlyPill}>
                  <VideocamOffOutlinedIcon style={{ fontSize: 15 }} />
                  {i18n.t("dialer.audioOnly")}
                </Box>
              )}
            </Box>

            <button
              type="button"
              className={classes.callBtn}
              disabled={
                !number ||
                dialing ||
                !callChannel ||
                (callChannel === CANAL.WHATSAPP && !sessions?.length) ||
                (callChannel === CANAL.OFICIAL && !conexaoOficialId)
              }
              onClick={handleDial}
            >
              {dialing ? <CircularProgress size={20} style={{ color: "#fff" }} /> : (
                <>
                  <CallIcon style={{ fontSize: 20 }} /> {i18n.t("dialer.call")}
                </>
              )}
            </button>

            {dialError && (
              <Typography style={{ color: DANGER, fontSize: "0.78rem", textAlign: "center", marginTop: 12 }}>
                {dialError}
              </Typography>
            )}
          </>
        )}

        {tab === 1 && (
          <List className={classes.historyList} dense>
            {(history || []).length === 0 && (
              <Box className={classes.emptyState}>
                <HistoryIcon style={{ fontSize: 36, marginBottom: 8, opacity: 0.5 }} />
                <Typography variant="body2">{i18n.t("dialer.noRecentCalls")}</Typography>
              </Box>
            )}
            {(history || []).map((h, i) => {
              const meta = directionMeta(h.status, h.direction);
              const label = h.contact?.name || h.name || h.contact?.number || h.phone_to || h.number;
              const avatar = h.contact?.urlPicture || null;
              return (
                <ListItem
                  key={h.id || i}
                  button
                  className={classes.historyItem}
                  onClick={() => pickHistoryNumber(h)}
                >
                  <ListItemAvatar>
                    <Avatar src={avatar || undefined} className={classes.historyAvatar}>{(label || "?").slice(0, 1).toUpperCase()}</Avatar>
                  </ListItemAvatar>
                  <ListItemText
                    primary={<span style={{ color: c.TEXT }}>{label}</span>}
                    secondary={
                      <Box display="flex" alignItems="center" style={{ gap: 4, color: meta.color }}>
                        {meta.icon}
                        <span style={{ fontSize: "0.75rem" }}>
                          {h.status || "-"}{h.duration ? ` · ${h.duration}s` : ""}
                        </span>
                      </Box>
                    }
                  />
                </ListItem>
              );
            })}
          </List>
        )}
      </DialogContent>
    </Dialog>
  );
};

export default DialerModal;
