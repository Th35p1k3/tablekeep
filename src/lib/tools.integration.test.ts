import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// A = DM, B = player, C = outsider. Skipped if settings are missing.
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

describe.skipIf(!ready)("announcements, logs, DM notes and activity", () => {
  let a: Session;
  let b: Session;
  let c: Session;
  let campaignId = "";
  let campaignDeleted = false;

  const rows = async (s: Session, table: string) => {
    const { data } = await s.client.from(table).select("*").eq("campaign_id", campaignId);
    return (data ?? []) as Array<Record<string, unknown>>;
  };

  beforeAll(async () => {
    a = await signedIn(users.a.email!, users.a.password!);
    b = await signedIn(users.b.email!, users.b.password!);
    c = await signedIn(users.c.email!, users.c.password!);
    campaignId = await rpcOk<string>(a, "create_campaign", { p_name: "[test] tools", p_game_system: "", p_description: "" });
    const token = await rpcOk<string>(a, "create_invite", { p_campaign: campaignId, p_days: 1, p_max_uses: 1 });
    await rpcOk(b, "join_campaign", { p_token: token });
  });

  afterAll(async () => {
    if (campaignId && !campaignDeleted) await a.client.rpc("delete_campaign", { p_campaign: campaignId });
  });

  it("DMs post announcements; players read them; outsiders see nothing", async () => {
    const { error } = await a.client.from("announcements").insert({ campaign_id: campaignId, title: "Session Saturday", body: "", pinned: true });
    expect(error).toBeNull();
    expect(await rows(b, "announcements")).toHaveLength(1);
    expect(await rows(c, "announcements")).toHaveLength(0);
    const byPlayer = await b.client.from("announcements").insert({ campaign_id: campaignId, title: "Hijack", body: "", pinned: false });
    expect(byPlayer.error).not.toBeNull();
    const edit = await b.client.from("announcements").update({ title: "Hijack" }).eq("campaign_id", campaignId).select("id");
    expect(edit.data ?? []).toHaveLength(0);
  });

  it("players never receive DM-only session logs", async () => {
    await a.client.from("session_logs").insert([
      { campaign_id: campaignId, title: "Session 1 recap", body: "We met.", visibility: "players" },
      { campaign_id: campaignId, title: "Secret plans", body: "The mayor is a dragon.", visibility: "dm_only" },
    ]);
    expect((await rows(a, "session_logs")).map((r) => r.title).sort()).toEqual(["Secret plans", "Session 1 recap"]);
    expect((await rows(b, "session_logs")).map((r) => r.title)).toEqual(["Session 1 recap"]);
    expect(await rows(c, "session_logs")).toHaveLength(0);
  });

  it("players can only write logs when allowed, and never DM-only ones", async () => {
    const blocked = await b.client.from("session_logs").insert({ campaign_id: campaignId, title: "My recap", visibility: "players" });
    expect(blocked.error).not.toBeNull();

    const notMine = await b.client.from("campaigns").update({ players_write_logs: true }).eq("id", campaignId).select("id");
    expect(notMine.data ?? []).toHaveLength(0);
    await a.client.from("campaigns").update({ players_write_logs: true }).eq("id", campaignId);

    const allowed = await b.client.from("session_logs").insert({ campaign_id: campaignId, title: "My recap", visibility: "players" });
    expect(allowed.error).toBeNull();
    const secret = await b.client.from("session_logs").insert({ campaign_id: campaignId, title: "Sneaky", visibility: "dm_only" });
    expect(secret.error).not.toBeNull();

    // Players can't edit the DM's logs or turn their own into DM-only ones.
    const editDm = await b.client.from("session_logs").update({ body: "Hacked" }).eq("title", "Session 1 recap").select("id");
    expect(editDm.data ?? []).toHaveLength(0);
    const hide = await b.client.from("session_logs").update({ visibility: "dm_only" }).eq("title", "My recap").select("id");
    expect(hide.error !== null || (hide.data ?? []).length === 0).toBe(true);
  });

  it("DM notes are invisible and untouchable for players and outsiders", async () => {
    const { error } = await a.client.from("dm_notes").insert({ campaign_id: campaignId, title: "Bram's debt", body: "50 gold" });
    expect(error).toBeNull();
    expect(await rows(a, "dm_notes")).toHaveLength(1);
    expect(await rows(b, "dm_notes")).toHaveLength(0);
    expect(await rows(c, "dm_notes")).toHaveLength(0);
    const byPlayer = await b.client.from("dm_notes").insert({ campaign_id: campaignId, title: "Fake", body: "" });
    expect(byPlayer.error).not.toBeNull();
  });

  it("DM notes can't link to things from other campaigns", async () => {
    const other = await rpcOk<string>(a, "create_campaign", { p_name: "[test] other", p_game_system: "", p_description: "" });
    const { data: log } = await a.client
      .from("session_logs")
      .insert({ campaign_id: other, title: "Elsewhere", visibility: "players" })
      .select("id")
      .single();
    const wrong = await a.client
      .from("dm_notes")
      .insert({ campaign_id: campaignId, title: "Cross-link", body: "", session_log_id: (log as { id: string }).id });
    expect(wrong.error).not.toBeNull();
    await rpcOk(a, "delete_campaign", { p_campaign: other });
  });

  it("the activity log records DM actions and only DMs can read it", async () => {
    await rpcOk(a, "set_member_role", { p_campaign: campaignId, p_user: b.userId, p_role: "co_dm" });
    await rpcOk(a, "set_member_role", { p_campaign: campaignId, p_user: b.userId, p_role: "player" });
    const actions = (await rows(a, "audit_log")).map((r) => r.action);
    expect(actions).toEqual(expect.arrayContaining(["member_joined", "role_changed", "setting_changed", "invite_created"]));
    expect(await rows(b, "audit_log")).toHaveLength(0);
    expect(await rows(c, "audit_log")).toHaveLength(0);
    const forge = await a.client.from("audit_log").insert({ campaign_id: campaignId, action: "fake", details: {} });
    expect(forge.error).not.toBeNull();
  });

  it("a campaign with history can still be deleted", async () => {
    const { error } = await a.client.rpc("delete_campaign", { p_campaign: campaignId });
    expect(error).toBeNull();
    campaignDeleted = true;
  });
});
