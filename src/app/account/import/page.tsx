import { Suspense } from "react";
import Link from "next/link";
import { ImportForm } from "@/components/import-form";
import { Card, linkClass } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";

async function SignedIn() {
  await requireUser();
  return <ImportForm />;
}

export default function ImportPage() {
  return (
    <main className="mx-auto w-full max-w-xl px-4 py-10 sm:py-14">
      <p className="text-sm">
        <Link href="/account" className={linkClass}>
          ← Back to account
        </Link>
      </p>
      <h1 className="mt-2 mb-2 text-2xl font-semibold">Import from a file</h1>
      <p className="mb-6 leading-relaxed text-stone-600 dark:text-stone-400">
        Bring in characters, spells and sheet templates from a Tablekeep export,
        yours or a friend’s. Every item is checked before it’s added.
      </p>
      <Card>
        <Suspense fallback={<p>Loading…</p>}>
          <SignedIn />
        </Suspense>
      </Card>
    </main>
  );
}
