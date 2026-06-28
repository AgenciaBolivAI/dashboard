"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { Bell, CalendarCheck, UserPlus, Info, ExternalLink, CheckCheck } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  getNotifications,
  markNotificationRead,
  markAllNotificationsRead,
  type NotificationRow,
} from "@/lib/actions/notifications";

const ICONS: Record<string, typeof Bell> = {
  reservation: CalendarCheck,
  lead: UserPlus,
  system: Info,
};

export function NotificationsBell({
  tenantId,
  tenantTimezone,
}: {
  tenantId: string;
  tenantTimezone: string;
}) {
  const t = useTranslations("notifications");
  const locale = useLocale();
  const fmtDateTime = (iso: string) =>
    new Intl.DateTimeFormat(locale, {
      dateStyle: "medium",
      timeStyle: "short",
      timeZone: tenantTimezone,
    }).format(new Date(iso));
  const router = useRouter();
  const [items, setItems] = useState<NotificationRow[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<NotificationRow | null>(null);

  const refresh = useCallback(async () => {
    try {
      const { items, unread } = await getNotifications(tenantId);
      setItems(items);
      setUnread(unread);
    } catch {
      /* ignore transient errors */
    }
  }, [tenantId]);

  // Load on mount + poll. Refresh immediately when the panel opens.
  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 45_000);
    return () => clearInterval(id);
  }, [refresh]);
  useEffect(() => {
    if (open) refresh();
  }, [open, refresh]);

  function relTime(iso: string): string {
    const diff = Date.now() - new Date(iso).getTime();
    const rtf = new Intl.RelativeTimeFormat(locale, { numeric: "auto" });
    const min = Math.round(diff / 60_000);
    if (Math.abs(min) < 60) return rtf.format(-min, "minute");
    const hr = Math.round(min / 60);
    if (Math.abs(hr) < 24) return rtf.format(-hr, "hour");
    return rtf.format(-Math.round(hr / 24), "day");
  }

  function typeLabel(type: string): string {
    return t.has(`types.${type}`) ? t(`types.${type}`) : t("types.system");
  }

  async function openDetail(n: NotificationRow) {
    setOpen(false);
    setSelected(n);
    if (!n.read_at) {
      setItems((prev) => prev.map((x) => (x.id === n.id ? { ...x, read_at: new Date().toISOString() } : x)));
      setUnread((u) => Math.max(0, u - 1));
      await markNotificationRead(tenantId, n.id);
    }
  }

  async function markAll() {
    setItems((prev) => prev.map((x) => ({ ...x, read_at: x.read_at ?? new Date().toISOString() })));
    setUnread(0);
    await markAllNotificationsRead(tenantId);
  }

  return (
    <>
      <DropdownMenu open={open} onOpenChange={setOpen}>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label={t("title")}
            className="relative inline-flex items-center justify-center size-9 rounded-full border bg-secondary hover:bg-secondary/80 transition"
          >
            <Bell className="size-4" />
            {unread > 0 ? (
              <span className="absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-primary text-primary-foreground text-[10px] font-bold flex items-center justify-center">
                {unread > 9 ? "9+" : unread}
              </span>
            ) : null}
          </button>
        </DropdownMenuTrigger>

        <DropdownMenuContent align="end" className="w-80 p-0 overflow-hidden">
          <div className="flex items-center justify-between px-3 py-2 border-b">
            <span className="text-sm font-semibold">{t("title")}</span>
            {unread > 0 ? (
              <button
                type="button"
                onClick={markAll}
                className="inline-flex items-center gap-1 text-[11px] text-muted-foreground hover:text-foreground transition"
              >
                <CheckCheck className="size-3.5" />
                {t("mark_all_read")}
              </button>
            ) : null}
          </div>

          <div className="max-h-[22rem] overflow-y-auto">
            {items.length === 0 ? (
              <p className="px-3 py-8 text-center text-xs text-muted-foreground">{t("empty")}</p>
            ) : (
              items.map((n) => {
                const Icon = ICONS[n.type] ?? Info;
                return (
                  <button
                    key={n.id}
                    type="button"
                    onClick={() => openDetail(n)}
                    className={cn(
                      "w-full text-left flex gap-3 px-3 py-2.5 border-b last:border-0 hover:bg-secondary/50 transition",
                      !n.read_at && "bg-primary/5",
                    )}
                  >
                    <span className="mt-0.5 shrink-0 flex size-7 items-center justify-center rounded-full bg-primary/10 text-primary">
                      <Icon className="size-3.5" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2">
                        <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                          {typeLabel(n.type)}
                        </span>
                        {!n.read_at ? <span className="size-1.5 rounded-full bg-primary" /> : null}
                        <span className="ml-auto text-[10px] text-muted-foreground">{relTime(n.created_at)}</span>
                      </span>
                      <span className="block truncate text-sm font-medium">{n.title}</span>
                      {n.body ? (
                        <span className="block truncate text-xs text-muted-foreground">{n.body}</span>
                      ) : null}
                    </span>
                  </button>
                );
              })
            )}
          </div>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* Deeper glance */}
      <Dialog open={!!selected} onOpenChange={(o) => !o && setSelected(null)}>
        <DialogContent>
          {selected ? (
            <>
              <DialogHeader>
                <DialogDescription className="uppercase tracking-wide text-[11px]">
                  {typeLabel(selected.type)} · {fmtDateTime(selected.created_at)}
                </DialogDescription>
                <DialogTitle>{selected.title}</DialogTitle>
              </DialogHeader>

              {selected.body ? <p className="text-sm text-muted-foreground">{selected.body}</p> : null}

              <DetailGrid meta={selected.meta} t={t} fmt={fmtDateTime} />

              <DialogFooter>
                {selected.href ? (
                  <Button
                    onClick={() => {
                      const href = selected.href!;
                      setSelected(null);
                      router.push(href);
                    }}
                  >
                    <ExternalLink className="size-4" />
                    {t("open")}
                  </Button>
                ) : null}
              </DialogFooter>
            </>
          ) : null}
        </DialogContent>
      </Dialog>
    </>
  );
}

/** Renders the structured `meta` as a clean key/value list (the deeper glance). */
function DetailGrid({
  meta,
  t,
  fmt,
}: {
  meta: Record<string, unknown>;
  t: ReturnType<typeof useTranslations>;
  fmt: (iso: string) => string;
}) {
  const LABELS = ["customer_name", "customer_email", "customer_phone", "start_at", "end_at", "name", "email", "status"];
  const rows = LABELS.filter((k) => meta[k] != null && meta[k] !== "").map((k) => [k, meta[k]] as const);
  if (rows.length === 0) return null;
  return (
    <dl className="mt-1 rounded-lg border divide-y text-sm">
      {rows.map(([k, v]) => (
        <div key={k} className="flex justify-between gap-3 px-3 py-2">
          <dt className="text-muted-foreground">{t.has(`fields.${k}`) ? t(`fields.${k}`) : k}</dt>
          <dd className="text-right font-medium truncate">{formatVal(k, v, fmt)}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Render start/end timestamps in the tenant's business timezone (via `fmt`),
 *  not the viewer's local tz. */
function formatVal(key: string, v: unknown, fmt: (iso: string) => string): string {
  if (typeof v === "string" && (key === "start_at" || key === "end_at")) {
    const d = new Date(v);
    if (!Number.isNaN(d.getTime())) return fmt(v);
  }
  return String(v);
}
