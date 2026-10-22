import { Suspense } from "react";
import Link from "next/link";
import { Badge, Card, linkClass, primaryLinkClass } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { loadMySpells } from "@/lib/spells/queries";

async function SpellList() {
  const { supabase, user } = await requireUser();
  const spells = await loadMySpells(supabase, user.id);
  if (spells.length === 0) {
    return (
      <p className="leading-relaxed text-stone-600 dark:text-stone-400">
        No spells yet. Build one with forms and effect blocks, then publish it to
        add it to characters.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-stone-200 dark:divide-stone-700">
      {spells.map((s) => (
        <li key={s.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
          <div className="min-w-0">
            <Link href={`/spells/${s.id}`} className={`${linkClass} break-words`}>
              {s.name}
            </Link>
            <p className="text-sm text-stone-600 dark:text-stone-400">
              {s.level === null ? "No level" : s.level === 0 ? "Cantrip" : `Level ${s.level}`}
            </p>
          </div>
          <div className="flex gap-2">
            {s.latestVersion ? <Badge tone="accent">Version {s.latestVersion}</Badge> : <Badge>Not published</Badge>}
            {s.hasDraft && s.latestVersion ? <Badge>Draft in progress</Badge> : null}
          </div>
        </li>
      ))}
    </ul>
  );
}

export default function SpellsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-14">
      <p className="mb-4 text-sm">
        <Link href="/home" className={linkClass}>
          ← Back to home
        </Link>
      </p>
      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">My spells</h1>
          <Link href="/spells/new" className={primaryLinkClass}>
            New spell
          </Link>
        </div>
        <Suspense fallback={<p>Loading…</p>}>
          <SpellList />
        </Suspense>
      </Card>
    </main>
  );
}
