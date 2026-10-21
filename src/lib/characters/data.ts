import { z } from "zod";
import { type SheetInput, computeSheet } from "@/lib/templates/compute";
import type { TemplateDefinition } from "@/lib/templates/schema";

export const MAX_CHARACTER_KEYS = 400;

/**
 * What a character's sheet values may look like when saved. Values are kept
 * even for fields a template no longer has, so nothing is lost on upgrades.
 */
export const characterDataSchema = z
  .record(
    z.string().regex(/^[a-z][a-z0-9_]{0,39}$/, "Unexpected field name."),
    z.union([z.string().max(5000, "A value is too long."), z.number(), z.boolean(), z.null()]),
  )
  .refine((d) => Object.keys(d).length <= MAX_CHARACTER_KEYS, {
    message: "This character has too many values.",
  });

export type CharacterData = z.infer<typeof characterDataSchema>;

export const characterNameSchema = z
  .string()
  .trim()
  .min(1, "Give the character a name.")
  .max(80, "Keep the name to 80 characters or fewer.");

/** Short names of every resource field (hit points, spell slots …). */
export function resourceKeys(definition: TemplateDefinition): string[] {
  return definition.sections.flatMap((s) =>
    s.fields.filter((f) => f.type === "resource").map((f) => f.key),
  );
}

/**
 * Refills resources to their maximum: one (by short name) or all of them.
 * Returns a new copy; resources whose maximum can't be calculated are left alone.
 */
export function refillResources(
  definition: TemplateDefinition,
  data: SheetInput,
  only?: string,
): SheetInput {
  const { maxima } = computeSheet(definition, data);
  const next: SheetInput = { ...data };
  for (const key of resourceKeys(definition)) {
    if (only !== undefined && key !== only) continue;
    const max = maxima.get(key);
    if (max !== undefined) next[key] = max;
  }
  return next;
}
