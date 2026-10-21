import { describe, expect, it } from "vitest";
import { computeSheet, formatValue } from "./compute";
import type { TemplateDefinition } from "./schema";
import { STARTER_TEMPLATE } from "./starter";
import { validateTemplate } from "./validate";

/** A tiny template with one section, for focused tests. */
function sheet(fields: unknown[]): unknown {
  return { formatVersion: 1, sections: [{ id: "s1", title: "Main", fields }] };
}

function messages(input: unknown): string[] {
  const r = validateTemplate(input);
  return r.ok ? [] : r.issues.map((i) => i.message);
}

describe("validateTemplate", () => {
  it("accepts the starter template", () => {
    const r = validateTemplate(STARTER_TEMPLATE);
    if (!r.ok) throw new Error(r.issues.map((i) => i.message).join("\n"));
    expect(r.ok).toBe(true);
  });

  it("requires at least one section", () => {
    expect(validateTemplate({ formatVersion: 1, sections: [] }).ok).toBe(false);
  });

  it("rejects badly formed short names", () => {
    for (const key of ["Strength", "1st", "has space", "a-b", "x".repeat(41)]) {
      expect(messages(sheet([{ id: "f1", key, label: "X", type: "number" }])).length).toBeGreaterThan(0);
    }
  });

  it("rejects reserved short names", () => {
    for (const key of ["and", "floor", "if", "true", "constructor"]) {
      expect(messages(sheet([{ id: "f1", key, label: "X", type: "number" }])).join(" ")).toContain("reserved");
    }
  });

  it("rejects duplicate short names", () => {
    const m = messages(
      sheet([
        { id: "f1", key: "level", label: "Level", type: "number" },
        { id: "f2", key: "level", label: "Level again", type: "number" },
      ]),
    );
    expect(m.join(" ")).toContain("already used");
  });

  it("rejects duplicate internal ids", () => {
    const m = messages(
      sheet([
        { id: "same", key: "a", label: "A", type: "number" },
        { id: "same", key: "b", label: "B", type: "number" },
      ]),
    );
    expect(m.join(" ")).toContain("same internal id");
  });

  it("rejects formulas with spelling mistakes", () => {
    const m = messages(sheet([{ id: "f1", key: "a", label: "A", type: "calculated", formula: "1 +" }]));
    expect(m[0]).toContain("“Main” › “A”");
  });

  it("rejects formulas that use missing fields", () => {
    const m = messages(sheet([{ id: "f1", key: "a", label: "A", type: "calculated", formula: "strenght * 2" }]));
    expect(m.join(" ")).toContain("“strenght”");
  });

  it("rejects text and choice fields inside formulas", () => {
    const m = messages(
      sheet([
        { id: "f1", key: "name", label: "Name", type: "text" },
        { id: "f2", key: "size", label: "Size", type: "choice", options: ["Small", "Large"] },
        { id: "f3", key: "a", label: "A", type: "calculated", formula: "name + size" },
      ]),
    );
    expect(m.length).toBe(2);
  });

  it("rejects .max on fields that aren't resources", () => {
    const m = messages(
      sheet([
        { id: "f1", key: "level", label: "Level", type: "number" },
        { id: "f2", key: "a", label: "A", type: "calculated", formula: "level.max" },
      ]),
    );
    expect(m.join(" ")).toContain("Only resources");
  });

  it("finds a field that uses itself", () => {
    const m = messages(sheet([{ id: "f1", key: "a", label: "A", type: "calculated", formula: "a + 1" }]));
    expect(m.join(" ")).toContain("uses itself");
  });

  it("finds fields that depend on each other in a circle", () => {
    const m = messages(
      sheet([
        { id: "f1", key: "a", label: "A", type: "calculated", formula: "b + 1" },
        { id: "f2", key: "b", label: "B", type: "calculated", formula: "c + 1" },
        { id: "f3", key: "c", label: "C", type: "calculated", formula: "a + 1" },
      ]),
    );
    expect(m.length).toBe(1);
    expect(m[0]).toContain("circle");
  });

  it("checks choice options and defaults", () => {
    expect(
      messages(sheet([{ id: "f1", key: "s", label: "S", type: "choice", options: ["A", "a"] }])).join(" "),
    ).toContain("different");
    expect(
      messages(sheet([{ id: "f1", key: "s", label: "S", type: "choice", options: ["A"], default: "B" }])).join(" "),
    ).toContain("one of the options");
  });

  it("checks number minimum and maximum", () => {
    expect(
      messages(sheet([{ id: "f1", key: "n", label: "N", type: "number", min: 5, max: 1 }])).join(" "),
    ).toContain("minimum is larger");
  });

  it("rejects unknown field types", () => {
    expect(validateTemplate(sheet([{ id: "f1", key: "n", label: "N", type: "script" }])).ok).toBe(false);
  });
});

