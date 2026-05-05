# BolivAI Dashboard — Scaffold Plan

This is the source of truth for what we're building, where every file
lives, and how features connect. Implementation is phased so each turn
ships something runnable.

## Stack

- **Next.js 15** (App Router, Server Components, Server Actions)
- **TypeScript** strict mode
- **Supabase** (`@supabase/ssr` for auth + DB; `@supabase/supabase-js` for realtime)
- **shadcn/ui** + **Tailwind** + Radix primitives
- **Stripe** for billing (Customer Portal + webhooks)
- **Vercel** for deployment, **Namecheap** DNS pointed at it

## High-level architecture

```
              ┌────────────────────────────────────────┐
              │      Next.js dashboard (Vercel)        │
              │  bolivai.com  +  *.bolivai.com         │
              │  +  custom client domains              │
              └──────────┬─────────────────────────────┘
                         │
        ┌────────────────┼─────────────────────────────┐
        │                │                             │
        ▼                ▼                             ▼
  ┌──────────┐    ┌─────────────┐              ┌──────────────┐
  │ Supabase │    │   n8n REST  │              │ Evolution    │
  │  Cloud   │    │ (Hostinger) │              │ API (HITL    │
  │ (DB+Auth │    │             │              │  send msg)   │
  │ +Storage │    │             │              │              │
  │ +Realtime)    │             │              │              │
  └──────────┘    └─────────────┘              └──────────────┘
                         │
                         │ webhooks
                         ▼
                   ┌──────────────┐
                   │ Stripe       │
                   └──────────────┘
```

## Folder structure

```
platform/dashboard/
├── package.json
├── tsconfig.json
├── next.config.ts
├── tailwind.config.ts
├── postcss.config.mjs
├── components.json                    # shadcn config
├── .env.example
├── .env.local                         # gitignored
├── middleware.ts                      # auth + custom-domain routing
│
├── app/
│   ├── layout.tsx                     # root, themes, fonts, providers
│   ├── globals.css
│   ├── page.tsx                       # marketing splash → redirect /login or /dashboard
│   ├── error.tsx
│   ├── not-found.tsx
│   │
│   ├── (auth)/                        # route group, auth-only layout
│   │   ├── layout.tsx
│   │   ├── login/page.tsx
│   │   ├── signup/page.tsx             # invite-only signup (token in query)
│   │   ├── forgot-password/page.tsx
│   │   ├── reset-password/page.tsx
│   │   └── invitations/[token]/page.tsx
│   │
│   ├── auth/
│   │   └── callback/route.ts          # Supabase email-confirm callback
│   │
│   ├── dashboard/
│   │   ├── layout.tsx                 # sidebar + tenant switcher + top bar
│   │   ├── page.tsx                   # → redirect to last-used tenant
│   │   │
│   │   └── [tenantSlug]/
│   │       ├── layout.tsx             # loads tenant, applies theme, gates by role
│   │       │
│   │       ├── overview/page.tsx      # KPIs: convos, leads, bookings, plan usage
│   │       │
│   │       ├── conversations/
│   │       │   ├── page.tsx           # list with filters (active/HITL/closed)
│   │       │   └── [id]/
│   │       │       ├── page.tsx       # message thread + HITL takeover panel
│   │       │       └── operator-input.tsx
│   │       │
│   │       ├── leads/
│   │       │   ├── page.tsx           # table view, filters, export CSV
│   │       │   └── [id]/page.tsx
│   │       │
│   │       ├── calendar/
│   │       │   └── page.tsx           # week/day view of slots + reservations
│   │       │
│   │       ├── staff/
│   │       │   └── page.tsx           # CRUD
│   │       │
│   │       ├── knowledge/
│   │       │   ├── page.tsx           # list documents + pain entries
│   │       │   ├── upload/page.tsx    # drag-drop file → ingestion
│   │       │   └── [type]/[id]/page.tsx
│   │       │
│   │       └── settings/
│   │           ├── layout.tsx         # tabs
│   │           ├── general/page.tsx   # name, language, timezone, support contact
│   │           ├── agent/page.tsx     # prompt template + variables editor
│   │           ├── branding/page.tsx  # logo, colors, custom domain
│   │           ├── team/page.tsx      # invite + role mgmt
│   │           ├── integrations/page.tsx  # Evolution instance, n8n status
│   │           └── billing/page.tsx   # plan + Stripe customer portal
│   │
│   ├── admin/                         # BolivAI staff only
│   │   ├── layout.tsx
│   │   ├── page.tsx                   # all tenants table
│   │   ├── tenants/
│   │   │   ├── new/page.tsx           # create tenant from template
│   │   │   └── [id]/page.tsx          # admin-edit any tenant
│   │   ├── billing/page.tsx           # cross-tenant Stripe view
│   │   └── usage/page.tsx
│   │
│   └── api/
│       ├── stripe/
│       │   ├── webhook/route.ts       # subscription created/updated/cancelled
│       │   └── checkout/route.ts      # create checkout session
│       ├── ingestion/
│       │   └── upload/route.ts        # parse + chunk + embed + insert
│       ├── operator/
│       │   ├── takeover/route.ts      # toggle hitl_taken_over
│       │   └── send/route.ts          # operator → Evolution API send
│       └── n8n/
│           └── executions/route.ts    # proxy n8n REST for execution log
│
├── components/
│   ├── ui/                            # shadcn primitives (button, dialog, etc.)
│   ├── shell/
│   │   ├── sidebar.tsx
│   │   ├── tenant-switcher.tsx
│   │   ├── user-menu.tsx
│   │   └── breadcrumbs.tsx
│   ├── conversations/
│   │   ├── conversation-list.tsx
│   │   ├── message-bubble.tsx
│   │   ├── live-thread.tsx            # Realtime subscription
│   │   └── hitl-toggle.tsx
│   ├── leads/
│   │   └── leads-table.tsx
│   ├── calendar/
│   │   ├── slot-grid.tsx
│   │   └── reservation-card.tsx
│   ├── knowledge/
│   │   └── upload-dropzone.tsx
│   ├── settings/
│   │   ├── prompt-editor.tsx          # template + var key/value editor
│   │   ├── color-picker.tsx
│   │   └── domain-config.tsx
│   ├── billing/
│   │   ├── plan-card.tsx
│   │   └── usage-bar.tsx
│   └── admin/
│       └── tenant-form.tsx
│
├── lib/
│   ├── supabase/
│   │   ├── client.ts                  # browser client
│   │   ├── server.ts                  # RSC + Server Action client
│   │   ├── middleware.ts              # session refresh helper
│   │   └── service.ts                 # service-role client (server only)
│   ├── auth.ts                        # getCurrentUser, requireRole, etc.
│   ├── tenant.ts                      # getTenantBySlug, applyTheme, etc.
│   ├── n8n.ts                         # REST wrapper (executions, workflows)
│   ├── evolution.ts                   # Evolution API wrapper (send, status)
│   ├── stripe.ts                      # Stripe SDK + helpers
│   ├── ingestion.ts                   # chunk, embed, upsert helpers
│   ├── plans.ts                       # plan definitions + caps
│   └── utils.ts                       # cn(), date helpers
│
├── types/
│   └── database.ts                    # generated from Supabase
│
└── public/
    └── ...
```

