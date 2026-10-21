import { describe, expect, it } from "vitest";
import { STARTER_TEMPLATE } from "@/lib/templates/starter";
import { characterDataSchema, characterNameSchema, refillResources, resourceKeys } from "./data";
import { friendlyCharacterError } from "./errors";

describe("characterDataSchema", () => {
  it("accepts typical sheet values", () => {
    expect(
      characterDataSchema.safeParse({ name: "Mira", strength: "16", has_shield: true, hit_points: 7, notes: null })
        .success,
    ).toBe(true);
  });

  it("rejects odd names, nested values and huge text", () => {
    expect(characterDataSchema.safeParse({ "Bad Key": 1 }).success).toBe(false);
    expect(characterDataSchema.safeParse({ stats: { strength: 10 } }).success).toBe(false);
    expect(characterDataSchema.safeParse({ notes: "x".repeat(5001) }).success).toBe(false);
    expect(characterDataSchema.safeParse(["not", "an", "object"]).success).toBe(false);
  });

  it("limits how many values a character can have", () => {
    const many = Object.fromEntries(Array.from({ length: 401 }, (_, i) => [`k${i}`, i]));
    expect(characterDataSchema.safeParse(many).success).toBe(false);
  });
});

describe("characterNameSchema", () => {
  it("trims and requires a name", () => {
    expect(characterNameSchema.safeParse("  Mira  ").success).toBe(true);
    expect(characterNameSchema.safeParse("   ").success).toBe(false);
  });
});

describe("refilling resources", () => {
  it("finds resource fields", () => {
    expect(resourceKeys(STARTER_TEMPLATE)).toEqual(["hit_points"]);
  });

  it("refills one resource to its maximum", () => {
    const data = { level: 3, constitution: 14, hit_points: "2" };
    const next = refillResources(STARTER_TEMPLATE, data, "hit_points");
    // 8 + 2 + 2 * (5 + 2) = 24
    expect(next.hit_points).toBe(24);
    expect(next.level).toBe(3);
    expect(data.hit_points).toBe("2");
  });

  it("refills everything when no field is named", () => {
    expect(refillResources(STARTER_TEMPLATE, { hit_points: 1 }).hit_points).toBe(8);
  });

  it("ignores a name that isn't a resource", () => {
    expect(refillResources(STARTER_TEMPLATE, { hit_points: 1 }, "level").hit_points).toBe(1);
  });
});

describe("friendlyCharacterError", () => {
  it("translates known codes and falls back politely", () => {
    expect(friendlyCharacterError({ message: "not_published" })).toContain("Publish");
    expect(friendlyCharacterError({ message: "weird" })).toContain("Something went wrong");
  });
});
