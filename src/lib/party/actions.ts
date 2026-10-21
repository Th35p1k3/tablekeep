"use server";

import { revalidatePath } from "next/cache";
import { GENERIC_ERROR, friendlyCampaignError } from "@/lib/campaigns/errors";
import { uuidSchema } from "@/lib/campaigns/validation";
import { type FormState, textField } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";

const BAD_REQUEST: FormState = { status: "error", message: "That request wasn’t valid." };

function failure(where: string, error: { message?: string } | null): FormState {
  const message = friendlyCampaignError(error);
  if (message === GENERIC_ERROR) console.error(`[party] ${where} failed: ${error?.message ?? "unknown"}`);
  return { status: "error", message };
}

function ids(formData: FormData, ...names: string[]): string[] | null {
  const values = names.map((n) => uuidSchema.safeParse(textField(formData, n)));
  return values.every((v) => v.success) ? values.map((v) => (v.success ? v.data : "")) : null;
}

function refresh(campaignId: string, characterId?: string) {
  revalidatePath(`/campaigns/${campaignId}`);
  revalidatePath(`/campaigns/${campaignId}/settings`);
  if (characterId) revalidatePath(`/characters/${characterId}`);
}

export async function offerTemplate(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = ids(formData, "campaignId", "versionId");
  if (!parsed) return { status: "error", fieldErrors: { versionId: "Choose a template." } };
  const [campaignId, versionId] = parsed;
  const supabase = await createClient();
  const { error } = await supabase.rpc("offer_template_in_campaign", { p_campaign: campaignId, p_version: versionId });
  if (error) return failure("offer template", error);
  refresh(campaignId);
  return { status: "success", message: "Template offered to players." };
}

export async function withdrawTemplate(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = ids(formData, "campaignId", "versionId");
  if (!parsed) return BAD_REQUEST;
  const [campaignId, versionId] = parsed;
  const supabase = await createClient();
  const { error } = await supabase.rpc("withdraw_template_from_campaign", {
    p_campaign: campaignId,
    p_version: versionId,
  });
  if (error) return failure("withdraw template", error);
  refresh(campaignId);
  return { status: "success", message: "Template withdrawn." };
}

export async function addCharacterToCampaign(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = ids(formData, "campaignId", "characterId");
  if (!parsed) return { status: "error", fieldErrors: { characterId: "Choose a character and a campaign." } };
  const [campaignId, characterId] = parsed;
  const supabase = await createClient();
  const { error } = await supabase.rpc("add_character_to_campaign", {
    p_campaign: campaignId,
    p_character: characterId,
  });
  if (error) return failure("add character", error);
  refresh(campaignId, characterId);
  revalidatePath("/characters");
  return { status: "success", message: "Character added to the campaign." };
}

export async function removeCharacterFromCampaign(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = ids(formData, "campaignId", "characterId");
  if (!parsed) return BAD_REQUEST;
  const [campaignId, characterId] = parsed;
  const supabase = await createClient();
  const { error } = await supabase.rpc("remove_character_from_campaign", {
    p_campaign: campaignId,
    p_character: characterId,
  });
  if (error) return failure("remove character", error);
  refresh(campaignId, characterId);
  revalidatePath("/characters");
  return { status: "success", message: "Character removed from the campaign." };
}

export async function setPlayersSeeFullSheets(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = ids(formData, "campaignId");
  if (!parsed) return BAD_REQUEST;
  const [campaignId] = parsed;
  const allow = textField(formData, "allow") === "true";
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("campaigns")
    .update({ players_see_full_sheets: allow })
    .eq("id", campaignId)
    .select("id");
  if (error) return failure("sheet visibility", error);
  if (!data?.length) return { status: "error", message: "You don’t have permission to do that." };
  refresh(campaignId);
  return {
    status: "success",
    message: allow ? "Players can now open each other’s sheets." : "Players now see names only.",
  };
}
