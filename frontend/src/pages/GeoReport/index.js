import React, { useEffect, useMemo, useRef, useState } from "react";
import { makeStyles } from "@material-ui/core/styles";
import Paper from "@material-ui/core/Paper";
import Typography from "@material-ui/core/Typography";
import TextField from "@material-ui/core/TextField";
import Button from "@material-ui/core/Button";
import Box from "@material-ui/core/Box";
import CircularProgress from "@material-ui/core/CircularProgress";
import MenuItem from "@material-ui/core/MenuItem";
import Table from "@material-ui/core/Table";
import TableBody from "@material-ui/core/TableBody";
import TableCell from "@material-ui/core/TableCell";
import TableHead from "@material-ui/core/TableHead";
import TableRow from "@material-ui/core/TableRow";
import { Globe, MapPin, Users, FileDown, Sheet } from "lucide-react";
import * as XLSX from "xlsx";
import TablePagination from "@material-ui/core/TablePagination";
import html2pdf from "../../utils/html2pdf";

import api from "../../services/api";
import toastError from "../../errors/toastError";
import { i18n } from "../../translate/i18n";

/**
 * Distribuição geográfica dos contatos, inferida do DDD/DDI do número.
 *
 * SOBRE A PALAVRA "INFERIDA"
 * O WhatsApp não expõe cidade nem estado do contato. A única pista é o DDD, e
 * ele erra em três situações comuns: número portado de outro estado, linha
 * corporativa com DDD da matriz e número fixo antigo. Por isso a tela mostra
 * sempre quantos contatos NÃO foram mapeados, em vez de arredondar tudo para
 * 100% e passar uma precisão que o dado não tem.
 *
 * POR QUE BARRAS E NÃO UM MAPA DESENHADO
 * Um mapa do Brasil em SVG desenhado à mão fica impreciso e não acrescenta
 * informação: com cinco regiões, a barra ordenada responde "onde estão meus
 * contatos" mais rápido que um polígono colorido, e ainda mostra o número
 * exato. Se o mapa for importante, dá para trocar por um GeoJSON real.
 */

const CORES_REGIAO = {
  Norte: "#f59e0b",
  Nordeste: "#10b981",
  "Centro-Oeste": "#8b5cf6",
  Sudeste: "#3b82f6",
  Sul: "#ef4444",
};

// O backend devolve a regiao pelo nome em portugues ("Nordeste"), que serve
// como identificador estavel. Aqui ele vira chave de traducao — sem isso, uma
// interface em ingles ou arabe mostraria "Centro-Oeste" no meio do texto
// traduzido. Nome de ESTADO continua como vem: e nome proprio.
const CHAVE_REGIAO = {
  Norte: "north",
  Nordeste: "northeast",
  "Centro-Oeste": "midwest",
  Sudeste: "southeast",
  Sul: "south",
};

const traduzirRegiao = regiao =>
  CHAVE_REGIAO[regiao]
    ? i18n.t(`geoReport.regions.${CHAVE_REGIAO[regiao]}`, regiao)
    : regiao;

