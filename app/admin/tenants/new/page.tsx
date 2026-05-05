import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { NewTenantForm } from "./new-tenant-form";

export default function NewTenantPage() {
  return (
    <div className="p-6 md:p-8 max-w-2xl">
      <Button asChild variant="ghost" size="sm" className="mb-4">
        <Link href="/admin">
          <ArrowLeft className="size-4" />
          Volver
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>Nuevo tenant</CardTitle>
          <CardDescription>
            Crea un agente nuevo. Después podrás configurar su prompt, servicios,
            personal y conectarlo a una instancia de Evolution API.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NewTenantForm />
        </CardContent>
      </Card>
    </div>
  );
}
