import type { createClient } from "@/lib/supabase/server";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type TemplateSummary = {
  id: string;
  name: string;
  game_system: string;
  updated_at: string;
  latestVersion: number | null;
  hasDraft: boolean;
};

export type TemplateVersion = {
  id: string;
  status: "draft" | "published";
  version_number: number | null;
  definition: unknown;
  published_at: string | null;
  updated_at: string;
};

export type TemplateDetail = {
  id: string;
  name: string;
  game_system: string;
  description: string;
  draft: TemplateVersion | null;
  published: TemplateVersion[];
};

export async function loadMyTemplates(supabase: Supabase): Promise<TemplateSummary[]> {
  const { data } = await supabase
    .from("sheet_templates")
    .select("id, name, game_system, updated_at, sheet_template_versions ( status, version_number )")
    .order("updated_at", { ascending: false });

  const rows = (data ?? []) as Array<{
    id: string;
    name: string;
    game_system: string;
    updated_at: string;
    sheet_template_versions: Array<{ status: string; version_number: number | null }> | null;
  }>;

  return rows.map((r) => {
    const versions = r.sheet_template_versions ?? [];
    const numbers = versions
      .map((v) => v.version_number)
      .filter((n): n is number => typeof n === "number");
    return {
      id: r.id,
      name: r.name,
      game_system: r.game_system,
      updated_at: r.updated_at,
      latestVersion: numbers.length ? Math.max(...numbers) : null,
      hasDraft: versions.some((v) => v.status === "draft"),
    };
  });
}

export async function loadTemplate(
  supabase: Supabase,
  templateId: string,
): Promise<TemplateDetail | null> {
  const { data: template } = await supabase
    .from("sheet_templates")
    .select("id, name, game_system, description")
    .eq("id", templateId)
    .maybeSingle();
  if (!template) return null;

  const { data } = await supabase
    .from("sheet_template_versions")
    .select("id, status, version_number, definition, published_at, updated_at")
    .eq("template_id", templateId);
  const versions = (data ?? []) as TemplateVersion[];

  return {
    ...(template as { id: string; name: string; game_system: string; description: string }),
    draft: versions.find((v) => v.status === "draft") ?? null,
    published: versions
      .filter((v) => v.status === "published")
      .sort((a, b) => (b.version_number ?? 0) - (a.version_number ?? 0)),
  };
}
