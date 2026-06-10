import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requireUser, isBolivAIAdmin } from "@/lib/auth";
import { getMyTenants } from "@/lib/tenant";

export default async function DashboardIndex() {
  await requireUser();

  // Routing precedence (highest to lowest):
  //   1. BolivAI admin → /admin/overview (founder dashboard)
  //   2. Has tenant memberships → first tenant's overview
  //   3. Neither → /onboarding to create their first tenant
  //
  // Admins reach a tenant view by clicking through /admin/tenants → "Ver
  // como tenant", or via the tenant switcher in the sidebar. Direct URLs
  // (e.g. bookmarks of /dashboard/<slug>/...) still work — only the bare
  // /dashboard index does the admin redirect.
  const isAdmin = await isBolivAIAdmin();
  if (isAdmin) {
    redirect("/admin/overview");
  }

  const memberships = await getMyTenants();
  if (memberships.length > 0) {
    const first = memberships[0].tenant;
    if (first?.slug) redirect(`/dashboard/${first.slug}/overview`);
  }

  // Non-admin without any tenant → self-serve onboarding
  redirect("/onboarding");
}
