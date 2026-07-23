"""Credential-header tests for the loader's Supabase client."""

from __future__ import annotations

import sys
from types import ModuleType

from wcc_impact import _env


def _install_fake_supabase(monkeypatch):
    calls: list[dict] = []
    fake = ModuleType("supabase")

    class ClientOptions:
        def __init__(self, *, headers):
            self.headers = headers

    def create_client(url, key, *, options=None):
        client = object()
        calls.append({"url": url, "key": key, "options": options, "client": client})
        return client

    fake.ClientOptions = ClientOptions
    fake.create_client = create_client
    monkeypatch.setitem(sys.modules, "supabase", fake)
    _env._clients.clear()
    return calls


def test_module_token_is_the_only_loader_write_header(monkeypatch):
    calls = _install_fake_supabase(monkeypatch)
    values = {
        "SUPABASE_URL": "https://example.supabase.co",
        "SUPABASE_PUBLISHABLE_KEY": "public-key",
        "MODULE_TOKEN": "team-specific-secret",
        "EVENT_TOKEN": "ignored-legacy-secret",
    }
    monkeypatch.setattr(_env, "get_env", values.get)

    _env.get_client("team-one")

    assert calls[0]["options"].headers == {
        "x-module-token": "team-specific-secret",
    }


def test_legacy_client_declares_each_target_module(monkeypatch):
    calls = _install_fake_supabase(monkeypatch)
    values = {
        "SUPABASE_URL": "https://example.supabase.co",
        "SUPABASE_PUBLISHABLE_KEY": "public-key",
        "EVENT_TOKEN": "migration-only-secret",
    }
    monkeypatch.setattr(_env, "get_env", values.get)

    first = _env.get_client("team-one")
    second = _env.get_client("team-two")

    assert first is not second
    assert calls[0]["options"].headers == {
        "x-event-token": "migration-only-secret",
        "x-module-id": "team-one",
    }
    assert calls[1]["options"].headers == {
        "x-event-token": "migration-only-secret",
        "x-module-id": "team-two",
    }


def test_read_only_client_has_no_custom_headers_even_when_tokens_exist(monkeypatch):
    calls = _install_fake_supabase(monkeypatch)
    values = {
        "SUPABASE_URL": "https://example.supabase.co",
        "SUPABASE_PUBLISHABLE_KEY": "public-key",
        "MODULE_TOKEN": "team-specific-secret",
        "EVENT_TOKEN": "migration-only-secret",
    }
    monkeypatch.setattr(_env, "get_env", values.get)

    _env.get_client()

    assert calls[0]["options"] is None
