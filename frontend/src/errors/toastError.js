import { toast } from "react-toastify";
import { i18n } from "../translate/i18n";
import { isString } from 'lodash';

// Evita disparar mais de um redirecionamento por carregamento da página.
// Sem isto, várias chamadas bloqueadas ao mesmo tempo agendavam vários
// window.location.href seguidos.
let redirecionamentoAgendado = false;

const toastError = err => {
	const errorMsg = err.response?.data?.error;
	if (errorMsg) {
		if (errorMsg === "ERR_PLAN_FEATURE_DISABLED") {
			toast.error(i18n.t(`backendErrors.${errorMsg}`), {
				toastId: errorMsg,
				autoClose: 3000,
				hideProgressBar: false,
				closeOnClick: true,
				pauseOnHover: false,
				draggable: true,
				progress: undefined,
				theme: "light",
			});

			// NÃO redirecionar quando o usuário JÁ está no Financeiro.
			//
			// O menu lateral (MainListItems) chama /chats meio segundo depois de
			// montar, em QUALQUER página. Num plano sem chat interno essa chamada
			// devolve 403 ERR_PLAN_FEATURE_DISABLED e caía aqui: 1,5s depois o
			// window.location.href recarregava a página inteira. Como o menu
			// monta de novo a cada recarga, o ciclo se repetia sem parar — e era
			// impossível terminar qualquer ação no Financeiro, inclusive TROCAR
			// DE PLANO: o clique abria o fluxo e a recarga o cancelava no meio.
			//
			// O redirecionamento só faz sentido para tirar o usuário de uma tela
			// que ele não pode usar. Estando no Financeiro, ele já está no lugar
			// certo — o aviso basta.
			const jaEstaNoFinanceiro =
				typeof window !== "undefined" &&
				window.location.pathname.startsWith("/financeiro");

			if (!jaEstaNoFinanceiro && !redirecionamentoAgendado) {
				redirecionamentoAgendado = true;
				setTimeout(() => {
					window.location.href = "/financeiro";
				}, 1500);
			}
			return;
		}
		if (i18n.exists(`backendErrors.${errorMsg}`)) {
			toast.error(i18n.t(`backendErrors.${errorMsg}`), {
				toastId: errorMsg,
				autoClose: 2000,
				hideProgressBar: false,
				closeOnClick: true,
				pauseOnHover: false,
				draggable: true,
				progress: undefined,
				theme: "light",
			});
			return
		} else {
			toast.error(errorMsg, {
				toastId: errorMsg,
				autoClose: 2000,
				hideProgressBar: false,
				closeOnClick: true,
				pauseOnHover: false,
				draggable: true,
				progress: undefined,
				theme: "light",
			});
			return
		}
	} if (isString(err)) {
		toast.error(err);
		return
	} else {
		toast.error("An error occurred!");
		return
	}
};

export default toastError;
