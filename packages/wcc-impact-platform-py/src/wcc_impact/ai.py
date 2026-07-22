"""ask_claude + analyze_image — Claude covers text AND vision (no second vendor).

Uses your team's spend-capped ANTHROPIC_API_KEY from the repo-root .env
(check-in card). A simple in-process rate limit (~10 requests/min) stops one
hot loop from draining the team budget. Loader-side only — never call Claude
from UI code.
"""

from __future__ import annotations

import base64
import mimetypes
import threading
import time
from collections import deque
from pathlib import Path

from ._env import get_env
from .errors import HackPlatformError

# Default model: Haiku 4.5 — fast + cheap, right for classification/dedupe/
# triage on a per-team spend-capped key. Pass model=... to override.
DEFAULT_MODEL = "claude-haiku-4-5-20251001"

# --- in-process rate limit: max 10 calls per rolling 60 s window -------------
_MAX_CALLS = 10
_WINDOW_S = 60.0
_call_times: deque[float] = deque()
_rl_lock = threading.Lock()

_anthropic_client = None


def _throttle() -> None:
    """Block until a call slot is free (10/min), printing why when we wait."""
    while True:
        with _rl_lock:
            now = time.monotonic()
            while _call_times and now - _call_times[0] > _WINDOW_S:
                _call_times.popleft()
            if len(_call_times) < _MAX_CALLS:
                _call_times.append(now)
                return
            wait = _WINDOW_S - (now - _call_times[0]) + 0.1
        print(
            f"[wcc_impact] AI rate limit ({_MAX_CALLS}/min) — waiting {wait:.0f}s"
        )
        time.sleep(wait)


def _get_anthropic():
    global _anthropic_client
    if _anthropic_client is None:
        api_key = get_env("ANTHROPIC_API_KEY")
        if not api_key:
            raise HackPlatformError(
                "ANTHROPIC_API_KEY is not set. Copy your team's key from the "
                "check-in card into the repo-root .env (ANTHROPIC_API_KEY=...) "
                "— it is never committed."
            )
        import anthropic

        _anthropic_client = anthropic.Anthropic(api_key=api_key)
    return _anthropic_client


def ask_claude(
    prompt: str,
    *,
    system: str | None = None,
    model: str = DEFAULT_MODEL,
    max_tokens: int = 1024,
) -> str:
    """One-shot text call to Claude. Returns the response text.

    Example:
        label = ask_claude(f"Classify into flooding/outage/road-closure/other, "
                           f"reply with the label only: {headline}")
    """
    _throttle()
    client = _get_anthropic()
    kwargs: dict = {
        "model": model,
        "max_tokens": max_tokens,
        "messages": [{"role": "user", "content": prompt}],
    }
    if system is not None:
        kwargs["system"] = system
    try:
        response = client.messages.create(**kwargs)
    except Exception as e:
        raise HackPlatformError(f"Claude call failed: {e}") from e
    return _text_of(response)


def analyze_image(
    image: str | bytes | Path,
    prompt: str,
    *,
    model: str = DEFAULT_MODEL,
    max_tokens: int = 1024,
) -> str:
    """Vision call to Claude. `image` is an https URL, a local path, or raw bytes.

    Example:
        desc = analyze_image(photo_url, "Describe any storm damage visible. "
                                        "Reply 'none' if there is none.")
    """
    _throttle()
    client = _get_anthropic()
    content = [_image_block(image), {"type": "text", "text": prompt}]
    try:
        response = client.messages.create(
            model=model,
            max_tokens=max_tokens,
            messages=[{"role": "user", "content": content}],
        )
    except Exception as e:
        raise HackPlatformError(f"Claude vision call failed: {e}") from e
    return _text_of(response)


def _image_block(image: str | bytes | Path) -> dict:
    """Build the API image content block from a URL, path, or raw bytes."""
    if isinstance(image, str) and image.startswith(("http://", "https://")):
        return {"type": "image", "source": {"type": "url", "url": image}}

    if isinstance(image, bytes):
        data, media_type = image, "image/jpeg"  # bytes: assume jpeg unless magic says png
        if data[:8] == b"\x89PNG\r\n\x1a\n":
            media_type = "image/png"
    else:
        path = Path(image)
        if not path.is_file():
            raise HackPlatformError(f"Image file not found: {path}")
        data = path.read_bytes()
        media_type = mimetypes.guess_type(path.name)[0] or "image/jpeg"

    return {
        "type": "image",
        "source": {
            "type": "base64",
            "media_type": media_type,
            "data": base64.standard_b64encode(data).decode("ascii"),
        },
    }


def _text_of(response) -> str:
    """Join the text blocks of a Messages API response."""
    return "".join(
        block.text for block in response.content if block.type == "text"
    ).strip()
