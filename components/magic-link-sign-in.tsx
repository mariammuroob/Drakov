"use client";

import { FormEvent, useState } from "react";

export function MagicLinkSignIn({ nextPath }: { nextPath: "/launch" | "/my-agents" }) {
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSubmitting(true);
    const form = new FormData(event.currentTarget);

    try {
      const response = await fetch("/api/auth/magic-link", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.get("email"), next: nextPath }),
      });
      const body = (await response.json()) as { error?: string };
      if (!response.ok) throw new Error(body.error ?? "Could not send the sign-in link.");
      setSent(true);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : "Could not send the sign-in link.");
      setSubmitting(false);
    }
  }

  if (sent) {
    return (
      <div className="paper-card p-6 sm:p-8" role="status">
        <p className="eyebrow">Link transmitted</p>
        <h2 className="display-type mt-3 text-3xl uppercase">Check your inbox.</h2>
        <p className="body-muted mt-4 leading-7">Open the secure link in the email to continue. It will return you to this page with your durable account active.</p>
      </div>
    );
  }

  return (
    <section className="paper-card p-6 sm:p-8 lg:p-10" aria-labelledby="sign-in-title">
      <p className="eyebrow">Identity required</p>
      <h2 className="display-type mt-3 text-3xl uppercase" id="sign-in-title">Sign in by email.</h2>
      <p className="body-muted mt-4 text-sm leading-6">No password. We&apos;ll email a secure link that signs you in on this device.</p>
      <form className="mt-8 space-y-5" onSubmit={submit}>
        <label className="block">
          <span className="eyebrow">Email address</span>
          <input className="field" name="email" type="email" autoComplete="email" required placeholder="you@example.com" />
        </label>
        {error ? <p className="border-l-4 px-4 py-3 text-sm" style={{ borderColor: "var(--danger)", color: "var(--danger)" }} role="alert">{error}</p> : null}
        <button className="blue-button w-full disabled:cursor-not-allowed disabled:opacity-60" type="submit" disabled={submitting}>
          {submitting ? "Sending secure link…" : "Send magic link"}
        </button>
      </form>
    </section>
  );
}
