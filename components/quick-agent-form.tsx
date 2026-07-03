"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export function QuickAgentForm() {
  const router = useRouter();
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const form = new FormData(event.currentTarget);

    try {
      const authResponse = await fetch("/api/auth/anonymous", { method: "POST" });
      if (!authResponse.ok) throw new Error("Could not initialize your session.");

      const response = await fetch("/api/agents/quick", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: form.get("name"),
          description: form.get("description"),
          personality: form.get("personality"),
          llm_provider: form.get("llm_provider"),
          api_key: form.get("api_key"),
        }),
      });
      const body = (await response.json()) as { id?: string; error?: string };
      if (!response.ok || !body.id) throw new Error(body.error ?? "Unable to create agent.");
      router.push(`/agents/${body.id}`);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Unable to create agent.");
      setSubmitting(false);
    }
  }

  const fieldClass =
    "mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20";

  return (
    <form className="mt-10 space-y-6" onSubmit={handleSubmit}>
      <label className="block">
        <span className="text-sm font-medium text-zinc-300">Name</span>
        <input className={fieldClass} name="name" required maxLength={100} placeholder="Atlas" />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-zinc-300">Public description</span>
        <textarea className={`${fieldClass} min-h-28 resize-y`} name="description" required maxLength={1000} placeholder="A disciplined market analyst." />
      </label>
      <label className="block">
        <span className="text-sm font-medium text-zinc-300">Personality and strategy</span>
        <textarea className={`${fieldClass} min-h-36 resize-y`} name="personality" required maxLength={2000} placeholder="Aggressive investor focused on education startups. Take calculated risks and explain decisions plainly." />
        <span className="mt-2 block text-xs leading-5 text-zinc-500">Private. Combined with the current world state to guide each decision.</span>
      </label>
      <label className="block">
        <span className="text-sm font-medium text-zinc-300">LLM provider</span>
        <select className={fieldClass} name="llm_provider" defaultValue="openai">
          <option value="openai">OpenAI</option>
          <option value="anthropic">Anthropic</option>
        </select>
      </label>
      <label className="block">
        <span className="text-sm font-medium text-zinc-300">API key</span>
        <input className={`${fieldClass} font-mono`} name="api_key" type="password" required autoComplete="new-password" spellCheck={false} placeholder="sk-…" />
      </label>

      <p className="rounded-xl border border-violet-900 bg-violet-950/40 p-4 text-sm leading-6 text-violet-200">
        Your API key is encrypted, used only to run your agent&apos;s decisions each tick,
        and never shared or displayed.
      </p>

      {error ? <p className="rounded-lg border border-red-900 bg-red-950/60 px-4 py-3 text-sm text-red-300" role="alert">{error}</p> : null}
      <button className="w-full rounded-lg bg-violet-400 px-5 py-3 font-semibold text-zinc-950 transition hover:bg-violet-300 disabled:cursor-not-allowed disabled:opacity-60" type="submit" disabled={submitting}>
        {submitting ? "Creating…" : "Create Quick Agent"}
      </button>
    </form>
  );
}
