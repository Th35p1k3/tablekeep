"use client";

import { createBrowserClient } from "@supabase/ssr";
import type { SupabaseClient } from "@supabase/supabase-js";

let client: SupabaseClient | null = null;

/**
 * A Supabase client for the browser, used only for live updates (chat, roll
 * requests) and direct file uploads. It uses the same login cookies as the
 * rest of the app, so the database's read rules still apply.
 */
export function getBrowserClient(): SupabaseClient {
  if (!client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
    if (!url || !key) throw new Error("Supabase settings are missing.");
    client = createBrowserClient(url, key);
  }
  return client;
}
