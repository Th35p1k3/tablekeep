import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type ChatMessage = {
  id: string;
  author_id: string | null;
  body: string;
  recipients: string[] | null;
  created_at: string;
  edited_at: string | null;
};

export const PAGE_SIZE = 50;

/** The newest messages (or the ones before a given time), oldest first. */
export async function loadMessages(
  supabase: Supabase,
  campaignId: string,
  before?: string,
): Promise<{ messages: ChatMessage[]; hasMore: boolean }> {
  let query = supabase
    .from("messages")
    .select("id, author_id, body, recipients, created_at, edited_at")
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: false })
    .limit(PAGE_SIZE + 1);
  if (before) query = query.lt("created_at", before);
  const { data } = await query;
  const rows = (data ?? []) as ChatMessage[];
  return { messages: rows.slice(0, PAGE_SIZE).reverse(), hasMore: rows.length > PAGE_SIZE };
}

/** Messages newer than a given time (to catch up after reconnecting). */
export async function loadNewerMessages(
  supabase: Supabase,
  campaignId: string,
  after: string,
): Promise<ChatMessage[]> {
  const { data } = await supabase
    .from("messages")
    .select("id, author_id, body, recipients, created_at, edited_at")
    .eq("campaign_id", campaignId)
    .gt("created_at", after)
    .order("created_at", { ascending: true })
    .limit(100);
  return (data ?? []) as ChatMessage[];
}
