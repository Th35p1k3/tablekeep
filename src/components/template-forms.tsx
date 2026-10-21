"use client";

import { useActionState } from "react";
import { createTemplate, updateTemplateDetails } from "@/lib/templates/actions";
import { idleState } from "@/lib/forms";
import { Field, FormMessage, SubmitButton, TextAreaField } from "./ui";

export function NewTemplateForm() {
  const [state, action, pending] = useActionState(createTemplate, idleState);
  const v = state.values;
  const start = v?.start ?? "starter";
  return (
    <form action={action} className="space-y-4" noValidate>
      <Field label="Template name" name="name" defaultValue={v?.name} error={state.fieldErrors?.name} />
      <Field
        label="Game system"
        name="gameSystem"
        defaultValue={v?.gameSystem}
        error={state.fieldErrors?.gameSystem}
        hint="Any label, for example “Homebrew 5e”. Optional."
      />
      <TextAreaField
        label="Description"
        name="description"
        defaultValue={v?.description}
        error={state.fieldErrors?.description}
        rows={3}
        hint="Optional."
      />
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Start from</legend>
        <label className="flex items-start gap-2">
          <input type="radio" name="start" value="starter" defaultChecked={start === "starter"} className="mt-1 accent-amber-800" />
          <span>
            <span className="font-medium">Example sheet</span>
            <span className="block text-sm text-stone-600 dark:text-stone-400">
              Abilities, combat stats and hit points already set up. Easiest way to learn.
            </span>
          </span>
        </label>
        <label className="flex items-start gap-2">
          <input type="radio" name="start" value="blank" defaultChecked={start === "blank"} className="mt-1 accent-amber-800" />
          <span>
            <span className="font-medium">Blank sheet</span>
            <span className="block text-sm text-stone-600 dark:text-stone-400">One empty section.</span>
          </span>
        </label>
      </fieldset>
      <FormMessage status={state.status} message={state.message} />
      <SubmitButton pending={pending}>Create template</SubmitButton>
    </form>
  );
}

export function TemplateDetailsForm({
  template,
}: {
  template: { id: string; name: string; game_system: string; description: string };
}) {
  const [state, action, pending] = useActionState(updateTemplateDetails, idleState);
  const v = state.values;
  return (
    <form action={action} className="space-y-4" noValidate>
      <input type="hidden" name="templateId" value={template.id} />
      <Field label="Template name" name="name" defaultValue={v?.name ?? template.name} error={state.fieldErrors?.name} />
      <Field
        label="Game system"
        name="gameSystem"
        defaultValue={v?.gameSystem ?? template.game_system}
        error={state.fieldErrors?.gameSystem}
      />
      <TextAreaField
        label="Description"
        name="description"
        defaultValue={v?.description ?? template.description}
        error={state.fieldErrors?.description}
        rows={3}
      />
      <FormMessage status={state.status} message={state.message} />
      <SubmitButton pending={pending}>Save details</SubmitButton>
    </form>
  );
}
