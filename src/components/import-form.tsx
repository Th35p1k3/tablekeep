"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { importCharacter, importPreset, importSpell, importTemplate } from "@/lib/portability/actions";
import { MAX_IMPORT_BYTES, readExportFile } from "@/lib/portability/schema";
import { secondaryButtonClass } from "./ui";

type Kind = "templates" | "spells" | "effectPresets" | "characters";

const LABEL: Record<Kind, string> = {
  templates: "Sheet templates",
  spells: "Spells",
  effectPresets: "Effect presets",
  characters: "Characters (with their inventory and spells)",
};

const ACTIONS: Record<Kind, (item: unknown) => Promise<{ ok: true; note?: string } | { ok: false; message: string }>> = {
  templates: importTemplate,
  spells: importSpell,
  effectPresets: importPreset,
  characters: importCharacter,
};

function itemName(item: unknown): string {
  const name = (item as { name?: unknown } | null)?.name;
  return typeof name === "string" && name.trim() ? name : "Unnamed item";
}

type LogLine = { kind: Kind; name: string; ok: boolean; text: string };

export function ImportForm() {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [file, setFile] = useState<Record<Kind, unknown[]> | null>(null);
  const [chosen, setChosen] = useState<Record<Kind, boolean>>({ templates: true, spells: true, effectPresets: true, characters: true });
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState(false);
  const [log, setLog] = useState<LogLine[]>([]);
  const [done, setDone] = useState(false);

  const onFile = async (f: File | undefined) => {
    setError(null);
    setFile(null);
    setLog([]);
    setDone(false);
    if (!f) return;
    if (f.size > MAX_IMPORT_BYTES) {
      setError("That file is too large to import (over 20 MB).");
      return;
    }
    const result = readExportFile(await f.text());
    if (!result.ok) {
      setError(result.message);
      return;
    }
    setFile({
      templates: result.file.templates,
      spells: result.file.spells,
      effectPresets: result.file.effectPresets,
      characters: result.file.characters,
    });
  };

  // A file chosen before the page finished loading would otherwise be
  // ignored, so pick it up as soon as the page becomes interactive.
  useEffect(() => {
    if (containerRef.current) containerRef.current.dataset.ready = "true";
    const early = inputRef.current?.files?.[0];
    if (early) setTimeout(() => void onFile(early), 0);
    // Only on first load.
     
  }, []);

  const run = async () => {
    if (!file) return;
    setRunning(true);
    setLog([]);
    setDone(false);
    // One item at a time, so a problem with one never stops the rest.
    for (const kind of Object.keys(LABEL) as Kind[]) {
      if (!chosen[kind]) continue;
      for (const item of file[kind]) {
        const result = await ACTIONS[kind](item);
        setLog((lines) => [
          ...lines,
          {
            kind,
            name: itemName(item),
            ok: result.ok,
            text: result.ok ? (result.note ? `Imported. ${result.note}` : "Imported.") : result.message,
          },
        ]);
      }
    }
    setRunning(false);
    setDone(true);
  };

  const total = file ? (Object.keys(LABEL) as Kind[]).reduce((n, k) => n + (chosen[k] ? file[k].length : 0), 0) : 0;
  const succeeded = log.filter((l) => l.ok).length;

  return (
    <div ref={containerRef} className="space-y-4" data-testid="import-form" data-ready="false">
      <div className="space-y-1">
        <label htmlFor="import-file" className="block text-sm font-medium">
          Tablekeep export file (.json)
        </label>
        <input
          ref={inputRef}
          id="import-file"
          type="file"
          accept="application/json,.json"
          disabled={running}
          onChange={(e) => void onFile(e.target.files?.[0])}
          className="block w-full text-sm"
        />
        {error ? <p className="text-sm text-red-700 dark:text-red-400">{error}</p> : null}
      </div>

      {file ? (
        <fieldset className="space-y-2 rounded-lg border border-stone-200 p-3 dark:border-stone-700">
          <legend className="px-1 text-sm font-medium">What to import</legend>
          {(Object.keys(LABEL) as Kind[]).map((kind) => (
            <label key={kind} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={chosen[kind]}
                disabled={running || file[kind].length === 0}
                onChange={(e) => setChosen((c) => ({ ...c, [kind]: e.target.checked }))}
                className="h-5 w-5 accent-amber-800"
              />
              {LABEL[kind]}: {file[kind].length}
            </label>
          ))}
          <p className="text-xs text-stone-600 dark:text-stone-400">
            Everything is added to your account alongside what you already have; nothing is replaced.
            Characters aren’t added to any campaign, and restore points aren’t imported.
          </p>
        </fieldset>
      ) : null}

      {file ? (
        <button
          type="button"
          disabled={running || total === 0}
          onClick={() => void run()}
          className="inline-flex w-full items-center justify-center rounded-md bg-amber-800 px-4 py-2.5 font-medium text-white hover:bg-amber-900 disabled:opacity-60"
        >
          {running ? `Importing… ${log.length} of ${total}` : `Import ${total} item${total === 1 ? "" : "s"}`}
        </button>
      ) : null}

      {log.length ? (
        <div>
          {done ? (
            <p className="mb-2 font-medium" data-testid="import-summary">
              Finished: {succeeded} of {log.length} imported.
            </p>
          ) : null}
          <ul className="max-h-80 space-y-1 overflow-y-auto text-sm" data-testid="import-log">
            {log.map((l, i) => (
              <li key={i} className={l.ok ? "" : "text-red-700 dark:text-red-400"}>
                {l.ok ? "✓" : "✕"} {l.name}: {l.text}
              </li>
            ))}
          </ul>
          {done ? (
            <button type="button" className={`${secondaryButtonClass} mt-3`} onClick={() => router.push("/home")}>
              Go to Home
            </button>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
