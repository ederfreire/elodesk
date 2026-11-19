import React, { useState, useEffect, useRef, useCallback } from 'react';
import Wavoip from 'wavoip-api';
import api from '../../services/api';
import { i18n } from '../../translate/i18n';
import SoundCalling from './calling.mp3';
import SoundRinging from './ring.mp3';

/**
 * WavoipPhoneWidget - Integração com wavoip-api v3.1.24
 * 
 * API Real do SDK:
 *   const WAV = new Wavoip();
 *   const instance = WAV.connect(token);
 *   instance.socket          → Socket.IO socket
 *   instance.callStart({whatsappid}) → Promise - inicia chamada
 *   instance.endCall()       → Promise - encerra chamada
 *   instance.acceptCall()    → Promise - aceita chamada recebida
 *   instance.rejectCall()    → Promise - rejeita chamada recebida
 *   instance.mute()          → Promise - muta microfone
 *   instance.unMute()        → Promise - desmuta microfone
 *   instance.getCurrentDeviceStatus() → Promise - status do device
 *   instance.getAllInfo()     → Promise - info completa
 *
 * Socket events do servidor:
 *   connect, disconnect, signaling, 
 *   audio_transport:create, audio_transport:terminate
 */

const WavoipPhoneWidget = ({
  token,
  position = 'bottom-right',
  name = 'Equipechat Prime Phone',
  country = 'BR',
  autoConnect = true,
  whatsappId,
  companyId,
  onCallStarted,
  onCallEnded,
  onConnectionStatus,
  onError
}) => {
  const [isMinimized, setIsMinimized] = useState(true);
  const [isConnected, setIsConnected] = useState(false);
  const [isInCall, setIsInCall] = useState(false);
  const [currentNumber, setCurrentNumber] = useState('');
  const [callStatus, setCallStatus] = useState('');
  const [callDuration, setCallDuration] = useState(0);
  const [incomingCall, setIncomingCall] = useState(false);
  const [callStartTime, setCallStartTime] = useState(null);
  const [numberError, setNumberError] = useState('');
  const [callerName, setCallerName] = useState('');
  const [callerPhone, setCallerPhone] = useState('');
  const [isMuted, setIsMuted] = useState(false);

  const wavoipInstanceRef = useRef(null);
  const wavoipRef = useRef(null);
  const durationIntervalRef = useRef(null);
  const widgetRef = useRef(null);
  const audioRef = useRef(null);
  const callingSoundRef = useRef(null);
  const ringingSoundRef = useRef(null);
  const isMinimizedRef = useRef(isMinimized);
  const onCallStartedRef = useRef(onCallStarted);
  const onCallEndedRef = useRef(onCallEnded);
  const onConnectionStatusRef = useRef(onConnectionStatus);
  const onErrorRef = useRef(onError);
  const callHistoryIdRef = useRef(null);
  const callStartTimeRef = useRef(null);
  const callDirectionRef = useRef(null);
  const isInCallRef = useRef(false);
  const activeCallIdRef = useRef(null);

  // ── Save call to DB ──
  const saveCallToHistory = useCallback(async ({ phone_to, name: contactName, direction }) => {
    try {
      const payload = {
        token_wavoip: token,
        whatsapp_id: whatsappId || null,
        company_id: companyId || null,
        phone_to: phone_to || '',
        name: contactName || phone_to || '',
        url: '',
        status: 'PENDING',
        direction: direction || 'OUTGOING',
        duration: 0
      };
      const { data } = await api.post('/call/historical/wavoip', payload);
      const id = data?.callHistorical?.id;
      callHistoryIdRef.current = id;
      callStartTimeRef.current = Date.now();
      callDirectionRef.current = direction;
      return id;
    } catch (err) {
      console.error('[Wavoip] Erro ao salvar chamada no histórico:', err);
      return null;
    }
  }, [token, whatsappId, companyId]);

  const updateCallHistory = useCallback(async (status, extraDuration, isFinal = true) => {
    const id = callHistoryIdRef.current;
    if (!id) return;
    try {
      const duration = extraDuration ?? (callStartTimeRef.current ? Math.floor((Date.now() - callStartTimeRef.current) / 1000) : 0);
      await api.put(`/call/historical/${id}`, {
        status,
        duration,
        direction: callDirectionRef.current || 'OUTGOING'
      });
    } catch (err) {
      console.error('[Wavoip] Erro ao atualizar chamada:', err);
    } finally {
      if (isFinal) {
        callHistoryIdRef.current = null;
        callStartTimeRef.current = null;
        callDirectionRef.current = null;
      }
    }
  }, []);

  // ── Audio helpers ──
  const stopCalling = () => {
    const audio = callingSoundRef.current;
    if (audio) { audio.pause(); audio.currentTime = 0; }
  };

  const playCalling = async () => {
    stopCalling();
    const audio = new Audio(SoundCalling);
    audio.loop = true;
    callingSoundRef.current = audio;
    try { await audio.play(); } catch (err) { console.warn("Erro som chamada:", err); }
  };

  const stopRinging = () => {
    const audio = ringingSoundRef.current;
    if (audio) { audio.pause(); audio.currentTime = 0; }
  };

  const playRinging = async () => {
    stopRinging();
    const audio = new Audio(SoundRinging);
    audio.loop = true;
    ringingSoundRef.current = audio;
    try { await audio.play(); } catch (err) { console.warn("Erro som toque:", err); }
  };

  // ── Styles ──
  const styles = {
    widget: {
      position: 'fixed',
      zIndex: 9999,
      fontFamily: 'Arial, sans-serif',
      fontSize: '14px',
      ...(position === 'bottom-right' && { bottom: '65px', right: '20px' }),
      ...(position === 'bottom-left' && { bottom: '20px', left: '20px' }),
      ...(position === 'top-right' && { top: '20px', right: '20px' }),
      ...(position === 'top-left' && { top: '20px', left: '20px' })
    },
    minimized: {
      width: '30px', height: '30px',
      backgroundColor: isInCall ? '#dc3545' : '#00339E',
      borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center',
      cursor: 'pointer', boxShadow: '0 4px 12px rgba(0,0,0,0.15)',
      transition: 'all 0.3s ease', border: 'none', outline: 'none', position: 'relative'
    },
    expanded: {
      width: '320px', backgroundColor: 'white', borderRadius: '12px',
      boxShadow: '0 8px 24px rgba(0,0,0,0.15)', overflow: 'hidden', transition: 'all 0.3s ease'
    },
    header: {
      backgroundColor: '#00339E', color: 'white', padding: '15px',
      display: 'flex', alignItems: 'center', justifyContent: 'space-between'
    },
    connectionStatus: { display: 'flex', alignItems: 'center', gap: '8px' },
    statusIcon: { fontSize: '16px' },
    statusText: { fontSize: '14px', fontWeight: 'bold' },
    minimizeBtn: {
      background: 'none', border: 'none', color: 'white', fontSize: '18px', cursor: 'pointer', padding: '5px'
    },
    display: {
      padding: '20px', textAlign: 'center', minHeight: '120px',
      display: 'flex', flexDirection: 'column', justifyContent: 'center'
    },
    callInfo: { marginBottom: '10px' },
    callStatus: { fontSize: '16px', fontWeight: 'bold', marginBottom: '5px' },
    phoneNumber: { fontSize: '18px', fontWeight: 'bold', marginBottom: '5px' },
    callerName: { fontSize: '14px', color: '#666', marginBottom: '5px' },
    callDuration: { fontSize: '14px', color: '#666' },
    idleDisplay: { marginBottom: '10px' },
    welcomeText: { fontSize: '16px', fontWeight: 'bold', marginBottom: '5px' },
    phoneNumberDisplay: { fontSize: '18px', fontWeight: 'bold', marginBottom: '5px', minHeight: '27px' },
    subtitle: { fontSize: '12px', color: '#666', marginBottom: '5px' },
    numberError: { fontSize: '12px', color: '#dc3545', marginTop: '5px' },
    keypad: { padding: '0 20px 20px' },
    keypadRow: { display: 'flex', gap: '10px', marginBottom: '10px' },
    keypadKey: {
      flex: 1, height: '50px', border: '1px solid #ddd', borderRadius: '8px',
      background: 'white', fontSize: '18px', fontWeight: 'bold', cursor: 'pointer',
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      transition: 'all 0.2s ease'
    },
    actions: { padding: '0 20px 20px', display: 'flex', gap: '10px' },
    actionBtn: {
      flex: 1, height: '50px', border: 'none', borderRadius: '8px',
      fontSize: '18px', cursor: 'pointer', display: 'flex', alignItems: 'center',
      justifyContent: 'center', transition: 'all 0.2s ease'
    },
    callBtn: { backgroundColor: '#00339E', color: 'white' },
    endCallBtn: { backgroundColor: '#dc3545', color: 'white' },
    muteBtn: { backgroundColor: '#ffc107', color: '#333' },
    mutedBtn: { backgroundColor: '#e0a800', color: '#333' },
    pulse: { animation: 'pulse 1s infinite' }
  };

  // ── Number validation ──
  const validateNumber = (number) => {
    const cleanNumber = number.replace(/\D/g, '');
    if (cleanNumber.length === 0) return { isValid: false, error: '', canType: true };
    if (cleanNumber.length < 7) return { isValid: false, error: i18n.t("hardcoded.numberTooShort"), canType: true };
    if (cleanNumber.length > 15) return { isValid: false, error: i18n.t("hardcoded.numberTooLong"), canType: false };
    return { isValid: true, error: '', formatted: cleanNumber, canType: cleanNumber.length < 15 };
  };

  const getMaxLength = () => country.toUpperCase() === 'BR' ? 11 : 15;

  // ── Reset call state helper ──
  const resetCallState = useCallback(() => {
    setIsInCall(false);
    isInCallRef.current = false;
    setCallStatus('');
    setCallerName('');
    setCallerPhone('');
    setCurrentNumber('');
    setIsMuted(false);
    setIncomingCall(false);
    stopRinging();
    stopCalling();
    if (durationIntervalRef.current) {
      clearInterval(durationIntervalRef.current);
      durationIntervalRef.current = null;
    }
    setCallDuration(0);
    setCallStartTime(null);
  }, []);

  // ── Start duration timer ──
  const startDurationTimer = useCallback(() => {
    if (durationIntervalRef.current) clearInterval(durationIntervalRef.current);
    const startTs = Date.now();
    durationIntervalRef.current = setInterval(() => {
      setCallDuration(Math.floor((Date.now() - startTs) / 1000));
    }, 1000);
  }, []);

  // ══════════════════════════════════════════════════════════════
  // ══ Connect to Wavoip — REAL SDK API v3.1.24                ══
  // ══════════════════════════════════════════════════════════════
  const connectToWavoip = useCallback(() => {
    try {
      // Cleanup previous
      if (wavoipInstanceRef.current?.socket) {
        try { wavoipInstanceRef.current.socket.disconnect(); } catch (e) {}
      }
      wavoipInstanceRef.current = null;
      wavoipRef.current = null;
      setIsConnected(false);


      // 1) Create Wavoip and connect with token
      const WAV = new Wavoip();
      wavoipRef.current = WAV;
      const instance = WAV.connect(token);
      wavoipInstanceRef.current = instance;

      const socket = instance.socket;


      // 2) Socket connection events
      socket.on('connect', async () => {
        setIsConnected(true);
        if (onConnectionStatusRef.current) onConnectionStatusRef.current('connected');

        // Pre-request microphone permission so acceptCall works instantly
        try {
          const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          stream.getTracks().forEach(t => t.stop()); // Release immediately
        } catch (micErr) {
          console.warn('[Wavoip] ⚠️ Sem permissão de microfone:', micErr.message);
        }

        // Check device status after connect
        if (instance.getCurrentDeviceStatus) {
          instance.getCurrentDeviceStatus().then(status => {
          }).catch(err => console.warn('[Wavoip] Erro device status:', err));
        }
      });

      socket.on('disconnect', (reason) => {
        setIsConnected(false);
        if (onConnectionStatusRef.current) onConnectionStatusRef.current('disconnected');
      });

      socket.on('connect_error', (err) => {
        console.error('[Wavoip] Erro de conexão:', err.message);
        setIsConnected(false);
      });

      // 3) Call-related socket events — only track state, let SDK handle audio internally
      socket.on('signaling', (data) => {
      });

      // Track audio transport events for UI state only (SDK handles audio internally)
      socket.on('audio_transport:create', (data) => {
        if (!isInCallRef.current) {
          isInCallRef.current = true;
          setIsInCall(true);
          setCallStatus(i18n.t("hardcoded.inCall"));
          startDurationTimer();
          if (onCallStartedRef.current) onCallStartedRef.current(data);
        } else {
          stopCalling();
          setCallStatus(i18n.t("hardcoded.inCall"));
          callStartTimeRef.current = Date.now();
          startDurationTimer();
        }
      });

      socket.on('audio_transport:terminate', (data) => {
        if (isInCallRef.current) {
          updateCallHistory('ANSWERED');
        }
        resetCallState();
        if (onCallEndedRef.current) onCallEndedRef.current({ action: 'ended' });
      });

      // 4) Listen for ALL events with detailed logging
      if (typeof socket.onAny === 'function') {
        socket.onAny((eventName, ...args) => {
          const payload = args.length > 0 ? args[0] : '';
          
          // Detect incoming call events
          if (eventName === 'calls:incoming' || eventName === 'call:incoming' || 
              eventName === 'calls:offer' || eventName === 'call:offer' ||
              eventName === 'calls:ringing' || eventName === 'incoming_call') {
            const callData = args[0] || {};
            const phone = callData.phone || callData.from || callData.whatsappid || callData.number || 
                          callData.peer?.phone || i18n.t("hardcoded.unknown");
            
            setIncomingCall(true);
            setCallerPhone(phone);
            setCallerName(callData.name || callData.displayName || callData.peer?.displayName || phone);
            playRinging();
            
            if (isMinimizedRef.current) setIsMinimized(false);
            
            saveCallToHistory({ phone_to: phone, name: callData.name || callData.peer?.displayName || phone, direction: 'INCOMING' });
          }
          
          // Detect call ended via signaling terminate or status ENDED
          // Só resetar se NÃO estamos ativamente em chamada (evitar race condition com answerCall)
          if (eventName === 'call:status' && args[1] === 'ENDED') {
            if (isInCallRef.current) {
              updateCallHistory('ANSWERED');
              resetCallState();
              if (onCallEndedRef.current) onCallEndedRef.current({ action: 'ended' });
            }
          }
          
          // Signaling terminate: apenas logar, não resetar (o SDK gerencia internamente)
          if (eventName === 'call:signaling' && payload?.tag === 'terminate') {
          }
        });
      }


    } catch (error) {
      console.error('[Wavoip] ❌ Erro ao inicializar:', error);
      if (onErrorRef.current) onErrorRef.current(error);
    }
  }, [token, resetCallState, startDurationTimer, saveCallToHistory, updateCallHistory]);

  // ── Make outgoing call ──
  const makeCall = useCallback(async () => {
    if (!wavoipInstanceRef.current || !currentNumber || numberError) return;

    const validation = validateNumber(currentNumber);
    if (!validation.isValid) {
      setNumberError(validation.error);
      return;
    }

    try {
      playCalling();
      isInCallRef.current = true;
      setIsInCall(true);
      setCallStatus(i18n.t("hardcoded.calling"));
      setCallerName(validation.formatted);


      await saveCallToHistory({ phone_to: validation.formatted, name: validation.formatted, direction: 'OUTGOING' });

      // SDK API: callStart({ whatsappid: "number" }) → Promise
      const result = await wavoipInstanceRef.current.callStart({
        whatsappid: validation.formatted
      });


      if (result && result.type === 'success') {
        setCallStartTime(Date.now());
        if (onCallStartedRef.current) onCallStartedRef.current(result);
      } else {
        console.error('[Wavoip] Erro ao iniciar chamada:', result);
        await updateCallHistory('FAILED');
        stopCalling();
        resetCallState();
        setNumberError(i18n.t("hardcoded.callError"));
        if (onErrorRef.current) onErrorRef.current(result);
      }

    } catch (error) {
      console.error('[Wavoip] Erro inesperado ao ligar:', error);
      await updateCallHistory('FAILED');
      stopCalling();
      resetCallState();
      if (onErrorRef.current) onErrorRef.current(error);
    }
  }, [currentNumber, numberError, resetCallState, saveCallToHistory, updateCallHistory]);

  // ── End call ──
  const endCall = useCallback(async () => {
    const inst = wavoipInstanceRef.current;
    
    // Resetar UI IMEDIATAMENTE - não esperar resposta do SDK
    const wasInCall = isInCallRef.current;
    resetCallState();
    
    if (inst) {
      try {
        inst.endCall().then(r => console.log('[Wavoip] 🔴 endCall OK:', r))
          .catch(err => {
            console.warn('[Wavoip] 🔴 endCall erro:', err?.message || err);
            try { inst.socket.emit('calls:end', {}); } catch (e) {}
          });
      } catch (err) {
        console.warn('[Wavoip] 🔴 endCall exception:', err);
        try { inst.socket.emit('calls:end', {}); } catch (e) {}
      }
    }
    
    if (wasInCall) {
      updateCallHistory('ANSWERED');
    }
    if (onCallEndedRef.current) onCallEndedRef.current({ action: 'ended' });
  }, [resetCallState, updateCallHistory]);

  // ── Answer incoming call ──
  const answerCall = useCallback(async () => {
    const inst = wavoipInstanceRef.current;

    if (!inst) {
      console.error('[Wavoip] 🟢 Sem instância para atender');
      return;
    }

    // 1. Parar toque e atualizar UI IMEDIATAMENTE
    stopRinging();
    setIncomingCall(false);
    isInCallRef.current = true;
    setIsInCall(true);
    setCallStatus(i18n.t("hardcoded.connecting"));

    // 2. Chamar acceptCall() do SDK (não bloquear com getUserMedia antes)
    // O SDK internamente emite "calls:accept" {} ao servidor WaVoIP
    try {
      inst.acceptCall().then(result => {
        setCallStatus(i18n.t("hardcoded.inCall"));
        callStartTimeRef.current = Date.now();
        startDurationTimer();
      }).catch(error => {
        console.warn('[Wavoip] 🟢 acceptCall erro:', error?.message || error);
        // Fallback: emitir diretamente via socket
        try { 
          inst.socket.emit('calls:accept', {}, (response) => {
          });
        } catch (e) {}
        // Ainda marcar como em chamada (o audio_transport confirmará)
        setCallStatus(i18n.t("hardcoded.inCall"));
        callStartTimeRef.current = Date.now();
        startDurationTimer();
      });
    } catch (error) {
      console.error('[Wavoip] 🟢 acceptCall exception:', error);
      try { inst.socket.emit('calls:accept', {}); } catch (e) {}
      setCallStatus(i18n.t("hardcoded.inCall"));
      callStartTimeRef.current = Date.now();
      startDurationTimer();
    }
  }, [startDurationTimer]);

  // ── Reject incoming call ──
  const rejectCall = useCallback(async () => {
    if (!wavoipInstanceRef.current) {
      console.error('[Wavoip] Sem instância para rejeitar');
      resetCallState();
      return;
    }

    try {
      stopRinging();
      
      // Resetar estado ANTES da chamada assíncrona
      setIncomingCall(false);
      setCallerName('');
      setCallerPhone('');

      try {
        const result = await wavoipInstanceRef.current.rejectCall();
      } catch (rejectErr) {
        console.warn('[Wavoip] rejectCall erro (pode ser esperado):', rejectErr);
      }

      await updateCallHistory('REJECTED');
      if (onCallEndedRef.current) onCallEndedRef.current({ action: 'rejected' });
    } catch (error) {
      console.error('[Wavoip] Erro ao rejeitar:', error);
      resetCallState();
      if (onErrorRef.current) onErrorRef.current(error);
    }
  }, [updateCallHistory, resetCallState]);

  // ── Toggle mute ──
  const toggleMute = useCallback(async () => {
    if (!wavoipInstanceRef.current) return;

    try {
      if (isMuted) {
        const result = await wavoipInstanceRef.current.unMute();
        setIsMuted(false);
      } else {
        const result = await wavoipInstanceRef.current.mute();
        setIsMuted(true);
      }
    } catch (error) {
      console.error('[Wavoip] Erro ao mutar/desmutar:', error);
    }
  }, [isMuted]);

  // ── Number input ──
  const clearNumber = useCallback(() => {
    setCurrentNumber(prev => prev.slice(0, -1));
  }, []);

  const handleKeyPress = useCallback((key) => {
    if (isInCall) return;
    const maxLength = getMaxLength();
    const currentLength = currentNumber.replace(/\D/g, '').length;
    if (currentLength >= maxLength) return;
    setCurrentNumber(prev => prev + key);
  }, [isInCall, currentNumber]);

  const handleKeyboardInput = useCallback((event) => {
    if (isMinimized || isInCall) return;
    const key = event.key;
    const maxLength = getMaxLength();
    const currentLength = currentNumber.replace(/\D/g, '').length;

    if (/^[0-9*#]$/.test(key)) {
      if (currentLength >= maxLength) { event.preventDefault(); return; }
      event.preventDefault();
      setCurrentNumber(prev => prev + key);
    } else if (key === 'Backspace') {
      event.preventDefault();
      clearNumber();
    } else if (key === 'Enter') {
      event.preventDefault();
      if (currentNumber && isConnected && !numberError) makeCall();
    } else if (key === 'Escape') {
      event.preventDefault();
      setCurrentNumber('');
      setNumberError('');
    }
  }, [isMinimized, isInCall, currentNumber, isConnected, numberError, clearNumber, makeCall]);

  const formatDuration = useCallback((seconds) => {
    const minutes = Math.floor(seconds / 60);
    const remainingSeconds = seconds % 60;
    return `${minutes.toString().padStart(2, '0')}:${remainingSeconds.toString().padStart(2, '0')}`;
  }, []);

  const toggleWidget = useCallback(() => {
    setIsMinimized(prev => !prev);
  }, []);

  // ── Keep callback refs up to date ──
  useEffect(() => { isMinimizedRef.current = isMinimized; }, [isMinimized]);
  useEffect(() => { onCallStartedRef.current = onCallStarted; }, [onCallStarted]);
  useEffect(() => { onCallEndedRef.current = onCallEnded; }, [onCallEnded]);
  useEffect(() => { onConnectionStatusRef.current = onConnectionStatus; }, [onConnectionStatus]);
  useEffect(() => { onErrorRef.current = onError; }, [onError]);

  useEffect(() => {
    if (!currentNumber) { setNumberError(''); return; }
    const validation = validateNumber(currentNumber);
    setNumberError(validation.error);
  }, [currentNumber]);

  // ── Connect ONCE when token is available ──
  useEffect(() => {
    if (autoConnect && token) {
      connectToWavoip();
    }

    return () => {
      if (wavoipInstanceRef.current?.socket) {
        try { wavoipInstanceRef.current.socket.disconnect(); } catch (e) {}
      }
      wavoipInstanceRef.current = null;
      wavoipRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [token]);

  useEffect(() => {
    document.addEventListener('keydown', handleKeyboardInput);
    return () => document.removeEventListener('keydown', handleKeyboardInput);
  }, [handleKeyboardInput]);

  useEffect(() => {
    return () => {
      if (durationIntervalRef.current) clearInterval(durationIntervalRef.current);
    };
  }, []);

  // ── Render minimized ──
  if (isMinimized) {
    return (
      <div style={styles.widget}>
        <button style={styles.minimized} onClick={toggleWidget} title={name}>
          <span style={{ ...styles.statusIcon, ...(isInCall && styles.pulse) }}>📞</span>
        </button>
      </div>
    );
  }

  // ── Render expanded ──
  return (
    <div style={styles.widget} ref={widgetRef}>
      <div style={styles.expanded}>
        <div style={styles.header}>
          <div style={styles.connectionStatus}>
            <span style={styles.statusIcon}>
              {isConnected ? '✅' : '🔄'}
            </span>
            <span style={styles.statusText}>
              {isConnected ? i18n.t("hardcoded.connected") : i18n.t("hardcoded.connecting")}
            </span>
          </div>
          <button style={styles.minimizeBtn} onClick={toggleWidget} title={i18n.t("hardcoded.minimize")}>
            −
          </button>
        </div>

        <div style={styles.display}>
          {isInCall ? (
            <div style={styles.callInfo}>
              <div style={styles.callStatus}>{callStatus}</div>
              {callerName && <div style={styles.callerName}>{callerName}</div>}
              {callDuration > 0 && <div style={styles.callDuration}>{formatDuration(callDuration)}</div>}
            </div>
          ) : incomingCall ? (
            <div style={styles.callInfo}>
              <div style={{ fontSize: '48px', marginBottom: '15px' }}>📞</div>
              <div style={styles.phoneNumberDisplay}>
                {callerPhone || i18n.t("hardcoded.unknownNumber")}
              </div>
              {callerName && callerName !== callerPhone && (
                <div style={styles.callerName}>{callerName}</div>
              )}
              <div style={styles.subtitle}>{i18n.t("hardcoded.incomingCall")}</div>
            </div>
          ) : (
            <div style={styles.idleDisplay}>
              <div style={styles.welcomeText}>{name}</div>
              <div style={styles.phoneNumberDisplay}>{currentNumber || ''}</div>
              <div style={styles.subtitle}>
                {isConnected ? i18n.t("hardcoded.readyForCalls") : i18n.t("hardcoded.connectingToServer")}
              </div>
              {numberError && <div style={styles.numberError}>{numberError}</div>}
            </div>
          )}
        </div>

        {/* Keypad - only show when idle and connected */}
        {!isInCall && !incomingCall && isConnected && (
          <div style={styles.keypad}>
            {[['1', '2', '3'], ['4', '5', '6'], ['7', '8', '9'], ['*', '0', '#']].map((row, i) => (
              <div key={i} style={styles.keypadRow}>
                {row.map(key => (
                  <button
                    key={key}
                    style={styles.keypadKey}
                    onClick={() => handleKeyPress(key)}
                    onMouseEnter={(e) => { e.target.style.backgroundColor = '#f0f0f0'; }}
                    onMouseLeave={(e) => { e.target.style.backgroundColor = 'white'; }}
                  >
                    {key}
                  </button>
                ))}
              </div>
            ))}
          </div>
        )}

        <div style={styles.actions}>
          {isInCall ? (
            <>
              <button
                style={{ ...styles.actionBtn, ...(isMuted ? styles.mutedBtn : styles.muteBtn) }}
                onClick={toggleMute}
                title={isMuted ? i18n.t("hardcoded.unmute") : i18n.t("hardcoded.mute")}
              >
                {isMuted ? '🔇' : '🔊'}
              </button>
              <button
                style={{ ...styles.actionBtn, ...styles.endCallBtn }}
                onClick={endCall}
              >
                📞 {i18n.t("hardcoded.endCall")}
              </button>
            </>
          ) : incomingCall ? (
            <>
              <button style={{ ...styles.actionBtn, ...{ backgroundColor: '#28a745', color: 'white' } }} onClick={answerCall}>
                ✅ {i18n.t("hardcoded.answerCall")}
              </button>
              <button style={{ ...styles.actionBtn, ...styles.endCallBtn }} onClick={rejectCall}>
                ❌ {i18n.t("hardcoded.rejectCall")}
              </button>
            </>
          ) : isConnected && currentNumber ? (
            <button
              style={{ ...styles.actionBtn, ...styles.callBtn, flex: 1 }}
              onClick={makeCall}
              disabled={!!numberError}
            >
              📞 {i18n.t("hardcoded.makeCall")}
            </button>
          ) : isConnected ? (
            <div style={{ ...styles.actions, justifyContent: 'center', padding: '10px', color: '#666', fontSize: '12px' }}>
              {i18n.t("hardcoded.typeNumberToCall")}
            </div>
          ) : null}

          {/* Backspace button when typing */}
          {!isInCall && !incomingCall && currentNumber && (
            <button
              style={{ ...styles.actionBtn, backgroundColor: '#6c757d', color: 'white', flex: 0.5 }}
              onClick={clearNumber}
              title={i18n.t("hardcoded.backspace")}
            >
              ⌫
            </button>
          )}
        </div>
      </div>
    </div>
  );
};

export default WavoipPhoneWidget;
