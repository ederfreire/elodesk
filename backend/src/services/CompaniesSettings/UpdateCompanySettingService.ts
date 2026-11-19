/** 
 * @TercioSantos-0 |
 * serviço/atualizar 1 configuração da empresa |
 * @params:companyId/column(name)/data
 */
import CompaniesSettings from "../../models/CompaniesSettings";

// Importar o cache de settings usado no wbotMessageListener para invalidar
let settingsCacheRef: any = null;
try {
  const { SimpleObjectCache } = require("../../utils/SimpleObjectCache");
  // Vamos acessar o cache por referência dinâmica
} catch (e) {}

type Params = {
  companyId: number,
  column: string,
  data: string
};

const UpdateCompanySettingsService = async ({ companyId, column, data }: Params): Promise<any> => {
  const companySettings = await CompaniesSettings.findOne({
    where: { companyId }
  });

  let result;
  if (!companySettings) {
    result = await CompaniesSettings.create({
      companyId,
      [column]: data
    });
  } else {
    await companySettings.update({
      [column]: data
    });
    result = companySettings;
  }

  // ✅ Invalidar cache in-memory de CompaniesSettings (usado pelo wbotMessageListener)
  try {
    const cacheModule = require("../WbotServices/wbotMessageListener");
    if (cacheModule._settingsCache) {
      cacheModule._settingsCache.del(`settings:${companyId}`);
    }
  } catch (e) {
    // Cache não acessível — não bloqueia a atualização
  }

  return result;
};

export default UpdateCompanySettingsService;
