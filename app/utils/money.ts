import type { CurrencyCode, ExchangeRatesPayload } from "@/types/custom/api.types";

export const DEFAULT_CURRENCY: CurrencyCode = "CAD";

export function parseCadAmountFromPriceLabel(value: string) {
  const match = value.match(/\$\s*(\d+(?:\.\d+)?)/);
  if (!match) return null;

  const amount = Number(match[1]);
  return Number.isFinite(amount) ? amount : null;
}

export function resolveDisplayCurrency(
  preferredCurrency: CurrencyCode,
  rates: ExchangeRatesPayload | null | undefined
): CurrencyCode {
  if (preferredCurrency === "CAD") return "CAD";
  if (preferredCurrency === "USD" && typeof rates?.cad_to_usd === "number") return "USD";
  if (preferredCurrency === "EUR" && typeof rates?.cad_to_eur === "number") return "EUR";
  return "CAD";
}

export function convertCadAmount(
  amountCad: number,
  targetCurrency: CurrencyCode,
  rates: ExchangeRatesPayload | null | undefined
) {
  if (!Number.isFinite(amountCad)) return null;

  switch (targetCurrency) {
    case "CAD":
      return amountCad;
    case "USD":
      return typeof rates?.cad_to_usd === "number" ? amountCad * rates.cad_to_usd : null;
    case "EUR":
      return typeof rates?.cad_to_eur === "number" ? amountCad * rates.cad_to_eur : null;
    default:
      return amountCad;
  }
}

export function formatMoney(
  amount: number,
  currency: CurrencyCode,
  options?: Intl.NumberFormatOptions
) {
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
    ...options,
  }).format(amount);
}

export function formatMoneyFromCad(
  amountCad: number,
  preferredCurrency: CurrencyCode,
  rates: ExchangeRatesPayload | null | undefined,
  options?: Intl.NumberFormatOptions
) {
  const resolvedCurrency = resolveDisplayCurrency(preferredCurrency, rates);
  const converted = convertCadAmount(amountCad, resolvedCurrency, rates);

  if (converted === null) {
    return formatMoney(amountCad, "CAD", options);
  }

  return formatMoney(converted, resolvedCurrency, options);
}

export function formatHourlyRateFromCad(
  amountCad: number,
  preferredCurrency: CurrencyCode,
  rates: ExchangeRatesPayload | null | undefined
) {
  return `${formatMoneyFromCad(amountCad, preferredCurrency, rates)}`;
}
