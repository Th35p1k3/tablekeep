"use server";

import { revalidatePath } from "next/cache";
import { characterDataSchema } from "@/lib/characters/data";
import { inventoryItemSchema } from "@/lib/inventory/schema";
import { effectSchema, spellContentSchema, validateSpell } from "@/lib/spells/schema";
import { createClient } from "@/lib/supabase/server";
import { templateDefinitionSchema } from "@/lib/templates/schema";
import { validateTemplate } from "@/lib/templates/validate";
import { characterItemSchema, presetItemSchema, spellItemSchema, templateItemSchema, versionsInOrder } from "./schema";
import { sameContent } from "./stable";

type Supabase = Awaited<ReturnType<typeof createClient>>;
export type ImportResult = { ok: true; note?: string } | { ok: false; message: string };

async function signedIn() {
  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  return { supabase, user: data.user };
}

async function rpc<T>(supabase: Supabase, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await supabase.rpc(fn, args);
  if (error) throw new Error(error.message);
  return data as T;
}

/**
 * Re-creates a template or spell from its exported versions: each valid
 * published version is published again in order, then the draft is restored.
 */
async function rebuild(
  supabase: Supabase,
  kind: "template" | "spell",
  create: (firstBody: unknown) => Promise<string>,
  versions: Array<{ status: "draft" | "published"; version_number: number | null; body: unknown }>,
): Promise<{ id: string; skipped: number } | null> {
  const isValidPublished = (body: unknown) => (kind === "template" ? validateTemplate(body).ok : validateSpell(body).ok);
  const isValidDraft = (body: unknown) =>
    kind === "template" ? templateDefinitionSchema.safeParse(body).success : spellContentSchema.safeParse(body).success;
  const table = kind === "template" ? "sheet_template_versions" : "spell_versions";
  const column = kind === "template" ? "definition" : "content";
  const parent = kind === "template" ? "template_id" : "spell_id";
  const publishFn = kind === "template" ? "publish_template" : "publish_spell";
  const draftFn = kind === "template" ? "start_template_draft" : "start_spell_draft";
  const param = kind === "template" ? "p_template" : "p_spell";

  const ordered = versionsInOrder(versions);
  const usable = ordered.filter((v) => (v.status === "published" ? isValidPublished(v.body) : isValidDraft(v.body)));
  const skipped = ordered.length - usable.length;
  if (!usable.length) return null;

  let id = "";
  for (const v of usable) {
    if (!id) {
      id = await create(v.body);
    } else {
      await rpc(supabase, draftFn, { [param]: id });
      const { error } = await supabase.from(table).update({ [column]: v.body }).eq(parent, id).eq("status", "draft");
      if (error) throw new Error(error.message);
    }
    if (v.status === "published") await rpc(supabase, publishFn, { [param]: id });
  }
  return { id, skipped };
}

export async function importTemplate(item: unknown): Promise<ImportResult> {
  const parsed = templateItemSchema.safeParse(item);
  if (!parsed.success) return { ok: false, message: "This template’s details aren’t readable." };
  const { supabase, user } = await signedIn();
  if (!user) return { ok: false, message: "Please log in again." };
  try {
    const t = parsed.data;
    const built = await rebuild(
      supabase,
      "template",
      (body) => rpc<string>(supabase, "create_template", { p_name: t.name, p_game_system: t.game_system, p_description: t.description, p_definition: body }),
      t.versions,
    );
    if (!built) return { ok: false, message: "None of this template’s versions passed the checks." };
    revalidatePath("/templates");
    return { ok: true, note: built.skipped ? `${built.skipped} version(s) skipped because they didn’t pass the checks.` : undefined };
  } catch (e) {
    console.error(`[import] template failed: ${e instanceof Error ? e.message : e}`);
    return { ok: false, message: "This template couldn’t be imported." };
  }
}

export async function importSpell(item: unknown): Promise<ImportResult> {
  const parsed = spellItemSchema.safeParse(item);
  if (!parsed.success) return { ok: false, message: "This spell’s details aren’t readable." };
  const { supabase, user } = await signedIn();
  if (!user) return { ok: false, message: "Please log in again." };
  try {
    const s = parsed.data;
    const built = await rebuild(
      supabase,
      "spell",
      (body) => rpc<string>(supabase, "create_spell", { p_name: s.name, p_content: body }),
      s.versions,
    );
    if (!built) return { ok: false, message: "None of this spell’s versions passed the checks." };
    revalidatePath("/spells");
    return { ok: true, note: built.skipped ? `${built.skipped} version(s) skipped because they didn’t pass the checks.` : undefined };
  } catch (e) {
    console.error(`[import] spell failed: ${e instanceof Error ? e.message : e}`);
    return { ok: false, message: "This spell couldn’t be imported." };
  }
}

