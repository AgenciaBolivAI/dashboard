"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import {
  BarChart3,
  Bot,
  CalendarDays,
  Coins,
  Contact,
  FileText,
  MessagesSquare,
  Receipt,
  Settings,
  Sparkles,
  Users,
  UserPlus,
  Wand2,
  Megaphone,
  PhoneCall,
  Video,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "overview", key: "overview", icon: BarChart3 },
  { href: "assistant", key: "assistant", icon: Bot },
  { href: "conversations", key: "conversations", icon: MessagesSquare },
  { href: "leads", key: "leads", icon: UserPlus },
  { href: "customers", key: "customers", icon: Contact },
  { href: "calendar", key: "calendar", icon: CalendarDays },
  { href: "invoices", key: "invoices", icon: Receipt },
  { href: "services", key: "services", icon: Sparkles },
  { href: "staff", key: "staff", icon: Users },
  { href: "knowledge", key: "knowledge", icon: FileText },
  { href: "marketing", key: "marketing", icon: Megaphone },
  { href: "content", key: "content", icon: Wand2 },
  { href: "shorts", key: "shorts", icon: Video },
  { href: "billing", key: "billing", icon: Coins },
  { href: "settings", key: "settings", icon: Settings },
] as const;

// Internal-only nav items kept for BolivAI's own tenant (single-tenant tables).
// Will get multi-tenant when sandra_call_queue gets a tenant_id column.
const BOLIVAI_ONLY_ITEMS = [
  { href: "sandra", key: "sandra_queue", icon: PhoneCall },
] as const;

export function Sidebar({ tenantSlug }: { tenantSlug: string }) {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const base = `/dashboard/${tenantSlug}`;

  const items = tenantSlug === "bolivai" ? [...NAV_ITEMS, ...BOLIVAI_ONLY_ITEMS] : NAV_ITEMS;

  return (
    <nav className="flex flex-col gap-0.5 px-2 py-2">
      {items.map(({ href, key, icon: Icon }) => {
        const fullHref = `${base}/${href}`;
        const active =
          pathname === fullHref || pathname.startsWith(`${fullHref}/`);
        return (
          <Link
            key={href}
            href={fullHref}
            className={cn(
              "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition",
              active
                ? "bg-secondary text-foreground"
                : "text-muted-foreground hover:bg-secondary/60 hover:text-foreground",
            )}
          >
            <Icon className="size-4" />
            {t(key)}
          </Link>
        );
      })}
    </nav>
  );
}
