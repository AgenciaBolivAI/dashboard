import Link from "next/link";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12 bg-background relative overflow-hidden">
      <div
        aria-hidden
        className="absolute inset-0 pointer-events-none"
        style={{
          background:
            "radial-gradient(ellipse 80% 50% at 50% 30%, rgba(0,229,160,0.07), transparent 70%)",
        }}
      />

      <Link href="/" className="relative z-10 mb-8 flex items-center gap-2">
        <span className="font-display text-3xl font-extrabold tracking-tight">
          Boliv<span className="text-primary">AI</span>
        </span>
      </Link>

      <div className="relative z-10 w-full max-w-md">{children}</div>

      <p className="relative z-10 mt-8 text-xs text-muted-foreground">
        © 2026 BolivAI · bolivai.com
      </p>
    </div>
  );
}
