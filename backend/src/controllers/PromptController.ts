import { Request, Response } from "express";
import { getIO } from "../libs/socket";
import logger from "../utils/logger";
import CreatePromptService from "../services/PromptServices/CreatePromptService";
import DeletePromptService from "../services/PromptServices/DeletePromptService";
import ListPromptsService from "../services/PromptServices/ListPromptsService";
import ShowPromptService from "../services/PromptServices/ShowPromptService";
import UpdatePromptService from "../services/PromptServices/UpdatePromptService";
import Whatsapp from "../models/Whatsapp";
import Prompt from "../models/Prompt";
import PromptKnowledgeBase from "../models/PromptKnowledgeBase";
import path from "path";
import fs from "fs";
import OpenAI from "openai";
import { verify } from "jsonwebtoken";
import authConfig from "../config/auth";
import { obterClienteIA } from "../helpers/ControleDeIA";

interface TokenPayload {
  id: string;
  username: string;
  profile: string;
  companyId: number;
  iat: number;
  exp: number;
}

type IndexQuery = {
  searchParam?: string;
  pageNumber?: string | number;
};

export const index = async (req: Request, res: Response): Promise<Response> => {
  const { pageNumber, searchParam } = req.query as IndexQuery;
  const authHeader = req.headers.authorization;
  const [, token] = authHeader.split(" ");
  const decoded = verify(token, authConfig.secret);
  const { companyId } = decoded as TokenPayload;
  const { prompts, count, hasMore } = await ListPromptsService({ searchParam, pageNumber, companyId });

  return res.status(200).json({ prompts, count, hasMore });
};

export const store = async (req: Request, res: Response): Promise<Response> => {
  const authHeader = req.headers.authorization;
  const [, token] = authHeader.split(" ");
  const decoded = verify(token, authConfig.secret);
  const { companyId } = decoded as TokenPayload;
  const promptTable = await CreatePromptService({ ...req.body, companyId });

  const io = getIO();
  io.of(String(companyId))
    .emit(`company-${companyId}-prompt`, {
      action: "update",
      prompt: promptTable
    });

  return res.status(200).json(promptTable);
};

export const show = async (req: Request, res: Response): Promise<Response> => {
  const { promptId } = req.params;
  const authHeader = req.headers.authorization;
  const [, token] = authHeader.split(" ");
  const decoded = verify(token, authConfig.secret);
  const { companyId } = decoded as TokenPayload;
  const prompt = await ShowPromptService({ promptId, companyId });

  return res.status(200).json(prompt);
};

export const update = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { promptId } = req.params;
  const promptData = req.body;
  const authHeader = req.headers.authorization;
  const [, token] = authHeader.split(" ");
  const decoded = verify(token, authConfig.secret);
  const { companyId } = decoded as TokenPayload;

  const prompt = await UpdatePromptService({ promptData, promptId: promptId, companyId });

  const io = getIO();
  io.of(String(companyId))
    .emit(`company-${companyId}-prompt`, {
      action: "update",
      prompt
    });

  return res.status(200).json(prompt);
};

