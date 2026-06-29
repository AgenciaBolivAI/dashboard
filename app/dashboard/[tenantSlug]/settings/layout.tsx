import { getTranslations } from "next-intl/server";
import { SettingsTabs } from "./tabs";

export default async function SettingsLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  const t = await getTranslations("settings_general");

  return (
    <div className="p-6 md:p-8 max-w-4xl">
      <h1 className="text-3xl font-display font-extrabold tracking-tight mb-1">
        {t("heading")}
      </h1>
      <p className="text-sm text-muted-foreground mb-6">
        {t("subtitle")}
      </p>

      <SettingsTabs tenantSlug={tenantSlug} />

      {children}
    </div>
  );
}
