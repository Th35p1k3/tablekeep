import { z } from "zod";
import { computeSheet } from "@/lib/templates/compute";
import type { TemplateDefinition } from "@/lib/templates/schema";

/** "1d20", "2d6", "d8" → how many dice and how many sides. */
export function parseSimpleDice(text: string): { count: number; sides: number } | null {
  const m = /^\s*(\d*)\s*d\s*(\d+)\s*$/i.exec(text);
  if (!m) return null;
  const count = m[1] === "" ? 1 : Number(m[1]);
  const sides = Number(m[2]);
  if (count < 1 || count > 20 || sides < 2 || sides > 100) return null;
  return { count, sides };
}

export const rollRequestSchema = z.object({
  label: z.string().trim().min(1, "Name the check, for example Perception.").max(60, "Keep it to 60 characters or fewer."),
  dice: z
    .string()
    .refine((v) => parseSimpleDice(v) !== null, { message: "Use dice like 1d20 or 2d6 (up to 20 dice of up to 100 sides)." }),
  bonus: z
    .string()
    .trim()
    .refine((v) => v === "" || (/^[+-]?\d+$/.test(v) && Math.abs(Number(v)) <= 100), { message: "Use a whole number between -100 and 100." })
    .transform((v) => (v === "" ? 0 : Number(v))),
  modifierField: z
    .string()
    .trim()
    .refine((v) => v === "" || /^[a-z][a-z0-9_]{0,39}$/.test(v), { message: "Use a sheet short name like wisdom_mod (or leave it blank)." }),
  keep: z.enum(["normal", "highest", "lowest"]),
  share: z.boolean(),
});

/**
 * Reads a modifier from a character sheet by short name. Checkboxes count as
 * 1 or 0. Anything missing or broken counts as 0, with a label saying why.
 */
export function resolveModifier(
  definition: TemplateDefinition,
  data: Record<string, unknown>,
  field: string,
): { value: number; label: string } {
  const sheet = computeSheet(definition, data);
  const raw = sheet.values.get(field);
  if (raw === undefined) return { value: 0, label: `${field} isn’t on your sheet` };
  if (sheet.errors.has(field)) return { value: 0, label: `${field} has a problem on your sheet` };
  const n = typeof raw === "boolean" ? (raw ? 1 : 0) : raw;
  const value = Math.max(-100, Math.min(100, Math.round(n)));
  return { value, label: field };
}

/** "14 + 3 (wisdom_mod) + 2 = 19" style explanation of a roll. */
export function describeRoll(result: {
  method: "app" | "manual";
  dice: number[] | null;
  dice_other: number[] | null;
  modifier: number;
  modifier_label: string;
  total: number;
  bonus: number;
}): string {
  if (result.method === "manual") return `${result.total} (rolled at the table)`;
  const parts = [(result.dice ?? []).join(" + ") || "0"];
  if (result.bonus) parts.push(`${result.bonus > 0 ? "+" : "−"} ${Math.abs(result.bonus)}`);
  if (result.modifier) {
    parts.push(`${result.modifier > 0 ? "+" : "−"} ${Math.abs(result.modifier)}${result.modifier_label ? ` (${result.modifier_label})` : ""}`);
  }
  const other = result.dice_other?.length ? `; other roll ${result.dice_other.join(" + ")}` : "";
  return `${parts.join(" ")} = ${result.total}${other}`;
}

export function friendlyRollError(error: { message?: string } | null | undefined): string {
  const text = error?.message ?? "";
  if (text.includes("already_rolled")) return "You’ve already rolled for this.";
  if (text.includes("request_closed")) return "The DM has closed this roll.";
  if (text.includes("no_targets")) return "Choose at least one player to roll.";
  if (text.includes("not_a_member")) return "Everyone rolling must be in the campaign.";
  if (text.includes("not_allowed")) return "You don’t have permission to do that.";
  if (text.includes("invalid_input")) return "That number isn’t allowed.";
  return "Something went wrong. Please try again.";
}
