import { useEffect, useRef, useCallback } from 'react';
import api from '../../services/api';

/**
 * WavoipWebphoneWidget - Integração com @wavoip/wavoip-webphone oficial
 * 
 * API disponível do SDK (conforme docs oficiais):
 *   call: start(), getCallActive(), getCallOutgoing(), getOffers(), setInput(), onOffer()
 *   device: add(), remove(), enable(), disable(), get()
 *   widget: open(), close(), toggle()
 * 
 * NÃO existem: onAnswer, onEnd, onReject, onStatusChange
 * Solução: polling com getCallActive() para detectar mudanças de estado
 */
const WavoipWebphoneWidget = ({
  token,
  position = 'bottom-right',
  name = 'Equipechat Prime Phone',
  whatsappId,
  companyId,
  theme = 'light',
  onCallStarted,
  onCallEnded,
  onError
}) => {
  const webphoneAPIRef = useRef(null);
  const isRenderedRef = useRef(false);
  const callTrackingRef = useRef(null);
  const pollIntervalRef = useRef(null);
  const lastCallStateRef = useRef(null); // track previous state for transitions
  const pendingHistoryRef = useRef(null);
  const pendingCallRef = useRef(null);
  const pendingFinalStatusRef = useRef(null);
  const answeredAtRef = useRef(null);

  const markCallAnswered = useCallback((reason) => {
    if (!answeredAtRef.current) answeredAtRef.current = Date.now();
    if (callTrackingRef.current && !callTrackingRef.current.answeredTime) {
      callTrackingRef.current.answeredTime = answeredAtRef.current;
    }
    if (pendingCallRef.current && !pendingCallRef.current.answeredTime) {
      pendingCallRef.current.answeredTime = answeredAtRef.current;
    }
  }, []);

  // ── Save call to DB ──
  const saveCallToHistory = useCallback(async ({ phone_to, name: contactName, direction }) => {
    if (callTrackingRef.current?.id) return callTrackingRef.current.id;
    if (pendingHistoryRef.current) return pendingHistoryRef.current;

    answeredAtRef.current = null;
    pendingFinalStatusRef.current = null;
    const startedAt = Date.now();
    pendingCallRef.current = {
      startTime: startedAt,
      answeredTime: answeredAtRef.current,
      direction: direction || 'OUTGOING',
      phone_to
    };

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
      pendingHistoryRef.current = api.post('/call/historical/wavoip', payload);
      const { data } = await pendingHistoryRef.current;
      const id = data?.callHistorical?.id;
      const pending = pendingCallRef.current || {};
      callTrackingRef.current = {
        id,
        startTime: pending.startTime || startedAt,
        answeredTime: pending.answeredTime || answeredAtRef.current || null,
        direction: pending.direction || direction || 'OUTGOING',
        phone_to
      };
      const queuedFinal = pendingFinalStatusRef.current;
      if (queuedFinal?.status) {
        const timeRef = callTrackingRef.current.answeredTime || callTrackingRef.current.startTime;
        const duration = queuedFinal.status === 'ANSWERED' && timeRef ? Math.floor((Date.now() - timeRef) / 1000) : 0;
        await api.put(`/call/historical/${id}`, {
          status: queuedFinal.status,
          duration,
          direction: callTrackingRef.current.direction || 'OUTGOING'
        });
        if (queuedFinal.isFinal !== false) callTrackingRef.current = null;
        pendingFinalStatusRef.current = null;
      }
      return id;
    } catch (err) {
      console.error('[WavoipWebphone] Erro ao salvar chamada:', err);
      return null;
    } finally {
      pendingHistoryRef.current = null;
      pendingCallRef.current = null;
    }
  }, [token, whatsappId, companyId]);

  const updateCallHistory = useCallback(async (status, isFinal = true) => {
    const tracking = callTrackingRef.current;
    if (!tracking?.id) {
      if (pendingHistoryRef.current || pendingCallRef.current) {
        pendingFinalStatusRef.current = { status, isFinal };
      }
      return;
    }
    try {
      // Calculate duration from when call was answered (not from when it started ringing)
      const timeRef = tracking.answeredTime || tracking.startTime;
      const duration = timeRef ? Math.floor((Date.now() - timeRef) / 1000) : 0;
      
      // For ANSWERED status during call, use duration from answeredTime
      // For MISSED/REJECTED, duration should be 0
      const finalDuration = (status === 'ANSWERED' && duration > 0) ? duration : 
                           (status === 'ANSWERED' ? 0 : 0);

      await api.put(`/call/historical/${tracking.id}`, {
        status,
        duration: status === 'ANSWERED' ? duration : 0,
        direction: tracking.direction || 'OUTGOING'
      });
    } catch (err) {
      console.error('[WavoipWebphone] Erro ao atualizar chamada:', err);
    } finally {
      if (isFinal) {
        callTrackingRef.current = null;
        answeredAtRef.current = null;
        pendingFinalStatusRef.current = null;
      }
    }
  }, []);

  // ── Poll call state to detect transitions ──
  const startPolling = useCallback(() => {
    if (pollIntervalRef.current) return;
    
    
    pollIntervalRef.current = setInterval(() => {
      const api = webphoneAPIRef.current;
      if (!api) return;

      try {
        const activeCall = api.call.getCallActive?.();
        const outgoingCall = api.call.getCallOutgoing?.();
        const offers = api.call.getOffers?.() || [];
        const prevState = lastCallStateRef.current;
        
        // Determine current state
        let currentState = null;
        
        if (activeCall) {
          currentState = {
            type: 'active',
            status: activeCall.status,
            direction: activeCall.direction,
            phone: activeCall.peer?.phone || '',
            name: activeCall.peer?.displayName || '',
            id: activeCall.id
          };
        } else if (outgoingCall) {
          currentState = {
            type: 'outgoing',
            status: outgoingCall.status,
            direction: 'OUTGOING',
            phone: outgoingCall.peer?.phone || '',
            name: outgoingCall.peer?.displayName || '',
            id: outgoingCall.id
          };
        } else if (offers && offers.length > 0) {
          // Chamada RECEBIDA tocando (ainda não atendida) — fica em getOffers()
          const off = offers[0];
          currentState = {
            type: 'offer',
            status: off?.status || 'RINGING',
            direction: 'INCOMING',
            phone: off?.peer?.phone || '',
            name: off?.peer?.displayName || '',
            id: off?.id
          };
        }

        // Detect state transitions
        if (!prevState && currentState) {
          // Call started
          
          // For outgoing calls, save to history (incoming already saved via onOffer)
          if (currentState.direction === 'OUTGOING' || currentState.type === 'outgoing') {
            if (!callTrackingRef.current) {
              saveCallToHistory({
                phone_to: currentState.phone,
                name: currentState.name || currentState.phone,
                direction: 'OUTGOING'
              });
            }
          } else if (currentState.direction === 'INCOMING') {
            // Defensive: if onOffer didn't fire (e.g. polling caught it first), still register
            if (!callTrackingRef.current) {
              saveCallToHistory({
                phone_to: currentState.phone,
                name: currentState.name || currentState.phone,
                direction: 'INCOMING'
              });
            }
            // Make sure widget is visible so user can answer
            try {
              const apiRef = webphoneAPIRef.current;
              if (apiRef?.widget?.open) apiRef.widget.open();
            } catch (e) {}
          }
          
          if (onCallStarted) onCallStarted(currentState);
        } else if (prevState && currentState) {
          // State changed during call
          const prevStatus = (prevState.status || '').toUpperCase();
          const currStatus = (currentState.status || '').toUpperCase();

          // Transição: chamada recebida foi ATENDIDA (offer -> active)
          if (prevState.type === 'offer' && currentState.type === 'active') {
            markCallAnswered('offer→active');
          }

          // Alguns estados do SDK trocam apenas o tipo, sem mudar o campo status.
          if (currentState.type === 'active' && prevState.type !== 'active') {
            markCallAnswered(`${prevState.type}→active`);
          }

          if (prevStatus !== currStatus) {
            
            // Detect when call is answered (transition to active/connected)
            if (currStatus === 'ACTIVE' || currStatus === 'CONNECTED' || currStatus === 'ANSWERED' || currStatus === 'IN_CALL') {
              markCallAnswered(`status ${currStatus}`);
            }
          }
        } else if (prevState && !currentState) {
          // Call ended
          
          const tracking = callTrackingRef.current;
          if (tracking) {
            // Determine final status based on whether call was answered
            let finalStatus;
            if (tracking.answeredTime) {
              finalStatus = 'ANSWERED';
            } else {
              // Call ended without being answered
              const prevStatus = (prevState.status || '').toUpperCase();
              if (prevStatus === 'REJECTED' || prevStatus === 'DECLINED') {
                finalStatus = 'REJECTED';
              } else {
                finalStatus = tracking.direction === 'INCOMING' ? 'MISSED' : 'NO_ANSWER';
              }
            }
            
            updateCallHistory(finalStatus, true);
          }
          
          if (onCallEnded) onCallEnded({ action: 'ended', prevState });
        }

        lastCallStateRef.current = currentState;
      } catch (err) {
        // Silently ignore polling errors
      }
    }, 1000); // Poll every second
  }, [saveCallToHistory, updateCallHistory, markCallAnswered, onCallStarted, onCallEnded]);

  const stopPolling = useCallback(() => {
    if (pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, []);

  // ── Initialize webphone ──
  useEffect(() => {
    if (!token || isRenderedRef.current) return;

    let destroyed = false;

    const initWebphone = async () => {
      try {
        const WavoipWebphone = (await import('@wavoip/wavoip-webphone')).default;
        
        if (destroyed) return;


        const webphoneAPI = await WavoipWebphone.render({
          theme: theme,
          position: 'top-right',
          widget: {
            showWidgetButton: false,
            startOpen: false
          },
          statusBar: {
            showNotificationsIcon: true,
            showSettingsIcon: true
          },
          settingsMenu: {
            deviceMenu: {
              show: true,
              showAddDevices: false,
              showEnableDevicesButton: true,
              showRemoveDevicesButton: false
            }
          }
        });

        if (destroyed) {
          WavoipWebphone.destroy();
          return;
        }

        webphoneAPIRef.current = webphoneAPI;
        isRenderedRef.current = true;

        // Expor toggle global para o botão no header
        window.__wavoipToggle = () => {
          try {
            if (webphoneAPI.widget && webphoneAPI.widget.toggle) {
              webphoneAPI.widget.toggle();
            } else if (webphoneAPI.widget && webphoneAPI.widget.open) {
              webphoneAPI.widget.open();
            } else {
              const allDivs = document.querySelectorAll('body > div');
              for (const div of allDivs) {
                if (div.shadowRoot) {
                  const btn = div.shadowRoot.querySelector('button, [role="button"]');
                  if (btn) { btn.click(); return; }
                }
                const s = window.getComputedStyle(div);
                if (s.position === 'fixed' && parseInt(s.zIndex) > 999) {
                  div.click();
                  return;
                }
              }
            }
          } catch (e) {
            console.warn('[WavoipWebphone] Erro ao toggle:', e);
          }
        };


        // Add device token
        webphoneAPI.device.add(token, true);

        // Garantir que o dispositivo esteja habilitado para RECEBER chamadas
        try {
          if (webphoneAPI.device.enable) {
            await webphoneAPI.device.enable(token);
          }
        } catch (e) {
          console.warn('[WavoipWebphone] Não foi possível habilitar o dispositivo:', e);
        }

        // Listen for incoming call offers (this IS in the official API)
        webphoneAPI.call.onOffer((offer) => {
          const phone = offer?.peer?.phone || 'Desconhecido';
          const contactName = offer?.peer?.displayName || phone;
          
          saveCallToHistory({
            phone_to: phone,
            name: contactName,
            direction: 'INCOMING'
          });

          // Abrir o widget do SDK para o usuário ver/atender a chamada recebida
          try {
            if (webphoneAPI.widget && webphoneAPI.widget.open) {
              webphoneAPI.widget.open();
            }
          } catch (e) {
            console.warn('[WavoipWebphone] Erro ao abrir widget na chamada recebida:', e);
          }

          if (onCallStarted) onCallStarted(offer);
        });

        // Start polling for call state changes (since SDK doesn't have onAnswer/onEnd/onReject)
        startPolling();


      } catch (error) {
        console.error('[WavoipWebphone] ❌ Erro ao inicializar:', error);
        if (onError) onError(error);
      }
    };

    initWebphone();

    return () => {
      destroyed = true;
      stopPolling();
      if (isRenderedRef.current) {
        try {
          import('@wavoip/wavoip-webphone').then(mod => {
            mod.default.destroy();
          });
        } catch (e) {
          console.warn('[WavoipWebphone] Erro ao destruir:', e);
        }
        isRenderedRef.current = false;
        webphoneAPIRef.current = null;
      }
    };
  }, [token, position, theme, saveCallToHistory, onCallStarted, onError, startPolling, stopPolling]);

  // O SDK renderiza sua própria UI - sem JSX
  return null;
};

export default WavoipWebphoneWidget;
