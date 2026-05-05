import { execSync } from "node:child_process";
import { writeFileSync, readFileSync, existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const envFile = resolve(root, ".env.local");

if (existsSync(envFile)) {
  for (const line of readFileSync(envFile, "utf8").split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z_][A-Z0-9_]*)\s*=\s*(.*)$/);
    if (m && !process.env[m[1]]) {
      process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
    }
  }
}

const id = process.env.SUPABASE_PROJECT_ID;
if (!id) {
  console.error(
    "✗ SUPABASE_PROJECT_ID not found. Set it in platform/dashboard/.env.local",
  );
  process.exit(1);
}

if (!/^[a-z0-9]{20}$/.test(id)) {
  console.error(`✗ SUPABASE_PROJECT_ID '${id}' looks malformed — expected 20 lowercase chars.`);
  process.exit(1);
}

console.log(`→ generating types for project ${id}…`);
try {
  const out = execSync(
    `npx supabase gen types typescript --project-id ${id} --schema public`,
    { encoding: "utf-8", stdio: ["pipe", "pipe", "inherit"] },
  );
  writeFileSync(resolve(root, "types/database.ts"), out);
  console.log("✓ types/database.ts updated");
} catch (e) {
  console.error("✗ generation failed. Did you run `npx supabase login` first?");
  process.exit(1);
}
