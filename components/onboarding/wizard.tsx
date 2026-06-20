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
import { useTranslations } from "next-intl";
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
  const t = useTranslations("onboarding");
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
        toast.error(res.error ?? t("err_create_agent"));
        return;
      }
      toast.success(t("agent_ready"));
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
              {t("back")}
            </Button>
            {step < totalSteps ? (
              <Button
                disabled={!canAdvance || submitting}
                onClick={() => setStep((s) => Math.min(totalSteps, s + 1))}
                className="gap-1.5"
              >
                {t("continue")}
                <ArrowRight className="size-4" />
              </Button>
            ) : (
              <Button
                disabled={!canAdvance || submitting}
                onClick={handleSubmit}
                className="gap-1.5"
              >
                {submitting ? <Loader2 className="size-4 animate-spin" /> : <Check className="size-4" />}
                {t("create_agent")}
              </Button>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}

function Stepper({ step, total }: { step: number; total: number }) {
  const t = useTranslations("onboarding");
  const labels = [
    { icon: Building2, label: t("step_business") },
    { icon: MessageCircle, label: t("step_whatsapp") },
    { icon: Palette, label: t("step_brand") },
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
  const t = useTranslations("onboarding");
  return (
    <Card className="p-6 md:p-8 space-y-5">
      <div>
        <h2 className="text-2xl font-display font-bold">{t("step1_title")}</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {t("step1_description")}
        </p>
      </div>
      <div className="space-y-1">
        <Label htmlFor="company_name">{t("field_company_name")}</Label>
        <Input
          id="company_name"
          value={props.companyName}
          onChange={(e) => props.setCompanyName(e.target.value)}
          placeholder={t("placeholder_company_name")}
          autoFocus
        />
      </div>
      <div className="space-y-1">
        <Label htmlFor="industry">{t("field_industry")}</Label>
        <Input
          id="industry"
          value={props.industry}
          onChange={(e) => props.setIndustry(e.target.value)}
          placeholder={t("placeholder_industry")}
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label htmlFor="country">{t("field_country")}</Label>
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
          <Label htmlFor="language">{t("field_agent_language")}</Label>
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
        <Label htmlFor="timezone">{t("field_timezone")}</Label>
        <select
          id="timezone"
          value={props.timezone}
          onChange={(e) => props.setTimezone(e.target.value)}
          className="w-full rounded-md border bg-background px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-ring"
        >
          {!TIMEZONES.includes(props.timezone) ? (
            <option value={props.timezone}>{t("timezone_detected", { tz: props.timezone })}</option>
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
  const t = useTranslations("onboarding");
  return (
    <Card className="p-6 md:p-8 space-y-5">
      <div>
        <h2 className="text-2xl font-display font-bold">{t("step2_title")}</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {t("step2_description")}
        </p>
      </div>
      <div className="space-y-1">
        <Label htmlFor="whatsapp_number">{t("field_whatsapp_number")}</Label>
        <Input
          id="whatsapp_number"
          value={whatsappNumber}
          onChange={(e) => setWhatsappNumber(e.target.value)}
          placeholder={t("placeholder_whatsapp_number")}
        />
        <p className="text-xs text-muted-foreground mt-1">
          {t("whatsapp_number_hint")}
        </p>
      </div>
      <div className="rounded-md bg-primary/10 border border-primary/30 px-4 py-3 text-xs text-foreground">
        {t.rich("whatsapp_instant_note", {
          strong: (chunks) => <strong>{chunks}</strong>,
        })}
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
  const t = useTranslations("onboarding");
  return (
    <Card className="p-6 md:p-8 space-y-5">
      <div>
        <h2 className="text-2xl font-display font-bold">{t("step3_title")}</h2>
        <p className="text-sm text-muted-foreground mt-1">
          {t("step3_description")}
        </p>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="space-y-1">
          <Label htmlFor="primary_color">{t("field_primary_color")}</Label>
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
          <Label htmlFor="accent_color">{t("field_accent_color")}</Label>
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
        <Label htmlFor="logo_url">{t("field_logo_url")}</Label>
        <Input
          id="logo_url"
          type="url"
          value={logoUrl}
          onChange={(e) => setLogoUrl(e.target.value)}
          placeholder={t("placeholder_logo_url")}
        />
        <p className="text-xs text-muted-foreground mt-1">
          {t("logo_url_hint")}
        </p>
      </div>
      <div className="rounded-md bg-primary/10 border border-primary/30 px-4 py-3 text-xs text-foreground">
        {t.rich("next_step_note", {
          strong: (chunks) => <strong>{chunks}</strong>,
        })}
      </div>
    </Card>
  );
}
