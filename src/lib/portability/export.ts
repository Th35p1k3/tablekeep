import type { createClient } from "@/lib/supabase/server";
import { EXPORT_FORMAT, EXPORT_VERSION } from "./schema";

type Supabase = Awaited<ReturnType<typeof createClient>>;

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

/**
 * Everything this person made, in one file: profile, templates, spells,
 * presets, characters (with inventory, spells and restore points), and the
 * chat messages and session logs they wrote. Other people's data is never
 * included. Characters carry a copy of their sheet template so they can be
 * imported into any account.
 */
export async function buildExport(supabase: Supabase, userId: string, email: string | undefined) {
  const [profile, templates, spells, presets, characters, memberships, messages, logs] = await Promise.all([
    supabase.from("profiles").select("display_name, created_at").eq("id", userId).maybeSingle(),
    supabase
      .from("sheet_templates")
      .select("name, game_system, description, sheet_template_versions ( status, version_number, definition )")
      .eq("owner_id", userId),
    supabase.from("spells").select("name, spell_versions ( status, version_number, content )").eq("owner_id", userId),
    supabase.from("effect_presets").select("name, effect").eq("owner_id", userId),
    supabase
      .from("characters")
      .select(
        "id, name, data, created_at, sheet_template_versions ( version_number, definition, sheet_templates ( name ) ), inventory_items ( name, quantity, weight, notes ), character_spells ( known, prepared, spell_versions ( content, spells ( name ) ) ), character_snapshots ( label, reason, data, created_at )",
      )
      .eq("owner_id", userId),
    supabase.from("campaign_members").select("role, joined_at, campaigns ( name )").eq("user_id", userId),
    supabase.from("messages").select("body, recipients, created_at, campaigns ( name )").eq("author_id", userId).limit(5000),
    supabase.from("session_logs").select("title, body, session_number, played_on, visibility, campaigns ( name )").eq("author_id", userId),
  ]);

  type Version = { status: "draft" | "published"; version_number: number | null };

  return {
    format: EXPORT_FORMAT,
    version: EXPORT_VERSION,
    exportedAt: new Date().toISOString(),
    profile: { email: email ?? null, ...(profile.data ?? {}) },
    templates: ((templates.data ?? []) as Array<{
      name: string;
      game_system: string;
      description: string;
      sheet_template_versions: Array<Version & { definition: unknown }> | null;
    }>).map((t) => ({
      name: t.name,
      game_system: t.game_system,
      description: t.description,
      versions: (t.sheet_template_versions ?? []).map((v) => ({
        status: v.status,
        version_number: v.version_number,
        body: v.definition,
      })),
    })),
    spells: ((spells.data ?? []) as Array<{ name: string; spell_versions: Array<Version & { content: unknown }> | null }>).map((s) => ({
      name: s.name,
      versions: (s.spell_versions ?? []).map((v) => ({ status: v.status, version_number: v.version_number, body: v.content })),
    })),
    effectPresets: presets.data ?? [],
    characters: ((characters.data ?? []) as unknown as Array<{
      name: string;
      data: Record<string, unknown>;
      created_at: string;
      sheet_template_versions:
        | { version_number: number | null; definition: unknown; sheet_templates: { name: string } | Array<{ name: string }> | null }
        | null;
      inventory_items: Array<{ name: string; quantity: number; weight: number | string | null; notes: string }> | null;
      character_spells: Array<{
        known: boolean;
        prepared: boolean;
        spell_versions: { content: unknown; spells: { name: string } | Array<{ name: string }> | null } | null;
      }> | null;
      character_snapshots: Array<{ label: string; reason: string; data: unknown; created_at: string }> | null;
    }>).map((c) => {
      const version = one(c.sheet_template_versions);
      return {
        name: c.name,
        created_at: c.created_at,
        template: {
          name: one(version?.sheet_templates ?? null)?.name ?? "Imported sheet",
          version_number: version?.version_number ?? null,
          definition: version?.definition ?? null,
        },
        data: c.data ?? {},
        inventory: (c.inventory_items ?? []).map((i) => ({
          name: i.name,
          quantity: i.quantity,
          weight: i.weight === null ? null : Number(i.weight),
          notes: i.notes,
        })),
        spells: (c.character_spells ?? [])
          .filter((s) => s.spell_versions)
          .map((s) => ({
            name: one(s.spell_versions?.spells ?? null)?.name ?? "Imported spell",
            content: s.spell_versions?.content ?? null,
            known: s.known,
            prepared: s.prepared,
          })),
        restorePoints: c.character_snapshots ?? [],
      };
    }),
    campaigns: ((memberships.data ?? []) as unknown as Array<{
      role: string;
      joined_at: string;
      campaigns: { name: string } | Array<{ name: string }> | null;
    }>).map((m) => ({ name: one(m.campaigns)?.name ?? "", role: m.role, joined_at: m.joined_at })),
    messagesYouWrote: ((messages.data ?? []) as unknown as Array<{
      body: string;
      recipients: string[] | null;
      created_at: string;
      campaigns: { name: string } | Array<{ name: string }> | null;
    }>).map((m) => ({ campaign: one(m.campaigns)?.name ?? "", body: m.body, whisper: Boolean(m.recipients?.length), created_at: m.created_at })),
    sessionLogsYouWrote: ((logs.data ?? []) as unknown as Array<{
      title: string;
      body: string;
      session_number: number | null;
      played_on: string | null;
      visibility: string;
      campaigns: { name: string } | Array<{ name: string }> | null;
    }>).map((l) => ({ campaign: one(l.campaigns)?.name ?? "", ...l, campaigns: undefined })),
  };
}
