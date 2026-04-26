import { flattenError, ZodError } from "zod";
import type { ClientError } from "./client-errors";

export type ReplyLike = {
  code: (statusCode: number) => {
    send: (payload: unknown) => unknown;
  };
  log?: {
    error: (payload: unknown, message?: string) => unknown;
  };
};

type RouteErrorPayload = {
  error: string;
  code?: string;
  details?: string | ReturnType<typeof flattenError>;
  hint?: string;
};

function getRouteErrorMetadata(error: unknown) {
  if (typeof error !== "object" || error === null) {
    return {} as Pick<ClientError, "code" | "details" | "hint">;
  }

  const clientError = error as ClientError;

  return {
    code: typeof clientError.code === "string" ? clientError.code : undefined,
    details: typeof clientError.details === "string" ? clientError.details : undefined,
    hint: typeof clientError.hint === "string" ? clientError.hint : undefined,
  };
}

export function getRouteStatusCode(error: unknown) {
  return typeof error === "object" &&
    error !== null &&
    "statusCode" in error &&
    typeof error.statusCode === "number"
    ? error.statusCode
    : 500;
}

export function getRouteErrorMessage(error: unknown, fallback: string) {
  return error instanceof Error ? error.message : fallback;
}

export function getRouteErrorPayload(error: unknown, fallback: string): RouteErrorPayload {
  if (error instanceof ZodError) {
    const flattened = flattenError(error);
    return {
      error: "Validation failed",
      details: flattened,
    };
  }

  const metadata = getRouteErrorMetadata(error);

  return {
    error: getRouteErrorMessage(error, fallback),
    ...(metadata.code ? { code: metadata.code } : {}),
    ...(metadata.details ? { details: metadata.details } : {}),
    ...(metadata.hint ? { hint: metadata.hint } : {}),
  };
}

export function sendRouteError(reply: ReplyLike, error: unknown, fallback: string) {
  const statusCode = error instanceof ZodError ? 400 : getRouteStatusCode(error);
  const payload = getRouteErrorPayload(error, fallback);

  reply.log?.error(
    {
      err: error,
      statusCode,
      routeError: payload,
    },
    fallback
  );

  return reply.code(statusCode).send(payload);
}
