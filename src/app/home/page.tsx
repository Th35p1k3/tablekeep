import { Suspense } from "react";
import Link from "next/link";
import { SignOutButton } from "@/components/sign-out-button";
import { Badge, Card, linkClass, primaryLinkClass } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { ROLE_LABEL, loadMyCampaigns } from "@/lib/campaigns/queries";

async function HomeContent() {
  const { supabase, user } = await requireUser();
  const [{ data: profile }, campaigns] = await Promise.all([
    supabase.from("profiles").select("display_name").eq("id", user.id).maybeSingle(),
    loadMyCampaigns(supabase, user.id),
  ]);
  const name: string = profile?.display_name ?? user.email ?? "adventurer";

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h1 className="text-2xl font-semibold">Welcome, {name}</h1>
        <div className="flex flex-wrap items-center gap-3">
          <Link href="/characters" className={linkClass}>
            My characters
          </Link>
          <Link href="/spells" className={linkClass}>
            My spells
          </Link>
          <Link href="/templates" className={linkClass}>
            Sheet templates
          </Link>
          <Link href="/account" className={linkClass}>
            Account
          </Link>
          <SignOutButton />
        </div>
      </div>

      <div className="mt-8">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Your campaigns</h2>
            <Link href="/campaigns/new" className={primaryLinkClass}>
              New campaign
            </Link>
          </div>

          {campaigns.length === 0 ? (
            <p className="mt-4 leading-relaxed text-stone-600 dark:text-stone-400">
              You’re not in any campaigns yet. Start one, or open an invite link
              from your DM.
            </p>
          ) : (
            <ul className="mt-4 divide-y divide-stone-200 dark:divide-stone-700">
              {campaigns.map((c) => (
                <li key={c.id} className="flex flex-wrap items-center justify-between gap-2 py-3">
                  <div className="min-w-0">
                    <Link href={`/campaigns/${c.id}`} className={`${linkClass} break-words`}>
                      {c.name}
                    </Link>
                    {c.game_system ? (
                      <p className="text-sm text-stone-600 dark:text-stone-400">{c.game_system}</p>
                    ) : null}
                  </div>
                  <div className="flex gap-2">
                    {c.status === "archived" ? <Badge>Archived</Badge> : null}
                    <Badge tone={c.role === "player" ? "neutral" : "accent"}>
                      {ROLE_LABEL[c.role]}
                    </Badge>
                  </div>
                </li>
              ))}
            </ul>
          )}
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
