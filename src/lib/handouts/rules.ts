import { z } from "zod";

export const MAX_HANDOUT_FILE_BYTES = 10 * 1024 * 1024;
export const HANDOUT_FILE_TYPES = ["image/jpeg", "image/png", "image/webp", "application/pdf"] as const;
export type HandoutFileType = (typeof HANDOUT_FILE_TYPES)[number];

export const handoutSchema = z.object({
  title: z.string().trim().min(1, "Give the handout a title.").max(120, "Keep the title to 120 characters or fewer."),
  body: z.string().trim().max(10000, "Keep the text to 10,000 characters or fewer."),
  visibility: z.enum(["all", "selected", "dm_only"]),
});

/** Checks a file before uploading. Returns a problem to show, or null. */
export function fileProblem(file: { size: number; type: string }): string | null {
  if (!HANDOUT_FILE_TYPES.includes(file.type as HandoutFileType)) {
    return "Handout files can be JPG, PNG or WebP images, or PDFs.";
  }
  if (file.size <= 0) return "That file is empty.";
  if (file.size > MAX_HANDOUT_FILE_BYTES) return "Handout files can be at most 10 MB.";
  return null;
}

/** A storage-safe version of a file name: letters, numbers, dot, dash, underscore. */
export function safeFileName(input: string): string {
  // Keep only the last part of any path ("../../x.png" -> "x.png").
  const name = input.split(/[\\/]/).pop() ?? "";
  const dot = name.lastIndexOf(".");
  const base = (dot > 0 ? name.slice(0, dot) : name)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\w.-]+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 80);
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase().replace(/[^a-z0-9]/g, "").slice(0, 8) : "";
  return `${base || "file"}${ext ? `.${ext}` : ""}`;
}

/** Where a handout's file is stored: <campaign>/<handout>/<file>. */
export function handoutFilePath(campaignId: string, handoutId: string, fileName: string): string {
  return `${campaignId}/${handoutId}/${safeFileName(fileName)}`;
}

export function pathBelongsTo(path: string, campaignId: string, handoutId: string): boolean {
  const prefix = `${campaignId}/${handoutId}/`;
  return path.startsWith(prefix) && path.length > prefix.length && !path.slice(prefix.length).includes("/");
}

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 102.4) / 10} KB`;
  return `${Math.round(bytes / (1024 * 102.4)) / 10} MB`;
}