export const duplicate = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { promptId } = req.params;
  const authHeader = req.headers.authorization;
  const [, token] = authHeader.split(" ");
  const decoded = verify(token, authConfig.secret);
  const { companyId } = decoded as TokenPayload;

  const original = await ShowPromptService({ promptId, companyId });

  const dados: any = (original as any).toJSON ? (original as any).toJSON() : { ...original };
  delete dados.id;
  delete dados.createdAt;
  delete dados.updatedAt;
  // Relações não vão no create do prompt em si; a base é copiada logo abaixo,
  // registro a registro, para o novo agente ter tudo do original.
  delete dados.knowledgeBases;
  delete dados.queue;

  const novo = await CreatePromptService({
    ...dados,
    name: `${original.name} (cópia)`,
    active: false,
    companyId
  });

  // ---- Copiar a base de conhecimento do agente ----
  //
  // Cada item é recriado apontando para o novo prompt. Para itens com arquivo
  // (mediaUrl), o arquivo FÍSICO também é copiado com um nome novo — assim os
  // dois agentes ficam independentes: apagar a base de um não apaga o arquivo
  // do outro. Se a cópia do arquivo falhar, o item é copiado mesmo assim
  // apontando para o arquivo original (degrada, não quebra a duplicação).
  try {
    const itens = await PromptKnowledgeBase.findAll({
      where: { promptId: original.id, companyId }
    });

    const baseDir = path.resolve(__dirname, "..", "..", "public", `company${companyId}`);

    for (const item of itens) {
      let novoMediaUrl = item.mediaUrl;

      if (item.mediaUrl) {
        try {
          const origemPath = path.resolve(baseDir, item.mediaUrl);
          if (fs.existsSync(origemPath)) {
            const ext = path.extname(item.mediaUrl);
            const dir = path.dirname(item.mediaUrl); // preserva subpasta (ex.: knowledge)
            const nomeNovo = `${Date.now()}_${Math.round(Math.random() * 1e9)}${ext}`;
            const relativo = dir && dir !== "." ? path.join(dir, nomeNovo) : nomeNovo;
            const destinoPath = path.resolve(baseDir, relativo);
            fs.mkdirSync(path.dirname(destinoPath), { recursive: true });
            fs.copyFileSync(origemPath, destinoPath);
            novoMediaUrl = relativo;
          }
        } catch (fileErr) {
          // mantém o mediaUrl original se a cópia do arquivo falhar
          novoMediaUrl = item.mediaUrl;
        }
      }

      await PromptKnowledgeBase.create({
        name: item.name,
        type: item.type,
        content: item.content,
        mediaUrl: novoMediaUrl,
        mediaType: item.mediaType,
        originalName: item.originalName,
        active: item.active,
        promptId: novo.id,
        companyId
      } as any);
    }
  } catch (kbErr: any) {
    // Não falha a duplicação do agente por causa da base; loga e segue.
    logger.error(`[PROMPT DUPLICATE] Falha ao copiar base de conhecimento: ${kbErr?.message || kbErr}`);
  }

  const io = getIO();
  io.of(String(companyId))
    .emit(`company-${companyId}-prompt`, {
      action: "update",
      prompt: novo
    });

  return res.status(201).json(novo);
};

export const remove = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { promptId } = req.params;
  const authHeader = req.headers.authorization;
  const [, token] = authHeader.split(" ");
  const decoded = verify(token, authConfig.secret);
  const { companyId } = decoded as TokenPayload;
  try {
    const { count } = await Whatsapp.findAndCountAll({ where: { promptId: +promptId, companyId } });

    if (count > 0) return res.status(200).json({ message: "Não foi possível excluir! Verifique se este prompt está sendo usado nas conexões Whatsapp!" });

    await DeletePromptService(promptId, companyId);

    const io = getIO();
    io.of(String(companyId))
      .emit(`company-${companyId}-prompt`, {
        action: "delete",
        promptId: +promptId
      });

    return res.status(200).json({ message: "Prompt deleted" });
  } catch (err) {
    return res.status(500).json({ message: "Não foi possível excluir! Verifique se este prompt está sendo usado!" });
  }
};

export const testPrompt = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { apiKey, prompt, model, maxTokens, temperature, message } = req.body;

  if (!apiKey || !prompt || !message) {
    return res.status(400).json({ error: "apiKey, prompt e message são obrigatórios" });
  }

  try {
    // Cliente compartilhado por apiKey, com timeout e retries explicitos
    // (helpers/ControleDeIA.ts). Antes era `new OpenAI(...)` sem timeout:
    // o padrao do SDK e 10 MINUTOS com 2 retries, ou seja, uma unica
    // mensagem podia segurar a requisicao por meia hora.
    const openai = obterClienteIA(apiKey);

    const chat = await openai.chat.completions.create({
      model: model || "gpt-4.1-mini",
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: message }
      ],
      max_tokens: maxTokens || 100,
      temperature: temperature || 1
    });

    const response = chat.choices[0].message?.content;
    return res.status(200).json({ response });
  } catch (err: any) {
    return res.status(500).json({ error: err.message || "Erro ao testar o prompt" });
  }
};

