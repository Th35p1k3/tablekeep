import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/campaign-forms";
import { SpellBuilder } from "@/components/spell-builder";
import { SpellCard } from "@/components/spell-card";
import { RenameSpellForm } from "@/components/spell-forms";
import { Badge, Card, linkClass } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { uuidSchema } from "@/lib/campaigns/validation";
import { deleteSpell, discardSpellDraft, duplicateSpell, startSpellDraft } from "@/lib/spells/actions";
import { loadEffectPresets, loadSpell } from "@/lib/spells/queries";
import { coerceSpell } from "@/lib/spells/schema";

async function SpellContentView({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const { supabase, user } = await requireUser();
  const spell = await loadSpell(supabase, id);
  if (!spell) notFound();
  const presets = await loadEffectPresets(supabase, user.id);

  const latest = spell.published[0] ?? null;
  const nextVersion = (latest?.version_number ?? 0) + 1;
  const fields = { spellId: spell.id };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold break-words">{spell.name}</h1>
          <div className="mt-2 flex flex-wrap gap-2">
            {latest ? <Badge tone="accent">Version {latest.version_number}</Badge> : <Badge>Not published yet</Badge>}
            {spell.draft ? <Badge>Editing draft</Badge> : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <ActionButton action={duplicateSpell} fields={fields} label="Make a copy" />
          <ActionButton
            action={deleteSpell}
            fields={fields}
            label="Delete spell"
            confirmText={`Delete “${spell.name}” and all its versions? This can’t be undone.`}
            danger
          />
        </div>
      </div>

      <details className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900">
        <summary className="cursor-pointer font-medium">Rename</summary>
        <div className="mt-4 max-w-md">
          <RenameSpellForm spellId={spell.id} name={spell.name} />
        </div>
      </details>

      {spell.draft ? (
        <>
          {latest ? (
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span>You’re editing a draft based on version {latest.version_number}.</span>
              <ActionButton
                action={discardSpellDraft}
                fields={fields}
                label="Discard draft"
                confirmText={`Throw away this draft and go back to version ${latest.version_number}?`}
              />
            </div>
          ) : null}
          <SpellBuilder
            key={spell.draft.id}
            spellId={spell.id}
            name={spell.name}
            initial={coerceSpell(spell.draft.content)}
            nextVersion={nextVersion}
            initialPresets={presets}
          />
        </>
      ) : latest ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:items-start">
          <Card>
            <h2 className="text-lg font-semibold">Versions</h2>
            <ul className="mt-3 space-y-1 text-sm">
              {spell.published.map((v) => (
                <li key={v.id}>Version {v.version_number}</li>
              ))}
            </ul>
            <p className="mt-4 mb-3 text-sm leading-relaxed text-stone-600 dark:text-stone-400">
              Published versions never change. Start a draft to make version {nextVersion}.
            </p>
            <ActionButton action={startSpellDraft} fields={fields} label="Make changes" />
          </Card>
          <SpellCard name={spell.name} spell={coerceSpell(latest.content)} version={latest.version_number} />
        </div>
      ) : (
        <p>This spell has no versions. Delete it and start again.</p>
      )}
    </div>
  );
}

export default function SpellPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:py-14">
      <p className="mb-4 text-sm">
        <Link href="/spells" className={linkClass}>
          ← Back to spells
        </Link>
      </p>
      <Suspense fallback={<p>Loading…</p>}>
        <SpellContentView params={params} />
      </Suspense>
    </main>
  );
}
