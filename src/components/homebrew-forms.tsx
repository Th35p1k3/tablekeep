"use client";

import { useActionState } from "react";
import { reviewSubmission, submitHomebrew } from "@/lib/homebrew/actions";
import { idleState } from "@/lib/forms";
import { FormMessage, secondaryButtonClass, selectClass } from "./ui";

export function SubmitHomebrewForm({
  campaignId,
  options,
}: {
  campaignId: string;
  options: Array<{ value: string; label: string }>;
}) {
  const [state, action, pending] = useActionState(submitHomebrew, idleState);
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="campaignId" value={campaignId} />
      <div className="space-y-1">
        <label htmlFor="submit-item" className="block text-sm font-medium">
          Spell or sheet template
        </label>
        <select id="submit-item" name="item" defaultValue={options[0]?.value ?? ""} className={selectClass}>
          {options.map((o) => (
            <option key={o.value} value={o.value}>
              {o.label}
            </option>
          ))}
        </select>
        {state.fieldErrors?.item ? <p className="text-sm text-red-700 dark:text-red-400">{state.fieldErrors.item}</p> : null}
      </div>
      <div className="space-y-1">
        <label htmlFor="submit-note" className="block text-sm font-medium">
          Note for your DM (optional)
        </label>
        <textarea id="submit-note" name="note" rows={2} maxLength={500} className={selectClass} />
        {state.fieldErrors?.note ? <p className="text-sm text-red-700 dark:text-red-400">{state.fieldErrors.note}</p> : null}
      </div>
      <FormMessage status={state.status} message={state.message} />
      <button type="submit" disabled={pending || options.length === 0} className={secondaryButtonClass}>
        {pending ? "Submitting…" : "Submit for approval"}
      </button>
    </form>
  );
}

export function ReviewForm({ campaignId, submissionId, label }: { campaignId: string; submissionId: string; label: string }) {
  const [state, action, pending] = useActionState(reviewSubmission, idleState);
  const noteId = `review-note-${submissionId}`;
  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="campaignId" value={campaignId} />
      <input type="hidden" name="submissionId" value={submissionId} />
      <div className="space-y-1">
        <label htmlFor={noteId} className="block text-sm font-medium">
          Note to the player about {label}
        </label>
        <textarea
          id={noteId}
          name="note"
          rows={2}
          maxLength={1000}
          defaultValue={state.values?.note}
          placeholder="Optional for approvals; needed when asking for changes."
          className={selectClass}
        />
        {state.fieldErrors?.note ? <p className="text-sm text-red-700 dark:text-red-400">{state.fieldErrors.note}</p> : null}
      </div>
      <FormMessage status={state.status} message={state.message} />
      <div className="flex flex-wrap gap-2">
        <button
          type="submit"
          name="decision"
          value="approved"
          disabled={pending}
          className="inline-flex items-center justify-center rounded-md bg-amber-800 px-4 py-2 text-sm font-medium text-white hover:bg-amber-900 disabled:opacity-60"
        >
          Approve
        </button>
        <button type="submit" name="decision" value="changes_requested" disabled={pending} className={secondaryButtonClass}>
          Request changes
        </button>
        <button
          type="submit"
          name="decision"
          value="rejected"
          disabled={pending}
          className={`${secondaryButtonClass} text-red-700 dark:text-red-400`}
        >
          Don’t approve
        </button>
      </div>
    </form>
  );
}
