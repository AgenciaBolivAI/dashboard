import Link from "next/link";
import { redirect } from "next/navigation";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { requireUser, isBolivAIAdmin } from "@/lib/auth";
import { getMyTenants } from "@/lib/tenant";

export default async function DashboardIndex() {
  await requireUser();
  const memberships = await getMyTenants();

  if (memberships.length > 0) {
    const first = memberships[0].tenant;
    if (first?.slug) redirect(`/dashboard/${first.slug}/overview`);
  }

  const isAdmin = await isBolivAIAdmin();

  // Non-admin user without any tenant → self-serve onboarding
  if (!isAdmin) {
    redirect("/onboarding");
  }

  return (
    <div className="min-h-screen flex items-center justify-center px-4">
      <Card className="max-w-md w-full">
        <CardHeader>
          <CardTitle>{isAdmin ? "Aún no hay agentes" : "Aún no tienes agentes"}</CardTitle>
          <CardDescription>
            {isAdmin
              ? "No hay tenants creados todavía. Crea el primero desde el panel de BolivAI."
              : "Espera la invitación de tu equipo o contáctanos si crees que esto es un error."}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          {isAdmin ? (
            <>
              <Button asChild className="w-full">
                <Link href="/admin/tenants/new">Crear primer agente</Link>
              </Button>
              <Button asChild variant="outline" className="w-full">
                <Link href="/admin">Ir al panel BolivAI</Link>
              </Button>
            </>
          ) : (
            <>
              <Button asChild className="w-full">
                <a href="mailto:hola@bolivai.com">Contactar a BolivAI</a>
              </Button>
              <Button asChild variant="outline" className="w-full">
                <Link href="/login">Volver a iniciar sesión</Link>
              </Button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
