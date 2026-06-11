"use client";

import * as React from "react";
import { ThemeProvider as NextThemesProvider } from "next-themes";
import { Toaster } from "sonner";
import { useTheme } from "next-themes";

/**
 * Wraps the app in next-themes provider so light/dark switching persists
 * across reloads (stored in localStorage as `theme`). Also forwards the
 * current theme into Sonner's Toaster so notification colors match.
 *
 * Default is dark — that's how the dashboard was designed; light is the
 * opt-in. `defaultTheme="dark"` + `enableSystem` means we respect the OS
 * preference on first visit, then remember whatever the user picks.
 */
export function ThemeProvider({ children }: { children: React.ReactNode }) {
  return (
    <NextThemesProvider
      attribute="class"
      defaultTheme="system"
      enableSystem
      disableTransitionOnChange
    >
      {children}
      <ThemedToaster />
    </NextThemesProvider>
  );
}

function ThemedToaster() {
  const { resolvedTheme } = useTheme();
  return (
    <Toaster
      position="top-right"
      theme={resolvedTheme === "light" ? "light" : "dark"}
    />
  );
}
