import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import { unsubCopy } from "@/lib/marketing/unsubscribe-copy";
import { UnsubscribeConfirm } from "@/components/marketing/unsubscribe-confirm";

export const dynamic = "force-dynamic";

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Mask the address so the page doesn't fully expose it to a forwarded-link reader. */
function maskAddress(addr: string): string {
  if (addr.includes("@")) {
    const [u, d] = addr.split("@");
    const head = (u ?? "").slice(0, 2);
    return `${head}${"•".repeat(Math.max(1, (u ?? "").length - 2))}@${d ?? ""}`;
  }
  const digits = addr.replace(/\D/g, "");
  return digits ? `•••• ${digits.slice(-4)}` : addr;
}

async function load(token: string) {
  if (!UUID_RE.test(token)) return null;
  const svc = createServiceClient() as unknown as SupabaseClient;
  const { data } = await svc
    .from("marketing_messages")
    .select("tenant_id, to_address")
    .eq("id", token)
    .maybeSingle();
  const m = data as { tenant_id: string; to_address: string } | null;
  if (!m) return null;
  const { data: t } = await svc.from("tenants").select("name, language").eq("id", m.tenant_id).maybeSingle();
  const tenant = t as { name: string | null; language: string | null } | null;
  return { address: m.to_address, businessName: tenant?.name ?? null, language: tenant?.language ?? "es" };
}

export async function generateMetadata() {
  return { title: "Unsubscribe", robots: { index: false } };
}

export default async function UnsubscribePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const loaded = await load(token);
  const language = loaded?.language ?? "es";
  const copy = unsubCopy(language);

  return (
    <main className="min-h-dvh w-full bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-border bg-card shadow-xl p-6 sm:p-8 text-center">
          <h1 className="text-xl font-display font-extrabold tracking-tight">{copy.title}</h1>
          {loaded ? (
            <UnsubscribeConfirm
              token={token}
              language={language}
              businessName={loaded.businessName}
              maskedAddress={maskAddress(loaded.address)}
            />
          ) : (
            <p className="mt-4 text-sm text-muted-foreground">{copy.invalid}</p>
          )}
        </div>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Powered by <span className="font-semibold">BolivAI</span>
        </p>
      </div>
    </main>
  );
}
