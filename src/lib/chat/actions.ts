"use server";

import { z } from "zod";
import { uuidSchema } from "@/lib/campaigns/validation";
import { createClient } from "@/lib/supabase/server";
import { type ChatMessage, loadMessages, loadNewerMessages } from "./queries";
import { friendlyChatError, messageBodySchema } from "./rules";

export type SendResult = { ok: true; message: ChatMessage } | { ok: false; message: string };

const recipientsSchema = z.array(uuidSchema).min(1).max(50).nullable();

export async function sendMessage(campaignId: string, body: string, recipients: string[] | null): Promise<SendResult> {
  if (!uuidSchema.safeParse(campaignId).success) return { ok: false, message: "That request wasn’t valid." };
  const text = messageBodySchema.safeParse(body);
  if (!text.success) return { ok: false, message: text.error.issues[0]?.message ?? "Check your message." };
  const to = recipientsSchema.safeParse(recipients && recipients.length ? [...new Set(recipients)] : null);
  if (!to.success) return { ok: false, message: "Choose who the whisper is for." };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("messages")
    .insert({ campaign_id: campaignId, body: text.data, recipients: to.data })
    .select("id, author_id, body, recipients, created_at, edited_at")
    .single();
  if (error || !data) {
    if (error) console.error(`[chat] send failed: ${error.message}`);
    return { ok: false, message: friendlyChatError(error) };
  }
  return { ok: true, message: data as ChatMessage };
}

export async function editMessage(messageId: string, body: string): Promise<SendResult> {
  if (!uuidSchema.safeParse(messageId).success) return { ok: false, message: "That request wasn’t valid." };
  const text = messageBodySchema.safeParse(body);
  if (!text.success) return { ok: false, message: text.error.issues[0]?.message ?? "Check your message." };
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("messages")
    .update({ body: text.data })
    .eq("id", messageId)
    .select("id, author_id, body, recipients, created_at, edited_at")
    .maybeSingle();
  if (error || !data) return { ok: false, message: "You can only edit your own messages." };
  return { ok: true, message: data as ChatMessage };
}

export async function deleteMessage(messageId: string): Promise<{ ok: boolean; message?: string }> {
  if (!uuidSchema.safeParse(messageId).success) return { ok: false, message: "That request wasn’t valid." };
  const supabase = await createClient();
  const { data, error } = await supabase.from("messages").delete().eq("id", messageId).select("id");
  if (error || !data?.length) return { ok: false, message: "You can’t delete that message." };
  return { ok: true };
}

export async function loadOlderMessages(
  campaignId: string,
  before: string,
): Promise<{ ok: true; messages: ChatMessage[]; hasMore: boolean } | { ok: false }> {
  if (!uuidSchema.safeParse(campaignId).success || Number.isNaN(Date.parse(before))) return { ok: false };
  const supabase = await createClient();
  return { ok: true, ...(await loadMessages(supabase, campaignId, before)) };
}

export async function catchUpMessages(
  campaignId: string,
  after: string | null,
): Promise<{ ok: true; messages: ChatMessage[] } | { ok: false }> {
  if (!uuidSchema.safeParse(campaignId).success) return { ok: false };
  const supabase = await createClient();
  if (!after || Number.isNaN(Date.parse(after))) {
    return { ok: true, messages: (await loadMessages(supabase, campaignId)).messages };
  }
  return { ok: true, messages: await loadNewerMessages(supabase, campaignId, after) };
}
