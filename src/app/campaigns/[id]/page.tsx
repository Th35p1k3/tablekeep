import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { ActionButton } from "@/components/campaign-forms";
import { Badge, Card, linkClass, secondaryButtonClass } from "@/components/ui";
import { requireUser } from "@/lib/auth/session";
import { leaveCampaign } from "@/lib/campaigns/actions";
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
          <h2 className="text-lg font-semibold">Coming soon</h2>
          <p className="mt-2 leading-relaxed text-stone-600 dark:text-stone-400">
            Characters, spells, chat, session logs and handouts arrive in later phases.
          </p>
        </Card>

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
