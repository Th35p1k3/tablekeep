"use client";

import { useActionState } from "react";
import { type FormState, idleState } from "@/lib/forms";
import { FormMessage, secondaryButtonClass, selectClass } from "./ui";

type Action = (prev: FormState, formData: FormData) => Promise<FormState>;

/** "Pick one from a list, then click a button" (add character, offer template …). */
export function ChooseAndSubmitForm({
  action,
  fixed,
  name,
  label,
  options,
  submitLabel,
}: {
  action: Action;
  fixed: Record<string, string>;
  name: string;
  label: string;
  options: Array<{ value: string; label: string }>;
  submitLabel: string;
}) {
  const [state, formAction, pending] = useActionState(action, idleState);
  const id = `choose-${name}`;
  return (
    <form action={formAction} className="space-y-2">
      {Object.entries(fixed).map(([k, v]) => (
        <input key={k} type="hidden" name={k} value={v} />
      ))}
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <select id={id} name={name} defaultValue={options[0]?.value ?? ""} className={selectClass}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        <button type="submit" disabled={pending || options.length === 0} className={secondaryButtonClass}>
          {pending ? "Working…" : submitLabel}
        </button>
      </div>
      {state.fieldErrors ? (
        <p className="text-sm text-red-700 dark:text-red-400">{Object.values(state.fieldErrors)[0]}</p>
      ) : null}
      <FormMessage status={state.status} message={state.message} />
    </form>
  );
}
