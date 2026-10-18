"""Mask credentials inside free text before it reaches a log.

Camera URLs look like ``rtsp://user:password@10.0.0.11/stream`` (or carry the password
in the query string). Our own logs never include URLs, but FFmpeg prints them in its
error messages, so every line coming from FFmpeg goes through ``redact_credentials``.
"""

import re
from typing import Final

MASK: Final = "***"

# Greedy up to the last "@" before the path, so an unencoded "@" in the password is
# masked too.
_USERINFO_RE: Final = re.compile(r"(?i)\b([a-z][a-z0-9+.-]*://)[^\s/]*@")
_QUERY_SECRET_RE: Final = re.compile(
    r"(?i)([?&](?:user|username|usr|password|passwd|pass|pwd|token|auth)=)[^&\s]*"
)


def redact_credentials(text: str) -> str:
    """``text`` with the user/password part of every URL replaced by ``***``."""
    masked = _USERINFO_RE.sub(rf"\g<1>{MASK}@", text)
    return _QUERY_SECRET_RE.sub(rf"\g<1>{MASK}", masked)
