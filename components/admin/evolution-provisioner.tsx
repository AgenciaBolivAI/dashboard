"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { Loader2, Smartphone, RefreshCw, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { provisionEvolutionInstanceAction } from "@/lib/actions/evolution-provision";

type Props = {
  tenantId: string;
  tenantStatus: string;
  currentInstance: string | null;
};

export function EvolutionProvisioner({ tenantId, tenantStatus, currentInstance }: Props) {
  const t = useTranslations("admin_tenant_detail");
  const [pending, startTransition] = useTransition();
  const [qrBase64, setQrBase64] = useState<string | null>(null);
  const [pairingCode, setPairingCode] = useState<string | null>(null);
  const [instanceName, setInstanceName] = useState<string | null>(null);

  const isPending = tenantStatus === "pending_whatsapp_setup";
  const isActive = tenantStatus === "active";

  function handleProvision() {
    startTransition(async () => {
      const res = await provisionEvolutionInstanceAction(tenantId);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setQrBase64(res.qr_base64 ?? null);
      setPairingCode(res.pairing_code ?? null);
      setInstanceName(res.instance_name ?? null);
      toast.success(
        isPending
          ? t("evo_toast_created")
          : t("evo_toast_regenerated"),
      );
    });
  }

  return (
    <Card className="p-5 space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h3 className="font-display font-semibold flex items-center gap-2">
            <Smartphone className="size-4 text-primary" />
            {t("evo_title")}
          </h3>
          <p className="text-xs text-muted-foreground mt-1 max-w-md">
            {isPending
              ? t("evo_desc_pending")
              : isActive
                ? t("evo_desc_active", { instance: currentInstance ?? "—" })
                : t("evo_desc_other", { status: tenantStatus })}
          </p>
        </div>
        <Badge
          variant={isActive ? "success" : isPending ? "warning" : "muted"}
          className="whitespace-nowrap"
        >
          {tenantStatus}
        </Badge>
      </div>

      <div className="flex gap-2 flex-wrap">
        <Button
          onClick={handleProvision}
          disabled={pending}
          className="gap-1.5"
        >
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : isPending ? (
            <Smartphone className="size-4" />
          ) : (
            <RefreshCw className="size-4" />
          )}
          {isPending ? t("evo_create_button") : t("evo_regen_button")}
        </Button>
        {isActive && currentInstance && (
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <CheckCircle2 className="size-3.5 text-green-500" />
            {t("evo_instance_label")}: <code className="font-mono">{currentInstance}</code>
          </div>
        )}
      </div>

      {qrBase64 && (
        <div className="border-t pt-4 space-y-3">
          <div>
            <p className="text-sm font-medium">{t("evo_scan_title")}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t.rich("evo_scan_steps", {
                instance: instanceName ?? "",
                code: (c) => <code>{c}</code>,
              })}
            </p>
          </div>
          <div className="bg-white p-4 rounded-lg w-fit shadow-sm">
            {/* The data URI from Evolution arrives already base64-encoded;
                may or may not include the data: prefix depending on version. */}
            <img
              src={qrBase64.startsWith("data:") ? qrBase64 : `data:image/png;base64,${qrBase64}`}
              alt="WhatsApp QR Code"
              className="size-64 object-contain"
            />
          </div>
          {pairingCode && (
            <div className="text-xs text-muted-foreground">
              {t("evo_pairing_label")}:{" "}
              <code className="font-mono bg-secondary px-2 py-1 rounded">
                {pairingCode}
              </code>
            </div>
          )}
          <p className="text-xs text-muted-foreground">
            {t("evo_expiry_note")}
          </p>
        </div>
      )}
    </Card>
  );
}
