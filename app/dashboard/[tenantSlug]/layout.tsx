import Link from "next/link";
import { requireUser, requireTenantAccess, isBolivAIAdmin } from "@/lib/auth";
import { getTenantBySlug, getMyTenants } from "@/lib/tenant";
import { Sidebar } from "@/components/shell/sidebar";
import { TenantSwitcher, type TenantOption } from "@/components/shell/tenant-switcher";
import { MobileNav } from "@/components/shell/mobile-nav";
import { UserMenu } from "@/components/shell/user-menu";
import { BalanceWidget } from "@/components/billing/balance-widget";
import { OutOfCreditsBanner } from "@/components/billing/out-of-credits-banner";
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
  const isAdmin = await isBolivAIAdmin();

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
    <div className="min-h-screen flex bg-background" style={themeStyle}>
      {/* Sidebar */}
      <aside className="hidden md:flex md:w-64 md:flex-col border-r border-border bg-card">
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
              Admin
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
          <Sidebar tenantSlug={tenant.slug} />
        </div>

        {isAdmin ? (
          <>
            <Separator />
            <div className="p-2">
              <Link
                href="/admin"
                className="flex items-center gap-3 rounded-md px-3 py-2 text-sm text-muted-foreground hover:bg-secondary/60 hover:text-foreground transition"
              >
                Panel BolivAI
              </Link>
            </div>
          </>
        ) : null}
      </aside>

      {/* Main */}
      <div className="flex-1 flex flex-col min-w-0">
        <header className="h-16 border-b border-border flex items-center justify-between px-4 md:px-6 bg-card">
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
            />
            <span className="text-sm text-muted-foreground truncate">{tenant.name}</span>
          </div>
          <div className="flex items-center gap-2 md:gap-3">
            <BalanceWidget tenantId={tenant.id} tenantSlug={tenant.slug} />
            <UserMenu email={user.email ?? "—"} />
          </div>
        </header>

        <OutOfCreditsBanner tenantId={tenant.id} tenantSlug={tenant.slug} />

        <main className="flex-1 overflow-y-auto">{children}</main>
      </div>
    </div>
  );
}
