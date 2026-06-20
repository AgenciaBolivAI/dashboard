"use client";

import { useState, useTransition, useEffect, useRef, useCallback } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Smartphone, RefreshCw, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  provisionTenantWhatsAppAction,
  checkTenantWhatsAppStatusAction,
} from "@/lib/actions/whatsapp";

type Props = {
  tenantId: string;
  /** Live Evolution connection state at render: "open" | "close" | "no_instance" | ... */
  initialState: string;
};

/**
 * Self-serve WhatsApp connect. The tenant clicks "Conectar", we provision the
 * Evolution instance + show the QR, then poll every 3s until the phone pairs
 * (state === "open"), at which point the page refreshes as connected.
 */
export function WhatsAppConnect({ tenantId, initialState }: Props) {
  const t = useTranslations("settings_integrations");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [qr, setQr] = useState<string | null>(null);
  const [pairing, setPairing] = useState<string | null>(null);
  const [state, setState] = useState(initialState);
  const pollRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const connected = state === "open";
  const waiting = Boolean(qr) && !connected;

  const stopPolling = useCallback(() => {
    if (pollRef.current) {
      clearInterval(pollRef.current);
      pollRef.current = null;
    }
  }, []);

  const startPolling = useCallback(() => {
    stopPolling();
    pollRef.current = setInterval(async () => {
      const res = await checkTenantWhatsAppStatusAction(tenantId);
      setState(res.state);
      if (res.connected) {
        stopPolling();
        setQr(null);
        setPairing(null);
        toast.success(t("wa_connected_toast"));
        router.refresh();
      }
    }, 3000);
  }, [tenantId, stopPolling, router]);

  // Clean up the interval on unmount.
  useEffect(() => () => stopPolling(), [stopPolling]);

  function connect() {
    startTransition(async () => {
      const res = await provisionTenantWhatsAppAction(tenantId);
      if (res.error) {
        toast.error(res.error);
        return;
      }
      setQr(res.qr_base64 ?? null);
      setPairing(res.pairing_code ?? null);
      if (res.qr_base64) startPolling();
    });
  }

  if (connected) {
    return (
      <div className="flex items-center gap-2 text-sm">
        <Badge variant="success" className="gap-1.5">
          <CheckCircle2 className="size-3.5" />
          {t("wa_connected_badge")}
        </Badge>
        <span className="text-muted-foreground">
          {t("wa_connected_subtitle")}
        </span>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <p className="text-sm text-muted-foreground max-w-md">
          {t("wa_connect_intro")}
        </p>
        <Button onClick={connect} disabled={pending} className="gap-1.5">
          {pending ? (
            <Loader2 className="size-4 animate-spin" />
          ) : qr ? (
            <RefreshCw className="size-4" />
          ) : (
            <Smartphone className="size-4" />
          )}
          {qr ? t("wa_regenerate_qr") : t("wa_connect_btn")}
        </Button>
      </div>

      {qr ? (
        <div className="border-t pt-4 space-y-3">
          <div>
            <p className="text-sm font-medium">{t("wa_scan_title")}</p>
            <p className="text-xs text-muted-foreground mt-0.5">
              {t.rich("wa_scan_instructions", {
                strong: (chunks) => <strong>{chunks}</strong>,
              })}
            </p>
          </div>
          <div className="bg-white p-4 rounded-lg w-fit shadow-sm">
            <img
              src={qr.startsWith("data:") ? qr : `data:image/png;base64,${qr}`}
              alt={t("wa_qr_alt")}
              className="size-64 object-contain"
            />
          </div>
          {pairing ? (
            <div className="text-xs text-muted-foreground">
              {t("wa_pairing_label")}{" "}
              <code className="font-mono bg-secondary px-2 py-1 rounded">
                {pairing}
              </code>
            </div>
          ) : null}
          {waiting ? (
            <p className="text-xs text-muted-foreground flex items-center gap-1.5">
              <Loader2 className="size-3.5 animate-spin" />
              {t("wa_waiting")}
            </p>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
