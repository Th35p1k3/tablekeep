import { z } from "zod";
import { checkDice } from "./dice";

const text = (max: number) => z.string().max(max, `Keep this to ${max} characters or fewer.`);

const effectBase = {
  id: z.string().min(1).max(40),
  scaling: text(300).optional(),
};

const dice = z.string().max(100, "Dice text can be at most 100 characters.");

export const effectSchema = z.discriminatedUnion("type", [
  z.object({ ...effectBase, type: z.literal("damage"), dice, damageType: text(30), note: text(200).optional() }),
  z.object({ ...effectBase, type: z.literal("healing"), dice, note: text(200).optional() }),
  z.object({
    ...effectBase,
    type: z.literal("save"),
    ability: text(30),
    onSuccess: z.enum(["none", "half", "negates"]),
    dc: text(60).optional(),
    note: text(200).optional(),
  }),
  z.object({
    ...effectBase,
    type: z.literal("attack"),
    attackKind: z.enum(["melee", "ranged", "other"]),
    note: text(200).optional(),
  }),
  z.object({ ...effectBase, type: z.literal("condition"), condition: text(40), duration: text(60), note: text(200).optional() }),
  z.object({
    ...effectBase,
    type: z.literal("area"),
    shape: z.enum(["sphere", "cone", "cube", "line", "cylinder", "other"]),
    size: text(40),
    note: text(200).optional(),
  }),
  z.object({ ...effectBase, type: z.literal("text"), text: text(1000) }),
]);

export type SpellEffect = z.infer<typeof effectSchema>;
export type EffectType = SpellEffect["type"];

export const EFFECT_LABEL: Record<EffectType, string> = {
  damage: "Damage",
  healing: "Healing",
  save: "Saving throw",
  attack: "Attack roll",
  condition: "Condition",
  area: "Area",
  text: "Custom text",
};

export const spellContentSchema = z.object({
  formatVersion: z.literal(1),
  level: z.number().int("Use a whole number.").min(0, "Level can’t be below 0.").max(20, "Level can be at most 20.").optional(),
  category: text(40),
  castingTime: text(60),
  range: text(60),
  area: text(60),
  duration: text(60),
  components: text(200),
  concentration: z.boolean(),
  ritual: z.boolean(),
  tags: z.array(z.string().trim().min(1).max(30)).max(10, "Use at most 10 tags."),
  description: text(5000),
  higherLevels: text(2000),
  customProperties: z
    .array(z.object({ id: z.string().min(1).max(40), label: text(40), value: text(200) }))
    .max(20, "Use at most 20 custom properties."),
  effects: z.array(effectSchema).max(20, "Use at most 20 effects."),
});

export type SpellContent = z.infer<typeof spellContentSchema>;

export function blankSpell(): SpellContent {
  return {
    formatVersion: 1,
    category: "",
    castingTime: "",
    range: "",
    area: "",
    duration: "",
    components: "",
    concentration: false,
    ritual: false,
    tags: [],
    description: "",
    higherLevels: "",
    customProperties: [],
    effects: [],
  };
}

export type SpellIssue = { path: string; message: string };

/**
 * Full check before publishing: the layout, a description, labels on custom
 * properties, and dice that make sense. Drafts only need the layout.
 */
export function validateSpell(input: unknown):
  | { ok: true; spell: SpellContent }
  | { ok: false; issues: SpellIssue[] } {
  const parsed = spellContentSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((i) => ({ path: i.path.map(String).join("."), message: i.message })),
    };
  }
  const spell = parsed.data;
  const issues: SpellIssue[] = [];
  if (!spell.description.trim()) issues.push({ path: "description", message: "Add a description of what the spell does." });
  spell.customProperties.forEach((p, i) => {
    if (!p.label.trim()) issues.push({ path: `customProperties.${i}.label`, message: `Custom property ${i + 1} needs a label.` });
  });
  spell.effects.forEach((e, i) => {
    const where = `Effect ${i + 1} (${EFFECT_LABEL[e.type]})`;
    if (e.type === "damage" || e.type === "healing") {
      const check = checkDice(e.dice);
      if (!check.ok) issues.push({ path: `effects.${i}.dice`, message: `${where}: ${check.message}` });
    }
    if (e.type === "save" && !e.ability.trim()) issues.push({ path: `effects.${i}.ability`, message: `${where}: name the ability or stat.` });
    if (e.type === "condition" && !e.condition.trim()) issues.push({ path: `effects.${i}.condition`, message: `${where}: name the condition.` });
    if (e.type === "area" && !e.size.trim()) issues.push({ path: `effects.${i}.size`, message: `${where}: give the size.` });
    if (e.type === "text" && !e.text.trim()) issues.push({ path: `effects.${i}.text`, message: `${where}: write the effect.` });
  });
  return issues.length ? { ok: false, issues } : { ok: true, spell };
}

export function newEffectId(): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 10)
      : Math.random().toString(36).slice(2, 12);
  return `e-${random}`;
}

/** A fresh effect block of the chosen type with sensible starting values. */
export function newEffect(type: EffectType): SpellEffect {
  const id = newEffectId();
  switch (type) {
    case "damage":
      return { id, type, dice: "1d6", damageType: "" };
    case "healing":
      return { id, type, dice: "1d8" };
    case "save":
      return { id, type, ability: "", onSuccess: "half" };
    case "attack":
      return { id, type, attackKind: "ranged" };
    case "condition":
      return { id, type, condition: "", duration: "" };
    case "area":
      return { id, type, shape: "sphere", size: "" };
    case "text":
      return { id, type, text: "" };
  }
}

/** A copy of an effect with a new id (for presets and duplicating). */
export function copyEffect(effect: SpellEffect): SpellEffect {
  return { ...effect, id: newEffectId() };
}

/** Accepts whatever was stored and returns something the builder can show. */
export function coerceSpell(raw: unknown): SpellContent {
  const parsed = spellContentSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  const base = blankSpell();
  if (raw && typeof raw === "object") {
    const r = raw as Record<string, unknown>;
    if (typeof r.description === "string") base.description = r.description.slice(0, 5000);
  }
  return base;
}
