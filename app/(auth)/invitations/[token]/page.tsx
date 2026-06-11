import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getUser } from "@/lib/auth";
import { acceptInvitationAction } from "@/lib/actions/auth";
import { createServiceClient } from "@/lib/supabase/service";

export async function generateMetadata() {
  const t = await getTranslations("auth");
  return { title: t("invitation_meta_title") };
}

export default async function InvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;
  const t = await getTranslations("auth");

  const svc = createServiceClient();
  const { data: invitation } = await svc
    .from("invitations")
    .select("email, role, accepted_at, expires_at, tenants(name, slug)")
    .eq("token", token)
    .maybeSingle();

  if (!invitation) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("invitation_not_found_title")}</CardTitle>
          <CardDescription>{t("invitation_not_found_description")}</CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full">
            <Link href="/login">{t("go_to_login")}</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const expired =
    !!invitation.accepted_at ||
    new Date(invitation.expires_at as string) < new Date();

  if (expired) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>{t("invitation_invalid_title")}</CardTitle>
          <CardDescription>{t("invitation_invalid_description")}</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const tenant = invitation.tenants as { name: string; slug: string } | null;
  const user = await getUser();

  if (!user) {
    redirect(`/signup?token=${encodeURIComponent(token)}`);
  }

  // User is signed in — show "Accept" CTA
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("accept_invitation_title")}</CardTitle>
        <CardDescription>
          {t.rich("accept_invitation_description", {
            tenant: tenant?.name ?? "",
            role: invitation.role as string,
            strong: (chunks) => <strong>{chunks}</strong>,
            em: (chunks) => <em>{chunks}</em>,
          })}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <form
          action={async () => {
            "use server";
            await acceptInvitationAction(token);
          }}
        >
          <Button type="submit" className="w-full">
            {t("accept_and_enter")}
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
