import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type Handout = {
  id: string;
  title: string;
  body: string;
  visibility: "all" | "selected" | "dm_only";
  file_path: string | null;
  file_name: string | null;
  file_type: string | null;
  file_size: number | null;
  created_at: string;
  recipients: string[];
  /** A short-lived link to the file (only for people allowed to see it). */
  fileUrl: string | null;
};

export async function loadHandouts(supabase: Supabase, campaignId: string): Promise<Handout[]> {
  const { data } = await supabase
    .from("handouts")
    .select("id, title, body, visibility, file_path, file_name, file_type, file_size, created_at, handout_recipients ( user_id )")
    .eq("campaign_id", campaignId)
    .order("created_at", { ascending: false })
    .limit(200);

  const rows = (data ?? []) as Array<Omit<Handout, "recipients" | "fileUrl"> & { handout_recipients: Array<{ user_id: string }> | null }>;
  const paths = rows.map((r) => r.file_path).filter((p): p is string => Boolean(p));

  const urls = new Map<string, string>();
  if (paths.length) {
    const { data: signed } = await supabase.storage.from("handouts").createSignedUrls(paths, 60 * 10);
    for (const s of signed ?? []) {
      if (s.path && s.signedUrl) urls.set(s.path, s.signedUrl);
    }
  }

  return rows.map(({ handout_recipients, ...r }) => ({
    ...r,
    recipients: (handout_recipients ?? []).map((x) => x.user_id),
    fileUrl: r.file_path ? (urls.get(r.file_path) ?? null) : null,
  }));
}
