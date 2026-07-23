# Per-module write isolation

Every participant-facing read remains collaborative and public. Every write now proves
which module owns it.

| Caller | Credential | Database identity |
|---|---|---|
| Python loader | `MODULE_TOKEN` from that team's check-in card | SHA-256 lookup in `private.module_credentials` |
| Signed-in module UI | Supabase Auth JWT | Organiser-controlled `app_metadata.module_id` |
| Organiser automation | service role / privileged database connection | RLS bypass, retained for recovery and deployment |
| Legacy loader migration | old `EVENT_TOKEN` plus SDK-supplied `x-module-id` | Accepted only while an organiser-opened deadline is in the future |

The loader token is never stored in plaintext by Supabase. It is attached by
`wcc_impact` as `x-module-token`; module code never reads or handles it. The browser
client has no `NEXT_PUBLIC_*TOKEN` path. An anonymous browser is read-only, while an
authenticated JWT can write only the assigned module.

`public.module_credential_ok(id)` proves ownership for initial registration.
`public.module_write_ok(id)` adds the `modules.enabled` kill-switch. Signals,
registration/heartbeat, `media/<id>/`, and every declared `m_<id>_*` table all use
these predicates. Service-role writes remain available for organiser moderation and
reviewed edge functions.

## Participant setup

The check-in card now has one unique token for one team:

```dotenv
MODULE_TOKEN=<team-specific value>
ANTHROPIC_API_KEY=<team-specific value>
```

Leave `EVENT_TOKEN` empty. Never create `NEXT_PUBLIC_MODULE_TOKEN`, paste a token into
module source, or include it in an error report. `wcc_impact` loads the root `.env`
automatically.

If a write is rejected, check:

1. the card/token belongs to the module id passed to `register_module`,
   `publish_signal`, `upload_file`, or `module_table`;
2. the organiser has not rotated or revoked it;
3. the module is still enabled; and
4. the loader was restarted after changing `.env`.

Cross-team reads through `fetch_signals`, `useSignals`, the activity hub, public media,
and declared module tables continue unchanged.

## Organiser provisioning

These commands require `SUPABASE_DB_URL`. They never place a token in a command
argument or database row as plaintext.

```sh
# New team: prints the token once for the check-in card/password manager.
bash scripts/module-credentials.sh provision team-coast-watch

# Replace a lost/suspected token. The old token stops immediately.
bash scripts/module-credentials.sh rotate team-coast-watch

# Incident response: blocks loaders and assigned UI users immediately.
bash scripts/module-credentials.sh revoke team-coast-watch

# Safe metadata only: state, last six characters, timestamps, legacy deadline.
bash scripts/module-credentials.sh status team-coast-watch
```

Rotation does not require a dashboard build, edge-function deploy, PostgREST reload, or
database migration. Give the replacement to the team out of band; they update
`MODULE_TOKEN` and restart the loader. Rotation also clears a previous revocation but
does not change `modules.enabled`.

For browser-side uploads or module-table forms:

1. create/invite the person in Supabase Auth;
2. assign their server-controlled claim:

   ```sh
   bash scripts/module-credentials.sh assign-user person@example.nz team-coast-watch
   ```

3. have them sign out/in so the new JWT is issued.

Remove an assignment with
`bash scripts/module-credentials.sh unassign-user person@example.nz`. For immediate
incident response, revoke the module (the database checks active credential state on
every JWT write) or disable the module. A participant cannot edit `app_metadata`.

## Room-token migration

The secure default is `legacy_module_writes_until = NULL`: the shared room token writes
nothing. If cards cannot all be replaced at once:

1. have teams pull the updated `wcc_impact` first; it adds the target `x-module-id`
   automatically when only `EVENT_TOKEN` is present;
2. open the smallest practical window:

   ```sh
   bash scripts/module-credentials.sh legacy-enable 30
   ```

3. provision/distribute each `MODULE_TOKEN`, have the team replace `EVENT_TOKEN` and
   restart; and
4. close the window early:

   ```sh
   bash scripts/module-credentials.sh legacy-disable
   ```

The legacy path is intentionally weaker: anyone holding the old room token can claim a
module id while the window is open. It exists only to stage a live cutover, is capped at
24 hours by both the database and organiser script, and is visibly reported by `status`.
Never leave it open for normal event operation.

## Recovery

- **One team compromised:** revoke it; rotate; deliver the new value out of band; restart
  its loader. Other teams are unaffected.
- **Bad or offensive output:** set `modules.enabled = false` with service role/Studio.
  The tile disappears and all credential/JWT writes, heartbeats, signals, uploads, and
  custom-table writes stop immediately. Public historical rows remain available for
  organiser review.
- **Credential table/operator mistake:** service role still bypasses RLS. Inspect with
  the status command, rotate the affected module, and keep legacy mode closed.
- **Browser account assigned incorrectly:** correct/unassign the claim and have the user
  re-authenticate. Revoke/disable first when immediate containment matters.

CI recreates the complete stack and proves own-module success, cross-module denial,
public reads, authenticated UI claims, token rotation, revocation, kill-switch behavior,
and the bounded legacy window before a migration can reach `main`.
