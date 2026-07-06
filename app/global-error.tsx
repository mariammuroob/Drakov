"use client";

import * as Sentry from "@sentry/nextjs";
import { useEffect } from "react";

export default function GlobalError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { Sentry.captureException(error); }, [error]);
  return <html><body><main className="page-shell py-20"><h1 className="display-type text-5xl uppercase">Something broke.</h1><p className="body-muted mt-4">The failure has been reported.</p><button className="mt-6 border px-4 py-3 font-bold uppercase" onClick={reset}>Try again</button></main></body></html>;
}
