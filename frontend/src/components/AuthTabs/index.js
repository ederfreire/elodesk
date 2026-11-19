import React from "react";
import { useHistory } from "react-router-dom";
import { makeStyles } from "@material-ui/core/styles";

import { i18n } from "../../translate/i18n";

/**
 * Abas "Entrar / Cadastre-se" do topo da cartela de autenticacao.
 *
 * POR QUE NAVEGA EM VEZ DE TROCAR ESTADO
 * No projeto de referencia login e cadastro vivem na MESMA rota (/auth), com
 * um `useState` alternando os dois formularios. Aqui eles sao duas paginas
 * separadas, cada uma com sua propria logica: o Login trata o handoff do
 * Google OAuth por parametro na URL, e o Signup tem tres etapas (plano,
 * formulario, verificacao), leitura de convite e checagem de plano.
 *
 * Fundir as duas em uma rota so significaria mover essa logica toda para um
 * componente novo — e quebraria os links diretos para /signup que ja existem
 * (o proprio Login redireciona para `/signup?email=...&name=...` quando o
 * Google devolve "needs_signup"). As abas navegam entre as rotas: o visual e
 * o mesmo e nada disso se perde.
 *
 * A pilula anima por transicao de CSS (`transform`), nao por layoutId do
 * framer-motion, que nao existe neste projeto. Entre rotas a animacao nao
 * seria compartilhada de qualquer forma.
 */

const useStyles = makeStyles(theme => ({
  trilho: {
    position: "relative",
    // width 100% explicito: se o pai for `display: flex`, a trilha vira item
    // flex e encolhe para a largura do conteudo, deixando sobra do lado. Foi
    // o que aconteceu no Signup.
    width: "100%",
    boxSizing: "border-box",
    display: "grid",
    gridTemplateColumns: "1fr 1fr",
    padding: 4,
    borderRadius: 12,
    backgroundColor:
      theme.palette.type === "dark"
        ? "rgba(255,255,255,0.06)"
        : "rgba(15,23,42,0.05)",
  },
  pilula: {
    position: "absolute",
    top: 4,
    left: 4,
    width: "calc(50% - 4px)",
    height: "calc(100% - 8px)",
    borderRadius: 8,
    backgroundColor: theme.palette.type === "dark" ? "#1e293b" : "#fff",
    boxShadow: "0 1px 2px rgba(15,23,42,0.10)",
    border: `1px solid ${
      theme.palette.type === "dark"
        ? "rgba(255,255,255,0.10)"
        : "rgba(15,23,42,0.08)"
    }`,
    // Curva com leve overshoot: imita a "mola" do original sem biblioteca.
    transition: "transform 320ms cubic-bezier(0.34, 1.4, 0.64, 1)",
  },
  pilulaDireita: {
    transform: "translateX(100%)",
  },
  aba: {
    position: "relative",
    zIndex: 1,
    padding: "10px 16px",
    border: "none",
    borderRadius: 8,
    background: "transparent",
    cursor: "pointer",
    fontSize: 14,
    fontWeight: 600,
    fontFamily: "inherit",
    transition: "color 200ms",
    color: theme.palette.text.secondary,
    "&:hover": { color: theme.palette.text.primary },
  },
  abaAtiva: {
    color: theme.palette.text.primary,
  },
  desabilitada: {
    opacity: 0.45,
    cursor: "not-allowed",
    "&:hover": { color: theme.palette.text.secondary },
  },
}));

/**
 * @param {"login"|"signup"} mode  aba ativa
 * @param {boolean} allowSignup    cadastro liberado para esta empresa
 */
const AuthTabs = ({ mode, allowSignup = true }) => {
  const classes = useStyles();
  const history = useHistory();

  const abas = [
    { id: "login", rotulo: i18n.t("authTabs.login"), rota: "/login" },
    { id: "signup", rotulo: i18n.t("authTabs.signup"), rota: "/signup" },
  ];

  const ir = aba => {
    // Com cadastro desativado a aba fica visivel porem inerte: some-la
    // deixaria a pilula ocupando a largura toda e descaracterizaria o
    // controle.
    if (aba.id === "signup" && !allowSignup) return;
    if (aba.id === mode) return;
    history.push(aba.rota);
  };

  return (
    <div className={classes.trilho} role="tablist">
      <span
        aria-hidden
        className={`${classes.pilula} ${
          mode === "signup" ? classes.pilulaDireita : ""
        }`}
      />
      {abas.map(aba => {
        const ativa = mode === aba.id;
        const inerte = aba.id === "signup" && !allowSignup;
        return (
          <button
            key={aba.id}
            type="button"
            role="tab"
            aria-selected={ativa}
            onClick={() => ir(aba)}
            className={`${classes.aba} ${ativa ? classes.abaAtiva : ""} ${
              inerte ? classes.desabilitada : ""
            }`}
          >
            {aba.rotulo}
          </button>
        );
      })}
    </div>
  );
};

export default AuthTabs;
