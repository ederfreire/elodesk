/* eslint-disable new-cap */
import { formatCurrency } from "../helpers/currencyHelper";

/**
 * Legacy helper kept for backwards compatibility.
 * Now delegates to the centralized currency helper, which respects
 * the company's selected currency (BRL, EUR, USD, ...).
 */
export default function formatToCurrency(value) {
  return formatCurrency(value);
}
