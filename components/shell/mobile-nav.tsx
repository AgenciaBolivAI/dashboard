"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { Menu, X } from "lucide-react";
import { Sidebar } from "./sidebar";
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
}: {
  current: TenantOption;
  options: TenantOption[];
  isAdmin: boolean;
}) {
  const [open, setOpen] = useState(false);
  const pathname = usePathname();

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
        aria-label="Abrir menú"
        className="md:hidden -ml-2 inline-flex items-center justify-center rounded-md p-2 text-muted-foreground hover:bg-secondary/60 hover:text-foreground transition"
      >
        <Menu className="size-5" />
      </button>

      {/* Backdrop */}
      <div
        className={cn(
          "md:hidden fixed inset-0 z-40 bg-black/60 transition-opacity duration-200",
          open ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={() => setOpen(false)}
        aria-hidden
      />

      {/* Drawer */}
      <div
        className={cn(
          "md:hidden fixed inset-y-0 left-0 z-50 flex w-72 max-w-[85vw] flex-col border-r border-border bg-card transition-transform duration-200 ease-out",
          open ? "translate-x-0" : "-translate-x-full",
        )}
      >
        <div className="flex h-16 items-center gap-2 px-4 border-b border-border">
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
              Admin
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => setOpen(false)}
            aria-label="Cerrar menú"
            className="ml-auto inline-flex items-center justify-center rounded-md p-1.5 text-muted-foreground hover:bg-secondary/60 hover:text-foreground transition"
          >
            <X className="size-5" />
          </button>
        </div>

        <div className="px-3 py-3">
          <TenantSwitcher current={current} options={options} isAdmin={isAdmin} />
        </div>

        <Separator />

        <div className="flex-1 overflow-y-auto">
          <Sidebar tenantSlug={current.slug} />
        </div>

        {isAdmin ? (
          <>
            <Separator />
            <div className="p-2">
              <Link
                href="/admin"
                className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-secondary/60 hover:text-foreground transition"
              >
                Panel BolivAI
              </Link>
            </div>
          </>
        ) : null}
      </div>
    </>
  );
}
