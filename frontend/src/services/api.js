import axios from "axios";

const api = axios.create({
	baseURL: process.env.REACT_APP_BACKEND_URL,
	withCredentials: true,
});

export const openApi = axios.create({
	baseURL: process.env.REACT_APP_BACKEND_URL
});

// ============================================================
// Interceptors registrados UMA ÚNICA VEZ no nível do módulo
// Nunca acumulam, nunca têm race condition com React
// ============================================================

// Callback que o useAuth pode setar para reagir a 401
let onUnauthorized = null;
let unauthorizedHandled = false;
export const setOnUnauthorized = (cb) => { onUnauthorized = cb; };
export const resetUnauthorizedState = () => { unauthorizedHandled = false; };

// REQUEST: injeta token do localStorage em toda requisição
api.interceptors.request.use(
  (config) => {
    const token = localStorage.getItem("token");
    if (token) {
      config.headers = config.headers ?? {};
      try {
        config.headers["Authorization"] = `Bearer ${JSON.parse(token)}`;
      } catch {
        config.headers["Authorization"] = `Bearer ${token}`;
      }
    }
    return config;
  },
  (error) => Promise.reject(error)
);

// RESPONSE: refresh em 401/403, limpa sessão só se o refresh falhar
let isRefreshing = false;
let failedQueue = [];

const processQueue = (error, token = null) => {
  failedQueue.forEach(prom => {
    if (error) {
      prom.reject(error);
    } else {
      prom.resolve(token);
    }
  });
  failedQueue = [];
};

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const originalRequest = error?.config;

    const requestUrl = originalRequest?.url || "";
    const status = error?.response?.status;
    const shouldSkipRefresh =
      requestUrl.includes("/auth/refresh_token") ||
      requestUrl.includes("/auth/login") ||
      requestUrl.includes("/auth/logout");

    // Evita loop nas rotas de autenticação
    if (shouldSkipRefresh) {
      return Promise.reject(error);
    }

    // 401/403 → tentar renovar pelo cookie jrt antes de derrubar o usuário.
    // O backend pode retornar ERR_SESSION_EXPIRED (401) quando o header Authorization
    // não chega numa requisição, mesmo que o refresh cookie ainda esteja válido.
    if (status === 401 && originalRequest && !originalRequest._retry) {
      if (isRefreshing) {
        // Já está fazendo refresh, enfileirar
        return new Promise((resolve, reject) => {
          failedQueue.push({ resolve, reject });
        }).then(token => {
          originalRequest.headers["Authorization"] = `Bearer ${token}`;
          return api(originalRequest);
        }).catch(err => Promise.reject(err));
      }

      originalRequest._retry = true;
      isRefreshing = true;

      try {
        const { data } = await api.post("/auth/refresh_token");
        if (data?.token) {
          unauthorizedHandled = false;
          localStorage.setItem("token", JSON.stringify(data.token));
          api.defaults.headers.Authorization = `Bearer ${data.token}`;
          processQueue(null, data.token);
          return api(originalRequest);
        }
      } catch (refreshErr) {
        processQueue(refreshErr, null);
        // Só trata como sessão REALMENTE expirada se o backend confirmou
        // isso com 401 (ERR_SESSION_EXPIRED). Qualquer outra coisa —
        // timeout, erro de rede, 503 (ERR_AUTH_TEMPORARILY_UNAVAILABLE,
        // que o backend devolve por ex. logo após um restart/deploy,
        // enquanto os secrets JWT ainda estão carregando) — não é prova
        // de que o token é inválido, e derrubar o usuário aí só pra ele
        // ter que logar de novo manualmente é pior que deixar a próxima
        // ação tentar de novo sozinha.
        const refreshStatus = refreshErr?.response?.status;
        if (refreshStatus === 401) {
          localStorage.removeItem("token");
          api.defaults.headers.Authorization = undefined;
          if (onUnauthorized) onUnauthorized();
        }
        return Promise.reject(refreshErr);
      } finally {
        isRefreshing = false;
      }
    }

    // 401 → sessão expirada definitiva
    if (status === 401) {
      localStorage.removeItem("token");
      api.defaults.headers.Authorization = undefined;
      if (!unauthorizedHandled) {
        unauthorizedHandled = true;
        if (onUnauthorized) onUnauthorized();
      }
    }

    return Promise.reject(error);
  }
);

export default api;
