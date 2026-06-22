"use client";

import Link from "next/link";
import { createPortal } from "react-dom";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Menu, X } from "lucide-react";
import { Sidebar } from "./sidebar";
import type { PermissionSet } from "@/lib/permissions";
import { TenantSwitcher, type TenantOption } from "./tenant-switcher";
import { Separator } from "@/components/ui/separator";
import { cn } from "@/lib/utils";

/**
 * Mobile-only slide-in drawer that mirrors the desktop <aside> sidebar
 * (logo, tenant switcher, nav, admin link). Hidden at md+ where the
 * static sidebar takes over. Pure UI — reuses the same TenantSwitcher
 * and Sidebar components, so navigation behaves identically.
 */
export function MobileNav({
  current,
  options,
  isAdmin,
  permissions,
}: {
  current: TenantOption;
  options: TenantOption[];
  isAdmin: boolean;
  permissions?: PermissionSet;
}) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const pathname = usePathname();
  const t = useTranslations("nav");

  // Portal target only exists on the client.
  useEffect(() => setMounted(true), []);

  // Close the drawer whenever the route changes.
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  // Lock body scroll while the drawer is open.
  useEffect(() => {
    if (typeof document === "undefined") return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = open ? "hidden" : prev;
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label={t("open_menu")}
        className="md:hidden -ml-2 inline-flex items-center justify-center rounded-md p-2 text-muted-foreground hover:bg-secondary/60 hover:text-foreground transition"
      >
        <Menu className="size-5" />
      </button>

      {/* Backdrop + drawer are portaled to <body>: the header has backdrop-blur,
          which makes it the containing block for position:fixed descendants — so
          rendered in place the drawer would size to the 64px header, not the
          viewport (the nav would be clipped off-screen). The portal escapes that. */}
      {mounted
        ? createPortal(
            <>
      {/* Backdrop */}
      <div
        className={cn(
          "md:hidden fixed inset-0 z-40 bg-black/60 transition-opacity duration-200",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={() => setOpen(false)}
        aria-hidden
      />

      {/* Drawer — explicit h-[100dvh] (not inset-y-0) so iOS Safari always gives
          it the full dynamic-viewport height; the inner nav is a flex-1 min-h-0
          scroll area so it can't collapse and clip the menu. */}
      <div
        className={cn(
          "md:hidden fixed left-0 top-0 z-50 flex h-[100dvh] w-72 max-w-[85vw] flex-col border-r border-border bg-card transition-transform duration-200 ease-out",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 shrink-0 items-center gap-2 px-4 border-b border-border">
          {current.logo_url ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={current.logo_url}
              alt={current.name}
              className="h-8 w-auto max-w-[140px] object-contain"
            />
          ) : (
            <span className="font-display text-xl font-extrabold truncate">
              Boliv<span className="text-primary">AI</span>
            </span>
          )}
          {isAdmin ? (
            <span className="rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary shrink-0">
              {t("admin_badge")}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label={t("close_menu")}
            className="ml-auto inline-flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:bg-secondary/60 hover:text-foreground transition"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="px-3 py-3 shrink-0">
          <TenantSwitcher current={current} options={options} isAdmin={isAdmin} />
        </div>

        <Separator />

        <div className="min-h-0 flex-1 overflow-y-auto">
          <Sidebar tenantSlug={current.slug} permissions={permissions} />
        </div>

        {isAdmin ? (
          <>
            <Separator />
            <div className="p-2 shrink-0">
              <Link
                href="/admin"
                className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-secondary/60 hover:text-foreground transition"
              >
                {t("admin_panel")}
              </Link>
            </div>
          </>
        ) : null}
      </div>
            </>,
            document.body,
          )
        : null}
    </>
  );
}
