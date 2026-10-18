type AuthErrorLike =
  | { code?: string; message?: string; status?: number }
  | null
  | undefined;

/** Turns Supabase's technical error codes into plain sentences. */
export function friendlyAuthError(error: AuthErrorLike): string {
  const code = error?.code ?? "";
  const message = (error?.message ?? "").toLowerCase();

  if (message.includes("invite list") || code === "signup_disabled") {
    return "This email isn’t on the Tablekeep invite list. Ask your DM to add it.";
  }

  switch (code) {
    case "invalid_credentials":
      return "Email or password is incorrect.";
    case "email_not_confirmed":
      return "Confirm your email first: check your inbox for the link.";
    case "user_already_exists":
    case "email_exists":
      return "An account with this email already exists. Try logging in.";
    case "email_address_invalid":
      return "Supabase won’t accept this email address. Use a real email domain (not example.com).";
    case "weak_password":
      return "Choose a stronger password.";
    case "same_password":
      return "Your new password must be different from your current one.";
    case "over_email_send_rate_limit":
    case "over_request_rate_limit":
      return "Too many attempts. Wait a few minutes and try again.";
    default:
      return "Something went wrong. Please try again.";
  }
}

const KNOWN = new Set([
  "signup_disabled",
  "invalid_credentials",
  "email_not_confirmed",
  "user_already_exists",
  "email_exists",
  "email_address_invalid",
  "weak_password",
  "same_password",
  "over_email_send_rate_limit",
  "over_request_rate_limit",
]);

/** Prints unexpected errors in the terminal so problems can be diagnosed. */
export function logUnexpectedAuthError(where: string, error: AuthErrorLike) {
  const message = (error?.message ?? "").toLowerCase();
  if (KNOWN.has(error?.code ?? "") || message.includes("invite list")) return;
  console.error(
    `[auth] ${where} failed: code=${error?.code ?? "none"} status=${error?.status ?? "?"} message=${error?.message ?? ""}`,
  );
}
