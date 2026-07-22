#!/usr/bin/env python3
"""Loader contract smoke test (CI gate — PLAN §9; docs/CONTRACTS.md §7).

Imports ``modules/<module_id>/loader/src/main.py``, calls its required
``sample()`` (one representative signal payload, never inserted) and validates
the result against ``schema/signal.schema.json`` — THE signal contract.
Also asserts the payload's ``module_id`` equals the folder name, because that
id is the RLS attribution key and the storage prefix.

Usage (CI runs it inside the synced uv workspace so wcc_impact imports work):

    uv run --with jsonschema python .github/scripts/validate_sample.py team-outage-watch
"""

from __future__ import annotations

import importlib
import json
import sys
from pathlib import Path

REPO_ROOT = Path(__file__).resolve().parents[2]


def fail(msg: str):
    print(f"::error::{msg}")
    raise SystemExit(1)


def main() -> None:
    if len(sys.argv) != 2:
        fail("usage: validate_sample.py <module_id>")
    module_id = sys.argv[1]
    loader_dir = REPO_ROOT / "modules" / module_id / "loader"
    main_py = loader_dir / "src" / "main.py"
    if not main_py.exists():
        fail(f"{main_py} not found — every loader must have src/main.py (CONTRACTS.md §7)")

    import jsonschema  # provided via `uv run --with jsonschema`

    # Import src.main exactly the way `python -m src.main` resolves it, minus
    # __main__ semantics — so main()'s side effects never run here.
    sys.path.insert(0, str(loader_dir))
    try:
        loader = importlib.import_module("src.main")
    except Exception as exc:  # noqa: BLE001 — surface any import-time crash as a CI error
        fail(f"importing modules/{module_id}/loader/src/main.py failed: {exc!r}")

    if not hasattr(loader, "sample"):
        fail(
            f"modules/{module_id}/loader/src/main.py has no sample() — "
            "it must return one representative signal payload without inserting it (CONTRACTS.md §7)"
        )

    try:
        payload = loader.sample()
    except Exception as exc:  # noqa: BLE001
        fail(f"{module_id}: sample() raised {exc!r}")

    if not isinstance(payload, dict):
        fail(f"{module_id}: sample() must return a dict, got {type(payload).__name__}")

    try:
        json.dumps(payload)
    except (TypeError, ValueError) as exc:
        fail(
            f"{module_id}: sample() output is not JSON-serialisable ({exc}) — "
            "use ISO strings for timestamps, plain lists/dicts for everything else"
        )

    schema = json.loads((REPO_ROOT / "schema" / "signal.schema.json").read_text())
    validator = jsonschema.Draft202012Validator(schema)
    errors = sorted(validator.iter_errors(payload), key=lambda e: list(e.absolute_path))
    if errors:
        for err in errors:
            where = "/".join(str(p) for p in err.absolute_path) or "(root)"
            print(f"::error::{module_id}: sample() invalid at {where}: {err.message}")
        raise SystemExit(1)

    if payload.get("module_id") != module_id:
        fail(
            f"{module_id}: sample() has module_id={payload.get('module_id')!r} — "
            "it must equal the folder name (it is the RLS attribution key and storage prefix)"
        )

    print(f"OK: modules/{module_id} sample() validates against signal.schema.json")


if __name__ == "__main__":
    main()
