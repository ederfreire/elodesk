import { Request, Response } from "express";
import logger from "../utils/logger";
import archiver from "archiver";
import AdmZip from "adm-zip";
import axios from "axios";
import Whatsapp from "../models/Whatsapp";
import User from "../models/User";
import AppError from "../errors/AppError";
import {
  idsDaEmpresa,
  idsComDono,
  registrarUra,
  esquecerUra,
  garantirDaEmpresa,
  reivindicarAntigas
} from "../services/WacallsServices/UrasDaEmpresa";

/**
 * CRUD das URAs de voz.
 *
 * Os fluxos de voz NÃO ficam no Postgres: eles vivem no armazenamento
 * próprio do wacalls-chat, porque é lá que o executor roda durante a
 * ligação. Este controller é um proxy fino — a plataforma manda a tela, o
 * microserviço guarda e executa.
 *
 * Por que proxy e não guardar aqui: se o fluxo ficasse duplicado nos dois
 * lados, qualquer falha de sincronia deixaria a URA que toca diferente da
 * URA que o usuário vê na tela. Uma fonte de verdade só.
 */

const svc = () => import("../services/WacallsServices/WacallsChatCallService");

// Cada URA tem dona (services/WacallsServices/UrasDaEmpresa): uma empresa
// só vê, abre, grava e apaga as suas.
const empresaDe = (req: Request): number => Number((req as any).user?.companyId);
const ehSuper = async (req: Request): Promise<boolean> => {
  try {
    const u = await User.findByPk(Number((req as any).user?.id), { attributes: ["id", "super"] });
    return !!(u as any)?.super;
  } catch {
    return false;
  }
};

/** Erro amigável, sem vazar o nome interno do microserviço. */
const responder = (res: Response, err: any) => {
  if (err instanceof AppError) {
    return res.status(err.statusCode).json({ error: err.message });
  }
  const status = err?.upstreamStatus || 502;
  const msg =
    status === 502
      ? "Serviço de voz indisponível. Verifique se a conexão WhatsApp Plus está ativa."
      : err?.message || "Não foi possível concluir a operação.";
  logger.warn(`[URA] ${err?.message}`);
  return res.status(status).json({ error: msg });
};

export const index = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { get, isEnabled } = await svc();
    if (!isEnabled()) return res.json([]);
    const data = await get<{ flows: any[] }>("/api/flows");
    const todas = Array.isArray(data?.flows) ? data.flows : [];

    const companyId = empresaDe(req);
    await reivindicarAntigas(companyId, todas.map(f => String(f.id)));
    const minhas = await idsDaEmpresa(companyId);
    // Super administrador também vê as antigas que ficaram sem dono.
    const semDono = (await ehSuper(req))
      ? await idsComDono().then(com => new Set(todas.map(f => String(f.id)).filter(id => !com.has(id))))
      : new Set<string>();
    const lista = todas.filter(f => minhas.has(String(f.id)) || semDono.has(String(f.id)));

    // Só URAs de voz. O executor recusa fluxo de chat em ligação, então
    // mostrar os dois juntos aqui só criaria confusão.
    const soVoz = lista.filter(f => {
      try {
        const g = JSON.parse(f.graph || "{}");
        return String(g?.kind || "voice").toLowerCase() !== "chat";
      } catch {
        return true;
      }
    });

    return res.json(soVoz);
  } catch (err: any) {
    // Lista vazia em vez de erro: a tela precisa abrir mesmo sem o serviço.
    logger.warn(`[URA] falha ao listar: ${err?.message}`);
    return res.json([]);
  }
};

export const show = async (req: Request, res: Response): Promise<Response> => {
  try {
    await garantirDaEmpresa(empresaDe(req), req.params.id, await ehSuper(req));
    const { get } = await svc();
    const data = await get<any>(`/api/flows/${encodeURIComponent(req.params.id)}`);
    return res.json(data);
  } catch (err: any) {
    return responder(res, err);
  }
};

