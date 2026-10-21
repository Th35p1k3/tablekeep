import {
  FIELD_TYPE_LABEL,
  type FieldType,
  NUMERIC_TYPES,
  RESERVED_KEYS,
  type TemplateDefinition,
  type TemplateField,
  templateDefinitionSchema,
} from "./schema";

/** A short random id for sections and fields (stable while editing). */
export function newId(prefix: "s" | "f"): string {
  const random =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "").slice(0, 10)
      : Math.random().toString(36).slice(2, 12);
  return `${prefix}-${random}`;
}

/** Turns a label like "Armor Class" into a short name like "armor_class". */
export function slugify(label: string): string {
  let key = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "")
    .slice(0, 40)
    .replace(/_+$/g, "");
  if (!key) key = "field";
  if (!/^[a-z]/.test(key)) key = `f_${key}`.slice(0, 40);
  if (RESERVED_KEYS.has(key)) key = `${key}_value`;
  return key;
}

/** Adds _2, _3 … until the short name isn't taken. */
export function uniqueKey(base: string, taken: Set<string>): string {
  if (!taken.has(base)) return base;
  for (let n = 2; ; n++) {
    const suffix = `_${n}`;
    const candidate = `${base.slice(0, 40 - suffix.length)}${suffix}`;
    if (!taken.has(candidate)) return candidate;
  }
}

export function allKeys(definition: TemplateDefinition, exceptFieldId?: string): Set<string> {
  const keys = new Set<string>();
  for (const s of definition.sections) {
    for (const f of s.fields) if (f.id !== exceptFieldId) keys.add(f.key);
  }
  return keys;
}

/** Short names that formulas can use, for the "available fields" hint. */
export function numericKeys(definition: TemplateDefinition): string[] {
  const keys: string[] = [];
  for (const s of definition.sections) {
    for (const f of s.fields) {
      if (NUMERIC_TYPES.has(f.type)) {
        keys.push(f.key);
        if (f.type === "resource") keys.push(`${f.key}.max`);
      }
    }
  }
  return keys;
}

/** Fills in the settings a field of this type needs, keeping what it can. */
export function withType(
  base: Pick<TemplateField, "id" | "key" | "label" | "help">,
  type: FieldType,
): TemplateField {
  const common = { id: base.id, key: base.key, label: base.label, ...(base.help ? { help: base.help } : {}) };
  switch (type) {
    case "number":
      return { ...common, type, default: 0 };
    case "text":
      return { ...common, type };
    case "longtext":
      return { ...common, type };
    case "checkbox":
      return { ...common, type, default: false };
    case "choice":
      return { ...common, type, options: ["Option 1", "Option 2"] };
    case "resource":
      return { ...common, type, maxFormula: "10" };
    case "calculated":
      return { ...common, type, formula: "0", format: "number" };
  }
}

export function newField(type: FieldType, taken: Set<string>): TemplateField {
  const label = `New ${FIELD_TYPE_LABEL[type].split(" (")[0].toLowerCase()}`;
  return withType({ id: newId("f"), key: uniqueKey(slugify(label), taken), label }, type);
}

export function blankTemplate(): TemplateDefinition {
  return { formatVersion: 1, sections: [{ id: newId("s"), title: "Main", fields: [] }] };
}

/** Returns a copy of the list with one item moved up (-1) or down (+1). */
export function moveItem<T>(items: readonly T[], index: number, delta: -1 | 1): T[] {
  const target = index + delta;
  if (index < 0 || index >= items.length || target < 0 || target >= items.length) {
    return [...items];
  }
  const copy = [...items];
  [copy[index], copy[target]] = [copy[target], copy[index]];
  return copy;
}

/**
 * Accepts whatever was stored and returns something the builder can show.
 * Anything without a usable list of sections becomes a blank template.
 */
export function coerceDefinition(raw: unknown): TemplateDefinition {
  const parsed = templateDefinitionSchema.safeParse(raw);
  if (parsed.success) return parsed.data;
  if (
    raw &&
    typeof raw === "object" &&
    Array.isArray((raw as { sections?: unknown }).sections) &&
    (raw as { sections: unknown[] }).sections.every(
      (s) => s && typeof s === "object" && Array.isArray((s as { fields?: unknown }).fields),
    )
  ) {
    return raw as TemplateDefinition;
  }
  return blankTemplate();
}
