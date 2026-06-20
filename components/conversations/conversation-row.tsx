"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useLocale, useTranslations } from "next-intl";
import { MessageCircle, Instagram, MessageSquare, type LucideIcon } from "lucide-react";
import { TableCell, TableRow } from "@/components/ui/table";
import { ConversationStatusBadge } from "@/components/conversations/status-badge";
import { cn, formatRelative } from "@/lib/utils";

export type ConversationRowItem = {
  id: string;
  last_message_at: string;
  status: string;
  channel: string;
  hitl_taken_over: boolean;
  user: {
    id: string | null;
    name: string | null;
    whatsapp_number: string | null;
    channel_user_id?: string | null;
  } | null;
  last_message: { role: string; content: string } | null;
};

const CHANNEL_META: Record<string, { icon: LucideIcon; key: string }> = {
  whatsapp: { icon: MessageCircle, key: "channel_whatsapp" },
  instagram: { icon: Instagram, key: "channel_instagram" },
  facebook_messenger: { icon: MessageSquare, key: "channel_messenger" },
};

/**
 * One row of the conversations table.
 *
 * UX rule: clicking ANYWHERE on the row opens the conversation, EXCEPT
 * the customer name which goes to that customer's profile page. We use
 * onClick on <tr> + stopPropagation on the name Link to achieve this
 * cleanly (nested anchor tags would be invalid HTML).
 *
 * formatRelative is imported here (not passed as a prop) because server
 * components can't pass functions across the server/client boundary.
 */
export function ConversationRow({
  tenantSlug,
  item,
}: {
  tenantSlug: string;
  item: ConversationRowItem;
}) {
  const router = useRouter();
  const t = useTranslations("conversations");
  const locale = useLocale();
  const channelMeta = CHANNEL_META[item.channel] ?? CHANNEL_META.whatsapp!;
  const ChannelIcon = channelMeta.icon;
  // WhatsApp shows the phone; Meta channels show the channel name (the PSID is
  // an opaque id, not human-readable).
  const subline =
    item.channel === "whatsapp"
      ? item.user?.whatsapp_number
        ? `+${item.user.whatsapp_number}`
        : "—"
      : t(channelMeta.key as never);
  const conversationHref = `/dashboard/${tenantSlug}/conversations/${item.id}`;
  const customerHref = item.user?.id
    ? `/dashboard/${tenantSlug}/customers/${item.user.id}`
    : null;

  function openConversation(e: React.MouseEvent) {
    // Don't fire if the click bubbled up from an inner link / button
    if ((e.target as HTMLElement).closest("a, button")) return;
    router.push(conversationHref);
  }

  return (
    <TableRow
      onClick={openConversation}
      className="cursor-pointer hover:bg-secondary/40 transition-colors"
    >
      <TableCell>
        {customerHref ? (
          <Link
            href={customerHref}
            onClick={(e) => e.stopPropagation()}
            className="font-medium hover:text-primary hover:underline"
          >
            {item.user?.name ?? t("no_name")}
          </Link>
        ) : (
          <span className="font-medium">{item.user?.name ?? t("no_name")}</span>
        )}
        <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
          <ChannelIcon className="size-3 shrink-0" />
          <span>{subline}</span>
        </div>
      </TableCell>
      <TableCell className="max-w-md">
        {item.last_message ? (
          <p className="truncate text-sm">
            <span
              className={cn(
                "mr-1 text-[10px] uppercase tracking-wider font-bold",
                item.last_message.role === "user"
                  ? "text-muted-foreground"
                  : "text-primary",
              )}
            >
              {item.last_message.role === "user"
                ? t("role_customer")
                : t("role_bot")}
            </span>
            {item.last_message.content}
          </p>
        ) : (
          <p className="text-sm text-muted-foreground italic">
            {t("no_messages")}
          </p>
        )}
      </TableCell>
      <TableCell>
        <ConversationStatusBadge
          status={item.status}
          hitl={item.hitl_taken_over}
        />
      </TableCell>
      <TableCell className="text-xs text-muted-foreground">
        {formatRelative(item.last_message_at, locale)}
      </TableCell>
    </TableRow>
  );
}
