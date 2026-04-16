"use client";

import { createChatSession, listChatSessions } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { useParams, useRouter } from "next/navigation";
import { useEffect } from "react";

export default function ChatRedirectPage() {
  const { token } = useAuth();
  const { id: agentId } = useParams<{ id: string }>();
  const router = useRouter();

  useEffect(() => {
    if (!token || !agentId) return;

    listChatSessions(token, agentId).then(async (sessions) => {
      if (sessions.length > 0) {
        router.replace(`/agents/${agentId}/chat/${sessions[0].id}`);
      } else {
        const session = await createChatSession(token, agentId);
        router.replace(`/agents/${agentId}/chat/${session.id}`);
      }
    });
  }, [token, agentId, router]);

  return (
    <div className="flex h-full items-center justify-center">
      <p className="text-muted-foreground">Loading chat...</p>
    </div>
  );
}
