import { Suspense } from "react";
import Link from "next/link";
import { NewTemplateForm } from "@/components/template-forms";
import { Card, linkClass } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";

async function SignedInForm() {
  await requireUser();
  return <NewTemplateForm />;
}

export default function NewTemplatePage() {
  return (
    <main className="mx-auto w-full max-w-xl px-4 py-10 sm:py-14">
      <p className="text-sm">
        <Link href="/templates" className={linkClass}>
          ← Back to templates
        </Link>
      </p>
      <h1 className="mt-2 mb-6 text-2xl font-semibold">New sheet template</h1>
      <Card>
        <Suspense fallback={<p>Loading…</p>}>
          <SignedInForm />
        </Suspense>
      </Card>
    </main>
  );
}
