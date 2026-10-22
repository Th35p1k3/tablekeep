import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/session";
import { loadCampaign } from "./queries";
import { uuidSchema } from "./validation";

/** Everything a campaign tab needs to start: who you are and your role. */
export async function loadCampaignPage(params: Promise<{ id: string }>) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const { supabase, user } = await requireUser();
  const data = await loadCampaign(supabase, id, user.id);
  if (!data) notFound();
  const myRole = data.myRole;
  if (!myRole) notFound();
  return {
    supabase,
    user,
    campaign: data.campaign,
    members: data.members,
    myRole,
    isManager: myRole !== "player",
  };
}
