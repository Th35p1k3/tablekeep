import { describe, expect, it } from "vitest";
import {
  allKeys,
  blankTemplate,
  coerceDefinition,
  moveItem,
  newField,
  numericKeys,
  slugify,
  uniqueKey,
  withType,
} from "./editing";
import { STARTER_TEMPLATE } from "./starter";
import { FIELD_TYPE_LABEL, type FieldType, fieldSchema } from "./schema";
import { validateTemplate } from "./validate";

describe("slugify", () => {
  it.each([
    ["Armor Class", "armor_class"],
    ["  Hit Points (max) ", "hit_points_max"],
    ["Strength!!", "strength"],
    ["1st level slots", "f_1st_level_slots"],
    ["", "field"],
    ["???", "field"],
    ["Floor", "floor_value"],
    ["IF", "if_value"],
    ["Ünïcode name", "n_code_name"],
  ])("%j becomes %j", (label, key) => {
    expect(slugify(label)).toBe(key);
  });

  it("never produces names longer than 40 characters", () => {
    expect(slugify("a very long label ".repeat(10)).length).toBeLessThan(41);
  });
});

describe("uniqueKey", () => {
  it("adds numbers until the name is free", () => {
    expect(uniqueKey("level", new Set())).toBe("level");
    expect(uniqueKey("level", new Set(["level"]))).toBe("level_2");
    expect(uniqueKey("level", new Set(["level", "level_2"]))).toBe("level_3");
  });

  it("stays within 40 characters", () => {
    const long = "x".repeat(40);
    expect(uniqueKey(long, new Set([long])).length).toBe(40);
  });
});

describe("newField and withType", () => {
  const types = Object.keys(FIELD_TYPE_LABEL) as FieldType[];

  it.each(types.map((t) => [t]))("a new %s field is valid", (type) => {
    const field = newField(type, new Set());
    expect(fieldSchema.safeParse(field).success).toBe(true);
  });

  it("changing type keeps the name, label and help", () => {
    const changed = withType({ id: "f1", key: "speed", label: "Speed", help: "Feet per turn" }, "calculated");
    expect(changed).toEqual({
      id: "f1",
      key: "speed",
      label: "Speed",
      help: "Feet per turn",
      type: "calculated",
      formula: "0",
      format: "number",
    });
  });

  it("new fields avoid names already taken", () => {
    const first = newField("number", new Set());
    const second = newField("number", new Set([first.key]));
    expect(second.key).not.toBe(first.key);
  });
});

describe("moveItem", () => {
  it("moves items up and down", () => {
    expect(moveItem(["a", "b", "c"], 1, -1)).toEqual(["b", "a", "c"]);
    expect(moveItem(["a", "b", "c"], 1, 1)).toEqual(["a", "c", "b"]);
  });

  it("ignores moves past the ends", () => {
    expect(moveItem(["a", "b"], 0, -1)).toEqual(["a", "b"]);
    expect(moveItem(["a", "b"], 1, 1)).toEqual(["a", "b"]);
  });
});

describe("template helpers", () => {
  it("a blank template is valid", () => {
    expect(validateTemplate(blankTemplate()).ok).toBe(true);
  });

  it("lists every short name and the formula-friendly ones", () => {
    expect(allKeys(STARTER_TEMPLATE).has("backstory")).toBe(true);
    const numeric = numericKeys(STARTER_TEMPLATE);
    expect(numeric).toContain("hit_points.max");
    expect(numeric).not.toContain("backstory");
  });

  it("coerceDefinition keeps good data and replaces garbage", () => {
    expect(coerceDefinition(STARTER_TEMPLATE).sections).toHaveLength(4);
    expect(coerceDefinition(null).sections).toHaveLength(1);
    expect(coerceDefinition({ sections: "nope" }).sections).toHaveLength(1);
    expect(coerceDefinition({ sections: [{ title: "x" }] }).sections[0].title).toBe("Main");
  });
});
