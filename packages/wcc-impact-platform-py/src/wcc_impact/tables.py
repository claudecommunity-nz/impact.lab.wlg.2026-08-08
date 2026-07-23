"""Module-owned Postgres tables — the loader side of per-module backends.

A module can own tables beyond the shared ``signals`` table. They live in
``public`` under a per-module prefix (``m_<id>_<name>``) and are created by an
organiser from ``modules/<team>/backend/schema.sql`` (DDL is not self-serve from
a loader's anon key). Once created, a loader reads/writes them with its module
credential, exactly like signals. RLS rejects a credential whose owner differs
from the table.

    from wcc_impact import module_table

    # write a row (module credential attached automatically):
    module_table("team-x", "pins").insert({"label": "Cordon: Cuba St"}).execute()

    # read this module's rows back:
    rows = module_table("team-x", "pins").select("*").execute().data

The prefix rule MUST match wcc.module_prefix() in SQL and moduleTableName() in
the TypeScript SDK, so all three agree on the physical table name.
"""

from __future__ import annotations

import re

from ._env import get_client

_NON_ALNUM = re.compile(r"[^a-z0-9]+")


def module_table_prefix(module_id: str) -> str:
    """``module_id`` -> owned-table prefix, e.g. ``"team-x"`` -> ``"m_team_x_"``."""
    return "m_" + _NON_ALNUM.sub("_", module_id.lower()) + "_"


def module_table_name(module_id: str, table: str) -> str:
    """Full Postgres table name, e.g. ``("demo-seed", "pins")`` -> ``"m_demo_seed_pins"``."""
    return module_table_prefix(module_id) + _NON_ALNUM.sub("_", table.lower())


def module_table(module_id: str, table: str):
    """The Supabase query builder for a module-owned table (reads + writes).

    Uses the module-scoped client, so writes succeed only when MODULE_TOKEN owns
    ``module_id`` and that module remains enabled. The table must already exist
    (created via the module's backend/schema.sql).

    Example:
        module_table("team-x", "cases").insert({"summary": "power out, Newtown"}).execute()
    """
    return get_client(module_id).table(module_table_name(module_id, table))
