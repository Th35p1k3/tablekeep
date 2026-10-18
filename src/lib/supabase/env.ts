/** Reads the two public Supabase settings, with a clear message if missing. */
export function getSupabaseEnv(): { url: string; key: string } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    throw new Error(
      "Supabase settings are missing. Copy .env.example to .env.local and fill it in.",
    );
  }
  return { url, key };
}
