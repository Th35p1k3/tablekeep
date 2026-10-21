import { FormulaError } from "./errors";
import { type FormulaValue, type Lookup, evaluate } from "./evaluate";
import { type FormulaNode, parse, references } from "./parse";

export { FormulaError } from "./errors";
export type { FormulaErrorCode } from "./errors";
export type { FormulaValue, Lookup } from "./evaluate";
export type { FormulaNode } from "./parse";
export { FUNCTIONS } from "./parse";
export { MAX_FORMULA_LENGTH } from "./tokenize";

export type ParsedFormula =
  | { ok: true; ast: FormulaNode; references: string[] }
  | { ok: false; error: FormulaError };

export type FormulaResult =
  | { ok: true; value: FormulaValue }
  | { ok: false; error: FormulaError };

function asFormulaError(e: unknown): FormulaError {
  if (e instanceof FormulaError) return e;
  // Anything unexpected (for example a stack overflow) becomes a safe message.
  return new FormulaError("too_complex", "This formula couldn’t be calculated.");
}

/** Checks a formula's spelling and structure without calculating it. */
export function parseFormula(source: string): ParsedFormula {
  try {
    const ast = parse(source);
    return { ok: true, ast, references: references(ast) };
  } catch (e) {
    return { ok: false, error: asFormulaError(e) };
  }
}

/** Calculates an already-parsed formula using the given field lookup. */
export function evaluateFormula(ast: FormulaNode, lookup: Lookup): FormulaResult {
  try {
    return { ok: true, value: evaluate(ast, lookup) };
  } catch (e) {
    return { ok: false, error: asFormulaError(e) };
  }
}

/** Parses and calculates in one go, with values from a plain list. */
export function calculate(
  source: string,
  values: Record<string, FormulaValue> = {},
): FormulaResult {
  const parsed = parseFormula(source);
  if (!parsed.ok) return parsed;
  const known = new Map(Object.entries(values));
  return evaluateFormula(parsed.ast, (name) => {
    const v = known.get(name);
    if (v === undefined) {
      throw new FormulaError("unknown_field", `There’s no field called “${name}”.`);
    }
    return v;
  });
}
