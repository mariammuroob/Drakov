import { TestAgentForm } from "@/components/test-agent-form";
import Link from "next/link";

export const metadata = {
  title: "Test Agent | Blackstone",
};

export default function TestAgentPage() {
  return (
    <main className="min-h-screen bg-zinc-950 px-6 py-16 text-zinc-50">
      <div className="mx-auto max-w-3xl">
        <Link className="text-sm text-zinc-400 transition hover:text-zinc-200" href="/">
          ← Blackstone
        </Link>
        <p className="mt-12 text-sm font-medium uppercase tracking-[0.2em] text-violet-400">
          Agent laboratory
        </p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">Test an agent endpoint</h1>
        <p className="mt-4 max-w-2xl leading-7 text-zinc-400">
          Send a sample game state and inspect both the endpoint payload and the action
          Blackstone accepted. Invalid responses safely fall back to saving cash.
        </p>
        <TestAgentForm />
      </div>
    </main>
  );
}
