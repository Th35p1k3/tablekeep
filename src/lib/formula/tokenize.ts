import { FormulaError } from "./errors";

export const MAX_FORMULA_LENGTH = 500;
export const MAX_TOKENS = 200;

export type Token =
  | { kind: "number"; value: number; pos: number }
  | { kind: "name"; value: string; pos: number }
  | { kind: "op"; value: string; pos: number }
  | { kind: "end"; pos: number };

const TWO_CHAR_OPS = new Set(["<=", ">=", "==", "!="]);
const ONE_CHAR_OPS = new Set(["+", "-", "*", "/", "(", ")", ",", "<", ">"]);

const isDigit = (c: string) => c >= "0" && c <= "9";
const isNameStart = (c: string) =>
  (c >= "a" && c <= "z") || (c >= "A" && c <= "Z") || c === "_";
const isNameChar = (c: string) => isNameStart(c) || isDigit(c);

/** Splits a formula into numbers, names and operators. */
export function tokenize(source: string): Token[] {
  if (source.length > MAX_FORMULA_LENGTH) {
    throw new FormulaError(
      "too_long",
      `Formulas can be at most ${MAX_FORMULA_LENGTH} characters long.`,
    );
  }

  const tokens: Token[] = [];
  let i = 0;

  while (i < source.length) {
    const c = source[i];

    if (c === " " || c === "\t" || c === "\n" || c === "\r") {
      i++;
      continue;
    }

    if (isDigit(c) || (c === "." && isDigit(source[i + 1] ?? ""))) {
      const start = i;
      while (isDigit(source[i] ?? "")) i++;
      if (source[i] === "." && isDigit(source[i + 1] ?? "")) {
        i++;
        while (isDigit(source[i] ?? "")) i++;
      }
      tokens.push({ kind: "number", value: Number(source.slice(start, i)), pos: start });
      continue;
    }

    if (isNameStart(c)) {
      const start = i;
      while (isNameChar(source[i] ?? "")) i++;
      // One optional ".property", used for resources: hit_points.max
      if (source[i] === "." && isNameStart(source[i + 1] ?? "")) {
        i++;
        while (isNameChar(source[i] ?? "")) i++;
      }
      tokens.push({ kind: "name", value: source.slice(start, i), pos: start });
      continue;
    }

    const two = source.slice(i, i + 2);
    if (TWO_CHAR_OPS.has(two)) {
      tokens.push({ kind: "op", value: two, pos: i });
      i += 2;
      continue;
    }
    if (two === "&&" || two === "||") {
      throw new FormulaError(
        "unexpected_character",
        `Use the word “${two === "&&" ? "and" : "or"}” instead of “${two}”.`,
        i,
      );
    }
    if (ONE_CHAR_OPS.has(c)) {
      tokens.push({ kind: "op", value: c, pos: i });
      i++;
      continue;
    }
    if (c === "=") {
      throw new FormulaError(
        "unexpected_character",
        "To compare two values use “==” (two equals signs).",
        i,
      );
    }
    if (c === "!") {
      throw new FormulaError(
        "unexpected_character",
        "Use the word “not” instead of “!”.",
        i,
      );
    }
    throw new FormulaError(
      "unexpected_character",
      `“${c}” isn’t allowed in a formula.`,
      i,
    );
  }

  if (tokens.length > MAX_TOKENS) {
    throw new FormulaError(
      "too_complex",
      "This formula is too complicated. Try splitting it into smaller calculated fields.",
    );
  }
  tokens.push({ kind: "end", pos: source.length });
  return tokens;
}
