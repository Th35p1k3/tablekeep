"use client";

import { useActionState, useEffect, useState, useTransition } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { closeRollRequest, createRollRequest, loadRolls, rollNow, submitManualRoll } from "@/lib/rolls/actions";
import type { RollRequest } from "@/lib/rolls/queries";
import { describeRoll } from "@/lib/rolls/rules";
import { idleState } from "@/lib/forms";
import { getBrowserClient } from "@/lib/supabase/client";
import { Card, FormMessage, secondaryButtonClass, selectClass } from "./ui";

type Member = { user_id: string; display_name: string; role: "owner" | "co_dm" | "player" };

function diceText(r: RollRequest): string {
  const base = `${r.dice_count}d${r.dice_sides}`;
  const bonus = r.bonus ? ` ${r.bonus > 0 ? "+" : "−"} ${Math.abs(r.bonus)}` : "";
  const mod = r.modifier_field ? ` + ${r.modifier_field}` : "";
  const keep = r.keep === "highest" ? ", roll twice keep higher" : r.keep === "lowest" ? ", roll twice keep lower" : "";
  return `${base}${bonus}${mod}${keep}`;
}

function RequestForm({ campaignId, players }: { campaignId: string; players: Member[] }) {
  const [state, action, pending] = useActionState(createRollRequest, idleState);
  const v = state.values;
  return (
    <form action={action} className="space-y-3" noValidate data-testid="new-roll-request">
      <input type="hidden" name="campaignId" value={campaignId} />
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <label htmlFor="roll-label" className="block text-sm font-medium">
            Check
          </label>
          <input id="roll-label" name="label" defaultValue={v?.label} placeholder="Perception" maxLength={60} className={selectClass} />
          {state.fieldErrors?.label ? <p className="text-sm text-red-700 dark:text-red-400">{state.fieldErrors.label}</p> : null}
        </div>
        <div className="space-y-1">
          <label htmlFor="roll-dice" className="block text-sm font-medium">
            Dice
          </label>
          <input id="roll-dice" name="dice" defaultValue={v?.dice ?? "1d20"} className={`${selectClass} font-mono`} />
          {state.fieldErrors?.dice ? <p className="text-sm text-red-700 dark:text-red-400">{state.fieldErrors.dice}</p> : null}
        </div>
        <div className="space-y-1">
          <label htmlFor="roll-modifier" className="block text-sm font-medium">
            Add from their sheet (optional)
          </label>
          <input
            id="roll-modifier"
            name="modifierField"
            defaultValue={v?.modifierField}
            placeholder="wisdom_mod"
            className={`${selectClass} font-mono`}
            autoCapitalize="none"
            spellCheck={false}
          />
          {state.fieldErrors?.modifierField ? (
            <p className="text-sm text-red-700 dark:text-red-400">{state.fieldErrors.modifierField}</p>
          ) : (
            <p className="text-xs text-stone-600 dark:text-stone-400">A field’s short name from their character sheet.</p>
          )}
        </div>
        <div className="space-y-1">
          <label htmlFor="roll-bonus" className="block text-sm font-medium">
            Extra bonus (optional)
          </label>
          <input id="roll-bonus" name="bonus" defaultValue={v?.bonus} placeholder="0" className={selectClass} />
          {state.fieldErrors?.bonus ? <p className="text-sm text-red-700 dark:text-red-400">{state.fieldErrors.bonus}</p> : null}
        </div>
        <div className="space-y-1 sm:col-span-2">
          <label htmlFor="roll-keep" className="block text-sm font-medium">
            How to roll
          </label>
          <select id="roll-keep" name="keep" defaultValue={v?.keep ?? "normal"} className={selectClass}>
            <option value="normal">Roll once</option>
            <option value="highest">Roll twice, keep the higher (advantage)</option>
            <option value="lowest">Roll twice, keep the lower (disadvantage)</option>
          </select>
        </div>
      </div>
      <fieldset className="rounded-lg border border-stone-200 p-3 dark:border-stone-700">
        <legend className="px-1 text-sm font-medium">Who rolls</legend>
        {players.length === 0 ? (
          <p className="text-sm text-stone-600 dark:text-stone-400">No players have joined yet.</p>
        ) : (
          <div className="flex flex-wrap gap-x-4 gap-y-2">
            {players.map((p) => (
              <label key={p.user_id} className="flex items-center gap-2 text-sm">
                <input type="checkbox" name="target" value={p.user_id} defaultChecked className="h-5 w-5 accent-amber-800" />
                {p.display_name}
              </label>
            ))}
          </div>
        )}
        {state.fieldErrors?.target ? <p className="mt-2 text-sm text-red-700 dark:text-red-400">{state.fieldErrors.target}</p> : null}
      </fieldset>
      <label className="flex items-center gap-2 text-sm font-medium">
        <input type="checkbox" name="share" className="h-5 w-5 accent-amber-800" />
        Show results in chat (otherwise only DMs see them)
      </label>
      <FormMessage status={state.status} message={state.message} />
      <button
        type="submit"
        disabled={pending || players.length === 0}
        className="inline-flex w-full items-center justify-center rounded-md bg-amber-800 px-4 py-2.5 font-medium text-white hover:bg-amber-900 disabled:opacity-60"
      >
        {pending ? "Sending…" : "Request roll"}
      </button>
    </form>
  );
}

