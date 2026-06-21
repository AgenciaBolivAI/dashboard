"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Plus, Trash2, Loader2, Calendar } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  createTaskAction,
  setTaskDoneAction,
  deleteTaskAction,
} from "@/lib/actions/tasks";
import type { Task, TaskPriority } from "@/lib/queries/tasks";
import { cn } from "@/lib/utils";

type Member = { user_id: string; email: string };

const PRIORITY_CLASS: Record<TaskPriority, string> = {
  low: "bg-slate-500/10 text-slate-600 border-slate-500/30",
  medium: "bg-blue-500/10 text-blue-600 border-blue-500/30",
  high: "bg-red-500/10 text-red-600 border-red-500/30",
};

export function TasksManager({
  tenantId,
  tasks,
  members,
  currentUserId,
}: {
  tenantId: string;
  tasks: Task[];
  members: Member[];
  currentUserId: string | null;
}) {
  const t = useTranslations("tasks");
  const locale = useLocale();
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [priority, setPriority] = useState<TaskPriority>("medium");
  const [assignee, setAssignee] = useState<string>(currentUserId ?? "");
  const [due, setDue] = useState("");
  const [pending, startTransition] = useTransition();
  const [busyId, setBusyId] = useState<string | null>(null);

  const emailById = new Map(members.map((m) => [m.user_id, m.email]));

  function add() {
    const trimmed = title.trim();
    if (!trimmed || pending) return;
    startTransition(async () => {
      const res = await createTaskAction(tenantId, {
        title: trimmed,
        priority,
        assignee_user_id: assignee || null,
        due_at: due ? new Date(`${due}T12:00:00Z`).toISOString() : null,
      });
      if (!res.ok) {
        toast.error(res.error ?? t("error_generic"));
        return;
      }
      setTitle("");
      setDue("");
      router.refresh();
    });
  }

  async function toggle(task: Task) {
    setBusyId(task.id);
    const res = await setTaskDoneAction(tenantId, task.id, task.status !== "done");
    setBusyId(null);
    if (!res.ok) toast.error(res.error ?? t("error_generic"));
    else router.refresh();
  }

  async function remove(task: Task) {
    setBusyId(task.id);
    const res = await deleteTaskAction(tenantId, task.id);
    setBusyId(null);
    if (!res.ok) toast.error(res.error ?? t("error_generic"));
    else router.refresh();
  }

  return (
    <div className="space-y-4">
      {/* Quick add */}
      <Card className="p-3">
        <div className="flex flex-col sm:flex-row gap-2">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && add()}
            placeholder={t("add_placeholder")}
            className="flex-1"
          />
          <select
            value={priority}
            onChange={(e) => setPriority(e.target.value as TaskPriority)}
            className="rounded-md border border-input bg-background px-2 py-1.5 text-sm"
            aria-label={t("priority")}
          >
            <option value="low">{t("priority_low")}</option>
            <option value="medium">{t("priority_medium")}</option>
            <option value="high">{t("priority_high")}</option>
          </select>
          <select
            value={assignee}
            onChange={(e) => setAssignee(e.target.value)}
            className="rounded-md border border-input bg-background px-2 py-1.5 text-sm max-w-44"
            aria-label={t("assignee")}
          >
            <option value="">{t("unassigned")}</option>
            {members.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.email}
              </option>
            ))}
          </select>
          <Input
            type="date"
            value={due}
            onChange={(e) => setDue(e.target.value)}
            className="w-40"
            aria-label={t("due_date")}
          />
          <Button onClick={add} disabled={pending || !title.trim()}>
            {pending ? <Loader2 className="size-4 animate-spin" /> : <Plus className="size-4" />}
            {t("add")}
          </Button>
        </div>
      </Card>

      {/* List */}
      {tasks.length === 0 ? (
        <Card className="py-14 flex flex-col items-center text-center">
          <p className="font-medium">{t("empty_title")}</p>
          <p className="text-sm text-muted-foreground mt-1">{t("empty_subtitle")}</p>
        </Card>
      ) : (
        <Card className="divide-y divide-border">
          {tasks.map((task) => {
            const done = task.status === "done";
            const overdue = !done && task.due_at && new Date(task.due_at) < new Date();
            return (
              <div key={task.id} className="flex items-center gap-3 px-3 py-2.5">
                <input
                  type="checkbox"
                  checked={done}
                  disabled={busyId === task.id}
                  onChange={() => toggle(task)}
                  className="size-4 shrink-0 accent-primary cursor-pointer"
                />
                <div className="flex-1 min-w-0">
                  <div className={cn("text-sm truncate", done && "line-through text-muted-foreground")}>
                    {task.title}
                  </div>
                  <div className="flex items-center gap-2 mt-0.5 text-xs text-muted-foreground">
                    {task.assignee_user_id ? (
                      <span className="truncate max-w-40">{emailById.get(task.assignee_user_id) ?? "—"}</span>
                    ) : (
                      <span>{t("unassigned")}</span>
                    )}
                    {task.due_at ? (
                      <span className={cn("inline-flex items-center gap-1", overdue && "text-red-600")}>
                        <Calendar className="size-3" />
                        {new Date(task.due_at).toLocaleDateString(locale, { dateStyle: "medium" })}
                      </span>
                    ) : null}
                  </div>
                </div>
                <Badge variant="outline" className={cn("text-[10px]", PRIORITY_CLASS[task.priority])}>
                  {t(`priority_${task.priority}`)}
                </Badge>
                <button
                  type="button"
                  onClick={() => remove(task)}
                  disabled={busyId === task.id}
                  className="text-muted-foreground hover:text-red-600 shrink-0"
                  aria-label={t("delete")}
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            );
          })}
        </Card>
      )}
    </div>
  );
}
