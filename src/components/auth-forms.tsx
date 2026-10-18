"use client";

import { useActionState } from "react";
import { useSearchParams } from "next/navigation";
import {
  deleteAccount,
  logIn,
  requestPasswordReset,
  signUp,
  updatePassword,
  updateProfile,
} from "@/lib/auth/actions";
import { idleState } from "@/lib/forms";
import { Field, FormMessage, SubmitButton } from "./ui";

/** Keeps "?next=" so an invite link survives logging in or signing up. */
function NextField() {
  const next = useSearchParams().get("next");
  return next ? <input type="hidden" name="next" value={next} /> : null;
}

export function SignUpForm() {
  const [state, action, pending] = useActionState(signUp, idleState);
  return (
    <form action={action} className="space-y-4" noValidate>
      <NextField />
      <Field
        label="Display name"
        name="displayName"
        autoComplete="nickname"
        defaultValue={state.values?.displayName}
        error={state.fieldErrors?.displayName}
        hint="What other players will see."
      />
      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        defaultValue={state.values?.email}
        error={state.fieldErrors?.email}
      />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="new-password"
        error={state.fieldErrors?.password}
        hint="At least 8 characters."
      />
      <FormMessage status={state.status} message={state.message} />
      <SubmitButton pending={pending}>Create account</SubmitButton>
    </form>
  );
}

export function LoginForm() {
  const [state, action, pending] = useActionState(logIn, idleState);
  return (
    <form action={action} className="space-y-4" noValidate>
      <NextField />
      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        defaultValue={state.values?.email}
        error={state.fieldErrors?.email}
      />
      <Field
        label="Password"
        name="password"
        type="password"
        autoComplete="current-password"
        error={state.fieldErrors?.password}
      />
      <FormMessage status={state.status} message={state.message} />
      <SubmitButton pending={pending}>Log in</SubmitButton>
    </form>
  );
}

export function ResetRequestForm() {
  const [state, action, pending] = useActionState(
    requestPasswordReset,
    idleState,
  );
  return (
    <form action={action} className="space-y-4" noValidate>
      <Field
        label="Email"
        name="email"
        type="email"
        autoComplete="email"
        defaultValue={state.values?.email}
        error={state.fieldErrors?.email}
      />
      <FormMessage status={state.status} message={state.message} />
      <SubmitButton pending={pending}>Send reset link</SubmitButton>
    </form>
  );
}

export function NewPasswordForm({ submitLabel }: { submitLabel: string }) {
  const [state, action, pending] = useActionState(updatePassword, idleState);
  return (
    <form action={action} className="space-y-4" noValidate>
      <Field
        label="New password"
        name="password"
        type="password"
        autoComplete="new-password"
        error={state.fieldErrors?.password}
        hint="At least 8 characters."
      />
      <Field
        label="Confirm new password"
        name="confirm"
        type="password"
        autoComplete="new-password"
        error={state.fieldErrors?.confirm}
      />
      <FormMessage status={state.status} message={state.message} />
      <SubmitButton pending={pending}>{submitLabel}</SubmitButton>
    </form>
  );
}

export function ProfileForm({ displayName }: { displayName: string }) {
  const [state, action, pending] = useActionState(updateProfile, idleState);
  return (
    <form action={action} className="space-y-4" noValidate>
      <Field
        label="Display name"
        name="displayName"
        autoComplete="nickname"
        defaultValue={state.values?.displayName ?? displayName}
        error={state.fieldErrors?.displayName}
      />
      <FormMessage status={state.status} message={state.message} />
      <SubmitButton pending={pending}>Save profile</SubmitButton>
    </form>
  );
}

export function DeleteAccountForm() {
  const [state, action, pending] = useActionState(deleteAccount, idleState);
  return (
    <form action={action} className="space-y-4" noValidate>
      <Field
        label="Type DELETE to confirm"
        name="confirm"
        autoComplete="off"
        error={state.fieldErrors?.confirm}
      />
      <FormMessage status={state.status} message={state.message} />
      <SubmitButton pending={pending} variant="danger">
        Delete my account permanently
      </SubmitButton>
    </form>
  );
}
