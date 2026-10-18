import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { getSupabaseEnv } from "./env";

/**
 * A Supabase client for server code (pages, actions, route handlers).
 * It reads and writes the login cookies of the person making the request,
 * so every database call runs as that person and Row Level Security applies.
 */
export async function createClient() {
  const cookieStore = await cookies();
  const { url, key } = getSupabaseEnv();

  return createServerClient(url, key, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options),
          );
        } catch {
          // Pages can't set cookies; src/proxy.ts refreshes sessions instead.
        }
      },
    },
  });
}
