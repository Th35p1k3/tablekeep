import { Suspense } from "react";
import { CampaignHeader } from "@/components/campaign-tabs";
import { ChatPanel } from "@/components/chat-panel";
import { loadCampaignPage } from "@/lib/campaigns/page-data";
import { loadMessages } from "@/lib/chat/queries";

async function Chat({ params }: { params: Promise<{ id: string }> }) {
  const { supabase, user, campaign, members, myRole } = await loadCampaignPage(params);
  const { messages, hasMore } = await loadMessages(supabase, campaign.id);
  return (
    <>
      <CampaignHeader supabase={supabase} campaign={campaign} myRole={myRole} active="chat" />
      <ChatPanel
        campaignId={campaign.id}
        me={user.id}
        myRole={myRole}
        members={members.map((m) => ({ user_id: m.user_id, display_name: m.display_name, role: m.role }))}
        initialMessages={messages}
        initialHasMore={hasMore}
      />
    </>
  );
}

export default function ChatPage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10 sm:py-14">
      <Suspense fallback={<p>Loading…</p>}>
        <Chat params={params} />
      </Suspense>
    </main>
  );
}
