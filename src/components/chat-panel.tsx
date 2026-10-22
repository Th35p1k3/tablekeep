"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { RealtimeChannel, RealtimePostgresChangesPayload } from "@supabase/supabase-js";
import { catchUpMessages, deleteMessage, editMessage, loadOlderMessages, sendMessage } from "@/lib/chat/actions";
import type { ChatMessage } from "@/lib/chat/queries";
import { type ChatMember, whisperLabel, whisperTargets } from "@/lib/chat/rules";
import { getBrowserClient } from "@/lib/supabase/client";
import { secondaryButtonClass, selectClass } from "./ui";

type CampaignRole = "owner" | "co_dm" | "player";

function time(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return d.toLocaleString("en-US", sameDay ? { hour: "numeric", minute: "2-digit" } : { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function upsert(list: ChatMessage[], m: ChatMessage): ChatMessage[] {
  const i = list.findIndex((x) => x.id === m.id);
  const next = i === -1 ? [...list, m] : list.map((x) => (x.id === m.id ? m : x));
  return next.sort((a, b) => a.created_at.localeCompare(b.created_at));
}

export function ChatPanel({
  campaignId,
  me,
  myRole,
  members,
  initialMessages,
  initialHasMore,
}: {
  campaignId: string;
  me: string;
  myRole: CampaignRole;
  members: ChatMember[];
  initialMessages: ChatMessage[];
  initialHasMore: boolean;
}) {
  const [messages, setMessages] = useState(initialMessages);
  const [hasMore, setHasMore] = useState(initialHasMore);
  const [body, setBody] = useState("");
  const [recipients, setRecipients] = useState<string[] | null>(null);
  const [choosing, setChoosing] = useState(false);
  const [editing, setEditing] = useState<{ id: string; text: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [live, setLive] = useState<"connecting" | "live" | "offline">("connecting");
  const [pending, startTransition] = useTransition();
  const listRef = useRef<HTMLDivElement>(null);
  const latestRef = useRef<string | null>(initialMessages.at(-1)?.created_at ?? null);
  const stickToBottom = useRef(true);

  const names = useMemo(() => new Map(members.map((m) => [m.user_id, m.display_name])), [members]);
  const nameOf = (id: string) => names.get(id) ?? "a former member";
  const targets = whisperTargets(members, me, myRole);
  const isManager = myRole !== "player";

  // Live updates: new, edited and deleted messages appear without reloading.
  useEffect(() => {
    const supabase = getBrowserClient();
    let cancelled = false;
    let channel: RealtimeChannel | null = null;

    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) await supabase.realtime.setAuth(data.session.access_token);
      channel = supabase
        .channel(`chat:${campaignId}`)
        .on(
          "postgres_changes",
          { event: "*", schema: "public", table: "messages", filter: `campaign_id=eq.${campaignId}` },
          (payload: RealtimePostgresChangesPayload<Record<string, unknown>>) => {
            if (payload.eventType === "DELETE") {
              const id = (payload.old as { id?: string }).id;
              if (id) setMessages((list) => list.filter((m) => m.id !== id));
            } else {
              const row = payload.new as ChatMessage & { campaign_id?: string };
              setMessages((list) =>
                upsert(list, {
                  id: row.id,
                  author_id: row.author_id,
                  body: row.body,
                  recipients: row.recipients,
                  created_at: row.created_at,
                  edited_at: row.edited_at,
                }),
              );
            }
          },
        )
        .subscribe((status: string) => {
          if (status === "SUBSCRIBED") {
            setLive("live");
            // Fetch anything sent while the connection was opening.
            void catchUpMessages(campaignId, latestRef.current).then((result) => {
              if (!cancelled && result.ok && result.messages.length) {
                setMessages((list) => result.messages.reduce(upsert, list));
              }
            });
          }
          else if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") setLive("offline");
        });
    })();

    return () => {
      cancelled = true;
      if (channel) void supabase.removeChannel(channel);
    };
  }, [campaignId]);

  useEffect(() => {
    latestRef.current = messages.at(-1)?.created_at ?? latestRef.current;
  }, [messages]);

  // Safety net: live updates can miss a message sent in the moment a
  // connection opens. Catch up on connect, when you come back to the tab,
  // and quietly every few seconds while the tab is visible.
  useEffect(() => {
    let stopped = false;
    const catchUp = async () => {
      if (stopped || document.visibilityState !== "visible") return;
      const result = await catchUpMessages(campaignId, latestRef.current);
      if (!stopped && result.ok && result.messages.length) {
        setMessages((list) => result.messages.reduce(upsert, list));
      }
    };
    const timer = setInterval(catchUp, 8000);
    const onVisible = () => void catchUp();
    document.addEventListener("visibilitychange", onVisible);
    window.addEventListener("focus", onVisible);
    return () => {
      stopped = true;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisible);
      window.removeEventListener("focus", onVisible);
    };
  }, [campaignId]);

  // Keep the newest message in view unless you've scrolled up to read.
  useEffect(() => {
    const el = listRef.current;
    if (el && stickToBottom.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  const send = () => {
    const text = body.trim();
    if (!text) return;
    setError(null);
    startTransition(async () => {
      const result = await sendMessage(campaignId, text, recipients);
      if (result.ok) {
        setBody("");
        stickToBottom.current = true;
        setMessages((list) => upsert(list, result.message));
      } else {
        setError(result.message);
      }
    });
  };

  const saveEdit = () => {
    if (!editing) return;
    const current = editing;
    startTransition(async () => {
      const result = await editMessage(current.id, current.text);
      if (result.ok) {
        setMessages((list) => upsert(list, result.message));
        setEditing(null);
      } else {
        setError(result.message);
      }
    });
  };

  const remove = (m: ChatMessage) => {
    if (!window.confirm("Delete this message?")) return;
    startTransition(async () => {
      const result = await deleteMessage(m.id);
      if (result.ok) setMessages((list) => list.filter((x) => x.id !== m.id));
      else setError(result.message ?? "Couldn’t delete that message.");
    });
  };

  const loadOlder = () => {
    const oldest = messages[0];
    if (!oldest) return;
    stickToBottom.current = false;
    startTransition(async () => {
      const result = await loadOlderMessages(campaignId, oldest.created_at);
      if (result.ok) {
        setMessages((list) => result.messages.reduce(upsert, list));
        setHasMore(result.hasMore);
      }
    });
  };

  const toggleRecipient = (id: string) =>
    setRecipients((current) => {
      const set = new Set(current ?? []);
      if (set.has(id)) set.delete(id);
      else set.add(id);
      return set.size ? [...set] : null;
    });

  return (
    <div className="flex h-[70vh] min-h-[420px] flex-col rounded-xl border border-stone-200 bg-white dark:border-stone-700 dark:bg-stone-900">
      <div className="flex items-center justify-between border-b border-stone-200 px-4 py-2 text-sm dark:border-stone-700">
        <span className="font-medium">Campaign chat</span>
        <span data-testid="chat-status" className={live === "live" ? "text-emerald-700 dark:text-emerald-400" : "text-stone-500"}>
          {live === "live" ? "● Live" : live === "connecting" ? "Connecting…" : "Offline: reload to reconnect"}
        </span>
      </div>

      <div
        ref={listRef}
        onScroll={(e) => {
          const el = e.currentTarget;
          stickToBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80;
        }}
        className="flex-1 space-y-3 overflow-y-auto px-4 py-3"
        data-testid="chat-messages"
        aria-live="polite"
      >
        {hasMore ? (
          <button type="button" className={`${secondaryButtonClass} w-full`} disabled={pending} onClick={loadOlder}>
            Load older messages
          </button>
        ) : null}
        {messages.length === 0 ? (
          <p className="py-8 text-center text-sm text-stone-600 dark:text-stone-400">No messages yet. Say hello!</p>
        ) : null}
        {messages.map((m) => {
          const mine = m.author_id === me;
          const whisper = m.recipients && m.recipients.length ? m.recipients : null;
          return (
            <div
              key={m.id}
              data-testid="chat-message"
              className={`rounded-lg px-3 py-2 ${
                whisper
                  ? "border border-dashed border-violet-400 bg-violet-50 dark:border-violet-700 dark:bg-violet-950"
                  : mine
                    ? "bg-amber-50 dark:bg-stone-800"
                    : "bg-stone-50 dark:bg-stone-800/60"
              }`}
            >
              <div className="flex flex-wrap items-baseline gap-x-2 text-sm">
                <span className="font-semibold">{m.author_id ? (mine ? "You" : nameOf(m.author_id)) : "A former member"}</span>
                <span className="text-xs text-stone-500 dark:text-stone-400">{time(m.created_at)}</span>
                {whisper ? (
                  <span className="text-xs font-medium text-violet-800 dark:text-violet-300">
                    🤫 {whisperLabel(whisper, me, nameOf)}
                  </span>
                ) : null}
                {m.edited_at ? <span className="text-xs text-stone-500">(edited)</span> : null}
              </div>
              {editing?.id === m.id ? (
                <div className="mt-2 space-y-2">
                  <label htmlFor={`edit-${m.id}`} className="sr-only">
                    Edit message
                  </label>
                  <textarea
                    id={`edit-${m.id}`}
                    value={editing.text}
                    onChange={(e) => setEditing({ id: m.id, text: e.target.value })}
                    rows={2}
                    className={selectClass}
                  />
                  <div className="flex gap-2">
                    <button type="button" className={secondaryButtonClass} disabled={pending} onClick={saveEdit}>
                      Save
                    </button>
                    <button type="button" className={secondaryButtonClass} onClick={() => setEditing(null)}>
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <p className="mt-0.5 break-words whitespace-pre-wrap">{m.body}</p>
              )}
              {(mine || isManager) && editing?.id !== m.id ? (
                <div className="mt-1 flex gap-3 text-xs">
                  {mine ? (
                    <button type="button" className="underline" onClick={() => setEditing({ id: m.id, text: m.body })}>
                      Edit
                    </button>
                  ) : null}
                  <button type="button" className="text-red-700 underline dark:text-red-400" onClick={() => remove(m)}>
                    Delete
                  </button>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>

      <div className="space-y-2 border-t border-stone-200 p-3 dark:border-stone-700">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="font-medium">To:</span>
          <button
            type="button"
            onClick={() => setChoosing((c) => !c)}
            aria-expanded={choosing}
            className={`${secondaryButtonClass} px-2.5 py-1`}
            data-testid="chat-recipients"
          >
            {recipients ? whisperLabel(recipients, me, nameOf) : "Everyone"}
          </button>
          {recipients ? (
            <button type="button" className="text-xs underline" onClick={() => setRecipients(null)}>
              Back to everyone
            </button>
          ) : null}
        </div>
        {choosing ? (
          <fieldset className="rounded-lg border border-stone-200 p-3 dark:border-stone-700">
            <legend className="px-1 text-sm font-medium">
              {myRole === "player" ? "Whisper to a DM" : "Whisper to"}
            </legend>
            {targets.length === 0 ? (
              <p className="text-sm text-stone-600 dark:text-stone-400">There’s nobody to whisper to yet.</p>
            ) : (
              <div className="flex flex-wrap gap-x-4 gap-y-2">
                {targets.map((t) => (
                  <label key={t.user_id} className="flex items-center gap-2 text-sm">
                    <input
                      type="checkbox"
                      checked={recipients?.includes(t.user_id) ?? false}
                      onChange={() => toggleRecipient(t.user_id)}
                      className="h-5 w-5 accent-violet-700"
                    />
                    {t.display_name}
                  </label>
                ))}
              </div>
            )}
          </fieldset>
        ) : null}
        <div className="flex gap-2">
          <label htmlFor="chat-input" className="sr-only">
            Message
          </label>
          <textarea
            id="chat-input"
            value={body}
            maxLength={2000}
            rows={2}
            placeholder={recipients ? "Whisper…" : "Message the table…"}
            onChange={(e) => setBody(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                send();
              }
            }}
            className={`${selectClass} flex-1 resize-none`}
          />
          <button
            type="button"
            onClick={send}
            disabled={pending || !body.trim()}
            className="self-end rounded-md bg-amber-800 px-4 py-2 text-sm font-medium text-white hover:bg-amber-900 disabled:opacity-60"
          >
            Send
          </button>
        </div>
        {error ? <p className="text-sm text-red-700 dark:text-red-400">{error}</p> : null}
        <p className="text-xs text-stone-500 dark:text-stone-400">Enter to send, Shift+Enter for a new line.</p>
      </div>
    </div>
  );
}
