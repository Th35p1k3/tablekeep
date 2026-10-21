import { z } from "zod";
import { FUNCTIONS, MAX_FORMULA_LENGTH } from "@/lib/formula";

export const MAX_SECTIONS = 30;
export const MAX_FIELDS_PER_SECTION = 100;
export const MAX_FIELDS_TOTAL = 300;

/** Names a field's short name may not use, because formulas give them meaning. */
export const RESERVED_KEYS = new Set([
  "and", "or", "not", "true", "false",
  ...FUNCTIONS.keys(),
  "constructor", "prototype", "toString", "valueOf", "hasOwnProperty",
]);

export const fieldKeySchema = z
  .string()
  .regex(
    /^[a-z][a-z0-9_]{0,39}$/,
    "Short names use lowercase letters, numbers and _ only, start with a letter, and are at most 40 characters.",
  )
  .refine((k) => !RESERVED_KEYS.has(k), {
    message: "That short name is reserved for formulas. Pick another.",
  });

const base = {
  id: z.string().min(1).max(40),
  key: fieldKeySchema,
  label: z.string().trim().min(1, "Give the field a label.").max(60, "Keep labels to 60 characters or fewer."),
  help: z.string().max(200, "Keep help text to 200 characters or fewer.").optional(),
};

const formula = z
  .string()
  .trim()
  .min(1, "Enter a formula.")
  .max(MAX_FORMULA_LENGTH, `Formulas can be at most ${MAX_FORMULA_LENGTH} characters.`);

export const numberFieldSchema = z.object({
  ...base,
  type: z.literal("number"),
  default: z.number().optional(),
  min: z.number().optional(),
  max: z.number().optional(),
});

export const textFieldSchema = z.object({
  ...base,
  type: z.literal("text"),
  default: z.string().max(200).optional(),
});

export const longTextFieldSchema = z.object({
  ...base,
  type: z.literal("longtext"),
  default: z.string().max(5000).optional(),
});

export const checkboxFieldSchema = z.object({
  ...base,
  type: z.literal("checkbox"),
  default: z.boolean().optional(),
});

export const choiceFieldSchema = z.object({
  ...base,
  type: z.literal("choice"),
  options: z
    .array(z.string().trim().min(1, "Options can’t be blank.").max(60))
    .min(1, "Add at least one option.")
    .max(50, "At most 50 options."),
  default: z.string().optional(),
});

export const resourceFieldSchema = z.object({
  ...base,
  type: z.literal("resource"),
  maxFormula: formula,
});

export const calculatedFieldSchema = z.object({
  ...base,
  type: z.literal("calculated"),
  formula,
  format: z.enum(["number", "modifier"]).default("number"),
});

export const fieldSchema = z.discriminatedUnion("type", [
  numberFieldSchema,
  textFieldSchema,
  longTextFieldSchema,
  checkboxFieldSchema,
  choiceFieldSchema,
  resourceFieldSchema,
  calculatedFieldSchema,
]);

export const sectionSchema = z.object({
  id: z.string().min(1).max(40),
  title: z.string().trim().min(1, "Give the section a title.").max(60, "Keep titles to 60 characters or fewer."),
  fields: z.array(fieldSchema).max(MAX_FIELDS_PER_SECTION, `At most ${MAX_FIELDS_PER_SECTION} fields per section.`),
});

export const templateDefinitionSchema = z.object({
  formatVersion: z.literal(1),
  sections: z
    .array(sectionSchema)
    .min(1, "Add at least one section.")
    .max(MAX_SECTIONS, `At most ${MAX_SECTIONS} sections.`),
});

export type TemplateField = z.infer<typeof fieldSchema>;
export type FieldType = TemplateField["type"];
export type TemplateSection = z.infer<typeof sectionSchema>;
export type TemplateDefinition = z.infer<typeof templateDefinitionSchema>;

export const FIELD_TYPE_LABEL: Record<FieldType, string> = {
  number: "Number",
  text: "Text",
  longtext: "Long text",
  checkbox: "Checkbox",
  choice: "Choice list",
  resource: "Resource (current / max)",
  calculated: "Calculated",
};

/** Field types whose value can be used inside a formula. */
export const NUMERIC_TYPES = new Set<FieldType>(["number", "checkbox", "resource", "calculated"]);
