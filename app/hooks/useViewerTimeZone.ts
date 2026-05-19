import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { queries } from "@/queries/queries";
import { useUser } from "@/store/user_state";
import { getBrowserTimeZone } from "@/lib/date-time";

export function useViewerTimeZone() {
  const user = useUser();
  const browserTimeZone = getBrowserTimeZone();

  const preferenceQuery = useQuery({
    ...queries.timezone.preference(user?.id),
    staleTime: Infinity,
  });

  const preferredTimeZone = preferenceQuery.data?.preferred_time_zone ?? null;
  const viewerTimeZone = preferredTimeZone ?? browserTimeZone;

  return useMemo(() => ({
    browserTimeZone,
    preferenceQuery,
    preferredTimeZone,
    viewerTimeZone,
    isUsingBrowserTimeZone: preferredTimeZone === null,
  }), [browserTimeZone, preferenceQuery, preferredTimeZone, viewerTimeZone]);
}
