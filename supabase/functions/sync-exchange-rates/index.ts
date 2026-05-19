import { createServiceClient } from "../_shared/supabase.ts";
import { corsHeaders, errorResponse, jsonResponse } from "../_shared/http.ts";

const BANK_OF_CANADA_VALET_URL = "https://www.bankofcanada.ca/valet/observations";

type ObservationPayload = {
  observations?: Array<Record<string, { v?: string } | string>>;
};

type ParsedRate = {
  asOf: string;
  rateToCad: number;
};

function parseRateValue(value: unknown) {
  const parsed = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function parseObservation(payload: ObservationPayload, seriesName: string): ParsedRate {
  const observation = payload.observations?.[0];

  if (!observation) {
    throw new Error(`No observations returned for ${seriesName}.`);
  }

  const dateValue = typeof observation.d === "string" ? observation.d : "";
  const seriesValue = observation[seriesName];

  if (!dateValue) {
    throw new Error(`Missing observation date for ${seriesName}.`);
  }

  if (!seriesValue || typeof seriesValue !== "object" || !("v" in seriesValue)) {
    throw new Error(`Missing observation value for ${seriesName}.`);
  }

  const rateToCad = parseRateValue(seriesValue.v);

  if (!rateToCad) {
    throw new Error(`Invalid observation value for ${seriesName}.`);
  }

  return {
    asOf: dateValue,
    rateToCad,
  };
}

async function fetchSeries(seriesName: string) {
  const response = await fetch(`${BANK_OF_CANADA_VALET_URL}/${seriesName}/json?recent=1`, {
    headers: {
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    throw new Error(`Bank of Canada request failed for ${seriesName}: ${response.status} ${response.statusText}`);
  }

  const payload = await response.json() as ObservationPayload;
  return parseObservation(payload, seriesName);
}

Deno.serve(async (request) => {
  if (request.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (request.method !== "POST") {
    return errorResponse("Method not allowed", 405);
  }

  try {
    const [usdToCad, eurToCad] = await Promise.all([
      fetchSeries("FXUSDCAD"),
      fetchSeries("FXEURCAD"),
    ]);

    const asOf = usdToCad.asOf >= eurToCad.asOf ? usdToCad.asOf : eurToCad.asOf;
    const cadToUsd = 1 / usdToCad.rateToCad;
    const cadToEur = 1 / eurToCad.rateToCad;

    const service = createServiceClient();
    const { error } = await service
      .from("exchange_rates")
      .upsert(
        [
          {
            base_currency: "CAD",
            quote_currency: "CAD",
            rate: 1,
            as_of: asOf,
            source: "bank_of_canada",
          },
          {
            base_currency: "CAD",
            quote_currency: "USD",
            rate: cadToUsd,
            as_of: asOf,
            source: "bank_of_canada",
          },
          {
            base_currency: "CAD",
            quote_currency: "EUR",
            rate: cadToEur,
            as_of: asOf,
            source: "bank_of_canada",
          },
        ],
        {
          onConflict: "base_currency,quote_currency,as_of",
        }
      );

    if (error) {
      throw new Error(`Failed to upsert exchange rates: ${error.message}`);
    }

    return jsonResponse({
      ok: true,
      asOf,
      rates: {
        cad_to_cad: 1,
        cad_to_usd: cadToUsd,
        cad_to_eur: cadToEur,
      },
    });
  } catch (error) {
    console.error("sync-exchange-rates failed", error);
    return errorResponse(error instanceof Error ? error.message : "Exchange rate sync failed", 500);
  }
});
