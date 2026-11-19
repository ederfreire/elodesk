/**
 * Currency configuration map
 * Maps currency code to symbol, locale, and display info
 */
const CURRENCIES = {
  BRL: { symbol: "R$", locale: "pt-BR", code: "BRL", name: "Real Brasileiro" },
  USD: { symbol: "$", locale: "en-US", code: "USD", name: "Dólar Americano" },
  EUR: { symbol: "€", locale: "de-DE", code: "EUR", name: "Euro" },
  GBP: { symbol: "£", locale: "en-GB", code: "GBP", name: "Libra Esterlina" },
  ARS: { symbol: "$", locale: "es-AR", code: "ARS", name: "Peso Argentino" },
  CLP: { symbol: "$", locale: "es-CL", code: "CLP", name: "Peso Chileno" },
  COP: { symbol: "$", locale: "es-CO", code: "COP", name: "Peso Colombiano" },
  MXN: { symbol: "$", locale: "es-MX", code: "MXN", name: "Peso Mexicano" },
  PEN: { symbol: "S/", locale: "es-PE", code: "PEN", name: "Sol Peruano" },
  UYU: { symbol: "$U", locale: "es-UY", code: "UYU", name: "Peso Uruguayo" },
  PYG: { symbol: "₲", locale: "es-PY", code: "PYG", name: "Guaraní Paraguayo" },
  BOB: { symbol: "Bs", locale: "es-BO", code: "BOB", name: "Boliviano" },
};

/**
 * Get the company's currency code from localStorage (cached from settings)
 */
export const getCompanyCurrency = () => {
  try {
    return localStorage.getItem("companyCurrency") || "BRL";
  } catch {
    return "BRL";
  }
};

/**
 * Set the company's currency code in localStorage
 */
export const setCompanyCurrency = (currencyCode) => {
  // Não sobrescreve com BRL se a moeda vier vazia — mantém o que já estava
  if (!currencyCode) return;
  const code = currencyCode;
  try {
    localStorage.setItem("companyCurrency", code);
  } catch {}
  // Notifica todas as páginas abertas para re-renderizar com a nova moeda
  try {
    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("companyCurrencyChanged", { detail: code }));
    }
  } catch {}
};

/**
 * Get currency info object
 */
export const getCurrencyInfo = (code) => {
  return CURRENCIES[code] || CURRENCIES.BRL;
};

/**
 * Get the currency symbol for the company
 */
export const getCurrencySymbol = (code) => {
  const info = getCurrencyInfo(code || getCompanyCurrency());
  return info.symbol;
};

/**
 * Format a value using the company's currency
 * @param {number} value - The numeric value
 * @param {string} [currencyCode] - Optional override currency code
 * @returns {string} Formatted currency string
 */
export const formatCurrency = (value, currencyCode) => {
  const code = currencyCode || getCompanyCurrency();
  const info = getCurrencyInfo(code);
  
  try {
    return new Intl.NumberFormat(info.locale, {
      style: "currency",
      currency: info.code,
    }).format(value || 0);
  } catch {
    return `${info.symbol} ${Number(value || 0).toFixed(2)}`;
  }
};

/**
 * Get all available currencies for the selector
 */
export const getAvailableCurrencies = () => {
  return Object.entries(CURRENCIES).map(([code, info]) => ({
    code,
    symbol: info.symbol,
    name: info.name,
    label: `${info.symbol} - ${info.name} (${code})`,
  }));
};

export default {
  formatCurrency,
  getCurrencySymbol,
  getCompanyCurrency,
  setCompanyCurrency,
  getCurrencyInfo,
  getAvailableCurrencies,
};
