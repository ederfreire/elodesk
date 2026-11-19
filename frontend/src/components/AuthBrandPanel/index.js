import React from "react";
import { makeStyles } from "@material-ui/core/styles";
import {
  MessageSquare,
  Users,
  Zap,
  BarChart3,
  Check,
  Star,
  Lock,
  Settings,
} from "lucide-react";

/**
 * Painel escuro da esquerda das telas de autenticacao.
 *
 * POR QUE UM COMPONENTE UNICO
 * Login e Signup tinham cada um a SUA copia desse painel, com blobs, grade de
 * pontos, onda, headline, quatro features e o cartao de destaque — tudo
 * duplicado em CSS e JSX. Ficavam parecidos por acaso, e qualquer ajuste
 * precisava ser feito duas vezes. Agora e um so, e o que muda entre as duas
 * telas e apenas o objeto CONTEUDO abaixo.
 *
 * ICONES
 * Lucide, como no layout de referencia. Os icones do Material que estavam
 * aqui (ChatBubbleOutline, FlashOn, BarChart) tem peso de traco diferente e
 * era justamente o que destoava.
 *
 * ANIMACAO
 * Keyframes de CSS com `key` no modo. Sem framer-motion no projeto, nao ha
 * AnimatePresence; como cada modo e uma rota, o painel remonta na navegacao e
 * a animacao de entrada da o mesmo efeito percebido do original.
 */

const CONTEUDO = {
  login: {
    titulo: [
      { texto: "Atendimento que ", destaque: "conecta." },
      { texto: "Relacionamento que ", destaque: "fideliza." },
    ],
    chamada:
      "O {app} é a plataforma completa para atender, vender e se relacionar melhor com seus clientes — tudo em um só lugar.",
    features: [
      { Icone: MessageSquare, titulo: "Omnichannel", texto: "Todos os canais em uma plataforma" },
      { Icone: Users, titulo: "Colaboração", texto: "Times alinhados e produtivos" },
      { Icone: Zap, titulo: "Automação", texto: "Mais agilidade e eficiência" },
      { Icone: BarChart3, titulo: "Relatórios", texto: "Dados que geram melhores resultados" },
    ],
    nota: {
      Icone: Settings,
      forte: "Mais que um chat.",
      resto: " A plataforma de atendimento que ",
      destaque: "impulsiona",
      fim: " o seu negócio.",
    },
  },
  signup: {
    titulo: [
      { texto: "Comece ", destaque: "grátis." },
      { texto: "Cresça ", destaque: "sem limites." },
    ],
    chamada:
      "Crie sua conta no {app} em segundos e centralize WhatsApp, Instagram e Facebook em uma única plataforma de atendimento.",
    features: [
      { Icone: Check, titulo: "Teste grátis", texto: "Sem cartão de crédito, sem compromisso." },
      { Icone: Zap, titulo: "Configuração rápida", texto: "Conecte seus canais em poucos cliques." },
      { Icone: Star, titulo: "Suporte humano", texto: "Time pronto para ajudar no que precisar." },
      { Icone: Lock, titulo: "Seus dados seguros", texto: "Criptografia e privacidade em primeiro lugar." },
    ],
    nota: {
      Icone: Star,
      forte: "Mais de mil empresas",
      resto: " já transformaram o atendimento com o ",
      destaque: "{app}",
      fim: ".",
    },
  },
};

const VERDE = "#22c55e";

