import { Suspense } from "react";
import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import {
  ActionButton,
  CampaignDetailsForm,
  CreateInviteForm,
  DeleteCampaignForm,
  RoleSelectForm,
  TransferOwnershipForm,
} from "@/components/campaign-forms";
import { Badge, Card, linkClass } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { removeMember, revokeInvite, setCampaignArchived } from "@/lib/campaigns/actions";
import { ROLE_LABEL, inviteStatus, loadCampaign, loadInvites } from "@/lib/campaigns/queries";
import { uuidSchema } from "@/lib/campaigns/validation";
import { ChooseAndSubmitForm } from "@/components/party-forms";
import { offerTemplate, setPlayersSeeFullSheets, withdrawTemplate } from "@/lib/party/actions";
import { loadMyLatestVersions, loadOfferedTemplates } from "@/lib/party/queries";

function shortDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

async function SettingsContent({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!uuidSchema.safeParse(id).success) notFound();

  const { supabase, user } = await requireUser();
  const data = await loadCampaign(supabase, id, user.id);
  if (!data) notFound();
  const { campaign, members } = data;
  const myRole = data.myRole;
  if (!myRole) notFound();
  if (myRole === "player") redirect(`/campaigns/${campaign.id}`);

  const isOwner = myRole === "owner";
  const [invites, offered, mine, visibility] = await Promise.all([
    loadInvites(supabase, campaign.id),
    loadOfferedTemplates(supabase, campaign.id),
    loadMyLatestVersions(supabase, user.id),
    supabase.from("campaigns").select("players_see_full_sheets").eq("id", campaign.id).maybeSingle(),
  ]);
  const playersSeeSheets = Boolean(
    (visibility.data as { players_see_full_sheets?: boolean } | null)?.players_see_full_sheets,
  );
  const offeredIds = new Set(offered.map((o) => o.versionId));
  const canOffer = mine.filter((m) => !offeredIds.has(m.versionId));
  const now = new Date();
  const archived = campaign.status === "archived";

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-semibold break-words">{campaign.name}: settings</h1>

      <Card>
        <h2 className="mb-4 text-lg font-semibold">Details</h2>
        <CampaignDetailsForm campaign={campaign} />
      </Card>

      <Card>
        <h2 className="text-lg font-semibold">Invite players</h2>
        <p className="mt-1 mb-4 text-sm leading-relaxed text-stone-600 dark:text-stone-400">
          Anyone with the link can join as a Player while it’s active. Their
          email must also be on the Tablekeep invite list to sign up.
        </p>
        {archived ? (
          <p className="text-sm">Restore the campaign to create invite links.</p>
        ) : (
          <CreateInviteForm campaignId={campaign.id} />
        )}

        {invites.length > 0 ? (
          <div className="mt-6">
            <h3 className="text-sm font-semibold">Recent links</h3>
            <ul className="mt-2 divide-y divide-stone-200 dark:divide-stone-700">
              {invites.map((inv) => {
                const status = inviteStatus(inv, now);
                return (
                  <li key={inv.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                    <span>
                      Created {shortDate(inv.created_at)} · expires {shortDate(inv.expires_at)} ·{" "}
                      {inv.uses}/{inv.max_uses} used
                    </span>
                    <span className="flex items-center gap-2">
                      <Badge tone={status === "Active" ? "accent" : "neutral"}>{status}</Badge>
                      {status === "Active" ? (
                        <ActionButton
                          action={revokeInvite}
                          fields={{ campaignId: campaign.id, inviteId: inv.id }}
                          label="Cancel link"
                        />
                      ) : null}
                    </span>
                  </li>
                );
              })}
            </ul>
          </div>
        ) : null}
      </Card>

      <Card>
        <h2 className="text-lg font-semibold">Character sheets</h2>
        <p className="mt-1 mb-4 text-sm leading-relaxed text-stone-600 dark:text-stone-400">
          Offer your published templates so players can build characters from
          them. Withdrawing one doesn’t affect characters already made.
        </p>
        {offered.length ? (
          <ul className="mb-4 divide-y divide-stone-200 dark:divide-stone-700" data-testid="offered-templates">
            {offered.map((t) => (
              <li key={t.versionId} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                <span>{t.label}</span>
                <ActionButton
                  action={withdrawTemplate}
                  fields={{ campaignId: campaign.id, versionId: t.versionId }}
                  label="Withdraw"
                />
              </li>
            ))}
          </ul>
        ) : (
          <p className="mb-4 text-sm">No templates offered yet.</p>
        )}
        {canOffer.length ? (
          <ChooseAndSubmitForm
            action={offerTemplate}
            fixed={{ campaignId: campaign.id }}
            name="versionId"
            label="Offer a template"
            options={canOffer.map((m) => ({ value: m.versionId, label: m.label }))}
            submitLabel="Offer template"
          />
        ) : (
          <p className="text-sm text-stone-600 dark:text-stone-400">
            {mine.length ? "All your published templates are offered." : "Publish a sheet template to offer it here."}
          </p>
        )}

        <div className="mt-6 border-t border-stone-200 pt-4 dark:border-stone-700">
          <h3 className="text-sm font-semibold">Who can open character sheets</h3>
          <p className="mt-1 mb-3 text-sm text-stone-600 dark:text-stone-400">
            {playersSeeSheets
              ? "Players can open each other’s full sheets."
              : "Players see each other’s character names only. DMs always see full sheets."}
          </p>
          <ActionButton
            action={setPlayersSeeFullSheets}
            fields={{ campaignId: campaign.id, allow: playersSeeSheets ? "false" : "true" }}
            label={playersSeeSheets ? "Show names only" : "Let players see full sheets"}
          />
        </div>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold">Members</h2>
        <ul className="mt-4 divide-y divide-stone-200 dark:divide-stone-700">
          {members.map((m) => {
            const isSelf = m.user_id === user.id;
            const canRemove =
              !isSelf && m.role !== "owner" && (isOwner || m.role === "player");
            return (
              <li key={m.user_id} className="flex flex-col gap-2 py-3 sm:flex-row sm:items-center sm:justify-between">
                <span className="break-words">
                  {m.display_name}
                  {isSelf ? <span className="text-stone-500 dark:text-stone-400"> (you)</span> : null}
                </span>
                <span className="flex flex-wrap items-center gap-2">
                  {isOwner && m.role !== "owner" ? (
                    <RoleSelectForm
                      campaignId={campaign.id}
                      userId={m.user_id}
                      currentRole={m.role === "co_dm" ? "co_dm" : "player"}
                    />
                  ) : (
                    <Badge tone={m.role === "player" ? "neutral" : "accent"}>
                      {ROLE_LABEL[m.role]}
                    </Badge>
                  )}
                  {canRemove ? (
                    <ActionButton
                      action={removeMember}
                      fields={{ campaignId: campaign.id, userId: m.user_id }}
                      label="Remove"
                      confirmText={`Remove ${m.display_name} from this campaign?`}
                      danger
                    />
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      </Card>

      <Card>
        <h2 className="text-lg font-semibold">{archived ? "Restore campaign" : "Archive campaign"}</h2>
        <p className="mt-1 mb-4 text-sm leading-relaxed text-stone-600 dark:text-stone-400">
          {archived
            ? "Bring the campaign back so you can invite players again."
            : "For campaigns that have ended. Nothing is deleted, and you can restore it any time."}
        </p>
        <ActionButton
          action={setCampaignArchived}
          fields={{ campaignId: campaign.id, archived: archived ? "false" : "true" }}
          label={archived ? "Restore campaign" : "Archive campaign"}
        />
      </Card>

      {isOwner ? (
        <>
          <Card>
            <h2 className="text-lg font-semibold">Hand over the campaign</h2>
            <p className="mt-1 mb-4 text-sm leading-relaxed text-stone-600 dark:text-stone-400">
              Make another member the owner. You’ll stay on as a Co-DM.
            </p>
            <TransferOwnershipForm
              campaignId={campaign.id}
              candidates={members.filter((m) => m.user_id !== user.id)}
            />
          </Card>
          <Card>
            <h2 className="text-lg font-semibold text-red-800 dark:text-red-400">Delete campaign</h2>
            <p className="mt-1 mb-4 text-sm leading-relaxed">
              Permanently deletes the campaign, its members list and its invite
              links. It can’t be undone.
            </p>
            <DeleteCampaignForm campaignId={campaign.id} campaignName={campaign.name} />
          </Card>
        </>
      ) : null}
    </div>
  );
}

export default function CampaignSettingsPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10 sm:py-14">
      <Suspense fallback={<p>Loading…</p>}>
        <BackLink params={params} />
      </Suspense>
      <Suspense fallback={<p>Loading…</p>}>
        <SettingsContent params={params} />
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
