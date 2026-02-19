import type { PostgrestError } from "@supabase/supabase-js";

export type DbError = {
  code: string | null;
  message: string;
  details: string | null;
  hint: string | null;
  status: number | null;
};

type DbDebugContext = {
  operation: string;
  table?: string;
  rpc?: string;
  payload?: unknown;
};

export function toDbError(
  error: PostgrestError | null | undefined,
  status: number | null = null
): DbError | null {
  if (!error) return null;
  return {
    code: error.code ?? null,
    message: error.message ?? "Unknown database error",
    details: error.details ?? null,
    hint: error.hint ?? null,
    status,
  };
}

export function toUnknownDbError(error: unknown): DbError {
  return {
    code: null,
    message: String(error),
    details: null,
    hint: null,
    status: null,
  };
}

export function isAuthRetryableError(error: DbError | null | undefined) {
  if (!error) return false;
  const text = `${error.code ?? ""} ${error.message} ${error.details ?? ""}`.toLowerCase();
  return (
    text.includes("jwt") ||
    text.includes("auth_required") ||
    text.includes("token") ||
    text.includes("session") ||
    text.includes("not authenticated")
  );
}

export function logDbError(context: DbDebugContext, error: DbError | null | undefined) {
  if (process.env.NODE_ENV !== "development" || !error) return;
  console.error("[db]", {
    operation: context.operation,
    table: context.table ?? null,
    rpc: context.rpc ?? null,
    status: error.status,
    code: error.code,
    message: error.message,
    details: error.details,
    hint: error.hint,
    payload: context.payload ?? null,
  });
}
