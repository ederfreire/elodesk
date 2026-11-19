import api from "./api";

// O navegador NUNCA fala direto com o microserviço wacalls-voip (porta 8090
// escuta só em 127.0.0.1). Toda comunicação passa pelo backend Node do
// EquipeChat, que assina as chamadas internas com WACALLS_SHARED_SECRET.
const backendWacallsApi = {
  get: (url, config) => api.get(`/wacalls${url}`, config),
  post: (url, data, config) => {
    if (url === "/calls/dial") return api.post("/wacalls/calls/dial", data, config);
    const answer = url.match(/^\/calls\/([^/]+)\/answer$/);
    if (answer) return api.post(`/wacalls/calls/${answer[1]}/answer`, data, config);
    const hangup = url.match(/^\/calls\/([^/]+)\/hangup$/);
    if (hangup) return api.post(`/wacalls/calls/${hangup[1]}/hangup`, data, config);
    return api.post(`/wacalls${url}`, data, config);
  },
  delete: (url, config) => api.delete(`/wacalls${url}`, config),
};

// Retorna string vazia: NÃO existe URL pública do microserviço para o browser.
// Consumidores que dependiam disso devem usar o socket EquipeChat.
export const getWacallsBaseUrl = () => "";

// Cliente pra troncal SIP (baresip) — extensão do discador do WhatsApp Plus
// (ver DialerModal). Mesma ideia do client acima, só que apontado pra
// /wacalls/sip/... (rotas registradas em wacallsRoutes.ts). Endpoints usam
// "/calls/..." como caminho relativo, igual o client do WhatsApp, pra poder
// reaproveitar exatamente a mesma lógica em wacallsWebRTC.js (openSipAudio).
export const sipApi = {
  get: (url, config) => api.get(`/wacalls/sip${url === "/settings" ? "/settings" : url}`, config),
  post: (url, data, config) => {
    if (url === "/calls/dial") return api.post("/wacalls/sip/calls/dial", data, config);
    const answer = url.match(/^\/calls\/([^/]+)\/answer$/);
    if (answer) return api.post(`/wacalls/sip/calls/${answer[1]}/answer`, data, config);
    const hangup = url.match(/^\/calls\/([^/]+)\/hangup$/);
    if (hangup) return api.post(`/wacalls/sip/calls/${hangup[1]}/hangup`, data, config);
    const webrtc = url.match(/^\/calls\/([^/]+)\/webrtc$/);
    if (webrtc) return api.post(`/wacalls/sip/calls/${webrtc[1]}/webrtc`, data, config);
    return api.post(`/wacalls/sip${url}`, data, config);
  },
  put: (url, data, config) => api.put(`/wacalls/sip${url}`, data, config),
  delete: (url, config) => api.delete(`/wacalls/sip${url}`, config),
};

export default backendWacallsApi;
