import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { STARTER_TEMPLATE } from "@/lib/templates/starter";

// A owns templates and characters; C is a stranger. Skipped if settings are missing.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const creds = (letter: "A" | "C") => ({
  email: process.env[`TEST_USER_${letter}_EMAIL`],
  password: process.env[`TEST_USER_${letter}_PASSWORD`],
});
const users = { a: creds("A"), c: creds("C") };
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

describe.skipIf(!ready)("characters and restore points", () => {
  let a: Session;
  let c: Session;
  let templateId = "";
  let draftOnlyTemplateId = "";
  let publishedVersionId = "";
  let draftVersionId = "";
  let characterId = "";
  let copyId = "";

  async function rpcOk<T>(client: Session["client"], fn: string, args: Record<string, unknown>): Promise<T> {
    const { data, error } = await client.rpc(fn, args);
    if (error) throw new Error(`${fn}: ${error.message}`);
    return data as T;
  }

  async function character(client: Session["client"], id: string) {
    const { data } = await client.from("characters").select("id, data, updated_at").eq("id", id).maybeSingle();
    return data as { id: string; data: Record<string, unknown>; updated_at: string } | null;
  }

  beforeAll(async () => {
    a = await signedIn(users.a.email!, users.a.password!);
    c = await signedIn(users.c.email!, users.c.password!);

    templateId = await rpcOk<string>(a.client, "create_template", {
      p_name: "[test] character template",
      p_game_system: "",
      p_description: "Created by the automated tests. Safe to delete.",
      p_definition: STARTER_TEMPLATE,
    });
    await rpcOk(a.client, "publish_template", { p_template: templateId });
    const { data: versions } = await a.client
      .from("sheet_template_versions")
      .select("id")
      .eq("template_id", templateId)
      .eq("status", "published");
    publishedVersionId = (versions ?? [])[0]?.id;

    draftOnlyTemplateId = await rpcOk<string>(a.client, "create_template", {
      p_name: "[test] draft-only template",
      p_game_system: "",
      p_description: "",
      p_definition: STARTER_TEMPLATE,
    });
    const { data: drafts } = await a.client
      .from("sheet_template_versions")
      .select("id")
      .eq("template_id", draftOnlyTemplateId);
    draftVersionId = (drafts ?? [])[0]?.id;
  });

  afterAll(async () => {
    for (const id of [characterId, copyId]) {
      if (id) await a.client.rpc("delete_character", { p_character: id });
    }
    for (const id of [templateId, draftOnlyTemplateId]) {
      if (id) await a.client.rpc("delete_template", { p_template: id });
    }
  });

  it("the owner creates a character from a published version", async () => {
    characterId = await rpcOk<string>(a.client, "create_character", {
      p_name: "[test] Mira",
      p_template_version: publishedVersionId,
    });
    const row = await character(a.client, characterId);
    expect(row?.data).toEqual({});
  });

  it("characters can't use unpublished drafts", async () => {
    const { error } = await a.client.rpc("create_character", {
      p_name: "[test] Draft",
      p_template_version: draftVersionId,
    });
    expect(error?.message).toContain("not_published");
  });

  it("strangers can't build from someone else's template", async () => {
    const { error } = await c.client.rpc("create_character", {
      p_name: "[test] Thief",
      p_template_version: publishedVersionId,
    });
    expect(error?.message).toContain("not_allowed");
  });

  it("strangers can't see, edit, copy or delete a character", async () => {
    expect(await character(c.client, characterId)).toBeNull();
    const { data } = await c.client
      .from("characters")
      .update({ data: { strength: 1 } })
      .eq("id", characterId)
      .select("id");
    expect(data ?? []).toHaveLength(0);
    for (const fn of ["duplicate_character", "delete_character", "create_character_snapshot"]) {
      const { error } = await c.client.rpc(fn, { p_character: characterId });
      expect(error?.message).toContain("not_allowed");
    }
  });

  it("autosave only writes when nothing changed in between", async () => {
    const before = await character(a.client, characterId);
    const first = await a.client
      .from("characters")
      .update({ data: { strength: "16" } })
      .eq("id", characterId)
      .eq("updated_at", before!.updated_at)
      .select("updated_at");
    expect(first.data ?? []).toHaveLength(1);
    expect(first.data![0].updated_at).not.toBe(before!.updated_at);

    // A second device still holding the old timestamp must not overwrite.
    const stale = await a.client
      .from("characters")
      .update({ data: { strength: "3" } })
      .eq("id", characterId)
      .eq("updated_at", before!.updated_at)
      .select("updated_at");
    expect(stale.data ?? []).toHaveLength(0);
    expect((await character(a.client, characterId))?.data).toEqual({ strength: "16" });
  });

  it("restore points save and bring back a character", async () => {
    await rpcOk(a.client, "create_character_snapshot", { p_character: characterId, p_label: "Level 1" });
    await a.client.from("characters").update({ data: { strength: "20" } }).eq("id", characterId);

    const { data: points } = await a.client
      .from("character_snapshots")
      .select("id, label, reason, data")
      .eq("character_id", characterId)
      .order("created_at", { ascending: false });
    const level1 = (points ?? []).find((p) => p.label === "Level 1");
    expect(level1?.data).toEqual({ strength: "16" });

    await rpcOk(a.client, "restore_character_snapshot", { p_snapshot: level1!.id });
    expect((await character(a.client, characterId))?.data).toEqual({ strength: "16" });

    const { data: after } = await a.client
      .from("character_snapshots")
      .select("reason, data")
      .eq("character_id", characterId);
    expect(after).toContainEqual({ reason: "before_restore", data: { strength: "20" } });
  });

  it("strangers can't see or use restore points", async () => {
    const { data: points } = await a.client
      .from("character_snapshots")
      .select("id")
      .eq("character_id", characterId)
      .limit(1);
    const pointId = (points ?? [])[0]?.id;

    const { data: seen } = await c.client.from("character_snapshots").select("id").eq("character_id", characterId);
    expect(seen ?? []).toHaveLength(0);
    for (const fn of ["restore_character_snapshot", "delete_character_snapshot"]) {
      const { error } = await c.client.rpc(fn, { p_snapshot: pointId });
      expect(error?.message).toContain("not_allowed");
    }
  });

  it("a template in use can't be deleted", async () => {
    const { error } = await a.client.rpc("delete_template", { p_template: templateId });
    expect(error?.message).toContain("template_in_use");
  });

  it("copies keep the values; deleting removes restore points too", async () => {
    copyId = await rpcOk<string>(a.client, "duplicate_character", { p_character: characterId });
    expect((await character(a.client, copyId))?.data).toEqual({ strength: "16" });

    await rpcOk(a.client, "create_character_snapshot", { p_character: copyId, p_label: "" });
    await rpcOk(a.client, "delete_character", { p_character: copyId });
    const { data } = await a.client.from("character_snapshots").select("id").eq("character_id", copyId);
    expect(data ?? []).toHaveLength(0);
    copyId = "";
  });
});
