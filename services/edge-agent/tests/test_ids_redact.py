import pytest

from edge_agent.ids import uuid7
from edge_agent.redact import redact_credentials


def test_uuid7_has_version_variant_and_timestamp() -> None:
    value = uuid7(unix_ms=1_760_000_000_000)

    assert value.version == 7
    assert value.variant == "specified in RFC 4122"
    assert value.int >> 80 == 1_760_000_000_000


def test_uuid7_sorts_by_time_and_is_unique() -> None:
    older, newer = uuid7(unix_ms=1_000), uuid7(unix_ms=2_000)

    assert str(older) < str(newer)
    assert len({uuid7(unix_ms=1_000) for _ in range(100)}) == 100


@pytest.mark.parametrize(
    ("text", "secret"),
    [
        ("rtsp://admin:hunter2@10.0.0.11:554/stream1: Connection refused", "hunter2"),
        ("Opening rtsps://viewer:p@ss@cam.local/live", "p@ss"),
        ("rtsp://admin@10.0.0.11/x failed", "admin"),
        ("rtsp://10.0.0.11/stream?user=admin&password=s3cret", "s3cret"),
    ],
)
def test_redacts_credentials(text: str, secret: str) -> None:
    redacted = redact_credentials(text)

    assert secret not in redacted
    assert "***" in redacted


def test_keeps_text_without_credentials() -> None:
    text = "rtsp://10.0.0.11:554/stream1: Connection timed out"

    assert redact_credentials(text) == text
    assert redact_credentials("rtsp://***@10.0.0.11/x") == "rtsp://***@10.0.0.11/x"
