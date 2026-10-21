import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/campaign-forms";
import { SheetPreview } from "@/components/sheet-view";
import { TemplateBuilder } from "@/components/template-builder";
import { TemplateDetailsForm } from "@/components/template-forms";
import { Badge, Card, linkClass } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { uuidSchema } from "@/lib/campaigns/validation";
import {
  deleteTemplate,
  discardTemplateDraft,
  duplicateTemplate,
  startTemplateDraft,
} from "@/lib/templates/actions";
import { coerceDefinition } from "@/lib/templates/editing";
import { loadTemplate } from "@/lib/templates/queries";

function shortDate(iso: string | null): string {
  return iso
    ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "";
}

async function TemplateContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const { supabase } = await requireUser();
  const template = await loadTemplate(supabase, id);
  if (!template) notFound();

  const latest = template.published[0] ?? null;
  const nextVersion = (latest?.version_number ?? 0) + 1;
  const fields = { templateId: template.id };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold break-words">{template.name}</h1>
          <div className="mt-2 flex flex-wrap gap-2">
            {template.game_system ? <Badge>{template.game_system}</Badge> : null}
            {latest ? <Badge tone="accent">Version {latest.version_number}</Badge> : <Badge>Not published yet</Badge>}
            {template.draft ? <Badge>Editing draft</Badge> : null}
          </div>
        </div>
        <div className="flex flex-wrap gap-2">
          <ActionButton action={duplicateTemplate} fields={fields} label="Make a copy" />
          <ActionButton
            action={deleteTemplate}
            fields={fields}
            label="Delete template"
            confirmText={`Delete “${template.name}” and all its versions? This can’t be undone.`}
            danger
          />
        </div>
      </div>

      <details className="rounded-xl border border-stone-200 bg-white p-4 dark:border-stone-700 dark:bg-stone-900">
        <summary className="cursor-pointer font-medium">Name, game system and description</summary>
        <div className="mt-4">
          <TemplateDetailsForm
            template={{
              id: template.id,
              name: template.name,
              game_system: template.game_system,
              description: template.description,
            }}
          />
        </div>
      </details>

      {template.draft ? (
        <>
          {latest ? (
            <div className="flex flex-wrap items-center gap-3 text-sm">
              <span>You’re editing a draft based on version {latest.version_number}.</span>
              <ActionButton
                action={discardTemplateDraft}
                fields={fields}
                label="Discard draft"
                confirmText={`Throw away this draft and go back to version ${latest.version_number}?`}
              />
            </div>
          ) : null}
          <TemplateBuilder
            key={template.draft.id}
            templateId={template.id}
            initial={coerceDefinition(template.draft.definition)}
            nextVersion={nextVersion}
          />
        </>
      ) : latest ? (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] lg:items-start">
          <Card>
            <h2 className="text-lg font-semibold">Versions</h2>
            <ul className="mt-3 space-y-1 text-sm">
              {template.published.map((v) => (
                <li key={v.id}>
                  Version {v.version_number} · published {shortDate(v.published_at)}
                </li>
              ))}
            </ul>
            <p className="mt-4 mb-3 text-sm leading-relaxed text-stone-600 dark:text-stone-400">
              Published versions never change. To make changes, start a draft;
              publishing it creates version {nextVersion}.
            </p>
            <ActionButton action={startTemplateDraft} fields={fields} label="Make changes" />
          </Card>
          <Card>
            <h2 className="mb-4 text-lg font-semibold">Version {latest.version_number} preview</h2>
            <SheetPreview definition={coerceDefinition(latest.definition)} idPrefix="published" />
          </Card>
        </div>
      ) : (
        <p>This template has no versions. Delete it and start again.</p>
      )}
    </div>
  );
}

export default function TemplatePage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10 sm:py-14">
      <p className="mb-4 text-sm">
        <Link href="/templates" className={linkClass}>
          ← Back to templates
        </Link>
      </p>
      <Suspense fallback={<p>Loading…</p>}>
        <TemplateContent params={params} />
      </Suspense>
    </main>
  );
}
