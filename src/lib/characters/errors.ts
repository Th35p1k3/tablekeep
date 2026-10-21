const MESSAGES: Array<[string, string]> = [
  ["not_signed_in", "Please log in again."],
  ["not_allowed", "You don’t have permission to do that."],
  ["not_published", "Characters can only use published template versions. Publish the template first."],
];

export const GENERIC_CHARACTER_ERROR = "Something went wrong. Please try again.";

export function friendlyCharacterError(error: { message?: string } | null | undefined): string {
  const text = error?.message ?? "";
  for (const [code, message] of MESSAGES) {
    if (text.includes(code)) return message;
  }
  return GENERIC_CHARACTER_ERROR;
}
