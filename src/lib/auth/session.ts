import { redirect } from "next/navigation";
import { connection } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Returns the signed-in user, or null. Verified with Supabase each time. */
export async function getCurrentUser() {
  // Login checks depend on the visitor, so they always run at request time,
  // never while Next.js prepares pages ahead of time.
  await connection();
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return { supabase, user: data.user };
}

/** Like getCurrentUser, but sends signed-out visitors to the login page. */
export async function requireUser() {
  const { supabase, user } = await getCurrentUser();
  if (!user) redirect("/login");
  return { supabase, user };
}
