/**
 * Plan definitions — single source of truth for caps, pricing and
 * feature gates. Mirrors the strategy board.
 */

export type PlanId = "starter" | "pro" | "business" | "enterprise" | "whitelabel";

export type Plan = {
  id: PlanId;
  name: string;
  monthlyPrice: number; // USD
  setupPrice: number;
  conversationsCap: number; // -1 = unlimited
  channelsCap: number; // -1 = unlimited
  hasWebApp: boolean;
  hasMemory: boolean;
  hasIntegrations: boolean;
  hasCustomBranding: boolean;
  hasReseller: boolean;
  stripePriceEnv: string;
};

export const PLANS: Record<PlanId, Plan> = {
  starter: {
    id: "starter",
    name: "Starter",
    monthlyPrice: 49,
    setupPrice: 149,
    conversationsCap: 500,
    channelsCap: 1,
    hasWebApp: false,
    hasMemory: false,
    hasIntegrations: false,
    hasCustomBranding: false,
    hasReseller: false,
    stripePriceEnv: "STRIPE_PRICE_STARTER",
  },
  pro: {
    id: "pro",
    name: "Pro",
    monthlyPrice: 99,
    setupPrice: 299,
    conversationsCap: 2000,
    channelsCap: 3,
    hasWebApp: true,
    hasMemory: true,
    hasIntegrations: false,
    hasCustomBranding: false,
    hasReseller: false,
    stripePriceEnv: "STRIPE_PRICE_PRO",
  },
  business: {
    id: "business",
    name: "Business",
    monthlyPrice: 199,
    setupPrice: 599,
    conversationsCap: -1,
    channelsCap: -1,
    hasWebApp: true,
    hasMemory: true,
    hasIntegrations: true,
    hasCustomBranding: true,
    hasReseller: false,
    stripePriceEnv: "STRIPE_PRICE_BUSINESS",
  },
  enterprise: {
    id: "enterprise",
    name: "Enterprise",
    monthlyPrice: 0, // one-time
    setupPrice: 999,
    conversationsCap: -1,
    channelsCap: -1,
    hasWebApp: true,
    hasMemory: true,
    hasIntegrations: true,
    hasCustomBranding: true,
    hasReseller: false,
    stripePriceEnv: "STRIPE_PRICE_ENTERPRISE",
  },
  whitelabel: {
    id: "whitelabel",
    name: "White Label",
    monthlyPrice: 299,
    setupPrice: 499,
    conversationsCap: -1,
    channelsCap: -1,
    hasWebApp: true,
    hasMemory: true,
    hasIntegrations: true,
    hasCustomBranding: true,
    hasReseller: true,
    stripePriceEnv: "STRIPE_PRICE_WHITELABEL",
  },
};

export function getPlan(id: string): Plan {
  return PLANS[id as PlanId] ?? PLANS.starter;
}

export function isOverConversationsCap(plan: Plan, monthCount: number) {
  return plan.conversationsCap !== -1 && monthCount >= plan.conversationsCap;
}
