import { dirname } from "path";
import { fileURLToPath } from "url";
import { FlatCompat } from "@eslint/eslintrc";

// ESLint 9 flat-config bridge for eslint-config-next (which still ships a
// legacy "extends"-style config). FlatCompat translates the shareable config
// into flat-config objects so `next lint` / `eslint` actually runs instead of
// dropping into the interactive setup wizard (there was no config before).
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const compat = new FlatCompat({
  baseDirectory: __dirname,
});

const eslintConfig = [
  // `next/typescript` is included alongside core-web-vitals so the
  // `@typescript-eslint` plugin is registered — the codebase has inline
  // `eslint-disable @typescript-eslint/no-explicit-any` directives that would
  // otherwise error with "Definition for rule ... was not found".
  ...compat.extends("next/core-web-vitals", "next/typescript"),
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "supabase/**",
      "migrations/**",
      "scripts/**",
      "next-env.d.ts",
    ],
  },
];

export default eslintConfig;
