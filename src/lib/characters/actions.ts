"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { uuidSchema } from "@/lib/campaigns/validation";
import { type FormState, textField } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { characterDataSchema, characterNameSchema } from "./data";
import { GENERIC_CHARACTER_ERROR, friendlyCharacterError } from "./errors";
import { type RestorePoint, loadRestorePoints } from "./queries";

const BAD_REQUEST: FormState = { status: "error", message: "That request wasn’t valid." };

function failure(where: string, error: { message?: string } | null): FormState {
  const message = friendlyCharacterError(error);
  if (message === GENERIC_CHARACTER_ERROR) {
    console.error(`[character] ${where} failed: ${error?.message ?? "unknown"}`);
  }
  return { status: "error", message };
}

function idFrom(formData: FormData, name = "characterId"): string | null {
  const parsed = uuidSchema.safeParse(textField(formData, name));
  return parsed.success ? parsed.data : null;
}

export async function createCharacter(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = { name: textField(formData, "name"), versionId: textField(formData, "versionId") };
  const name = characterNameSchema.safeParse(values.name);
  const version = uuidSchema.safeParse(values.versionId);
  if (!name.success || !version.success) {
    return {
      status: "error",
      fieldErrors: {
        ...(name.success ? {} : { name: name.error.issues[0]?.message ?? "Check the name." }),
        ...(version.success ? {} : { versionId: "Choose a template." }),
      },
      values,
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_character", {
    p_name: name.data,
    p_template_version: version.data,
  });
  if (error || typeof data !== "string") return { ...failure("create", error), values };
  revalidatePath("/characters");
  redirect(`/characters/${data}`);
}

export async function renameCharacter(_prev: FormState, formData: FormData): Promise<FormState> {
  const characterId = idFrom(formData);
  if (!characterId) return BAD_REQUEST;
  const values = { name: textField(formData, "name") };
  const name = characterNameSchema.safeParse(values.name);
  if (!name.success) {
    return { status: "error", fieldErrors: { name: name.error.issues[0]?.message ?? "Check the name." }, values };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("characters")
    .update({ name: name.data })
    .eq("id", characterId)
    .select("id");
  if (error) return { ...failure("rename", error), values };
  if (!data?.length) return { status: "error", message: "You don’t have permission to do that.", values };
  revalidatePath("/characters");
  revalidatePath(`/characters/${characterId}`);
  return { status: "success", message: "Name saved.", values: { name: name.data } };
}

export async function duplicateCharacter(_prev: FormState, formData: FormData): Promise<FormState> {
  const characterId = idFrom(formData);
  if (!characterId) return BAD_REQUEST;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("duplicate_character", { p_character: characterId });
  if (error || typeof data !== "string") return failure("duplicate", error);
  revalidatePath("/characters");
  redirect(`/characters/${data}`);
}

export async function deleteCharacter(_prev: FormState, formData: FormData): Promise<FormState> {
  const characterId = idFrom(formData);
  if (!characterId) return BAD_REQUEST;
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_character", { p_character: characterId });
  if (error) return failure("delete", error);
  revalidatePath("/characters");
  redirect("/characters");
}

export type SaveDataResult =
  | { ok: true; updatedAt: string }
  | { ok: false; conflict: boolean; message: string };

/**
 * Autosave. Only writes if the character hasn't changed since this browser
 * last saw it, so two devices can't silently overwrite each other.
 */
export async function saveCharacterData(
  characterId: string,
  data: unknown,
  expectedUpdatedAt: string,
): Promise<SaveDataResult> {
  if (!uuidSchema.safeParse(characterId).success) {
    return { ok: false, conflict: false, message: "That request wasn’t valid." };
  }
  const parsed = characterDataSchema.safeParse(data);
  if (!parsed.success) {
    return { ok: false, conflict: false, message: parsed.error.issues[0]?.message ?? "Some values aren’t valid." };
  }

  const supabase = await createClient();
  const { data: rows, error } = await supabase
    .from("characters")
    .update({ data: parsed.data })
    .eq("id", characterId)
    .eq("updated_at", expectedUpdatedAt)
    .select("updated_at");
  if (error) {
    console.error(`[character] autosave failed: ${error.message}`);
    return { ok: false, conflict: false, message: "Couldn’t save. Check your connection." };
  }
  if (!rows?.length) {
    return {
      ok: false,
      conflict: true,
      message: "This character was changed somewhere else (another tab or device). Reload to see the latest version.",
    };
  }
  return { ok: true, updatedAt: (rows[0] as { updated_at: string }).updated_at };
}

export type RestorePointResult =
  | { ok: true; points: RestorePoint[]; data?: Record<string, unknown>; updatedAt?: string }
  | { ok: false; message: string };

export async function createRestorePoint(characterId: string, label: string): Promise<RestorePointResult> {
  if (!uuidSchema.safeParse(characterId).success) return { ok: false, message: "That request wasn’t valid." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("create_character_snapshot", {
    p_character: characterId,
    p_label: label.slice(0, 80),
  });
  if (error) return { ok: false, message: failure("save restore point", error).message ?? GENERIC_CHARACTER_ERROR };
  return { ok: true, points: await loadRestorePoints(supabase, characterId) };
}

export async function restoreRestorePoint(characterId: string, snapshotId: string): Promise<RestorePointResult> {
  if (!uuidSchema.safeParse(characterId).success || !uuidSchema.safeParse(snapshotId).success) {
    return { ok: false, message: "That request wasn’t valid." };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("restore_character_snapshot", { p_snapshot: snapshotId });
  if (error) return { ok: false, message: failure("restore", error).message ?? GENERIC_CHARACTER_ERROR };

  const { data: row } = await supabase
    .from("characters")
    .select("data, updated_at")
    .eq("id", characterId)
    .maybeSingle();
  const character = row as { data: Record<string, unknown>; updated_at: string } | null;
  if (!character) return { ok: false, message: GENERIC_CHARACTER_ERROR };
  return {
    ok: true,
    points: await loadRestorePoints(supabase, characterId),
    data: character.data,
    updatedAt: character.updated_at,
  };
}

export async function deleteRestorePoint(characterId: string, snapshotId: string): Promise<RestorePointResult> {
  if (!uuidSchema.safeParse(characterId).success || !uuidSchema.safeParse(snapshotId).success) {
    return { ok: false, message: "That request wasn’t valid." };
  }
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_character_snapshot", { p_snapshot: snapshotId });
  if (error) return { ok: false, message: failure("delete restore point", error).message ?? GENERIC_CHARACTER_ERROR };
  return { ok: true, points: await loadRestorePoints(supabase, characterId) };
}
