import { checkDice } from "@/lib/spells/dice";
import type { SpellContent, SpellEffect } from "@/lib/spells/schema";

function levelLabel(level: number | undefined, category: string): string {
  const cat = category.trim();
  if (level === undefined) return cat;
  if (level === 0) return cat ? `${cat} cantrip` : "Cantrip";
  return cat ? `Level ${level} ${cat.toLowerCase()}` : `Level ${level}`;
}

function diceText(dice: string): string {
  const check = checkDice(dice);
  if (!check.ok) return dice || "?";
  return check.average !== null && check.min !== check.max
    ? `${check.normalized} (average ${check.average})`
    : check.normalized;
}

const SAVE_RESULT: Record<string, string> = {
  none: "no effect on a success",
  half: "half on a success",
  negates: "a success avoids it",
};

function describeEffect(e: SpellEffect): string {
  switch (e.type) {
    case "damage":
      return `Damage: ${diceText(e.dice)}${e.damageType.trim() ? ` ${e.damageType.trim()}` : ""}`;
    case "healing":
      return `Healing: ${diceText(e.dice)}`;
    case "save":
      return `Saving throw: ${e.ability.trim() || "?"}${e.dc?.trim() ? ` (DC ${e.dc.trim()})` : ""}, ${SAVE_RESULT[e.onSuccess]}`;
    case "attack":
      return `Attack roll: ${e.attackKind === "other" ? "special" : e.attackKind}`;
    case "condition":
      return `Condition: ${e.condition.trim() || "?"}${e.duration.trim() ? ` for ${e.duration.trim()}` : ""}`;
    case "area":
      return `Area: ${e.size.trim() || "?"} ${e.shape === "other" ? "" : e.shape}`.trim();
    case "text":
      return e.text;
  }
}

/** A readable card for one spell. Works anywhere (no buttons inside). */
export function SpellCard({ name, spell, version }: { name: string; spell: SpellContent; version?: number | null }) {
  const subtitle = levelLabel(spell.level, spell.category);
  const facts: Array<[string, string]> = [
    ["Casting time", spell.castingTime],
    ["Range", spell.range],
    ["Area", spell.area],
    ["Components", spell.components],
    ["Duration", `${spell.concentration ? "Concentration, " : ""}${spell.duration}`.replace(/, $/, "")],
  ];
  return (
    <article className="rounded-xl border border-amber-200 bg-amber-50/60 p-4 sm:p-5 dark:border-amber-900 dark:bg-stone-900" data-testid="spell-card">
      <header>
        <h3 className="text-lg font-semibold break-words">{name || "Untitled spell"}</h3>
        <p className="text-sm text-stone-700 italic dark:text-stone-300">
          {subtitle}
          {spell.ritual ? `${subtitle ? " · " : ""}ritual` : ""}
          {version ? ` · version ${version}` : ""}
        </p>
      </header>
      <dl className="mt-3 grid grid-cols-1 gap-x-4 gap-y-1 text-sm sm:grid-cols-2">
        {facts
          .filter(([, value]) => value.trim())
          .map(([label, value]) => (
            <div key={label}>
              <dt className="inline font-semibold">{label}: </dt>
              <dd className="inline">{value}</dd>
            </div>
          ))}
        {spell.customProperties
          .filter((p) => p.label.trim())
          .map((p) => (
            <div key={p.id}>
              <dt className="inline font-semibold">{p.label}: </dt>
              <dd className="inline">{p.value}</dd>
            </div>
          ))}
      </dl>
      {spell.description.trim() ? (
        <p className="mt-3 leading-relaxed whitespace-pre-wrap">{spell.description}</p>
      ) : null}
      {spell.effects.length ? (
        <ul className="mt-3 space-y-1 text-sm">
          {spell.effects.map((e) => (
            <li key={e.id} className="break-words">
              <span>{describeEffect(e)}</span>
              {"note" in e && e.note?.trim() ? <span className="text-stone-600 dark:text-stone-400"> ({e.note.trim()})</span> : null}
              {e.scaling?.trim() ? <span className="block pl-4 text-stone-600 dark:text-stone-400">At higher levels: {e.scaling.trim()}</span> : null}
            </li>
          ))}
        </ul>
      ) : null}
      {spell.higherLevels.trim() ? (
        <p className="mt-3 text-sm">
          <span className="font-semibold">At higher levels. </span>
          {spell.higherLevels}
        </p>
      ) : null}
      {spell.tags.length ? (
        <p className="mt-3 flex flex-wrap gap-1.5">
          {spell.tags.map((t) => (
            <span key={t} className="rounded-full bg-stone-200 px-2 py-0.5 text-xs dark:bg-stone-700">
              {t}
            </span>
          ))}
        </p>
      ) : null}
    </article>
  );
}
