import { Request, Response } from "express";
import path from "path";
import fs from "fs";
import InteractiveMessageService from "../services/WbotServices/InteractiveMessageService";
import AppError from "../errors/AppError";

export const send = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const { whatsappId, jid, type, data } = req.body;

  if (!jid) {
    throw new AppError("O campo 'jid' é obrigatório", 400);
  }

  if (!type) {
    throw new AppError("O campo 'type' é obrigatório", 400);
  }

  if (!data || typeof data !== "object") {
    throw new AppError("O campo 'data' é obrigatório e deve ser um objeto", 400);
  }

  const result = await InteractiveMessageService({
    companyId,
    whatsappId: whatsappId ? Number(whatsappId) : undefined,
    jid,
    type,
    data,
  });

  return res.status(200).json({
    message: "Mensagem interativa enviada com sucesso",
    messageId: result?.key?.id || null,
  });
};

// Upload dedicado de PDF/boleto para mensagens interativas (Cobrança / PIX).
// Salva o arquivo em public/company{companyId}/interactive e retorna o caminho
// relativo à pasta public, usado depois no envio como documento.
export const uploadPdf = async (req: Request, res: Response): Promise<Response> => {
  const { companyId } = req.user;
  const file = (req.file as Express.Multer.File) || (req.files as Express.Multer.File[])?.[0];

  if (!file) {
    throw new AppError("Nenhum arquivo enviado", 400);
  }

  const publicFolder = path.resolve(__dirname, "..", "..", "public");
  const targetDir = path.resolve(publicFolder, `company${companyId}`, "interactive");

  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
    try {
      fs.chmodSync(targetDir, 0o777);
    } catch (_) {
      /* noop */
    }
  }

  // Move o arquivo para a pasta de interativos (caso o multer tenha salvo em outro lugar)
  const safeName = `${Date.now()}_${(file.originalname || "documento.pdf")
    .replace(/[^\w.\-]/g, "_")}`;
  const finalPath = path.resolve(targetDir, safeName);

  try {
    if (file.path && fs.existsSync(file.path) && file.path !== finalPath) {
      fs.renameSync(file.path, finalPath);
    } else if (file.buffer) {
      fs.writeFileSync(finalPath, file.buffer);
    }
  } catch (err: any) {
    throw new AppError(`Falha ao salvar arquivo: ${err?.message}`, 500);
  }

  const relativePath = `company${companyId}/interactive/${safeName}`;

  return res.status(200).json({
    filename: relativePath,
    originalname: file.originalname,
  });
};
