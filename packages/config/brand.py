"""Single source of truth for the brand, mirror of brand.ts.

Never write the brand name anywhere else: import ``BRAND`` from here.
"""

from dataclasses import dataclass
from typing import Final


@dataclass(frozen=True, slots=True)
class Brand:
    name: str
    slug: str
    domain: str
    tagline: str
    bundle_id: str


BRAND: Final = Brand(
    name="rebote",  # BRAND_NAME (provisorio)
    slug="rebote",  # BRAND_SLUG
    domain="rebote.com.ar",  # BRAND_DOMAIN
    tagline="Tu partido, visto entero.",
    bundle_id="ar.rebote.app",  # cambia junto con el nombre, antes de publicar en tiendas
)
