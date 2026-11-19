import React, { createContext, useState, useEffect, useContext } from "react";
import { toast } from "react-toastify";
import api from "../../services/api";
import useWhatsApps from "../../hooks/useWhatsApps";

import { AuthContext } from "../Auth/AuthContext";

const WhatsAppsContext = createContext();

const WhatsAppsProvider = ({ children }) => {
  // Add fallback values to prevent destructuring errors
  const whatsAppData = useWhatsApps();
  const { loading = false, whatsApps = [], refetch } = whatsAppData || {};
  const { user, socket } = useContext(AuthContext);
  
  const [wavoipToken, setWavoipToken] = useState(null);
  const [wavoipWhatsappId, setWavoipWhatsappId] = useState(null);
  const [loadingSession, setLoadingSession] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchSession = async () => {
      try {
        const { data } = await api.get("/call/historical/user/whatsapp");
        
        // Debug: mostrar resposta completa da API
        const isDbg = localStorage.getItem('WAVOIP_DEBUG') === 'true';
        if (isDbg) console.log('[Wavoip-Context] API response:', JSON.stringify(data));

        const wpp = data?.whatsapps;
        const firstWpp = Array.isArray(wpp) ? wpp.find(w => !!w?.wavoip) || wpp[0] : wpp;
        const extractedToken = firstWpp?.wavoip || null;
        const extractedWhatsappId = firstWpp?.id || null;
        
        if (isDbg) console.log('[Wavoip-Context] Parsed:', {
          totalWhatsapps: Array.isArray(wpp) ? wpp.length : (wpp ? 1 : 0),
          selectedWpp: firstWpp?.id,
          tokenLen: extractedToken?.length,
          tokenPrefix: extractedToken ? extractedToken.substring(0, 12) + '...' : 'NULO'
        });
        
        setWavoipToken(extractedToken);
        setWavoipWhatsappId(extractedWhatsappId);
      } catch (err) {
        console.error("Erro fetchSession:", err);
        setWavoipToken(null);
      } finally {
        setLoadingSession(false);
      }
    };
    fetchSession();
  }, []);

  // Listener global para notificações de mudança de status de templates
  useEffect(() => {
    if (!user?.companyId || !socket || typeof socket.on !== 'function') return;

    const companyId = user.companyId;
    const eventName = `company-${companyId}-templateStatus`;

    const onTemplateStatusChange = (data) => {
      if (data.action === "statusChange" && data.changes) {
        data.changes.forEach(change => {
          if (change.newStatus === "APPROVED") {
            toast.success(`🎉 Template "${change.name}" aprovado pela Meta!`, { autoClose: 8000 });
          } else if (change.newStatus === "REJECTED") {
            toast.error(`❌ Template "${change.name}" rejeitado pela Meta`, { autoClose: 10000 });
          } else {
            toast.info(`Template "${change.name}": ${change.oldStatus} → ${change.newStatus}`, { autoClose: 6000 });
          }
        });
      }
    };

    socket.on(eventName, onTemplateStatusChange);
    return () => {
      if (socket && typeof socket.off === 'function') {
        socket.off(eventName, onTemplateStatusChange);
      }
    };
  }, [socket, user?.companyId]);

  // Log error state for debugging
  if (error) {
    console.warn("WhatsAppsProvider error:", error);
  }

  return (
    <WhatsAppsContext.Provider value={{ whatsApps, loading, error, refetch, wavoipToken, wavoipWhatsappId }}>
      {children}
    </WhatsAppsContext.Provider>
  );
};

export { WhatsAppsContext, WhatsAppsProvider };