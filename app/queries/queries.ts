import { mergeQueryKeys } from "@lukemorales/query-key-factory";
import { QueryClient } from "@tanstack/react-query";
import { hours } from "./hours_query";
import { listings } from "./listings_query";
import { reservations } from "./reservations_query";
import { reviews } from "./reviews_query";

// Import the feature_query.ts, add that query object to the args of mergeQueryKeys()
// Ex: mergeQueryKeys(contacts, chat, ...);
export const queries = mergeQueryKeys(listings, reviews, hours, reservations);
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Infinity,
    },
  },
});
