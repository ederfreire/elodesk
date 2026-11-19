import React, { useEffect, useMemo, useState } from "react";
import { makeStyles } from "@material-ui/core/styles";
import { X } from "lucide-react";

import { i18n } from "../../translate/i18n";

/**
 * Saudação exibida uma vez, logo depois do login, no centro da tela.
 *
 * FRASE NUNCA REPETIDA
 * Sortear aleatoriamente repetiria — com 10 frases, a chance de a mesma sair
 * duas vezes seguidas é de 10%, e em poucos logins o usuário veria repetição.
 * Aqui guardamos em localStorage os índices já usados e sorteamos só entre os
 * que faltam. Quando acabam, a lista zera, e o índice imediatamente anterior
 * é excluído do novo ciclo para a virada não emendar a mesma frase duas
 * vezes.
 *
 * POR QUE localStorage PARA O HISTÓRICO
 * A marca do login é sessionStorage (uma vez por login, ver useAuth), mas o
 * histórico de frases precisa sobreviver entre sessões — senão o ciclo
 * reiniciaria a cada login e as primeiras frases apareceriam sempre.
 */

const TOTAL_FRASES = 10;
const CHAVE_USADAS = "boasVindasFrasesUsadas";
const CHAVE_DESATIVADA = "boasVindasDesativada";

const useStyles = makeStyles(theme => ({
  fundo: {
    position: "fixed",
    inset: 0,
    zIndex: theme.zIndex.modal,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: 24,
    // Fundo um pouco mais claro que antes (era 0.55): com o cartao tambem
    // mais escuro, os dois se fundiam e o conjunto lia como uma mancha so.
    backgroundColor: "rgba(15,23,42,0.42)",
    backdropFilter: "blur(4px)",
    animation: "$aparecer 260ms ease-out",
  },
  fundoSaindo: {
    animation: "$sumir 280ms ease-in forwards",
  },
  "@keyframes aparecer": {
    from: { opacity: 0 },
    to: { opacity: 1 },
  },
  "@keyframes sumir": {
    from: { opacity: 1 },
    to: { opacity: 0 },
  },

  cartao: {
    position: "relative",
    width: "100%",
    maxWidth: 520,
    padding: "44px 44px 34px",
    borderRadius: 24,
    color: "#fff",
    textAlign: "center",
    overflow: "hidden",
    // O fundo anterior era quase um azul unico (#061b4a -> #0b2f86): pouca
    // variacao de luz, entao a peca inteira lia como um bloco chapado. Aqui
    // a base e mais clara e viva, e tres focos de luz em posicoes diferentes
    // criam profundidade — verde embaixo, violeta no canto e um brilho no
    // topo, atras do avatar.
    background: [
      "radial-gradient(520px 240px at 50% -10%, rgba(255,255,255,0.16), transparent 60%)",
      "radial-gradient(420px 300px at 108% 8%, rgba(139,92,246,0.38), transparent 62%)",
      "radial-gradient(560px 300px at 12% 118%, rgba(34,197,94,0.32), transparent 64%)",
      "linear-gradient(140deg, #12307d 0%, #1b40a8 48%, #2450c9 100%)",
    ].join(", "),
    // Borda interna clara: separa o cartao do fundo escurecido e evita a
    // sensacao de mancha sem contorno.
    boxShadow:
      "0 44px 90px -30px rgba(2,6,23,0.8), inset 0 0 0 1px rgba(255,255,255,0.14), inset 0 1px 0 rgba(255,255,255,0.22)",
    animation: "$entrar 420ms cubic-bezier(0.22, 1, 0.36, 1)",
    [theme.breakpoints.down("xs")]: {
      padding: "34px 24px 28px",
    },
  },
  cartaoSaindo: {
    animation: "$sair 280ms cubic-bezier(0.4, 0, 1, 1) forwards",
  },
  "@keyframes entrar": {
    from: { opacity: 0, transform: "translateY(22px) scale(0.94)" },
    to: { opacity: 1, transform: "translateY(0) scale(1)" },
  },
  "@keyframes sair": {
    from: { opacity: 1, transform: "scale(1)" },
    to: { opacity: 0, transform: "scale(0.96)" },
  },

  avatar: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 82,
    height: 82,
    margin: "0 auto 24px",
    borderRadius: 24,
    fontSize: 34,
    fontWeight: 700,
    letterSpacing: "-0.02em",
    // Antes era um quadrado quase invisivel sobre o fundo. Com o degrade
    // claro e o halo em volta ele vira o ponto de foco da peca.
    background: "linear-gradient(160deg, rgba(255,255,255,0.30), rgba(255,255,255,0.12))",
    border: "1px solid rgba(255,255,255,0.35)",
    boxShadow:
      "0 12px 28px -10px rgba(2,6,23,0.55), 0 0 0 8px rgba(255,255,255,0.06)",
    textShadow: "0 1px 2px rgba(2,6,23,0.35)",
  },
  saudacao: {
    margin: 0,
    textShadow: "0 2px 12px rgba(2,6,23,0.30)",
    fontSize: 30,
    fontWeight: 700,
    lineHeight: 1.22,
    letterSpacing: "-0.02em",
    [theme.breakpoints.down("xs")]: { fontSize: 24 },
  },
  frase: {
    margin: "14px auto 0",
    maxWidth: 400,
    fontSize: 16,
    lineHeight: 1.6,
    // 0.72 sobre fundo escuro ficava apagado; 0.86 mantem a hierarquia em
    // relacao ao titulo sem parecer texto desativado.
    color: "rgba(255,255,255,0.86)",
  },
  fechar: {
    position: "absolute",
    top: 16,
    right: 16,
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 32,
    height: 32,
    padding: 0,
    border: "none",
    borderRadius: 10,
    cursor: "pointer",
    color: "rgba(255,255,255,0.55)",
    background: "transparent",
    "&:hover": { color: "#fff", background: "rgba(255,255,255,0.10)" },
  },
  naoVerMais: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    marginTop: 30,
    padding: "9px 18px",
    borderRadius: 10,
    cursor: "pointer",
    fontSize: 13,
    fontWeight: 500,
    fontFamily: "inherit",
    // Estava com 0.55 de opacidade e sem contorno: parecia texto desativado
    // em vez de acao. Agora e um botao discreto, mas legivel.
    color: "rgba(255,255,255,0.78)",
    background: "rgba(255,255,255,0.08)",
    border: "1px solid rgba(255,255,255,0.16)",
    transition: "background 180ms, color 180ms",
    "&:hover": { color: "#fff", background: "rgba(255,255,255,0.16)" },
  },
  barra: {
    position: "absolute",
    left: 0,
    bottom: 0,
    height: 4,
    borderRadius: "0 4px 4px 0",
    background: "linear-gradient(90deg, #22c55e, #86efac)",
    boxShadow: "0 0 12px rgba(34,197,94,0.6)",
    animation: "$encolher 7000ms linear forwards",
  },
  "@keyframes encolher": {
    from: { width: "100%" },
    to: { width: "0%" },
  },
}));

