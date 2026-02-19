import { NextResponse } from "next/server";

const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const TMDB_TOKEN_ENV_VAR = "TMDB_READ_TOKEN";
const missingTokenLoggedByCallSite = new Set<string>();

type ApiErrorCode =
  | "bad_request"
  | "not_found"
  | "upstream_error"
  | "config_error"
  | "network_error";

type ApiErrorBody = {
  error: {
    code: ApiErrorCode;
    message: string;
    details?: string;
  };
};

type TmdbFetchOptions = {
  query?: Record<string, string | number | undefined>;
  callSite?: string;
};

export class MissingTmdbTokenError extends Error {
  readonly envVarName = TMDB_TOKEN_ENV_VAR;
  readonly callSite: string;

  constructor(callSite: string) {
    super(
      `TMDB proxy is not configured. Missing ${TMDB_TOKEN_ENV_VAR}. (call site: ${callSite})`
    );
    this.name = "MissingTmdbTokenError";
    this.callSite = callSite;
  }
}

function jsonHeaders(cacheControl: string) {
  return {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": cacheControl,
  };
}

export function okJson<T>(data: T, cacheControl = "public, s-maxage=60, stale-while-revalidate=300") {
  return NextResponse.json(data, {
    status: 200,
    headers: jsonHeaders(cacheControl),
  });
}

export function errorJson(
  status: number,
  code: ApiErrorCode,
  message: string,
  details?: string
) {
  const body: ApiErrorBody = {
    error: {
      code,
      message,
      ...(details ? { details } : {}),
    },
  };

  return NextResponse.json(body, {
    status,
    headers: jsonHeaders("no-store"),
  });
}

export function parseRequiredString(
  value: string | null,
  field: string
): { ok: true; value: string } | { ok: false; response: NextResponse } {
  const trimmed = value?.trim() ?? "";
  if (!trimmed) {
    return {
      ok: false,
      response: errorJson(400, "bad_request", `Missing required query parameter: ${field}`),
    };
  }
  return { ok: true, value: trimmed };
}

export function parseEnum<T extends string>(
  value: string | null,
  allowed: readonly T[],
  field: string,
  defaultValue?: T
): { ok: true; value: T } | { ok: false; response: NextResponse } {
  const raw = value?.trim();
  if (!raw) {
    if (defaultValue !== undefined) return { ok: true, value: defaultValue };
    return {
      ok: false,
      response: errorJson(400, "bad_request", `Missing required query parameter: ${field}`),
    };
  }

  if (!allowed.includes(raw as T)) {
    return {
      ok: false,
      response: errorJson(
        400,
        "bad_request",
        `Invalid ${field}. Allowed values: ${allowed.join(", ")}`
      ),
    };
  }

  return { ok: true, value: raw as T };
}

export function parsePositiveInt(
  value: string | null,
  field: string,
  options?: { defaultValue?: number; min?: number; max?: number }
): { ok: true; value: number } | { ok: false; response: NextResponse } {
  const defaultValue = options?.defaultValue;
  const min = options?.min ?? 1;
  const max = options?.max ?? Number.MAX_SAFE_INTEGER;

  const raw = value?.trim();
  if (!raw) {
    if (defaultValue !== undefined) return { ok: true, value: defaultValue };
    return {
      ok: false,
      response: errorJson(400, "bad_request", `Missing required query parameter: ${field}`),
    };
  }

  const n = Number(raw);
  if (!Number.isInteger(n) || n < min || n > max) {
    return {
      ok: false,
      response: errorJson(
        400,
        "bad_request",
        `Invalid ${field}. Must be an integer between ${min} and ${max}.`
      ),
    };
  }

  return { ok: true, value: n };
}

export function validateLanguage(
  value: string | null
): { ok: true; value?: string } | { ok: false; response: NextResponse } {
  const raw = value?.trim();
  if (!raw) return { ok: true, value: undefined };

  // Accept common BCP-47-like language tags such as en, en-US, pt-BR.
  if (!/^[a-z]{2,3}(?:-[A-Za-z]{2,4})?$/.test(raw)) {
    return {
      ok: false,
      response: errorJson(
        400,
        "bad_request",
        "Invalid language. Use values like en, en-US, or pt-BR."
      ),
    };
  }

  return { ok: true, value: raw };
}

export async function tmdbFetch<T>(
  path: string,
  options?: TmdbFetchOptions
): Promise<{ ok: true; data: T } | { ok: false; response: NextResponse }> {
  const callSite = options?.callSite ?? "unknown";
  const token = process.env.TMDB_READ_TOKEN?.trim();
  if (!token) {
    if (process.env.NODE_ENV === "development" && !missingTokenLoggedByCallSite.has(callSite)) {
      missingTokenLoggedByCallSite.add(callSite);
      console.error("[tmdb] missing env var", {
        envVar: TMDB_TOKEN_ENV_VAR,
        callSite,
      });
    }
    throw new MissingTmdbTokenError(callSite);
  }

  const url = new URL(`${TMDB_BASE_URL}${path}`);
  for (const [key, value] of Object.entries(options?.query ?? {})) {
    if (value !== undefined) {
      url.searchParams.set(key, String(value));
    }
  }

  try {
    const response = await fetch(url.toString(), {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
      },
    });

    const data = await response.json().catch(() => ({}));
    if (!response.ok) {
      const detail =
        typeof data?.status_message === "string"
          ? data.status_message
          : `TMDB responded with status ${response.status}`;

      if (response.status === 404) {
        return {
          ok: false,
          response: errorJson(404, "not_found", "TMDB resource was not found.", detail),
        };
      }

      return {
        ok: false,
        response: errorJson(502, "upstream_error", "TMDB request failed.", detail),
      };
    }

    return { ok: true, data: data as T };
  } catch (error) {
    return {
      ok: false,
      response: errorJson(502, "network_error", "Network error while contacting TMDB.", String(error)),
    };
  }
}
