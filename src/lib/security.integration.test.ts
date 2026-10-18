import { createClient } from "@supabase/supabase-js";
import { beforeAll, describe, expect, it } from "vitest";

// Uses the throwaway test accounts from .env.local (see docs/SETUP.md).
// Skipped automatically when those settings are missing.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const userA = {
  email: process.env.TEST_USER_A_EMAIL,
  password: process.env.TEST_USER_A_PASSWORD,
};
const userB = {
  email: process.env.TEST_USER_B_EMAIL,
  password: process.env.TEST_USER_B_PASSWORD,
};
const userC = {
  email: process.env.TEST_USER_C_EMAIL,
  password: process.env.TEST_USER_C_PASSWORD,
};
const ready = Boolean(
  url &&
    key &&
    userA.email &&
    userA.password &&
    userB.email &&
    userB.password &&
    userC.email &&
    userC.password,
);

function newClient() {
  return createClient(url!, key!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function signedIn(email: string, password: string) {
  const client = newClient();
  const { data, error } = await client.auth.signInWithPassword({
    email,
    password,
  });
  if (error || !data.user) {
    throw new Error(`Couldn't sign in test user ${email}: ${error?.message}`);
  }
  return { client, userId: data.user.id };
}

describe.skipIf(!ready)("profile security with test users", () => {
  let a: Awaited<ReturnType<typeof signedIn>>;
  let b: Awaited<ReturnType<typeof signedIn>>;
  let c: Awaited<ReturnType<typeof signedIn>>;

  beforeAll(async () => {
    a = await signedIn(userA.email!, userA.password!);
    b = await signedIn(userB.email!, userB.password!);
    c = await signedIn(userC.email!, userC.password!);
  });

  it("a user sees their own profile but not a stranger's", async () => {
    // Test C never shares a campaign with anyone, so A must not see C.
    const { data, error } = await a.client.from("profiles").select("id");
    expect(error).toBeNull();
    const ids = (data ?? []).map((row) => row.id);
    expect(ids).toContain(a.userId);
    expect(ids).not.toContain(c.userId);
  });

  it("a user cannot rename someone else", async () => {
    const { data } = await a.client
      .from("profiles")
      .update({ display_name: "Hacked" })
      .eq("id", b.userId)
      .select("id");
    expect(data ?? []).toHaveLength(0);

    const { data: row } = await b.client
      .from("profiles")
      .select("display_name")
      .eq("id", b.userId)
      .single();
    expect(row?.display_name).not.toBe("Hacked");
  });

  it("signed-out visitors cannot read any profiles", async () => {
    const { data } = await newClient().from("profiles").select("id");
    expect(data ?? []).toHaveLength(0);
  });

  it("users cannot read the invite list", async () => {
    const { data } = await a.client.from("signup_allowlist").select("email");
    expect(data ?? []).toHaveLength(0);
  });
});
