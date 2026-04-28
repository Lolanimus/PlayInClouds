import { createQueryKeys } from "@lukemorales/query-key-factory";
import * as authEvents from "~/api/backend/auth";

export const auth = createQueryKeys("auth", {
	me: () => ({
		queryKey: ["me"],
		queryFn: () => authEvents.getCurrentActor(),
	}),
});