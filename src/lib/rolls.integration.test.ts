import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// A = DM, B and C = players. Skipped if settings are missing.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const creds = (letter: "A" | "B" | "C") => ({
  email: process.env[`TEST_USER_${letter}_EMAIL`],
  password: process.env[`TEST_USER_${letter}_PASSWORD`],
});
const users = { a: creds("A"), b: creds("B"), c: creds("C") };
const ready = Boolean(url && key && Object.values(users).every((u) => u.email && u.password));

async function signedIn(email: string, password: string) {
  const client = createClient(url!, key!, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) throw new Error(`Couldn't sign in ${email}: ${error?.message}`);
  return { client, userId: data.user.id };
}
type Session = Awaited<ReturnType<typeof signedIn>>;

async function rpcOk<T>(s: Session, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await s.client.rpc(fn, args);
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

describe.skipIf(!ready)("roll requests", () => {
  let a: Session;
  let b: Session;
  let c: Session;
  let campaignId = "";

  const request = (s: Session, overrides: Record<string, unknown> = {}) =>
    s.client.rpc("create_roll_request", {
      p_campaign: campaignId,
      p_label: "Perception",
      p_count: 1,
      p_sides: 20,
      p_bonus: 2,
      p_modifier_field: "wisdom_mod",
      p_keep: "normal",
      p_share: false,
      p_targets: [b.userId],
      ...overrides,
    });

  beforeAll(async () => {
    a = await signedIn(users.a.email!, users.a.password!);
    b = await signedIn(users.b.email!, users.b.password!);
    c = await signedIn(users.c.email!, users.c.password!);
    campaignId = await rpcOk<string>(a, "create_campaign", { p_name: "[test] rolls", p_game_system: "", p_description: "" });
    const token = await rpcOk<string>(a, "create_invite", { p_campaign: campaignId, p_days: 1, p_max_uses: 2 });
    await rpcOk(b, "join_campaign", { p_token: token });
    await rpcOk(c, "join_campaign", { p_token: token });
  });

  afterAll(async () => {
    if (campaignId) await a.client.rpc("delete_campaign", { p_campaign: campaignId });
  });

  it("only DMs can ask for rolls, and only from members", async () => {
    expect((await request(b)).error?.message).toContain("not_allowed");
    expect((await request(a, { p_targets: [] })).error?.message).toContain("no_targets");
    expect((await request(a, { p_targets: ["00000000-0000-4000-8000-000000000000"] })).error?.message).toContain("not_a_member");
  });

  it("the server rolls fairly: dice in range, total adds up, one roll each", async () => {
    const { data: id } = await request(a);
    const { data: seenByC } = await c.client.from("roll_requests").select("id").eq("id", id as string);
    expect(seenByC ?? []).toHaveLength(0);

    const roll = await b.client.rpc("roll_for_request", { p_request: id, p_modifier: 3, p_modifier_label: "wisdom_mod" });
    expect(roll.error).toBeNull();
    const result = roll.data as { dice: number[]; total: number; modifier: number };
    expect(result.dice).toHaveLength(1);
    expect(result.dice[0]).toBeGreaterThan(0);
    expect(result.dice[0]).toBeLessThan(21);
    expect(result.total).toBe(result.dice[0] + 2 + 3);

    const again = await b.client.rpc("roll_for_request", { p_request: id, p_modifier: 3 });
    expect(again.error?.message).toContain("already_rolled");
    const notTarget = await c.client.rpc("roll_for_request", { p_request: id, p_modifier: 0 });
    expect(notTarget.error?.message).toContain("not_allowed");
  });

  it("results are private to the roller and the DM unless shared", async () => {
    const { data: aRows } = await a.client.from("roll_results").select("total").eq("campaign_id", campaignId);
    const { data: cRows } = await c.client.from("roll_results").select("total").eq("campaign_id", campaignId);
    expect(aRows ?? []).toHaveLength(1);
    expect(cRows ?? []).toHaveLength(0);
  });

  it("players can't write results directly or invent absurd modifiers", async () => {
    const { data: id } = await request(a, { p_label: "Stealth" });
    const forged = await b.client
      .from("roll_results")
      .insert({ request_id: id, campaign_id: campaignId, user_id: b.userId, method: "app", total: 99 });
    expect(forged.error).not.toBeNull();
    const absurd = await b.client.rpc("roll_for_request", { p_request: id, p_modifier: 500 });
    expect(absurd.error?.message).toContain("invalid_input");
  });

  it("keep-higher keeps the better of two rolls", async () => {
    const { data: id } = await request(a, { p_label: "Advantage", p_bonus: 0, p_keep: "highest", p_modifier_field: null });
    const roll = await rpcOk<{ dice: number[]; dice_other: number[]; total: number }>(b, "roll_for_request", { p_request: id });
    expect(roll.dice_other).toHaveLength(1);
    expect(roll.dice[0]).toBeGreaterThanOrEqual(roll.dice_other[0]);
    expect(roll.total).toBe(roll.dice[0]);
  });

  it("table rolls can be typed in, and shared results go to chat for everyone", async () => {
    const { data: id } = await request(a, { p_label: "Initiative", p_share: true, p_targets: [b.userId, c.userId] });
    await rpcOk(b, "submit_manual_roll", { p_request: id, p_total: 17 });
    const { data: chat } = await c.client.from("messages").select("body").eq("campaign_id", campaignId);
    expect((chat ?? []).map((m) => m.body)).toContainEqual("🎲 Initiative: 17 (rolled at the table)");
  });

  it("closed requests can't be rolled, and players can't close them", async () => {
    const { data: id } = await request(a, { p_label: "Late", p_targets: [c.userId] });
    const byPlayer = await c.client.rpc("close_roll_request", { p_request: id });
    expect(byPlayer.error?.message).toContain("not_allowed");
    await rpcOk(a, "close_roll_request", { p_request: id });
    const roll = await c.client.rpc("roll_for_request", { p_request: id, p_modifier: 0 });
    expect(roll.error?.message).toContain("request_closed");
  });
});
