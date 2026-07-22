#!/usr/bin/env bash
# Heavy install for the devcontainer — runs at Codespaces PREBUILD time
# (onCreateCommand / updateContentCommand), so the result is baked into the
# prebuilt image (PLAN §12.1). postCreateCommand then does a fast incremental
# `pnpm install && uv sync` at Codespace creation.
#
# Usage: bash .devcontainer/on-create.sh   (run from the repo root)
set -euo pipefail

# pnpm via corepack, version pinned by the root package.json "packageManager"
# field. `|| sudo` covers images where the node install dir is root-owned.
corepack enable || sudo corepack enable
corepack install

# JS workspace: apps/*, packages/*, modules/* (one pnpm store).
pnpm install

# Python workspace: one lockfile + one .venv for hack-platform and every
# modules/*/loader (PLAN §6).
uv sync

echo "on-create: workspace dependencies installed."
