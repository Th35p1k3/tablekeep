"use server";

import { uuidSchema } from "@/lib/campaigns/validation";
import { loadCharacter } from "@/lib/characters/queries";
import { type FormState, fieldErrorsFrom, textField } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { coerceDefinition } from "@/lib/templates/editing";
import { type RollRequest, loadMyCampaignCharacters, loadRollRequests } from "./queries";
import { friendlyRollError, parseSimpleDice, resolveModifier, rollRequestSchema } from "./rules";

export async function createRollRequest(_prev: FormState, formData: FormData): Promise<FormState> {
  const campaignId = uuidSchema.safeParse(textField(formData, "campaignId"));
  if (!campaignId.success) return { status: "error", message: "That request wasn’t valid." };
  const values = {
    label: textField(formData, "label"),
    dice: textField(formData, "dice") || "1d20",
    bonus: textField(formData, "bonus"),
    modifierField: textField(formData, "modifierField"),
    keep: textField(formData, "keep") || "normal",
  };
  const parsed = rollRequestSchema.safeParse({ ...values, share: formData.get("share") === "on" });
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error.issues), values };
  const targets = formData.getAll("target").map(String).filter((t) => uuidSchema.safeParse(t).success);
  if (!targets.length) return { status: "error", fieldErrors: { target: "Choose at least one player." }, values };
  const dice = parseSimpleDice(parsed.data.dice)!;

  const supabase = await createClient();
  const { error } = await supabase.rpc("create_roll_request", {
    p_campaign: campaignId.data,
    p_label: parsed.data.label,
    p_count: dice.count,
    p_sides: dice.sides,
    p_bonus: parsed.data.bonus,
    p_modifier_field: parsed.data.modifierField,
    p_keep: parsed.data.keep,
    p_share: parsed.data.share,
    p_targets: targets,
  });
  if (error) {
    console.error(`[rolls] create failed: ${error.message}`);
    return { status: "error", message: friendlyRollError(error), values };
  }
  return { status: "success", message: "Roll requested." };
}

export type RollState = { ok: true; requests: RollRequest[] } | { ok: false };

export async function loadRolls(campaignId: string): Promise<RollState> {
  if (!uuidSchema.safeParse(campaignId).success) return { ok: false };
  const supabase = await createClient();
  return { ok: true, requests: await loadRollRequests(supabase, campaignId) };
}

export type RollActionResult = { ok: true } | { ok: false; message: string };

/**
 * Rolls in the database (fair, can't be redone), adding the modifier the
 * request asks for from the player's own character sheet.
 */
export async function rollNow(requestId: string, characterId: string | null): Promise<RollActionResult> {
  if (!uuidSchema.safeParse(requestId).success) return { ok: false, message: "That request wasn’t valid." };
  if (characterId !== null && !uuidSchema.safeParse(characterId).success) {
    return { ok: false, message: "That character wasn’t valid." };
  }
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return { ok: false, message: "Please log in again." };

  const { data: request } = await supabase
    .from("roll_requests")
    .select("id, campaign_id, modifier_field")
    .eq("id", requestId)
    .maybeSingle();
  const req = request as { id: string; campaign_id: string; modifier_field: string | null } | null;
  if (!req) return { ok: false, message: "That roll isn’t available." };

  let modifier = 0;
  let label = "";
  let usedCharacter: string | null = null;
  if (req.modifier_field) {
    const mine = await loadMyCampaignCharacters(supabase, req.campaign_id, auth.user.id);
    const chosen = characterId ? mine.find((c) => c.id === characterId) : mine[0];
    if (chosen) {
      const character = await loadCharacter(supabase, chosen.id);
      if (character) {
        const resolved = resolveModifier(coerceDefinition(character.definition), character.data, req.modifier_field);
        modifier = resolved.value;
        label = resolved.label;
        usedCharacter = chosen.id;
      }
    } else {
      label = "no character in this campaign";
    }
  }

  const { error } = await supabase.rpc("roll_for_request", {
    p_request: requestId,
    p_modifier: modifier,
    p_modifier_label: label,
    p_character: usedCharacter,
  });
  if (error) return { ok: false, message: friendlyRollError(error) };
  return { ok: true };
}

export async function submitManualRoll(requestId: string, total: number): Promise<RollActionResult> {
  if (!uuidSchema.safeParse(requestId).success) return { ok: false, message: "That request wasn’t valid." };
  if (!Number.isInteger(total) || total < -1000 || total > 10000) {
    return { ok: false, message: "Enter the whole number you rolled." };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("submit_manual_roll", { p_request: requestId, p_total: total });
  if (error) return { ok: false, message: friendlyRollError(error) };
  return { ok: true };
}

export async function closeRollRequest(requestId: string): Promise<RollActionResult> {
  if (!uuidSchema.safeParse(requestId).success) return { ok: false, message: "That request wasn’t valid." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("close_roll_request", { p_request: requestId });
  if (error) return { ok: false, message: friendlyRollError(error) };
  return { ok: true };
}
