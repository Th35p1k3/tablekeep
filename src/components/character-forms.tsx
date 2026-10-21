"use client";

import { useActionState } from "react";
import { createCharacter, renameCharacter } from "@/lib/characters/actions";
import { idleState } from "@/lib/forms";
import { Field, FormMessage, SubmitButton, selectClass } from "./ui";

export function NewCharacterForm({ versions }: { versions: Array<{ id: string; label: string }> }) {
  const [state, action, pending] = useActionState(createCharacter, idleState);
  return (
    <form action={action} className="space-y-4" noValidate>
      <Field label="Character name" name="name" defaultValue={state.values?.name} error={state.fieldErrors?.name} />
      <div className="space-y-1.5">
        <label htmlFor="field-versionId" className="block text-sm font-medium">
          Sheet template
        </label>
        <select
          id="field-versionId"
          name="versionId"
          defaultValue={state.values?.versionId ?? versions[0]?.id ?? ""}
          className={selectClass}
        >
          {versions.map((v) => (
            <option key={v.id} value={v.id}>
              {v.label}
            </option>
          ))}
        </select>
        {state.fieldErrors?.versionId ? (
          <p className="text-sm text-red-700 dark:text-red-400">{state.fieldErrors.versionId}</p>
        ) : (
          <p className="text-sm text-stone-600 dark:text-stone-400">
            The character stays on this version even if the template changes later.
          </p>
        )}
      </div>
      <FormMessage status={state.status} message={state.message} />
      <SubmitButton pending={pending}>Create character</SubmitButton>
    </form>
  );
}

export function RenameCharacterForm({ characterId, name }: { characterId: string; name: string }) {
  const [state, action, pending] = useActionState(renameCharacter, idleState);
  return (
    <form action={action} className="space-y-3" noValidate>
      <input type="hidden" name="characterId" value={characterId} />
      <Field label="Character name" name="name" defaultValue={state.values?.name ?? name} error={state.fieldErrors?.name} />
      <FormMessage status={state.status} message={state.message} />
      <SubmitButton pending={pending}>Save name</SubmitButton>
    </form>
  );
}