const useStyles = makeStyles(theme => ({
  raiz: { padding: theme.spacing(2) },
  filtros: {
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(2),
    flexWrap: "wrap",
    padding: theme.spacing(2),
    marginBottom: theme.spacing(2),
    borderRadius: 12,
  },
  resumo: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
    gap: theme.spacing(2),
    marginBottom: theme.spacing(2),
  },
  cartaoResumo: {
    padding: theme.spacing(2),
    borderRadius: 12,
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(1.5),
  },
  valorResumo: { fontSize: 26, fontWeight: 700, lineHeight: 1.1 },
  rotuloResumo: { fontSize: 12, color: theme.palette.text.secondary },
  colunas: {
    display: "grid",
    gridTemplateColumns: "repeat(auto-fit, minmax(340px, 1fr))",
    gap: theme.spacing(2),
  },
  bloco: { padding: theme.spacing(2), borderRadius: 12 },
  tituloBloco: {
    display: "flex",
    alignItems: "center",
    gap: 8,
    fontSize: 15,
    fontWeight: 700,
    marginBottom: theme.spacing(0.5),
  },
  ajuda: {
    fontSize: 12,
    color: theme.palette.text.secondary,
    marginBottom: theme.spacing(2),
    lineHeight: 1.5,
  },
  linha: {
    display: "flex",
    alignItems: "center",
    gap: theme.spacing(1.5),
    marginBottom: theme.spacing(1.2),
  },
  posicao: {
    width: 20,
    fontSize: 12,
    color: theme.palette.text.secondary,
    flexShrink: 0,
  },
  sigla: {
    width: 40,
    flexShrink: 0,
    textAlign: "center",
    fontSize: 11,
    fontWeight: 700,
    padding: "3px 0",
    borderRadius: 6,
    backgroundColor:
      theme.palette.type === "dark"
        ? "rgba(255,255,255,0.07)"
        : "rgba(99,102,241,0.10)",
  },
  nome: { flex: "0 0 auto", fontSize: 13, fontWeight: 600, minWidth: 130 },
  regiaoTexto: {
    fontSize: 11,
    fontWeight: 400,
    color: theme.palette.text.secondary,
    marginLeft: 4,
  },
  trilha: {
    flex: 1,
    height: 8,
    borderRadius: 999,
    backgroundColor:
      theme.palette.type === "dark"
        ? "rgba(255,255,255,0.07)"
        : "rgba(15,23,42,0.06)",
    overflow: "hidden",
  },
  preenchimento: { height: "100%", borderRadius: 999 },
  total: { width: 36, textAlign: "right", fontWeight: 700, fontSize: 13 },
  // Cabecalho visivel so no PDF: na tela o titulo ja esta na aba.
  cabecalhoPdf: {
    display: "none",
    justifyContent: "space-between",
    alignItems: "baseline",
    marginBottom: 14,
    paddingBottom: 8,
    borderBottom: "2px solid #0b2f86",
    fontSize: 15,
    color: "#0b2f86",
  },
  // Aplicada por um instante durante a captura. O html2canvas fotografa o
  // elemento como ele esta na tela; no tema escuro isso geraria uma folha de
  // fundo preto. Aqui as cores viram tinta.
  imprimindo: {
    backgroundColor: "#ffffff !important",
    padding: 4,
    "& $cabecalhoPdf": { display: "flex" },

    // Só COR DE TEXTO e sombra no seletor curinga. A tentacao e escrever
    // `& * { background: transparent !important }`, mas isso apagaria a cor
    // das barras — que vem de style inline e e a propria informacao do
    // grafico. Fundo e tratado nos blocos, um a um.
    "& *": {
      color: "#1e293b !important",
      boxShadow: "none !important",
    },
    "& $bloco, & $cartaoResumo": {
      backgroundColor: "#ffffff !important",
      border: "1px solid #e2e8f0 !important",
    },
    "& $trilha": { backgroundColor: "#eef2f7 !important" },
    "& $sigla": { backgroundColor: "#eef2f7 !important" },
    "& $valorResumo": { color: "#0f172a !important" },
  },
  // A barra de filtros ganhou fundo proprio: separa visualmente "o que voce
  // esta filtrando" de "o resultado", que antes se misturavam.
  filtrosTabela: {
    display: "flex",
    alignItems: "center",
    gap: 12,
    flexWrap: "wrap",
    marginBottom: 16,
    padding: theme.spacing(1.5),
    borderRadius: 10,
    backgroundColor:
      theme.palette.type === "dark"
        ? "rgba(255,255,255,0.03)"
        : "rgba(15,23,42,0.025)",
  },
  tabela: {
    "& thead th": {
      fontSize: 11,
      fontWeight: 700,
      letterSpacing: "0.04em",
      textTransform: "uppercase",
      color: theme.palette.text.secondary,
      borderBottom: `2px solid ${theme.palette.divider}`,
      whiteSpace: "nowrap",
    },
    "& tbody td": {
      fontSize: 13,
      paddingTop: 10,
      paddingBottom: 10,
    },
    // Zebrado sutil: com 25 linhas o olho perde a horizontal sem ele.
    "& tbody tr:nth-of-type(odd)": {
      backgroundColor:
        theme.palette.type === "dark"
          ? "rgba(255,255,255,0.02)"
          : "rgba(15,23,42,0.015)",
    },
    "& tbody tr:hover": {
      backgroundColor:
        theme.palette.type === "dark"
          ? "rgba(255,255,255,0.05)"
          : "rgba(37,99,235,0.05)",
    },
  },
  contagem: {
    fontSize: 12,
    fontWeight: 600,
    color: theme.palette.text.secondary,
    marginLeft: "auto",
  },
  numero: { fontFamily: "'Roboto Mono', monospace", fontSize: 12 },
  semLocal: { color: theme.palette.text.secondary, fontStyle: "italic" },
  vazio: {
    padding: theme.spacing(4),
    textAlign: "center",
    color: theme.palette.text.secondary,
    fontSize: 13,
  },
}));

