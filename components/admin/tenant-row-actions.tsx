"use client";

import Link from "next/link";
import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { Pause, Play, Pencil, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { suspendTenantAction } from "@/lib/actions/admin";

export function TenantRowActions({
  tenantId,
  tenantSlug,
  status,
}: {
  tenantId: string;
  tenantSlug: string;
  status: string;
}) {
  const t = useTranslations("admin_tenants");
  const [pending, startTransition] = useTransition();
  const isPaused = status === "paused";

  function handleSuspend() {
    startTransition(async () => {
      const res = await suspendTenantAction(tenantId, !isPaused);
      if (res.error) toast.error(res.error);
      else toast.success(isPaused ? t("toast_resumed") : t("toast_paused"));
    });
  }

  return (
    <div className="flex items-center justify-end gap-1">
      <Button
        variant="ghost"
        size="icon"
        onClick={handleSuspend}
        disabled={pending}
        title={isPaused ? t("action_resume") : t("action_pause")}
      >
        {isPaused ? (
          <Play className="size-4 text-primary" />
        ) : (
          <Pause className="size-4 text-muted-foreground" />
        )}
      </Button>
      <Button asChild variant="ghost" size="icon" title={t("action_edit")}>
        <Link href={`/admin/tenants/${tenantId}`}>
          <Pencil className="size-4" />
        </Link>
      </Button>
      <Button asChild variant="ghost" size="icon" title={t("action_view_as_tenant")}>
        <Link href={`/dashboard/${tenantSlug}/overview`}>
          <ArrowRight className="size-4" />
        </Link>
      </Button>
    </div>
  );
}