## Routes ↔ permissions

| Route                                       | Who can access                               |
|---------------------------------------------|----------------------------------------------|
| `/login`, `/signup`, `/forgot-password`     | anonymous                                    |
| `/invitations/[token]`                      | anonymous (token-gated)                      |
| `/dashboard/[slug]/...`                     | `dashboard_users` of that tenant + bolivai_admin |
| `/dashboard/[slug]/settings/team`           | `owner` or `admin` role on tenant            |
| `/dashboard/[slug]/settings/billing`        | `owner` only                                 |
| `/admin/*`                                  | `bolivai_admins` only                        |
| `/api/stripe/webhook`                       | Stripe (signature-verified)                  |
| `/api/operator/*`                           | tenant `operator` role +                     |

`requireRole(...)` helper enforces this in each layout/page server-side.

## Phasing — what each turn delivers

This turn ships the **foundation** so subsequent turns can build pages
without re-bootstrapping every time. Sequence after this turn:

1. **Phase 1 — Shell + Auth** (next turn)
   Login, signup-by-invite, sidebar, tenant switcher, dashboard root,
   `/dashboard/[slug]` layout with role gating.

2. **Phase 2 — Core pages** (read-only data)
   Overview, conversations list, conversation detail (no HITL yet),
   leads table, calendar view.

3. **Phase 3 — HITL + operator send**
   Takeover toggle, operator input box, Evolution API send route,
   Realtime live-thread updates.

4. **Phase 4 — Mutations & settings**
   Staff CRUD, calendar slot generator, prompt editor, branding.

5. **Phase 5 — Knowledge ingestion**
   Upload route → chunk → embed → upsert with `record_manager` dedup.

6. **Phase 6 — Stripe billing**
   Plan picker, Customer Portal, webhook handlers, usage caps enforcement.

7. **Phase 7 — White-label & custom domains**
   Theme provider, custom-domain middleware, branding page.

8. **Phase 8 — Admin area**
   Cross-tenant views, tenant creation wizard, plan overrides.

Each phase is one focused turn. After each, you have a deployable build.

## Conventions

- **Server Components by default**; only mark `'use client'` when needed
  (forms with state, Realtime subscriptions, popovers, etc.)
- **Server Actions** for all mutations; no separate API routes unless
  they're called from external systems (Stripe webhooks, etc.)
- **Database access**: prefer Supabase JS client over raw SQL. Use the
  service-role client only in API routes that have already authenticated
  the caller and verified permissions; never expose service-role to the
  browser.
- **Realtime**: subscribe in client components only. Channel name format
  `chat:{conversation_id}`.
- **Errors**: throw in Server Actions; let the page-level `error.tsx`
  catch them.

## What lives where in the n8n integration

The dashboard never directly executes the agent. It only:
- **Reads** rows from the same Supabase tables the n8n workflow writes
- **Writes** rows to update tenant settings (which the workflow reads on each request)
- **Calls** Evolution API directly to send operator messages during HITL
- **Triggers** n8n's REST API for ingestion sub-workflows (when we build them)
