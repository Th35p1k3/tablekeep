export type FormulaErrorCode =
  | "empty"
  | "too_long"
  | "too_complex"
  | "too_deep"
  | "unexpected_character"
  | "unexpected_token"
  | "unexpected_end"
  | "chained_comparison"
  | "unknown_function"
  | "missing_brackets"
  | "wrong_argument_count"
  | "unknown_field"
  | "unknown_property"
  | "not_a_number_field"
  | "depends_on_error"
  | "circular"
  | "divide_by_zero"
  | "not_finite";

/** A problem with a formula, with a message written for non-programmers. */
export class FormulaError extends Error {
  readonly code: FormulaErrorCode;
  readonly position: number | undefined;

  constructor(code: FormulaErrorCode, message: string, position?: number) {
    super(message);
    this.name = "FormulaError";
    this.code = code;
    this.position = position;
  }
}
