import { parseFormula } from "@/lib/formula";
import {
  MAX_FIELDS_TOTAL,
  NUMERIC_TYPES,
  type TemplateDefinition,
  type TemplateField,
  templateDefinitionSchema,
} from "./schema";

export type TemplateIssue = { path: string; message: string };

export type TemplateValidation =
  | { ok: true; template: TemplateDefinition }
  | { ok: false; issues: TemplateIssue[] };

type Located = { field: TemplateField; where: string };

/** Formulas a field contains: a calculated formula or a resource maximum. */
export function formulasOf(field: TemplateField): Array<{ prop: "formula" | "maxFormula"; source: string }> {
  if (field.type === "calculated") return [{ prop: "formula", source: field.formula }];
  if (field.type === "resource") return [{ prop: "maxFormula", source: field.maxFormula }];
  return [];
}

/** Splits "hit_points.max" into the field key and an optional property. */
export function splitReference(name: string): { key: string; prop: string | null } {
  const dot = name.indexOf(".");
  return dot === -1
    ? { key: name, prop: null }
    : { key: name.slice(0, dot), prop: name.slice(dot + 1) };
}

/**
 * Full check of a template: shape, unique names, and every formula
 * (spelling, fields that exist and hold numbers, and no circles).
 */
export function validateTemplate(input: unknown): TemplateValidation {
  const parsed = templateDefinitionSchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      issues: parsed.error.issues.map((i) => ({
        path: i.path.map(String).join("."),
        message: i.message,
      })),
    };
  }

  const template = parsed.data;
  const issues: TemplateIssue[] = [];
  const byKey = new Map<string, Located>();
  const ids = new Set<string>();
  let total = 0;

  template.sections.forEach((section, si) => {
    if (ids.has(section.id)) {
      issues.push({ path: `sections.${si}.id`, message: "Two items share the same internal id." });
    }
    ids.add(section.id);

    section.fields.forEach((field, fi) => {
      total++;
      const where = `“${section.title}” › “${field.label}”`;
      const path = `sections.${si}.fields.${fi}`;
      if (ids.has(field.id)) {
        issues.push({ path: `${path}.id`, message: `${where}: two items share the same internal id.` });
      }
      ids.add(field.id);

      const existing = byKey.get(field.key);
      if (existing) {
        issues.push({
          path: `${path}.key`,
          message: `${where}: the short name “${field.key}” is already used by ${existing.where}.`,
        });
      } else {
        byKey.set(field.key, { field, where });
      }

      if (field.type === "number" && field.min !== undefined && field.max !== undefined && field.min > field.max) {
        issues.push({ path: `${path}.min`, message: `${where}: the minimum is larger than the maximum.` });
      }
      if (field.type === "choice") {
        const unique = new Set(field.options.map((o) => o.toLowerCase()));
        if (unique.size !== field.options.length) {
          issues.push({ path: `${path}.options`, message: `${where}: each option must be different.` });
        }
        if (field.default !== undefined && field.default !== "" && !field.options.includes(field.default)) {
          issues.push({ path: `${path}.default`, message: `${where}: the default must be one of the options.` });
        }
      }
    });
  });

  if (total > MAX_FIELDS_TOTAL) {
    issues.push({ path: "sections", message: `A template can have at most ${MAX_FIELDS_TOTAL} fields.` });
  }

  // Check every formula and build the "depends on" map.
  const dependsOn = new Map<string, Set<string>>();
  template.sections.forEach((section, si) => {
    section.fields.forEach((field, fi) => {
      for (const { prop, source } of formulasOf(field)) {
        const path = `sections.${si}.fields.${fi}.${prop}`;
        const where = `“${section.title}” › “${field.label}”`;
        const result = parseFormula(source);
        if (!result.ok) {
          issues.push({ path, message: `${where}: ${result.error.message}` });
          continue;
        }
        const deps = dependsOn.get(field.key) ?? new Set<string>();
        for (const name of result.references) {
          const { key, prop: sub } = splitReference(name);
          const target = byKey.get(key);
          if (!target) {
            issues.push({ path, message: `${where}: there’s no field with the short name “${key}”.` });
            continue;
          }
          if (!NUMERIC_TYPES.has(target.field.type)) {
            issues.push({
              path,
              message: `${where}: “${key}” is a ${target.field.type === "choice" ? "choice list" : "text"} field, so it can’t be used in a formula.`,
            });
            continue;
          }
          if (sub !== null && (target.field.type !== "resource" || (sub !== "max" && sub !== "current"))) {
            issues.push({
              path,
              message: `${where}: “${name}” isn’t valid. Only resources have “.max” and “.current”.`,
            });
            continue;
          }
          deps.add(key);
        }
        dependsOn.set(field.key, deps);
      }
    });
  });

  // Find circles such as a → b → a.
  const state = new Map<string, "visiting" | "done">();
  const reported = new Set<string>();
  const visit = (key: string, trail: string[]) => {
    const s = state.get(key);
    if (s === "done") return;
    if (s === "visiting") {
      const cycle = trail.slice(trail.indexOf(key));
      const label = (k: string) => `“${byKey.get(k)?.field.label ?? k}”`;
      const signature = [...cycle].sort().join(",");
      if (!reported.has(signature)) {
        reported.add(signature);
        issues.push({
          path: "sections",
          message:
            cycle.length === 1
              ? `${label(key)} uses itself in its own formula.`
              : `${cycle.map(label).join(" → ")} → ${label(key)} depend on each other in a circle.`,
        });
      }
      return;
    }
    state.set(key, "visiting");
    for (const dep of dependsOn.get(key) ?? []) {
      if (dependsOn.has(dep) || dep === key) visit(dep, [...trail, key]);
    }
    state.set(key, "done");
  };
  for (const key of dependsOn.keys()) visit(key, []);

  return issues.length ? { ok: false, issues } : { ok: true, template };
}
