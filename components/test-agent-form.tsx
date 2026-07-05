"use client";

import { FormEvent, useEffect, useState } from "react";

type TestResult = {
  rawResponse: unknown;
  parsedAction: unknown;
  usedFallback: boolean;
  execution?: unknown;
  executionError?: string;
};

const SAMPLE_GAME_STATE = JSON.stringify(
  {
    turn: 1,
    agent: { cash: 10000, reputation: 50 },
    companies: [],
    open_jobs: [],
  },
  null,
  2,
);

export function TestAgentForm() {
  const [endpointUrl, setEndpointUrl] = useState("");
  const [gameState, setGameState] = useState(SAMPLE_GAME_STATE);
  const [agentId, setAgentId] = useState("");
  const [execute, setExecute] = useState(false);
  const [result, setResult] = useState<TestResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    setEndpointUrl(`${window.location.origin}/api/mock-agent`);
  }, []);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setResult(null);

    let parsedGameState: unknown;
    try {
      parsedGameState = JSON.parse(gameState) as unknown;
    } catch {
      setError("Game state must be valid JSON.");
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch("/api/test-agent", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          endpoint_url: endpointUrl,
          gameState: parsedGameState,
          agent_id: agentId,
          execute,
        }),
      });
      const body = (await response.json()) as TestResult & { error?: string };

      if (!response.ok) {
        if (body.executionError) {
          setResult(body);
          return;
        }
        throw new Error(body.error ?? "Could not call agent.");
      }

      setResult(body);
    } catch (error) {
      setError(error instanceof Error ? error.message : "Could not call agent.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form className="space-y-7" onSubmit={handleSubmit}>
      <label className="block">
        <span className="eyebrow">Agent endpoint URL</span>
        <input
          className="field financial text-sm"
          type="url"
          required
          value={endpointUrl}
          onChange={(event) => setEndpointUrl(event.target.value)}
        />
      </label>

      <div className="border p-4" style={{ borderColor: "var(--line)" }}>
        <label className="flex min-h-11 items-center gap-3 text-sm font-bold">
          <input
            className="size-5 accent-[var(--blue)]"
            type="checkbox"
            checked={execute}
            onChange={(event) => setExecute(event.target.checked)}
          />
          Apply the parsed action to the database
        </label>
        {execute ? (
          <label className="mt-4 block">
            <span className="eyebrow">Agent ID</span>
            <input
              className="field financial text-sm"
              required
              value={agentId}
              onChange={(event) => setAgentId(event.target.value)}
              placeholder="00000000-0000-0000-0000-000000000000"
            />
          </label>
        ) : null}
      </div>

      <label className="block">
        <span className="eyebrow">Game state JSON</span>
        <textarea
          className="field financial min-h-72 resize-y text-sm leading-6"
          required
          spellCheck={false}
          value={gameState}
          onChange={(event) => setGameState(event.target.value)}
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
        {submitting ? "Calling the endpoint…" : "Run the decision"}
      </button>

      {result ? (
        <section className="space-y-6 border-t-2 pt-8 editorial-rule" aria-live="polite">
          <div className="flex items-center justify-between">
            <h2 className="display-type text-3xl uppercase">The verdict</h2>
            <span
              className="border px-3 py-1 text-xs font-bold uppercase tracking-wider"
              style={{ borderColor: result.usedFallback ? "var(--danger)" : "var(--blue)", color: result.usedFallback ? "var(--danger)" : "var(--blue)" }}
            >
              {result.usedFallback ? "Fallback used" : "Valid response"}
            </span>
          </div>

          <div>
            <h3 className="eyebrow mb-2">Parsed action</h3>
            <pre className="financial max-w-full overflow-x-auto border bg-black p-4 text-sm" style={{ borderColor: "var(--line)", color: "var(--ink)" }}>
              {JSON.stringify(result.parsedAction, null, 2)}
            </pre>
          </div>

          <div>
            <h3 className="eyebrow mb-2">Raw response</h3>
            <pre className="financial max-w-full overflow-x-auto border bg-black p-4 text-sm" style={{ borderColor: "var(--line)", color: "var(--ink)" }}>
              {JSON.stringify(result.rawResponse, null, 2)}
            </pre>
          </div>

          {result.execution ? (
            <div>
              <h3 className="eyebrow mb-2">Database execution</h3>
              <pre className="financial max-w-full overflow-x-auto border bg-black p-4 text-sm" style={{ borderColor: "var(--line)", color: "var(--ink)" }}>
                {JSON.stringify(result.execution, null, 2)}
              </pre>
            </div>
          ) : null}

          {result.executionError ? (
            <p className="border-l-4 px-4 py-3 text-sm" style={{ borderColor: "var(--danger)", color: "var(--danger)" }}>
              Execution rejected: {result.executionError}
            </p>
          ) : null}
        </section>
      ) : null}
    </form>
  );
}
