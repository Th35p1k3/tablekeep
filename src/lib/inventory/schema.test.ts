import { describe, expect, it } from "vitest";
import { inventoryItemSchema, totalWeight } from "./schema";

describe("inventoryItemSchema", () => {
  it("accepts form text and tidies it", () => {
    const r = inventoryItemSchema.safeParse({ name: "  Rope ", quantity: "2", weight: "1.256", notes: "" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data).toEqual({ name: "Rope", quantity: 2, weight: 1.26, notes: "" });
  });

  it("treats a blank weight as no weight", () => {
    const r = inventoryItemSchema.safeParse({ name: "Map", quantity: "1", weight: "", notes: "" });
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.weight).toBeNull();
  });

  it("rejects bad values", () => {
    expect(inventoryItemSchema.safeParse({ name: "", quantity: "1", weight: "", notes: "" }).success).toBe(false);
    expect(inventoryItemSchema.safeParse({ name: "X", quantity: "-1", weight: "", notes: "" }).success).toBe(false);
    expect(inventoryItemSchema.safeParse({ name: "X", quantity: "1.5", weight: "", notes: "" }).success).toBe(false);
    expect(inventoryItemSchema.safeParse({ name: "X", quantity: "1", weight: "heavy", notes: "" }).success).toBe(false);
  });
});

describe("totalWeight", () => {
  it("multiplies by quantity and skips unweighed items", () => {
    expect(
      totalWeight([
        { id: "1", name: "Rope", quantity: 2, weight: 1.5, notes: "" },
        { id: "2", name: "Map", quantity: 1, weight: null, notes: "" },
        { id: "3", name: "Coins", quantity: 50, weight: 0.02, notes: "" },
      ]),
    ).toBe(4);
  });
});
