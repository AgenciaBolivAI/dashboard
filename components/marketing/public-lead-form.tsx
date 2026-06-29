"use client";

import { useState, type FormEvent } from "react";
import { Loader2, CheckCircle2 } from "lucide-react";
import type { LeadFormField } from "@/lib/queries/marketing";

// The public form lives outside the dashboard's next-intl provider, so it ships
// its own tiny dictionary keyed by the tenant's content language. Field labels +
// the success message are tenant-authored (already in their language).
const DICT: Record<string, { submit: string; sending: string; thanks: string; error: string; required: string }> = {
  es: { submit: "Enviar", sending: "Enviando…", thanks: "¡Gracias! Te contactaremos pronto.", error: "No se pudo enviar. Inténtalo de nuevo.", required: "Completa los campos requeridos." },
  en: { submit: "Submit", sending: "Sending…", thanks: "Thanks! We'll be in touch soon.", error: "Could not submit. Please try again.", required: "Please complete the required fields." },
  pt: { submit: "Enviar", sending: "Enviando…", thanks: "Obrigado! Entraremos em contato em breve.", error: "Não foi possível enviar. Tente novamente.", required: "Preencha os campos obrigatórios." },
  fr: { submit: "Envoyer", sending: "Envoi…", thanks: "Merci ! Nous vous contacterons bientôt.", error: "Échec de l'envoi. Réessayez.", required: "Veuillez remplir les champs requis." },
  it: { submit: "Invia", sending: "Invio…", thanks: "Grazie! Ti contatteremo presto.", error: "Invio non riuscito. Riprova.", required: "Compila i campi obbligatori." },
};

const INPUT_CLASS =
  "flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2";

export function PublicLeadForm({
  slug,
  fields,
  successMessage,
  redirectUrl,
  language,
}: {
  slug: string;
  fields: LeadFormField[];
  successMessage: string | null;
  redirectUrl: string | null;
  language: string;
}) {
  const t = DICT[language] ?? DICT.en;
  const [values, setValues] = useState<Record<string, string>>({});
  const [hp, setHp] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set(key: string, v: string) {
    setValues((prev) => ({ ...prev, [key]: v }));
  }

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    // Client-side required check (the server re-validates).
    for (const f of fields) {
      if (f.required && !(values[f.key] ?? "").trim()) {
        setError(t.required);
        return;
      }
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/forms/${slug}/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...values, _hp: hp }),
      });
      const json = (await res.json().catch(() => ({}))) as { ok?: boolean; redirect_url?: string | null; error?: string };
      if (!res.ok || !json.ok) {
        setError(json.error || t.error);
        setSubmitting(false);
        return;
      }
      if (json.redirect_url || redirectUrl) {
        window.location.href = (json.redirect_url || redirectUrl)!;
        return;
      }
      setDone(true);
    } catch {
      setError(t.error);
      setSubmitting(false);
    }
  }

  if (done) {
    return (
      <div className="mt-6 flex flex-col items-center text-center py-6">
        <CheckCircle2 className="size-12 text-emerald-500 mb-3" />
        <p className="font-medium">{successMessage || t.thanks}</p>
      </div>
    );
  }

  return (
    <form onSubmit={onSubmit} className="mt-6 space-y-4">
      {fields.map((f) => (
        <div key={f.key} className="space-y-1.5">
          <label htmlFor={f.key} className="text-sm font-medium">
            {f.label}
            {f.required ? <span className="text-red-500"> *</span> : null}
          </label>
          {f.type === "textarea" ? (
            <textarea
              id={f.key}
              rows={4}
              className={INPUT_CLASS}
              value={values[f.key] ?? ""}
              onChange={(e) => set(f.key, e.target.value)}
              required={f.required}
              maxLength={2000}
            />
          ) : (
            <input
              id={f.key}
              type={f.type}
              className={INPUT_CLASS}
              value={values[f.key] ?? ""}
              onChange={(e) => set(f.key, e.target.value)}
              required={f.required}
              maxLength={2000}
              autoComplete={f.key === "email" ? "email" : f.key === "phone" ? "tel" : f.key === "name" ? "name" : "off"}
            />
          )}
        </div>
      ))}

      {/* Honeypot — hidden + non-semantic name so password managers / autofill
          leave it empty (bots fill every field). A filled value = bot → dropped. */}
      <input
        type="text"
        name="hp_field"
        tabIndex={-1}
        autoComplete="off"
        value={hp}
        onChange={(e) => setHp(e.target.value)}
        className="absolute -left-[9999px] h-0 w-0 opacity-0"
        aria-hidden="true"
      />

      {error ? <p className="text-sm text-red-500">{error}</p> : null}

      <button
        type="submit"
        disabled={submitting}
        className="inline-flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground transition-colors hover:bg-primary/90 disabled:opacity-60"
      >
        {submitting ? <Loader2 className="size-4 animate-spin" /> : null}
        {submitting ? t.sending : t.submit}
      </button>
    </form>
  );
}