export const previewVoice = async (
  req: Request,
  res: Response
): Promise<Response> => {
  const { apiKey, voice, text } = req.body;

  if (!apiKey) {
    return res.status(400).json({ error: "apiKey é obrigatória" });
  }

  try {
    const { generateOpenAiTTS, isValidOpenAiVoice } = await import("../helpers/OpenAiTTS");
    const selectedVoice = isValidOpenAiVoice(voice || "") ? voice : "nova";
    const sampleText = text || "Olá! Esta é uma demonstração da minha voz. Como posso te ajudar hoje?";

    const path = require("path");
    const fs = require("fs");
    const tmpDir = path.join(__dirname, "..", "..", "public");

    // A pasta pode não existir numa instalação nova ou depois de uma limpeza.
    // Sem isto o writeFileSync estoura com ENOENT e vira um 500 sem motivo
    // aparente — o áudio nunca chegou a ser pedido à OpenAI.
    try {
      if (!fs.existsSync(tmpDir)) fs.mkdirSync(tmpDir, { recursive: true });
    } catch (erroPasta: any) {
      logger.error(
        `[PREVIEW-VOZ] não foi possível criar ${tmpDir}: ${erroPasta?.message}`
      );
    }

    const fileName = `preview_tts_${Date.now()}`;
    const outputPath = path.join(tmpDir, fileName);

    const mp3Path = await generateOpenAiTTS(sampleText, outputPath, apiKey, selectedVoice, "tts-1");

    const audioBuffer = fs.readFileSync(mp3Path);
    const base64Audio = audioBuffer.toString("base64");

    // Limpar arquivo temporário
    try { fs.unlinkSync(mp3Path); } catch (e) {}

    return res.status(200).json({ audio: base64Audio });
  } catch (err: any) {
    // Antes tudo virava 500 com a mensagem crua (às vezes vazia). Sem saber se
    // foi chave, saldo, voz ou disco, não há o que fazer na tela.
    const statusOpenAi = err?.status || err?.response?.status;
    const detalhe =
      err?.response?.data?.error?.message || err?.error?.message || err?.message;

    logger.error(
      `[PREVIEW-VOZ] falha ao gerar áudio (status ${statusOpenAi ?? "-"}): ${
        detalhe || err
      }`
    );

    // 401/403 NUNCA podem sair daqui: o interceptor do frontend trata qualquer
    // 401 como sessão expirada e desloga o usuário. Erro de credencial da
    // OpenAI não é sessão do EquipeChat.
    if (statusOpenAi === 401 || statusOpenAi === 403) {
      return res.status(422).json({
        error:
          "A OpenAI recusou esta chave de API. Confira a chave do agente e se ela tem acesso ao recurso de voz (TTS)."
      });
    }

    if (statusOpenAi === 429) {
      return res.status(422).json({
        error:
          "A OpenAI recusou por limite: sem créditos na conta ou muitas requisições em pouco tempo. Verifique o saldo em platform.openai.com."
      });
    }

    if (err?.code === "ENOENT" || err?.code === "EACCES") {
      return res.status(500).json({
        error:
          "Não foi possível gravar o áudio no servidor (pasta public sem permissão ou inexistente)."
      });
    }

    return res.status(500).json({
      error: detalhe || "Erro ao gerar a prévia de voz."
    });
  }
};

export const tokenStats = async (req: Request, res: Response): Promise<Response> => {
  const authHeader = req.headers.authorization;
  const [, token] = authHeader.split(" ");
  const decoded = verify(token, authConfig.secret);
  const { companyId } = decoded as TokenPayload;

  const prompts = await Prompt.findAll({
    where: { companyId },
    attributes: ["id", "name", "aiModel", "promptTokens", "completionTokens", "totalTokens"]
  });

  const totals = prompts.reduce(
    (acc, p) => ({
      promptTokens: acc.promptTokens + (p.promptTokens || 0),
      completionTokens: acc.completionTokens + (p.completionTokens || 0),
      totalTokens: acc.totalTokens + (p.totalTokens || 0)
    }),
    { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
  );

  return res.status(200).json({ prompts, totals });
};
