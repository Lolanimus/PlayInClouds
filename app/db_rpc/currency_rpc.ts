import { processRpcRequest } from "~/app/api/supabase/helpers";
import type { CurrencyPreferenceSettings, ExchangeRatesPayload, CurrencyCode } from "@/types/custom/api.types";

const getCurrentUserCurrencyPreference = async () => {
  // Older databases may not have the optional currency migration yet.
  return await processRpcRequest("get_current_user_currency_preference", {}, {
    ignoreErrorCodes: ["PGRST202"],
  });
};

const updateCurrentUserCurrencyPreference = async (preferredCurrency: CurrencyCode) => {
  return await processRpcRequest("update_current_user_currency_preference", {
    p_preferred_currency: preferredCurrency,
  });
};

const getLatestExchangeRates = async () => {
  return await processRpcRequest("get_latest_exchange_rates", {}, {
    ignoreErrorCodes: ["PGRST202"],
  });
};

export {
  getCurrentUserCurrencyPreference,
  updateCurrentUserCurrencyPreference,
  getLatestExchangeRates,
};
export type {
  CurrencyCode,
  CurrencyPreferenceSettings,
  ExchangeRatesPayload,
};
