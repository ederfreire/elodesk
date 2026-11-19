import FindCompanySettingsService from "../services/CompaniesSettings/FindCompanySettingsService";
import logger from "../utils/logger";

/**
 * Mapa de moedas suportadas (espelha o frontend currencyHelper).
 */
const CURRENCIES: Record<string, { symbol: string; code: string }> = {
  BRL: { symbol: "R$", code: "BRL" },
  USD: { symbol: "$", code: "USD" },
  EUR: { symbol: "€", code: "EUR" },
  GBP: { symbol: "£", code: "GBP" },
  ARS: { symbol: "$", code: "ARS" },
  CLP: { symbol: "$", code: "CLP" },
  COP: { symbol: "$", code: "COP" },
  MXN: { symbol: "$", code: "MXN" },
  PEN: { symbol: "S/", code: "PEN" },
  UYU: { symbol: "$U", code: "UYU" },
  PYG: { symbol: "₲", code: "PYG" },
  BOB: { symbol: "Bs", code: "BOB" },
};

export const getCurrencyInfo = (code?: string) => {
  return CURRENCIES[(code || "").toUpperCase()] || CURRENCIES.BRL;
};

/**
 * Retorna o código da moeda configurada no plano/empresa (CompaniesSettings).
 * Faz fallback para a moeda da empresa master (id 1) e, por fim, "BRL".
 */
export const getCompanyCurrency = async (companyId: number): Promise<string> => {
  try {
    const settings = await FindCompanySettingsService({ companyId });
    return settings?.currency || "BRL";
  } catch (err: any) {
    logger.warn(`[CURRENCY] Falha ao obter moeda da empresa ${companyId}: ${err?.message}`);
    return "BRL";
  }
};

export default getCompanyCurrency;
