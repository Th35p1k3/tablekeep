"use server";

import { revalidatePath } from "next/cache";
import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { type FormState, fieldErrorsFrom, textField } from "@/lib/forms";
import {
  deleteAccountSchema,
  loginSchema,
  newPasswordSchema,
  profileSchema,
  resetRequestSchema,
  signUpSchema,
} from "@/lib/validation";
import { friendlyAuthError, logUnexpectedAuthError } from "./errors";

/** The address the visitor is using (localhost or the Vercel site). */
async function siteOrigin(): Promise<string> {
  const h = await headers();
  const origin = h.get("origin");
  if (origin) return origin;
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto =
    h.get("x-forwarded-proto") ??
    (host.startsWith("localhost") ? "http" : "https");
  return `${proto}://${host}`;
}

export async function signUp(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = {
    displayName: textField(formData, "displayName"),
    email: textField(formData, "email"),
  };
  const parsed = signUpSchema.safeParse({
    ...values,
    password: textField(formData, "password"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
      values,
    };
  }

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      data: { display_name: parsed.data.displayName },
      emailRedirectTo: `${await siteOrigin()}/auth/confirm`,
    },
  });
  if (error) {
    logUnexpectedAuthError("sign up", error);
    return { status: "error", message: friendlyAuthError(error), values };
  }

  // With email confirmation off, Supabase signs the user in straight away.
  redirect(data.session ? "/home" : "/signup/check-email");
}

export async function logIn(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = { email: textField(formData, "email") };
  const parsed = loginSchema.safeParse({
    ...values,
    password: textField(formData, "password"),
  });
  if (!parsed.success) {
    return {
      status: "error",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
      values,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    logUnexpectedAuthError("log in", error);
    return { status: "error", message: friendlyAuthError(error), values };
  }
  redirect("/home");
}

export async function signOut(): Promise<void> {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

export async function requestPasswordReset(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = { email: textField(formData, "email") };
  const parsed = resetRequestSchema.safeParse(values);
  if (!parsed.success) {
    return {
      status: "error",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
      values,
    };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(
    parsed.data.email,
    { redirectTo: `${await siteOrigin()}/auth/confirm` },
  );
  if (error?.code?.startsWith("over_")) {
    return { status: "error", message: friendlyAuthError(error), values };
  }
  // Same answer whether or not the account exists, so emails can't be probed.
  return {
    status: "success",
    message:
      "If that email has an account, a reset link is on its way. Check your inbox.",
  };
}

export async function updatePassword(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = newPasswordSchema.safeParse({
    password: textField(formData, "password"),
    confirm: textField(formData, "confirm"),
  });
  if (!parsed.success) {
    return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  }

  const supabase = await createClient();
  const { data } = await supabase.auth.getUser();
  if (!data.user) {
    return {
      status: "error",
      message: "Your session has expired. Request a new reset link.",
    };
  }
  const { error } = await supabase.auth.updateUser({
    password: parsed.data.password,
  });
  if (error) {
    logUnexpectedAuthError("password update", error);
    return { status: "error", message: friendlyAuthError(error) };
  }
  return { status: "success", message: "Password updated." };
}

export async function updateProfile(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const values = { displayName: textField(formData, "displayName") };
  const parsed = profileSchema.safeParse(values);
  if (!parsed.success) {
    return {
      status: "error",
      fieldErrors: fieldErrorsFrom(parsed.error.issues),
      values,
    };
  }

  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) redirect("/login");

  const { data, error } = await supabase
    .from("profiles")
    .update({ display_name: parsed.data.displayName })
    .eq("id", auth.user.id)
    .select("id");
  if (error || !data?.length) {
    if (error) console.error(`[profile] update failed: ${error.message}`);
    return {
      status: "error",
      message: "Couldn’t save your profile. Please try again.",
      values,
    };
  }

  revalidatePath("/home");
  revalidatePath("/account");
  return {
    status: "success",
    message: "Profile saved.",
    values: { displayName: parsed.data.displayName },
  };
}

export async function deleteAccount(
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const parsed = deleteAccountSchema.safeParse({
    confirm: textField(formData, "confirm"),
  });
  if (!parsed.success) {
    return { status: "error", fieldErrors: fieldErrorsFrom(parsed.error.issues) };
  }

  const supabase = await createClient();
  const { error } = await supabase.rpc("delete_my_account");
  if (error) {
    console.error(`[account] delete failed: ${error.message}`);
    return {
      status: "error",
      message: "Couldn’t delete your account. Please try again.",
    };
  }
  try {
    await supabase.auth.signOut();
  } catch {
    // The account is already gone; clearing cookies is best effort.
  }
  redirect("/goodbye");
}
