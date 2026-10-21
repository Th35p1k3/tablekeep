import { Suspense } from "react";
import Link from "next/link";
import { Badge, Card, linkClass, primaryLinkClass } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { loadMyTemplates } from "@/lib/templates/queries";

async function TemplateList() {
  const { supabase } = await requireUser();
  const templates = await loadMyTemplates(supabase);

  if (templates.length === 0) {
    return (
      <p className="leading-relaxed text-stone-600 dark:text-stone-400">
        You haven’t made any templates yet. A template is a blank character sheet
        you design once and reuse for every character.
      </p>
    );
  }

  return (
    <ul className="divide-y divide-stone-200 dark:divide-stone-700">
      {templates.map((t) => (
        <li key={t.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
          <div className="min-w-0">
            <Link href={`/templates/${t.id}`} className={`${linkClass} break-words`}>
              {t.name}
            </Link>
            {t.game_system ? (
              <p className="text-sm text-stone-600 dark:text-stone-400">{t.game_system}</p>
            ) : null}
          </div>
          <div className="flex gap-2">
            {t.latestVersion ? <Badge tone="accent">Version {t.latestVersion}</Badge> : <Badge>Not published</Badge>}
            {t.hasDraft && t.latestVersion ? <Badge>Draft in progress</Badge> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function TemplatesPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-14">
      <p className="mb-4 text-sm">
        <Link href="/home" className={linkClass}>
          ← Back to home
        </Link>
      </p>
      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">My sheet templates</h1>
          <Link href="/templates/new" className={primaryLinkClass}>
            New template
          </Link>
        </div>
        <Suspense fallback={<p>Loading…</p>}>
          <TemplateList />
        </Suspense>
      </Card>
    </main>
  );
}
