import { QueryClient, QueryFunction } from "@tanstack/react-query";

const READ_TIMEOUT_MS = 15_000;
const MAX_RETRY_AFTER_MS = 30_000;

async function fetchRead<T>(
  url: string,
  options: RequestInit,
  consume: (response: Response) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  const signal = options.signal;
  const cancel = () => controller.abort();
  if (signal?.aborted) cancel();
  else signal?.addEventListener("abort", cancel, { once: true });
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, READ_TIMEOUT_MS);
  try {
    return await consume(await fetch(url, { ...options, signal: controller.signal }));
  } catch (error) {
    if (timedOut) {
      const timeout = new Error("Read request timed out");
      timeout.name = "TimeoutError";
      throw timeout;
    }
    throw error;
  } finally {
    clearTimeout(timer);
    signal?.removeEventListener("abort", cancel);
  }
}

export function isTransientReadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  const status = (error as Error & { status?: number }).status;
  return status === 408 || status === 429 || (status !== undefined && status >= 500) ||
    (status === undefined && (error instanceof TypeError || error.name === "TimeoutError"));
}

function retryAfterMs(response: Response): number | undefined {
  const value = response.headers.get("retry-after");
  if (!value) return undefined;
  const seconds = Number(value);
  const delay = Number.isFinite(seconds) ? seconds * 1_000 : Date.parse(value) - Date.now();
  return Number.isFinite(delay) ? Math.max(0, delay) : undefined;
}

async function throwIfResNotOk(res: Response) {
  if (!res.ok) {
    const text = (await res.text()) || res.statusText;
    const error = new Error(`${res.status}: ${text}`) as any;
    error.retryAfterMs = retryAfterMs(res);
    error.status = res.status;
    error.response = text;
    throw error;
  }
}

type PublicFetchOptions = {
  debugCache?: boolean;
  signal?: AbortSignal;
};

export async function publicFetchJson(url: string, options: PublicFetchOptions = {}) {
  return fetchRead(url, { credentials: "omit", signal: options.signal }, async (res) => {
    if (options.debugCache && import.meta.env.DEV) {
      const headers = {
        cacheControl: res.headers.get("cache-control"),
        etag: res.headers.get("etag"),
        age: res.headers.get("age"),
        vercelCache: res.headers.get("x-vercel-cache"),
      };
      console.info(`[cache] ${url}`, headers);
    }
    await throwIfResNotOk(res);
    return await res.json();
  });
}

export async function apiRequest(
  url: string,
  method: string = "GET",
  data?: unknown | undefined,
): Promise<any> {
  const options: RequestInit = {
    method,
    headers: data ? { "Content-Type": "application/json" } : {},
    body: data ? JSON.stringify(data) : undefined,
    credentials: "include",
  };
  const consume = async (res: Response) => {
    await throwIfResNotOk(res);
    return await res.json();
  };
  return method.toUpperCase() === "GET"
    ? fetchRead(url, options, consume)
    : consume(await fetch(url, options));
}

type UnauthorizedBehavior = "returnNull" | "throw";
export const getQueryFn: <T>(options: {
  on401: UnauthorizedBehavior;
}) => QueryFunction<T> =
  ({ on401: unauthorizedBehavior }) =>
  async ({ queryKey, signal }) => fetchRead(queryKey.join("/") as string, {
    credentials: "include",
    signal,
  }, async (res) => {
    if (unauthorizedBehavior === "returnNull" && res.status === 401) {
      return null;
    }
    await throwIfResNotOk(res);
    return await res.json();
  });

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      queryFn: getQueryFn({ on401: "throw" }),
      refetchInterval: false,
      refetchOnWindowFocus: true,
      staleTime: 30_000,
      gcTime: Infinity,
      retry: (failureCount, error) =>
        failureCount < 4 && isTransientReadError(error) &&
        ((error as Error & { retryAfterMs?: number }).retryAfterMs ?? 0) <= MAX_RETRY_AFTER_MS,
      retryDelay: (attempt, error) => {
        const retryAfter = (error as Error & { retryAfterMs?: number }).retryAfterMs ?? 0;
        const backoff = Math.min(8_000, 1_000 * 2 ** attempt);
        return Math.max(retryAfter, backoff * (0.75 + Math.random() * 0.5));
      },
      refetchOnReconnect: true,
    },
    mutations: {
      retry: false,
    },
  },
});
