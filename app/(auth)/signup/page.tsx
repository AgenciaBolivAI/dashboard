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

  // If a valid invitation token is present, pre-fill + tell the user which
  // tenant they're joining. Otherwise show open self-serve sign-up.
  return (
    <Card>
      <CardHeader>
        <CardTitle>Crear cuenta</CardTitle>
        <CardDescription>
          {invitation
            ? `Te invitaron a unirte a ${invitation.tenant_name}.`
            : "Crea tu cuenta y configura tu agente AI en menos de 5 minutos."}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <SignUpForm
          invitationToken={token}
          prefilledEmail={invitation?.email}
        />
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
