import { useEffect, useState, useRef, useCallback } from "react";
import api from "../services/api";
import { setCompanyCurrency, getCompanyCurrency } from "../helpers/currencyHelper";

/**
 * Hook centralizado para carregar a moeda da empresa.
 *
 * Estratégia anti-flash:
 *  1. Se o cache local for diferente da moeda real do backend, REMOVE o cache
 *     antes de qualquer render, para que `getCompanyCurrency()` não devolva
 *     valor obsoleto.
 *  2. Marca `currencyReady=false` enquanto o fetch não responde.
 *  3. Após resposta, persiste a moeda nova no localStorage e dispara
 *     `companyCurrencyChanged` para que outras telas abertas atualizem.
 *  4. Re-fetch automático ao receber `companyCurrencyChanged` de outra origem.
 *
 * Retorna { currencyReady, currency, refetch }.
 */
export default function useCompanyCurrency(companyId) {
  const [currencyReady, setCurrencyReady] = useState(false);
  const [currency, setCurrency] = useState(null);
  const lastFetchedFor = useRef(null);
  const isMounted = useRef(true);
  const skipNextEvent = useRef(false);

  const fetchCurrency = useCallback(async () => {
    if (!companyId) {
      setCurrencyReady(true);
      return;
    }
    // setCompanyCurrency dispara `companyCurrencyChanged`; ignoramos a próxima
    // notificação para não entrar em loop de fetch.
    skipNextEvent.current = true;
    try {
      const cached = getCompanyCurrency();
      const { data } = await api.get(`/companySettings/${companyId}`);
      const fresh = data?.currency || null;

      if (fresh && fresh !== cached) {
        // Backend tem moeda diferente do cache: limpa antes de aplicar a nova
        try {
          localStorage.removeItem("companyCurrency");
        } catch {}
        setCompanyCurrency(fresh);
      } else if (fresh) {
        // Igual ao cache: garante consistência
        setCompanyCurrency(fresh);
      } else {
        // Backend não retornou moeda (não deveria acontecer com fallback novo):
        // limpa cache para evitar mostrar valor antigo
        try {
          localStorage.removeItem("companyCurrency");
        } catch {}
      }

      if (isMounted.current) {
        setCurrency(fresh);
      }
    } catch {
      // Em erro de rede, limpa cache para não mostrar moeda obsoleta
      try {
        localStorage.removeItem("companyCurrency");
      } catch {}
    } finally {
      if (isMounted.current) setCurrencyReady(true);
    }
  }, [companyId]);

  useEffect(() => {
    isMounted.current = true;
    if (companyId && lastFetchedFor.current !== companyId) {
      lastFetchedFor.current = companyId;
      setCurrencyReady(false);
      fetchCurrency();
    } else if (!companyId) {
      setCurrencyReady(true);
    }

    const handler = () => {
      if (skipNextEvent.current) {
        skipNextEvent.current = false;
        return;
      }
      fetchCurrency();
    };
    window.addEventListener("companyCurrencyChanged", handler);
    return () => {
      isMounted.current = false;
      window.removeEventListener("companyCurrencyChanged", handler);
    };
  }, [companyId, fetchCurrency]);

  return { currencyReady, currency, refetch: fetchCurrency };
}
