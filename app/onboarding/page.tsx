import { redirect } from "next/navigation";
import { requireUser } from "@/lib/auth";
import { getMyTenants } from "@/lib/tenant";
import { OnboardingWizard } from "@/components/onboarding/wizard";

export const metadata = { title: "Configura tu agente — BolivAI" };
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
