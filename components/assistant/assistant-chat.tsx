"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import { Bot, Loader2, Send, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { askAssistantAction } from "@/lib/actions/assistant";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; content: string };

export function AssistantChat({ tenantSlug }: { tenantSlug: string }) {
  const t = useTranslations("assistant");
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState("");
  const [pending, startTransition] = useTransition();
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, pending]);

  const suggestions = [t("suggestion_1"), t("suggestion_2"), t("suggestion_3"), t("suggestion_4")];

  function ask(question: string) {
    const q = question.trim();
    if (!q || pending) return;
    const next: Msg[] = [...messages, { role: "user", content: q }];
    setMessages(next);
    setInput("");
    startTransition(async () => {
      const res = await askAssistantAction(tenantSlug, next);
      if (!res.ok) {
        toast.error(res.error);
        setMessages((m) => [...m, { role: "assistant", content: t("error_reply") }]);
        return;
      }
      setMessages((m) => [...m, { role: "assistant", content: res.answer }]);
    });
  }

  return (
    <div className="flex flex-col h-[calc(100vh-9rem)] max-w-3xl mx-auto">
      <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
        {messages.length === 0 ? (
          <div className="h-full flex flex-col items-center justify-center text-center gap-5">
            <div className="size-14 rounded-2xl bg-primary/10 flex items-center justify-center">
              <Bot className="size-7 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-display font-bold">{t("empty_title")}</h2>
              <p className="text-sm text-muted-foreground mt-1 max-w-md">{t("empty_subtitle")}</p>
            </div>
            <div className="grid sm:grid-cols-2 gap-2 w-full max-w-xl">
              {suggestions.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => ask(s)}
                  className="text-left text-sm rounded-lg border border-border px-3 py-2.5 hover:border-primary hover:bg-secondary/50 transition flex items-start gap-2"
                >
                  <Sparkles className="size-3.5 text-primary shrink-0 mt-0.5" />
                  <span>{s}</span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
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
          ))
        )}
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
          ask(input);
        }}
        className="border-t border-border p-3 flex items-center gap-2"
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t("placeholder")}
          disabled={pending}
          autoFocus
        />
        <Button type="submit" disabled={pending || !input.trim()} size="icon" className="shrink-0">
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
        </Button>
      </form>
    </div>
  );
}
