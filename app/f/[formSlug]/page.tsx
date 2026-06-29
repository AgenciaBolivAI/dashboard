import { notFound } from "next/navigation";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createServiceClient } from "@/lib/supabase/service";
import type { LeadFormField } from "@/lib/queries/marketing";
import { PublicLeadForm } from "@/components/marketing/public-lead-form";

export const dynamic = "force-dynamic";

type FormRow = {
  id: string;
  tenant_id: string;
  title: string;
  description: string | null;
  fields: LeadFormField[];
  success_message: string | null;
  redirect_url: string | null;
  status: string;
};

async function loadForm(
  slug: string,
): Promise<{ form: FormRow; businessName: string | null; language: string } | null> {
  const svc = createServiceClient() as unknown as SupabaseClient;
  const { data } = await svc
    .from("lead_forms")
    .select("id, tenant_id, title, description, fields, success_message, redirect_url, status")
    .eq("slug", slug)
    .maybeSingle();
  const form = data as FormRow | null;
  if (!form || form.status !== "active") return null;
  const { data: t } = await svc.from("tenants").select("name, language").eq("id", form.tenant_id).maybeSingle();
  const tenant = t as { name: string | null; language: string | null } | null;
  return { form, businessName: tenant?.name ?? null, language: tenant?.language ?? "es" };
}

export async function generateMetadata({ params }: { params: Promise<{ formSlug: string }> }) {
  const { formSlug } = await params;
  const loaded = await loadForm(formSlug);
  if (!loaded) return { title: "Form" };
  return { title: loaded.form.title, robots: { index: false } };
}

export default async function PublicFormPage({ params }: { params: Promise<{ formSlug: string }> }) {
  const { formSlug } = await params;
  const loaded = await loadForm(formSlug);
  if (!loaded) notFound();

  const { form, businessName, language } = loaded;
  const fields = (form.fields ?? []).filter((f) => f.enabled);

  return (
    <main className="min-h-dvh w-full bg-gradient-to-b from-slate-50 to-slate-100 dark:from-slate-950 dark:to-slate-900 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="rounded-2xl border border-border bg-card shadow-xl p-6 sm:p-8">
          {businessName ? (
            <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground mb-2">
              {businessName}
            </p>
          ) : null}
          <h1 className="text-2xl font-display font-extrabold tracking-tight">{form.title}</h1>
          {form.description ? (
            <p className="mt-2 text-sm text-muted-foreground">{form.description}</p>
          ) : null}

          <PublicLeadForm
            slug={formSlug}
            fields={fields}
            successMessage={form.success_message}
            redirectUrl={form.redirect_url}
            language={language}
          />
        </div>
        <p className="mt-4 text-center text-xs text-muted-foreground">
          Powered by <span className="font-semibold">BolivAI</span>
        </p>
      </div>
    </main>
  );
}
