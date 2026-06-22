import Link from "next/link";

/**
 * Branded 404. Renders inside the root layout (design system available). Kept
 * free of next-intl context so it can never fail the way a client component
 * using useTranslations would. Bilingual (ES primary + EN) for the global base.
 */
export const metadata = { title: "404 · BolivAI" };

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6 text-center">
      <div className="max-w-md">
        <p className="font-display text-7xl font-extrabold leading-none text-primary">404</p>
        <h1 className="mt-5 text-xl font-semibold text-foreground">Página no encontrada</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          La página que buscas no existe o fue movida.
          <br />
          <span className="opacity-70">The page you’re looking for doesn’t exist or was moved.</span>
        </p>
        <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
          <Link
            href="/dashboard"
            className="rounded-lg bg-primary px-5 py-2.5 text-sm font-semibold text-primary-foreground transition hover:opacity-90"
          >
            Ir al panel
          </Link>
          <a
            href="https://bolivai.com"
            className="rounded-lg border border-border px-5 py-2.5 text-sm font-medium text-foreground transition hover:bg-secondary/60"
          >
            bolivai.com
          </a>
        </div>
      </div>
    </div>
  );
}
