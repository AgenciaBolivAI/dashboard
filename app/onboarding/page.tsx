import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { requireUser } from "@/lib/auth";
import { getMyTenants } from "@/lib/tenant";
import { OnboardingWizard } from "@/components/onboarding/wizard";

export async function generateMetadata() {
  const t = await getTranslations("onboarding");
  return { title: t("page_title") };
}
export const dynamic = "force-dynamic";

export default async function OnboardingPage() {
  const user = await requireUser();
  const memberships = await getMyTenants();
  // Already onboarded — send them to their dashboard
  if (memberships.length > 0) {
    const first = memberships[0].tenant;
    if (first?.slug) redirect(`/dashboard/${first.slug}/overview`);
  }

  return <OnboardingWizard userEmail={user.email ?? ""} />;
}
