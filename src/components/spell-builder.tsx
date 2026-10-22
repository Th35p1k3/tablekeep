"use client";

import { type ReactNode, useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { deleteEffectPreset, publishSpellDraft, saveEffectPreset, saveSpellDraft } from "@/lib/spells/actions";
import { checkDice } from "@/lib/spells/dice";
import type { EffectPreset } from "@/lib/spells/queries";
import {
  EFFECT_LABEL,
  type EffectType,
  type SpellContent,
  type SpellEffect,
  copyEffect,
  newEffect,
  newEffectId,
  spellContentSchema,
  validateSpell,
} from "@/lib/spells/schema";
import { moveItem } from "@/lib/templates/editing";
import { SpellCard } from "./spell-card";
import { Card, secondaryButtonClass, selectClass } from "./ui";

const EFFECT_TYPES = Object.keys(EFFECT_LABEL) as EffectType[];
const small = `${secondaryButtonClass} px-2.5 py-1.5`;

function L({ id, label, children }: { id: string; label: string; children: ReactNode }) {
  return (
    <div className="space-y-1">
      <label htmlFor={id} className="block text-sm font-medium">
        {label}
      </label>
      {children}
    </div>
  );
}

function TextInput({ id, value, onChange, mono }: { id: string; value: string; onChange: (v: string) => void; mono?: boolean }) {
  return (
    <input
      id={id}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className={`${selectClass} ${mono ? "font-mono" : ""}`}
      autoCapitalize={mono ? "none" : undefined}
      spellCheck={mono ? false : undefined}
    />
  );
}

function EffectFields({ effect, onChange }: { effect: SpellEffect; onChange: (e: SpellEffect) => void }) {
  const id = (name: string) => `fx-${name}-${effect.id}`;
  const note =
    effect.type !== "text" ? (
      <L id={id("note")} label="Note (optional)">
        <TextInput id={id("note")} value={effect.note ?? ""} onChange={(v) => onChange({ ...effect, note: v || undefined })} />
      </L>
    ) : null;
  const scaling = (
    <L id={id("scaling")} label="At higher levels (optional)">
      <TextInput id={id("scaling")} value={effect.scaling ?? ""} onChange={(v) => onChange({ ...effect, scaling: v || undefined })} />
    </L>
  );
  const diceHint = (dice: string) => {
    const check = checkDice(dice);
    return (
      <p className={`text-xs ${check.ok ? "text-stone-600 dark:text-stone-400" : "text-red-700 dark:text-red-400"}`}>
        {check.ok
          ? check.average !== null
            ? `Range ${check.min}–${check.max}, average ${check.average}.`
            : "Looks good."
          : check.message}
      </p>
    );
  };

  let specific: ReactNode = null;
  switch (effect.type) {
    case "damage":
      specific = (
        <>
          <L id={id("dice")} label="Dice">
            <TextInput id={id("dice")} value={effect.dice} mono onChange={(v) => onChange({ ...effect, dice: v })} />
            {diceHint(effect.dice)}
          </L>
          <L id={id("dtype")} label="Damage type">
            <TextInput id={id("dtype")} value={effect.damageType} onChange={(v) => onChange({ ...effect, damageType: v })} />
          </L>
        </>
      );
      break;
    case "healing":
      specific = (
        <L id={id("dice")} label="Dice">
          <TextInput id={id("dice")} value={effect.dice} mono onChange={(v) => onChange({ ...effect, dice: v })} />
          {diceHint(effect.dice)}
        </L>
      );
      break;
    case "save":
      specific = (
        <>
          <L id={id("ability")} label="Ability or stat">
            <TextInput id={id("ability")} value={effect.ability} onChange={(v) => onChange({ ...effect, ability: v })} />
          </L>
          <L id={id("success")} label="On a successful save">
            <select
              id={id("success")}
              value={effect.onSuccess}
              onChange={(e) => onChange({ ...effect, onSuccess: e.target.value as "none" | "half" | "negates" })}
              className={selectClass}
            >
              <option value="half">Half effect</option>
              <option value="negates">Avoids it completely</option>
              <option value="none">No difference</option>
            </select>
          </L>
          <L id={id("dc")} label="Difficulty (optional)">
            <TextInput id={id("dc")} value={effect.dc ?? ""} onChange={(v) => onChange({ ...effect, dc: v || undefined })} />
          </L>
        </>
      );
      break;
    case "attack":
      specific = (
        <L id={id("kind")} label="Attack type">
          <select
            id={id("kind")}
            value={effect.attackKind}
            onChange={(e) => onChange({ ...effect, attackKind: e.target.value as "melee" | "ranged" | "other" })}
            className={selectClass}
          >
            <option value="ranged">Ranged</option>
            <option value="melee">Melee</option>
            <option value="other">Other</option>
          </select>
        </L>
      );
      break;
    case "condition":
      specific = (
        <>
          <L id={id("condition")} label="Condition">
            <TextInput id={id("condition")} value={effect.condition} onChange={(v) => onChange({ ...effect, condition: v })} />
          </L>
          <L id={id("cduration")} label="For how long">
            <TextInput id={id("cduration")} value={effect.duration} onChange={(v) => onChange({ ...effect, duration: v })} />
          </L>
        </>
      );
      break;
    case "area":
      specific = (
        <>
          <L id={id("shape")} label="Shape">
            <select
              id={id("shape")}
              value={effect.shape}
              onChange={(e) => onChange({ ...effect, shape: e.target.value as typeof effect.shape })}
              className={selectClass}
            >
              {["sphere", "cone", "cube", "line", "cylinder", "other"].map((s) => (
                <option key={s} value={s}>
                  {s[0].toUpperCase() + s.slice(1)}
                </option>
              ))}
            </select>
          </L>
          <L id={id("size")} label="Size">
            <TextInput id={id("size")} value={effect.size} onChange={(v) => onChange({ ...effect, size: v })} />
          </L>
        </>
      );
      break;
    case "text":
      specific = (
        <div className="sm:col-span-2">
          <L id={id("text")} label="Effect text">
            <textarea
              id={id("text")}
              rows={2}
              value={effect.text}
              onChange={(e) => onChange({ ...effect, text: e.target.value })}
              className={selectClass}
            />
          </L>
        </div>
      );
      break;
  }

  return (
    <div className="grid gap-3 sm:grid-cols-2">
      {specific}
      {note}
      {scaling}
    </div>
  );
}

export function SpellBuilder({
  spellId,
  name,
  initial,
  nextVersion,
  initialPresets,
}: {
  spellId: string;
  name: string;
  initial: SpellContent;
  nextVersion: number;
  initialPresets: EffectPreset[];
}) {
  const router = useRouter();
  const [spell, setSpell] = useState<SpellContent>(initial);
  const [saved, setSaved] = useState<SpellContent>(initial);
  const [tagsText, setTagsText] = useState(initial.tags.join(", "));
  const [presets, setPresets] = useState(initialPresets);
  const [addType, setAddType] = useState<EffectType>("damage");
  const [presetChoice, setPresetChoice] = useState("");
  const [status, setStatus] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [pending, startTransition] = useTransition();

  const dirty = useMemo(() => JSON.stringify(spell) !== JSON.stringify(saved), [spell, saved]);
  const validation = useMemo(() => validateSpell(spell), [spell]);
  const issues = validation.ok ? [] : validation.issues;
  const canSave = useMemo(() => spellContentSchema.safeParse(spell).success, [spell]);

  useEffect(() => {
    if (!dirty) return;
    const warn = (e: BeforeUnloadEvent) => e.preventDefault();
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  const change = (next: SpellContent) => {
    setSpell(next);
    setStatus(null);
  };
  const set = <K extends keyof SpellContent>(key: K, value: SpellContent[K]) => change({ ...spell, [key]: value });
  const setEffect = (index: number, effect: SpellEffect) =>
    change({ ...spell, effects: spell.effects.map((e, i) => (i === index ? effect : e)) });

  const save = () =>
    startTransition(async () => {
      const snapshot = spell;
      const result = await saveSpellDraft(spellId, snapshot);
      if (result.ok) {
        setSaved(snapshot);
        setStatus({ tone: "success", text: "All changes saved." });
      } else {
        setStatus({ tone: "error", text: result.message });
      }
    });

  const publish = () => {
    if (!window.confirm(`Publish version ${nextVersion}? Published versions can’t be changed afterwards.`)) return;
    startTransition(async () => {
      const snapshot = spell;
      const result = await publishSpellDraft(spellId, snapshot);
      if (result.ok) {
        setSaved(snapshot);
        setStatus({ tone: "success", text: `Published version ${result.version}.` });
        router.refresh();
      } else {
        setStatus({ tone: "error", text: result.message });
      }
    });
  };

  const savePreset = (effect: SpellEffect) => {
    const presetName = window.prompt("Name this preset (for example “Fire burst damage”):");
    if (!presetName) return;
    startTransition(async () => {
      const result = await saveEffectPreset(presetName, effect);
      if (result.ok) {
        setPresets(result.presets);
        setStatus({ tone: "success", text: `Saved preset “${presetName}”.` });
      } else {
        setStatus({ tone: "error", text: result.message });
      }
    });
  };

  const removePreset = (preset: EffectPreset) => {
    if (!window.confirm(`Delete the preset “${preset.name}”? Spells that used it keep their copy.`)) return;
    startTransition(async () => {
      const result = await deleteEffectPreset(preset.id);
      if (result.ok) setPresets(result.presets);
    });
  };

  const field = (key: "category" | "castingTime" | "range" | "area" | "duration" | "components", label: string) => (
    <L id={`spell-${key}`} label={label}>
      <TextInput id={`spell-${key}`} value={spell[key]} onChange={(v) => set(key, v)} />
    </L>
  );

  return (
    <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
      <div className="space-y-4">
        <Card>
          <div className="flex flex-wrap items-center justify-between gap-3">
            <p className="text-sm font-medium" data-testid="save-status" aria-live="polite">
              {pending ? "Saving…" : dirty ? "Unsaved changes" : "All changes saved"}
            </p>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={save} disabled={pending || !dirty || !canSave} className={secondaryButtonClass}>
                Save draft
              </button>
              <button
                type="button"
                onClick={publish}
                disabled={pending || issues.length > 0}
                className="inline-flex items-center justify-center rounded-md bg-amber-800 px-4 py-2 text-sm font-medium text-white hover:bg-amber-900 disabled:opacity-60"
              >
                Publish version {nextVersion}
              </button>
            </div>
          </div>
          {status ? (
            <p
              data-testid="form-message"
              className={`mt-3 text-sm ${status.tone === "error" ? "text-red-700 dark:text-red-400" : "text-emerald-700 dark:text-emerald-400"}`}
            >
              {status.text}
            </p>
          ) : null}
          {issues.length ? (
            <div className="mt-3 rounded-md border border-red-300 bg-red-50 px-3 py-2 text-sm text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
              <p className="font-medium">To fix before publishing:</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-5" data-testid="spell-problems">
                {issues.slice(0, 8).map((i, n) => (
                  <li key={n}>{i.message}</li>
                ))}
              </ul>
            </div>
          ) : null}
        </Card>

        <Card>
          <h2 className="mb-4 text-lg font-semibold">Basics</h2>
          <div className="grid gap-3 sm:grid-cols-2">
            <L id="spell-level" label="Level (blank if your game has none)">
              <input
                id="spell-level"
                type="number"
                min={0}
                max={20}
                value={spell.level ?? ""}
                onChange={(e) => {
                  const n = e.target.value === "" ? undefined : Number(e.target.value);
                  set("level", n === undefined || Number.isNaN(n) ? undefined : n);
                }}
                className={selectClass}
              />
            </L>
            {field("category", "Category (school, discipline …)")}
            {field("castingTime", "Casting time")}
            {field("range", "Range")}
            {field("area", "Area")}
            {field("duration", "Duration")}
            <div className="sm:col-span-2">{field("components", "Components")}</div>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={spell.concentration} onChange={(e) => set("concentration", e.target.checked)} className="h-5 w-5 accent-amber-800" />
              Concentration
            </label>
            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={spell.ritual} onChange={(e) => set("ritual", e.target.checked)} className="h-5 w-5 accent-amber-800" />
              Ritual
            </label>
            <div className="sm:col-span-2">
              <L id="spell-tags" label="Tags (separated by commas)">
                <input
                  id="spell-tags"
                  value={tagsText}
                  onChange={(e) => {
                    setTagsText(e.target.value);
                    const tags = [...new Set(e.target.value.split(",").map((t) => t.trim()).filter(Boolean))];
                    set("tags", tags.slice(0, 10).map((t) => t.slice(0, 30)));
                  }}
                  className={selectClass}
                />
              </L>
            </div>
            <div className="sm:col-span-2">
              <L id="spell-description" label="Description">
                <textarea id="spell-description" rows={5} value={spell.description} onChange={(e) => set("description", e.target.value)} className={selectClass} />
              </L>
            </div>
            <div className="sm:col-span-2">
              <L id="spell-higher" label="At higher levels (optional)">
                <textarea id="spell-higher" rows={2} value={spell.higherLevels} onChange={(e) => set("higherLevels", e.target.value)} className={selectClass} />
              </L>
            </div>
          </div>
        </Card>

        <Card>
          <h2 className="text-lg font-semibold">Custom properties</h2>
          <p className="mt-1 mb-3 text-sm text-stone-600 dark:text-stone-400">
            Anything your game needs that isn’t above, like “Mana cost: 5”.
          </p>
          <ul className="space-y-2">
            {spell.customProperties.map((p, i) => (
              <li key={p.id} className="flex flex-wrap items-end gap-2">
                <div className="min-w-0 flex-1">
                  <L id={`prop-label-${p.id}`} label="Label">
                    <TextInput
                      id={`prop-label-${p.id}`}
                      value={p.label}
                      onChange={(v) => set("customProperties", spell.customProperties.map((x, j) => (j === i ? { ...x, label: v } : x)))}
                    />
                  </L>
                </div>
                <div className="min-w-0 flex-1">
                  <L id={`prop-value-${p.id}`} label="Value">
                    <TextInput
                      id={`prop-value-${p.id}`}
                      value={p.value}
                      onChange={(v) => set("customProperties", spell.customProperties.map((x, j) => (j === i ? { ...x, value: v } : x)))}
                    />
                  </L>
                </div>
                <button
                  type="button"
                  className={`${small} text-red-700 dark:text-red-400`}
                  aria-label={`Remove property ${p.label || i + 1}`}
                  onClick={() => set("customProperties", spell.customProperties.filter((_, j) => j !== i))}
                >
                  ✕
                </button>
              </li>
            ))}
          </ul>
          <button
            type="button"
            className={`${secondaryButtonClass} mt-3`}
            disabled={spell.customProperties.length >= 20}
            onClick={() => set("customProperties", [...spell.customProperties, { id: newEffectId(), label: "", value: "" }])}
          >
            Add property
          </button>
        </Card>

        <Card>
          <h2 className="mb-3 text-lg font-semibold">Effects</h2>
          <ul className="space-y-3">
            {spell.effects.map((effect, i) => (
              <li key={effect.id} className="space-y-3 rounded-lg border border-stone-200 p-3 dark:border-stone-700">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="flex-1 font-medium">
                    {i + 1}. {EFFECT_LABEL[effect.type]}
                  </span>
                  <button type="button" className={small} aria-label={`Move effect ${i + 1} up`} disabled={i === 0} onClick={() => set("effects", moveItem(spell.effects, i, -1))}>
                    ↑
                  </button>
                  <button type="button" className={small} aria-label={`Move effect ${i + 1} down`} disabled={i === spell.effects.length - 1} onClick={() => set("effects", moveItem(spell.effects, i, 1))}>
                    ↓
                  </button>
                  <button type="button" className={small} onClick={() => savePreset(effect)}>
                    Save as preset
                  </button>
                  <button
                    type="button"
                    className={`${small} text-red-700 dark:text-red-400`}
                    aria-label={`Delete effect ${i + 1}`}
                    onClick={() => set("effects", spell.effects.filter((_, j) => j !== i))}
                  >
                    ✕
                  </button>
                </div>
                <EffectFields effect={effect} onChange={(e) => setEffect(i, e)} />
              </li>
            ))}
          </ul>

          <div className="mt-4 flex flex-wrap items-end gap-2">
            <L id="add-effect-type" label="Effect type">
              <select id="add-effect-type" value={addType} onChange={(e) => setAddType(e.target.value as EffectType)} className={`${selectClass} w-auto`}>
                {EFFECT_TYPES.map((t) => (
                  <option key={t} value={t}>
                    {EFFECT_LABEL[t]}
                  </option>
                ))}
              </select>
            </L>
            <button
              type="button"
              className={secondaryButtonClass}
              disabled={spell.effects.length >= 20}
              onClick={() => set("effects", [...spell.effects, newEffect(addType)])}
            >
              Add effect
            </button>
          </div>

          {presets.length ? (
            <div className="mt-4 space-y-2 border-t border-stone-200 pt-4 dark:border-stone-700">
              <div className="flex flex-wrap items-end gap-2">
                <L id="insert-preset" label="Your presets">
                  <select id="insert-preset" value={presetChoice} onChange={(e) => setPresetChoice(e.target.value)} className={`${selectClass} w-auto`}>
                    <option value="">Choose a preset…</option>
                    {presets.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name}
                      </option>
                    ))}
                  </select>
                </L>
                <button
                  type="button"
                  className={secondaryButtonClass}
                  disabled={!presetChoice || spell.effects.length >= 20}
                  onClick={() => {
                    const preset = presets.find((p) => p.id === presetChoice);
                    if (preset) set("effects", [...spell.effects, copyEffect(preset.effect)]);
                  }}
                >
                  Insert preset
                </button>
                {presetChoice ? (
                  <button
                    type="button"
                    className={`${secondaryButtonClass} text-red-700 dark:text-red-400`}
                    onClick={() => {
                      const preset = presets.find((p) => p.id === presetChoice);
                      if (preset) removePreset(preset);
                      setPresetChoice("");
                    }}
                  >
                    Delete preset
                  </button>
                ) : null}
              </div>
            </div>
          ) : null}
        </Card>
      </div>

      <div className="lg:sticky lg:top-4">
        <h2 className="mb-2 text-sm font-semibold tracking-wide text-stone-600 uppercase dark:text-stone-400">Card preview</h2>
        <SpellCard name={name} spell={spell} />
      </div>
    </div>
  );
}
