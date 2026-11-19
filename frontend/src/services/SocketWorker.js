import io from "socket.io-client";
import api from "../services/api";

class SocketWorker {
  constructor(companyId, userId) {
    const sessionToken = api.defaults.headers.Authorization;

    if (!SocketWorker.instance) {
      this.companyId = companyId || "";
      this.userId = userId || "";
      this.token = sessionToken || "";
      this.socket = null;
      this.eventListeners = {};
      this.configureSocket();
      SocketWorker.instance = this;
      return this;
    }

    SocketWorker.instance.updateSession(companyId, userId, sessionToken);
    return SocketWorker.instance;
  }

  get connected() {
    return Boolean(this.socket?.connected);
  }

  get id() {
    return this.socket?.id;
  }

  hasConnectionChanged(companyId, userId, token) {
    return (
      String(this.companyId || "") !== String(companyId || "") ||
      String(this.userId || "") !== String(userId || "") ||
      String(this.token || "") !== String(token || "")
    );
  }

  updateSession(companyId, userId, token) {
    const nextCompanyId = companyId || "";
    const nextUserId = userId || "";
    const nextToken = token || "";

    if (!this.hasConnectionChanged(nextCompanyId, nextUserId, nextToken)) {
      this.connect();
      return;
    }

    const registeredListeners = this.eventListeners;

    if (this.socket) {
      Object.entries(registeredListeners).forEach(([event, callbacks]) => {
        callbacks.forEach(callback => this.detachListener(event, callback));
      });
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }

    this.companyId = nextCompanyId;
    this.userId = nextUserId;
    this.token = nextToken;
    this.eventListeners = registeredListeners;
    this.configureSocket();

    if (this.socket) {
      Object.entries(this.eventListeners).forEach(([event, callbacks]) => {
        callbacks.forEach(callback => this.attachListener(event, callback));
      });
    }
  }

  attachListener(event, callback) {
    if (!this.socket) return;
    this.socket.on(event, callback);
    if (event === "reconnect" && this.socket.io) {
      this.socket.io.on("reconnect", callback);
    }
  }

  detachListener(event, callback) {
    if (!this.socket) return;
    this.socket.off(event, callback);
    if (event === "reconnect" && this.socket.io) {
      this.socket.io.off("reconnect", callback);
    }
  }

  // Token ATUAL da sessão (o axios mantém isso atualizado a cada renovação
  // do JWT — ver interceptor em services/api.js). O SocketWorker guardava
  // só o token capturado quando foi criado: depois que o JWT era renovado,
  // o socket continuava com o token velho e, na primeira reconexão (deploy,
  // queda de rede, sleep do notebook), o backend recusava por token
  // expirado. Ler o valor vivo na hora de conectar evita esse
  // descompasso.
  liveToken() {
    // Se o axios ainda tem Authorization, e o token valido do momento.
    if (api.defaults.headers.Authorization) {
      return api.defaults.headers.Authorization;
    }

    // Sem Authorization no axios, so vale cair no token guardado se a sessao
    // ainda existir no localStorage. Depois de um 401 o interceptor apaga os
    // dois — e reconectar com o token velho guardado aqui e exatamente o que
    // criava o laco de reconexao infinita.
    const sessao = localStorage.getItem("token");
    if (!sessao) return "";

    return this.token || "";
  }

