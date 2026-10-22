import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type Announcement = {
  id: string;
  title: string;
  body: string;
  pinned: boolean;
  created_at: string;
  authorName: string;
};

export type SessionLog = {
  id: string;
  title: string;
  body: string;
  session_number: number | null;
  played_on: string | null;
  visibility: "players" | "dm_only";
  author_id: string | null;
  authorName: string;
  created_at: string;
};

export type DmNote = {
  id: string;
  title: string;
  body: string;
  character_id: string | null;
  session_log_id: string | null;
  updated_at: string;
};

export type ActivityRow = {
  id: number;
  action: string;
  details: Record<string, unknown>;
  actor_id: string | null;
  created_at: string;
};

/** Display names for a set of user ids (only people sharing a campaign are visible). */
export async function loadNames(supabase: Supabase, ids: Array<string | null | undefined>): Promise<Map<string, string>> {
  const unique = [...new Set(ids.filter((i): i is string => typeof i === "string"))];
  if (!unique.length) return new Map();
  const { data } = await supabase.from("profiles").select("id, display_name").in("id", unique);
  return new Map(((data ?? []) as Array<{ id: string; display_name: string }>).map((p) => [p.id, p.display_name]));
}

export async function loadAnnouncements(supabase: Supabase, campaignId: string): Promise<Announcement[]> {
  const { data } = await supabase
    .from("announcements")
    .select("id, title, body, pinned, created_at, author_id")
    .eq("campaign_id", campaignId)
    .order("pinned", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(30);
  const rows = (data ?? []) as Array<Omit<Announcement, "authorName"> & { author_id: string | null }>;
  const names = await loadNames(supabase, rows.map((r) => r.author_id));
  return rows.map((r) => ({ ...r, authorName: (r.author_id && names.get(r.author_id)) || "A former member" }));
}

export async function loadSessionLogs(supabase: Supabase, campaignId: string): Promise<SessionLog[]> {
  const { data } = await supabase
    .from("session_logs")
    .select("id, title, body, session_number, played_on, visibility, author_id, created_at")
    .eq("campaign_id", campaignId)
    .order("session_number", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: false })
    .limit(200);
  const rows = (data ?? []) as Array<Omit<SessionLog, "authorName">>;
  const names = await loadNames(supabase, rows.map((r) => r.author_id));
  return rows.map((r) => ({ ...r, authorName: (r.author_id && names.get(r.author_id)) || "A former member" }));
}

export async function loadDmNotes(supabase: Supabase, campaignId: string): Promise<DmNote[]> {
  const { data } = await supabase
    .from("dm_notes")
    .select("id, title, body, character_id, session_log_id, updated_at")
    .eq("campaign_id", campaignId)
    .order("updated_at", { ascending: false })
    .limit(200);
  return (data ?? []) as DmNote[];
}

export async function loadActivity(supabase: Supabase, campaignId: string): Promise<ActivityRow[]> {
  const { data } = await supabase
    .from("audit_log")
    .select("id, action, details, actor_id, created_at")
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: false })
    .limit(100);
  return (data ?? []) as ActivityRow[];
}

export async function loadCampaignSettings(
  supabase: Supabase,
  campaignId: string,
): Promise<{ playersWriteLogs: boolean }> {
  const { data } = await supabase.from("campaigns").select("players_write_logs").eq("id", campaignId).maybeSingle();
  return { playersWriteLogs: Boolean((data as { players_write_logs?: boolean } | null)?.players_write_logs) };
}
