"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Sparkles, Loader2, Send, ClipboardList } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { onboardingChatAction } from "@/lib/actions/onboarding-chat";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; content: string };

export function OnboardingChat({ onUseForm }: { onUseForm: () => void }) {
  const t = useTranslations("onboarding");
  const locale = useLocale();
  const router = useRouter();
  const [messages, setMessages] = useState<Msg[]>([{ role: "assistant", content: t("chat_greeting") }]);
  const [input, setInput] = useState("");
  const [pending, startTransition] = useTransition();
  const [done, setDone] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = (behavior: ScrollBehavior = "auto") =>
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior });

  // Size the chat to the *visible* viewport. When the mobile keyboard opens it
  // shrinks visualViewport.height, so the chat shrinks with it — the input and
  // the latest reply stay on screen instead of being pushed off / hidden behind
  // the keyboard (which forced the customer to zoom out). h-[100dvh] is the CSS
  // fallback when visualViewport is unavailable (older browsers / SSR).
  useEffect(() => {
    const vv = typeof window !== "undefined" ? window.visualViewport : null;
    const el = rootRef.current;
    if (!vv || !el) return;
    const apply = () => {
      el.style.height = `${vv.height}px`;
      scrollToBottom();
    };
    apply();
    vv.addEventListener("resize", apply);
    vv.addEventListener("scroll", apply);
    return () => {
      vv.removeEventListener("resize", apply);
      vv.removeEventListener("scroll", apply);
    };
  }, []);

  // Auto-scroll to the newest message / typing indicator.
  useEffect(() => {
    scrollToBottom("smooth");
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
    <div ref={rootRef} className="mx-auto flex h-[100dvh] w-full max-w-2xl flex-col">
      <div className="flex shrink-0 items-center gap-2 px-4 pt-6 pb-2">
        <div className="size-9 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
          <Sparkles className="size-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-display font-bold leading-tight">BOLIV</p>
          <p className="text-xs text-muted-foreground truncate">{t("chat_subtitle")}</p>
        </div>
        <button
          type="button"
          onClick={onUseForm}
          className="inline-flex shrink-0 items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition"
        >
          <ClipboardList className="size-3.5" />
          {t("prefer_form")}
        </button>
      </div>

      <div
        ref={scrollRef}
        className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4 space-y-4"
      >
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
        className="flex shrink-0 items-center gap-2 border-t border-border p-3"
        style={{ paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))" }}
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t("chat_placeholder")}
          disabled={pending || done}
          autoFocus
          enterKeyHint="send"
          // 16px font prevents iOS Safari from auto-zooming into the field on
          // focus (which cropped the conversation). Keep it at the chat input.
          className="text-base"
        />
        <Button type="submit" disabled={pending || done || !input.trim()} size="icon" className="shrink-0">
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        </Button>
      </form>
    </div>
  );
}
