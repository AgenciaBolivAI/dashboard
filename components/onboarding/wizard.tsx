"use client";

import { useState, useTransition, useMemo } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  ArrowRight,
  Loader2,
  Building2,
  MessageCircle,
  Palette,
  Check,
} from "lucide-react";
import { toast } from "sonner";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { provisionTenantAction } from "@/lib/actions/onboarding";
import { cn } from "@/lib/utils";

const TIMEZONES = [
  "America/Bogota",
  "America/Mexico_City",
  "America/La_Paz",
  "America/Argentina/Buenos_Aires",
  "America/Santiago",
  "America/Lima",
  "America/Caracas",
  "America/New_York",
  "America/Los_Angeles",
  "Europe/Madrid",
  "Europe/Lisbon",
  "Europe/London",
];

const COUNTRIES = [
  ["BO", "Bolivia"], ["AR", "Argentina"], ["CL", "Chile"], ["CO", "Colombia"],
  ["MX", "México"], ["PE", "Perú"], ["VE", "Venezuela"], ["EC", "Ecuador"],
  ["PY", "Paraguay"], ["UY", "Uruguay"], ["US", "Estados Unidos"],
  ["ES", "España"], ["PT", "Portugal"], ["BR", "Brasil"],
] as const;

const LANGUAGES = [
  ["es", "Español"], ["en", "English"], ["pt", "Português"],
] as const;

