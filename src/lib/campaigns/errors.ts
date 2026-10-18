const MESSAGES: Array<[code: string, message: string]> = [
  ["not_signed_in", "Please log in again."],
  ["not_allowed", "You don’t have permission to do that."],
  ["invite_invalid", "This invite link isn’t valid. Ask your DM for a new one."],
  ["invite_expired", "This invite link has expired. Ask your DM for a new one."],
  ["invite_revoked", "This invite link was cancelled. Ask your DM for a new one."],
  ["invite_used_up", "This invite link has been used up. Ask your DM for a new one."],
  ["campaign_archived", "This campaign is archived."],
  ["owner_cannot_leave", "As the owner, hand the campaign to someone else before leaving."],
  ["not_a_member", "That person isn’t in this campaign."],
  ["use_leave", "To remove yourself, use Leave campaign."],
  [
    "owns_campaigns",
    "You own at least one campaign. Hand it to someone else or delete it before deleting your account.",
  ],
  ["invalid_input", "Some of those values aren’t allowed."],
];

export const GENERIC_ERROR = "Something went wrong. Please try again.";

/** Turns the database's short error codes into plain sentences. */
export function friendlyCampaignError(
  error: { message?: string } | null | undefined,
): string {
  const text = error?.message ?? "";
  for (const [code, message] of MESSAGES) {
    if (text.includes(code)) return message;
  }
  return GENERIC_ERROR;
}
