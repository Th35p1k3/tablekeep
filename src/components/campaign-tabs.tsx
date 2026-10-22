import Link from "next/link";
import type { Campaign, CampaignRole } from "@/lib/campaigns/queries";
import { ROLE_LABEL } from "@/lib/campaigns/queries";
import type { createClient } from "@/lib/supabase/server";
import { Badge } from "./ui";

type Supabase = Awaited<ReturnType<typeof createClient>>;

export type CampaignTab = "overview" | "party" | "spells" | "logs" | "notes" | "approvals" | "activity" | "settings";

/** Campaign name, your role, and the tab strip shown on every campaign page. */
export async function CampaignHeader({
  supabase,
  campaign,
  myRole,
  active,
}: {
  supabase: Supabase;
  campaign: Campaign;
  myRole: CampaignRole;
  active: CampaignTab;
}) {
  const isManager = myRole !== "player";
  let pending = 0;
  if (isManager) {
    const { count } = await supabase
      .from("homebrew_submissions")
      .select("id", { count: "exact", head: true })
      .eq("campaign_id", campaign.id)
      .eq("status", "pending");
    pending = count ?? 0;
  }

  const tabs: Array<{ key: CampaignTab; label: string; href: string; show: boolean }> = [
    { key: "overview", label: "Overview", href: "", show: true },
    { key: "party", label: "Party", href: "/party", show: true },
    { key: "spells", label: "Spells", href: "/spells", show: true },
    { key: "logs", label: "Logs", href: "/logs", show: true },
    { key: "notes", label: "DM notes", href: "/notes", show: isManager },
    { key: "approvals", label: pending ? `Approvals (${pending})` : "Approvals", href: "/approvals", show: isManager },
    { key: "activity", label: "Activity", href: "/activity", show: isManager },
    { key: "settings", label: "Settings", href: "/settings", show: isManager },
  ];

  return (
    <div className="mb-6">
      <p className="mb-3 text-sm">
        <Link href="/home" className="font-medium text-amber-800 underline underline-offset-4 dark:text-amber-500">
          ← Home
        </Link>
      </p>
      <h1 className="text-2xl font-semibold break-words">{campaign.name}</h1>
      <div className="mt-2 flex flex-wrap gap-2">
        <Badge tone={myRole === "player" ? "neutral" : "accent"}>You: {ROLE_LABEL[myRole]}</Badge>
        {campaign.game_system ? <Badge>{campaign.game_system}</Badge> : null}
        {campaign.status === "archived" ? <Badge>Archived</Badge> : null}
      </div>
      <nav aria-label="Campaign sections" className="-mx-4 mt-4 overflow-x-auto px-4">
        <ul className="flex min-w-max gap-1 border-b border-stone-200 dark:border-stone-700">
          {tabs
            .filter((t) => t.show)
            .map((t) => (
              <li key={t.key}>
                <Link
                  href={`/campaigns/${campaign.id}${t.href}`}
                  aria-current={t.key === active ? "page" : undefined}
                  className={`block border-b-2 px-3 py-2 text-sm font-medium whitespace-nowrap ${
                    t.key === active
                      ? "border-amber-800 text-amber-900 dark:border-amber-500 dark:text-amber-400"
                      : "border-transparent text-stone-600 hover:text-stone-900 dark:text-stone-400 dark:hover:text-stone-100"
                  }`}
                >
                  {t.label}
                </Link>
              </li>
            ))}
        </ul>
      </nav>
    </div>
  );
}
