import React, { Suspense, lazy, useMemo } from "react";
import { useHistory, useLocation } from "react-router-dom";
import { makeStyles } from "@material-ui/core/styles";
import Tabs from "@material-ui/core/Tabs";
import Tab from "@material-ui/core/Tab";
import Paper from "@material-ui/core/Paper";
import CircularProgress from "@material-ui/core/CircularProgress";
import Box from "@material-ui/core/Box";
import {
  BarChart3,
  FileText,
  Megaphone,
  Users,
  Phone,
  Repeat,
  Globe,
} from "lucide-react";

import { i18n } from "../../translate/i18n";
import { AuthContext } from "../../context/Auth/AuthContext";

/**
 * Central de relatórios: uma entrada de menu, vários relatórios em abas.
 *
 * POR QUE ISSO EXISTE
 * Os relatórios eram seis entradas soltas no menu (Relatórios, Fechamento,
 * Anúncios, Desempenho, Chamadas, FollowUP). Quem queria comparar dois deles
 * precisava voltar ao menu a cada troca, e a lista empurrava o resto do menu
 * para baixo. Agrupados em abas, a troca é imediata e o menu volta a ter um
 * item só.
 *
 * AS ROTAS ANTIGAS CONTINUAM VALENDO
 * `/closing-report`, `/ads-report`, `/user-performance` e `/call-report`
 * seguem registradas no router. Links salvos, favoritos e qualquer
 * `history.push` espalhado pelo sistema continuam funcionando — só deixam de
 * aparecer no menu. Remover as rotas seria quebrar coisa que já está no ar
 * por um ganho de organização.
 *
 * A aba ativa vai na query string (`/reports?aba=anuncios`), não em estado
 * interno: assim dá para mandar o link de uma aba específica para alguém, e
 * o botão voltar do navegador funciona entre as abas.
 */

const Reports = lazy(() => import("../Reports"));
const ClosingReport = lazy(() => import("../ClosingReport"));
const AdsReport = lazy(() => import("../AdsReport"));
const UserPerformanceReport = lazy(() => import("../UserPerformanceReport"));
const CallHistoricals = lazy(() => import("../CallHistoricals"));
const GeoReport = lazy(() => import("../GeoReport"));
const FloupDashboard = lazy(() => import("../FloupDashboard"));

const useStyles = makeStyles(theme => ({
  raiz: {
    display: "flex",
    flexDirection: "column",
    height: "100%",
    minHeight: 0,
  },
  barra: {
    borderRadius: 0,
    borderBottom: `1px solid ${theme.palette.divider}`,
    backgroundColor: theme.palette.background.paper,
    flexShrink: 0,
  },
  aba: {
    minHeight: 56,
    textTransform: "none",
    fontSize: 14,
    fontWeight: 600,
    letterSpacing: "-0.01em",
    // O MUI aplica minWidth 160px nas abas em telas grandes e quebra o texto
    // quando ele nao cabe. "Desempenho dos Atendentes" partia em duas linhas
    // e desalinhava a fileira inteira, deixando essa aba mais alta que as
    // outras. Como a barra ja e `scrollable`, largura fixa nao ajuda em nada.
    minWidth: "auto !important",
    maxWidth: "none",
    padding: "0 22px",
    whiteSpace: "nowrap",
    "& .MuiTab-wrapper": {
      // O rotulo do Tab no MUI v4 vive dentro de .MuiTab-wrapper, que e
      // flex-direction: column por padrao. Sem isso, icone e texto ficariam
      // empilhados.
      flexDirection: "row",
      whiteSpace: "nowrap",
    },
  },
  rotulo: {
    display: "inline-flex",
    alignItems: "center",
    gap: 8,
    whiteSpace: "nowrap",
    lineHeight: 1.2,
  },
  conteudo: {
    flex: 1,
    minHeight: 0,
    overflow: "auto",
    // A pagina de dentro recebe a altura util da area, e nao a da janela:
    // sem isso, relatorios que usam `height: 100%` calculariam a altura
    // ignorando a barra de abas e sobrariam alguns pixels por baixo.
    "& > *": {
      minHeight: "100%",
      boxSizing: "border-box",
    },
  },
  carregando: {
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing(6),
  },
}));

const ReportsHub = () => {
  const classes = useStyles();
  const history = useHistory();
  const location = useLocation();
  const { user } = React.useContext(AuthContext);

  const abas = useMemo(() => {
    const lista = [
      {
        id: "geral",
        rotulo: i18n.t("mainDrawer.listItems.reports"),
        Icone: FileText,
        Componente: Reports,
      },
      {
        id: "fechamento",
        rotulo: i18n.t("closingReport.title"),
        Icone: BarChart3,
        Componente: ClosingReport,
      },
      {
        id: "anuncios",
        rotulo: i18n.t("adsReport.title"),
        Icone: Megaphone,
        Componente: AdsReport,
      },
      {
        id: "desempenho",
        rotulo: i18n.t("userPerformance.title"),
        Icone: Users,
        Componente: UserPerformanceReport,
      },
      {
        id: "geografia",
        rotulo: i18n.t("geoReport.title"),
        Icone: Globe,
        Componente: GeoReport,
      },
      {
        id: "chamadas",
        rotulo: i18n.t("callReport.title"),
        Icone: Phone,
        Componente: CallHistoricals,
      },
    ];

    // FollowUP é painel de admin; segue a mesma condição que tinha no menu.
    if (user?.profile === "admin") {
      lista.push({
        id: "followup",
        rotulo: i18n.t("contactModalExtra.followUpPanel"),
        Icone: Repeat,
        Componente: FloupDashboard,
      });
    }

    return lista;
  }, [user?.profile]);

  const parametros = new URLSearchParams(location.search);
  const pedida = parametros.get("aba");
  // Aba inválida na URL cai na primeira, em vez de deixar a tela em branco.
  const ativa = abas.some(a => a.id === pedida) ? pedida : abas[0].id;

  const trocar = (evento, novaAba) => {
    history.replace(`/reports?aba=${novaAba}`);
  };

  const Atual = abas.find(a => a.id === ativa)?.Componente;

  return (
    <div className={classes.raiz}>
      <Paper className={classes.barra} elevation={0} square>
        <Tabs
          value={ativa}
          onChange={trocar}
          indicatorColor="primary"
          textColor="primary"
          variant="scrollable"
          scrollButtons="auto"
        >
          {abas.map(aba => (
            <Tab
              key={aba.id}
              value={aba.id}
              className={classes.aba}
              label={
                <span className={classes.rotulo}>
                  {/* flexShrink 0: sem isso o icone encolhe quando a aba
                      compete por espaco, e os icones ficam de tamanhos
                      diferentes entre si. */}
                  <aba.Icone
                    size={17}
                    strokeWidth={2}
                    style={{ flexShrink: 0 }}
                  />
                  {aba.rotulo}
                </span>
              }
            />
          ))}
        </Tabs>
      </Paper>

      <Box className={classes.conteudo}>
        <Suspense
          fallback={
            <div className={classes.carregando}>
              <CircularProgress size={28} />
            </div>
          }
        >
          {/* `key` na aba: força a desmontagem do relatório anterior. Sem
              isso, um relatório que busca dados no `useEffect` de montagem
              não recarregaria ao voltar para ele. */}
          {Atual && <Atual key={ativa} />}
        </Suspense>
      </Box>
    </div>
  );
};

export default ReportsHub;
