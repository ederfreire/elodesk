/**
 * URA criada a partir de um modelo em OUTRO idioma.
 *
 * Os textos de um modelo são gravados na URA no momento em que ela é criada,
 * no idioma que a tela estava naquela hora. Trocar o idioma depois não muda o
 * que já foi gravado — por isso uma URA criada com a tela em espanhol continua
 * falando espanhol.
 *
 * Aqui comparamos cada texto da URA com os textos dos modelos em todos os
 * idiomas. O que for idêntico a um texto de modelo de outro idioma é trocado
 * pelo mesmo texto no idioma atual. Texto que alguém editou à mão não casa com
 * nenhum modelo e fica como está.
 */
import { i18n } from "../../translate/i18n";

const IDIOMAS = ["pt", "en", "es", "ar", "tr"];
const norm = (v) => String(v || "").replace(/\s+/g, " ").trim();

// Lista as chaves de texto de voiceIvrFlow.modelos (ex.: "cpf.ola").
const chavesDosModelos = () => {
  const saida = [];
  const percorre = (obj, prefixo) => {
    if (!obj || typeof obj !== "object") return;
    Object.keys(obj).forEach((k) => {
      const v = obj[k];
      const caminho = prefixo ? `${prefixo}.${k}` : k;
      if (typeof v === "string") saida.push(caminho);
      else percorre(v, caminho);
    });
  };
  IDIOMAS.forEach((lng) => {
    let pacote = null;
    try {
      pacote = i18n.getResourceBundle(lng, "translations");
    } catch (e) {
      pacote = null;
    }
    percorre(pacote && pacote.voiceIvrFlow && pacote.voiceIvrFlow.modelos, "");
  });
  return Array.from(new Set(saida));
};

// O mapa só muda com o idioma: guardado para não refazer a cada arrasto.
const cache = { idioma: null, mapa: null };

/** Mapa "texto em qualquer idioma" → "mesmo texto no idioma atual". */
const montarMapa = () => {
  const atual = (i18n.language || "pt").split("-")[0];
  if (cache.idioma === atual && cache.mapa) return cache.mapa;
  const mapa = new Map();
  cache.idioma = atual;
  cache.mapa = mapa;
  chavesDosModelos().forEach((chave) => {
    const destino = i18n.t(`voiceIvrFlow.modelos.${chave}`, { lng: atual, defaultValue: "" });
    if (!norm(destino)) return;
    IDIOMAS.forEach((lng) => {
      if (lng === atual) return;
      const origem = i18n.t(`voiceIvrFlow.modelos.${chave}`, { lng, defaultValue: "" });
      const o = norm(origem);
      if (o && o !== norm(destino) && !mapa.has(o)) mapa.set(o, destino);
    });
  });
  return mapa;
};

const trocar = (mapa, v) => {
  if (typeof v !== "string") return { valor: v, mudou: false };
  const novo = mapa.get(norm(v));
  return novo ? { valor: novo, mudou: true } : { valor: v, mudou: false };
};

/**
 * Traduz os textos de modelo dos passos (e o nome da URA).
 * Devolve { nos, nome, quantos } — `quantos` = textos trocados.
 */
export const traduzirTextosDeModelo = (nos, nome) => {
  const mapa = montarMapa();
  let quantos = 0;
  const novosNos = (nos || []).map((n) => {
    if (!n || !n.data) return n;
    const data = { ...n.data };
    Object.keys(data).forEach((k) => {
      if (k.startsWith("_") || typeof data[k] !== "string") return;
      const r = trocar(mapa, data[k]);
      if (r.mudou) {
        data[k] = r.valor;
        quantos += 1;
      }
    });
    if (Array.isArray(data.options)) {
      data.options = data.options.map((op) => {
        if (!op || typeof op.label !== "string") return op;
        const r = trocar(mapa, op.label);
        if (!r.mudou) return op;
        quantos += 1;
        return { ...op, label: r.valor };
      });
    }
    return { ...n, data };
  });
  const rNome = trocar(mapa, nome);
  if (rNome.mudou) quantos += 1;
  return { nos: novosNos, nome: rNome.valor, quantos };
};
