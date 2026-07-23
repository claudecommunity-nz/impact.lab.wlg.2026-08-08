import { readdirSync } from "node:fs";
import path from "node:path";
import { config as loadDotenv } from "dotenv";
import type { NextConfig } from "next";

// Next.js always runs with cwd = apps/dashboard (pnpm --filter, Vercel root dir),
// so the repo root is two levels up.
const repoRoot = path.resolve(process.cwd(), "../..");

// One gitignored .env at the repo root feeds the dashboard, loaders and scripts alike.
loadDotenv({ path: path.join(repoRoot, ".env") });

// Mirror only public-by-design Supabase connection values. Module credentials
// are loader-only and must never receive a NEXT_PUBLIC_ name; browser writes use
// an authenticated user's organiser-assigned module claim.
process.env.NEXT_PUBLIC_SUPABASE_URL ||= process.env.SUPABASE_URL;
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||= process.env.SUPABASE_PUBLISHABLE_KEY;

// Workspace packages are consumed as source; transpilePackages covers the webpack
// fallback (Turbopack transpiles workspace packages automatically — PLAN §3.2).
// Module packages are discovered from modules/ so nobody edits this list on the day.
let modulePackages: string[] = [];
try {
  modulePackages = readdirSync(path.join(repoRoot, "modules"), { withFileTypes: true })
    .filter((d) => d.isDirectory() && !d.name.startsWith("_") && !d.name.startsWith("."))
    .map((d) => `@modules/${d.name}`);
} catch {
  // modules/ may not exist yet — nothing extra to transpile.
}

const nextConfig: NextConfig = {
  reactStrictMode: true,
  // Pin file tracing to the monorepo root so stray lockfiles elsewhere on the
  // machine can't confuse Next's workspace-root inference.
  outputFileTracingRoot: repoRoot,
  transpilePackages: ["@wcc-impact/plugin-sdk", "@wcc-impact/scenario", "@wcc-impact/shared", "@wcc-impact/ui", ...modulePackages],
};

export default nextConfig;
