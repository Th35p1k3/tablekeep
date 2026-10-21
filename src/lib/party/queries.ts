import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type PartyMember = {
  character_id: string;
  character_name: string;
  owner_id: string;
  owner_name: string;
  template_name: string;
  version_number: number | null;
  can_view: boolean;
};

export type OfferedTemplate = { versionId: string; label: string };

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

export async function loadParty(supabase: Supabase, campaignId: string): Promise<PartyMember[]> {
  const { data } = await supabase.rpc("campaign_party", { p_campaign: campaignId });
  return (data ?? []) as PartyMember[];
}

/** Template versions a campaign offers to its members. */
export async function loadOfferedTemplates(supabase: Supabase, campaignId: string): Promise<OfferedTemplate[]> {
  const { data } = await supabase
    .from("campaign_templates")
    .select("template_version_id, sheet_template_versions ( version_number, sheet_templates ( name ) )")
    .eq("campaign_id", campaignId);
  return ((data ?? []) as unknown as Array<{
    template_version_id: string;
    sheet_template_versions:
      | { version_number: number | null; sheet_templates: { name: string } | Array<{ name: string }> | null }
      | Array<{ version_number: number | null; sheet_templates: { name: string } | Array<{ name: string }> | null }>
      | null;
  }>)
    .map((row) => {
      const v = one(row.sheet_template_versions);
      return {
        versionId: row.template_version_id,
        label: `${one(v?.sheet_templates)?.name ?? "Template"} (version ${v?.version_number ?? "?"})`,
      };
    })
    .sort((a, b) => a.label.localeCompare(b.label));
}

/** The latest published version of each of my templates (for offering). */
export async function loadMyLatestVersions(supabase: Supabase, userId: string): Promise<OfferedTemplate[]> {
  const { data } = await supabase
    .from("sheet_templates")
    .select("name, sheet_template_versions ( id, status, version_number )")
    .eq("owner_id", userId)
    .order("name");
  const result: OfferedTemplate[] = [];
  for (const t of (data ?? []) as Array<{
    name: string;
    sheet_template_versions: Array<{ id: string; status: string; version_number: number | null }> | null;
  }>) {
    const latest = (t.sheet_template_versions ?? [])
      .filter((v) => v.status === "published")
      .sort((a, b) => (b.version_number ?? 0) - (a.version_number ?? 0))[0];
    if (latest) result.push({ versionId: latest.id, label: `${t.name} (version ${latest.version_number})` });
  }
  return result;
}

/** My characters that aren't in any campaign yet. */
export async function loadMyFreeCharacters(
  supabase: Supabase,
  userId: string,
): Promise<Array<{ id: string; name: string }>> {
  const { data } = await supabase
    .from("characters")
    .select("id, name, campaign_characters ( campaign_id )")
    .eq("owner_id", userId)
    .order("name");
  return ((data ?? []) as Array<{
    id: string;
    name: string;
    campaign_characters: { campaign_id: string } | Array<{ campaign_id: string }> | null;
  }>)
    .filter((c) => one(c.campaign_characters) === null)
    .map((c) => ({ id: c.id, name: c.name }));
}

/** Campaigns I belong to that are still active (for adding a character). */
export async function loadMyActiveCampaigns(
  supabase: Supabase,
  userId: string,
): Promise<Array<{ id: string; name: string }>> {
  const { data } = await supabase
    .from("campaign_members")
    .select("campaigns ( id, name, status )")
    .eq("user_id", userId);
  return ((data ?? []) as unknown as Array<{
    campaigns: { id: string; name: string; status: string } | Array<{ id: string; name: string; status: string }> | null;
  }>)
    .map((r) => one(r.campaigns))
    .filter((c): c is { id: string; name: string; status: string } => c !== null && c.status === "active")
    .map((c) => ({ id: c.id, name: c.name }))
    .sort((a, b) => a.name.localeCompare(b.name));
}

/** Which campaign a character is in, if any. */
export async function loadCharacterCampaign(
  supabase: Supabase,
  characterId: string,
): Promise<{ id: string; name: string } | null> {
  const { data } = await supabase
    .from("campaign_characters")
    .select("campaigns ( id, name )")
    .eq("character_id", characterId)
    .maybeSingle();
  const c = one((data as { campaigns: { id: string; name: string } | Array<{ id: string; name: string }> | null } | null)?.campaigns);
  return c ? { id: c.id, name: c.name } : null;
}