function PlayerRequest({
  request,
  characters,
  onDone,
}: {
  request: RollRequest;
  characters: Array<{ id: string; name: string }>;
  onDone: () => void;
}) {
  const [characterId, setCharacterId] = useState(characters[0]?.id ?? "");
  const [manual, setManual] = useState(false);
  const [total, setTotal] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (task: () => Promise<{ ok: true } | { ok: false; message: string }>) =>
    startTransition(async () => {
      const result = await task();
      if (result.ok) onDone();
      else setError(result.message);
    });

  return (
    <li data-testid="roll-request" className="rounded-lg border-2 border-amber-600 bg-amber-50 p-3 dark:border-amber-700 dark:bg-stone-800">
      <p className="font-semibold">🎲 Roll {request.label}</p>
      <p className="text-sm text-stone-700 dark:text-stone-300">{diceText(request)}</p>
      {request.modifier_field && characters.length > 1 ? (
        <div className="mt-2 space-y-1">
          <label htmlFor={`roll-char-${request.id}`} className="block text-sm font-medium">
            Character
          </label>
          <select id={`roll-char-${request.id}`} value={characterId} onChange={(e) => setCharacterId(e.target.value)} className={selectClass}>
            {characters.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
        </div>
      ) : null}
      {request.modifier_field && characters.length === 0 ? (
        <p className="mt-2 text-sm text-stone-700 dark:text-stone-300">
          You have no character in this campaign, so {request.modifier_field} counts as 0.
        </p>
      ) : null}
      {manual ? (
        <div className="mt-3 flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <label htmlFor={`roll-total-${request.id}`} className="block text-sm font-medium">
              Your total
            </label>
            <input
              id={`roll-total-${request.id}`}
              type="number"
              inputMode="numeric"
              value={total}
              onChange={(e) => setTotal(e.target.value)}
              className={`${selectClass} w-28`}
            />
          </div>
          <button
            type="button"
            className={secondaryButtonClass}
            disabled={pending || total.trim() === ""}
            onClick={() => run(() => submitManualRoll(request.id, Number(total)))}
          >
            Send result
          </button>
          <button type="button" className="text-sm underline" onClick={() => setManual(false)}>
            Roll in the app instead
          </button>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => rollNow(request.id, characterId || null))}
            className="rounded-md bg-amber-800 px-5 py-2 font-medium text-white hover:bg-amber-900 disabled:opacity-60"
          >
            {pending ? "Rolling…" : "Roll"}
          </button>
          <button type="button" className="text-sm underline" onClick={() => setManual(true)}>
            I rolled real dice
          </button>
        </div>
      )}
      {error ? <p className="mt-2 text-sm text-red-700 dark:text-red-400">{error}</p> : null}
    </li>
  );
}

