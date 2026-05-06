import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { createServiceClient } from "@/lib/supabase/service";
import { SignUpForm } from "./signup-form";

export const metadata = { title: "Crear cuenta — BolivAI" };

export default async function SignUpPage({
  searchParams,
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const { token } = await searchParams;

  // Invitation-only: without a valid token, show a dead-end "request invite" page.
  let invitation: { email: string; tenant_name: string } | null = null;
  if (token) {
    const svc = createServiceClient();
    const { data } = await svc
      .from("invitations")
      .select("email, accepted_at, expires_at, tenants(name)")
      .eq("token", token)
      .maybeSingle();

    if (data && !data.accepted_at && new Date(data.expires_at as string) > new Date()) {
      invitation = {
        email: data.email as string,
        tenant_name: (data.tenants as { name: string } | null)?.name ?? "tu equipo",
      };
    }
  }

  if (!invitation) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Solo por invitación</CardTitle>
          <CardDescription>
            BolivAI Cloud es por invitación. Pide a tu equipo que te envíe un
            enlace de invitación, o contáctanos para empezar.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Button asChild className="w-full">
            <a
              href="https://wa.me/19703910466?text=Hola%20BolivAI%2C%20quiero%20una%20cuenta%20para%20mi%20negocio"
              target="_blank"
              rel="noopener"
            >
              Contactar por WhatsApp
            </a>
          </Button>
          <Button asChild variant="outline" className="w-full">
            <Link href="/login">Ya tengo cuenta</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Crear cuenta</CardTitle>
        <CardDescription>
          Te invitaron a unirte a {invitation.tenant_name}.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <SignUpForm invitationToken={token} prefilledEmail={invitation.email} />
        <div className="mt-6 text-xs text-muted-foreground">
          ¿Ya tienes cuenta?{" "}
          <Link href="/login" className="text-foreground hover:underline">
            Inicia sesión
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
