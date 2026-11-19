import React, { useMemo } from "react";
import { makeStyles } from "@material-ui/core/styles";
import Box from "@material-ui/core/Box";
import Typography from "@material-ui/core/Typography";

import { i18n } from "../../translate/i18n";

/**
 * Mini grafico de enviadas x recebidas dos ultimos 7 dias, para o card de
 * conexao.
 *
 * DECISAO: SVG na mao, sem recharts nem chart.js — mesmo os dois estando no
 * projeto. A tela de conexoes renderiza um card por conexao, e uma biblioteca
 * de grafico monta seu proprio ResponsiveContainer com observador de resize
 * por instancia. Com vinte cards isso vira vinte observadores e um custo de
 * re-render sensivel numa tela que ja atualiza sozinha por socket. Duas
 * polilinhas e um path de area resolvem sem nada disso.
 */

const ALTURA = 64;
const LARGURA = 260;
const MARGEM = 4;

const useStyles = makeStyles(theme => ({
  caixa: {
    background:
      theme.palette.type === "dark"
        ? "rgba(255,255,255,0.03)"
        : "rgba(99,102,241,0.04)",
    borderRadius: 10,
    padding: theme.spacing(1.2),
    marginBottom: theme.spacing(1.2),
  },
  topo: {
    display: "flex",
    alignItems: "center",
    justifyContent: "space-between",
    marginBottom: 6,
  },
  rotulo: {
    fontSize: 10,
    fontWeight: 700,
    letterSpacing: "0.06em",
    textTransform: "uppercase",
    color: theme.palette.text.secondary,
  },
  totais: {
    display: "flex",
    gap: theme.spacing(1.5),
  },
  total: {
    display: "flex",
    flexDirection: "column",
    alignItems: "flex-end",
    lineHeight: 1.1,
  },
  totalRotulo: {
    fontSize: 9,
    fontWeight: 700,
    letterSpacing: "0.04em",
    textTransform: "uppercase",
  },
  totalValor: {
    fontSize: 17,
    fontWeight: 700,
  },
  enviadas: { color: "#6366f1" },
  recebidas: { color: "#10b981" },
  vazio: {
    fontSize: 11,
    color: theme.palette.text.secondary,
    textAlign: "center",
    padding: "14px 0",
  },
}));

// Curva suave por Catmull-Rom convertido em Bezier cubica. Uma polilinha reta
// entre 7 pontos fica angulosa demais nesse tamanho.
const suavizar = pontos => {
  if (pontos.length < 2) return "";
  let d = `M ${pontos[0].x} ${pontos[0].y}`;
  for (let i = 0; i < pontos.length - 1; i += 1) {
    const p0 = pontos[i - 1] || pontos[i];
    const p1 = pontos[i];
    const p2 = pontos[i + 1];
    const p3 = pontos[i + 2] || p2;
    const c1x = p1.x + (p2.x - p0.x) / 6;
    const c1y = p1.y + (p2.y - p0.y) / 6;
    const c2x = p2.x - (p3.x - p1.x) / 6;
    const c2y = p2.y - (p3.y - p1.y) / 6;
    d += ` C ${c1x} ${c1y}, ${c2x} ${c2y}, ${p2.x} ${p2.y}`;
  }
  return d;
};

const ConnectionStatsChart = ({ stats }) => {
  const classes = useStyles();

  const dias = stats?.dias || [];
  const totalEnviadas = stats?.totalEnviadas || 0;
  const totalRecebidas = stats?.totalRecebidas || 0;

  const { caminhoEnviadas, caminhoRecebidas, areaRecebidas } = useMemo(() => {
    if (dias.length === 0) {
      return { caminhoEnviadas: "", caminhoRecebidas: "", areaRecebidas: "" };
    }

    // Escala compartilhada entre as duas series: escalas separadas fariam um
    // dia com 2 mensagens parecer igual a um dia com 200.
    const maximo = Math.max(
      1,
      ...dias.map(d => Math.max(d.enviadas, d.recebidas))
    );

    const passo = dias.length > 1 ? (LARGURA - MARGEM * 2) / (dias.length - 1) : 0;
    const y = valor =>
      ALTURA - MARGEM - (valor / maximo) * (ALTURA - MARGEM * 2);

    const pEnviadas = dias.map((d, i) => ({
      x: MARGEM + i * passo,
      y: y(d.enviadas),
    }));
    const pRecebidas = dias.map((d, i) => ({
      x: MARGEM + i * passo,
      y: y(d.recebidas),
    }));

    const linhaRecebidas = suavizar(pRecebidas);

    return {
      caminhoEnviadas: suavizar(pEnviadas),
      caminhoRecebidas: linhaRecebidas,
      areaRecebidas: linhaRecebidas
        ? `${linhaRecebidas} L ${pRecebidas[pRecebidas.length - 1].x} ${ALTURA} L ${pRecebidas[0].x} ${ALTURA} Z`
        : "",
    };
  }, [dias]);

  return (
    <Box className={classes.caixa}>
      <Box className={classes.topo}>
        <Typography className={classes.rotulo}>
          {i18n.t("connections.stats.last7days")}
        </Typography>
        <Box className={classes.totais}>
          <Box className={classes.total}>
            <span className={`${classes.totalRotulo} ${classes.enviadas}`}>
              ↗ {i18n.t("connections.stats.sent")}
            </span>
            <span className={`${classes.totalValor} ${classes.enviadas}`}>
              {totalEnviadas}
            </span>
          </Box>
          <Box className={classes.total}>
            <span className={`${classes.totalRotulo} ${classes.recebidas}`}>
              ↓ {i18n.t("connections.stats.received")}
            </span>
            <span className={`${classes.totalValor} ${classes.recebidas}`}>
              {totalRecebidas}
            </span>
          </Box>
        </Box>
      </Box>

      {dias.length === 0 ? (
        <div className={classes.vazio}>
          {i18n.t("connections.stats.noData")}
        </div>
      ) : (
        <svg
          viewBox={`0 0 ${LARGURA} ${ALTURA}`}
          width="100%"
          height={ALTURA}
          preserveAspectRatio="none"
        >
          <defs>
            {/* id unico por conexao: dois gradientes com o mesmo id em cards
                diferentes fazem o navegador reaproveitar o primeiro. */}
            <linearGradient
              id={`grad-recebidas-${stats?.whatsappId || "x"}`}
              x1="0"
              y1="0"
              x2="0"
              y2="1"
            >
              <stop offset="0%" stopColor="#10b981" stopOpacity="0.35" />
              <stop offset="100%" stopColor="#10b981" stopOpacity="0" />
            </linearGradient>
          </defs>

          {areaRecebidas && (
            <path
              d={areaRecebidas}
              fill={`url(#grad-recebidas-${stats?.whatsappId || "x"})`}
            />
          )}
          {caminhoRecebidas && (
            <path
              d={caminhoRecebidas}
              fill="none"
              stroke="#10b981"
              strokeWidth="2"
              strokeLinecap="round"
            />
          )}
          {caminhoEnviadas && (
            <path
              d={caminhoEnviadas}
              fill="none"
              stroke="#6366f1"
              strokeWidth="2"
              strokeLinecap="round"
            />
          )}
        </svg>
      )}
    </Box>
  );
};

export default ConnectionStatsChart;
