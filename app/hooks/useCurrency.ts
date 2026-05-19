import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { getCurrentUserCurrencyPreference, getLatestExchangeRates, updateCurrentUserCurrencyPreference } from "@/db_rpc/currency_rpc";
import { useUser } from "@/store/user_state";
import { DEFAULT_CURRENCY, convertCadAmount, formatHourlyRateFromCad, formatMoneyFromCad, resolveDisplayCurrency } from "@/utils/money";
import type { CurrencyCode, CurrencyPreferenceSettings, ExchangeRatesPayload } from "@/types/custom/api.types";

const BANK_OF_CANADA_VALET_URL = "https://www.bankofcanada.ca/valet/observations";

const fallbackPreference: CurrencyPreferenceSettings = {
  preferred_currency: DEFAULT_CURRENCY,
};

export const fallbackExchangeRates: ExchangeRatesPayload = {
  base_currency: "CAD",
  as_of: null,
  cad_to_cad: 1,
  cad_to_usd: null,
  cad_to_eur: null,
};

type ObservationPayload = {
  observations?: Array<Record<string, { v?: string } | string>>;
};

function hasUsableRates(rates: ExchangeRatesPayload | null | undefined) {
  return Boolean(
    rates
    && (
      typeof rates.cad_to_usd === "number"
      || typeof rates.cad_to_eur === "number"
    )
  );
}

async function fetchSeries(seriesName: string) {
  const response = await fetch(`${BANK_OF_CANADA_VALET_URL}/${seriesName}/json?recent=1`, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Bank of Canada request failed for ${seriesName}.`);
  }

  const payload = await response.json() as ObservationPayload;
  const observation = payload.observations?.[0];

  if (!observation) {
    throw new Error(`No observations returned for ${seriesName}.`);
  }

  const asOf = typeof observation.d === "string" ? observation.d : null;
  const value = observation[seriesName];
  const rateToCad = value && typeof value === "object" && "v" in value
    ? Number.parseFloat(String(value.v ?? ""))
    : Number.NaN;

  if (!asOf || !Number.isFinite(rateToCad) || rateToCad <= 0) {
    throw new Error(`Invalid observation returned for ${seriesName}.`);
  }

  return { asOf, rateToCad };
}

async function fetchLatestExchangeRatesFromBankOfCanada(): Promise<ExchangeRatesPayload> {
  const [usdToCad, eurToCad] = await Promise.all([
    fetchSeries("FXUSDCAD"),
    fetchSeries("FXEURCAD"),
  ]);

  return {
    base_currency: "CAD",
    as_of: usdToCad.asOf >= eurToCad.asOf ? usdToCad.asOf : eurToCad.asOf,
    cad_to_cad: 1,
    cad_to_usd: 1 / usdToCad.rateToCad,
    cad_to_eur: 1 / eurToCad.rateToCad,
  };
}

export function useCurrencyPreference(config?: { enabled?: boolean }) {
  const user = useUser();

  return useQuery({
    queryKey: ["currency", "preference", user?.id ?? "anon"],
    queryFn: async () => {
      if (!user?.id) return fallbackPreference;
      return (await getCurrentUserCurrencyPreference()) ?? fallbackPreference;
    },
    enabled: config?.enabled ?? true,
  });
}

export function useLatestExchangeRates(config?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ["currency", "rates"],
    queryFn: async () => {
      const cachedRates = await getLatestExchangeRates();

      if (hasUsableRates(cachedRates)) {
        return cachedRates;
      }

      try {
        return await fetchLatestExchangeRatesFromBankOfCanada();
      } catch {
        return cachedRates ?? fallbackExchangeRates;
      }
    },
    enabled: config?.enabled ?? true,
  });
}

export function useCurrency() {
  const preferenceQuery = useCurrencyPreference();
  const ratesQuery = useLatestExchangeRates();

  const preferredCurrency = (preferenceQuery.data?.preferred_currency ?? DEFAULT_CURRENCY) as CurrencyCode;
  const rates = ratesQuery.data ?? fallbackExchangeRates;
  const displayCurrency = resolveDisplayCurrency(preferredCurrency, rates);

  return useMemo(() => ({
    preferredCurrency,
    displayCurrency,
    rates,
    preferenceQuery,
    ratesQuery,
    convertFromCad: (amountCad: number) => convertCadAmount(amountCad, displayCurrency, rates),
    formatFromCad: (amountCad: number, options?: Intl.NumberFormatOptions) =>
      formatMoneyFromCad(amountCad, preferredCurrency, rates, options),
    isUsingEstimatedConversion: displayCurrency !== "CAD",
  }), [displayCurrency, preferredCurrency, preferenceQuery, rates, ratesQuery]);
}

export { updateCurrentUserCurrencyPreference };
