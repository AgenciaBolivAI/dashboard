import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { loadBolivAIStaff } from "@/lib/actions/admin";
import { AdminsManager } from "@/components/admin/admins-manager";
import { getTranslations } from "next-intl/server";

export default async function AdminUsersPage() {
  const staff = await loadBolivAIStaff();
  const t = await getTranslations("admin_users");

  return (
    <div className="p-6 md:p-8 max-w-3xl">
      <Card>
        <CardHeader>
          <CardTitle>{t("team_title")}</CardTitle>
          <CardDescription>
            {t("team_description")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <AdminsManager staff={staff} />
        </CardContent>
      </Card>
    </div>
  );
}