export const store = async (req: Request, res: Response): Promise<Response> => {
  try {
    const { post } = await svc();
    const { name, graph, enabled } = req.body || {};
    const data = await post<any>("/api/flows", {
      name: String(name || "Nova URA").trim(),
      // "inbound" é o gatilho de ligação recebida — é o único que faz
      // sentido para URA.
      trigger: "inbound",
      graph: typeof graph === "string" ? graph : JSON.stringify(graph || {}),
      enabled: enabled !== false
    });
    const novoId = String(data?.id || data?.flow?.id || "");
    if (novoId) await registrarUra(empresaDe(req), novoId);
    else logger.warn("[URA] o serviço não devolveu o id da URA criada; ela ficou sem dona");
    return res.status(201).json(data);
  } catch (err: any) {
    return responder(res, err);
  }
};

export const update = async (req: Request, res: Response): Promise<Response> => {
  try {
    const superAdmin = await ehSuper(req);
    await garantirDaEmpresa(empresaDe(req), req.params.id, superAdmin);
    // Antiga sem dona editada pelo super administrador passa a ser da empresa dele.
    await registrarUra(empresaDe(req), req.params.id);
    const { put } = await svc();
    const { name, graph, enabled } = req.body || {};
    const data = await put<any>(`/api/flows/${encodeURIComponent(req.params.id)}`, {
      name: String(name || "").trim(),
      trigger: "inbound",
      graph: typeof graph === "string" ? graph : JSON.stringify(graph || {}),
      enabled: enabled !== false
    });
    return res.json(data);
  } catch (err: any) {
    return responder(res, err);
  }
};

export const remove = async (req: Request, res: Response): Promise<Response> => {
  try {
    await garantirDaEmpresa(empresaDe(req), req.params.id, await ehSuper(req));
    const { del } = await svc();
    await del(`/api/flows/${encodeURIComponent(req.params.id)}`);
    await esquecerUra(req.params.id);
    return res.status(200).json({ ok: true });
  } catch (err: any) {
    return responder(res, err);
  }
};

/**
 * Vozes e modelos disponíveis no provedor, para o editor da URA montar as
 * listas em vez de pedir um identificador digitado à mão.
 *
 * É POST porque a chave da API vai no corpo: em querystring ela apareceria
 * no log de acesso do servidor e no histórico do navegador.
 */
export const vozes = async (req: Request, res: Response): Promise<Response> => {
  const { provider, apiKey } = req.body || {};
  try {
    const { listarVozes } = await import(
      "../services/WacallsServices/VoiceCatalogService"
    );
    const dados = await listarVozes(String(provider || ""), String(apiKey || ""));
    return res.json(dados);
  } catch (err: any) {
    const { erroDeVoz } = await import(
      "../services/WacallsServices/VoiceCatalogService"
    );
    const { status, mensagem } = erroDeVoz(err);
    // Nunca registra a chave no log, só o provedor e o motivo.
    logger.warn(`[URA] catálogo de vozes (${provider}): ${err?.message}`);
    return res.status(status).json({ error: mensagem });
  }
};

/**
 * Vozes gratuitas (Piper) do próprio servidor, para a URA escolher sem chave.
 *
 * O Piper roda na mesma VPS (o instalador sobe o container e guarda os
 * modelos em /var/lib/piper-data). Lista os modelos .onnx que já estão no
 * disco e soma as vozes conhecidas que o Piper baixa sozinho na primeira vez
 * que forem pedidas — sem elas, um servidor recém-instalado mostraria uma
 * lista quase vazia.
 */
const VOZES_PIPER_CONHECIDAS: { id: string; nome: string }[] = [
  { id: "pt_BR-faber-medium", nome: "Português (BR) — Faber, masculina" },
  { id: "pt_BR-edresson-low", nome: "Português (BR) — Edresson, masculina (leve)" },
  { id: "pt_BR-cadu-medium", nome: "Português (BR) — Cadu, masculina" },
  { id: "pt_BR-jeff-medium", nome: "Português (BR) — Jeff, masculina" },
  { id: "es_ES-sharvard-medium", nome: "Espanhol (ES) — Sharvard" },
  { id: "es_MX-claude-high", nome: "Espanhol (MX) — Claude" },
  { id: "en_US-amy-medium", nome: "Inglês (US) — Amy, feminina" },
  { id: "en_US-ryan-high", nome: "Inglês (US) — Ryan, masculina" }
];

