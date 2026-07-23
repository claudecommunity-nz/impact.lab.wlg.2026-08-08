# Plugin SDK changelog

This project follows semantic versioning for `@wcc-impact/plugin-sdk`. Module-manifest
compatibility is tracked separately by the numeric contract version documented in
`docs/module-contract-versioning.md`.

## 0.2.0 — 2026-07-23

- Supports module contract v1; no manifest migration or module-source change is required.
- Browser writes now require a signed-in Supabase user whose
  `app_metadata.module_id` matches the target module.
- Removed the local-development `NEXT_PUBLIC_EVENT_TOKEN` write path so module
  credentials never enter a browser bundle.
- Loader authentication is unchanged at the SDK layer; Python loaders use the
  module-scoped credential described in `docs/module-write-isolation.md`.

## 0.1.0 — 2026-07-23

- Initial event platform SDK.
- Supports module contract v1.
- Exposes the current SDK and module-contract versions for platform diagnostics.
- Existing unversioned manifests migrate with
  `pnpm migrate-module-contract <module-id>`.
