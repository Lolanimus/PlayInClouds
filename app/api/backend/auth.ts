import type { CurrentActor } from "@/types/custom/api.types";

import { getAccessToken, requestBackend } from "./shared";

export async function getCurrentActor(): Promise<CurrentActor> {
  const accessToken = await getAccessToken("You must be logged in to view account access.");
  const payload = await requestBackend<{ actor: CurrentActor }>({
    path: "/api/auth/me",
    accessToken,
    fallbackMessage: "Failed to get current actor",
  });

  return payload.actor;
}