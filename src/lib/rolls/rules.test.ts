import { describe, expect, it } from "vitest";
import { STARTER_TEMPLATE } from "@/lib/templates/starter";
import { describeRoll, friendlyRollError, parseSimpleDice, resolveModifier, rollRequestSchema } from "./rules";

describe("parseSimpleDice", () => {
  it.each([
    ["1d20", { count: 1, sides: 20 }],
    ["d20", { count: 1, sides: 20 }],
    [" 2D6 ", { count: 2, sides: 6 }],
    ["20d100", { count: 20, sides: 100 }],
  ])("%j", (text, expected) => {
    expect(parseSimpleDice(text)).toEqual(expected);
  });

  it.each([["21d6"], ["1d1"], ["1d101"], ["2d6+3"], ["abc"], [""]])("%j is refused", (text) => {
    expect(parseSimpleDice(text)).toBeNull();
  });
});

describe("rollRequestSchema", () => {
  const base = { label: "Perception", dice: "1d20", bonus: "", modifierField: "wisdom_mod", keep: "normal", share: false };

  it("accepts a typical request", () => {
    const r = rollRequestSchema.safeParse(base);
    expect(r.success && r.data.bonus === 0).toBe(true);
  });

  it("accepts signed bonuses and blank modifiers", () => {
    expect(rollRequestSchema.safeParse({ ...base, bonus: "-2", modifierField: "" }).success).toBe(true);
    expect(rollRequestSchema.safeParse({ ...base, bonus: "+5" }).success).toBe(true);
  });

  it("rejects bad input", () => {
    expect(rollRequestSchema.safeParse({ ...base, label: " " }).success).toBe(false);
    expect(rollRequestSchema.safeParse({ ...base, dice: "1d20+5" }).success).toBe(false);
    expect(rollRequestSchema.safeParse({ ...base, bonus: "1.5" }).success).toBe(false);
    expect(rollRequestSchema.safeParse({ ...base, modifierField: "Wisdom Mod" }).success).toBe(false);
    expect(rollRequestSchema.safeParse({ ...base, keep: "best" }).success).toBe(false);
  });
});

describe("resolveModifier", () => {
  it("reads calculated modifiers from the sheet", () => {
    expect(resolveModifier(STARTER_TEMPLATE, { wisdom: 16 }, "wisdom_mod")).toEqual({ value: 3, label: "wisdom_mod" });
    expect(resolveModifier(STARTER_TEMPLATE, { level: 9 }, "proficiency")).toEqual({ value: 4, label: "proficiency" });
  });

  it("treats checkboxes as 1 or 0", () => {
    expect(resolveModifier(STARTER_TEMPLATE, { has_shield: true }, "has_shield").value).toBe(1);
  });

  it("uses 0 and says why when the field is missing", () => {
    expect(resolveModifier(STARTER_TEMPLATE, {}, "charisma_mod")).toEqual({ value: 0, label: "charisma_mod isn’t on your sheet" });
    expect(resolveModifier(STARTER_TEMPLATE, {}, "name").value).toBe(0);
  });
});

describe("describeRoll", () => {
  it("explains app rolls", () => {
    expect(
      describeRoll({ method: "app", dice: [14], dice_other: null, modifier: 3, modifier_label: "wisdom_mod", total: 19, bonus: 2 }),
    ).toBe("14 + 2 + 3 (wisdom_mod) = 19");
    expect(
      describeRoll({ method: "app", dice: [18], dice_other: [4], modifier: -1, modifier_label: "", total: 17, bonus: 0 }),
    ).toBe("18 − 1 = 17; other roll 4");
  });

  it("explains table rolls", () => {
    expect(describeRoll({ method: "manual", dice: null, dice_other: null, modifier: 0, modifier_label: "", total: 12, bonus: 0 })).toBe(
      "12 (rolled at the table)",
    );
  });

  it("explains errors", () => {
    expect(friendlyRollError({ message: "already_rolled" })).toContain("already rolled");
  });
});
