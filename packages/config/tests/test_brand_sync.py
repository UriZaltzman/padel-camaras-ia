"""brand.py must mirror brand.ts, so renaming the brand is a one-file change per language."""

import re
from pathlib import Path

from brand import BRAND

BRAND_TS = Path(__file__).resolve().parent.parent / "brand.ts"

TS_TO_PY = {
    "name": "name",
    "slug": "slug",
    "domain": "domain",
    "tagline": "tagline",
    "bundleId": "bundle_id",
}


def _ts_values() -> dict[str, str]:
    source = BRAND_TS.read_text(encoding="utf-8")
    return dict(re.findall(r"^\s*(\w+):\s*'([^']*)'", source, flags=re.MULTILINE))


def test_brand_py_matches_brand_ts() -> None:
    ts_values = _ts_values()
    assert set(ts_values) == set(TS_TO_PY)
    for ts_key, py_attr in TS_TO_PY.items():
        assert getattr(BRAND, py_attr) == ts_values[ts_key], ts_key
