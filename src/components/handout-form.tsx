"use client";

import { type FormEvent, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createHandout, deleteHandout, discardUpload, updateHandout } from "@/lib/handouts/actions";
import { HANDOUT_FILE_TYPES, fileProblem, formatBytes, handoutFilePath } from "@/lib/handouts/rules";
import { getBrowserClient } from "@/lib/supabase/client";
import { secondaryButtonClass, selectClass } from "./ui";

type Visibility = "all" | "selected" | "dm_only";

export function HandoutForm({
  campaignId,
  players,
  existing,
}: {
  campaignId: string;
  players: Array<{ user_id: string; display_name: string }>;
  existing?: { id: string; title: string; body: string; visibility: Visibility; recipients: string[] };
}) {
  const router = useRouter();
  const prefix = existing ? `handout-${existing.id}` : "handout-new";
  const [title, setTitle] = useState(existing?.title ?? "");
  const [body, setBody] = useState(existing?.body ?? "");
  const [visibility, setVisibility] = useState<Visibility>(existing?.visibility ?? "all");
  const [recipients, setRecipients] = useState<string[]>(existing?.recipients ?? []);
  const [file, setFile] = useState<File | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  const [fileKey, setFileKey] = useState(0);

  const submit = (e: FormEvent) => {
    e.preventDefault();
    setErrors({});
    setMessage(null);
    if (file) {
      const problem = fileProblem(file);
      if (problem) {
        setErrors({ file: problem });
        return;
      }
    }
    startTransition(async () => {
      if (existing) {
        const result = await updateHandout({ id: existing.id, campaignId, title, body, visibility, recipients });
        if (result.ok) {
          setMessage({ tone: "success", text: "Handout saved." });
          router.refresh();
        } else {
          setErrors(result.fieldErrors ?? {});
          setMessage({ tone: "error", text: result.message });
        }
        return;
      }

      const id = crypto.randomUUID();
      let uploaded: { path: string; name: string; type: string; size: number } | null = null;
      if (file) {
        const path = handoutFilePath(campaignId, id, file.name);
        const { error } = await getBrowserClient()
          .storage.from("handouts")
          .upload(path, file, { contentType: file.type, upsert: false });
        if (error) {
          setMessage({ tone: "error", text: "The file couldn’t be uploaded. Check its size and type, then try again." });
          return;
        }
        uploaded = { path, name: file.name, type: file.type, size: file.size };
      }

      const result = await createHandout({ id, campaignId, title, body, visibility, recipients, file: uploaded });
      if (result.ok) {
        setTitle("");
        setBody("");
        setVisibility("all");
        setRecipients([]);
        setFile(null);
        setFileKey((k) => k + 1);
        setMessage({ tone: "success", text: "Handout shared." });
        router.refresh();
      } else {
        if (uploaded) await discardUpload(campaignId, id, uploaded.path);
        setErrors(result.fieldErrors ?? {});
        setMessage({ tone: "error", text: result.message });
      }
    });
  };

  return (
    <form onSubmit={submit} className="space-y-3" noValidate data-testid={existing ? undefined : "new-handout"}>
      <div className="space-y-1">
        <label htmlFor={`${prefix}-title`} className="block text-sm font-medium">
          Handout title
        </label>
        <input id={`${prefix}-title`} value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} className={selectClass} />
        {errors.title ? <p className="text-sm text-red-700 dark:text-red-400">{errors.title}</p> : null}
      </div>
      <div className="space-y-1">
        <label htmlFor={`${prefix}-body`} className="block text-sm font-medium">
          Text (optional)
        </label>
        <textarea id={`${prefix}-body`} value={body} onChange={(e) => setBody(e.target.value)} rows={4} className={selectClass} />
        {errors.body ? <p className="text-sm text-red-700 dark:text-red-400">{errors.body}</p> : null}
      </div>
      {!existing ? (
        <div className="space-y-1">
          <label htmlFor={`${prefix}-file`} className="block text-sm font-medium">
            Image or PDF (optional, up to 10 MB)
          </label>
          <input
            key={fileKey}
            id={`${prefix}-file`}
            type="file"
            accept={HANDOUT_FILE_TYPES.join(",")}
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            className="block w-full text-sm"
          />
          {file ? <p className="text-xs text-stone-600 dark:text-stone-400">{file.name} · {formatBytes(file.size)}</p> : null}
          {errors.file ? <p className="text-sm text-red-700 dark:text-red-400">{errors.file}</p> : null}
        </div>
      ) : null}
      <fieldset className="space-y-2">
        <legend className="text-sm font-medium">Who can see it</legend>
        {(
          [
            ["all", "Everyone in the campaign"],
            ["selected", "Only the players I choose"],
            ["dm_only", "DMs only"],
          ] as const
        ).map(([value, label]) => (
          <label key={value} className="flex items-center gap-2 text-sm">
            <input
              type="radio"
              name={`${prefix}-visibility`}
              value={value}
              checked={visibility === value}
              onChange={() => setVisibility(value)}
              className="accent-amber-800"
            />
            {label}
          </label>
        ))}
      </fieldset>
      {visibility === "selected" ? (
        <fieldset className="rounded-lg border border-stone-200 p-3 dark:border-stone-700">
          <legend className="px-1 text-sm font-medium">Players</legend>
          {players.length === 0 ? (
            <p className="text-sm text-stone-600 dark:text-stone-400">No players have joined yet.</p>
          ) : (
            <div className="flex flex-wrap gap-x-4 gap-y-2">
              {players.map((p) => (
                <label key={p.user_id} className="flex items-center gap-2 text-sm">
                  <input
                    type="checkbox"
                    checked={recipients.includes(p.user_id)}
                    onChange={() =>
                      setRecipients((r) => (r.includes(p.user_id) ? r.filter((x) => x !== p.user_id) : [...r, p.user_id]))
                    }
                    className="h-5 w-5 accent-amber-800"
                  />
                  {p.display_name}
                </label>
              ))}
            </div>
          )}
          {errors.recipients ? <p className="mt-2 text-sm text-red-700 dark:text-red-400">{errors.recipients}</p> : null}
        </fieldset>
      ) : null}
      {message ? (
        <p data-testid="form-message" className={`text-sm ${message.tone === "error" ? "text-red-700 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400"}`}>
          {message.text}
        </p>
      ) : null}
      <button
        type="submit"
        disabled={pending}
        className="inline-flex w-full items-center justify-center rounded-md bg-amber-800 px-4 py-2.5 font-medium text-white hover:bg-amber-900 disabled:opacity-60"
      >
        {pending ? "Saving…" : existing ? "Save handout" : "Share handout"}
      </button>
    </form>
  );
}

export function DeleteHandoutButton({ campaignId, handoutId, title }: { campaignId: string; handoutId: string; title: string }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  return (
    <span className="inline-flex flex-col items-start gap-1">
      <button
        type="button"
        disabled={pending}
        className={`${secondaryButtonClass} text-red-700 dark:text-red-400`}
        onClick={() => {
          if (!window.confirm(`Delete the handout “${title}” and its file?`)) return;
          startTransition(async () => {
            const result = await deleteHandout(campaignId, handoutId);
            if (result.ok) router.refresh();
            else setError(result.message);
          });
        }}
      >
        {pending ? "Deleting…" : "Delete handout"}
      </button>
      {error ? <span className="text-sm text-red-700 dark:text-red-400">{error}</span> : null}
    </span>
  );
}
