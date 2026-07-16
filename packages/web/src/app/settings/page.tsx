"use client";

import { useState, type FormEvent } from "react";
import { useApi, useApiClient, useUser } from "@/lib/api";

type KeyStatus = { configured: boolean; createdAt: string | null; updatedAt: string | null };

export default function SettingsPage() {
  const { email, logout } = useUser();
  const client = useApiClient();
  const status = useApi<KeyStatus>("/api/settings/openai");
  const [apiKey, setApiKey] = useState(""), [message, setMessage] = useState<string | null>(null), [busy, setBusy] = useState(false);
  const save = async (event: FormEvent) => {
    event.preventDefault(); setBusy(true); setMessage(null);
    try { await client.send("PUT", "/api/settings/openai", { apiKey }); setApiKey(""); setMessage(status.data?.configured ? "OpenAI key rotated." : "OpenAI key saved."); status.reload(); }
    catch (cause) { setMessage(cause instanceof Error ? cause.message : "Could not save key"); } finally { setBusy(false); }
  };
  return <div className="mx-auto max-w-3xl px-8 py-10"><h1 className="text-2xl font-semibold text-ink">Settings</h1><p className="mt-1 text-[13px] text-ink2">Account and private AI provider credentials.</p>
    <section className="mt-8 rounded-card bg-card p-6 shadow-card"><h2 className="text-[15px] font-semibold text-ink">OpenAI API key</h2><p className="mt-2 text-[13px] leading-relaxed text-ink2">Encrypted on this server with AES-256-GCM. The key is never returned to the browser or written to logs.</p>
      <div className="mt-4 rounded-lg bg-card2 p-3 text-[12px] text-ink2">Status: <strong className="text-ink">{status.data?.configured ? "Configured" : "Not configured"}</strong>{status.data?.updatedAt && ` · Updated ${new Date(status.data.updatedAt).toLocaleString()}`}</div>
      <form onSubmit={save} className="mt-4 flex gap-3"><input required type="password" autoComplete="off" value={apiKey} onChange={(e) => setApiKey(e.target.value)} placeholder={status.data?.configured ? "Paste a new key to rotate" : "sk-…"} className="min-w-0 flex-1 rounded-lg border border-line bg-bg px-3 py-2.5 font-mono text-[13px] text-ink outline-none focus:border-accent" /><button disabled={busy} className="rounded-lg bg-accent px-4 py-2.5 text-[13px] font-semibold text-white disabled:opacity-50">{status.data?.configured ? "Rotate key" : "Save key"}</button></form>
      {message && <p className="mt-3 text-[12px] text-ink2">{message}</p>}
    </section>
    <section className="mt-6 rounded-card bg-card p-6 shadow-card"><h2 className="text-[15px] font-semibold text-ink">Account</h2><p className="mt-2 text-[13px] text-ink2">Signed in as {email}</p><button onClick={() => void logout()} className="mt-4 rounded-lg border border-line px-4 py-2 text-[12px] font-medium text-ink2 hover:text-ink">Sign out</button></section>
  </div>;
}
