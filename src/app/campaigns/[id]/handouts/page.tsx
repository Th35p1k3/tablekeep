import { Suspense } from "react";
import { CampaignHeader } from "@/components/campaign-tabs";
import { DeleteHandoutButton, HandoutForm } from "@/components/handout-form";
import { Badge, Card, linkClass } from "@/components/ui";
import { loadCampaignPage } from "@/lib/campaigns/page-data";
import { loadHandouts } from "@/lib/handouts/queries";
import { formatBytes } from "@/lib/handouts/rules";

async function Handouts({ params }: { params: Promise<{ id: string }> }) {
  const { supabase, campaign, members, myRole, isManager } = await loadCampaignPage(params);
  const handouts = await loadHandouts(supabase, campaign.id);
  const players = members.filter((m) => m.role === "player").map((m) => ({ user_id: m.user_id, display_name: m.display_name }));
  const nameOf = new Map(members.map((m) => [m.user_id, m.display_name]));

  return (
    <>
      <CampaignHeader supabase={supabase} campaign={campaign} myRole={myRole} active="handouts" />
      <div className="space-y-6">
        {isManager ? (
          <Card>
            <details>
              <summary className="cursor-pointer text-lg font-semibold">Share a handout</summary>
              <div className="mt-4">
                <HandoutForm campaignId={campaign.id} players={players} />
              </div>
            </details>
          </Card>
        ) : null}

        {handouts.length === 0 ? (
          <Card>
            <p className="text-stone-600 dark:text-stone-400">No handouts yet.</p>
          </Card>
        ) : (
          <ul className="space-y-4" data-testid="handouts">
            {handouts.map((h) => (
              <li key={h.id}>
                <Card>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <h2 className="text-lg font-semibold break-words">{h.title}</h2>
                    {h.visibility === "dm_only" ? <Badge tone="accent">DMs only</Badge> : null}
                    {h.visibility === "selected" ? (
                      <Badge tone="accent">
                        {isManager
                          ? `For ${h.recipients.map((r) => nameOf.get(r) ?? "a former member").join(", ") || "nobody"}`
                          : "Just for you"}
                      </Badge>
                    ) : null}
                  </div>
                  {h.body ? <p className="mt-2 leading-relaxed whitespace-pre-wrap">{h.body}</p> : null}
                  {h.file_path ? (
                    <div className="mt-3">
                      {h.fileUrl && h.file_type?.startsWith("image/") ? (
                        <a href={h.fileUrl} target="_blank" rel="noopener noreferrer">
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={h.fileUrl}
                            alt={h.title}
                            data-testid="handout-image"
                            className="max-h-96 w-auto max-w-full rounded-lg border border-stone-200 dark:border-stone-700"
                          />
                        </a>
                      ) : null}
                      {h.fileUrl ? (
                        <p className="mt-2 text-sm">
                          <a href={h.fileUrl} target="_blank" rel="noopener noreferrer" className={linkClass}>
                            Open {h.file_type === "application/pdf" ? "PDF" : "full size"}
                          </a>
                          <span className="text-stone-500"> · {h.file_name}{h.file_size ? ` · ${formatBytes(h.file_size)}` : ""}</span>
                        </p>
                      ) : (
                        <p className="text-sm text-stone-500">The file couldn’t be loaded. Reload the page.</p>
                      )}
                    </div>
                  ) : null}
                  {isManager ? (
                    <div className="mt-4 flex flex-wrap items-start gap-3 border-t border-stone-200 pt-3 dark:border-stone-700">
                      <details className="w-full">
                        <summary className="cursor-pointer text-sm font-medium">Edit text and who can see it</summary>
                        <div className="mt-3">
                          <HandoutForm
                            campaignId={campaign.id}
                            players={players}
                            existing={{ id: h.id, title: h.title, body: h.body, visibility: h.visibility, recipients: h.recipients }}
                          />
                        </div>
                      </details>
                      <DeleteHandoutButton campaignId={campaign.id} handoutId={h.id} title={h.title} />
                    </div>
                  ) : null}
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

export default function HandoutsPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-14">
      <Suspense fallback={<p>Loading…</p>}>
        <Handouts params={params} />
      </Suspense>
    </main>
  );
}
