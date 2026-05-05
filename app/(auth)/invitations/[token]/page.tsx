import Link from "next/link";
import { redirect } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getUser } from "@/lib/auth";
import { acceptInvitationAction } from "@/lib/actions/auth";
import { createServiceClient } from "@/lib/supabase/service";

export const metadata = { title: "Invitación — BolivAI" };

export default async function InvitationPage({
  params,
}: {
  params: Promise<{ token: string }>;
}) {
  const { token } = await params;

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
          <CardTitle>Invitación no encontrada</CardTitle>
          <CardDescription>
            El enlace puede haber expirado o ya fue usado.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <Button asChild className="w-full">
            <Link href="/login">Ir a iniciar sesión</Link>
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
          <CardTitle>Invitación inválida</CardTitle>
          <CardDescription>
            Esta invitación ya fue usada o expiró. Pide una nueva al
            administrador de tu equipo.
          </CardDescription>
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
        <CardTitle>Aceptar invitación</CardTitle>
        <CardDescription>
          Te invitaron a unirte a <strong>{tenant?.name}</strong> como{" "}
          <em>{invitation.role as string}</em>.
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
            Aceptar y entrar
          </Button>
        </form>
      </CardContent>
    </Card>
  );
}
