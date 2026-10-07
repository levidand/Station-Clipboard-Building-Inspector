// Thin fetch wrapper. Every call goes to /api on this origin; the server (or
// the Vite dev proxy) forwards it to the Department Portal API with the session
// cookie attached. Same shape as the Command Portal's src/lib/api.ts.

export class ApiError extends Error {
  status: number;
  body: Record<string, unknown>;
  constructor(status: number, message: string, body: Record<string, unknown>) {
    super(message);
    this.status = status;
    this.body = body;
  }
}

export interface RequestOptions {
  signal?: AbortSignal;
  /** Give up after this long and treat it as a dropped connection. 0 waits as long as the browser does. */
  timeoutMs?: number;
  /** Extra headers, e.g. a file name on an upload. */
  headers?: Record<string, string>;
  /** Send this as the raw body (a photo) instead of JSON. */
  raw?: Blob;
  /**
   * Let the request finish after the page has gone (a save made as someone
   * leaves the page or closes the tab). The browser caps such a body at 64 KB.
   */
  keepalive?: boolean;
}

/** On a weak signal a request can hang for minutes without failing; past these it is treated as dropped. */
export const READ_TIMEOUT_MS = 20_000;
export const WRITE_TIMEOUT_MS = 30_000;

export const OFFLINE_MESSAGE = "Can't reach the server. Check the connection and try again.";
const SLOW_MESSAGE = "The connection is too slow: the server didn't answer in time. Try again.";

export async function api<T = unknown>(method: string, url: string, body?: unknown, opts: RequestOptions = {}): Promise<T> {
  const headers: Record<string, string> = { ...(opts.headers ?? {}) };
  let payload: BodyInit | undefined;
  if (opts.raw) {
    payload = opts.raw;
    headers["content-type"] = opts.raw.type || "application/octet-stream";
  } else if (body !== undefined) {
    payload = JSON.stringify(body);
    headers["content-type"] = "application/json";
  }

  const timeoutMs = opts.timeoutMs ?? (method === "GET" ? READ_TIMEOUT_MS : WRITE_TIMEOUT_MS);
  const ctrl = new AbortController();
  let timedOut = false;
  const timer = timeoutMs > 0 ? setTimeout(() => { timedOut = true; ctrl.abort(); }, timeoutMs) : undefined;
  const cancel = () => ctrl.abort();
  if (opts.signal?.aborted) ctrl.abort();
  else opts.signal?.addEventListener("abort", cancel, { once: true });

  let res: Response;
  let text: string;
  try {
    res = await fetch(url, { method, headers, body: payload, credentials: "include", signal: ctrl.signal, keepalive: opts.keepalive });
    text = await res.text();
  } catch (err) {
    if (timedOut) throw new ApiError(0, SLOW_MESSAGE, { offline: true, timeout: true });
    if ((err as Error).name === "AbortError") throw err;
    throw new ApiError(0, OFFLINE_MESSAGE, { offline: true });
  } finally {
    clearTimeout(timer);
    opts.signal?.removeEventListener("abort", cancel);
  }

  let data: unknown = null;
  let json = false;
  if (text) {
    try { data = JSON.parse(text); json = true; } catch { data = { error: text.slice(0, 200) }; }
  }
  if (!res.ok) {
    const obj = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
    const gateway = res.status === 502 || res.status === 504 || (res.status === 503 && !json);
    const message = gateway && !json ? "The server can't be reached right now. Try again in a moment."
      : typeof obj.error === "string" ? obj.error : `Request failed (${res.status})`;
    throw new ApiError(res.status, message, obj);
  }
  return data as T;
}

export const get = <T>(url: string, signal?: AbortSignal) => api<T>("GET", url, undefined, { signal });

/** A dropped connection, a timeout, or a gateway that couldn't reach the Department Portal. Worth trying again. */
export function isTransient(err: unknown): boolean {
  return err instanceof ApiError && [0, 408, 429, 502, 503, 504].includes(err.status) && err.body.code !== "INSPECTIONS_NOT_READY";
}

/**
 * Uploaded files (avatars, logos) come back as storage paths like
 * "/objects/uploads/<id>"; the Department Portal serves them under /api/storage.
 */
export function storageUrl(path: string | null | undefined): string | null {
  const value = path?.trim();
  if (!value) return null;
  if (/^(https?:|data:|blob:)/i.test(value) || value.startsWith("/api/storage")) return value;
  return `/api/storage${value.startsWith("/") ? "" : "/"}${value}`;
}

export function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : "Something went wrong.";
}
