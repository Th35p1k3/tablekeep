import { describe, expect, it } from "vitest";
import { STARTER_TEMPLATE } from "@/lib/templates/starter";
import { characterItemSchema, readExportFile, templateItemSchema, versionsInOrder } from "./schema";
import { sameContent, stableStringify } from "./stable";

describe("stableStringify", () => {
  it("ignores key order and undefined values", () => {
    expect(stableStringify({ b: 1, a: [1, { y: 2, x: 1 }], c: undefined })).toBe('{"a":[1,{"x":1,"y":2}],"b":1}');
    expect(sameContent({ a: 1, b: 2 }, { b: 2, a: 1 })).toBe(true);
    expect(sameContent({ a: 1 }, { a: 2 })).toBe(false);
  });
});

describe("readExportFile", () => {
  const good = { format: "tablekeep-export", version: 1, exportedAt: "2026-10-21T00:00:00Z", templates: [], spells: [] };

  it("reads a Tablekeep export and fills in missing lists", () => {
    const r = readExportFile(JSON.stringify(good));
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.file.characters).toEqual([]);
  });

  it("explains files it can't read", () => {
    const notJson = readExportFile("{oops");
    expect(!notJson.ok && notJson.message).toContain("valid JSON");
    const other = readExportFile(JSON.stringify({ hello: "world" }));
    expect(!other.ok && other.message).toContain("isn’t a Tablekeep export");
    const future = readExportFile(JSON.stringify({ ...good, version: 99 }));
    expect(!future.ok && future.message).toContain("different version");
  });
});

describe("item checks", () => {
  it("accepts a template with versions", () => {
    const r = templateItemSchema.safeParse({
      name: "Sheet",
      versions: [{ status: "published", version_number: 1, body: STARTER_TEMPLATE }],
    });
    expect(r.success && r.data.game_system === "").toBe(true);
  });

  it("accepts a character with inventory and spells, and rejects nonsense", () => {
    const character = {
      name: "Bram",
      template: { name: "Sheet", version_number: 1, definition: STARTER_TEMPLATE },
      data: { strength: "16" },
      inventory: [{ name: "Rope", quantity: 1, weight: 1.5, notes: "" }],
      spells: [{ name: "Spark", content: {}, prepared: true }],
    };
    const r = characterItemSchema.safeParse(character);
    expect(r.success && r.data.spells[0].known).toBe(true);
    expect(characterItemSchema.safeParse({ ...character, inventory: [{ name: "", quantity: -1 }] }).success).toBe(false);
    expect(characterItemSchema.safeParse({ name: "No template" }).success).toBe(false);
  });
});

describe("versionsInOrder", () => {
  it("puts published versions oldest first and the draft last", () => {
    const order = versionsInOrder([
      { status: "draft" as const, version_number: null },
      { status: "published" as const, version_number: 2 },
      { status: "published" as const, version_number: 1 },
    ]).map((v) => v.version_number ?? "draft");
    expect(order).toEqual([1, 2, "draft"]);
  });
});
