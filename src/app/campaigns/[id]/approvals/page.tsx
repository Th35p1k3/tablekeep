import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { ReviewForm } from "@/components/homebrew-forms";
import { SheetPreview } from "@/components/sheet-view";
import { SpellCard } from "@/components/spell-card";
import { Badge, Card, linkClass } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { loadCampaign } from "@/lib/campaigns/queries";
import { uuidSchema } from "@/lib/campaigns/validation";
import { loadSubmissions } from "@/lib/homebrew/queries";
import { STATUS_LABEL } from "@/lib/homebrew/rules";
import { coerceSpell } from "@/lib/spells/schema";
import { coerceDefinition } from "@/lib/templates/editing";

function when(iso: string | null): string {
  return iso ? new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "";
}

async function ApprovalsContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();
  const { supabase, user } = await requireUser();
  const data = await loadCampaign(supabase, id, user.id);
  if (!data) notFound();
  const myRole = data.myRole;
  if (!myRole) notFound();
  if (myRole === "player") redirect(`/campaigns/${data.campaign.id}`);

  const [pending, all] = await Promise.all([
    loadSubmissions(supabase, data.campaign.id, { status: "pending" }),
    loadSubmissions(supabase, data.campaign.id, { limit: 30 }),
  ]);
  const reviewed = all.filter((s) => s.status !== "pending");

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold break-words">{data.campaign.name}: approval queue</h1>

      {pending.length === 0 ? (
        <Card>
          <p className="text-stone-600 dark:text-stone-400">Nothing waiting for review.</p>
        </Card>
      ) : (
        <ul className="space-y-6" data-testid="pending-submissions">
          {pending.map((s) => (
            <li key={s.id}>
              <Card>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <h2 className="text-lg font-semibold break-words">{s.name}</h2>
                    <p className="text-sm text-stone-600 dark:text-stone-400">
                      {s.type === "spell" ? "Spell" : "Sheet template"} version {s.versionNumber ?? "?"} · from{" "}
                      {s.submitterName} · {when(s.createdAt)}
                    </p>
                  </div>
                  <Badge>{s.type === "spell" ? "Spell" : "Template"}</Badge>
                </div>
                {s.submitterNote ? (
                  <p className="mt-3 rounded-md bg-stone-100 px-3 py-2 text-sm dark:bg-stone-800">
                    <span className="font-medium">Their note: </span>
                    {s.submitterNote}
                  </p>
                ) : null}
                <div className="mt-4">
                  {s.type === "spell" ? (
                    <SpellCard name={s.name} spell={coerceSpell(s.body)} version={s.versionNumber} />
                  ) : (
                    <details className="rounded-lg border border-stone-200 p-3 dark:border-stone-700">
                      <summary className="cursor-pointer font-medium">Preview the sheet</summary>
                      <div className="mt-3">
                        <SheetPreview definition={coerceDefinition(s.body)} idPrefix={`review-${s.id}`} />
                      </div>
                    </details>
                  )}
                </div>
                <div className="mt-4 border-t border-stone-200 pt-4 dark:border-stone-700">
                  <ReviewForm campaignId={data.campaign.id} submissionId={s.id} label={s.name} />
                </div>
              </Card>
            </li>
          ))}
        </ul>
      )}

      {reviewed.length ? (
        <Card>
          <h2 className="text-lg font-semibold">Recently reviewed</h2>
          <ul className="mt-3 divide-y divide-stone-200 text-sm dark:divide-stone-700">
            {reviewed.map((s) => (
              <li key={s.id} className="py-2.5">
                <span className="font-medium">{s.name}</span> (v{s.versionNumber ?? "?"}) from {s.submitterName}:{" "}
                {STATUS_LABEL[s.status]} {when(s.reviewedAt)}
                {s.reviewNote ? <span className="block text-stone-600 dark:text-stone-400">“{s.reviewNote}”</span> : null}
              </li>
            ))}
          </ul>
        </Card>
      ) : null}
    </div>
  );
}

export default function ApprovalsPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-14">
      <Suspense fallback={<p>Loading…</p>}>
        <BackLink params={params} />
      </Suspense>
      <Suspense fallback={<p>Loading…</p>}>
        <ApprovalsContent params={params} />
      </Suspense>
    </main>
  );
}

async function BackLink({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <p className="mb-4 text-sm">
      <Link href={`/campaigns/${encodeURIComponent(id)}`} className={linkClass}>
        ← Back to campaign
      </Link>
    </p>
  );
}
