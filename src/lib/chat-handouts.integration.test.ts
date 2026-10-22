import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// A = DM, B and C = players (C joins for these tests, then leaves). Outsider
// checks happen before C joins. Skipped if settings are missing.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const creds = (letter: "A" | "B" | "C") => ({
  email: process.env[`TEST_USER_${letter}_EMAIL`],
  password: process.env[`TEST_USER_${letter}_PASSWORD`],
});
const users = { a: creds("A"), b: creds("B"), c: creds("C") };
const ready = Boolean(url && key && Object.values(users).every((u) => u.email && u.password));

const PNG = Uint8Array.from(
  atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg=="),
  (c) => c.charCodeAt(0),
);

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

describe.skipIf(!ready)("chat, whispers and handouts", () => {
  let a: Session;
  let b: Session;
  let c: Session;
  let campaignId = "";
  const handout: Record<string, string> = {};

  const bodies = async (s: Session) => {
    const { data } = await s.client.from("messages").select("body").eq("campaign_id", campaignId).order("created_at");
    return (data ?? []).map((m) => m.body as string);
  };
  const titles = async (s: Session) => {
    const { data } = await s.client.from("handouts").select("title").eq("campaign_id", campaignId);
    return (data ?? []).map((h) => h.title as string).sort();
  };

  beforeAll(async () => {
    a = await signedIn(users.a.email!, users.a.password!);
    b = await signedIn(users.b.email!, users.b.password!);
    c = await signedIn(users.c.email!, users.c.password!);
    campaignId = await rpcOk<string>(a, "create_campaign", { p_name: "[test] chat", p_game_system: "", p_description: "" });
    const token = await rpcOk<string>(a, "create_invite", { p_campaign: campaignId, p_days: 1, p_max_uses: 2 });
    await rpcOk(b, "join_campaign", { p_token: token });
  });

  afterAll(async () => {
    if (campaignId) {
      const { data } = await a.client.storage.from("handouts").list(campaignId);
      for (const folder of data ?? []) {
        const { data: files } = await a.client.storage.from("handouts").list(`${campaignId}/${folder.name}`);
        const paths = (files ?? []).map((f) => `${campaignId}/${folder.name}/${f.name}`);
        if (paths.length) await a.client.storage.from("handouts").remove(paths);
      }
      await a.client.rpc("delete_campaign", { p_campaign: campaignId });
    }
  });

  it("outsiders can't read or post chat", async () => {
    await a.client.from("messages").insert({ campaign_id: campaignId, body: "Welcome!" });
    expect(await bodies(c)).toEqual([]);
    const post = await c.client.from("messages").insert({ campaign_id: campaignId, body: "Hi" });
    expect(post.error).not.toBeNull();
  });

  it("whispers reach only their recipients (and DMs)", async () => {
    const token = await rpcOk<string>(a, "create_invite", { p_campaign: campaignId, p_days: 1, p_max_uses: 1 });
    await rpcOk(c, "join_campaign", { p_token: token });

    await a.client.from("messages").insert({ campaign_id: campaignId, body: "Psst, Bram", recipients: [b.userId] });
    const bToDm = await b.client.from("messages").insert({ campaign_id: campaignId, body: "I pick the lock", recipients: [a.userId] });
    expect(bToDm.error).toBeNull();

    expect(await bodies(b)).toEqual(["Welcome!", "Psst, Bram", "I pick the lock"]);
    expect(await bodies(c)).toEqual(["Welcome!"]);
    expect(await bodies(a)).toEqual(["Welcome!", "Psst, Bram", "I pick the lock"]);
  });

  it("players can't whisper to other players", async () => {
    const { error } = await b.client.from("messages").insert({ campaign_id: campaignId, body: "Secret", recipients: [c.userId] });
    expect(error).not.toBeNull();
    const mixed = await b.client.from("messages").insert({ campaign_id: campaignId, body: "Secret", recipients: [a.userId, c.userId] });
    expect(mixed.error).not.toBeNull();
  });

  it("people edit and delete their own messages; DMs can delete any", async () => {
    const { data: mine } = await b.client.from("messages").insert({ campaign_id: campaignId, body: "Oops" }).select("id").single();
    const edit = await b.client.from("messages").update({ body: "Fixed" }).eq("id", (mine as { id: string }).id).select("edited_at");
    expect(edit.data?.[0]?.edited_at).not.toBeNull();

    const notMine = await c.client.from("messages").update({ body: "Hacked" }).eq("id", (mine as { id: string }).id).select("id");
    expect(notMine.data ?? []).toHaveLength(0);
    const cDelete = await c.client.from("messages").delete().eq("id", (mine as { id: string }).id).select("id");
    expect(cDelete.data ?? []).toHaveLength(0);

    const dmDelete = await a.client.from("messages").delete().eq("id", (mine as { id: string }).id).select("id");
    expect(dmDelete.data ?? []).toHaveLength(1);
  });

  it("handouts reach everyone, chosen players, or DMs only", async () => {
    for (const [name, visibility] of [["Town map", "all"], ["Letter for Bram", "selected"], ["DM map", "dm_only"]] as const) {
      handout[name] = randomUUID();
      const { error } = await a.client.from("handouts").insert({ id: handout[name], campaign_id: campaignId, title: name, visibility });
      expect(error).toBeNull();
    }
    await a.client.from("handout_recipients").insert({ handout_id: handout["Letter for Bram"], user_id: b.userId });

    expect(await titles(a)).toEqual(["DM map", "Letter for Bram", "Town map"]);
    expect(await titles(b)).toEqual(["Letter for Bram", "Town map"]);
    expect(await titles(c)).toEqual(["Town map"]);
    const byPlayer = await b.client.from("handouts").insert({ id: randomUUID(), campaign_id: campaignId, title: "Fake" });
    expect(byPlayer.error).not.toBeNull();
  });

  it("handout files follow the same rules, even with a direct link", async () => {
    const id = handout["Letter for Bram"];
    const path = `${campaignId}/${id}/letter.png`;
    const up = await a.client.storage.from("handouts").upload(path, PNG, { contentType: "image/png" });
    expect(up.error).toBeNull();
    await a.client.from("handouts").delete().eq("id", id);
    // Recreate with the file attached (file columns are only set when creating).
    const { error } = await a.client.from("handouts").insert({
      id,
      campaign_id: campaignId,
      title: "Letter for Bram",
      visibility: "selected",
      file_path: path,
      file_name: "letter.png",
      file_type: "image/png",
      file_size: PNG.length,
    });
    expect(error).toBeNull();
    await a.client.from("handout_recipients").insert({ handout_id: id, user_id: b.userId });

    const forB = await b.client.storage.from("handouts").createSignedUrl(path, 60);
    expect(forB.error).toBeNull();
    const forC = await c.client.storage.from("handouts").createSignedUrl(path, 60);
    expect(forC.data?.signedUrl ?? null).toBeNull();
    const download = await c.client.storage.from("handouts").download(path);
    expect(download.data ?? null).toBeNull();
  });

  it("players can't upload into a campaign's folder", async () => {
    const { error } = await b.client.storage
      .from("handouts")
      .upload(`${campaignId}/${randomUUID()}/sneaky.png`, PNG, { contentType: "image/png" });
    expect(error).not.toBeNull();
  });

  it("files must live in their own handout's folder", async () => {
    const id = randomUUID();
    const { error } = await a.client.from("handouts").insert({
      id,
      campaign_id: campaignId,
      title: "Wrong folder",
      file_path: `${campaignId}/${handout["Town map"]}/letter.png`,
      file_name: "letter.png",
      file_type: "image/png",
      file_size: 10,
    });
    expect(error).not.toBeNull();
  });
});
