"use client";

import { useState, useTransition } from "react";
import Link from "next/link";
import { useRouter, useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Trash2, PhoneCall, Check, X, AlertCircle, Voicemail } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TableCell, TableRow } from "@/components/ui/table";
import {
  updateSandraQueueItemAction,
  removeFromSandraQueueAction,
} from "@/lib/actions/sandra-queue";
import type { SandraQueueItem } from "@/lib/queries/sandra-queue";
import { intentLabel } from "@/lib/leads-intents";
import { cn } from "@/lib/utils";

// Maps each status to its translation key in the "sandra" namespace.
const STATUS_LABEL_KEY: Record<SandraQueueItem["status"], string> = {
  pending: "row_status_pending",
  calling: "row_status_calling",
  completed: "row_status_completed",
  skipped: "row_status_skipped",
  no_answer: "row_status_no_answer",
  failed: "row_status_failed",
};

const STATUS_STYLE: Record<SandraQueueItem["status"], string> = {
  pending: "bg-primary/10 text-primary border-primary/30",
  calling: "bg-amber-500/10 text-amber-600 border-amber-500/30",
  completed: "bg-green-500/10 text-green-600 border-green-500/30",
  skipped: "bg-muted text-muted-foreground border-border",
  no_answer: "bg-blue-500/10 text-blue-600 border-blue-500/30",
  failed: "bg-destructive/10 text-destructive border-destructive/30",
};

export function QueueRow({
  tenantId,
  item,
  selected,
  onToggle,
}: {
  tenantId: string;
  item: SandraQueueItem;
  selected: boolean;
  onToggle: (id: string) => void;
}) {
  const router = useRouter();
  const t = useTranslations("sandra");
  const params = useParams<{ tenantSlug?: string }>();
  const tenantSlug = params?.tenantSlug ?? "";
  const [pending, startTransition] = useTransition();
  const [optimisticStatus, setOptimisticStatus] = useState(item.status);

  function setStatus(next: SandraQueueItem["status"]) {
    const previous = optimisticStatus;
    setOptimisticStatus(next);
    startTransition(async () => {
      const res = await updateSandraQueueItemAction(tenantId, item.id, {
        status: next,
      });
      if (res.error) {
        toast.error(res.error);
        setOptimisticStatus(previous);
      } else {
        toast.success(t("row_marked_as", { status: t(STATUS_LABEL_KEY[next]) }));
        router.refresh();
      }
    });
  }

  function remove() {
    if (!confirm(t("row_confirm_remove"))) return;
    startTransition(async () => {
      const res = await removeFromSandraQueueAction(tenantId, item.id);
      if (res.error) toast.error(res.error);
      else {
        toast.success(t("row_removed"));
        router.refresh();
      }
    });
  }

  const canSelect = optimisticStatus === "pending";

  return (
    <TableRow className={cn(pending && "opacity-60")}>
      <TableCell className="w-8">
        <input
          type="checkbox"
          checked={selected}
          disabled={!canSelect}
          onChange={() => onToggle(item.id)}
          className="size-4 rounded border cursor-pointer disabled:opacity-30"
        />
      </TableCell>
      <TableCell className="font-medium">
        {item.lead_id ? (
          <Link
            href={`/dashboard/${tenantSlug}/leads/${item.lead_id}`}
            className="hover:text-primary hover:underline"
          >
            {item.lead_name ?? "—"}
          </Link>
        ) : (
          item.lead_name ?? "—"
        )}
      </TableCell>
      <TableCell className="text-sm">
        {item.lead_phone ? <div>+{item.lead_phone}</div> : null}
        {item.lead_email ? (
          <div className="text-muted-foreground text-xs">{item.lead_email}</div>
        ) : null}
      </TableCell>
      <TableCell>
        {item.lead_intent ? (
          <Badge variant="outline" className="text-xs">
            {intentLabel(item.lead_intent)}
          </Badge>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        )}
      </TableCell>
      <TableCell>
        {item.lead_source ? (
          <Badge variant="outline" className="text-xs">
            {item.lead_source}
          </Badge>
        ) : (
          <span className="text-muted-foreground text-xs">—</span>
        )}
      </TableCell>
      <TableCell>
        <Badge
          variant="outline"
          className={cn("text-xs", STATUS_STYLE[optimisticStatus])}
        >
          {t(STATUS_LABEL_KEY[optimisticStatus])}
        </Badge>
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {item.attempts > 0 ? `${item.attempts}x` : "—"}
      </TableCell>
      <TableCell>
        <div className="flex items-center gap-1">
          {optimisticStatus !== "completed" && (
            <Button
              size="icon"
              variant="ghost"
              disabled={pending}
              onClick={() => setStatus("completed")}
              title={t("row_action_completed")}
              className="text-green-600 hover:bg-green-500/10"
            >
              <Check className="size-4" />
            </Button>
          )}
          {optimisticStatus !== "no_answer" && (
            <Button
              size="icon"
              variant="ghost"
              disabled={pending}
              onClick={() => setStatus("no_answer")}
              title={t("row_action_no_answer")}
              className="text-blue-600 hover:bg-blue-500/10"
            >
              <Voicemail className="size-4" />
            </Button>
          )}
          {optimisticStatus !== "failed" && (
            <Button
              size="icon"
              variant="ghost"
              disabled={pending}
              onClick={() => setStatus("failed")}
              title={t("row_action_failed")}
              className="text-destructive hover:bg-destructive/10"
            >
              <AlertCircle className="size-4" />
            </Button>
          )}
          {optimisticStatus !== "skipped" && (
            <Button
              size="icon"
              variant="ghost"
              disabled={pending}
              onClick={() => setStatus("skipped")}
              title={t("row_action_skip")}
              className="text-muted-foreground"
            >
              <X className="size-4" />
            </Button>
          )}
          <Button
            size="icon"
            variant="ghost"
            disabled={pending}
            onClick={remove}
            title={t("row_action_remove")}
            className="text-muted-foreground hover:text-destructive"
          >
            <Trash2 className="size-4" />
          </Button>
        </div>
      </TableCell>
    </TableRow>
  );
}

export const SANDRA_QUEUE_STATUS_META = { STATUS_LABEL_KEY, STATUS_STYLE };
