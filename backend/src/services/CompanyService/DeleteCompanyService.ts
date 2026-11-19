import Company from "../../models/Company";
import AppError from "../../errors/AppError";
import sequelize from "../../database";
import logger from "../../utils/logger";

const DeleteCompanyService = async (id: string): Promise<void> => {
  const company = await Company.findOne({ where: { id } });

  if (!company) {
    throw new AppError("ERR_NO_COMPANY_FOUND", 404);
  }

  // Garantir que as FKs de Prompts sejam CASCADE/SET NULL (idempotente, fora da transação).
  try {
    await sequelize.query(
      'ALTER TABLE "Prompts" ALTER COLUMN "queueId" DROP NOT NULL;'
    );
  } catch (err) {
    logger.warn(`DeleteCompanyService: ALTER queueId nullable: ${(err as any).message}`);
  }
  try {
    await sequelize.query(
      'ALTER TABLE "Prompts" DROP CONSTRAINT IF EXISTS "Prompts_companyId_fkey";'
    );
    await sequelize.query(
      'ALTER TABLE "Prompts" ADD CONSTRAINT "Prompts_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Companies"("id") ON UPDATE CASCADE ON DELETE CASCADE;'
    );
  } catch (err) {
    logger.warn(`DeleteCompanyService: recriar FK companyId CASCADE: ${(err as any).message}`);
  }
  try {
    await sequelize.query(
      'ALTER TABLE "Prompts" DROP CONSTRAINT IF EXISTS "Prompts_queueId_fkey";'
    );
    await sequelize.query(
      'ALTER TABLE "Prompts" ADD CONSTRAINT "Prompts_queueId_fkey" FOREIGN KEY ("queueId") REFERENCES "Queues"("id") ON UPDATE CASCADE ON DELETE SET NULL;'
    );
  } catch (err) {
    logger.warn(`DeleteCompanyService: recriar FK queueId SET NULL: ${(err as any).message}`);
  }
  try {
    await sequelize.query(
      'ALTER TABLE "Invoices" DROP CONSTRAINT IF EXISTS "Invoices_companyId_fkey";'
    );
    await sequelize.query(
      'ALTER TABLE "Invoices" ADD CONSTRAINT "Invoices_companyId_fkey" FOREIGN KEY ("companyId") REFERENCES "Companies"("id") ON UPDATE CASCADE ON DELETE CASCADE;'
    );
  } catch (err) {
    logger.warn(`DeleteCompanyService: recriar FK Invoices.companyId CASCADE: ${(err as any).message}`);
  }

  const t = await sequelize.transaction();
  try {
    // 1) Quebrar referência das Queues -> Prompts (promptId)
    await sequelize.query(
      'UPDATE "Queues" SET "promptId" = NULL WHERE "companyId" = :companyId',
      { replacements: { companyId: id }, transaction: t }
    );

    // 2) Remover Prompts da empresa
    await sequelize.query(
      'DELETE FROM "Prompts" WHERE "companyId" = :companyId',
      { replacements: { companyId: id }, transaction: t }
    );

    // 3) Remover Prompts cujo queueId pertence a Queues desta empresa
    await sequelize.query(
      'DELETE FROM "Prompts" WHERE "queueId" IN (SELECT id FROM "Queues" WHERE "companyId" = :companyId)',
      { replacements: { companyId: id }, transaction: t }
    );

    // 4) Deletar a Company via SQL direto (evita hooks/cascatas inesperadas do Sequelize)
    await sequelize.query(
      'DELETE FROM "Companies" WHERE "id" = :companyId',
      { replacements: { companyId: id }, transaction: t }
    );
    await t.commit();
  } catch (err) {
    await t.rollback();
    throw err;
  }
};

export default DeleteCompanyService;
