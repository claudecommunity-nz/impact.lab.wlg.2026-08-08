# Module contract and Plugin SDK versioning

The module contract is the compatibility boundary between a checked-in
`module.config.ts` and the dashboard build that discovers and mounts it. The Plugin SDK
has its own package version because additive UI APIs can evolve without changing the
manifest contract.

Current compatibility:

| Platform contract | Accepted manifest contracts | Plugin SDK | Status |
|---|---|---|---|
| v1 | v1 | 0.2.x | Current |

Every manifest pins a numeric literal:

```ts
export default defineModule({
  contractVersion: 1,
  id: "team-outage-watch",
  // ...
});
```

Do not import the platform's current-version constant into a manifest. A literal makes a
module's declared contract visible in code review and prevents a dependency update from
silently claiming compatibility. `pnpm new-module` writes the current literal into every
new scaffold. `pnpm gen` rejects missing, unsupported legacy, and future versions with the
module id and a recovery command.

## Migrating a module

Run the explicit source migration, inspect its diff, and regenerate the registry:

```sh
pnpm migrate-module-contract team-outage-watch
pnpm gen
pnpm test:contracts
```

The first registered migration is the legacy unversioned contract (treated as v0) to v1.
It inserts `contractVersion: 1` immediately after `defineModule({` and makes no other
semantic changes. The command is idempotent: running it on a v1 manifest reports that the
module is already current.

Migrations run one version at a time. They never downgrade and never guess when a
transform is missing. For a future v2:

1. add the v1-to-v2 source transform to `scripts/module-contract-migrations.ts`;
2. change `CURRENT_MODULE_CONTRACT_VERSION` and the supported transition window in
   `packages/shared/src/contract-version.ts`;
3. update the scaffold, compatibility tests, this matrix, and the SDK changelog;
4. regenerate `docs/generated/` and migrate each checked-in module deliberately; and
5. inspect `/activity` to confirm every registered module declares a supported version.

Keep the previous contract in `SUPPORTED_MODULE_CONTRACT_VERSIONS` only when the platform
can genuinely mount it without adaptation. Remove it in a separately announced breaking
release after checked-in modules have migrated.

## Release policy

- Increment the **contract version** only for a breaking manifest, mounting, shared data,
  or security-boundary change that requires module authors to act.
- Use a Plugin SDK **patch** release for compatible fixes and documentation.
- Use a Plugin SDK **minor** release for additive exports or optional behavior that keeps
  existing module source compatible.
- Use a Plugin SDK **major** release for breaking TypeScript/UI APIs. If that break also
  changes what the platform can safely mount, pair it with a module-contract bump and
  migration.
- Record participant-visible changes in `packages/plugin-sdk/CHANGELOG.md`. Each entry
  states the supported module contract, migration command when applicable, and whether
  existing module source must change.

The dashboard exposes its current contract, Plugin SDK package version, supported
versions, and each registered module's declaration in `/activity`. These are diagnostics,
not runtime overrides: compatibility remains enforced by `pnpm gen` and CI.