const PASTAS_PIPER = [
  "/var/lib/piper-data",
  "/opt/piper/voices",
  "/usr/share/piper-voices",
  process.env.WACALLS_PIPER_VOICES || ""
];

const nomeDaVozPiper = (id: string): string => {
  const conhecida = VOZES_PIPER_CONHECIDAS.find(v => v.id === id);
  if (conhecida) return conhecida.nome;
  const [idioma, pessoa] = id.split("-");
  return pessoa ? `${idioma} — ${pessoa.charAt(0).toUpperCase()}${pessoa.slice(1)}` : id;
};

export const vozesGratis = async (_req: Request, res: Response): Promise<Response> => {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const fs = require("fs");
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const path = require("path");
  const vistas = new Set<string>();
  const instaladas: { id: string; nome: string; instalada: boolean }[] = [];
  const varrer = (pasta: string, nivel: number) => {
    if (!pasta || nivel > 2) return;
    let itens: any[] = [];
    try {
      itens = fs.readdirSync(pasta, { withFileTypes: true });
    } catch {
      return;
    }
    for (const item of itens) {
      if (item.isDirectory()) {
        varrer(path.join(pasta, item.name), nivel + 1);
      } else if (item.name.endsWith(".onnx")) {
        const id = item.name.slice(0, -".onnx".length);
        if (id && !vistas.has(id)) {
          vistas.add(id);
          instaladas.push({ id, nome: nomeDaVozPiper(id), instalada: true });
        }
      }
    }
  };
  PASTAS_PIPER.forEach(p => varrer(p, 0));
  instaladas.sort((a, b) => a.id.localeCompare(b.id));
  const aBaixar = VOZES_PIPER_CONHECIDAS.filter(v => !vistas.has(v.id)).map(v => ({
    ...v,
    instalada: false
  }));
  return res.json({ vozes: [...instaladas, ...aBaixar] });
};


/* ===========================================================================
 * CONSTRUTOR VISUAL DA URA (17.11.2026): ouvir, enviar arquivo, números,
 * exportar e importar. Tudo aqui roda no próprio backend — o serviço de
 * chamadas desta versão não tem as rotas de prévia, arquivo e estatística.
 * =========================================================================== */

/** PCM 16 bits mono -> WAV (o navegador toca WAV direto). */
const pcmParaWav = (pcm: Buffer, taxa = 16000): Buffer => {
  const cab = Buffer.alloc(44);
  cab.write("RIFF", 0);
  cab.writeUInt32LE(36 + pcm.length, 4);
  cab.write("WAVE", 8);
  cab.write("fmt ", 12);
  cab.writeUInt32LE(16, 16);
  cab.writeUInt16LE(1, 20);
  cab.writeUInt16LE(1, 22);
  cab.writeUInt32LE(taxa, 24);
  cab.writeUInt32LE(taxa * 2, 28);
  cab.writeUInt16LE(2, 32);
  cab.writeUInt16LE(16, 34);
  cab.write("data", 36);
  cab.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([cab, pcm]);
};

/** Voz grátis do servidor (Piper, o mesmo que a ligação usa). */
const falarComPiper = async (texto: string, voz: string): Promise<Buffer> => {
  const url = (process.env.WACALLS_TTS_URL || "http://127.0.0.1:5005/api/tts").trim();
  const r = await axios.post(url, { text: texto, voice: voz || undefined }, {
    responseType: "arraybuffer",
    // A primeira frase pode demorar: o Piper sobe o modelo do zero.
    timeout: 50000,
    validateStatus: () => true
  });
  if (r.status >= 400 || !r.data || !(r.data as any).byteLength) {
    throw new Error(`Piper respondeu ${r.status}`);
  }
  return pcmParaWav(Buffer.from(r.data as any));
};

