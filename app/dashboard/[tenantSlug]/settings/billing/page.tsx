import Link from "next/link";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ExternalLink, ShieldCheck, AlertTriangle, Zap, Globe } from "lucide-react";
import { getTenantBySlug } from "@/lib/tenant";
import { isConnectExpressSupported } from "@/lib/stripe";
import { BusinessProfileForm } from "./business-profile-form";
import { DisconnectStripeButton } from "./disconnect-stripe-button";

export default async function BillingSettingsPage({
  params,
  searchParams,
}: {
  params: Promise<{ tenantSlug: string }>;
  searchParams: Promise<{ connected?: string }>;
}) {
  const { tenantSlug } = await params;
  const { connected } = await searchParams;
  const tenant = await getTenantBySlug(tenantSlug);
  const countrySupported = isConnectExpressSupported(tenant.address_country);

  return (
    <div className="space-y-6">
      {connected === "1" ? (
        <Card className="border-primary/40 bg-primary/5">
          <CardContent className="pt-6">
            <p className="text-sm flex items-center gap-2">
              <ShieldCheck className="size-4 text-primary" />
              Stripe conectado correctamente. Ya puedes emitir facturas a tus clientes.
            </p>
          </CardContent>
        </Card>
      ) : null}

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            Cobros con Stripe
            {tenant.stripe_account_id ? (
              tenant.stripe_charges_enabled ? (
                <Badge variant="success">Conectado</Badge>
              ) : (
                <Badge variant="outline">Pendiente verificación</Badge>
              )
            ) : (
              <Badge variant="outline">No conectado</Badge>
            )}
          </CardTitle>
          <CardDescription>
            Conecta tu cuenta de Stripe para cobrar facturas con tarjeta, link
            de pago, Apple/Google Pay, y suscripciones recurrentes. Los pagos
            van directo a tu cuenta — BolivAI nunca custodia el dinero.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {!tenant.stripe_account_id ? (
            <div className="space-y-3">
              {!countrySupported ? (
                <div className="flex items-start gap-2 text-xs bg-secondary/40 border border-border rounded-md p-3">
                  <Globe className="size-4 shrink-0 mt-0.5 text-muted-foreground" />
                  <div>
                    <p className="text-sm font-medium">
                      Stripe Connect aún no opera en{" "}
                      {tenant.address_country ?? "tu país"}
                    </p>
                    <p className="text-xs text-muted-foreground mt-1">
                      Puedes seguir emitiendo facturas desde BolivAI y
                      marcarlas como pagadas manualmente cuando recibas
                      transferencias o efectivo. Cuando Stripe llegue a tu
                      país, podrás conectarte y cobrar con tarjeta.
                    </p>
                  </div>
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">
                  Te llevamos a Stripe para un onboarding de ~5 minutos (datos del
                  negocio, cuenta bancaria, verificación de identidad). Después
                  volverás aquí automáticamente.
                </p>
              )}
              <Button asChild disabled={!countrySupported}>
                <a
                  href={
                    countrySupported
                      ? `/api/stripe/connect/init?tenant_id=${tenant.id}`
                      : "#"
                  }
                  aria-disabled={!countrySupported}
                  className={!countrySupported ? "pointer-events-none opacity-50" : ""}
                >
                  <Zap className="size-4" />
                  Conectar Stripe
                </a>
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              <dl className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-sm">
                <DlField label="Cuenta Stripe" value={tenant.stripe_account_id} mono />
                <DlField label="País" value={tenant.stripe_account_country ?? "—"} />
                <DlField
                  label="Estado"
                  value={
                    tenant.stripe_charges_enabled && tenant.stripe_payouts_enabled
                      ? "Listo para cobrar"
                      : "Verificación pendiente"
                  }
                />
              </dl>

              {!tenant.stripe_charges_enabled ? (
                <div className="flex items-start gap-2 text-xs text-muted-foreground bg-secondary/40 border border-border rounded-md p-3">
                  <AlertTriangle className="size-4 shrink-0 mt-0.5" />
                  <span>
                    Stripe todavía necesita información adicional para activar
                    los cobros. Abre tu cuenta de Stripe y completa los pasos
                    pendientes.
                  </span>
                </div>
              ) : null}

              <div className="flex gap-2 flex-wrap">
                <Button asChild variant="outline">
                  <a
                    href="https://dashboard.stripe.com/"
                    target="_blank"
                    rel="noreferrer"
                  >
                    <ExternalLink className="size-4" />
                    Abrir Stripe
                  </a>
                </Button>
                <DisconnectStripeButton tenantId={tenant.id} />
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Datos del negocio en facturas</CardTitle>
          <CardDescription>
            Esta información aparece en cada factura que envías a tus clientes.
            Mantenla consistente con tu registro fiscal.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <BusinessProfileForm
            tenant={{
              id: tenant.id,
              legal_name: tenant.legal_name,
              tax_id: tenant.tax_id,
              address_line1: tenant.address_line1,
              address_line2: tenant.address_line2,
              address_city: tenant.address_city,
              address_state: tenant.address_state,
              address_postal_code: tenant.address_postal_code,
              address_country: tenant.address_country,
              invoice_footer: tenant.invoice_footer,
              invoice_default_currency: tenant.invoice_default_currency,
            }}
          />
        </CardContent>
      </Card>

      <p className="text-xs text-muted-foreground">
        ¿Tienes preguntas sobre facturación o impuestos? Revisa la{" "}
        <Link
          href="https://stripe.com/docs/connect/express-accounts"
          target="_blank"
          rel="noreferrer"
          className="underline hover:text-foreground"
        >
          documentación de Stripe Connect
        </Link>
        .
      </p>
    </div>
  );
}

function DlField({
  label,
  value,
  mono,
}: {
  label: string;
  value: string;
  mono?: boolean;
}) {
  return (
    <div>
      <dt className="text-xs text-muted-foreground">{label}</dt>
      <dd className={mono ? "font-mono text-xs break-all" : ""}>{value}</dd>
    </div>
  );
}
