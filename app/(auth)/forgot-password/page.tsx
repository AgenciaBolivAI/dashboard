import Link from "next/link";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ForgotPasswordForm } from "./forgot-form";

export const metadata = { title: "Recuperar contraseña — BolivAI" };

export default function ForgotPasswordPage() {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Recuperar contraseña</CardTitle>
        <CardDescription>
          Te enviamos un enlace para restablecer tu contraseña.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <ForgotPasswordForm />
        <div className="mt-6 text-xs text-muted-foreground">
          <Link href="/login" className="hover:text-foreground transition">
            ← Volver a iniciar sesión
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
