import Link from "next/link";
import { ArrowLeft, Building2 } from "lucide-react";
import { getTranslations } from "next-intl/server";
import { requireUser, requireBolivAIAdmin } from "@/lib/auth";
import { UserMenu } from "@/components/shell/user-menu";
import { AdminNav } from "@/components/admin/admin-nav";
import { FxInteractions } from "@/components/fx/fx-interactions";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  await requireBolivAIAdmin();
  const t = await getTranslations("nav");

  return (
    <div className="relative isolate min-h-screen flex flex-col bg-background">
      <div className="app-backdrop" aria-hidden>
        <div className="fx-aurora" />
        <div className="fx-grid" />
        <div className="fx-vignette" />
      </div>
      <FxInteractions />
      <header className="h-16 border-b border-border bg-card flex items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="text-muted-foreground hover:text-foreground transition flex items-center gap-2 text-sm"
          >
            <ArrowLeft className="size-4" />
            {t("exit_admin")}
          </Link>
          <span className="text-muted-foreground">·</span>
          <span className="font-display font-extrabold text-lg flex items-center gap-2">
            <Building2 className="size-4 text-primary" />
            {t("admin_panel")}
          </span>
        </div>
        <UserMenu email={user.email ?? "—"} />
      </header>

      <AdminNav />

      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
