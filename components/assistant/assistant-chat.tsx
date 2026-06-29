"use client";

import { useState, useRef, useEffect, useTransition } from "react";
import {
  Loader2,
  Send,
  Sparkles,
  AlertTriangle,
  Check,
  X,
  Plus,
  MessageSquare,
  Trash2,
  Copy,
} from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  askAssistantAction,
  executeAssistantActionAction,
  getAssistantSessionAction,
  deleteAssistantSessionAction,
} from "@/lib/actions/assistant";
import { cn } from "@/lib/utils";

type Msg = { role: "user" | "assistant"; content: string };
type PendingAction = { name: string; args: Record<string, unknown>; summary: string };
type Session = { session_id: string; title: string; last_at: string; count: number };
type Briefing = {
  conversations24h: number;
  leadsWaiting: number;
  tasksDue: number;
  eventsToday: number;
  recommendations: number;
};

export function AssistantChat({
  tenantSlug,
  initialMessages = [],
  initialSessions = [],
  activeSessionId,
  briefing,
}: {
  tenantSlug: string;
  initialMessages?: Msg[];
  initialSessions?: Session[];
  activeSessionId: string;
  briefing?: Briefing;
}) {
  const t = useTranslations("assistant");
  const [messages, setMessages] = useState<Msg[]>(initialMessages);
  const [sessions, setSessions] = useState<Session[]>(initialSessions);
  const [sessionId, setSessionId] = useState<string>(activeSessionId);
  const [input, setInput] = useState("");
  const [pending, startTransition] = useTransition();
  const [proposed, setProposed] = useState<PendingAction | null>(null);
  const [executing, setExecuting] = useState(false);
  const [switching, setSwitching] = useState(false);
  const [copiedIdx, setCopiedIdx] = useState<number | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, pending, proposed]);

  const suggestions = [t("suggestion_1"), t("suggestion_2"), t("suggestion_3"), t("suggestion_4")];
  const busy = pending || executing || switching;

  function ask(question: string) {
    const q = question.trim();
    if (!q || busy) return;
    setProposed(null); // a new question supersedes any pending proposal
    const next: Msg[] = [...messages, { role: "user", content: q }];
    setMessages(next);
    setInput("");
    const sid = sessionId;
    const firstTurn = messages.length === 0;
    startTransition(async () => {
      const res = await askAssistantAction(tenantSlug, next, sid);
      if (!res.ok) {
        toast.error(res.error);
        setMessages((m) => [...m, { role: "assistant", content: t("error_reply") }]);
        return;
      }
      setMessages((m) => [...m, { role: "assistant", content: res.answer }]);
      if (res.pendingAction) setProposed(res.pendingAction);
      // Surface the chat in the sidebar as soon as its first turn persists.
      setSessions((prev) => {
        const now = new Date().toISOString();
        const existing = prev.find((s) => s.session_id === sid);
        if (existing) {
          return [
            { ...existing, last_at: now, count: existing.count + 2 },
            ...prev.filter((s) => s.session_id !== sid),
          ];
        }
        if (!firstTurn) return prev;
        return [{ session_id: sid, title: q.slice(0, 80), last_at: now, count: 2 }, ...prev];
      });
    });
  }

  function newChat() {
    if (busy) return;
    setProposed(null);
    setMessages([]);
    setSessionId(crypto.randomUUID());
  }

  function switchSession(id: string) {
    if (busy || id === sessionId) return;
    setSwitching(true);
    setProposed(null);
    (async () => {
      const res = await getAssistantSessionAction(tenantSlug, id);
      setSwitching(false);
      if (!res.ok) {
        toast.error(t("error_reply"));
        return;
      }
      setSessionId(id);
      setMessages(res.messages);
    })();
  }

  function deleteSession(id: string) {
    if (executing) return;
    setSessions((prev) => prev.filter((s) => s.session_id !== id));
    if (id === sessionId) {
      setMessages([]);
      setSessionId(crypto.randomUUID());
    }
    void deleteAssistantSessionAction(tenantSlug, id);
  }

  function confirmProposed() {
    if (!proposed || executing) return;
    const p = proposed;
    setExecuting(true);
    (async () => {
      const res = await executeAssistantActionAction(tenantSlug, p.name, p.args);
      setExecuting(false);
      setProposed(null);
      if (res.ok) {
        toast.success(res.message);
        setMessages((m) => [...m, { role: "assistant", content: "✅ " + res.message }]);
      } else {
        toast.error(res.error);
        setMessages((m) => [...m, { role: "assistant", content: "⚠️ " + res.error }]);
      }
    })();
  }

  function cancelProposed() {
    setProposed(null);
    setMessages((m) => [...m, { role: "assistant", content: t("action_cancelled") }]);
  }

  async function copyMessage(content: string, idx: number) {
    try {
      await navigator.clipboard.writeText(content);
      setCopiedIdx(idx);
      toast.success(t("copied"));
      window.setTimeout(() => setCopiedIdx((c) => (c === idx ? null : c)), 1500);
    } catch {
      toast.error(t("copy_failed"));
    }
  }

  return (
    <div className="flex h-[calc(100vh-9rem)] max-w-5xl mx-auto w-full">
      {/* Sessions rail */}
      <aside className="hidden md:flex w-60 shrink-0 flex-col border-r border-border">
        <div className="p-3">
          <Button onClick={newChat} disabled={busy} variant="outline" className="w-full justify-start gap-2">
            <Plus className="size-4" />
            {t("new_chat")}
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto px-2 pb-3 space-y-0.5">
          {sessions.length === 0 ? (
            <p className="px-2 py-3 text-xs text-muted-foreground">{t("no_chats")}</p>
          ) : (
            sessions.map((s) => (
              <div
                key={s.session_id}
                onClick={() => switchSession(s.session_id)}
                className={cn(
                  "group/s flex items-center gap-2 rounded-md px-2 py-2 cursor-pointer text-sm transition-colors",
                  s.session_id === sessionId ? "bg-secondary" : "hover:bg-secondary/50",
                )}
              >
                <MessageSquare className="size-3.5 shrink-0 text-muted-foreground" />
                <span className="flex-1 min-w-0 truncate">{s.title || t("untitled_chat")}</span>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    deleteSession(s.session_id);
                  }}
                  aria-label={t("delete_chat")}
                  className="opacity-0 group-hover/s:opacity-100 text-muted-foreground hover:text-destructive shrink-0 transition"
                >
                  <Trash2 className="size-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </aside>

      {/* Chat column */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Mobile new-chat (sidebar is hidden < md) */}
        <div className="md:hidden flex justify-end px-4 pt-2">
          <Button type="button" variant="ghost" size="sm" onClick={newChat} disabled={busy} className="gap-1.5 text-muted-foreground">
            <Plus className="size-3.5" />
            {t("new_chat")}
          </Button>
        </div>

        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 py-6 space-y-4">
          {switching ? (
            <div className="h-full flex items-center justify-center">
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            </div>
          ) : messages.length === 0 ? (
            <div className="h-full flex flex-col items-center justify-center text-center gap-5">
              <div className="size-14 rounded-2xl bg-primary/10 flex items-center justify-center">
                <Sparkles className="size-7 text-primary" />
              </div>
              <div className="max-w-xl">
                <h2 className="text-xl font-display font-bold">{t("briefing_greeting")}</h2>
                {briefing &&
                briefing.conversations24h + briefing.leadsWaiting + briefing.tasksDue + briefing.eventsToday > 0 ? (
                  <p className="text-sm text-muted-foreground mt-2">
                    {t("briefing_summary", {
                      conversations: briefing.conversations24h,
                      leads: briefing.leadsWaiting,
                      tasks: briefing.tasksDue,
                      events: briefing.eventsToday,
                    })}
                  </p>
                ) : (
                  <p className="text-sm text-muted-foreground mt-1">{t("empty_subtitle")}</p>
                )}
                <p className="text-sm font-medium mt-2">{t("briefing_cta")}</p>
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
              <div
                key={i}
                className={cn("group/msg flex flex-col gap-1", m.role === "user" ? "items-end" : "items-start")}
              >
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
                <button
                  type="button"
                  onClick={() => copyMessage(m.content, i)}
                  className={cn(
                    "inline-flex items-center gap-1 px-1 text-[11px] text-muted-foreground hover:text-foreground opacity-0 group-hover/msg:opacity-100 focus:opacity-100 transition",
                    m.role === "user" ? "self-end" : "self-start",
                  )}
                >
                  {copiedIdx === i ? <Check className="size-3" /> : <Copy className="size-3" />}
                  {copiedIdx === i ? t("copied") : t("copy")}
                </button>
              </div>
            ))
          )}

          {/* Confirm card — the ONLY way a write action executes */}
          {proposed ? (
            <div className="flex justify-start">
              <div className="max-w-[85%] rounded-xl border border-amber-500/40 bg-amber-500/10 p-3.5 space-y-3">
                <p className="text-sm flex items-start gap-2">
                  <AlertTriangle className="size-4 text-amber-500 mt-0.5 shrink-0" />
                  <span>{proposed.summary || t("confirm_generic")}</span>
                </p>
                <div className="flex gap-2">
                  <Button size="sm" onClick={confirmProposed} disabled={executing} className="gap-1.5">
                    {executing ? <Loader2 className="size-3.5 animate-spin" /> : <Check className="size-3.5" />}
                    {t("confirm")}
                  </Button>
                  <Button size="sm" variant="outline" onClick={cancelProposed} disabled={executing} className="gap-1.5">
                    <X className="size-3.5" />
                    {t("cancel")}
                  </Button>
                </div>
              </div>
            </div>
          ) : null}

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
            disabled={pending || switching}
            autoFocus
          />
          <Button type="submit" disabled={busy || !input.trim()} size="icon" className="shrink-0">
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Send className="size-4" />}
          </Button>
        </form>
      </div>
    </div>
  );
}
