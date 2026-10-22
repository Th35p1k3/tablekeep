import { Suspense } from "react";
import Link from "next/link";
import { ActionButton } from "@/components/campaign-forms";
import { CampaignHeader } from "@/components/campaign-tabs";
import { ChooseAndSubmitForm } from "@/components/party-forms";
import { Badge, Card, linkClass } from "@/components/ui";
import { ROLE_LABEL } from "@/lib/campaigns/queries";
import { loadCampaignPage } from "@/lib/campaigns/page-data";
import { addCharacterToCampaign, removeCharacterFromCampaign } from "@/lib/party/actions";
import { loadMyFreeCharacters, loadOfferedTemplates, loadParty } from "@/lib/party/queries";

async function Party({ params }: { params: Promise<{ id: string }> }) {
  const { supabase, user, campaign, members, myRole, isManager } = await loadCampaignPage(params);
  const [party, offered, freeCharacters] = await Promise.all([
    loadParty(supabase, campaign.id),
    loadOfferedTemplates(supabase, campaign.id),
    loadMyFreeCharacters(supabase, user.id),
  ]);
  const active = campaign.status === "active";

  return (
    <>
      <CampaignHeader supabase={supabase} campaign={campaign} myRole={myRole} active="party" />
      <div className="space-y-6">
        <Card>
          <h2 className="text-lg font-semibold">Players ({members.length})</h2>
          <ul className="mt-4 divide-y divide-stone-200 dark:divide-stone-700">
            {members.map((m) => (
              <li key={m.user_id} data-testid="member-row" className="flex items-center justify-between gap-2 py-2.5">
                <span className="break-words">
                  {m.display_name}
                  {m.user_id === user.id ? <span className="text-stone-500 dark:text-stone-400"> (you)</span> : null}
                </span>
                <Badge tone={m.role === "player" ? "neutral" : "accent"}>{ROLE_LABEL[m.role]}</Badge>
              </li>
            ))}
          </ul>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold">Characters ({party.length})</h2>
          {party.length === 0 ? (
            <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">No characters in this campaign yet.</p>
          ) : (
            <ul className="mt-3 divide-y divide-stone-200 dark:divide-stone-700" data-testid="party-list">
              {party.map((c) => (
                <li key={c.character_id} className="flex flex-wrap items-center justify-between gap-2 py-2.5">
                  <span className="min-w-0 break-words">
                    {c.can_view ? (
                      <Link href={`/characters/${c.character_id}`} className={linkClass}>
                        {c.character_name}
                      </Link>
                    ) : (
                      <span className="font-medium">{c.character_name}</span>
                    )}
                    <span className="block text-xs text-stone-600 dark:text-stone-400">
                      {c.owner_id === user.id ? "Your character" : `Played by ${c.owner_name}`} · {c.template_name}
                      {c.version_number ? ` v${c.version_number}` : ""}
                    </span>
                  </span>
                  {c.owner_id === user.id || isManager ? (
                    <ActionButton
                      action={removeCharacterFromCampaign}
                      fields={{ campaignId: campaign.id, characterId: c.character_id }}
                      label="Remove"
                      confirmText={`Take ${c.character_name} out of this campaign?`}
                    />
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {active ? (
            <div className="mt-4 border-t border-stone-200 pt-4 dark:border-stone-700">
              {freeCharacters.length ? (
                <ChooseAndSubmitForm
                  action={addCharacterToCampaign}
                  fixed={{ campaignId: campaign.id }}
                  name="characterId"
                  label="Add one of your characters"
                  options={freeCharacters.map((c) => ({ value: c.id, label: c.name }))}
                  submitLabel="Add character"
                />
              ) : (
                <p className="text-sm text-stone-600 dark:text-stone-400">
                  All your characters are already in campaigns.{" "}
                  <Link href="/characters/new" className={linkClass}>
                    Create a new one
                  </Link>
                  .
                </p>
              )}
            </div>
          ) : null}
        </Card>

        {offered.length ? (
          <Card>
            <h2 className="text-lg font-semibold">Sheets for this campaign</h2>
            <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
              Your DM offers these templates. Pick one when you create a character.
            </p>
            <ul className="mt-3 list-disc space-y-1 pl-5 text-sm">
              {offered.map((t) => (
                <li key={t.versionId}>{t.label}</li>
              ))}
            </ul>
            <p className="mt-3 text-sm">
              <Link href="/characters/new" className={linkClass}>
                Create a character
              </Link>
            </p>
          </Card>
        ) : null}
      </div>
    </>
  );
}

export default function PartyPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-14">
      <Suspense fallback={<p>Loading…</p>}>
        <Party params={params} />
      </Suspense>
    </main>
  );
}
