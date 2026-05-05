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

  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.email,
    password: parsed.data.password,
    options: {
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL}/auth/callback`,
    },
  });

  if (error) return { error: error.message };
  if (!data.user) return { error: "No se pudo crear la cuenta" };

  // If invitation token, accept it now (idempotent — the token row gets marked accepted)
  if (parsed.data.invitation_token) {
    await acceptInvitationFor(data.user.id, parsed.data.invitation_token);
  }

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
