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
}: {
  label: string;
  name: string;
  type?: string;
  autoComplete?: string;
  defaultValue?: string;
  error?: string;
  hint?: string;
}) {
  const id = `field-${name}`;
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
