import type { createClient } from "@/lib/supabase/server";
import type { ContentType, SubmissionStatus } from "./rules";

type Supabase = Awaited<ReturnType<typeof createClient>>;

function one<T>(value: T | T[] | null | undefined): T | null {
  if (Array.isArray(value)) return value[0] ?? null;
  return value ?? null;
}

type NameJoin = { name: string } | Array<{ name: string }> | null;

export type CampaignSpell = { versionId: string; name: string; versionNumber: number | null; content: unknown };

export type Submission = {
  id: string;
  type: ContentType;
  versionId: string;
  status: SubmissionStatus;
  submitterId: string;
  submitterName: string;
  submitterNote: string;
  reviewNote: string;
  createdAt: string;
  reviewedAt: string | null;
  name: string;
  versionNumber: number | null;
  /** Spell content or template definition, for previews. */
  body: unknown;
};

export async function loadCampaignSpells(supabase: Supabase, campaignId: string): Promise<CampaignSpell[]> {
  const { data } = await supabase
    .from("campaign_spells")
    .select("spell_version_id, spell_versions ( version_number, content, spells ( name ) )")
    .eq("campaign_id", campaignId);
  return ((data ?? []) as unknown as Array<{
    spell_version_id: string;
    spell_versions:
      | { version_number: number | null; content: unknown; spells: NameJoin }
      | Array<{ version_number: number | null; content: unknown; spells: NameJoin }>
      | null;
  }>)
    .map((r) => {
      const v = one(r.spell_versions);
      return {
        versionId: r.spell_version_id,
        name: one(v?.spells ?? null)?.name ?? "Unknown spell",
        versionNumber: v?.version_number ?? null,
        content: v?.content ?? null,
      };
    })
    .sort((a, b) => a.name.localeCompare(b.name));
}

export async function loadSubmissions(
  supabase: Supabase,
  campaignId: string,
  options: { onlyMine?: string; status?: SubmissionStatus; limit?: number } = {},
): Promise<Submission[]> {
  let query = supabase
    .from("homebrew_submissions")
    .select(
      "id, content_type, status, submitted_by, submitter_note, review_note, created_at, reviewed_at, spell_version_id, template_version_id, spell_versions ( version_number, content, spells ( name ) ), sheet_template_versions ( version_number, definition, sheet_templates ( name ) )",
    )
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: false })
    .limit(options.limit ?? 50);
  if (options.onlyMine) query = query.eq("submitted_by", options.onlyMine);
  if (options.status) query = query.eq("status", options.status);
  const { data } = await query;

  const rows = (data ?? []) as unknown as Array<{
    id: string;
    content_type: ContentType;
    status: SubmissionStatus;
    submitted_by: string;
    submitter_note: string;
    review_note: string;
    created_at: string;
    reviewed_at: string | null;
    spell_version_id: string | null;
    template_version_id: string | null;
    spell_versions: { version_number: number | null; content: unknown; spells: NameJoin } | Array<{ version_number: number | null; content: unknown; spells: NameJoin }> | null;
    sheet_template_versions:
      | { version_number: number | null; definition: unknown; sheet_templates: NameJoin }
      | Array<{ version_number: number | null; definition: unknown; sheet_templates: NameJoin }>
      | null;
  }>;

  const submitterIds = [...new Set(rows.map((r) => r.submitted_by))];
  const { data: profiles } = submitterIds.length
    ? await supabase.from("profiles").select("id, display_name").in("id", submitterIds)
    : { data: [] as Array<{ id: string; display_name: string }> };
  const names = new Map(((profiles ?? []) as Array<{ id: string; display_name: string }>).map((p) => [p.id, p.display_name]));

  return rows.map((r) => {
    const spell = one(r.spell_versions);
    const template = one(r.sheet_template_versions);
    const isSpell = r.content_type === "spell";
    return {
      id: r.id,
      type: r.content_type,
      versionId: (isSpell ? r.spell_version_id : r.template_version_id) ?? "",
      status: r.status,
      submitterId: r.submitted_by,
      submitterName: names.get(r.submitted_by) ?? "A player",
      submitterNote: r.submitter_note,
      reviewNote: r.review_note,
      createdAt: r.created_at,
      reviewedAt: r.reviewed_at,
      name: (isSpell ? one(spell?.spells ?? null)?.name : one(template?.sheet_templates ?? null)?.name) ?? "Unknown",
      versionNumber: (isSpell ? spell?.version_number : template?.version_number) ?? null,
      body: isSpell ? (spell?.content ?? null) : (template?.definition ?? null),
    };
  });
}

/** Spell versions a character may add, following its campaign's rules. */
export async function loadSpellOptionsForCharacter(
  supabase: Supabase,
  campaign: { id: string; name: string } | null,
  ownLatest: Array<{ versionId: string; label: string }>,
): Promise<{ options: Array<{ versionId: string; label: string }>; needsApproval: boolean }> {
  if (!campaign) return { options: ownLatest, needsApproval: false };

  const [{ data: settings }, approved] = await Promise.all([
    supabase.from("campaigns").select("spells_need_approval").eq("id", campaign.id).maybeSingle(),
    loadCampaignSpells(supabase, campaign.id),
  ]);
  const needsApproval = (settings as { spells_need_approval?: boolean } | null)?.spells_need_approval !== false;

  const options = approved.map((s) => ({
    versionId: s.versionId,
    label: `${s.name} (version ${s.versionNumber ?? "?"}) · approved in ${campaign.name}`,
  }));
  if (!needsApproval) {
    const seen = new Set(options.map((o) => o.versionId));
    for (const own of ownLatest) if (!seen.has(own.versionId)) options.push(own);
  }
  return { options, needsApproval };
}
