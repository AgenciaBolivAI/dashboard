"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { HelpCircle, Loader2, Plus, X, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  recordUnknownAction,
  resolveUnknownAction,
  type UnknownRow,
} from "@/lib/actions/company-brain";

export function UnknownsList({ unknowns }: { unknowns: UnknownRow[] }) {
  const router = useRouter();
  const t = useTranslations("admin_brain");
  const [open, setOpen] = useState(false);
  const [pending, startSave] = useTransition();
  const [resolving, startResolve] = useTransition();

  const [question, setQuestion] = useState("");
  const [context, setContext] = useState("");

  function handleAdd() {
    if (question.trim().length < 5) {
      toast.error(t("unknown_too_short"));
      return;
    }
    startSave(async () => {
      const res = await recordUnknownAction({
        question: question.trim(),
        context: context.trim() || undefined,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(t("unknown_recorded"));
      setQuestion("");
      setContext("");
      setOpen(false);
      router.refresh();
    });
  }

  function handleResolve(id: string) {
    const answer = window.prompt(t("unknown_answer_prompt"));
    if (!answer || answer.trim().length < 5) return;
    startResolve(async () => {
      const res = await resolveUnknownAction({ id, answer_summary: answer.trim() });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(t("unknown_resolved"));
      router.refresh();
    });
  }

  return (
    <Card className="p-5">
      <div className="flex items-center justify-between mb-3">
        <div>
          <p className="text-sm font-medium flex items-center gap-2">
            <HelpCircle className="size-4 text-rose-500" />
            {t("unknowns_title", { count: unknowns.length })}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">
            {t("unknowns_desc")}
          </p>
        </div>
        {!open && (
          <Button onClick={() => setOpen(true)} size="sm" variant="outline" className="gap-1.5">
            <Plus className="size-4" />
            {t("unknowns_new")}
          </Button>
        )}
      </div>

      {open && (
        <div className="space-y-3 mb-4 p-3 rounded-lg border border-dashed border-rose-500/30 bg-rose-500/5">
          <div className="flex items-center justify-between">
            <p className="text-sm font-medium">{t("unknowns_form_title")}</p>
            <Button variant="ghost" size="sm" onClick={() => setOpen(false)}>
              <X className="size-4" />
            </Button>
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("unknowns_question_label")}</Label>
            <Input
              value={question}
              onChange={(e) => setQuestion(e.target.value)}
              placeholder={t("unknowns_question_placeholder")}
              autoFocus
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs">{t("unknowns_context_label")}</Label>
            <textarea
              value={context}
              onChange={(e) => setContext(e.target.value)}
              rows={2}
              maxLength={2000}
              placeholder={t("unknowns_context_placeholder")}
              className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background"
            />
          </div>
          <div className="flex justify-end">
            <Button onClick={handleAdd} disabled={pending} size="sm" className="gap-1.5">
              {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
              {t("unknowns_submit")}
            </Button>
          </div>
        </div>
      )}

      {unknowns.length === 0 ? (
        <p className="text-sm text-muted-foreground text-center py-4">
          {t("unknowns_empty")}
        </p>
      ) : (
        <div className="space-y-2">
          {unknowns.map((u) => (
            <div
              key={u.id}
              className="flex items-start justify-between gap-2 p-3 rounded-md bg-secondary/30 border border-border"
            >
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium">{u.question}</p>
                {u.context && (
                  <p className="text-xs text-muted-foreground mt-1 line-clamp-2">{u.context}</p>
                )}
                <p className="text-xs text-muted-foreground mt-1">
                  {new Date(u.raised_at).toLocaleDateString()}
                </p>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => handleResolve(u.id)}
                disabled={resolving}
                className="shrink-0 gap-1"
                title={t("unknowns_mark_resolved")}
              >
                <CheckCircle2 className="size-4 text-primary" />
              </Button>
            </div>
          ))}
        </div>
      )}
    </Card>
  );
}
