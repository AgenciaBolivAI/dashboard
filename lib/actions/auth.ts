"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { getTranslations } from "next-intl/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";
import { TERMS_VERSION } from "@/lib/legal";

export type AuthState = { error: string | null; success?: boolean };

// ─── Sign in ─────────────────────────────────────────────────────────
export async function signInAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const t = await getTranslations("auth");
  const signInSchema = z.object({
    email: z.string().email(t("err_email_invalid")),
    password: z.string().min(1, t("err_password_required")),
    next: z.string().optional(),
  });
  const parsed = signInSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? t("err_invalid_data") };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    return { error: t("err_wrong_credentials") };
  }

  revalidatePath("/", "layout");
  redirect(parsed.data.next || "/dashboard");
}

// ─── Sign up ─────────────────────────────────────────────────────────
// Invitation-only: signup is rejected unless an invitation_token is present.
// The token authenticates that the email was authorized by a tenant admin.
// Account creation goes through the admin API so it works even when public
// signups are disabled at the Supabase project level.
export async function signUpAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const t = await getTranslations("auth");
  const signUpSchema = z
    .object({
      email: z.string().email(t("err_email_invalid")),
      password: z.string().min(8, t("err_password_min")),
      confirm: z.string(),
      invitation_token: z.string().optional(),
      accept_terms: z.string().optional(),
    })
    .refine((d) => d.password === d.confirm, {
      message: t("err_passwords_mismatch"),
      path: ["confirm"],
    });
  const parsed = signUpSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? t("err_invalid_data") };
  }

  // Terms & Privacy acceptance is mandatory to create an account. The checkbox
  // submits "on" when ticked; enforce server-side too (not just the client
  // `required` attribute) so the consent is always real.
  const termsAccepted = parsed.data.accept_terms === "on" || parsed.data.accept_terms === "true";
  if (!termsAccepted) {
    return { error: t("terms_required") };
  }

  const svc = createServiceClient();
  const email = parsed.data.email.toLowerCase();
  const hasInvitation = !!parsed.data.invitation_token;

  // Two paths:
  //  1. Invitation flow — token validates, account auto-confirms, attached to existing tenant
  //  2. Self-serve flow — account auto-confirms (sign-up implies intent), user lands on /onboarding to build their tenant
  type InvitationRow = {
    id: string;
    tenant_id: string;
    role: string;
    email: string;
    expires_at: string;
    accepted_at: string | null;
  };
  let invitation: InvitationRow | null = null;

  if (hasInvitation) {
    const { data } = await svc
      .from("invitations")
      .select("id, tenant_id, role, email, expires_at, accepted_at")
      .eq("token", parsed.data.invitation_token!)
      .maybeSingle();

    if (!data) return { error: t("err_invitation_invalid") };
    invitation = data as unknown as InvitationRow;
    if (invitation.accepted_at) return { error: t("err_invitation_used") };
    if (new Date(invitation.expires_at) < new Date()) {
      return { error: t("err_invitation_expired") };
    }
    if (invitation.email.toLowerCase() !== email) {
      return { error: t("err_invitation_email_mismatch") };
    }
  }

  let userId: string | null = null;
  const { data: created, error: createErr } = await svc.auth.admin.createUser({
    email,
    password: parsed.data.password,
    email_confirm: true,
    // Record the consent we just verified — provable later (which version, when).
    user_metadata: {
      terms_accepted_at: new Date().toISOString(),
      terms_version: TERMS_VERSION,
    },
  });

  if (created?.user?.id) {
    userId = created.user.id;
  } else if (createErr) {
    const msg = createErr.message?.toLowerCase() ?? "";
    if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
      const { data: list } = await svc.auth.admin.listUsers({ page: 1, perPage: 200 });
      const match = list?.users?.find((u) => u.email?.toLowerCase() === email);
      if (!match) return { error: t("err_account_exists") };
      userId = match.id;
    } else {
      return { error: createErr.message };
    }
  }

  if (!userId) return { error: t("err_account_create_failed") };

  if (invitation) {
    await acceptInvitationFor(userId, parsed.data.invitation_token!);
  }

  // Sign the user in so they land authenticated on /onboarding (or /dashboard
  // if invited). Pre-confirmed accounts don't need email click-through.
  const supabase = await createClient();
  const { error: signInErr } = await supabase.auth.signInWithPassword({
    email,
    password: parsed.data.password,
  });
  if (signInErr) {
    // Account exists but sign-in failed (rare — usually a wrong password we just set)
    return { error: null, success: true };
  }

  revalidatePath("/", "layout");
  redirect(hasInvitation ? "/dashboard" : "/onboarding");
}

// ─── Sign out ────────────────────────────────────────────────────────
export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}

// ─── Forgot password ─────────────────────────────────────────────────
export async function forgotPasswordAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const t = await getTranslations("auth");
  const forgotSchema = z.object({ email: z.string().email() });
  const parsed = forgotSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: t("err_email_invalid") };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/reset-password`,
  });
  // Always return success to prevent email enumeration
  return { error: null, success: true };
}

// ─── Reset password ──────────────────────────────────────────────────
export async function resetPasswordAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const t = await getTranslations("auth");
  const resetSchema = z
    .object({
      password: z.string().min(8, t("err_password_min")),
      confirm: z.string(),
    })
    .refine((d) => d.password === d.confirm, {
      message: t("err_passwords_mismatch"),
      path: ["confirm"],
    });
  const parsed = resetSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? t("err_invalid_data") };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

// ─── Accept invitation ───────────────────────────────────────────────
async function acceptInvitationFor(userId: string, token: string) {
  const t = await getTranslations("auth");
  const svc = createServiceClient();
  const { data: invitation } = await svc
    .from("invitations")
    .select("id, tenant_id, role, email, expires_at, accepted_at")
    .eq("token", token)
    .maybeSingle();

  if (!invitation) return { error: t("err_invitation_invalid") };
  if (invitation.accepted_at) return { error: t("err_invitation_used") };
  if (new Date(invitation.expires_at as string) < new Date()) {
    return { error: t("err_invitation_expired") };
  }

  await svc.from("dashboard_users").upsert(
    {
      user_id: userId,
      tenant_id: invitation.tenant_id,
      role: invitation.role,
    },
    { onConflict: "user_id,tenant_id" },
  );

  await svc
    .from("invitations")
    .update({ accepted_at: new Date().toISOString() })
    .eq("id", invitation.id);

  return { error: null };
}

export async function acceptInvitationAction(token: string): Promise<AuthState> {
  const t = await getTranslations("auth");
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: t("err_must_login_first") };

  const result = await acceptInvitationFor(user.id, token);
  if (result.error) return { error: result.error };

  revalidatePath("/", "layout");
  redirect("/dashboard");
}
