import { z } from "zod";

export type SubmissionStatus = "pending" | "approved" | "rejected" | "changes_requested";
export type ContentType = "spell" | "template";

export const STATUS_LABEL: Record<SubmissionStatus, string> = {
  pending: "Waiting for review",
  approved: "Approved",
  rejected: "Not approved",
  changes_requested: "Changes requested",
};

export const reviewSchema = z.object({
  decision: z.enum(["approved", "rejected", "changes_requested"]),
  note: z.string().trim().max(1000, "Keep the note to 1,000 characters or fewer."),
});

/** Asking for changes without saying what to change helps nobody. */
export function reviewProblem(decision: string, note: string): string | null {
  const parsed = reviewSchema.safeParse({ decision, note });
  if (!parsed.success) return parsed.error.issues[0]?.message ?? "Check the review.";
  if (parsed.data.decision === "changes_requested" && !parsed.data.note) {
    return "Say what should change, so the player knows what to fix.";
  }
  return null;
}

/** Encodes what's being submitted in one select value: "spell:<id>". */
export function encodeSubmittable(type: ContentType, versionId: string): string {
  return `${type}:${versionId}`;
}

export function decodeSubmittable(value: string): { type: ContentType; versionId: string } | null {
  const match = /^(spell|template):([0-9a-f-]{36})$/i.exec(value);
  return match ? { type: match[1] as ContentType, versionId: match[2] } : null;
}

const MESSAGES: Array<[string, string]> = [
  ["not_allowed", "You don’t have permission to do that."],
  ["not_your_content", "You can only submit published versions of your own spells and templates."],
  ["already_approved", "That version is already approved for this campaign."],
  ["already_pending", "That version is already waiting for review."],
  ["already_reviewed", "Someone already reviewed this submission."],
  ["invalid_input", "That request wasn’t valid."],
];

export const GENERIC_HOMEBREW_ERROR = "Something went wrong. Please try again.";

export function friendlyHomebrewError(error: { message?: string } | null | undefined): string {
  const text = error?.message ?? "";
  for (const [code, message] of MESSAGES) {
    if (text.includes(code)) return message;
  }
  return GENERIC_HOMEBREW_ERROR;
}
