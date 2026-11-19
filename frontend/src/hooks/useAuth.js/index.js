import { useState, useEffect, useRef } from "react";
import { useHistory } from "react-router-dom";
import { has, isArray } from "lodash";

import { toast } from "react-toastify";

import { i18n } from "../../translate/i18n";
import api, { setOnUnauthorized, resetUnauthorizedState } from "../../services/api";
import toastError from "../../errors/toastError";
import { socketConnection } from "../../services/socket";
import moment from "moment";
import { refreshSession } from "../../helpers/sessionHealth";

const useAuth = () => {
  const history = useHistory();
  const [isAuth, setIsAuth] = useState(false);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState({});
  const [socket, setSocket] = useState(null);
  
  // Ref para manter referência dos listeners ativos
  const listenersRef = useRef(new Set());

  // Registrar callback de 401 no api.js (interceptors vivem lá, no nível do módulo)
  useEffect(() => {
    setOnUnauthorized(() => {
      if (socket && typeof socket.disconnect === "function") {
        listenersRef.current.forEach(eventName => {
          if (socket.off) socket.off(eventName);
        });
        listenersRef.current.clear();
        socket.disconnect();
      }

      setSocket(null);
      setUser({});
      setIsAuth(false);
      setLoading(false);

      if (history.location.pathname !== "/login") {
        history.push("/login");
      }
    });
    return () => setOnUnauthorized(null);
  }, [history, socket]);

  // Effect para inicialização do token
  useEffect(() => {
    const token = localStorage.getItem("token");
    (async () => {
      if (token) {
        try {
          const { data } = await api.post("/auth/refresh_token");
          resetUnauthorizedState();
          api.defaults.headers.Authorization = `Bearer ${data.token}`;
          setIsAuth(true);
          setUser(data.user || data);
        } catch (err) {
          setIsAuth(false);
          setUser({});
        }
      }
      setLoading(false);
    })();
  }, []);

  // Effect para configuração do socket
  useEffect(() => {
    if (Object.keys(user).length && user.id > 0) {
      
      // Limpar listeners anteriores
      if (socket) {
        listenersRef.current.forEach(eventName => {
          if (socket.off) {
            socket.off(eventName);
          }
        });
        listenersRef.current.clear();
      }

      // Criar nova conexão socket
      const socketInstance = socketConnection({ user: {
        companyId: user.companyId,
        id: user.id }
      });
      
      if (socketInstance) {
        setSocket(socketInstance);

        // Aguardar um pouco para garantir que o socket está configurado
        setTimeout(() => {
          const eventName = `company-${user.companyId}-user`;
          
          const handleUserUpdate = (data) => {
            if (data.action === "update" && data.user.id === user.id) {
              setUser(data.user);
            }
          };

          // Verificar se o socket tem o método 'on'
          if (socketInstance && typeof socketInstance.on === 'function') {
            socketInstance.on(eventName, handleUserUpdate);
            listenersRef.current.add(eventName);
          } else {
            console.error("Socket instance não tem método 'on'", socketInstance);
          }
        }, 100);
      }
    }

    // Cleanup function
    return () => {
      if (socket && listenersRef.current.size > 0) {
        listenersRef.current.forEach(eventName => {
          if (socket.off) {
            socket.off(eventName);
          }
        });
        listenersRef.current.clear();
      }
    };
  }, [user.id, user.companyId]); // Dependências específicas

  // Effect para buscar dados do usuário atual
  useEffect(() => {
    const fetchCurrentUser = async () => {
      try {
        const { data } = await api.get("/auth/me");
        setUser(data.user || data);
      } catch (err) {
      }
    };
    
    if (isAuth) {
      fetchCurrentUser();
    }
  }, [isAuth]);

  // Session health — validates active session periodically
  useEffect(() => {
    if (!isAuth) return;
    refreshSession();
    const interval = setInterval(refreshSession, 5 * 60 * 1000);
    return () => clearInterval(interval);
  }, [isAuth]);

  const handleLogin = async (userData) => {
    setLoading(true);

    try {
      const { data } = await api.post("/auth/login", userData);
      const {
        user: { company },
      } = data;

      // Lógica de configurações da empresa (mantém como estava)
      if (
        has(company, "companieSettings") &&
        isArray(company.companieSettings[0])
      ) {
        const setting = company.companieSettings[0].find(
          (s) => s.key === "campaignsEnabled"
        );
        if (setting && setting.value === "true") {
          localStorage.setItem("cshow", null);
        }
      }

      if (
        has(company, "companieSettings") &&
        isArray(company.companieSettings[0])
      ) {
        const setting = company.companieSettings[0].find(
          (s) => s.key === "sendSignMessage"
        );

        const signEnable = setting.value === "enable";

        if (setting && setting.value === "enabled") {
          localStorage.setItem("sendSignMessage", signEnable);
        }
      }
      
      // Sem esse guard, usuário sem foto de perfil (profileImage null) fazia
      // localStorage.setItem virar a STRING "null" (localStorage só guarda
      // string, e coage null pra "null") — daí o layout montava a URL do
      // avatar como ".../user/null" e o pedido vinha 401 (arquivo não
      // existe / sem token, dependendo da rota estática).
      if (data.user.profileImage) {
        localStorage.setItem("profileImage", data.user.profileImage);
      } else {
        localStorage.removeItem("profileImage");
      }

      moment.locale("pt-br");
      let dueDate;
      if (data.user.company.id === 1) {
        dueDate = "2999-12-31T00:00:00.000Z";
      } else {
        dueDate = data.user.company.dueDate;
      }
      
      const hoje = moment(moment()).format("DD/MM/yyyy");
      const vencimento = moment(dueDate).format("DD/MM/yyyy");

      // Comparar apenas as datas (sem horas) para permitir acesso até 23h59 do dia do vencimento
      const hojeInicio = moment().startOf('day');
      const vencimentoInicio = moment(dueDate).startOf('day');
      
      var diff = vencimentoInicio.diff(hojeInicio, 'days');
      var before = hojeInicio.isSameOrBefore(vencimentoInicio, 'day');
      var dias = diff;

      if (before === true) {
        localStorage.setItem("token", JSON.stringify(data.token));
        localStorage.setItem("companyDueDate", vencimento);
        resetUnauthorizedState();
        api.defaults.headers.Authorization = `Bearer ${data.token}`;
        setUser(data.user || data);
        setIsAuth(true);
        toast.success(i18n.t("auth.toasts.success"));

        // Sinaliza que ESTE carregamento veio de um login recém-feito, para o
        // layout mostrar a saudação. sessionStorage e não localStorage: a
        // saudação deve aparecer uma vez por login, não a cada F5 nem em
        // outra aba que já estava aberta.
        try {
          sessionStorage.setItem(
            "boasVindas",
            JSON.stringify({
              nome: data.user?.name || "",
              em: Date.now(),
            })
          );
        } catch {
          // Navegador com storage bloqueado: sem saudação, mas o login segue.
        }
        
        if (Math.round(dias) < 5) {
          toast.warn(
            i18n.t("auth.dueDate.warning", {
              days: Math.round(dias),
              unit: Math.round(dias) === 1 ? i18n.t("auth.dueDate.day") : i18n.t("auth.dueDate.days"),
            })
          );
        }

        history.push("/tickets");
        setLoading(false);
      } else {
        resetUnauthorizedState();
        api.defaults.headers.Authorization = `Bearer ${data.token}`;
        setIsAuth(true);
        toastError(i18n.t("auth.dueDate.expired", { date: vencimento }));
        history.push("/financeiro-aberto");
        setLoading(false);
      }
    } catch (err) {
      toastError(err);
      setLoading(false);
    }
  };

  const handleLogout = async () => {
    setLoading(true);

    // Tira o número do ícone do app ao sair. Sem isso o balãozinho vermelho
    // continuaria na tela inicial do celular depois do logout, mostrando a
    // contagem do atendente anterior.
    try {
      if (typeof navigator?.clearAppBadge === "function") {
        navigator.clearAppBadge().catch(() => {});
      }
      const swAtual = navigator?.serviceWorker?.controller;
      if (swAtual && typeof swAtual.postMessage === "function") {
        swAtual.postMessage({ type: "CLEAR_BADGE" });
      }
    } catch {
      // navegador sem suporte à Badging API — ignora
    }

    try {
      // Limpar socket antes do logout
      if (socket) {
        listenersRef.current.forEach(eventName => {
          if (socket.off) {
            socket.off(eventName);
          }
        });
        listenersRef.current.clear();
        
        if (typeof socket.disconnect === 'function') {
          socket.disconnect();
        }
      }

      await api.delete("/auth/logout");
      setIsAuth(false);
      setUser({});
      setSocket(null);
      localStorage.removeItem("token");
      localStorage.removeItem("cshow");
      resetUnauthorizedState();
      api.defaults.headers.Authorization = undefined;
      setLoading(false);
      history.push("/login");
    } catch (err) {
      toastError(err);
      setLoading(false);
    }
  };

  const getCurrentUserInfo = async () => {
    try {
      const { data } = await api.get("/auth/me");
      return data;
    } catch (_) {
      return null;
    }
  };

  // Google OAuth handoff: receives { token, user } already issued by the backend
  // and primes the session exactly like a normal password login.
  const handleGoogleSession = async ({ token, user: gUser }) => {
    setLoading(true);
    try {
      if (!token || !gUser) throw new Error("Sessão Google inválida.");
      localStorage.setItem("token", JSON.stringify(token));
      if (gUser.profileImage) {
        localStorage.setItem("profileImage", gUser.profileImage);
      }
      let dueDate = gUser?.company?.dueDate;
      if (gUser?.company?.id === 1) dueDate = "2999-12-31T00:00:00.000Z";
      const vencimento = moment(dueDate).format("DD/MM/yyyy");
      localStorage.setItem("companyDueDate", vencimento);

      resetUnauthorizedState();
      api.defaults.headers.Authorization = `Bearer ${token}`;
      setUser(gUser);
      setIsAuth(true);
      toast.success(i18n.t("auth.toasts.success"));
      history.push("/tickets");
    } catch (err) {
      toastError(err);
    } finally {
      setLoading(false);
    }
  };

  return {
    isAuth,
    user,
    loading,
    handleLogin,
    handleGoogleSession,
    handleLogout,
    getCurrentUserInfo,
    socket,
  };
};

export default useAuth;