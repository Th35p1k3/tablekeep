import { Suspense } from "react";
import Link from "next/link";
import { SignOutButton } from "@/components/sign-out-button";
import { Card, linkClass } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";

async function HomeContent() {
  const { supabase, user } = await requireUser();
  const { data: profile } = await supabase
    .from("profiles")
    .select("display_name")
    .eq("id", user.id)
    .maybeSingle();
  const name: string = profile?.display_name ?? user.email ?? "adventurer";

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Welcome, {name}</h1>
        <SignOutButton />
      </div>
      <div className="mt-8">
        <Card>
          <h2 className="text-lg font-semibold">Your campaigns</h2>
          <p className="mt-2 leading-relaxed text-stone-600 dark:text-stone-400">
            Campaigns arrive in the next phase. For now you can manage your{" "}
            <Link href="/account" className={linkClass}>
              account settings
            </Link>
            .
          </p>
        </Card>
      </div>
    </>
  );
}

export default function HomePage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-14">
      <Suspense fallback={<p>Loading…</p>}>
        <HomeContent />
      </Suspense>
    </main>
  );
}