export function OnboardingWizard({
  userEmail,
}: {
  userEmail: string;
}) {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [submitting, startSubmit] = useTransition();

  const [companyName, setCompanyName] = useState("");
  const [industry, setIndustry] = useState("");
  const [country, setCountry] = useState<string>("BO");
  // Auto-detect the signer-upper's timezone from the browser — worldwide
  // product, no region-biased default. Falls back to UTC if detection fails.
  const [timezone, setTimezone] = useState(() => {
    try {
      return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    } catch {
      return "UTC";
    }
  });
  const [language, setLanguage] = useState<"es" | "en" | "pt">("es");
  const [whatsappNumber, setWhatsappNumber] = useState("+");
  const [primaryColor, setPrimaryColor] = useState("#00e5a0");
  const [accentColor, setAccentColor] = useState("#00b87d");
  const [logoUrl, setLogoUrl] = useState("");

  // 3-step wizard: business → WhatsApp → branding. Templates are gone —
  // every tenant gets every feature, billed per use.
  const totalSteps = 3;

  // Per-step gating: which fields are required to move forward
  const canAdvance = useMemo(() => {
    if (step === 1) {
      return (
        companyName.trim().length >= 2 &&
        industry.trim().length >= 2 &&
        country.length === 2
      );
    }
    if (step === 2) return /^\+?[0-9]{8,16}$/.test(whatsappNumber.trim());
    if (step === 3) return /^#[0-9a-f]{6}$/i.test(primaryColor);
    return true;
  }, [step, companyName, industry, country, whatsappNumber, primaryColor]);

  function handleSubmit() {
    const fd = new FormData();
    fd.set("company_name", companyName);
    fd.set("industry", industry);
    fd.set("country", country);
    fd.set("timezone", timezone);
    fd.set("language", language);
    fd.set("whatsapp_number", whatsappNumber);
    fd.set("primary_color", primaryColor);
    fd.set("accent_color", accentColor);
    if (logoUrl.trim()) fd.set("logo_url", logoUrl.trim());

    startSubmit(async () => {
      const res = await provisionTenantAction({ error: null }, fd);
      if (res.error || !res.slug) {
        toast.error(res.error ?? "No se pudo crear el agente");
        return;
      }
      toast.success("Tu agente está listo. Recarga créditos para activarlo.");
      // Land on billing — agents are inert until they have credits
      router.push(`/dashboard/${res.slug}/billing?onboarding=success`);
    });
  }

  return (
    <div className="min-h-screen bg-background flex flex-col">
      <header className="border-b">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <span className="font-display text-xl font-extrabold">
            Boliv<span className="text-primary">AI</span>
          </span>
          <span className="text-xs text-muted-foreground">{userEmail}</span>
        </div>
      </header>

      <main className="flex-1 px-4 py-8">
        <div className="max-w-3xl mx-auto">
          <Stepper step={step} total={totalSteps} />

          <div className="mt-6">
            {step === 1 && (
              <Step1
                companyName={companyName}
                setCompanyName={setCompanyName}
                industry={industry}
                setIndustry={setIndustry}
                country={country}
                setCountry={setCountry}
                timezone={timezone}
                setTimezone={setTimezone}
                language={language}
                setLanguage={setLanguage}
              />
            )}
            {step === 2 && (
              <Step3
                whatsappNumber={whatsappNumber}
                setWhatsappNumber={setWhatsappNumber}
              />
            )}
            {step === 3 && (
              <Step4
                primaryColor={primaryColor}
                setPrimaryColor={setPrimaryColor}
                accentColor={accentColor}
                setAccentColor={setAccentColor}
                logoUrl={logoUrl}
                setLogoUrl={setLogoUrl}
              />
            )}
          </div>

          <div className="mt-8 flex items-center justify-between">
            <Button
              variant="ghost"
              disabled={step === 1 || submitting}
              onClick={() => setStep((s) => Math.max(1, s - 1))}
              className="gap-1.5"
            >
              <ArrowLeft className="size-4" />
              Atrás
            </Button>
            {step < totalSteps ? (
              <Button
                disabled={!canAdvance || submitting}
                onClick={() => setStep((s) => Math.min(totalSteps, s + 1))}
                className="gap-1.5"
              >
                Continuar
                <ArrowRight className="size-4" />
              </Button>
            ) : (
              <Button
                disabled={!canAdvance || submitting}
                onClick={handleSubmit}
                className="gap-1.5"
              >
                {submitting ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                Crear agente
              </Button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function Stepper({ step, total }: { step: number; total: number }) {
  const labels = [
    { icon: Building2, label: "Negocio" },
    { icon: MessageCircle, label: "WhatsApp" },
    { icon: Palette, label: "Marca" },
  ];
  return (
    <div className="flex items-center justify-between">
      {labels.map((l, i) => {
        const n = i + 1;
        const Icon = l.icon;
        const active = n === step;
        const done = n < step;
        return (
          <div key={l.label} className="flex items-center flex-1">
            <div className="flex items-center gap-2">
              <div
                className={cn(
                  "size-9 rounded-full flex items-center justify-center border-2 transition",
                  done && "bg-primary border-primary text-primary-foreground",
                  active && "border-primary text-primary",
                  !done && !active && "border-border text-muted-foreground",
                )}
              >
                {done ? <Check className="size-4" /> : <Icon className="size-4" />}
              </div>
              <span
                className={cn(
                  "text-xs font-medium hidden sm:block",
                  active ? "text-foreground" : "text-muted-foreground",
                )}
              >
                {l.label}
              </span>
            </div>
            {n < total && (
              <div
                className={cn(
                  "flex-1 h-0.5 mx-3",
                  done ? "bg-primary" : "bg-border",
                )}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

function Step1(props: {
  companyName: string; setCompanyName: (v: string) => void;
  industry: string; setIndustry: (v: string) => void;
  country: string; setCountry: (v: string) => void;
  timezone: string; setTimezone: (v: string) => void;
  language: "es" | "en" | "pt"; setLanguage: (v: "es" | "en" | "pt") => void;
}) {
  return (
    <Card className="p-6 md:p-8 space-y-5">
      <div>
        <h2 className="text-2xl font-display font-bold">Cuéntanos sobre tu negocio</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Esto configura el primer agente. Puedes cambiar todo después.
        </p>
      </div>
      <div className="space-y-1">
        <Label htmlFor="company_name">Nombre del negocio</Label>
        <Input
          id="company_name"
          value={props.companyName}
          onChange={(e) => props.setCompanyName(e.target.value)}
          placeholder="Clínica Dental Sonrisa"
          autoFocus
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="industry">Industria</Label>
        <Input
          id="industry"
          value={props.industry}
          onChange={(e) => props.setIndustry(e.target.value)}
          placeholder="Odontología, inmobiliaria, fitness, etc."
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label htmlFor="country">País</Label>
          <select
            id="country"
            value={props.country}
            onChange={(e) => props.setCountry(e.target.value)}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {COUNTRIES.map(([code, name]) => (
              <option key={code} value={code}>{name}</option>
            ))}
          </select>
        </div>
        <div className="space-y-1">
          <Label htmlFor="language">Idioma del agente</Label>
          <select
            id="language"
            value={props.language}
            onChange={(e) => props.setLanguage(e.target.value as "es" | "en" | "pt")}
            className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
          >
            {LANGUAGES.map(([code, name]) => (
              <option key={code} value={code}>{name}</option>
            ))}
          </select>
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="timezone">Zona horaria</Label>
        <select
          id="timezone"
          value={props.timezone}
          onChange={(e) => props.setTimezone(e.target.value)}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {!TIMEZONES.includes(props.timezone) ? (
            <option value={props.timezone}>{props.timezone} (detectada)</option>
          ) : null}
          {TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>{tz}</option>
          ))}
        </select>
      </div>
    </Card>
  );
}

function Step3({
  whatsappNumber,
  setWhatsappNumber,
}: {
  whatsappNumber: string;
  setWhatsappNumber: (v: string) => void;
}) {
  return (
    <Card className="p-6 md:p-8 space-y-5">
      <div>
        <h2 className="text-2xl font-display font-bold">¿Qué número usará tu agente?</h2>
        <p className="text-sm text-muted-foreground mt-1">
          El número de WhatsApp que tus clientes ven. Después de crear el agente, te
          mandamos las instrucciones para conectar este número a BolivAI (escaneo de QR).
        </p>
      </div>
      <div className="space-y-1">
        <Label htmlFor="whatsapp_number">Número con código de país</Label>
        <Input
          id="whatsapp_number"
          value={whatsappNumber}
          onChange={(e) => setWhatsappNumber(e.target.value)}
          placeholder="+591 12345678"
        />
        <p className="text-xs text-muted-foreground mt-1">
          Recomendado: un número exclusivo para el negocio. Si usas un número personal,
          tendrás que escanear el QR cada vez que cierres sesión.
        </p>
      </div>
      <div className="rounded-md bg-amber-500/10 border border-amber-500/30 px-4 py-3 text-xs text-amber-700 dark:text-amber-400">
        <strong>Setup manual:</strong> El equipo de BolivAI te contactará en menos de
        1 día hábil para conectar tu número. Mientras tanto, puedes preparar tu base
        de conocimiento y tu marca.
      </div>
    </Card>
  );
}

function Step4({
  primaryColor,
  setPrimaryColor,
  accentColor,
  setAccentColor,
  logoUrl,
  setLogoUrl,
}: {
  primaryColor: string; setPrimaryColor: (v: string) => void;
  accentColor: string; setAccentColor: (v: string) => void;
  logoUrl: string; setLogoUrl: (v: string) => void;
}) {
  return (
    <Card className="p-6 md:p-8 space-y-5">
      <div>
        <h2 className="text-2xl font-display font-bold">Tu marca</h2>
        <p className="text-sm text-muted-foreground mt-1">
          Estos colores se aplican al dashboard, emails de confirmación y enlaces.
          Puedes editarlos cuando quieras.
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label htmlFor="primary_color">Color primario</Label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              id="primary_color"
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              className="size-10 rounded border cursor-pointer"
            />
            <Input
              value={primaryColor}
              onChange={(e) => setPrimaryColor(e.target.value)}
              className="font-mono uppercase"
            />
          </div>
        </div>
        <div className="space-y-1">
          <Label htmlFor="accent_color">Color de acento</Label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              id="accent_color"
              value={accentColor}
              onChange={(e) => setAccentColor(e.target.value)}
              className="size-10 rounded border cursor-pointer"
            />
            <Input
              value={accentColor}
              onChange={(e) => setAccentColor(e.target.value)}
              className="font-mono uppercase"
            />
          </div>
        </div>
      </div>
      <div className="space-y-1">
        <Label htmlFor="logo_url">URL de logo (opcional)</Label>
        <Input
          id="logo_url"
          type="url"
          value={logoUrl}
          onChange={(e) => setLogoUrl(e.target.value)}
          placeholder="https://ejemplo.com/logo.png"
        />
        <p className="text-xs text-muted-foreground mt-1">
          Si no tienes una URL pública, puedes saltarlo y subirla después desde Ajustes.
        </p>
      </div>
      <div className="rounded-md bg-primary/10 border border-primary/30 px-4 py-3 text-xs text-foreground">
        <strong>Siguiente paso:</strong> Después de crear, te llevamos a Facturación
        para que recargues créditos. Tu agente queda <strong>en pausa</strong> hasta
        tener saldo — así no se acumulan cargos sin tu autorización.
      </div>
    </Card>
  );
}