const hoje = () => new Date().toISOString().slice(0, 10);
const trintaDiasAtras = () => {
  const d = new Date();
  d.setDate(d.getDate() - 30);
  return d.toISOString().slice(0, 10);
};

const GeoReport = () => {
  const classes = useStyles();

  const [inicio, setInicio] = useState(trintaDiasAtras());
  const [fim, setFim] = useState(hoje());
  const [dados, setDados] = useState(null);
  const [carregando, setCarregando] = useState(true);
  const [exportando, setExportando] = useState(false);
  // Filtro da tabela de contatos. E LOCAL, sobre o que ja veio da API: a
  // consulta ja trouxe tudo, entao filtrar no servidor seria uma ida a mais
  // para o mesmo resultado.
  const [busca, setBusca] = useState("");
  const [local, setLocal] = useState("");
  const [pagina, setPagina] = useState(0);
  const [porPagina, setPorPagina] = useState(25);

  // Referencia so no conteudo do relatorio: a barra de filtros e o botao de
  // exportar ficam de fora, para nao saírem impressos no PDF.
  const areaImpressao = useRef(null);

  const exportarPdf = async () => {
    if (!areaImpressao.current) return;

    setExportando(true);
    try {
      // A classe `imprimindo` troca as cores para tinta: fundo branco e texto
      // escuro. Sem isso, no tema escuro o PDF sairia com fundo preto e
      // gastaria toner sem necessidade.
      areaImpressao.current.classList.add(classes.imprimindo);

      // Espera um quadro para o navegador aplicar o estilo antes do
      // html2canvas fotografar o elemento.
      await new Promise(r => requestAnimationFrame(() => setTimeout(r, 60)));

      await html2pdf()
        .from(areaImpressao.current)
        .set({
          margin: 10,
          filename: `contatos-por-regiao_${inicio}_a_${fim}.pdf`,
          jsPDF: { unit: "mm", format: "a4", orientation: "landscape" },
          html2canvas: { scale: 2, useCORS: true, backgroundColor: "#ffffff" },
        })
        .save();
    } catch (err) {
      toastError(err);
    } finally {
      areaImpressao.current?.classList.remove(classes.imprimindo);
      setExportando(false);
    }
  };

  const buscar = async () => {
    setCarregando(true);
    try {
      const { data } = await api.get("/contacts/geo-distribution", {
        params: { startDate: inicio, endDate: fim },
      });
      setDados(data);
    } catch (err) {
      toastError(err);
    } finally {
      setCarregando(false);
    }
  };

  useEffect(() => {
    buscar();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const barra = (valor, maximo, cor) => (
    <div className={classes.trilha}>
      <div
        className={classes.preenchimento}
        style={{
          width: `${maximo > 0 ? (valor / maximo) * 100 : 0}%`,
          backgroundColor: cor,
        }}
      />
    </div>
  );

  const contatosFiltrados = useMemo(() => {
    let lista = dados?.contatos || [];

    if (local) {
      const [tipo, valor] = local.split(":");
      if (tipo === "regiao") lista = lista.filter(c => c.regiao === valor);
      else if (tipo === "uf") lista = lista.filter(c => c.uf === valor);
      else if (tipo === "pais") lista = lista.filter(c => c.pais === valor);
      else if (local === "semLocal") lista = lista.filter(c => !c.pais);
    }

    const termo = busca.trim().toLowerCase();
    if (termo) {
      // Busca por nome OU numero. No numero, ignora formatacao para
      // "81 99999" achar "5581999998888".
      const soDigitos = termo.replace(/\D/g, "");
      lista = lista.filter(
        c =>
          String(c.name || "").toLowerCase().includes(termo) ||
          (soDigitos && String(c.number || "").includes(soDigitos))
      );
    }

    return lista;
  }, [dados, local, busca]);

  // Voltar para a primeira pagina ao filtrar. Sem isso, filtrar estando na
  // pagina 5 mostraria uma tabela vazia — o resultado tem menos paginas que
  // a posicao atual.
  useEffect(() => {
    setPagina(0);
  }, [local, busca]);

  const contatosDaPagina = useMemo(
    () => contatosFiltrados.slice(pagina * porPagina, pagina * porPagina + porPagina),
    [contatosFiltrados, pagina, porPagina]
  );

  /**
   * Exportacao para Excel.
   *
   * Exporta o RESULTADO DO FILTRO, nao a pagina visivel: quem filtrou por
   * Pernambuco quer os 90 contatos, nao os 25 que couberam na tela.
   */
  const exportarExcel = () => {
    if (contatosFiltrados.length === 0) return;

    const linhas = contatosFiltrados.map(c => ({
      [i18n.t("geoReport.contactName")]: c.name || "",
      [i18n.t("geoReport.contactNumber")]: c.number || "",
      [i18n.t("geoReport.contactState")]: c.estado || "",
      UF: c.uf || "",
      [i18n.t("geoReport.contactRegion")]: c.regiao ? traduzirRegiao(c.regiao) : "",
      [i18n.t("geoReport.contactCountry")]: c.pais || i18n.t("geoReport.unmapped"),
    }));

    const planilha = XLSX.utils.json_to_sheet(linhas);
    // Largura das colunas: sem isso tudo sai espremido e o usuario tem de
    // ajustar a mao toda vez.
    planilha["!cols"] = [
      { wch: 32 }, { wch: 18 }, { wch: 20 }, { wch: 6 }, { wch: 16 }, { wch: 18 }
    ];

    const pasta = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(pasta, planilha, "Contatos");
    XLSX.writeFile(pasta, `contatos-por-regiao_${inicio}_a_${fim}.xlsx`);
  };

  const maxRegiao = Math.max(1, ...(dados?.regioes || []).map(r => r.total));
  const maxEstado = Math.max(1, ...(dados?.estados || []).map(e => e.total));
  const maxPais = Math.max(1, ...(dados?.paises || []).map(p => p.total));

  return (
    <div className={classes.raiz}>
      <Paper className={classes.filtros} variant="outlined">
        <TextField
          type="date"
          size="small"
          variant="outlined"
          label={i18n.t("geoReport.start")}
          InputLabelProps={{ shrink: true }}
          value={inicio}
          onChange={e => setInicio(e.target.value)}
        />
        <TextField
          type="date"
          size="small"
          variant="outlined"
          label={i18n.t("geoReport.end")}
          InputLabelProps={{ shrink: true }}
          value={fim}
          onChange={e => setFim(e.target.value)}
        />
        <Button variant="contained" color="primary" onClick={buscar}>
          {i18n.t("geoReport.filter")}
        </Button>

        <Button
          variant="outlined"
          onClick={exportarPdf}
          disabled={exportando || carregando || !dados}
          startIcon={
            exportando ? (
              <CircularProgress size={15} />
            ) : (
              <FileDown size={16} strokeWidth={2} />
            )
          }
        >
          {exportando
            ? i18n.t("geoReport.exporting")
            : i18n.t("geoReport.exportPdf")}
        </Button>
      </Paper>

      {carregando ? (
        <Box className={classes.vazio}>
          <CircularProgress size={26} />
        </Box>
      ) : (
        <div ref={areaImpressao}>
          {/* Cabecalho que so aparece no PDF: sem ele a folha comeca nos
              numeros, sem dizer de que periodo sao. */}
          <div className={classes.cabecalhoPdf}>
            <strong>{i18n.t("geoReport.title")}</strong>
            <span>
              {inicio.split("-").reverse().join("/")} —{" "}
              {fim.split("-").reverse().join("/")}
            </span>
          </div>

          <Box className={classes.resumo}>
            <Paper className={classes.cartaoResumo} variant="outlined">
              <Users size={22} strokeWidth={2} color="#6366f1" />
              <div>
                <div className={classes.valorResumo}>{dados?.total || 0}</div>
                <div className={classes.rotuloResumo}>
                  {i18n.t("geoReport.totalContacts")}
                </div>
              </div>
            </Paper>
            <Paper className={classes.cartaoResumo} variant="outlined">
              <MapPin size={22} strokeWidth={2} color="#22c55e" />
              <div>
                <div className={classes.valorResumo}>{dados?.mapeados || 0}</div>
                <div className={classes.rotuloResumo}>
                  {i18n.t("geoReport.mapped")}
                </div>
              </div>
            </Paper>
            {/* "Não mapeados" fica visível de propósito: é a margem de erro do
                relatório, e escondê-la daria uma precisão que o DDD não tem. */}
            <Paper className={classes.cartaoResumo} variant="outlined">
              <Globe size={22} strokeWidth={2} color="#94a3b8" />
              <div>
                <div className={classes.valorResumo}>
                  {dados?.naoMapeados || 0}
                </div>
                <div className={classes.rotuloResumo}>
                  {i18n.t("geoReport.unmapped")}
                </div>
              </div>
            </Paper>
          </Box>

          <Box className={classes.colunas}>
            <Paper className={classes.bloco} variant="outlined">
              <div className={classes.tituloBloco}>
                <Globe size={17} strokeWidth={2.2} />
                {i18n.t("geoReport.byRegion")}
              </div>
              <Typography className={classes.ajuda}>
                {i18n.t("geoReport.inferred")}
              </Typography>

              {(dados?.regioes || []).map(r => (
                <div key={r.regiao} className={classes.linha}>
                  <span className={classes.nome} style={{ minWidth: 110 }}>
                    {traduzirRegiao(r.regiao)}
                  </span>
                  {barra(r.total, maxRegiao, CORES_REGIAO[r.regiao] || "#94a3b8")}
                  <span className={classes.total}>{r.total}</span>
                </div>
              ))}
            </Paper>

            <Paper className={classes.bloco} variant="outlined">
              <div className={classes.tituloBloco}>
                <MapPin size={17} strokeWidth={2.2} />
                {i18n.t("geoReport.topStates")}
              </div>
              <Typography className={classes.ajuda}>
                {i18n.t("geoReport.topStatesHelp")}
              </Typography>

              {(dados?.estados || []).length === 0 ? (
                <div className={classes.vazio}>{i18n.t("geoReport.noStates")}</div>
              ) : (
                (dados?.estados || []).slice(0, 12).map((e, i) => (
                  <div key={e.uf} className={classes.linha}>
                    <span className={classes.posicao}>{i + 1}</span>
                    <span className={classes.sigla}>{e.uf}</span>
                    <span className={classes.nome}>
                      {e.nome}
                      <span className={classes.regiaoTexto}>
                        ({traduzirRegiao(e.regiao)})
                      </span>
                    </span>
                    {barra(e.total, maxEstado, CORES_REGIAO[e.regiao] || "#6366f1")}
                    <span className={classes.total}>{e.total}</span>
                  </div>
                ))
              )}
            </Paper>

            <Paper className={classes.bloco} variant="outlined">
              <div className={classes.tituloBloco}>
                <Globe size={17} strokeWidth={2.2} />
                {i18n.t("geoReport.otherCountries")}
              </div>
              <Typography className={classes.ajuda}>
                {i18n.t("geoReport.countriesHelp")}
              </Typography>

              {(dados?.paises || []).length === 0 ? (
                <div className={classes.vazio}>
                  {i18n.t("geoReport.noInternational")}
                </div>
              ) : (
                (dados?.paises || []).map(p => (
                  <div key={p.ddi} className={classes.linha}>
                    <span className={classes.sigla}>+{p.ddi}</span>
                    <span className={classes.nome}>{p.nome}</span>
                    {barra(p.total, maxPais, "#0ea5e9")}
                    <span className={classes.total}>{p.total}</span>
                  </div>
                ))
              )}
            </Paper>
          </Box>

          <Paper className={classes.bloco} variant="outlined" style={{ marginTop: 16 }}>
            <div className={classes.tituloBloco}>
              <Users size={17} strokeWidth={2.2} />
              {i18n.t("geoReport.contactsTitle")}
            </div>
            <Typography className={classes.ajuda}>
              {i18n.t("geoReport.contactsHelp")}
            </Typography>

            <div className={classes.filtrosTabela}>
              <TextField
                size="small"
                variant="outlined"
                placeholder={i18n.t("geoReport.searchPlaceholder")}
                value={busca}
                onChange={e => setBusca(e.target.value)}
              />
              <TextField
                select
                size="small"
                variant="outlined"
                label={i18n.t("geoReport.filterLocation")}
                value={local}
                onChange={e => setLocal(e.target.value)}
                style={{ minWidth: 200 }}
              >
                <MenuItem value="">{i18n.t("geoReport.allLocations")}</MenuItem>
                {(dados?.regioes || [])
                  .filter(r => r.total > 0)
                  .map(r => (
                    <MenuItem key={`r-${r.regiao}`} value={`regiao:${r.regiao}`}>
                      {traduzirRegiao(r.regiao)} ({r.total})
                    </MenuItem>
                  ))}
                {(dados?.estados || []).map(e => (
                  <MenuItem key={`e-${e.uf}`} value={`uf:${e.uf}`}>
                    {e.uf} — {e.nome} ({e.total})
                  </MenuItem>
                ))}
                {(dados?.paises || []).map(p => (
                  <MenuItem key={`p-${p.ddi}`} value={`pais:${p.nome}`}>
                    {p.nome} ({p.total})
                  </MenuItem>
                ))}
                <MenuItem value="semLocal">
                  {i18n.t("geoReport.unmapped")} ({dados?.naoMapeados || 0})
                </MenuItem>
              </TextField>
              <span className={classes.contagem}>
                {contatosFiltrados.length} / {(dados?.contatos || []).length}
              </span>
              <Button
                size="small"
                variant="outlined"
                onClick={exportarExcel}
                disabled={contatosFiltrados.length === 0}
                startIcon={<Sheet size={15} strokeWidth={2} />}
              >
                {i18n.t("geoReport.exportExcel", "Excel")}
              </Button>
            </div>

            {contatosFiltrados.length === 0 ? (
              <div className={classes.vazio}>{i18n.t("geoReport.noContacts")}</div>
            ) : (
              <>
              <Table size="small" className={classes.tabela}>
                <TableHead>
                  <TableRow>
                    <TableCell>{i18n.t("geoReport.contactName")}</TableCell>
                    <TableCell>{i18n.t("geoReport.contactNumber")}</TableCell>
                    <TableCell>{i18n.t("geoReport.contactState")}</TableCell>
                    <TableCell>{i18n.t("geoReport.contactRegion")}</TableCell>
                    <TableCell>{i18n.t("geoReport.contactCountry")}</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {/* Limite de 300 linhas: a tabela e para conferir e achar
                      contato fora do lugar, nao para listar base inteira. O
                      contador acima mostra quantos ficaram de fora. */}
                  {contatosDaPagina.map(c => (
                    <TableRow key={c.id}>
                      <TableCell>{c.name}</TableCell>
                      <TableCell className={classes.numero}>{c.number}</TableCell>
                      <TableCell>
                        {c.uf ? (
                          <>
                            <span className={classes.sigla}>{c.uf}</span> {c.estado}
                          </>
                        ) : (
                          "—"
                        )}
                      </TableCell>
                      <TableCell>
                        {c.regiao ? traduzirRegiao(c.regiao) : "—"}
                      </TableCell>
                      <TableCell>
                        {c.pais || (
                          <span className={classes.semLocal}>
                            {i18n.t("geoReport.unmapped")}
                          </span>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
                </Table>

                <TablePagination
                  component="div"
                  count={contatosFiltrados.length}
                  page={pagina}
                  onPageChange={(e, p) => setPagina(p)}
                  rowsPerPage={porPagina}
                  onRowsPerPageChange={e => {
                    setPorPagina(parseInt(e.target.value, 10));
                    setPagina(0);
                  }}
                  rowsPerPageOptions={[25, 50, 100, 250]}
                  labelRowsPerPage={i18n.t("geoReport.perPage", "Por página")}
                  labelDisplayedRows={({ from, to, count }) =>
                    `${from}–${to} ${i18n.t("geoReport.of", "de")} ${count}`
                  }
                />
              </>
            )}
          </Paper>
        </div>
      )}
    </div>
  );
};

export default GeoReport;
