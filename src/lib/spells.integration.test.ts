import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { blankSpell } from "@/lib/spells/schema";
import { STARTER_TEMPLATE } from "@/lib/templates/starter";

// A owns spells and a character; C is a stranger. Skipped if settings are missing.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const creds = (letter: "A" | "C") => ({
  email: process.env[`TEST_USER_${letter}_EMAIL`],
  password: process.env[`TEST_USER_${letter}_PASSWORD`],
});
const users = { a: creds("A"), c: creds("C") };
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

const FIREBALL = {
  ...blankSpell(),
  level: 3,
  description: "A burst of flame. (Test content.)",
  effects: [{ id: "e1", type: "damage", dice: "8d6", damageType: "fire" }],
};

describe.skipIf(!ready)("spells", () => {
  let a: Session;
  let c: Session;
  let spellId = "";
  let templateId = "";
  let characterId = "";

  const versions = async (s: Session) => {
    const { data } = await s.client
      .from("spell_versions")
      .select("id, status, version_number, content")
      .eq("spell_id", spellId)
      .order("created_at");
    return data ?? [];
  };

  beforeAll(async () => {
    a = await signedIn(users.a.email!, users.a.password!);
    c = await signedIn(users.c.email!, users.c.password!);
    spellId = await rpcOk<string>(a, "create_spell", { p_name: "[test] Fire burst", p_content: FIREBALL });
    templateId = await rpcOk<string>(a, "create_template", {
      p_name: "[test] spell sheet",
      p_game_system: "",
      p_description: "",
      p_definition: STARTER_TEMPLATE,
    });
    await rpcOk(a, "publish_template", { p_template: templateId });
    const { data: tv } = await a.client
      .from("sheet_template_versions")
      .select("id")
      .eq("template_id", templateId)
      .eq("status", "published");
    characterId = await rpcOk<string>(a, "create_character", {
      p_name: "[test] Caster",
      p_template_version: (tv ?? [])[0]?.id,
    });
  });

  afterAll(async () => {
    if (characterId) await a.client.rpc("delete_character", { p_character: characterId });
    if (spellId) await a.client.rpc("delete_spell", { p_spell: spellId });
    if (templateId) await a.client.rpc("delete_template", { p_template: templateId });
    await a.client.from("effect_presets").delete().like("name", "[test]%");
  });

  it("a draft spell can't go on a character", async () => {
    const draftId = (await versions(a))[0].id;
    const { error } = await a.client.rpc("add_spell_to_character", { p_character: characterId, p_version: draftId });
    expect(error?.message).toContain("not_published");
  });

  it("publishing freezes the spell as version 1", async () => {
    expect(await rpcOk<number>(a, "publish_spell", { p_spell: spellId })).toBe(1);
    const v = (await versions(a))[0];
    const { data } = await a.client
      .from("spell_versions")
      .update({ content: { ...FIREBALL, description: "Changed" } })
      .eq("id", v.id)
      .select("id");
    expect(data ?? []).toHaveLength(0);
  });

  it("strangers can't see or manage someone's spells", async () => {
    const { data: s } = await c.client.from("spells").select("id").eq("id", spellId);
    expect(s ?? []).toHaveLength(0);
    expect(await versions(c)).toHaveLength(0);
    for (const fn of ["publish_spell", "start_spell_draft", "duplicate_spell", "delete_spell"]) {
      const { error } = await c.client.rpc(fn, { p_spell: spellId });
      expect(error?.message).toContain("not_allowed");
    }
  });

  it("new drafts copy the latest version and publish as version 2", async () => {
    await rpcOk(a, "start_spell_draft", { p_spell: spellId });
    expect(await rpcOk<number>(a, "publish_spell", { p_spell: spellId })).toBe(2);
    expect((await versions(a)).map((v) => v.version_number)).toEqual([1, 2]);
  });

  it("owners add published spells to their characters and mark them prepared", async () => {
    const v1 = (await versions(a)).find((v) => v.version_number === 1)!;
    await rpcOk(a, "add_spell_to_character", { p_character: characterId, p_version: v1.id });
    const { data, error } = await a.client
      .from("character_spells")
      .update({ prepared: true })
      .eq("character_id", characterId)
      .eq("spell_version_id", v1.id)
      .select("known, prepared");
    expect(error).toBeNull();
    expect(data).toEqual([{ known: true, prepared: true }]);
  });

  it("strangers can't see or change a character's spells", async () => {
    const v1 = (await versions(a)).find((v) => v.version_number === 1)!;
    const { data: seen } = await c.client.from("character_spells").select("spell_version_id").eq("character_id", characterId);
    expect(seen ?? []).toHaveLength(0);
    const add = await c.client.rpc("add_spell_to_character", { p_character: characterId, p_version: v1.id });
    expect(add.error?.message).toContain("not_allowed");
    const del = await c.client
      .from("character_spells")
      .delete()
      .eq("character_id", characterId)
      .select("character_id");
    expect(del.data ?? []).toHaveLength(0);
  });

  it("a spell on a character can't be deleted", async () => {
    const { error } = await a.client.rpc("delete_spell", { p_spell: spellId });
    expect(error?.message).toContain("spell_in_use");
  });

  it("effect presets are private", async () => {
    const insert = await a.client
      .from("effect_presets")
      .insert({ name: "[test] preset", effect: { id: "e9", type: "healing", dice: "1d8" } });
    expect(insert.error).toBeNull();
    const { data } = await c.client.from("effect_presets").select("id").like("name", "[test]%");
    expect(data ?? []).toHaveLength(0);
  });
});
