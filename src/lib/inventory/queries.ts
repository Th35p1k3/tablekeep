import type { createClient } from "@/lib/supabase/server";
import type { InventoryItem } from "./schema";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export async function loadInventory(supabase: Supabase, characterId: string): Promise<InventoryItem[]> {
  const { data } = await supabase
    .from("inventory_items")
    .select("id, name, quantity, weight, notes")
    .eq("character_id", characterId)
    .order("created_at");
  return ((data ?? []) as Array<InventoryItem & { weight: number | string | null }>).map((i) => ({
    ...i,
    weight: i.weight === null ? null : Number(i.weight),
  }));
}
