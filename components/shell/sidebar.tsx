"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  BarChart3,
  CalendarDays,
  Contact,
  FileText,
  MessagesSquare,
  Receipt,
  Settings,
  Sparkles,
  Users,
  UserPlus,
  Wand2,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "overview", label: "Resumen", icon: BarChart3 },
  { href: "conversations", label: "Conversaciones", icon: MessagesSquare },
  { href: "leads", label: "Leads", icon: UserPlus },
  { href: "customers", label: "Clientes", icon: Contact },
  { href: "calendar", label: "Calendario", icon: CalendarDays },
  { href: "invoices", label: "Facturas", icon: Receipt },
  { href: "services", label: "Servicios", icon: Sparkles },
  { href: "staff", label: "Personal", icon: Users },
  { href: "knowledge", label: "Conocimiento", icon: FileText },
  { href: "settings", label: "Ajustes", icon: Settings },
];

const BOLIVAI_ONLY_ITEMS = [
  { href: "content", label: "Contenido IA", icon: Wand2 },
];

export function Sidebar({ tenantSlug }: { tenantSlug: string }) {
  const pathname = usePathname();
  const base = `/dashboard/${tenantSlug}`;

  const items = tenantSlug === "bolivai" ? [...NAV_ITEMS, ...BOLIVAI_ONLY_ITEMS] : NAV_ITEMS;

  return (
    <nav className="flex flex-col gap-0.5 px-2 py-2">
      {items.map(({ href, label, icon: Icon }) => {
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
            {label}
          </Link>
        );
      })}
    </nav>
  );
}
