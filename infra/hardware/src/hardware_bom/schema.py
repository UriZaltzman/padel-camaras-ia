"""Pydantic schema for ``infra/hardware/bom.yaml`` and the quote totals derived from it.

Money rules (CLAUDE.md): ARS amounts leave this module as integer cents. USD estimates are
whole dollars, as in ``docs/estructura.md``; ``usd_estimated_total`` is the line total
(``qty`` already included), not the unit price.
"""

from __future__ import annotations

from decimal import ROUND_HALF_UP, Decimal
from enum import StrEnum
from pathlib import Path
from typing import Annotated

import yaml
from pydantic import BaseModel, ConfigDict, Field, StrictInt, field_validator

DEFAULT_BOM_PATH = Path(__file__).resolve().parents[2] / "bom.yaml"
"""``infra/hardware/bom.yaml``, resolved from the workspace (editable) install."""

_CENTS_PER_UNIT = 100


class PriceStatus(StrEnum):
    """Where a price comes from. Every item must declare one."""

    TODO_COTIZAR = "TODO_COTIZAR"
    """Estimate from docs/estructura.md; no supplier quote yet."""
    QUOTED = "QUOTED"
    """Real quote with supplier, date and validity."""


def _reject_non_numeric(value: object) -> object:
    # Decimal fields would otherwise accept strings like "1535" or booleans.
    # ValueError (not TypeError): pydantic only turns ValueError into a ValidationError.
    if isinstance(value, bool) or not isinstance(value, int | float | Decimal):
        msg = "must be a number"
        raise ValueError(msg)
    return value


class BomItem(BaseModel):
    """One line of the bill of materials."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    item: Annotated[str, Field(min_length=1)]
    qty: Annotated[StrictInt, Field(gt=0)]
    usd_estimated_total: Annotated[StrictInt, Field(ge=0)]
    status: PriceStatus

    @property
    def usd_unit(self) -> Decimal:
        return Decimal(self.usd_estimated_total) / self.qty


class Quote(BaseModel):
    """Totals for a club with ``courts`` courts. What the console's quote tool shows."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    courts: int
    usd_per_court: int
    usd_per_club: int
    usd_total: int
    ars_total_cents: int
    ars_purchase_plan_cents: int
    """Purchase plan price: cost plus ``markup_purchase_plan``."""
    is_estimate: bool
    """True while any item is still ``TODO_COTIZAR``."""


class BillOfMaterials(BaseModel):
    """The whole ``bom.yaml``."""

    model_config = ConfigDict(extra="forbid", frozen=True)

    fx_ars_per_usd: Annotated[Decimal, Field(gt=0)]
    markup_purchase_plan: Annotated[Decimal, Field(ge=0)]
    per_court: Annotated[tuple[BomItem, ...], Field(min_length=1)]
    per_club: Annotated[tuple[BomItem, ...], Field(min_length=1)]

    _numeric = field_validator("fx_ars_per_usd", "markup_purchase_plan", mode="before")(
        _reject_non_numeric
    )

    @property
    def items(self) -> tuple[BomItem, ...]:
        return self.per_court + self.per_club

    @property
    def usd_per_court(self) -> int:
        return sum(i.usd_estimated_total for i in self.per_court)

    @property
    def usd_per_club(self) -> int:
        return sum(i.usd_estimated_total for i in self.per_club)

    def usd_total(self, courts: int) -> int:
        if courts < 1:
            msg = "courts must be at least 1"
            raise ValueError(msg)
        return courts * self.usd_per_court + self.usd_per_club

    def usd_to_ars_cents(self, usd: Decimal | int) -> int:
        cents = Decimal(usd) * self.fx_ars_per_usd * _CENTS_PER_UNIT
        return int(cents.quantize(Decimal(1), rounding=ROUND_HALF_UP))

    def quote(self, courts: int) -> Quote:
        usd_total = self.usd_total(courts)
        ars_total_cents = self.usd_to_ars_cents(usd_total)
        plan = Decimal(ars_total_cents) * (1 + self.markup_purchase_plan)
        return Quote(
            courts=courts,
            usd_per_court=self.usd_per_court,
            usd_per_club=self.usd_per_club,
            usd_total=usd_total,
            ars_total_cents=ars_total_cents,
            ars_purchase_plan_cents=int(plan.quantize(Decimal(1), rounding=ROUND_HALF_UP)),
            is_estimate=any(i.status is PriceStatus.TODO_COTIZAR for i in self.items),
        )


def parse_bom(text: str) -> BillOfMaterials:
    """Validate a ``bom.yaml`` document. Raises ``pydantic.ValidationError`` if it is malformed."""
    return BillOfMaterials.model_validate(yaml.safe_load(text))


def load_bom(path: Path = DEFAULT_BOM_PATH) -> BillOfMaterials:
    """Read and validate ``bom.yaml`` (the repo's copy by default)."""
    return parse_bom(path.read_text(encoding="utf-8"))