export async function importPreset(item: unknown): Promise<ImportResult> {
  const parsed = presetItemSchema.safeParse(item);
  const effect = effectSchema.safeParse(parsed.success ? parsed.data.effect : null);
  if (!parsed.success || !effect.success) return { ok: false, message: "This preset isn’t readable." };
  const { supabase, user } = await signedIn();
  if (!user) return { ok: false, message: "Please log in again." };
  const { error } = await supabase.from("effect_presets").insert({ name: parsed.data.name, effect: effect.data });
  return error ? { ok: false, message: "This preset couldn’t be imported." } : { ok: true };
}

/** Finds one of my published versions with the same name and identical content. */
async function findMatchingVersion(
  supabase: Supabase,
  kind: "template" | "spell",
  userId: string,
  name: string,
  body: unknown,
): Promise<string | null> {
  const query =
    kind === "template"
      ? supabase.from("sheet_templates").select("sheet_template_versions ( id, status, definition )").eq("owner_id", userId).eq("name", name)
      : supabase.from("spells").select("spell_versions ( id, status, content )").eq("owner_id", userId).eq("name", name);
  const { data } = await query;
  for (const row of (data ?? []) as Array<Record<string, Array<{ id: string; status: string; definition?: unknown; content?: unknown }> | null>>) {
    for (const v of Object.values(row)[0] ?? []) {
      if (v.status === "published" && sameContent(v.definition ?? v.content, body)) return v.id;
    }
  }
  return null;
}

async function publishedVersionId(supabase: Supabase, kind: "template" | "spell", id: string): Promise<string> {
  const { data } = await supabase
    .from(kind === "template" ? "sheet_template_versions" : "spell_versions")
    .select("id, version_number")
    .eq(kind === "template" ? "template_id" : "spell_id", id)
    .eq("status", "published")
    .order("version_number", { ascending: false })
    .limit(1);
  const found = (data ?? [])[0] as { id: string } | undefined;
  if (!found) throw new Error("no published version");
  return found.id;
}

/**
 * Re-creates a character with its sheet values, inventory and spells. Its
 * template and spells are added to your account too (reused if you already
 * have identical ones). Restore points aren't imported.
 */
export async function importCharacter(item: unknown): Promise<ImportResult> {
  const parsed = characterItemSchema.safeParse(item);
  if (!parsed.success) return { ok: false, message: "This character’s details aren’t readable." };
  const c = parsed.data;
  if (!validateTemplate(c.template.definition).ok) {
    return { ok: false, message: "This character’s sheet template didn’t pass the checks." };
  }
  const data = characterDataSchema.safeParse(c.data);
  if (!data.success) return { ok: false, message: "This character’s sheet values aren’t valid." };

  const { supabase, user } = await signedIn();
  if (!user) return { ok: false, message: "Please log in again." };
  const notes: string[] = [];

  try {
    const templateName = `${c.template.name} (imported)`.slice(0, 80);
    let versionId = await findMatchingVersion(supabase, "template", user.id, templateName, c.template.definition);
    if (!versionId) {
      const templateId = await rpc<string>(supabase, "create_template", {
        p_name: templateName,
        p_game_system: "",
        p_description: "Created when importing a character.",
        p_definition: c.template.definition,
      });
      await rpc(supabase, "publish_template", { p_template: templateId });
      versionId = await publishedVersionId(supabase, "template", templateId);
    }

    const characterId = await rpc<string>(supabase, "create_character", { p_name: c.name, p_template_version: versionId });
    const { error: dataError } = await supabase.from("characters").update({ data: data.data }).eq("id", characterId);
    if (dataError) throw new Error(dataError.message);

    const items = c.inventory
      .map((i) =>
        inventoryItemSchema.safeParse({
          name: i.name,
          quantity: String(i.quantity),
          weight: i.weight === null ? "" : String(i.weight),
          notes: i.notes,
        }),
      )
      .filter((r) => r.success)
      .map((r) => ({ character_id: characterId, ...r.data! }));
    if (items.length) {
      const { error } = await supabase.from("inventory_items").insert(items);
      if (error) notes.push("Some inventory couldn’t be imported.");
    }

    let skippedSpells = 0;
    for (const s of c.spells) {
      if (!validateSpell(s.content).ok) {
        skippedSpells++;
        continue;
      }
      let spellVersion = await findMatchingVersion(supabase, "spell", user.id, s.name, s.content);
      if (!spellVersion) {
        const spellId = await rpc<string>(supabase, "create_spell", { p_name: s.name, p_content: s.content });
        await rpc(supabase, "publish_spell", { p_spell: spellId });
        spellVersion = await publishedVersionId(supabase, "spell", spellId);
      }
      await rpc(supabase, "add_spell_to_character", { p_character: characterId, p_version: spellVersion });
      await supabase
        .from("character_spells")
        .update({ known: s.known, prepared: s.prepared })
        .eq("character_id", characterId)
        .eq("spell_version_id", spellVersion);
    }
    if (skippedSpells) notes.push(`${skippedSpells} spell(s) skipped because they didn’t pass the checks.`);

    revalidatePath("/characters");
    return { ok: true, note: notes.join(" ") || undefined };
  } catch (e) {
    console.error(`[import] character failed: ${e instanceof Error ? e.message : e}`);
    return { ok: false, message: "This character couldn’t be imported." };
  }
}