const DURACAO = 7000;

const primeiroNome = nome => String(nome || "").trim().split(/\s+/)[0] || "";

const chaveDaSaudacao = () => {
  const hora = new Date().getHours();
  if (hora < 12) return "morning";
  if (hora < 18) return "afternoon";
  return "evening";
};

/** Sorteia um índice ainda não usado e registra o uso. */
const sortearFrase = () => {
  let usadas = [];
  try {
    usadas = JSON.parse(localStorage.getItem(CHAVE_USADAS) || "[]");
    if (!Array.isArray(usadas)) usadas = [];
  } catch {
    usadas = [];
  }

  const todas = Array.from({ length: TOTAL_FRASES }, (_, i) => i + 1);
  let disponiveis = todas.filter(i => !usadas.includes(i));

  if (disponiveis.length === 0) {
    // Ciclo completo: reinicia, mas sem deixar a última repetir de imediato.
    const ultima = usadas[usadas.length - 1];
    disponiveis = todas.filter(i => i !== ultima);
    usadas = [];
  }

  const escolhida = disponiveis[Math.floor(Math.random() * disponiveis.length)];

  try {
    localStorage.setItem(CHAVE_USADAS, JSON.stringify([...usadas, escolhida]));
  } catch {
    // Sem storage a frase ainda aparece; só não há controle de repetição.
  }

  return escolhida;
};

const WelcomeGreeting = () => {
  const classes = useStyles();
  const [dados, setDados] = useState(null);
  const [saindo, setSaindo] = useState(false);

  useEffect(() => {
    let bruto;
    try {
      // Desativada pelo próprio usuário: nem lê a marca do login.
      if (localStorage.getItem(CHAVE_DESATIVADA) === "true") return undefined;

      bruto = sessionStorage.getItem("boasVindas");
      // Apaga na leitura: remontagem do layout não repete a saudação.
      sessionStorage.removeItem("boasVindas");
    } catch {
      return undefined;
    }

    if (!bruto) return undefined;

    let lido;
    try {
      lido = JSON.parse(bruto);
    } catch {
      return undefined;
    }

    // Marca antiga (aba deixada aberta) não vira saudação fora de hora.
    if (!lido?.em || Date.now() - lido.em > 60000) return undefined;

    setDados({ ...lido, frase: sortearFrase() });

    const paraSair = setTimeout(() => setSaindo(true), DURACAO);
    const paraRemover = setTimeout(() => setDados(null), DURACAO + 280);

    return () => {
      clearTimeout(paraSair);
      clearTimeout(paraRemover);
    };
  }, []);

  const fechar = () => setSaindo(true);

  const naoVerMais = () => {
    try {
      localStorage.setItem(CHAVE_DESATIVADA, "true");
    } catch {
      // Sem storage não dá para lembrar da escolha; ao menos fecha agora.
    }
    setSaindo(true);
  };

  const nome = useMemo(() => primeiroNome(dados?.nome), [dados]);

  if (!dados) return null;

  const inicial = (nome[0] || "?").toUpperCase();
  const periodo = chaveDaSaudacao();

  return (
    <div
      className={`${classes.fundo} ${saindo ? classes.fundoSaindo : ""}`}
      role="status"
      aria-live="polite"
      onClick={fechar}
    >
      {/* Clique dentro do cartão não fecha: só o fundo e os botões. */}
      <div
        className={`${classes.cartao} ${saindo ? classes.cartaoSaindo : ""}`}
        onClick={e => e.stopPropagation()}
      >
        <button
          type="button"
          className={classes.fechar}
          onClick={fechar}
          aria-label={i18n.t("welcome.close")}
        >
          <X size={16} strokeWidth={2.2} />
        </button>

        <div className={classes.avatar}>{inicial}</div>

        <h2 className={classes.saudacao}>
          {nome
            ? i18n.t(`welcome.${periodo}WithName`, { name: nome })
            : i18n.t(`welcome.${periodo}`)}
        </h2>

        <p className={classes.frase}>
          {i18n.t(`welcome.messages.m${dados.frase}`)}
        </p>

        <button type="button" className={classes.naoVerMais} onClick={naoVerMais}>
          {i18n.t("welcome.dontShowAgain")}
        </button>

        {!saindo && <span className={classes.barra} />}
      </div>
    </div>
  );
};

export default WelcomeGreeting;
