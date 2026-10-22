"use client";

import { useActionState } from "react";
import { saveAnnouncement, saveDmNote, saveSessionLog } from "@/lib/tools/actions";
import { idleState } from "@/lib/forms";
import { Field, FormMessage, SubmitButton, TextAreaField, selectClass } from "./ui";

export function AnnouncementForm({
  campaignId,
  existing,
}: {
  campaignId: string;
  existing?: { id: string; title: string; body: string; pinned: boolean };
}) {
  const [state, action, pending] = useActionState(saveAnnouncement, idleState);
  const v = state.values;
  const prefix = existing ? `ann-${existing.id}` : "ann-new";
  return (
    <form action={action} className="space-y-3" noValidate data-testid={existing ? undefined : "new-announcement"}>
      <input type="hidden" name="campaignId" value={campaignId} />
      {existing ? <input type="hidden" name="announcementId" value={existing.id} /> : null}
      <Field id={`${prefix}-title`} label="Announcement title" name="title" defaultValue={v?.title ?? existing?.title} error={state.fieldErrors?.title} />
      <TextAreaField id={`${prefix}-body`} label="Details" name="body" rows={3} defaultValue={v?.body ?? existing?.body} error={state.fieldErrors?.body} />
      <label htmlFor={`${prefix}-pinned`} className="flex items-center gap-2 text-sm font-medium">
        <input id={`${prefix}-pinned`} type="checkbox" name="pinned" defaultChecked={existing?.pinned ?? false} className="h-5 w-5 accent-amber-800" />
        Pin to the top
      </label>
      <FormMessage status={state.status} message={state.message} />
      <SubmitButton pending={pending}>{existing ? "Save announcement" : "Post announcement"}</SubmitButton>
    </form>
  );
}

export function SessionLogForm({
  campaignId,
  canChooseVisibility,
  existing,
}: {
  campaignId: string;
  canChooseVisibility: boolean;
  existing?: {
    id: string;
    title: string;
    body: string;
    session_number: number | null;
    played_on: string | null;
    visibility: "players" | "dm_only";
  };
}) {
  const [state, action, pending] = useActionState(saveSessionLog, idleState);
  const v = state.values;
  const prefix = existing ? `log-${existing.id}` : "log-new";
  return (
    <form action={action} className="space-y-3" noValidate data-testid={existing ? undefined : "new-log"}>
      <input type="hidden" name="campaignId" value={campaignId} />
      {existing ? <input type="hidden" name="logId" value={existing.id} /> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field
          id={`${prefix}-number`}
          label="Session number"
          name="sessionNumber"
          type="number"
          defaultValue={v?.sessionNumber ?? (existing?.session_number?.toString() ?? "")}
          error={state.fieldErrors?.sessionNumber}
        />
        <Field
          id={`${prefix}-date`}
          label="Date played"
          name="playedOn"
          type="date"
          defaultValue={v?.playedOn ?? existing?.played_on ?? ""}
          error={state.fieldErrors?.playedOn}
        />
      </div>
      <Field id={`${prefix}-title`} label="Log title" name="title" defaultValue={v?.title ?? existing?.title} error={state.fieldErrors?.title} />
      <TextAreaField id={`${prefix}-body`} label="Recap" name="body" rows={6} defaultValue={v?.body ?? existing?.body} error={state.fieldErrors?.body} />
      {canChooseVisibility ? (
        <div className="space-y-1">
          <label htmlFor={`${prefix}-visibility`} className="block text-sm font-medium">
            Who can read it
          </label>
          <select
            id={`${prefix}-visibility`}
            name="visibility"
            defaultValue={v?.visibility ?? existing?.visibility ?? "players"}
            className={selectClass}
          >
            <option value="players">Everyone in the campaign</option>
            <option value="dm_only">DMs only (prep and secrets)</option>
          </select>
        </div>
      ) : (
        <input type="hidden" name="visibility" value="players" />
      )}
      <FormMessage status={state.status} message={state.message} />
      <SubmitButton pending={pending}>{existing ? "Save log" : "Add log"}</SubmitButton>
    </form>
  );
}

export function DmNoteForm({
  campaignId,
  characters,
  logs,
  existing,
}: {
  campaignId: string;
  characters: Array<{ id: string; name: string }>;
  logs: Array<{ id: string; title: string }>;
  existing?: { id: string; title: string; body: string; character_id: string | null; session_log_id: string | null };
}) {
  const [state, action, pending] = useActionState(saveDmNote, idleState);
  const v = state.values;
  const prefix = existing ? `note-${existing.id}` : "note-new";
  return (
    <form action={action} className="space-y-3" noValidate data-testid={existing ? undefined : "new-note"}>
      <input type="hidden" name="campaignId" value={campaignId} />
      {existing ? <input type="hidden" name="noteId" value={existing.id} /> : null}
      <Field id={`${prefix}-title`} label="Note title" name="title" defaultValue={v?.title ?? existing?.title} error={state.fieldErrors?.title} />
      <TextAreaField id={`${prefix}-body`} label="Note" name="body" rows={4} defaultValue={v?.body ?? existing?.body} error={state.fieldErrors?.body} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor={`${prefix}-character`} className="block text-sm font-medium">
            About a character (optional)
          </label>
          <select id={`${prefix}-character`} name="characterId" defaultValue={existing?.character_id ?? ""} className={selectClass}>
            <option value="">None</option>
            {characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <label htmlFor={`${prefix}-log`} className="block text-sm font-medium">
            About a session (optional)
          </label>
          <select id={`${prefix}-log`} name="sessionLogId" defaultValue={existing?.session_log_id ?? ""} className={selectClass}>
            <option value="">None</option>
            {logs.map((l) => (
              <option key={l.id} value={l.id}>
                {l.title}
              </option>
            ))}
          </select>
        </div>
      </div>
      <FormMessage status={state.status} message={state.message} />
      <SubmitButton pending={pending}>{existing ? "Save note" : "Add note"}</SubmitButton>
    </form>
  );
}
