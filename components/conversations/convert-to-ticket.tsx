"use client";

import { useTransition } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { LifeBuoy, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { convertToTicketAction } from "@/lib/actions/tickets";

/**
 * Converts the conversation into a tracked ticket, or — when it already is one
 * — links to the Tickets board. Shown in the conversation detail header.
 */
export function ConvertToTicket({
  tenantId,
  tenantSlug,
  conversationId,
  isTicket,
}: {
  tenantId: string;
  tenantSlug: string;
  conversationId: string;
  isTicket: boolean;
}) {
  const t = useTranslations("tickets");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  if (isTicket) {
    return (
      <Button asChild variant="outline" size="sm">
        <Link href={`/dashboard/${tenantSlug}/tickets`}>
          <LifeBuoy className="size-4" />
          {t("is_ticket_badge")}
        </Link>
      </Button>
    );
  }

  function convert() {
    startTransition(async () => {
      const res = await convertToTicketAction(tenantId, conversationId);
      if (!res.ok) toast.error(res.error ?? "Error");
      else {
        toast.success(t("converted"));
        router.refresh();
      }
    });
  }

  return (
    <Button variant="outline" size="sm" onClick={convert} disabled={pending}>
      {pending ? <Loader2 className="size-4 animate-spin" /> : <LifeBuoy className="size-4" />}
      {t("convert")}
    </Button>
  );
}
