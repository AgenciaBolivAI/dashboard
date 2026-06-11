import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { NewTenantForm } from "./new-tenant-form";

export default async function NewTenantPage() {
  const t = await getTranslations("admin_tenant_new");
  return (
    <div className="p-6 md:p-8 max-w-2xl">
      <Button asChild variant="ghost" size="sm" className="mb-4">
        <Link href="/admin">
          <ArrowLeft className="size-4" />
          {t("back")}
        </Link>
      </Button>

      <Card>
        <CardHeader>
          <CardTitle>{t("title")}</CardTitle>
          <CardDescription>
            {t("description")}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <NewTenantForm />
        </CardContent>
      </Card>
    </div>
  );
}
