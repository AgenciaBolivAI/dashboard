"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Lightbulb, Loader2, Plus, X, Save } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { recordDecisionAction } from "@/lib/actions/company-brain";
import { cn } from "@/lib/utils";

const COMMON_TAGS = [
  "billing",
  "pricing",
  "ai_agents",
  "voice",
  "video",
  "security",
  "schema",
  "branding",
  "operations",
  "vendor_choice",
];

export function DecisionForm() {
  const router = useRouter();
  const t = useTranslations("admin_brain");
  const [open, setOpen] = useState(false);
  const [pending, startSave] = useTransition();

  const [title, setTitle] = useState("");
  const [problem, setProblem] = useState("");
  const [choice, setChoice] = useState("");
  const [reasoning, setReasoning] = useState("");
  const [tags, setTags] = useState<string[]>([]);
  const [newTag, setNewTag] = useState("");

  function toggleTag(tag: string) {
    setTags((cur) => (cur.includes(tag) ? cur.filter((t) => t !== tag) : [...cur, tag]));
  }

  function addCustomTag() {
    const t = newTag.trim();
    if (!t || tags.includes(t)) return;
    setTags((cur) => [...cur, t]);
    setNewTag("");
  }

  function reset() {
    setTitle("");
    setProblem("");
    setChoice("");
    setReasoning("");
    setTags([]);
    setNewTag("");
  }

  function handleSave() {
    if (title.trim().length < 3 || problem.trim().length < 10 || choice.trim().length < 2 || reasoning.trim().length < 10) {
      toast.error(t("decision_validation"));
      return;
    }
    startSave(async () => {
      const res = await recordDecisionAction({
        title: title.trim(),
        problem: problem.trim(),
        choice: choice.trim(),
        choice_reasoning: reasoning.trim(),
        context_tags: tags,
      });
      if (res.error) {
        toast.error(res.error);
        return;
      }
      toast.success(t("decision_saved"));
      reset();
      setOpen(false);
      router.refresh();
    });
  }

  if (!open) {
    return (
      <Card className="p-4 border-dashed bg-amber-500/5 border-amber-500/30">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div>
            <p className="text-sm font-medium flex items-center gap-2">
              <Lightbulb className="size-4 text-amber-500" />
              {t("decision_cta_title")}
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t("decision_cta_desc")}
            </p>
          </div>
          <Button onClick={() => setOpen(true)} size="sm" variant="outline" className="gap-1.5">
            <Plus className="size-4" />
            {t("decision_new")}
          </Button>
        </div>
      </Card>
    );
  }

  return (
    <Card className="p-5 border-amber-500/40 bg-amber-500/5 space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-display font-semibold flex items-center gap-2">
          <Lightbulb className="size-5 text-amber-500" />
          {t("decision_form_title")}
        </h3>
        <Button variant="ghost" size="sm" onClick={() => { reset(); setOpen(false); }}>
          <X className="size-4" />
        </Button>
      </div>

      <div className="space-y-1">
        <Label className="text-xs">{t("decision_title_label")}</Label>
        <Input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder={t("decision_title_placeholder")}
          maxLength={160}
          autoFocus
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs">{t("decision_problem_label")}</Label>
        <textarea
          value={problem}
          onChange={(e) => setProblem(e.target.value)}
          rows={3}
          maxLength={2000}
          placeholder={t("decision_problem_placeholder")}
          className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background"
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs">{t("decision_choice_label")}</Label>
        <Input
          value={choice}
          onChange={(e) => setChoice(e.target.value)}
          placeholder={t("decision_choice_placeholder")}
          maxLength={500}
        />
      </div>

      <div className="space-y-1">
        <Label className="text-xs">{t("decision_reasoning_label")}</Label>
        <textarea
          value={reasoning}
          onChange={(e) => setReasoning(e.target.value)}
          rows={4}
          maxLength={2000}
          placeholder={t("decision_reasoning_placeholder")}
          className="w-full text-sm px-3 py-2 rounded-md border border-border bg-background"
        />
      </div>

      <div className="space-y-2">
        <Label className="text-xs">{t("decision_tags_label", { count: tags.length })}</Label>
        <div className="flex flex-wrap gap-1.5">
          {COMMON_TAGS.map((t) => {
            const on = tags.includes(t);
            return (
              <button
                key={t}
                type="button"
                onClick={() => toggleTag(t)}
                className={cn(
                  "text-xs px-2.5 py-1 rounded-full border transition",
                  on
                    ? "bg-amber-500/20 border-amber-500/50 text-amber-700 dark:text-amber-300"
                    : "border-border text-muted-foreground hover:text-foreground",
                )}
              >
                {t}
              </button>
            );
          })}
        </div>
        <div className="flex gap-2 mt-2">
          <Input
            value={newTag}
            onChange={(e) => setNewTag(e.target.value)}
            placeholder={t("decision_custom_tag_placeholder")}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addCustomTag();
              }
            }}
            className="max-w-[200px]"
          />
          <Button type="button" variant="outline" size="sm" onClick={addCustomTag}>
            <Plus className="size-3.5" />
          </Button>
          {tags.filter((t) => !COMMON_TAGS.includes(t)).map((t) => (
            <span key={t} className="inline-flex items-center gap-1 text-xs bg-secondary px-2 py-1 rounded-full">
              {t}
              <button
                type="button"
                onClick={() => setTags((cur) => cur.filter((x) => x !== t))}
                className="hover:text-destructive"
              >
                <X className="size-3" />
              </button>
            </span>
          ))}
        </div>
      </div>

      <div className="flex justify-end gap-2 pt-2">
        <Button variant="ghost" onClick={() => { reset(); setOpen(false); }}>
          {t("cancel")}
        </Button>
        <Button onClick={handleSave} disabled={pending} className="gap-1.5">
          {pending ? <Loader2 className="size-4 animate-spin" /> : <Save className="size-4" />}
          {t("decision_save")}
        </Button>
      </div>
    </Card>
  );
}
