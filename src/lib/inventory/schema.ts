import { z } from "zod";

export type InventoryItem = {
  id: string;
  name: string;
  quantity: number;
  weight: number | null;
  notes: string;
};

export const inventoryItemSchema = z.object({
  name: z.string().trim().min(1, "Give the item a name.").max(80, "Keep item names to 80 characters or fewer."),
  quantity: z.coerce
    .number({ message: "Enter a quantity." })
    .int("Use a whole number.")
    .min(0, "Quantity can’t be negative.")
    .max(1_000_000, "That’s a lot of items. Use 1,000,000 or fewer."),
  weight: z
    .union([z.literal(""), z.coerce.number({ message: "Enter a weight or leave it blank." }).min(0, "Weight can’t be negative.").max(100_000)])
    .transform((v) => (v === "" ? null : Math.round(v * 100) / 100)),
  notes: z.string().trim().max(500, "Keep notes to 500 characters or fewer."),
});

export type InventoryInput = z.input<typeof inventoryItemSchema>;

/** Total carried weight, ignoring items with no weight. */
export function totalWeight(items: InventoryItem[]): number {
  const total = items.reduce((sum, i) => sum + (i.weight ?? 0) * i.quantity, 0);
  return Math.round(total * 100) / 100;
}