describe("computeSheet with the starter template", () => {
  it("calculates defaults", () => {
    const r = computeSheet(STARTER_TEMPLATE, {});
    expect(r.errors.size).toBe(0);
    expect(r.values.get("strength_mod")).toBe(0);
    expect(r.values.get("proficiency")).toBe(2);
    expect(r.values.get("defense")).toBe(10);
    expect(r.maxima.get("hit_points")).toBe(8);
    expect(r.values.get("hit_points")).toBe(8);
    expect(r.values.get("bloodied")).toBe(false);
  });

  it("updates when values change", () => {
    const r = computeSheet(STARTER_TEMPLATE, {
      level: 5,
      dexterity: 16,
      constitution: 14,
      armor_bonus: 2,
      has_shield: true,
      hit_points: 10,
    });
    expect(r.values.get("dexterity_mod")).toBe(3);
    expect(r.values.get("proficiency")).toBe(3);
    expect(r.values.get("defense")).toBe(17);
    // 8 + 2 + 4 * (5 + 2) = 38
    expect(r.maxima.get("hit_points")).toBe(38);
    expect(r.values.get("hit_points")).toBe(10);
    expect(r.values.get("bloodied")).toBe(true);
  });

  it("accepts numbers typed as text and ignores junk", () => {
    const r = computeSheet(STARTER_TEMPLATE, { strength: "18", dexterity: "abc" });
    expect(r.values.get("strength_mod")).toBe(4);
    expect(r.values.get("dexterity_mod")).toBe(0);
  });

  it("ignores input named after built-in properties", () => {
    const r = computeSheet(STARTER_TEMPLATE, JSON.parse('{"__proto__": {"strength": 30}}'));
    expect(r.values.get("strength")).toBe(10);
  });
});

describe("computeSheet problems stay contained", () => {
  const broken = {
    formatVersion: 1,
    sections: [
      {
        id: "s1",
        title: "Main",
        fields: [
          { id: "f1", key: "level", label: "Level", type: "number", default: 0 },
          { id: "f2", key: "per_level", label: "Per level", type: "calculated", formula: "10 / level", format: "number" },
          { id: "f3", key: "uses_it", label: "Uses it", type: "calculated", formula: "per_level + 1", format: "number" },
          { id: "f4", key: "fine", label: "Fine", type: "calculated", formula: "level + 1", format: "number" },
          { id: "f5", key: "a", label: "A", type: "calculated", formula: "b", format: "number" },
          { id: "f6", key: "b", label: "B", type: "calculated", formula: "a", format: "number" },
        ],
      },
    ],
  } as TemplateDefinition;

  it("reports divide by zero only where it happens and on fields that use it", () => {
    const r = computeSheet(broken, {});
    expect(r.errors.get("per_level")).toContain("divides by zero");
    expect(r.errors.get("uses_it")).toContain("Per level");
    expect(r.values.get("fine")).toBe(1);
  });

  it("reports circles instead of freezing", () => {
    const r = computeSheet(broken, {});
    expect(r.errors.has("a") || r.errors.has("b")).toBe(true);
  });
});

describe("formatValue", () => {
  const cases: Array<[number | boolean | undefined, "number" | "modifier", string]> = [
    [2, "modifier", "+2"],
    [0, "modifier", "+0"],
    [-1, "modifier", "-1"],
    [7, "number", "7"],
    [3.333333, "number", "3.33"],
    [2.5, "number", "2.5"],
    [true, "number", "Yes"],
    [false, "number", "No"],
    [undefined, "number", "—"],
  ];
  it.each(cases)("%s as %s shows %s", (value, format, expected) => {
    expect(formatValue(value, format)).toBe(expected);
  });
});
