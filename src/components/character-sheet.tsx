"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import {
  createRestorePoint,
  deleteRestorePoint,
  restoreRestorePoint,
  saveCharacterData,
} from "@/lib/characters/actions";
import { refillResources, resourceKeys } from "@/lib/characters/data";
import type { RestorePoint } from "@/lib/characters/queries";
import type { SheetInput } from "@/lib/templates/compute";
import type { TemplateDefinition } from "@/lib/templates/schema";
import { SheetView } from "./sheet-view";
import { Card, secondaryButtonClass, selectClass } from "./ui";

const AUTOSAVE_DELAY_MS = 800;

type SaveState = "saved" | "unsaved" | "saving" | "error" | "conflict";

const SAVE_LABEL: Record<SaveState, string> = {
  saved: "Saved",
  unsaved: "Unsaved changes…",
  saving: "Saving…",
  error: "Couldn’t save. Retrying when you make the next change.",
  conflict: "Changed somewhere else",
};

function when(iso: string): string {
  return new Date(iso).toLocaleString("en-US", {
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function CharacterSheet({
  characterId,
  definition,
  initialData,
  initialUpdatedAt,
  initialPoints,
}: {
  characterId: string;
  definition: TemplateDefinition;
  initialData: SheetInput;
  initialUpdatedAt: string;
  initialPoints: RestorePoint[];
}) {
  const [data, setData] = useState<SheetInput>(initialData);
  const [saveState, setSaveState] = useState<SaveState>("saved");
  const [message, setMessage] = useState<string | null>(null);
  const [points, setPoints] = useState<RestorePoint[]>(initialPoints);
  const [label, setLabel] = useState("");
  const [pending, startTransition] = useTransition();

  const dataRef = useRef(data);
  const updatedAtRef = useRef(initialUpdatedAt);
  const dirtyRef = useRef(false);
  const savingRef = useRef<Promise<void> | null>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const conflictRef = useRef(false);

  // Points at the latest "schedule" so a finished save can queue the next one.
  const scheduleRef = useRef<() => void>(() => {});

  const save = useCallback(async () => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    if (savingRef.current) await savingRef.current;
    if (!dirtyRef.current || conflictRef.current) return;

    dirtyRef.current = false;
    setSaveState("saving");
    let succeeded = false;
    const run = (async () => {
      const result = await saveCharacterData(characterId, dataRef.current, updatedAtRef.current);
      succeeded = result.ok;
      if (result.ok) {
        updatedAtRef.current = result.updatedAt;
        setSaveState(dirtyRef.current ? "unsaved" : "saved");
        setMessage(null);
      } else {
        dirtyRef.current = true;
        if (result.conflict) conflictRef.current = true;
        setSaveState(result.conflict ? "conflict" : "error");
        setMessage(result.message);
      }
    })();
    savingRef.current = run;
    await run;
    savingRef.current = null;
    // Changes typed while that save was running get saved next. After a
    // failure we wait for the next change instead of retrying in a loop.
    if (succeeded && dirtyRef.current) scheduleRef.current();
  }, [characterId]);

  const schedule = useCallback(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => {
      void save();
    }, AUTOSAVE_DELAY_MS);
  }, [save]);

  useEffect(() => {
    scheduleRef.current = schedule;
  }, [schedule]);

  const update = (next: SheetInput) => {
    dataRef.current = next;
    dirtyRef.current = true;
    setData(next);
    if (!conflictRef.current) {
      setSaveState("unsaved");
      schedule();
    }
  };

  // Warn before leaving with unsaved changes, and stop timers on unmount.
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) e.preventDefault();
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, []);

  const hasResources = resourceKeys(definition).length > 0;

  const runPointAction = (action: () => Promise<void>) => startTransition(action);

  const saveRestorePoint = () =>
    runPointAction(async () => {
      await save();
      if (conflictRef.current) return;
      const result = await createRestorePoint(characterId, label);
      if (result.ok) {
        setPoints(result.points);
        setLabel("");
        setMessage("Restore point saved.");
      } else {
        setMessage(result.message);
      }
    });

  const restore = (point: RestorePoint) => {
    if (!window.confirm(`Go back to “${point.label || when(point.created_at)}”? Your current sheet is saved as a restore point first.`)) {
      return;
    }
    runPointAction(async () => {
      await save();
      if (conflictRef.current) return;
      const result = await restoreRestorePoint(characterId, point.id);
      if (result.ok && result.data && result.updatedAt) {
        dataRef.current = result.data;
        updatedAtRef.current = result.updatedAt;
        dirtyRef.current = false;
        setData(result.data);
        setPoints(result.points);
        setSaveState("saved");
        setMessage("Restored.");
      } else if (!result.ok) {
        setMessage(result.message);
      }
    });
  };

  const remove = (point: RestorePoint) => {
    if (!window.confirm("Delete this restore point?")) return;
    runPointAction(async () => {
      const result = await deleteRestorePoint(characterId, point.id);
      if (result.ok) setPoints(result.points);
      else setMessage(result.message);
    });
  };

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,2fr)_minmax(0,1fr)] lg:items-start">
      <Card>
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <p
            data-testid="save-status"
            aria-live="polite"
            className={`text-sm font-medium ${saveState === "error" || saveState === "conflict" ? "text-red-700 dark:text-red-400" : "text-stone-600 dark:text-stone-400"}`}
          >
            {SAVE_LABEL[saveState]}
          </p>
          {hasResources ? (
            <button
              type="button"
              className={secondaryButtonClass}
              onClick={() => update(refillResources(definition, dataRef.current))}
            >
              Refill all resources
            </button>
          ) : null}
        </div>
        {saveState === "conflict" ? (
          <div className="mb-4 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
            <p>{message}</p>
            <button type="button" className={`${secondaryButtonClass} mt-2`} onClick={() => window.location.reload()}>
              Reload
            </button>
          </div>
        ) : null}
        <SheetView
          definition={definition}
          values={data}
          idPrefix="character"
          onChange={(key, value) => update({ ...dataRef.current, [key]: value })}
          onRefill={(key) => update(refillResources(definition, dataRef.current, key))}
        />
      </Card>

      <div className="space-y-4 lg:sticky lg:top-4">
        <Card>
          <h2 className="text-lg font-semibold">Restore points</h2>
          <p className="mt-1 mb-3 text-sm leading-relaxed text-stone-600 dark:text-stone-400">
            Save the sheet as it is now, so you can go back to it later (before
            levelling up, for example).
          </p>
          <div className="flex flex-col gap-2 sm:flex-row">
            <label htmlFor="restore-label" className="sr-only">
              Restore point name
            </label>
            <input
              id="restore-label"
              value={label}
              maxLength={80}
              placeholder="Name (optional)"
              onChange={(e) => setLabel(e.target.value)}
              className={selectClass}
            />
            <button type="button" className={secondaryButtonClass} disabled={pending} onClick={saveRestorePoint}>
              Save restore point
            </button>
          </div>
          {message && saveState !== "conflict" ? (
            <p data-testid="form-message" className="mt-3 text-sm">
              {message}
            </p>
          ) : null}
          {points.length ? (
            <ul className="mt-4 divide-y divide-stone-200 dark:divide-stone-700" data-testid="restore-points">
              {points.map((p) => (
                <li key={p.id} className="flex flex-wrap items-center justify-between gap-2 py-2.5 text-sm">
                  <span className="min-w-0 break-words">
                    <span className="font-medium">{p.label || "Restore point"}</span>
                    <span className="block text-xs text-stone-600 dark:text-stone-400">
                      {when(p.created_at)}
                      {p.reason === "before_restore" ? " · saved automatically" : ""}
                    </span>
                  </span>
                  <span className="flex gap-2">
                    <button type="button" className={`${secondaryButtonClass} px-2.5 py-1.5`} disabled={pending} onClick={() => restore(p)} aria-label={`Restore ${p.label || when(p.created_at)}`}>
                      Restore
                    </button>
                    <button type="button" className={`${secondaryButtonClass} px-2.5 py-1.5 text-red-700 dark:text-red-400`} disabled={pending} onClick={() => remove(p)} aria-label={`Delete restore point ${p.label || when(p.created_at)}`}>
                      ✕
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-4 text-sm text-stone-600 dark:text-stone-400">No restore points yet.</p>
          )}
        </Card>
      </div>
    </div>
  );
}
