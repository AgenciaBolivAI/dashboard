/**
 * Product knowledge the assistant uses to answer "how do I…", "what is…",
 * "how much does…", and troubleshooting questions about the BolivAI platform
 * itself (not the tenant's data — that's the tools).
 *
 * Source of truth adapted from platform/docs/customer-service-knowledge-base.md
 * (Rebecca's KB), with WhatsApp connection + onboarding updated to the current
 * SELF-SERVE QR flow. Keep this current when features change.
 */
export const PLATFORM_GUIDE = `
# BolivAI platform guide (for how-to / product / pricing / troubleshooting answers)

## What BolivAI is
An AI workforce for businesses: agents that handle WhatsApp, voice calls, lead
generation, content and bookings. It is **credit-based, pay-per-use** — no
monthly subscription, no contract. You top up credits; each agent action costs a
fixed amount. **When your balance hits zero, all agents pause automatically** (by
design — no surprise charges). Top up and they resume instantly.

## Getting started (new account)
1. Sign up at bolivai.cloud/signup.
2. Onboarding wizard (3 steps): business info → WhatsApp number → brand colors/logo.
3. Connect WhatsApp yourself: **Ajustes → Integraciones → "Conectar WhatsApp"** → scan
   the QR with your business's WhatsApp (like WhatsApp Web). Status flips to active
   the moment it pairs. (A "Conecta tu WhatsApp" banner also appears until you do.)
4. Top up credits in **Facturación** so the agents can run.

## Features & where to find them
- **WhatsApp agent** — auto-replies to your customers. Edit its persona/prompt in
  **Ajustes → Agente**. Connect/reconnect the number in **Ajustes → Integraciones**.
  (For the per-reply price, call get_pricing.)
- **Asistente (this chat)** — ask about your own business data + how the platform works.
- **Calendar / reservations** — **Calendario**. Generate availability with "Generar
  slots." Cancel a booking by clicking its tile → "Cancelar reserva." If bookings show
  on the wrong day, check **Ajustes → General → Zona horaria**.
- **Services** — **Servicios → Nueva** (name, duration, price). Agents pick them up automatically.
- **Customers (CRM)** — **Clientes**. Click a customer for private notes + "Marcar como VIP."
- **Voice agents** — **Ajustes → Voz**. Attach a Twilio number (Account SID + Auth Token +
  number). Pick a voice (multilingual; uses the language in Ajustes → General). Inbound and
  outbound calls are billed per minute — call get_pricing for the current rates.
- **Invoicing** — **Facturas → Nueva**, or from a reservation → "Crear factura." Online
  payments via Stripe Connect; where Stripe isn't available you can still issue invoices
  and mark them paid manually. Refunds: contact support.
- **Marketing / AIMA (lead sourcing)** — **Marketing**. Scrapes Google Maps for verified
  business phone numbers in the verticals + cities you choose. Needs YOUR Google Maps
  Places API key (Google Cloud Console → Credentials → enable "Places API (New)"). Toggle
  it ON, pick verticals + cities, "Empezar ahora" or wait for the daily run. Then export
  leads or queue them for Sandra to cold-call. See run history under "Corridas recientes."
- **Content / CCAVAI** — **Contenido**. Generates daily social drafts (LinkedIn/Instagram/
  Facebook) with branded images. Choose the mode: **Noticias** (reacts to news from your
  RSS feeds), **Marca** (purely your business/persona), or **Mixta**. Review drafts
  (pending/approved/posted/rejected); "Regenerar imagen" re-creates an image. Publishing is
  manual today (you copy/post).
- **Video shorts / VIRA** — **Shorts**. Paste a YouTube/Vimeo/mp4 link; it transcribes,
  finds the best moments, and cuts vertical clips. Billed per input minute + output second.
- **Knowledge base** — **Conocimiento**. Upload FAQ/info docs that both the WhatsApp and
  voice agents use to answer customers. "Sincronizar con voz" pushes it to the voice agent.
- **Branding** — **Ajustes → Marca** (colors, logo) — applies to dashboard, emails, links.
- **Team** — **Ajustes → Equipo**. Invite teammates by email + role (owner/admin/operator/
  viewer). Today the invite creates a link you share with them.
- **Billing / credits** — **Facturación**: balance, top-up (bonus credits at $50/$100/$250/
  $500 tiers), full transaction ledger, and the exact price-per-action table.

## Common troubleshooting
- **"My agent isn't responding"** → FIRST check credit balance in Facturación; if zero, it
  paused itself — top up and it resumes. If credits are healthy, check **Ajustes →
  Integraciones** shows WhatsApp "Connected"; if "Disconnected," reconnect via "Conectar
  WhatsApp" (scan a fresh QR).
- **"Bookings on the wrong day"** → fix the timezone in Ajustes → General.
- **"Customers can't book"** → generate slots in Calendario.
- **"AIMA isn't running"** → needs all of: Google Maps API key set, toggle ON, verticals
  chosen, cities chosen.

## Honesty rules
- PRICES: this guide intentionally has NO price numbers. For any "how much" question call
  get_pricing (live, always current); the full table is also on **Facturación**. For a
  customer's actual spend, use the data tools. Never state a price from memory.
- If something is genuinely not self-serve yet (refunds, double-charge disputes, native
  social publishing, multiple WhatsApp numbers per account), say so plainly and tell them
  to contact BolivAI support rather than promising it.
`.trim();
