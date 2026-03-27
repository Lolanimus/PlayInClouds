import { mergeQueryKeys } from "@lukemorales/query-key-factory";
import { QueryClient } from "@tanstack/react-query";

// Import the feature_query.ts, add that query object to the args of mergeQueryKeys()
// Ex: mergeQueryKeys(contacts, chat, ...);
export const queries = mergeQueryKeys();
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: Infinity,
    },
  },
});
