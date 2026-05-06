import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { LoginForm } from "./login-form";

export const metadata = { title: "Iniciar sesión — BolivAI" };

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  return (
    <Card>
      <CardHeader>
        <CardTitle>Iniciar sesión</CardTitle>
        <CardDescription>Accede al panel de tu agente.</CardDescription>
      </CardHeader>
      <CardContent>
        <LoginForm next={next} />
        <div className="mt-6 flex items-center justify-between text-xs text-muted-foreground">
          <Link href="/forgot-password" className="hover:text-foreground transition">
            Olvidé mi contraseña
          </Link>
          {/* No public signup link — BolivAI is invite-only.
              Invited users land directly on /signup?token=... from their invitation email. */}
        </div>
      </CardContent>
    </Card>
  );
}
