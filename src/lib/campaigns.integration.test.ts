import { createClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

// Logs in as three throwaway test users and tries every campaign permission.
// A = owner, B = player who joins, C = outsider. Skipped if settings are missing.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const creds = (letter: "A" | "B" | "C") => ({
  email: process.env[`TEST_USER_${letter}_EMAIL`],
  password: process.env[`TEST_USER_${letter}_PASSWORD`],
});
const users = { a: creds("A"), b: creds("B"), c: creds("C") };
const ready = Boolean(
  url && key && Object.values(users).every((u) => u.email && u.password),
);

async function signedIn(email: string, password: string) {
  const client = createClient(url!, key!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error || !data.user) {
    throw new Error(`Couldn't sign in test user ${email}: ${error?.message}`);
  }
  return { client, userId: data.user.id };
}

type Session = Awaited<ReturnType<typeof signedIn>>;

describe.skipIf(!ready)("campaign permissions", () => {
  let a: Session;
  let b: Session;
  let c: Session;
  let campaignId = "";
  let inviteToken = "";

  async function newInvite(client: Session["client"], maxUses = 10) {
    const { data, error } = await client.rpc("create_invite", {
      p_campaign: campaignId,
      p_days: 7,
      p_max_uses: maxUses,
    });
    if (error) throw new Error(error.message);
    return data as string;
  }

  async function latestInviteId(client: Session["client"]) {
    const { data } = await client
      .from("campaign_invites")
      .select("id")
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: false })
      .limit(1);
    return (data ?? [])[0]?.id as string;
  }

  async function visibleCampaigns(client: Session["client"]) {
    const { data } = await client.from("campaigns").select("id").eq("id", campaignId);
    return data ?? [];
  }

  beforeAll(async () => {
    a = await signedIn(users.a.email!, users.a.password!);
    b = await signedIn(users.b.email!, users.b.password!);
    c = await signedIn(users.c.email!, users.c.password!);

    const { data, error } = await a.client.rpc("create_campaign", {
      p_name: "[test] permissions",
      p_game_system: "Test system",
      p_description: "Created by the automated tests. Safe to delete.",
    });
    if (error) throw new Error(error.message);
    campaignId = data as string;
    inviteToken = await newInvite(a.client);
  });

  afterAll(async () => {
    if (campaignId) await a.client.rpc("delete_campaign", { p_campaign: campaignId });
  });

  it("the creator becomes the owner", async () => {
    const { data } = await a.client
      .from("campaign_members")
      .select("user_id, role")
      .eq("campaign_id", campaignId);
    expect(data).toEqual([{ user_id: a.userId, role: "owner" }]);
  });

  it("an outsider can't see the campaign, its members or its invites", async () => {
    expect(await visibleCampaigns(c.client)).toHaveLength(0);
    const { data: members } = await c.client
      .from("campaign_members")
      .select("user_id")
      .eq("campaign_id", campaignId);
    expect(members ?? []).toHaveLength(0);
    const { data: invites } = await c.client
      .from("campaign_invites")
      .select("id")
      .eq("campaign_id", campaignId);
    expect(invites ?? []).toHaveLength(0);
  });

  it("an outsider can't create invites or edit the campaign", async () => {
    const { error } = await c.client.rpc("create_invite", {
      p_campaign: campaignId,
      p_days: 7,
      p_max_uses: 10,
    });
    expect(error?.message).toContain("not_allowed");
    const { data } = await c.client
      .from("campaigns")
      .update({ name: "Hacked" })
      .eq("id", campaignId)
      .select("id");
    expect(data ?? []).toHaveLength(0);
  });

  it("nobody can read invite token hashes", async () => {
    const { error } = await a.client
      .from("campaign_invites")
      .select("token_hash")
      .eq("campaign_id", campaignId);
    expect(error).not.toBeNull();
  });

  it("a player joins with the invite link", async () => {
    const { data, error } = await b.client.rpc("join_campaign", { p_token: inviteToken });
    expect(error).toBeNull();
    expect(data).toBe(campaignId);
    const { data: members } = await b.client
      .from("campaign_members")
      .select("user_id, role")
      .eq("campaign_id", campaignId);
    expect(members ?? []).toHaveLength(2);
    expect(members).toContainEqual({ user_id: b.userId, role: "player" });
  });

  it("members see each other's names; outsiders still don't", async () => {
    const { data: fromB } = await b.client.from("profiles").select("id").eq("id", a.userId);
    expect(fromB ?? []).toHaveLength(1);
    const { data: fromC } = await c.client.from("profiles").select("id").eq("id", a.userId);
    expect(fromC ?? []).toHaveLength(0);
  });

  it("a player can't manage the campaign", async () => {
    const invite = await b.client.rpc("create_invite", {
      p_campaign: campaignId,
      p_days: 7,
      p_max_uses: 10,
    });
    expect(invite.error?.message).toContain("not_allowed");

    const { data: updated } = await b.client
      .from("campaigns")
      .update({ name: "Hacked" })
      .eq("id", campaignId)
      .select("id");
    expect(updated ?? []).toHaveLength(0);

    const remove = await b.client.rpc("remove_member", {
      p_campaign: campaignId,
      p_user: a.userId,
    });
    expect(remove.error?.message).toContain("not_allowed");

    const promote = await b.client.rpc("set_member_role", {
      p_campaign: campaignId,
      p_user: b.userId,
      p_role: "co_dm",
    });
    expect(promote.error?.message).toContain("not_allowed");

    const del = await b.client.rpc("delete_campaign", { p_campaign: campaignId });
    expect(del.error?.message).toContain("not_allowed");
    expect(await visibleCampaigns(a.client)).toHaveLength(1);

    const { data: invites } = await b.client
      .from("campaign_invites")
      .select("id")
      .eq("campaign_id", campaignId);
    expect(invites ?? []).toHaveLength(0);
  });

  it("a co-DM can manage the campaign but can't remove the owner", async () => {
    const promote = await a.client.rpc("set_member_role", {
      p_campaign: campaignId,
      p_user: b.userId,
      p_role: "co_dm",
    });
    expect(promote.error).toBeNull();

    const { data: updated } = await b.client
      .from("campaigns")
      .update({ description: "Edited by the co-DM test." })
      .eq("id", campaignId)
      .select("id");
    expect(updated ?? []).toHaveLength(1);

    await newInvite(b.client);
    const revoke = await b.client.rpc("revoke_invite", {
      p_invite: await latestInviteId(b.client),
    });
    expect(revoke.error).toBeNull();

    const remove = await b.client.rpc("remove_member", {
      p_campaign: campaignId,
      p_user: a.userId,
    });
    expect(remove.error?.message).toContain("not_allowed");

    const del = await b.client.rpc("delete_campaign", { p_campaign: campaignId });
    expect(del.error?.message).toContain("not_allowed");

    const demote = await a.client.rpc("set_member_role", {
      p_campaign: campaignId,
      p_user: b.userId,
      p_role: "player",
    });
    expect(demote.error).toBeNull();
  });

  it("cancelled links are refused", async () => {
    const token = await newInvite(a.client);
    await a.client.rpc("revoke_invite", { p_invite: await latestInviteId(a.client) });
    const { error } = await c.client.rpc("join_campaign", { p_token: token });
    expect(error?.message).toContain("invite_revoked");
    expect(await visibleCampaigns(c.client)).toHaveLength(0);
  });

  it("used-up links are refused, and removed members lose access", async () => {
    const token = await newInvite(a.client, 1);
    const first = await c.client.rpc("join_campaign", { p_token: token });
    expect(first.error).toBeNull();
    expect(await visibleCampaigns(c.client)).toHaveLength(1);

    const remove = await a.client.rpc("remove_member", {
      p_campaign: campaignId,
      p_user: c.userId,
    });
    expect(remove.error).toBeNull();
    expect(await visibleCampaigns(c.client)).toHaveLength(0);

    const second = await c.client.rpc("join_campaign", { p_token: token });
    expect(second.error?.message).toContain("invite_used_up");
    expect(await visibleCampaigns(c.client)).toHaveLength(0);
  });

  it("made-up links are refused", async () => {
    const { error } = await c.client.rpc("join_campaign", { p_token: "0".repeat(48) });
    expect(error?.message).toContain("invite_invalid");
  });

  it("the owner can't leave, but a player can", async () => {
    const ownerLeave = await a.client.rpc("leave_campaign", { p_campaign: campaignId });
    expect(ownerLeave.error?.message).toContain("owner_cannot_leave");

    const playerLeave = await b.client.rpc("leave_campaign", { p_campaign: campaignId });
    expect(playerLeave.error).toBeNull();
    expect(await visibleCampaigns(b.client)).toHaveLength(0);
  });
});
