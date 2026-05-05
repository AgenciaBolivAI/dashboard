/**
 * Convert a #rrggbb hex string into HSL components. shadcn/Tailwind store
 * theme colors as `H S% L%` triplets in CSS variables (no `hsl(...)`
 * wrapper) so we can splice the tenant's chosen color into `--primary`
 * etc. and have every utility class follow.
 *
 * Defaults to the BolivAI green if the input is malformed.
 */

export type Hsl = { h: number; s: number; l: number };

const DEFAULT: Hsl = { h: 159, s: 100, l: 45 }; // #00e5a0

export function hexToHsl(hex: string): Hsl {
  const m = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!m) return DEFAULT;

  const num = parseInt(m[1], 16);
  const r = ((num >> 16) & 0xff) / 255;
  const g = ((num >> 8) & 0xff) / 255;
  const b = (num & 0xff) / 255;

  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const d = max - min;

  let h = 0;
  if (d !== 0) {
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = Math.round(h * 60);
    if (h < 0) h += 360;
  }

  const l = (max + min) / 2;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));

  return {
    h,
    s: Math.round(s * 100),
    l: Math.round(l * 100),
  };
}

/** "159 100% 45%" — directly substitutable into `--primary: <value>`. */
export function hslVar(hex: string): string {
  const { h, s, l } = hexToHsl(hex);
  return `${h} ${s}% ${l}%`;
}

/** Pick a readable foreground (black or white) for a given hex background. */
export function readableForeground(hex: string): "0 0% 0%" | "0 0% 100%" {
  const { l } = hexToHsl(hex);
  return l > 60 ? "0 0% 0%" : "0 0% 100%";
}
