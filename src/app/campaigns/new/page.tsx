import { Suspense } from "react";
import Link from "next/link";
import { CampaignDetailsForm } from "@/components/campaign-forms";
import { Card, linkClass } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";

async function SignedInForm() {
  await requireUser();
  return <CampaignDetailsForm />;
}

export default function NewCampaignPage() {
  return (
    <main className="mx-auto w-full max-w-xl px-4 py-10 sm:py-14">
      <p className="text-sm">
        <Link href="/home" className={linkClass}>
          ← Back to home
        </Link>
      </p>
      <h1 className="mt-2 mb-6 text-2xl font-semibold">New campaign</h1>
      <Card>
        <Suspense fallback={<p>Loading…</p>}>
          <SignedInForm />
        </Suspense>
      </Card>
    </main>
  );
}
