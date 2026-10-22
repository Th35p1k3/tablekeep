"use server";

import { revalidatePath } from "next/cache";
import { uuidSchema } from "@/lib/campaigns/validation";
import { type FormState, fieldErrorsFrom, textField } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { announcementSchema, dmNoteSchema, sessionLogSchema } from "./rules";

const BAD_REQUEST: FormState = { status: "error", message: "That request wasn’t valid." };
const NOT_ALLOWED: FormState = { status: "error", message: "You don’t have permission to do that." };

function uuid(formData: FormData, name: string): string | null {
  const parsed = uuidSchema.safeParse(textField(formData, name));
  return parsed.success ? parsed.data : null;
}

function optionalUuid(formData: FormData, name: string): string | null | "invalid" {
  const raw = textField(formData, name);
  if (!raw) return null;
  return uuidSchema.safeParse(raw).success ? raw : "invalid";
}

function refresh(campaignId: string) {
  for (const tab of ["", "/logs", "/notes", "/activity", "/settings"]) {
    revalidatePath(`/campaigns/${campaignId}${tab}`);
  }
}

function dbFailure(where: string, error: { message?: string } | null, values?: Record<string, string>): FormState {
  if (error) console.error(`[campaign tools] ${where} failed: ${error.message}`);
  return { ...NOT_ALLOWED, values };
}

// ---------- Announcements ----------

export async function saveAnnouncement(_prev: FormState, formData: FormData): Promise<FormState> {
  const campaignId = uuid(formData, "campaignId");
  const id = optionalUuid(formData, "announcementId");
  if (!campaignId || id === "invalid") return BAD_REQUEST;
  const values = { title: textField(formData, "title"), body: textField(formData, "body") };
  const parsed = announcementSchema.safeParse({ ...values, pinned: formData.get("pinned") === "on" });
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error.issues), values };

  const supabase = await createClient();
  const { data, error } = id
    ? await supabase.from("announcements").update(parsed.data).eq("id", id).eq("campaign_id", campaignId).select("id")
    : await supabase.from("announcements").insert({ campaign_id: campaignId, ...parsed.data }).select("id");
  if (error || !data?.length) return dbFailure("save announcement", error, values);
  refresh(campaignId);
  return { status: "success", message: id ? "Announcement updated." : "Announcement posted." };
}

export async function deleteAnnouncement(_prev: FormState, formData: FormData): Promise<FormState> {
  const campaignId = uuid(formData, "campaignId");
  const id = uuid(formData, "announcementId");
  if (!campaignId || !id) return BAD_REQUEST;
  const supabase = await createClient();
  const { data, error } = await supabase.from("announcements").delete().eq("id", id).eq("campaign_id", campaignId).select("id");
  if (error || !data?.length) return dbFailure("delete announcement", error);
  refresh(campaignId);
  return { status: "success", message: "Announcement deleted." };
}

export async function toggleAnnouncementPin(_prev: FormState, formData: FormData): Promise<FormState> {
  const campaignId = uuid(formData, "campaignId");
  const id = uuid(formData, "announcementId");
  if (!campaignId || !id) return BAD_REQUEST;
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("announcements")
    .update({ pinned: textField(formData, "pinned") === "true" })
    .eq("id", id)
    .eq("campaign_id", campaignId)
    .select("id");
  if (error || !data?.length) return dbFailure("pin announcement", error);
  refresh(campaignId);
  return { status: "success", message: "Updated." };
}

// ---------- Session logs ----------

export async function saveSessionLog(_prev: FormState, formData: FormData): Promise<FormState> {
  const campaignId = uuid(formData, "campaignId");
  const id = optionalUuid(formData, "logId");
  if (!campaignId || id === "invalid") return BAD_REQUEST;
  const values = {
    title: textField(formData, "title"),
    body: textField(formData, "body"),
    sessionNumber: textField(formData, "sessionNumber"),
    playedOn: textField(formData, "playedOn"),
    visibility: textField(formData, "visibility") || "players",
  };
  const parsed = sessionLogSchema.safeParse(values);
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error.issues), values };

  const row = {
    title: parsed.data.title,
    body: parsed.data.body,
    session_number: parsed.data.sessionNumber,
    played_on: parsed.data.playedOn,
    visibility: parsed.data.visibility,
  };
  const supabase = await createClient();
  const { data, error } = id
    ? await supabase.from("session_logs").update(row).eq("id", id).eq("campaign_id", campaignId).select("id")
    : await supabase.from("session_logs").insert({ campaign_id: campaignId, ...row }).select("id");
  if (error || !data?.length) return dbFailure("save session log", error, values);
  refresh(campaignId);
  return { status: "success", message: id ? "Log updated." : "Log saved." };
}

export async function deleteSessionLog(_prev: FormState, formData: FormData): Promise<FormState> {
  const campaignId = uuid(formData, "campaignId");
  const id = uuid(formData, "logId");
  if (!campaignId || !id) return BAD_REQUEST;
  const supabase = await createClient();
  const { data, error } = await supabase.from("session_logs").delete().eq("id", id).eq("campaign_id", campaignId).select("id");
  if (error || !data?.length) return dbFailure("delete session log", error);
  refresh(campaignId);
  return { status: "success", message: "Log deleted." };
}

export async function setPlayersWriteLogs(_prev: FormState, formData: FormData): Promise<FormState> {
  const campaignId = uuid(formData, "campaignId");
  if (!campaignId) return BAD_REQUEST;
  const allow = textField(formData, "allow") === "true";
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("campaigns")
    .update({ players_write_logs: allow })
    .eq("id", campaignId)
    .select("id");
  if (error || !data?.length) return dbFailure("log setting", error);
  refresh(campaignId);
  return { status: "success", message: allow ? "Players can now write session logs." : "Only DMs can write session logs now." };
}

// ---------- DM notes ----------

export async function saveDmNote(_prev: FormState, formData: FormData): Promise<FormState> {
  const campaignId = uuid(formData, "campaignId");
  const id = optionalUuid(formData, "noteId");
  const characterId = optionalUuid(formData, "characterId");
  const logId = optionalUuid(formData, "sessionLogId");
  if (!campaignId || id === "invalid" || characterId === "invalid" || logId === "invalid") return BAD_REQUEST;
  const values = { title: textField(formData, "title"), body: textField(formData, "body") };
  const parsed = dmNoteSchema.safeParse(values);
  if (!parsed.success) return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error.issues), values };

  const row = { ...parsed.data, character_id: characterId, session_log_id: logId };
  const supabase = await createClient();
  const { data, error } = id
    ? await supabase.from("dm_notes").update(row).eq("id", id).eq("campaign_id", campaignId).select("id")
    : await supabase.from("dm_notes").insert({ campaign_id: campaignId, ...row }).select("id");
  if (error || !data?.length) return dbFailure("save note", error, values);
  refresh(campaignId);
  return { status: "success", message: id ? "Note updated." : "Note saved." };
}

export async function deleteDmNote(_prev: FormState, formData: FormData): Promise<FormState> {
  const campaignId = uuid(formData, "campaignId");
  const id = uuid(formData, "noteId");
  if (!campaignId || !id) return BAD_REQUEST;
  const supabase = await createClient();
  const { data, error } = await supabase.from("dm_notes").delete().eq("id", id).eq("campaign_id", campaignId).select("id");
  if (error || !data?.length) return dbFailure("delete note", error);
  refresh(campaignId);
  return { status: "success", message: "Note deleted." };
}
