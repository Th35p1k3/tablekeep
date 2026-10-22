"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { uuidSchema } from "@/lib/campaigns/validation";
import { type FormState, textField } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { GENERIC_SPELL_ERROR, friendlySpellError } from "./errors";
import { type EffectPreset, type CharacterSpell, loadCharacterSpells, loadEffectPresets } from "./queries";
import { type SpellIssue, blankSpell, effectSchema, spellContentSchema, validateSpell } from "./schema";

const nameSchema = z.string().trim().min(1, "Give the spell a name.").max(80, "Keep the name to 80 characters or fewer.");
const BAD_REQUEST: FormState = { status: "error", message: "That request wasn’t valid." };

function failure(where: string, error: { message?: string } | null): FormState {
  const message = friendlySpellError(error);
  if (message === GENERIC_SPELL_ERROR) console.error(`[spell] ${where} failed: ${error?.message ?? "unknown"}`);
  return { status: "error", message };
}

function spellIdFrom(formData: FormData): string | null {
  const parsed = uuidSchema.safeParse(textField(formData, "spellId"));
  return parsed.success ? parsed.data : null;
}

function refresh(spellId?: string) {
  revalidatePath("/spells");
  if (spellId) revalidatePath(`/spells/${spellId}`);
}

export async function createSpell(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = { name: textField(formData, "name") };
  const name = nameSchema.safeParse(values.name);
  if (!name.success) return { status: "error", fieldErrors: { name: name.error.issues[0]?.message ?? "" }, values };
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_spell", { p_name: name.data, p_content: blankSpell() });
  if (error || typeof data !== "string") return { ...failure("create", error), values };
  refresh();
  redirect(`/spells/${data}`);
}

export async function renameSpell(_prev: FormState, formData: FormData): Promise<FormState> {
  const spellId = spellIdFrom(formData);
  if (!spellId) return BAD_REQUEST;
  const values = { name: textField(formData, "name") };
  const name = nameSchema.safeParse(values.name);
  if (!name.success) return { status: "error", fieldErrors: { name: name.error.issues[0]?.message ?? "" }, values };
  const supabase = await createClient();
  const { data, error } = await supabase.from("spells").update({ name: name.data }).eq("id", spellId).select("id");
  if (error) return { ...failure("rename", error), values };
  if (!data?.length) return { status: "error", message: "You don’t have permission to do that.", values };
  refresh(spellId);
  return { status: "success", message: "Name saved.", values: { name: name.data } };
}

export type SpellSaveResult = { ok: true; version?: number } | { ok: false; message: string; issues?: SpellIssue[] };

