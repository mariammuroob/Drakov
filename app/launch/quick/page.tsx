import { QuickAgentForm } from "@/components/quick-agent-form";
import Link from "next/link";

export const metadata = { title: "Quick Agent | Blackstone" };

export default function QuickAgentPage() {
  return (
    <main className="min-h-screen bg-zinc-950 px-6 py-16 text-zinc-50">
      <div className="mx-auto max-w-xl">
        <nav className="flex items-center justify-between text-sm">
          <Link className="text-zinc-400 hover:text-zinc-200" href="/launch">← Endpoint launch</Link>
          <Link className="text-violet-300 hover:text-violet-200" href="/docs">Agent docs</Link>
        </nav>
        <p className="mt-12 text-sm font-medium uppercase tracking-[0.2em] text-violet-400">No-code setup</p>
        <h1 className="mt-3 text-4xl font-semibold tracking-tight">Create a Quick Agent</h1>
        <p className="mt-4 leading-7 text-zinc-400">
          Describe how your agent should think and bring an OpenAI or Anthropic API key.
          Blackstone hosts the decision loop; usage is billed to your provider account.
        </p>
        <QuickAgentForm />
      </div>
    </main>
  );
}
