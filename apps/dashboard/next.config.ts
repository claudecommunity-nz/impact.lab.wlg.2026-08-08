import { readdirSync } from "node:fs";
import path from "node:path";
import { config as loadDotenv } from "dotenv";
import type { NextConfig } from "next";

// Next.js always runs with cwd = apps/dashboard (pnpm --filter, Vercel root dir),
// so the repo root is two levels up.
const repoRoot = path.resolve(process.cwd(), "../..");

// One gitignored .env at the repo root feeds the dashboard, loaders and scripts alike.
loadDotenv({ path: path.join(repoRoot, ".env") });

// Local-dev convenience: mirror the plain vars into their NEXT_PUBLIC_ names when the
// mirrors are unset/empty, so filling in EVENT_TOKEN once is enough. The URL and
// publishable key are public-by-design and always mirrored. The EVENT_TOKEN mirror is
// `next dev` ONLY: any production build (local `pnpm build`, projector machine, Vercel,
// anywhere) would inline a NEXT_PUBLIC_ token into the public JS bundle, and CONTRACTS §2
// says the built dashboard is read-only in production.
process.env.NEXT_PUBLIC_SUPABASE_URL ||= process.env.SUPABASE_URL;
process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ||= process.env.SUPABASE_PUBLISHABLE_KEY;
if (process.env.NODE_ENV === "development") {
  process.env.NEXT_PUBLIC_EVENT_TOKEN ||= process.env.EVENT_TOKEN;
}

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
