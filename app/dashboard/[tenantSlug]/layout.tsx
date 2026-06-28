import Link from "next/link";
import { getTranslations } from "next-intl/server";
import {
  requireUser,
  requireTenantAccess,
  isBolivAIAdmin,
  getRoleOnTenant,
  getEffectivePermissions,
} from "@/lib/auth";
import { recordActivity } from "@/lib/activity";
import { getTenantBySlug, getMyTenants } from "@/lib/tenant";
import { getFoundingCount, FOUNDING_CAP } from "@/lib/billing/lifetime";
import { LifetimeGate } from "@/components/billing/lifetime-gate";
import { Sidebar } from "@/components/shell/sidebar";
import { FxInteractions } from "@/components/fx/fx-interactions";
import { TenantSwitcher, type TenantOption } from "@/components/shell/tenant-switcher";
import { MobileNav } from "@/components/shell/mobile-nav";
import { UserMenu } from "@/components/shell/user-menu";
import { BalanceWidget } from "@/components/billing/balance-widget";
import { NotificationsBell } from "@/components/notifications/notifications-bell";
import { OutOfCreditsBanner } from "@/components/billing/out-of-credits-banner";
import { WhatsAppSetupBanner } from "@/components/whatsapp/whatsapp-setup-banner";
import { Separator } from "@/components/ui/separator";
import { hslVar, readableForeground } from "@/lib/color";

export async function generateMetadata({
  params,
}: {
  params: Promise<{ tenantSlug: string }>;
}) {
  const { tenantSlug } = await params;
  try {
    const tenant = await getTenantBySlug(tenantSlug);
    return {
      title: `${tenant.name} — Panel`,
      icons: tenant.logo_url ? { icon: tenant.logo_url } : undefined,
    };
  } catch {
    return { title: "Panel" };
  }
}

