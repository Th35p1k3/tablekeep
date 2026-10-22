import type { createClient } from "@/lib/supabase/server";
import { type SpellEffect, effectSchema } from "./schema";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type SpellSummary = {
  id: string;
  name: string;
  latestVersion: number | null;
  hasDraft: boolean;
  level: number | null;
};

export type SpellVersionRow = {
  id: string;
  status: "draft" | "published";
  version_number: number | null;
  content: unknown;
  published_at: string | null;
};

export type SpellDetail = {
  id: string;
  name: string;
  draft: SpellVersionRow | null;
  published: SpellVersionRow[];
};

export type EffectPreset = { id: string; name: string; effect: SpellEffect };

export type CharacterSpell = {
  versionId: string;
  name: string;
  versionNumber: number | null;
  content: unknown;
  known: boolean;
  prepared: boolean;
};

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

function levelOf(content: unknown): number | null {
  const level = (content as { level?: unknown } | null)?.level;
  return typeof level === "number" ? level : null;
}

export async function loadMySpells(supabase: Supabase, userId: string): Promise<SpellSummary[]> {
  const { data } = await supabase
    .from("spells")
    .select("id, name, spell_versions ( status, version_number, content )")
    .eq("owner_id", userId)
    .order("name");
  return ((data ?? []) as Array<{
    id: string;
    name: string;
    spell_versions: Array<{ status: string; version_number: number | null; content: unknown }> | null;
  }>).map((s) => {
    const versions = s.spell_versions ?? [];
    const published = versions
      .filter((v) => v.status === "published")
      .sort((a, b) => (b.version_number ?? 0) - (a.version_number ?? 0));
    const newest = versions.find((v) => v.status === "draft") ?? published[0];
    return {
      id: s.id,
      name: s.name,
      latestVersion: published[0]?.version_number ?? null,
      hasDraft: versions.some((v) => v.status === "draft"),
      level: levelOf(newest?.content),
    };
  });
}

export async function loadSpell(supabase: Supabase, spellId: string): Promise<SpellDetail | null> {
  const { data: spell } = await supabase.from("spells").select("id, name").eq("id", spellId).maybeSingle();
  if (!spell) return null;
  const { data } = await supabase
    .from("spell_versions")
    .select("id, status, version_number, content, published_at")
    .eq("spell_id", spellId);
  const versions = (data ?? []) as SpellVersionRow[];
  return {
    ...(spell as { id: string; name: string }),
    draft: versions.find((v) => v.status === "draft") ?? null,
    published: versions
      .filter((v) => v.status === "published")
      .sort((a, b) => (b.version_number ?? 0) - (a.version_number ?? 0)),
  };
}

export async function loadEffectPresets(supabase: Supabase, userId: string): Promise<EffectPreset[]> {
  const { data } = await supabase
    .from("effect_presets")
    .select("id, name, effect")
    .eq("owner_id", userId)
    .order("name");
  const presets: EffectPreset[] = [];
  for (const row of (data ?? []) as Array<{ id: string; name: string; effect: unknown }>) {
    const parsed = effectSchema.safeParse(row.effect);
    if (parsed.success) presets.push({ id: row.id, name: row.name, effect: parsed.data });
  }
  return presets;
}

export async function loadCharacterSpells(supabase: Supabase, characterId: string): Promise<CharacterSpell[]> {
  const { data } = await supabase
    .from("character_spells")
    .select("spell_version_id, known, prepared, spell_versions ( version_number, content, spells ( name ) )")
    .eq("character_id", characterId);
  return ((data ?? []) as unknown as Array<{
    spell_version_id: string;
    known: boolean;
    prepared: boolean;
    spell_versions:
      | { version_number: number | null; content: unknown; spells: { name: string } | Array<{ name: string }> | null }
      | Array<{ version_number: number | null; content: unknown; spells: { name: string } | Array<{ name: string }> | null }>
      | null;
  }>)
    .map((row) => {
      const v = one(row.spell_versions);
      return {
        versionId: row.spell_version_id,
        name: one(v?.spells)?.name ?? "Unknown spell",
        versionNumber: v?.version_number ?? null,
        content: v?.content ?? null,
        known: row.known,
        prepared: row.prepared,
      };
    })
    .sort((a, b) => (levelOf(a.content) ?? 0) - (levelOf(b.content) ?? 0) || a.name.localeCompare(b.name));
}

/** The latest published version of each of my spells (for adding to characters). */
export async function loadMyLatestSpellVersions(
  supabase: Supabase,
  userId: string,
): Promise<Array<{ versionId: string; label: string }>> {
  const { data } = await supabase
    .from("spells")
    .select("name, spell_versions ( id, status, version_number )")
    .eq("owner_id", userId)
    .order("name");
  const result: Array<{ versionId: string; label: string }> = [];
  for (const s of (data ?? []) as Array<{
    name: string;
    spell_versions: Array<{ id: string; status: string; version_number: number | null }> | null;
  }>) {
    const latest = (s.spell_versions ?? [])
      .filter((v) => v.status === "published")
      .sort((a, b) => (b.version_number ?? 0) - (a.version_number ?? 0))[0];
    if (latest) result.push({ versionId: latest.id, label: `${s.name} (version ${latest.version_number})` });
  }
  return result;
}
