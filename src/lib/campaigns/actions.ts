"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { type FormState, fieldErrorsFrom, textField } from "@/lib/forms";
import { siteOrigin } from "@/lib/origin";
import { createClient } from "@/lib/supabase/server";
import { GENERIC_ERROR, friendlyCampaignError } from "./errors";
import {
  assignableRoleSchema,
  campaignDetailsSchema,
  inviteSchema,
  inviteTokenSchema,
  uuidSchema,
} from "./validation";

function failure(where: string, error: { message?: string } | null): FormState {
  const message = friendlyCampaignError(error);
  if (message === GENERIC_ERROR) {
    console.error(`[campaign] ${where} failed: ${error?.message ?? "unknown"}`);
  }
  return { status: "error", message };
}

function idFrom(formData: FormData, name = "campaignId"): string | null {
  const parsed = uuidSchema.safeParse(textField(formData, name));
  return parsed.success ? parsed.data : null;
}

function refresh(campaignId: string) {
  revalidatePath("/home");
  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath(`/campaigns/${campaignId}/settings`);
}

const BAD_REQUEST: FormState = { status: "error", message: "That request wasn’t valid." };

export async function createCampaign(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = {
    name: textField(formData, "name"),
    gameSystem: textField(formData, "gameSystem"),
    description: textField(formData, "description"),
  };
  const parsed = campaignDetailsSchema.safeParse(values);
  if (!parsed.success) {
    return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error.issues), values };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_campaign", {
    p_name: parsed.data.name,
    p_game_system: parsed.data.gameSystem,
    p_description: parsed.data.description,
  });
  if (error || typeof data !== "string") {
    return { ...failure("create", error), values };
  }
  revalidatePath("/home");
  redirect(`/campaigns/${data}`);
}

export async function updateCampaign(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const campaignId = idFrom(formData);
  if (!campaignId) return BAD_REQUEST;
  const values = {
    name: textField(formData, "name"),
    gameSystem: textField(formData, "gameSystem"),
    description: textField(formData, "description"),
  };
  const parsed = campaignDetailsSchema.safeParse(values);
  if (!parsed.success) {
    return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error.issues), values };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("campaigns")
    .update({
      name: parsed.data.name,
      game_system: parsed.data.gameSystem,
      description: parsed.data.description,
    })
    .eq("id", campaignId)
    .select("id");
  if (error) return { ...failure("update", error), values };
  if (!data?.length) {
    return { status: "error", message: "You don’t have permission to do that.", values };
  }
  refresh(campaignId);
  return { status: "success", message: "Campaign saved.", values: parsed.data };
}

export async function setCampaignArchived(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const campaignId = idFrom(formData);
  if (!campaignId) return BAD_REQUEST;
  const archived = textField(formData, "archived") === "true";

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("campaigns")
    .update({ status: archived ? "archived" : "active" })
    .eq("id", campaignId)
    .select("id");
  if (error) return failure("archive", error);
  if (!data?.length) {
    return { status: "error", message: "You don’t have permission to do that." };
  }
  refresh(campaignId);
  return {
    status: "success",
    message: archived ? "Campaign archived." : "Campaign restored.",
  };
}

export async function deleteCampaign(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const campaignId = idFrom(formData);
  if (!campaignId) return BAD_REQUEST;

  const supabase = await createClient();
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("name")
    .eq("id", campaignId)
    .maybeSingle();
  if (!campaign) return { status: "error", message: "Campaign not found." };

  if (textField(formData, "confirm").trim() !== campaign.name) {
    return {
      status: "error",
      fieldErrors: { confirm: "Type the campaign name exactly as shown." },
    };
  }

  const { error } = await supabase.rpc("delete_campaign", { p_campaign: campaignId });
  if (error) return failure("delete", error);
  revalidatePath("/home");
  redirect("/home");
}

export async function createInvite(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const campaignId = idFrom(formData);
  if (!campaignId) return BAD_REQUEST;
  const values = {
    days: textField(formData, "days"),
    maxUses: textField(formData, "maxUses"),
  };
  const parsed = inviteSchema.safeParse(values);
  if (!parsed.success) {
    return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error.issues), values };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_invite", {
    p_campaign: campaignId,
    p_days: parsed.data.days,
    p_max_uses: parsed.data.maxUses,
  });
  if (error || typeof data !== "string") {
    return { ...failure("create invite", error), values };
  }

  revalidatePath(`/campaigns/${campaignId}/settings`);
  return {
    status: "success",
    message: "Invite link created. Copy it now: for security it won’t be shown again.",
    values: { ...values, link: `${await siteOrigin()}/invite/${data}` },
  };
}

export async function revokeInvite(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const campaignId = idFrom(formData);
  const inviteId = idFrom(formData, "inviteId");
  if (!campaignId || !inviteId) return BAD_REQUEST;

  const supabase = await createClient();
  const { error } = await supabase.rpc("revoke_invite", { p_invite: inviteId });
  if (error) return failure("revoke invite", error);
  revalidatePath(`/campaigns/${campaignId}/settings`);
  return { status: "success", message: "Link cancelled." };
}

export async function joinCampaign(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = inviteTokenSchema.safeParse(textField(formData, "token"));
  if (!parsed.success) {
    return { status: "error", message: friendlyCampaignError({ message: "invite_invalid" }) };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("join_campaign", { p_token: parsed.data });
  if (error || typeof data !== "string") return failure("join", error);
  revalidatePath("/home");
  redirect(`/campaigns/${data}`);
}

export async function leaveCampaign(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const campaignId = idFrom(formData);
  if (!campaignId) return BAD_REQUEST;

  const supabase = await createClient();
  const { error } = await supabase.rpc("leave_campaign", { p_campaign: campaignId });
  if (error) return failure("leave", error);
  revalidatePath("/home");
  redirect("/home");
}

export async function changeMemberRole(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const campaignId = idFrom(formData);
  const userId = idFrom(formData, "userId");
  const role = assignableRoleSchema.safeParse(textField(formData, "role"));
  if (!campaignId || !userId || !role.success) return BAD_REQUEST;

  const supabase = await createClient();
  const { error } = await supabase.rpc("set_member_role", {
    p_campaign: campaignId,
    p_user: userId,
    p_role: role.data,
  });
  if (error) return failure("change role", error);
  refresh(campaignId);
  return { status: "success", message: "Role updated." };
}

export async function removeMember(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const campaignId = idFrom(formData);
  const userId = idFrom(formData, "userId");
  if (!campaignId || !userId) return BAD_REQUEST;

  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_member", {
    p_campaign: campaignId,
    p_user: userId,
  });
  if (error) return failure("remove member", error);
  refresh(campaignId);
  return { status: "success", message: "Member removed." };
}

export async function transferOwnership(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const campaignId = idFrom(formData);
  const userId = idFrom(formData, "userId");
  if (!campaignId) return BAD_REQUEST;
  if (!userId) {
    return { status: "error", fieldErrors: { userId: "Choose who should take over." } };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("transfer_ownership", {
    p_campaign: campaignId,
    p_new_owner: userId,
  });
  if (error) return failure("transfer", error);
  refresh(campaignId);
  redirect(`/campaigns/${campaignId}`);
}
