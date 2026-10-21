import { describe, expect, it } from "vitest";
import { type FormulaValue, calculate, parseFormula } from "./index";

/** Calculates and returns the value, failing the test on any error. */
function value(source: string, values: Record<string, FormulaValue> = {}) {
  const r = calculate(source, values);
  if (!r.ok) throw new Error(`Unexpected error for ${source}: ${r.error.message}`);
  return r.value;
}

/** Returns the error code a formula produces. */
function errorCode(source: string, values: Record<string, FormulaValue> = {}) {
  const r = calculate(source, values);
  return r.ok ? "no error" : r.error.code;
}

describe("numbers and arithmetic", () => {
  it.each([
    ["1 + 2", 3],
    ["10 - 4 - 3", 3],
    ["2 * 3 + 4", 10],
    ["2 + 3 * 4", 14],
    ["(2 + 3) * 4", 20],
    ["20 / 4 / 5", 1],
    ["7 / 2", 3.5],
    ["-5 + 2", -3],
    ["--5", 5],
    ["+3", 3],
    ["-(2 + 3)", -5],
    ["2 * -3", -6],
    [".5 + .25", 0.75],
    ["  1+1  ", 2],
    ["((((4))))", 4],
  ])("%s = %s", (source, expected) => {
    expect(value(source)).toBe(expected);
  });
});

describe("fields", () => {
  it("uses field values", () => {
    expect(value("floor((strength - 10) / 2)", { strength: 15 })).toBe(2);
    expect(value("floor((strength - 10) / 2)", { strength: 7 })).toBe(-2);
  });

  it("allows .max and .current names", () => {
    expect(value("hit_points.max - hit_points.current", { "hit_points.max": 20, "hit_points.current": 5 })).toBe(15);
  });

  it("treats checkboxes as 1 or 0 in arithmetic", () => {
    expect(value("armor + shield * 2", { armor: 3, shield: true })).toBe(5);
    expect(value("armor + shield * 2", { armor: 3, shield: false })).toBe(3);
  });

  it("reports unknown fields", () => {
    expect(errorCode("strenght + 1", { strength: 10 })).toBe("unknown_field");
  });

  it("never reaches built-in JavaScript properties", () => {
    for (const name of ["constructor", "__proto__", "toString", "prototype", "valueOf"]) {
      expect(errorCode(`${name} + 1`)).toBe("unknown_field");
    }
  });
});

describe("comparisons and logic", () => {
  it.each([
    ["3 > 2", true],
    ["3 < 2", false],
    ["2 >= 2", true],
    ["2 <= 1", false],
    ["2 == 2", true],
    ["2 != 2", false],
    ["1 < 2 and 2 < 3", true],
    ["1 > 2 or 2 < 3", true],
    ["not (1 > 2)", true],
    ["not true", false],
    ["true and false", false],
    ["1 + 1 == 2", true],
  ])("%s is %s", (source, expected) => {
    expect(value(source)).toBe(expected);
  });

  it("rejects chained comparisons with a helpful message", () => {
    expect(errorCode("1 < 2 < 3")).toBe("chained_comparison");
  });
});

describe("functions", () => {
  it.each([
    ["floor(2.7)", 2],
    ["floor(-2.5)", -3],
    ["ceil(2.1)", 3],
    ["round(2.5)", 3],
    ["round(2.4)", 2],
    ["abs(-4)", 4],
    ["min(5, 3, 9)", 3],
    ["max(5, 3, 9)", 9],
    ["max(7)", 7],
    ["clamp(15, 0, 10)", 10],
    ["clamp(-3, 0, 10)", 0],
    ["clamp(5, 10, 0)", 5],
    ["if(1 > 0, 10, 20)", 10],
    ["if(0, 10, 20)", 20],
    ["max(1, 8 + floor((12 - 10) / 2))", 9],
  ])("%s = %s", (source, expected) => {
    expect(value(source)).toBe(expected);
  });

  it("only calculates the branch of if() that is used", () => {
    expect(value("if(level > 0, 10 / level, 1 / 0)", { level: 2 })).toBe(5);
  });

  it("rejects unknown functions", () => {
    expect(errorCode("sqrt(4)")).toBe("unknown_function");
  });

  it("rejects the wrong number of values", () => {
    expect(errorCode("floor(1, 2)")).toBe("wrong_argument_count");
    expect(errorCode("if(1, 2)")).toBe("wrong_argument_count");
    expect(errorCode("min()")).toBe("wrong_argument_count");
  });

  it("explains when brackets are missing", () => {
    expect(errorCode("floor + 1")).toBe("missing_brackets");
  });
});

describe("mistakes get friendly errors", () => {
  it.each([
    ["", "empty"],
    ["   ", "empty"],
    ["1 +", "unexpected_end"],
    ["(1 + 2", "unexpected_end"],
    ["1 + 2)", "unexpected_token"],
    ["1 2", "unexpected_token"],
    ["level level", "unexpected_token"],
    ["1 = 1", "unexpected_character"],
    ["1 && 1", "unexpected_character"],
    ["!1", "unexpected_character"],
    ["5 % 2", "unexpected_character"],
    ["and 1", "unexpected_token"],
    ["1 / 0", "divide_by_zero"],
    ["10 / (5 - 5)", "divide_by_zero"],
  ])("%j gives %s", (source, code) => {
    expect(errorCode(source)).toBe(code);
  });

  it("messages are plain sentences", () => {
    const r = calculate("1 = 1");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error.message).toContain("==");
  });
});

describe("hostile input is rejected safely", () => {
  it.each([
    ["process.exit()", "unknown_function"],
    ["alert(1)", "unknown_function"],
    ["constructor.constructor(\"return 1\")", "unexpected_character"],
    ["`1`", "unexpected_character"],
    ["a[0]", "unexpected_character"],
    ["x => x", "unexpected_character"],
    ["1; 2", "unexpected_character"],
    ["{}", "unexpected_character"],
    ["eval(\"1\")", "unexpected_character"],
    ["this", "unknown_field"],
    ["window.location", "unknown_field"],
    ["1e999", "unexpected_token"],
  ])("%j is refused (%s)", (source, code) => {
    expect(errorCode(source)).toBe(code);
  });

  it("refuses formulas that are too long", () => {
    expect(errorCode("1 + ".repeat(200) + "1")).toBe("too_long");
  });

  it("refuses too many pieces", () => {
    expect(errorCode("1+".repeat(110) + "1")).toBe("too_complex");
  });

  it("refuses too much nesting", () => {
    expect(errorCode("(".repeat(40) + "1" + ")".repeat(40))).toBe("too_deep");
    expect(errorCode("-".repeat(40) + "1")).toBe("too_deep");
  });

  it("refuses results that are too large", () => {
    const big = "99999999999999999999";
    expect(errorCode(`${big} * ${big} * ${big} * ${big} * ${big} * ${big} * ${big} * ${big} * ${big} * ${big} * ${big} * ${big} * ${big} * ${big} * ${big} * ${big}`)).toBe("not_finite");
  });
});

describe("parseFormula", () => {
  it("lists the fields a formula uses", () => {
    const r = parseFormula("10 + dexterity_mod + if(has_shield, 2, 0) + dexterity_mod + hp.max");
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.references).toEqual(["dexterity_mod", "has_shield", "hp.max"]);
  });
});
