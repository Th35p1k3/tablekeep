import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type RollResult = {
  request_id: string;
  user_id: string;
  method: "app" | "manual";
  dice: number[] | null;
  dice_other: number[] | null;
  modifier: number;
  modifier_label: string;
  total: number;
  created_at: string;
};

export type RollRequest = {
  id: string;
  label: string;
  dice_count: number;
  dice_sides: number;
  bonus: number;
  modifier_field: string | null;
  keep: "normal" | "highest" | "lowest";
  share_results: boolean;
  status: "open" | "closed";
  created_at: string;
  targets: string[];
  results: RollResult[];
};

export async function loadRollRequests(supabase: Supabase, campaignId: string): Promise<RollRequest[]> {
  const { data } = await supabase
    .from("roll_requests")
    .select("id, label, dice_count, dice_sides, bonus, modifier_field, keep, share_results, status, created_at, roll_request_targets ( user_id )")
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: false })
    .limit(15);
  const requests = (data ?? []) as Array<Omit<RollRequest, "targets" | "results"> & { roll_request_targets: Array<{ user_id: string }> | null }>;
  if (!requests.length) return [];

  const { data: results } = await supabase
    .from("roll_results")
    .select("request_id, user_id, method, dice, dice_other, modifier, modifier_label, total, created_at")
    .in("request_id", requests.map((r) => r.id));
  const byRequest = new Map<string, RollResult[]>();
  for (const r of (results ?? []) as RollResult[]) {
    byRequest.set(r.request_id, [...(byRequest.get(r.request_id) ?? []), r]);
  }

  return requests.map(({ roll_request_targets, ...r }) => ({
    ...r,
    targets: (roll_request_targets ?? []).map((t) => t.user_id),
    results: byRequest.get(r.id) ?? [],
  }));
}

/** My characters that are in this campaign (to read modifiers from). */
export async function loadMyCampaignCharacters(
  supabase: Supabase,
  campaignId: string,
  userId: string,
): Promise<Array<{ id: string; name: string }>> {
  const { data } = await supabase
    .from("campaign_characters")
    .select("characters ( id, name, owner_id )")
    .eq("campaign_id", campaignId);
  const rows = (data ?? []) as unknown as Array<{
    characters: { id: string; name: string; owner_id: string } | Array<{ id: string; name: string; owner_id: string }> | null;
  }>;
  return rows
    .map((r) => (Array.isArray(r.characters) ? r.characters[0] : r.characters))
    .filter((c): c is { id: string; name: string; owner_id: string } => Boolean(c) && c!.owner_id === userId)
    .map((c) => ({ id: c.id, name: c.name }));
}
