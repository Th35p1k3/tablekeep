"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { uuidSchema } from "@/lib/campaigns/validation";
import { createClient } from "@/lib/supabase/server";
import { HANDOUT_FILE_TYPES, MAX_HANDOUT_FILE_BYTES, handoutSchema, pathBelongsTo } from "./rules";

export type HandoutResult = { ok: true } | { ok: false; message: string; fieldErrors?: Record<string, string> };

const inputSchema = handoutSchema.extend({
  recipients: z.array(uuidSchema).max(100),
});

const fileSchema = z
  .object({
    path: z.string().min(1).max(400),
    name: z.string().min(1).max(200),
    type: z.enum(HANDOUT_FILE_TYPES),
    size: z.number().int().min(1).max(MAX_HANDOUT_FILE_BYTES),
  })
  .nullable();

function problems(issues: ReadonlyArray<{ path: ReadonlyArray<PropertyKey>; message: string }>): Record<string, string> {
  const out: Record<string, string> = {};
  for (const i of issues) {
    const k = String(i.path[0] ?? "form");
    if (!(k in out)) out[k] = i.message;
  }
  return out;
}

function refresh(campaignId: string) {
  revalidatePath(`/campaigns/${campaignId}/handouts`);
  revalidatePath(`/campaigns/${campaignId}/activity`);
}

/**
 * Saves a new handout. If it has a file, the browser has already uploaded it
 * to <campaign>/<handout id>/…; the database checks you may do both.
 */
export async function createHandout(input: {
  id: string;
  campaignId: string;
  title: string;
  body: string;
  visibility: string;
  recipients: string[];
  file: { path: string; name: string; type: string; size: number } | null;
}): Promise<HandoutResult> {
  if (!uuidSchema.safeParse(input.id).success || !uuidSchema.safeParse(input.campaignId).success) {
    return { ok: false, message: "That request wasn’t valid." };
  }
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Check the handout details.", fieldErrors: problems(parsed.error.issues) };
  const file = fileSchema.safeParse(input.file);
  if (!file.success || (file.data && !pathBelongsTo(file.data.path, input.campaignId, input.id))) {
    return { ok: false, message: "That file couldn’t be attached. Try uploading it again." };
  }
  if (parsed.data.visibility === "selected" && parsed.data.recipients.length === 0) {
    return { ok: false, message: "Choose at least one player.", fieldErrors: { recipients: "Choose at least one player." } };
  }

  const supabase = await createClient();
  const { error } = await supabase.from("handouts").insert({
    id: input.id,
    campaign_id: input.campaignId,
    title: parsed.data.title,
    body: parsed.data.body,
    visibility: parsed.data.visibility,
    file_path: file.data?.path ?? null,
    file_name: file.data?.name.slice(0, 200) ?? null,
    file_type: file.data?.type ?? null,
    file_size: file.data?.size ?? null,
  });
  if (error) {
    console.error(`[handouts] create failed: ${error.message}`);
    return { ok: false, message: "Only DMs can add handouts to this campaign." };
  }
  if (parsed.data.visibility === "selected") {
    const { error: rErr } = await supabase
      .from("handout_recipients")
      .insert(parsed.data.recipients.map((user_id) => ({ handout_id: input.id, user_id })));
    if (rErr) {
      await supabase.from("handouts").delete().eq("id", input.id);
      return { ok: false, message: "Those players couldn’t be chosen. Are they all in the campaign?" };
    }
  }
  refresh(input.campaignId);
  return { ok: true };
}

export async function updateHandout(input: {
  id: string;
  campaignId: string;
  title: string;
  body: string;
  visibility: string;
  recipients: string[];
}): Promise<HandoutResult> {
  if (!uuidSchema.safeParse(input.id).success || !uuidSchema.safeParse(input.campaignId).success) {
    return { ok: false, message: "That request wasn’t valid." };
  }
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: "Check the handout details.", fieldErrors: problems(parsed.error.issues) };
  if (parsed.data.visibility === "selected" && parsed.data.recipients.length === 0) {
    return { ok: false, message: "Choose at least one player.", fieldErrors: { recipients: "Choose at least one player." } };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("handouts")
    .update({ title: parsed.data.title, body: parsed.data.body, visibility: parsed.data.visibility })
    .eq("id", input.id)
    .eq("campaign_id", input.campaignId)
    .select("id");
  if (error || !data?.length) return { ok: false, message: "Only DMs can change handouts." };

  await supabase.from("handout_recipients").delete().eq("handout_id", input.id);
  if (parsed.data.visibility === "selected") {
    const { error: rErr } = await supabase
      .from("handout_recipients")
      .insert(parsed.data.recipients.map((user_id) => ({ handout_id: input.id, user_id })));
    if (rErr) return { ok: false, message: "Those players couldn’t be chosen. Are they all in the campaign?" };
  }
  refresh(input.campaignId);
  return { ok: true };
}

export async function deleteHandout(campaignId: string, handoutId: string): Promise<HandoutResult> {
  if (!uuidSchema.safeParse(campaignId).success || !uuidSchema.safeParse(handoutId).success) {
    return { ok: false, message: "That request wasn’t valid." };
  }
  const supabase = await createClient();
  const { data: row } = await supabase
    .from("handouts")
    .select("file_path")
    .eq("id", handoutId)
    .eq("campaign_id", campaignId)
    .maybeSingle();
  const { data, error } = await supabase.from("handouts").delete().eq("id", handoutId).eq("campaign_id", campaignId).select("id");
  if (error || !data?.length) return { ok: false, message: "Only DMs can delete handouts." };
  const path = (row as { file_path?: string | null } | null)?.file_path;
  if (path) await supabase.storage.from("handouts").remove([path]);
  refresh(campaignId);
  return { ok: true };
}

/** Removes a file the browser uploaded when saving the handout then failed. */
export async function discardUpload(campaignId: string, handoutId: string, path: string): Promise<void> {
  if (!pathBelongsTo(path, campaignId, handoutId)) return;
  const supabase = await createClient();
  const { data } = await supabase.from("handouts").select("id").eq("id", handoutId).maybeSingle();
  if (!data) await supabase.storage.from("handouts").remove([path]);
}
