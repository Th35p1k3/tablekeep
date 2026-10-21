import { Suspense } from "react";
import Link from "next/link";
import { Badge, Card, linkClass, primaryLinkClass } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { loadMyCharacters } from "@/lib/characters/queries";

async function CharacterList() {
  const { supabase, user } = await requireUser();
  const characters = await loadMyCharacters(supabase, user.id);
  if (characters.length === 0) {
    return (
      <p className="leading-relaxed text-stone-600 dark:text-stone-400">
        No characters yet. Create one from any sheet template you’ve published.
      </p>
    );
  }
  return (
    <ul className="divide-y divide-stone-200 dark:divide-stone-700">
      {characters.map((c) => (
        <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
          <Link href={`/characters/${c.id}`} className={`${linkClass} break-words`}>
            {c.name}
          </Link>
          <Badge>
            {c.templateName}
            {c.versionNumber ? ` · v${c.versionNumber}` : ""}
          </Badge>
        </li>
      ))}
    </ul>
  );
}

export default function CharactersPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-14">
      <p className="mb-4 text-sm">
        <Link href="/home" className={linkClass}>
          ← Back to home
        </Link>
      </p>
      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <h1 className="text-2xl font-semibold">My characters</h1>
          <Link href="/characters/new" className={primaryLinkClass}>
            New character
          </Link>
        </div>
        <Suspense fallback={<p>Loading…</p>}>
          <CharacterList />
        </Suspense>
      </Card>
    </main>
  );
}