/** Reserva local: espeak-ng (voz robótica, mas nunca muda). */
const falarComEspeak = (texto: string, voz: string): Promise<Buffer> =>
  new Promise((ok, falha) => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { execFile } = require("child_process");
    const idioma = String(voz || "pt_BR").split("-")[0].replace("_", "-").toLowerCase() || "pt-br";
    execFile(
      "espeak-ng",
      ["-v", idioma, "-s", "160", "--stdout", texto],
      { encoding: "buffer", maxBuffer: 20 * 1024 * 1024, timeout: 20000 },
      (err: any, saida: Buffer) => {
        if (err || !saida?.length) return falha(err || new Error("espeak-ng sem áudio"));
        return ok(saida);
      }
    );
  });

const falarNaNuvem = async (texto: string, voz: any): Promise<Buffer> => {
  const provedor = String(voz?.provider || "");
  if (provedor === "openai") {
    const chave = String(voz?.openaiApiKey || voz?.apiKey || "").trim();
    if (!chave) throw new Error("Sem chave da OpenAI.");
    const r = await axios.post(
      "https://api.openai.com/v1/audio/speech",
      { model: voz?.model || "tts-1", voice: voz?.voiceId || "alloy", input: texto, response_format: "wav" },
      { headers: { Authorization: `Bearer ${chave}` }, responseType: "arraybuffer", timeout: 40000 }
    );
    return Buffer.from(r.data as any);
  }
  if (provedor === "elevenlabs") {
    const chave = String(voz?.elevenlabsApiKey || voz?.apiKey || "").trim();
    if (!chave || !voz?.voiceId) throw new Error("Sem chave ou voz do ElevenLabs.");
    const r = await axios.post(
      `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voz.voiceId)}?output_format=pcm_16000`,
      { text: texto, model_id: voz?.model || "eleven_multilingual_v2" },
      { headers: { "xi-api-key": chave }, responseType: "arraybuffer", timeout: 40000 }
    );
    return pcmParaWav(Buffer.from(r.data as any));
  }
  throw new Error("Provedor de voz desconhecido.");
};

/**
 * OUVIR UM TRECHO com a voz escolhida, pelo mesmo caminho da ligação:
 * provedor pago (se escolhido) -> Piper -> espeak-ng. Devolve WAV.
 */
export const ouvir = async (req: Request, res: Response): Promise<Response> => {
  const texto = String(req.body?.text || "").trim().slice(0, 1000);
  if (!texto) return res.status(400).json({ error: "Escreva o texto antes de ouvir." });
  const voz = req.body?.voice || {};
  const provedor = String(voz?.provider || "piper");
  const vozPiper = provedor === "piper" ? String(voz?.voiceId || "") : "";
  const tentativas: string[] = [];
  const enviar = (wav: Buffer) => {
    res.setHeader("Content-Type", "audio/wav");
    res.setHeader("Cache-Control", "no-store");
    return res.send(wav);
  };
  if (provedor === "openai" || provedor === "elevenlabs") {
    try {
      return enviar(await falarNaNuvem(texto, voz));
    } catch (err: any) {
      // Nunca registra a chave: só o provedor e o motivo.
      tentativas.push(`${provedor}: ${err?.response?.status || err?.message}`);
    }
  }
  try {
    return enviar(await falarComPiper(texto, vozPiper));
  } catch (err: any) {
    tentativas.push(`piper: ${err?.message}`);
  }
  try {
    return enviar(await falarComEspeak(texto, vozPiper));
  } catch (err: any) {
    tentativas.push(`espeak-ng: ${err?.message}`);
  }
  logger.warn(`[URA] prévia de voz falhou: ${tentativas.join(" | ")}`);
  return res.status(503).json({
    error: "Não consegui gerar o áudio: o servidor está sem voz (Piper/espeak-ng)."
  });
};

