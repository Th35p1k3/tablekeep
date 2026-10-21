import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { STARTER_TEMPLATE } from "@/lib/templates/starter";

// A = DM, B = player, C = second player (joins briefly) and outsider.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const creds = (letter: "A" | "B" | "C") => ({
  email: process.env[`TEST_USER_${letter}_EMAIL`],
  password: process.env[`TEST_USER_${letter}_PASSWORD`],
});
const users = { a: creds("A"), b: creds("B"), c: creds("C") };
const ready = Boolean(url && key && Object.values(users).every((u) => u.email && u.password));

async function signedIn(email: string, password: string) {
  const client = createClient(url!, key!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
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

describe.skipIf(!ready)("characters in campaigns", () => {
  let a: Session;
  let b: Session;
  let c: Session;
  let campaignId = "";
  let templateId = "";
  let versionId = "";
  let characterId = "";
  let itemId = "";

  const canSee = async (s: Session) => {
    const { data } = await s.client.from("characters").select("id").eq("id", characterId);
    return (data ?? []).length === 1;
  };

  beforeAll(async () => {
    a = await signedIn(users.a.email!, users.a.password!);
    b = await signedIn(users.b.email!, users.b.password!);
    c = await signedIn(users.c.email!, users.c.password!);

    templateId = await rpcOk<string>(a, "create_template", {
      p_name: "[test] party template",
      p_game_system: "",
      p_description: "Created by the automated tests. Safe to delete.",
      p_definition: STARTER_TEMPLATE,
    });
    await rpcOk(a, "publish_template", { p_template: templateId });
    const { data: v } = await a.client
      .from("sheet_template_versions")
      .select("id")
      .eq("template_id", templateId)
      .eq("status", "published");
    versionId = (v ?? [])[0]?.id;

    campaignId = await rpcOk<string>(a, "create_campaign", {
      p_name: "[test] party campaign",
      p_game_system: "",
      p_description: "",
    });
    const token = await rpcOk<string>(a, "create_invite", { p_campaign: campaignId, p_days: 1, p_max_uses: 5 });
    await rpcOk(b, "join_campaign", { p_token: token });
  });

  afterAll(async () => {
    if (characterId) await b.client.rpc("delete_character", { p_character: characterId });
    if (campaignId) await a.client.rpc("delete_campaign", { p_campaign: campaignId });
    if (templateId) await a.client.rpc("delete_template", { p_template: templateId });
  });

  it("only managers can offer their own published templates", async () => {
    const byPlayer = await b.client.rpc("offer_template_in_campaign", { p_campaign: campaignId, p_version: versionId });
    expect(byPlayer.error?.message).toContain("not_allowed");
    await rpcOk(a, "offer_template_in_campaign", { p_campaign: campaignId, p_version: versionId });
    const { data } = await b.client.from("campaign_templates").select("template_version_id").eq("campaign_id", campaignId);
    expect(data).toEqual([{ template_version_id: versionId }]);
  });

  it("members can build from an offered template; outsiders can't", async () => {
    const outsider = await c.client.rpc("create_character", { p_name: "[test] Nope", p_template_version: versionId });
    expect(outsider.error?.message).toContain("not_allowed");
    characterId = await rpcOk<string>(b, "create_character", { p_name: "[test] Bram", p_template_version: versionId });
    const { data } = await b.client.from("sheet_template_versions").select("definition").eq("id", versionId).single();
    expect(data?.definition.sections.length).toBe(STARTER_TEMPLATE.sections.length);
  });

  it("before joining the party, the DM can't see the character", async () => {
    expect(await canSee(a)).toBe(false);
  });

  it("players add their own characters, once", async () => {
    const notOwner = await a.client.rpc("add_character_to_campaign", { p_campaign: campaignId, p_character: characterId });
    expect(notOwner.error?.message).toContain("not_allowed");
    await rpcOk(b, "add_character_to_campaign", { p_campaign: campaignId, p_character: characterId });
    const again = await b.client.rpc("add_character_to_campaign", { p_campaign: campaignId, p_character: characterId });
    expect(again.error?.message).toContain("character_in_campaign");
  });

  it("the DM sees the full sheet and inventory but can't change them", async () => {
    const { error } = await b.client
      .from("inventory_items")
      .insert({ character_id: characterId, name: "Rope", quantity: 1, weight: 1.5, notes: "" });
    expect(error).toBeNull();
    const { data: items } = await b.client.from("inventory_items").select("id").eq("character_id", characterId);
    itemId = (items ?? [])[0]?.id;

    expect(await canSee(a)).toBe(true);
    const { data: dmItems } = await a.client.from("inventory_items").select("name").eq("character_id", characterId);
    expect(dmItems).toEqual([{ name: "Rope" }]);

    const edit = await a.client.from("characters").update({ data: { strength: 1 } }).eq("id", characterId).select("id");
    expect(edit.data ?? []).toHaveLength(0);
    const editItem = await a.client.from("inventory_items").update({ quantity: 99 }).eq("id", itemId).select("id");
    expect(editItem.data ?? []).toHaveLength(0);
    const addItem = await a.client
      .from("inventory_items")
      .insert({ character_id: characterId, name: "Cursed ring", quantity: 1, notes: "" });
    expect(addItem.error).not.toBeNull();
  });

  it("other players see names only, unless the DM allows full sheets", async () => {
    const token = await rpcOk<string>(a, "create_invite", { p_campaign: campaignId, p_days: 1, p_max_uses: 1 });
    await rpcOk(c, "join_campaign", { p_token: token });

    const party = await rpcOk<Array<{ character_name: string; can_view: boolean }>>(c, "campaign_party", {
      p_campaign: campaignId,
    });
    expect(party).toEqual([expect.objectContaining({ character_name: "[test] Bram", can_view: false })]);
    expect(await canSee(c)).toBe(false);
    const { data: hiddenItems } = await c.client.from("inventory_items").select("id").eq("character_id", characterId);
    expect(hiddenItems ?? []).toHaveLength(0);

    await a.client.from("campaigns").update({ players_see_full_sheets: true }).eq("id", campaignId);
    expect(await canSee(c)).toBe(true);
    await a.client.from("campaigns").update({ players_see_full_sheets: false }).eq("id", campaignId);
    expect(await canSee(c)).toBe(false);
  });

  it("players can't change the sheet-visibility setting", async () => {
    const { data } = await b.client
      .from("campaigns")
      .update({ players_see_full_sheets: true })
      .eq("id", campaignId)
      .select("id");
    expect(data ?? []).toHaveLength(0);
  });

  it("removing a player takes their characters out of the party", async () => {
    await rpcOk(a, "remove_member", { p_campaign: campaignId, p_user: c.userId });
    await rpcOk(a, "remove_member", { p_campaign: campaignId, p_user: b.userId });
    const { data } = await b.client.from("campaign_characters").select("campaign_id").eq("character_id", characterId);
    expect(data ?? []).toHaveLength(0);
    expect(await canSee(a)).toBe(false);
    // The player still has their character and can still read its template.
    expect(await canSee(b)).toBe(true);
  });

  it("withdrawn templates still work for existing characters, and stay undeletable", async () => {
    await rpcOk(a, "withdraw_template_from_campaign", { p_campaign: campaignId, p_version: versionId });
    const { data } = await b.client.from("sheet_template_versions").select("id").eq("id", versionId);
    expect(data ?? []).toHaveLength(1);
    const del = await a.client.rpc("delete_template", { p_template: templateId });
    expect(del.error?.message).toContain("template_in_use");
  });
});
