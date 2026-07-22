# Newsroom

A full showcase module: live NZ news, ingested every 5 minutes, stored in its own
tables, referenced on the shared feed/map, and open to public discussion.

## What it demonstrates

- **Scheduled Python loader** — `run_every(300, refresh)` fetches RSS/Atom from 8 NZ
  outlets (stdlib only), deduped at the DB by `unique(url)`.
- **Own Postgres tables** (`m_newsroom_*`): `sources` (feed health), `articles`,
  `refreshes` (cycle log), `comments`.
- **References + own tables** — each new article is published as a `news-article`
  signal on the shared feed, and the article row stores that `signal_id`.
- **Realtime** — all four tables stream over the one shared channel; the Feed flashes
  **NEW** as articles arrive.
- **Storage + edge function** — the public `newsroom-comment` edge function validates
  and writes comments (name, location, body, image) with the service role, so anyone
  can post without the room token; images land in `media/newsroom/`.
- **Shared map** — articles mentioning a Wellington place are geocoded and pinned.

## Pages

- **Feed** (`/modules/newsroom`) — magazine grid, per-source filters, article reader + live discussion.
- **Map** (`/modules/newsroom/map`) — geolocated stories on the shared map.
- **Feeds & refreshes** (`/modules/newsroom/feeds`) — per-feed health + the cycle log.
- **Community** (`/modules/newsroom/community`) — live wall of public comments.

## Run it

```bash
# apply the tables (organiser, once) + deploy the comment function (needs SUPABASE_ACCESS_TOKEN)
bash scripts/apply-module-backends.sh
bash scripts/deploy-module-functions.sh newsroom

# ingest every 5 minutes (keep running):
uv run --directory modules/newsroom/loader --package newsroom-loader python -m src.main
# or a single cycle:
uv run --directory modules/newsroom/loader --package newsroom-loader python -m src.main once
```
