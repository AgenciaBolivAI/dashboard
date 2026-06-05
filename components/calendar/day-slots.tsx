"use client";

import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";
import { SlotChip, type StaffOption } from "@/components/calendar/slot-editor";
import type { Slot } from "@/lib/queries/calendar";

/**
 * Renders a day column's available slots. Caps the visible list at
 * `initialVisible` and exposes a toggle button to expand/collapse the rest.
 * Lives as a client component so we can keep the calendar page server-rendered.
 */
export function DaySlots({
  slots,
  tenantId,
  tenantTimezone,
  staff,
  initialVisible = 8,
}: {
  slots: Slot[];
  tenantId: string;
  tenantTimezone: string;
  staff: StaffOption[];
  initialVisible?: number;
}) {
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? slots : slots.slice(0, initialVisible);
  const hiddenCount = slots.length - visible.length;
  const hasOverflow = slots.length > initialVisible;

  return (
    <>
      {visible.map((s) => (
        <SlotChip
          key={s.id}
          slot={s}
          tenantId={tenantId}
          tenantTimezone={tenantTimezone}
          staff={staff}
        />
      ))}
      {hasOverflow ? (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="w-full flex items-center justify-center gap-1 text-[10px] text-muted-foreground hover:text-foreground transition-colors pt-1.5"
        >
          {expanded ? (
            <>
              <ChevronUp className="size-3" />
              Mostrar menos
            </>
          ) : (
            <>
              <ChevronDown className="size-3" />
              +{hiddenCount} más
            </>
          )}
        </button>
      ) : null}
    </>
  );
}
