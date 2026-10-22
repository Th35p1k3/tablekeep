"use client";

import { useActionState } from "react";
import { createSpell, renameSpell } from "@/lib/spells/actions";
import { idleState } from "@/lib/forms";
import { Field, FormMessage, SubmitButton } from "./ui";

export function NewSpellForm() {
  const [state, action, pending] = useActionState(createSpell, idleState);
  return (
    <form action={action} className="space-y-4" noValidate>
      <Field label="Spell name" name="name" defaultValue={state.values?.name} error={state.fieldErrors?.name} />
      <FormMessage status={state.status} message={state.message} />
      <SubmitButton pending={pending}>Create spell</SubmitButton>
    </form>
  );
}

export function RenameSpellForm({ spellId, name }: { spellId: string; name: string }) {
  const [state, action, pending] = useActionState(renameSpell, idleState);
  return (
    <form action={action} className="space-y-3" noValidate>
      <input type="hidden" name="spellId" value={spellId} />
      <Field label="Spell name" name="name" defaultValue={state.values?.name ?? name} error={state.fieldErrors?.name} />
      <FormMessage status={state.status} message={state.message} />
      <SubmitButton pending={pending}>Save name</SubmitButton>
    </form>
  );
}
