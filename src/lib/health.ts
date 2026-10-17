import { createClient } from "@supabase/supabase-js";

export type HealthResult =
  | { ok: true; checkedAt: string }
  | { ok: false; reason: string };

/** Turns a raw database response into a simple result the page can show. */
export function interpretHealth(
  data: unknown,
  error: { message: string } | null,
): HealthResult {
  if (error) return { ok: false, reason: error.message };
  if (
    typeof data === "object" &&
    data !== null &&
    (data as { ok?: unknown }).ok === true &&
    typeof (data as { time?: unknown }).time === "string"
  ) {
    return { ok: true, checkedAt: (data as { time: string }).time };
  }
  return { ok: false, reason: "Unexpected response from the database." };
}

/** Asks the database to run the health_check() function. */
export async function checkDatabase(): Promise<HealthResult> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    return {
      ok: false,
      reason:
        "Supabase settings are missing. Copy .env.example to .env.local and fill it in.",
    };
  }
  try {
    const supabase = createClient(url, key, {
      auth: { persistSession: false },
    });
    const { data, error } = await supabase.rpc("health_check");
    return interpretHealth(data, error);
  } catch (e) {
    return {
      ok: false,
      reason: e instanceof Error ? e.message : "Could not reach the database.",
    };
  }
}
