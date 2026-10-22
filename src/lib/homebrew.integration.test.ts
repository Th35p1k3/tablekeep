import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { blankSpell } from "@/lib/spells/schema";
import { STARTER_TEMPLATE } from "@/lib/templates/starter";

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

const SPELL = { ...blankSpell(), level: 1, description: "Test homebrew spell." };

describe.skipIf(!ready)("homebrew approval", () => {
  let a: Session;
  let b: Session;
  let c: Session;
  let campaignId = "";
  let bSpellId = "";
  let bTemplateId = "";
  let aSpellId = "";
  let bCharacterId = "";
  const ids: Record<string, string> = {};

  async function publishedVersion(s: Session, table: string, column: string, parent: string, n: number) {
    const { data } = await s.client.from(table).select("id").eq(column, parent).eq("version_number", n);
    return (data ?? [])[0]?.id as string;
  }

  async function submissions(s: Session) {
    const { data } = await s.client
      .from("homebrew_submissions")
      .select("id, status, review_note, spell_version_id, template_version_id")
      .eq("campaign_id", campaignId)
      .order("created_at");
    return data ?? [];
  }

  beforeAll(async () => {
    a = await signedIn(users.a.email!, users.a.password!);
    b = await signedIn(users.b.email!, users.b.password!);
    c = await signedIn(users.c.email!, users.c.password!);

    campaignId = await rpcOk<string>(a, "create_campaign", { p_name: "[test] homebrew", p_game_system: "", p_description: "" });
    const token = await rpcOk<string>(a, "create_invite", { p_campaign: campaignId, p_days: 1, p_max_uses: 2 });
    await rpcOk(b, "join_campaign", { p_token: token });

    bSpellId = await rpcOk<string>(b, "create_spell", { p_name: "[test] Player spell", p_content: SPELL });
    await rpcOk(b, "publish_spell", { p_spell: bSpellId });
    ids.bSpellV1 = await publishedVersion(b, "spell_versions", "spell_id", bSpellId, 1);

    bTemplateId = await rpcOk<string>(b, "create_template", {
      p_name: "[test] Player sheet",
      p_game_system: "",
      p_description: "",
      p_definition: STARTER_TEMPLATE,
    });
    await rpcOk(b, "publish_template", { p_template: bTemplateId });
    ids.bTemplateV1 = await publishedVersion(b, "sheet_template_versions", "template_id", bTemplateId, 1);

    bCharacterId = await rpcOk<string>(b, "create_character", { p_name: "[test] Player hero", p_template_version: ids.bTemplateV1 });
    await rpcOk(b, "add_character_to_campaign", { p_campaign: campaignId, p_character: bCharacterId });

    aSpellId = await rpcOk<string>(a, "create_spell", { p_name: "[test] DM spell", p_content: SPELL });
    await rpcOk(a, "publish_spell", { p_spell: aSpellId });
    ids.aSpellV1 = await publishedVersion(a, "spell_versions", "spell_id", aSpellId, 1);
  });

  afterAll(async () => {
    if (bCharacterId) await b.client.rpc("delete_character", { p_character: bCharacterId });
    if (campaignId) await a.client.rpc("delete_campaign", { p_campaign: campaignId });
    if (bSpellId) await b.client.rpc("delete_spell", { p_spell: bSpellId });
    if (aSpellId) await a.client.rpc("delete_spell", { p_spell: aSpellId });
    if (bTemplateId) await b.client.rpc("delete_template", { p_template: bTemplateId });
  });

  it("characters in a campaign can't use unapproved spells", async () => {
    const { error } = await b.client.rpc("add_spell_to_character", { p_character: bCharacterId, p_version: ids.bSpellV1 });
    expect(error?.message).toContain("spell_not_allowed");
  });

  it("members submit their own published work, once", async () => {
    await rpcOk(b, "submit_homebrew", { p_campaign: campaignId, p_type: "spell", p_version: ids.bSpellV1, p_note: "Please?" });
    const again = await b.client.rpc("submit_homebrew", { p_campaign: campaignId, p_type: "spell", p_version: ids.bSpellV1 });
    expect(again.error?.message).toContain("already_pending");
    const notMine = await b.client.rpc("submit_homebrew", { p_campaign: campaignId, p_type: "spell", p_version: ids.aSpellV1 });
    expect(notMine.error?.message).toContain("not_your_content");
    const outsider = await c.client.rpc("submit_homebrew", { p_campaign: campaignId, p_type: "spell", p_version: ids.bSpellV1 });
    expect(outsider.error?.message).toContain("not_allowed");
  });

  it("only the submitter and the DM see submissions; the DM can read the spell", async () => {
    expect(await submissions(b)).toHaveLength(1);
    expect(await submissions(a)).toHaveLength(1);
    expect(await submissions(c)).toHaveLength(0);
    const { data } = await a.client.from("spell_versions").select("id").eq("id", ids.bSpellV1);
    expect(data ?? []).toHaveLength(1);
    const { data: hidden } = await c.client.from("spell_versions").select("id").eq("id", ids.bSpellV1);
    expect(hidden ?? []).toHaveLength(0);
  });

  it("players can't review, and a review can't be done twice", async () => {
    const [sub] = await submissions(a);
    const byPlayer = await b.client.rpc("review_submission", { p_submission: sub.id, p_decision: "approved" });
    expect(byPlayer.error?.message).toContain("not_allowed");
    await rpcOk(a, "review_submission", { p_submission: sub.id, p_decision: "changes_requested", p_note: "Make it level 2." });
    const twice = await a.client.rpc("review_submission", { p_submission: sub.id, p_decision: "approved" });
    expect(twice.error?.message).toContain("already_reviewed");
    expect((await submissions(b))[0]).toMatchObject({ status: "changes_requested", review_note: "Make it level 2." });
  });

  it("approving a new version adds exactly that version to the campaign", async () => {
    await rpcOk(b, "start_spell_draft", { p_spell: bSpellId });
    await b.client.from("spell_versions").update({ content: { ...SPELL, level: 2 } }).eq("spell_id", bSpellId).eq("status", "draft");
    await rpcOk(b, "publish_spell", { p_spell: bSpellId });
    ids.bSpellV2 = await publishedVersion(b, "spell_versions", "spell_id", bSpellId, 2);

    const subId = await rpcOk<string>(b, "submit_homebrew", { p_campaign: campaignId, p_type: "spell", p_version: ids.bSpellV2 });
    await rpcOk(a, "review_submission", { p_submission: subId, p_decision: "approved" });
    const { data } = await b.client.from("campaign_spells").select("spell_version_id").eq("campaign_id", campaignId);
    expect(data).toEqual([{ spell_version_id: ids.bSpellV2 }]);

    const resubmit = await b.client.rpc("submit_homebrew", { p_campaign: campaignId, p_type: "spell", p_version: ids.bSpellV2 });
    expect(resubmit.error?.message).toContain("already_approved");
  });

  it("approved versions can go on characters; others still can't", async () => {
    await rpcOk(b, "add_spell_to_character", { p_character: bCharacterId, p_version: ids.bSpellV2 });
    const v1 = await b.client.rpc("add_spell_to_character", { p_character: bCharacterId, p_version: ids.bSpellV1 });
    expect(v1.error?.message).toContain("spell_not_allowed");
  });

  it("turning approval off lets players use their own spells", async () => {
    const byPlayer = await b.client.from("campaigns").update({ spells_need_approval: false }).eq("id", campaignId).select("id");
    expect(byPlayer.data ?? []).toHaveLength(0);
    await a.client.from("campaigns").update({ spells_need_approval: false }).eq("id", campaignId);
    await rpcOk(b, "add_spell_to_character", { p_character: bCharacterId, p_version: ids.bSpellV1 });
    await a.client.from("campaigns").update({ spells_need_approval: true }).eq("id", campaignId);
  });

  it("approving a template offers it in the campaign", async () => {
    const subId = await rpcOk<string>(b, "submit_homebrew", {
      p_campaign: campaignId,
      p_type: "template",
      p_version: ids.bTemplateV1,
    });
    const { data: preview } = await a.client.from("sheet_template_versions").select("id").eq("id", ids.bTemplateV1);
    expect(preview ?? []).toHaveLength(1);
    await rpcOk(a, "review_submission", { p_submission: subId, p_decision: "approved" });
    const { data } = await a.client.from("campaign_templates").select("template_version_id").eq("campaign_id", campaignId);
    expect(data).toContainEqual({ template_version_id: ids.bTemplateV1 });
  });

  it("DMs add their own spells directly; players can't", async () => {
    const byPlayer = await b.client.rpc("add_spell_to_campaign", { p_campaign: campaignId, p_version: ids.bSpellV1 });
    expect(byPlayer.error?.message).toContain("not_allowed");
    await rpcOk(a, "add_spell_to_campaign", { p_campaign: campaignId, p_version: ids.aSpellV1 });
    const { data } = await b.client.from("spells").select("name").eq("id", aSpellId);
    expect(data).toEqual([{ name: "[test] DM spell" }]);
  });

  it("withdrawing only works for your own pending submissions", async () => {
    await rpcOk(a, "remove_spell_from_campaign", { p_campaign: campaignId, p_version: ids.aSpellV1 });
    // B re-submits v1 now that it isn't approved, then withdraws it.
    const subId = await rpcOk<string>(b, "submit_homebrew", { p_campaign: campaignId, p_type: "spell", p_version: ids.bSpellV1 });
    const byDm = await a.client.rpc("withdraw_submission", { p_submission: subId });
    expect(byDm.error?.message).toContain("not_allowed");
    await rpcOk(b, "withdraw_submission", { p_submission: subId });
    expect((await submissions(b)).find((s) => s.id === subId)).toBeUndefined();
  });
});
