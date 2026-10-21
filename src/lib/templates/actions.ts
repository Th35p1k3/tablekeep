"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { type FormState, fieldErrorsFrom, textField } from "@/lib/forms";
import { createClient } from "@/lib/supabase/server";
import { uuidSchema } from "@/lib/campaigns/validation";
import { blankTemplate } from "./editing";
import { GENERIC_TEMPLATE_ERROR, friendlyTemplateError } from "./errors";
import { templateDefinitionSchema } from "./schema";
import { STARTER_TEMPLATE } from "./starter";
import { type TemplateIssue, validateTemplate } from "./validate";
import { z } from "zod";

const detailsSchema = z.object({
  name: z.string().trim().min(1, "Give the template a name.").max(80, "Keep the name to 80 characters or fewer."),
  gameSystem: z.string().trim().max(60, "Keep the game system to 60 characters or fewer."),
  description: z.string().trim().max(2000, "Keep the description to 2,000 characters or fewer."),
});

function failure(where: string, error: { message?: string } | null): FormState {
  const message = friendlyTemplateError(error);
  if (message === GENERIC_TEMPLATE_ERROR) {
    console.error(`[template] ${where} failed: ${error?.message ?? "unknown"}`);
  }
  return { status: "error", message };
}

function refresh(templateId?: string) {
  revalidatePath("/templates");
  if (templateId) revalidatePath(`/templates/${templateId}`);
}

const BAD_REQUEST: FormState = { status: "error", message: "That request wasn’t valid." };

function templateIdFrom(formData: FormData): string | null {
  const parsed = uuidSchema.safeParse(textField(formData, "templateId"));
  return parsed.success ? parsed.data : null;
}

export async function createTemplate(_prev: FormState, formData: FormData): Promise<FormState> {
  const values = {
    name: textField(formData, "name"),
    gameSystem: textField(formData, "gameSystem"),
    description: textField(formData, "description"),
    start: textField(formData, "start"),
  };
  const parsed = detailsSchema.safeParse(values);
  if (!parsed.success) {
    return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error.issues), values };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("create_template", {
    p_name: parsed.data.name,
    p_game_system: parsed.data.gameSystem,
    p_description: parsed.data.description,
    p_definition: values.start === "blank" ? blankTemplate() : STARTER_TEMPLATE,
  });
  if (error || typeof data !== "string") return { ...failure("create", error), values };
  refresh();
  redirect(`/templates/${data}`);
}

export async function updateTemplateDetails(_prev: FormState, formData: FormData): Promise<FormState> {
  const templateId = templateIdFrom(formData);
  if (!templateId) return BAD_REQUEST;
  const values = {
    name: textField(formData, "name"),
    gameSystem: textField(formData, "gameSystem"),
    description: textField(formData, "description"),
  };
  const parsed = detailsSchema.safeParse(values);
  if (!parsed.success) {
    return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error.issues), values };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sheet_templates")
    .update({
      name: parsed.data.name,
      game_system: parsed.data.gameSystem,
      description: parsed.data.description,
    })
    .eq("id", templateId)
    .select("id");
  if (error) return { ...failure("update details", error), values };
  if (!data?.length) return { status: "error", message: "You don’t have permission to do that.", values };
  refresh(templateId);
  return { status: "success", message: "Details saved.", values: parsed.data };
}

export type SaveResult =
  | { ok: true; version?: number }
  | { ok: false; message: string; issues?: TemplateIssue[] };

async function writeDraft(templateId: string, definition: unknown): Promise<SaveResult> {
  const shape = templateDefinitionSchema.safeParse(definition);
  if (!shape.success) {
    return {
      ok: false,
      message: "Fix the problems listed before saving.",
      issues: shape.error.issues.map((i) => ({ path: i.path.map(String).join("."), message: i.message })),
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("sheet_template_versions")
    .update({ definition: shape.data })
    .eq("template_id", templateId)
    .eq("status", "draft")
    .select("id");
  if (error) return { ok: false, message: friendlyTemplateError(error) };
  if (!data?.length) {
    return { ok: false, message: "There’s no draft to save. Reload the page and try again." };
  }
  return { ok: true };
}

/** Saves the draft. Unfinished formulas are allowed; the layout must be valid. */
export async function saveTemplateDraft(templateId: string, definition: unknown): Promise<SaveResult> {
  if (!uuidSchema.safeParse(templateId).success) return { ok: false, message: "That request wasn’t valid." };
  const result = await writeDraft(templateId, definition);
  if (result.ok) refresh(templateId);
  return result;
}

/** Saves the draft and, if every check passes, publishes it as a new version. */
export async function publishTemplateDraft(templateId: string, definition: unknown): Promise<SaveResult> {
  if (!uuidSchema.safeParse(templateId).success) return { ok: false, message: "That request wasn’t valid." };
  const check = validateTemplate(definition);
  if (!check.ok) {
    return { ok: false, message: "Fix the problems listed before publishing.", issues: check.issues };
  }
  const saved = await writeDraft(templateId, check.template);
  if (!saved.ok) return saved;

  const supabase = await createClient();
  const { data, error } = await supabase.rpc("publish_template", { p_template: templateId });
  if (error || typeof data !== "number") {
    if (error && friendlyTemplateError(error) === GENERIC_TEMPLATE_ERROR) {
      console.error(`[template] publish failed: ${error.message}`);
    }
    return { ok: false, message: friendlyTemplateError(error) };
  }
  refresh(templateId);
  return { ok: true, version: data };
}

export async function startTemplateDraft(_prev: FormState, formData: FormData): Promise<FormState> {
  const templateId = templateIdFrom(formData);
  if (!templateId) return BAD_REQUEST;
  const supabase = await createClient();
  const { error } = await supabase.rpc("start_template_draft", { p_template: templateId });
  if (error) return failure("start draft", error);
  refresh(templateId);
  redirect(`/templates/${templateId}`);
}

export async function discardTemplateDraft(_prev: FormState, formData: FormData): Promise<FormState> {
  const templateId = templateIdFrom(formData);
  if (!templateId) return BAD_REQUEST;
  const supabase = await createClient();
  const { error } = await supabase.rpc("discard_template_draft", { p_template: templateId });
  if (error) return failure("discard draft", error);
  refresh(templateId);
  redirect(`/templates/${templateId}`);
}

export async function duplicateTemplate(_prev: FormState, formData: FormData): Promise<FormState> {
  const templateId = templateIdFrom(formData);
  if (!templateId) return BAD_REQUEST;
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("duplicate_template", { p_template: templateId });
  if (error || typeof data !== "string") return failure("duplicate", error);
  refresh();
  redirect(`/templates/${data}`);
}

export async function deleteTemplate(_prev: FormState, formData: FormData): Promise<FormState> {
  const templateId = templateIdFrom(formData);
  if (!templateId) return BAD_REQUEST;
  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_template", { p_template: templateId });
  if (error) return failure("delete", error);
  refresh();
  redirect("/templates");
}
