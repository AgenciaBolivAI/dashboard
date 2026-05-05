"use client";

import Link from "next/link";
import { Check, ChevronsUpDown, Plus } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { cn } from "@/lib/utils";

export type TenantOption = {
  id: string;
  slug: string;
  name: string;
  logo_url: string | null;
  primary_color: string | null;
};

export function TenantSwitcher({
  current,
  options,
  isAdmin,
}: {
  current: TenantOption;
  options: TenantOption[];
  isAdmin: boolean;
}) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button className="flex w-full items-center gap-2 rounded-md border border-border bg-card px-3 py-2 text-left text-sm hover:bg-secondary transition">
          <div
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded font-display text-xs font-bold"
            style={{
              backgroundColor: current.primary_color ?? "#00e5a0",
              color: "#000",
            }}
          >
            {current.name.slice(0, 2).toUpperCase()}
          </div>
          <span className="flex-1 truncate font-medium">{current.name}</span>
          <ChevronsUpDown className="size-4 text-muted-foreground" />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="w-64">
        <DropdownMenuLabel>Tus agentes</DropdownMenuLabel>
        {options.map((opt) => (
          <DropdownMenuItem key={opt.id} asChild>
            <Link
              href={`/dashboard/${opt.slug}/overview`}
              className={cn(
                "flex items-center gap-2",
                opt.id === current.id && "bg-accent",
              )}
            >
              <div
                className="flex h-6 w-6 items-center justify-center rounded font-display text-[10px] font-bold"
                style={{
                  backgroundColor: opt.primary_color ?? "#00e5a0",
                  color: "#000",
                }}
              >
                {opt.name.slice(0, 2).toUpperCase()}
              </div>
              <span className="flex-1 truncate">{opt.name}</span>
              {opt.id === current.id ? <Check className="size-4" /> : null}
            </Link>
          </DropdownMenuItem>
        ))}
        {isAdmin ? (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem asChild>
              <Link href="/admin/tenants/new" className="flex items-center gap-2">
                <Plus className="size-4" />
                Crear nuevo agente
              </Link>
            </DropdownMenuItem>
          </>
        ) : null}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
