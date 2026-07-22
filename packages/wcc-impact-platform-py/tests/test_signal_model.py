"""Offline schema-validation tests — the pydantic Signal model must mirror
/schema/signal.schema.json (the source of truth)."""

import json
from pathlib import Path

import pytest
from pydantic import ValidationError

from wcc_impact.signals import Signal

REPO_ROOT = Path(__file__).resolve().parents[3]
SCHEMA_PATH = REPO_ROOT / "schema" / "signal.schema.json"


def _valid_kwargs(**overrides):
    base = dict(
        module_id="team-coast-watch",
        title="Waves over the road at Ōwhiro Bay",
        signal_type="coastal-hazard",
        source_type="community",
        lat=-41.3455,
        lng=174.7597,
        severity="severe",
    )
    base.update(overrides)
    return base


def test_valid_signal_passes():
    signal = Signal(**_valid_kwargs())
    assert signal.verification == "unverified"  # schema default
    assert signal.media_urls == []  # schema default


def test_required_fields_enforced():
    with pytest.raises(ValidationError):
        Signal(title="x", signal_type="y", source_type="official")  # no module_id


def test_title_length_cap():
    with pytest.raises(ValidationError):
        Signal(**_valid_kwargs(title="x" * 201))


def test_enum_fields_rejected_on_bad_value():
    with pytest.raises(ValidationError):
        Signal(**_valid_kwargs(source_type="rumour"))
    with pytest.raises(ValidationError):
        Signal(**_valid_kwargs(severity="apocalyptic"))


def test_lat_lng_bounds():
    with pytest.raises(ValidationError):
        Signal(**_valid_kwargs(lat=-91))
    with pytest.raises(ValidationError):
        Signal(**_valid_kwargs(lng=181))


def test_confidence_bounds():
    with pytest.raises(ValidationError):
        Signal(**_valid_kwargs(confidence=1.5))


def test_extra_fields_forbidden():
    # Mirrors additionalProperties: false in the JSON Schema.
    with pytest.raises(ValidationError):
        Signal(**_valid_kwargs(bogus_field=1))


def test_model_covers_every_schema_field():
    """Drift tripwire: every property in signal.schema.json exists on the model."""
    schema = json.loads(SCHEMA_PATH.read_text())
    schema_fields = set(schema["properties"])
    model_fields = set(Signal.model_fields)
    assert schema_fields == model_fields, (
        f"Signal model out of sync with signal.schema.json — "
        f"missing: {schema_fields - model_fields}, "
        f"extra: {model_fields - schema_fields}"
    )
