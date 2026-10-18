import { z } from "zod";

export const uuidSchema = z.uuid();

/** Invite tokens are 48 lowercase hex characters. */
export const inviteTokenSchema = z.string().regex(/^[0-9a-f]{48}$/);

export const campaignDetailsSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Give the campaign a name.")
    .max(80, "Keep the name to 80 characters or fewer."),
  gameSystem: z
    .string()
    .trim()
    .max(60, "Keep the game system to 60 characters or fewer."),
  description: z
    .string()
    .trim()
    .max(2000, "Keep the description to 2,000 characters or fewer."),
});

export const inviteSchema = z.object({
  days: z.coerce
    .number("Enter a number of days.")
    .int("Use a whole number of days.")
    .min(1, "At least 1 day.")
    .max(30, "At most 30 days."),
  maxUses: z.coerce
    .number("Enter a number of uses.")
    .int("Use a whole number.")
    .min(1, "At least 1 use.")
    .max(100, "At most 100 uses."),
});

export const assignableRoleSchema = z.enum(["co_dm", "player"]);
