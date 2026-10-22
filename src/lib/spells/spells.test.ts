import { describe, expect, it } from "vitest";
import { checkDice } from "./dice";
import {
  EFFECT_LABEL,
  type EffectType,
  blankSpell,
  coerceSpell,
  copyEffect,
  effectSchema,
  newEffect,
  validateSpell,
} from "./schema";

describe("checkDice", () => {
  it.each([
    ["2d6", "2d6", 2, 12, 7],
    ["d20", "1d20", 1, 20, 10.5],
    ["1d8 + 3", "1d8 + 3", 4, 11, 7.5],
    ["2D6+1d4-1", "2d6 + 1d4 - 1", 2, 15, 8.5],
    ["  4d10  ", "4d10", 4, 40, 22],
    ["5", "5", 5, 5, 5],
    ["-1 + 1d4", "-1 + 1d4", 0, 3, 1.5],
  ])("%j is %j (min %s, max %s, average %s)", (input, normalized, min, max, average) => {
    const r = checkDice(input);
    expect(r).toEqual({ ok: true, normalized, min, max, average });
  });

  it("accepts modifier names without a range", () => {
    const r = checkDice("1d8 + spell_mod");
    expect(r).toEqual({ ok: true, normalized: "1d8 + spell_mod", min: null, max: null, average: null });
  });

  it.each([
    [""],
    ["2d"],
    ["2d6 +"],
    ["2d6 ++ 3"],
    ["0d6"],
    ["101d6"],
    ["1d1"],
    ["1d1001"],
    ["2d6 * 2"],
    ["1d6; drop table"],
    ["5000"],
    ["1d4+1d4+1d4+1d4+1d4+1d4+1d4+1d4+1d4+1d4+1d4"],
  ])("%j is refused", (input) => {
    expect(checkDice(input).ok).toBe(false);
  });
});

describe("spell content", () => {
  it("a blank spell has a valid layout but needs a description to publish", () => {
    const r = validateSpell(blankSpell());
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.issues.map((i) => i.path)).toEqual(["description"]);
  });

  it("a complete spell passes", () => {
    const spell = {
      ...blankSpell(),
      level: 3,
      category: "Evocation",
      description: "A bright streak blossoms into a blast of flame.",
      effects: [
        { id: "e1", type: "damage", dice: "8d6", damageType: "fire" },
        { id: "e2", type: "save", ability: "Dexterity", onSuccess: "half" },
        { id: "e3", type: "area", shape: "sphere", size: "20-foot radius" },
      ],
    };
    expect(validateSpell(spell).ok).toBe(true);
  });

  it("reports bad dice and empty required effect fields", () => {
    const r = validateSpell({
      ...blankSpell(),
      description: "Test",
      effects: [
        { id: "e1", type: "damage", dice: "2d", damageType: "" },
        { id: "e2", type: "condition", condition: " ", duration: "" },
      ],
    });
    expect(r.ok).toBe(false);
    if (!r.ok) {
      expect(r.issues).toHaveLength(2);
      expect(r.issues[0].message).toContain("Effect 1 (Damage)");
    }
  });

  it("rejects unknown effect types and out-of-range levels", () => {
    expect(validateSpell({ ...blankSpell(), description: "x", effects: [{ id: "e", type: "script" }] }).ok).toBe(false);
    expect(validateSpell({ ...blankSpell(), description: "x", level: 99 }).ok).toBe(false);
  });

  it("requires labels on custom properties", () => {
    const r = validateSpell({
      ...blankSpell(),
      description: "x",
      customProperties: [{ id: "p1", label: "", value: "5" }],
    });
    expect(r.ok).toBe(false);
  });

  it.each((Object.keys(EFFECT_LABEL) as EffectType[]).map((t) => [t]))(
    "a new %s block has a valid layout",
    (type) => {
      expect(effectSchema.safeParse(newEffect(type)).success).toBe(true);
    },
  );

  it("copies get a new id", () => {
    const e = newEffect("damage");
    const c = copyEffect(e);
    expect(c.id).not.toBe(e.id);
    expect({ ...c, id: e.id }).toEqual(e);
  });

  it("coerceSpell keeps good data and replaces garbage", () => {
    expect(coerceSpell(null)).toEqual(blankSpell());
    expect(coerceSpell({ description: "Kept" }).description).toBe("Kept");
    const good = { ...blankSpell(), description: "Fine" };
    expect(coerceSpell(good)).toEqual(good);
  });
});
