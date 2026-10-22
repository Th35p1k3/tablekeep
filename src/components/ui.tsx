import Link from "next/link";
import type { ReactNode } from "react";

const inputClass =
  "block w-full rounded-md border border-stone-300 bg-white px-3 py-2 text-base text-stone-900 shadow-sm focus:border-amber-700 focus:outline-none focus:ring-2 focus:ring-amber-700/30 dark:border-stone-600 dark:bg-stone-900 dark:text-stone-100";

export function Field({
  label,
  name,
  type = "text",
  autoComplete,
  defaultValue,
  error,
  hint,
  id: explicitId,
}: {
  label: string;
  name: string;
  type?: string;
  autoComplete?: string;
  defaultValue?: string;
  error?: string;
  hint?: string;
  /** Needed when the same form appears more than once on a page. */
  id?: string;
}) {
  const id = explicitId ?? `field-${name}`;
  const errorId = `${id}-error`;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <input
        id={id}
        name={name}
        type={type}
        autoComplete={autoComplete}
        defaultValue={defaultValue}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={inputClass}
      />
      {hint && !error ? (
        <p className="text-sm text-stone-600 dark:text-stone-400">{hint}</p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function SubmitButton({
  children,
  pending,
  variant = "primary",
}: {
  children: ReactNode;
  pending?: boolean;
  variant?: "primary" | "danger";
}) {
  const color =
    variant === "danger"
      ? "bg-red-700 hover:bg-red-800 focus-visible:outline-red-700"
      : "bg-amber-800 hover:bg-amber-900 focus-visible:outline-amber-800";
  return (
    <button
      type="submit"
      disabled={pending}
      className={`inline-flex w-full items-center justify-center rounded-md px-4 py-2.5 font-medium text-white focus-visible:outline-2 focus-visible:outline-offset-2 disabled:opacity-60 ${color}`}
    >
      {pending ? "Working…" : children}
    </button>
  );
}

export function FormMessage({
  status,
  message,
}: {
  status: "idle" | "error" | "success";
  message?: string;
}) {
  if (!message || status === "idle") return null;
  const look =
    status === "error"
      ? "border-red-300 bg-red-50 text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200"
      : "border-emerald-300 bg-emerald-50 text-emerald-800 dark:border-emerald-800 dark:bg-emerald-950 dark:text-emerald-200";
  return (
    <p
      data-testid="form-message"
      aria-live="polite"
      className={`rounded-md border px-3 py-2 text-sm ${look}`}
    >
      {message}
    </p>
  );
}

export function Card({ children }: { children: ReactNode }) {
  return (
    <div className="rounded-xl border border-stone-200 bg-white p-6 shadow-sm sm:p-8 dark:border-stone-700 dark:bg-stone-900">
      {children}
    </div>
  );
}

export function AuthPage({
  title,
  children,
  footer,
}: {
  title: string;
  children: ReactNode;
  footer?: ReactNode;
}) {
  return (
    <main className="mx-auto w-full max-w-md px-4 py-12 sm:py-16">
      <Link href="/" className="text-sm font-semibold tracking-wide text-amber-800 uppercase dark:text-amber-500">
        Tablekeep
      </Link>
      <h1 className="mt-2 mb-6 text-2xl font-semibold">{title}</h1>
      <Card>{children}</Card>
      {footer ? <div className="mt-6 text-sm">{footer}</div> : null}
    </main>
  );
}

export const linkClass =
  "font-medium text-amber-800 underline underline-offset-4 hover:text-amber-900 dark:text-amber-500";

export function TextAreaField({
  label,
  name,
  defaultValue,
  error,
  hint,
  rows = 4,
  id: explicitId,
}: {
  label: string;
  name: string;
  defaultValue?: string;
  error?: string;
  hint?: string;
  rows?: number;
  id?: string;
}) {
  const id = explicitId ?? `field-${name}`;
  const errorId = `${id}-error`;
  return (
    <div className="space-y-1.5">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <textarea
        id={id}
        name={name}
        rows={rows}
        defaultValue={defaultValue}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? errorId : undefined}
        className={inputClass}
      />
      {hint && !error ? (
        <p className="text-sm text-stone-600 dark:text-stone-400">{hint}</p>
      ) : null}
      {error ? (
        <p id={errorId} className="text-sm text-red-700 dark:text-red-400">
          {error}
        </p>
      ) : null}
    </div>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "neutral" | "accent" }) {
  const look =
    tone === "accent"
      ? "bg-amber-100 text-amber-900 dark:bg-amber-950 dark:text-amber-200"
      : "bg-stone-100 text-stone-700 dark:bg-stone-800 dark:text-stone-300";
  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${look}`}>
      {children}
    </span>
  );
}

export const selectClass = inputClass;

export const secondaryButtonClass =
  "inline-flex items-center justify-center rounded-md border border-stone-300 px-4 py-2 text-sm font-medium hover:bg-stone-100 disabled:opacity-60 dark:border-stone-600 dark:hover:bg-stone-800";

export const primaryLinkClass =
  "inline-flex items-center justify-center rounded-md bg-amber-800 px-4 py-2 text-sm font-medium text-white hover:bg-amber-900";

export const disabledLook = "disabled:cursor-not-allowed disabled:opacity-70";
