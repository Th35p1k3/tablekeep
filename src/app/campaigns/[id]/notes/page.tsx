import { Suspense } from "react";
import { redirect } from "next/navigation";
import { ActionButton } from "@/components/campaign-forms";
import { CampaignHeader } from "@/components/campaign-tabs";
import { DmNoteForm } from "@/components/tool-forms";
import { Badge, Card } from "@/components/ui";
import { loadCampaignPage } from "@/lib/campaigns/page-data";
import { loadParty } from "@/lib/party/queries";
import { deleteDmNote } from "@/lib/tools/actions";
import { loadDmNotes, loadSessionLogs } from "@/lib/tools/queries";

async function Notes({ params }: { params: Promise<{ id: string }> }) {
  const { supabase, campaign, myRole, isManager } = await loadCampaignPage(params);
  if (!isManager) redirect(`/campaigns/${campaign.id}`);
  const [notes, party, logs] = await Promise.all([
    loadDmNotes(supabase, campaign.id),
    loadParty(supabase, campaign.id),
    loadSessionLogs(supabase, campaign.id),
  ]);
  const characters = party.map((c) => ({ id: c.character_id, name: c.character_name }));
  const logOptions = logs.map((l) => ({
    id: l.id,
    title: `${l.session_number !== null ? `Session ${l.session_number}: ` : ""}${l.title}`,
  }));
  const characterName = new Map(characters.map((c) => [c.id, c.name]));
  const logTitle = new Map(logOptions.map((l) => [l.id, l.title]));

  return (
    <>
      <CampaignHeader supabase={supabase} campaign={campaign} myRole={myRole} active="notes" />
      <div className="space-y-6">
        <p className="text-sm text-stone-600 dark:text-stone-400">
          Only DMs and Co-DMs can see these notes. Players never receive them.
        </p>
        <Card>
          <details>
            <summary className="cursor-pointer text-lg font-semibold">Add a note</summary>
            <div className="mt-4">
              <DmNoteForm campaignId={campaign.id} characters={characters} logs={logOptions} />
            </div>
          </details>
        </Card>

        {notes.length === 0 ? (
          <Card>
            <p className="text-stone-600 dark:text-stone-400">No notes yet.</p>
          </Card>
        ) : (
          <ul className="space-y-3" data-testid="dm-notes">
            {notes.map((n) => (
              <li key={n.id}>
                <Card>
                  <h2 className="font-semibold break-words">{n.title}</h2>
                  <div className="mt-1 flex flex-wrap gap-2">
                    {n.character_id ? <Badge>{characterName.get(n.character_id) ?? "A character"}</Badge> : null}
                    {n.session_log_id ? <Badge>{logTitle.get(n.session_log_id) ?? "A session"}</Badge> : null}
                  </div>
                  {n.body ? <p className="mt-3 leading-relaxed whitespace-pre-wrap">{n.body}</p> : null}
                  <div className="mt-4 space-y-3 border-t border-stone-200 pt-3 dark:border-stone-700">
                    <details>
                      <summary className="cursor-pointer text-sm font-medium">Edit</summary>
                      <div className="mt-3">
                        <DmNoteForm campaignId={campaign.id} characters={characters} logs={logOptions} existing={n} />
                      </div>
                    </details>
                    <ActionButton
                      action={deleteDmNote}
                      fields={{ campaignId: campaign.id, noteId: n.id }}
                      label="Delete note"
                      confirmText={`Delete “${n.title}”?`}
                      danger
                    />
                  </div>
                </Card>
              </li>
            ))}
          </ul>
        )}
      </div>
    </>
  );
}

export default function NotesPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-14">
      <Suspense fallback={<p>Loading…</p>}>
        <Notes params={params} />
      </Suspense>
    </main>
  );
}
