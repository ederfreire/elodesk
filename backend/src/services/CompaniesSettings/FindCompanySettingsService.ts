/** 
 * @TercioSantos-0 |
 * serviço/todas as configurações de 1 empresa |
 * @param:companyId
 */
import CompaniesSettings from "../../models/CompaniesSettings";

interface Request {
  companyId: number;
};

const FindCompanySettingsService = async ({
  companyId
}:Request): Promise<CompaniesSettings> => {
  let companySettings = await CompaniesSettings.findOne({
    where: { companyId }
  });

  // Buscar moeda master (admin) para usar como fallback
  let masterCurrency: string | null = null;
  if (companyId !== 1) {
    const masterSettings = await CompaniesSettings.findOne({
      where: { companyId: 1 }
    });
    masterCurrency = masterSettings?.currency || null;
  }

  // Caso 1: empresa não tem registro -> retorna objeto em memória com currency herdada
  if (!companySettings) {
    companySettings = CompaniesSettings.build({
      companyId,
      currency: masterCurrency || "BRL"
    } as any);
    return companySettings;
  }

  // Caso 2: registro existe mas currency está vazia
  // -> herda do master; se master também vazio, cai para "BRL"
  if (!companySettings.currency) {
    (companySettings as any).setDataValue(
      "currency",
      masterCurrency || "BRL"
    );
  }

  return companySettings;
};

export default FindCompanySettingsService;