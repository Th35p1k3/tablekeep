const MESSAGES: Array<[string, string]> = [
  ["not_signed_in", "Please log in again."],
  ["not_allowed", "You don’t have permission to do that."],
  ["no_draft", "There are no changes to publish."],
  ["only_draft", "This spell has never been published, so there’s nothing to go back to. Delete it instead."],
  ["no_versions", "This spell has no saved versions yet."],
  ["version_published", "Published versions can’t be changed."],
  ["spell_in_use", "Characters still have this spell. Remove it from them first, or keep the spell."],
  ["not_published", "Only published spells can go on a character. Publish the spell first."],
  ["spell_not_allowed", "That spell can’t be added to this character."],
];

export const GENERIC_SPELL_ERROR = "Something went wrong. Please try again.";

export function friendlySpellError(error: { message?: string } | null | undefined): string {
  const text = error?.message ?? "";
  for (const [code, message] of MESSAGES) {
    if (text.includes(code)) return message;
  }
  return GENERIC_SPELL_ERROR;
}
