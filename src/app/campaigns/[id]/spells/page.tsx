import { Suspense } from "react";
import { ActionButton } from "@/components/campaign-forms";
import { CampaignHeader } from "@/components/campaign-tabs";
import { SubmitHomebrewForm } from "@/components/homebrew-forms";
import { SpellCard } from "@/components/spell-card";
import { Card } from "@/components/ui";
import { loadCampaignPage } from "@/lib/campaigns/page-data";
import { withdrawSubmission } from "@/lib/homebrew/actions";
import { loadCampaignSpells, loadSubmissions } from "@/lib/homebrew/queries";
import { STATUS_LABEL, encodeSubmittable } from "@/lib/homebrew/rules";
import { loadMyLatestVersions, loadOfferedTemplates } from "@/lib/party/queries";
import { loadMyLatestSpellVersions } from "@/lib/spells/queries";
import { coerceSpell } from "@/lib/spells/schema";

async function Spells({ params }: { params: Promise<{ id: string }> }) {
  const { supabase, user, campaign, myRole } = await loadCampaignPage(params);
  const [campaignSpells, offered, mySubmissions, mySpells, myTemplates] = await Promise.all([
    loadCampaignSpells(supabase, campaign.id),
    loadOfferedTemplates(supabase, campaign.id),
    loadSubmissions(supabase, campaign.id, { onlyMine: user.id, limit: 20 }),
    loadMyLatestSpellVersions(supabase, user.id),
    loadMyLatestVersions(supabase, user.id),
  ]);
  const active = campaign.status === "active";

  // Things I could submit: not already approved here and not already waiting.
  const blocked = new Set([
    ...campaignSpells.map((sp) => sp.versionId),
    ...offered.map((t) => t.versionId),
    ...mySubmissions.filter((sub) => sub.status === "pending").map((sub) => sub.versionId),
  ]);
  const submittable = [
    ...mySpells
      .filter((sp) => !blocked.has(sp.versionId))
      .map((sp) => ({ value: encodeSubmittable("spell", sp.versionId), label: `Spell: ${sp.label}` })),
    ...myTemplates
      .filter((t) => !blocked.has(t.versionId))
      .map((t) => ({ value: encodeSubmittable("template", t.versionId), label: `Sheet: ${t.label}` })),
  ];

  return (
    <>
      <CampaignHeader supabase={supabase} campaign={campaign} myRole={myRole} active="spells" />
      <div className="space-y-6">
        <Card>
          <h2 className="text-lg font-semibold">Campaign spells ({campaignSpells.length})</h2>
          {campaignSpells.length === 0 ? (
            <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">
              No spells approved yet. Players can submit their own below.
            </p>
          ) : (
            <ul className="mt-3 space-y-2" data-testid="campaign-spells">
              {campaignSpells.map((sp) => (
                <li key={sp.versionId}>
                  <details className="rounded-lg border border-stone-200 p-3 dark:border-stone-700">
                    <summary className="cursor-pointer font-medium">
                      {sp.name} <span className="text-sm font-normal text-stone-600 dark:text-stone-400">v{sp.versionNumber}</span>
                    </summary>
                    <div className="mt-3">
                      <SpellCard name={sp.name} spell={coerceSpell(sp.content)} version={sp.versionNumber} />
                    </div>
                  </details>
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card>
          <h2 className="text-lg font-semibold">Homebrew</h2>
          <p className="mt-1 mb-4 text-sm text-stone-600 dark:text-stone-400">
            Submit a published spell or sheet template for your DM to approve for this campaign.
          </p>
          {active && submittable.length ? (
            <SubmitHomebrewForm campaignId={campaign.id} options={submittable} />
          ) : (
            <p className="text-sm text-stone-600 dark:text-stone-400">
              {active ? "Publish a spell or sheet template to submit it here." : "This campaign is archived."}
            </p>
          )}
          {mySubmissions.length ? (
            <div className="mt-6">
              <h3 className="text-sm font-semibold">Your submissions</h3>
              <ul className="mt-2 divide-y divide-stone-200 text-sm dark:divide-stone-700" data-testid="my-submissions">
                {mySubmissions.map((sub) => (
                  <li key={sub.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                    <span className="min-w-0 break-words">
                      <span className="font-medium">{sub.name}</span> v{sub.versionNumber ?? "?"} · {STATUS_LABEL[sub.status]}
                      {sub.reviewNote ? (
                        <span className="block text-stone-600 dark:text-stone-400">DM’s note: “{sub.reviewNote}”</span>
                      ) : null}
                    </span>
                    {sub.status === "pending" ? (
                      <ActionButton
                        action={withdrawSubmission}
                        fields={{ campaignId: campaign.id, submissionId: sub.id }}
                        label="Withdraw"
                      />
                    ) : null}
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </Card>
      </div>
    </>
  );
}

export default function CampaignSpellsPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-14">
      <Suspense fallback={<p>Loading…</p>}>
        <Spells params={params} />
      </Suspense>
    </main>
  );
}
