import { Suspense } from "react";
import { ActionButton } from "@/components/campaign-forms";
import { CampaignHeader } from "@/components/campaign-tabs";
import { SessionLogForm } from "@/components/tool-forms";
import { Badge, Card } from "@/components/ui";
import { loadCampaignPage } from "@/lib/campaigns/page-data";
import { deleteSessionLog } from "@/lib/tools/actions";
import { loadCampaignSettings, loadSessionLogs } from "@/lib/tools/queries";

function day(iso: string | null): string {
  if (!iso) return "";
  return new Date(`${iso}T12:00:00`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

async function Logs({ params }: { params: Promise<{ id: string }> }) {
  const { supabase, user, campaign, myRole, isManager } = await loadCampaignPage(params);
  const [logs, settings] = await Promise.all([
    loadSessionLogs(supabase, campaign.id),
    loadCampaignSettings(supabase, campaign.id),
  ]);
  const canWrite = isManager || settings.playersWriteLogs;

  return (
    <>
      <CampaignHeader supabase={supabase} campaign={campaign} myRole={myRole} active="logs" />
      <div className="space-y-6">
        {canWrite ? (
          <Card>
            <details>
              <summary className="cursor-pointer text-lg font-semibold">Add a session log</summary>
              <div className="mt-4">
                <SessionLogForm campaignId={campaign.id} canChooseVisibility={isManager} />
              </div>
            </details>
          </Card>
        ) : null}

        {logs.length === 0 ? (
          <Card>
            <p className="text-stone-600 dark:text-stone-400">No session logs yet.</p>
          </Card>
        ) : (
          <ul className="space-y-3" data-testid="session-logs">
            {logs.map((log) => {
              const mayEdit = isManager || (log.author_id === user.id && settings.playersWriteLogs);
              const mayDelete = isManager || (log.author_id === user.id && log.visibility === "players");
              return (
                <li key={log.id}>
                  <Card>
                    <details>
                      <summary className="cursor-pointer">
                        <span className="text-lg font-semibold break-words">
                          {log.session_number !== null ? `Session ${log.session_number}: ` : ""}
                          {log.title}
                        </span>
                        <span className="mt-1 flex flex-wrap items-center gap-2 text-sm text-stone-600 dark:text-stone-400">
                          {log.played_on ? <span>{day(log.played_on)}</span> : null}
                          <span>by {log.authorName}</span>
                          {log.visibility === "dm_only" ? <Badge tone="accent">DMs only</Badge> : null}
                        </span>
                      </summary>
                      {log.body ? <p className="mt-4 leading-relaxed whitespace-pre-wrap">{log.body}</p> : null}
                      {mayEdit || mayDelete ? (
                        <div className="mt-4 space-y-3 border-t border-stone-200 pt-4 dark:border-stone-700">
                          {mayEdit ? (
                            <details>
                              <summary className="cursor-pointer text-sm font-medium">Edit this log</summary>
                              <div className="mt-3">
                                <SessionLogForm campaignId={campaign.id} canChooseVisibility={isManager} existing={log} />
                              </div>
                            </details>
                          ) : null}
                          {mayDelete ? (
                            <ActionButton
                              action={deleteSessionLog}
                              fields={{ campaignId: campaign.id, logId: log.id }}
                              label="Delete log"
                              confirmText={`Delete “${log.title}”? This can’t be undone.`}
                              danger
                            />
                          ) : null}
                        </div>
                      ) : null}
                    </details>
                  </Card>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}

export default function LogsPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-14">
      <Suspense fallback={<p>Loading…</p>}>
        <Logs params={params} />
      </Suspense>
    </main>
  );
}
