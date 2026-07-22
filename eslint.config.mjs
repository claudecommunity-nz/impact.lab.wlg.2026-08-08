// Minimal flat ESLint config — hackathon-lean on purpose.
// Module UIs, apps, and packages all share this one config.
import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/node_modules/**",
      "**/.next/**",
      "**/dist/**",
      "**/.venv/**",
      "**/registry.gen.ts", // generated on every dev/build/CI run
      "**/next-env.d.ts", // Next.js-generated, rewritten on every build
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Plain-JS scripts (e.g. .github/scripts/*.mjs) run under Node 22 — give
    // js/recommended's no-undef the runtime globals it can't infer on its own.
    files: ["**/*.mjs", "**/*.js"],
    languageOptions: {
      globals: {
        console: "readonly",
        process: "readonly",
        fetch: "readonly",
        setTimeout: "readonly",
        setInterval: "readonly",
        clearTimeout: "readonly",
        clearInterval: "readonly",
        URL: "readonly",
        Buffer: "readonly",
      },
    },
  },
  {
    rules: {
      // Raw upstream payloads (signal.raw etc.) make `any` unavoidable in a one-day build.
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
);
