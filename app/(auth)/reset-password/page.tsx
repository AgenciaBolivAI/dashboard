import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ResetPasswordForm } from "./reset-form";

export async function generateMetadata() {
  const t = await getTranslations("auth");
  return { title: t("reset_meta_title") };
}

export default async function ResetPasswordPage() {
  const t = await getTranslations("auth");
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("reset_title")}</CardTitle>
        <CardDescription>{t("reset_description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <ResetPasswordForm />
      </CardContent>
    </Card>
  );
}
