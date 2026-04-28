import { type UseQueryResult, useQuery } from "@tanstack/react-query";

import { queries } from "@/queries/queries";
import type { CurrentActor } from "@/types/custom/api.types";

export const useCurrentActor = (
	config?: { enabled?: boolean }
): UseQueryResult<CurrentActor | null, Error> => {
	const query = useQuery({
		...queries.auth.me(),
		enabled: config?.enabled ?? true,
	});

	return query as UseQueryResult<CurrentActor | null, Error>;
};