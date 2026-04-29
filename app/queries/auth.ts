import { createQueryKeys } from "@lukemorales/query-key-factory";
import * as authEvents from "@/db_rpc/auth_rpc";

export const auth = createQueryKeys("auth", {
	me: () => ({
		queryKey: ["me"],
		queryFn: () => authEvents.getCurrentActor(),
	}),
});