const useStyles = makeStyles(theme => ({
  painel: {
    flex: "1 1 55%",
    position: "relative",
    overflow: "hidden",
    display: "flex",
    flexDirection: "column",
    justifyContent: "space-between",
    padding: "64px 72px",
    color: "#fff",
    background:
      "radial-gradient(1200px 600px at -10% 110%, rgba(34,197,94,0.18), transparent 60%), linear-gradient(135deg, #061b4a 0%, #082466 45%, #0b2f86 100%)",
    [theme.breakpoints.down("md")]: { padding: "48px 40px" },
    [theme.breakpoints.down("sm")]: { display: "none" },
  },
  blob: {
    position: "absolute",
    top: -160,
    left: -160,
    width: 448,
    height: 448,
    borderRadius: "50%",
    background: "rgba(59,130,246,0.25)",
    filter: "blur(120px)",
    pointerEvents: "none",
  },
  blobBaixo: {
    position: "absolute",
    bottom: -192,
    left: 0,
    width: 512,
    height: 512,
    borderRadius: "50%",
    background: "rgba(34,197,94,0.12)",
    filter: "blur(140px)",
    pointerEvents: "none",
  },
  pontos: {
    position: "absolute",
    top: 96,
    right: 64,
    width: 224,
    height: 176,
    opacity: 0.6,
    pointerEvents: "none",
    backgroundImage: "radial-gradient(rgba(255,255,255,0.35) 1px, transparent 1px)",
    backgroundSize: "16px 16px",
  },
  marca: { position: "relative", zIndex: 1 },
  marcaLogo: { maxHeight: 84, maxWidth: 340, objectFit: "contain" },
  marcaTexto: { fontSize: 34, fontWeight: 800, letterSpacing: "-0.02em" },

  conteudo: {
    position: "relative",
    zIndex: 1,
    maxWidth: 640,
    animation: "$entrar 480ms cubic-bezier(0.22, 1, 0.36, 1)",
  },
  "@keyframes entrar": {
    from: { opacity: 0, transform: "translateY(18px)" },
    to: { opacity: 1, transform: "translateY(0)" },
  },

  titulo: {
    margin: 0,
    fontSize: "2.6rem",
    fontWeight: 800,
    lineHeight: 1.12,
    letterSpacing: "-0.02em",
    [theme.breakpoints.down("md")]: { fontSize: "2.1rem" },
  },
  linha: { display: "block" },
  verde: { color: VERDE },

  chamada: {
    marginTop: 24,
    maxWidth: 460,
    fontSize: "0.95rem",
    lineHeight: 1.65,
    color: "rgba(255,255,255,0.70)",
  },

  features: {
    listStyle: "none",
    margin: "40px 0 0",
    padding: 0,
    display: "grid",
    gridTemplateColumns: "repeat(4, minmax(0, 1fr))",
    gap: 32,
    [theme.breakpoints.down("md")]: {
      gridTemplateColumns: "repeat(2, minmax(0, 1fr))",
    },
  },
  featureIcone: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    width: 48,
    height: 48,
    borderRadius: 12,
    background: "rgba(255,255,255,0.08)",
    boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.12)",
    color: VERDE,
  },
  featureTitulo: {
    margin: "16px 0 0",
    fontSize: 14,
    fontWeight: 600,
  },
  featureTexto: {
    margin: "4px 0 0",
    fontSize: 12,
    lineHeight: 1.6,
    color: "rgba(255,255,255,0.55)",
  },

  nota: {
    display: "flex",
    alignItems: "flex-start",
    gap: 16,
    maxWidth: 512,
    marginTop: 40,
    padding: 20,
    borderRadius: 12,
    border: "1px solid rgba(255,255,255,0.10)",
    background: "rgba(255,255,255,0.06)",
  },
  notaIcone: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
    width: 36,
    height: 36,
    borderRadius: 8,
    background: "rgba(34,197,94,0.15)",
    color: VERDE,
  },
  notaTexto: {
    margin: 0,
    fontSize: 14,
    lineHeight: 1.65,
    color: "rgba(255,255,255,0.75)",
  },
  notaForte: { fontWeight: 600, color: "#fff" },
  notaDestaque: { fontWeight: 600, color: VERDE },
}));

/**
 * @param {"login"|"signup"} mode
 * @param {string} appName    nome whitelabel
 * @param {string} logo       url do logo whitelabel (opcional)
 * @param {string} background fundo whitelabel; quando definido, substitui
 *                            toda a arte — e a regra que ja existia no Login.
 */
const AuthBrandPanel = ({ mode = "login", appName, logo, background }) => {
  const classes = useStyles();
  const c = CONTEUDO[mode] || CONTEUDO.login;
  const nome = appName || "EquipeChat";
  const comNome = texto => String(texto).replace(/\{app\}/g, nome);

  if (background) {
    return (
      <div
        className={classes.painel}
        style={{
          backgroundImage: `url(${background})`,
          backgroundSize: "cover",
          backgroundPosition: "center",
          backgroundRepeat: "no-repeat",
        }}
      />
    );
  }

  return (
    <div className={classes.painel}>
      <div className={classes.blob} />
      <div className={classes.blobBaixo} />
      <div className={classes.pontos} />

      <div className={classes.marca}>
        {logo ? (
          <img src={logo} alt={nome} className={classes.marcaLogo} />
        ) : (
          <span className={classes.marcaTexto}>{nome}</span>
        )}
      </div>

      {/* key no modo: forca a remontagem e com ela a animacao de entrada */}
      <div className={classes.conteudo} key={mode}>
        <h1 className={classes.titulo}>
          {c.titulo.map(linha => (
            <span key={linha.destaque} className={classes.linha}>
              {linha.texto}
              <span className={classes.verde}>{linha.destaque}</span>
            </span>
          ))}
        </h1>

        <p className={classes.chamada}>{comNome(c.chamada)}</p>

        <ul className={classes.features}>
          {c.features.map(f => (
            <li key={f.titulo}>
              <span className={classes.featureIcone}>
                <f.Icone size={20} strokeWidth={2} />
              </span>
              <p className={classes.featureTitulo}>{f.titulo}</p>
              <p className={classes.featureTexto}>{f.texto}</p>
            </li>
          ))}
        </ul>

        <div className={classes.nota}>
          <span className={classes.notaIcone}>
            <c.nota.Icone size={16} strokeWidth={2} />
          </span>
          <p className={classes.notaTexto}>
            <strong className={classes.notaForte}>{comNome(c.nota.forte)}</strong>
            {c.nota.resto}
            <span className={classes.notaDestaque}>{comNome(c.nota.destaque)}</span>
            {c.nota.fim}
          </p>
        </div>
      </div>

      <div />
    </div>
  );
};

export default AuthBrandPanel;
