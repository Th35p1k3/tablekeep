import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/campaign-forms";
import { Badge, Card, linkClass, secondaryButtonClass } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { leaveCampaign } from "@/lib/campaigns/actions";
import { ChooseAndSubmitForm } from "@/components/party-forms";
import { addCharacterToCampaign, removeCharacterFromCampaign } from "@/lib/party/actions";
import { loadMyFreeCharacters, loadOfferedTemplates, loadParty } from "@/lib/party/queries";
import { ROLE_LABEL, loadCampaign } from "@/lib/campaigns/queries";
import { uuidSchema } from "@/lib/campaigns/validation";

async function CampaignContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();

  const { supabase, user } = await requireUser();
  const data = await loadCampaign(supabase, id, user.id);
  if (!data) notFound();
  const { campaign, members } = data;
  const myRole = data.myRole;
  if (!myRole) notFound();
  const isManager = myRole === "owner" || myRole === "co_dm";
  const [party, offered, freeCharacters] = await Promise.all([
    loadParty(supabase, campaign.id),
    loadOfferedTemplates(supabase, campaign.id),
    loadMyFreeCharacters(supabase, user.id),
  ]);
  const active = campaign.status === "active";

  return (
    <>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold break-words">{campaign.name}</h1>
          <div className="mt-2 flex flex-wrap gap-2">
            <Badge tone={myRole === "player" ? "neutral" : "accent"}>
              You: {ROLE_LABEL[myRole]}
            </Badge>
            {campaign.game_system ? <Badge>{campaign.game_system}</Badge> : null}
            {campaign.status === "archived" ? <Badge>Archived</Badge> : null}
          </div>
        </div>
        {isManager ? (
          <Link href={`/campaigns/${campaign.id}/settings`} className={secondaryButtonClass}>
            Settings
          </Link>
        ) : null}
      </div>

      <div className="mt-8 space-y-6">
        {campaign.description ? (
          <Card>
            <h2 className="text-lg font-semibold">About</h2>
            <p className="mt-2 leading-relaxed whitespace-pre-wrap">{campaign.description}</p>
          </Card>
        ) : null}

        <Card>
          <h2 className="text-lg font-semibold">Party ({members.length})</h2>
          <ul className="mt-4 divide-y divide-stone-200 dark:divide-stone-700">
            {members.map((m) => (
              <li
                key={m.user_id}
                data-testid="member-row"
                className="flex items-center justify-between gap-2 py-2.5"
              >
                <span className="break-words">
                  {m.display_name}
                  {m.user_id === user.id ? (
                    <span className="text-stone-500 dark:text-stone-400"> (you)</span>
                  ) : null}
                </span>
                <Badge tone={m.role === "player" ? "neutral" : "accent"}>
                  {ROLE_LABEL[m.role]}
                </Badge>
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

        {myRole !== "owner" ? (
          <ActionButton
            action={leaveCampaign}
            fields={{ campaignId: campaign.id }}
            label="Leave campaign"
            confirmText="Leave this campaign? You’ll need a new invite link to rejoin."
            danger
          />
        ) : null}
      </div>
    </>
  );
}

export default function CampaignPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-14">
      <p className="mb-4 text-sm">
        <Link href="/home" className={linkClass}>
          ← Back to home
        </Link>
      </p>
      <Suspense fallback={<p>Loading…</p>}>
        <CampaignContent params={params} />
      </Suspense>
    </main>
  );
}