/**
 * Arquivo do passo "Enviar arquivo": fica na pasta pública da empresa e o
 * serviço de chamadas baixa pelo endereço na hora de mandar no WhatsApp.
 */
export const enviarArquivo = async (req: Request, res: Response): Promise<Response> => {
  const arquivo = (req as any).file as { buffer: Buffer; originalname: string; mimetype: string; size: number } | undefined;
  if (!arquivo) return res.status(400).json({ error: "Escolha um arquivo para enviar." });
  const base = String(process.env.BACKEND_URL || "").replace(/\/+$/, "");
  if (!base) return res.status(500).json({ error: "BACKEND_URL não está configurado no .env do backend." });
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const fs = require("fs");
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const path = require("path");
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const crypto = require("crypto");
    const companyId = empresaDe(req);
    const pasta = path.resolve(__dirname, "..", "..", "public", `company${companyId}`, "ura");
    fs.mkdirSync(pasta, { recursive: true });
    const limpo = String(arquivo.originalname || "arquivo").replace(/[^a-zA-Z0-9._-]/g, "_").slice(-80);
    const nome = `${crypto.randomBytes(6).toString("hex")}-${limpo}`;
    fs.writeFileSync(path.join(pasta, nome), arquivo.buffer);
    return res.json({
      url: `${base}/public/company${companyId}/ura/${encodeURIComponent(nome)}`,
      filename: arquivo.originalname,
      size: arquivo.size,
      mime: arquivo.mimetype
    });
  } catch (err: any) {
    logger.warn(`[URA] envio de arquivo falhou: ${err?.message}`);
    return res.status(500).json({ error: "Não consegui guardar o arquivo." });
  }
};

/**
 * Números das ligações atendidas pela URA. O serviço de chamadas desta versão
 * ainda não conta isso: sem a rota, a tela mostra zero em vez de erro.
 */
export const estatisticas = async (req: Request, res: Response): Promise<Response> => {
  const dias = Math.min(Math.max(Number(req.query?.days) || 30, 1), 365);
  const porDia: { dia: string; total: number; transferidas: number }[] = [];
  for (let i = dias - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86400000);
    const dia = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
    porDia.push({ dia, total: 0, transferidas: 0 });
  }
  const resultado = { dias, total: 0, transferidas: 0, resolvidas: 0, falhas: 0, porDia, porFluxo: {} as Record<string, number> };
  try {
    const { get, isEnabled } = await svc();
    if (!isEnabled()) return res.json(resultado);
    const conexoes = await Whatsapp.findAll({ where: { companyId: empresaDe(req) }, attributes: ["wacallsChatSessionId"] });
    const sessoes = new Set(conexoes.map(w => String((w as any).wacallsChatSessionId || "")).filter(Boolean));
    const data = await get<{ rows: any[] }>(`/api/flows/voice-stats?days=${dias}`);
    const indice = new Map(porDia.map(d => [d.dia, d]));
    for (const l of Array.isArray(data?.rows) ? data.rows : []) {
      if (!sessoes.has(String(l.sessionId))) continue;
      const n = Number(l.count) || 0;
      resultado.total += n;
      if (l.transferred) resultado.transferidas += n;
      else if (l.status === "failed") resultado.falhas += n;
      else resultado.resolvidas += n;
      resultado.porFluxo[l.flowId] = (resultado.porFluxo[l.flowId] || 0) + n;
      const d = indice.get(String(l.day));
      if (d) {
        d.total += n;
        if (l.transferred) d.transferidas += n;
      }
    }
  } catch {
    /* rota ainda não existe no serviço: fica tudo zero */
  }
  return res.json(resultado);
};

/** Tira as chaves de API da voz antes de a URA sair do sistema. */
const semChaves = (grafo: any) => {
  const g = { ...(grafo || {}) };
  if (g.voice && typeof g.voice === "object") {
    const v = { ...g.voice };
    Object.keys(v).forEach(k => {
      if (/apikey/i.test(k)) delete v[k];
    });
    g.voice = v;
  }
  return g;
};

