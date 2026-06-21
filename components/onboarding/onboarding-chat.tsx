"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Sparkles, Loader2, Send } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { onboardingChatAction } from "@/lib/actions/onboarding-chat";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; content: string };

export function OnboardingChat() {
  const t = useTranslations("onboarding");
  const locale = useLocale();
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>([{ role: "assistant", content: t("chat_greeting") }]);
  const [input, setInput] = useState("");
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, pending]);

  function send(text: string) {
    const q = text.trim();
    if (!q || pending || done) return;
    const next: Msg[] = [...messages, { role: "user", content: q }];
    setMessages(next);
    setInput("");
    startTransition(async () => {
      const res = await onboardingChatAction(next, locale);
      if (!res.ok) {
        toast.error(res.error);
        setMessages((m) => [...m, { role: "assistant", content: t("chat_error") }]);
        return;
      }
      if (res.done) {
        setDone(true);
        toast.success(t("workspace_ready"));
        router.push(`/dashboard/${res.slug}/billing?onboarding=success`);
        return;
      }
      setMessages((m) => [...m, { role: "assistant", content: res.answer }]);
    });
  }

  return (
    <div className="flex flex-col h-[calc(100vh-8rem)] max-w-2xl mx-auto w-full">
      <div className="flex items-center gap-2 px-4 pt-6 pb-2">
        <div className="size-9 rounded-xl bg-primary/10 flex items-center justify-center">
          <Sparkles className="size-5 text-primary" />
        </div>
        <div>
          <p className="font-display font-bold leading-tight">BOLIV</p>
          <p className="text-xs text-muted-foreground">{t("chat_subtitle")}</p>
        </div>
      </div>

      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-4 space-y-4">
        {messages.map((m, i) => (
          <div key={i} className={cn("flex", m.role === "user" ? "justify-end" : "justify-start")}>
            <div
              className={cn(
                "max-w-[80%] rounded-2xl px-4 py-2.5 text-sm whitespace-pre-wrap leading-relaxed",
                m.role === "user"
                  ? "bg-primary text-primary-foreground rounded-br-sm"
                  : "bg-secondary text-foreground rounded-bl-sm",
              )}
            >
              {m.content}
            </div>
          </div>
        ))}
        {pending ? (
          <div className="flex justify-start">
            <div className="bg-secondary rounded-2xl rounded-bl-sm px-4 py-3">
              <Loader2 className="size-4 animate-spin text-muted-foreground" />
            </div>
          </div>
        ) : null}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          send(input);
        }}
        className="border-t border-border p-3 flex items-center gap-2"
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t("chat_placeholder")}
          disabled={pending || done}
          autoFocus
        />
        <Button type="submit" disabled={pending || done || !input.trim()} size="icon" className="shrink-0">
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        </Button>
      </form>
    </div>
  );
}
