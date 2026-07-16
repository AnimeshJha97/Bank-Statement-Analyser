"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { useApi, useApiClient } from "@/lib/api";
import type { AccountView, UploadResult } from "@/lib/types";

type Phase =
  | { kind: "idle" }
  | { kind: "uploading"; filename: string; sizeLabel: string; uploadPct: number; parsing: boolean }
  | { kind: "done"; filename: string; result: UploadResult }
  | { kind: "failed"; filename: string; message: string };

export default function UploadPage() {
  const client = useApiClient();
  const accounts = useApi<{ accounts: AccountView[] }>("/api/accounts");
  const [accountId, setAccountId] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const [dragOver, setDragOver] = useState(false);
  const [creating, setCreating] = useState(false);
  const [newAccount, setNewAccount] = useState({ name: "", institutionName: "", accountType: "checking" as AccountView["accountType"] });
  const [accountError, setAccountError] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const accountList = accounts.data?.accounts ?? [];
  const selectedAccount = accountId || accountList[0]?.id || "";

  const createAccount = async () => {
    setAccountError(null);
    try {
      const created = await client.send<AccountView>("POST", "/api/accounts", newAccount);
      accounts.reload();
      setAccountId(created.id);
      setCreating(false);
      setNewAccount({ name: "", institutionName: "", accountType: "checking" });
    } catch (cause) {
      setAccountError(cause instanceof Error ? cause.message : "Could not create the account");
    }
  };

  const upload = (file: File) => {
    if (!selectedAccount) { setAccountError("Add an account first — statements are imported into an account."); return; }
    const sizeLabel = file.size > 1024 * 1024 ? `${(file.size / (1024 * 1024)).toFixed(1)} MB` : `${Math.ceil(file.size / 1024)} KB`;
    setPhase({ kind: "uploading", filename: file.name, sizeLabel, uploadPct: 0, parsing: false });

    const form = new FormData();
    form.append("accountId", selectedAccount);
    form.append("file", file);

    // XHR for genuine upload progress; parsing runs server-side after the body lands.
    const xhr = new XMLHttpRequest();
    xhr.open("POST", "/api/statements");
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      const pct = Math.round((event.loaded / event.total) * 100);
      setPhase((current) => current.kind === "uploading" ? { ...current, uploadPct: pct, parsing: pct >= 100 } : current);
    };
    xhr.onerror = () => setPhase({ kind: "failed", filename: file.name, message: "Network error — is the API running?" });
    xhr.onload = () => {
      let body: UploadResult | null = null;
      try { body = JSON.parse(xhr.responseText) as UploadResult; } catch { /* non-JSON */ }
      if (xhr.status === 202 && body?.parseStatus === "completed") {
        setPhase({ kind: "done", filename: file.name, result: body });
      } else {
        setPhase({ kind: "failed", filename: file.name, message: body?.error ?? `Upload failed (${xhr.status})` });
      }
    };
    xhr.send(form);
  };

  const onDrop = (event: React.DragEvent) => {
    event.preventDefault();
    setDragOver(false);
    const file = event.dataTransfer.files[0];
    if (file) upload(file);
  };

  return (
    <section className="mx-auto max-w-[720px] animate-fadeUp px-11 pb-16 pt-9">
      <header className="mb-5">
        <h1 className="m-0 mb-1 text-[22px] font-[650] tracking-[-0.01em]">Upload a statement</h1>
        <p className="m-0 text-[13.5px] text-ink2">Bank or credit-card statements — PDF or CSV, up to 20 MB.</p>
      </header>

      <div className="mb-4 flex flex-wrap items-center gap-2.5">
        <label className="text-[12.5px] font-semibold text-ink2" htmlFor="upload-account">Import into</label>
        {accountList.length > 0 && (
          <select id="upload-account" className="select-pill" value={selectedAccount} onChange={(event) => setAccountId(event.target.value)}>
            {accountList.map((account) => (
              <option key={account.id} value={account.id}>{account.name} · {account.institutionName}</option>
            ))}
          </select>
        )}
        {!creating && (
          <button onClick={() => setCreating(true)} className="text-[12.5px] font-semibold text-accent-t hover:underline">+ New account</button>
        )}
      </div>

      {creating && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-[14px] bg-card p-4 shadow-card">
          <input
            value={newAccount.name}
            onChange={(event) => setNewAccount({ ...newAccount, name: event.target.value })}
            placeholder="Account name (e.g. Chase Checking)"
            className="w-56 rounded-lg border border-line bg-card px-3 py-2 text-[13px] outline-none focus:border-accent-t"
          />
          <input
            value={newAccount.institutionName}
            onChange={(event) => setNewAccount({ ...newAccount, institutionName: event.target.value })}
            placeholder="Bank (e.g. Chase)"
            className="w-40 rounded-lg border border-line bg-card px-3 py-2 text-[13px] outline-none focus:border-accent-t"
          />
          <select
            className="select-pill"
            value={newAccount.accountType}
            onChange={(event) => setNewAccount({ ...newAccount, accountType: event.target.value as AccountView["accountType"] })}
            aria-label="Account type"
          >
            {["checking", "savings", "credit", "cash", "other"].map((type) => <option key={type} value={type}>{type}</option>)}
          </select>
          <button onClick={() => void createAccount()} className="rounded-[10px] bg-accent px-4 py-2 text-[12.5px] font-semibold text-white hover:opacity-95">Create</button>
          <button onClick={() => setCreating(false)} className="text-[12.5px] text-ink3 hover:text-ink2">Cancel</button>
        </div>
      )}
      {accountError && <p className="mb-3 text-[12.5px] font-semibold text-warn">{accountError}</p>}

      {phase.kind === "idle" && (
        <button
          onClick={() => fileInput.current?.click()}
          onDragOver={(event) => { event.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          className="flex w-full flex-col items-center gap-3 rounded-[18px] border-[1.5px] border-dashed px-6 py-14 transition-colors"
          style={{
            borderColor: dragOver ? "var(--accent-t)" : "color-mix(in oklab, var(--accent), transparent 55%)",
            background: dragOver ? "color-mix(in oklab, var(--accent), var(--card) 93%)" : "color-mix(in oklab, var(--accent), var(--card) 96%)",
          }}
        >
          <span className="flex h-11 w-11 items-center justify-center rounded-[14px] bg-accent">
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="#fff" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              <path d="M10 13.5V3.5" /><path d="M6 7l4-4 4 4" /><path d="M3.5 16.5h13" />
            </svg>
          </span>
          <span className="text-[15px] font-[650] text-ink">Drop your statement here</span>
          <span className="text-[13px] text-ink2">or <span className="font-semibold text-accent-t">browse files</span> · PDF and CSV supported</span>
          <input
            ref={fileInput}
            type="file"
            accept=".csv,.pdf,text/csv,application/pdf"
            className="hidden"
            onChange={(event) => { const file = event.target.files?.[0]; if (file) upload(file); event.target.value = ""; }}
          />
        </button>
      )}

      {phase.kind === "uploading" && (
        <div className="rounded-[18px] bg-card p-7 shadow-card">
          <div className="mb-[22px] flex items-center gap-3">
            <span className="flex h-9 w-9 flex-none items-center justify-center rounded-[10px] bg-card2 text-[10px] font-bold text-ink2">
              {phase.filename.toLowerCase().endsWith(".pdf") ? "PDF" : "CSV"}
            </span>
            <div className="min-w-0 flex-1">
              <div className="truncate text-[13.5px] font-semibold">{phase.filename}</div>
              <div className="text-xs text-ink3">{phase.sizeLabel}</div>
            </div>
          </div>
          <div className="mb-[22px] flex flex-col gap-3.5">
            <Stage done={phase.uploadPct >= 100} active={phase.uploadPct < 100} label="Uploading file" note={phase.uploadPct < 100 ? `${phase.uploadPct}%` : ""} />
            <Stage done={false} active={phase.parsing} label="Parsing & categorizing" note={phase.parsing ? "extracting transactions" : ""} />
          </div>
          <div className="h-1.5 overflow-hidden rounded-full bg-card2">
            <div className="h-full rounded-full bg-accent transition-[width] duration-300" style={{ width: `${phase.parsing ? 80 : Math.min(phase.uploadPct * 0.6, 60)}%` }} />
          </div>
          <p className="mb-0 mt-[18px] flex items-center gap-[7px] text-xs text-ink2">
            <LockIcon /> Parsed on this device. The original file is deleted the moment import finishes.
          </p>
        </div>
      )}

      {phase.kind === "done" && (
        <div className="animate-fadeUp rounded-[18px] bg-card p-7 shadow-card">
          <div className="mb-[18px] flex items-center gap-3">
            <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full text-[15px] font-bold text-good" style={{ background: "color-mix(in oklab, var(--good), transparent 85%)" }}>✓</span>
            <div>
              <div className="text-base font-[650]">Import complete</div>
              <div className="text-[12.5px] text-ink2">{phase.filename} · file deleted after parsing</div>
            </div>
          </div>
          <div className="mb-5 grid grid-cols-1 gap-3 sm:grid-cols-2">
            <div className="rounded-xl bg-card2 p-4 px-[18px]">
              <div className="text-2xl font-[650] tabular-nums">{phase.result.transactionCount ?? 0}</div>
              <div className="text-[12.5px] text-ink2">transactions imported{(phase.result.categorizedCount ?? 0) > 0 ? ` · ${phase.result.categorizedCount} auto-categorized` : ""}</div>
            </div>
            <div className="rounded-xl p-4 px-[18px]" style={{ background: (phase.result.reviewRowIndices?.length ?? 0) > 0 ? "var(--warn-bg)" : "var(--card2)" }}>
              <div className="text-2xl font-[650] tabular-nums" style={{ color: (phase.result.reviewRowIndices?.length ?? 0) > 0 ? "var(--warn)" : undefined }}>
                {phase.result.reviewRowIndices?.length ?? 0}
              </div>
              <div className="text-[12.5px] text-ink2">flagged for review</div>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2.5">
            {(phase.result.needsReview || (phase.result.transactionCount ?? 0) > (phase.result.categorizedCount ?? 0)) && (
              <Link href="/review" className="rounded-[10px] bg-accent px-[18px] py-[9px] text-[13px] font-semibold text-white hover:opacity-95">
                Open the review queue →
              </Link>
            )}
            <Link href="/transactions" className="rounded-[10px] border border-line bg-card px-[18px] py-[9px] text-[13px] font-semibold text-ink hover:border-ink3">
              View transactions
            </Link>
            <div className="flex-1" />
            <button onClick={() => setPhase({ kind: "idle" })} className="text-[12.5px] text-ink3 hover:text-ink2">Upload another</button>
          </div>
        </div>
      )}

      {phase.kind === "failed" && (
        <div className="animate-fadeUp rounded-[18px] bg-card p-7 shadow-card">
          <div className="mb-3.5 flex items-center gap-3">
            <span className="flex h-9 w-9 flex-none items-center justify-center rounded-full bg-warn-bg text-[15px] font-bold text-warn">!</span>
            <div>
              <div className="text-base font-[650]">We couldn&apos;t read this file</div>
              <div className="text-[12.5px] text-ink2">{phase.filename}: {phase.message}</div>
            </div>
          </div>
          <ul className="mb-5 list-disc pl-[18px] text-[13px] leading-[1.7] text-ink2">
            <li>Try the CSV export from your bank instead — it&apos;s the most reliable format.</li>
            <li>Or re-download the PDF directly from your bank (not a scan or photo).</li>
          </ul>
          <button onClick={() => setPhase({ kind: "idle" })} className="rounded-[10px] bg-accent px-[18px] py-[9px] text-[13px] font-semibold text-white hover:opacity-95">
            Try another file
          </button>
          <p className="mb-0 mt-4 text-xs text-ink3">Nothing was imported. The file has already been deleted.</p>
        </div>
      )}
    </section>
  );
}

function Stage({ done, active, label, note }: { done: boolean; active: boolean; label: string; note: string }) {
  return (
    <div className="flex items-center gap-[11px]">
      <span
        className={`flex h-5 w-5 flex-none items-center justify-center rounded-full text-[10px] font-bold ${active ? "animate-pulseSoft" : ""}`}
        style={{
          background: done ? "color-mix(in oklab, var(--good), transparent 85%)" : active ? "var(--accent)" : "var(--card2)",
          color: done ? "var(--good)" : active ? "#fff" : "var(--ink3)",
        }}
      >
        {done ? "✓" : active ? "" : "·"}
      </span>
      <span className="text-[13.5px]" style={{ fontWeight: active ? 650 : 500, color: done || active ? "var(--ink)" : "var(--ink3)" }}>{label}</span>
      <span className="text-xs text-ink3">{note}</span>
    </div>
  );
}

function LockIcon() {
  return (
    <svg width="12" height="13" viewBox="0 0 12 13" fill="none" stroke="currentColor" strokeWidth="1.4">
      <rect x="1.5" y="5.5" width="9" height="6" rx="1.5" />
      <path d="M3.5 5.5V4a2.5 2.5 0 0 1 5 0v1.5" />
    </svg>
  );
}
