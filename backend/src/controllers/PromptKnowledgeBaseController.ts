import { Request, Response } from "express";
import { verify } from "jsonwebtoken";
import authConfig from "../config/auth";
import PromptKnowledgeBase from "../models/PromptKnowledgeBase";
import path from "path";
import fs from "fs";
import axios from "axios";

interface TokenPayload {
  id: string;
  companyId: number;
  iat: number;
  exp: number;
}

const getCompanyId = (req: Request): number => {
  const authHeader = req.headers.authorization;
  const [, token] = authHeader!.split(" ");
  const decoded = verify(token, authConfig.secret);
  return (decoded as TokenPayload).companyId;
};

export const index = async (req: Request, res: Response): Promise<Response> => {
  const companyId = getCompanyId(req);
  const { promptId } = req.params;

  const items = await PromptKnowledgeBase.findAll({
    where: { promptId, companyId },
    order: [["createdAt", "DESC"]]
  });

  return res.status(200).json(items);
};

export const store = async (req: Request, res: Response): Promise<Response> => {
  const companyId = getCompanyId(req);
  const { promptId } = req.params;
  const { name, type, content } = req.body;

  try {
    let finalContent = content;

    // Se for URL, tentar extrair conteúdo da página
    if (type === "url" && content) {
      try {
        const response = await axios.get(content, { timeout: 10000 });
        // Extrair texto removendo tags HTML
        const textContent = response.data
          .replace(/<script[^>]*>[\s\S]*?<\/script>/gi, "")
          .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, "")
          .replace(/<nav[^>]*>[\s\S]*?<\/nav>/gi, "")
          .replace(/<footer[^>]*>[\s\S]*?<\/footer>/gi, "")
          .replace(/<[^>]+>/g, " ")
          .replace(/\s+/g, " ")
          .trim()
          .substring(0, 50000);
        finalContent = `URL: ${content}\n\nConteúdo:\n${textContent}`;
      } catch (err) {
        finalContent = `URL: ${content}\n(Não foi possível extrair o conteúdo automaticamente)`;
      }
    }

    const item = await PromptKnowledgeBase.create({
      name,
      type,
      content: finalContent,
      promptId: +promptId,
      companyId,
      active: true
    });

    return res.status(201).json(item);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};

export const storeFile = async (req: Request, res: Response): Promise<Response> => {
  const companyId = getCompanyId(req);
  const { promptId } = req.params;

  if (!req.file) {
    return res.status(400).json({ error: "Nenhum arquivo enviado" });
  }

  const file = req.file;
  const type = getFileType(file.mimetype);
  let extractedContent = "";

  try {
    if (type === "text" || file.mimetype === "text/plain") {
      extractedContent = fs.readFileSync(file.path, "utf-8").substring(0, 50000);
    } else if (type === "pdf" || file.mimetype === "application/pdf") {
      // Extração de texto de PDF
      const pdfParse = (await import("pdf-parse")).default;
      const buffer = fs.readFileSync(file.path);
      const parsed = await pdfParse(buffer);
      extractedContent = (parsed.text || "").replace(/\s+/g, " ").trim().substring(0, 50000);
    } else if (
      type === "doc" ||
      file.mimetype.includes("wordprocessingml") ||
      file.mimetype === "application/msword"
    ) {
      // Extração de texto de DOC/DOCX (mammoth suporta .docx nativo; .doc antigo é limitado)
      const mammoth = await import("mammoth");
      const result = await mammoth.extractRawText({ path: file.path });
      extractedContent = (result.value || "").replace(/\s+/g, " ").trim().substring(0, 50000);
    }
  } catch (e: any) {
    // Falha na extração não bloqueia o upload — apenas registra
    console.warn(`[KnowledgeBase] Falha ao extrair texto de ${file.originalname}: ${e?.message}`);
  }

  try {
    const item = await PromptKnowledgeBase.create({
      name: req.body.name || file.originalname,
      type,
      content: extractedContent
        ? `Arquivo: ${file.originalname}\n\nConteúdo:\n${extractedContent}`
        : `[Arquivo: ${file.originalname}] (não foi possível extrair o conteúdo automaticamente)`,
      mediaUrl: file.filename,
      mediaType: file.mimetype,
      originalName: file.originalname,
      promptId: +promptId,
      companyId,
      active: true
    });

    return res.status(201).json(item);
  } catch (err: any) {
    return res.status(500).json({ error: err.message });
  }
};

export const update = async (req: Request, res: Response): Promise<Response> => {
  const companyId = getCompanyId(req);
  const { id } = req.params;
  const { name, content, active } = req.body;

  const item = await PromptKnowledgeBase.findOne({
    where: { id, companyId }
  });

  if (!item) {
    return res.status(404).json({ error: "Item não encontrado" });
  }

  await item.update({ name, content, active });
  return res.status(200).json(item);
};

export const remove = async (req: Request, res: Response): Promise<Response> => {
  const companyId = getCompanyId(req);
  const { id } = req.params;

  const item = await PromptKnowledgeBase.findOne({
    where: { id, companyId }
  });

  if (!item) {
    return res.status(404).json({ error: "Item não encontrado" });
  }

  // Deletar arquivo se existir
  if (item.mediaUrl) {
    const filePath = path.resolve(__dirname, "..", "..", "public", `company${companyId}`, item.mediaUrl);
    try { fs.unlinkSync(filePath); } catch (e) {}
  }

  await item.destroy();
  return res.status(200).json({ message: "Item removido" });
};

function getFileType(mimetype: string): string {
  if (mimetype.startsWith("audio/")) return "audio";
  if (mimetype.startsWith("video/")) return "video";
  if (mimetype === "application/pdf") return "pdf";
  if (mimetype.includes("document") || mimetype.includes("msword") || mimetype.includes("wordprocessingml")) return "doc";
  return "text";
}
