import { Suspense } from "react";
import Link from "next/link";
import { NewSpellForm } from "@/components/spell-forms";
import { Card, linkClass } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";

async function SignedInForm() {
  await requireUser();
  return <NewSpellForm />;
}

export default function NewSpellPage() {
  return (
    <main className="mx-auto w-full max-w-xl px-4 py-10 sm:py-14">
      <p className="text-sm">
        <Link href="/spells" className={linkClass}>
          ← Back to spells
        </Link>
      </p>
      <h1 className="mt-2 mb-6 text-2xl font-semibold">New spell</h1>
      <Card>
        <Suspense fallback={<p>Loading…</p>}>
          <SignedInForm />
        </Suspense>
      </Card>
    </main>
  );
}
