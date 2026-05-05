"use client";

import { useEffect, useRef, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import { MessageBubble, type Message } from "./message-bubble";

export function LiveThread({
  conversationId,
  initialMessages,
}: {
  conversationId: string;
  initialMessages: Message[];
}) {
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const bottomRef = useRef<HTMLDivElement>(null);

  // Re-sync when initialMessages change (e.g., navigation between conversations)
  useEffect(() => {
    setMessages(initialMessages);
  }, [initialMessages]);

  // Auto-scroll on new message
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // Realtime subscription
  useEffect(() => {
    const supabase = createClient();
    const channel = supabase
      .channel(`chat:${conversationId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "chat_history",
          filter: `conversation_id=eq.${conversationId}`,
        },
        (payload) => {
          const m = payload.new as Message & { conversation_id: string };
          setMessages((prev) => {
            // Dedup by id (server-rendered messages may already include this)
            if (prev.some((x) => x.id === m.id)) return prev;
            return [...prev, m].sort((a, b) =>
              a.created_at < b.created_at ? -1 : 1,
            );
          });
        },
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [conversationId]);

  return (
    <div className="flex-1 overflow-y-auto px-6 py-6 space-y-3">
      {messages.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-12">
          Sin mensajes aún.
        </p>
      ) : (
        messages.map((m) => <MessageBubble key={m.id} message={m} />)
      )}
      <div ref={bottomRef} />
    </div>
  );
}
