import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/campaign-forms";
import { RenameCharacterForm } from "@/components/character-forms";
import { CharacterSheet } from "@/components/character-sheet";
import { Badge, linkClass } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { uuidSchema } from "@/lib/campaigns/validation";
import { deleteCharacter, duplicateCharacter } from "@/lib/characters/actions";
import { loadCharacter, loadRestorePoints } from "@/lib/characters/queries";
import { coerceDefinition } from "@/lib/templates/editing";

async function CharacterContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const { supabase } = await requireUser();
  const character = await loadCharacter(supabase, id);
  if (!character) notFound();
  const points = await loadRestorePoints(supabase, character.id);
  const fields = { characterId: character.id };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold break-words">{character.name}</h1>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge>
              {character.templateName}
              {character.versionNumber ? ` · version ${character.versionNumber}` : ""}
            </Badge>
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <ActionButton action={duplicateCharacter} fields={fields} label="Make a copy" />
          <ActionButton
            action={deleteCharacter}
            fields={fields}
            label="Delete character"
            confirmText={`Delete “${character.name}” and all its restore points? This can’t be undone.`}
            danger
          />
        </div>
      </div>

      <details className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900">
        <summary className="cursor-pointer font-medium">Rename</summary>
        <div className="mt-4 max-w-md">
          <RenameCharacterForm characterId={character.id} name={character.name} />
        </div>
      </details>

      <CharacterSheet
        characterId={character.id}
        definition={coerceDefinition(character.definition)}
        initialData={character.data}
        initialUpdatedAt={character.updated_at}
        initialPoints={points}
      />
    </div>
  );
}

export default function CharacterPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:py-14">
      <p className="mb-4 text-sm">
        <Link href="/characters" className={linkClass}>
          ← Back to characters
        </Link>
      </p>
      <Suspense fallback={<p>Loading…</p>}>
        <CharacterContent params={params} />
      </Suspense>
    </main>
  );
}
