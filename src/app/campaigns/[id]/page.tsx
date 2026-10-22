import { Suspense } from "react";
import { ActionButton } from "@/components/campaign-forms";
import { CampaignHeader } from "@/components/campaign-tabs";
import { AnnouncementForm } from "@/components/tool-forms";
import { Badge, Card } from "@/components/ui";
import { leaveCampaign } from "@/lib/campaigns/actions";
import { loadCampaignPage } from "@/lib/campaigns/page-data";
import { deleteAnnouncement, toggleAnnouncementPin } from "@/lib/tools/actions";
import { loadAnnouncements } from "@/lib/tools/queries";

function when(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

async function Overview({ params }: { params: Promise<{ id: string }> }) {
  const { supabase, campaign, myRole, isManager } = await loadCampaignPage(params);
  const announcements = await loadAnnouncements(supabase, campaign.id);

  return (
    <>
      <CampaignHeader supabase={supabase} campaign={campaign} myRole={myRole} active="overview" />
      <div className="space-y-6">
        <Card>
          <h2 className="text-lg font-semibold">Announcements</h2>
          {announcements.length === 0 ? (
            <p className="mt-2 text-sm text-stone-600 dark:text-stone-400">No announcements yet.</p>
          ) : (
            <ul className="mt-3 space-y-3" data-testid="announcements">
              {announcements.map((a) => (
                <li key={a.id} className="rounded-lg border border-stone-200 p-3 dark:border-stone-700">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <h3 className="font-semibold break-words">
                        {a.pinned ? <span aria-label="Pinned">📌 </span> : null}
                        {a.title}
                      </h3>
                      <p className="text-xs text-stone-600 dark:text-stone-400">
                        {a.authorName} · {when(a.created_at)}
                      </p>
                    </div>
                    {a.pinned ? <Badge tone="accent">Pinned</Badge> : null}
                  </div>
                  {a.body ? <p className="mt-2 leading-relaxed whitespace-pre-wrap">{a.body}</p> : null}
                  {isManager ? (
                    <div className="mt-3 flex flex-wrap items-start gap-2">
                      <ActionButton
                        action={toggleAnnouncementPin}
                        fields={{ campaignId: campaign.id, announcementId: a.id, pinned: a.pinned ? "false" : "true" }}
                        label={a.pinned ? "Unpin" : "Pin"}
                      />
                      <details className="w-full sm:w-auto">
                        <summary className="cursor-pointer text-sm font-medium">Edit</summary>
                        <div className="mt-3">
                          <AnnouncementForm campaignId={campaign.id} existing={a} />
                        </div>
                      </details>
                      <ActionButton
                        action={deleteAnnouncement}
                        fields={{ campaignId: campaign.id, announcementId: a.id }}
                        label="Delete"
                        confirmText={`Delete the announcement “${a.title}”?`}
                        danger
                      />
                    </div>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
          {isManager ? (
            <details className="mt-4 border-t border-stone-200 pt-4 dark:border-stone-700">
              <summary className="cursor-pointer font-medium">Post an announcement</summary>
              <div className="mt-3">
                <AnnouncementForm campaignId={campaign.id} />
              </div>
            </details>
          ) : null}
        </Card>

        {campaign.description ? (
          <Card>
            <h2 className="text-lg font-semibold">About</h2>
            <p className="mt-2 leading-relaxed whitespace-pre-wrap">{campaign.description}</p>
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
      <Suspense fallback={<p>Loading…</p>}>
        <Overview params={params} />
      </Suspense>
    </main>
  );
}
