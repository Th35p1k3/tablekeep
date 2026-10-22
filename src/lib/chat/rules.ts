import { z } from "zod";
type CampaignRole = "owner" | "co_dm" | "player";

export const MAX_MESSAGE_LENGTH = 2000;

export const messageBodySchema = z
  .string()
  .trim()
  .min(1, "Type a message first.")
  .max(MAX_MESSAGE_LENGTH, `Messages can be at most ${MAX_MESSAGE_LENGTH} characters.`);

export type ChatMember = { user_id: string; display_name: string; role: CampaignRole };

/**
 * Who you may whisper to: DMs and Co-DMs can whisper to anyone else in the
 * campaign; players only to DMs and Co-DMs.
 */
export function whisperTargets(members: ChatMember[], me: string, myRole: CampaignRole): ChatMember[] {
  const others = members.filter((m) => m.user_id !== me);
  return myRole === "player" ? others.filter((m) => m.role !== "player") : others;
}

/** Checks a chosen recipient list against the rule above. */
export function recipientsAllowed(
  recipients: string[] | null,
  members: ChatMember[],
  me: string,
  myRole: CampaignRole,
): boolean {
  if (recipients === null) return true;
  if (recipients.length === 0 || recipients.length > 50) return false;
  const allowed = new Set(whisperTargets(members, me, myRole).map((m) => m.user_id));
  return recipients.every((r) => allowed.has(r));
}

/** "Whisper to Bram and Mira" / "Whisper to you" style labels. */
export function whisperLabel(recipients: string[], me: string, nameOf: (id: string) => string): string {
  const names = recipients.map((r) => (r === me ? "you" : nameOf(r)));
  if (names.length <= 2) return `Whisper to ${names.join(" and ")}`;
  return `Whisper to ${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`;
}

export function friendlyChatError(error: { message?: string } | null | undefined): string {
  const text = error?.message ?? "";
  if (text.includes("slow_down")) return "You’re sending messages very fast. Wait a few seconds and try again.";
  if (text.includes("row-level security") || text.includes("permission")) {
    return "That message couldn’t be sent. Players can only whisper to DMs.";
  }
  return "Couldn’t send that message. Check your connection and try again.";
}
