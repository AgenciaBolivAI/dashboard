import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { OAuthButtons } from "@/components/auth/oauth-buttons";
import { LoginForm } from "./login-form";

export async function generateMetadata() {
  const t = await getTranslations("auth");
  return { title: t("login_meta_title") };
}

export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next } = await searchParams;
  const t = await getTranslations("auth");
  return (
    <Card>
      <CardHeader>
        <CardTitle>{t("login_title")}</CardTitle>
        <CardDescription>{t("login_description")}</CardDescription>
      </CardHeader>
      <CardContent>
        <LoginForm next={next} />
        <div className="mt-6">
          <OAuthButtons next={next} />
        </div>
        <div className="mt-6 flex items-center justify-between text-xs text-muted-foreground">
          <Link href="/forgot-password" className="hover:text-foreground transition">
            {t("forgot_password_link")}
          </Link>
          <span>
            {t("no_account")}{" "}
            <Link href="/signup" className="text-foreground hover:underline">
              {t("sign_up_link")}
            </Link>
          </span>
        </div>
      </CardContent>
    </Card>
  );
}
