// Single source of truth for the brand. Never write the brand name anywhere else:
// import `brand` here, and use `{brand}` in es-AR translation files.
// Python mirror: brand.py (kept in sync by tests/test_brand_sync.py).
export const brand = {
  name: 'rebote', // BRAND_NAME (provisorio)
  slug: 'rebote', // BRAND_SLUG
  domain: 'rebote.com.ar', // BRAND_DOMAIN
  tagline: 'Tu partido, visto entero.',
  bundleId: 'ar.rebote.app', // cambia junto con el nombre, antes de publicar en tiendas
} as const;

export type Brand = typeof brand;
