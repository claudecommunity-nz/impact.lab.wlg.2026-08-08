# Supabase deployment from `main`

Production database and module-backend changes are deployed by
`.github/workflows/deploy-supabase.yml`. The workflow starts only after the normal **CI**
workflow succeeds on `main`; failed or cancelled CI never reaches the event database.

## What deploys

When the validated commit changes a deployable path, the workflow:

1. lists remote/local migration state;
2. dry-runs pending files in `supabase/migrations/`;
3. applies those migrations with `supabase db push`;
4. applies every `modules/*/backend/schema.sql` in its own transaction;
5. verifies every declared table exists with RLS, public read grants, its recorded module
   owner, module-scoped write policies, and membership in the one
   `supabase_realtime` publication;
6. deploys every `modules/*/backend/functions/*/index.ts` under its prefixed function name;
7. writes the validated commit and deployment stages to the Actions job summary.

An organiser can use **Run workflow** to retry the same process manually. Re-running is
safe: migrations are history-tracked, module schemas must be idempotent, and edge-function
deployments replace the named function.

## GitHub Production environment

The workflow uses the existing `Production` GitHub environment. Configure these environment
secrets:

| Secret | Purpose |
|---|---|
| `SUPABASE_DB_URL` | Percent-encoded session-pooler/direct Postgres URL used by the CLI and `psql` |
| `SUPABASE_URL` | Public project URL; the function deploy script derives the project ref from it |
| `SUPABASE_ACCESS_TOKEN` | Supabase personal access token used only by the CLI to deploy functions |

Do not add these to workflow YAML, repository variables, PR jobs, or committed `.env`
files. GitHub masks the secret values, and the workflow explicitly masks the database URL
and access token before any deployment command.

The environment can require organiser reviewers if a human production gate is wanted. With
no reviewer rule, a green `main` CI run deploys automatically.

## Failure and recovery

- **Dry-run fails:** nothing has changed remotely. Fix the migration on a branch and let CI
  run again.
- **Core migration push fails:** do not edit an already-applied migration. Inspect the
  migration list and add a new forward-fix migration. Supabase migrations are
  roll-forward-only in this workflow.
- **Module schema fails:** that schema file is wrapped in one transaction, so its partial
  statements roll back. Other schema files applied earlier are safe and idempotent; fix the
  failing file and rerun.
- **Verification fails:** the workflow stops before function deployment. Fix the table's
  owner-aware `wcc.enable_module_table(...)` call/policies and rerun.
- **Function deployment fails:** database work remains applied. Revert or correct the
  function commit and manually rerun the workflow; function deployment is name-idempotent.

CI runs `.github/scripts/deployment-failure-drill.sh` against the ephemeral local database.
The drill intentionally fails after creating a probe table and proves the transaction
leaves no table behind. This is the tested recovery property used by module schemas.
