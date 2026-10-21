import { FormulaError, type FormulaNode, type FormulaValue, evaluateFormula, parseFormula } from "@/lib/formula";
import type { TemplateDefinition, TemplateField } from "./schema";
import { splitReference } from "./validate";

/** What a player has typed into a sheet, keyed by field short name. */
export type SheetInput = Record<string, unknown>;

export type ComputedSheet = {
  /** Value of each number, checkbox, calculated field and resource (current). */
  values: Map<string, FormulaValue>;
  /** Maximum of each resource. */
  maxima: Map<string, number>;
  /** A plain-language problem for each field that couldn't be calculated. */
  errors: Map<string, string>;
};

function readInput(input: SheetInput, key: string): unknown {
  return Object.hasOwn(input, key) ? input[key] : undefined;
}

function toNumber(raw: unknown, fallback: number): number {
  if (typeof raw === "number" && Number.isFinite(raw)) return raw;
  if (typeof raw === "string" && raw.trim() !== "" && Number.isFinite(Number(raw))) return Number(raw);
  return fallback;
}

function toBoolean(raw: unknown, fallback: boolean): boolean {
  if (typeof raw === "boolean") return raw;
  if (raw === "true") return true;
  if (raw === "false") return false;
  return fallback;
}

/**
 * Works out every calculated value on a sheet from the player's input.
 * Problems in one field never stop the rest of the sheet from calculating.
 */
export function computeSheet(template: TemplateDefinition, input: SheetInput): ComputedSheet {
  const fields = new Map<string, TemplateField>();
  for (const section of template.sections) {
    for (const field of section.fields) fields.set(field.key, field);
  }

  const parsed = new Map<string, FormulaNode | FormulaError>();
  const parseOnce = (key: string, source: string) => {
    if (!parsed.has(key)) {
      const r = parseFormula(source);
      parsed.set(key, r.ok ? r.ast : r.error);
    }
    return parsed.get(key)!;
  };

  const values = new Map<string, FormulaValue>();
  const maxima = new Map<string, number>();
  const errors = new Map<string, string>();
  const state = new Map<string, "visiting" | "done">();

  const run = (key: string, source: string): FormulaValue => {
    const ast = parseOnce(key, source);
    if (ast instanceof FormulaError) throw ast;
    const result = evaluateFormula(ast, lookup);
    if (!result.ok) throw result.error;
    return result.value;
  };

  const ensure = (key: string) => {
    const s = state.get(key);
    if (s === "done") return;
    if (s === "visiting") {
      throw new FormulaError("circular", "These fields depend on each other in a circle.");
    }
    const field = fields.get(key);
    if (!field) return;
    state.set(key, "visiting");
    try {
      switch (field.type) {
        case "number":
          values.set(key, toNumber(readInput(input, key), field.default ?? 0));
          break;
        case "checkbox":
          values.set(key, toBoolean(readInput(input, key), field.default ?? false));
          break;
        case "calculated":
          values.set(key, run(key, field.formula));
          break;
        case "resource": {
          const max = run(key, field.maxFormula);
          const maxNumber = typeof max === "boolean" ? (max ? 1 : 0) : max;
          maxima.set(key, maxNumber);
          values.set(key, toNumber(readInput(input, key), maxNumber));
          break;
        }
        default:
          break;
      }
    } catch (e) {
      errors.set(key, e instanceof FormulaError ? e.message : "This field couldn’t be calculated.");
    } finally {
      state.set(key, "done");
    }
  };

  function lookup(name: string): FormulaValue {
    const { key, prop } = splitReference(name);
    const field = fields.get(key);
    if (!field) {
      throw new FormulaError("unknown_field", `There’s no field with the short name “${key}”.`);
    }
    if (field.type === "text" || field.type === "longtext" || field.type === "choice") {
      throw new FormulaError("not_a_number_field", `“${field.label}” isn’t a number, so it can’t be used in a formula.`);
    }
    ensure(key);
    if (errors.has(key)) {
      throw new FormulaError("depends_on_error", `This uses “${field.label}”, which has a problem.`);
    }
    if (prop === "max") {
      const max = maxima.get(key);
      if (max === undefined) throw new FormulaError("unknown_property", `“${name}” isn’t valid.`);
      return max;
    }
    if (prop !== null && prop !== "current") {
      throw new FormulaError("unknown_property", `“${name}” isn’t valid.`);
    }
    const value = values.get(key);
    if (value === undefined) throw new FormulaError("unknown_field", `“${field.label}” has no value.`);
    return value;
  }

  for (const key of fields.keys()) ensure(key);
  return { values, maxima, errors };
}

/** Shows a calculated value the way a sheet should display it. */
export function formatValue(value: FormulaValue | undefined, format: "number" | "modifier" = "number"): string {
  if (value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  const rounded = Math.round(value * 100) / 100;
  const text = Number.isInteger(rounded) ? String(rounded) : rounded.toFixed(2).replace(/0$/, "");
  return format === "modifier" && rounded >= 0 ? `+${text}` : text;
}
