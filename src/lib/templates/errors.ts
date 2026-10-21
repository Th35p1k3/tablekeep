const MESSAGES: Array<[string, string]> = [
  ["not_signed_in", "Please log in again."],
  ["not_allowed", "You don’t have permission to do that."],
  ["no_draft", "There are no changes to publish."],
  ["only_draft", "This template has never been published, so there’s nothing to go back to. Delete it instead."],
  ["no_versions", "This template has no saved versions yet."],
  ["version_published", "Published versions can’t be changed."],
];

export const GENERIC_TEMPLATE_ERROR = "Something went wrong. Please try again.";

export function friendlyTemplateError(error: { message?: string } | null | undefined): string {
  const text = error?.message ?? "";
  for (const [code, message] of MESSAGES) {
    if (text.includes(code)) return message;
  }
  return GENERIC_TEMPLATE_ERROR;
}
