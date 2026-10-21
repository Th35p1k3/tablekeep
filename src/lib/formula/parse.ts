import { FormulaError } from "./errors";
import { type Token, tokenize } from "./tokenize";

export const MAX_DEPTH = 32;

export type BinaryOp =
  | "+" | "-" | "*" | "/"
  | "<" | "<=" | ">" | ">=" | "==" | "!="
  | "and" | "or";

export type FormulaNode =
  | { type: "number"; value: number }
  | { type: "boolean"; value: boolean }
  | { type: "ref"; name: string; pos: number }
  | { type: "negate"; arg: FormulaNode }
  | { type: "not"; arg: FormulaNode }
  | { type: "binary"; op: BinaryOp; left: FormulaNode; right: FormulaNode; pos: number }
  | { type: "call"; name: string; args: FormulaNode[]; pos: number };

/** Every function a formula may use, and how many values each takes. */
export const FUNCTIONS: ReadonlyMap<string, { min: number; max: number; usage: string }> =
  new Map([
    ["floor", { min: 1, max: 1, usage: "floor(value) rounds down" }],
    ["ceil", { min: 1, max: 1, usage: "ceil(value) rounds up" }],
    ["round", { min: 1, max: 1, usage: "round(value) rounds to the nearest whole number" }],
    ["abs", { min: 1, max: 1, usage: "abs(value) removes a minus sign" }],
    ["min", { min: 1, max: 20, usage: "min(a, b, …) picks the smallest" }],
    ["max", { min: 1, max: 20, usage: "max(a, b, …) picks the largest" }],
    ["clamp", { min: 3, max: 3, usage: "clamp(value, lowest, highest) keeps a value in range" }],
    ["if", { min: 3, max: 3, usage: "if(condition, value if true, value if false)" }],
  ]);

const KEYWORDS = new Set(["and", "or", "not", "true", "false"]);
const COMPARISONS = new Set(["<", "<=", ">", ">=", "==", "!="]);

class Parser {
  private readonly tokens: Token[];
  private index = 0;
  private depth = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private peek(): Token {
    return this.tokens[this.index];
  }

  private next(): Token {
    return this.tokens[this.index++];
  }

  private isOp(value: string): boolean {
    const t = this.peek();
    return t.kind === "op" && t.value === value;
  }

  private isWord(value: string): boolean {
    const t = this.peek();
    return t.kind === "name" && t.value === value;
  }

  private enter(pos: number) {
    this.depth++;
    if (this.depth > MAX_DEPTH) {
      throw new FormulaError(
        "too_deep",
        "This formula has too many layers of brackets or functions inside each other.",
        pos,
      );
    }
  }

  private leave() {
    this.depth--;
  }

  parse(): FormulaNode {
    if (this.peek().kind === "end") {
      throw new FormulaError("empty", "The formula is empty.");
    }
    const node = this.parseOr();
    const t = this.peek();
    if (t.kind !== "end") {
      throw new FormulaError(
        "unexpected_token",
        `Didn’t expect ${describe(t)} here. Is an operator like + missing?`,
        t.pos,
      );
    }
    return node;
  }

  private parseOr(): FormulaNode {
    let left = this.parseAnd();
    while (this.isWord("or")) {
      const pos = this.next().pos;
      left = { type: "binary", op: "or", left, right: this.parseAnd(), pos };
    }
    return left;
  }

  private parseAnd(): FormulaNode {
    let left = this.parseNot();
    while (this.isWord("and")) {
      const pos = this.next().pos;
      left = { type: "binary", op: "and", left, right: this.parseNot(), pos };
    }
    return left;
  }

  private parseNot(): FormulaNode {
    if (this.isWord("not")) {
      const pos = this.next().pos;
      this.enter(pos);
      const arg = this.parseNot();
      this.leave();
      return { type: "not", arg };
    }
    return this.parseComparison();
  }

  private parseComparison(): FormulaNode {
    const left = this.parseAdditive();
    const t = this.peek();
    if (t.kind === "op" && COMPARISONS.has(t.value)) {
      this.next();
      const right = this.parseAdditive();
      const after = this.peek();
      if (after.kind === "op" && COMPARISONS.has(after.value)) {
        throw new FormulaError(
          "chained_comparison",
          "Compare two things at a time, joined with “and”, for example: level >= 1 and level <= 5.",
          after.pos,
        );
      }
      return { type: "binary", op: t.value as BinaryOp, left, right, pos: t.pos };
    }
    return left;
  }

