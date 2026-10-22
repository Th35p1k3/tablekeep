"use client";

import { useState, useTransition } from "react";
import { addSpellToCharacter, markCharacterSpell, removeCharacterSpell } from "@/lib/spells/actions";
import type { CharacterSpell } from "@/lib/spells/queries";
import { coerceSpell } from "@/lib/spells/schema";
import { SpellCard } from "./spell-card";
import { Card, secondaryButtonClass, selectClass } from "./ui";

export function CharacterSpellsPanel({
  characterId,
  initialSpells,
  available,
  readOnly = false,
}: {
  characterId: string;
  initialSpells: CharacterSpell[];
  available: Array<{ versionId: string; label: string }>;
  readOnly?: boolean;
}) {
  const [spells, setSpells] = useState(initialSpells);
  const [open, setOpen] = useState<string | null>(null);
  const [choice, setChoice] = useState("");
  const [message, setMessage] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const run = (task: () => Promise<{ ok: true; spells: CharacterSpell[] } | { ok: false; message: string }>) =>
    startTransition(async () => {
      const result = await task();
      if (result.ok) {
        setSpells(result.spells);
        setMessage(null);
      } else {
        setMessage(result.message);
      }
    });

  // Tick the box straight away, save in the background, undo if saving fails.
  const togglePrepared = (versionId: string, prepared: boolean) => {
    const before = spells;
    setSpells((list) => list.map((s) => (s.versionId === versionId ? { ...s, prepared } : s)));
    startTransition(async () => {
      const result = await markCharacterSpell(characterId, versionId, { prepared });
      if (result.ok) {
        setSpells(result.spells);
        setMessage(null);
      } else {
        setSpells(before);
        setMessage(result.message);
      }
    });
  };

  const onCharacter = new Set(spells.map((s) => s.versionId));
  const addable = available.filter((a) => !onCharacter.has(a.versionId));
  const preparedCount = spells.filter((s) => s.prepared).length;

  return (
    <Card>
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">Spells</h2>
        <p className="text-sm text-stone-600 dark:text-stone-400">
          {spells.length} known · {preparedCount} prepared
        </p>
      </div>

      {spells.length === 0 ? (
        <p className="mt-3 text-sm text-stone-600 dark:text-stone-400">No spells yet.</p>
      ) : (
        <ul className="mt-3 divide-y divide-stone-200 dark:divide-stone-700" data-testid="character-spells">
          {spells.map((s) => {
            const content = coerceSpell(s.content);
            const isOpen = open === s.versionId;
            return (
              <li key={s.versionId} className="py-2.5">
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setOpen(isOpen ? null : s.versionId)}
                    aria-expanded={isOpen}
                    className="min-w-0 flex-1 text-left"
                  >
                    <span className="font-medium break-words">{s.name}</span>
                    <span className="block text-xs text-stone-600 dark:text-stone-400">
                      {content.level === undefined ? "No level" : content.level === 0 ? "Cantrip" : `Level ${content.level}`}
                      {s.prepared ? " · prepared" : ""}
                    </span>
                  </button>
                  {!readOnly ? (
                    <>
                      <label className="flex items-center gap-1.5 text-sm">
                        <input
                          type="checkbox"
                          checked={s.prepared}
                          onChange={(e) => togglePrepared(s.versionId, e.target.checked)}
                          className="h-5 w-5 accent-amber-800"
                          aria-label={`Prepared: ${s.name}`}
                        />
                        Prepared
                      </label>
                      <button
                        type="button"
                        className={`${secondaryButtonClass} px-2.5 py-1.5 text-red-700 dark:text-red-400`}
                        aria-label={`Remove ${s.name}`}
                        disabled={pending}
                        onClick={() => {
                          if (window.confirm(`Remove ${s.name} from this character?`)) {
                            run(() => removeCharacterSpell(characterId, s.versionId));
                          }
                        }}
                      >
                        ✕
                      </button>
                    </>
                  ) : null}
                </div>
                {isOpen ? (
                  <div className="mt-3">
                    <SpellCard name={s.name} spell={content} version={s.versionNumber} />
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
      )}

      {!readOnly ? (
        <div className="mt-4 border-t border-stone-200 pt-4 dark:border-stone-700">
          {addable.length ? (
            <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
              <div className="min-w-0 flex-1 space-y-1">
                <label htmlFor="add-spell" className="block text-sm font-medium">
                  Add a spell
                </label>
                <select id="add-spell" value={choice} onChange={(e) => setChoice(e.target.value)} className={selectClass}>
                  <option value="">Choose a spell…</option>
                  {addable.map((a) => (
                    <option key={a.versionId} value={a.versionId}>
                      {a.label}
                    </option>
                  ))}
                </select>
              </div>
              <button
                type="button"
                className={secondaryButtonClass}
                disabled={!choice || pending}
                onClick={() => {
                  const id = choice;
                  setChoice("");
                  run(() => addSpellToCharacter(characterId, id));
                }}
              >
                Add spell
              </button>
            </div>
          ) : (
            <p className="text-sm text-stone-600 dark:text-stone-400">
              {available.length ? "All your published spells are on this character." : "Publish a spell under My spells to add it here."}
            </p>
          )}
        </div>
      ) : null}
      {message ? <p className="mt-3 text-sm text-red-700 dark:text-red-400">{message}</p> : null}
    </Card>
  );
}
