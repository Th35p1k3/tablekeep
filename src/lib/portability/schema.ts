import { z } from "zod";

export const EXPORT_FORMAT = "tablekeep-export";
export const EXPORT_VERSION = 1;
export const MAX_IMPORT_BYTES = 20 * 1024 * 1024;

const version = z.object({
  status: z.enum(["draft", "published"]),
  version_number: z.number().int().nullable(),
  body: z.unknown(),
});

export const templateItemSchema = z.object({
  name: z.string().trim().min(1).max(80),
  game_system: z.string().max(60).default(""),
  description: z.string().max(2000).default(""),
  versions: z.array(version).min(1).max(200),
});

export const spellItemSchema = z.object({
  name: z.string().trim().min(1).max(80),
  versions: z.array(version).min(1).max(200),
});

export const presetItemSchema = z.object({
  name: z.string().trim().min(1).max(60),
  effect: z.unknown(),
});

export const characterItemSchema = z.object({
  name: z.string().trim().min(1).max(80),
  template: z.object({
    name: z.string().trim().min(1).max(80),
    version_number: z.number().int().nullable(),
    definition: z.unknown(),
  }),
  data: z.record(z.string(), z.unknown()),
  inventory: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(80),
        quantity: z.number().int().min(0).max(1_000_000),
        weight: z.number().min(0).max(100_000).nullable(),
        notes: z.string().max(500).default(""),
      }),
    )
    .max(500)
    .default([]),
  spells: z
    .array(
      z.object({
        name: z.string().trim().min(1).max(80),
        content: z.unknown(),
        known: z.boolean().default(true),
        prepared: z.boolean().default(false),
      }),
    )
    .max(500)
    .default([]),
});

/** The outer shape of an export file. Items are checked one by one on import. */
export const exportFileSchema = z.object({
  format: z.literal(EXPORT_FORMAT),
  version: z.literal(EXPORT_VERSION),
  exportedAt: z.string(),
  templates: z.array(z.unknown()).default([]),
  spells: z.array(z.unknown()).default([]),
  effectPresets: z.array(z.unknown()).default([]),
  characters: z.array(z.unknown()).default([]),
});

export type TemplateItem = z.infer<typeof templateItemSchema>;
export type SpellItem = z.infer<typeof spellItemSchema>;
export type PresetItem = z.infer<typeof presetItemSchema>;
export type CharacterItem = z.infer<typeof characterItemSchema>;

/** Reads an export file's text; says plainly what's wrong if it can't. */
export function readExportFile(text: string):
  | { ok: true; file: z.infer<typeof exportFileSchema> }
  | { ok: false; message: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { ok: false, message: "That file isn’t a Tablekeep export (it isn’t valid JSON)." };
  }
  const parsed = exportFileSchema.safeParse(raw);
  if (!parsed.success) {
    const fmt = (raw as { format?: unknown } | null)?.format;
    return {
      ok: false,
      message:
        fmt === EXPORT_FORMAT
          ? "This export was made by a different version of Tablekeep and can’t be read."
          : "That file isn’t a Tablekeep export.",
    };
  }
  return { ok: true, file: parsed.data };
}

/** Published versions oldest first, then the draft (if any) last. */
export function versionsInOrder<T extends { status: "draft" | "published"; version_number: number | null }>(versions: T[]): T[] {
  const published = versions
    .filter((v) => v.status === "published")
    .sort((a, b) => (a.version_number ?? 0) - (b.version_number ?? 0));
  const draft = versions.find((v) => v.status === "draft");
  return draft ? [...published, draft] : published;
}
