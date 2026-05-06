import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { loadBolivAIStaff } from "@/lib/actions/admin";
import { AdminsManager } from "@/components/admin/admins-manager";

export default async function AdminUsersPage() {
  const staff = await loadBolivAIStaff();

  return (
    <div className="p-6 md:p-8 max-w-3xl">
      <Card>
        <CardHeader>
          <CardTitle>Equipo BolivAI</CardTitle>
          <CardDescription>
            Personas con acceso transversal a todos los tenants. Promueve a alguien
            por email — la cuenta debe existir antes (créala en Supabase → Auth → Users,
            o invita a la persona a un tenant primero).
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AdminsManager staff={staff} />
        </CardContent>
      </Card>
    </div>
  );
}
