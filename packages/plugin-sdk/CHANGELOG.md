# Plugin SDK changelog

This project follows semantic versioning for `@wcc-impact/plugin-sdk`. Module-manifest
compatibility is tracked separately by the numeric contract version documented in
`docs/module-contract-versioning.md`.

## 0.1.0 — 2026-07-23

- Initial event platform SDK.
- Supports module contract v1.
- Exposes the current SDK and module-contract versions for platform diagnostics.
- Existing unversioned manifests migrate with
  `pnpm migrate-module-contract <module-id>`.
