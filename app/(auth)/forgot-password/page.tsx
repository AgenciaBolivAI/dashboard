import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { ForgotPasswordForm } from "./forgot-form";

export async function generateMetadata() {
  const t = await getTranslations("auth");
  return { title: t("forgot_meta_title") };
}

export default async function ForgotPasswordPage() {
  const t = await getTranslations("auth");
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("forgot_title")}</CardTitle>
        <CardDescription>{t("forgot_description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <ForgotPasswordForm />
        <div className="mt-6 text-xs text-muted-foreground">
          <Link href="/login" className="hover:text-foreground transition">
            {t("back_to_login")}
          </Link>
        </div>
      </CardContent>
    </Card>
  );
}
