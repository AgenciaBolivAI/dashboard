"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { createServiceClient } from "@/lib/supabase/service";

export type AuthState = { error: string | null; success?: boolean };

// ─── Sign in ─────────────────────────────────────────────────────────
const signInSchema = z.object({
  email: z.string().email("Email inválido"),
  password: z.string().min(1, "Contraseña requerida"),
  next: z.string().optional(),
});

export async function signInAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = signInSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword({
    email: parsed.data.email,
    password: parsed.data.password,
  });

  if (error) {
    return { error: "Email o contraseña incorrectos" };
  }

  revalidatePath("/", "layout");
  redirect(parsed.data.next || "/dashboard");
}

// ─── Sign up ─────────────────────────────────────────────────────────
// Invitation-only: signup is rejected unless an invitation_token is present.
// The token authenticates that the email was authorized by a tenant admin.
// Account creation goes through the admin API so it works even when public
// signups are disabled at the Supabase project level.
const signUpSchema = z
  .object({
    email: z.string().email("Email inválido"),
    password: z.string().min(8, "Mínimo 8 caracteres"),
    confirm: z.string(),
    invitation_token: z.string().optional(),
  })
  .refine((d) => d.password === d.confirm, {
    message: "Las contraseñas no coinciden",
    path: ["confirm"],
  });

export async function signUpAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = signUpSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };
  }

  if (!parsed.data.invitation_token) {
    return {
      error:
        "BolivAI es por invitación. Pide a tu equipo que te envíe un enlace de invitación, o contáctanos.",
    };
  }

  const svc = createServiceClient();
  const email = parsed.data.email.toLowerCase();

  // Validate the invitation BEFORE creating any account
  const { data: invitation } = await svc
    .from("invitations")
    .select("id, tenant_id, role, email, expires_at, accepted_at")
    .eq("token", parsed.data.invitation_token)
    .maybeSingle();

  if (!invitation) return { error: "Invitación inválida" };
  if (invitation.accepted_at) return { error: "Esta invitación ya fue usada" };
  if (new Date(invitation.expires_at as string) < new Date()) {
    return { error: "Esta invitación expiró" };
  }
  if ((invitation.email as string).toLowerCase() !== email) {
    return { error: "El email no coincide con el de la invitación" };
  }

  // Create the auth user via admin API. Pre-confirm email — the invite itself
  // is the proof of email ownership, so they skip the confirmation step.
  let userId: string | null = null;
  const { data: created, error: createErr } = await svc.auth.admin.createUser({
    email,
    password: parsed.data.password,
    email_confirm: true,
  });

  if (created?.user?.id) {
    userId = created.user.id;
  } else if (createErr) {
    // Email may already exist (e.g., user previously signed up before lockdown,
    // or already a member of another tenant). Look them up and proceed.
    const msg = createErr.message?.toLowerCase() ?? "";
    if (msg.includes("already") || msg.includes("registered") || msg.includes("exists")) {
      const { data: list } = await svc.auth.admin.listUsers({ page: 1, perPage: 200 });
      const match = list?.users?.find((u) => u.email?.toLowerCase() === email);
      if (!match) return { error: "Esta cuenta ya existe. Inicia sesión normalmente." };
      userId = match.id;
    } else {
      return { error: createErr.message };
    }
  }

  if (!userId) return { error: "No se pudo crear la cuenta" };

  // Attach to tenant + mark invitation accepted
  await acceptInvitationFor(userId, parsed.data.invitation_token);

  return { error: null, success: true };
}

// ─── Sign out ────────────────────────────────────────────────────────
export async function signOutAction() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  revalidatePath("/", "layout");
  redirect("/login");
}

// ─── Forgot password ─────────────────────────────────────────────────
const forgotSchema = z.object({ email: z.string().email() });

export async function forgotPasswordAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = forgotSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: "Email inválido" };

  const supabase = await createClient();
  const { error } = await supabase.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/reset-password`,
  });
  // Always return success to prevent email enumeration
  return { error: null, success: true };
}

// ─── Reset password ──────────────────────────────────────────────────
const resetSchema = z
  .object({
    password: z.string().min(8, "Mínimo 8 caracteres"),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: "Las contraseñas no coinciden",
    path: ["confirm"],
  });

export async function resetPasswordAction(_prev: AuthState, formData: FormData): Promise<AuthState> {
  const parsed = resetSchema.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Datos inválidos" };

  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: parsed.data.password });
  if (error) return { error: error.message };

  revalidatePath("/", "layout");
  redirect("/dashboard");
}

// ─── Accept invitation ───────────────────────────────────────────────
async function acceptInvitationFor(userId: string, token: string) {
  const svc = createServiceClient();
  const { data: invitation } = await svc
    .from("invitations")
    .select("id, tenant_id, role, email, expires_at, accepted_at")
    .eq("token", token)
    .maybeSingle();

  if (!invitation) return { error: "Invitación inválida" };
  if (invitation.accepted_at) return { error: "Esta invitación ya fue usada" };
  if (new Date(invitation.expires_at as string) < new Date()) {
    return { error: "Esta invitación expiró" };
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
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return { error: "Debes iniciar sesión primero" };

  const result = await acceptInvitationFor(user.id, token);
  if (result.error) return { error: result.error };

  revalidatePath("/", "layout");
  redirect("/dashboard");
}
