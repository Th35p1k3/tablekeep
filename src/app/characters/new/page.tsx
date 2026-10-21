import { Suspense } from "react";
import Link from "next/link";
import { NewCharacterForm } from "@/components/character-forms";
import { Card, linkClass, primaryLinkClass } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { loadUsableTemplateVersions } from "@/lib/characters/queries";

async function NewCharacterContent() {
  const { supabase, user } = await requireUser();
  const versions = await loadUsableTemplateVersions(supabase, user.id);
  if (versions.length === 0) {
    return (
      <div className="space-y-4">
        <p className="leading-relaxed">
          Characters are built from a published sheet template, and you don’t
          have one yet. Make a template (the example sheet takes a minute), publish
          it, then come back.
        </p>
        <Link href="/templates/new" className={primaryLinkClass}>
          Create a template
        </Link>
      </div>
    );
  }
  return <NewCharacterForm versions={versions} />;
}

export default function NewCharacterPage() {
  return (
    <main className="mx-auto w-full max-w-xl px-4 py-10 sm:py-14">
      <p className="text-sm">
        <Link href="/characters" className={linkClass}>
          ← Back to characters
        </Link>
      </p>
      <h1 className="mt-2 mb-6 text-2xl font-semibold">New character</h1>
      <Card>
        <Suspense fallback={<p>Loading…</p>}>
          <NewCharacterContent />
        </Suspense>
      </Card>
    </main>
  );
}