export function RollsPanel({
  campaignId,
  me,
  isManager,
  members,
  initialRequests,
  myCharacters,
}: {
  campaignId: string;
  me: string;
  isManager: boolean;
  members: Member[];
  initialRequests: RollRequest[];
  myCharacters: Array<{ id: string; name: string }>;
}) {
  const [requests, setRequests] = useState(initialRequests);
  const [pending, startTransition] = useTransition();
  const names = new Map(members.map((m) => [m.user_id, m.display_name]));
  const players = members.filter((m) => m.role === "player");

  const refresh = () =>
    startTransition(async () => {
      const result = await loadRolls(campaignId);
      if (result.ok) setRequests(result.requests);
    });

  // Live updates plus a light safety check, the same way chat works.
  useEffect(() => {
    const supabase = getBrowserClient();
    let cancelled = false;
    let channel: RealtimeChannel | null = null;
    const reload = async () => {
      if (cancelled) return;
      const result = await loadRolls(campaignId);
      if (!cancelled && result.ok) setRequests(result.requests);
    };
    (async () => {
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) await supabase.realtime.setAuth(data.session.access_token);
      channel = supabase
        .channel(`rolls:${campaignId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "roll_requests", filter: `campaign_id=eq.${campaignId}` }, () => void reload())
        .on("postgres_changes", { event: "*", schema: "public", table: "roll_results", filter: `campaign_id=eq.${campaignId}` }, () => void reload())
        .subscribe((status: string) => {
          if (status === "SUBSCRIBED") void reload();
        });
    })();
    const timer = setInterval(() => {
      if (document.visibilityState === "visible") void reload();
    }, 8000);
    return () => {
      cancelled = true;
      clearInterval(timer);
      if (channel) void supabase.removeChannel(channel);
    };
  }, [campaignId]);

  if (isManager) {
    return (
      <Card>
        <details>
          <summary className="cursor-pointer text-lg font-semibold">🎲 Request a roll</summary>
          <div className="mt-4">
            <RequestForm campaignId={campaignId} players={players} />
          </div>
        </details>
        {requests.length ? (
          <ul className="mt-4 space-y-3" data-testid="roll-requests">
            {requests.map((r) => {
              const done = new Map(r.results.map((x) => [x.user_id, x]));
              return (
                <li key={r.id} className="rounded-lg border border-stone-200 p-3 dark:border-stone-700">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span>
                      <span className="font-semibold">{r.label}</span>{" "}
                      <span className="text-sm text-stone-600 dark:text-stone-400">{diceText(r)}</span>
                    </span>
                    {r.status === "open" ? (
                      <button
                        type="button"
                        className={`${secondaryButtonClass} px-2.5 py-1`}
                        disabled={pending}
                        onClick={() =>
                          startTransition(async () => {
                            await closeRollRequest(r.id);
                            const result = await loadRolls(campaignId);
                            if (result.ok) setRequests(result.requests);
                          })
                        }
                      >
                        Close
                      </button>
                    ) : (
                      <span className="text-xs text-stone-500">Closed</span>
                    )}
                  </div>
                  <ul className="mt-2 space-y-1 text-sm">
                    {r.targets.map((t) => {
                      const result = done.get(t);
                      return (
                        <li key={t} className="flex flex-wrap justify-between gap-2">
                          <span>{names.get(t) ?? "A former member"}</span>
                          {result ? (
                            <span data-testid="roll-result">
                              <span className="font-semibold">{result.total}</span>{" "}
                              <span className="text-stone-600 dark:text-stone-400">
                                ({describeRoll({ ...result, bonus: r.bonus })})
                              </span>
                            </span>
                          ) : (
                            <span className="text-stone-500">{r.status === "open" ? "waiting…" : "didn’t roll"}</span>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </li>
              );
            })}
          </ul>
        ) : null}
      </Card>
    );
  }

  const waiting = requests.filter((r) => r.status === "open" && !r.results.some((x) => x.user_id === me));
  const mine = requests.flatMap((r) => r.results.filter((x) => x.user_id === me).map((x) => ({ r, x }))).slice(0, 5);
  if (!waiting.length && !mine.length) return null;

  return (
    <Card>
      {waiting.length ? (
        <ul className="space-y-3">
          {waiting.map((r) => (
            <PlayerRequest key={r.id} request={r} characters={myCharacters} onDone={refresh} />
          ))}
        </ul>
      ) : null}
      {mine.length ? (
        <div className={waiting.length ? "mt-4" : ""}>
          <h3 className="text-sm font-semibold">Your recent rolls</h3>
          <ul className="mt-1 space-y-1 text-sm" data-testid="my-rolls">
            {mine.map(({ r, x }) => (
              <li key={r.id}>
                {r.label}: <span className="font-semibold">{x.total}</span>{" "}
                <span className="text-stone-600 dark:text-stone-400">({describeRoll({ ...x, bonus: r.bonus })})</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </Card>
  );
}
