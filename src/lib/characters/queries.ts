import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type CharacterSummary = {
  id: string;
  name: string;
  updated_at: string;
  templateName: string;
  versionNumber: number | null;
};

export type RestorePoint = {
  id: string;
  label: string;
  reason: "manual" | "before_restore";
  created_at: string;
};

export type CharacterDetail = {
  id: string;
  owner_id: string;
  name: string;
  data: Record<string, unknown>;
  updated_at: string;
  definition: unknown;
  templateName: string;
  versionNumber: number | null;
};

type VersionJoin = {
  version_number: number | null;
  definition?: unknown;
  sheet_templates: { name: string } | Array<{ name: string }> | null;
} | null;

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export async function loadMyCharacters(supabase: Supabase, userId: string): Promise<CharacterSummary[]> {
  const { data } = await supabase
    .from("characters")
    .select("id, name, updated_at, sheet_template_versions ( version_number, sheet_templates ( name ) )")
    .eq("owner_id", userId)
    .order("updated_at", { ascending: false });

  return ((data ?? []) as unknown as Array<{
    id: string;
    name: string;
    updated_at: string;
    sheet_template_versions: VersionJoin | VersionJoin[];
  }>).map((c) => {
    const version = one(c.sheet_template_versions);
    return {
      id: c.id,
      name: c.name,
      updated_at: c.updated_at,
      templateName: one(version?.sheet_templates)?.name ?? "Unknown template",
      versionNumber: version?.version_number ?? null,
    };
  });
}

export async function loadCharacter(supabase: Supabase, characterId: string): Promise<CharacterDetail | null> {
  const { data } = await supabase
    .from("characters")
    .select("id, owner_id, name, data, updated_at, sheet_template_versions ( version_number, definition, sheet_templates ( name ) )")
    .eq("id", characterId)
    .maybeSingle();
  if (!data) return null;

  const row = data as unknown as {
    id: string;
    owner_id: string;
    name: string;
    data: Record<string, unknown>;
    updated_at: string;
    sheet_template_versions: VersionJoin | VersionJoin[];
  };
  const version = one(row.sheet_template_versions);
  return {
    id: row.id,
    owner_id: row.owner_id,
    name: row.name,
    data: row.data ?? {},
    updated_at: row.updated_at,
    definition: version?.definition ?? null,
    templateName: one(version?.sheet_templates)?.name ?? "Unknown template",
    versionNumber: version?.version_number ?? null,
  };
}

export async function loadRestorePoints(supabase: Supabase, characterId: string): Promise<RestorePoint[]> {
  const { data } = await supabase
    .from("character_snapshots")
    .select("id, label, reason, created_at")
    .eq("character_id", characterId)
    .order("created_at", { ascending: false })
    .limit(50);
  return (data ?? []) as RestorePoint[];
}

/**
 * Published template versions this user can build characters from: their
 * own, plus any a campaign they belong to offers.
 */
export async function loadUsableTemplateVersions(
  supabase: Supabase,
  userId: string,
): Promise<Array<{ id: string; label: string }>> {
  const options: Array<{ id: string; label: string }> = [];
  const seen = new Set<string>();

  const { data: offered } = await supabase
    .from("campaign_templates")
    .select("template_version_id, campaigns ( name ), sheet_template_versions ( version_number, sheet_templates ( name ) )");
  for (const row of (offered ?? []) as unknown as Array<{
    template_version_id: string;
    campaigns: { name: string } | Array<{ name: string }> | null;
    sheet_template_versions: VersionJoin | VersionJoin[];
  }>) {
    if (seen.has(row.template_version_id)) continue;
    seen.add(row.template_version_id);
    const version = one(row.sheet_template_versions);
    options.push({
      id: row.template_version_id,
      label: `${one(version?.sheet_templates)?.name ?? "Template"} (version ${version?.version_number ?? "?"}) · offered in ${one(row.campaigns)?.name ?? "a campaign"}`,
    });
  }

  const { data } = await supabase
    .from("sheet_templates")
    .select("name, sheet_template_versions ( id, status, version_number )")
    .eq("owner_id", userId)
    .order("name");
  for (const t of (data ?? []) as Array<{
    name: string;
    sheet_template_versions: Array<{ id: string; status: string; version_number: number | null }> | null;
  }>) {
    const published = (t.sheet_template_versions ?? [])
      .filter((v) => v.status === "published" && v.version_number !== null)
      .sort((a, b) => (b.version_number ?? 0) - (a.version_number ?? 0));
    published.forEach((v, i) => {
      if (seen.has(v.id)) return;
      seen.add(v.id);
      options.push({
        id: v.id,
        label: `${t.name} (version ${v.version_number}${i === 0 ? ", latest" : ""})`,
      });
    });
  }
  return options;
}
