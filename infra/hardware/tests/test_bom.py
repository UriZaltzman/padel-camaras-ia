"""Checks on infra/hardware/bom.yaml: format, statuses and the control total.

Control total from docs/estructura.md ("Hardware y presupuesto del combo"):
4 courts x US$640 + US$1,760 = US$4,320 = ARS 6,631,200 at ARS 1,535/USD.
"""

import copy
from decimal import Decimal
from typing import Any

import pytest
import yaml
from pydantic import ValidationError

from hardware_bom import DEFAULT_BOM_PATH, BillOfMaterials, PriceStatus, load_bom

Raw = dict[str, Any]


@pytest.fixture(scope="module")
def raw() -> Raw:
    data = yaml.safe_load(DEFAULT_BOM_PATH.read_text(encoding="utf-8"))
    assert isinstance(data, dict)
    return data


@pytest.fixture(scope="module")
def bom() -> BillOfMaterials:
    return load_bom()


def test_repo_bom_is_valid(bom: BillOfMaterials) -> None:
    assert bom.fx_ars_per_usd == Decimal(1535)
    assert bom.markup_purchase_plan == Decimal("0.25")
    assert len(bom.per_court) == 4
    assert len(bom.per_club) == 5


def test_every_item_has_a_status(raw: Raw) -> None:
    for section in ("per_court", "per_club"):
        for line in raw[section]:
            assert "status" in line, line["item"]
            assert line["status"] in {s.value for s in PriceStatus}


def test_all_prices_are_still_estimates(bom: BillOfMaterials) -> None:
    # No real quotes yet (docs/pendientes.md); update this when the first one lands.
    assert all(i.status is PriceStatus.TODO_COTIZAR for i in bom.items)


def test_subtotals(bom: BillOfMaterials) -> None:
    assert bom.usd_per_court == 640
    assert bom.usd_per_club == 1760


def test_control_total_four_courts(bom: BillOfMaterials) -> None:
    quote = bom.quote(4)
    assert quote.usd_total == 4320
    assert quote.ars_total_cents == 6_631_200_00
    assert quote.ars_purchase_plan_cents == 8_289_000_00
    assert quote.is_estimate


def test_quote_rejects_zero_courts(bom: BillOfMaterials) -> None:
    with pytest.raises(ValueError, match="courts"):
        bom.quote(0)


def test_unit_price(bom: BillOfMaterials) -> None:
    camera = bom.per_court[0]
    assert camera.qty == 2
    assert camera.usd_unit == Decimal(150)


def _mutated(raw: Raw, section: str, **changes: object) -> Raw:
    data = copy.deepcopy(raw)
    data[section][0].update(changes)
    return data


@pytest.mark.parametrize(
    ("section", "changes"),
    [
        ("per_court", {"qty": "2"}),
        ("per_court", {"qty": 1.5}),
        ("per_court", {"qty": 0}),
        ("per_court", {"usd_estimated_total": "300"}),
        ("per_court", {"usd_estimated_total": -1}),
        ("per_club", {"status": "COTIZADO"}),
        ("per_club", {"item": ""}),
        ("per_club", {"supplier": "unexpected field"}),
    ],
)
def test_rejects_bad_item(raw: Raw, section: str, changes: dict[str, object]) -> None:
    with pytest.raises(ValidationError):
        BillOfMaterials.model_validate(_mutated(raw, section, **changes))


@pytest.mark.parametrize("field", ["qty", "usd_estimated_total", "status", "item"])
def test_rejects_missing_item_field(raw: Raw, field: str) -> None:
    data = copy.deepcopy(raw)
    del data["per_court"][0][field]
    with pytest.raises(ValidationError):
        BillOfMaterials.model_validate(data)


@pytest.mark.parametrize(
    ("field", "value"),
    [
        ("fx_ars_per_usd", "1535"),
        ("fx_ars_per_usd", 0),
        ("fx_ars_per_usd", True),
        ("markup_purchase_plan", -0.1),
        ("per_court", []),
        ("per_club", None),
    ],
)
def test_rejects_bad_top_level(raw: Raw, field: str, value: object) -> None:
    data = copy.deepcopy(raw)
    data[field] = value
    with pytest.raises(ValidationError):
        BillOfMaterials.model_validate(data)


def test_control_total_breaks_when_a_price_changes(raw: Raw) -> None:
    # Editing a price without updating the control total must be noticed.
    bom = BillOfMaterials.model_validate(_mutated(raw, "per_court", usd_estimated_total=301))
    assert bom.quote(4).usd_total != 4320


def test_json_schema_is_exportable() -> None:
    # The console's quote tool can consume this instead of re-declaring the shape.
    schema = BillOfMaterials.model_json_schema()
    assert set(schema["required"]) == {
        "fx_ars_per_usd",
        "markup_purchase_plan",
        "per_court",
        "per_club",
    }