export default async function TenantLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ tenantSlug: string }>;
}) {
  const user = await requireUser();
  const { tenantSlug } = await params;
  const tenant = await getTenantBySlug(tenantSlug);
  await requireTenantAccess(tenant.id);
  const t = await getTranslations("nav");
  // Record DAU/WAU/MAU activity in parallel (best-effort, never blocks render).
  const [isAdmin] = await Promise.all([
    isBolivAIAdmin(),
    recordActivity(user.id, tenant.id),
  ]);

  // Founding Member gate: a tenant must hold lifetime access (the one-time $40)
  // to use the platform. BolivAI staff always pass; existing tenants were
  // grandfathered in schema-step35.
  if (!tenant.lifetime_access && !isAdmin) {
    const [foundingCount, role] = await Promise.all([
      getFoundingCount(),
      getRoleOnTenant(tenant.id),
    ]);
    const canPay = role === "owner" || role === "admin" || role === "bolivai_admin";
    return (
      <LifetimeGate
        tenantSlug={tenant.slug}
        foundingCount={foundingCount}
        cap={FOUNDING_CAP}
        canPay={canPay}
      />
    );
  }

  // RBAC: the user's effective per-feature permissions on this tenant. Drives
  // the sidebar (features the role can't READ are hidden). Legacy tiers grant
  // read everywhere, so only custom roles narrow the nav — no regression.
  const permissions = await getEffectivePermissions(tenant.id);

  const memberships = await getMyTenants();
  const tenantOptions: TenantOption[] = memberships
    .map((m) => m.tenant as TenantOption | null)
    .filter((t): t is TenantOption => t !== null);

  // If the current tenant isn't in the options (e.g. bolivai_admin viewing
  // any tenant), prepend it so the switcher renders correctly.
  const currentInList = tenantOptions.find((t) => t.id === tenant.id);
  if (!currentInList) {
    tenantOptions.unshift({
      id: tenant.id,
      slug: tenant.slug,
      name: tenant.name,
      logo_url: tenant.logo_url,
      primary_color: tenant.primary_color,
    });
  }

  // Inject the tenant's primary color into the shadcn theme variables so
  // every utility class (bg-primary, text-primary, ring, etc.) automatically
  // follows. `--primary` and friends expect "H S% L%" triplets.
  const primaryHsl = hslVar(tenant.primary_color);
  const themeStyle = {
    "--primary": primaryHsl,
    "--primary-foreground": readableForeground(tenant.primary_color),
    "--ring": primaryHsl,
    "--brand": tenant.primary_color,
    "--brand-dim": tenant.accent_color,
  } as React.CSSProperties;

  return (
    <div className="relative isolate min-h-screen flex bg-background" style={themeStyle}>
      {/* Live animated backdrop — drifting brand aurora + flowing tech grid,
          behind all content (z-index:-1, contained by `relative isolate`). */}
      <div className="app-backdrop" aria-hidden>
        <div className="fx-aurora" />
        <div className="fx-grid" />
        <div className="fx-vignette" />
      </div>
      {/* FX engine: cursor-follow glow + 3D tilt + scroll-reveal + parallax. */}
      <FxInteractions />
      {/* Sidebar */}
      <aside className="hidden md:flex md:w-64 md:flex-col border-r border-border bg-card print:hidden">
        <div className="flex h-16 items-center gap-2 px-4 border-b border-border">
          <Link href="/dashboard" className="flex items-center gap-2 min-w-0">
            {tenant.logo_url ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={tenant.logo_url}
                alt={tenant.name}
                className="h-8 w-auto max-w-[160px] object-contain"
              />
            ) : (
              <span className="font-display text-xl font-extrabold truncate">
                Boliv<span className="text-primary">AI</span>
              </span>
            )}
          </Link>
          {isAdmin ? (
            <span className="ml-auto rounded bg-primary/10 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wider text-primary shrink-0">
              {t("admin_badge")}
            </span>
          ) : null}
        </div>

        <div className="px-3 py-3">
          <TenantSwitcher
            current={{
              id: tenant.id,
              slug: tenant.slug,
              name: tenant.name,
              logo_url: tenant.logo_url,
              primary_color: tenant.primary_color,
            }}
            options={tenantOptions}
            isAdmin={isAdmin}
          />
        </div>

        <Separator />

        <div className="flex-1 overflow-y-auto">
          <Sidebar tenantSlug={tenant.slug} permissions={permissions} />
        </div>

        {isAdmin ? (
          <>
            <Separator />
            <div className="p-2">
              <Link
                href="/admin"
                className="flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-muted-foreground hover:bg-secondary/60 hover:text-foreground transition-colors"
              >
                {t("admin_panel")}
              </Link>
            </div>
          </>
        ) : null}
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="sticky top-0 z-30 h-16 border-b border-border flex items-center justify-between px-4 md:px-6 bg-card/80 backdrop-blur supports-[backdrop-filter]:bg-card/70 print:hidden">
          <div className="flex items-center gap-2 md:gap-3 min-w-0">
            <MobileNav
              current={{
                id: tenant.id,
                slug: tenant.slug,
                name: tenant.name,
                logo_url: tenant.logo_url,
                primary_color: tenant.primary_color,
              }}
              options={tenantOptions}
              isAdmin={isAdmin}
              permissions={permissions}
            />
            <span className="text-sm font-medium truncate">{tenant.name}</span>
          </div>
          <div className="flex items-center gap-2 md:gap-3">
            <BalanceWidget tenantId={tenant.id} tenantSlug={tenant.slug} />
            <NotificationsBell tenantId={tenant.id} tenantTimezone={tenant.timezone ?? "UTC"} />
            <UserMenu email={user.email ?? "—"} />
          </div>
        </header>

        {tenant.status === "pending_whatsapp_setup" ? (
          <WhatsAppSetupBanner tenantSlug={tenant.slug} />
        ) : null}
        <OutOfCreditsBanner tenantId={tenant.id} tenantSlug={tenant.slug} />

        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