  private parseAdditive(): FormulaNode {
    let left = this.parseTerm();
    for (;;) {
      const t = this.peek();
      if (t.kind === "op" && (t.value === "+" || t.value === "-")) {
        this.next();
        left = { type: "binary", op: t.value, left, right: this.parseTerm(), pos: t.pos };
      } else {
        return left;
      }
    }
  }

  private parseTerm(): FormulaNode {
    let left = this.parseUnary();
    for (;;) {
      const t = this.peek();
      if (t.kind === "op" && (t.value === "*" || t.value === "/")) {
        this.next();
        left = { type: "binary", op: t.value, left, right: this.parseUnary(), pos: t.pos };
      } else {
        return left;
      }
    }
  }

  private parseUnary(): FormulaNode {
    const t = this.peek();
    if (t.kind === "op" && (t.value === "-" || t.value === "+")) {
      this.next();
      this.enter(t.pos);
      const arg = this.parseUnary();
      this.leave();
      return t.value === "-" ? { type: "negate", arg } : arg;
    }
    return this.parsePrimary();
  }

  private parsePrimary(): FormulaNode {
    const t = this.next();

    if (t.kind === "number") return { type: "number", value: t.value };

    if (t.kind === "op" && t.value === "(") {
      this.enter(t.pos);
      const inner = this.parseOr();
      this.leave();
      this.expectClose(t.pos);
      return inner;
    }

    if (t.kind === "name") {
      if (t.value === "true") return { type: "boolean", value: true };
      if (t.value === "false") return { type: "boolean", value: false };
      if (KEYWORDS.has(t.value)) {
        throw new FormulaError(
          "unexpected_token",
          `“${t.value}” needs a value before and after it.`,
          t.pos,
        );
      }

      const fn = FUNCTIONS.get(t.value);
      if (this.isOp("(")) {
        if (!fn) {
          throw new FormulaError(
            "unknown_function",
            `There’s no function called “${t.value}”. Available: ${[...FUNCTIONS.keys()].join(", ")}.`,
            t.pos,
          );
        }
        return this.parseCall(t.value, t.pos, fn);
      }
      if (fn) {
        throw new FormulaError(
          "missing_brackets",
          `“${t.value}” is a function and needs brackets: ${fn.usage}.`,
          t.pos,
        );
      }
      return { type: "ref", name: t.value, pos: t.pos };
    }

    if (t.kind === "end") {
      throw new FormulaError(
        "unexpected_end",
        "The formula ends too soon. Is something missing at the end?",
        t.pos,
      );
    }
    throw new FormulaError(
      "unexpected_token",
      `Didn’t expect ${describe(t)} here.`,
      t.pos,
    );
  }

  private parseCall(
    name: string,
    pos: number,
    fn: { min: number; max: number; usage: string },
  ): FormulaNode {
    const open = this.next(); // "("
    this.enter(open.pos);
    const args: FormulaNode[] = [];
    if (!this.isOp(")")) {
      args.push(this.parseOr());
      while (this.isOp(",")) {
        this.next();
        args.push(this.parseOr());
      }
    }
    this.leave();
    this.expectClose(open.pos);

    if (args.length < fn.min || args.length > fn.max) {
      throw new FormulaError(
        "wrong_argument_count",
        `${name} was given ${args.length} value${args.length === 1 ? "" : "s"}. Usage: ${fn.usage}.`,
        pos,
      );
    }
    return { type: "call", name, args, pos };
  }

  private expectClose(openPos: number) {
    const t = this.next();
    if (t.kind === "op" && t.value === ")") return;
    if (t.kind === "end") {
      throw new FormulaError("unexpected_end", "A “(” is missing its closing “)”.", openPos);
    }
    throw new FormulaError(
      "unexpected_token",
      `Expected “)” or “,” but found ${describe(t)}.`,
      t.pos,
    );
  }
}

function describe(t: Token): string {
  switch (t.kind) {
    case "number":
      return `the number ${t.value}`;
    case "name":
      return `“${t.value}”`;
    case "op":
      return `“${t.value}”`;
    default:
      return "the end of the formula";
  }
}

/** Turns formula text into a tree, or throws a FormulaError. */
export function parse(source: string): FormulaNode {
  return new Parser(tokenize(source)).parse();
}

/** Every field name a formula refers to, in first-seen order. */
export function references(node: FormulaNode): string[] {
  const seen = new Set<string>();
  const walk = (n: FormulaNode) => {
    switch (n.type) {
      case "ref":
        seen.add(n.name);
        break;
      case "negate":
      case "not":
        walk(n.arg);
        break;
      case "binary":
        walk(n.left);
        walk(n.right);
        break;
      case "call":
        n.args.forEach(walk);
        break;
    }
  };
  walk(node);
  return [...seen];
}
