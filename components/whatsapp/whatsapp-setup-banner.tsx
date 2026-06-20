import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Smartphone, ArrowRight } from "lucide-react";

/**
 * Shown across the dashboard while a tenant is still `pending_whatsapp_setup`,
 * so they can jump straight to the self-serve QR connect without hunting
 * through Settings. Disappears once the phone pairs (status → active).
 */
export async function WhatsAppSetupBanner({ tenantSlug }: { tenantSlug: string }) {
  const t = await getTranslations("settings_integrations");
  return (
    <div className="bg-primary/10 border-b border-primary/30 px-4 md:px-6 py-2.5">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <p className="text-sm flex items-center gap-2">
          <Smartphone className="size-4 text-primary shrink-0" />
          <span>
            {t.rich("wa_banner_text", {
              strong: (chunks) => <strong>{chunks}</strong>,
            })}
          </span>
        </p>
        <Link
          href={`/dashboard/${tenantSlug}/settings/integrations`}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:opacity-90 transition shrink-0"
        >
          {t("wa_banner_cta")}
          <ArrowRight className="size-3.5" />
        </Link>
      </div>
    </div>
  );
}
