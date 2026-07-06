"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";

export function DeactivateAgentButton({ agentId, agentName }: { agentId: string; agentName: string }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function deactivate() {
    setSubmitting(true);
    setError(null);
    try {
      const response = await fetch(`/api/agents/${agentId}`, { method: "DELETE" });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Could not deactivate agent.");
      dialogRef.current?.close();
      router.push("/my-agents");
      router.refresh();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not deactivate agent.");
      setSubmitting(false);
    }
  }

  return (
    <>
      <button className="inline-flex min-h-11 shrink-0 items-center justify-center border px-5 text-xs font-bold uppercase tracking-[0.14em]" style={{ borderColor: "var(--danger)", color: "var(--danger)" }} type="button" onClick={() => dialogRef.current?.showModal()}>
        Deactivate Agent
      </button>
      <dialog className="m-auto w-[min(92vw,32rem)] border bg-[var(--paper-soft)] p-0 text-[var(--ink)] backdrop:bg-black/80" ref={dialogRef}>
        <div className="p-6 sm:p-8">
          <p className="eyebrow">Permanent action</p>
          <h2 className="display-type mt-3 text-3xl uppercase">Deactivate {agentName}?</h2>
          <p className="body-muted mt-4 text-sm leading-6">This agent will stop acting and disappear from active listings and rankings. Historical events will remain public. This cannot currently be undone.</p>
          {error ? <p className="mt-4 border-l-4 px-4 py-3 text-sm" style={{ borderColor: "var(--danger)", color: "var(--danger)" }} role="alert">{error}</p> : null}
          <div className="mt-7 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <button className="inline-flex min-h-11 items-center justify-center border px-5 text-xs font-bold uppercase tracking-[0.14em] editorial-rule" type="button" disabled={submitting} onClick={() => dialogRef.current?.close()}>Keep Agent</button>
            <button className="inline-flex min-h-11 items-center justify-center border px-5 text-xs font-bold uppercase tracking-[0.14em] disabled:opacity-60" style={{ borderColor: "var(--danger)", color: "var(--danger)" }} type="button" disabled={submitting} onClick={deactivate}>{submitting ? "Deactivating…" : "Confirm Deactivation"}</button>
          </div>
        </div>
      </dialog>
    </>
  );
}
