import FindCompanySettingsService from "../services/CompaniesSettings/FindCompanySettingsService";
import logger from "../utils/logger";

/**
 * Mapa de moedas suportadas (espelha o frontend currencyHelper).
 */
const CURRENCIES: Record<string, { symbol: string; code: string; locale: string }> = {
  BRL: { symbol: "R$", code: "BRL", locale: "pt-BR" },
  USD: { symbol: "$", code: "USD", locale: "en-US" },
  EUR: { symbol: "€", code: "EUR", locale: "de-DE" },
  GBP: { symbol: "£", code: "GBP", locale: "en-GB" },
  ARS: { symbol: "$", code: "ARS", locale: "es-AR" },
  CLP: { symbol: "$", code: "CLP", locale: "es-CL" },
  COP: { symbol: "$", code: "COP", locale: "es-CO" },
  MXN: { symbol: "$", code: "MXN", locale: "es-MX" },
  PEN: { symbol: "S/", code: "PEN", locale: "es-PE" },
  UYU: { symbol: "$U", code: "UYU", locale: "es-UY" },
  PYG: { symbol: "₲", code: "PYG", locale: "es-PY" },
  BOB: { symbol: "Bs", code: "BOB", locale: "es-BO" },
};

export const getCurrencyInfo = (code?: string) => {
  return CURRENCIES[(code || "").toUpperCase()] || CURRENCIES.BRL;
};

export const formatCompanyCurrency = (value: number, currencyCode?: string): string => {
  const currency = getCurrencyInfo(currencyCode);
  return new Intl.NumberFormat(currency.locale, {
    style: "currency",
    currency: currency.code
  }).format(Number(value || 0));
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
