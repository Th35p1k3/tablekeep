import { z } from "zod";

const title = z.string().trim().min(1, "Give it a title.").max(120, "Keep the title to 120 characters or fewer.");

export const announcementSchema = z.object({
  title,
  body: z.string().trim().max(5000, "Keep it to 5,000 characters or fewer."),
  pinned: z.boolean(),
});

export const sessionLogSchema = z.object({
  title,
  body: z.string().trim().max(20000, "Keep the recap to 20,000 characters or fewer."),
  sessionNumber: z
    .string()
    .trim()
    .refine((v) => v === "" || (/^\d+$/.test(v) && Number(v) <= 10000), { message: "Use a whole number (or leave it blank)." })
    .transform((v) => (v === "" ? null : Number(v))),
  playedOn: z
    .string()
    .trim()
    .refine((v) => v === "" || (/^\d{4}-\d{2}-\d{2}$/.test(v) && !Number.isNaN(Date.parse(v))), { message: "Pick a date (or leave it blank)." })
    .transform((v) => (v === "" ? null : v)),
  visibility: z.enum(["players", "dm_only"]),
});

export const dmNoteSchema = z.object({
  title,
  body: z.string().trim().max(20000, "Keep the note to 20,000 characters or fewer."),
});

export type Activity = {
  action: string;
  details: Record<string, unknown>;
  actorName: string;
};

const SETTING_LABEL: Record<string, [string, string]> = {
  players_see_full_sheets: ["let players see full character sheets", "showed players names only"],
  spells_need_approval: ["required approval for spells", "let players use their own spells"],
  players_write_logs: ["let players write session logs", "stopped players writing session logs"],
};

const ROLE: Record<string, string> = { owner: "DM", co_dm: "Co-DM", player: "Player" };

const DECISION: Record<string, string> = {
  approved: "approved",
  rejected: "didn’t approve",
  changes_requested: "asked for changes to",
};

/** Turns an activity log entry into a sentence a person can read. */
export function describeActivity(entry: Activity, nameOf: (userId: string) => string): string {
  const who = entry.actorName;
  const d = entry.details;
  const user = typeof d.user_id === "string" ? nameOf(d.user_id) : "someone";
  const text = (key: string) => (typeof d[key] === "string" ? (d[key] as string) : "");

  switch (entry.action) {
    case "member_joined":
      return text("role") === "owner" ? `${user} created the campaign.` : `${user} joined the campaign.`;
    case "member_left":
      return `${user} left the campaign.`;
    case "member_removed":
      return `${who} removed ${user} from the campaign.`;
    case "role_changed":
      return `${who} changed ${user} from ${ROLE[text("from")] ?? text("from")} to ${ROLE[text("to")] ?? text("to")}.`;
    case "campaign_renamed":
      return `${who} renamed the campaign from “${text("from")}” to “${text("to")}”.`;
    case "campaign_archived":
      return `${who} archived the campaign.`;
    case "campaign_restored":
      return `${who} restored the campaign.`;
    case "setting_changed": {
      const labels = SETTING_LABEL[text("setting")];
      if (!labels) return `${who} changed a setting.`;
      return `${who} ${d.value === true ? labels[0] : labels[1]}.`;
    }
    case "submission_reviewed":
      return `${who} ${DECISION[text("decision")] ?? "reviewed"} a ${text("type") === "template" ? "sheet template" : "spell"} from ${user}.`;
    case "invite_created":
      return `${who} created an invite link.`;
    case "invite_cancelled":
      return `${who} cancelled an invite link.`;
    case "spell_added":
      return `${who} added a spell to the campaign list.`;
    case "spell_removed":
      return `${who} removed a spell from the campaign list.`;
    case "template_offered":
      return `${who} offered a sheet template.`;
    case "template_withdrawn":
      return `${who} withdrew a sheet template.`;
    case "log_deleted":
      return `${who} deleted the session log “${text("title")}”.`;
    case "announcement_deleted":
      return `${who} deleted the announcement “${text("title")}”.`;
    default:
      return `${who} did something (${entry.action}).`;
  }
}
