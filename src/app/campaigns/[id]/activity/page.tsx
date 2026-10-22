import { Suspense } from "react";
import { redirect } from "next/navigation";
import { CampaignHeader } from "@/components/campaign-tabs";
import { Card } from "@/components/ui";
import { loadCampaignPage } from "@/lib/campaigns/page-data";
import { describeActivity } from "@/lib/tools/rules";
import { loadActivity, loadNames } from "@/lib/tools/queries";

function when(iso: string): string {
  return new Date(iso).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

async function Activity({ params }: { params: Promise<{ id: string }> }) {
  const { supabase, campaign, myRole, isManager } = await loadCampaignPage(params);
  if (!isManager) redirect(`/campaigns/${campaign.id}`);
  const rows = await loadActivity(supabase, campaign.id);
  const names = await loadNames(
    supabase,
    rows.flatMap((r) => [r.actor_id, typeof r.details.user_id === "string" ? r.details.user_id : null]),
  );
  const nameOf = (id: string) => names.get(id) ?? "a former member";

  return (
    <>
      <CampaignHeader supabase={supabase} campaign={campaign} myRole={myRole} active="activity" />
      <Card>
        <h2 className="text-lg font-semibold">Recent activity</h2>
        <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
          Important changes in this campaign, newest first. Only DMs and Co-DMs see this.
        </p>
        {rows.length === 0 ? (
          <p className="mt-4 text-sm">Nothing recorded yet.</p>
        ) : (
          <ul className="mt-4 divide-y divide-stone-200 text-sm dark:divide-stone-700" data-testid="activity">
            {rows.map((r) => (
              <li key={r.id} className="flex flex-wrap justify-between gap-2 py-2.5">
                <span className="min-w-0 break-words">
                  {describeActivity(
                    { action: r.action, details: r.details, actorName: r.actor_id ? nameOf(r.actor_id) : "Someone" },
                    nameOf,
                  )}
                </span>
                <span className="text-stone-500 dark:text-stone-400">{when(r.created_at)}</span>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}

export default function ActivityPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-14">
      <Suspense fallback={<p>Loading…</p>}>
        <Activity params={params} />
      </Suspense>
    </main>
  );
}
