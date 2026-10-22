"use server";

import { revalidatePath } from "next/cache";
import { uuidSchema } from "@/lib/campaigns/validation";
import { type FormState, textField } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { GENERIC_HOMEBREW_ERROR, decodeSubmittable, friendlyHomebrewError, reviewProblem } from "./rules";

const BAD_REQUEST: FormState = { status: "error", message: "That request wasn’t valid." };

function failure(where: string, error: { message?: string } | null): FormState {
  const message = friendlyHomebrewError(error);
  if (message === GENERIC_HOMEBREW_ERROR) console.error(`[homebrew] ${where} failed: ${error?.message ?? "unknown"}`);
  return { status: "error", message };
}

function uuid(formData: FormData, name: string): string | null {
  const parsed = uuidSchema.safeParse(textField(formData, name));
  return parsed.success ? parsed.data : null;
}

function refresh(campaignId: string) {
  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath(`/campaigns/${campaignId}/approvals`);
  revalidatePath(`/campaigns/${campaignId}/settings`);
}

export async function submitHomebrew(_prev: FormState, formData: FormData): Promise<FormState> {
  const campaignId = uuid(formData, "campaignId");
  const target = decodeSubmittable(textField(formData, "item"));
  const note = textField(formData, "note").trim();
  if (!campaignId) return BAD_REQUEST;
  if (!target) return { status: "error", fieldErrors: { item: "Choose a spell or template to submit." } };
  if (note.length > 500) return { status: "error", fieldErrors: { note: "Keep the note to 500 characters or fewer." } };

  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_homebrew", {
    p_campaign: campaignId,
    p_type: target.type,
    p_version: target.versionId,
    p_note: note,
  });
  if (error) return failure("submit", error);
  refresh(campaignId);
  return { status: "success", message: "Submitted. Your DM will see it in their approval queue." };
}

export async function withdrawSubmission(_prev: FormState, formData: FormData): Promise<FormState> {
  const campaignId = uuid(formData, "campaignId");
  const submissionId = uuid(formData, "submissionId");
  if (!campaignId || !submissionId) return BAD_REQUEST;
  const supabase = await createClient();
  const { error } = await supabase.rpc("withdraw_submission", { p_submission: submissionId });
  if (error) return failure("withdraw", error);
  refresh(campaignId);
  return { status: "success", message: "Submission withdrawn." };
}

export async function reviewSubmission(_prev: FormState, formData: FormData): Promise<FormState> {
  const campaignId = uuid(formData, "campaignId");
  const submissionId = uuid(formData, "submissionId");
  if (!campaignId || !submissionId) return BAD_REQUEST;
  const decision = textField(formData, "decision");
  const note = textField(formData, "note").trim();
  const problem = reviewProblem(decision, note);
  if (problem) return { status: "error", fieldErrors: { note: problem }, values: { note } };

  const supabase = await createClient();
  const { error } = await supabase.rpc("review_submission", {
    p_submission: submissionId,
    p_decision: decision,
    p_note: note,
  });
  if (error) return { ...failure("review", error), values: { note } };
  refresh(campaignId);
  return {
    status: "success",
    message: decision === "approved" ? "Approved." : decision === "rejected" ? "Marked as not approved." : "Changes requested.",
  };
}

export async function addSpellToCampaign(_prev: FormState, formData: FormData): Promise<FormState> {
  const campaignId = uuid(formData, "campaignId");
  const versionId = uuid(formData, "versionId");
  if (!campaignId) return BAD_REQUEST;
  if (!versionId) return { status: "error", fieldErrors: { versionId: "Choose a spell." } };
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_spell_to_campaign", { p_campaign: campaignId, p_version: versionId });
  if (error) return failure("add spell to campaign", error);
  refresh(campaignId);
  return { status: "success", message: "Spell added to the campaign." };
}

export async function removeSpellFromCampaign(_prev: FormState, formData: FormData): Promise<FormState> {
  const campaignId = uuid(formData, "campaignId");
  const versionId = uuid(formData, "versionId");
  if (!campaignId || !versionId) return BAD_REQUEST;
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_spell_from_campaign", { p_campaign: campaignId, p_version: versionId });
  if (error) return failure("remove spell from campaign", error);
  refresh(campaignId);
  return { status: "success", message: "Spell removed from the list." };
}

export async function setSpellsNeedApproval(_prev: FormState, formData: FormData): Promise<FormState> {
  const campaignId = uuid(formData, "campaignId");
  if (!campaignId) return BAD_REQUEST;
  const required = textField(formData, "required") === "true";
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("campaigns")
    .update({ spells_need_approval: required })
    .eq("id", campaignId)
    .select("id");
  if (error) return failure("approval setting", error);
  if (!data?.length) return { status: "error", message: "You don’t have permission to do that." };
  refresh(campaignId);
  return {
    status: "success",
    message: required ? "Characters can now only use approved spells." : "Players can now also use their own spells.",
  };
}
