"use server";

import { uuidSchema } from "@/lib/campaigns/validation";
import { createClient } from "@/lib/supabase/server";
import { type InventoryInput, type InventoryItem, inventoryItemSchema } from "./schema";

export type InventoryResult =
  | { ok: true; items: InventoryItem[] }
  | { ok: false; message: string; fieldErrors?: Record<string, string> };

const COLUMNS = "id, name, quantity, weight, notes";

async function list(characterId: string): Promise<InventoryItem[]> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("inventory_items")
    .select(COLUMNS)
    .eq("character_id", characterId)
    .order("created_at");
  return ((data ?? []) as Array<InventoryItem & { weight: number | string | null }>).map((i) => ({
    ...i,
    weight: i.weight === null ? null : Number(i.weight),
  }));
}

function validate(input: InventoryInput) {
  const parsed = inventoryItemSchema.safeParse(input);
  if (parsed.success) return { ok: true as const, data: parsed.data };
  const fieldErrors: Record<string, string> = {};
  for (const issue of parsed.error.issues) {
    const key = String(issue.path[0] ?? "form");
    if (!(key in fieldErrors)) fieldErrors[key] = issue.message;
  }
  return { ok: false as const, fieldErrors };
}

const NOT_ALLOWED = "Only the character’s owner can change the inventory.";

export async function addInventoryItem(characterId: string, input: InventoryInput): Promise<InventoryResult> {
  if (!uuidSchema.safeParse(characterId).success) return { ok: false, message: "That request wasn’t valid." };
  const checked = validate(input);
  if (!checked.ok) return { ok: false, message: "Check the item details.", fieldErrors: checked.fieldErrors };

  const supabase = await createClient();
  const { error } = await supabase.from("inventory_items").insert({ character_id: characterId, ...checked.data });
  if (error) {
    console.error(`[inventory] add failed: ${error.message}`);
    return { ok: false, message: NOT_ALLOWED };
  }
  return { ok: true, items: await list(characterId) };
}

export async function updateInventoryItem(
  characterId: string,
  itemId: string,
  input: InventoryInput,
): Promise<InventoryResult> {
  if (!uuidSchema.safeParse(characterId).success || !uuidSchema.safeParse(itemId).success) {
    return { ok: false, message: "That request wasn’t valid." };
  }
  const checked = validate(input);
  if (!checked.ok) return { ok: false, message: "Check the item details.", fieldErrors: checked.fieldErrors };

  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inventory_items")
    .update(checked.data)
    .eq("id", itemId)
    .eq("character_id", characterId)
    .select("id");
  if (error || !data?.length) return { ok: false, message: NOT_ALLOWED };
  return { ok: true, items: await list(characterId) };
}

export async function removeInventoryItem(characterId: string, itemId: string): Promise<InventoryResult> {
  if (!uuidSchema.safeParse(characterId).success || !uuidSchema.safeParse(itemId).success) {
    return { ok: false, message: "That request wasn’t valid." };
  }
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("inventory_items")
    .delete()
    .eq("id", itemId)
    .eq("character_id", characterId)
    .select("id");
  if (error || !data?.length) return { ok: false, message: NOT_ALLOWED };
  return { ok: true, items: await list(characterId) };
}
