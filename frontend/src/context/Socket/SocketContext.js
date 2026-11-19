import { createContext } from "react";
import openSocket from "socket.io-client";
// import config from "../../services/config";

const socketManager = {
	currentSocket: null,

	GetSocket: function () {
		const publicToken = localStorage.getItem("public-token");

		if (publicToken !== this.currentToken) {
			if (this.currentSocket) {
				this.currentSocket.disconnect();
			}

			this.currentToken = publicToken;
			this.currentSocket = openSocket(process.env.REACT_APP_BACKEND_URL, {
				transports: ["websocket"],
				// pingTimeout/pingInterval NÃO existem como opção de cliente no
				// socket.io v3/v4 — são definidos pelo servidor e enviados no
				// handshake. Estavam aqui e eram silenciosamente ignorados.
				// Agora ficam em backend/src/libs/socket.ts, onde têm efeito.
				query: publicToken ? { token: publicToken } : {},
				//auth: publicToken ? { token: publicToken } : {},
			});
		}
		return this.currentSocket;
	},

	onConnect: function (callbackConnect) {
		if (this.currentSocket && this.currentSocket.connected) {
			callbackConnect();
		}
		this.currentSocket.on("connect", callbackConnect);
	},
};

const SocketContext = createContext()

export { SocketContext, socketManager };
