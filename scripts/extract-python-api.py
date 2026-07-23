"""Emit the public wcc_impact API as deterministic JSON for contract docs."""

from __future__ import annotations

import inspect
import json

import wcc_impact


def summary(value: object) -> str:
    doc = inspect.getdoc(value) or ""
    return doc.split("\n\n", 1)[0].replace("\n", " ")


functions = []
classes = []
constants = []

for name in sorted(wcc_impact.__all__):
    value = getattr(wcc_impact, name)
    if inspect.isfunction(value):
        functions.append(
            {
                "name": name,
                "signature": f"{name}{inspect.signature(value)}",
                "summary": summary(value),
            }
        )
    elif inspect.isclass(value):
        classes.append(
            {
                "name": name,
                "summary": summary(value),
            }
        )
    else:
        if isinstance(value, (str, int, float, bool, list, tuple)):
            rendered = repr(value)
        else:
            rendered = type(value).__name__
        constants.append({"name": name, "value": rendered})

print(
    json.dumps(
        {
            "functions": functions,
            "classes": classes,
            "constants": constants,
        },
        ensure_ascii=False,
        sort_keys=True,
    )
)
