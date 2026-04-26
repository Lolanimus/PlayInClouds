import supabase from "@/utils/supabase";

export type BackendMethod = "GET" | "POST" | "PUT" | "PATCH" | "DELETE";

export const backendBaseUrl = (import.meta.env.VITE_BACKEND_URL ?? "http://127.0.0.1:3000").replace(/\/$/, "");

export async function getAccessToken(message: string) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const accessToken = session?.access_token;

  if (!accessToken) {
    throw new Error(message);
  }

  return accessToken;
}

export function buildQueryString(params: Record<string, string | number | null | undefined>) {
  const searchParams = new URLSearchParams();

  for (const [key, value] of Object.entries(params)) {
    if (value == null || value === "") continue;
    searchParams.set(key, String(value));
  }

  const queryString = searchParams.toString();
  return queryString ? `?${queryString}` : "";
}

export async function requestBackend<T>(args: {
  path: string;
  method?: BackendMethod;
  body?: unknown;
  accessToken?: string;
  fallbackMessage: string;
}): Promise<T> {
  const response = await fetch(`${backendBaseUrl}${args.path}`, {
    method: args.method ?? "GET",
    credentials: "include",
    headers: {
      ...(args.body ? { "Content-Type": "application/json" } : {}),
      ...(args.accessToken ? { Authorization: `Bearer ${args.accessToken}` } : {}),
    },
    ...(args.body ? { body: JSON.stringify(args.body) } : {}),
  });

  const payload = await response.json().catch(() => null);

  if (!response.ok) {
    const message =
      payload && typeof payload === "object" && "error" in payload
        ? typeof payload.error === "string"
          ? payload.error
          : args.fallbackMessage
        : args.fallbackMessage;

    throw new Error(message);
  }

  return payload as T;
}
