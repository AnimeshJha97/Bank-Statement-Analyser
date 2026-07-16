"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

const STORAGE_KEY = "statement.userId";

type UserContextValue = { userId: string; email: string };
const UserContext = createContext<UserContextValue | null>(null);

export function useUser(): UserContextValue {
  const value = useContext(UserContext);
  if (!value) throw new Error("useUser must be used inside <UserProvider>");
  return value;
}

/** Bootstraps the self-hosted user via GET /api/me and pins it for all API calls. */
export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserContextValue | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const stored = window.localStorage.getItem(STORAGE_KEY);
        const response = await fetch("/api/me", { headers: stored ? { "x-user-id": stored } : {} });
        if (!response.ok) throw new Error(`API unreachable (${response.status})`);
        const me = (await response.json()) as UserContextValue;
        window.localStorage.setItem(STORAGE_KEY, me.userId);
        if (!cancelled) setUser(me);
      } catch (cause) {
        if (!cancelled) setError(cause instanceof Error ? cause.message : "Failed to reach the API");
      }
    })();
    return () => { cancelled = true; };
  }, []);

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg p-8 text-center">
        <div className="max-w-sm rounded-card bg-card p-8 shadow-card">
          <div className="mb-2 text-[15px] font-semibold text-ink">Can&apos;t reach the Statement API</div>
          <p className="text-[13px] leading-relaxed text-ink2">
            {error}. Start it with <code className="rounded bg-card2 px-1.5 py-0.5 font-mono text-[12px]">npm run dev --workspace=@statement/api</code> and reload.
          </p>
        </div>
      </div>
    );
  }
  if (!user) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg">
        <span className="animate-pulseSoft text-[13px] text-ink3">Loading…</span>
      </div>
    );
  }
  return <UserContext.Provider value={user}>{children}</UserContext.Provider>;
}

export class ApiError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
  }
}

async function parseError(response: Response): Promise<never> {
  let message = `Request failed (${response.status})`;
  try {
    const body = (await response.json()) as { error?: string };
    if (body.error) message = body.error;
  } catch { /* non-JSON error body */ }
  throw new ApiError(message, response.status);
}

export function useApiClient() {
  const { userId } = useUser();
  return useMemo(() => {
    const headers = { "x-user-id": userId };
    return {
      async get<T>(path: string): Promise<T> {
        const response = await fetch(path, { headers });
        if (!response.ok) await parseError(response);
        return response.json() as Promise<T>;
      },
      async send<T>(method: string, path: string, body?: unknown): Promise<T> {
        const response = await fetch(path, {
          method,
          headers: { ...headers, ...(body === undefined ? {} : { "content-type": "application/json" }) },
          body: body === undefined ? undefined : JSON.stringify(body),
        });
        if (!response.ok) await parseError(response);
        if (response.status === 204) return undefined as T;
        return response.json() as Promise<T>;
      },
    };
  }, [userId]);
}

export type Loadable<T> = { data: T | null; error: string | null; loading: boolean; reload: () => void };

/** Client-side fetch hook keyed on the request path. */
export function useApi<T>(path: string | null): Loadable<T> {
  const client = useApiClient();
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: path !== null });
  const [nonce, setNonce] = useState(0);
  const latest = useRef(0);

  useEffect(() => {
    if (path === null) { setState({ data: null, error: null, loading: false }); return; }
    const ticket = ++latest.current;
    setState((previous) => ({ ...previous, loading: true, error: null }));
    client.get<T>(path)
      .then((data) => { if (latest.current === ticket) setState({ data, error: null, loading: false }); })
      .catch((cause: unknown) => {
        if (latest.current === ticket) setState({ data: null, error: cause instanceof Error ? cause.message : "Request failed", loading: false });
      });
  }, [client, path, nonce]);

  const reload = useCallback(() => setNonce((value) => value + 1), []);
  return { ...state, reload };
}
