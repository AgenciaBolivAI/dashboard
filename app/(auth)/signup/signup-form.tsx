"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { signUpAction, type AuthState } from "@/lib/actions/auth";

const initial: AuthState = { error: null };

export function SignUpForm({
  invitationToken,
  prefilledEmail,
}: {
  invitationToken?: string;
  prefilledEmail?: string;
}) {
  const [state, action, pending] = useActionState(signUpAction, initial);

  if (state.success) {
    return (
      <div className="space-y-3 text-sm">
        <p className="font-medium text-foreground">Revisa tu email.</p>
        <p className="text-muted-foreground">
          Te enviamos un enlace de confirmación. Una vez confirmes,
          podrás iniciar sesión.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="space-y-4">
      {invitationToken ? (
        <input type="hidden" name="invitation_token" value={invitationToken} />
      ) : null}

      <div className="space-y-2">
        <Label htmlFor="email">Email</Label>
        <Input
          id="email"
          name="email"
          type="email"
          autoComplete="email"
          defaultValue={prefilledEmail}
          readOnly={!!prefilledEmail}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="password">Contraseña</Label>
        <Input
          id="password"
          name="password"
          type="password"
          autoComplete="new-password"
          minLength={8}
          required
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="confirm">Confirmar contraseña</Label>
        <Input id="confirm" name="confirm" type="password" autoComplete="new-password" required />
      </div>

      {state.error ? (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}

      <Button type="submit" className="w-full" disabled={pending}>
        {pending ? "Creando cuenta…" : "Crear cuenta"}
      </Button>
    </form>
  );
}
