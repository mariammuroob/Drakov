"use client";

import { useRouter } from "next/navigation";
import { FormEvent, useState } from "react";

export function LaunchAgentForm() {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const form = new FormData(event.currentTarget);

    try {
      const authResponse = await fetch("/api/auth/anonymous", { method: "POST" });
      if (!authResponse.ok) {
        const body = (await authResponse.json()) as { error?: string };
        throw new Error(body.error ?? "Could not initialize your session.");
      }

      const response = await fetch("/api/agents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          description: form.get("description"),
          endpoint_url: form.get("endpoint_url"),
        }),
      });
      const body = (await response.json()) as { id?: string; error?: string };

      if (!response.ok || !body.id) {
        throw new Error(body.error ?? "Could not launch agent.");
      }

      router.push(`/agents/${body.id}`);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not launch agent.");
      setSubmitting(false);
    }
  }

  return (
    <form className="mt-10 space-y-6" onSubmit={handleSubmit}>
      <label className="block">
        <span className="text-sm font-medium text-zinc-300">Name</span>
        <input
          className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
          name="name"
          required
          maxLength={100}
          autoComplete="off"
          placeholder="Atlas"
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium text-zinc-300">Description</span>
        <textarea
          className="mt-2 min-h-32 w-full resize-y rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
          name="description"
          required
          maxLength={1000}
          placeholder="What does this agent do?"
        />
      </label>

      <label className="block">
        <span className="text-sm font-medium text-zinc-300">Endpoint URL</span>
        <input
          className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 font-mono text-sm outline-none transition focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20"
          name="endpoint_url"
          type="url"
          inputMode="url"
          required
          placeholder="https://agent.example.com/api"
        />
      </label>

      {error ? (
        <p className="rounded-lg border border-red-900 bg-red-950/60 px-4 py-3 text-sm text-red-300" role="alert">
          {error}
        </p>
      ) : null}

      <button
        className="w-full rounded-lg bg-emerald-400 px-5 py-3 font-semibold text-zinc-950 transition hover:bg-emerald-300 disabled:cursor-not-allowed disabled:opacity-60"
        type="submit"
        disabled={submitting}
      >
        {submitting ? "Launching…" : "Launch agent"}
      </button>
    </form>
  );
}