async function writeDraft(spellId: string, content: unknown): Promise<SpellSaveResult> {
  const shape = spellContentSchema.safeParse(content);
  if (!shape.success) {
    return {
      ok: false,
      message: "Fix the problems listed before saving.",
      issues: shape.error.issues.map((i) => ({ path: i.path.map(String).join("."), message: i.message })),
    };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("spell_versions")
    .update({ content: shape.data })
    .eq("spell_id", spellId)
    .eq("status", "draft")
    .select("id");
  if (error) return { ok: false, message: friendlySpellError(error) };
  if (!data?.length) return { ok: false, message: "There’s no draft to save. Reload the page and try again." };
  return { ok: true };
}

export async function saveSpellDraft(spellId: string, content: unknown): Promise<SpellSaveResult> {
  if (!uuidSchema.safeParse(spellId).success) return { ok: false, message: "That request wasn’t valid." };
  const result = await writeDraft(spellId, content);
  if (result.ok) refresh(spellId);
  return result;
}

export async function publishSpellDraft(spellId: string, content: unknown): Promise<SpellSaveResult> {
  if (!uuidSchema.safeParse(spellId).success) return { ok: false, message: "That request wasn’t valid." };
  const check = validateSpell(content);
  if (!check.ok) return { ok: false, message: "Fix the problems listed before publishing.", issues: check.issues };
  const saved = await writeDraft(spellId, check.spell);
  if (!saved.ok) return saved;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("publish_spell", { p_spell: spellId });
  if (error || typeof data !== "number") return { ok: false, message: failure("publish", error).message ?? GENERIC_SPELL_ERROR };
  refresh(spellId);
  return { ok: true, version: data };
}

async function simpleRpc(formData: FormData, fn: string, where: string, after: (spellId: string, data: unknown) => never | FormState) {
  const spellId = spellIdFrom(formData);
  if (!spellId) return BAD_REQUEST;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc(fn, { p_spell: spellId });
  if (error) return failure(where, error);
  return after(spellId, data);
}

export async function startSpellDraft(_prev: FormState, formData: FormData): Promise<FormState> {
  return simpleRpc(formData, "start_spell_draft", "start draft", (spellId) => {
    refresh(spellId);
    redirect(`/spells/${spellId}`);
  });
}

export async function discardSpellDraft(_prev: FormState, formData: FormData): Promise<FormState> {
  return simpleRpc(formData, "discard_spell_draft", "discard draft", (spellId) => {
    refresh(spellId);
    redirect(`/spells/${spellId}`);
  });
}

export async function duplicateSpell(_prev: FormState, formData: FormData): Promise<FormState> {
  return simpleRpc(formData, "duplicate_spell", "duplicate", (_spellId, data) => {
    refresh();
    redirect(`/spells/${String(data)}`);
  });
}

export async function deleteSpell(_prev: FormState, formData: FormData): Promise<FormState> {
  return simpleRpc(formData, "delete_spell", "delete", () => {
    refresh();
    redirect("/spells");
  });
}

export type PresetResult = { ok: true; presets: EffectPreset[] } | { ok: false; message: string };

export async function saveEffectPreset(name: string, effect: unknown): Promise<PresetResult> {
  const presetName = z.string().trim().min(1).max(60).safeParse(name);
  const parsed = effectSchema.safeParse(effect);
  if (!presetName.success) return { ok: false, message: "Give the preset a name (up to 60 characters)." };
  if (!parsed.success) return { ok: false, message: "That effect isn’t complete yet." };
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, message: "Please log in again." };
  const { error } = await supabase.from("effect_presets").insert({ name: presetName.data, effect: parsed.data });
  if (error) {
    console.error(`[spell] save preset failed: ${error.message}`);
    return { ok: false, message: GENERIC_SPELL_ERROR };
  }
  return { ok: true, presets: await loadEffectPresets(supabase, auth.user.id) };
}

export async function deleteEffectPreset(presetId: string): Promise<PresetResult> {
  if (!uuidSchema.safeParse(presetId).success) return { ok: false, message: "That request wasn’t valid." };
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, message: "Please log in again." };
  await supabase.from("effect_presets").delete().eq("id", presetId);
  return { ok: true, presets: await loadEffectPresets(supabase, auth.user.id) };
}

export type CharacterSpellResult = { ok: true; spells: CharacterSpell[] } | { ok: false; message: string };

export async function addSpellToCharacter(characterId: string, versionId: string): Promise<CharacterSpellResult> {
  if (!uuidSchema.safeParse(characterId).success || !uuidSchema.safeParse(versionId).success) {
    return { ok: false, message: "Choose a spell to add." };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_spell_to_character", { p_character: characterId, p_version: versionId });
  if (error) return { ok: false, message: failure("add to character", error).message ?? GENERIC_SPELL_ERROR };
  return { ok: true, spells: await loadCharacterSpells(supabase, characterId) };
}

export async function markCharacterSpell(
  characterId: string,
  versionId: string,
  changes: { known?: boolean; prepared?: boolean },
): Promise<CharacterSpellResult> {
  if (!uuidSchema.safeParse(characterId).success || !uuidSchema.safeParse(versionId).success) {
    return { ok: false, message: "That request wasn’t valid." };
  }
  const update: { known?: boolean; prepared?: boolean } = {};
  if (typeof changes.known === "boolean") update.known = changes.known;
  if (typeof changes.prepared === "boolean") update.prepared = changes.prepared;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("character_spells")
    .update(update)
    .eq("character_id", characterId)
    .eq("spell_version_id", versionId)
    .select("character_id");
  if (error || !data?.length) return { ok: false, message: "Only the character’s owner can change its spells." };
  return { ok: true, spells: await loadCharacterSpells(supabase, characterId) };
}

export async function removeCharacterSpell(characterId: string, versionId: string): Promise<CharacterSpellResult> {
  if (!uuidSchema.safeParse(characterId).success || !uuidSchema.safeParse(versionId).success) {
    return { ok: false, message: "That request wasn’t valid." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("character_spells")
    .delete()
    .eq("character_id", characterId)
    .eq("spell_version_id", versionId)
    .select("character_id");
  if (error || !data?.length) return { ok: false, message: "Only the character’s owner can change its spells." };
  return { ok: true, spells: await loadCharacterSpells(supabase, characterId) };
}
