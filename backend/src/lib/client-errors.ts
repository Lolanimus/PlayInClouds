type ErrorWithMetadata = {
  message?: unknown;
  code?: unknown;
  details?: unknown;
  hint?: unknown;
  statusCode?: unknown;
};

export type ClientError = Error & {
  statusCode?: number;
  code?: string;
  details?: string;
  hint?: string;
};

function getString(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 ? value : undefined;
}

function getErrorRecord(error: unknown): ErrorWithMetadata | null {
  return typeof error === "object" && error !== null ? (error as ErrorWithMetadata) : null;
}

export function getClientErrorMessage(error: unknown, fallbackMessage: string) {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  const record = getErrorRecord(error);
  return getString(record?.message) ?? fallbackMessage;
}

function getClientErrorMetadata(error: unknown) {
  const record = getErrorRecord(error);

  return {
    code: getString(record?.code),
    details: getString(record?.details),
    hint: getString(record?.hint),
  };
}

export function getClientStatusCode(message: string) {
  const normalized = message.toLowerCase();

  if (
    normalized.includes("authentication required") ||
    normalized.includes("missing bearer token") ||
    normalized.includes("unauthorized")
  ) {
    return 401;
  }

  if (
    normalized.includes("only ") ||
    normalized.includes("forbidden") ||
    normalized.includes("admin")
  ) {
    return 403;
  }

  if (normalized.includes("not found")) {
    return 404;
  }

  return 400;
}

export function throwClientError(errorOrMessage: unknown, statusCode: number, fallbackMessage?: string): never {
  const message = getClientErrorMessage(errorOrMessage, fallbackMessage ?? "Unexpected backend error");
  const metadata = getClientErrorMetadata(errorOrMessage);
  const error = new Error(message) as ClientError;
  error.statusCode = statusCode;

  if (metadata.code) {
    error.code = metadata.code;
  }

  if (metadata.details) {
    error.details = metadata.details;
  }

  if (metadata.hint) {
    error.hint = metadata.hint;
  }

  throw error;
}

export function rethrowClientError(error: unknown, fallbackMessage: string): never {
  const message = getClientErrorMessage(error, fallbackMessage);
  throwClientError(error, getClientStatusCode(message), fallbackMessage);
}

export async function withClientErrorHandling<T>(
  operation: () => Promise<T>,
  fallbackMessage: string
): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    rethrowClientError(error, fallbackMessage);
  }
}

export function requireClientResult<T>(
  value: T | null | undefined,
  message: string,
  statusCode = 500
): NonNullable<T> {
  if (value == null) {
    throwClientError(message, statusCode);
  }

  return value as NonNullable<T>;
}
