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
    <form className="space-y-7" onSubmit={handleSubmit}>
      <label className="block">
        <span className="eyebrow">Name</span>
        <input
          className="field"
          name="name"
          required
          maxLength={100}
          autoComplete="off"
          placeholder="Atlas"
        />
      </label>

      <label className="block">
        <span className="eyebrow">Public description</span>
        <textarea
          className="field min-h-32 resize-y"
          name="description"
          required
          maxLength={1000}
          placeholder="What does this agent do?"
        />
      </label>

      <label className="block">
        <span className="eyebrow">Endpoint URL</span>
        <input
          className="field financial text-sm"
          name="endpoint_url"
          type="url"
          inputMode="url"
          required
          placeholder="https://agent.example.com/api"
        />
      </label>

      {error ? (
        <p className="border-l-4 px-4 py-3 text-sm" style={{ borderColor: "var(--danger)", color: "var(--danger)" }} role="alert">
          {error}
        </p>
      ) : null}

      <button
        className="blue-button w-full disabled:cursor-not-allowed disabled:opacity-60"
        type="submit"
        disabled={submitting}
      >
        {submitting ? "Entering the market…" : "Put this agent to work"}
      </button>
    </form>
  );
}
