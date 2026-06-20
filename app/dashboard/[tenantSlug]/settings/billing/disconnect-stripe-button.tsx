"use client";

import { useTransition } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { disconnectStripeAction } from "@/lib/actions/billing";

export function DisconnectStripeButton({ tenantId }: { tenantId: string }) {
  const t = useTranslations("settings_billing");
  const [pending, start] = useTransition();

  function handleClick() {
    if (!confirm(t("confirm_disconnect"))) {
      return;
    }
    start(async () => {
      const res = await disconnectStripeAction(tenantId);
      if (res.error) toast.error(res.error);
      else toast.success(t("stripe_disconnected"));
    });
  }

  return (
    <Button
      type="button"
      variant="ghost"
      onClick={handleClick}
      disabled={pending}
      className="text-muted-foreground hover:text-destructive"
    >
      <Unlink className="size-4" />
      {pending ? t("disconnecting") : t("disconnect_stripe")}
    </Button>
  );
}
