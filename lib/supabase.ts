import "server-only";

import { createClient } from "@supabase/supabase-js";

type PingResult =
  | { ok: true; timestamp: string }
  | { ok: false; error: string };

export async function getServerTime(): Promise<PingResult> {
  const url = process.env.SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY;

  if (!url || !anonKey) {
    return {
      ok: false,
      error: "SUPABASE_URL and SUPABASE_ANON_KEY must be configured.",
    };
  }

  try {
    const supabase = createClient(url, anonKey, {
      auth: { persistSession: false },
    });
    const { data, error } = await supabase.rpc("ping");

    if (error) {
      return { ok: false, error: error.message };
    }

    return { ok: true, timestamp: String(data) };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unknown connection error.",
    };
  }
}
