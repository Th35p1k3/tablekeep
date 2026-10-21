import { FormulaError } from "./errors";
import type { FormulaNode } from "./parse";

export type FormulaValue = number | boolean;

/** Looks up a field name; throws a FormulaError if it can't. */
export type Lookup = (name: string) => FormulaValue;

const asNumber = (v: FormulaValue): number => (typeof v === "boolean" ? (v ? 1 : 0) : v);
const asBoolean = (v: FormulaValue): boolean => (typeof v === "number" ? v !== 0 : v);

function finite(n: number): number {
  if (!Number.isFinite(n)) {
    throw new FormulaError("not_finite", "The result is too large to work with.");
  }
  return n;
}

/** Calculates a parsed formula. Only the operations listed here exist. */
export function evaluate(node: FormulaNode, lookup: Lookup): FormulaValue {
  switch (node.type) {
    case "number":
      return node.value;
    case "boolean":
      return node.value;
    case "ref":
      return lookup(node.name);
    case "negate":
      return finite(-asNumber(evaluate(node.arg, lookup)));
    case "not":
      return !asBoolean(evaluate(node.arg, lookup));
    case "binary": {
      if (node.op === "and") {
        return asBoolean(evaluate(node.left, lookup)) && asBoolean(evaluate(node.right, lookup));
      }
      if (node.op === "or") {
        return asBoolean(evaluate(node.left, lookup)) || asBoolean(evaluate(node.right, lookup));
      }
      const a = asNumber(evaluate(node.left, lookup));
      const b = asNumber(evaluate(node.right, lookup));
      switch (node.op) {
        case "+":
          return finite(a + b);
        case "-":
          return finite(a - b);
        case "*":
          return finite(a * b);
        case "/":
          if (b === 0) {
            throw new FormulaError("divide_by_zero", "This formula divides by zero.", node.pos);
          }
          return finite(a / b);
        case "<":
          return a < b;
        case "<=":
          return a <= b;
        case ">":
          return a > b;
        case ">=":
          return a >= b;
        case "==":
          return a === b;
        case "!=":
          return a !== b;
      }
      throw new FormulaError("unexpected_token", "Unknown operator.", node.pos);
    }
    case "call": {
      if (node.name === "if") {
        // Only the chosen branch is calculated.
        return asBoolean(evaluate(node.args[0], lookup))
          ? evaluate(node.args[1], lookup)
          : evaluate(node.args[2], lookup);
      }
      const values = node.args.map((arg) => asNumber(evaluate(arg, lookup)));
      switch (node.name) {
        case "floor":
          return Math.floor(values[0]);
        case "ceil":
          return Math.ceil(values[0]);
        case "round":
          return Math.round(values[0]);
        case "abs":
          return Math.abs(values[0]);
        case "min":
          return Math.min(...values);
        case "max":
          return Math.max(...values);
        case "clamp": {
          const [value, low, high] = values;
          return Math.min(Math.max(value, Math.min(low, high)), Math.max(low, high));
        }
      }
      throw new FormulaError("unknown_function", `There’s no function called “${node.name}”.`, node.pos);
    }
  }
}