/** EXPORTAR (.zip com ura.json). As chaves de API da voz não vão no arquivo. */
export const exportar = async (req: Request, res: Response): Promise<void> => {
  try {
    await garantirDaEmpresa(empresaDe(req), req.params.id, await ehSuper(req));
    const { get } = await svc();
    const data = await get<any>(`/api/flows/${encodeURIComponent(req.params.id)}`);
    const nome = String(data?.name || "ura");
    const bruto = typeof data?.graph === "string" ? data.graph : JSON.stringify(data?.graph || {});
    const arquivo = nome.replace(/[^a-z0-9-_]/gi, "_") || "ura";
    res.setHeader("Content-Type", "application/zip");
    res.setHeader("Content-Disposition", `attachment; filename="${arquivo}.zip"`);
    const zip = archiver("zip", { zlib: { level: 9 } });
    zip.on("error", err => {
      logger.warn(`[URA] falha ao montar o zip: ${err?.message}`);
      if (!res.headersSent) res.status(500).json({ error: "Não foi possível gerar o arquivo." });
    });
    zip.pipe(res);
    zip.append(
      JSON.stringify({ version: 1, kind: "voice-ivr", name: nome, graph: semChaves(JSON.parse(bruto || "{}")) }, null, 2),
      { name: "ura.json" }
    );
    await zip.finalize();
  } catch (err: any) {
    responder(res, err);
  }
};

/**
 * IMPORTAR (.zip ou .json). Só LÊ o JSON (nada é extraído para o disco) e a
 * URA entra PAUSADA e na empresa de quem importou.
 */
export const importar = async (req: Request, res: Response): Promise<Response> => {
  const arquivo = (req as any).file as { buffer: Buffer; originalname: string } | undefined;
  if (!arquivo) return res.status(400).json({ error: "Nenhum arquivo enviado." });
  const nomeArq = String(arquivo.originalname || "").toLowerCase();
  const ehZip = nomeArq.endsWith(".zip");
  if (!ehZip && !nomeArq.endsWith(".json")) {
    return res.status(400).json({ error: "O arquivo precisa ser .zip ou .json." });
  }
  let conteudo: any;
  try {
    if (ehZip) {
      const zip = new AdmZip(arquivo.buffer);
      const entradas = zip.getEntries().filter(e => !e.isDirectory && /^[^/]+\.json$/i.test(e.entryName));
      const entrada = entradas.find(e => e.entryName === "ura.json") || entradas[0];
      if (!entrada) return res.status(400).json({ error: "Nenhum arquivo .json encontrado no zip." });
      conteudo = JSON.parse(entrada.getData().toString("utf8"));
    } else {
      conteudo = JSON.parse(arquivo.buffer.toString("utf8"));
    }
  } catch {
    return res.status(400).json({ error: "Arquivo inválido: não foi possível ler a URA." });
  }
  const graph = conteudo?.graph;
  if (!conteudo?.name || !graph || typeof graph !== "object") {
    return res.status(400).json({ error: "Arquivo inválido: faltam o nome e o fluxo da URA." });
  }
  if (String(graph?.kind || "voice").toLowerCase() === "chat") {
    return res.status(400).json({ error: "Este arquivo é de um fluxo de conversa, não de uma URA de voz." });
  }
  try {
    const { post } = await svc();
    const nome = `${String(conteudo.name).trim().slice(0, 110) || "URA"} (importada)`;
    const criada = await post<any>("/api/flows", {
      name: nome,
      trigger: "inbound",
      graph: JSON.stringify(graph),
      enabled: false
    });
    const novoId = String(criada?.id || criada?.flow?.id || "");
    if (novoId) await registrarUra(empresaDe(req), novoId);
    return res.status(201).json(criada);
  } catch (err: any) {
    return responder(res, err);
  }
};

export default {
  index,
  show,
  store,
  update,
  remove,
  vozes,
  vozesGratis,
  ouvir,
  enviarArquivo,
  estatisticas,
  exportar,
  importar
};
