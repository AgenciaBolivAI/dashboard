/**
 * Maintenance page. Shown when MAINTENANCE_MODE=1 (the middleware redirects all
 * traffic here) or can be linked to directly. Static, self-contained.
 */
export const metadata = { title: "En mantenimiento · BolivAI", robots: { index: false } };
export const dynamic = "force-static";

export default function MaintenancePage() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-background px-6 text-center">
      <div className="max-w-md">
        <span className="font-display text-2xl font-extrabold text-foreground">
          Boliv<span className="text-primary">AI</span>
        </span>
        <div className="mx-auto mt-6 mb-5 size-12 rounded-full border-2 border-primary/30 border-t-primary animate-spin" />
        <h1 className="text-xl font-semibold text-foreground">Volvemos en un momento</h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Estamos haciendo mejoras en la plataforma.
          <br />
          <span className="opacity-70">We’re making improvements and will be back shortly.</span>
        </p>
        <p className="mt-6 text-xs text-muted-foreground/70">
          ¿Necesitas ayuda? · Need help?{" "}
          <a href="mailto:info@bolivai.com" className="text-primary hover:underline">info@bolivai.com</a>
        </p>
      </div>
    </div>
  );
}
