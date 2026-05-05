import Link from "next/link";
import { ArrowLeft, Building2 } from "lucide-react";
import { requireUser, requireBolivAIAdmin } from "@/lib/auth";
import { UserMenu } from "@/components/shell/user-menu";
import { AdminNav } from "@/components/admin/admin-nav";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  await requireBolivAIAdmin();

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="h-16 border-b border-border bg-card flex items-center justify-between px-6">
        <div className="flex items-center gap-3">
          <Link
            href="/dashboard"
            className="text-muted-foreground hover:text-foreground transition flex items-center gap-2 text-sm"
          >
            <ArrowLeft className="size-4" />
            Salir
          </Link>
          <span className="text-muted-foreground">·</span>
          <span className="font-display font-extrabold text-lg flex items-center gap-2">
            <Building2 className="size-4 text-primary" />
            Panel BolivAI
          </span>
        </div>
        <UserMenu email={user.email ?? "—"} />
      </header>

      <AdminNav />

      <main className="flex-1 overflow-y-auto">{children}</main>
    </div>
  );
}
