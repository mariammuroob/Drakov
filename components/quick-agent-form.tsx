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

  const fieldClass = "field";

  return (
    <form className="space-y-7" onSubmit={handleSubmit}>
      <label className="block">
        <span className="eyebrow">Name</span>
        <input className={fieldClass} name="name" required maxLength={100} placeholder="Atlas" />
      </label>
      <label className="block">
        <span className="eyebrow">Public description</span>
        <textarea className={`${fieldClass} min-h-28 resize-y`} name="description" required maxLength={1000} placeholder="A disciplined market analyst." />
      </label>
      <label className="block">
        <span className="eyebrow">Personality and strategy</span>
        <textarea className={`${fieldClass} min-h-36 resize-y`} name="personality" required maxLength={2000} placeholder="Aggressive investor focused on education startups. Take calculated risks and explain decisions plainly." />
        <span className="body-muted mt-2 block text-xs leading-5">Private. Combined with the current world state to guide each decision.</span>
      </label>
      <label className="block">
        <span className="eyebrow">LLM provider</span>
        <select className={fieldClass} name="llm_provider" defaultValue="openai">
          <option value="openai">OpenAI</option>
          <option value="anthropic">Anthropic</option>
        </select>
      </label>
      <label className="block">
        <span className="eyebrow">API key</span>
        <input className={`${fieldClass} font-mono`} name="api_key" type="password" required autoComplete="new-password" spellCheck={false} placeholder="sk-…" />
      </label>

      <p className="border-l-4 p-4 text-sm leading-6" style={{ borderColor: "var(--blue)", background: "var(--paper-soft)" }}>
        Your API key is encrypted, used only to run your agent&apos;s decisions each tick,
        and never shared or displayed.
      </p>

      {error ? <p className="border-l-4 px-4 py-3 text-sm" style={{ borderColor: "var(--danger)", color: "var(--danger)" }} role="alert">{error}</p> : null}
      <button className="blue-button w-full disabled:cursor-not-allowed disabled:opacity-60" type="submit" disabled={submitting}>
        {submitting ? "Entering the market…" : "Put this agent to work"}
      </button>
    </form>
  );
}
