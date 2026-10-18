import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type CampaignRole = "owner" | "co_dm" | "player";

export const ROLE_LABEL: Record<CampaignRole, string> = {
  owner: "DM",
  co_dm: "Co-DM",
  player: "Player",
};

const ROLE_ORDER: Record<CampaignRole, number> = { owner: 0, co_dm: 1, player: 2 };

export type Campaign = {
  id: string;
  name: string;
  game_system: string;
  description: string;
  status: "active" | "archived";
  created_at: string;
};

export type Member = {
  user_id: string;
  role: CampaignRole;
  joined_at: string;
  display_name: string;
};

export type Invite = {
  id: string;
  created_at: string;
  expires_at: string;
  max_uses: number;
  uses: number;
  revoked_at: string | null;
};

export type MyCampaign = Campaign & { role: CampaignRole };

/** A campaign with its members, or null if it doesn't exist or isn't yours. */
export async function loadCampaign(
  supabase: Supabase,
  campaignId: string,
  userId: string,
): Promise<{ campaign: Campaign; members: Member[]; myRole: CampaignRole | null } | null> {
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id, name, game_system, description, status, created_at")
    .eq("id", campaignId)
    .maybeSingle();
  if (!campaign) return null;

  const { data: rows } = await supabase
    .from("campaign_members")
    .select("user_id, role, joined_at")
    .eq("campaign_id", campaignId);
  const memberRows = (rows ?? []) as Array<Omit<Member, "display_name">>;

  const ids = memberRows.map((r) => r.user_id);
  const { data: profiles } = ids.length
    ? await supabase.from("profiles").select("id, display_name").in("id", ids)
    : { data: [] as Array<{ id: string; display_name: string }> };
  const names = new Map(
    ((profiles ?? []) as Array<{ id: string; display_name: string }>).map((p) => [
      p.id,
      p.display_name,
    ]),
  );

  const members: Member[] = memberRows
    .map((r) => ({ ...r, display_name: names.get(r.user_id) ?? "Unknown player" }))
    .sort(
      (x, y) =>
        ROLE_ORDER[x.role] - ROLE_ORDER[y.role] ||
        x.display_name.localeCompare(y.display_name),
    );

  return {
    campaign: campaign as Campaign,
    members,
    myRole: members.find((m) => m.user_id === userId)?.role ?? null,
  };
}

/** Campaigns the user belongs to, active ones first. */
export async function loadMyCampaigns(
  supabase: Supabase,
  userId: string,
): Promise<MyCampaign[]> {
  const { data } = await supabase
    .from("campaign_members")
    .select("role, campaigns ( id, name, game_system, description, status, created_at )")
    .eq("user_id", userId);

  const rows = (data ?? []) as unknown as Array<{
    role: CampaignRole;
    campaigns: Campaign | Campaign[] | null;
  }>;

  return rows
    .map((r) => {
      const c = Array.isArray(r.campaigns) ? r.campaigns[0] : r.campaigns;
      return c ? { ...c, role: r.role } : null;
    })
    .filter((c): c is MyCampaign => c !== null)
    .sort(
      (x, y) =>
        Number(x.status === "archived") - Number(y.status === "archived") ||
        x.name.localeCompare(y.name),
    );
}

/** Recent invite links for a campaign (managers only; others get none). */
export async function loadInvites(
  supabase: Supabase,
  campaignId: string,
): Promise<Invite[]> {
  const { data } = await supabase
    .from("campaign_invites")
    .select("id, created_at, expires_at, max_uses, uses, revoked_at")
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: false })
    .limit(20);
  return (data ?? []) as Invite[];
}

export function inviteStatus(invite: Invite, now: Date): string {
  if (invite.revoked_at) return "Cancelled";
  if (new Date(invite.expires_at) <= now) return "Expired";
  if (invite.uses >= invite.max_uses) return "Used up";
  return "Active";
}
