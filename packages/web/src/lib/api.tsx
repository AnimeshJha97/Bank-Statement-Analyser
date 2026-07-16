"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";

type UserContextValue = { userId: string; email: string; logout: () => Promise<void> };
const UserContext = createContext<UserContextValue | null>(null);

export function useUser(): UserContextValue {
  const value = useContext(UserContext);
  if (!value) throw new Error("useUser must be used inside <UserProvider>");
  return value;
}

export function UserProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<UserContextValue | null>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const attach = useCallback((me: { userId: string; email: string }) => setUser({ ...me, logout: async () => { await fetch("/api/auth/logout", { method: "POST" }); setUser(null); } }), []);
  useEffect(() => {
    let cancelled = false;
    fetch("/api/me").then(async (response) => {
      if (response.status === 401) return;
      if (!response.ok) throw new Error(`API unreachable (${response.status})`);
      if (!cancelled) attach(await response.json() as { userId: string; email: string });
    }).catch((cause) => { if (!cancelled) setError(cause instanceof Error ? cause.message : "Failed to reach the API"); })
      .finally(() => { if (!cancelled) setReady(true); });
    return () => { cancelled = true; };
  }, [attach]);
  if (error) return <div className="flex min-h-screen items-center justify-center bg-bg p-8 text-center text-ink2">{error}</div>;
  if (!ready) return <div className="flex min-h-screen items-center justify-center bg-bg text-[13px] text-ink3">Loading…</div>;
  if (!user) return <AuthScreen onAuthenticated={attach} />;
  return <UserContext.Provider value={user}>{children}</UserContext.Provider>;
}

export class ApiError extends Error { constructor(message: string, readonly status: number) { super(message); } }
async function parseError(response: Response): Promise<never> {
  let message = `Request failed (${response.status})`;
  try { const body = await response.json() as { error?: string }; if (body.error) message = body.error; } catch {}
  throw new ApiError(message, response.status);
}

function AuthScreen({ onAuthenticated }: { onAuthenticated: (user: { userId: string; email: string }) => void }) {
  const [signup, setSignup] = useState(true), [email, setEmail] = useState(""), [password, setPassword] = useState("");
  const [message, setMessage] = useState<string | null>(null), [busy, setBusy] = useState(false);
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setMessage(null);
    try {
      const response = await fetch(`/api/auth/${signup ? "signup" : "login"}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, password }) });
      if (!response.ok) await parseError(response);
      onAuthenticated(await response.json() as { userId: string; email: string });
    } catch (cause) { setMessage(cause instanceof Error ? cause.message : "Authentication failed"); } finally { setBusy(false); }
  };
  return <div className="flex min-h-screen items-center justify-center bg-bg p-6"><form onSubmit={submit} className="w-full max-w-sm rounded-card bg-card p-8 shadow-card">
    <div className="mb-6"><div className="text-xl font-semibold text-ink">{signup ? "Create your private workspace" : "Welcome back"}</div><p className="mt-2 text-[13px] text-ink2">Your statements stay on this server.</p></div>
    <label className="mb-4 block text-[12px] font-medium text-ink2">Email<input required type="email" value={email} onChange={(e) => setEmail(e.target.value)} className="mt-1.5 w-full rounded-lg border border-line bg-bg px-3 py-2.5 text-[14px] text-ink outline-none focus:border-accent" /></label>
    <label className="mb-4 block text-[12px] font-medium text-ink2">Password<input required minLength={12} type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="mt-1.5 w-full rounded-lg border border-line bg-bg px-3 py-2.5 text-[14px] text-ink outline-none focus:border-accent" /><span className="mt-1 block text-[11px] text-ink3">At least 12 characters</span></label>
    {message && <p className="mb-4 rounded-lg bg-warn-bg p-3 text-[12px] text-warn">{message}</p>}
    <button disabled={busy} className="w-full rounded-lg bg-accent px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50">{busy ? "Please wait…" : signup ? "Create account" : "Sign in"}</button>
    <button type="button" onClick={() => { setSignup(!signup); setMessage(null); }} className="mt-4 w-full text-[12px] text-accent-t">{signup ? "Already have an account? Sign in" : "Need an account? Sign up"}</button>
  </form></div>;
}

export function useApiClient() {
  useUser();
  return useMemo(() => ({
    async get<T>(path: string): Promise<T> { const response = await fetch(path); if (!response.ok) await parseError(response); return response.json() as Promise<T>; },
    async send<T>(method: string, path: string, body?: unknown): Promise<T> {
      const response = await fetch(path, { method, headers: body === undefined ? {} : { "content-type": "application/json" }, body: body === undefined ? undefined : JSON.stringify(body) });
      if (!response.ok) await parseError(response); if (response.status === 204) return undefined as T; return response.json() as Promise<T>;
    },
  }), []);
}

export type Loadable<T> = { data: T | null; error: string | null; loading: boolean; reload: () => void };
export function useApi<T>(path: string | null): Loadable<T> {
  const client = useApiClient();
  const [state, setState] = useState<{ data: T | null; error: string | null; loading: boolean }>({ data: null, error: null, loading: path !== null });
  const [nonce, setNonce] = useState(0); const latest = useRef(0);
  useEffect(() => {
    if (path === null) { setState({ data: null, error: null, loading: false }); return; }
    const ticket = ++latest.current; setState((previous) => ({ ...previous, loading: true, error: null }));
    client.get<T>(path).then((data) => { if (latest.current === ticket) setState({ data, error: null, loading: false }); })
      .catch((cause: unknown) => { if (latest.current === ticket) setState({ data: null, error: cause instanceof Error ? cause.message : "Request failed", loading: false }); });
  }, [client, path, nonce]);
  const reload = useCallback(() => setNonce((value) => value + 1), []);
  return { ...state, reload };
}
