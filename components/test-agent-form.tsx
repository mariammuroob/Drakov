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
    <form className="mt-10 space-y-6" onSubmit={handleSubmit}>
      <label className="block">
        <span className="text-sm font-medium text-zinc-300">Agent endpoint URL</span>
        <input
          className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 font-mono text-sm outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
          type="url"
          required
          value={endpointUrl}
          onChange={(event) => setEndpointUrl(event.target.value)}
        />
      </label>

      <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4">
        <label className="flex items-center gap-3 text-sm font-medium text-zinc-300">
          <input
            className="size-4 accent-violet-400"
            type="checkbox"
            checked={execute}
            onChange={(event) => setExecute(event.target.checked)}
          />
          Apply the parsed action to the database
        </label>
        {execute ? (
          <label className="mt-4 block">
            <span className="text-sm text-zinc-400">Agent ID</span>
            <input
              className="mt-2 w-full rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 font-mono text-sm outline-none focus:border-violet-500"
              required
              value={agentId}
              onChange={(event) => setAgentId(event.target.value)}
              placeholder="00000000-0000-0000-0000-000000000000"
            />
          </label>
        ) : null}
      </div>

      <label className="block">
        <span className="text-sm font-medium text-zinc-300">Game state JSON</span>
        <textarea
          className="mt-2 min-h-72 w-full resize-y rounded-lg border border-zinc-700 bg-zinc-950 px-4 py-3 font-mono text-sm leading-6 outline-none transition focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
          required
          spellCheck={false}
          value={gameState}
          onChange={(event) => setGameState(event.target.value)}
        />
      </label>

      {error ? (
        <p className="rounded-lg border border-red-900 bg-red-950/60 px-4 py-3 text-sm text-red-300" role="alert">
          {error}
        </p>
      ) : null}

      <button
        className="w-full rounded-lg bg-violet-400 px-5 py-3 font-semibold text-zinc-950 transition hover:bg-violet-300 disabled:cursor-not-allowed disabled:opacity-60"
        type="submit"
        disabled={submitting}
      >
        {submitting ? "Calling agent…" : "Call Agent"}
      </button>

      {result ? (
        <section className="space-y-5 border-t border-zinc-800 pt-8" aria-live="polite">
          <div className="flex items-center justify-between">
            <h2 className="text-xl font-semibold">Result</h2>
            <span
              className={`rounded-full px-3 py-1 text-xs font-medium ${
                result.usedFallback
                  ? "bg-amber-950 text-amber-300"
                  : "bg-emerald-950 text-emerald-300"
              }`}
            >
              {result.usedFallback ? "Fallback used" : "Valid response"}
            </span>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-medium text-zinc-400">Parsed action</h3>
            <pre className="overflow-x-auto rounded-lg border border-zinc-800 bg-black p-4 text-sm text-emerald-300">
              {JSON.stringify(result.parsedAction, null, 2)}
            </pre>
          </div>

          <div>
            <h3 className="mb-2 text-sm font-medium text-zinc-400">Raw response</h3>
            <pre className="overflow-x-auto rounded-lg border border-zinc-800 bg-black p-4 text-sm text-zinc-300">
              {JSON.stringify(result.rawResponse, null, 2)}
            </pre>
          </div>

          {result.execution ? (
            <div>
              <h3 className="mb-2 text-sm font-medium text-zinc-400">Database execution</h3>
              <pre className="overflow-x-auto rounded-lg border border-zinc-800 bg-black p-4 text-sm text-violet-300">
                {JSON.stringify(result.execution, null, 2)}
              </pre>
            </div>
          ) : null}

          {result.executionError ? (
            <p className="rounded-lg border border-red-900 bg-red-950/60 px-4 py-3 text-sm text-red-300">
              Execution rejected: {result.executionError}
            </p>
          ) : null}
        </section>
      ) : null}
    </form>
  );
}
