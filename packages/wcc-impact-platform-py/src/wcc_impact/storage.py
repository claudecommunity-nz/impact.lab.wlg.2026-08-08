"""upload_file — put media in the shared bucket, get a public URL back.

Objects live in the shared public-read `media` bucket under your module's
prefix: media/<module_id>/<filename>. RLS enforces the prefix (first path
segment must be a registered, ENABLED module_id) + the event token; 10 MB per
file. The bucket is public-read — no real faces, names, or addresses in test
uploads (kickoff privacy rule).
"""

from __future__ import annotations

import mimetypes
import re
import time
from pathlib import Path

from ._env import get_client, token_hint
from .errors import HackPlatformError

_BUCKET = "media"
_MAX_BYTES = 10 * 1024 * 1024  # 10 MB per file (bucket policy)


def upload_file(
    path: str | Path,
    module_id: str,
    *,
    content_type: str | None = None,
) -> str:
    """Upload to media/<module_id>/<filename> and return the public URL.

    Put the returned URL into publish_signal(media_urls=[...]) so photos show
    on the feed card. Each upload gets a unique timestamped key, so every call
    creates a new object — uploads never overwrite (storage RLS has no update
    policy, so a repeat filename would otherwise be rejected).

    Example:
        url = upload_file("shot.jpg", "team-intake")
        publish_signal(module_id="team-intake", title="Flooded underpass",
                       signal_type="flooding", source_type="community",
                       media_urls=[url])
    """
    file_path = Path(path)
    if not file_path.is_file():
        raise HackPlatformError(f"File not found: {file_path}")

    data = file_path.read_bytes()
    if len(data) > _MAX_BYTES:
        raise HackPlatformError(
            f"{file_path.name} is {len(data) / 1e6:.1f} MB — the media bucket "
            f"caps files at 10 MB. Resize/compress before uploading."
        )

    if content_type is None:
        content_type = (
            mimetypes.guess_type(file_path.name)[0] or "application/octet-stream"
        )

    # Key inside the `media` bucket; first segment MUST be the module_id (RLS).
    # Mirror the TS SDK: a millisecond timestamp prefix makes every key unique
    # (storage RLS has no update policy, so overwrites are impossible), and the
    # newest-first gallery order stays stable.
    safe_name = re.sub(r"[^a-z0-9._-]+", "-", file_path.name.lower())
    key = f"{module_id}/{int(time.time() * 1000)}-{safe_name}"
    storage = get_client().storage.from_(_BUCKET)
    try:
        storage.upload(key, data, {"content-type": content_type})
    except Exception as e:
        raise HackPlatformError(
            f"Upload to media/{key} rejected: {e}. {token_hint()}"
        ) from e

    url = storage.get_public_url(key)
    # supabase-py appends a trailing '?', strip it for clean media_urls entries.
    return url.rstrip("?")
