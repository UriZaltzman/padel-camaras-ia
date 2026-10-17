"""Schema, loader and totals for the club kit bill of materials (``infra/hardware/bom.yaml``).

The internal console's quote tool reuses this package: ``load_bom()`` returns a validated
``BillOfMaterials`` and ``BillOfMaterials.quote(courts)`` gives the totals for a club.
"""

from hardware_bom.schema import (
    DEFAULT_BOM_PATH,
    BillOfMaterials,
    BomItem,
    PriceStatus,
    Quote,
    load_bom,
    parse_bom,
)

__all__ = [
    "DEFAULT_BOM_PATH",
    "BillOfMaterials",
    "BomItem",
    "PriceStatus",
    "Quote",
    "load_bom",
    "parse_bom",
]
