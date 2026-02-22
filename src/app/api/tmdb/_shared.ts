import { NextRequest, NextResponse } from "next/server";
import { isSupabaseAdminConfigured, supabaseAdmin } from "@/lib/supabaseAdmin";

const TMDB_BASE_URL = "https://api.themoviedb.org/3";
const TMDB_TOKEN_ENV_VAR = "TMDB_READ_TOKEN";
const missingTokenLoggedByCallSite = new Set<string>();

type ApiErrorCode =
  | "bad_request"
  | "not_found"
  | "upstream_error"
  | "config_error"
  | "network_error"
  | "rate_limited";

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

type TmdbProxyRateLimitBucket = {
  count: number;
  resetAtMs: number;
  lastSeenAtMs: number;
};

const TMDB_PROXY_WINDOW_MS = 60_000;
const TMDB_PROXY_MAX_REQUESTS_PER_WINDOW = 80;
const TMDB_PROXY_SUSPECTED_BOT_MAX_REQUESTS_PER_WINDOW = 20;
const TMDB_PROXY_BUCKET_TTL_MS = 10 * 60_000;
const tmdbProxyBuckets = new Map<string, TmdbProxyRateLimitBucket>();
const likelyAutomatedUserAgentPatterns = [
  /bot/i,
  /crawler/i,
  /spider/i,
  /curl/i,
  /wget/i,
  /python/i,
  /node-fetch/i,
  /axios/i,
  /postmanruntime/i,
  /insomnia/i,
  /httpie/i,
  /go-http-client/i,
];

type SharedRateLimitRpcRow = {
  allowed: boolean;
  retry_after_seconds: number;
  remaining: number;
  reset_at: string;
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
  details?: string,
  extraHeaders?: Record<string, string>
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
    headers: {
      ...jsonHeaders("no-store"),
      ...(extraHeaders ?? {}),
    },
  });
}

function tmdbProxyClientAddress(request: NextRequest) {
  const xForwardedFor = request.headers.get("x-forwarded-for");
  if (xForwardedFor) {
    const first = xForwardedFor.split(",")[0]?.trim();
    if (first) return first;
  }
  const realIp = request.headers.get("x-real-ip")?.trim();
  if (realIp) return realIp;
  return "unknown";
}

function isLikelyAutomatedUserAgent(userAgent: string) {
  if (!userAgent.trim()) return true;
  return likelyAutomatedUserAgentPatterns.some((pattern) => pattern.test(userAgent));
}

function cleanupTmdbProxyBuckets(nowMs: number) {
  for (const [key, value] of tmdbProxyBuckets) {
    if (value.lastSeenAtMs + TMDB_PROXY_BUCKET_TTL_MS < nowMs) {
      tmdbProxyBuckets.delete(key);
    }
  }
}

async function checkSharedTmdbRateLimit(input: {
  bucketKey: string;
  maxRequests: number;
  callSite: string;
}): Promise<{
  allowed: boolean;
  retryAfterSeconds: number;
} | null> {
  if (!isSupabaseAdminConfigured() || !supabaseAdmin) return null;

  try {
    const response = await supabaseAdmin.rpc("acquire_api_rate_limit", {
      p_scope: "tmdb_proxy",
      p_client_key: input.bucketKey,
      p_window_seconds: Math.floor(TMDB_PROXY_WINDOW_MS / 1000),
      p_max_requests: input.maxRequests,
    });

    if (response.error) {
      if (process.env.NODE_ENV === "development") {
        console.warn("[tmdb] shared rate limit RPC error; falling back to memory limiter", {
          callSite: input.callSite,
          message: response.error.message,
          code: response.error.code,
        });
      }
      return null;
    }

    const row = Array.isArray(response.data)
      ? ((response.data[0] as SharedRateLimitRpcRow | undefined) ?? null)
      : (response.data as SharedRateLimitRpcRow | null);

    if (!row) return null;
    const retryAfterSeconds = Math.max(0, Number(row.retry_after_seconds ?? 0) || 0);

    return {
      allowed: Boolean(row.allowed),
      retryAfterSeconds,
    };
  } catch (error) {
    if (process.env.NODE_ENV === "development") {
      console.warn("[tmdb] shared rate limit check failed; falling back to memory limiter", {
        callSite: input.callSite,
        error: String(error),
      });
    }
    return null;
  }
}

function checkLocalTmdbRateLimit(input: {
  bucketKey: string;
  maxRequests: number;
}): {
  allowed: boolean;
  retryAfterSeconds: number;
} {
  const nowMs = Date.now();
  cleanupTmdbProxyBuckets(nowMs);
  const existing = tmdbProxyBuckets.get(input.bucketKey);
  const bucket =
    !existing || existing.resetAtMs <= nowMs
      ? {
          count: 0,
          resetAtMs: nowMs + TMDB_PROXY_WINDOW_MS,
          lastSeenAtMs: nowMs,
        }
      : existing;

  bucket.count += 1;
  bucket.lastSeenAtMs = nowMs;
  tmdbProxyBuckets.set(input.bucketKey, bucket);

  if (bucket.count <= input.maxRequests) {
    return {
      allowed: true,
      retryAfterSeconds: 0,
    };
  }

  return {
    allowed: false,
    retryAfterSeconds: Math.max(1, Math.ceil((bucket.resetAtMs - nowMs) / 1000)),
  };
}

export async function guardTmdbProxyRequest(
  request: NextRequest,
  callSite: string
): Promise<NextResponse | null> {
  const userAgent = request.headers.get("user-agent")?.trim() ?? "";
  const likelyAutomated = isLikelyAutomatedUserAgent(userAgent);
  const maxRequests = likelyAutomated
    ? TMDB_PROXY_SUSPECTED_BOT_MAX_REQUESTS_PER_WINDOW
    : TMDB_PROXY_MAX_REQUESTS_PER_WINDOW;

  const clientAddress = tmdbProxyClientAddress(request);
  const uaFingerprint = userAgent.slice(0, 120).toLowerCase() || "no-ua";
  const bucketKey = `${clientAddress}|${uaFingerprint}`;
  const sharedDecision = await checkSharedTmdbRateLimit({
    bucketKey,
    maxRequests,
    callSite,
  });
  const decision = sharedDecision ?? checkLocalTmdbRateLimit({ bucketKey, maxRequests });

  if (decision.allowed) return null;

  const retryAfterSeconds = Math.max(1, decision.retryAfterSeconds);
  if (process.env.NODE_ENV === "development") {
    console.warn("[tmdb] rate limit triggered", {
      callSite,
      clientAddress,
      likelyAutomated,
      maxRequests,
      retryAfterSeconds,
      source: sharedDecision ? "supabase" : "memory",
    });
  }

  return errorJson(
    429,
    "rate_limited",
    "Too many TMDB requests. Please wait and try again.",
    `Retry after ${retryAfterSeconds} seconds.`,
    {
      "Retry-After": String(retryAfterSeconds),
    }
  );
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