  configureSocket() {
    const freshToken = this.liveToken();
    if (freshToken) {
      this.token = freshToken;
    }

    if (!process.env.REACT_APP_BACKEND_URL || !this.companyId || !this.token) {
      return;
    }

    this.socket = io(`${process.env.REACT_APP_BACKEND_URL}/${this.companyId}`, {
      autoConnect: true,
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionAttempts: Infinity,
      transports: ["websocket"],
      query: { userId: this.userId, token: this.token }
    });

    this.socket.on("connect", () => {
      this._authFailed = false;
    });

    this.socket.on("AUTH_ERROR", (data) => {
      console.warn("Socket auth error:", data?.message);
      const rejectedToken = this.token;
      if (this.socket) {
        this.socket.disconnect();
        this.socket = null;
      }
      // NÃO desiste de vez. Antes, qualquer AUTH_ERROR marcava
      // _authFailed=true e bloqueava toda reconexão futura — o socket
      // morria de forma permanente e NENHUMA mensagem chegava em tempo
      // real até o usuário dar F5 (era exatamente o bug relatado). O caso
      // mais comum é token renovado no axios enquanto o socket ainda
      // usava o antigo: basta reconectar com o token atual. Só desiste se
      // o token continuar o mesmo que acabou de ser recusado (aí é uma
      // falha real de autenticação, não descompasso).
      this._authRetries = (this._authRetries || 0) + 1;
      if (this._authRetries > 5) {
        this._authFailed = true;
        return;
      }
      setTimeout(() => {
        const fresh = this.liveToken();
        if (fresh && fresh !== rejectedToken) {
          this.token = fresh;
          this._authFailed = false;
          this.connect();
        } else {
          this._authFailed = true;
        }
      }, 2000);
    });

    this.socket.on("disconnect", (reason) => {
      if (reason !== "io client disconnect" && !this._authFailed) {
        this.reconnectAfterDelay();
      }
    });

    /*
     * FALHA DE HANDSHAKE COM LIMITE
     *
     * `reconnectionAttempts: Infinity` faz o socket.io tentar para sempre.
     * Isso e o certo para queda de rede, mas nao para token invalido: quando
     * a sessao expira, o /auth/refresh_token responde 401, o axios limpa o
     * Authorization e o `liveToken()` cai de volta no token ANTIGO guardado
     * aqui. O socket entao reconecta em laco com uma credencial que o
     * servidor nunca vai aceitar.
     *
     * Cada ciclo desses derruba a conexao, e todo componente que emitir
     * nesse intervalo gera "WebSocket is already in CLOSING or CLOSED state"
     * no console. Com o laco rodando sem parar, sao milhares de avisos — e
     * foi o que manteve um worker do backend perto de 100% de CPU.
     *
     * Dez tentativas seguidas sem conseguir conectar significam que nao e
     * oscilacao de rede. Para de tentar e deixa o usuario recarregar.
     */
    this.socket.on("connect_error", (erro) => {
      this._falhasSeguidas = (this._falhasSeguidas || 0) + 1;

      if (this._falhasSeguidas > 10) {
        console.warn(
          "[Socket] Conexao recusada 10 vezes seguidas; parando de tentar.",
          erro?.message || erro
        );
        this._authFailed = true;
        if (this.socket) {
          this.socket.io.opts.reconnection = false;
          this.socket.disconnect();
          this.socket = null;
        }
      }
    });

    // Conectou: zera o contador, para uma queda futura ter as 10 tentativas
    // de novo.
    this.socket.on("connect", () => {
      this._falhasSeguidas = 0;
    });
  }

  on(event, callback) {
    if (typeof callback !== "function") {
      return;
    }

    if (!this.eventListeners[event]) {
      this.eventListeners[event] = [];
    }

    if (this.eventListeners[event].includes(callback)) {
      return;
    }

    this.eventListeners[event].push(callback);
    this.connect();

    if (this.socket) {
      this.attachListener(event, callback);

      if (event === "connect" && this.socket.connected) {
        setTimeout(callback, 0);
      }
    }
  }

  emit(event, data) {
    this.connect();
    if (this.socket && this.socket.connected) {
      this.socket.emit(event, data);
    } else if (this.socket) {
      // Queue emit to fire once connected
      const onceConnect = () => {
        this.socket.emit(event, data);
        this.socket.off("connect", onceConnect);
      };
      this.socket.on("connect", onceConnect);
    }
  }

  off(event, callback) {
    if (!this.eventListeners[event]) {
      return;
    }

    if (callback) {
      if (this.socket) {
        this.detachListener(event, callback);
      }
      this.eventListeners[event] = this.eventListeners[event].filter(cb => cb !== callback);
      if (this.eventListeners[event].length === 0) {
        delete this.eventListeners[event];
      }
      return;
    }

    if (this.socket) {
      this.eventListeners[event].forEach(cb => this.detachListener(event, cb));
    }
    delete this.eventListeners[event];
  }

  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.eventListeners = {};
    SocketWorker.instance = null;
  }

  reconnectAfterDelay() {
    setTimeout(() => {
      if (!this.socket || !this.socket.connected) {
        this.connect();
      }
    }, 1000);
  }

  connect() {
    if (!this.companyId || !this.token) {
      return;
    }

    // Se o JWT foi renovado desde que este socket foi criado, reconecta com
    // o token novo em vez de insistir num socket que o backend vai recusar
    // na próxima reconexão (ver comentário em liveToken/AUTH_ERROR).
    const fresh = this.liveToken();
    if (fresh && fresh !== this.token) {
      this.updateSession(this.companyId, this.userId, fresh);
      return;
    }

    if (!this.socket) {
      this.configureSocket();
      // Re-attach saved listeners to the new socket
      if (this.socket) {
        Object.entries(this.eventListeners).forEach(([event, callbacks]) => {
          callbacks.forEach(callback => this.attachListener(event, callback));
        });
      }
      return;
    }

    if (!this.socket.connected) {
      this.socket.connect();
    }
  }

  forceReconnect() {
    this.updateSession(this.companyId, this.userId, this.token);
  }
}

const instance = (companyId, userId) => new SocketWorker(companyId, userId);

export default instance;
