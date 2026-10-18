import { Suspense } from "react";
import Link from "next/link";
import { JoinCampaignForm } from "@/components/campaign-forms";
import { AuthPage, linkClass, primaryLinkClass, secondaryButtonClass } from "@/components/ui";
import { getCurrentUser } from "@/lib/auth/session";
import { inviteTokenSchema } from "@/lib/campaigns/validation";

type Preview = {
  state: "ok" | "invalid" | "already_member" | "revoked" | "expired" | "used_up" | "archived";
  campaign_id?: string | null;
  campaign_name?: string;
  game_system?: string;
  dm_name?: string | null;
};

const PROBLEMS: Record<string, string> = {
  invalid: "This invite link isn’t valid. Check you copied all of it, or ask your DM for a new one.",
  revoked: "This invite link was cancelled. Ask your DM for a new one.",
  expired: "This invite link has expired. Ask your DM for a new one.",
  used_up: "This invite link has been used up. Ask your DM for a new one.",
  archived: "This campaign is archived, so it isn’t taking new players.",
};

async function InviteContent({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const { supabase, user } = await getCurrentUser();

  let preview: Preview = { state: "invalid" };
  if (inviteTokenSchema.safeParse(token).success) {
    const { data } = await supabase.rpc("preview_invite", { p_token: token });
    if (data) preview = data as Preview;
  }

  if (preview.state === "already_member" && preview.campaign_id) {
    return (
      <>
        <p className="leading-relaxed">You’re already in {preview.campaign_name}.</p>
        <p className="mt-4">
          <Link href={`/campaigns/${preview.campaign_id}`} className={primaryLinkClass}>
            Open campaign
          </Link>
        </p>
      </>
    );
  }

  if (preview.state !== "ok") {
    return <p className="leading-relaxed">{PROBLEMS[preview.state] ?? PROBLEMS.invalid}</p>;
  }

  const intro = (
    <div className="mb-6">
      <p className="text-sm text-stone-600 dark:text-stone-400">You’ve been invited to join</p>
      <p className="mt-1 text-xl font-semibold break-words">{preview.campaign_name}</p>
      <p className="mt-1 text-sm text-stone-600 dark:text-stone-400">
        {preview.dm_name ? `Run by ${preview.dm_name}` : null}
        {preview.dm_name && preview.game_system ? " · " : null}
        {preview.game_system}
      </p>
    </div>
  );

  if (!user) {
    const next = encodeURIComponent(`/invite/${token}`);
    return (
      <>
        {intro}
        <p className="mb-4 leading-relaxed">Log in or create an account to join.</p>
        <div className="flex flex-wrap gap-3">
          <Link href={`/login?next=${next}`} className={primaryLinkClass}>
            Log in
          </Link>
          <Link href={`/signup?next=${next}`} className={secondaryButtonClass}>
            Sign up
          </Link>
        </div>
      </>
    );
  }

  return (
    <>
      {intro}
      <JoinCampaignForm token={token} />
      <p className="mt-4 text-sm">
        <Link href="/home" className={linkClass}>
          Not now
        </Link>
      </p>
    </>
  );
}

export default function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  return (
    <AuthPage title="Campaign invite">
      <Suspense fallback={<p>Loading…</p>}>
        <InviteContent params={params} />
      </Suspense>
    </AuthPage>
  );
}
