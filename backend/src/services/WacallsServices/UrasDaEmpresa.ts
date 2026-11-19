import { QueryTypes } from "sequelize";
import sequelize from "../../database";
import AppError from "../../errors/AppError";
import Whatsapp from "../../models/Whatsapp";
import logger from "../../utils/logger";

/**
 * DONO DE CADA URA DE VOZ (17.11.2026).
 *
 * O serviço do WhatsApp Plus guarda as URAs sem saber de empresa (o sistema
 * fala com ele por uma conta só). A tabela "UrasDaEmpresa" diz de quem é
 * cada uma, e tudo o que lista, abre, grava, apaga ou vincula URA passa
 * por aqui.
 *
 * URAs criadas antes da tabela não têm dono: na primeira vez que a empresa
 * abre a lista, ficam com ela as que já estavam vinculadas a uma conexão
 * dela. As outras sem dono só o super administrador vê.
 */

export const idsDaEmpresa = async (companyId: number): Promise<Set<string>> => {
  const linhas: any[] = await sequelize.query(
    `SELECT "flowId" FROM "UrasDaEmpresa" WHERE "companyId" = :companyId`,
    { replacements: { companyId }, type: QueryTypes.SELECT }
  );
  return new Set(linhas.map(l => String(l.flowId)));
};

export const idsComDono = async (): Promise<Set<string>> => {
  const linhas: any[] = await sequelize.query(`SELECT "flowId" FROM "UrasDaEmpresa"`, {
    type: QueryTypes.SELECT
  });
  return new Set(linhas.map(l => String(l.flowId)));
};

export const registrarUra = async (companyId: number, flowId: string): Promise<void> => {
  if (!flowId) return;
  await sequelize.query(
    `INSERT INTO "UrasDaEmpresa" ("flowId", "companyId", "createdAt", "updatedAt")
     VALUES (:flowId, :companyId, NOW(), NOW())
     ON CONFLICT ("flowId") DO NOTHING`,
    { replacements: { flowId: String(flowId), companyId } }
  );
};

export const esquecerUra = async (flowId: string): Promise<void> => {
  await sequelize.query(`DELETE FROM "UrasDaEmpresa" WHERE "flowId" = :flowId`, {
    replacements: { flowId: String(flowId) }
  });
};

/** Lança 404 se a URA não é desta empresa (o super administrador passa). */
export const garantirDaEmpresa = async (
  companyId: number,
  flowId: string,
  ehSuper = false
): Promise<void> => {
  const linhas: any[] = await sequelize.query(
    `SELECT "companyId" FROM "UrasDaEmpresa" WHERE "flowId" = :flowId LIMIT 1`,
    { replacements: { flowId: String(flowId) }, type: QueryTypes.SELECT }
  );
  const dono = linhas[0] ? Number(linhas[0].companyId) : null;
  if (dono === Number(companyId)) return;
  if (ehSuper && dono === null) return;
  throw new AppError("URA não encontrada.", 404);
};

/** URAs antigas sem dono que esta empresa já usa numa conexão passam a ser dela. */
export const reivindicarAntigas = async (companyId: number, idsExistentes: string[]): Promise<void> => {
  try {
    const comDono = await idsComDono();
    const semDono = idsExistentes.filter(id => !comDono.has(String(id)));
    if (!semDono.length) return;
    const conexoes = await Whatsapp.findAll({
      where: { companyId, channel: "wacalls" } as any,
      attributes: ["wacallsVoiceFlowId"]
    });
    const usadas = new Set(
      conexoes.map(c => String((c as any).wacallsVoiceFlowId || "").trim()).filter(Boolean)
    );
    for (const id of semDono) {
      if (usadas.has(String(id))) await registrarUra(companyId, String(id));
    }
  } catch (err: any) {
    logger.warn(`[URA] não consegui conferir URAs antigas da empresa ${companyId}: ${err?.message}`);
  }
};
